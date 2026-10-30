import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/auth-refinement.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
const provisionalSessions = [];
new Function('module', 'exports', 'require', compiled)(module, module.exports, (specifier) => {
  if (specifier === './credential-security') return { WORKER_SAFE_PASSWORD_ITERATIONS: 8000 };
  if (specifier === './password-auth') return { recoveryPolicyForEmployee: async () => ({}) };
  if (specifier === './whatsapp-recovery') return { startPasswordRecoveryWhatsApp: async () => null };
  if (specifier === './scoped-settings') return { recoveryMethods: () => [] };
  if (specifier === './staffportal-account-scope') return {
    staffPortalCompanyPredicate: () => '1=1', isStaffPortalCompanyId: () => true,
  };
  if (specifier === './provisional-workspace-session') return {
    createProvisionalWorkspaceSession: async (_request,_env,employeeId,method) => {
      provisionalSessions.push({ employeeId, method });
      return {
        cookie: 'daenem_workforce_session=synthetic; Path=/; Secure; HttpOnly; SameSite=Lax',
        next: '/workspace/', access: 'provisional',
      };
    },
  };
  throw new Error('Unexpected authentication dependency: ' + specifier);
});
const { routeAuthRefinement } = module.exports;

class SignupFixture {
  constructor({ employee = null, credential = false, pending = null, sendFails = false, credentialAppearsBeforeBatch = false, auditFails = false } = {}) {
    this.employee = employee;
    this.credential = credential;
    this.credentialUsername = employee?.username || null;
    this.pending = pending;
    this.sendFails = sendFails;
    this.credentialAppearsBeforeBatch = credentialAppearsBeforeBatch;
    this.auditFails = auditFails;
    this.verifications = new Map();
    this.securityEvents = [];
    this.credentialWrites = 0;
    this.membershipWrites = 0;
    this.roleWrites = 0;
    this.signupRequestWrites = 0;
    this.deliveryCode = null;
    this.env = {
      APP_STAGE: 'bootstrap',
      AUTH_PEPPER: 'non-production-signup-runtime-fixture',
      DB: { prepare: (sql) => new SignupStatement(this, sql), batch: (statements) => this.batch(statements) },
      EMAIL: { send: async (message) => {
        if (this.sendFails) throw new Error('stubbed delivery failure');
        this.deliveryCode = message.text.match(/Code: (\d{6})/)?.[1] || null;
        return { messageId: 'stubbed-message' };
      } },
    };
  }
  async batch(statements) {
    if (this.credentialAppearsBeforeBatch) {
      this.credential = true;
      this.credentialUsername = statements.find((statement) => statement.sql.toLowerCase().includes('insert into employee_credentials'))?.values[1] || null;
      this.credentialAppearsBeforeBatch = false;
    }
    const before = { employee: this.employee && { ...this.employee }, credential: this.credential,
      credentialWrites: this.credentialWrites, membershipWrites: this.membershipWrites, roleWrites: this.roleWrites,
      signupRequestWrites: this.signupRequestWrites, securityEvents: [...this.securityEvents],
      verifications: new Map([...this.verifications].map(([id, row]) => [id, { ...row }])) };
    const changes = [];
    try {
      for (const statement of statements) {
        const q = statement.sql.toLowerCase(), v = statement.values;
        if (q.startsWith('update employees set')) {
          const allowed = this.employee && this.employee.id === v[9] && !this.credential
            && this.employee.email.toLowerCase() === String(v[10]).toLowerCase();
          if (allowed) Object.assign(this.employee, { firstName: v[0], lastName: v[1], displayName: v[2], email: v[3], phone: v[4] || this.employee.phone });
          changes.push(allowed ? 1 : 0);
        } else if (q.startsWith('insert into employees')) {
          const email = v[5], phone = v[6];
          if (this.credential) changes.push(0);
          else {
            if (this.employee && (this.employee.email.toLowerCase() === String(email).toLowerCase() || (phone && this.employee.phone === phone))) throw new Error('identity conflict');
            this.employee = { id: v[0], displayName: v[1], email, phone, status: 'provisional' };
            changes.push(1);
          }
        } else if (q.startsWith('insert into employee_credentials')) {
          if (!this.credential) { this.credential = true; this.credentialWrites++; changes.push(1); }
          else if (q.includes(' select ')) changes.push(0);
          else throw new Error('credential already exists');
        } else if (q.startsWith('insert into employee_company_memberships')) {
          const inserted = Boolean(this.employee && this.credential && this.employee.id === v[1]);
          if (inserted) this.membershipWrites++;
          changes.push(inserted ? 1 : 0);
        } else if (q.startsWith('insert into employee_roles')) {
          const inserted = Boolean(this.employee && this.credential && this.employee.id === v[1]);
          if (inserted) this.roleWrites++;
          changes.push(inserted ? 1 : 0);
        } else if (q.startsWith('insert into signup_requests')) {
          const inserted = Boolean(this.employee && this.credential && this.employee.id === v[1]);
          if (inserted) this.signupRequestWrites++;
          changes.push(inserted ? 1 : 0);
        } else if (q.startsWith('update signup_verifications set consumed_at')) {
          const row = this.verifications.get(v[0]);
          if (row) row.consumed_at = new Date().toISOString();
          changes.push(row ? 1 : 0);
        } else if (q.startsWith('insert into security_logs')) {
          const challenge = this.verifications.get(v[10]);
          const inserted = v[2] !== 'signup_verified' || (this.credentialWrites > 0 && Boolean(challenge?.consumed_at));
          if (inserted && this.auditFails && v[2] === 'signup_verified') throw new Error('stubbed required audit failure');
          if (inserted) this.securityEvents.push({ type: v[2], employeeId: v[1] });
          changes.push(inserted ? 1 : 0);
        } else {
          changes.push(1);
        }
      }
      return statements.map((_, index) => ({ success: true, meta: { changes: changes[index] } }));
    } catch (error) {
      this.employee = before.employee; this.credential = before.credential;
      this.credentialWrites = before.credentialWrites; this.membershipWrites = before.membershipWrites;
      this.roleWrites = before.roleWrites; this.signupRequestWrites = before.signupRequestWrites;
      this.securityEvents = before.securityEvents;
      this.verifications = before.verifications;
      throw error;
    }
  }
}

