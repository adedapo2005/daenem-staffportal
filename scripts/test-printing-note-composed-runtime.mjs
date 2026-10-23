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
  ['0012_printing_production_controls.sql', ['print_job_notes']],
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
    assert.equal(new URL(request.url).pathname, '/api/printing/jobs/note');
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
  ('job-b','company-bakery','PRINT-SECRET-B','Protected job B','owner');
  INSERT INTO print_job_notes(id,print_job_id,note_type,note,created_by)
    VALUES('existing-other-note','job-b','finance','Private fixture other-company history','other');
  INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id)
    VALUES('existing-other-audit','other','company-bakery','printing','note_record','print_job','job-b');`);
const existingOtherNote = db.prepare("SELECT * FROM print_job_notes WHERE id='existing-other-note'").get();
const existingOtherAudit = db.prepare("SELECT * FROM audit_logs WHERE id='existing-other-audit'").get();

const snapshot = () => ({
  notes: db.prepare('SELECT * FROM print_job_notes ORDER BY id').all(),
  audits: db.prepare('SELECT * FROM audit_logs ORDER BY id').all(),
});
let caseCount = 0;
const check = async (name, run) => { await run(); caseCount++; console.log(`PASS: ${name}`); };
let requestCount = 0;
const request = (actor, type = 'production', jobId = 'job-a') => new Request('https://staffportal.test/api/printing/jobs/note', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://staffportal.test',
    'x-request-id': `printing-note-${++requestCount}`,
    ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid-fixture-session'}` } : {}) },
  body: JSON.stringify({ jobId, noteType: type, note: 'Private fixture note text' }),
});
const send = async input => {
  const response = await staging.default.fetch(input, env, {});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://staffportal.test');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  return response;
};
const deny = async (input, status, beforeQuery = false) => {
  const before = snapshot(), readsBefore = jobReads, batchesBefore = batches;
  const response = await send(input);
  assert.equal(response.status, status);
  const body = await response.text();
  assert.doesNotMatch(body, /PRINT-SECRET|Protected job|Private fixture|noteId|injected|SELECT|INSERT/);
  assert.deepEqual(snapshot(), before, 'denial/failure leaves no note or success audit');
  if (beforeQuery) {
    assert.equal(jobReads, readsBefore, 'authentication/permission denied before protected lookup');
    assert.equal(batches, batchesBefore, 'no protected write attempt');
  }
  return body;
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden in isolated Printing acceptance'); };
try {
  for (const actor of [null, 'invalid']) {
    await check(`missing/invalid session ${actor} denied before job access`, () => deny(request(actor), 401, true));
  }
  await check('other-company Printing grant cannot authorize target company despite membership', () => deny(request('other'), 403, true));
  await check('foreign job and missing job have identical neutral response', async () => {
    assert.equal(await deny(request('editor', 'production', 'job-b'), 400), await deny(request('editor', 'production', 'missing'), 400));
  });
  await check('editor cannot write a protected finance note', () => deny(request('editor', 'finance'), 403));
  for (const [actor, type] of [['editor', 'production'], ['approver', 'finance'], ['owner', 'finance']]) {
    await check(`${actor} writes exactly one company-scoped note and correlated minimized audit`, async () => {
      const before = snapshot(), input = request(actor, type);
      const response = await send(input);
      assert.equal(response.status, 200);
      const { noteId } = await response.json(), after = snapshot();
      assert.equal(after.notes.length, before.notes.length + 1);
      assert.equal(after.audits.length, before.audits.length + 1);
      const note = after.notes.find(row => row.id === noteId);
      assert.equal(note.print_job_id, 'job-a');
      assert.equal(note.created_by, actor);
      assert.equal(note.note_type, type);
      const audit = after.audits.find(row => row.request_id === input.headers.get('x-request-id'));
      assert.equal(audit.company_id, 'company-printing');
      assert.equal(audit.actor_employee_id, actor);
      assert.equal(audit.entity_id, 'job-a');
      assert.equal(audit.action, 'note_record');
      assert.deepEqual(JSON.parse(audit.after_json), { noteId, noteType: type });
      assert.doesNotMatch(JSON.stringify(audit), /Private fixture|synthetic-session/);
    });
  }
  await check('same cookie is denied immediately after session revocation', async () => {
    db.exec("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='editor'");
    await deny(request('editor'), 401, true);
    db.exec("UPDATE auth_sessions SET revoked_at=NULL WHERE id='editor'");
  });
  await check('same cookie is denied after target membership revocation', async () => {
    db.exec("UPDATE employee_company_memberships SET active=0 WHERE employee_id='editor' AND company_id='company-printing'");
    await deny(request('editor'), 403, true);
    db.exec("UPDATE employee_company_memberships SET active=1 WHERE employee_id='editor' AND company_id='company-printing'");
  });
  await check('target-company explicit none overrides an existing grant', async () => {
    db.exec("INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('deny-editor','editor','company-printing','print-access','none','Fixture revocation','owner')");
    await deny(request('editor'), 403, true);
    db.exec("DELETE FROM employee_permission_overrides_v2 WHERE id='deny-editor'");
  });
  await check('same cookie is denied after its role is disabled', async () => {
    db.exec("UPDATE roles SET active=0 WHERE id='editor'");
    await deny(request('editor'), 403, true);
    db.exec("UPDATE roles SET active=1 WHERE id='editor'");
  });
  await check('Finance view in another company cannot grant finance-note access', async () => {
    db.exec("INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('finance-editor','editor','company-bakery','finance-access','view','Fixture scope','owner')");
    await deny(request('editor', 'finance'), 403);
  });
  await check('target-company Finance view permits finance notes with existing Printing create authority', async () => {
    db.exec("UPDATE employee_permission_overrides_v2 SET company_id='company-printing' WHERE id='finance-editor'");
    const before = snapshot(), response = await send(request('editor', 'finance'));
    assert.equal(response.status, 200);
    const { noteId } = await response.json();
    assert.equal(snapshot().notes.length, before.notes.length + 1);
    assert.equal(snapshot().audits.length, before.audits.length + 1);
    assert.equal(db.prepare('SELECT note_type FROM print_job_notes WHERE id=?').get(noteId).note_type, 'finance');
    db.exec("DELETE FROM employee_permission_overrides_v2 WHERE id='finance-editor'");
  });
  for (const table of ['print_job_notes', 'audit_logs']) {
    for (const mode of ['ABORT', 'IGNORE']) {
      await check(`${table} ${mode} rolls back note and audit through composed route`, async () => {
        db.exec(`CREATE TRIGGER note_fault BEFORE INSERT ON ${table} BEGIN SELECT RAISE(${mode}${mode === 'ABORT' ? ",'injected fault'" : ''}); END;`);
        try { await deny(request('approver', 'finance'), 503); }
        finally { db.exec('DROP TRIGGER note_fault'); }
      });
    }
  }
  await check('recovery creates one note/audit without financial or provider truth', async () => {
    const before = snapshot(), response = await send(request('editor'));
    assert.equal(response.status, 200);
    assert.equal(snapshot().notes.length, before.notes.length + 1);
    assert.equal(snapshot().audits.length, before.audits.length + 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales_orders').get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE production_status<>'enquiry'").get().n, 0);
    assert.deepEqual(db.prepare("SELECT * FROM print_job_notes WHERE id='existing-other-note'").get(), existingOtherNote);
    assert.deepEqual(db.prepare("SELECT * FROM audit_logs WHERE id='existing-other-audit'").get(), existingOtherAudit);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(networkCalls, 0);
  });
  console.log(`Printing note composed staging/runtime/session/SQLite acceptance: ${caseCount}/${caseCount} PASS; no network/provider calls; productionMutated=false`);
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}
