import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../worker/employee-self-service.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
runInNewContext(js, {
  exports,
  require(id) {
    assert.equal(id, './auth');
    return { hasPermission(context, permission, level, companyId) {
      return context.permissions?.[`${permission}:${level}:${companyId}`] === true;
    } };
  },
  crypto: webcrypto,
  URL,
  Request,
  Response,
  Date,
  Intl,
  JSON,
  Promise,
  Set,
  Math,
  Number,
  String,
  RegExp,
});

const dbCalls = [];
const db = {
  prepare(sql) {
    const statement = { sql, values: [] };
    statement.bind = (...values) => { statement.values = values; return statement; };
    statement.first = async () => {
      dbCalls.push({ kind: 'first', sql, values: statement.values });
      if (sql.includes('FROM leave_types')) return { id: 'leave-type-b' };
      if (sql.includes('FROM employees e JOIN employee_company_memberships')) return { id: 'recipient-b', displayName: 'Recipient B' };
      return null;
    };
    statement.all = async () => { dbCalls.push({ kind: 'all', sql, values: statement.values }); return { results: [] }; };
    statement.run = async () => { dbCalls.push({ kind: 'run', sql, values: statement.values }); return { success: true, meta: { changes: 1 } }; };
    return statement;
  },
  async batch(statements) {
    for (const statement of statements) dbCalls.push({ kind: 'batch', sql: statement.sql, values: statement.values });
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  },
};
const context = {
  employee: { id: 'employee-1', department: 'Operations' },
  companies: [{ id: 'company-a' }, { id: 'company-b' }],
  roles: [],
  permissions: {
    'leave.access:create:company-b': true,
    'leave.admin:view:company-b': true,
    'document_requests.access:create:company-b': true,
    'chat.access:create:company-b': true,
  },
};
const call = async (path, method = 'GET', body, query = '', actingContext = context) => {
  const request = new Request(`https://worker.test${path}${query}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return exports.routeEmployeeSelfService(request, { DB: db }, actingContext);
};
const json = async response => response.json();
const routes = [
  ['leave request', () => call('/api/ess/leave', 'POST', { leaveTypeId: 'leave-type-b', startDate: '2026-11-02', endDate: '2026-11-03' })],
  ['leave queue', () => call('/api/ess/leave/queue')],
  ['document request', () => call('/api/ess/documents', 'POST', { documentType: 'Employment Letter' })],
  ['direct chat', () => call('/api/ess/chat/direct', 'POST', { employeeId: 'recipient-b' })],
];
for (const [name, invoke] of routes) {
  const before = dbCalls.length;
  const response = await invoke();
  assert.equal(response.status, 400, `${name} without company is rejected`);
  assert.match((await json(response)).error, /Select an assigned company/);
  assert.equal(dbCalls.length, before, `${name} without company performs no D1 operation`);
}
console.log('PASS omitted company rejected before D1 for leave request, leave queue, document request, and direct chat');

const oneCompany = { ...context, companies: [{ id: 'company-b' }] };
for (const [name, invoke] of [
  ['leave request', () => call('/api/ess/leave', 'POST', { leaveTypeId: 'leave-type-b', startDate: '2026-11-02', endDate: '2026-11-03' }, '', oneCompany)],
  ['leave queue', () => call('/api/ess/leave/queue', 'GET', undefined, '', oneCompany)],
  ['document request', () => call('/api/ess/documents', 'POST', { documentType: 'Employment Letter' }, '', oneCompany)],
  ['direct chat', () => call('/api/ess/chat/direct', 'POST', { employeeId: 'recipient-b' }, '', oneCompany)],
]) {
  const before = dbCalls.length;
  const response = await invoke();
  assert.equal(response.status, 400, `${name} still requires an explicit company with one membership`);
  assert.equal(dbCalls.length, before, `${name} cannot fall back to the sole company`);
}
console.log('PASS sole-company membership cannot silently bind an omitted company');

const unapproved = [
  ['/api/ess/leave', 'POST', { companyId: 'company-a', leaveTypeId: 'leave-type-a', startDate: '2026-11-02', endDate: '2026-11-03' }],
  ['/api/ess/leave/queue', 'GET', undefined, '?companyId=company-a'],
  ['/api/ess/documents', 'POST', { companyId: 'company-a', documentType: 'Employment Letter' }],
  ['/api/ess/chat/direct', 'POST', { companyId: 'company-a', employeeId: 'recipient-a' }],
];
for (const [path, method, body, query = ''] of unapproved) {
  const before = dbCalls.length;
  const response = await call(path, method, body, query);
  assert.equal(response.status, 403, `${path} cannot infer authority from membership in company A`);
  assert.equal(dbCalls.length, before, `${path} unauthorized company performs no D1 operation`);
}
console.log('PASS explicit but unauthorized company rejected before D1 on all four routes');

for (const roleCode of ['owner', 'admin']) {
  const privilegedTitle = { ...context, roles: [{ id: `role-${roleCode}`, code: roleCode, companyId: 'company-a' }] };
  for (const [path, method, body, query = ''] of unapproved) {
    const before = dbCalls.length;
    const response = await call(path, method, body, query, privilegedTitle);
    assert.equal(response.status, 403, `${roleCode} title cannot replace a company-specific grant on ${path}`);
    assert.equal(dbCalls.length, before, `${roleCode} denial on ${path} performs no D1 operation`);
  }
}
console.log('PASS Owner and Admin titles do not bypass company-specific grants');

const accepted = [
  ['/api/ess/leave', 'POST', { companyId: 'company-b', leaveTypeId: 'leave-type-b', startDate: '2026-11-02', endDate: '2026-11-03' }],
  ['/api/ess/leave/queue', 'GET', undefined, '?companyId=company-b'],
  ['/api/ess/documents', 'POST', { companyId: 'company-b', documentType: 'Employment Letter' }],
  ['/api/ess/chat/direct', 'POST', { companyId: 'company-b', employeeId: 'recipient-b' }],
];
for (const [path, method, body, query = ''] of accepted) {
  const before = dbCalls.length;
  const response = await call(path, method, body, query);
  assert.ok(response.status < 400, `${path} accepts explicitly authorized company B`);
  const calls = dbCalls.slice(before);
  assert.ok(calls.length > 0, `${path} uses D1 after explicit authorized binding`);
  assert.ok(calls.some(call => call.values.includes('company-b')), `${path} binds company B into its D1 path`);
}
console.log('PASS authorized explicit company B is preserved through each route D1 path');
console.log('ESS_EXPLICIT_COMPANY_BINDING=24/24 PASS');
