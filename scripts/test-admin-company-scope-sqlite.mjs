// Admin locations, geofences and group-wide settings must be scoped to the actor's companies.
// Loads the real worker/auth.ts session + permission resolution and worker/scoped-settings.ts,
// applies the real migrations to SQLite, and checks database state for every case.
// Usage: node scripts/test-admin-company-scope-sqlite.mjs [--source worker/other.ts]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = sourceFlag > 0 ? process.argv[sourceFlag + 1] : 'worker/admin.ts';
const pepper = 'admin-company-scope-fixture';
const COOKIE = 'daenem_workforce_session';

function instantiate(source, modules) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
    if (!(specifier in modules)) throw new Error(`unexpected import ${specifier}`);
    return modules[specifier];
  });
  return loaded.exports;
}

function d1(database) {
  const statement = (sql) => ({
    sql,
    values: [],
    bind(...values) { this.values = values; return this; },
    async first() { return database.prepare(sql).get(...this.values) ?? null; },
    async all() { return { success: true, results: database.prepare(sql).all(...this.values) }; },
    async run() { const r = database.prepare(sql).run(...this.values); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: statement,
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const out = statements.map(({ sql, values }) => ({ success: true, meta: { changes: Number(database.prepare(sql).run(...values).changes) } }));
        database.exec('COMMIT');
        return out;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}

const [authSource, scopedSource, adminSource, ...migrations] = await Promise.all([
  read('worker/auth.ts'), read('worker/scoped-settings.ts'), read(sourcePath),
  ...['0001_core', '0002_identity_auth', '0019_employee_permission_overrides_v2', '0071_multi_company_recovery_policy']
    .map((name) => read(`migrations/${name}.sql`)),
]);
const auth = instantiate(authSource, {});
const scoped = instantiate(scopedSource, {});
const admin = instantiate(adminSource, { './auth': auth, './scoped-settings': scoped });

const database = new DatabaseSync(':memory:');
for (const sql of migrations) database.exec(sql);
const env = { APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: d1(database) };
const run = (sql, ...values) => database.prepare(sql).run(...values);
const one = (sql, ...values) => database.prepare(sql).get(...values);
const many = (sql, ...values) => database.prepare(sql).all(...values);

// ---- fixtures -------------------------------------------------------------------------------
run("INSERT INTO companies(id,code,name,business_type) VALUES('co-a','QA-A','QA Company A','other'),('co-b','QA-B','QA Company B','other')");
run("INSERT INTO company_locations(id,company_id,name) VALUES('loc-a','co-a','QA Site A'),('loc-b','co-b','QA Site B')");
run(`INSERT INTO roles(id,company_id,code,name) VALUES
  ('role-qa-settings-admin',NULL,'qa_settings_admin','QA Settings Admin'),
  ('role-qa-security-viewer',NULL,'qa_security_viewer','QA Security Viewer'),
  ('role-qa-fake-group-admin','co-a','group_admin','Company-level role reusing the group_admin code')`);
const grantPermission = (id, roleId, code, level) => run(
  'INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT ?,?,id,? FROM permissions WHERE code=?', id, roleId, level, code);
grantPermission('rp-qa-settings', 'role-qa-settings-admin', 'settings.access', 'manage');
grantPermission('rp-qa-security', 'role-qa-security-viewer', 'security.access', 'view');
grantPermission('rp-qa-fake-ga', 'role-qa-fake-group-admin', 'settings.access', 'manage');
grantPermission('rp-qa-real-ga', 'role-group-admin', 'settings.access', 'manage');
assert.equal(one("SELECT COUNT(*) AS n FROM role_permissions WHERE id IN ('rp-qa-settings','rp-qa-security','rp-qa-fake-ga')").n, 3, 'fixture permissions exist');
// Group-wide keys of each class, so read-projection checks are meaningful.
for (const [key, value, type] of [['security.login_location_mode', 'record', 'string'], ['communications.kill_switch', 'false', 'boolean'],
  ['ai.smart_exception_detection', 'true', 'boolean'], ['ui.default_theme', 'lagos-sunrise', 'string'], ['notifications.role_data_reminders', 'true', 'boolean']]) {
  run('INSERT INTO app_settings(setting_key,setting_value,value_type) VALUES(?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,value_type=excluded.value_type', key, value, type);
}

const people = {
  owner: ['emp-owner', ['co-a']], mgrA: ['emp-mgr-a', ['co-a', 'co-b']], mgrB: ['emp-mgr-b', ['co-b']],
  viewerA: ['emp-viewer-a', ['co-a']], fakeGA: ['emp-fake-ga', ['co-a']], realGA: ['emp-real-ga', ['co-a']],
  staleGA: ['emp-stale-ga', ['co-a']], movedGA: ['emp-moved-ga', ['co-a', 'co-b']], stale: ['emp-stale', ['co-a']],
};
const tokens = {};
for (const [key, [id, companies]] of Object.entries(people)) {
  run('INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES(?,?,?,?,?)', id, `QA-${key}`, `QA ${key}`, `${key.toLowerCase()}@example.test`, 'active');
  companies.forEach((companyId, index) => run('INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,?,1)', `m-${id}-${companyId}`, id, companyId, index === 0 ? 1 : 0));
  tokens[key] = `token-${key}`;
  run("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 day'))", `s-${id}`, id, createHash('sha256').update(`${tokens[key]}:${pepper}`).digest('hex'));
}
const grant = (id, employeeId, companyId, roleId) => run('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)', id, employeeId, companyId, roleId);
grant('er-owner', 'emp-owner', 'co-a', 'role-owner');
grant('er-mgr-a', 'emp-mgr-a', 'co-a', 'role-qa-settings-admin');
grant('er-mgr-b', 'emp-mgr-b', 'co-b', 'role-qa-settings-admin');
grant('er-viewer-a', 'emp-viewer-a', 'co-a', 'role-qa-security-viewer');
grant('er-fake-ga', 'emp-fake-ga', 'co-a', 'role-qa-fake-group-admin');
grant('er-real-ga', 'emp-real-ga', 'co-a', 'role-group-admin');
grant('er-stale-ga', 'emp-stale-ga', 'co-a', 'role-group-admin');
// movedGA: Group Admin assigned through co-a, also a settings admin in co-b. Removing the co-a membership
// must withdraw group authority even though the co-b settings role keeps the session admin-capable.
grant('er-moved-ga', 'emp-moved-ga', 'co-a', 'role-group-admin');
grant('er-moved-ga-settings-b', 'emp-moved-ga', 'co-b', 'role-qa-settings-admin');
grant('er-stale', 'emp-stale', 'co-a', 'role-qa-settings-admin');

// ---- helpers --------------------------------------------------------------------------------
async function call(actor, method, path, body) {
  const request = new Request(`https://staffportal.test${path}`, {
    method,
    headers: { cookie: `${COOKIE}=${tokens[actor]}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = await auth.getSessionContext(request, env);
  assert.ok(context, `${actor} has a valid fixture session`);
  const response = await admin.routeAdmin(request, env, context);
  assert.ok(response, `${method} ${path} is handled`);
  return { status: response.status, body: await response.json() };
}
const configure = (actor, locationId) => call(actor, 'POST', '/api/admin/locations/configure', {
  locationId, latitude: 6.5244, longitude: 3.3792, radiusM: 4000, requireClockGeofence: false, requireClockInPhoto: false, allowOfflineAttendance: true,
});
const listLocations = (actor) => call(actor, 'GET', '/api/admin/locations');
const readSettings = (actor) => call(actor, 'GET', '/api/admin/settings');
const updateGlobal = (actor) => call(actor, 'POST', '/api/admin/settings', { settings: { 'security.login_location_mode': 'off' } });
const saveScoped = (actor, companyIds) => call(actor, 'POST', '/api/admin/scoped-settings', {
  settingKey: scoped.RECOVERY_SETTING_KEY, value: 'email', scope: 'companies', companyIds,
});

const GROUP_ONLY = /^(security|communications|ai)\./;
const locationState = (locationId) => JSON.stringify({
  location: one('SELECT latitude,longitude,geofence_radius_m FROM company_locations WHERE id=?', locationId),
  policies: many('SELECT require_clock_geofence,require_clock_in_photo,allow_offline_attendance,geofence_radius_m FROM attendance_policies WHERE location_id=? ORDER BY id', locationId),
});
const settingsState = () => JSON.stringify(many('SELECT setting_key,setting_value FROM app_settings ORDER BY setting_key'));
const scopedState = () => JSON.stringify(many('SELECT setting_key,scope_type,scope_id,setting_value FROM admin_scoped_settings ORDER BY setting_key,scope_type,scope_id'));
const denials = (employeeId) => one("SELECT COUNT(*) AS n FROM security_logs WHERE employee_id=? AND event_type='location_configuration_denied' AND result='denied'", employeeId).n;
const listedCompanies = (response) => new Set((response.body.locations || []).map((row) => row.companyId));

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); } catch (error) { results.push([name, false, error.message.split('\n')[0]]); }
}
async function assertLocationDenied(actor, locationId) {
  const before = locationState(locationId);
  const logsBefore = denials(people[actor][0]);
  const response = await configure(actor, locationId);
  assert.equal(response.status, 404, `expected neutral 404, got ${response.status}`);
  assert.deepEqual(response.body, { error: 'Work location not found.' });
  assert.equal(locationState(locationId), before, 'geofence and attendance policy unchanged');
  assert.equal(denials(people[actor][0]), logsBefore + 1, 'denial recorded against the actor');
}
async function assertGroupWriteRefused(actor) {
  const before = settingsState();
  assert.equal((await updateGlobal(actor)).status, 403);
  assert.equal(settingsState(), before, 'group-wide settings unchanged');
}

// ---- denied (must not write) ----------------------------------------------------------------
await check('A-settings manager (also B member) cannot weaken B attendance geofence', () => assertLocationDenied('mgrA', 'loc-b'));
await check('B-only manager cannot reconfigure A location', () => assertLocationDenied('mgrB', 'loc-a'));
await check('unknown location gets the identical neutral response', async () => {
  const unknown = await configure('mgrA', 'loc-does-not-exist');
  const foreign = await configure('mgrA', 'loc-b');
  assert.equal(unknown.status, 404);
  assert.deepEqual(unknown.body, foreign.body);
});
await check('view-only security user cannot configure own-company location', async () => {
  const before = locationState('loc-a');
  assert.equal((await configure('viewerA', 'loc-a')).status, 403);
  assert.equal(locationState('loc-a'), before);
});
await check('location list excludes companies without admin view', async () => {
  const a = listedCompanies(await listLocations('mgrA'));
  assert.ok(a.has('co-a') && !a.has('co-b'), 'A manager sees A only');
  const b = listedCompanies(await listLocations('mgrB'));
  assert.ok(b.has('co-b') && !b.has('co-a'), 'B manager sees B only');
});
await check('single-company manager cannot read group security, communications or AI settings', async () => {
  for (const actor of ['mgrA', 'viewerA', 'fakeGA']) {
    const response = await readSettings(actor);
    assert.equal(response.status, 200, `${actor} may still open admin setup`);
    const leaked = Object.keys(response.body.settings || {}).filter((key) => GROUP_ONLY.test(key));
    assert.deepEqual(leaked, [], `${actor} must not read ${leaked.join(', ')}`);
    assert.equal(response.body.settings['ui.default_theme'], 'lagos-sunrise', `${actor} still reads presentation settings`);
  }
});
await check('company manager cannot change group-wide settings', () => assertGroupWriteRefused('mgrA'));
await check('company-level role reusing group_admin code cannot change group-wide settings', () => assertGroupWriteRefused('fakeGA'));
await check('Group Admin whose role assignment was withdrawn loses group authority', async () => {
  run("DELETE FROM employee_roles WHERE id='er-stale-ga'");
  await assertGroupWriteRefused('staleGA');
});
await check('Group Admin whose membership in the role company ended loses group authority', async () => {
  run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-moved-ga' AND company_id='co-a'");
  await assertGroupWriteRefused('movedGA');
  const leaked = Object.keys((await readSettings('movedGA')).body.settings || {}).filter((key) => GROUP_ONLY.test(key));
  assert.deepEqual(leaked, [], 'no longer reads group-only settings either');
});
await check('A manager cannot write B company-scoped settings', async () => {
  const before = scopedState();
  // B-only: nothing authorized remains (400). Mixed A+B: an unauthorized company is named (403). Neither writes.
  assert.ok([400, 403].includes((await saveScoped('mgrA', ['co-b'])).status), 'B-only request refused');
  assert.equal((await saveScoped('mgrA', ['co-a', 'co-b'])).status, 403, 'mixed A+B request refused as a whole');
  assert.equal(scopedState(), before);
});
await check('withdrawn grant is refused at request time with no writes', async () => {
  run("DELETE FROM employee_roles WHERE id='er-stale'");
  const before = locationState('loc-a');
  assert.equal((await configure('stale', 'loc-a')).status, 403);
  assert.equal(locationState('loc-a'), before);
});

// ---- authorized (must still work) -----------------------------------------------------------
await check('A manager can configure own-company location', async () => {
  assert.equal((await configure('mgrA', 'loc-a')).status, 200);
  assert.equal(one("SELECT geofence_radius_m AS r FROM company_locations WHERE id='loc-a'").r, 4000);
});
await check('A manager can save own-company scoped settings', async () => {
  assert.equal((await saveScoped('mgrA', ['co-a'])).status, 200);
  assert.ok(one("SELECT 1 AS ok FROM admin_scoped_settings WHERE scope_type='company' AND scope_id='co-a'"));
});
await check('Owner and current Group Admin read every group-wide setting', async () => {
  for (const actor of ['owner', 'realGA']) {
    const settings = (await readSettings(actor)).body.settings || {};
    for (const key of ['security.login_location_mode', 'communications.kill_switch', 'ai.smart_exception_detection']) {
      assert.ok(key in settings, `${actor} reads ${key}`);
    }
  }
});
await check('Owner can configure any company location and list all', async () => {
  assert.equal((await configure('owner', 'loc-b')).status, 200);
  const all = listedCompanies(await listLocations('owner'));
  assert.ok(all.has('co-a') && all.has('co-b'));
});
await check('Owner can change group-wide settings', async () => {
  assert.equal((await updateGlobal('owner')).status, 200);
  assert.equal(one("SELECT setting_value AS v FROM app_settings WHERE setting_key='security.login_location_mode'").v, 'off');
});
await check('current group-level Group Admin can change group-wide settings', async () => {
  run("UPDATE app_settings SET setting_value='record' WHERE setting_key='security.login_location_mode'");
  assert.equal((await updateGlobal('realGA')).status, 200);
  assert.equal(one("SELECT setting_value AS v FROM app_settings WHERE setting_key='security.login_location_mode'").v, 'off');
});

// ---- summary --------------------------------------------------------------------------------
database.close();
const failed = results.filter(([, ok]) => !ok);
for (const [name, ok, reason] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${reason}`}`);
console.log(`Admin company scope (${sourcePath}): ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;
