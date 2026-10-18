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
  CREATE TABLE print_finishing_records(print_job_id TEXT,cost_kobo INTEGER,result TEXT);
  CREATE TABLE print_delivery_records(id TEXT PRIMARY KEY,print_job_id TEXT NOT NULL,method TEXT,
    recipient_name TEXT,recipient_phone TEXT,delivery_address TEXT,proof_key TEXT,note TEXT,
    dispatched_by TEXT,delivered_by TEXT,dispatched_at TEXT,delivered_at TEXT,
    acknowledged_by_customer INTEGER);
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
await assert.rejects(route(statusRequest('job-audit-ignore-approval', 'customer_approved', 'request-audit-ignore-approval'), env, context),
  /NOT NULL constraint failed|constraint failed/i,
  'an ignored required approval audit must abort and roll back the order link');
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
await assert.rejects(route(statusRequest('job-audit-ignore-complete', 'completed', 'request-audit-ignore-complete'), env, context),
  /NOT NULL constraint failed|constraint failed/i,
  'an ignored required completion audit must abort and roll back the eligible sale');
assert.equal(db.prepare('SELECT status FROM sales_orders WHERE id=?').get(ignoredAuditOrder).status, 'approved');
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-audit-ignore-complete'").get().production_status, 'delivered');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-audit-ignore-complete' AND to_status='completed'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-audit-ignore-complete' AND action='completed_sales_order_eligible'").get().n, 0);
db.exec('DROP TRIGGER ignore_print_completion_audit');

db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-audit-fail','company-printing','location-a','DP-F','Audit failure',1,2500,'quoted')`).run();
db.exec(`CREATE TRIGGER reject_print_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`);
await assert.rejects(route(statusRequest('job-audit-fail', 'customer_approved', 'request-audit-fail'), env, context), /audit unavailable/,
  'required audit failure fails the endpoint');
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
await assert.rejects(route(deliveryRequest('job-delivery-stale', 'request-stale-delivery'), env, context), /NOT NULL constraint failed/i,
  'a state change after the read aborts delivery, status event and audit atomically');
env.DB.prepare = originalPrepare;
assert.equal(db.prepare("SELECT production_status FROM print_jobs WHERE id='job-delivery-stale'").get().production_status, 'on_hold');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_delivery_records WHERE print_job_id='job-delivery-stale'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_job_status_events WHERE print_job_id='job-delivery-stale'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id='job-delivery-stale' AND action='delivery_record'").get().n, 0);

db.prepare(`INSERT INTO print_jobs(id,company_id,job_no,title,quantity,quoted_kobo,production_status)
  VALUES('job-delivery-audit','company-printing','DP-A','Delivery audit',1,5000,'ready')`).run();
db.exec(`CREATE TRIGGER reject_delivery_audit BEFORE INSERT ON audit_logs WHEN NEW.action='delivery_record'
  BEGIN SELECT RAISE(ABORT,'delivery audit unavailable'); END`);
await assert.rejects(route(deliveryRequest('job-delivery-audit', 'request-delivery-audit-fail'), env, context), /delivery audit unavailable/);
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

console.log('Printing Worker-handler SQLite acceptance: order/Finance linkage, delivery/status CAS, company isolation, payment truth, and audit rollback PASS');
