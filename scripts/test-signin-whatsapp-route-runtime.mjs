import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE whatsapp_auth_challenges(
    id TEXT PRIMARY KEY,purpose TEXT,employee_id TEXT,signup_verification_id TEXT,
    company_id TEXT,normalized_phone TEXT,contact_revision INTEGER,code_hash TEXT,
    attempts INTEGER,max_attempts INTEGER,transaction_context_json TEXT,expires_at TEXT,
    consumed_at TEXT
  );
  CREATE TABLE employee_verified_contacts(
    id TEXT,employee_id TEXT,company_id TEXT,contact_type TEXT,normalized_value TEXT,
    revision INTEGER,revoked_at TEXT,verified_at TEXT
  );
  CREATE TABLE employee_credentials(employee_id TEXT,username TEXT,failed_attempts INTEGER,locked_until TEXT,last_login_at TEXT,updated_at TEXT);
  CREATE TABLE employees(
    id TEXT,employee_no TEXT,display_name TEXT,email TEXT,phone TEXT,job_title TEXT,
    department TEXT,employment_status TEXT,preferred_theme TEXT
  );
  CREATE TABLE auth_sessions(
    id TEXT PRIMARY KEY,employee_id TEXT,token_hash TEXT,device_id TEXT,device_name TEXT,
    user_agent TEXT,ip_address TEXT,login_latitude REAL,login_longitude REAL,
    login_accuracy_m REAL,login_location_label TEXT,login_geofence_result TEXT,
    expires_at TEXT,revoked_at TEXT,last_seen_at TEXT
  );
  CREATE TABLE app_settings(setting_key TEXT,setting_value TEXT);
  CREATE TABLE security_logs(
    id TEXT,employee_id TEXT,company_id TEXT,session_id TEXT,event_type TEXT,
    severity TEXT,result TEXT,ip_address TEXT,user_agent TEXT,latitude REAL,
    longitude REAL,accuracy_m REAL,location_label TEXT,risk_score REAL,details_json TEXT
  );
  CREATE TABLE employee_preferences(employee_id TEXT,theme TEXT,timezone TEXT);
  CREATE TABLE employee_devices(id TEXT,employee_id TEXT,device_fingerprint TEXT,device_name TEXT,platform TEXT,user_agent TEXT,last_seen_at TEXT);
  CREATE TABLE employee_company_memberships(employee_id TEXT,company_id TEXT,active INTEGER,is_primary INTEGER,location_id TEXT);
  CREATE TABLE companies(id TEXT,code TEXT,name TEXT,active INTEGER);
  CREATE TABLE employee_roles(employee_id TEXT,role_id TEXT,company_id TEXT);
  CREATE TABLE roles(id TEXT,code TEXT,name TEXT,company_id TEXT,active INTEGER,is_system INTEGER);
  CREATE TABLE role_permissions(role_id TEXT,permission_id TEXT,access_level TEXT);
  CREATE TABLE permissions(id TEXT,code TEXT);
  CREATE TABLE employee_permission_overrides(employee_id TEXT,permission_id TEXT,access_level TEXT,expires_at TEXT);
  CREATE TABLE employee_permission_overrides_v2(employee_id TEXT,company_id TEXT,permission_id TEXT,access_level TEXT,expires_at TEXT);
  INSERT INTO employees(id,employee_no,display_name,email,phone,employment_status) VALUES
    ('employee-a','E001','Ada Staff','ada@example.test','+2348000000000','active');
  INSERT INTO employee_credentials(employee_id,username,failed_attempts) VALUES('employee-a','ada',4);
  INSERT INTO employee_verified_contacts(id,employee_id,company_id,contact_type,normalized_value,revision,verified_at)
    VALUES('contact-a','employee-a','company-a','phone','+2348000000000',1,CURRENT_TIMESTAMP);
  INSERT INTO companies(id,code,name,active) VALUES('company-a','TECH','DAENEM Printing & Technology',1);
  INSERT INTO employee_company_memberships(employee_id,company_id,active,is_primary) VALUES('employee-a','company-a',1,1);
