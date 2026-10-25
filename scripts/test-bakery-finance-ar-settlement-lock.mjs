// Financial safety: real migration 0119 in isolated SQLite, never Cloudflare
// shared D1. This does NOT certify a bank/provider-verified settlement path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migration=fs.readFileSync(new URL(
 '../migrations/0119_bakery_finance_unverified_settlement_guard.sql',import.meta.url
),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE companies(id TEXT PRIMARY KEY);
 INSERT INTO companies VALUES('company-bakery'),('company-printing');
 CREATE TABLE employees(id TEXT PRIMARY KEY);
 INSERT INTO employees VALUES('qa-finance-employee');
 CREATE TABLE finance_receivables (
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),
  customer_name TEXT NOT NULL,source_module TEXT,source_id TEXT,
  invoice_date TEXT NOT NULL,amount_kobo INTEGER NOT NULL CHECK(amount_kobo>=0),
  paid_kobo INTEGER NOT NULL DEFAULT 0 CHECK(paid_kobo>=0),
  balance_kobo INTEGER NOT NULL CHECK(balance_kobo>=0),
  status TEXT NOT NULL CHECK(status IN
   ('open','part_paid','paid','overdue','written_off','cancelled')),
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
 );
 CREATE TABLE finance_receivable_payments(
  id TEXT PRIMARY KEY,receivable_id TEXT NOT NULL REFERENCES finance_receivables(id),
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo>0),
  payment_method TEXT NOT NULL,reference TEXT,
  paid_at TEXT DEFAULT CURRENT_TIMESTAMP,
  recorded_by TEXT REFERENCES employees(id)
 );
 INSERT INTO finance_receivables(id,company_id,customer_name,source_module,
 source_id,invoice_date,amount_kobo,paid_kobo,balance_kobo,status)
 VALUES('historical-bakery','company-bakery','Legacy QA','sales',
 'legacy-sale','2026-10-25',10000,2000,8000,'part_paid');
 INSERT INTO finance_receivable_payments(id,receivable_id,amount_kobo,payment_method,reference)
 VALUES('historical-pay','historical-bakery',2000,'bank_transfer','LEGACY-UNVERIFIED-QA');
