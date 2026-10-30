import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/auth-refinement.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
  if (specifier === './credential-security') return { WORKER_SAFE_PASSWORD_ITERATIONS: 8000 };
  if (specifier === './password-auth') return { recoveryPolicyForEmployee: async () => ({}) };
  if (specifier === './whatsapp-recovery') return { startPasswordRecoveryWhatsApp: async () => null };
  if (specifier === './scoped-settings') return { recoveryMethods: () => [] };
  if (specifier === './staffportal-account-scope') return {
    staffPortalCompanyPredicate: () => '1=1', isStaffPortalCompanyId: () => true,
  };
  if (specifier === './provisional-workspace-session') return {
    createProvisionalWorkspaceSession: async () => ({
      cookie: 'daenem_workforce_session=synthetic; Path=/; Secure; HttpOnly; SameSite=Lax',
      next: '/workspace/', access: 'provisional',
    }),
  };
  throw new Error('Unexpected authentication dependency: ' + specifier);
});
const { routeAuthRefinement } = loaded.exports;

class SqliteD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL);
      CREATE TABLE companies(id TEXT PRIMARY KEY, code TEXT UNIQUE, active INTEGER NOT NULL);
      CREATE TABLE employees(id TEXT PRIMARY KEY, display_name TEXT, legal_name TEXT, first_name TEXT, last_name TEXT,
        email TEXT COLLATE NOCASE, phone TEXT, job_title TEXT, department TEXT, employment_status TEXT,
        profile_completion_percent INTEGER, profile_completed_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE employee_company_memberships(id TEXT PRIMARY KEY, employee_id TEXT REFERENCES employees(id),
        company_id TEXT REFERENCES companies(id), is_primary INTEGER, active INTEGER);
      CREATE TABLE employee_roles(id TEXT PRIMARY KEY, employee_id TEXT REFERENCES employees(id),
        company_id TEXT REFERENCES companies(id), role_id TEXT);
      CREATE TABLE employee_credentials(employee_id TEXT PRIMARY KEY REFERENCES employees(id),
        username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
        password_algorithm TEXT, password_iterations INTEGER, email_verified_at TEXT, password_changed_at TEXT);
      CREATE TABLE signup_verifications(id TEXT PRIMARY KEY, existing_employee_id TEXT REFERENCES employees(id),
        display_name TEXT NOT NULL, first_name TEXT, last_name TEXT, email TEXT NOT NULL COLLATE NOCASE,
        phone TEXT NOT NULL, username TEXT NOT NULL COLLATE NOCASE, company_id TEXT NOT NULL REFERENCES companies(id),
        job_title TEXT, department TEXT, requested_role_text TEXT, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
        password_iterations INTEGER NOT NULL, code_hash TEXT NOT NULL, submitted_ip TEXT, submitted_user_agent TEXT,
        expires_at TEXT NOT NULL, consumed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 6);
      CREATE TABLE signup_requests(id TEXT PRIMARY KEY, employee_id TEXT REFERENCES employees(id),
        requested_company_id TEXT REFERENCES companies(id), requested_job_title TEXT, requested_department TEXT,
        requested_role_text TEXT, submitted_ip TEXT, submitted_user_agent TEXT);
      CREATE TABLE security_logs(id TEXT PRIMARY KEY, employee_id TEXT, event_type TEXT, severity TEXT,
        result TEXT, ip_address TEXT, user_agent TEXT, details_json TEXT);
      INSERT INTO companies VALUES('company-print','PRINT',1);
      INSERT INTO app_settings VALUES('security.password_pbkdf2_iterations','1000');
      INSERT INTO app_settings VALUES('security.password_min_length','10');
      INSERT INTO app_settings VALUES('security.password_max_length','128');
    `);
    this.env = { APP_STAGE: 'bootstrap', AUTH_PEPPER: 'create-account-sqlite-fixture', DB: this,
      EMAIL: undefined };
  }
  prepare(sql) { return new SqlStatement(this, sql); }
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        const result = this.db.prepare(statement.sql).run(...statement.values);
        return { success: true, meta: { changes: Number(result.changes) } };
      });
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.db.close(); }
}
class SqlStatement {
  constructor(owner, sql) { this.owner = owner; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.owner.db.prepare(this.sql).get(...this.values); }
  async run() {
    const result = this.owner.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

const base = { firstName: 'Ada', lastName: 'Staff', email: 'ada@example.test', phone: '',
  username: 'ada.staff', password: 'Passw0rd!Safe', companyCode: 'PRINT' };
const request = (path, body) => new Request(`https://staffportal.test${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const start = async (db, body) => {
  const response = await routeAuthRefinement(request('/api/auth/signup/start', body), db.env);
  return { response, body: await response.json() };
};
const verify = (db, challenge) => routeAuthRefinement(request('/api/auth/signup/verify', {
  challengeId: challenge.body.challengeId, code: challenge.body.bootstrapCode,
}), db.env);
const neutral = { ok: true, message: 'Verification is complete. If your request is eligible, the next steps will be provided through the approved onboarding process.' };
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); console.log(`PASS: ${name}`); };

