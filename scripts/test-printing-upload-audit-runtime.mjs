import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Actual Printing handler, canonical permission evaluator and committed table
// definitions; only D1 transport and R2 are isolated in-memory substitutes.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships', 'audit_logs']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'printing_services', 'print_jobs']],
  ['0077_storage_mirror_queue.sql', ['storage_mirror_jobs']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}
db.exec(`
  INSERT INTO companies(id,code,name,business_type) VALUES
    ('company-printing','PRINTING','Printing fixture','printing'),
    ('company-bakery','BAKERY','Other fixture','bakery');
  INSERT INTO employees(id,display_name) VALUES('creator','Creator'),('owner','Owner'),('other','Other');
  INSERT INTO print_jobs(id,company_id,job_no,title,created_by) VALUES
    ('job-a','company-printing','PRINT-A','Private Printing job','creator'),
    ('job-b','company-bakery','PRINT-B','Other private job','other');
`);
async function load(file, dependencies = {}) {
  const source = await readFile(new URL(`../worker/${file}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(module, module.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `explicit dependency ${file}: ${name}`);
    return dependencies[name];
  });
  return module.exports;
}
const auth = await load('auth');
const { routePrintingProduction: route } = await load('printing-production', { './auth': auth });
const actor = (id, company, level) => ({
  employee: { id }, roles: [{ code: id === 'owner' ? 'owner' : 'employee' }],
  permissions: { 'printing.access': 'manage' },
  companyPermissions: { [company]: { 'printing.access': level } },
});
const creator = actor('creator', 'company-printing', 'create');
const owner = actor('owner', 'company-printing', 'manage');
const other = actor('other', 'company-bakery', 'manage');
const objects = new Map(), puts = [], deletes = [];
let beforeBatch, putFailure = false, networkCalls = 0, cases = 0;
const env = {
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return db.prepare(sql).get(...this.values) || null; },
        async all() { return { results: db.prepare(sql).all(...this.values) }; },
      };
    },
    async batch(statements) {
      beforeBatch?.();
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
    async put(key, bytes, options) {
      if (putFailure) throw new Error('Synthetic R2 failure');
      assert.ok(!objects.has(key), 'uploads never overwrite an accepted object');
      objects.set(key, { bytes: Buffer.from(bytes), ...options });
      puts.push(key);
    },
    async delete(key) { deletes.push(key); objects.delete(key); },
  },
};
const snapshot = () => ({
  queue: db.prepare('SELECT * FROM storage_mirror_jobs ORDER BY id').all(),
  audits: db.prepare('SELECT * FROM audit_logs ORDER BY id').all(),
  objects: [...objects.entries()],
});
const request = ({ jobId = 'job-a', category = 'artwork', content = 'Synthetic file bytes', requestId = 'upload-request' } = {}) => {
  const data = new FormData();
  data.set('jobId', jobId); data.set('category', category);
  data.set('file', new File([content], 'sample artwork.txt', { type: 'text/plain' }));
  return new Request('https://staffportal.test/api/printing/jobs/files', {
    method: 'POST', headers: { 'x-request-id': requestId }, body: data,
  });
};
async function check(name, test) { await test(); cases++; console.log(`PASS ${name}`); }
async function unavailable() {
  const response = await route(request(), env, creator);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'The Printing file could not be saved. Please try again later.' });
}
async function accepted(context, requestId) {
  const before = snapshot();
  const response = await route(request({ requestId }), env, context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.backupStatus, 'provider_required', 'never claim a live secondary copy');
  assert.equal(body.sha256, createHash('sha256').update('Synthetic file bytes').digest('hex'));
  const object = objects.get(body.key);
  assert.ok(object);
  assert.equal(object.customMetadata.companyId, 'company-printing');
  assert.equal(object.customMetadata.jobId, 'job-a');
  assert.equal(object.customMetadata.uploadedBy, context.employee.id);
  assert.equal(object.customMetadata.sha256, body.sha256);
  assert.equal(object.httpMetadata.cacheControl, 'private, no-store');
  const queued = db.prepare('SELECT * FROM storage_mirror_jobs WHERE r2_key=?').get(body.key);
  assert.equal(queued.company_id, 'company-printing');
  assert.equal(queued.status, 'provider_required');
  assert.equal(queued.sha256, body.sha256);
  assert.equal(queued.size_bytes, object.bytes.length);
  assert.equal(queued.provider_item_id, null);
  const audit = db.prepare("SELECT * FROM audit_logs WHERE action='upload_file' AND request_id=?").get(requestId);
  assert.equal(audit.entity_id, 'job-a');
  assert.equal(audit.company_id, 'company-printing');
  assert.equal(audit.actor_employee_id, context.employee.id);
  assert.equal(JSON.parse(audit.after_json).key, body.key);
  assert.doesNotMatch(JSON.stringify(audit), /Synthetic file bytes/);
  const after = snapshot();
  assert.equal(after.queue.length, before.queue.length + 1);
  assert.equal(after.audits.length, before.audits.length + 1);
  assert.equal(after.objects.length, before.objects.length + 1);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('No network permitted'); };
try {
  for (const [context, name] of [[creator, 'creator'], [owner, 'Owner']]) {
    await check(`${name}: accepted R2 file has exact queue receipt and correlated audit`, () => accepted(context, `positive-${name}`));
  }
  for (const [context, input, status] of [
    [other, {}, 403], [actor('creator', 'company-printing', 'none'), {}, 403],
    [creator, { jobId: 'job-b' }, 404], [creator, { jobId: 'missing' }, 404],
    [creator, { category: 'unsupported' }, 400], [creator, { content: '' }, 400],
  ]) {
    await check(`denied/invalid upload ${context.employee.id} ${JSON.stringify(input)}`, async () => {
      const before = snapshot(), putCount = puts.length;
      const response = await route(request(input), env, context);
      assert.equal(response.status, status);
      assert.doesNotMatch(await response.text(), /PRINT-B|Other private|sha256|backupStatus|printing\//);
      assert.deepEqual(snapshot(), before);
      assert.equal(puts.length, putCount, 'denial must precede object storage');
    });
  }
  for (const table of ['storage_mirror_jobs', 'audit_logs']) {
    for (const failure of ['IGNORE', "ABORT,'Synthetic insert failure'"]) {
      await check(`${table} ${failure}: no accepted file, queue or success audit`, async () => {
        const before = snapshot(), deleteCount = deletes.length;
        db.exec(`CREATE TRIGGER reject_upload BEFORE INSERT ON ${table} BEGIN SELECT RAISE(${failure}); END;`);
        try { await unavailable(); }
        finally { db.exec('DROP TRIGGER reject_upload'); }
        assert.deepEqual(snapshot(), before, 'all prior accepted objects and audit history survive rollback');
        assert.equal(deletes.length, deleteCount + 1);
        assert.equal(deletes.at(-1), puts.at(-1), 'only this unaccepted object is compensated');
      });
    }
  }
  await check('company changes while R2 upload awaits: no cross-company receipt', async () => {
    const before = snapshot();
    beforeBatch = () => db.prepare("UPDATE print_jobs SET company_id='company-bakery' WHERE id='job-a'").run();
    try { await unavailable(); }
    finally {
      beforeBatch = undefined;
      db.prepare("UPDATE print_jobs SET company_id='company-printing' WHERE id='job-a'").run();
    }
    assert.deepEqual(snapshot(), before);
  });
  await check('R2 failure cannot enqueue or audit accepted storage', async () => {
    const before = snapshot(); putFailure = true;
    try { await unavailable(); }
    finally { putFailure = false; }
    assert.deepEqual(snapshot(), before);
  });
  await check('retry after rollback succeeds with one new accepted file', () => accepted(creator, 'retry-after-failure'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(networkCalls, 0);
  console.log(`Printing upload SQLite/R2 acceptance: ${cases}/${cases} PASS; zero provider calls; productionMutated=false`);
} finally { globalThis.fetch = originalFetch; db.close(); }
