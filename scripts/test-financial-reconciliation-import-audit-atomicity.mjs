import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = fs.readFileSync('worker/financial-gateway.ts', 'utf8');
const executableSource = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  `const hasPermission = () => true;
const fixtureCrypto = { randomUUID: () => globalThis.__financialGatewayTestUuidSequence.shift() || 'unexpected-id' };`,
).replaceAll('crypto.randomUUID()', 'fixtureCrypto.randomUUID()');
assert.notEqual(executableSource, source, 'runtime fixture replaces only authorization and deterministic IDs');
const { outputText } = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeFinancialGateway } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture({ auditIgnored = false, auditFailure = false, staleAudit = false, ignoredRowNumber = null } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE financial_reconciliation_imports (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_type TEXT NOT NULL, provider TEXT,
      source_reference TEXT, file_sha256 TEXT, status TEXT NOT NULL DEFAULT 'staged',
      row_count INTEGER NOT NULL, idempotency_key TEXT NOT NULL, created_by TEXT,
      UNIQUE(company_id, source_type, idempotency_key)
    );
    CREATE TABLE financial_reconciliation_import_rows (
      id TEXT PRIMARY KEY, import_id TEXT NOT NULL REFERENCES financial_reconciliation_imports(id),
      row_number INTEGER NOT NULL, provider_reference TEXT, occurred_at TEXT NOT NULL,
      direction TEXT NOT NULL, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL,
      description TEXT, reconciliation_status TEXT NOT NULL DEFAULT 'unmatched'
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT, module TEXT NOT NULL,
      action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, after_json TEXT, source TEXT NOT NULL
    );
  `);
  if (staleAudit) {
    db.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,source)
      VALUES('audit-old','employee-owner','company-printing','financial_gateway','stage_reconciliation_import',
        'financial_reconciliation_import','import-a','web')`).run();
  }
  if (auditIgnored) db.exec(`CREATE TRIGGER ignore_current_import_audit BEFORE INSERT ON audit_logs
    WHEN NEW.id='audit-current' BEGIN SELECT RAISE(IGNORE); END;`);
  if (auditFailure) db.exec(`CREATE TRIGGER fail_import_audit BEFORE INSERT ON audit_logs
    WHEN NEW.id='audit-current' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;`);
  if (ignoredRowNumber !== null) db.exec(`CREATE TRIGGER ignore_import_row BEFORE INSERT ON financial_reconciliation_import_rows
    WHEN NEW.row_number=${Number(ignoredRowNumber)} BEGIN SELECT RAISE(IGNORE); END;`);

  const env = { DB: {
    prepare(sql) {
      let params = [];
      return {
        sql,
        get params() { return params; },
        bind(...values) { params = values; return this; },
        first() { return db.prepare(sql).get(...params) ?? null; },
        all() { return { results: db.prepare(sql).all(...params) }; },
      };
    },
    batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, params }) => {
          const result = db.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes) } };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } };
  const context = { employee: { id: 'employee-owner' }, roles: [{ code: 'owner' }], companies: [] };
  const request = (rows = [{ providerReference: 'bank-ref-1',
    occurredAt: '2026-10-13T12:00:00.000Z', direction: 'credit', amountMinor: 12500,
    currency: 'NGN', description: 'Customer payment' }]) => new Request('https://staffportal.test/api/financial-gateway/reconciliation-imports', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        companyId: 'company-printing', sourceType: 'csv', sourceReference: 'statement-2026-10',
        idempotencyKey: 'import-key-1', rows,
      }),
    });
  const counts = () => ({
    imports: Number(db.prepare('SELECT COUNT(*) AS count FROM financial_reconciliation_imports').get().count),
    rows: Number(db.prepare('SELECT COUNT(*) AS count FROM financial_reconciliation_import_rows').get().count),
    audits: Number(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count),
  });
  return { db, env, context, request, counts };
}

globalThis.__financialGatewayTestUuidSequence = ['import-a', 'current', 'row-a'];
const positive = fixture();
const success = await routeFinancialGateway(positive.request(), positive.env, positive.context);
assert.equal(success.status, 201, 'valid evidence stages only after its current audit persists');
assert.deepEqual(positive.counts(), { imports: 1, rows: 1, audits: 1 });
const successBody = await success.json();
assert.equal(successBody.providerCallMade, false, 'staging does not call a provider');
assert.equal(positive.db.prepare('SELECT id FROM audit_logs').get().id, 'audit-current');
positive.db.close();

