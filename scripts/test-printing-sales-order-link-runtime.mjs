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
  CREATE TABLE print_job_status_events(id TEXT PRIMARY KEY,print_job_id TEXT NOT NULL,from_status TEXT,to_status TEXT NOT NULL,changed_by TEXT,note TEXT);
  CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,module TEXT,action TEXT,
    entity_type TEXT,entity_id TEXT,before_json TEXT,after_json TEXT,source TEXT,request_id TEXT);
  CREATE TABLE customers(id TEXT,company_id TEXT,name TEXT,business_name TEXT);
  CREATE TABLE printing_services(id TEXT,company_id TEXT,code TEXT,name TEXT,requires_artwork INTEGER,requires_proof INTEGER);
  CREATE TABLE employee_company_memberships(employee_id TEXT,company_id TEXT,active INTEGER);
  CREATE TABLE employees(id TEXT,display_name TEXT);
  CREATE TABLE app_settings(setting_key TEXT,setting_value TEXT);
  CREATE TABLE finance_accounts(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, code TEXT NOT NULL, active INTEGER NOT NULL);
  CREATE TABLE fiscal_periods(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, status TEXT NOT NULL,
    name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL);
  CREATE TABLE journal_entries(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, fiscal_period_id TEXT NOT NULL,
    entry_no TEXT NOT NULL, entry_date TEXT NOT NULL, description TEXT NOT NULL, source_module TEXT NOT NULL,
    source_type TEXT NOT NULL, source_id TEXT NOT NULL, status TEXT NOT NULL, prepared_by TEXT,
    approved_by TEXT, approved_at TEXT, posted_at TEXT);
  CREATE TABLE journal_lines(id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, account_id TEXT NOT NULL,
    description TEXT, debit_kobo INTEGER NOT NULL, credit_kobo INTEGER NOT NULL, customer_id TEXT);
  CREATE TABLE finance_receivables(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, customer_name TEXT NOT NULL,
    customer_ref TEXT, invoice_no TEXT, source_module TEXT NOT NULL, source_id TEXT NOT NULL,
    invoice_date TEXT NOT NULL, due_date TEXT, amount_kobo INTEGER NOT NULL, paid_kobo INTEGER NOT NULL,
    balance_kobo INTEGER NOT NULL, status TEXT NOT NULL, notes TEXT, created_by TEXT);
  CREATE TABLE finance_source_postings(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_module TEXT NOT NULL,
    source_type TEXT NOT NULL, source_id TEXT NOT NULL, journal_entry_id TEXT, receivable_id TEXT,
    posted_amount_kobo INTEGER NOT NULL, cost_amount_kobo INTEGER NOT NULL, status TEXT NOT NULL,
    error_text TEXT, posted_at TEXT NOT NULL, UNIQUE(company_id,source_module,source_type,source_id));
  INSERT INTO customers(id,company_id,name,business_name) VALUES('customer-a','company-printing','Customer A',NULL);
  INSERT INTO finance_accounts VALUES
    ('cash-a','company-printing','1000',1),('ar-a','company-printing','1100',1),
    ('inventory-a','company-printing','1200',1),('revenue-a','company-printing','4000',1),
    ('cogs-a','company-printing','5000',1);
  INSERT INTO fiscal_periods VALUES('period-a','company-printing','open','Current period',date('now','start of month'),date('now','start of month','+1 month','-1 day'));
  CREATE TABLE print_job_materials(print_job_id TEXT,actual_quantity REAL,waste_quantity REAL,unit_cost_kobo INTEGER);
  CREATE TABLE print_finishing_records(id TEXT PRIMARY KEY,print_job_id TEXT NOT NULL,finishing_type TEXT NOT NULL,
    quantity REAL,cost_kobo INTEGER NOT NULL DEFAULT 0,result TEXT NOT NULL DEFAULT 'completed'
    CHECK(result IN ('pending','completed','rework','rejected')),note TEXT,recorded_by TEXT NOT NULL);
  CREATE TABLE print_delivery_records(id TEXT PRIMARY KEY,print_job_id TEXT NOT NULL,method TEXT,
    recipient_name TEXT,recipient_phone TEXT,delivery_address TEXT,proof_key TEXT,note TEXT,
    dispatched_by TEXT,delivered_by TEXT,dispatched_at TEXT,delivered_at TEXT,
    acknowledged_by_customer INTEGER);
  CREATE TABLE print_proofs(id TEXT PRIMARY KEY,print_job_id TEXT NOT NULL,version_no INTEGER NOT NULL,
    file_key TEXT,preview_key TEXT,sent_at TEXT,sent_by TEXT,customer_response TEXT,
    customer_comment TEXT,responded_at TEXT,approved_by_employee_id TEXT,
    UNIQUE(print_job_id,version_no));
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
  return { hasPermission: (candidate, code, minimum, targetCompanyId) => {
    assert.equal(targetCompanyId, 'company-printing');
    const levels = ['none', 'view', 'create', 'edit', 'approve', 'manage'];
    const granted = candidate.companyPermissions?.[targetCompanyId]?.[code] || 'none';
    return levels.indexOf(granted) >= levels.indexOf(minimum);
  } };
}, module);
const route = module.exports.routePrintingProduction;
const financeSource = await readFile(new URL('../worker/finance-sales-autopost.ts', import.meta.url), 'utf8');
const financeOutput = ts.transpileModule(financeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { postFulfilledSalesOrder } = await import(`data:text/javascript;base64,${Buffer.from(financeOutput).toString('base64')}`);
const context = { employee: { id: 'employee-a' }, companyPermissions: { 'company-printing': { 'printing.access': 'approve' } } };
const editOnly = { employee: { id: 'employee-edit' }, companyPermissions: { 'company-printing': { 'printing.access': 'edit' } } };
const owner = { employee: { id: 'employee-owner' }, roles: [{ code: 'owner' }], companyPermissions: { 'company-printing': { 'printing.access': 'manage' } } };
const otherCompanyApprover = { employee: { id: 'employee-other' }, companyPermissions: { 'company-bakery': { 'printing.access': 'approve' } } };
const statusRequest = (jobId, toStatus, requestId) => new Request('https://staffportal.test/api/printing/jobs/status', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ jobId, toStatus }),
});

let response = await route(statusRequest('job-a', 'customer_approved', 'request-edit-approval'), env, editOnly);
assert.equal(response.status, 403, 'Printing Edit cannot approve a quoted job');
assert.doesNotMatch(await response.text(), /print-order-job-a|salesOrderId/);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales_orders WHERE id='print-order-job-a'").get().n, 0);
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-a'").get().production_status, 'quoted');
response = await route(statusRequest('job-a', 'customer_approved', 'request-other-company'), env, otherCompanyApprover);
assert.equal(response.status, 403, 'approval in another company cannot approve a Printing job');
assert.doesNotMatch(await response.text(), /print-order-job-a|salesOrderId/);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales_orders WHERE id='print-order-job-a'").get().n, 0);
response = await route(statusRequest('job-a', 'customer_approved', 'request-approval'), env, context);
assert.equal(response.status, 200);
const approval = await response.json();
assert.equal(approval.salesOrderId, 'print-order-job-a');
assert.deepEqual({ ...db.prepare('SELECT status,payment_status,total_kobo,amount_paid_kobo FROM sales_orders WHERE id=?').get(approval.salesOrderId) }, {
  status: 'approved', payment_status: 'unpaid', total_kobo: 125000, amount_paid_kobo: 0,
});
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales_order_items WHERE sales_order_id=?').get(approval.salesOrderId).n, 1);
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE action='customer_approved_order_link'").get().request_id, 'request-approval');

