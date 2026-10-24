import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=OFF')
db.executescript("""
CREATE TABLE customers(id TEXT);
CREATE TABLE bakery_bread_ledger(id TEXT,company_id TEXT,dispatch_id TEXT,product_id TEXT,status TEXT,quantity REAL);
CREATE TABLE bakery_dispatch_items(dispatch_id TEXT,product_id TEXT,quantity REAL);
CREATE TABLE bakery_money_ledger(company_id TEXT,dispatch_id TEXT,status TEXT,reference TEXT);
""")
db.executescript((root/'migrations/0103_bakery_agent_sale_price_integrity.sql').read_text())
db.execute("INSERT INTO bakery_dispatch_items VALUES('dispatch-1','700g',10)")
def rejected(sql,params=()):
 try: db.execute(sql,params)
 except sqlite3.IntegrityError: return
 raise AssertionError('Expected rejection: '+sql)
rejected("INSERT INTO bakery_bread_ledger(id,company_id,dispatch_id,product_id,status,quantity) VALUES('a','company-bakery','dispatch-1','700g','sold',1)")
db.execute("INSERT INTO bakery_bread_ledger(id,company_id,dispatch_id,product_id,status,quantity,buyer_type,unit_price_kobo) VALUES('b','company-bakery','dispatch-1','700g','sold',9,'individual',110000)")
rejected("INSERT INTO bakery_bread_ledger(id,company_id,dispatch_id,product_id,status,quantity) VALUES('c','company-bakery','dispatch-1','700g','returned',2)")
db.execute("INSERT INTO bakery_bread_ledger(id,company_id,dispatch_id,product_id,status,quantity) VALUES('d','company-bakery','dispatch-1','700g','returned',1)")
db.execute("INSERT INTO bakery_money_ledger VALUES('company-bakery','dispatch-1','cash_received','receipt-1')")
rejected("INSERT INTO bakery_money_ledger VALUES('company-bakery','dispatch-1','cash_received','receipt-1')")
print('PASS: agent sale price, bread quantity, duplicate remittance receipt (SQLite)')
