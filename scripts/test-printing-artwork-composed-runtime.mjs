import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Real staging wrapper -> shared runtime -> cookie/session/permission resolver
// -> Printing handler -> SQLite. Only unrelated pre-route guards are replaced.
// This is isolated acceptance, not Cloudflare D1 or temporary-password QA.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships',
    'roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides', 'auth_sessions', 'audit_logs']],
  ['0002_identity_auth.sql', ['employee_preferences']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'printing_services', 'print_jobs']],
  ['0012_printing_production_controls.sql', ['print_artwork_versions']],
  ['0019_employee_permission_overrides_v2.sql', ['employee_permission_overrides_v2']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}

let jobReads = 0, batches = 0, networkCalls = 0;
let afterVersionRead = null, failAuthorization = false;
const env = {
  APP_STAGE: 'test',
  AUTH_PEPPER: 'synthetic-printing-test-only',
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.test',
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('FROM print_jobs pj')) jobReads++;
          if (failAuthorization && sql.includes('FROM auth_sessions')) throw new Error('Injected authorization failure');
          const result = db.prepare(sql).get(...this.values) || null;
          if (sql.includes('MAX(av.version_no)') && afterVersionRead) {
            const hook = afterVersionRead; afterVersionRead = null; hook();
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
    assert.equal(new URL(request.url).pathname, '/api/printing/jobs/artwork');
    return null;
  } },
});

