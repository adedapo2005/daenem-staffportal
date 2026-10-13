import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = fs.readFileSync('worker/financial-gateway.ts', 'utf8');
const executableSource = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  'const hasPermission = () => true;',
);
assert.notEqual(executableSource, source, 'runtime fixture replaces only the authorization dependency');
const { outputText } = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeFinancialGateway } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture({ auditIgnored = false, staleAudit = false, importCompanyId = 'company-printing' } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE financial_reconciliation_imports (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
    CREATE TABLE financial_reconciliation_import_rows (
      id TEXT PRIMARY KEY, import_id TEXT NOT NULL, row_number INTEGER NOT NULL,
      reconciliation_status TEXT NOT NULL, candidate_reference TEXT,
      reviewed_by TEXT, reviewed_at TEXT, UNIQUE(import_id,row_number)
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT, module TEXT NOT NULL,
      action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, before_json TEXT,
      after_json TEXT, source TEXT NOT NULL
    );
  `);
  db.prepare('INSERT INTO financial_reconciliation_imports(id,company_id) VALUES(?,?)').run('import-a', importCompanyId);
  db.prepare(`INSERT INTO financial_reconciliation_import_rows(id,import_id,row_number,reconciliation_status,candidate_reference)
    VALUES('row-a','import-a',1,'unmatched',NULL)`).run();
  if (staleAudit) {
    db.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,source)
      VALUES('audit-old','employee-owner','company-printing','financial_gateway','review_reconciliation_row',
        'financial_reconciliation_import_row','import-a:1','web')`).run();
  }
  if (auditIgnored) {
    db.exec(`CREATE TRIGGER ignore_review_audit BEFORE INSERT ON audit_logs
      WHEN NEW.action='review_reconciliation_row' BEGIN SELECT RAISE(IGNORE); END;`);
  }

  const env = { DB: {
    prepare(sql) {
      return { sql, params: [], bind(...params) { this.params = params; return this; } };
    },
    async batch(statements) {
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
  const context = {
    employee: { id: 'employee-owner' },
    roles: [{ code: 'owner' }],
    companies: [{ id: 'company-printing' }],
  };
  const request = (companyId = 'company-printing', expectedStatus = 'unmatched') => new Request(
    'https://staffportal.test/api/financial-gateway/reconciliation-imports/import-a/review',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      companyId, rowNumber: 1, expectedStatus, expectedCandidateReference: null,
      status: 'exact', candidateReference: 'invoice-42',
    }) },
  );
  const row = () => db.prepare('SELECT reconciliation_status,candidate_reference,reviewed_by,reviewed_at FROM financial_reconciliation_import_rows WHERE id=?').get('row-a');
  const auditCount = () => Number(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='review_reconciliation_row'").get().count);
  return { db, env, context, request, row, auditCount };
}

const positive = fixture();
const success = await routeFinancialGateway(positive.request(), positive.env, positive.context);
assert.equal(success.status, 200, 'a valid evidence review succeeds');
assert.equal(positive.row().reconciliation_status, 'exact');
assert.equal(positive.row().candidate_reference, 'invoice-42');
assert.equal(positive.auditCount(), 1, 'success has one current-operation audit');
positive.db.close();

const ignored = fixture({ auditIgnored: true });
const ignoredResponse = await routeFinancialGateway(ignored.request(), ignored.env, ignored.context);
assert.equal(ignoredResponse.status, 503, 'silently ignored audit fails closed');
assert.equal(ignored.row().reconciliation_status, 'unmatched', 'classification rolls back when audit is absent');
assert.equal(ignored.row().candidate_reference, null);
assert.equal(ignored.auditCount(), 0);
ignored.db.close();

const stale = fixture({ auditIgnored: true, staleAudit: true });
const staleResponse = await routeFinancialGateway(stale.request(), stale.env, stale.context);
assert.equal(staleResponse.status, 503, 'an older matching audit cannot satisfy the current operation');
assert.equal(stale.row().reconciliation_status, 'unmatched');
assert.equal(stale.auditCount(), 1, 'the prior audit remains unchanged');
stale.db.close();

const mismatch = fixture({ importCompanyId: 'company-bakery' });
const mismatchResponse = await routeFinancialGateway(mismatch.request('company-printing'), mismatch.env, mismatch.context);
assert.equal(mismatchResponse.status, 409, 'import from another company cannot be reviewed under a different company');
assert.equal(mismatch.row().reconciliation_status, 'unmatched');
assert.equal(mismatch.auditCount(), 0);
mismatch.db.close();

const staleState = fixture();
const staleStateResponse = await routeFinancialGateway(staleState.request('company-printing', 'partial'), staleState.env, staleState.context);
assert.equal(staleStateResponse.status, 409, 'stale expected classification loses compare-and-set');
assert.equal(staleState.row().reconciliation_status, 'unmatched');
assert.equal(staleState.auditCount(), 0);
staleState.db.close();

const concurrent = fixture();
const concurrentResponses = await Promise.all([
  routeFinancialGateway(concurrent.request(), concurrent.env, concurrent.context),
  routeFinancialGateway(concurrent.request(), concurrent.env, concurrent.context),
]);
assert.deepEqual(concurrentResponses.map((response) => response.status).sort(), [200, 409], 'only one review wins');
assert.equal(concurrent.row().reconciliation_status, 'exact');
assert.equal(concurrent.auditCount(), 1, 'the winning review has one audit');
concurrent.db.close();

console.log('Financial reconciliation review SQLite runtime: 18 assertions PASS (isolated SQLite, no provider or ledger writes)');