response = await route(statusRequest('job-a', 'customer_approved', 'request-edit-replay'), env, editOnly);
assert.equal(response.status, 403, 'Printing Edit cannot replay an approval or receive its linked order');
assert.doesNotMatch(await response.text(), /print-order-job-a|salesOrderId/);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-a' AND action='customer_approved_order_link'").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-a' AND to_status='customer_approved'").get().n, 1);
response = await route(statusRequest('job-a', 'customer_approved', 'request-owner-replay'), env, owner);
assert.equal(response.status, 200, 'Owner retains authorized approval retry');
assert.equal((await response.json()).salesOrderId, approval.salesOrderId);
response = await route(statusRequest('job-a', 'customer_approved', 'request-replay'), env, context);
assert.equal(response.status, 200, 'valid approval retry resolves the canonical order');
assert.equal((await response.json()).salesOrderId, approval.salesOrderId);
db.prepare("UPDATE print_jobs SET production_status='delivered' WHERE id='job-a'").run();
db.prepare("INSERT INTO print_job_materials VALUES('job-a',1,0,0)").run();
db.prepare("INSERT INTO print_delivery_records(id,print_job_id,delivered_at) VALUES('delivery-job-a','job-a',CURRENT_TIMESTAMP)").run();
response = await route(statusRequest('job-a', 'completed', 'request-complete'), env, context);
assert.equal(response.status, 200, await response.text());
assert.deepEqual({ ...db.prepare('SELECT status,payment_status,total_kobo,amount_paid_kobo FROM sales_orders WHERE id=?').get(approval.salesOrderId) }, {
  status: 'completed', payment_status: 'unpaid', total_kobo: 125000, amount_paid_kobo: 0,
});
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE action='completed_sales_order_eligible'").get().request_id, 'request-complete');
const financePosting = await postFulfilledSalesOrder(env, approval.salesOrderId);
assert.equal(financePosting.posted, true, 'a completed Printing order enters canonical Finance posting');
assert.equal(financePosting.paidKobo, 0, 'Printing completion cannot fabricate customer payment evidence');
assert.equal(financePosting.balanceKobo, 125000);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_source_postings WHERE company_id='company-printing' AND source_module='sales' AND source_type='sales_order' AND source_id=? AND status='posted'").get(approval.salesOrderId).n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM finance_receivables WHERE company_id='company-printing' AND source_id=? AND amount_kobo=125000 AND paid_kobo=0 AND balance_kobo=125000").get(approval.salesOrderId).n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE company_id='company-printing' AND source_module='sales' AND source_id=? AND status='posted'").get(approval.salesOrderId).n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal_lines WHERE account_id='ar-a' AND debit_kobo=125000 AND credit_kobo=0").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM journal_lines WHERE account_id='cash-a'").get().n, 0, 'unverified payment must not be journaled as cash');

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
  VALUES('job-audit-ignore-approval','company-printing','location-a','DP-I','Ignored audit',1,2500,'quoted')`).run();
db.exec(`CREATE TRIGGER ignore_print_approval_audit BEFORE INSERT ON audit_logs
  WHEN NEW.action='customer_approved_order_link' BEGIN SELECT RAISE(IGNORE); END`);
response = await route(statusRequest('job-audit-ignore-approval', 'customer_approved', 'request-audit-ignore-approval'), env, context);
assert.equal(response.status, 503, 'an ignored required approval audit must abort and roll back the order link');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales_orders WHERE notes='Printing job job-audit-ignore-approval'").get().n, 0);
assert.deepEqual({ ...db.prepare("SELECT production_status,sales_order_id FROM print_jobs WHERE id='job-audit-ignore-approval'").get() }, {
  production_status: 'quoted', sales_order_id: null,
});
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-audit-ignore-approval'").get().n, 0);
db.exec('DROP TRIGGER ignore_print_approval_audit');

db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-audit-ignore-complete','company-printing','location-a','DP-J','Ignored completion audit',1,3500,'quoted')`).run();
response = await route(statusRequest('job-audit-ignore-complete', 'customer_approved', 'request-ignore-complete-approval'), env, context);
assert.equal(response.status, 200);
const ignoredAuditOrder = (await response.json()).salesOrderId;
db.prepare("UPDATE print_jobs SET production_status='delivered' WHERE id='job-audit-ignore-complete'").run();
db.prepare("INSERT INTO print_job_materials VALUES('job-audit-ignore-complete',1,0,0)").run();
db.prepare("INSERT INTO print_delivery_records(id,print_job_id,delivered_at) VALUES('delivery-audit-ignore-complete','job-audit-ignore-complete',CURRENT_TIMESTAMP)").run();
db.exec(`CREATE TRIGGER ignore_print_completion_audit BEFORE INSERT ON audit_logs
  WHEN NEW.action='completed_sales_order_eligible' BEGIN SELECT RAISE(IGNORE); END`);
response = await route(statusRequest('job-audit-ignore-complete', 'completed', 'request-audit-ignore-complete'), env, context);
assert.equal(response.status, 503, 'an ignored required completion audit must abort and roll back the eligible sale');
assert.equal(db.prepare('SELECT status FROM sales_orders WHERE id=?').get(ignoredAuditOrder).status, 'approved');
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-audit-ignore-complete'").get().production_status, 'delivered');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-audit-ignore-complete' AND to_status='completed'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-audit-ignore-complete' AND action='completed_sales_order_eligible'").get().n, 0);
db.exec('DROP TRIGGER ignore_print_completion_audit');

db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-audit-fail','company-printing','location-a','DP-F','Audit failure',1,2500,'quoted')`).run();
db.exec(`CREATE TRIGGER reject_print_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`);
response = await route(statusRequest('job-audit-fail', 'customer_approved', 'request-audit-fail'), env, context);
assert.equal(response.status, 503, 'required audit failure returns a bounded unavailable response');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sales_orders WHERE notes='Printing job job-audit-fail'").get().n, 0);
assert.equal(db.prepare("SELECT production_status,sales_order_id FROM print_jobs WHERE id='job-audit-fail'").get().production_status, 'quoted');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-audit-fail'").get().n, 0);

db.exec('DROP TRIGGER reject_print_audit');
const deliveryRequest = (jobId, requestId, markDelivered = true) => new Request('https://staffportal.test/api/printing/jobs/delivery', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ jobId, method: 'pickup', markDelivered }),
});
db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-delivery','company-printing','DP-D','Delivery guard',1,5000,'quoted')`).run();
response = await route(deliveryRequest('job-delivery', 'request-early-delivery'), env, context);
assert.equal(response.status, 409, 'a quoted job cannot claim completed delivery');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_delivery_records WHERE print_job_id='job-delivery'").get().n, 0);
db.prepare("UPDATE print_jobs SET production_status='ready' WHERE id='job-delivery'").run();
response = await route(deliveryRequest('job-delivery', 'request-valid-delivery'), env, context);
assert.equal(response.status, 200, 'ready job can record delivery');
assert.equal((await response.json()).delivered, true);
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-delivery'").get().production_status, 'delivered');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_delivery_records WHERE print_job_id='job-delivery' AND delivered_at IS NOT NULL").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-delivery' AND from_status='ready' AND to_status='delivered'").get().n, 1);
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE entity_id='job-delivery' AND action='delivery_record'").get().request_id, 'request-valid-delivery');
response = await route(deliveryRequest('job-delivery', 'request-delivery-replay'), env, context);
assert.equal(response.status, 409, 'delivery replay cannot create another completed record');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_delivery_records WHERE print_job_id='job-delivery'").get().n, 1);

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-delivery-stale','company-printing','DP-S','Stale delivery',1,5000,'ready')`).run();
const originalPrepare = env.DB.prepare;
env.DB.prepare = (sql) => {
  const prepared = originalPrepare(sql);
  if (sql.includes('SELECT pj.id,pj.job_no')) {
    const originalFirst = prepared.first.bind(prepared);
    prepared.first = async () => {
      const row = await originalFirst();
      if (row?.id === 'job-delivery-stale') db.prepare("UPDATE print_jobs SET production_status='on_hold' WHERE id='job-delivery-stale'").run();
      return row;
    };
  }
  return prepared;
};
response = await route(deliveryRequest('job-delivery-stale', 'request-stale-delivery'), env, context);
assert.equal(response.status, 503, 'a state change after the read aborts delivery, status event and audit atomically');
env.DB.prepare = originalPrepare;
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-delivery-stale'").get().production_status, 'on_hold');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_delivery_records WHERE print_job_id='job-delivery-stale'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-delivery-stale'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-delivery-stale' AND action='delivery_record'").get().n, 0);

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-delivery-audit','company-printing','DP-A','Delivery audit',1,5000,'ready')`).run();
db.exec(`CREATE TRIGGER reject_delivery_audit BEFORE INSERT ON audit_logs WHEN NEW.action='delivery_record'
  BEGIN SELECT RAISE(ABORT,'delivery audit unavailable'); END`);
