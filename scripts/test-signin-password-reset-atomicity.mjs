import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/auth-refinement.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', 'require', compiled)(module, module.exports, (specifier) => {
  assert.equal(specifier, './credential-security');
  return { WORKER_SAFE_PASSWORD_ITERATIONS: 8000 };
});
const { routeAuthRefinement } = module.exports;
const pepper = 'password-reset-atomicity-fixture';
const token = 'fixture-reset-token';
const tokenHash = createHash('sha256').update(`password-reset:${token}:${pepper}`).digest('hex');

class ResetFixture {
  constructor({ failAt = null, expired = false, credential = true, owner = false, beforeBatch = null } = {}) {
    this.failAt = failAt;
    this.beforeBatch = beforeBatch;
    this.challenge = { id: 'reset-a', employeeId: 'employee-a', hash: tokenHash,
      verified: true, consumedAt: null, expired };
    this.employee = { id: 'employee-a', status: 'active' };
    this.memberships = [{ employeeId: 'employee-a', companyId: 'company-a', active: true, companyActive: true }];
    this.roles = { owner };
    this.credential = credential ? { username: 'ada.staff', hash: 'old-hash', salt: 'old-salt', iterations: 1000 } : null;
    this.sessions = [
      { id: 'session-a1', employeeId: 'employee-a', revoked: false },
      { id: 'session-a2', employeeId: 'employee-a', revoked: false },
      { id: 'session-b1', employeeId: 'employee-b', revoked: false },
    ];
    this.access = credential ? [] : [{ id: 'access-a', employeeId: 'employee-a', status: 'ready', expiresAt: null }];
    this.audits = [];
    this.lock = Promise.resolve();
    this.env = {
      APP_STAGE: 'test', AUTH_PEPPER: pepper,
      DB: { prepare: (sql) => new ResetStatement(this, sql), batch: (statements) => this.batch(statements) },
    };
  }
  async batch(statements) {
    await this.beforeBatch?.(this);
    const before = structuredClone({ challenge: this.challenge, credential: this.credential,
      sessions: this.sessions, access: this.access, audits: this.audits });
    const eligible = () => ['active', 'provisional'].includes(this.employee.status)
      && (this.memberships.some((membership) => membership.active && membership.companyActive) || this.roles.owner);
    const validGrant = (id) => this.access.some((access) => access.id === id && access.employeeId === 'employee-a'
      && access.status === 'ready' && (!access.expiresAt || Date.parse(access.expiresAt) > Date.now()));
    const run = async () => {
      try {
        for (const [index, statement] of statements.entries()) {
          const sql = statement.sql.toLowerCase();
          const stage = sql.includes('update password_reset_challenges') ? 'consume'
            : sql.includes('update employee_credentials') || sql.includes('insert into employee_credentials') ? 'credential'
            : sql.includes('update auth_sessions') ? 'sessions'
            : sql.includes('update employee_login_access_requests') ? 'access'
            : sql.includes('insert into security_logs') ? 'audit'
            : sql.includes('json_extract') ? 'invariant' : `statement-${index}`;
          if (this.failAt === stage) throw new Error(`injected ${stage} failure`);
          const values = statement.values;
          if (stage === 'consume') {
            if (this.challenge && !this.challenge.consumedAt && !this.challenge.expired
              && this.challenge.id === values[1] && this.challenge.employeeId === values[2]
              && this.challenge.hash === values[3]) this.challenge.consumedAt = values[0];
          } else if (stage === 'credential') {
            const marker = sql.startsWith('update') ? values[10] : values[8];
            if (this.challenge?.consumedAt === marker && eligible()) {
              if (sql.startsWith('update') && this.credential) {
                this.credential = { ...(this.credential || {}), username: this.credential?.username || 'ada.staff',
                  hash: values[0], salt: values[1], iterations: values[2], changedAt: values[3] };
              } else if (!this.credential && (sql.includes('1=1 and exists(select 1 from employee_login_access_requests ar where ar.id')
                ? validGrant(values[11]) : this.roles.owner)) {
                this.credential = { username: values[1], hash: values[2], salt: values[3], iterations: values[4], changedAt: values[5] };
              }
            }
          } else if (stage === 'sessions') {
            for (const session of this.sessions) if (session.employeeId === values[1] && !session.revoked) session.revoked = true;
          } else if (stage === 'access') {
            for (const request of this.access) if (request.id === values[1] && request.employeeId === values[2]
              && request.status === 'ready' && (!request.expiresAt || Date.parse(request.expiresAt) > Date.now())) {
              request.status = 'activated'; request.activatedAt = values[0];
            }
          } else if (stage === 'audit') {
            this.audits.push({ id: values[0], employeeId: values[1], eventType: values[2], result: 'success' });
          } else if (stage === 'invariant') {
            const [challengeId, employeeId, suppliedHash, marker, credentialEmployee, passwordHash,
              passwordSalt, changedAt, eligibilityEmployee, sessionEmployee] = values;
            const auditIndex = values.findIndex((value) => this.audits.some((audit) => audit.id === value));
            const auditId = values[auditIndex], auditEmployee = values[auditIndex + 1], eventType = values[auditIndex + 2];
            const valid = this.challenge?.id === challengeId && this.challenge.employeeId === employeeId
              && this.challenge.hash === suppliedHash && this.challenge.consumedAt === marker
              && this.credential?.hash === passwordHash && this.credential?.salt === passwordSalt
              && this.credential?.changedAt === changedAt && credentialEmployee === employeeId
              && eligibilityEmployee === employeeId && eligible()
              && !this.sessions.some((session) => session.employeeId === sessionEmployee && !session.revoked)
              && (eventType !== 'login_access_activated' || this.access.some((access) => access.status === 'activated') || this.roles.owner)
              && this.audits.some((audit) => audit.id === auditId && audit.employeeId === auditEmployee
                && audit.eventType === eventType && audit.result === 'success');
            if (!valid) throw new Error('reset invariant failed');
          }
        }
        return statements.map(() => ({ success: true, meta: { changes: 1 } }));
      } catch (error) {
        Object.assign(this, before);
        throw error;
      }
    };
    const pending = this.lock.then(run, run);
    this.lock = pending.then(() => undefined, () => undefined);
    return pending;
  }
}