await check('legacy client company code is ignored; backend onboarding company is authoritative', async () => {
  const db = new SqliteD1();
  db.db.exec(`INSERT INTO employees(id,email,employment_status) VALUES('known','known@example.test','active');
    INSERT INTO employee_company_memberships VALUES('known-membership','known','company-print',1,1);`);
  const known = await start(db, { ...base, email: 'known@example.test', companyCode: 'INVALID' });
  const unknown = await start(db, { ...base, email: 'unknown@example.test', companyCode: 'INVALID' });
  assert.equal(known.response.status, 200);
  assert.equal(unknown.response.status, 200);
  assert.equal(known.body.ok, true);
  assert.equal(unknown.body.ok, true);
  const assigned = db.db.prepare('SELECT DISTINCT company_id FROM signup_verifications').all();
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].company_id, 'company-print');
  db.close();
});

await check('known credentialed, credentialless and Owner identities have the same public challenge shape', async () => {
  const shape = ({ response, body }) => ({ status: response.status, keys: Object.keys(body).sort(), destination: body.destination, message: body.message });
  const unknownDb = new SqliteD1();
  const unknown = await start(unknownDb, base);
  for (const role of ['credentialed', 'credentialless', 'owner']) {
    const db = new SqliteD1();
    db.db.prepare(`INSERT INTO employees(id,email,employment_status) VALUES('known','ada@example.test','active')`).run();
    db.db.prepare(`INSERT INTO employee_company_memberships VALUES('known-membership','known','company-print',1,1)`).run();
    if (role === 'credentialed') db.db.prepare(`INSERT INTO employee_credentials(employee_id,username,password_hash,password_salt,password_iterations)
      VALUES('known','ada.existing','hash','salt',1000)`).run();
    if (role === 'owner') db.db.prepare(`INSERT INTO employee_roles VALUES('owner-role','known','company-print','role-owner')`).run();
    const known = await start(db, base);
    assert.deepEqual(shape(known), shape(unknown), `${role} must not alter public challenge output`);
    if (role === 'credentialless') {
      const response = await verify(db, known);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), neutral);
      assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM employee_credentials WHERE employee_id='known'`).get().n, 1);
      assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM employee_company_memberships WHERE employee_id='known'`).get().n, 1);
    }
    db.close();
  }
  unknownDb.close();
});

await check('phone match cannot bind another employee and used username completes neutrally without writes', async () => {
  const db = new SqliteD1();
  db.db.exec(`INSERT INTO employees(id,email,phone,employment_status) VALUES('owner','owner@example.test','+2348000000000','active');
    INSERT INTO employee_company_memberships VALUES('owner-membership','owner','company-print',1,1);
    INSERT INTO employee_roles VALUES('owner-role','owner','company-print','role-owner');
    INSERT INTO employees(id,email,employment_status) VALUES('username-owner','used@example.test','active');
    INSERT INTO employee_company_memberships VALUES('username-membership','username-owner','company-print',1,1);
    INSERT INTO employee_credentials(employee_id,username,password_hash,password_salt,password_iterations)
      VALUES('username-owner','ada.staff','hash','salt',1000);`);
  const mixed = await start(db, { ...base, email: 'applicant@example.test', phone: '+2348000000000' });
  assert.equal(db.db.prepare('SELECT existing_employee_id FROM signup_verifications WHERE id=?').get(mixed.body.challengeId).existing_employee_id, null);
  const mixedResponse = await verify(db, mixed);
  assert.equal(mixedResponse.status, 200);
  assert.deepEqual(await mixedResponse.json(), neutral);
  assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM employee_credentials`).get().n, 1);
  assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM security_logs WHERE event_type='signup_verified'`).get().n, 0);

  const used = await start(db, { ...base, email: 'new@example.test', phone: '', username: 'ada.staff' });
  const beforeEmployees = db.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n;
  const usedResponse = await verify(db, used);
  assert.equal(usedResponse.status, 200);
  assert.deepEqual(await usedResponse.json(), neutral);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n, beforeEmployees);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employee_credentials').get().n, 1);
  db.close();
});