response = await route(deliveryRequest('job-delivery-audit', 'request-delivery-audit-fail'), env, context);
assert.equal(response.status, 503);
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-delivery-audit'").get().production_status, 'ready');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_delivery_records WHERE print_job_id='job-delivery-audit'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-delivery-audit'").get().n, 0);
db.exec('DROP TRIGGER reject_delivery_audit');

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-status-ok','company-printing','DP-SO','Status success',1,5000,'enquiry')`).run();
response = await route(statusRequest('job-status-ok', 'quoted', 'request-status-ok'), env, context);
assert.equal(response.status, 200);
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-status-ok'").get().production_status, 'quoted');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-status-ok'").get().n, 1);
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE entity_id='job-status-ok' AND action='status_change'").get().request_id, 'request-status-ok');

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-status-stale','company-printing','DP-SS','Status stale',1,5000,'enquiry')`).run();
const beforeStatusPrepare = env.DB.prepare;
env.DB.prepare = (sql) => {
  const prepared = beforeStatusPrepare(sql);
  if (sql.includes('SELECT pj.id,pj.job_no')) {
    const originalFirst = prepared.first.bind(prepared);
    prepared.first = async () => {
      const row = await originalFirst();
      if (row?.id === 'job-status-stale') db.prepare("UPDATE print_jobs SET production_status='on_hold' WHERE id='job-status-stale'").run();
      return row;
    };
  }
  return prepared;
};
response = await route(statusRequest('job-status-stale', 'quoted', 'request-status-stale'), env, context);
env.DB.prepare = beforeStatusPrepare;
assert.equal(response.status, 409, 'lost status race fails closed');
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-status-stale'").get().production_status, 'on_hold');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-status-stale'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-status-stale'").get().n, 0);

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-status-same-target','company-printing','DP-ST','Status same target',1,5000,'enquiry')`).run();
env.DB.prepare = (sql) => {
  const prepared = beforeStatusPrepare(sql);
  if (sql.includes('SELECT pj.id,pj.job_no')) {
    const originalFirst = prepared.first.bind(prepared);
    prepared.first = async () => {
      const row = await originalFirst();
      if (row?.id === 'job-status-same-target') db.prepare("UPDATE print_jobs SET production_status='quoted' WHERE id='job-status-same-target'").run();
      return row;
    };
  }
  return prepared;
};
response = await route(statusRequest('job-status-same-target', 'quoted', 'request-status-same-target'), env, context);
env.DB.prepare = beforeStatusPrepare;
assert.equal(response.status, 409, 'another writer reaching the same target is not this request succeeding');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-status-same-target'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-status-same-target'").get().n, 0);

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-status-audit','company-printing','DP-SA','Status audit',1,5000,'enquiry')`).run();
db.exec(`CREATE TRIGGER ignore_status_audit BEFORE INSERT ON audit_logs WHEN NEW.action='status_change'
  BEGIN SELECT RAISE(IGNORE); END`);
await assert.rejects(route(statusRequest('job-status-audit', 'quoted', 'request-status-audit'), env, context),
  /malformed JSON/i, 'ignored success audit rolls back the status and event');
db.exec('DROP TRIGGER ignore_status_audit');
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-status-audit'").get().production_status, 'enquiry');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-status-audit'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-status-audit'").get().n, 0);

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-status-foreign','company-bakery','DP-SF','Foreign status',1,5000,'enquiry')`).run();
response = await route(statusRequest('job-status-foreign', 'quoted', 'request-status-foreign'), env, context);
assert.equal(response.status, 404, 'cross-company status remains neutral');
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-status-foreign'").get().production_status, 'enquiry');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-status-foreign'").get().n, 0);

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-delivery-foreign','company-bakery','DP-B','Foreign delivery',1,5000,'ready')`).run();
response = await route(deliveryRequest('job-delivery-foreign', 'request-foreign-delivery'), env, context);
assert.equal(response.status, 404, 'cross-company delivery remains neutral');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_delivery_records WHERE print_job_id='job-delivery-foreign'").get().n, 0);

const proofRequest = (jobId, action, extra = {}, requestId = `proof-${action}`) => new Request('https://staffportal.test/api/printing/jobs/proof', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ jobId, action, ...extra }),
});
db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status,proof_status)
  VALUES('job-proof','company-printing','DP-P','Proof job',1,5000,'proof','pending')`).run();
db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status,proof_status)
  VALUES('job-proof-foreign','company-bakery','DP-PF','Foreign proof',1,5000,'proof','pending')`).run();
response = await route(proofRequest('job-proof', 'create'), env, otherCompanyApprover);
assert.equal(response.status, 403, 'another company cannot create Printing proof evidence');
response = await route(proofRequest('job-proof-foreign', 'create'), env, context);
assert.equal(response.status, 404, 'foreign proof job is concealed');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_proofs WHERE print_job_id IN ('job-proof','job-proof-foreign')").get().n, 0);

response = await route(proofRequest('job-proof', 'create', { fileKey: 'printing/job-proof/proof/file-a' }, 'proof-create'), env, context);
assert.equal(response.status, 200);
const firstProofId = (await response.json()).proofId;
assert.equal(db.prepare('SELECT version_no FROM print_proofs WHERE id=?').get(firstProofId).version_no, 1);
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE entity_id='job-proof' AND action='proof_update'").get().request_id, 'proof-create');
response = await route(proofRequest('job-proof', 'customer_response', { proofId: firstProofId, response: 'approved' }), env, context);
assert.equal(response.status, 503, 'unsent proof cannot be presented as approved');
assert.equal(db.prepare("SELECT proof_status FROM print_jobs WHERE id='job-proof'").get().proof_status, 'pending');

db.exec(`CREATE TRIGGER reject_proof_sent_audit BEFORE INSERT ON audit_logs WHEN NEW.action='proof_update'
  BEGIN SELECT RAISE(ABORT,'proof sent audit unavailable'); END`);
response = await route(proofRequest('job-proof', 'sent', { proofId: firstProofId }, 'proof-sent-audit-failure'), env, owner);
assert.equal(response.status, 503, 'sending state cannot survive required audit failure');
assert.equal(db.prepare('SELECT sent_at FROM print_proofs WHERE id=?').get(firstProofId).sent_at, null);
assert.equal(db.prepare("SELECT proof_status FROM print_jobs WHERE id='job-proof'").get().proof_status, 'pending');
db.exec('DROP TRIGGER reject_proof_sent_audit');
response = await route(proofRequest('job-proof', 'sent', { proofId: firstProofId }, 'proof-sent'), env, owner);
assert.equal(response.status, 200);
assert.equal(db.prepare("SELECT proof_status FROM print_jobs WHERE id='job-proof'").get().proof_status, 'sent');
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE entity_id='job-proof' AND after_json LIKE '%\"sent\"%'").get().request_id, 'proof-sent');
db.exec(`CREATE TRIGGER reject_proof_audit BEFORE INSERT ON audit_logs WHEN NEW.action='proof_update'
  BEGIN SELECT RAISE(ABORT,'proof audit unavailable'); END`);