globalThis.__financialGatewayTestUuidSequence = ['import-a', 'current', 'row-a'];
const ignored = fixture({ auditIgnored: true });
const ignoredResponse = await routeFinancialGateway(ignored.request(), ignored.env, ignored.context);
assert.equal(ignoredResponse.status, 503, 'silently ignored required audit fails closed');
assert.deepEqual(ignored.counts(), { imports: 0, rows: 0, audits: 0 }, 'the import and all rows roll back');
ignored.db.close();

globalThis.__financialGatewayTestUuidSequence = ['import-a', 'current', 'row-a'];
const stale = fixture({ auditIgnored: true, staleAudit: true });
const staleResponse = await routeFinancialGateway(stale.request(), stale.env, stale.context);
assert.equal(staleResponse.status, 503, 'an older matching audit cannot satisfy this operation');
assert.deepEqual(stale.counts(), { imports: 0, rows: 0, audits: 1 }, 'only the prior audit remains');
stale.db.close();

globalThis.__financialGatewayTestUuidSequence = ['import-a', 'current', 'row-a'];
const failed = fixture({ auditFailure: true });
const failedResponse = await routeFinancialGateway(failed.request(), failed.env, failed.context);
assert.equal(failedResponse.status, 503, 'a thrown audit insert fails closed');
assert.deepEqual(failed.counts(), { imports: 0, rows: 0, audits: 0 }, 'insert failure rolls back evidence');
failed.db.close();

globalThis.__financialGatewayTestUuidSequence = ['import-a', 'current', 'row-a', 'row-b'];
const ignoredChild = fixture({ ignoredRowNumber: 2 });
const ignoredChildResponse = await routeFinancialGateway(ignoredChild.request([
  { providerReference: 'bank-ref-1', occurredAt: '2026-10-13T12:00:00.000Z', direction: 'credit',
    amountMinor: 12500, currency: 'NGN', description: 'First statement row' },
  { providerReference: 'bank-ref-2', occurredAt: '2026-10-13T12:01:00.000Z', direction: 'credit',
    amountMinor: 8500, currency: 'NGN', description: 'Second statement row' },
]), ignoredChild.env, ignoredChild.context);
assert.equal(ignoredChildResponse.status, 503, 'a silently ignored child row fails the exact row-count invariant');
assert.deepEqual(ignoredChild.counts(), { imports: 0, rows: 0, audits: 0 },
  'a partial row set rolls back the parent, remaining rows and audit');
ignoredChild.db.close();

globalThis.__financialGatewayTestUuidSequence = ['import-a', 'current-a', 'row-a', 'import-b', 'current-b', 'row-b'];
const concurrent = fixture();
const concurrentResponses = await Promise.all([
  routeFinancialGateway(concurrent.request(), concurrent.env, concurrent.context),
  routeFinancialGateway(concurrent.request(), concurrent.env, concurrent.context),
]);
assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [200, 201],
  'one concurrent request creates the import and the other returns the idempotent replay');
const concurrentBodies = await Promise.all(concurrentResponses.map((response) => response.json()));
assert.equal(new Set(concurrentBodies.map((body) => body.id)).size, 1, 'both concurrent responses identify one import');
assert.equal(concurrentBodies.filter((body) => body.idempotentReplay === true).length, 1);
assert.deepEqual(concurrent.counts(), { imports: 1, rows: 1, audits: 1 },
  'concurrent retries create only one import, row set and current-operation audit');
concurrent.db.close();

globalThis.__financialGatewayTestUuidSequence = ['unexpected-import'];
const crossCompany = fixture();
const crossCompanyContext = {
  employee: { id: 'employee-company-a' }, roles: [], companies: [{ id: 'company-printing' }],
};
const crossCompanyRequest = () => new Request('https://staffportal.test/api/financial-gateway/reconciliation-imports', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    companyId: 'company-bakery', sourceType: 'csv', idempotencyKey: 'company-b-import',
    rows: [{ occurredAt: '2026-10-13T12:00:00.000Z', direction: 'credit', amountMinor: 1,
      currency: 'NGN' }],
  }),
});
const crossCompanyResponse = await routeFinancialGateway(crossCompanyRequest(), crossCompany.env, crossCompanyContext);
assert.equal(crossCompanyResponse.status, 403, 'a non-Owner scoped to Company A cannot stage Company B evidence');
assert.deepEqual(crossCompany.counts(), { imports: 0, rows: 0, audits: 0 }, 'cross-company denial performs no writes');
crossCompany.db.close();

console.log('Financial reconciliation import audit atomicity SQLite runtime: 21 assertions PASS');
