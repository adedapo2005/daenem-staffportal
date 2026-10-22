import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE print_jobs(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, production_status TEXT NOT NULL);
  CREATE TABLE print_quality_checks(id TEXT PRIMARY KEY, print_job_id TEXT NOT NULL,
    checked_by TEXT NOT NULL, result TEXT NOT NULL, checklist_json TEXT, note TEXT,
    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT,
    module TEXT, action TEXT, entity_type TEXT, entity_id TEXT, after_json TEXT,
    source TEXT, request_id TEXT);
  INSERT INTO print_jobs VALUES('job-a','company-printing','quality_control');
  INSERT INTO print_jobs VALUES('job-b','company-bakery','quality_control');
`);

const env = { DB: {
  prepare(sql) {
    return {
      sql, values: [],
      bind(...values) { this.values = values; return this; },
      async first() { return db.prepare(sql).get(...this.values) || null; },
      async run() { return { meta: db.prepare(sql).run(...this.values) }; },
    };
  },
  async batch(statements) {
    db.exec('BEGIN');
    try {
      for (const statement of statements) db.prepare(statement.sql).run(...statement.values);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
} };

const source = await readFile(new URL('../worker/printing.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const module = { exports: {} };
new Function('exports', 'require', 'module', output)(module.exports, (specifier) => {
  assert.equal(specifier, './auth');
  return { getSessionContext: async () => editor, hasPermission: (context, code, minimum, companyId) => {
    assert.equal(companyId, 'company-printing');
    const levels = ['none', 'view', 'create', 'edit', 'approve', 'manage'];
    return levels.indexOf(context.companyPermissions?.[companyId]?.[code] || 'none') >= levels.indexOf(minimum);
  } };
}, module);
const route = module.exports.routePrinting;
const editor = { employee: { id: 'employee-a' }, companyPermissions: { 'company-printing': { 'printing.access': 'edit' } } };
const otherCompany = { employee: { id: 'employee-b' }, companyPermissions: { 'company-bakery': { 'printing.access': 'manage' } } };
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const submit = (jobId, result, context = editor) => route(new Request('https://staffportal.test/api/printing/jobs/qc', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'qc-request-1' },
  body: JSON.stringify({ jobId, result }),
}), env, context);

let response = await submit('job-a', 'pass', otherCompany);
assert.equal(response.status, 403);
response = await submit('job-b', 'pass');
assert.equal(response.status, 404);
assert.equal(count('print_quality_checks'), 0);
assert.equal(count('audit_logs'), 0);

response = await submit('job-a', 'pass');
assert.equal(response.status, 200);
assert.equal(count('print_quality_checks'), 1);
assert.equal(count('audit_logs'), 1);
const audit = db.prepare("SELECT company_id,request_id,after_json FROM audit_logs WHERE action='quality_check'").get();
assert.equal(audit.company_id, 'company-printing');
assert.equal(audit.request_id, 'qc-request-1');
assert.equal(JSON.parse(audit.after_json).result, 'pass');

response = await submit('job-a', 'rework');
assert.equal(response.status, 200);
assert.equal(db.prepare("SELECT result FROM print_quality_checks WHERE print_job_id='job-a' ORDER BY checked_at DESC,rowid DESC LIMIT 1").get().result, 'rework', 'same-second latest QC must block packaging');
assert.equal(count('audit_logs'), 2);

const originalBatch = env.DB.batch;
env.DB.batch = async (statements) => {
  db.prepare("UPDATE print_jobs SET production_status='completed' WHERE id='job-a'").run();
  return originalBatch(statements);
};
response = await submit('job-a', 'pass');
env.DB.batch = originalBatch;
assert.equal(response.status, 409, 'status change after preflight must deny QC');
assert.equal(count('print_quality_checks'), 2);
assert.equal(count('audit_logs'), 2);

db.prepare("UPDATE print_jobs SET production_status='quality_control' WHERE id='job-a'").run();
db.exec("CREATE TRIGGER reject_qc_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
response = await submit('job-a', 'pass');
assert.equal(response.status, 503);
assert.doesNotMatch(await response.text(), /audit unavailable|SELECT|INSERT/);
assert.equal(count('print_quality_checks'), 2, 'audit failure rolls back QC');
assert.equal(count('audit_logs'), 2);
db.exec('DROP TRIGGER reject_qc_audit');
response = await submit('job-a', 'pass');
assert.equal(response.status, 200, 'retry after audit recovery succeeds');
assert.equal(count('print_quality_checks'), 3);
assert.equal(count('audit_logs'), 3);
console.log('Printing QC audit runtime: company denial, audited success, latest result, stale status, audit rollback, retry PASS');
