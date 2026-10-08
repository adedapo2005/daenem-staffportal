import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/auth-refinement.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const { routeAuthRefinement } = module.exports;

class SignupFixture {
  constructor({ employee = null, credential = false, pending = null, sendFails = false } = {}) {
    this.employee = employee;
    this.credential = credential;
    this.pending = pending;
    this.sendFails = sendFails;
    this.verifications = new Map();
    this.securityEvents = [];
    this.credentialWrites = 0;
    this.deliveryCode = null;
    this.env = {
      APP_STAGE: 'bootstrap',
      AUTH_PEPPER: 'non-production-signup-runtime-fixture',
      DB: { prepare: (sql) => new SignupStatement(this, sql) },
      EMAIL: { send: async (message) => {
        if (this.sendFails) throw new Error('stubbed delivery failure');
        this.deliveryCode = message.text.match(/Code: (\d{6})/)?.[1] || null;
        return { messageId: 'stubbed-message' };
      } },
    };
  }
}

class SignupStatement {
  constructor(fixture, sql) { this.fixture = fixture; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    const f = this.fixture, q = this.sql.toLowerCase();
    if (q.includes('from app_settings')) return null;
    if (q.includes('from employee_credentials') && q.includes('lower(username)')) {
      return f.credential && this.values[0].toLowerCase() === f.employee?.username?.toLowerCase()
        ? { employee_id: f.employee.id } : null;
    }
    if (q.includes('from employees e where lower(e.email)')) {
      const [email, phoneGuard, phone] = this.values;
      const matched = f.employee && (f.employee.email.toLowerCase() === email.toLowerCase()
        || (phoneGuard !== '' && f.employee.phone === phone));
      return matched ? { id: f.employee.id, email: f.employee.email, phone: f.employee.phone,
        status: f.employee.status || 'active', ownerRole: f.employee.owner ? 'role-owner' : null } : null;
    }
    if (q.includes('from employee_credentials') && q.includes('where employee_id')) {
      return f.credential && this.values[0] === f.employee?.id ? { employee_id: f.employee.id } : null;
    }
    if (q.includes('from employee_company_memberships')) return f.employee ? { id: 'company-a', code: 'TECH' } : null;
    if (q.includes('from companies where code')) return { id: 'company-a', code: 'TECH' };
    if (q.includes('from signup_verifications') && q.includes('lower(username)')) {
      return f.pending && f.pending.username.toLowerCase() === this.values[0].toLowerCase()
        ? { id: 'pending-1', email: f.pending.email } : null;
    }
    if (q.includes('from signup_verifications sv')) {
      const row = f.verifications.get(this.values[0]);
      return row ? { ...row, existingStatus: f.employee?.status || null } : null;
    }
    if (q.includes('from employee_credentials') && q.includes('employee_id')) {
      return f.credential && this.values[0] === f.employee?.id ? { employee_id: f.employee.id } : null;
    }
    throw new Error(`Unexpected fixture query: ${this.sql}`);
  }
  async run() {
    const f = this.fixture, q = this.sql.toLowerCase();
    if (q.includes('insert into employee_credentials')) f.credentialWrites++;
    if (q.includes('delete from signup_verifications where lower(email)')) {
      for (const [id, row] of f.verifications) if (row.email.toLowerCase() === this.values[0].toLowerCase()) f.verifications.delete(id);
      return { success: true };
    }
    if (q.includes('insert into signup_verifications')) {
      const [id, existing_employee_id, display_name, first_name, last_name, email, phone, username,
        company_id, job_title, department, requested_role_text, password_hash, password_salt,
        password_iterations, code_hash, submitted_ip, submitted_user_agent, expires_at] = this.values;
      f.verifications.set(id, { id, existing_employee_id, display_name, first_name, last_name, email,
        phone, username, company_id, job_title, department, requested_role_text, password_hash,
        password_salt, password_iterations, code_hash, submitted_ip, submitted_user_agent,
        expires_at, attempts: 0, max_attempts: 5 });
      return { success: true };
    }
    if (q.includes('delete from signup_verifications where id')) {
      f.verifications.delete(this.values[0]);
      return { success: true };
    }
    if (q.includes('insert into security_logs')) {
      f.securityEvents.push({ type: this.values[2], employeeId: this.values[1] });
      return { success: true };
    }
    if (q.includes('update signup_verifications set consumed_at')) {
      const row = f.verifications.get(this.values[0]);
      if (row) row.consumed_at = new Date().toISOString();
      return { success: true };
    }
    if (q.includes('update signup_verifications set attempts')) return { success: true };
    throw new Error(`Unexpected fixture write: ${this.sql}`);
  }
}

