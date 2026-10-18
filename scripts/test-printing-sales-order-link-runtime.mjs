import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE print_jobs (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, location_id TEXT, customer_id TEXT,
    job_no TEXT NOT NULL, title TEXT NOT NULL, description TEXT, quantity REAL NOT NULL,
    quoted_kobo INTEGER NOT NULL, production_status TEXT NOT NULL, sales_order_id TEXT,
    artwork_status TEXT, proof_status TEXT, priority TEXT, unit TEXT, size_spec TEXT,
    color_spec TEXT, finishing_spec TEXT, due_at TEXT, started_at TEXT, ready_at TEXT,
    completed_at TEXT, invoiced_kobo INTEGER, material_cost_kobo INTEGER, labour_cost_kobo INTEGER,
    finishing_cost_kobo INTEGER, other_cost_kobo INTEGER, gross_profit_kobo INTEGER,
    margin_basis_points INTEGER, service_id TEXT, assigned_designer_id TEXT,
    assigned_operator_id TEXT, internal_note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE sales_orders (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, location_id TEXT, customer_id TEXT,
    order_no TEXT NOT NULL, channel TEXT NOT NULL, order_date TEXT NOT NULL,
    status TEXT NOT NULL, payment_status TEXT NOT NULL, currency TEXT NOT NULL,
    subtotal_kobo INTEGER NOT NULL, discount_kobo INTEGER NOT NULL, tax_kobo INTEGER NOT NULL,
    total_kobo INTEGER NOT NULL, amount_paid_kobo INTEGER NOT NULL, notes TEXT,
    created_by TEXT NOT NULL, approved_by TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id,order_no)
  );
  CREATE TABLE sales_order_items (
    id TEXT PRIMARY KEY, sales_order_id TEXT NOT NULL, description TEXT NOT NULL,
    quantity REAL NOT NULL, unit_price_kobo INTEGER NOT NULL, unit_cost_kobo INTEGER NOT NULL,
    discount_kobo INTEGER NOT NULL, line_total_kobo INTEGER NOT NULL
  );
  CREATE TABLE print_job_status_events(id TEXT PRIMARY KEY,print_job_id TEXT,from_status TEXT,to_status TEXT,changed_by TEXT,note TEXT);
  CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,module TEXT,action TEXT,
    entity_type TEXT,entity_id TEXT,before_json TEXT,after_json TEXT,source TEXT,request_id TEXT);
  CREATE TABLE customers(id TEXT,company_id TEXT,name TEXT,business_name TEXT);
  CREATE TABLE printing_services(id TEXT,company_id TEXT,code TEXT,name TEXT,requires_artwork INTEGER,requires_proof INTEGER);
  CREATE TABLE employee_company_memberships(employee_id TEXT,company_id TEXT,active INTEGER);
  CREATE TABLE employees(id TEXT,display_name TEXT);
  CREATE TABLE app_settings(setting_key TEXT,setting_value TEXT);
  CREATE TABLE print_job_materials(print_job_id TEXT,actual_quantity REAL,waste_quantity REAL,unit_cost_kobo INTEGER);
  CREATE TABLE print_finishing_records(print_job_id TEXT,cost_kobo INTEGER,result TEXT);
  CREATE TABLE print_delivery_records(print_job_id TEXT,delivered_at TEXT);
  INSERT INTO print_jobs(id,company_id,location_id,customer_id,job_no,title,quantity,quoted_kobo,production_status)
    VALUES('job-a','company-printing','location-a','customer-a','DP-001','Business cards',100,125000,'quoted');