class ResetStatement {
  constructor(fixture, sql) { this.fixture = fixture; this.sql = sql; this.values = []; }
  bind(...values) {
    assert.equal(values.length, (this.sql.match(/\?/g) || []).length, `SQL binding count: ${this.sql}`);
    this.values = values;
    return this;
  }
  async first() {
    const f = this.fixture, query = this.sql.toLowerCase();
    if (query.trim().startsWith('select setting_value from app_settings')) return { setting_value: this.values[0] === 'security.password_pbkdf2_iterations' ? '1000' : this.values[0] === 'security.password_max_length' ? '128' : '10' };
    if (query.includes('from password_reset_challenges') && query.includes('reset_token_hash')) {
      return f.challenge && f.challenge.hash === this.values[0] && f.challenge.verified && !f.challenge.consumedAt && !f.challenge.expired
        && ['active', 'provisional'].includes(f.employee.status)
        && (f.memberships.some((membership) => membership.active && membership.companyActive) || f.roles.owner)
        ? { id: f.challenge.id, employeeId: f.challenge.employeeId,
          username: f.credential?.username, currentHash: f.credential?.hash,
          currentSalt: f.credential?.salt, currentIterations: f.credential?.iterations,
          email: 'ada@example.test', activationUsername: 'ada.staff', isOwner: Number(f.roles.owner) } : null;
    }
    if (query.includes('from employee_credentials') && query.includes('lower(username)')) return null;
    if (query.includes('from employee_login_access_requests')) {
      const access = f.access.find((item) => item.employeeId === this.values[0] && item.status === 'ready'
        && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
      return access ? { id: access.id } : null;
    }
    if (query.includes('select consumed_at from password_reset_challenges')) return f.challenge ? { consumed_at: f.challenge.consumedAt } : null;
    throw new Error(`Unexpected reset fixture query: ${this.sql}`);
  }
}

const request = (resetToken = token) => new Request('https://staffportal.test/api/auth/password/reset', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ resetToken, newPassword: 'NewPassw0rd!Safe' }),
});
const runReset = async (input, env) => await routeAuthRefinement(input, env) ?? new Response(
  JSON.stringify({ error: 'This password reset authorization is invalid or has expired. Start again.' }),
  { status: 401, headers: { 'content-type': 'application/json' } },
);
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); console.log(`PASS: ${name}`); };

await check('valid reset updates credentials, consumes token, revokes only target sessions and writes success audit', async () => {
  const fixture = new ResetFixture();
  const response = await runReset(request(), fixture.env);
  assert.equal(response.status, 200);
  assert.equal(fixture.challenge.consumedAt !== null, true);
  assert.notEqual(fixture.credential.hash, 'old-hash');
  assert.equal(fixture.sessions.filter((session) => session.employeeId === 'employee-a').every((session) => session.revoked), true);
  assert.equal(fixture.sessions.find((session) => session.employeeId === 'employee-b').revoked, false);
  assert.equal(fixture.audits.length, 1);
});

await check('authorized login activation inserts credentials and activates its access request atomically', async () => {
  const fixture = new ResetFixture({ credential: false });
  const response = await runReset(request(), fixture.env);
  assert.equal(response.status, 200);
  assert.equal(fixture.credential.username, 'ada.staff');
  assert.equal(fixture.credential.hash !== 'old-hash', true);
  assert.equal(fixture.access[0].status, 'activated');
  assert.equal(fixture.audits[0].eventType, 'login_access_activated');
  assert.equal(fixture.sessions.filter((session) => session.employeeId === 'employee-a').every((session) => session.revoked), true);
});

await check('Owner group authority permits credentialless activation without a login-access grant', async () => {
  const fixture = new ResetFixture({ credential: false, owner: true });
  fixture.memberships[0].active = false;
  const response = await runReset(request(), fixture.env);
  assert.equal(response.status, 200);
  assert.equal(fixture.credential.username, 'ada.staff');
  assert.equal(fixture.audits[0].eventType, 'owner_password_activation_completed');
});