class SignupStatement {
  constructor(fixture, sql) { this.fixture = fixture; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    const f = this.fixture, q = this.sql.toLowerCase();
    if (q.includes('from app_settings')) return null;
    if (q.includes('from employee_credentials') && q.includes('lower(username)')) {
      const claimedUsername = f.employee?.username || f.credentialUsername;
      return f.credential && this.values[0].toLowerCase() === claimedUsername?.toLowerCase()
        ? { employee_id: f.employee?.id || 'concurrent-employee' } : null;
    }
    if (q.includes('from employees e where lower(e.email)')) {
      const [email, phoneGuard, phone] = this.values;
      const matched = f.employee && (f.employee.email.toLowerCase() === email.toLowerCase()
        || (phoneGuard !== '' && f.employee.phone === phone));
      return matched ? { id: f.employee.id, email: f.employee.email, phone: f.employee.phone,
        status: f.employee.status || 'active', ownerRole: f.employee.owner ? 'role-owner' : null } : null;
    }
    if (q.includes('from employees where id=? and lower(email)=lower(?)')) {
      return f.employee && f.employee.id === this.values[0] && f.employee.email.toLowerCase() === this.values[1].toLowerCase()
        ? { id: f.employee.id, email: f.employee.email, phone: f.employee.phone, status: f.employee.status || 'active' } : null;
    }
    if (q.includes('from employees where (lower(email)=lower(?)')) {
      const [email, phoneGuard, phone, excluded, excludedAgain] = this.values;
      return f.employee && f.employee.id !== excluded && (f.employee.email.toLowerCase() === email.toLowerCase() || (phoneGuard !== '' && f.employee.phone === phone))
        ? { id: f.employee.id } : null;
    }
    if (q.includes('from employee_credentials') && q.includes('where employee_id')) {
      return f.credential && this.values[0] === f.employee?.id ? { employee_id: f.employee.id } : null;
    }
    if (q.includes('from employee_company_memberships')) return f.employee ? { id: 'company-a', code: 'TECH' } : null;
    if (q.includes('from companies where code')) return { id: 'company-a', code: 'TECH' };
    if (q.includes('from signup_verifications') && q.includes('id<>?')) {
      const [username, challengeId] = this.values;
      const other = [...f.verifications.values()].find((row) => row.id !== challengeId
        && row.username.toLowerCase() === username.toLowerCase() && !row.consumed_at);
      return other || (f.pending && f.pending.username.toLowerCase() === username.toLowerCase()
        ? { id: 'pending-1' } : null);
    }
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

await check('credentialed username fails neutrally while a pending unverified request is not a reservation', async () => {
  const usedFixture = new SignupFixture({ employee: { id: 'other', email: 'other@example.test', phone: '', username: base.username }, credential: true });
  const used = await start(usedFixture);
  assert.equal(used.response.status, 200);
  assert.deepEqual(publicShape(used), publicShape(newApplicant));
  const before = { ...usedFixture.employee };
  const verifyUsed = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: used.body.challengeId, code: usedFixture.deliveryCode }) });
  const usedResponse = await routeAuthRefinement(verifyUsed, usedFixture.env);
  assert.equal(usedResponse.status, 200);
  assert.deepEqual(await usedResponse.json(), { ok: true, message: 'Verification is complete. If your request is eligible, the next steps will be provided through the approved onboarding process.' });
  assert.deepEqual(usedFixture.employee, before);
  assert.equal(usedFixture.credentialWrites, 0);

  const pendingFixture = new SignupFixture({ pending: { email: 'different@example.test', username: base.username } });
  const pending = await start(pendingFixture);
  assert.deepEqual(publicShape(pending), publicShape(newApplicant));
  const verifyPending = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: pending.body.challengeId, code: pendingFixture.deliveryCode }) });
  const pendingResponse = await routeAuthRefinement(verifyPending, pendingFixture.env);
  assert.equal(pendingResponse.status, 200);
  const verifiedApplicant = await pendingResponse.json();
  assert.equal(verifiedApplicant.authenticated, true);
  assert.equal(verifiedApplicant.status, 'provisional');
  assert.equal(verifiedApplicant.next, '/workspace/');
  assert.match(pendingResponse.headers.get('set-cookie'), /daenem_workforce_session/);
  assert.ok(pendingFixture.employee);
  assert.equal(pendingFixture.credentialWrites, 1);
  assert.equal(pendingFixture.membershipWrites, 1);
  assert.equal(pendingFixture.roleWrites, 1);
  assert.equal(pendingFixture.signupRequestWrites, 1);
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
  assert.equal(result.body.code, 'SIGNUP_EMAIL_DELIVERY_UNAVAILABLE');
  assert.equal(Object.hasOwn(result.body, 'bootstrapCode'), false);
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

