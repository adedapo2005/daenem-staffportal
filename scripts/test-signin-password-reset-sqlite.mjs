import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [runtime, appEntry, entry, staging, productionConfig, stagingConfig, source, scopeSource, coreMigration, identityMigration, credentialMigration, refinementMigration] = await Promise.all([
  read('worker/runtime.ts'), read('worker/app-entry.ts'), read('worker/entry.ts'), read('worker/staffportal-staging.ts'),
  read('wrangler.jsonc'), read('wrangler.staffportal-staging.jsonc'), read('worker/auth-refinement.ts'), read('worker/staffportal-account-scope.ts'),
  read('migrations/0001_core.sql'), read('migrations/0002_identity_auth.sql'),
  read('migrations/0010_password_credentials.sql'), read('migrations/0033_auth_profile_refinement.sql'),
]);
const indexOf = (value, token) => value.indexOf(token);

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
const compiledScope = ts.transpileModule(scopeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const scopeModule = { exports: {} };
new Function('module', 'exports', compiledScope)(scopeModule, scopeModule.exports);
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
  if (specifier === './credential-security') return { WORKER_SAFE_PASSWORD_ITERATIONS: 8000 };
  if (specifier === './staffportal-account-scope') return scopeModule.exports;
  throw new Error(`Unexpected auth-refinement dependency: ${specifier}`);
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
  constructor({ credential = true, owner = false, staleBeforeBatch = false, beforeBatch = null, databasePath = ':memory:', initialize = true } = {}) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA busy_timeout=5000');
    this.staleBeforeBatch = staleBeforeBatch;
    this.beforeBatch = beforeBatch;
    if (initialize) {
      this.database.exec(coreMigration);
      this.database.exec(identityMigration);
      this.database.exec(credentialMigration);
      this.database.exec(refinementMigration);
      this.database.prepare("INSERT INTO app_settings(setting_key,setting_value,value_type) VALUES('security.worker_safe_pbkdf2_iterations','1000','number') ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value").run();
      this.database.prepare("INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES('employee-a','QA-A-001','Ada Staff','ada@example.test','active'),('employee-b','QA-B-001','Ben Staff','ben@example.test','active')").run();
      if (!owner) this.database.prepare("INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES('membership-a','employee-a','company-printing',1)").run();
      if (owner) this.database.prepare("INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES('employee-role-owner-a','employee-a','company-printing','role-owner')").run();
      this.database.prepare(`INSERT INTO password_reset_challenges
        (id,employee_id,code_hash,expires_at,reset_token_hash,verified_at,consumed_at,reset_token_expires_at)
        VALUES('reset-a','employee-a','fixture-code-hash',datetime('now','+10 minutes'),?,CURRENT_TIMESTAMP,NULL,datetime('now','+10 minutes'))`).run(tokenHash);
      this.database.prepare("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at,revoked_at) VALUES('session-a1','employee-a','session-hash-a1',datetime('now','+1 day'),NULL),('session-a2','employee-a','session-hash-a2',datetime('now','+1 day'),NULL),('session-b1','employee-b','session-hash-b1',datetime('now','+1 day'),NULL)").run();
      if (credential) this.database.prepare(`INSERT INTO employee_credentials
        (employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,password_changed_at)
        VALUES('employee-a','ada.staff','old-hash','old-salt','PBKDF2-SHA256',1000,'old-time')`).run();
      else this.database.prepare("INSERT INTO employee_login_access_requests(id,employee_id,preferred_username,status) VALUES('access-a','employee-a','ada.staff','ready')").run();
      if (!credential) this.database.prepare("INSERT INTO employee_credentials(employee_id,username,password_hash,password_salt,password_algorithm,password_iterations) VALUES('employee-b','ben.staff','other-hash','other-salt','PBKDF2-SHA256',1000)").run();
    }
    this.env = { APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: {
      prepare: (sql) => new SqlStatement(this.database, sql),
      batch: (statements) => this.batch(statements),
    } };
  }
  async batch(statements) {
    await this.beforeBatch?.(this.database);
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
  ignoreBefore(sql) { this.database.exec(`CREATE TRIGGER injected_noop BEFORE ${sql} BEGIN SELECT RAISE(IGNORE); END`); }
}

const request = () => new Request('https://staffportal.test/api/auth/password/reset', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.4' },
  body: JSON.stringify({ resetToken: token, newPassword: 'NewPassw0rd!Safe' }),
});
const invoke = async (fixture) => routeAuthRefinement(request(), fixture.env);
const passed = [];
const check = async (name, action) => { await action(); passed.push(name); console.log(`PASS: ${name}`); };

await check('production and staging entrypoints dispatch password reset through refined auth before fallback handlers', async () => {
  assert.match(productionConfig, /"main"\s*:\s*"\.\/worker\/runtime\.ts"/);
  assert.match(stagingConfig, /"main"\s*:\s*"\.\/worker\/staffportal-staging\.ts"/);
  assert.equal(runtime.includes('routeOwnerAuthRecovery'), false, 'production runtime must not preempt the authoritative reset route');
  assert.match(runtime, /import appHandler from '\.\/app-entry'/, 'production runtime must delegate reset routes to the configured app entry');
  assert.match(runtime, /return appHandler\.fetch\(request, env, ctx\)/, 'production runtime must preserve app-entry dispatch');
  assert.match(appEntry, /import coreHandler from '\.\/entry'/, 'production app entry must delegate authentication routes to the core entry');
  assert.match(appEntry, /return coreHandler\.fetch\(request, env, ctx\)/, 'production app entry must preserve core auth dispatch');
  assert.ok(indexOf(entry, 'await routeAuthRefinement') >= 0, 'production entry must dispatch through refined auth');
  assert.ok(indexOf(entry, 'await routeAuthRefinement') < indexOf(entry, 'await routePasswordAuth'), 'production entry must resolve refined reset before legacy fallback');
  assert.match(staging, /import runtimeHandler from '\.\/runtime'/, 'staging entry must reuse the shared runtime route tree');
  assert.match(staging, /await runtimeHandler\.fetch\(request,runtimeEnv,ctx\)/, 'staging entry must preserve shared runtime dispatch');
  assert.ok(indexOf(runtime, 'await routeAuthRefinement') < indexOf(runtime, 'await routePasswordAuth'), 'shared runtime must resolve refined reset before legacy fallback');
});

