import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Effective staging -> runtime -> canonical session/permissions -> proof writer.
// SQLite uses committed table definitions; unrelated pre-route guards are stubbed.
// No provider, R2, remote D1, or payment behavior is simulated as acceptance.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships',
    'roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides', 'auth_sessions', 'audit_logs']],
  ['0002_identity_auth.sql', ['employee_preferences']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'printing_services', 'print_jobs', 'print_proofs']],
  ['0019_employee_permission_overrides_v2.sql', ['employee_permission_overrides_v2']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}

let afterRead = null, readBoundary = '', failAuthorization = false, batches = 0, networkCalls = 0;
const env = {
  APP_STAGE: 'test', AUTH_PEPPER: 'synthetic-printing-test-only',
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.test',
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (failAuthorization && sql.includes('FROM auth_sessions')) throw new Error('Injected authorization failure');
          const result = db.prepare(sql).get(...this.values) || null;
          if (afterRead && sql.includes(readBoundary)) {
            const hook = afterRead; afterRead = null; hook();
          }
          return result;
        },
        async all() { return { results: db.prepare(sql).all(...this.values) }; },
        async run() {
          const result = db.prepare(sql).run(...this.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      batches++;
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const result = db.prepare(statement.sql).run(...statement.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  },
};
async function load(file, dependencies = {}) {
  const source = await readFile(new URL(`../worker/${file}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(module, module.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `explicit dependency boundary: ${file} ${name}`);
    return dependencies[name];
  });
  return module.exports;
}
const auth = await load('auth');
const printing = await load('printing-production', { './auth': auth });
const workspace = await load('workspace-route', { './auth': auth });
const runtimeSource = await readFile(new URL('../worker/runtime.ts', import.meta.url), 'utf8');
const noOpGuards = new Set(['routeOwnerTemporaryPasswordRepair', 'routeOwnerTemporaryAccess',
  'routeTemporaryPasswordSelf', 'guardTemporaryPasswordChange', 'guardOwnerForcedPasswordChange']);
const dependencies = {};
for (const [, name] of runtimeSource.matchAll(/from '(\.\/[^']+)'/g)) {
  dependencies[name] = new Proxy({}, { get(_target, member) {
    if (noOpGuards.has(member)) return async () => null;
    return () => { throw new Error(`Unexpected dispatch: ${name}.${String(member)}`); };
  } });
}
Object.assign(dependencies, { './auth': auth, './printing-production': printing, './workspace-route': workspace });
const runtime = await load('runtime', dependencies);
const staging = await load('staffportal-staging', {
  './runtime': runtime, './workspace-route': workspace,
  './v180-public-assets': { routeV180PublicAssets: async request => {
    assert.equal(new URL(request.url).pathname, '/api/printing/jobs/proof');
    return null;
  } },
});
db.exec(`
  INSERT INTO companies(id,code,name,business_type) VALUES
    ('company-printing','PRINTING','Printing fixture','printing'),('company-bakery','BAKERY','Other fixture','bakery');
  INSERT INTO permissions(id,code,module,action) VALUES('print-access','printing.access','printing','access');
`);
const tokens = new Map();
for (const [actor, target, level] of [
  ['editor', 'company-printing', 'edit'], ['viewer', 'company-printing', 'view'],
  ['owner', 'company-printing', 'manage'], ['other', 'company-bakery', 'manage'],
]) {
  db.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)').run(actor, `Synthetic ${actor}`);
  for (const company of ['company-printing', 'company-bakery']) {
    db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id) VALUES(?,?,?)').run(`${actor}-${company}`, actor, company);
  }
  db.prepare('INSERT INTO roles(id,company_id,code,name,is_system) VALUES(?,?,?,?,?)')
    .run(actor, actor === 'owner' ? null : target, actor, actor, actor === 'owner' ? 1 : 0);
  db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)').run(actor, actor, target, actor);
  db.prepare('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)').run(actor, actor, 'print-access', level);
  const token = `synthetic-session-${actor}`;
  tokens.set(actor, token);
  const hash = createHash('sha256').update(`${token}:${env.AUTH_PEPPER}`).digest('hex');
  db.prepare("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 hour'))").run(actor, actor, hash);
}
db.exec(`INSERT INTO print_jobs(id,company_id,job_no,title,created_by) VALUES
  ('job-a','company-printing','PRINT-SECRET-A','Protected job A','owner'),
  ('job-b','company-bakery','PRINT-SECRET-B','Protected job B','other');
  INSERT INTO print_proofs(id,print_job_id) VALUES('foreign-history','job-b');`);
const snapshot = () => ({
  jobs: db.prepare('SELECT * FROM print_jobs ORDER BY id').all(),
  proofs: db.prepare('SELECT * FROM print_proofs ORDER BY id').all(),
  audits: db.prepare('SELECT * FROM audit_logs ORDER BY id').all(),
});
const reset = action => {
  db.exec("DELETE FROM print_proofs WHERE print_job_id='job-a'; DELETE FROM audit_logs;");
  db.prepare("UPDATE print_jobs SET proof_status=?,production_status='proof' WHERE id='job-a'")
    .run(action === 'customer_response' ? 'sent' : 'pending');
  db.prepare("INSERT INTO print_proofs(id,print_job_id,customer_response,sent_at,sent_by) VALUES('proof-a','job-a','pending',?,?)")
    .run(action === 'customer_response' ? '2026-10-01 12:00:00' : null, action === 'customer_response' ? 'owner' : null);
  readBoundary = action === 'create' ? 'MAX(p.version_no)' : 'FROM print_jobs pj';
};
let cases = 0, requestCount = 0;
const check = async (name, test) => { await test(); cases++; console.log(`PASS ${name}`); };
const request = (action, actor = 'editor', jobId = 'job-a', proofId = 'proof-a') => new Request('https://staffportal.test/api/printing/jobs/proof', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://staffportal.test',
    'x-request-id': `proof-${++requestCount}`,
    ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid'}` } : {}) },
  body: JSON.stringify({ jobId, proofId, action, response: 'approved' }),
});
const send = async input => {
  const response = await staging.default.fetch(input, env, {});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://staffportal.test');
  return response;
};
const deny = async (input, status) => {
  const before = snapshot(), writesBefore = batches;
  const response = await send(input);
  assert.equal(response.status, status);
  const body = await response.text();
  assert.doesNotMatch(body, /PRINT-SECRET|Protected job|foreign-history|proofId|SELECT|INSERT|Injected|synthetic-session/);
  assert.deepEqual(snapshot(), before, 'no proof, job or success-audit writes');
  assert.equal(batches, writesBefore, 'denied before the write transaction');
  return body;
};
const accepted = async (action, actor) => {
  const before = snapshot(), input = request(action, actor), response = await send(input);
  assert.equal(response.status, 200);
  const body = await response.json(), after = snapshot();
  assert.equal(body.action, action);
  assert.equal(after.audits.length, before.audits.length + 1);
  const row = after.proofs.find(item => item.id === body.proofId);
  assert.equal(row.print_job_id, 'job-a');
  assert.equal(after.proofs.length, before.proofs.length + (action === 'create' ? 1 : 0));
  if (action === 'create') { assert.equal(row.version_no, 2); assert.equal(row.customer_response, 'pending'); }
  if (action === 'sent') { assert.ok(row.sent_at); assert.equal(row.sent_by, actor); }
  if (action === 'customer_response') { assert.equal(row.customer_response, 'approved'); assert.equal(row.approved_by_employee_id, actor); }
  const audit = after.audits.find(item => item.request_id === input.headers.get('x-request-id'));
  assert.equal(audit.company_id, 'company-printing');
  assert.equal(audit.entity_id, 'job-a');
  assert.equal(audit.actor_employee_id, actor);
  assert.equal(audit.action, 'proof_update');
  assert.doesNotMatch(JSON.stringify(audit), /synthetic-session/);
  const job = after.jobs.find(item => item.id === 'job-a');
  assert.equal(job.proof_status, action === 'create' ? 'pending' : action === 'sent' ? 'sent' : 'approved');
  assert.equal(job.production_status, 'proof');
  assert.deepEqual(after.proofs.filter(item => item.print_job_id === 'job-b'), before.proofs.filter(item => item.print_job_id === 'job-b'));
  assert.deepEqual(after.jobs.find(item => item.id === 'job-b'), before.jobs.find(item => item.id === 'job-b'));
};
const revocations = [
  ['session revoked', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='editor'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='editor'", 401],
  ['session expired', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='editor'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='editor'", 401],
  ['employee inactive', "UPDATE employees SET employment_status='inactive' WHERE id='editor'", "UPDATE employees SET employment_status='active' WHERE id='editor'", 401],
  ['membership revoked', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='editor' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='editor' AND company_id='company-printing'", 403],
  ['role disabled', "UPDATE roles SET active=0 WHERE id='editor'", "UPDATE roles SET active=1 WHERE id='editor'", 403],
  ['edit downgraded', "UPDATE role_permissions SET access_level='view' WHERE id='editor'", "UPDATE role_permissions SET access_level='edit' WHERE id='editor'", 403],
  ['explicit company deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('proof-deny','editor','company-printing','print-access','none','Synthetic revocation','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='proof-deny'", 403],
  ['session actor replaced', "UPDATE auth_sessions SET employee_id='owner' WHERE id='editor'", "UPDATE auth_sessions SET employee_id='editor' WHERE id='editor'", 401],
  ['session identity replaced', "UPDATE auth_sessions SET id='replacement' WHERE id='editor'", "UPDATE auth_sessions SET id='editor' WHERE id='replacement'", 401],
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('No network in isolated Printing acceptance'); };
try {
  for (const action of ['create', 'sent', 'customer_response']) {
    reset(action);
    await check(`${action}: missing session denied`, () => deny(request(action, null), 401));
    await check(`${action}: foreign company grant denied despite membership`, () => deny(request(action, 'other'), 403));
    await check(`${action}: view-only denied`, () => deny(request(action, 'viewer'), 403));
    await check(`${action}: foreign and missing jobs have identical denial`, async () => {
      assert.equal(await deny(request(action, 'editor', 'job-b'), 404), await deny(request(action, 'editor', 'missing'), 404));
    });
    for (const actor of ['editor', 'owner']) {
      await check(`${action}: ${actor} success is company-scoped and audited`, async () => { reset(action); await accepted(action, actor); });
    }
    for (const [name, revoke, restore, status] of revocations) {
      await check(`${action}: ${name} after awaited read prevents all writes`, async () => {
        reset(action);
        afterRead = () => db.exec(revoke);
        try { await deny(request(action), status); assert.equal(afterRead, null, 'race hook executed'); }
        finally { db.exec(restore); afterRead = null; }
      });
    }
    await check(`${action}: authorization lookup failure denies before writes`, async () => {
      reset(action); afterRead = () => { failAuthorization = true; };
      try { await deny(request(action), 503); assert.equal(afterRead, null); }
      finally { failAuthorization = false; afterRead = null; }
    });
    for (const mode of ['ABORT', 'IGNORE']) {
      await check(`${action}: required audit ${mode} rolls back all writes`, async () => {
        reset(action); const before = snapshot();
        db.exec(`CREATE TRIGGER proof_audit_fault BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(${mode}${mode === 'ABORT' ? ",'injected audit failure'" : ''}); END`);
        try {
          const response = await send(request(action));
          assert.equal(response.status, 503);
          assert.doesNotMatch(await response.text(), /injected|SELECT|INSERT|PRINT-SECRET|proofId/);
          assert.deepEqual(snapshot(), before);
        } finally { db.exec('DROP TRIGGER proof_audit_fault'); }
        await accepted(action, 'editor');
      });
    }
  }
  await check('no network, payment writes or foreign-key violations', async () => {
    assert.equal(networkCalls, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales_orders').get().n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
  console.log(`Printing proof composed staging/runtime/session/SQLite acceptance: ${cases}/${cases} PASS; productionMutated=false`);
} finally { globalThis.fetch = originalFetch; db.close(); }
