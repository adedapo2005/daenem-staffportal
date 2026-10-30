#!/usr/bin/env node
/**
 * Real StaffPortal staging-entry / Workerd / D1 password eligibility regression.
 *
 * Runs the candidate's actual worker/staffportal-staging.ts entry and every
 * repository migration in a fresh disposable local database. The only seeded
 * data is synthetic employee, credential, permission and challenge fixtures.
 * No authentication/SQL mocks, hosted data, deployment, email or Meta calls.
 *
 * Usage:
 *   node scripts/test-password-application-status-workerd.mjs
 *   node /path/to/this.mjs --repo /candidate --deps-root /existing/deps/repo \
 *     --report /path/to/receipt.json
 *
 * WhatsApp fixtures represent an earlier locally issued challenge. Verification
 * uses the actual challenge hash, policy and verified-contact checks. The suite
 * never invokes challenge delivery. A valid challenge may be consumed before
 * terminal application status is denied; no unconsumed-challenge claim is made.
 */
import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  assert(index + 1 < argv.length && !argv[index + 1].startsWith('--'), name + ' requires a value');
  return argv[index + 1];
}
const knownOptions = new Set(['--repo', '--deps-root', '--report', '--timeout-ms']);
for (let i = 0; i < argv.length; i += 2) assert(knownOptions.has(argv[i]), 'Unknown option: ' + argv[i]);
const repo = path.resolve(option('--repo', process.cwd()));
const depsRoot = path.resolve(option('--deps-root', repo));
const reportPath = option('--report', null);
const timeoutMs = Number(option('--timeout-ms', '180000'));
assert(Number.isSafeInteger(timeoutMs) && timeoutMs >= 10000 && timeoutMs <= 300000,
  '--timeout-ms must be an integer from 10000 to 300000');