`);

const migrations = new Map();
function compile(file) {
  if (migrations.has(file)) return migrations.get(file);
  const sourceText = sources.get(file);
  if (!sourceText) throw new Error(`Missing fixture source ${file}`);
  const source = ts.transpileModule(sourceText, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', source)(module.exports, requireFrom(file), module);
  migrations.set(file, module.exports);
  return module.exports;
}

const sources = new Map([
  ['worker/auth.ts', await readFile(new URL('../worker/auth.ts', import.meta.url), 'utf8')],
  ['worker/whatsapp-auth.ts', await readFile(new URL('../worker/whatsapp-auth.ts', import.meta.url), 'utf8')],
  ['worker/password-auth.ts', await readFile(new URL('../worker/password-auth.ts', import.meta.url), 'utf8')],
]);

const auth = compile('worker/auth.ts');
const whatsapp = compile('worker/whatsapp-auth.ts');
function requireFrom(file) {
  return (specifier) => {
    const normalized = specifier.replace(/\.js$/, '');
    if (normalized === './auth' && file === 'worker/password-auth.ts') return auth;
    if (normalized === './whatsapp-auth' && file === 'worker/password-auth.ts') return whatsapp;
    if (normalized === './social-crypto' || normalized === './meta-credentials') return {};
    if (normalized === './communications/whatsapp') return { authenticationPayload: () => ({}) };
    if (normalized === './communications/policy') return {
      checkBoundary: () => undefined,
      effectivePolicy: () => ({ enabled: true, channels: ['whatsapp'] }),
    };
    if (normalized === './communications-repository') return {
      communicationBoundary: async () => ({}),
      communicationScope: (companyId) => ({ companyId }),
      loadPolicySnapshot: async () => ({}),
      reserveCapacity: async () => true,
    };
    if (normalized === './whatsapp-recovery') return {
      startPasswordRecoveryWhatsApp: async () => { throw new Error('not used'); },
      verifyPasswordRecoveryWhatsApp: async () => { throw new Error('not used'); },
    };
    // This is an existing LOGIN test; company-free RECOVERY is separately
    // exercised against the real resolver in test-identity-only-recovery.mjs.
    if (normalized === './recovery-company-resolution') return {
      resolveRecoveryCompanyForIdentifier: async () => {
        throw new Error('Recovery must not execute during WhatsApp sign-in verification');
      },
    };
    if (normalized === './scoped-settings') return {
      RECOVERY_SETTING_KEY: 'unused', recoveryMethods: () => [], resolveScopedSetting: async () => ({ value: {} }),
    };
    throw new Error(`Unexpected import ${specifier} from ${file}`);
  };
}

const prepared = (sql) => ({
  sql,
  args: [],
  bind(...args) { this.args = args; return this; },
  first() { return this._run('get'); },
  all() { return { results: this._run('all') }; },
  run() { return Promise.resolve().then(() => ({ meta: { changes: this._run('run').changes } })); },
  _run(mode) {
    const statement = db.prepare(this.sql);
    const result = mode === 'get' ? statement.get(...this.args)
      : mode === 'all' ? statement.all(...this.args)
      : (statement.run(...this.args), { changes: db.prepare('SELECT changes() AS changes').get().changes });
    return result;
  },
});
const env = {
  DB: {
    prepare: prepared,
    batch(statements) {
      db.exec('BEGIN');
      try {
        for (const statement of statements) statement._run('run');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  },
  APP_NAME: 'DAENEM Staff Portal',
  APP_STAGE: 'stage',
  AUTH_PEPPER: 'non-production-fixture-pepper',
};

const route = compile('worker/password-auth.ts').routePasswordAuth;
const getSessionContext = auth.getSessionContext;
const code = '123456';
const challengeId = 'challenge-a';
const codeHash = async (id, value) => {
  const input = `whatsapp-auth:signin_step_up:${id}:${value}:${env.AUTH_PEPPER}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
