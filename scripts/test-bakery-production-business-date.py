import sqlite3
from pathlib import Path
s=(Path(__file__).resolve().parents[1]/'worker/bakery.ts').read_text()
assert "status NOT IN ('completed','cancelled') THEN 1" in s
assert "date(completed_at,'+1 hour')=?" in s
db=sqlite3.connect(':memory:')
db.execute("CREATE TABLE bakery_batches(company_id TEXT,status TEXT,created_at TEXT,completed_at TEXT,actual_yield_qty INTEGER,waste_qty INTEGER,rejected_qty INTEGER)")
db.executemany("INSERT INTO bakery_batches VALUES(?,?,?,?,?,?,?)",[
('company-bakery','completed','2026-10-23 09:00:00','2026-10-24 00:10:00',300,3,1),
('company-bakery','completed','2026-10-23 22:00:00','2026-10-23 22:40:00',200,2,0),
('company-bakery','mixing','2026-10-24 06:00:00',None,0,0,0)])
result=db.execute("SELECT SUM(CASE WHEN status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END), SUM(CASE WHEN status='completed' AND date(completed_at,'+1 hour')=? THEN actual_yield_qty ELSE 0 END) FROM bakery_batches WHERE company_id=?",('2026-10-24','company-bakery')).fetchone()
assert result==(1,300),result
print('PASS overnight batch is attributed to Lagos completion date and active batches are current-state')
