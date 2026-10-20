"""D1-aligned, isolated Microsoft identity-link transaction acceptance.

Uses EXACT INSERT/audit SQL exported in worker/microsoft-organizations.ts,
SQLite transactions and independent file-backed database connections.
With a local schema-only staging export present, uses the actual D1 schema.
Never connects to Cloudflare and never imports real employee/business data.
"""
import ast
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import threading
import uuid

ROOT=Path(__file__).resolve().parent.parent
GUID_A="c1a11f0c-84ed-454e-b1a2-197025d85dc1"
GUID_B="6f01e327-b29e-47c1-bd62-cfbf5f1f9a17"
OBJECT_A="77df1b05-6895-4ba6-aeb5-152934a6ad20"
OBJECT_B="2f644273-6e31-493f-964e-c67f33c1ce71"
PASSED=0

def verify(label,condition):
    global PASSED
    if not condition: raise AssertionError(label)
    PASSED+=1
    print("PASS:",label)

def exact_sql(name):
    source=(ROOT/"worker/microsoft-organizations.ts").read_text("utf-8")
    marker="export const "+name+" = ["
    start=source.index(marker)+len(marker)
    end=source.index("].join('\\n');",start)
    lines=[]
    for line in source[start:end].splitlines():
        line=line.strip().rstrip(",")
        if line: lines.append(ast.literal_eval(line))
    result="\n".join(lines)
    if not result.startswith("INSERT "): raise AssertionError("bad SQL "+name)
    return result

INSERT=exact_sql("microsoftLinkInsertSql")
AUDIT=exact_sql("microsoftLinkAuditSql")

FIXTURE_SCHEMA="""
CREATE TABLE companies(id TEXT PRIMARY KEY,code TEXT NOT NULL,name TEXT NOT NULL,
  business_type TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE employees(id TEXT PRIMARY KEY,display_name TEXT NOT NULL,
  employment_status TEXT NOT NULL);
CREATE TABLE employee_company_memberships(id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  company_id TEXT NOT NULL REFERENCES companies(id),active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(employee_id,company_id));
CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT NOT NULL,
  revoked_at TEXT);
CREATE TABLE security_logs(id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id),
  company_id TEXT REFERENCES companies(id),
  session_id TEXT REFERENCES auth_sessions(id),
  event_type TEXT NOT NULL,severity TEXT NOT NULL,result TEXT NOT NULL,
  ip_address TEXT,user_agent TEXT,details_json TEXT);
"""

def connect(path):
    c=sqlite3.connect(path,timeout=12,check_same_thread=False)
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA busy_timeout=12000")
    return c

def create_db(path):
    conn=connect(path)
    staging=ROOT/"qa-staging-schema-only.sql"
    schema=staging.read_text("utf-8") if staging.exists() and os.getenv("STAFFPORTAL_QA_FIXTURE_ONLY") != "1" else FIXTURE_SCHEMA
    conn.executescript(schema)
    conn.executescript((ROOT/"migrations/0101_staffportal_external_identity_links.sql").read_text("utf-8"))
    conn.execute("INSERT INTO companies(id,code,name,business_type) VALUES('company-a','QA-A','Synthetic Test Company','test')")
    for i in (1,2):
        conn.execute("INSERT INTO employees(id,display_name,employment_status) VALUES(?,?,?)",
                     ("employee-"+str(i),"Synthetic Employee "+str(i),"active"))
        conn.execute("INSERT INTO employee_company_memberships(id,employee_id,company_id) VALUES(?,?,?)",
                     ("membership-"+str(i),"employee-"+str(i),"company-a"))
        conn.execute("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) "
                     "VALUES(?,?,?,datetime('now','+1 hour'))",
                     ("session-"+str(i),"employee-"+str(i),"test-hash-"+str(i)))
    conn.commit()
    verify("D1 schema-only snapshot and additive migration load without real data",
           conn.execute("SELECT count(*) FROM employees").fetchone()[0]==2)
    return conn

def count(conn,table):
    return conn.execute("SELECT COUNT(*) FROM "+table).fetchone()[0]

def transact(path,tenant=GUID_A,oid=OBJECT_A,employee="employee-1",
             session="session-1",company="company-a"):
    conn=connect(path)
    link_id=uuid.uuid4().hex
    audit_id=uuid.uuid4().hex
    try:
        conn.execute("BEGIN IMMEDIATE")
        inserted=conn.execute(INSERT,(link_id,tenant,oid,company,session,employee)).rowcount
        audit=conn.execute(AUDIT,(audit_id,company,session,None,"qa-user-agent",
            '{"authentication":"microsoft_organizations"}',
            link_id,employee,tenant,oid)).rowcount
        conn.commit()
        return inserted,audit
    except:
        conn.rollback()
        raise
    finally:
        conn.close()