db.exec(`
  INSERT INTO companies(id,code,name,business_type) VALUES
    ('company-printing','PRINTING','Printing fixture','printing'),('company-bakery','BAKERY','Other fixture','bakery');
  INSERT INTO permissions(id,code,module,action) VALUES
    ('print-access','printing.access','printing','access'),('finance-access','finance.access','finance','access');
`);
const tokens = new Map();
for (const [actor, target, level] of [
  ['editor', 'company-printing', 'edit'], ['approver', 'company-printing', 'approve'],
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
  INSERT INTO print_artwork_versions(id,print_job_id,created_by) VALUES('foreign-history','job-b','other');`);
const snapshot = () => ({
  jobs: db.prepare('SELECT * FROM print_jobs ORDER BY id').all(),
  versions: db.prepare('SELECT * FROM print_artwork_versions ORDER BY id').all(),
  audits: db.prepare('SELECT * FROM audit_logs ORDER BY id').all(),
});
let cases = 0, requestCount = 0;
const check = async (name, test) => { await test(); cases++; console.log(`PASS ${name}`); };
const request = (actor = 'approver', status = 'approved', jobId = 'job-a') => new Request('https://staffportal.test/api/printing/jobs/artwork', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://staffportal.test',
    'x-request-id': `artwork-${++requestCount}`,
    ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid'}` } : {}) },
  body: JSON.stringify({ jobId, status, source: 'internal' }),
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
  assert.doesNotMatch(body, /PRINT-SECRET|Protected job|foreign-history|artworkId|SELECT|INSERT|Injected|synthetic-session/);
  assert.deepEqual(snapshot(), before, 'no artwork, job or success-audit writes');
  assert.equal(batches, writesBefore, 'denied before the write transaction');
  return body;
};
const accepted = async (actor, status) => {
  const before = snapshot(), input = request(actor, status), response = await send(input);
  assert.equal(response.status, 200);
  const { artwork } = await response.json(), after = snapshot();
  assert.equal(after.versions.length, before.versions.length + 1);
  assert.equal(after.audits.length, before.audits.length + 1);
  const row = after.versions.find(item => item.id === artwork.id);
  assert.equal(row.print_job_id, 'job-a');
  assert.equal(row.created_by, actor);
  assert.equal(row.status, status);
  assert.equal(row.approved_by, status === 'approved' ? actor : null);
  const audit = after.audits.find(item => item.request_id === input.headers.get('x-request-id'));
  assert.equal(audit.company_id, 'company-printing');
  assert.equal(audit.entity_id, 'job-a');
  assert.equal(audit.actor_employee_id, actor);
  assert.equal(audit.action, 'artwork_version');
  assert.doesNotMatch(JSON.stringify(audit), /synthetic-session/);
  assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-a'").get().production_status, 'enquiry');
  assert.deepEqual(after.versions.filter(item => item.print_job_id === 'job-b'), before.versions.filter(item => item.print_job_id === 'job-b'));
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('No network in isolated Printing acceptance'); };
try {
  await check('missing session denied', () => deny(request(null), 401));
  await check('foreign-company grant denied despite target membership', () => deny(request('other'), 403));
  await check('editor cannot approve artwork', () => deny(request('editor'), 403));
  await check('foreign and missing jobs return identical neutral denial', async () => {
    assert.equal(await deny(request('approver', 'approved', 'job-b'), 404), await deny(request('approver', 'approved', 'missing'), 404));
  });
  for (const [actor, status] of [['editor', 'ready'], ['approver', 'approved'], ['owner', 'approved']]) {
    await check(`${actor} ${status} persists exact company-scoped artwork and current audit`, () => accepted(actor, status));
  }
  const revocations = [
    ['session revoked', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='approver'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='approver'", 401],
    ['session expired', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='approver'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='approver'", 401],
    ['employee inactive', "UPDATE employees SET employment_status='inactive' WHERE id='approver'", "UPDATE employees SET employment_status='active' WHERE id='approver'", 401],
    ['membership revoked', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='approver' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='approver' AND company_id='company-printing'", 403],
    ['role disabled', "UPDATE roles SET active=0 WHERE id='approver'", "UPDATE roles SET active=1 WHERE id='approver'", 403],
    ['approval downgraded to edit', "UPDATE role_permissions SET access_level='edit' WHERE id='approver'", "UPDATE role_permissions SET access_level='approve' WHERE id='approver'", 403],
    ['explicit target-company deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('artwork-deny','approver','company-printing','print-access','none','Synthetic revocation','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='artwork-deny'", 403],
    ['session actor replaced', "UPDATE auth_sessions SET employee_id='owner' WHERE id='approver'", "UPDATE auth_sessions SET employee_id='approver' WHERE id='approver'", 401],
  ];
  for (const [name, revoke, restore, status] of revocations) {
    await check(`${name} after version read prevents all product writes`, async () => {
      afterVersionRead = () => db.exec(revoke);
      try { await deny(request(), status); assert.equal(afterVersionRead, null, 'race hook executed'); }
      finally { db.exec(restore); afterVersionRead = null; }
    });
  }
  await check('authorization read failure stays neutral and writes nothing', async () => {
    afterVersionRead = () => { failAuthorization = true; };
    try { await deny(request(), 503); } finally { failAuthorization = false; afterVersionRead = null; }
  });
  await check('approved permission downgrade still permits a requested non-approval edit', async () => {
    afterVersionRead = () => db.exec("UPDATE role_permissions SET access_level='edit' WHERE id='approver'");
    try { await accepted('approver', 'ready'); }
    finally { db.exec("UPDATE role_permissions SET access_level='approve' WHERE id='approver'"); }
  });
  for (const mode of ['ABORT', 'IGNORE']) {
    await check(`required artwork audit ${mode} rolls back all writes`, async () => {
      const before = snapshot();
      db.exec(`CREATE TRIGGER artwork_audit_fault BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(${mode}${mode === 'ABORT' ? ",'injected audit failure'" : ''}); END`);
      try {
        const response = await send(request());
        assert.equal(response.status, 503);
        assert.doesNotMatch(await response.text(), /injected|SELECT|INSERT|PRINT-SECRET/);
        assert.deepEqual(snapshot(), before);
      } finally { db.exec('DROP TRIGGER artwork_audit_fault'); }
    });
  }
  await check('restored authority succeeds without provider or payment mutation', async () => {
    await accepted('approver', 'approved');
    assert.equal(networkCalls, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales_orders').get().n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
  console.log(`Printing artwork composed staging/runtime/session/SQLite acceptance: ${cases}/${cases} PASS; productionMutated=false`);
} finally { globalThis.fetch = originalFetch; db.close(); }
