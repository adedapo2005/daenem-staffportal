import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / "worker" / "bakery.ts").read_text(encoding="utf-8")
sql = (root / "migrations" / "0102_bakery_financial_integrity.sql").read_text(encoding="utf-8")

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE stock_movements(company_id TEXT,reference_id TEXT,item_id TEXT,reference_type TEXT,movement_type TEXT);
CREATE TABLE stock_balances(company_id TEXT,quantity REAL,reserved_quantity REAL);
""")
db.executescript(sql)
db.execute("INSERT INTO stock_movements VALUES('company-bakery','batch-1','700g','bakery_batch','adjustment_in')")
try:
    db.execute("INSERT INTO stock_movements VALUES('company-bakery','batch-1','700g','bakery_batch','adjustment_in')")
    raise AssertionError("duplicate production inventory posting was accepted")
except sqlite3.IntegrityError:
    pass
db.execute("INSERT INTO stock_movements VALUES('company-bakery','batch-2','700g','bakery_batch','adjustment_in')")
db.execute("INSERT INTO stock_balances VALUES('company-bakery',10,3)")
for newqty in [-1,2]:
    try:
        db.execute("UPDATE stock_balances SET quantity=? WHERE company_id='company-bakery'",(newqty,))
        raise AssertionError("invalid Bakery stock change accepted")
    except sqlite3.IntegrityError:
        pass
db.execute("UPDATE stock_balances SET quantity=3 WHERE company_id='company-bakery'")
assert db.execute("SELECT quantity FROM stock_balances").fetchone()[0] == 3
for token in [
    "This production batch is already completed",
    "Production must reach packaging",
    "Number.isSafeInteger(actualYield)",
    "Number.isSafeInteger(qty)",
    "Duplicate bread product" if "Duplicate bread product" in source else "Combine duplicate product lines",
    "Price overrides require an approved",
    "Non-cash payments require provider-confirmed",
    "Active Bakery customer not found",
    "quantity-reserved_quantity>=?"
]:
    assert token in source, token
print("PASS Bakery integrity: unique batch receipts, reserved-stock trigger, and source guards")
