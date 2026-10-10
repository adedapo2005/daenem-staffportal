import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('worker/finance-sales-autopost.ts', root), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { postFulfilledSalesOrder, recordFailure } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture({ failAudit = false, paymentStatus = 'unpaid', amountPaidKobo = 0, periodStatus = 'open', includePeriod = true, beforeBatch } = {}) {
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
  `);
  if (includePeriod) db.prepare(`INSERT INTO fiscal_periods VALUES ('period-a','company-a',?,'October 2026','2026-10-01','2026-10-31')`).run(periodStatus);
  db.prepare('UPDATE sales_orders SET payment_status=?,amount_paid_kobo=? WHERE id=?')
    .run(paymentStatus, amountPaidKobo, 'sale-a');
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
      beforeBatch?.(db);
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
assert.equal(failed.db.prepare('SELECT COUNT(*) AS count FROM fiscal_periods').get().count, 1,
  'failed posting must not create or remove a fiscal period outside the atomic posting batch');
failed.db.close();

const missingPeriod = fixture({ includePeriod: false, failAudit: true });
await assert.rejects(postFulfilledSalesOrder(missingPeriod.env, 'sale-a'), /open company fiscal period is required/);
for (const table of ['fiscal_periods', 'journal_entries', 'journal_lines', 'finance_receivables', 'finance_source_postings', 'audit_logs']) {
  assert.equal(missingPeriod.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0,
    `missing-period denial must leave ${table} unchanged`);
}
missingPeriod.db.close();

const concurrentMissingPeriod = fixture({ includePeriod: false });
const missingPeriodAttempts = await Promise.allSettled([
  postFulfilledSalesOrder(concurrentMissingPeriod.env, 'sale-a'),
  postFulfilledSalesOrder(concurrentMissingPeriod.env, 'sale-a'),
]);
assert.ok(missingPeriodAttempts.every((attempt) => attempt.status === 'rejected'),
  'concurrent same-month attempts must both fail closed when no authorized open period exists');
for (const table of ['fiscal_periods', 'journal_entries', 'journal_lines', 'finance_receivables', 'finance_source_postings', 'audit_logs']) {
  assert.equal(concurrentMissingPeriod.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0,
    `concurrent missing-period attempts must leave ${table} unchanged`);
}
concurrentMissingPeriod.db.close();

for (const status of ['soft_closed', 'closed']) {
  const unavailablePeriod = fixture({ periodStatus: status });
  await assert.rejects(postFulfilledSalesOrder(unavailablePeriod.env, 'sale-a'), new RegExp(`is ${status.replace('_', ' ')}`));
  assert.equal(unavailablePeriod.db.prepare('SELECT COUNT(*) AS count FROM fiscal_periods').get().count, 1);
  for (const table of ['journal_entries', 'journal_lines', 'finance_receivables', 'finance_source_postings', 'audit_logs']) {
    assert.equal(unavailablePeriod.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0,
      `${status} period must not create ${table}`);
  }
  unavailablePeriod.db.close();
}

const concurrent = fixture();
const concurrentResults = await Promise.all([
  postFulfilledSalesOrder(concurrent.env, 'sale-a'),
  postFulfilledSalesOrder(concurrent.env, 'sale-a'),
]);
assert.equal(concurrentResults.filter((item) => item.posted).length, 1);
assert.equal(concurrent.db.prepare('SELECT COUNT(*) AS count FROM journal_entries').get().count, 1);
assert.equal(concurrent.db.prepare('SELECT COUNT(*) AS count FROM audit_logs WHERE action=\'auto_post_sales_order\'').get().count, 1);
assert.equal(concurrent.db.prepare(`SELECT status FROM finance_source_postings WHERE source_id='sale-a'`).get().status, 'posted');
concurrent.db.close();

for (const [paymentStatus, amountPaidKobo] of [['paid', 0], ['paid', 12500], ['part_paid', 5000]]) {
  const unverified = fixture({ paymentStatus, amountPaidKobo });
  const result = await postFulfilledSalesOrder(unverified.env, 'sale-a');
  assert.equal(result.posted, true);
  assert.equal(result.paidKobo, 0, `${paymentStatus} flags and amounts are not cleared receipt evidence`);
  assert.equal(result.balanceKobo, 12500);
  assert.equal(unverified.db.prepare(`SELECT COUNT(*) AS count FROM journal_lines WHERE account_id='cash-a'`).get().count, 0);
  assert.equal(unverified.db.prepare(`SELECT debit_kobo FROM journal_lines WHERE account_id='ar-a'`).get().debit_kobo, 12500);
  assert.equal(unverified.db.prepare(`SELECT paid_kobo FROM finance_receivables WHERE source_id='sale-a'`).get().paid_kobo, 0);
  assert.equal(JSON.parse(unverified.db.prepare(`SELECT after_json FROM audit_logs WHERE action='auto_post_sales_order'`).get().after_json).paidKobo, 0);
  unverified.db.close();
}

for (const terminalStatus of ['posted', 'reversed']) {
  const terminal = fixture();
  terminal.db.prepare(`INSERT INTO finance_source_postings
    (id,company_id,source_module,source_type,source_id,posted_amount_kobo,cost_amount_kobo,status,error_text,posted_at)
    VALUES('source-a','company-a','sales','sales_order','sale-a',12500,0,?,NULL,CURRENT_TIMESTAMP)`)
    .run(terminalStatus);
  await recordFailure(terminal.env, 'sale-a', 'late failure from an older posting attempt');
  const row = terminal.db.prepare(`SELECT status,error_text FROM finance_source_postings WHERE id='source-a'`).get();
  assert.equal(row.status, terminalStatus, `${terminalStatus} posting must remain terminal`);
  assert.equal(row.error_text, null, `${terminalStatus} posting evidence must not be overwritten`);
  terminal.db.close();
}

const reversedSale = fixture();
reversedSale.db.prepare(`INSERT INTO finance_source_postings
  (id,company_id,source_module,source_type,source_id,posted_amount_kobo,cost_amount_kobo,status,error_text,posted_at)
  VALUES('source-reversed','company-a','sales','sales_order','sale-a',12500,0,'reversed',NULL,CURRENT_TIMESTAMP)`).run();
const reversedRetry = await postFulfilledSalesOrder(reversedSale.env, 'sale-a');
assert.deepEqual(reversedRetry, { posted: false, reason: 'already_reversed' });
assert.equal(reversedSale.db.prepare('SELECT COUNT(*) AS count FROM journal_entries').get().count, 0);
assert.equal(reversedSale.db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0);
assert.equal(reversedSale.db.prepare(`SELECT status FROM finance_source_postings WHERE id='source-reversed'`).get().status, 'reversed');
reversedSale.db.close();

for (const [label, mutate] of [
  ['sale cancellation', (db) => db.prepare(`UPDATE sales_orders SET status='cancelled' WHERE id='sale-a'`).run()],
  ['sale refund', (db) => db.prepare(`UPDATE sales_orders SET payment_status='refunded' WHERE id='sale-a'`).run()],
  ['fiscal period closure', (db) => db.prepare(`UPDATE fiscal_periods SET status='closed' WHERE id='period-a'`).run()],
  ['order total change', (db) => db.prepare(`UPDATE sales_orders SET total_kobo=13000 WHERE id='sale-a'`).run()],
  ['item cost change', (db) => db.prepare(`INSERT INTO sales_order_items(sales_order_id,quantity,unit_cost_kobo) VALUES('sale-a',1,2500)`).run()],
]) {
  const stale = fixture({ beforeBatch: mutate });
  const staleResult = await postFulfilledSalesOrder(stale.env, 'sale-a');
  assert.deepEqual(staleResult, { posted: false, reason: 'stale_eligibility' }, `${label} must be denied at the atomic claim boundary`);
  for (const table of ['journal_entries', 'journal_lines', 'finance_receivables', 'finance_source_postings', 'audit_logs']) {
    assert.equal(stale.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, `${label} must not create ${table}`);
  }
  stale.db.close();
}

console.log('PASS: sales posting requires an existing company open period; no period is created on missing/closed-period or audit-failure paths; audit rollback, payment truth, terminal state and single-winner assertions pass');
