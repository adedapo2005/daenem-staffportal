// Isolated SQLite acceptance for the real Bakery sales GL protection.
// No production or shared pre-production financial records are touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migration=fs.readFileSync(new URL(
 '../migrations/0120_bakery_sales_journal_cash_integrity.sql',import.meta.url
),'utf8');
const db=new DatabaseSync(':memory:');
db.exec(`
 CREATE TABLE finance_accounts(
  id TEXT PRIMARY KEY,company_id TEXT,code TEXT,name TEXT,
  account_type TEXT,active INTEGER DEFAULT 1);
 CREATE TABLE sales_orders(
  id TEXT PRIMARY KEY,company_id TEXT,status TEXT,payment_status TEXT,
  total_kobo INTEGER);
 CREATE TABLE journal_entries(
  id TEXT PRIMARY KEY,company_id TEXT,entry_no TEXT,entry_date TEXT,
  description TEXT,source_module TEXT,source_type TEXT,source_id TEXT,
  status TEXT);
 CREATE TABLE journal_lines(
  id TEXT PRIMARY KEY,journal_entry_id TEXT,account_id TEXT,
  debit_kobo INTEGER DEFAULT 0,credit_kobo INTEGER DEFAULT 0);
 INSERT INTO finance_accounts VALUES
  ('bakery-cash','company-bakery','1000','Cash & Bank','asset',1),
  ('bakery-ar','company-bakery','1100','Receivables','asset',1),
  ('bakery-inventory','company-bakery','1200','Inventory','asset',1),
  ('bakery-sales','company-bakery','4000','Revenue','revenue',1),
  ('bakery-cogs','company-bakery','5000','Cost of Sales','cost_of_sales',1),
  ('bakery-other-asset','company-bakery','1300','Other Asset','asset',1),
  ('printing-cash','company-printing','1000','Cash & Bank','asset',1);
 INSERT INTO sales_orders VALUES
  ('sale-real','company-bakery','completed','paid',10000),
  ('sale-refunded','company-bakery','completed','refunded',10000),
  ('sale-printing','company-printing','completed','paid',10000);
 -- Historical spoofed journals must not be deleted or silently rewritten.
 INSERT INTO journal_entries VALUES
  ('historical-spoof','company-bakery','QA-OLD','2026-10-25',
   'Synthetic pre-migration false cash','sales','sales_order',
   'sale-not-real','posted');
 INSERT INTO journal_lines VALUES
  ('historical-cash','historical-spoof','bakery-cash',10000,0),
  ('historical-revenue','historical-spoof','bakery-sales',0,10000);
`);
const counts=()=>db.prepare(`SELECT
 (SELECT COUNT(*) FROM journal_entries) AS journals,
 (SELECT COUNT(*) FROM journal_lines) AS lines`).get();
const baseline=counts();
db.exec(migration);
assert.deepEqual(counts(),baseline,'Historical financial records must remain untouched');
assert.equal(db.prepare('SELECT debit_kobo FROM journal_lines WHERE id=?').get(
 'historical-cash').debit_kobo,10000);
const entry=db.prepare(`INSERT INTO journal_entries(
 id,company_id,entry_no,entry_date,description,source_module,
 source_type,source_id,status) VALUES(
 ?,'company-bakery',?,'2026-10-25','Synthetic QA sales posting','sales',
 'sales_order',?,'posted')`);
assert.throws(()=>entry.run('fake-source','FAKE-SRC','sale-not-real'),
 /requires a completed company sale/);
assert.throws(()=>entry.run('refunded-source','REFUND-SRC','sale-refunded'),
 /requires a completed company sale/);
entry.run('real-posting','REAL-POSTING','sale-real');
const add=db.prepare(`INSERT INTO journal_lines VALUES(?,?,?,?,?)`);
add.run('ar-debit','real-posting','bakery-ar',10000,0);
add.run('sales-credit','real-posting','bakery-sales',0,10000);
add.run('cogs-debit','real-posting','bakery-cogs',4000,0);
add.run('inventory-credit','real-posting','bakery-inventory',0,4000);
assert.deepEqual({...db.prepare(`SELECT SUM(debit_kobo) AS dr,SUM(credit_kobo) AS cr
 FROM journal_lines WHERE journal_entry_id='real-posting'`).get()},
 {dr:14000,cr:14000},'Proper accrual and cost postings remain possible');

const illegal=[
 ['cash debit',()=>add.run('cash-forged','real-posting','bakery-cash',10000,0)],
 ['cash credit',()=>add.run('cash-reverse','real-posting','bakery-cash',0,10000)],
 ['other asset',()=>add.run('other-asset','real-posting','bakery-other-asset',10000,0)],
 ['cross-company account',()=>add.run('cross-company','real-posting','printing-cash',10000,0)],
 ['revenue wrong-side debit',()=>add.run('wrong-revenue','real-posting','bakery-sales',10000,0)],
 ['receivable wrong-side credit',()=>add.run('wrong-ar','real-posting','bakery-ar',0,10000)],
 ['inventory wrong-side debit',()=>add.run('wrong-stock','real-posting','bakery-inventory',10000,0)]
];
for(const [name,action] of illegal)
 assert.throws(action,/cannot post cash or unapproved accounts/,name);
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM journal_lines
 WHERE journal_entry_id='real-posting'`).get().n,4);
assert.throws(()=>db.prepare("UPDATE journal_lines SET account_id='bakery-cash' WHERE id='ar-debit'").run(),
 /journal lines are immutable/);
assert.throws(()=>db.prepare("DELETE FROM journal_lines WHERE id='sales-credit'").run(),
 /journal lines cannot be deleted/);
assert.throws(()=>db.prepare("UPDATE journal_entries SET source_module='manual' WHERE id='real-posting'").run(),
 /sales journal is immutable/);
assert.throws(()=>db.prepare("UPDATE journal_entries SET status='reversed' WHERE id='real-posting'").run(),
 /sales journal is immutable/);
assert.throws(()=>db.prepare("DELETE FROM journal_entries WHERE id='real-posting'").run(),
 /sales journal cannot be deleted/);
assert.throws(()=>db.prepare("UPDATE finance_accounts SET code='1000' WHERE id='bakery-ar'").run(),
 /account classification is immutable/);
assert.throws(()=>db.prepare("UPDATE finance_accounts SET company_id='company-printing' WHERE id='bakery-sales'").run(),
 /account classification is immutable/);
assert.equal(db.prepare("SELECT code FROM finance_accounts WHERE id='bakery-ar'").get().code,'1100');

// Other companies and manual Finance journals are outside this Bakery-specific
// automatic sales guard; this does NOT constitute independent settlement proof.
db.prepare(`INSERT INTO journal_entries VALUES(
 'printing-post','company-printing','P-1','2026-10-25','Other-company QA',
 'sales','sales_order','sale-printing','posted')`).run();
add.run('printing-cash-line','printing-post','printing-cash',10000,0);
db.prepare(`INSERT INTO journal_entries VALUES(
 'manual-bakery','company-bakery','M-1','2026-10-25','Manual Finance QA',
 'manual','adjustment',NULL,'posted')`).run();
add.run('bakery-manual-cash','manual-bakery','bakery-cash',10000,0);
assert.deepEqual({...counts()},{journals:4,lines:8});
db.close();
console.log('PASS Bakery automatic sales GL: no false cash, cross-company or wrong-side posting');
console.log('PASS real accrual Dr AR/Cr Revenue + Dr COGS/Cr Inventory and immutable lines');
console.log('PASS historical journals preserved, manual Finance and other companies unaffected');