with tempfile.TemporaryDirectory(prefix="staffportal-microsoft-d1-qa-") as tmp:
    dbpath=str(Path(tmp)/"isolated-sqlite.db")
    db=create_db(dbpath)

    db.execute("""CREATE TRIGGER qa_audit_fail BEFORE INSERT ON security_logs
      WHEN NEW.event_type='microsoft_identity_linked'
      BEGIN SELECT RAISE(ABORT,'synthetic audit outage'); END""")
    db.commit()
    failed=False
    try:transact(dbpath)
    except sqlite3.IntegrityError:failed=True
    verify("forced audit failure aborts entire D1-style transaction",failed)
    verify("audit failure leaves ZERO identity links",count(db,"staffportal_external_identity_links")==0)
    verify("audit failure leaves ZERO false success logs",count(db,"security_logs")==0)
    db.execute("DROP TRIGGER qa_audit_fail")
    db.commit()

    link,audit=transact(dbpath)
    verify("link and audit insert together",link==1 and audit==1)
    record=db.execute("""SELECT l.employee_id,s.employee_id,s.company_id,s.session_id
      FROM staffportal_external_identity_links l JOIN security_logs s
      ON s.event_type='microsoft_identity_linked' AND s.employee_id=l.employee_id""").fetchone()
    verify("audit binds same existing employee, company and current session",
           record==("employee-1","employee-1","company-a","session-1"))
    verify("existing employee cannot be linked to different external tenant/object",
           transact(dbpath,GUID_B,OBJECT_B)==(0,0) and count(db,"security_logs")==1)
    verify("one Microsoft object cannot bind a second employee",
           transact(dbpath,GUID_A,OBJECT_A,"employee-2","session-2")==(0,0))
    db.execute("DELETE FROM security_logs WHERE event_type='microsoft_identity_linked'")
    db.execute("DELETE FROM staffportal_external_identity_links")
    db.commit()

    def negative_case(label,change,undo):
        db.execute(change)
        db.commit()
        result=transact(dbpath)
        verify(label,result==(0,0) and count(db,"staffportal_external_identity_links")==0
               and count(db,"security_logs")==0)
        db.execute(undo)
        db.commit()

    negative_case("revoked company membership blocks link",
        "UPDATE employee_company_memberships SET active=0 WHERE employee_id='employee-1'",
        "UPDATE employee_company_memberships SET active=1 WHERE employee_id='employee-1'")
    negative_case("inactive company blocks link",
        "UPDATE companies SET active=0 WHERE id='company-a'",
        "UPDATE companies SET active=1 WHERE id='company-a'")
    negative_case("inactive employee blocks link",
        "UPDATE employees SET employment_status='suspended' WHERE id='employee-1'",
        "UPDATE employees SET employment_status='active' WHERE id='employee-1'")
    negative_case("revoked session blocks link",
        "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='session-1'",
        "UPDATE auth_sessions SET revoked_at=NULL WHERE id='session-1'")
    negative_case("expired session blocks link",
        "UPDATE auth_sessions SET expires_at=datetime('now','-1 minute') WHERE id='session-1'",
        "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='session-1'")
    negative_case("stale session blocks link",
        "UPDATE auth_sessions SET created_at=datetime('now','-1 hour') WHERE id='session-1'",
        "UPDATE auth_sessions SET created_at=CURRENT_TIMESTAMP WHERE id='session-1'")

    # Competing writers use independent SQLite connections to a common file,
    # exercising uniqueness/transaction semantics rather than a JS Map mock.
    db.execute("DELETE FROM staffportal_external_identity_links")
    db.execute("DELETE FROM security_logs WHERE event_type='microsoft_identity_linked'")
    db.commit()

    barrier=threading.Barrier(3)
    results=[]
    lock=threading.Lock()
    def contender(tid,oid,employee,session):
        barrier.wait()
        try:result=transact(dbpath,tid,oid,employee,session)
        except Exception as exc:result=(type(exc).__name__,str(exc)[:90])
        with lock:results.append(result)
    threads=[
      threading.Thread(target=contender,args=(GUID_A,OBJECT_A,"employee-1","session-1")),
      threading.Thread(target=contender,args=(GUID_B,OBJECT_B,"employee-1","session-1")),
    ]
    for thread in threads:thread.start()
    barrier.wait()
    for thread in threads:thread.join(timeout=15)
    verify("concurrent different Microsoft identities: exactly one existing employee winner",
           sorted(results)==[(0,0),(1,1)] and count(db,"staffportal_external_identity_links")==1)
    verify("concurrent identity race: exactly one corresponding security audit",
           count(db,"security_logs")==1)
    db.execute("DELETE FROM security_logs WHERE event_type='microsoft_identity_linked'")
    db.execute("DELETE FROM staffportal_external_identity_links")
    db.commit()

    barrier=threading.Barrier(3)
    results=[]
    threads=[
      threading.Thread(target=contender,args=(GUID_A,OBJECT_A,"employee-1","session-1")),
      threading.Thread(target=contender,args=(GUID_A,OBJECT_A,"employee-2","session-2")),
    ]
    for thread in threads:thread.start()
    barrier.wait()
    for thread in threads:thread.join(timeout=15)
    verify("concurrent same Microsoft identity: cannot bind two employee accounts",
           sorted(results)==[(0,0),(1,1)] and count(db,"staffportal_external_identity_links")==1)
    verify("competing existing employees: only winning link is audited",
           count(db,"security_logs")==1)
    verify("isolated staging-schema database stays internally consistent",
           db.execute("PRAGMA integrity_check").fetchone()==("ok",) and
           db.execute("PRAGMA foreign_key_check").fetchone() is None)
    db.close()

print("D1_SQL_TRANSACTION_REVIEW_PASSED="+str(PASSED))