await check('repeated reservations replace the caller challenge and expired claims do not mutate accounts', async () => {
  const db = new SqliteD1();
  const first = await start(db, base);
  const second = await start(db, base);
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.deepEqual(Object.keys(first.body).sort(), Object.keys(second.body).sort());
  assert.notEqual(first.body.challengeId, second.body.challengeId);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM signup_verifications').get().n, 1);
  db.db.prepare(`UPDATE signup_verifications SET expires_at=? WHERE id=?`).run('2000-01-01T00:00:00.000Z', second.body.challengeId);
  const response = await verify(db, second);
  assert.equal(response.status, 401);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n, 0);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employee_credentials').get().n, 0);
  assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM security_logs WHERE event_type='signup_verified'`).get().n, 0);
  db.close();
});

await check('unverified username challenge cannot reserve username from verified claimant', async () => {
  const db = new SqliteD1();
  const legitimate = await start(db, base);
  db.db.prepare(`INSERT INTO signup_verifications(id,display_name,email,phone,username,company_id,password_hash,password_salt,
    password_iterations,code_hash,expires_at) VALUES('unverified-attacker','Other Person','other@example.test','',?,
    'company-print','attacker-hash','attacker-salt',1000,'unverified-code',datetime('now','+10 minutes'))`).run(base.username);
  const response = await verify(db, legitimate);
  assert.equal(response.status, 200);
  const claimant = await response.json();
  assert.equal(claimant.authenticated, true);
  assert.equal(claimant.status, 'provisional');
  assert.equal(claimant.next, '/workspace/');
  assert.match(response.headers.get('set-cookie'), /daenem_workforce_session/);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employee_credentials WHERE username=?').get(base.username).n, 1);
  assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM security_logs WHERE event_type='signup_verified'`).get().n, 1);
  assert.equal(db.db.prepare(`SELECT consumed_at FROM signup_verifications WHERE id='unverified-attacker'`).get().consumed_at, null);
  db.close();
});

await check('two verified claimants for one username produce one account and neutral responses', async () => {
  const db = new SqliteD1();
  const first = await start(db, base);
  const second = await start(db, { ...base, firstName: 'Bea', email: 'bea@example.test' });
  const responses = await Promise.all([verify(db, first), verify(db, second)]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  const results = await Promise.all(responses.map((response) => response.json()));
  assert.equal(results.filter(row => row.authenticated === true).length, 1);
  assert.equal(results.filter(row => row.authenticated !== true).length, 1);
  assert.ok(results.some(row => row.authenticated && row.status === 'provisional'));
  assert.ok(results.some(row => JSON.stringify(row) === JSON.stringify(neutral)));
  assert.equal(responses.filter(response => response.headers.has('set-cookie')).length, 1);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employee_credentials WHERE username=?').get(base.username).n, 1);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n, 1);
  assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM security_logs WHERE event_type='signup_verified'`).get().n, 1);
  db.close();
});

await check('required success-audit SQL failure rolls back account and challenge consumption', async () => {
  const db = new SqliteD1();
  const challenge = await start(db, base);
  db.db.exec(`CREATE TRIGGER fail_signup_audit BEFORE INSERT ON security_logs
    WHEN NEW.event_type='signup_verified' BEGIN SELECT RAISE(ABORT,'forced audit failure'); END;`);
  const response = await verify(db, challenge);
  assert.equal(response.status, 503);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n, 0);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM employee_credentials').get().n, 0);
  assert.equal(db.db.prepare('SELECT consumed_at FROM signup_verifications WHERE id=?').get(challenge.body.challengeId).consumed_at, null);
  assert.equal(db.db.prepare(`SELECT COUNT(*) AS n FROM security_logs WHERE event_type='signup_verified'`).get().n, 0);
  db.close();
});

console.log(`Create Account SQLite acceptance: ${passed.length}/${passed.length} PASS`);
