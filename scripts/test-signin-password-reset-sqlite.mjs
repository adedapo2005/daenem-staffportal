import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [runtime, entry, staging, productionConfig, stagingConfig, source] = await Promise.all([
  read('worker/runtime.ts'), read('worker/entry.ts'), read('worker/staffportal-staging.ts'),
  read('wrangler.jsonc'), read('wrangler.staffportal-staging.jsonc'), read('worker/auth-refinement.ts'),
]);
const indexOf = (value, token) => value.indexOf(token);
assert.match(productionConfig, /"main"\s*:\s*"\.\/worker\/runtime\.ts"/);
assert.match(stagingConfig, /"main"\s*:\s*"\.\/worker\/staffportal-staging\.ts"/);
assert.equal(runtime.includes('routeOwnerAuthRecovery'), false, 'production runtime must not preempt the authoritative reset route');
assert.ok(indexOf(entry, 'await routeAuthRefinement') < indexOf(entry, 'await routePasswordAuth'), 'production app entry must resolve reset through refined auth first');
assert.ok(indexOf(staging, 'await routeAuthRefinement') < indexOf(staging, 'await routePasswordAuth'), 'staging entry must resolve reset through refined auth first');

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
  assert.equal(specifier, './credential-security');
  return { WORKER_SAFE_PASSWORD_ITERATIONS: 8000 };
});
const { routeAuthRefinement } = loaded.exports;
const pepper = 'password-reset-sqlite-fixture';
const token = 'sqlite-reset-token';
const tokenHash = createHash('sha256').update(`password-reset:${token}:${pepper}`).digest('hex');

