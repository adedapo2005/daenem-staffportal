import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync(new URL('../worker/smart-search.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
const sandboxRequire = (id) => {
  if (id === './auth') return { hasPermission(context, permission, level, companyId) {
    const levels=['none','view','create','edit','approve','manage'];
    return levels.indexOf(context.companyPermissions[companyId]?.[permission] || 'none') >= levels.indexOf(level);
  }};
  return createRequire(import.meta.url)(id);
};
new Function('require', 'exports', js)(sandboxRequire, exports);
const search = exports.routeSmartSearch;
const session = (companies = ['printing'], canHr = false) => ({
  employee: { id: 'employee-a' },
  companies: companies.map(id => ({ id })),
  roles: [{ code: 'employee' }],
  companyPermissions: Object.fromEntries(companies.map(id => [id,
    canHr ? { 'hr.access': 'view' } : {}])),
});
const calls = [];
let broken = '';
const env = {
  DB: {
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return { async all() {
            if (broken && sql.includes(broken)) throw Error('No table details for users');
            if (sql.includes('FROM leave_requests')) return { results: [
              { id: 'leave-a', status: 'pending', startDate: '2026-10-02', endDate: '2026-10-04' },
            ] };
            if (sql.includes('FROM employee_document_requests')) return { results: [
              { id: 'doc-a', documentType: 'Certificate', status: 'ready' },
            ] };
            if (sql.includes('FROM payroll_runs')) return { results: [
              { id: 'run-2026-09', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'approved' },
            ] };
            if (sql.includes('FROM employees e')) return { results: [
              { id: 'person-a', displayName: 'Person A', employeeNo: 'EMP-A' },
            ] };
            return { results: [] };
          }};
        },
      };
    },
  },
};
async function request(q, context = session()) {
  calls.length = 0;
  const url = 'https://example.test/api/search/suggest?q=' + encodeURIComponent(q);
  const response = await search(new Request(url), env, context);
  return { status: response.status, body: await response.json() };
}
test('employee sees own company-scoped requests, not other people', async () => {
  const { body } = await request('leave');
  assert.ok(body.suggestions.some(s => s.type === 'leave-request'));
  assert.ok(body.suggestions.some(s => s.type === 'document-request'));
  assert.equal(body.suggestions.some(s => s.type === 'employee'), false);
  assert.equal(body.partial, false);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.args.includes('employee-a') && c.args.includes('printing')));
});
test('cross-company and revoked permissions never pass SQL bindings', async () => {
  await request('person', session(['bakery']));
  assert.equal(calls.some(c => c.args.includes('printing')), false);
  assert.equal(calls.some(c => c.sql.includes('FROM employees e')), false);
});
test('HR permission permits scoped people lookup', async () => {
  const { body } = await request('Person', session(['printing'], true));
  assert.ok(body.suggestions.some(s => s.type === 'employee'));
  assert.ok(calls.filter(c => c.sql.includes('FROM employees e')).every(c => c.args.includes('printing')));
});
test('partial source failures remain explicit and do not leak SQL details', async () => {
  broken = 'FROM leave_requests';
  try {
    const { body } = await request('leave');
    assert.equal(body.partial, true);
    assert.deepEqual(body.sources.find(s => s.name === 'My leave requests'), {
      name: 'My leave requests', status: 'unavailable',
    });
    assert.equal(JSON.stringify(body).includes('No table details'), false);
    assert.ok(body.suggestions.some(s => s.type === 'document-request'));
  } finally { broken = ''; }
});
test('length validation and wildcard-only queries are bounded', async () => {
  assert.equal((await request('a'.repeat(81))).status, 400);
  assert.equal((await request('___%%')).body.suggestions.length, 0);
  assert.equal(calls.length, 0);
});

