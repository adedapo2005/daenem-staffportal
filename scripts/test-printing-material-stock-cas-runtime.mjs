import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE print_jobs(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, production_status TEXT NOT NULL,
    quoted_kobo INTEGER DEFAULT 0, invoiced_kobo INTEGER DEFAULT 0, labour_cost_kobo INTEGER DEFAULT 0,
    finishing_cost_kobo INTEGER DEFAULT 0, other_cost_kobo INTEGER DEFAULT 0, material_cost_kobo INTEGER DEFAULT 0,
    gross_profit_kobo INTEGER DEFAULT 0, margin_basis_points INTEGER DEFAULT 0, updated_at TEXT);
  CREATE TABLE inventory_items(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, name TEXT, unit_cost_kobo INTEGER, active INTEGER);
  CREATE TABLE company_locations(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, active INTEGER);
  CREATE TABLE stock_balances(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, location_id TEXT NOT NULL,
    item_id TEXT NOT NULL, quantity REAL NOT NULL, reserved_quantity REAL NOT NULL, updated_at TEXT);
  CREATE TABLE print_job_materials(id TEXT PRIMARY KEY, print_job_id TEXT, item_id TEXT, actual_quantity REAL,
    waste_quantity REAL, unit_cost_kobo INTEGER, issued_from_location_id TEXT, issued_by TEXT, note TEXT);
  CREATE TABLE stock_movements(id TEXT PRIMARY KEY, company_id TEXT, item_id TEXT, movement_type TEXT,
    quantity REAL, unit_cost_kobo INTEGER, from_location_id TEXT, reference_type TEXT, reference_id TEXT,
    reason TEXT, created_by TEXT);
  CREATE TABLE audit_logs(id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT, module TEXT,
    action TEXT, entity_type TEXT, entity_id TEXT, after_json TEXT, source TEXT, request_id TEXT);
  INSERT INTO company_locations VALUES('location-a','company-printing',1);
  INSERT INTO inventory_items VALUES('paper-a','company-printing','Paper',100,1);
  INSERT INTO print_jobs(id,company_id,production_status,quoted_kobo) VALUES
    ('job-a','company-printing','printing',10000),('job-b','company-printing','printing',10000),
    ('job-closed','company-printing','completed',10000),('job-foreign','company-bakery','printing',10000);
  INSERT INTO stock_balances VALUES('balance-a','company-printing','location-a','paper-a',7,2,NULL);
`);

const env = { DB: {
  prepare(sql) { return {
    sql, values: [], bind(...values) { this.values = values; return this; },
    async first() { return db.prepare(sql).get(...this.values) || null; },
    async all() { return { results: db.prepare(sql).all(...this.values) }; },
    async run() { const result = db.prepare(sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; },
  }; },
  async batch(statements) {
    db.exec('BEGIN');
    try { for (const statement of statements) db.prepare(statement.sql).run(...statement.values); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
} };
const source = await readFile(new URL('../worker/printing.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'require', 'module', output)(module.exports, (specifier) => {
  assert.equal(specifier, './auth');
  return { getSessionContext: async () => authorized, hasPermission: (context, code, minimum, companyId) => {
    assert.equal(companyId, 'company-printing');
    const levels = ['none', 'view', 'create', 'edit', 'approve', 'manage'];
    return levels.indexOf(context.companyPermissions?.[companyId]?.[code] || 'none') >= levels.indexOf(minimum);
  } };
}, module);
const route = module.exports.routePrinting;
const authorized = { employee: { id: 'employee-a' }, companyPermissions: { 'company-printing': { 'printing.access': 'create' } } };
const denied = { employee: { id: 'employee-b' }, companyPermissions: { 'company-bakery': { 'printing.access': 'manage' } } };
const issue = (jobId, quantity, context = authorized) => route(new Request('https://staffportal.test/api/printing/jobs/materials', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jobId, itemId: 'paper-a', locationId: 'location-a', actualQuantity: quantity }),
}), env, context);
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

let response = await issue('job-a', 1, denied);
assert.equal(response.status, 403);
assert.equal(count('print_job_materials'), 0);
response = await issue('job-foreign', 1);
assert.equal(response.status, 404);
assert.equal(count('stock_movements'), 0);

response = await issue('job-a', 2);
assert.equal(response.status, 200);
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE id='balance-a'").get().quantity, 5);
assert.equal(count('print_job_materials'), 1);
assert.equal(count('stock_movements'), 1);
assert.equal(count('audit_logs'), 1);
assert.deepEqual({ ...db.prepare("SELECT material_cost_kobo,gross_profit_kobo,margin_basis_points FROM print_jobs WHERE id='job-a'").get() },
  { material_cost_kobo: 200, gross_profit_kobo: 9800, margin_basis_points: 9800 });

const [raceA, raceB] = await Promise.all([issue('job-a', 2), issue('job-b', 2)]);
assert.deepEqual([raceA.status, raceB.status].sort(), [200, 409], 'only one of two stale stock claims may win');
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE id='balance-a'").get().quantity, 3);
assert.equal(count('print_job_materials'), 2);
assert.equal(count('stock_movements'), 2);
assert.equal(count('audit_logs'), 2);
assert.equal(db.prepare("SELECT material_cost_kobo FROM print_jobs WHERE id='job-a'").get().material_cost_kobo
  + db.prepare("SELECT material_cost_kobo FROM print_jobs WHERE id='job-b'").get().material_cost_kobo, 400);

// A job closed after the preflight read must not consume stock or leave evidence.
const originalPrepare = env.DB.prepare;
env.DB.prepare = (sql) => {
  const prepared = originalPrepare(sql);
  if (sql.includes('FROM stock_balances WHERE company_id = ? AND location_id = ?')) {
    const first = prepared.first.bind(prepared);
    prepared.first = async () => {
      const row = await first();
      db.prepare("UPDATE print_jobs SET production_status='completed' WHERE id='job-b'").run();
      return row;
    };
  }
  return prepared;
};
response = await issue('job-b', 1);
env.DB.prepare = originalPrepare;
assert.equal(response.status, 409);
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE id='balance-a'").get().quantity, 3);
assert.equal(count('print_job_materials'), 2);

db.exec(`CREATE TRIGGER reject_print_material_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`);
assert.equal((await issue('job-a', 1)).status, 503);
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE id='balance-a'").get().quantity, 3);
assert.equal(count('print_job_materials'), 2);
assert.equal(count('stock_movements'), 2);
assert.equal(count('audit_logs'), 2);
db.exec('DROP TRIGGER reject_print_material_audit');
db.exec(`CREATE TRIGGER reject_print_material_summary BEFORE UPDATE OF material_cost_kobo ON print_jobs
  BEGIN SELECT RAISE(ABORT,'summary unavailable'); END`);
assert.equal((await issue('job-a', 1)).status, 503);
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE id='balance-a'").get().quantity, 3);
assert.equal(count('print_job_materials'), 2);
assert.equal(count('stock_movements'), 2);
assert.equal(count('audit_logs'), 2);
console.log('Printing material stock CAS: authorized, company denial, one-winner race, closed job, audit/summary rollback PASS');
