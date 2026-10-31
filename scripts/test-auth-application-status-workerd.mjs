#!/usr/bin/env node
/**
 * Real Workerd + D1 regression for the merged provisional-workspace policy.
 * Pending Google, Microsoft and local applicants retain restricted workspace
 * access; rejected/cancelled/expired applications must not issue usable logins.
 * Intended repository path: scripts/test-auth-application-status-workerd.mjs
 *
 * Usage:
 *   node scripts/test-auth-application-status-workerd.mjs
 *   node /path/to/this.mjs --repo /isolated/candidate --deps-root /existing/deps/repo
 *
 * Reads the candidate's actual worker/auth.ts and every migrations/*.sql file.
 * Uses Miniflare's local D1 implementation, actual routeAuth HTTP handlers, and
 * real crypto. No auth/SQL mocks, Wrangler configuration, hosted DB, credentials,
 * email service, Cloudflare API, deployment or external network requests.
 * All D1 state is confined to a fresh system temporary directory and removed.
 *
 * The actual routeAuth endpoints are /api/auth/request, /api/auth/verify and
 * /api/auth/me. The test deliberately does not invent /api/auth/signin aliases.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  assert(index + 1 < argv.length && !argv[index + 1].startsWith('--'), `${name} requires a value`);
  return argv[index + 1];
}
const knownOptions = new Set(['--repo', '--deps-root', '--report', '--timeout-ms']);
for (let i = 0; i < argv.length; i += 2) assert(knownOptions.has(argv[i]), `Unknown option: ${argv[i]}`);
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
  kind: 'staffportal-auth-application-status-provisional-v2-real-workerd-d1',
  startedAt, ok: false, repo, runtime: {}, source: {}, migrations: [],
  checks: [], outboundRequests: [],
  boundaries: {
    actualAuthHandlers: true, actualD1: true, actualRepositoryMigrations: true,
    hostedData: false, oauthProviderCallbacks: false, emailDelivery: false,
    fullApplicationBuild: false, officialPreProductionAcceptance: false,
  },
};
let mf;
let tempDir;
let currentCheck = 'initialization';
let timedOut = false;
const watchdog = setTimeout(() => {
  timedOut = true;
  console.error(JSON.stringify({ ok: false, timeout: true, currentCheck, timeoutMs }));
  // This process owns only its new local runtime/database. Bound a stuck runtime.
  void mf?.dispose().catch(() => {}).finally(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000).unref();
}, timeoutMs);
watchdog.unref();

async function packageVersion(name) {
  // Do not depend on whether a package exposes package.json in its exports map.
  let directory = path.dirname(requireDependency.resolve(name));
  for (;;) {
    try {
      const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      if (metadata.name === name) return metadata.version;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate metadata for ${name}`);
    directory = parent;
  }
}

async function main() {
  const authPath = path.join(repo, 'worker', 'auth.ts');
  const authSource = await readFile(authPath, 'utf8');
  report.source = { path: 'worker/auth.ts', sha256: sha256(authSource) };
  const { Miniflare, Log, LogLevel } = requireDependency('miniflare');
  const { build } = requireDependency('esbuild');
  // Use Wrangler's existing SQLite-aware splitter, including CREATE TRIGGER
  // bodies. Importing this utility does not invoke its CLI or read a config.
  const { unstable_splitSqlQuery: splitSqlQuery } = requireDependency('wrangler');
  assert.equal(typeof splitSqlQuery, 'function', 'Installed Wrangler must export unstable_splitSqlQuery');
  const miniflareVersion = await packageVersion('miniflare');
  report.runtime = {
    node: process.version, miniflare: miniflareVersion,
    esbuild: await packageVersion('esbuild'), wrangler: await packageVersion('wrangler'),
    compatibilityDate: '2026-08-01',
  };
  const compiled = await build({
    stdin: {
      contents: `import { routeAuth } from './worker/auth.ts';
import { createProvisionalWorkspaceSession } from './worker/provisional-workspace-session.ts';
export default { async fetch(request, env) {
  // Test-only local Workerd endpoint; this wrapper is never deployed.
  if (new URL(request.url).pathname === '/__probe__/provisional-issue') {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    const employeeId = request.headers.get('x-probe-employee-id');
    const method = request.headers.get('x-probe-method');
    if (!employeeId || !['google', 'microsoft', 'local', 'whatsapp'].includes(method)) {
      return new Response('Invalid local probe', { status: 400 });
    }
    const limited = await createProvisionalWorkspaceSession(request, env, employeeId, method);
    return new Response(JSON.stringify({ ok: !!limited, access: limited?.access || null }), {
      status: limited ? 200 : 403,
      headers: { 'content-type': 'application/json',
        ...(limited ? { 'set-cookie': limited.cookie } : {}) },
    });
  }
  return (await routeAuth(request, env)) ?? new Response('No auth route', { status: 404 });
}};`,
      resolveDir: repo, sourcefile: 'auth-status-workerd-wrapper.ts', loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    write: false, logLevel: 'silent', sourcemap: false,
  });
  assert.equal(compiled.outputFiles.length, 1, 'Expected one local Worker bundle');
  const script = compiled.outputFiles[0].text;
  report.source.workerBundleSha256 = sha256(script);
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'staffportal-auth-status-'));
  const persistence = Number(miniflareVersion.split('.')[0]) >= 5
    ? {
        resourcePersistencePath: path.join(tempDir, 'state'),
        resourceTmpPath: path.join(tempDir, 'runtime'),
        telemetry: { enabled: false },
      }
    : { d1Persist: path.join(tempDir, 'state', 'd1') };
  mf = new Miniflare({
    modules: true, script, compatibilityDate: report.runtime.compatibilityDate,
    host: '127.0.0.1', port: 0, cf: false,
    log: new Log(LogLevel.ERROR),
    d1Databases: { DB: `auth-status-disposable-${randomUUID()}` },
    bindings: {
      APP_NAME: 'StaffPortal Disposable Auth Regression',
      APP_STAGE: 'staging',
      AUTH_PEPPER: `synthetic-${randomUUID()}`,
      // No AUTH_DELIVERY_URL: bootstrap OTPs remain local to this test process.
    },
    outboundService: async request => {
      report.outboundRequests.push({ method: request.method, url: request.url });
      throw new Error('External network is forbidden in this disposable auth regression');
    },
    ...persistence,
  });
  const db = await mf.getD1Database('DB');
  const migrationDir = path.join(repo, 'migrations');
  const migrationFiles = (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort();
  assert(migrationFiles.includes('0001_core.sql') && migrationFiles.includes('0002_identity_auth.sql'),
    'Expected actual StaffPortal core and authentication migrations');
  for (const name of migrationFiles) {
    currentCheck = `migration ${name}`;
    const sql = await readFile(path.join(migrationDir, name), 'utf8');
    const statements = splitSqlQuery(sql).map(value => value.trim()).filter(Boolean);
    try {
      if (statements.length) await db.batch(statements.map(statement => db.prepare(statement)));
    } catch (error) {
      throw new Error(`Actual repository migration ${name} failed: ${error.message}`, { cause: error });
    }
    report.migrations.push({ name, sha256: sha256(sql), statements: statements.length });
  }
  console.log(`Applied ${report.migrations.length} actual repository migrations to a new local D1 database.`);
  const requiredTables = [
    'employees', 'companies', 'employee_company_memberships', 'roles',
    'employee_roles', 'permissions', 'role_permissions', 'signup_requests',
    'auth_challenges', 'auth_sessions', 'security_logs', 'employee_preferences',
    'employee_permission_overrides', 'employee_permission_overrides_v2',
  ];
  const tableRows = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tables = new Set(tableRows.results.map(row => row.name));
  for (const table of requiredTables) assert(tables.has(table), `Actual migrations did not create ${table}`);

  // Consume the real migration-defined Provisional role and Profile grant.
  // Never fabricate replacement role/permission definitions for this control.
  const provisionalProfile = await db.prepare(`
    SELECT p.id AS permissionId,rp.access_level AS accessLevel
    FROM roles r JOIN role_permissions rp ON rp.role_id=r.id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE r.id='role-provisional' AND r.active=1 AND p.code='profile.access'
  `).first();
  assert(provisionalProfile, 'Actual migrations must define the Provisional Profile grant');
  assert.equal(provisionalProfile.accessLevel, 'edit', 'Use the actual migration-defined Profile Edit grant');
  report.provisionalPolicy = {
    roleId: 'role-provisional', profileAccess: provisionalProfile.accessLevel,
    pendingOrigins: ['google', 'microsoft', 'local'],
  };

  const runKey = randomUUID().replaceAll('-', '').slice(0, 12);
  const companyId = `qa-auth-company-${runKey}`;
  const roleId = `qa-auth-role-${runKey}`;
  const permissionId = `qa-auth-permission-${runKey}`;
  const permissionCode = `qa.auth.${runKey}`;
  await db.batch([
    db.prepare('INSERT INTO companies(id,code,name,business_type) VALUES(?,?,?,?)')
      .bind(companyId, `QA-AUTH-${runKey}`, 'Synthetic Auth Test Company', 'printing'),
    db.prepare('INSERT INTO roles(id,company_id,code,name,active) VALUES(?,?,?,?,1)')
      .bind(roleId, companyId, `qa-auth-${runKey}`, 'Synthetic Auth Test Role'),
    db.prepare('INSERT INTO permissions(id,code,module,action) VALUES(?,?,?,?)')
      .bind(permissionId, permissionCode, 'qa-auth', 'probe'),
    db.prepare('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)')
      .bind(`qa-auth-grant-${runKey}`, roleId, permissionId, 'manage'),
    db.prepare("INSERT INTO app_settings(setting_key,setting_value,value_type) VALUES('security.login_location_mode','record','string') ON CONFLICT(setting_key) DO UPDATE SET setting_value='record'"),
  ]);
  let fixtureNumber = 0;
  async function fixture(origin, status, employeeStatus = 'provisional') {
    fixtureNumber += 1;
    const key = `${runKey}-${fixtureNumber}`;
    const employeeId = `qa-auth-employee-${key}`;
    const email = `qa-auth-${key}@example.test`;
    const requestId = status === null ? null : `qa-auth-signup-${key}`;
    const requestedRole = origin === 'local' ? 'Local Registration'
      : origin === null ? null : `Social Applicant: ${origin}`;
    const statements = [
      db.prepare('INSERT INTO employees(id,display_name,legal_name,email,employment_status) VALUES(?,?,?,?,?)')
        .bind(employeeId, 'Synthetic Auth Applicant', 'Synthetic Auth Applicant', email, employeeStatus),
      db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,1,1)')
        .bind(`qa-auth-membership-${key}`, employeeId, companyId),
      db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)')
        .bind(`qa-auth-employee-role-${key}`, employeeId, companyId, roleId),
    ];
    if (requestId) statements.push(db.prepare(
      'INSERT INTO signup_requests(id,employee_id,requested_company_id,requested_role_text,status) VALUES(?,?,?,?,?)',
    ).bind(requestId, employeeId, companyId, requestedRole, status));
    if (employeeStatus === 'provisional') statements.push(
      db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)')
        .bind(`qa-auth-provisional-role-${key}`, employeeId, companyId, 'role-provisional'),
      // These deliberately over-privileged assignments must never escape the
      // Provisional-role boundary, even when present in the actual database.
      db.prepare('INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level,reason,granted_by) VALUES(?,?,?,?,?,?,?)')
        .bind(`qa-auth-legacy-override-${key}`, employeeId, companyId, permissionId, 'manage', 'Synthetic positive override boundary', employeeId),
      db.prepare('INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES(?,?,?,?,?,?,?)')
        .bind(`qa-auth-scoped-override-${key}`, employeeId, companyId, permissionId, 'manage', 'Synthetic positive override boundary', employeeId),
      db.prepare('INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES(?,?,?,?,?,?,?)')
        .bind(`qa-auth-profile-override-${key}`, employeeId, companyId, provisionalProfile.permissionId, 'manage', 'Must not elevate seeded Profile Edit', employeeId),
    );
    await db.batch(statements);
    return { employeeId, email, requestId, employeeStatus };
  }
  async function statusOf(person, status) {
    assert(person.requestId, 'Cannot change status for an employee without a signup request');
    const result = await db.prepare('UPDATE signup_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(status, person.requestId).run();
    assert.equal(Number(result.meta.changes), 1);
  }
  async function snapshot(person, ignoreHeartbeat = false) {
    const [challenges, sessions] = await Promise.all([
      db.prepare('SELECT * FROM auth_challenges WHERE employee_id=? ORDER BY id').bind(person.employeeId).all(),
      db.prepare('SELECT * FROM auth_sessions WHERE employee_id=? ORDER BY id').bind(person.employeeId).all(),
    ]);
    return {
      challenges: challenges.results,
      sessions: sessions.results.map(row => {
        const copy = { ...row };
        // getSessionContext records last_seen_at before resolving status. This
        // heartbeat is permitted only for /me; every other field stays exact.
        if (ignoreHeartbeat) delete copy.last_seen_at;
        return copy;
      }),
    };
  }
  async function http(endpoint, body, cookie) {
    const headers = { 'user-agent': 'StaffPortal Disposable Workerd Auth Regression' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const response = await mf.dispatchFetch(`https://staffportal-auth-status.invalid${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); }
    catch { throw new Error(`${endpoint} returned non-JSON HTTP ${response.status}: ${text.slice(0, 240)}`); }
    assert.equal(report.outboundRequests.length, 0, 'Handler attempted an external network request');
    return { status: response.status, body: json, cookie: response.headers.get('set-cookie') };
  }
  async function requestCode(person) {
    const response = await http('/api/auth/request', { identity: person.email, channel: 'email' });
    assert.equal(response.status, 200, `Positive-control OTP request: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.ok, true);
    assert.equal(typeof response.body.challengeId, 'string');
    assert.match(String(response.body.bootstrapCode), /^\d{6}$/);
    assert.equal(response.body.delivered, false, 'No email service should be involved');
    return { challengeId: response.body.challengeId, code: response.body.bootstrapCode };
  }
  function assertContext(context, person) {
    assert.equal(context?.employee?.id, person.employeeId);
    assert.equal(context?.employee?.status, person.employeeStatus);
    if (person.employeeStatus === 'provisional') {
      assert.deepEqual(context.roles.map(role => role.id), ['role-provisional'],
        'Pending workspace must ignore the separately assigned privileged role');
      assert.equal(context.permissions['profile.access'], provisionalProfile.accessLevel);
      assert.equal(context.companyPermissions[companyId]['profile.access'], provisionalProfile.accessLevel);
      assert.equal(context.permissions[permissionCode] || 'none', 'none',
        'Privileged role and positive global/scoped overrides must not add access');
      assert.equal(context.companyPermissions[companyId][permissionCode] || 'none', 'none');
    } else {
      assert.equal(context?.permissions?.[permissionCode], 'manage');
      assert.equal(context?.companyPermissions?.[companyId]?.[permissionCode], 'manage');
    }
  }
  async function signIn(person) {
    const challenge = await requestCode(person);
    const response = await http('/api/auth/verify', challenge);
    assert.equal(response.status, 200, `Positive-control OTP verify: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.ok, true);
    assertContext(response.body.context, person);
    assert.match(response.cookie || '', /daenem_workforce_session=/);
    assert.match(response.cookie || '', /HttpOnly/i);
    const cookie = response.cookie.split(';')[0];
    const me = await http('/api/auth/me', undefined, cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.authenticated, true);
    assertContext(me.body.context, person);
    return cookie;
  }
  async function check(name, fn) {
    currentCheck = name;
    await fn();
    report.checks.push({ name, passed: true });
    console.log(`PASS ${report.checks.length}: ${name}`);
  }

  const denialCases = [
    ...['google', 'microsoft', 'local'].flatMap(origin =>
      ['rejected', 'cancelled', 'expired'].map(status => ({ origin, status }))),
  ];
  for (const { origin, status } of denialCases) {
    await check(`${origin} ${status}: OTP request denied without challenge/session mutation`, async () => {
      const person = await fixture(origin, status);
      const before = await snapshot(person);
      const response = await http('/api/auth/request', { identity: person.email, channel: 'email' });
      assert.equal(response.status, 403, JSON.stringify(response.body));
      assert.equal(response.cookie, null);
      assert.equal(Object.hasOwn(response.body, 'bootstrapCode'), false);
      assert.equal(Object.hasOwn(response.body, 'challengeId'), false);
      assert.deepEqual(await snapshot(person), before);
    });
    await check(`${origin} pending to ${status}: earlier valid OTP denied without consumption/session mutation`, async () => {
      const person = await fixture(origin, 'pending');
      const challenge = await requestCode(person);
      await statusOf(person, status);
      const before = await snapshot(person);
      const response = await http('/api/auth/verify', challenge);
      assert.equal(response.status, 403, JSON.stringify(response.body));
      assert.equal(response.cookie, null);
      assert.deepEqual(await snapshot(person), before);
    });
    await check(`${origin} pending to ${status}: existing restricted cookie denied on next request`, async () => {
      const person = await fixture(origin, 'pending');
      const cookie = await signIn(person);
      await statusOf(person, status);
      const before = await snapshot(person, true);
      const response = await http('/api/auth/me', undefined, cookie);
      assert.equal(response.status, 401, JSON.stringify(response.body));
      assert.equal(response.body.authenticated, false);
      assert.equal(Object.hasOwn(response.body, 'context'), false);
      assert.equal(response.cookie, null);
      assert.deepEqual(await snapshot(person, true), before);
    });
  }
  const positiveCases = [
    { origin: 'google', status: 'approved', employeeStatus: 'active', name: 'approved Google employee' },
    { origin: 'microsoft', status: 'approved', employeeStatus: 'active', name: 'approved Microsoft employee' },
    { origin: 'local', status: 'approved', employeeStatus: 'active', name: 'approved local employee' },
    { origin: 'google', status: 'pending', employeeStatus: 'provisional', name: 'pending Google applicant with restricted workspace' },
    { origin: 'microsoft', status: 'pending', employeeStatus: 'provisional', name: 'pending Microsoft applicant with restricted workspace' },
    { origin: 'local', status: 'pending', employeeStatus: 'provisional', name: 'pending local applicant' },
    { origin: null, status: null, employeeStatus: 'active', name: 'active employee without signup request' },
  ];
  for (const { origin, status, employeeStatus, name } of positiveCases) {
    await check(`${name}: real OTP and session access preserved`, async () => {
      await signIn(await fixture(origin, status, employeeStatus));
    });
  }
  for (const origin of ['google', 'microsoft', 'local']) {
    await check(`${origin} approved active employee: existing cookie denied after rejection`, async () => {
      const person = await fixture(origin, 'approved', 'active');
      const cookie = await signIn(person);
      await statusOf(person, 'rejected');
      const before = await snapshot(person, true);
      const response = await http('/api/auth/me', undefined, cookie);
      assert.equal(response.status, 401, JSON.stringify(response.body));
      assert.equal(response.body.authenticated, false);
      assert.equal(Object.hasOwn(response.body, 'context'), false);
      assert.deepEqual(await snapshot(person, true), before);
    });
    await check(`${origin} pending to approved: same cookie re-evaluates authorized employee role`, async () => {
      const person = await fixture(origin, 'pending');
      const cookie = await signIn(person);
      // Model the existing management approval state transition using real D1.
      // This tests the next session read, not the management approval endpoint.
      await db.batch([
        db.prepare("UPDATE signup_requests SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(person.requestId),
        db.prepare("UPDATE employees SET employment_status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(person.employeeId),
        db.prepare("DELETE FROM employee_roles WHERE employee_id=? AND role_id='role-provisional'").bind(person.employeeId),
      ]);
      person.employeeStatus = 'active';
      const before = await snapshot(person, true);
      const response = await http('/api/auth/me', undefined, cookie);
      assert.equal(response.status, 200);
      assert.equal(response.body.authenticated, true);
      assertContext(response.body.context, person);
      assert.equal(response.body.context.roles.some(role => role.id === 'role-provisional'), false);
      assert.equal(response.body.context.roles.some(role => role.id === roleId), true);
      assert.deepEqual(await snapshot(person, true), before);
    });
  }
  // Run the repaired OAuth callback handoff against REAL local Workerd/D1,
  // not just the SQLite batch simulator used by the faster unit tests.
  async function issueProvisional(person, method) {
    const response = await mf.dispatchFetch('https://staffportal-auth-status.invalid/__probe__/provisional-issue', {
      method: 'POST',
      headers: {
        'x-probe-employee-id': person.employeeId,
        'x-probe-method': method,
        'user-agent': 'Disposable StaffPortal Provisional Workerd Test',
      },
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie'),
    };
  }
  for (const method of ['google', 'microsoft', 'local', 'whatsapp']) {
    await check(`${method} pending applicant: real Workerd D1 batch issues restricted audited cookie`, async () => {
      const person = await fixture(method, 'pending');
      const before = await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE employee_id=?')
        .bind(person.employeeId).first();
      const issued = await issueProvisional(person, method);
      assert.equal(issued.status, 200, 'Verified provisional issuance must not fail after D1 commits');
      assert.equal(issued.body.ok, true);
      assert.equal(issued.body.access, 'provisional');
      assert.match(issued.cookie || '', /daenem_workforce_session=/);
      assert.match(issued.cookie || '', /HttpOnly/);
      assert.match(issued.cookie || '', /Secure/);
      const sessionRows = await db.prepare('SELECT id,expires_at FROM auth_sessions WHERE employee_id=?')
        .bind(person.employeeId).all();
      assert.equal(sessionRows.results.length, Number(before.n) + 1);
      const audits = await db.prepare(
        "SELECT session_id,details_json FROM security_logs WHERE employee_id=? AND event_type='provisional_workspace_session'",
      ).bind(person.employeeId).all();
      assert.equal(audits.results.length, 1);
      assert.equal(audits.results[0].session_id, sessionRows.results[0].id);
      assert.equal(JSON.parse(audits.results[0].details_json).method, method);
      const me = await http('/api/auth/me', undefined, issued.cookie.split(';')[0]);
      assert.equal(me.status, 200, 'Real provisional cookie must resolve authenticated workspace');
      assert.equal(me.body.authenticated, true);
      assertContext(me.body.context, person);
    });
  }
  await check('Explicit Profile Edit denial: real Workerd D1 creates no provisional session', async () => {
    const person = await fixture('google', 'pending');
    await db.prepare(`
      INSERT INTO employee_permission_overrides_v2(
        id,employee_id,company_id,permission_id,access_level,reason,assigned_by
      ) VALUES(?,?,?,?,?,?,?)
    `).bind(`qa-auth-deny-${runKey}`,person.employeeId,companyId,
      provisionalProfile.permissionId,'none','Synthetic denial',person.employeeId).run();
    const issued = await issueProvisional(person, 'google');
    assert.equal(issued.status, 403);
    assert.equal(issued.cookie, null);
    const sessions = await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE employee_id=?')
      .bind(person.employeeId).first();
    const audits = await db.prepare(
      "SELECT COUNT(*) AS n FROM security_logs WHERE employee_id=? AND event_type='provisional_workspace_session'",
    ).bind(person.employeeId).first();
    assert.equal(Number(sessions.n), 0);
    assert.equal(Number(audits.n), 0);
  });
  assert.equal(report.checks.length, 45);
  assert.equal(report.outboundRequests.length, 0);
  report.ok = true;
}

try {
  await main();
} catch (error) {
  report.error = { check: currentCheck, message: String(error.message), stack: String(error.stack) };
  console.error(`FAIL ${currentCheck}: ${error.message}`);
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
  report.passed = report.checks.length;
  report.expectedChecks = 45;
  if (timedOut) report.ok = false;
  if (reportPath) {
    const destination = path.resolve(reportPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report));
  clearTimeout(watchdog);
}