await check('migration-aligned SQLite reset commits credential, single-use challenge, target-session revocation and correlated success audit', async () => {
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

await check('credentialless reset loses safely when its grant or Owner authority changes after preflight', async () => {
  const cases = [
    ['cancelled grant', { credential: false, beforeBatch: (database) => database.prepare("UPDATE employee_login_access_requests SET status='cancelled' WHERE id='access-a'").run() }],
    ['expired grant', { credential: false, beforeBatch: (database) => database.prepare("UPDATE employee_login_access_requests SET expires_at=datetime('now','-1 minute') WHERE id='access-a'").run() }],
    ['revoked company membership', { credential: false, beforeBatch: (database) => database.prepare("UPDATE employee_company_memberships SET active=0 WHERE employee_id='employee-a'").run() }],
    ['revoked Owner role', { credential: false, owner: true, beforeBatch: (database) => database.prepare("DELETE FROM employee_roles WHERE employee_id='employee-a' AND role_id='role-owner'").run() }],
  ];
  for (const [name, options] of cases) {
    const fixture = new SqliteD1(options);
    const response = await invoke(fixture);
    assert.notEqual(response.status, 200, name);
    assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM employee_credentials WHERE employee_id='employee-a'").count, 0, name);
    assert.equal(fixture.scalar("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").consumed_at, null, name);
    assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-a' AND revoked_at IS NOT NULL").count, 0, name);
    assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE employee_id='employee-a' AND result='success'").count, 0, name);
  }
});

await check('active membership outside the configured Account A company IDs cannot use a preissued reset token', async () => {
  const fixture = new SqliteD1();
  fixture.database.prepare("INSERT INTO companies(id,code,name,business_type) VALUES('company-external','EXT','A company named StaffPortal but outside Account A','other')").run();
  fixture.database.prepare("UPDATE employee_company_memberships SET company_id='company-external' WHERE employee_id='employee-a'").run();
  const response = await invoke(fixture);
  assert.equal(response.status, 401);
  assert.equal(fixture.scalar("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").consumed_at, null);
  assert.equal(fixture.scalar("SELECT password_hash FROM employee_credentials WHERE employee_id='employee-a'").password_hash, 'old-hash');
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE result='success'").count, 0);
});

await check('moving membership outside the configured Account A company IDs before the D1 batch rolls back the reset', async () => {
  const fixture = new SqliteD1({ beforeBatch: (database) => {
    database.prepare("INSERT INTO companies(id,code,name,business_type) VALUES('company-external','EXT','Daenem Printing','printing')").run();
    database.prepare("UPDATE employee_company_memberships SET company_id='company-external' WHERE employee_id='employee-a'").run();
  } });
  const response = await invoke(fixture);
  assert.notEqual(response.status, 200);
  assert.equal(fixture.scalar("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").consumed_at, null);
  assert.equal(fixture.scalar("SELECT password_hash FROM employee_credentials WHERE employee_id='employee-a'").password_hash, 'old-hash');
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE result='success'").count, 0);
});

await check('two simultaneous reset submissions produce exactly one winner and one durable success audit', async () => {
  const fixture = new SqliteD1();
  const responses = await Promise.all([invoke(fixture), invoke(fixture)]);
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE event_type='password_reset_completed' AND result='success'").count, 1);
  assert.equal(fixture.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-a' AND revoked_at IS NULL").count, 0);
});

await check('independent SQLite connections cannot both consume one reset token or revoke unrelated sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'staffportal-password-reset-'));
  const databasePath = join(directory, 'reset.sqlite');
  let first;
  let second;
  try {
    first = new SqliteD1({ databasePath });
    second = new SqliteD1({ databasePath, initialize: false });
    const responses = await Promise.all([invoke(first), invoke(second)]);
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
    assert.equal(first.scalar("SELECT COUNT(*) AS count FROM security_logs WHERE event_type='password_reset_completed' AND result='success'").count, 1);
    assert.equal(second.scalar("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").consumed_at !== null, true);
    assert.equal(second.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-a' AND revoked_at IS NULL").count, 0);
    assert.equal(second.scalar("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-b' AND revoked_at IS NULL").count, 1);
  } finally {
    first?.database.close();
    second?.database.close();
    await rm(directory, { recursive: true, force: true });
  }
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

for (const [name, table, action, options] of [
  ['credential update', 'employee_credentials', 'UPDATE', {}],
  ['credential insert', 'employee_credentials', 'INSERT', { credential: false }],
  ['access-grant activation', 'employee_login_access_requests', 'UPDATE', { credential: false }],
  ['challenge consume', 'password_reset_challenges', 'UPDATE', {}],
  ['session revocation', 'auth_sessions', 'UPDATE', {}],
  ['required success audit', 'security_logs', 'INSERT', {}],
]) {
  await check(`silent zero-row ${name} write rolls the whole reset back`, async () => {
    const fixture = new SqliteD1(options);
    fixture.ignoreBefore(`${action} ON ${table}`);
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