test('Payroll search uses actual migrated fields and the permitted company', async () => {
  const ctx = session(['printing']);
  ctx.companyPermissions.printing['payroll.access'] = 'view';
  const { body } = await request('2026-09', ctx);
  const query = calls.find(c => c.sql.includes('FROM payroll_runs'));
  assert.ok(query, 'Payroll SQL should run for a payroll-authorized employee');
  assert.equal(query.sql.includes('run_no'), false, 'run_no does not exist in D1 payroll_runs');
  assert.match(query.sql, /period_start LIKE \?/);
  assert.match(query.sql, /period_end LIKE \?/);
  assert.match(query.sql, /company_id IN \(\?\)/);
  assert.deepEqual(query.args, ['printing', '%2026-09%', '%2026-09%', '%2026-09%', '%2026-09%']);
  assert.deepEqual(body.sources.find(s => s.name === 'Payroll'), { name: 'Payroll', status: 'checked' });
  assert.ok(body.suggestions.some(s => s.type === 'payroll' && s.label.includes('2026-09')));
  assert.equal(body.partial, false);
});

test('Payroll source and its records remain absent without company payroll permission', async () => {
  const { body } = await request('2026-09', session(['printing']));
  assert.equal(calls.some(c => c.sql.includes('FROM payroll_runs')), false);
  assert.equal(body.suggestions.some(s => s.type === 'payroll'), false);
  assert.equal(body.sources.some(s => s.name === 'Payroll'), false);
});

test('Owner role never bypasses a denied company-level grant', async () => {
  const ctx=session(['printing','bakery']);
  ctx.roles=[{id:'owner-printing',code:'owner',companyId:'printing'}];
  ctx.companyPermissions.printing['payroll.access']='view';
  ctx.companyPermissions.bakery['payroll.access']='none';
  const {body}=await request('payroll',ctx);
  const payrollQueries=calls.filter(call=>call.sql.includes('FROM payroll_runs'));
  assert.equal(payrollQueries.length,1);
  assert.equal(payrollQueries[0].args[0],'printing');
  assert.equal(payrollQueries[0].args.includes('bakery'),false);
  assert.deepEqual(body.sources.find(s=>s.name==='Payroll'),{name:'Payroll',status:'checked'});
  assert.ok(body.suggestions.some(item=>item.type==='module'&&item.command==='payroll'));
});

test('Owner role with explicit revoked payroll permission sees no payroll source or module', async () => {
  const ctx=session(['printing']);
  ctx.roles=[{id:'owner-printing',code:'owner',companyId:'printing'}];
  ctx.companyPermissions.printing['payroll.access']='none';
  const {body}=await request('payroll',ctx);
  assert.equal(calls.some(call=>call.sql.includes('FROM payroll_runs')),false);
  assert.equal(body.sources.some(s=>s.name==='Payroll'),false);
  assert.equal(body.suggestions.some(item=>item.command==='payroll'||item.command==='payroll-payments'),false);
});

test('Owner role in a different business cannot expose protected modules without grants', async () => {
  const ctx=session(['printing','bakery']);
  ctx.roles=[{id:'owner-printing',code:'owner',companyId:'printing'}];
  for(const q of ['payroll','construction','finance','HR & People','security']) {
    const {body}=await request(q,ctx);
    assert.equal(body.suggestions.some(item=>item.type==='module'&&
      ['payroll','payroll-payments','construction','finance','hr','security'].includes(item.command)),false,
      'Unexpected module disclosure for '+q);
  }
  assert.equal(calls.some(call=>call.sql.includes('FROM payroll_runs')),false);
});

test('Owner with company-specific manage grant retains authorized payroll search', async () => {
  const ctx=session(['printing','bakery']);
  ctx.roles=[{id:'owner-printing',code:'owner',companyId:'printing'}];
  ctx.companyPermissions.printing['payroll.access']='manage';
  ctx.companyPermissions.bakery['payroll.access']='none';
  const {body}=await request('2026-09',ctx);
  const queries=calls.filter(call=>call.sql.includes('FROM payroll_runs'));
  assert.equal(queries.length,1);
  assert.deepEqual(queries[0].args.slice(0,1),['printing']);
  assert.equal(queries[0].args.includes('bakery'),false);
  assert.ok(body.suggestions.some(item=>item.type==='payroll'));
  assert.equal(body.partial,false);
});
