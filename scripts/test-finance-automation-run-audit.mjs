import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../worker/finance-automation.ts', import.meta.url), 'utf8');
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let auditAttempt = 0;
let failAuditAt = 0;
let reconciliationCalls = 0;
let failReconciliation = false;
const auditEvents = [];
const result = { scanned: 1, posted: 1, skipped: 0, failed: 0, errors: [] };
const env = { DB: { prepare(sql) {
  assert.match(sql, /INSERT INTO audit_logs/);
  let values = [];
  return {
    bind(...bound) { values = bound; return this; },
    async run() {
      auditAttempt++;
      if (auditAttempt === failAuditAt) throw new Error('synthetic required audit failure');
      auditEvents.push({ action: values[3], runId: values[4], requestId: values[6], after: JSON.parse(values[5]) });
      return { success: true, meta: { changes: 1 } };
    },
  };
} } };

const module = { exports: {} };
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require(specifier) {
    if (specifier === './auth') return { hasPermission: (context, code, level, companyId) =>
      context.companyPermissions?.[companyId]?.[code] === level || context.companyPermissions?.[companyId]?.[code] === 'manage' };
    if (specifier === './finance-sales-autopost') return { reconcileFulfilledSalesOrders: async () => {
      reconciliationCalls++;
      if (failReconciliation) throw new Error('synthetic reconciliation failure');
      return result;
    } };
    throw new Error(`Unexpected import: ${specifier}`);
  },
  Request, Response, URL, crypto: { randomUUID },
}, { filename: 'worker/finance-automation.ts', timeout: 2000 });

const route = module.exports.routeFinanceAutomation;
assert.equal(typeof route, 'function');
const context = {
  employee: { id: 'employee-a' }, roles: [], companies: [{ id: 'company-a' }],
  companyPermissions: { 'company-a': { 'finance.journal': 'create' } },
};
const request = (requestId = 'request-a') => new Request('https://staffportal.test/api/finance/automation/reconcile', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ companyId: 'company-a', limit: 20 }),
});

failAuditAt = 1;
const preflightFailure = await route(request(), env, context);
assert.equal(preflightFailure.status, 503);
assert.equal(reconciliationCalls, 0, 'failed required start audit prevents financial mutations');
assert.equal(auditEvents.length, 0);

auditAttempt = 0; failAuditAt = 0;
const success = await route(request('correlation-success'), env, context);
const successBody = await success.json();
assert.equal(success.status, 200);
assert.equal(successBody.ok, true);
assert.deepEqual(auditEvents.map((event) => event.action), ['sales_reconciliation_run_started', 'sales_reconciliation_run']);
assert.equal(auditEvents[0].runId, auditEvents[1].runId);
assert.equal(auditEvents[0].requestId, 'correlation-success');
assert.equal(auditEvents[1].requestId, 'correlation-success');
assert.equal(auditEvents[1].after.phase, 'completed');

auditAttempt = 0; failAuditAt = 2; auditEvents.length = 0;
const completionFailure = await route(request('correlation-completion-failure'), env, context);
const completionBody = await completionFailure.json();
assert.equal(completionFailure.status, 503);
assert.equal(completionBody.runStatus, 'completed_with_audit_failure');
assert.equal(completionBody.result.posted, 1, 'response truthfully reports posting that committed before completion-audit failure');
assert.equal(auditEvents.length, 1, 'durable start evidence remains when completion audit fails');

auditAttempt = 0; failAuditAt = 0; auditEvents.length = 0; failReconciliation = true;
const operationFailure = await route(request('correlation-operation-failure'), env, context);
const operationBody = await operationFailure.json();
assert.equal(operationFailure.status, 503);
assert.equal(operationBody.runStatus, 'failed');
assert.deepEqual(auditEvents.map((event) => event.action), ['sales_reconciliation_run_started', 'sales_reconciliation_run_failed']);
assert.equal(auditEvents[1].requestId, 'correlation-operation-failure');

console.log('FINANCE_AUTOMATION_RUN_AUDIT=4/4 PASS');