response = await route(proofRequest('job-proof', 'customer_response', { proofId: firstProofId, response: 'approved' }, 'proof-audit-failure'), env, context);
assert.equal(response.status, 503, 'required audit failure denies proof approval');
assert.equal(db.prepare('SELECT customer_response FROM print_proofs WHERE id=?').get(firstProofId).customer_response, 'pending');
assert.equal(db.prepare("SELECT proof_status FROM print_jobs WHERE id='job-proof'").get().proof_status, 'sent');
db.exec('DROP TRIGGER reject_proof_audit');
response = await route(proofRequest('job-proof', 'customer_response', { proofId: firstProofId, response: 'approved' }, 'proof-approved'), env, context);
assert.equal(response.status, 200, 'approval retry succeeds after audit recovery');
assert.equal(db.prepare("SELECT proof_status FROM print_jobs WHERE id='job-proof'").get().proof_status, 'approved');
assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE entity_id='job-proof' AND after_json LIKE '%approved%'").get().request_id, 'proof-approved');
response = await route(proofRequest('job-proof', 'customer_response', { proofId: firstProofId, response: 'approved' }, 'proof-replay'), env, context);
assert.equal(response.status, 503, 'approval replay cannot create a second success audit');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-proof' AND after_json LIKE '%approved%'").get().n, 1);

db.exec(`CREATE TRIGGER ignore_proof_audit BEFORE INSERT ON audit_logs WHEN NEW.action='proof_update'
  BEGIN SELECT RAISE(IGNORE); END`);
response = await route(proofRequest('job-proof', 'create', { fileKey: 'printing/job-proof/proof/file-b' }, 'proof-create-ignored-audit'), env, context);
assert.equal(response.status, 503, 'silently ignored audit rolls back proof creation');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_proofs WHERE print_job_id='job-proof'").get().n, 1);
assert.equal(db.prepare("SELECT proof_status FROM print_jobs WHERE id='job-proof'").get().proof_status, 'approved');
db.exec('DROP TRIGGER ignore_proof_audit');
response = await route(proofRequest('job-proof', 'create', { fileKey: 'printing/job-proof/proof/file-b' }, 'proof-create-second'), env, context);
assert.equal(response.status, 200);
const secondProofId = (await response.json()).proofId;
assert.equal(db.prepare('SELECT version_no FROM print_proofs WHERE id=?').get(secondProofId).version_no, 2);
response = await route(proofRequest('job-proof', 'sent', { proofId: firstProofId }, 'proof-stale-version'), env, context);
assert.equal(response.status, 503, 'old proof version cannot be sent after a revision');
assert.equal(db.prepare("SELECT proof_status FROM print_jobs WHERE id='job-proof'").get().proof_status, 'pending');

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status,proof_status)
  VALUES('job-proof-race','company-printing','DP-PR','Concurrent proof',1,5000,'proof','pending')`).run();
const proofRace = await Promise.all([
  route(proofRequest('job-proof-race', 'create', {}, 'proof-race-a'), env, context),
  route(proofRequest('job-proof-race', 'create', {}, 'proof-race-b'), env, owner),
]);
assert.deepEqual(proofRace.map((item) => item.status).sort(), [200, 503], 'one version writer wins');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_proofs WHERE print_job_id='job-proof-race'").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-proof-race' AND action='proof_update'").get().n, 1);

db.exec(`CREATE TABLE print_artwork_versions (
  id TEXT PRIMARY KEY, print_job_id TEXT NOT NULL, version_no INTEGER NOT NULL DEFAULT 1,
  file_key TEXT, preview_key TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','designing','ready','approved','rejected','superseded')),
  source TEXT NOT NULL DEFAULT 'internal' CHECK(source IN ('customer','internal','agency','other')),
  note TEXT, created_by TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(print_job_id,version_no)
);`);
const artworkRequest = (jobId, status = 'approved', requestId = 'artwork-request', extra = {}) => new Request('https://staffportal.test/api/printing/jobs/artwork', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ jobId, status, ...extra }),
});
const seedArtworkJob = (id, company = 'company-printing') => db.prepare(`INSERT INTO print_jobs
  (id,company_id,job_no,title,quantity,quoted_kobo,production_status,artwork_status)
  VALUES(?,?,?,'Artwork job',1,5000,'design','received')`).run(id, company, id);
const artworkState = (id) => ({
  job: db.prepare('SELECT company_id,production_status,artwork_status FROM print_jobs WHERE id=?').get(id),
  versions: db.prepare('SELECT * FROM print_artwork_versions WHERE print_job_id=? ORDER BY version_no').all(id),
  audits: db.prepare("SELECT * FROM audit_logs WHERE entity_id=? AND action='artwork_version' ORDER BY id").all(id),
});
seedArtworkJob('artwork-a');
seedArtworkJob('artwork-foreign', 'company-bakery');
const initialArtwork = artworkState('artwork-a');
response = await route(artworkRequest('artwork-a'), env, editOnly);
assert.equal(response.status, 403, 'edit permission cannot approve artwork');
response = await route(artworkRequest('artwork-a'), env, otherCompanyApprover);
assert.equal(response.status, 403, 'foreign-company grant cannot approve artwork');
assert.deepEqual(artworkState('artwork-a'), initialArtwork);
const foreignArtwork = artworkState('artwork-foreign');
response = await route(artworkRequest('artwork-foreign'), env, owner);
assert.equal(response.status, 404, 'foreign job is concealed even from Printing management');
assert.deepEqual(artworkState('artwork-foreign'), foreignArtwork);
response = await route(artworkRequest('artwork-a', 'approved', 'foreign-file', { fileKey: 'printing/artwork-foreign/artwork/file' }), env, context);
assert.equal(response.status, 400);
assert.deepEqual(artworkState('artwork-a'), initialArtwork);

// A silent audit INSERT failure must roll back both the version and the job projection.
db.exec(`CREATE TRIGGER ignore_artwork_audit BEFORE INSERT ON audit_logs WHEN NEW.action='artwork_version'
  BEGIN SELECT RAISE(IGNORE); END`);
response = await route(artworkRequest('artwork-a'), env, context);
assert.equal(response.status, 503, 'ignored artwork audit cannot return approval success');
assert.deepEqual(artworkState('artwork-a'), initialArtwork);
db.exec('DROP TRIGGER ignore_artwork_audit');
for (const [table, operation] of [['print_artwork_versions', 'INSERT'], ['print_jobs', 'UPDATE'], ['audit_logs', 'INSERT']]) {
  db.exec(`CREATE TRIGGER reject_artwork_write BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'artwork write unavailable'); END`);
  response = await route(artworkRequest('artwork-a'), env, context);
  assert.equal(response.status, 503, `${table} failure is bounded`);
  assert.deepEqual(artworkState('artwork-a'), initialArtwork, `${table} failure rolls back the transaction`);
  db.exec('DROP TRIGGER reject_artwork_write');
}
for (const [table, operation] of [['print_artwork_versions', 'INSERT'], ['print_jobs', 'UPDATE']]) {
  db.exec(`CREATE TRIGGER ignore_artwork_write BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(IGNORE); END`);
  response = await route(artworkRequest('artwork-a'), env, context);
  assert.equal(response.status, 503, `${table} zero-row write is denied`);
  assert.deepEqual(artworkState('artwork-a'), initialArtwork);
  db.exec('DROP TRIGGER ignore_artwork_write');
}
response = await route(artworkRequest('artwork-a', 'approved', 'artwork-recovered'), env, owner);
assert.equal(response.status, 200, 'authorized retry succeeds after rollback');
let savedArtwork = artworkState('artwork-a');
assert.equal(savedArtwork.job.artwork_status, 'approved');
assert.equal(savedArtwork.versions.length, 1);
assert.equal(savedArtwork.versions[0].approved_by, owner.employee.id);
assert.ok(savedArtwork.versions[0].approved_at);
assert.equal(savedArtwork.audits.length, 1);
assert.equal(savedArtwork.audits[0].request_id, 'artwork-recovered');
assert.equal(savedArtwork.audits[0].company_id, 'company-printing');
response = await route(artworkRequest('artwork-a', 'rejected', 'artwork-revision'), env, editOnly);
assert.equal(response.status, 200, 'existing edit-level revision semantics remain');
savedArtwork = artworkState('artwork-a');
assert.equal(savedArtwork.versions.length, 2);
assert.equal(savedArtwork.job.artwork_status, 'ready', 'existing rejected-artwork projection remains');
assert.equal(savedArtwork.versions[1].approved_by, null);

seedArtworkJob('artwork-race');
const artworkRace = await Promise.all([
  route(artworkRequest('artwork-race', 'approved', 'artwork-race-a'), env, context),
  route(artworkRequest('artwork-race', 'approved', 'artwork-race-b'), env, owner),
]);
assert.deepEqual(artworkRace.map((item) => item.status).sort(), [200, 503], 'one concurrent version wins');
assert.equal(artworkState('artwork-race').versions.length, 1);
assert.equal(artworkState('artwork-race').audits.length, 1);

seedArtworkJob('artwork-moved');
const artworkPrepare = env.DB.prepare;
env.DB.prepare = (sql) => {
  const prepared = artworkPrepare(sql);
  if (sql.includes('SELECT pj.id,pj.job_no')) {
    const first = prepared.first.bind(prepared);
    prepared.first = async () => {
      const row = await first();
      if (row?.id === 'artwork-moved') db.prepare("UPDATE print_jobs SET company_id='company-bakery' WHERE id='artwork-moved'").run();
      return row;
    };
  }
  return prepared;
};
try {
  response = await route(artworkRequest('artwork-moved'), env, context);
} finally { env.DB.prepare = artworkPrepare; }
assert.equal(response.status, 503, 'company change after initial read cannot authorize artwork writes');
assert.equal(artworkState('artwork-moved').job.artwork_status, 'received');
assert.equal(artworkState('artwork-moved').versions.length, 0);
assert.equal(artworkState('artwork-moved').audits.length, 0);

// Completion must commit the job, sale, event and correlated audit together.
async function seedCompletion(id) {
  db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,job_no,title,quantity,quoted_kobo,production_status)
    VALUES(?,'company-printing','location-a',?,'Completion integrity',1,5200,'quoted')`).run(id, id);
  const approved = await route(statusRequest(id, 'customer_approved', `${id}-approval`), env, context);
  assert.equal(approved.status, 200);
  const { salesOrderId } = await approved.json();
  db.prepare("UPDATE print_jobs SET production_status='delivered' WHERE id=?").run(id);
  db.prepare('INSERT INTO print_job_materials VALUES(?,1,0,0)').run(id);
  db.prepare('INSERT INTO print_delivery_records(id,print_job_id,delivered_at) VALUES(?,?,CURRENT_TIMESTAMP)').run(`delivery-${id}`, id);
  return salesOrderId;
}
const completionState = (id, orderId) => ({
  job: db.prepare('SELECT * FROM print_jobs WHERE id=?').get(id),
  order: db.prepare('SELECT * FROM sales_orders WHERE id=?').get(orderId),
  events: db.prepare('SELECT * FROM print_job_status_events WHERE print_job_id=? ORDER BY id').all(id),
  audits: db.prepare('SELECT * FROM audit_logs WHERE entity_id=? ORDER BY id').all(id),
});
const completionOrder = await seedCompletion('completion-atomic');
const beforeCompletion = completionState('completion-atomic', completionOrder);
for (const behavior of ['IGNORE', "ABORT,'completion write unavailable'"]) {
  for (const [table, operation] of [['print_jobs', 'UPDATE'], ['sales_orders', 'UPDATE'], ['print_job_status_events', 'INSERT'], ['audit_logs', 'INSERT']]) {
    db.exec(`CREATE TRIGGER fail_completion_write BEFORE ${operation} ON ${table}
      BEGIN SELECT RAISE(${behavior}); END`);
    try {
      response = await route(statusRequest('completion-atomic', 'completed', 'completion-fault'), env, context);
      assert.deepEqual(completionState('completion-atomic', completionOrder), beforeCompletion,
        `${table} ${behavior} must roll back all completion writes`);
      assert.equal(response.status, 503, `${table} ${behavior} must fail closed`);
      assert.doesNotMatch(await response.text(), /salesOrderId|5200|completion write unavailable|SQL|constraint/i);
    } finally { db.exec('DROP TRIGGER fail_completion_write'); }
  }
}
response = await route(statusRequest('completion-atomic', 'completed', 'completion-other-company'), env, otherCompanyApprover);
assert.equal(response.status, 403);
assert.doesNotMatch(await response.text(), /salesOrderId|5200/);
response = await route(statusRequest('completion-atomic', 'completed', 'completion-edit-only'), env, editOnly);
assert.equal(response.status, 403);
assert.deepEqual(completionState('completion-atomic', completionOrder), beforeCompletion);
response = await route(statusRequest('completion-atomic', 'completed', 'completion-owner'), env, owner);
assert.equal(response.status, 200, 'Owner can complete after failure recovery');
const afterCompletion = completionState('completion-atomic', completionOrder);
assert.equal(afterCompletion.job.production_status, 'completed');
assert.equal(afterCompletion.order.status, 'completed');
assert.equal(afterCompletion.order.payment_status, 'unpaid');
assert.equal(afterCompletion.order.amount_paid_kobo, 0);
assert.equal(afterCompletion.events.filter((event) => event.to_status === 'completed').length, 1);
const completionAudits = afterCompletion.audits.filter((audit) => audit.action === 'completed_sales_order_eligible');
assert.equal(completionAudits.length, 1);
assert.equal(completionAudits[0].request_id, 'completion-owner');
assert.equal(completionAudits[0].actor_employee_id, owner.employee.id);
assert.equal(completionAudits[0].company_id, 'company-printing');
response = await route(statusRequest('completion-atomic', 'completed', 'completion-replay'), env, owner);
assert.equal(response.status, 409);
assert.deepEqual(completionState('completion-atomic', completionOrder), afterCompletion);