`);

const env = {
  DB: {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...args) { this.values = args; return this; },
        async first() { return db.prepare(sql).get(...this.values) || null; },
        async all() { return { results: db.prepare(sql).all(...this.values) }; },
        async run() { const result = db.prepare(sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const statement of statements) {
          const query = statement.sql;
          try { db.prepare(query).run(...statement.values); }
          catch (error) { throw new Error(`${error.message}: ${query}`); }
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  },
};

const source = await readFile(new URL('../worker/printing-production.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'require', 'module', output)(module.exports, (specifier) => {
  assert.equal(specifier, './auth');
  return { hasPermission: () => true };
}, module);
const route = module.exports.routePrintingProduction;
const context = { employee: { id: 'employee-a' } };
const statusRequest = (jobId, toStatus, requestId) => new Request('https://staffportal.test/api/printing/jobs/status', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ jobId, toStatus }),
});

let response = await route(statusRequest('job-a', 'customer_approved', 'request-approval'), env, context);
assert.equal(response.status, 200);
const approval = await response.json();
assert.equal(approval.salesOrderId, 'print-order-job-a');
assert.deepEqual({ ...db.prepare('SELECT status,payment_status,total_kobo,amount_paid_kobo FROM sales_orders WHERE id=?').get(approval.salesOrderId) }, {
  status: 'approved', payment_status: 'unpaid', total_kobo: 125000, amount_paid_kobo: 0,
});
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales_order_items WHERE sales_order_id=?').get(approval.salesOrderId).n, 1);
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE action='customer_approved_order_link'").get().request_id, 'request-approval');

response = await route(statusRequest('job-a', 'customer_approved', 'request-replay'), env, context);
assert.equal(response.status, 200, 'valid approval retry resolves the canonical order');
assert.equal((await response.json()).salesOrderId, approval.salesOrderId);
db.prepare("UPDATE print_jobs SET production_status='delivered' WHERE id='job-a'").run();
db.prepare("INSERT INTO print_job_materials VALUES('job-a',1,0,0)").run();
db.prepare("INSERT INTO print_delivery_records VALUES('job-a',CURRENT_TIMESTAMP)").run();
response = await route(statusRequest('job-a', 'completed', 'request-complete'), env, context);
assert.equal(response.status, 200, await response.text());
assert.deepEqual({ ...db.prepare('SELECT status,payment_status,total_kobo,amount_paid_kobo FROM sales_orders WHERE id=?').get(approval.salesOrderId) }, {
  status: 'completed', payment_status: 'unpaid', total_kobo: 125000, amount_paid_kobo: 0,
});
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE action='completed_sales_order_eligible'").get().request_id, 'request-complete');

db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-race','company-printing','location-a','DP-R','Concurrent approval',20,64000,'quoted')`).run();
const concurrentApprovals = await Promise.all([
  route(statusRequest('job-race', 'customer_approved', 'request-race-a'), env, context),
  route(statusRequest('job-race', 'customer_approved', 'request-race-b'), env, context),
]);
const raceResults = await Promise.all(concurrentApprovals.map(async (result) => ({ status: result.status, body: await result.json() })));
assert.deepEqual(raceResults.map((result) => result.status), [200, 200], 'concurrent approval retries resolve successfully');
assert.equal(raceResults[0].body.salesOrderId, 'print-order-job-race');
assert.equal(raceResults[1].body.salesOrderId, 'print-order-job-race', 'both concurrent requests resolve the same authoritative order');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales_orders WHERE id='print-order-job-race'").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales_order_items WHERE sales_order_id='print-order-job-race'").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-race' AND action='customer_approved_order_link'").get().n, 1);
assert.deepEqual({ ...db.prepare("SELECT production_status,sales_order_id FROM print_jobs WHERE id='job-race'").get() }, {
  production_status: 'customer_approved', sales_order_id: 'print-order-job-race',
});

db.prepare(`INSERT INTO sales_orders(id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,
  subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by)
  VALUES('foreign-order','company-bakery',NULL,NULL,'BAK-1','other',date('now'),'approved','unpaid','NGN',125000,0,0,125000,0,NULL,'employee-b')`).run();
db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status,sales_order_id)
  VALUES('job-corrupt','company-printing','DP-X','Corrupt link',1,125000,'customer_approved','foreign-order')`).run();
response = await route(statusRequest('job-corrupt', 'customer_approved', 'request-corrupt-replay'), env, context);
assert.equal(response.status, 409, 'cross-company linked order replay is rejected');
assert.doesNotMatch(await response.text(), /foreign-order|company-bakery/);

db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-audit-fail','company-printing','location-a','DP-F','Audit failure',1,2500,'quoted')`).run();
db.exec(`CREATE TRIGGER reject_print_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`);
await assert.rejects(route(statusRequest('job-audit-fail', 'customer_approved', 'request-audit-fail'), env, context), /audit unavailable/,
  'required audit failure fails the endpoint');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales_orders WHERE notes='Printing job job-audit-fail'").get().n, 0);
assert.equal(db.prepare("SELECT production_status,sales_order_id FROM print_jobs WHERE id='job-audit-fail'").get().production_status, 'quoted');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-audit-fail'").get().n, 0);

console.log('Printing status Worker-handler SQLite acceptance: approval, concurrent one-order linkage, idempotent retry, company isolation, Finance eligibility, payment-truth preservation, and audit rollback PASS');