`);
const paymentCount=()=>db.prepare(
 'SELECT COUNT(*) AS count FROM finance_receivable_payments').get().count;
const read=id=>db.prepare(`SELECT company_id,source_module,source_id,amount_kobo,
 paid_kobo,balance_kobo,status FROM finance_receivables WHERE id=?`).get(id);
const legacy=read('historical-bakery'),initialPayments=paymentCount();
db.exec(migration);
assert.deepEqual(read('historical-bakery'),legacy,
 'Migration must preserve historically recorded A/R states');
assert.equal(paymentCount(),initialPayments,
 'Migration must leave historically recorded payment evidence unchanged');

const newSale=db.prepare(`INSERT INTO finance_receivables
 (id,company_id,customer_name,source_module,source_id,invoice_date,
  amount_kobo,paid_kobo,balance_kobo,status)
 VALUES(?,'company-bakery','Synthetic QA','sales',?,'2026-10-25',10000,?,?,?)`);
newSale.run('new-bakery-sale','qa-sale-0119',0,10000,'open');
const newPayment=db.prepare(`INSERT INTO finance_receivable_payments
 (id,receivable_id,amount_kobo,payment_method,reference)
 VALUES(?,?,10000,'bank_transfer','UNVERIFIED-QA')`);
assert.throws(()=>newPayment.run('forged-payment','new-bakery-sale'),
 /payment requires independent verified settlement/,
 'A direct D1 writer must not manufacture cleared Bakery sale payment evidence');
assert.throws(()=>db.prepare(`UPDATE finance_receivables
 SET paid_kobo=10000,balance_kobo=0,status='paid'
 WHERE id='new-bakery-sale'`).run(),
 /cannot be altered without verified Finance settlement/,
 'Direct SQL may not mark the sale fully paid');
assert.throws(()=>db.prepare(`UPDATE finance_receivables
 SET balance_kobo=9999,status='part_paid' WHERE id='new-bakery-sale'`).run(),
 /cannot be altered without verified Finance settlement/,
 'Direct SQL may not reduce receivable balance without proof');
assert.throws(()=>db.prepare(`UPDATE finance_receivables
 SET amount_kobo=1 WHERE id='new-bakery-sale'`).run(),
 /cannot be altered without verified Finance settlement/,
 'Original Bakery receivable amount must be protected');
assert.throws(()=>db.prepare(`UPDATE finance_receivables
 SET company_id='company-printing' WHERE id='new-bakery-sale'`).run(),
 /cannot be altered without verified Finance settlement/,
 'Existing Bakery receivable cannot be moved to another company');
assert.throws(()=>db.prepare(`UPDATE finance_receivables
 SET source_module='manual' WHERE id='new-bakery-sale'`).run(),
 /cannot be altered without verified Finance settlement/,
 'Reclassifying Bakery sales A/R must not bypass verification');
assert.throws(()=>db.prepare(`UPDATE finance_receivables
 SET source_id='forged-source' WHERE id='new-bakery-sale'`).run(),
 /cannot be altered without verified Finance settlement/);
assert.throws(()=>db.prepare(`DELETE FROM finance_receivables
 WHERE id='new-bakery-sale'`).run(),
 /cannot be deleted without governed reversal/);
assert.throws(()=>newSale.run('forged-paid-sale','fake-paid',10000,0,'paid'),
 /must begin fully open/);
assert.throws(()=>newSale.run('forged-part-sale','fake-part',1000,9000,'part_paid'),
 /must begin fully open/);
assert.throws(()=>newSale.run('orphan-source','',0,10000,'open'),
 /must begin fully open/);
assert.equal(read('new-bakery-sale').balance_kobo,10000,
 'Failed attacks cannot change recorded receivables');
assert.equal(paymentCount(),initialPayments,
 'Failed attacks cannot fabricate payment records');

// Payment evidence written before 0119 must remain inspectable but cannot be
// rewritten or deleted as if it had verified bank/provider settlement.
assert.throws(()=>db.prepare(`UPDATE finance_receivable_payments
 SET amount_kobo=10000 WHERE id='historical-pay'`).run(),
 /historical receivable payment evidence is immutable/);
assert.throws(()=>db.prepare(`DELETE FROM finance_receivable_payments
 WHERE id='historical-pay'`).run(),
 /historical receivable payment evidence cannot be deleted/);
assert.throws(()=>db.prepare(`UPDATE finance_receivables
 SET balance_kobo=0,status='paid' WHERE id='historical-bakery'`).run(),
 /cannot be altered without verified Finance settlement/);
assert.deepEqual(read('historical-bakery'),legacy);
assert.equal(paymentCount(),initialPayments);

// Ageing state is not evidence of payment and can still be adjusted.
db.prepare(`UPDATE finance_receivables SET status='overdue'
 WHERE id='new-bakery-sale'`).run();
assert.equal(read('new-bakery-sale').status,'overdue');
assert.equal(read('new-bakery-sale').balance_kobo,10000);

// Other companies' Finance receivables and unsourced manual Bakery Finance
// records are outside this Bakery SALES-only migration. This does not assert
// those payment pathways are bank-verified or ready for production.
const addOther=db.prepare(`INSERT INTO finance_receivables
 (id,company_id,customer_name,source_module,source_id,invoice_date,
  amount_kobo,paid_kobo,balance_kobo,status)
 VALUES(?,?,'Unrelated QA',?,?,'2026-10-25',10000,0,10000,'open')`);
addOther.run('printing-ar','company-printing','sales','printing-source');
addOther.run('manual-bakery-ar','company-bakery','manual','manual-source');
newPayment.run('printing-payment','printing-ar');
newPayment.run('manual-bakery-payment','manual-bakery-ar');
assert.equal(paymentCount(),initialPayments+2);
assert.throws(()=>db.prepare(`UPDATE finance_receivables SET company_id='company-bakery'
 WHERE id='printing-ar'`).run(),
 /source and company cannot be reassigned/,
 'Other-company sale cannot be relabeled as a Bakery sale');
assert.throws(()=>db.prepare(`UPDATE finance_receivables SET source_module='sales'
 WHERE id='manual-bakery-ar'`).run(),
 /source and company cannot be reassigned/,
 'Manual receivable cannot be relabeled as Bakery sales A/R');

db.close();
console.log('PASS Bakery Finance D1: direct forged payments, paid A/R, balance cuts, writeoff and deletes blocked');
console.log('PASS historical data unchanged, immutable prior evidence, overdue safe and other companies scoped out');
console.log('NOTE bank-verified Finance settlement is not implemented; no successful Bakery sales A/R clearing is permitted');