// Historical evidence cannot replace this operation's required event or audit write.
for (const evidence of ['event', 'audit']) {
  const id = `completion-old-${evidence}`, orderId = await seedCompletion(id);
  if (evidence === 'event') {
    db.prepare(`INSERT INTO print_job_status_events(id,print_job_id,from_status,to_status,changed_by)
      VALUES(?,?,'delivered','completed',?)`).run(`print-event-completed-${id}`, id, context.employee.id);
  } else {
    db.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,request_id)
      VALUES(?,?,'company-printing','printing','completed_sales_order_eligible','print_job',?,?)`)
      .run(`print-audit-completed-${id}`, context.employee.id, id, `${id}-attempt`);
  }
  const before = completionState(id, orderId);
  const table = evidence === 'event' ? 'print_job_status_events' : 'audit_logs';
  db.exec(`CREATE TRIGGER ignore_current_completion_evidence BEFORE INSERT ON ${table}
    BEGIN SELECT RAISE(IGNORE); END`);
  try {
    response = await route(statusRequest(id, 'completed', `${id}-attempt`), env, context);
    assert.equal(response.status, 503, `historical ${evidence} cannot satisfy an ignored current write`);
    assert.deepEqual(completionState(id, orderId), before, 'historical evidence and prior state remain intact');
    assert.doesNotMatch(await response.text(), /salesOrderId|5200|SQL|constraint/i);
  } finally { db.exec('DROP TRIGGER ignore_current_completion_evidence'); }
}

// Interleave handlers before serialized SQLite transactions; this is not real D1 concurrency.
const completionRaceOrder = await seedCompletion('completion-race');
const completionRace = await Promise.all([
  route(statusRequest('completion-race', 'completed', 'completion-race-a'), env, context),
  route(statusRequest('completion-race', 'completed', 'completion-race-b'), env, owner),
]);
assert.deepEqual(completionRace.map((item) => item.status).sort(), [200, 503]);
const completionRaceState = completionState('completion-race', completionRaceOrder);
assert.equal(completionRaceState.events.filter((event) => event.to_status === 'completed').length, 1);
const raceAudits = completionRaceState.audits.filter((audit) => audit.action === 'completed_sales_order_eligible');
assert.equal(raceAudits.length, 1);
assert.equal(raceAudits[0].request_id, completionRace[0].status === 200 ? 'completion-race-a' : 'completion-race-b');
assert.equal(completionRaceState.order.payment_status, 'unpaid');
assert.equal(completionRaceState.order.amount_paid_kobo, 0);

// A change after the handler reads the job/order must not be overwritten by completion.
for (const changedRecord of ['job', 'order', 'company', 'order-company', 'payment']) {
  const id = `completion-stale-${changedRecord}`, orderId = await seedCompletion(id);
  const prepareBeforeRace = env.DB.prepare;
  let expected;
  env.DB.prepare = (sql) => {
    const statement = prepareBeforeRace(sql);
    if (sql.startsWith('SELECT status,payment_status AS paymentStatus FROM sales_orders')) {
      const first = statement.first.bind(statement);
      statement.first = async () => {
        const row = await first();
        if (changedRecord === 'job') db.prepare("UPDATE print_jobs SET production_status='on_hold' WHERE id=?").run(id);
        else if (changedRecord === 'company') db.prepare("UPDATE print_jobs SET company_id='company-bakery' WHERE id=?").run(id);
        else if (changedRecord === 'order-company') db.prepare("UPDATE sales_orders SET company_id='company-bakery' WHERE id=?").run(orderId);
        else if (changedRecord === 'payment') db.prepare("UPDATE sales_orders SET payment_status='refunded' WHERE id=?").run(orderId);
        else db.prepare("UPDATE sales_orders SET status='cancelled' WHERE id=?").run(orderId);
        expected = completionState(id, orderId);
        return row;
      };
    }
    return statement;
  };
  try { response = await route(statusRequest(id, 'completed', `${id}-attempt`), env, context); }
  finally { env.DB.prepare = prepareBeforeRace; }
  assert.equal(response.status, 503, `${changedRecord} change cannot authorize completion`);
  assert.doesNotMatch(await response.text(), /salesOrderId|company-bakery|5200/);
  assert.deepEqual(completionState(id, orderId), expected, 'no partial completion or success evidence survives');
}

// Delivery success must include this attempt's record, state event and audit.
const deliveryState = (id) => ({
  job: db.prepare('SELECT * FROM print_jobs WHERE id=?').get(id),
  records: db.prepare('SELECT * FROM print_delivery_records WHERE print_job_id=? ORDER BY id').all(id),
  events: db.prepare('SELECT * FROM print_job_status_events WHERE print_job_id=? ORDER BY id').all(id),
  audits: db.prepare('SELECT * FROM audit_logs WHERE entity_id=? ORDER BY id').all(id),
});
const seedDelivery = (id) => db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES(?,'company-printing',?,'Delivery integrity',1,5000,'ready')`).run(id, id);
for (const markDelivered of [true, false]) {
  const id = `delivery-atomic-${markDelivered}`;
  seedDelivery(id);
  // Historical evidence must never substitute for the current attempt's writes.
  db.prepare(`INSERT INTO print_job_status_events(id,print_job_id,from_status,to_status)
    VALUES(?,?,'ready','delivered')`).run(`${id}-old-event`, id);
  db.prepare(`INSERT INTO audit_logs(id,company_id,module,action,entity_type,entity_id,request_id)
    VALUES(?,'company-printing','printing','delivery_record','print_job',?,'old-request')`).run(`${id}-old-audit`, id);
  db.prepare('INSERT INTO print_delivery_records(id,print_job_id,delivered_at) VALUES(?,?,CURRENT_TIMESTAMP)').run(`${id}-old-record`, id);
  const before = deliveryState(id);
  const writes = [['print_delivery_records', 'INSERT'], ['audit_logs', 'INSERT']];
  if (markDelivered) writes.push(['print_jobs', 'UPDATE'], ['print_job_status_events', 'INSERT']);
  for (const behavior of ['IGNORE', "ABORT,'delivery write unavailable'"]) {
    for (const [table, operation] of writes) {
      db.exec(`CREATE TRIGGER fail_delivery_write BEFORE ${operation} ON ${table}
        BEGIN SELECT RAISE(${behavior}); END`);
      try {
        response = await route(deliveryRequest(id, 'delivery-fault', markDelivered), env, context);
        assert.deepEqual(deliveryState(id), before, `${table} ${behavior} must roll back every delivery write`);
        assert.equal(response.status, 503, `${table} ${behavior} must fail closed`);
        assert.doesNotMatch(await response.text(), /deliveryId|5000|delivery write unavailable|SQL|constraint/i);
      } finally { db.exec('DROP TRIGGER fail_delivery_write'); }
    }
  }
  response = await route(deliveryRequest(id, 'delivery-denied', markDelivered), env, otherCompanyApprover);
  assert.equal(response.status, 403);
  assert.deepEqual(deliveryState(id), before, 'foreign-company permission cannot write delivery evidence');
  response = await route(deliveryRequest(id, 'delivery-retry', markDelivered), env, owner);
  assert.equal(response.status, 200, 'authorized retry succeeds after a rolled-back failure');
  const result = await response.json(), after = deliveryState(id);
  assert.equal(result.delivered, markDelivered);
  assert.equal(after.records.length, before.records.length + 1);
  assert.equal(after.events.length, before.events.length + Number(markDelivered));
  assert.equal(after.audits.length, before.audits.length + 1);
  assert.equal(after.job.production_status, markDelivered ? 'delivered' : 'ready');
  assert.ok(after.records.some((record) => record.id === result.deliveryId));
  assert.equal(after.audits.find((audit) => audit.id !== `${id}-old-audit`).request_id, 'delivery-retry');
  assert.equal(after.job.sales_order_id, null, 'delivery must not create commercial or payment truth');
}
seedDelivery('delivery-concurrent');
const deliveryRace = await Promise.all([
  route(deliveryRequest('delivery-concurrent', 'delivery-race-a'), env, context),
  route(deliveryRequest('delivery-concurrent', 'delivery-race-b'), env, context),
]);
assert.equal(deliveryRace.filter((result) => result.status === 200).length, 1);
assert.ok(deliveryRace.every((result) => [200, 409, 503].includes(result.status)));
const deliveredOnce = deliveryState('delivery-concurrent');
assert.equal(deliveredOnce.records.length, 1);
assert.equal(deliveredOnce.events.length, 1);
assert.equal(deliveredOnce.audits.length, 1);
assert.equal(deliveredOnce.audits[0].request_id, deliveryRace[0].status === 200 ? 'delivery-race-a' : 'delivery-race-b');

