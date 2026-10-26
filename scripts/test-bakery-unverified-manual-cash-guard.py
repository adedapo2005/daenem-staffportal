"""Isolated SQLite acceptance for Bakery manual GL cash fail-closed guard."""
import sqlite3
from pathlib import Path

db=sqlite3.connect(":memory:")
db.executescript("""
PRAGMA foreign_keys=ON;
CREATE TABLE finance_accounts(id TEXT PRIMARY KEY,company_id TEXT,code TEXT,account_type TEXT);
CREATE TABLE journal_entries(id TEXT PRIMARY KEY,company_id TEXT,status TEXT,source_module TEXT);
CREATE TABLE journal_lines(id TEXT PRIMARY KEY,journal_entry_id TEXT REFERENCES journal_entries(id),
 account_id TEXT REFERENCES finance_accounts(id),debit_kobo INTEGER,credit_kobo INTEGER);
INSERT INTO finance_accounts VALUES
 ('bc','company-bakery','1000','asset'),
 ('ba','company-bakery','1300','asset'),
 ('br','company-bakery','4000','revenue'),
 ('pc','company-printing','1000','asset');
INSERT INTO journal_entries VALUES
 ('historical','company-bakery','posted','manual'),
 ('draft','company-bakery','draft','manual'),
 ('posted','company-bakery','posted','manual'),
 ('printing','company-printing','posted','manual');
INSERT INTO journal_lines VALUES
 ('historical-cash','historical','bc',10000,0),
 ('historical-revenue','historical','br',0,10000);
""")
before=db.execute("SELECT * FROM journal_lines WHERE journal_entry_id='historical'").fetchall()
db.executescript(Path(__file__).resolve().parents[1].joinpath(
 "migrations/0121_bakery_unverified_manual_cash_guard.sql").read_text())
assert db.execute("SELECT * FROM journal_lines WHERE journal_entry_id='historical'").fetchall()==before

def deny(sql,msg):
 try: db.execute(sql)
 except sqlite3.IntegrityError as e:
  assert msg in str(e),(sql,str(e))
 else: raise AssertionError("UNVERIFIED FINANCIAL WRITE WAS ACCEPTED: "+sql)

reason="requires independently verified settlement"
deny("INSERT INTO journal_lines VALUES('fraud','posted','bc',10000,0)",reason)
db.execute("INSERT INTO journal_lines VALUES('draft-cash','draft','bc',10000,0)")
db.execute("INSERT INTO journal_lines VALUES('draft-revenue','draft','br',0,10000)")
deny("UPDATE journal_entries SET status='posted' WHERE id='draft'",reason)
assert db.execute("SELECT status FROM journal_entries WHERE id='draft'").fetchone()[0]=="draft"

# A posted generic asset debit cannot be relabeled to Cash & Bank.
db.execute("INSERT INTO journal_lines VALUES('asset-debit','posted','ba',10000,0)")
deny("UPDATE journal_lines SET account_id='bc' WHERE id='asset-debit'",reason)
deny("UPDATE finance_accounts SET code='1000' WHERE id='ba'",
 "posted cash account classification")
deny("UPDATE journal_lines SET account_id='pc' WHERE id='asset-debit'",
 "different company account")
deny("INSERT INTO journal_lines VALUES('foreign','posted','pc',10000,0)",
 "different company account")
deny("UPDATE journal_entries SET company_id='company-printing' WHERE id='historical'",
 "historical posted cash journal")
deny("DELETE FROM journal_entries WHERE id='historical'",
 "historical posted cash journal")
deny("DELETE FROM journal_lines WHERE id='historical-cash'",
 "historical posted cash evidence")
deny("UPDATE journal_lines SET debit_kobo=20000 WHERE id='historical-cash'",
 "historical posted cash evidence")
deny("UPDATE finance_accounts SET code='1301' WHERE id='bc'",
 "posted cash account classification")

# Legitimate non-cash adjustments are not misclassified as settlement.
db.execute("INSERT INTO journal_lines VALUES('revenue-debit','posted','br',500,0)")
db.execute("INSERT INTO journal_lines VALUES('cash-decrease','posted','bc',0,500)")
db.execute("INSERT INTO journal_lines VALUES('printing-cash','printing','pc',10000,0)")
assert db.execute("SELECT COUNT(*) FROM journal_lines").fetchone()[0]==8
print("PASS Bakery posted cash increases blocked via direct SQL, draft posting and account relabeling")
print("PASS cross-company account rejection, historic evidence preservation, no unrelated-company impact")
print("NOTE no independently verified settlement or live D1 acceptance is claimed")