const requireDependency = createRequire(path.join(depsRoot, 'package.json'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const startedAt = new Date().toISOString();
const report = {
  kind: 'staffportal-password-application-status-real-staging-entry-workerd-d1',
  startedAt, ok: false, repo, runtime: {}, source: {}, migrations: [],
  checks: [], outboundRequests: [],
  boundaries: {
    actualStagingEntry: true, actualAuthHandlers: true, actualD1: true,
    actualRepositoryMigrations: true, authOrSqlMocks: false,
    hostedData: false, oauthProviderCallbacks: false, emailDelivery: false,
    whatsAppDelivery: false, locallySeededWhatsAppChallenges: true,
    fullApplicationBuild: false, officialPreProductionAcceptance: false,
    challengeConsumptionBeforeWhatsAppDenialPermitted: true,
  },
};
let mf;
let tempDir;
let currentCheck = 'initialization';
let timedOut = false;
const watchdog = setTimeout(() => {
  timedOut = true;
  console.error(JSON.stringify({ ok: false, timeout: true, currentCheck, timeoutMs }));
  void mf?.dispose().catch(() => {}).finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000).unref();
}, timeoutMs);
watchdog.unref();

async function packageVersion(name) {
  let directory = path.dirname(requireDependency.resolve(name));
  for (;;) {
    try {
      const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      if (metadata.name === name) return metadata.version;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Cannot locate metadata for ' + name);
    directory = parent;
  }
}

function redactedUrl(value) {
  try { const url = new URL(value); return url.origin + url.pathname; }
  catch { return 'unparseable URL'; }
}

async function main() {
  const sourcePaths = [
    'worker/staffportal-staging.ts', 'worker/runtime.ts', 'worker/entry.ts',
    'worker/password-auth.ts', 'worker/auth.ts', 'worker/whatsapp-auth.ts',
  ];
  report.source.entry = sourcePaths[0];
  report.source.files = [];
  for (const relative of sourcePaths) {
    report.source.files.push({
      path: relative, sha256: sha256(await readFile(path.join(repo, relative))),
    });
  }
  const { Miniflare, Log, LogLevel } = requireDependency('miniflare');
  const { build } = requireDependency('esbuild');
  const { unstable_splitSqlQuery: splitSqlQuery } = requireDependency('wrangler');
  assert.equal(typeof splitSqlQuery, 'function', 'Installed Wrangler must export unstable_splitSqlQuery');
  const miniflareVersion = await packageVersion('miniflare');
  report.runtime = {
    node: process.version, miniflare: miniflareVersion,
    esbuild: await packageVersion('esbuild'), wrangler: await packageVersion('wrangler'),
    // The repository-pinned local Workerd supports dates through 2026-08-08.
    // Match the existing auth runtime regression; do not alter deployed config.
    compatibilityDate: '2026-08-01',
  };
  const compiled = await build({
    absWorkingDir: repo,
    entryPoints: [path.join(repo, 'worker', 'staffportal-staging.ts')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    external: ['cloudflare:*'],
    write: false, logLevel: 'silent', sourcemap: false,
  });
  assert.equal(compiled.outputFiles.length, 1, 'Expected one actual staging Worker bundle');
  const script = compiled.outputFiles[0].text;
  report.source.workerBundleSha256 = sha256(script);
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'staffportal-password-status-'));
  const persistence = Number(miniflareVersion.split('.')[0]) >= 5
    ? {
        resourcePersistencePath: path.join(tempDir, 'state'),
        resourceTmpPath: path.join(tempDir, 'runtime'),
        telemetry: { enabled: false },
      }
    : { d1Persist: path.join(tempDir, 'state', 'd1') };
  const authPepper = 'synthetic-' + randomUUID();
  mf = new Miniflare({
    modules: true, script, compatibilityDate: report.runtime.compatibilityDate,
    host: '127.0.0.1', port: 0, cf: false,
    log: new Log(LogLevel.ERROR),
    d1Databases: { DB: 'password-status-disposable-' + randomUUID() },
    bindings: {
      APP_NAME: 'StaffPortal Disposable Password Regression',
      APP_STAGE: 'staging', TIMEZONE: 'Africa/Lagos',
      AUTH_PEPPER: authPepper,
      STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal-password-status.invalid',
    },
    outboundService: async request => {
      report.outboundRequests.push({ method: request.method, url: redactedUrl(request.url) });
      throw new Error('External network is forbidden in this disposable password regression');
    },
    ...persistence,
  });
  const db = await mf.getD1Database('DB');
  const migrationDir = path.join(repo, 'migrations');
  const migrationFiles = (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort();
  assert(migrationFiles.includes('0001_core.sql') && migrationFiles.includes('0010_password_credentials.sql'),
    'Expected actual StaffPortal core and password migrations');
  for (const name of migrationFiles) {
    currentCheck = 'migration ' + name;
    const sql = await readFile(path.join(migrationDir, name), 'utf8');
    const statements = splitSqlQuery(sql).map(value => value.trim()).filter(Boolean);
    try {
      if (statements.length) await db.batch(statements.map(statement => db.prepare(statement)));
    } catch (error) {
      throw new Error('Actual repository migration ' + name + ' failed: ' + error.message, { cause: error });
    }
    report.migrations.push({ name, sha256: sha256(sql), statements: statements.length });
  }
  console.log('Applied ' + report.migrations.length + ' actual repository migrations to new local D1.');
  const requiredTables = [
    'employees', 'companies', 'employee_company_memberships', 'roles', 'employee_roles',
    'permissions', 'role_permissions', 'signup_requests', 'employee_credentials',
    'auth_sessions', 'security_logs', 'employee_preferences', 'employee_devices',
    'employee_permission_overrides', 'employee_permission_overrides_v2',
    'employee_verified_contacts', 'whatsapp_auth_challenges', 'communication_policy_rules',
  ];
  const tableRows = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tables = new Set(tableRows.results.map(row => row.name));
  for (const table of requiredTables) assert(tables.has(table), 'Actual migrations did not create ' + table);

  const provisionalProfile = await db.prepare([
    'SELECT p.id AS permissionId,rp.access_level AS accessLevel',
    'FROM roles r JOIN role_permissions rp ON rp.role_id=r.id',
    'JOIN permissions p ON p.id=rp.permission_id',
    "WHERE r.id='role-provisional' AND r.active=1 AND p.code='profile.access'",
  ].join('\n')).first();
  assert(provisionalProfile, 'Actual migrations must define the Provisional Profile grant');
  assert.equal(provisionalProfile.accessLevel, 'edit', 'Use actual migration-defined Profile Edit');
  report.provisionalPolicy = { roleId: 'role-provisional', profileAccess: provisionalProfile.accessLevel };

  const runKey = randomUUID().replaceAll('-', '').slice(0, 12);
  const companyId = 'qa-password-company-' + runKey;
  const roleId = 'qa-password-role-' + runKey;
  const permissionId = 'qa-password-permission-' + runKey;
  const permissionCode = 'qa.password.' + runKey;
  await db.batch([
    db.prepare('INSERT INTO companies(id,code,name,business_type) VALUES(?,?,?,?)')
      .bind(companyId, 'QA-PASSWORD-' + runKey, 'Synthetic Password Test Company', 'printing'),
    db.prepare('INSERT INTO roles(id,company_id,code,name,active) VALUES(?,?,?,?,1)')
      .bind(roleId, companyId, 'qa-password-' + runKey, 'Synthetic Password Test Role'),
    db.prepare('INSERT INTO permissions(id,code,module,action) VALUES(?,?,?,?)')
      .bind(permissionId, permissionCode, 'qa-password', 'probe'),
    db.prepare('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)')
      .bind('qa-password-grant-' + runKey, roleId, permissionId, 'manage'),
    db.prepare("INSERT INTO app_settings(setting_key,setting_value,value_type) VALUES('security.login_location_mode','record','string') ON CONFLICT(setting_key) DO UPDATE SET setting_value='record'"),
    db.prepare("INSERT INTO app_settings(setting_key,setting_value,value_type) VALUES('communications.kill_switch','false','boolean') ON CONFLICT(setting_key) DO UPDATE SET setting_value='false'"),
    db.prepare("INSERT INTO admin_scoped_settings(id,setting_key,scope_type,scope_id,setting_value,value_type) VALUES(?,'communications.whatsapp_enabled','company',?,'true','boolean')")
      .bind('qa-password-whatsapp-setting-' + runKey, companyId),
    db.prepare([
      'INSERT INTO communication_policy_rules',
      '(id,company_id,module,event_id,enabled,ai_enabled,auto_generate,auto_send,require_human_approval,channels_json,languages_json,max_characters)',
      "VALUES(?,?,'identity','identity.signin_verification',1,0,0,0,0,'[\"whatsapp\"]','[\"en\"]',1000)",
    ].join('\n')).bind('qa-password-policy-' + runKey, companyId),
  ]);

  let fixtureNumber = 0;
  async function fixture(status, employeeStatus = 'provisional') {
    fixtureNumber += 1;
    const key = runKey + '-' + fixtureNumber;
    const employeeId = 'qa-password-employee-' + key;
    const email = 'qa-password-' + key + '@example.test';
    const username = 'qa.' + runKey + '.' + fixtureNumber;
    const password = 'Synthetic-Only!' + randomUUID();
    const salt = randomUUID();
    const iterations = 1000;
    // Exact production formula; low stored iterations apply only to disposable fixtures.
    const passwordHash = pbkdf2Sync(password + '\0' + authPepper, salt, iterations, 32, 'sha256').toString('hex');
    const requestId = status === null ? null : 'qa-password-signup-' + key;
    const statements = [
      db.prepare('INSERT INTO employees(id,display_name,legal_name,email,employment_status) VALUES(?,?,?,?,?)')
        .bind(employeeId, 'Synthetic Password Applicant', 'Synthetic Password Applicant', email, employeeStatus),
      db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,1,1)')
        .bind('qa-password-membership-' + key, employeeId, companyId),
      db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)')
        .bind('qa-password-employee-role-' + key, employeeId, companyId, roleId),
      db.prepare([
        'INSERT INTO employee_credentials',
        '(employee_id,username,password_hash,password_salt,password_iterations,email_verified_at,failed_attempts)',
        'VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,2)',
      ].join('\n')).bind(employeeId, username, passwordHash, salt, iterations),
    ];
    if (requestId) statements.push(
      db.prepare('INSERT INTO signup_requests(id,employee_id,requested_company_id,requested_role_text,status) VALUES(?,?,?,?,?)')
        .bind(requestId, employeeId, companyId, 'Local Registration', status),
    );
    if (employeeStatus === 'provisional') statements.push(
      db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)')
        .bind('qa-password-provisional-role-' + key, employeeId, companyId, 'role-provisional'),
      db.prepare('INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level,reason,granted_by) VALUES(?,?,?,?,?,?,?)')
        .bind('qa-password-legacy-override-' + key, employeeId, companyId, permissionId, 'manage', 'Synthetic privilege boundary', employeeId),
      db.prepare('INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES(?,?,?,?,?,?,?)')
        .bind('qa-password-scoped-override-' + key, employeeId, companyId, permissionId, 'manage', 'Synthetic privilege boundary', employeeId),
      db.prepare('INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES(?,?,?,?,?,?,?)')
        .bind('qa-password-profile-override-' + key, employeeId, companyId, provisionalProfile.permissionId, 'manage', 'Must not elevate seeded Profile Edit', employeeId),
    );
    await db.batch(statements);
    return { employeeId, email, username, password, requestId, employeeStatus, fixtureNumber };
  }

  async function statusOf(person, status) {
    assert(person.requestId, 'Status change requires a signup request fixture');
    const result = await db.prepare('UPDATE signup_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(status, person.requestId).run();
    assert.equal(Number(result.meta.changes), 1);
  }

  async function snapshot(person) {
    const [sessions, credential, devices, audits] = await Promise.all([
      db.prepare('SELECT id,revoked_at FROM auth_sessions WHERE employee_id=? ORDER BY id').bind(person.employeeId).all(),
      db.prepare('SELECT failed_attempts,locked_until,last_login_at,updated_at FROM employee_credentials WHERE employee_id=?')
        .bind(person.employeeId).first(),
      db.prepare('SELECT id FROM employee_devices WHERE employee_id=? ORDER BY id').bind(person.employeeId).all(),
      db.prepare([
        'SELECT id,event_type,result FROM security_logs WHERE employee_id=?',
        "AND event_type IN ('password_signin_success','password_signin_whatsapp_stepup_success') ORDER BY id",
      ].join('\n')).bind(person.employeeId).all(),
    ]);
    return { sessions: sessions.results, credential, devices: devices.results, successAudits: audits.results };
  }

  async function http(endpoint, body, cookie) {
    const headers = { 'user-agent': 'StaffPortal Disposable Password Workerd Regression' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const response = await mf.dispatchFetch('https://staffportal-password-status.invalid' + endpoint, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const content = await response.text();
    let json;
    try { json = JSON.parse(content); }
    catch { throw new Error(endpoint + ' returned non-JSON HTTP ' + response.status); }
    assert.equal(report.outboundRequests.length, 0, 'Handler attempted an external network request');
    return { status: response.status, body: json, cookie: response.headers.get('set-cookie'),
      runtime: response.headers.get('x-staffportal-auth-runtime') };
  }

  function login(person, useUsername = false, password = person.password) {
    return http('/api/auth/login', {
      identifier: useUsername ? person.username : person.email, password,
      deviceFingerprint: 'qa-password-device-' + person.fixtureNumber,
      deviceName: 'Disposable Password Regression',
    });
  }

  function assertContext(context, person) {
    assert.equal(context?.employee?.id, person.employeeId, 'Authenticated employee must match fixture');
    assert.equal(context?.employee?.status, person.employeeStatus);
    if (person.employeeStatus === 'provisional') {
      assert.deepEqual(context.roles.map(role => role.id), ['role-provisional'],
        'Pending workspace must ignore separately assigned privileged role');
      assert.equal(context.permissions['profile.access'], provisionalProfile.accessLevel);
      assert.equal(context.companyPermissions[companyId]['profile.access'], provisionalProfile.accessLevel);
      assert.equal(context.permissions[permissionCode] || 'none', 'none');
      assert.equal(context.companyPermissions[companyId][permissionCode] || 'none', 'none');
    } else {
      assert.equal(context.permissions[permissionCode], 'manage');
      assert.equal(context.companyPermissions[companyId][permissionCode], 'manage');
    }
  }

  async function acceptSession(response, person) {
    assert.equal(response.status, 200, 'Positive-control login must return HTTP 200');
    assert.equal(response.body.ok, true);
    assert.match(response.cookie || '', /daenem_workforce_session=/);
    assert.match(response.cookie || '', /HttpOnly/i);
    assert.match(response.cookie || '', /Secure/i);
    assert.equal(response.runtime, 'worker-password-auth-v1', 'Response must pass actual staging entry');
    const cookie = response.cookie.split(';')[0];
    const me = await http('/api/auth/me', undefined, cookie);
    assert.equal(me.status, 200, 'Positive-control cookie must resolve authenticated context');
    assert.equal(me.body.authenticated, true);
    assertContext(me.body.context, person);
    return cookie;
  }

  async function seedWhatsAppChallenge(person) {
    const challengeId = 'qa-password-whatsapp-' + randomUUID();
    const code = '614729';
    const phone = '+234800' + String(person.fixtureNumber).padStart(7, '0');
    const digest = sha256('whatsapp-auth:signin_step_up:' + challengeId + ':' + code + ':' + authPepper);
    await db.batch([
      db.prepare([
        'INSERT INTO employee_verified_contacts',
        '(id,employee_id,company_id,contact_type,normalized_value,revision,verified_method)',
        "VALUES(?,?,?,'phone',?,1,'synthetic-local-fixture')",
      ].join('\n')).bind('qa-password-contact-' + randomUUID(), person.employeeId, companyId, phone),
      db.prepare([
        'INSERT INTO whatsapp_auth_challenges',
        '(id,purpose,employee_id,company_id,normalized_phone,contact_revision,code_hash,transaction_context_json,expires_at)',
        "VALUES(?,'signin_step_up',?,?,?,1,?,?,?)",
      ].join('\n')).bind(challengeId, person.employeeId, companyId, phone, digest,
        JSON.stringify({ locationResult: 'not_required', deviceName: 'Disposable WhatsApp Verification' }),
        new Date(Date.now() + 600000).toISOString()),
    ]);
    return { challengeId, code };
  }

  function delta(before, after) {
    return {
      sessionDelta: after.sessions.length - before.sessions.length,
      credentialMetadataChanged: JSON.stringify(after.credential) !== JSON.stringify(before.credential),
      deviceDelta: after.devices.length - before.devices.length,
      successAuditDelta: after.successAudits.length - before.successAudits.length,
    };
  }

  async function check(name, fn) {
    currentCheck = name;
    const item = { name, passed: false };
    try {
      await fn(item);
      item.passed = true;
      console.log('PASS: ' + name);
    } catch (error) {
      item.error = String(error.message);
      console.error('FAIL: ' + name + ': ' + item.error);
    }
    report.checks.push(item);
  }

  await check('actual staging entry retires legacy OTP request and verification endpoints', async item => {
    const request = await http('/api/auth/request', {});
    const verify = await http('/api/auth/verify', {});
    item.observed = { requestStatus: request.status, verifyStatus: verify.status };
    assert.equal(request.status, 410);
    assert.equal(verify.status, 410);
    assert.equal(request.runtime, 'worker-password-auth-v1');
  });

  for (const [status, employeeStatus, label] of [
    ['pending', 'provisional', 'pending restricted applicant'],
    ['approved', 'active', 'approved active employee'],
    [null, 'active', 'active employee without signup request'],
  ]) {
    await check(label + ': email and username password sign-in remain usable', async item => {
      const person = await fixture(status, employeeStatus);
      await acceptSession(await login(person), person);
      await acceptSession(await login(person, true), person);
      const state = await snapshot(person);
      item.observed = { sessions: state.sessions.length, successAudits: state.successAudits.length };
      assert.equal(state.sessions.length, 2);
      assert.equal(state.successAudits.length, 2);
      assert.equal(state.credential.failed_attempts, 0);
    });
  }

  for (const employeeStatus of ['provisional', 'active']) {
    for (const status of ['rejected', 'cancelled', 'expired']) {
      await check(employeeStatus + ' ' + status + ': password denial has no session or success metadata', async item => {
        const person = await fixture(status, employeeStatus);
        const before = await snapshot(person);
        const response = await login(person);
        const me = response.cookie
          ? await http('/api/auth/me', undefined, response.cookie.split(';')[0]) : null;
        const after = await snapshot(person);
        item.expected = { status: 401, cookiePresent: false, sessionDelta: 0,
          credentialMetadataChanged: false, deviceDelta: 0, successAuditDelta: 0 };
        item.observed = {
          status: response.status, cookiePresent: Boolean(response.cookie), ...delta(before, after),
          followingMeStatus: me?.status ?? null,
        };
        assert.equal(response.status, 401, 'Terminal application must not return successful password sign-in');
        assert.equal(response.cookie, null, 'Terminal application must not receive a session cookie');
        assert.equal(response.body.error, 'The username/email or password is incorrect.',
          'Preserve the existing generic sign-in denial');
        assert(JSON.stringify(after) === JSON.stringify(before),
          'Denied sign-in must preserve sessions, credential metadata, devices and success audits');
      });
    }
  }

  for (const employeeStatus of ['provisional', 'active']) {
    for (const status of ['rejected', 'cancelled', 'expired']) {
      await check(employeeStatus + ' to ' + status + ': earlier password cookie loses context', async item => {
        const person = await fixture(employeeStatus === 'provisional' ? 'pending' : 'approved', employeeStatus);
        const cookie = await acceptSession(await login(person), person);
        await statusOf(person, status);
        const before = await snapshot(person);
        const response = await http('/api/auth/me', undefined, cookie);
        const after = await snapshot(person);
        item.observed = { status: response.status, authenticated: response.body.authenticated,
          cookiePresent: Boolean(response.cookie), ...delta(before, after) };
        assert.equal(response.status, 401);
        assert.equal(response.body.authenticated, false);
        assert.equal(Object.hasOwn(response.body, 'context'), false);
        assert.equal(response.cookie, null);
        assert(JSON.stringify(after) === JSON.stringify(before),
          'Context rejection must not mutate login metadata or create successful login records');
      });
    }
  }

  await check('wrong password remains a generic denial with no usable session', async item => {
    const person = await fixture('pending', 'provisional');
    const response = await login(person, false, 'Wrong-Synthetic-Password');
    const state = await snapshot(person);
    item.observed = { status: response.status, sessions: state.sessions.length,
      successAudits: state.successAudits.length };
    assert.equal(response.status, 401);
    assert.equal(response.cookie, null);
    assert.equal(response.body.error, 'The username/email or password is incorrect.');
    assert.equal(state.sessions.length, 0);
    assert.equal(state.successAudits.length, 0);
    assert.equal(state.credential.failed_attempts, 3, 'Existing wrong-password counter remains effective');
  });

  for (const employeeStatus of ['provisional', 'active']) {
    await check(employeeStatus + ': real locally seeded WhatsApp verification remains usable', async item => {
      const person = await fixture(employeeStatus === 'provisional' ? 'pending' : 'approved', employeeStatus);
      const challenge = await seedWhatsAppChallenge(person);
      const response = await http('/api/auth/login/verify-whatsapp', challenge);
      await acceptSession(response, person);
      const state = await snapshot(person);
      item.observed = { status: response.status, sessions: state.sessions.length,
        successAudits: state.successAudits.length };
      assert.equal(state.sessions.length, 1);
      assert.equal(state.successAudits.length, 1);
    });
    for (const status of ['rejected', 'cancelled', 'expired']) {
      await check(employeeStatus + ' to ' + status + ': earlier WhatsApp challenge cannot create login', async item => {
        const person = await fixture(employeeStatus === 'provisional' ? 'pending' : 'approved', employeeStatus);
        const challenge = await seedWhatsAppChallenge(person);
        await statusOf(person, status);
        const before = await snapshot(person);
        const response = await http('/api/auth/login/verify-whatsapp', challenge);
        const me = response.cookie
          ? await http('/api/auth/me', undefined, response.cookie.split(';')[0]) : null;
        const after = await snapshot(person);
        item.expected = { status: 403, cookiePresent: false, sessionDelta: 0,
          credentialMetadataChanged: false, deviceDelta: 0, successAuditDelta: 0 };
        item.observed = { status: response.status, cookiePresent: Boolean(response.cookie),
          ...delta(before, after), followingMeStatus: me?.status ?? null };
        assert.equal(response.status, 403, 'Terminal application must not pass WhatsApp sign-in');
        assert.equal(response.cookie, null);
        assert.equal(response.body.error, 'This employee login is not available.');
        assert(JSON.stringify(after) === JSON.stringify(before),
          'Denied WhatsApp sign-in must preserve sessions, credential metadata, devices and success audits');
      });
    }
  }

  assert.equal(report.checks.length, 25, 'Expected complete password and WhatsApp status matrix');
  assert.equal(report.outboundRequests.length, 0);
  report.ok = report.checks.every(item => item.passed);
  if (!report.ok) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  report.error = { check: currentCheck, message: String(error.message) };
  console.error('ERROR ' + currentCheck + ': ' + error.message);
  process.exitCode = 1;
} finally {
  if (mf) {
    try { await mf.dispose(); }
    catch (error) {
      report.ok = false;
      report.cleanupError = String(error.message);
      process.exitCode = 1;
    }
  }
  if (tempDir) {
    try { await rm(tempDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }); }
    catch (error) {
      report.ok = false;
      report.cleanupError = String(error.message);
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  report.elapsedMs = Date.parse(report.finishedAt) - Date.parse(startedAt);
  report.passed = report.checks.filter(item => item.passed).length;
  report.failed = report.checks.filter(item => !item.passed).length;
  report.expectedChecks = 25;
  if (timedOut) report.ok = false;
  if (reportPath) {
    const destination = path.resolve(reportPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({
    ok: report.ok, passed: report.passed, failed: report.failed,
    expectedChecks: report.expectedChecks, migrations: report.migrations.length,
    outboundRequests: report.outboundRequests.length, elapsedMs: report.elapsedMs,
    actualEntry: report.source.entry, source: report.source.files,
    error: report.error, cleanupError: report.cleanupError,
    report: reportPath ? path.resolve(reportPath) : null,
  }));
  clearTimeout(watchdog);
}