const base = {
  firstName: 'Ada', lastName: 'Staff', email: 'ada@example.test', phone: '+2348000000000',
  username: 'ada.staff', password: 'Passw0rd!Safe', companyCode: 'TECH',
};
const request = (body) => new Request('https://staffportal.test/api/auth/signup/start', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
async function start(fixture, body = base) {
  const response = await routeAuthRefinement(request(body), fixture.env);
  return { response, body: await response.json() };
}
const passed = [];
const check = async (name, fn) => { await fn(); passed.push(name); console.log(`PASS: ${name}`); };
const publicShape = ({ response, body }) => ({ status: response.status, keys: Object.keys(body).sort(), message: body.message });

let newApplicant;
await check('new applicant receives a verification challenge', async () => {
  newApplicant = await start(new SignupFixture());
  assert.equal(newApplicant.response.status, 200);
  assert.equal(newApplicant.body.ok, true);
  assert.ok(newApplicant.body.challengeId);
  assert.equal(newApplicant.body.bootstrapCode, undefined);
});

for (const [label, options, body] of [
  ['ordinary existing employee without credentials', { employee: { id: 'employee-1', email: base.email, phone: base.phone, username: base.username } }, base],
  ['ordinary existing credentialed employee', { employee: { id: 'employee-2', email: base.email, phone: base.phone, username: 'ada.old' }, credential: true }, { ...base, username: 'ada.new' }],
  ['protected Owner/admin account', { employee: { id: 'owner-1', email: base.email, phone: base.phone, username: 'owner.old', owner: true }, credential: true }, { ...base, username: 'owner.new' }],
  ['mixed email/phone lookup matching a protected account', { employee: { id: 'owner-2', email: 'owner@example.test', phone: base.phone, username: 'owner', owner: true }, credential: true }, { ...base, email: 'ada@example.test', username: 'ada.alt' }],
]) {
  await check(label, async () => {
    const result = await start(new SignupFixture(options), body);
    assert.equal(result.response.status, 200);
    assert.ok(result.body.challengeId);
    assert.deepEqual(publicShape(result), publicShape(newApplicant));
  });
}

await check('used username and pending username use the same neutral denial', async () => {
  const used = await start(new SignupFixture({ employee: { id: 'other', email: 'other@example.test', phone: '', username: base.username }, credential: true }));
  const pending = await start(new SignupFixture({ pending: { email: 'different@example.test', username: base.username } }));
  assert.equal(used.response.status, 409);
  assert.deepEqual(used.body, pending.body);
  assert.equal(used.body.error, 'That username is unavailable. Choose another username.');
});

await check('repeated request replaces only the caller email challenge with the same response semantics', async () => {
  const fixture = new SignupFixture();
  const first = await start(fixture);
  const second = await start(fixture);
  assert.equal(second.response.status, first.response.status);
  assert.deepEqual(Object.keys(second.body).sort(), Object.keys(first.body).sort());
  assert.notEqual(second.body.challengeId, first.body.challengeId);
  assert.equal(fixture.verifications.size, 1);
  assert.ok(fixture.verifications.has(second.body.challengeId));
});

await check('delivery failure removes the prepared challenge and returns bounded failure', async () => {
  const fixture = new SignupFixture({ sendFails: true });
  const result = await start(fixture);
  assert.equal(result.response.status, 503);
  assert.equal(fixture.verifications.size, 0);
  assert.equal(result.body.code, undefined);
});

await check('malformed request remains a bounded validation error', async () => {
  const fixture = new SignupFixture();
  const response = await routeAuthRefinement(new Request('https://staffportal.test/api/auth/signup/start', { method: 'POST', body: '{' }), fixture.env);
  assert.equal(response.status, 400);
});

await check('credentialed existing-account verification does not alter credentials and remains neutral', async () => {
  const fixture = new SignupFixture({ employee: { id: 'owner-3', email: base.email, phone: base.phone, username: base.username, owner: true }, credential: true });
  const started = await start(fixture, { ...base, username: 'owner.verify' });
  assert.match(fixture.deliveryCode || '', /^\d{6}$/);
  const verifyRequest = new Request('https://staffportal.test/api/auth/signup/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }),
  });
  const verified = await routeAuthRefinement(verifyRequest, fixture.env);
  const result = await verified.json();
  assert.equal(verified.status, 200);
  assert.deepEqual(result, { ok: true, message: 'Verification is complete. If your request is eligible, the next steps will be provided through the approved onboarding process.' });
  assert.equal(fixture.credentialWrites, 0);
  assert.equal(fixture.securityEvents.at(-1)?.type, 'signup_verified_existing_account');
});

console.log(`${passed.length}/${passed.length} PASS`);