for (const markDelivered of [true, false]) {
  for (const changedField of ['company', 'status']) {
    const id = `delivery-stale-${markDelivered}-${changedField}`;
    seedDelivery(id);
    const prepareBeforeRace = env.DB.prepare;
    let expected;
    env.DB.prepare = (sql) => {
      const statement = prepareBeforeRace(sql);
      if (sql.startsWith('SELECT pj.id,pj.job_no')) {
        const first = statement.first.bind(statement);
        statement.first = async () => {
          const row = await first();
          if (row?.id === id) {
            if (changedField === 'company') db.prepare("UPDATE print_jobs SET company_id='company-bakery' WHERE id=?").run(id);
            else db.prepare("UPDATE print_jobs SET production_status='on_hold' WHERE id=?").run(id);
            expected = deliveryState(id);
          }
          return row;
        };
      }
      return statement;
    };
    try { response = await route(deliveryRequest(id, 'delivery-stale-attempt', markDelivered), env, context); }
    finally { env.DB.prepare = prepareBeforeRace; }
    assert.equal(response.status, 503, 'delivery and dispatch both recheck company and state within the transaction');
    assert.doesNotMatch(await response.text(), /deliveryId|company-bakery|5000|SQL|constraint/i);
    assert.deepEqual(deliveryState(id), expected, 'stale attempts leave no delivery/event/audit writes');
  }
}

