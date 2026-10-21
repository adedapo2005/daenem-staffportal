import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync(new URL('../worker/smart-search.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const module = {};
new Function('require', 'exports', js)((name) => name === './auth'
  ? { hasPermission: (ctx, permission, _action, companyId) =>
      ctx.companyPermissions[companyId]?.[permission] === 'view' }
  : createRequire(import.meta.url)(name), module);

function session() {
  return {
    employee: { id: 'employee-qa' },
    companies: [{ id: 'printing' }],
    roles: [{ id: 'role-qa', code: 'employee', companyId: 'printing' }],
    companyPermissions: { printing: {
      'hr.access': 'view', 'payroll.access': 'view',
      'construction.access': 'view', 'forms.access': 'view',
    } },
  };
}
const results = (count, create) => Array.from({ length: count }, (_, i) => create(i));
const recordRows = {
  'FROM employees e': results(7, i => ({
    id: 'person-' + i, displayName: 'Match Person ' + i, employeeNo: 'EMP-' + i,
  })),
  'FROM payroll_runs': results(4, i => ({
    id: 'run-' + i, periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'match',
  })),
  'FROM construction_projects': results(5, i => ({
    id: 'construction-' + i, name: 'Match project ' + i, projectNo: 'PROJ-' + i,
  })),
  'FROM leave_requests': results(5, i => ({
    id: 'leave-' + i, status: 'match', startDate: '2026-10-20',
  })),
  'FROM employee_document_requests': results(5, i => ({
    id: 'doc-' + i, documentType: 'Match document ' + i, status: 'pending',
  })),
  'FROM workflow_form_submissions s': results(4, i => ({
    id: 'submission-' + i, formTitle: 'Match form ' + i, status: 'submitted',
  })),
  'FROM employee_notifications n': results(4, i => ({
    id: 'notice-' + i, title: 'Match notice ' + i, category: 'work',
  })),
};
let failingSource = '';
const database = {
  DB: { prepare(sql) {
    const entry = Object.entries(recordRows).find(([fragment]) => sql.includes(fragment));
    if (!entry) throw new Error('Unexpected query in bounded fixture');
    return { bind(...args) {
      assert.ok(args.includes('printing') || entry[0].includes('employee_notifications n'));
      return { async all() {
        if (failingSource && sql.includes(failingSource)) throw Error('Lookup unavailable');
        return { results: entry[1] };
      } };
    }};
  }},
};

async function search(q, ctx = session()) {
  const url = 'https://qa.invalid/api/search/suggest?q=' + encodeURIComponent(q);
  const response = await module.routeSmartSearch(new Request(url), database, ctx);
  assert.equal(response.status, 200);
  return response.json();
}

test('Crowded authorized record search gives every active source visibility', async () => {
  const result = await search('match');
  assert.equal(result.partial, false);
  assert.equal(result.sources.length, 7);
  assert.ok(result.sources.every(source => source.status === 'checked'));
  assert.equal(result.suggestions.length, 16, 'Response stays bounded');
  assert.deepEqual(result.suggestions.slice(0, 7).map(record => record.type), [
    'employee', 'payroll', 'construction', 'leave-request', 'document-request',
    'form-submission', 'notification',
  ]);
  assert.equal(new Set(result.suggestions.map(record => record.type)).size, 7);
});

test('Round-robin preserves per-source order without exposing record payloads', async () => {
  const result = await search('match');
  const personIds = result.suggestions.filter(r => r.type === 'employee').map(r => r.entityId);
  assert.deepEqual(personIds, ['person-0', 'person-1', 'person-2']);
  for (const item of result.suggestions) {
    assert.equal('responseJson' in item, false);
    assert.equal('body' in item, false);
    assert.equal(item.label.toLowerCase().includes('secret'), false);
  }
});

test('Unauthorized data sources never enter the mixed search ranking', async () => {
  const ctx = session();
  ctx.companyPermissions.printing['payroll.access'] = 'none';
  ctx.companyPermissions.printing['construction.access'] = 'none';
  ctx.companyPermissions.printing['forms.access'] = 'none';
  const result = await search('match', ctx);
  assert.equal(result.suggestions.some(r =>
    ['payroll','construction','form-submission'].includes(r.type)), false);
  assert.equal(result.sources.some(r =>
    ['Payroll','Construction','My form submissions'].includes(r.name)), false);
  assert.ok(result.suggestions.some(r => r.type === 'notification'));
});

test('Unavailable source does not hide other records or expose infrastructure details', async () => {
  failingSource = 'FROM employees e';
  try {
    const result = await search('match');
    assert.equal(result.partial, true);
    assert.deepEqual(result.sources.find(x => x.name === 'People'), {
      name: 'People', status: 'unavailable',
    });
    assert.deepEqual(result.suggestions.slice(0, 6).map(x => x.type), [
      'payroll', 'construction', 'leave-request', 'document-request',
      'form-submission', 'notification',
    ]);
    assert.equal(JSON.stringify(result).includes('Lookup unavailable'), false);
  } finally {
    failingSource = '';
  }
});