for (const [label, employee] of [
  ['credentialless employee', { id: 'employee-phone-owner', email: 'authoritative@example.test', phone: base.phone, username: 'phone.owner' }],
  ['protected credentialless Owner/admin', { id: 'owner-phone-owner', email: 'owner@example.test', phone: base.phone, username: 'owner.phone', owner: true }],
]) {
  await check(`${label} cannot be claimed through a different verified email`, async () => {
    const fixture = new SignupFixture({ employee });
    const before = { ...fixture.employee };
    await start(fixture, { ...base, username: 'applicant.phone' });
    const started = await start(fixture, { ...base, username: 'applicant.phone' });
    const challenge = fixture.verifications.get(started.body.challengeId);
    assert.equal(challenge.existing_employee_id, null);
    assert.equal(started.response.status, 200);
    assert.deepEqual(publicShape(started), publicShape(newApplicant));
    const verify = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) });
    const response = await routeAuthRefinement(verify, fixture.env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, message: 'Verification is complete. If your request is eligible, the next steps will be provided through the approved onboarding process.' });
    assert.deepEqual(fixture.employee, before);
    assert.equal(fixture.credentialWrites, 0);
    assert.equal(fixture.membershipWrites, 0);
    assert.equal(fixture.roleWrites, 0);
    assert.equal(fixture.signupRequestWrites, 0);
    assert.equal(fixture.securityEvents.some((event) => event.type === 'signup_verified'), false);
  });
}

await check('exact-email credentialless employee can complete authorized signup', async () => {
  const fixture = new SignupFixture({ employee: { id: 'employee-exact-email', email: base.email, phone: base.phone, username: 'employee.old' } });
  const started = await start(fixture);
  assert.equal(fixture.verifications.get(started.body.challengeId).existing_employee_id, 'employee-exact-email');
  const verify = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) });
  const response = await routeAuthRefinement(verify, fixture.env);
  assert.equal(response.status, 200);
  assert.equal(fixture.employee.email, base.email);
  assert.equal(fixture.credentialWrites, 1);
  assert.equal(fixture.securityEvents.filter((event) => event.type === 'signup_verified').length, 1);
});

