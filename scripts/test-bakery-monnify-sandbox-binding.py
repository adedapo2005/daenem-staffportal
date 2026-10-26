"""Isolated SQLite test: no provider calls and no real financial writes."""
import sqlite3
from pathlib import Path
db=sqlite3.connect(':memory:')
db.executescript("""
PRAGMA foreign_keys=ON;
CREATE TABLE employees(id TEXT PRIMARY KEY);
CREATE TABLE sales_orders(id TEXT PRIMARY KEY,company_id TEXT,status TEXT,payment_status TEXT,total_kobo INTEGER,amount_paid_kobo INTEGER DEFAULT 0);
CREATE TABLE finance_receivables(id TEXT PRIMARY KEY,company_id TEXT,source_module TEXT,source_id TEXT,status TEXT,amount_kobo INTEGER,paid_kobo INTEGER,balance_kobo INTEGER);
INSERT INTO employees VALUES('reviewer');
INSERT INTO sales_orders VALUES
('good','company-bakery','completed','unpaid',10000),
('draft','company-bakery','draft','unpaid',10000),
('refunded','company-bakery','completed','refunded',10000),
('foreign','company-printing','completed','unpaid',10000),
('cash-paid','company-bakery','completed','paid',10000,10000);
INSERT INTO finance_receivables VALUES
('ar-good','company-bakery','sales','good','open',10000,0,10000),
('ar-draft','company-bakery','sales','draft','open',10000,0,10000),
('ar-refunded','company-bakery','sales','refunded','open',10000,0,10000),
('ar-foreign','company-printing','sales','foreign','open',10000,0,10000),
('ar-manual','company-bakery','manual','good','open',10000,0,10000),
('ar-cash','company-bakery','sales','cash-paid','open',10000,0,10000),
('ar-paid','company-bakery','sales','good','paid',10000,10000,0),
('ar-partial','company-bakery','sales','good','open',10000,500,9500);
""")
baseline=db.execute("SELECT * FROM finance_receivables ORDER BY id").fetchall()
db.executescript((Path(__file__).resolve().parents[1]/"migrations/0122_bakery_monnify_sandbox_intent_binding.sql").read_text())
def deny(sql,args=()):
 try: db.execute(sql,args)
 except sqlite3.IntegrityError: return
 raise AssertionError("Unverified write accepted: "+sql)
create="""INSERT INTO bakery_monnify_sandbox_intents
(id,company_id,receivable_id,payment_reference,expected_amount_kobo,currency,provider_environment,status,created_by)
VALUES(?,?,?,?,?,'NGN','sandbox','reserved','reviewer')"""
for name in ['ar-draft','ar-refunded','ar-foreign','ar-manual','ar-cash','ar-paid','ar-partial','missing']:
 deny(create,('x-'+name,'company-bakery',name,'QA-REFERENCE-'+name,10000))
deny(create,('cross','company-printing','ar-good','QA-REFERENCE-CROSS',10000))
deny(create,('bad-money','company-bakery','ar-good','QA-REFERENCE-MONEY',9000))
db.execute(create,('intent','company-bakery','ar-good','QA-REFERENCE-VALID',10000))
deny(create,('duplicate','company-bakery','ar-good','QA-REFERENCE-DUP',10000))
deny("UPDATE bakery_monnify_sandbox_intents SET expected_amount_kobo=1")
deny("UPDATE bakery_monnify_sandbox_intents SET payment_reference='new'")
deny("UPDATE bakery_monnify_sandbox_intents SET status='initialized'")
db.execute("""UPDATE bakery_monnify_sandbox_intents
SET status='initialized',provider_transaction_reference='MNFY|QA|1',
checkout_url='https://sandbox.monnify.com/checkout/qa',initialized_at=CURRENT_TIMESTAMP
WHERE id='intent'""")
deny("UPDATE bakery_monnify_sandbox_intents SET status='review_required'")
deny("UPDATE sales_orders SET amount_paid_kobo=10000,payment_status='paid' WHERE id='good'")
deny("DELETE FROM bakery_monnify_sandbox_intents")
db.execute("""INSERT INTO bakery_monnify_collection_inquiries
(id,intent_id,company_id,collection_state,provider_status,amount_paid_kobo)
VALUES('inquiry','intent','company-bakery','provider_paid_not_settled','PAID',10000)""")
deny("""INSERT INTO bakery_monnify_collection_inquiries
(id,intent_id,company_id,collection_state,bank_settlement_confirmed)
VALUES('forged','intent','company-bakery','provider_paid_not_settled',1)""")
deny("""INSERT INTO bakery_monnify_collection_inquiries
(id,intent_id,company_id,collection_state,finance_receivable_updated)
VALUES('forged2','intent','company-bakery','provider_paid_not_settled',1)""")
deny("UPDATE bakery_monnify_collection_inquiries SET collection_state='not_paid'")
deny("DELETE FROM bakery_monnify_collection_inquiries")
assert db.execute("SELECT * FROM finance_receivables ORDER BY id").fetchall()==baseline
assert db.execute("SELECT bank_settlement_confirmed,finance_receivable_updated FROM bakery_monnify_collection_inquiries").fetchone()==(0,0)
print("PASS sandbox binding: genuine unpaid completed Bakery A/R only, immutable reference, duplicate denial")
print("PASS append-only inquiry, no bank settlement, no Finance payment, zero historical rewrites")
