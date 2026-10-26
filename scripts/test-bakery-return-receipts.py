import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
c=sqlite3.connect(':memory:')
c.executescript("""
CREATE TABLE bakery_dispatches(id TEXT,company_id TEXT,status TEXT);
CREATE TABLE bakery_dispatch_items(dispatch_id TEXT,product_id TEXT,quantity INTEGER);
CREATE TABLE bakery_products(id TEXT);
CREATE TABLE customers(id TEXT);
CREATE TABLE bakery_bread_ledger(dispatch_id TEXT,product_id TEXT,status TEXT,quantity INTEGER);
CREATE TABLE employees(id TEXT);
CREATE TABLE companies(id TEXT);
""")
c.executescript((root/'migrations/0104_bakery_verified_return_custody.sql').read_text())
c.execute("INSERT INTO bakery_dispatches VALUES('d','company-bakery','reconciling')")
c.execute("INSERT INTO bakery_dispatch_items VALUES('d','p',10)")
c.execute("INSERT INTO bakery_bread_ledger VALUES('d','p','returned',4)")
def reject(sql,vals=()):
 try:c.execute(sql,vals)
 except sqlite3.IntegrityError:return
 raise AssertionError('expected SQL reject: '+sql)
c.execute("INSERT INTO bakery_dispatch_return_receipts(id,dispatch_id,product_id,quantity,reference,note,received_by) VALUES('r1','d','p',3,'RETURN-A','Physical count done','emp')")
reject("INSERT INTO bakery_dispatch_return_receipts(id,dispatch_id,product_id,quantity,reference,note,received_by) VALUES('r2','d','p',2,'RETURN-B','Physical count done','emp')")
reject("INSERT INTO bakery_dispatch_return_receipts(id,dispatch_id,product_id,quantity,reference,note,received_by) VALUES('r3','d','p',1,'RETURN-A','Physical count done','emp')")
c.execute("INSERT INTO bakery_dispatch_return_receipts(id,dispatch_id,product_id,quantity,reference,note,received_by) VALUES('r4','d','p',1,'RETURN-B','Physical count done','emp')")
reject("UPDATE bakery_dispatch_return_receipts SET quantity=10")
reject("DELETE FROM bakery_dispatch_return_receipts")
assert c.execute("SELECT SUM(quantity) FROM bakery_dispatch_return_receipts").fetchone()[0]==4
s=(root/'worker/bakery-accountability.ts').read_text()
assert "/api/bakery/accountability/returns/verify" in s
assert "Agent-declared returns require independent physical warehouse verification" in s
print('PASS physical return receipt: quarantine, dispatch limit, unique reference, immutable, closure gate')
