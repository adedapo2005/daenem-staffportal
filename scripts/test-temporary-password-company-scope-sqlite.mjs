// Temporary-password administration must be scoped to the target employee's company.
// Loads the real worker/auth.ts session + permission resolution and worker/credential-security.ts,
// applies the real migrations to SQLite, and checks database state for every case.
// Usage: node scripts/test-temporary-password-company-scope-sqlite.mjs [--source worker/other.ts]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = sourceFlag > 0 ? process.argv[sourceFlag + 1] : 'worker/temporary-password.ts';
const pepper = 'temporary-password-company-scope-fixture';
const COOKIE = 'daenem_workforce_session';

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function instantiate(source, modules) {
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', compile(source))(loaded, loaded.exports, (specifier) => {
    if (!(specifier in modules)) throw new Error(`unexpected import ${specifier}`);
    return modules[specifier];
  });
  return loaded.exports;
}

function d1(database) {
  return {
    prepare: (sql) => ({
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() { return database.prepare(sql).get(...this.values) ?? null; },
      async all() { return { success: true, results: database.prepare(sql).all(...this.values) }; },
      async run() {
        const result = database.prepare(sql).run(...this.values);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    }),
  };
}

const [authSource, credentialSource, routeSource, ...migrations] = await Promise.all([
  read('worker/auth.ts'), read('worker/credential-security.ts'), read(sourcePath),
  ...['0001_core', '0002_identity_auth', '0010_password_credentials', '0019_employee_permission_overrides_v2',
    '0033_auth_profile_refinement', '0034_temporary_password_recovery'].map((name) => read(`migrations/${name}.sql`)),
]);
const auth = instantiate(authSource, {});
const credentials = instantiate(credentialSource, {});
const route = instantiate(routeSource, { './auth': auth, './credential-security': credentials });

const database = new DatabaseSync(':memory:');
for (const sql of migrations) database.exec(sql);
const env = { APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: d1(database) };
const run = (sql, ...values) => database.prepare(sql).run(...values);
const one = (sql, ...values) => database.prepare(sql).get(...values);
const many = (sql, ...values) => database.prepare(sql).all(...values);

// ---- fixtures -------------------------------------------------------------------------------
run("INSERT INTO companies(id,code,name,business_type) VALUES('co-a','QA-A','QA Company A','other'),('co-b','QA-B','QA Company B','other')");
run("INSERT INTO roles(id,company_id,code,name) VALUES('role-qa-users-admin',NULL,'qa_users_admin','QA Manage Employees'),('role-qa-staff',NULL,'qa_staff','QA Staff')");
run("INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES('rp-qa-users','role-qa-users-admin','perm-users','manage'),('rp-qa-staff','role-qa-staff','perm-profile','view')");
const people = {
  owner: ['emp-owner', ['co-a']], mgrA: ['emp-mgr-a', ['co-a', 'co-b']], mgrB: ['emp-mgr-b', ['co-b']],
  mgrStale: ['emp-mgr-stale', ['co-a']], staffA: ['emp-staff-a', ['co-a']], staffB: ['emp-staff-b', ['co-b']],
  shared: ['emp-shared', ['co-a', 'co-b']],
};
for (const [key, [id, companies]] of Object.entries(people)) {
  run('INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES(?,?,?,?,?)', id, `QA-${key}`, `QA ${key}`, `${key.toLowerCase()}@example.test`, 'active');
  companies.forEach((companyId, index) => run('INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,?,1)', `m-${id}-${companyId}`, id, companyId, index === 0 ? 1 : 0));
  run("INSERT INTO employee_credentials(employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,password_changed_at) VALUES(?,?,?,?,'PBKDF2-SHA256',8000,'fixture-time')", id, `qa.${key.toLowerCase()}`, `fixture-hash-${id}`, `fixture-salt-${id}`);
}
const grant = (id, employeeId, companyId, roleId) => run('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)', id, employeeId, companyId, roleId);
grant('er-owner', 'emp-owner', 'co-a', 'role-owner');
grant('er-mgr-a-users', 'emp-mgr-a', 'co-a', 'role-qa-users-admin');
grant('er-mgr-a-staff-b', 'emp-mgr-a', 'co-b', 'role-qa-staff');
grant('er-mgr-b-users', 'emp-mgr-b', 'co-b', 'role-qa-users-admin');
grant('er-mgr-stale-users', 'emp-mgr-stale', 'co-a', 'role-qa-users-admin');

const tokens = {};
for (const [key, [id]] of Object.entries(people)) {
  tokens[key] = `token-${key}`;
  const tokenHash = createHash('sha256').update(`${tokens[key]}:${pepper}`).digest('hex');
  run("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 day'))", `s-${id}`, id, tokenHash);
}
for (const key of ['owner', 'staffA', 'staffB', 'shared']) {
  const id = people[key][0];
  run("INSERT INTO employee_temporary_passwords(id,employee_id,issued_by,credential_username,expires_at) VALUES(?,?,'emp-owner',?,datetime('now','+1 day'))", `tp-${id}`, id, `qa.${key.toLowerCase()}`);
}

// ---- helpers --------------------------------------------------------------------------------
async function call(actor, method, path, body) {
  const request = new Request(`https://staffportal.test${path}`, {
    method,
    headers: { cookie: `${COOKIE}=${tokens[actor]}`, 'content-type': 'application/json', 'user-agent': 'qa-fixture' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = await auth.getSessionContext(request, env);
  assert.ok(context, `${actor} has a valid fixture session`);
  const response = await route.routeTemporaryPasswordAdmin(request, env, context);
  assert.ok(response, `${method} ${path} is handled`);
  return { status: response.status, body: await response.json() };
}
const issue = (actor, employeeId) => call(actor, 'POST', '/api/admin/login-access/temporary-password', { employeeId, reason: 'qa' });
const revoke = (actor, employeeId) => call(actor, 'POST', '/api/admin/login-access/temporary-password/revoke', { employeeId });
const list = (actor) => call(actor, 'GET', '/api/admin/login-access/temporary-password');

function snapshot(employeeId) {
  return JSON.stringify({
    credential: one('SELECT username,password_hash,password_salt,password_changed_at,failed_attempts,locked_until FROM employee_credentials WHERE employee_id=?', employeeId),
    sessions: many('SELECT id,revoked_at FROM auth_sessions WHERE employee_id=? ORDER BY id', employeeId),
    temporary: many('SELECT id,revoked_at,revoked_by,replaced_at FROM employee_temporary_passwords WHERE employee_id=? ORDER BY id', employeeId),
  });
}
const deniedLogs = (actorId) => many("SELECT details_json AS details FROM security_logs WHERE employee_id=? AND event_type='temporary_password_admin_denied' AND result='denied'", actorId);
const activeSessions = (employeeId) => one('SELECT COUNT(*) AS n FROM auth_sessions WHERE employee_id=? AND revoked_at IS NULL', employeeId).n;
const listedIds = (response) => new Set((response.body.temporaryPasswords || []).map((row) => row.employeeId));

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); } catch (error) { results.push([name, false, error.message.split('\n')[0]]); }
}

async function assertDeniedWithoutWrites(actor, action, targetId) {
  const before = snapshot(targetId);
  const logsBefore = deniedLogs(people[actor][0]).length;
  const response = action === 'issue' ? await issue(actor, targetId) : await revoke(actor, targetId);
  assert.equal(response.status, 404, `expected neutral 404, got ${response.status}`);
  assert.deepEqual(response.body, { error: 'Employee account not found or is not active.' });
  assert.equal(snapshot(targetId), before, 'target credential, sessions and temporary access are unchanged');
  assert.equal(deniedLogs(people[actor][0]).length, logsBefore + 1, 'one denial is recorded against the actor');
}

// ---- denied (must not write) ----------------------------------------------------------------
await check('A-grant + B-membership manager cannot issue for B-only employee', () => assertDeniedWithoutWrites('mgrA', 'issue', 'emp-staff-b'));
await check('A-grant + B-membership manager cannot revoke B-only employee', () => assertDeniedWithoutWrites('mgrA', 'revoke', 'emp-staff-b'));
await check('B-only manager cannot issue for A-only employee', () => assertDeniedWithoutWrites('mgrB', 'issue', 'emp-staff-a'));
await check('delegated manager cannot issue for the Owner (same company)', () => assertDeniedWithoutWrites('mgrA', 'issue', 'emp-owner'));
await check('delegated manager cannot revoke the Owner or sign the Owner out', () => assertDeniedWithoutWrites('mgrA', 'revoke', 'emp-owner'));
await check('unknown employee gets the identical neutral response', async () => {
  const unknown = await issue('mgrA', 'emp-does-not-exist');
  const outOfScope = await issue('mgrA', 'emp-staff-b');
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, outOfScope.body, 'out-of-scope and unknown targets are indistinguishable');
});
await check('denial audit holds no credential, token or employee details', () => {
  for (const row of deniedLogs('emp-mgr-a')) {
    const details = JSON.parse(row.details);
    assert.deepEqual(Object.keys(details).sort(), ['action', 'targetEmployeeId']);
    assert.ok(!/password|hash|token|@/i.test(row.details), 'no secret-looking or contact data in denial details');
  }
  assert.ok(deniedLogs('emp-mgr-a').length > 0, 'denials were recorded');
});
await check('delegated list excludes other-company and Owner temporary access', async () => {
  const response = await list('mgrA');
  assert.equal(response.status, 200);
  const ids = listedIds(response);
  assert.ok(ids.has('emp-staff-a') && ids.has('emp-shared'), 'own-company entries are listed');
  assert.ok(!ids.has('emp-staff-b'), 'B-only employee is not listed');
  assert.ok(!ids.has('emp-owner'), 'Owner is not listed to a delegated manager');
});
await check('B-only manager list excludes A-only employee', async () => {
  const ids = listedIds(await list('mgrB'));
  assert.ok(ids.has('emp-staff-b') && ids.has('emp-shared') && !ids.has('emp-staff-a') && !ids.has('emp-owner'));
});
await check('withdrawn grant is refused at request time with no writes', async () => {
  run("DELETE FROM employee_roles WHERE id='er-mgr-stale-users'");
  const before = snapshot('emp-staff-a');
  const response = await issue('mgrStale', 'emp-staff-a');
  assert.equal(response.status, 403);
  assert.equal(snapshot('emp-staff-a'), before);
  assert.equal((await list('mgrStale')).status, 403, 'list is refused too');
});

