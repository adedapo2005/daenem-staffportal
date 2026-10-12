import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = fs.readFileSync('worker/finance.ts', 'utf8');
const executableSource = source.replace(
  "import { hasPermission,type AuthEnv,type SessionContext } from './auth';",
  `const levels = ['none','view','create','edit','approve','manage'];
const hasPermission = (context, code, minimum = 'view', companyId) =>
  levels.indexOf(context.companyPermissions?.[companyId]?.[code] || 'none') >= levels.indexOf(minimum);`,
);
assert.notEqual(executableSource, source, 'runtime fixture replaces only the authorization dependency');
const { outputText } = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeFinance } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture({ auditFailure = false, ignoreAudit = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE finance_receivables(
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_ref TEXT, invoice_no TEXT, invoice_date TEXT NOT NULL, due_date TEXT,
      amount_kobo INTEGER NOT NULL, balance_kobo INTEGER NOT NULL, status TEXT NOT NULL,
      notes TEXT, created_by TEXT
    );
    CREATE TABLE audit_logs(
      id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT, module TEXT NOT NULL,
      action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, before_json TEXT, after_json TEXT,
      source TEXT NOT NULL, request_id TEXT
    );
  `);
  if (auditFailure) db.exec(`CREATE TRIGGER fail_finance_audit BEFORE INSERT ON audit_logs
    BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;`);
  if (ignoreAudit) db.exec(`CREATE TRIGGER ignore_finance_audit BEFORE INSERT ON audit_logs
    BEGIN SELECT RAISE(IGNORE); END;`);
  let batches = 0;
  const env = { DB: {
    prepare(sql) {
      let values = [];
      return {
        bind(...bound) { values = bound; return this; },
        first() { return db.prepare(sql).get(...values) ?? null; },
        all() { return { results: db.prepare(sql).all(...values) }; },
        run() {
          const result = db.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
    batch(statements) {
      batches++;
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } };
  const context = {
    employee: { id: 'employee-a' }, roles: [{ code: 'finance-clerk', companyId: 'company-a' }],
    companies: [{ id: 'company-a' }],
    companyPermissions: { 'company-a': { 'finance.receivables': 'create' } },
  };
  return { db, env, context, get batches() { return batches; } };
}

const payload = {
  companyId: 'company-a', customerName: 'Customer A', customerRef: 'customer-ref-a',
  invoiceNo: 'INV-001', invoiceDate: '2026-10-12', amountNaira: 850,
  notes: 'private note is excluded from the formal audit snapshot',
};
function request(headers = {}, body = payload) {
  return new Request('https://staffportal.test/api/finance/receivables', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const accepted = fixture();
const success = await routeFinance(request({ 'x-request-id': 'finance-create-42' }), accepted.env, accepted.context);
assert.equal(success.status, 201, 'a receivable is reported created only after both writes persist');
const created = await success.json();
assert.equal(accepted.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 1);
const audit = accepted.db.prepare(`SELECT actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id FROM audit_logs`).get();
assert.equal(audit.actor_employee_id, 'employee-a');
assert.equal(audit.company_id, 'company-a');
assert.equal(audit.module, 'finance');
assert.equal(audit.action, 'create_receivable');
assert.equal(audit.entity_type, 'finance_receivable');
assert.equal(audit.entity_id, created.id);
assert.equal(audit.before_json, null);
assert.equal(audit.source, 'web');
assert.equal(audit.request_id, 'finance-create-42');
assert.deepEqual(JSON.parse(audit.after_json), {
  customerName: 'Customer A', customerRef: 'customer-ref-a', invoiceNo: 'INV-001',
  amountKobo: 85000, currency: 'NGN', actorRoles: ['finance-clerk'], beforeStatus: null, afterStatus: 'open',
});
assert.doesNotMatch(audit.after_json, /private note/);
assert.equal(accepted.batches, 1, 'receivable and required audit use one atomic batch');
accepted.db.close();

const failedAudit = fixture({ auditFailure: true });
const failed = await routeFinance(request(), failedAudit.env, failedAudit.context);
assert.equal(failed.status, 503, 'audit failure returns bounded service-unavailable response');
assert.equal(failedAudit.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0,
  'receivable insert rolls back when required audit insert fails');
assert.equal(failedAudit.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
assert.equal(failedAudit.batches, 1);
failedAudit.db.close();

const ignoredAudit = fixture({ ignoreAudit: true });
const ignored = await routeFinance(request(), ignoredAudit.env, ignoredAudit.context);
assert.equal(ignored.status, 409, 'silently ignored audit cannot produce success');
assert.equal(ignoredAudit.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0,
  'conditional receivable insert requires one written audit row');
assert.equal(ignoredAudit.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
ignoredAudit.db.close();

const crossCompany = fixture();
crossCompany.context.companyPermissions['company-b'] = { 'finance.receivables': 'create' };
crossCompany.context.companies = [{ id: 'company-a' }];
const denied = await routeFinance(request({}, { ...payload, companyId: 'company-b' }), crossCompany.env, crossCompany.context);
assert.equal(denied.status, 403, 'company membership remains required before any write');
assert.equal(crossCompany.batches, 0, 'cross-company attempt performs no receivable or audit write');
assert.equal(crossCompany.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0);
crossCompany.db.close();

console.log('PASS: Finance receivable creation and required audit are atomic; audit-failure rollback, request correlation, data minimization and cross-company zero-write checks pass. Duplicate retry identity remains outside this fixture because no approved key contract exists.');
