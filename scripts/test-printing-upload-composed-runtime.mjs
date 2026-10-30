import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Actual staging wrapper -> runtime -> canonical cookie/session/permissions ->
// Printing upload. SQLite executes committed table definitions and handler SQL;
// R2 and unrelated pre-route password guards are isolated substitutes. No D1,
// live storage, provider activation or temporary-password acceptance is claimed.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships',
    'roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides', 'auth_sessions', 'audit_logs']],
  ['0002_identity_auth.sql', ['employee_preferences']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'printing_services', 'print_jobs']],
  ['0019_employee_permission_overrides_v2.sql', ['employee_permission_overrides_v2']],
  ['0077_storage_mirror_queue.sql', ['storage_mirror_jobs']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}
let jobReads = 0, batches = 0, networkCalls = 0, putFailure = false, deleteFailure = false;
let getFailure = false, afterGet = null, fileReads = 0, bodyReads = 0, headerReads = 0;
let failReadAuthorization = false, afterPut = null;
const objects = new Map(), puts = [], deletes = [];
const env = {
  APP_STAGE: 'test', AUTH_PEPPER: 'synthetic-printing-test-only',
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.test',
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('FROM print_jobs pj')) jobReads++;
          if (failReadAuthorization && sql.includes('FROM auth_sessions')) throw new Error('Injected private authorization failure');
          return db.prepare(sql).get(...this.values) || null;
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
  FILES: {
    async get(key) {
      fileReads++;
      if (getFailure) throw new Error('Injected private storage read error');
      const object = objects.get(key);
      if (!object) return null;
      if (afterGet) afterGet();
      return {
        customMetadata: object.customMetadata,
        writeHttpMetadata(headers) { headerReads++; headers.set('content-type', object.httpMetadata.contentType); },
        get body() { bodyReads++; return object.bytes; },
      };
    },
    async put(key, bytes, options) {
      if (putFailure) throw new Error('Injected storage error with private object metadata');
      assert.ok(!objects.has(key));
      objects.set(key, { bytes: Buffer.from(bytes), ...options });
      puts.push(key);
      if (afterPut) afterPut();
    },
    async delete(key) {
      deletes.push(key);
      if (deleteFailure) throw new Error('Injected cleanup error with private object metadata');
      objects.delete(key);
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
    assert.ok(Object.hasOwn(dependencies, name), `explicit dependency: ${file} ${name}`);
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
    assert.ok(['/api/printing/jobs/files', '/api/printing/jobs/file'].includes(new URL(request.url).pathname));
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
  ['creator', 'company-printing', 'create'], ['viewer', 'company-printing', 'view'],
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
db.exec(`
  INSERT INTO print_jobs(id,company_id,job_no,title,created_by) VALUES
    ('job-a','company-printing','PRINT-SECRET-A','Protected job A','owner'),
    ('job-b','company-bakery','PRINT-SECRET-B','Protected job B','owner');
  INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id)
    VALUES('existing-other-audit','other','company-bakery','printing','upload_file','print_job','job-b');
`);
const existingOtherAudit = db.prepare("SELECT * FROM audit_logs WHERE id='existing-other-audit'").get();
const snapshot = () => ({
  queue: db.prepare('SELECT * FROM storage_mirror_jobs ORDER BY id').all(),
  audits: db.prepare('SELECT * FROM audit_logs ORDER BY id').all(),
  objects: [...objects.entries()],
});
let cases = 0, requestCount = 0;
const check = async (name, test) => { await test(); cases++; console.log(`PASS: ${name}`); };
const request = (actor, jobId = 'job-a') => {
  const data = new FormData();
  data.set('jobId', jobId); data.set('category', 'artwork');
  data.set('file', new File(['Private fixture upload bytes'], 'fixture.txt', { type: 'text/plain' }));
  return new Request('https://staffportal.test/api/printing/jobs/files', {
    method: 'POST', body: data,
    headers: { origin: 'https://staffportal.test', 'x-request-id': `printing-upload-${++requestCount}`,
      ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid-fixture-session'}` } : {}) },
  });
};
const send = async input => {
  const response = await staging.default.fetch(input, env, {});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://staffportal.test');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(response.headers.get('set-cookie'), null);
  return response;
};
const deny = async (input, status, beforeQuery = false) => {
  const before = snapshot(), readsBefore = jobReads, batchesBefore = batches, putsBefore = puts.length;
  const response = await send(input);
  assert.equal(response.status, status);
  const body = await response.text();
  assert.doesNotMatch(body, /PRINT-SECRET|Protected job|Private fixture|Injected|SELECT|INSERT|sha256|backupStatus|printing\//);
  assert.deepEqual(snapshot(), before, 'no accepted object, queue receipt or success audit');
  if (beforeQuery) {
    assert.equal(jobReads, readsBefore);
    assert.equal(batches, batchesBefore);
    assert.equal(puts.length, putsBefore);
  }
  return body;
};
const accepted = async actor => {
  const before = snapshot(), input = request(actor), response = await send(input);
  assert.equal(response.status, 200);
  const body = await response.json(), after = snapshot(), object = objects.get(body.key);
  assert.equal(body.backupStatus, 'provider_required');
  assert.equal(body.sha256, createHash('sha256').update('Private fixture upload bytes').digest('hex'));
  assert.equal(after.objects.length, before.objects.length + 1);
  assert.equal(after.queue.length, before.queue.length + 1);
  assert.equal(after.audits.length, before.audits.length + 1);
  assert.equal(object.customMetadata.companyId, 'company-printing');
  assert.equal(object.customMetadata.uploadedBy, actor);
  assert.equal(object.customMetadata.sha256, body.sha256);
  const queued = after.queue.find(row => row.r2_key === body.key);
  assert.equal(queued.company_id, 'company-printing');
  assert.equal(queued.sha256, body.sha256);
  assert.equal(queued.status, 'provider_required');
  assert.equal(queued.provider_item_id, null);
  const audit = after.audits.find(row => row.request_id === input.headers.get('x-request-id'));
  assert.equal(audit.company_id, 'company-printing');
  assert.equal(audit.actor_employee_id, actor);
  assert.equal(audit.entity_id, 'job-a');
  assert.equal(JSON.parse(audit.after_json).key, body.key);
  assert.doesNotMatch(JSON.stringify(audit), /Private fixture upload bytes|synthetic-session/);
  return body.key;
};
const readRequest = (actor, key, requestId = `printing-read-${++requestCount}`) => new Request(
  `https://staffportal.test/api/printing/jobs/file?key=${encodeURIComponent(key)}`, {
    headers: { origin: 'https://staffportal.test', 'x-request-id': requestId,
      ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid-fixture-session'}` } : {}) },
  });
const readDenied = async (actor, key, status, beforeStorage = false, requestId) => {
  const before = snapshot(), reads = fileReads, bodies = bodyReads, headers = headerReads;
  const response = await send(readRequest(actor, key, requestId));
  assert.equal(response.status, status);
  const body = await response.text();
  assert.doesNotMatch(body, /PRINT-SECRET|Protected job|Private fixture|Injected|SELECT|INSERT|sha256|printing\//);
  assert.equal(response.headers.get('content-disposition'), null);
  assert.equal(bodyReads, bodies, 'denial must not access protected object bytes');
  assert.equal(headerReads, headers, 'denial must not copy object headers');
  if (beforeStorage) assert.equal(fileReads, reads, 'denied caller must not reach R2');
  assert.deepEqual(snapshot(), before, 'no success audit or storage mutation on denial');
  return body;
};
const readAccepted = async (actor, key, requestId) => {
  const before = snapshot(), input = readRequest(actor, key, requestId);
  const response = await send(input);
  assert.equal(response.status, 200);
  const after = snapshot();
  assert.equal(after.audits.length, before.audits.length + 1, 'required audit persists before bytes are returned');
  const audit = after.audits.find(row => !before.audits.some(old => old.id === row.id));
  assert.equal(audit.actor_employee_id, actor);
  assert.equal(audit.company_id, 'company-printing');
  assert.equal(audit.entity_id, 'job-a');
  assert.equal(audit.action, 'protected_file_read');
  assert.equal(audit.request_id, input.headers.get('x-request-id'));
  assert.deepEqual(JSON.parse(audit.after_json), { method: 'GET', outcome: 'authorized_read', category: 'artwork' });
  assert.doesNotMatch(JSON.stringify(audit), /Private fixture|synthetic-session|sha256|printing\//);
  assert.equal(response.headers.get('content-type'), 'text/plain');
  assert.match(response.headers.get('content-disposition'), /fixture\.txt/);
  assert.equal(await response.text(), 'Private fixture upload bytes');
  assert.deepEqual(after.queue, before.queue, 'reading must not enqueue another secondary copy');
  assert.deepEqual(after.objects, before.objects);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden in isolated acceptance'); };
try {
  for (const actor of [null, 'invalid']) {
    await check(`missing/invalid session ${actor}: deny before job or R2 access`, () => deny(request(actor), 401, true));
  }
  for (const actor of ['other', 'viewer']) {
    await check(`${actor}: target-company create authority required before upload`, () => deny(request(actor), 403, true));
  }
  await check('foreign job and missing job yield identical neutral denial', async () => {
    const putCount = puts.length;
    assert.equal(await deny(request('creator', 'job-b'), 404), await deny(request('creator', 'missing'), 404));
    assert.equal(puts.length, putCount);
  });
  for (const actor of ['creator', 'owner']) {
    await check(`${actor}: exact accepted R2/queue/audit receipt through real authentication`, () => accepted(actor));
  }
  for (const [name, revoke, restore, status] of [
    ['session revocation', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='creator'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='creator'", 401],
    ['session expiry', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='creator'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='creator'", 401],
    ['inactive employee', "UPDATE employees SET employment_status='inactive' WHERE id='creator'", "UPDATE employees SET employment_status='active' WHERE id='creator'", 401],
    ['membership revocation', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='creator' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='creator' AND company_id='company-printing'", 403],
    ['role revocation', "UPDATE roles SET active=0 WHERE id='creator'", "UPDATE roles SET active=1 WHERE id='creator'", 403],
    ['explicit deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('deny','creator','company-printing','print-access','none','Fixture','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='deny'", 403],
  ]) {
    await check(`${name}: same cookie cannot upload`, async () => {
      db.exec(revoke);
      try { await deny(request('creator'), status, true); } finally { db.exec(restore); }
    });
  }
  for (const [name, revoke, restore, status] of [
    ['session revocation', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='creator'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='creator'", 401],
    ['session expiry', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='creator'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='creator'", 401],
    ['employee deactivation', "UPDATE employees SET employment_status='inactive' WHERE id='creator'", "UPDATE employees SET employment_status='active' WHERE id='creator'", 401],
    ['session actor replacement', "UPDATE auth_sessions SET employee_id='owner' WHERE id='creator'", "UPDATE auth_sessions SET employee_id='creator' WHERE id='creator'", 401],
    ['membership revocation', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='creator' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='creator' AND company_id='company-printing'", 403],
    ['company deactivation', "UPDATE companies SET active=0 WHERE id='company-printing'", "UPDATE companies SET active=1 WHERE id='company-printing'", 403],
    ['role revocation', "UPDATE roles SET active=0 WHERE id='creator'", "UPDATE roles SET active=1 WHERE id='creator'", 403],
    ['permission downgrade', "UPDATE role_permissions SET access_level='view' WHERE role_id='creator'", "UPDATE role_permissions SET access_level='create' WHERE role_id='creator'", 403],
    ['explicit deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('upload-deny','creator','company-printing','print-access','none','Fixture','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='upload-deny'", 403],
  ]) {
    await check(`${name} during R2 upload: exact-object cleanup without receipt or success audit`, async () => {
      const batchCount = batches, deleteCount = deletes.length, putCount = puts.length;
      afterPut = () => db.exec(revoke);
      try { await deny(request('creator'), status); }
      finally { afterPut = null; db.exec(restore); }
      assert.equal(puts.length, putCount + 1);
      assert.equal(deletes.length, deleteCount + 1);
      assert.equal(deletes.at(-1), puts.at(-1));
      assert.equal(batches, batchCount, 'revoked authority must not attempt acceptance writes');
    });
  }
  await check('authorization lookup failure after upload: neutral 503 and exact-object cleanup', async () => {
    const batchCount = batches, deleteCount = deletes.length;
    afterPut = () => { failReadAuthorization = true; };
    try { await deny(request('creator'), 503); }
    finally { afterPut = null; failReadAuthorization = false; }
    assert.equal(deletes.length, deleteCount + 1);
    assert.equal(deletes.at(-1), puts.at(-1));
    assert.equal(batches, batchCount);
  });
  await check('revocation cleanup failure: neutral 503 without accepted receipt or success audit', async () => {
    const before = snapshot(), batchCount = batches, deleteCount = deletes.length;
    afterPut = () => db.exec("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='creator'");
    deleteFailure = true;
    try {
      const response = await send(request('creator'));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'The Printing file could not be saved. Please try again later.' });
      assert.deepEqual(snapshot().queue, before.queue);
      assert.deepEqual(snapshot().audits, before.audits);
      assert.equal(batches, batchCount);
      assert.equal(objects.size, before.objects.length + 1, 'failed cleanup is not reported as successful compensation');
      assert.equal(deletes.length, deleteCount + 1, 'cleanup is attempted once');
      assert.equal(deletes.at(-1), puts.at(-1));
      for (const [key, object] of before.objects) assert.deepEqual(objects.get(key), object);
    } finally {
      afterPut = null; deleteFailure = false;
      db.exec("UPDATE auth_sessions SET revoked_at=NULL WHERE id='creator'");
      objects.delete(puts.at(-1)); // Fixture-only cleanup of the unaccepted object.
    }
  });
  await check('restored upload authority accepts exactly one new receipt and audit', () => accepted('creator'));
  for (const table of ['storage_mirror_jobs', 'audit_logs']) {
    for (const mode of ['ABORT', 'IGNORE']) {
      await check(`${table} ${mode}: neutral 503 with headers, rollback and exact-object cleanup`, async () => {
        db.exec(`CREATE TRIGGER upload_fault BEFORE INSERT ON ${table} BEGIN SELECT RAISE(${mode}${mode === 'ABORT' ? ",'Injected private database error'" : ''}); END;`);
        const deleteCount = deletes.length;
        try { await deny(request('creator'), 503); }
        finally { db.exec('DROP TRIGGER upload_fault'); }
        assert.equal(deletes.length, deleteCount + 1);
        assert.equal(deletes.at(-1), puts.at(-1));
      });
    }
  }
  await check('R2 put failure returns neutral 503 before any queue/audit acceptance', async () => {
    putFailure = true;
    try { await deny(request('creator'), 503); } finally { putFailure = false; }
  });
  await check('cleanup failure never leaks private errors or claims acceptance', async () => {
    const before = snapshot();
    db.exec("CREATE TRIGGER upload_fault BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'Injected private database error'); END;");
    deleteFailure = true;
    try {
      const response = await send(request('creator'));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'The Printing file could not be saved. Please try again later.' });
      assert.deepEqual(snapshot().queue, before.queue);
      assert.deepEqual(snapshot().audits, before.audits);
      assert.equal(objects.size, before.objects.length + 1, 'failed compensation leaves an unaccepted object; do not claim cleanup');
      assert.equal(deletes.at(-1), puts.at(-1));
      for (const [key, object] of before.objects) assert.deepEqual(objects.get(key), object);
    } finally {
      deleteFailure = false;
      db.exec('DROP TRIGGER upload_fault');
      objects.delete(puts.at(-1)); // Fixture-only cleanup, no live R2 operation.
    }
  });
  await check('retry after faults accepts exactly one new file without payment/production mutation', async () => {
    await accepted('creator');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales_orders').get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE production_status<>'enquiry'").get().n, 0);
    assert.deepEqual(db.prepare("SELECT * FROM audit_logs WHERE id='existing-other-audit'").get(), existingOtherAudit);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(networkCalls, 0);
  });
  const readKey = await accepted('creator');
  for (const actor of ['viewer', 'creator', 'owner']) {
    await check(`${actor}: uploaded bytes readable only after correlated read audit`, () => readAccepted(actor, readKey, `read-${actor}`));
  }
  for (const [actor, status] of [[null, 401], ['invalid', 401], ['other', 403]]) {
    await check(`${actor}: protected read denies before storage`, () => readDenied(actor, readKey, status, true));
  }
  await check('foreign, unknown and malformed keys reveal no job or object', async () => {
    const bodies = [];
    for (const key of ['printing/job-b/artwork/fixture.txt', 'printing/unknown/artwork/fixture.txt',
      'printing/job-a/unknown/fixture.txt', `${readKey}-missing`]) {
      bodies.push(await readDenied('viewer', key, 404, !key.endsWith('-missing')));
    }
    assert.equal(new Set(bodies).size, 1);
  });
  for (const [field, value] of [['companyId', 'company-bakery'], ['companyId', undefined], ['jobId', 'job-b'], ['category', 'proof']]) {
    await check(`stored ${field}=${value}: deny metadata mismatch without audit or bytes`, async () => {
      const metadata = objects.get(readKey).customMetadata, original = metadata[field];
      metadata[field] = value;
      try { await readDenied('viewer', readKey, 404); } finally { metadata[field] = original; }
    });
  }
  for (const mode of ['ABORT', 'IGNORE']) {
    await check(`read audit ${mode}: historical success cannot authorize a new disclosure`, async () => {
      db.exec(`CREATE TRIGGER read_fault BEFORE INSERT ON audit_logs WHEN NEW.action='protected_file_read'
        BEGIN SELECT RAISE(${mode}${mode === 'ABORT' ? ",'Injected private audit error'" : ''}); END;`);
      try { await readDenied('viewer', readKey, 503, false, 'read-viewer'); }
      finally { db.exec('DROP TRIGGER read_fault'); }
      await readAccepted('viewer', readKey, 'read-viewer');
    });
  }
  await check('job company changed during storage fetch: no success audit or bytes', async () => {
    afterGet = () => db.exec("UPDATE print_jobs SET company_id='company-bakery' WHERE id='job-a'");
    try { await readDenied('viewer', readKey, 503); }
    finally {
      afterGet = null;
      db.exec("UPDATE print_jobs SET company_id='company-printing' WHERE id='job-a'");
    }
  });
  await check('storage read failure: bounded 503 with runtime security headers', async () => {
    getFailure = true;
    try { await readDenied('viewer', readKey, 503); } finally { getFailure = false; }
  });
  for (const [name, revoke, restore, status] of [
    ['session', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='viewer'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='viewer'", 401],
    ['membership', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='viewer' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='viewer' AND company_id='company-printing'", 403],
    ['role', "UPDATE roles SET active=0 WHERE id='viewer'", "UPDATE roles SET active=1 WHERE id='viewer'", 403],
    ['explicit deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('read-deny','viewer','company-printing','print-access','none','Fixture','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='read-deny'", 403],
  ]) {
    await check(`${name} revoked after successful read: same cookie denied before storage`, async () => {
      db.exec(revoke);
      try { await readDenied('viewer', readKey, status, true); } finally { db.exec(restore); }
    });
  }
  for (const [name, revoke, restore, status] of [
    ['session revocation', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='viewer'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='viewer'", 401],
    ['session expiry', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='viewer'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='viewer'", 401],
    ['employee deactivation', "UPDATE employees SET employment_status='inactive' WHERE id='viewer'", "UPDATE employees SET employment_status='active' WHERE id='viewer'", 401],
    ['session actor replacement', "UPDATE auth_sessions SET employee_id='creator' WHERE id='viewer'", "UPDATE auth_sessions SET employee_id='viewer' WHERE id='viewer'", 401],
    ['membership revocation', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='viewer' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='viewer' AND company_id='company-printing'", 403],
    ['company deactivation', "UPDATE companies SET active=0 WHERE id='company-printing'", "UPDATE companies SET active=1 WHERE id='company-printing'", 403],
    ['role revocation', "UPDATE roles SET active=0 WHERE id='viewer'", "UPDATE roles SET active=1 WHERE id='viewer'", 403],
    ['permission revocation', "UPDATE role_permissions SET access_level='none' WHERE role_id='viewer'", "UPDATE role_permissions SET access_level='view' WHERE role_id='viewer'", 403],
    ['explicit deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('read-deny','viewer','company-printing','print-access','none','Fixture','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='read-deny'", 403],
  ]) {
    await check(`${name} during R2 await: no file headers, bytes or success audit`, async () => {
      afterGet = () => db.exec(revoke);
      try { await readDenied('viewer', readKey, status); }
      finally { afterGet = null; db.exec(restore); }
    });
  }
  await check('authorization lookup failure after R2: neutral 503 without file or audit disclosure', async () => {
    afterGet = () => { failReadAuthorization = true; };
    try { await readDenied('viewer', readKey, 503); }
    finally { afterGet = null; failReadAuthorization = false; }
  });
  await check('restored authorized reader succeeds with exactly one fresh audit', () => readAccepted('viewer', readKey));
  assert.equal(networkCalls, 0);
  console.log(`Printing upload composed runtime/session/SQLite/R2 acceptance: ${cases}/${cases} PASS; zero provider calls; productionMutated=false`);
} finally { globalThis.fetch = originalFetch; db.close(); }
