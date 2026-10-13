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
  db.exec(fs.readFileSync('migrations/0099_finance_receivable_create_idempotency.sql', 'utf8'));
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
const success = await routeFinance(request({ 'idempotency-key': 'receivable-create-42', 'x-request-id': 'finance-create-trace-1' }), accepted.env, accepted.context);
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
assert.equal(audit.request_id, 'finance-create-trace-1');
assert.deepEqual(JSON.parse(audit.after_json), {
  customerName: 'Customer A', customerRef: 'customer-ref-a', invoiceNo: 'INV-001',
  amountKobo: 85000, currency: 'NGN', actorRoles: ['finance-clerk'], beforeStatus: null, afterStatus: 'open',
});
assert.doesNotMatch(audit.after_json, /private note/);
assert.equal(accepted.batches, 1, 'receivable and required audit use one atomic batch');
const replay = await routeFinance(request({ 'idempotency-key': 'receivable-create-42', 'x-request-id': 'finance-create-trace-2' }), accepted.env, accepted.context);
assert.equal(replay.status, 200, 'an identical company-scoped request identity replays as the original create');
assert.equal((await replay.json()).id, created.id, 'retry returns the original receivable identity');
assert.equal(accepted.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 1,
  'replay cannot create a second receivable');
assert.equal(accepted.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1,
  'replay cannot create duplicate success audit evidence');
assert.equal(accepted.batches, 2);
const conflictingReplay = await routeFinance(request({ 'idempotency-key': 'receivable-create-42', 'x-request-id': 'finance-create-trace-3' },
  { ...payload, amountNaira: 851 }), accepted.env, accepted.context);
assert.equal(conflictingReplay.status, 409, 'reusing the same request identity with a different payload conflicts');
assert.equal(accepted.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 1,
  'conflicting replay creates no additional receivable');
assert.equal(accepted.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1,
  'conflicting replay creates no success audit');
assert.equal(accepted.batches, 3);
accepted.db.close();

