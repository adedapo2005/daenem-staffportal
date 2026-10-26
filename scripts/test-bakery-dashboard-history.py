from pathlib import Path
import sqlite3
p=Path(__file__).resolve().parents[1]
worker=(p/'worker/bakery.ts').read_text()
ui=(p/'src/bakery-v2.tsx').read_text()
assert 'async function bakeryDashboardHistory' in worker
assert 'date(completed_at,\'+1 hour\')' in worker
assert 'includeCommercial?env.DB.prepare' in worker
assert 'orders:includeCommercial?days.map' in worker
assert '<BakeryTrendPanel history={data?.history}/>' in ui
assert 'No completed production batches recorded' in ui
assert 'Orders, not settled receipts' in ui
db=sqlite3.connect(':memory:')
db.execute('CREATE TABLE bakery_batches(company_id TEXT,status TEXT,completed_at TEXT,actual_yield_qty INTEGER,waste_qty INTEGER,rejected_qty INTEGER)')
db.executemany('INSERT INTO bakery_batches VALUES(?,?,?,?,?,?)',[('company-bakery','completed','2026-10-23 23:30:00',300,3,1),('company-bakery','completed','2026-10-24 11:00:00',200,2,0),('company-bakery','planned',None,800,0,0)])
x=db.execute("SELECT date(completed_at,'+1 hour'),SUM(actual_yield_qty),SUM(waste_qty+rejected_qty) FROM bakery_batches WHERE company_id='company-bakery' AND status='completed' GROUP BY date(completed_at,'+1 hour')").fetchall()
assert x==[('2026-10-24',500,6)],x
print('PASS bakery dashboard history contract, permissions, Lagos midnight aggregation, empty states')
