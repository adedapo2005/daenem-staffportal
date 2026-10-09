import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('worker/finance-sales-autopost.ts', root), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { postFulfilledSalesOrder } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture({ failAudit = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE companies(id TEXT PRIMARY KEY);
    CREATE TABLE customers(id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE sales_orders(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, customer_id TEXT,
      order_no TEXT NOT NULL, order_date TEXT NOT NULL, status TEXT NOT NULL, payment_status TEXT NOT NULL,
      total_kobo INTEGER NOT NULL, amount_paid_kobo INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sales_order_items(sales_order_id TEXT NOT NULL, quantity REAL NOT NULL, unit_cost_kobo INTEGER NOT NULL);
    CREATE TABLE finance_accounts(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, active INTEGER NOT NULL);
    CREATE TABLE fiscal_periods(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, status TEXT NOT NULL,
      name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL);
    CREATE TABLE journal_entries(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, fiscal_period_id TEXT NOT NULL,
      entry_no TEXT NOT NULL, entry_date TEXT NOT NULL, description TEXT NOT NULL, source_module TEXT NOT NULL,
      source_type TEXT NOT NULL, source_id TEXT NOT NULL, status TEXT NOT NULL, prepared_by TEXT,
      approved_by TEXT, approved_at TEXT, posted_at TEXT);
    CREATE TABLE journal_lines(id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, account_id TEXT NOT NULL,
      description TEXT, debit_kobo INTEGER NOT NULL, credit_kobo INTEGER NOT NULL, customer_id TEXT);
    CREATE TABLE finance_receivables(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, customer_name TEXT NOT NULL,
      customer_ref TEXT, invoice_no TEXT, source_module TEXT NOT NULL, source_id TEXT NOT NULL,
      invoice_date TEXT NOT NULL, due_date TEXT, amount_kobo INTEGER NOT NULL, paid_kobo INTEGER NOT NULL,
      balance_kobo INTEGER NOT NULL, status TEXT NOT NULL, notes TEXT, created_by TEXT);
    CREATE TABLE finance_source_postings(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_module TEXT NOT NULL,
      source_type TEXT NOT NULL, source_id TEXT NOT NULL, journal_entry_id TEXT, receivable_id TEXT,
      posted_amount_kobo INTEGER NOT NULL, cost_amount_kobo INTEGER NOT NULL, status TEXT NOT NULL,
      error_text TEXT, posted_at TEXT NOT NULL, UNIQUE(company_id, source_module, source_type, source_id));
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT, module TEXT NOT NULL,
      action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, before_json TEXT, after_json TEXT, source TEXT NOT NULL);
    INSERT INTO companies VALUES ('company-a');
    INSERT INTO customers VALUES ('customer-a','Customer A');
    INSERT INTO sales_orders VALUES ('sale-a','company-a','customer-a','SO-1','2026-10-08','completed','unpaid',12500,0);
    INSERT INTO finance_accounts VALUES
      ('cash-a','company-a','1000',1),('ar-a','company-a','1100',1),('inventory-a','company-a','1200',1),
      ('revenue-a','company-a','4000',1),('cogs-a','company-a','5000',1);
    INSERT INTO fiscal_periods VALUES ('period-a','company-a','open','October 2026','2026-10-01','2026-10-31');
  `);
  if (failAudit) db.exec(`CREATE TRIGGER fail_finance_audit BEFORE INSERT ON audit_logs
    BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;`);
  const env = { DB: {
    prepare(sql) {
      let values = [];
      return {
        sql,
        get values() { return values; },
        bind(...bound) { values = bound; return this; },
        first() { return db.prepare(sql).get(...values) ?? null; },
        all() { return { results: db.prepare(sql).all(...values) }; },
        run() { const result = db.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
      };
    },
    batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => {
          const result = statement.run();
          return { success: true, meta: { changes: Number(result.changes) } };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } };
  return { db, env };
}

const posted = fixture();
const result = await postFulfilledSalesOrder(posted.env, 'sale-a');
assert.equal(result.posted, true);
assert.equal(posted.db.prepare('SELECT COUNT(*) AS count FROM journal_entries').get().count, 1);
assert.equal(posted.db.prepare('SELECT COUNT(*) AS count FROM finance_receivables').get().count, 1);
assert.equal(posted.db.prepare('SELECT COUNT(*) AS count FROM finance_source_postings WHERE status=\'posted\'').get().count, 1);
const audit = posted.db.prepare(`SELECT company_id,entity_type,entity_id,after_json FROM audit_logs
  WHERE module='finance' AND action='auto_post_sales_order'`).get();
assert.equal(audit.company_id, 'company-a');
assert.equal(audit.entity_type, 'sales_order');
assert.equal(audit.entity_id, 'sale-a');
assert.equal(JSON.parse(audit.after_json).journalEntryId, result.journalEntryId);
posted.db.close();

const failed = fixture({ failAudit: true });
await assert.rejects(postFulfilledSalesOrder(failed.env, 'sale-a'), /injected audit failure/);
for (const table of ['journal_entries', 'journal_lines', 'finance_receivables', 'finance_source_postings', 'audit_logs']) {
  assert.equal(failed.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, `${table} must roll back when audit insertion fails`);
}
failed.db.close();

console.log('PASS: sales posting writes correlated audit in the same transaction; forced audit failure rolls back all posting rows');