await check('credentialless reset rechecks grant, employee and company eligibility inside the batch', async () => {
  const mutations = [
    ['cancelled grant', (fixture) => { fixture.access[0].status = 'cancelled'; }],
    ['expired grant', (fixture) => { fixture.access[0].expiresAt = new Date(Date.now() - 60_000).toISOString(); }],
    ['offboarded employee', (fixture) => { fixture.employee.status = 'terminated'; }],
    ['revoked company membership', (fixture) => { fixture.memberships[0].active = false; }],
  ];
  for (const [name, mutate] of mutations) {
    const fixture = new ResetFixture({ credential: false, beforeBatch: mutate });
    const response = await runReset(request(), fixture.env);
    assert.notEqual(response.status, 200, name);
    assert.equal(fixture.credential, null, name);
    assert.equal(fixture.challenge.consumedAt, null, name);
    assert.equal(fixture.audits.length, 0, name);
    assert.equal(fixture.sessions.filter((session) => session.employeeId === 'employee-a').every((session) => !session.revoked), true, name);
  }
});

await check('expired, inactive or company-unscoped reset challenges are handled with neutral denial', async () => {
  const cases = [
    new ResetFixture({ expired: true }),
    new ResetFixture(),
    new ResetFixture(),
  ];
  cases[1].employee.status = 'terminated';
  cases[2].memberships[0].active = false;
  for (const fixture of cases) {
    const response = await routeAuthRefinement(request(), fixture.env);
    assert.equal(response?.status, 401);
    assert.equal(fixture.challenge.consumedAt, null);
    assert.equal(fixture.audits.length, 0);
  }
  for (const status of ['cancelled', 'expired']) {
    const fixture = new ResetFixture({ credential: false });
    if (status === 'cancelled') fixture.access[0].status = status;
    else fixture.access[0].expiresAt = new Date(Date.now() - 60_000).toISOString();
    const response = await routeAuthRefinement(request(), fixture.env);
    assert.equal(response?.status, 401);
    assert.equal(fixture.credential, null);
    assert.equal(fixture.challenge.consumedAt, null);
  }
});

await check('revoked Owner authority cannot substitute for a stale credentialless grant', async () => {
  const fixture = new ResetFixture({ credential: false, owner: true, beforeBatch: (state) => { state.roles.owner = false; } });
  fixture.access = [];
  const response = await runReset(request(), fixture.env);
  assert.notEqual(response.status, 200);
  assert.equal(fixture.credential, null);
  assert.equal(fixture.challenge.consumedAt, null);
  assert.equal(fixture.audits.length, 0);
});

await check('invalid, expired and replayed reset tokens fail without state changes', async () => {
  for (const [fixture, suppliedToken] of [[new ResetFixture({ expired: true }), token], [new ResetFixture(), 'wrong-token']]) {
    const before = structuredClone({ challenge: fixture.challenge, credential: fixture.credential, sessions: fixture.sessions, audits: fixture.audits });
    const response = await runReset(request(suppliedToken), fixture.env);
    assert.equal(response.status, 401);
    assert.deepEqual({ challenge: fixture.challenge, credential: fixture.credential, sessions: fixture.sessions, audits: fixture.audits }, before);
  }
  const replay = new ResetFixture();
  assert.equal((await runReset(request(), replay.env)).status, 200);
  const afterSuccess = structuredClone({ challenge: replay.challenge, credential: replay.credential, sessions: replay.sessions, audits: replay.audits });
  assert.equal((await runReset(request(), replay.env)).status, 401);
  assert.deepEqual({ challenge: replay.challenge, credential: replay.credential, sessions: replay.sessions, audits: replay.audits }, afterSuccess);
});

await check('concurrent replay has exactly one winner and one success audit', async () => {
  const fixture = new ResetFixture();
  const results = await Promise.all([runReset(request(), fixture.env), runReset(request(), fixture.env)]);
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.equal(fixture.audits.length, 1);
  assert.equal(fixture.sessions.filter((session) => session.employeeId === 'employee-a').every((session) => session.revoked), true);
});

for (const stage of ['credential', 'consume', 'sessions', 'audit']) {
  await check(`forced ${stage} failure rolls back all reset state and permits retry`, async () => {
    const fixture = new ResetFixture({ failAt: stage });
    const before = structuredClone({ challenge: fixture.challenge, credential: fixture.credential, sessions: fixture.sessions, access: fixture.access, audits: fixture.audits });
    const response = await runReset(request(), fixture.env);
    assert.equal(response.status, 503);
    assert.deepEqual({ challenge: fixture.challenge, credential: fixture.credential, sessions: fixture.sessions, access: fixture.access, audits: fixture.audits }, before);
    fixture.failAt = null;
    assert.equal((await runReset(request(), fixture.env)).status, 200);
  });
}

console.log(`Password reset atomicity runtime: ${passed.length}/${passed.length} PASS`);