const missingKey = fixture();
const missingKeyResponse = await routeFinance(request({ 'x-request-id': 'trace-is-not-an-operation-key' }), missingKey.env, missingKey.context);
assert.equal(missingKeyResponse.status, 400, 'transport correlation alone cannot authorize a logical create identity');
assert.equal(missingKey.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0);
assert.equal(missingKey.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
assert.equal(missingKey.batches, 0);
missingKey.db.close();

for (const [name, amountNaira] of [
  ['fractional kobo', 1.001],
  ['unsafe kobo magnitude', 100000000000000.01],
  ['null amount', null],
  ['string amount', '1.23'],
]) {
  const invalidAmount = fixture();
  const response = await routeFinance(request({}, { ...payload, amountNaira }), invalidAmount.env, invalidAmount.context);
  assert.equal(response.status, 400, `${name} is rejected before creating an obligation`);
  assert.equal(invalidAmount.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0,
    `${name} creates no receivable`);
  assert.equal(invalidAmount.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0,
    `${name} creates no success audit`);
  assert.equal(invalidAmount.batches, 0, `${name} performs no write batch`);
  invalidAmount.db.close();
}

const exactKobo = fixture();
const exactKoboResponse = await routeFinance(request({ 'idempotency-key': 'exact-kobo-create' }, { ...payload, amountNaira: 1.23 }), exactKobo.env, exactKobo.context);
assert.equal(exactKoboResponse.status, 201, 'valid two-decimal NGN amounts remain accepted');
assert.equal(exactKobo.db.prepare('SELECT amount_kobo AS amount FROM finance_receivables').get().amount, 123,
  'two-decimal NGN amounts convert to exact integer kobo');
exactKobo.db.close();

const competing = fixture();
const simultaneous = await Promise.all([
  routeFinance(request({ 'idempotency-key': 'finance-create-race-9', 'x-request-id': 'trace-race-a' }), competing.env, competing.context),
  routeFinance(request({ 'idempotency-key': 'finance-create-race-9', 'x-request-id': 'trace-race-b' }), competing.env, competing.context),
]);
assert.deepEqual(simultaneous.map(response => response.status).sort(), [200, 201],
  'competing identical create requests produce one create and one replay');
assert.equal(competing.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 1,
  'database uniqueness preserves one receivable under competing requests');
assert.equal(competing.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1,
  'competing replay cannot duplicate success audit evidence');
competing.db.close();

const failedAudit = fixture({ auditFailure: true });
const failed = await routeFinance(request({ 'idempotency-key': 'audit-fail-create' }), failedAudit.env, failedAudit.context);
assert.equal(failed.status, 503, 'audit failure returns bounded service-unavailable response');
assert.equal(failedAudit.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0,
  'receivable insert rolls back when required audit insert fails');
assert.equal(failedAudit.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
assert.equal(failedAudit.batches, 1);
failedAudit.db.close();

const ignoredAudit = fixture({ ignoreAudit: true });
const ignored = await routeFinance(request({ 'idempotency-key': 'ignored-audit-create' }), ignoredAudit.env, ignoredAudit.context);
assert.equal(ignored.status, 409, 'silently ignored audit cannot produce success');
assert.equal(ignoredAudit.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0,
  'conditional receivable insert requires one written audit row');
assert.equal(ignoredAudit.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
ignoredAudit.db.close();

const crossCompany = fixture();
crossCompany.context.companyPermissions['company-b'] = { 'finance.receivables': 'create' };
crossCompany.context.companies = [{ id: 'company-a' }];
const denied = await routeFinance(request({ 'idempotency-key': 'cross-company-create' }, { ...payload, companyId: 'company-b' }), crossCompany.env, crossCompany.context);
assert.equal(denied.status, 403, 'company membership remains required before any write');
assert.equal(crossCompany.batches, 0, 'cross-company attempt performs no receivable or audit write');
assert.equal(crossCompany.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 0);
crossCompany.db.close();

const companyScopedKeys = fixture();
const companyAResult = await routeFinance(
  request({ 'idempotency-key': 'same-key-independent-businesses' }), companyScopedKeys.env, companyScopedKeys.context,
);
const companyBContext = {
  ...companyScopedKeys.context,
  companies: [{ id: 'company-b' }],
  roles: [{ code: 'finance-clerk', companyId: 'company-b' }],
  companyPermissions: { 'company-b': { 'finance.receivables': 'create' } },
};
const companyBResult = await routeFinance(
  request({ 'idempotency-key': 'same-key-independent-businesses' }, { ...payload, companyId: 'company-b' }),
  companyScopedKeys.env,
  companyBContext,
);
assert.deepEqual([companyAResult.status, companyBResult.status], [201, 201],
  'the same operation key is independent across separately authorized companies');
const companyARecord = await companyAResult.json();
const companyBRecord = await companyBResult.json();
assert.notEqual(companyARecord.id, companyBRecord.id, 'company-scoped keys retain separate receivable identities');
assert.deepEqual(
  companyScopedKeys.db.prepare('SELECT company_id FROM finance_receivables ORDER BY company_id').all().map(row => row.company_id),
  ['company-a', 'company-b'],
  'same-key creates remain inside their authorized company ledgers',
);
assert.deepEqual(
  companyScopedKeys.db.prepare('SELECT company_id FROM audit_logs ORDER BY company_id').all().map(row => row.company_id),
  ['company-a', 'company-b'],
  'each company receives only its own create audit evidence',
);
console.log('PASS identical operation keys remain isolated across authorized company ledgers');
companyScopedKeys.db.close();

const distinctCreates = fixture();
const distinctOne = await routeFinance(request({ 'idempotency-key': 'user-action-one' }), distinctCreates.env, distinctCreates.context);
const distinctTwo = await routeFinance(request({ 'idempotency-key': 'user-action-two' }), distinctCreates.env, distinctCreates.context);
assert.deepEqual([distinctOne.status, distinctTwo.status], [201, 201], 'a distinct user action can record the same payload without invoice-number uniqueness inference');
assert.equal(distinctCreates.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 2);
assert.equal(distinctCreates.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 2);
distinctCreates.db.close();

console.log('PASS: Finance receivable creation requires a stable company-scoped operation key separate from request correlation; retries across changing traces return the original record, conflicting payloads fail closed, distinct actions remain allowed, required audit is atomic, and company scope/data minimization hold.');