// ---- authorized (must still work) -----------------------------------------------------------
await check('same-company manager can issue: credential replaced, only target signed out', async () => {
  const before = one('SELECT password_hash FROM employee_credentials WHERE employee_id=?', 'emp-staff-a').password_hash;
  const otherSessions = activeSessions('emp-staff-b');
  const response = await issue('mgrA', 'emp-staff-a');
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.temporaryPassword, 'string');
  assert.notEqual(one('SELECT password_hash FROM employee_credentials WHERE employee_id=?', 'emp-staff-a').password_hash, before);
  assert.equal(activeSessions('emp-staff-a'), 0, 'target sessions revoked');
  assert.equal(activeSessions('emp-staff-b'), otherSessions, 'unrelated employee untouched');
  assert.equal(one("SELECT COUNT(*) AS n FROM employee_temporary_passwords WHERE employee_id='emp-staff-a' AND revoked_at IS NULL AND replaced_at IS NULL").n, 1);
});
await check('manager can issue for an employee shared with their company', async () => {
  assert.equal((await issue('mgrA', 'emp-shared')).status, 200);
});
await check('Owner can issue for any company', async () => {
  assert.equal((await issue('owner', 'emp-staff-b')).status, 200);
});
await check('Owner list covers all companies including Owner records', async () => {
  const ids = listedIds(await list('owner'));
  for (const id of ['emp-staff-a', 'emp-staff-b', 'emp-shared', 'emp-owner']) assert.ok(ids.has(id), `${id} listed`);
});
await check('same-company manager can revoke', async () => {
  const response = await revoke('mgrA', 'emp-staff-a');
  assert.equal(response.status, 200);
  assert.equal(one("SELECT COUNT(*) AS n FROM employee_temporary_passwords WHERE employee_id='emp-staff-a' AND revoked_at IS NULL").n, 0);
});
await check('Owner can revoke the Owner record', async () => {
  assert.equal((await revoke('owner', 'emp-owner')).status, 200);
});

// ---- summary --------------------------------------------------------------------------------
database.close();
const failed = results.filter(([, ok]) => !ok);
for (const [name, ok, reason] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${reason}`}`);
console.log(`Temporary-password company scope (${sourcePath}): ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;
