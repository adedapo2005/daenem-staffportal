import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../worker/oauth-provisional-signup.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { provisionOAuthApplicant, oauthApplicantApproval } = loaded.exports;
const request = new Request('https://staffportal.test/api/auth/oauth/google/callback', {
  headers: { 'cf-connecting-ip': '203.0.113.25', 'user-agent': 'Synthetic OAuth Fixture' },
});
const google = { provider: 'google', email: 'new-google@example.test',
  name: 'Nora Google', firstName: 'Nora', lastName: 'Google' };
const microsoft = { provider: 'microsoft', email: 'new-microsoft@example.test',
  name: 'Nora Microsoft', microsoftTenantId: 'tenant-123', microsoftObjectId: 'object-456' };
class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL);
      CREATE TABLE companies(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,active INTEGER NOT NULL);
      CREATE TABLE employees(id TEXT PRIMARY KEY,display_name TEXT,legal_name TEXT,
        first_name TEXT,last_name TEXT,email TEXT NOT NULL UNIQUE,
        employment_status TEXT NOT NULL);
      CREATE TABLE employee_company_memberships(id TEXT PRIMARY KEY,
        employee_id TEXT REFERENCES employees(id),company_id TEXT REFERENCES companies(id),
        is_primary INTEGER,active INTEGER);
      CREATE TABLE roles(id TEXT PRIMARY KEY);
      CREATE TABLE employee_roles(id TEXT PRIMARY KEY,employee_id TEXT REFERENCES employees(id),
        company_id TEXT REFERENCES companies(id),role_id TEXT REFERENCES roles(id));
      CREATE TABLE signup_requests(id TEXT PRIMARY KEY,employee_id TEXT REFERENCES employees(id),
        requested_company_id TEXT REFERENCES companies(id),requested_role_text TEXT,
        submitted_ip TEXT,submitted_user_agent TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE staffportal_external_identity_links(id TEXT PRIMARY KEY,provider TEXT,
        tenant_id TEXT,object_id TEXT,employee_id TEXT REFERENCES employees(id),
        linked_by_employee_id TEXT REFERENCES employees(id),
        UNIQUE(provider,tenant_id,object_id),UNIQUE(provider,employee_id));
      CREATE TABLE security_logs(id TEXT PRIMARY KEY,employee_id TEXT,event_type TEXT,
        severity TEXT,result TEXT,ip_address TEXT,user_agent TEXT,
        details_json TEXT,occurred_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,employee_id TEXT);
      INSERT INTO app_settings VALUES('portal.allow_self_signup','true');
      INSERT INTO app_settings VALUES('portal.default_signup_company_code','PRINT');
      INSERT INTO companies VALUES('company-printing','PRINT',1);
      INSERT INTO roles VALUES('role-provisional');
    `);
    this.env = { DB: this };
  }
  prepare(sql) { return new Stmt(this, sql); }
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = statements.map(s => {
        const statement = this.db.prepare(s.sql);
        if (statement.reader) {
          statement.get(...s.values);
          return { meta: { changes: 0 } };
        }
        return { meta: { changes: Number(statement.run(...s.values).changes) } };
      });
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  count(table) {
    assert.ok(['employees','employee_company_memberships','employee_roles','signup_requests',
      'staffportal_external_identity_links','security_logs','auth_sessions'].includes(table));
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n);
  }
  close() { this.db.close(); }
}
class Stmt {
  constructor(root,sql) { this.root=root; this.sql=sql; this.values=[]; }
  bind(...values) { this.values=values; return this; }
  async first() { return this.root.db.prepare(this.sql).get(...this.values) || null; }
  async run() {
    const result=this.root.db.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}
const passed=[];
async function check(label,fn){await fn();passed.push(label);console.log('PASS '+label);}

await check('Google applicant creates only provisional request and atomic audit', async()=>{
  const db=new D1();
  assert.equal(await provisionOAuthApplicant(db.env, google, request),'pending');
  for(const table of ['employees','employee_company_memberships','employee_roles',
    'signup_requests','security_logs']) assert.equal(db.count(table),1,table);
  assert.equal(db.count('auth_sessions'),0);
  assert.equal(db.count('staffportal_external_identity_links'),0);
  assert.equal(db.db.prepare('SELECT employment_status AS state FROM employees').get().state,'provisional');
  const employeeId=db.db.prepare('SELECT id FROM employees').get().id;
  assert.equal(await oauthApplicantApproval(db,employeeId),'pending');
  db.db.prepare("UPDATE signup_requests SET status='approved'").run();
  assert.equal(await oauthApplicantApproval(db,employeeId),'approved');
  assert.equal(await provisionOAuthApplicant(db.env,google,request),'existing');
  assert.equal(db.count('employees'),1);
  db.close();
});
await check('Microsoft applicant binds immutable tenant and object without granting session', async()=>{
  const db=new D1();
  assert.equal(await provisionOAuthApplicant(db.env,microsoft,request),'pending');
  const link=db.db.prepare('SELECT tenant_id AS tenant,object_id AS obj FROM staffportal_external_identity_links').get();
  assert.equal(link.tenant,'tenant-123');
  assert.equal(link.obj,'object-456');
  assert.equal(db.count('auth_sessions'),0);
  assert.equal(db.count('security_logs'),1);
  assert.equal(await provisionOAuthApplicant(db.env,microsoft,request),'existing');
  assert.equal(db.count('employees'),1);
  db.close();
});
await check('Existing email never creates a second employee or Microsoft link', async()=>{
  const db=new D1();
  db.db.prepare("INSERT INTO employees VALUES(?,?,?,?,?,?,?)").run(
    'staff-existing','Existing Person','Existing Person','Existing','Person',
    'new-microsoft@example.test','active');
  assert.equal(await provisionOAuthApplicant(db.env,microsoft,request),'existing');
  assert.equal(db.count('signup_requests'),0);
  assert.equal(db.count('staffportal_external_identity_links'),0);
  db.close();
});
await check('Self-signup disabled fails closed with zero writes', async()=>{
  const db=new D1();
  db.db.prepare("UPDATE app_settings SET setting_value='false' WHERE setting_key='portal.allow_self_signup'").run();
  assert.equal(await provisionOAuthApplicant(db.env,google,request),'disabled');
  assert.equal(db.count('employees'),0);
  db.close();
});
await check('Inactive default company blocks social provisioning', async()=>{
  const db=new D1();
  db.db.prepare("UPDATE companies SET active=0").run();
  assert.equal(await provisionOAuthApplicant(db.env,google,request),'unavailable');
  assert.equal(db.count('employees'),0);
  db.close();
});
await check('Missing Microsoft immutable identity rejected', async()=>{
  const db=new D1();
  assert.equal(await provisionOAuthApplicant(db.env,{...microsoft,microsoftObjectId:''},request),'unavailable');
  assert.equal(db.count('employees'),0);
  db.close();
});
await check('Mandatory audit failure rolls back employee, roles and application', async()=>{
  const db=new D1();
  db.db.exec("CREATE TRIGGER denied_audit BEFORE INSERT ON security_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  assert.equal(await provisionOAuthApplicant(db.env,google,request),'unavailable');
  for(const table of ['employees','employee_company_memberships','employee_roles','signup_requests','security_logs'])
    assert.equal(db.count(table),0,table);
  db.close();
});
await check('Silently suppressed audit rolls back every Microsoft provisional row', async()=>{
  const db=new D1();
  db.db.exec("CREATE TRIGGER ignored_audit BEFORE INSERT ON security_logs BEGIN SELECT RAISE(IGNORE); END;");
  assert.equal(await provisionOAuthApplicant(db.env,microsoft,request),'unavailable');
  for(const table of ['employees','employee_company_memberships','employee_roles','signup_requests',
    'staffportal_external_identity_links','security_logs']) assert.equal(db.count(table),0,table);
  db.close();
});
await check('Known IP rate limit blocks bulk account creation', async()=>{
  const db=new D1();
  for(let i=0;i<5;i++) db.db.prepare(
    "INSERT INTO security_logs(id,event_type,ip_address) VALUES(?,'oauth_signup_requested',?)"
  ).run('audit-'+i,'203.0.113.25');
  assert.equal(await provisionOAuthApplicant(db.env,google,request),'rate_limited');
  assert.equal(db.count('employees'),0);
  db.close();
});
await check('Email normalization and approval company remain server controlled', async()=>{
  const db=new D1();
  assert.equal(await provisionOAuthApplicant(db.env,{...google,email:' NEW-GOOGLE@EXAMPLE.TEST '},request),'pending');
  const employee=db.db.prepare('SELECT email FROM employees').get();
  assert.equal(employee.email,'new-google@example.test');
  const requestRow=db.db.prepare('SELECT requested_company_id AS company FROM signup_requests').get();
  assert.equal(requestRow.company,'company-printing');
  db.close();
});
await check('Rejected, cancelled and expired social applicants cannot sign in',async()=>{
  const db=new D1();
  assert.equal(await provisionOAuthApplicant(db.env,google,request),'pending');
  const id=db.db.prepare('SELECT id FROM employees').get().id;
  for(const status of ['rejected','cancelled','expired']){
    db.db.prepare('UPDATE signup_requests SET status=?').run(status);
    assert.equal(await oauthApplicantApproval(db,id),'not_approved',status);
  }
  db.db.prepare("UPDATE signup_requests SET status='approved'").run();
  assert.equal(await oauthApplicantApproval(db,id),'approved');
  db.close();
});
await check('Local signup request does not masquerade as social applicant',async()=>{
  const db=new D1();
  db.db.prepare('INSERT INTO employees VALUES(?,?,?,?,?,?,?)').run('local-1','Local User','Local User','Local','User','local@example.test','provisional');
  db.db.prepare('INSERT INTO signup_requests(id,employee_id,requested_company_id,requested_role_text,status) VALUES(?,?,?,?,?)').run('local-request','local-1','company-printing','Local Registration','pending');
  assert.equal(await oauthApplicantApproval(db,'local-1'),'not_applicant');
  db.close();
});
console.log(JSON.stringify({ok:true,passed:passed.length,tests:passed}));