class SqlStatement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.values); }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  constructor({ credential = true, owner = false, staleBeforeBatch = false } = {}) {
    this.database = new DatabaseSync(':memory:');
    this.staleBeforeBatch = staleBeforeBatch;
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL);
      CREATE TABLE companies(id TEXT PRIMARY KEY, active INTEGER NOT NULL);
      CREATE TABLE employees(id TEXT PRIMARY KEY, email TEXT, employment_status TEXT NOT NULL);
      CREATE TABLE employee_company_memberships(employee_id TEXT, company_id TEXT, active INTEGER NOT NULL);
      CREATE TABLE employee_roles(employee_id TEXT, role_id TEXT);
      CREATE TABLE employee_credentials(
        employee_id TEXT PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL, password_algorithm TEXT, password_iterations INTEGER NOT NULL,
        email_verified_at TEXT, password_changed_at TEXT, failed_attempts INTEGER DEFAULT 0,
        locked_until TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE password_reset_challenges(
        id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, reset_token_hash TEXT NOT NULL,
        verified_at TEXT, consumed_at TEXT, reset_token_expires_at TEXT NOT NULL
      );
      CREATE TABLE employee_login_access_requests(
        id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, status TEXT NOT NULL,
        expires_at TEXT, activated_at TEXT, preferred_username TEXT, requested_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE auth_sessions(id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE security_logs(
        id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, event_type TEXT NOT NULL,
        severity TEXT NOT NULL, result TEXT NOT NULL, ip_address TEXT, user_agent TEXT, details_json TEXT
      );
    `);
    this.database.prepare("INSERT INTO app_settings VALUES('security.password_pbkdf2_iterations','1000')").run();
    this.database.prepare("INSERT INTO app_settings VALUES('security.worker_safe_pbkdf2_iterations','1000')").run();
    this.database.prepare("INSERT INTO app_settings VALUES('security.password_min_length','10')").run();
    this.database.prepare("INSERT INTO app_settings VALUES('security.password_max_length','128')").run();
    this.database.prepare("INSERT INTO app_settings VALUES('owner.bootstrap_username','owner.staff')").run();
    this.database.prepare("INSERT INTO companies VALUES('company-a',1)").run();
    this.database.prepare("INSERT INTO employees VALUES('employee-a','ada@example.test','active')").run();
    this.database.prepare("INSERT INTO employees VALUES('employee-b','ben@example.test','active')").run();
    if (!owner) this.database.prepare("INSERT INTO employee_company_memberships VALUES('employee-a','company-a',1)").run();
    if (owner) this.database.prepare("INSERT INTO employee_roles VALUES('employee-a','role-owner')").run();
    this.database.prepare(`INSERT INTO password_reset_challenges
      (id,employee_id,reset_token_hash,verified_at,consumed_at,reset_token_expires_at)
      VALUES('reset-a','employee-a',?,CURRENT_TIMESTAMP,NULL,datetime('now','+10 minutes'))`).run(tokenHash);
    this.database.prepare("INSERT INTO auth_sessions VALUES('session-a1','employee-a',NULL),('session-a2','employee-a',NULL),('session-b1','employee-b',NULL)").run();
    if (credential) this.database.prepare(`INSERT INTO employee_credentials
      (employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,password_changed_at)
      VALUES('employee-a','ada.staff','old-hash','old-salt','PBKDF2-SHA256',1000,'old-time')`).run();
    else this.database.prepare("INSERT INTO employee_login_access_requests(id,employee_id,status,preferred_username) VALUES('access-a','employee-a','ready','ada.staff')").run();
    if (!credential) this.database.prepare("INSERT INTO employee_credentials(employee_id,username,password_hash,password_salt,password_algorithm,password_iterations) VALUES('employee-b','ben.staff','other-hash','other-salt','PBKDF2-SHA256',1000)").run();
    this.env = { APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: {
      prepare: (sql) => new SqlStatement(this.database, sql),
      batch: (statements) => this.batch(statements),
    } };
  }
  async batch(statements) {
    if (this.staleBeforeBatch) {
      this.staleBeforeBatch = false;
      this.database.prepare("UPDATE employees SET employment_status='terminated' WHERE id='employee-a'").run();
    }
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        const result = this.database.prepare(statement.sql).run(...statement.values);
        return { success: true, meta: { changes: Number(result.changes) } };
      });
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
  scalar(sql, ...values) { return this.database.prepare(sql).get(...values); }
  failBefore(sql) { this.database.exec(`CREATE TRIGGER injected_failure BEFORE ${sql} BEGIN SELECT RAISE(ABORT, 'injected failure'); END`); }
}

const request = () => new Request('https://staffportal.test/api/auth/password/reset', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.4' },
  body: JSON.stringify({ resetToken: token, newPassword: 'NewPassw0rd!Safe' }),
});
const invoke = async (fixture) => routeAuthRefinement(request(), fixture.env);
const passed = [];
const check = async (name, action) => { await action(); passed.push(name); console.log(`PASS: ${name}`); };

await check('configured production and staging entrypoints use the same refined reset authority', async () => {});

await check('real SQLite reset commits credential, single-use challenge, target-session revocation and correlated success audit', async () => {
  const fixture = new SqliteD1();
  const response = await invoke(fixture);
  assert.equal(response.status, 200);
  assert.equal(fixture.scalar("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").consumed_at !== null, true);
  assert.notEqual(fixture.scalar("SELECT password_hash FROM employee_credentials WHERE employee_id='employee-a'").password_hash, 'old-hash');
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-a' AND revoked_at IS NULL").count, 0);
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-b' AND revoked_at IS NULL").count, 1);
  const audit = fixture.scalar("SELECT ip_address,user_agent,details_json FROM security_logs WHERE employee_id='employee-a' AND event_type='password_reset_completed' AND result='success'");
  assert.equal(audit.ip_address, '192.0.2.4');
  assert.equal(audit.user_agent, null);
  assert.equal(JSON.parse(audit.details_json).username, 'ada.staff');
});

await check('Owner recovery stays eligible through the shared route and cannot reactivate an offboarded Owner', async () => {
  const fixture = new SqliteD1({ owner: true });
  assert.equal((await invoke(fixture)).status, 200);
  assert.equal(fixture.scalar("SELECT employment_status FROM employees WHERE id='employee-a'").employment_status, 'active');
  assert.equal(fixture.scalar("SELECT password_iterations FROM employee_credentials WHERE employee_id='employee-a'").password_iterations, 1000);
  assert.equal(fixture.scalar("SELECT event_type FROM security_logs WHERE employee_id='employee-a' AND result='success'").event_type, 'owner_password_activation_completed');
  const offboarded = new SqliteD1({ owner: true, staleBeforeBatch: true });
  assert.notEqual((await invoke(offboarded)).status, 200);
  assert.equal(offboarded.scalar("SELECT COUNT(*) AS count FROM employee_credentials WHERE employee_id='employee-a' AND password_hash<>'old-hash'").count, 0);
  assert.equal(offboarded.scalar("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").consumed_at, null);
});

await check('credentialless employee reset activates the current grant and writes audit in the same SQLite transaction', async () => {
  const fixture = new SqliteD1({ credential: false });
  assert.equal((await invoke(fixture)).status, 200);
  assert.equal(fixture.scalar("SELECT status FROM employee_login_access_requests WHERE id='access-a'").status, 'activated');
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE event_type='login_access_activated' AND result='success'").count, 1);
});

await check('two simultaneous reset submissions produce exactly one winner and one durable success audit', async () => {
  const fixture = new SqliteD1();
  const responses = await Promise.all([invoke(fixture), invoke(fixture)]);
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE event_type='password_reset_completed' AND result='success'").count, 1);
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-a' AND revoked_at IS NULL").count, 0);
});

for (const [name, table, action, options] of [
  ['credential update', 'employee_credentials', 'UPDATE', {}],
  ['credential insert', 'employee_credentials', 'INSERT', { credential: false }],
  ['access-grant activation', 'employee_login_access_requests', 'UPDATE', { credential: false }],
  ['challenge consume', 'password_reset_challenges', 'UPDATE', {}],
  ['session revocation', 'auth_sessions', 'UPDATE', {}],
  ['required success audit', 'security_logs', 'INSERT', {}],
]) {
  await check(`forced ${name} SQL failure rolls the whole reset back`, async () => {
    const fixture = new SqliteD1(options);
    fixture.failBefore(`${action} ON ${table}`);
    const response = await invoke(fixture);
    assert.equal(response.status, 503);
    assert.equal(fixture.scalar("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").consumed_at, null);
    const credential = fixture.scalar("SELECT password_hash FROM employee_credentials WHERE employee_id='employee-a'");
    assert.equal(options.credential === false ? credential : credential.password_hash, options.credential === false ? undefined : 'old-hash');
    assert.equal(fixture.scalar("SELECT status FROM employee_login_access_requests WHERE id='access-a'")?.status, options.credential === false ? 'ready' : undefined);
    assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-a' AND revoked_at IS NOT NULL").count, 0);
    assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE result='success'").count, 0);
  });
}

await check('expired, invalid and replayed tokens fail without a second credential or audit change', async () => {
  const expired = new SqliteD1();
  expired.database.prepare("UPDATE password_reset_challenges SET reset_token_expires_at=datetime('now','-1 minute')").run();
  assert.equal((await invoke(expired)).status, 401);
  const invalid = new SqliteD1();
  assert.equal((await routeAuthRefinement(new Request('https://staffportal.test/api/auth/password/reset', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resetToken: 'wrong-token', newPassword: 'NewPassw0rd!Safe' }),
  }), invalid.env)).status, 401);
  const replay = new SqliteD1();
  assert.equal((await invoke(replay)).status, 200);
  assert.equal((await invoke(replay)).status, 401);
  assert.equal(replay.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE result='success'").count, 1);
});

console.log(`Password reset SQLite/runtime route acceptance: ${passed.length}/${passed.length} PASS`);