// Finishing evidence, aggregate costs and correlated audit form one boundary.
const finishingRequest = (id, requestId, overrides = {}) => new Request('https://staffportal.test/api/printing/jobs/finishing', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': requestId },
  body: JSON.stringify({ jobId: id, finishingType: 'Binding', costNaira: 12, quantity: 2, ...overrides }),
});
const seedFinishing = (id) => {
  db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status,
    material_cost_kobo,finishing_cost_kobo,labour_cost_kobo,other_cost_kobo,gross_profit_kobo,margin_basis_points)
    VALUES(?,'company-printing',?,'Finishing integrity',2,10000,'finishing',900,300,400,100,8300,8300)`).run(id, id);
  db.prepare('INSERT INTO print_job_materials VALUES(?,2,1,300)').run(id);
  db.prepare(`INSERT INTO print_finishing_records(id,print_job_id,finishing_type,cost_kobo,result,recorded_by)
    VALUES(?,?,'Existing binding',300,'completed','employee-a')`).run(`${id}-old`, id);
  db.prepare(`INSERT INTO audit_logs(id,company_id,module,action,entity_type,entity_id,request_id)
    VALUES(?,'company-printing','printing','finishing_record','print_job',?,'old-request')`).run(`${id}-old-audit`, id);
};
const finishingState = (id) => ({
  job: db.prepare('SELECT * FROM print_jobs WHERE id=?').get(id),
  records: db.prepare('SELECT * FROM print_finishing_records WHERE print_job_id=? ORDER BY id').all(id),
  audits: db.prepare('SELECT * FROM audit_logs WHERE entity_id=? ORDER BY id').all(id),
});
seedFinishing('finishing-fault');
const beforeFinishing = finishingState('finishing-fault');
for (const body of ['null', '[]', '42', '"invalid"', '{']) {
  response = await route(new Request('https://staffportal.test/api/printing/jobs/finishing', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }), env, context);
  assert.equal(response.status, 400, 'malformed finishing payloads return a bounded client error');
  assert.deepEqual(await response.json(), { error: 'Invalid finishing record.' });
  assert.deepEqual(finishingState('finishing-fault'), beforeFinishing, 'malformed payloads cannot write evidence or costs');
}
for (const behavior of ['IGNORE', "ABORT,'finishing write unavailable'"]) {
  for (const stage of ['INSERT ON print_finishing_records', 'UPDATE OF material_cost_kobo ON print_jobs',
    'UPDATE OF gross_profit_kobo ON print_jobs', 'INSERT ON audit_logs']) {
    db.exec(`CREATE TRIGGER fail_finishing_write BEFORE ${stage} BEGIN SELECT RAISE(${behavior}); END`);
    try {
      response = await route(finishingRequest('finishing-fault', 'finishing-fault-request'), env, context);
      assert.equal(response.status, 503, `${stage} ${behavior} must fail closed`);
      assert.doesNotMatch(await response.text(), /finishingId|costKobo|SQL|constraint|finishing write unavailable/i);
      assert.deepEqual(finishingState('finishing-fault'), beforeFinishing, 'all costs, records and audit roll back');
    } finally { db.exec('DROP TRIGGER fail_finishing_write'); }
  }
}
for (const denied of [otherCompanyApprover, editOnly]) {
  response = await route(finishingRequest('finishing-fault', 'finishing-denied'), env, denied);
  assert.equal(response.status, 403);
  assert.deepEqual(finishingState('finishing-fault'), beforeFinishing);
}
for (const costNaira of ['invalid', 'Infinity', -1, Number.MAX_SAFE_INTEGER]) {
  response = await route(finishingRequest('finishing-fault', 'finishing-invalid', { costNaira }), env, context);
  assert.equal(response.status, 400);
  assert.deepEqual(finishingState('finishing-fault'), beforeFinishing);
}
for (const actor of [context, owner]) {
  response = await route(finishingRequest('finishing-fault', `finishing-${actor.employee.id}`), env, actor);
  assert.equal(response.status, 200, 'authorized retry after rollback succeeds');
  const { finishingId } = await response.json();
  const record = db.prepare('SELECT * FROM print_finishing_records WHERE id=?').get(finishingId);
  assert.equal(record.recorded_by, actor.employee.id);
  const audit = db.prepare('SELECT * FROM audit_logs WHERE request_id=?').get(`finishing-${actor.employee.id}`);
  assert.equal(audit.company_id, 'company-printing');
  assert.equal(audit.actor_employee_id, actor.employee.id);
  assert.equal(JSON.parse(audit.after_json).finishingId, finishingId);
}
const finishedCosts = finishingState('finishing-fault');
assert.equal(finishedCosts.job.material_cost_kobo, 900);
assert.equal(finishedCosts.job.finishing_cost_kobo, 2700);
assert.equal(finishedCosts.job.gross_profit_kobo, 5900);
assert.equal(finishedCosts.job.margin_basis_points, 5900);
assert.equal(finishedCosts.job.production_status, 'finishing');
assert.equal(finishedCosts.job.sales_order_id, null, 'finishing cannot fabricate sale or payment truth');

for (const result of ['pending', 'rejected', 'rework']) {
  const id = `finishing-result-${result}`;
  seedFinishing(id);
  response = await route(finishingRequest(id, id, { result }), env, context);
  assert.equal(response.status, 200);
  assert.equal(finishingState(id).job.finishing_cost_kobo, result === 'rework' ? 1500 : 300);
}
// Preserve the existing JS Math.round behavior, including negative half margins.
seedFinishing('finishing-rounding');
db.prepare("UPDATE print_jobs SET invoiced_kobo=20000,labour_cost_kobo=18801 WHERE id='finishing-rounding'").run();
response = await route(finishingRequest('finishing-rounding', 'finishing-rounding', { costNaira: 0 }), env, editOnly);
assert.equal(response.status, 200, 'operational staff can still record zero-cost finishing');
assert.equal(finishingState('finishing-rounding').job.gross_profit_kobo, -101);
assert.equal(finishingState('finishing-rounding').job.margin_basis_points, -50);

for (const terminal of ['completed', 'cancelled']) {
  const id = `finishing-${terminal}`;
  seedFinishing(id);
  db.prepare('UPDATE print_jobs SET production_status=? WHERE id=?').run(terminal, id);
  const before = finishingState(id);
  response = await route(finishingRequest(id, id), env, owner);
  assert.equal(response.status, 409, 'Owner cannot rewrite finalized job costs through finishing');
  assert.deepEqual(finishingState(id), before);
}
seedFinishing('finishing-foreign');
db.prepare("UPDATE print_jobs SET company_id='company-bakery' WHERE id='finishing-foreign'").run();
const beforeForeignFinishing = finishingState('finishing-foreign');
response = await route(finishingRequest('finishing-foreign', 'finishing-foreign'), env, context);
assert.equal(response.status, 404);
assert.deepEqual(await response.json(), { error: 'Print job not found.' });
assert.deepEqual(finishingState('finishing-foreign'), beforeForeignFinishing);

for (const changedField of ['company', 'status']) {
  const id = `finishing-stale-${changedField}`;
  seedFinishing(id);
  const prepareBeforeRace = env.DB.prepare;
  let expected;
  env.DB.prepare = (sql) => {
    const statement = prepareBeforeRace(sql);
    if (sql.startsWith('SELECT pj.id,pj.job_no')) {
      const first = statement.first.bind(statement);
      statement.first = async () => {
        const row = await first();
        if (row?.id === id) {
          if (changedField === 'company') db.prepare("UPDATE print_jobs SET company_id='company-bakery' WHERE id=?").run(id);
          else db.prepare("UPDATE print_jobs SET production_status='completed' WHERE id=?").run(id);
          expected = finishingState(id);
        }
        return row;
      };
    }
    return statement;
  };
  try { response = await route(finishingRequest(id, id), env, context); }
  finally { env.DB.prepare = prepareBeforeRace; }
  assert.equal(response.status, 503);
  assert.deepEqual(finishingState(id), expected, 'stale finishing cannot alter another company or finalized costs');
}
seedFinishing('finishing-concurrent');
const finishingRace = await Promise.all([
  route(finishingRequest('finishing-concurrent', 'finishing-race-a'), env, context),
  route(finishingRequest('finishing-concurrent', 'finishing-race-b'), env, context),
]);
assert.ok(finishingRace.every((result) => result.status === 200), 'distinct finishing records remain additive');
const concurrentFinishing = finishingState('finishing-concurrent');
assert.equal(concurrentFinishing.records.length, 3);
assert.equal(concurrentFinishing.audits.length, 3);
assert.equal(concurrentFinishing.job.finishing_cost_kobo, 2700, 'concurrent records cannot lose an aggregate cost');
assert.equal(concurrentFinishing.job.gross_profit_kobo, 5900);

// An approval cannot commit when any required commercial or history row is skipped.
const seedApproval = (id, linked = false) => {
  db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,customer_id,job_no,title,quantity,quoted_kobo,production_status)
    VALUES(?,'company-printing','location-a','customer-a',?,'Approval integrity',2,5000,'quoted')`).run(id, id);
  if (linked) {
    db.prepare(`INSERT INTO sales_orders(id,company_id,location_id,customer_id,order_no,channel,order_date,status,
      payment_status,currency,subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by)
      VALUES(?,'company-printing','location-a','customer-a',?,'other',date('now'),'draft','unpaid','NGN',5000,0,0,5000,0,NULL,'employee-a')`).run(`existing-${id}`, id);
    db.prepare('UPDATE print_jobs SET sales_order_id=? WHERE id=?').run(`existing-${id}`, id);
  }
};
const approvalState = (id) => ({
  job: db.prepare('SELECT * FROM print_jobs WHERE id=?').get(id),
  orders: db.prepare('SELECT * FROM sales_orders WHERE id IN (?,?) ORDER BY id').all(`print-order-${id}`, `existing-${id}`),
  items: db.prepare('SELECT * FROM sales_order_items WHERE id=? OR sales_order_id IN (?,?) ORDER BY id').all(`print-order-item-${id}`, `print-order-${id}`, `existing-${id}`),
  events: db.prepare('SELECT * FROM print_job_status_events WHERE print_job_id=? ORDER BY id').all(id),
  audits: db.prepare('SELECT * FROM audit_logs WHERE entity_id=? ORDER BY id').all(id),
});
let approvalFaults = 0;
for (const linked of [false, true]) {
  const id = `approval-fault-${linked}`;
  seedApproval(id, linked);
  const before = approvalState(id);
  const stages = linked ? ['UPDATE ON sales_orders'] : ['INSERT ON sales_orders', 'INSERT ON sales_order_items'];
  stages.push('UPDATE ON print_jobs', 'INSERT ON print_job_status_events', 'INSERT ON audit_logs');
  for (const behavior of ['IGNORE', "ABORT,'approval write unavailable'"]) {
    for (const stage of stages) {
      db.exec(`CREATE TRIGGER fail_approval_write BEFORE ${stage} BEGIN SELECT RAISE(${behavior}); END`);
      try {
        response = await route(statusRequest(id, 'customer_approved', 'approval-fault'), env, context);
        assert.equal(response.status, 503, `${linked}: ${stage} ${behavior} must fail closed`);
        assert.deepEqual(await response.json(), { error: 'The Printing approval could not be saved. Refresh and try again.' });
        assert.deepEqual(approvalState(id), before, 'no orphan sale, item, status, event or success audit may survive');
        approvalFaults++;
      } finally { db.exec('DROP TRIGGER fail_approval_write'); }
    }
  }
  response = await route(statusRequest(id, 'customer_approved', `approval-retry-${linked}`), env, linked ? owner : context);
  assert.equal(response.status, 200, 'authorized and Owner retry succeed after every rolled-back fault');
  const saved = approvalState(id);
  assert.equal(saved.orders.length, 1);
  assert.equal(saved.orders[0].status, 'approved');
  assert.equal(saved.orders[0].payment_status, 'unpaid');
  assert.equal(saved.orders[0].amount_paid_kobo, 0);
  assert.equal(saved.events.length, 1);
  assert.equal(saved.audits.length, 1);
  assert.equal(saved.audits[0].request_id, `approval-retry-${linked}`);
  assert.equal(saved.audits[0].actor_employee_id, linked ? owner.employee.id : context.employee.id);
  response = await route(statusRequest(id, 'customer_approved', 'approval-replay'), env, context);
  assert.equal(response.status, 200);
  assert.deepEqual(approvalState(id), saved, 'replay must not duplicate any order, item, event or audit');
}