await check('required signup success audit failure rolls back account completion and returns bounded failure', async () => {
  const fixture = new SignupFixture({ auditFails: true });
  const started = await start(fixture);
  const verify = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) });
  const response = await routeAuthRefinement(verify, fixture.env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'We could not complete account verification. Please try again.' });
  assert.equal(fixture.employee, null);
  assert.equal(fixture.credential, false);
  assert.equal(fixture.credentialWrites, 0);
  assert.equal(fixture.membershipWrites, 0);
  assert.equal(fixture.roleWrites, 0);
  assert.equal(fixture.signupRequestWrites, 0);
  assert.equal(fixture.securityEvents.some((event) => event.type === 'signup_verified'), false);
  assert.equal(fixture.verifications.get(started.body.challengeId)?.consumed_at, undefined);
});

await check('required success audit failure preserves credentialless employee state', async () => {
  const employee = { id: 'employee-audit-failure', email: base.email, phone: base.phone, username: 'employee.old' };
  const fixture = new SignupFixture({ employee: { ...employee }, auditFails: true });
  const started = await start(fixture);
  const verify = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) });
  const response = await routeAuthRefinement(verify, fixture.env);
  assert.equal(response.status, 503);
  assert.deepEqual(fixture.employee, employee);
  assert.equal(fixture.credential, false);
  assert.equal(fixture.credentialWrites, 0);
  assert.equal(fixture.securityEvents.some((event) => event.type === 'signup_verified'), false);
});

await check('identity claimed after challenge creation blocks verification without writes', async () => {
  const fixture = new SignupFixture();
  const started = await start(fixture);
  fixture.employee = { id: 'concurrent-employee', email: base.email, phone: base.phone, username: 'concurrent' };
  const before = { ...fixture.employee };
  const verify = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) });
  const response = await routeAuthRefinement(verify, fixture.env);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.employee, before);
  assert.equal(fixture.credentialWrites, 0);
  assert.equal(fixture.securityEvents.some((event) => event.type === 'signup_verified'), false);
});

await check('concurrent credential creation wins over credentialless signup claim', async () => {
  const fixture = new SignupFixture({ employee: { id: 'employee-race', email: base.email, phone: base.phone, username: 'employee.race' }, credentialAppearsBeforeBatch: true });
  const started = await start(fixture);
  const before = { ...fixture.employee };
  const verify = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) });
  const response = await routeAuthRefinement(verify, fixture.env);
  assert.equal(response.status, 200);
  assert.deepEqual(fixture.employee, before);
  assert.equal(fixture.credentialWrites, 0);
  assert.equal(fixture.securityEvents.some((event) => event.type === 'signup_verified'), false);
});

await check('concurrent username claim cannot commit a second applicant identity', async () => {
  const fixture = new SignupFixture({ credentialAppearsBeforeBatch: true });
  const started = await start(fixture);
  const verify = new Request('https://staffportal.test/api/auth/signup/verify', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) });
  const response = await routeAuthRefinement(verify, fixture.env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, message: 'Verification is complete. If your request is eligible, the next steps will be provided through the approved onboarding process.' });
  assert.equal(fixture.employee, null);
  assert.equal(fixture.credential, true);
  assert.equal(fixture.membershipWrites, 0);
  assert.equal(fixture.roleWrites, 0);
  assert.equal(fixture.signupRequestWrites, 0);
  assert.equal(fixture.securityEvents.some((event) => event.type === 'signup_verified'), false);
});

await check('verified WhatsApp plus email applicant receives provisional session', async () => {
  const fixture = new SignupFixture();
  const started = await start(fixture);
  const challenge = fixture.verifications.get(started.body.challengeId);
  challenge.phone_verified_at = new Date().toISOString();
  const response = await routeAuthRefinement(new Request(
    'https://staffportal.test/api/auth/signup/verify',
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: started.body.challengeId, code: fixture.deliveryCode }) },
  ), fixture.env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).authenticated, true);
  assert.equal(provisionalSessions.at(-1).method, 'whatsapp');
  assert.match(response.headers.get('set-cookie'), /daenem_workforce_session/);
  assert.equal(fixture.signupRequestWrites, 1);
});

await check('WhatsApp phone verification never bypasses required email OTP', async () => {
  const fixture = new SignupFixture();
  const started = await start(fixture);
  fixture.verifications.get(started.body.challengeId).phone_verified_at = new Date().toISOString();
  const before = provisionalSessions.length;
  const response = await routeAuthRefinement(new Request(
    'https://staffportal.test/api/auth/signup/verify',
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: started.body.challengeId, code: '000000' }) },
  ), fixture.env);
  assert.equal(response.status, 401);
  assert.equal(provisionalSessions.length, before);
  assert.equal(fixture.signupRequestWrites, 0);
});
console.log(`${passed.length}/${passed.length} PASS`);
