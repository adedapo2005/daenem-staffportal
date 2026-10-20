"""Isolated SQLite acceptance for StaffPortal external identity migration.

Runs in memory. Never connects to Cloudflare D1 or production.
"""
from pathlib import Path
import sqlite3

conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys=ON")
conn.executescript("""
CREATE TABLE employees(id TEXT PRIMARY KEY, employment_status TEXT NOT NULL);
INSERT INTO employees VALUES ('employee-a','active'), ('employee-b','active');
""")
sql = (Path(__file__).resolve().parent.parent / "migrations" /
       "0101_staffportal_external_identity_links.sql").read_text("utf-8")
conn.executescript(sql)
tenant_a = "c1a11f0c-84ed-454e-b1a2-197025d85dc1"
tenant_b = "6f01e327-b29e-47c1-bd62-cfbf5f1f9a17"
oid = "77df1b05-6895-4ba6-aeb5-152934a6ad20"
conn.execute("INSERT INTO staffportal_external_identity_links "
             "(id,provider,tenant_id,object_id,employee_id,linked_by_employee_id) "
             "VALUES (?,?,?,?,?,?)", ('link-a','microsoft',tenant_a,oid,'employee-a','employee-a'))
tests = 1
for name, values in (
    ('prevent identity reuse across employees', ('link-b','microsoft',tenant_a,oid,'employee-b','employee-b')),
    ('prevent an employee linking to two identities', ('link-c','microsoft',tenant_b,oid,'employee-a','employee-a')),
    ('prevent links to unknown employees', ('link-d','microsoft',tenant_b,oid,'missing','employee-a')),
    ('reject invalid OAuth provider', ('link-e','google',tenant_b,oid,'employee-b','employee-b')),
):
    try:
        conn.execute("INSERT INTO staffportal_external_identity_links "
                     "(id,provider,tenant_id,object_id,employee_id,linked_by_employee_id) "
                     "VALUES (?,?,?,?,?,?)", values)
        raise AssertionError(name + " unexpectedly succeeded")
    except sqlite3.IntegrityError:
        print("PASS:", name)
        tests += 1
conn.execute("UPDATE staffportal_external_identity_links SET revoked_at=CURRENT_TIMESTAMP WHERE id='link-a'")
assert conn.execute("SELECT COUNT(*) FROM staffportal_external_identity_links WHERE revoked_at IS NOT NULL").fetchone()[0] == 1
tests += 1
print("PASS: revocation retains history")
print("Microsoft identity-link migration acceptance passed:", tests, "checks")