// Inject an authoritative change after the reads but before the transaction starts.
let approvalRaces = 0;
for (const change of ['company', 'status', 'quote', 'quantity', 'customer', 'location', 'title', 'jobNo', 'link',
  'order-company', 'order-status', 'order-payment', 'order-total']) {
  const linked = change.startsWith('order-');
  const id = `approval-stale-${change}`;
  seedApproval(id, linked);
  const originalBatch = env.DB.batch;
  let expected;
  env.DB.batch = async (statements) => {
    const changes = {
      company: "UPDATE print_jobs SET company_id='company-bakery' WHERE id=?",
      status: "UPDATE print_jobs SET production_status='cancelled' WHERE id=?",
      quote: 'UPDATE print_jobs SET quoted_kobo=6000 WHERE id=?',
      quantity: 'UPDATE print_jobs SET quantity=3 WHERE id=?',
      customer: "UPDATE print_jobs SET customer_id='customer-other' WHERE id=?",
      location: "UPDATE print_jobs SET location_id='location-other' WHERE id=?",
      title: "UPDATE print_jobs SET title='Changed title' WHERE id=?",
      jobNo: "UPDATE print_jobs SET job_no='Changed reference' WHERE id=?",
      link: "UPDATE print_jobs SET sales_order_id='foreign-order' WHERE id=?",
      'order-company': "UPDATE sales_orders SET company_id='company-bakery' WHERE id=?",
      'order-status': "UPDATE sales_orders SET status='cancelled' WHERE id=?",
      'order-payment': "UPDATE sales_orders SET payment_status='refunded' WHERE id=?",
      'order-total': 'UPDATE sales_orders SET total_kobo=6000 WHERE id=?',
    };
    db.prepare(changes[change]).run(linked ? `existing-${id}` : id);
    expected = approvalState(id);
    return originalBatch(statements);
  };
  try { response = await route(statusRequest(id, 'customer_approved', 'approval-stale'), env, context); }
  finally { env.DB.batch = originalBatch; }
  assert.equal(response.status, 503, `stale ${change} must not approve`);
  assert.deepEqual(await response.json(), { error: 'The Printing approval could not be saved. Refresh and try again.' });
  assert.deepEqual(approvalState(id), expected, 'stale approval preserves authoritative change without any new writes');
  approvalRaces++;
}

// A deterministic item-ID collision must never link another sale's item or overwrite it.
seedApproval('approval-item-collision');
db.prepare(`INSERT INTO sales_order_items(id,sales_order_id,description,quantity,unit_price_kobo,unit_cost_kobo,discount_kobo,line_total_kobo)
  VALUES('print-order-item-approval-item-collision','foreign-order','Other company item',1,5000,0,0,5000)`).run();
const beforeItemCollision = approvalState('approval-item-collision');
response = await route(statusRequest('approval-item-collision', 'customer_approved', 'approval-collision'), env, context);
assert.equal(response.status, 503);
assert.deepEqual(approvalState('approval-item-collision'), beforeItemCollision);
assert.doesNotMatch(await response.text(), /foreign-order|Other company|company-bakery/);
console.log(`Approval integrity: ${approvalFaults} write-fault rollbacks, ${approvalRaces} stale-state denials, canonical item collision, authorized/Owner retry and replay PASS`);

console.log('Printing Worker-handler SQLite acceptance: order/Finance linkage, delivery/status CAS, delivery fault matrix and single-winner, proof/artwork rollback, completion fault matrix and single-winner, finishing cost/audit atomicity and stale-company/terminal guards, approval integrity, company isolation, payment truth PASS');
