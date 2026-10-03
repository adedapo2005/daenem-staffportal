import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/payroll.ts', import.meta.url), 'utf8');
const authImport = "import { hasPermission, type AuthEnv, type SessionContext } from './auth';";
assert.ok(source.includes(authImport), 'payroll route must retain its canonical permission dependency');
const testAuth = `const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const granted=companyId?context.companyPermissions?.[companyId]?.[code]||'none':context.permissions?.[code]||'none';return levels.indexOf(granted)>=levels.indexOf(minimum)};`;
const javascript = ts.transpile(source.replace(authImport, testAuth), { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
const { routePayroll } = await import(moduleUrl);

function fixture({ status = 'processing', owner = false, company = 'company-b' } = {}) {
  const writes = [];
  const env = { DB: {
    prepare(sql) {
      return { sql, bindings: [], bind(...values) { this.bindings = values; return this; },
        async first() {
          if (sql.includes('FROM payroll_runs')) return { id: 'run-b', companyId: company, status };
          return null;
        },
        async run() { writes.push({ sql, bindings: this.bindings }); return { meta: { changes: 1 } }; },
      };
    },
    async batch(statements) { writes.push(...statements.map(statement => ({ sql: statement.sql, bindings: statement.bindings }))); return statements.map(() => ({ meta: { changes: 1 } })); },
  } };
  const context = {
    employee: { id: owner ? 'owner-1' : 'employee-a' },
    roles: owner ? [{ code: 'owner' }] : [{ code: 'payroll-approver' }],
    companies: owner ? [] : [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions: owner ? {} : { 'company-b': { 'payroll.access': 'approve' } },
    permissions: {},
  };
  return { env, context, writes };
}

function request(toStatus) {
  return new Request('https://staffportal.test/api/payroll/runs/status', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'settlement-truth-test' },
    body: JSON.stringify({ runId: 'run-b', toStatus }),
  });
}

const unauthorized = fixture({ status: 'processing', company: 'company-b' });
unauthorized.context.companies = [{ id: 'company-a' }];
unauthorized.context.companyPermissions['company-b']['payroll.access'] = 'none';
const unauthorizedResponse = await routePayroll(request('paid'), unauthorized.env, unauthorized.context);
assert.equal(unauthorizedResponse.status, 404, 'cross-company/no-authority settlement attempt keeps neutral denial');
assert.equal(unauthorized.writes.length, 0, 'unauthorized settlement attempt performs zero writes');

const authorized = fixture();
const authorizedResponse = await routePayroll(request('paid'), authorized.env, authorized.context);
assert.equal(authorizedResponse.status, 409, 'authorized approver cannot mark processing payroll paid without authoritative reconciliation');
assert.match((await authorizedResponse.json()).error, /authoritative payment acknowledgement and reconciliation evidence/i);
assert.equal(authorized.writes.length, 0, 'missing settlement evidence leaves payroll state, approval events, and audit untouched');

const owner = fixture({ status: 'processing', owner: true });
const ownerResponse = await routePayroll(request('paid'), owner.env, owner.context);
assert.equal(ownerResponse.status, 409, 'Owner internal authority cannot impersonate payment or reconciliation truth');
assert.equal(owner.writes.length, 0, 'Owner cannot write paid status without authoritative evidence');

const processing = fixture({ status: 'approved' });
const processingResponse = await routePayroll(request('processing'), processing.env, processing.context);
assert.equal(processingResponse.status, 200, 'authorized same-company approval may advance a run to processing');
assert.equal(processing.writes.length, 3, 'processing transition records run state, approval event, and audit');
assert.ok(processing.writes[0].sql.includes('UPDATE payroll_runs SET status=?'));
assert.ok(processing.writes[1].sql.includes('INSERT INTO payroll_approval_events'));
assert.ok(processing.writes[2].sql.includes('INSERT INTO audit_logs'));

console.log('PASS 13 payroll settlement truth assertions');