function resetChallenge({ id = challengeId, employeeId = 'employee-a', expires = new Date(Date.now() + 60_000).toISOString() } = {}) {
  db.prepare('DELETE FROM whatsapp_auth_challenges').run();
  db.prepare('DELETE FROM auth_sessions').run();
  db.prepare('DELETE FROM security_logs').run();
  db.prepare(`INSERT INTO whatsapp_auth_challenges
    (id,purpose,employee_id,company_id,normalized_phone,contact_revision,code_hash,attempts,max_attempts,transaction_context_json,expires_at)
    VALUES(?, 'signin_step_up', ?, 'company-a', '+2348000000000', 1, ?, 0, 6, ?, ?)`)
    .run(id, employeeId, 'pending-hash', JSON.stringify({ deviceFingerprint: 'fixture-device' }), expires);
}
async function setChallengeHash(id = challengeId) {
  db.prepare('UPDATE whatsapp_auth_challenges SET code_hash=? WHERE id=?').run(await codeHash(id, code), id);
}
const request = (id = challengeId) => new Request('https://staffportal.test/api/auth/login/verify-whatsapp', {
  method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'StaffPortal-runtime-fixture', 'x-request-id': 'signin-runtime-fixture' },
  body: JSON.stringify({ challengeId: id, code }),
});
const verify = (id = challengeId) => route(request(id), env);
const cookieToken = (response) => {
  const cookie = response.headers.get('set-cookie') || '';
  const match = cookie.match(/daenem_workforce_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

// Cookie-to-session continuity, derived-token persistence and canonical lookup.
resetChallenge(); await setChallengeHash();
let response = await verify();
assert.equal(response.status, 200);
const token = cookieToken(response);
assert.ok(token, 'successful route returns the HttpOnly session cookie');
const persisted = db.prepare('SELECT token_hash,expires_at FROM auth_sessions').get();
assert.notEqual(persisted.token_hash, token, 'raw cookie token is never persisted');
const tokenDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:${env.AUTH_PEPPER}`));
const derivedHash = [...new Uint8Array(tokenDigest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
assert.equal(persisted.token_hash, derivedHash);
const authenticated = await getSessionContext(new Request('https://staffportal.test/api/auth/me', { headers: { cookie: `daenem_workforce_session=${encodeURIComponent(token)}` } }), env);
assert.equal(authenticated?.employee.id, 'employee-a');
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM security_logs WHERE event_type=?').get('password_signin_whatsapp_stepup_success').count, 1);
console.log('PASS WhatsApp success cookie authenticates through canonical hashed-session lookup; raw token absent from storage');

// A consumed challenge cannot issue another session.
response = await verify();
assert.equal(response.status, 401);
assert.equal(cookieToken(response), null);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 1);
console.log('PASS replayed WhatsApp challenge is denied without a second session');

// Expired challenges and ineligible employee states fail before session creation.
resetChallenge({ expires: new Date(Date.now() - 60_000).toISOString() }); await setChallengeHash();
response = await verify();
assert.equal(response.status, 401);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0);
console.log('PASS expired WhatsApp challenge is denied');

resetChallenge(); await setChallengeHash();
db.prepare("UPDATE employees SET employment_status='inactive' WHERE id='employee-a'").run();
response = await verify();
assert.equal(response.status, 403);
assert.equal(cookieToken(response), null);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0);
db.prepare("UPDATE employees SET employment_status='active' WHERE id='employee-a'").run();
console.log('PASS inactive employee cannot obtain a session');

resetChallenge({ employeeId: 'employee-without-credentials' }); await setChallengeHash();
db.prepare(`INSERT INTO employee_verified_contacts(id,employee_id,company_id,contact_type,normalized_value,revision,verified_at)
  VALUES('contact-no-credentials','employee-without-credentials','company-a','phone','+2348000000000',1,CURRENT_TIMESTAMP)`).run();
response = await verify();
assert.equal(response.status, 403);
assert.equal(cookieToken(response), null);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0);
console.log('PASS employee without an eligible credential record cannot obtain a session');

// Revocation and expiry are enforced by the canonical session lookup.
resetChallenge(); await setChallengeHash(); response = await verify();
const revokedToken = cookieToken(response);
const sessionId = db.prepare('SELECT id FROM auth_sessions').get().id;
db.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').run(sessionId);
assert.equal(await getSessionContext(new Request('https://staffportal.test/api/auth/me', { headers: { cookie: `daenem_workforce_session=${revokedToken}` } }), env), null);
console.log('PASS revoked session is rejected by canonical lookup');

resetChallenge(); await setChallengeHash(); response = await verify();
const expiredToken = cookieToken(response);
db.prepare("UPDATE auth_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=(SELECT id FROM auth_sessions LIMIT 1)").run();
assert.equal(await getSessionContext(new Request('https://staffportal.test/api/auth/me', { headers: { cookie: `daenem_workforce_session=${expiredToken}` } }), env), null);
console.log('PASS expired session is rejected by canonical lookup');

// Required success audit and session creation remain fail-closed as one batch.
resetChallenge(); await setChallengeHash();
db.exec(`CREATE TRIGGER reject_signin_success_audit BEFORE INSERT ON security_logs
  WHEN NEW.event_type='password_signin_whatsapp_stepup_success'
  BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END;`);
response = await verify();
assert.equal(response.status, 503);
assert.equal(cookieToken(response), null);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0);
db.exec('DROP TRIGGER reject_signin_success_audit');
console.log('PASS required success-audit failure returns no cookie and rolls back session insertion');

resetChallenge(); await setChallengeHash();
db.exec(`CREATE TRIGGER reject_session_insert BEFORE INSERT ON auth_sessions
  BEGIN SELECT RAISE(ABORT, 'fixture session failure'); END;`);
response = await verify();
assert.equal(response.status, 503);
assert.equal(cookieToken(response), null);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM security_logs WHERE event_type='password_signin_whatsapp_stepup_success'").get().count, 0);
db.exec('DROP TRIGGER reject_session_insert');
console.log('PASS session insert failure returns no cookie and creates no success audit');

// Normal password login keeps the same derived-hash/cookie issuance boundary.
const passwordSource = sources.get('worker/password-auth.ts');
const login = passwordSource.slice(passwordSource.indexOf('async function login('), passwordSource.indexOf('\nasync function verifySigninWhatsApp'));
assert.match(login, /tokenHash\s*=\s*await sessionHash\(env,\s*token\)/);
assert.match(login, /sessionId,\s*row\.employeeId,\s*tokenHash/);
assert.match(login, /sessionCookie\(request,\s*token/);
console.log('PASS standard password login retains derived-hash persistence and cookie issuance');

db.close();
console.log('9/9 WhatsApp Sign-In route/runtime scenarios PASS');
