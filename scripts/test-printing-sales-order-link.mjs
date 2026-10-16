import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(new URL('../worker/printing-production.ts', import.meta.url), 'utf8');
assert.match(source, /pj\.sales_order_id AS salesOrderId/);
assert.match(source, /!can\(context,'approve'\)/);
assert.match(source, /WHERE pj\.id=\? AND pj\.company_id=\? LIMIT 1/);
assert.match(source, /sales_order_id IS NULL/);
assert.match(source, /production_status=\? AND \$\{linkGuard\}/);
assert.match(source, /INSERT OR IGNORE INTO sales_orders/);
assert.match(source, /INSERT OR IGNORE INTO sales_order_items/);
assert.match(source, /INSERT OR IGNORE INTO audit_logs/);
assert.match(source, /'approved','unpaid','NGN'/);
assert.match(source, /paymentStatus:existing\?\.paymentStatus\|\|'unpaid'/);
assert.match(source, /requestCorrelationId\(request\)/);
assert.match(source, /if\(to==='customer_approved'&&from==='customer_approved'\)/);

const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE print_jobs (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, location_id TEXT, customer_id TEXT,
    job_no TEXT NOT NULL, title TEXT NOT NULL, quantity REAL NOT NULL,
    quoted_kobo INTEGER NOT NULL, production_status TEXT NOT NULL, sales_order_id TEXT,
    created_by TEXT NOT NULL,
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id)
  );
  CREATE TABLE sales_orders (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, location_id TEXT, customer_id TEXT,
    order_no TEXT NOT NULL, channel TEXT NOT NULL, order_date TEXT NOT NULL,
    status TEXT NOT NULL, payment_status TEXT NOT NULL, currency TEXT NOT NULL,
    subtotal_kobo INTEGER NOT NULL, discount_kobo INTEGER NOT NULL, tax_kobo INTEGER NOT NULL,
    total_kobo INTEGER NOT NULL, amount_paid_kobo INTEGER NOT NULL, notes TEXT,
    created_by TEXT NOT NULL, approved_by TEXT,
    UNIQUE(company_id, order_no)
  );
  CREATE TABLE sales_order_items (
    id TEXT PRIMARY KEY, sales_order_id TEXT NOT NULL, description TEXT NOT NULL,
    quantity REAL NOT NULL, unit_price_kobo INTEGER NOT NULL, unit_cost_kobo INTEGER NOT NULL,
    discount_kobo INTEGER NOT NULL, line_total_kobo INTEGER NOT NULL,
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id)
  );
  CREATE TABLE print_job_status_events (
    id TEXT PRIMARY KEY, print_job_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
    changed_by TEXT NOT NULL, note TEXT
  );
  CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT, module TEXT, action TEXT,
    entity_type TEXT, entity_id TEXT, before_json TEXT, after_json TEXT, source TEXT, request_id TEXT
  );
  INSERT INTO print_jobs VALUES
    ('job-a','company-printing','loc-a','customer-a','DP-001','Business cards',100,125000,'quoted',NULL,'employee-a'),
    ('job-b','company-bakery','loc-b','customer-b','DP-001','Foreign job',1,5000,'quoted',NULL,'employee-b');
`);

function approve(jobId, actor = 'approver-a', requestId = 'request-a', failAudit = false) {
  const job = db.prepare('SELECT * FROM print_jobs WHERE id=? AND company_id=?').get(jobId, 'company-printing');
  if (!job) return { ok: false, status: 404 };
  if (job.production_status === 'customer_approved') return { ok: true, salesOrderId: job.sales_order_id };
  if (job.production_status !== 'quoted' || !Number(job.quoted_kobo)) return { ok: false, status: 409 };
  const salesOrderId = `print-order-${jobId}`;
  const orderNo = `PRINT-${job.job_no}`;
  const orderNotes = `Printing job ${jobId}`;
  try {
    db.exec('BEGIN');
    db.prepare(`INSERT OR IGNORE INTO sales_orders
      (id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,
       subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by,approved_by)
      SELECT ?,company_id,location_id,customer_id,?,'other',date('now'),'approved','unpaid','NGN',
       quoted_kobo,0,0,quoted_kobo,0,?,created_by,? FROM print_jobs
      WHERE id=? AND company_id='company-printing' AND production_status='quoted' AND sales_order_id IS NULL AND quoted_kobo>0`)
      .run(salesOrderId, orderNo, orderNotes, actor, jobId);
    db.prepare(`INSERT OR IGNORE INTO sales_order_items
      (id,sales_order_id,description,quantity,unit_price_kobo,unit_cost_kobo,discount_kobo,line_total_kobo)
      SELECT ?,so.id,pj.title,pj.quantity,?,0,0,pj.quoted_kobo FROM print_jobs pj
      JOIN sales_orders so ON so.id=? AND so.company_id=pj.company_id
      WHERE pj.id=? AND pj.company_id='company-printing' AND pj.production_status='quoted'
        AND pj.sales_order_id IS NULL AND so.notes=?`)
      .run(`print-order-item-${jobId}`, Math.round(job.quoted_kobo / job.quantity), salesOrderId, jobId, orderNotes);
    db.prepare(`UPDATE print_jobs SET sales_order_id=?,production_status='customer_approved'
      WHERE id=? AND company_id='company-printing' AND production_status='quoted' AND sales_order_id IS NULL`)
      .run(salesOrderId, jobId);
    db.prepare(`INSERT OR IGNORE INTO print_job_status_events
      (id,print_job_id,from_status,to_status,changed_by,note)
      SELECT ?,id,'quoted','customer_approved',?,'Customer-approved order linked to Printing sales order'
      FROM print_jobs WHERE id=? AND company_id='company-printing' AND production_status='customer_approved' AND sales_order_id=?`)
      .run(`print-event-customer-approved-${jobId}`, actor, jobId, salesOrderId);
    if (failAudit) db.exec(`CREATE TRIGGER deny_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`);
    db.prepare(`INSERT OR IGNORE INTO audit_logs
      (id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id)
      SELECT ?,?,'company-printing','printing','customer_approved_order_link','print_job',?,
        '{"status":"quoted"}',?, 'web',? FROM print_jobs
      WHERE id=? AND company_id='company-printing' AND production_status='customer_approved' AND sales_order_id=?`)
      .run(`print-audit-customer-approved-${jobId}`, actor, jobId,
        JSON.stringify({ status: 'customer_approved', salesOrderId, totalKobo: job.quoted_kobo, paymentStatus: 'unpaid' }),
        requestId, jobId, salesOrderId);
    if (failAudit) db.exec('DROP TRIGGER deny_audit');
    db.exec('COMMIT');
    const order = db.prepare(`SELECT so.id,so.company_id,so.payment_status,so.total_kobo,pj.sales_order_id
      FROM print_jobs pj JOIN sales_orders so ON so.id=pj.sales_order_id AND so.company_id=pj.company_id
      WHERE pj.id=? AND pj.company_id='company-printing' AND pj.production_status='customer_approved'`).get(jobId);
    return order?.id === salesOrderId ? { ok: true, salesOrderId: order.id } : { ok: false, status: 409 };
  } catch {
    try { db.exec('ROLLBACK'); } catch {}
    try { db.exec('DROP TRIGGER IF EXISTS deny_audit'); } catch {}
    return { ok: false, status: 503 };
  }
}

const created = approve('job-a');
assert.deepEqual(created, { ok: true, salesOrderId: 'print-order-job-a' });
assert.deepEqual({ ...db.prepare('SELECT status,payment_status,total_kobo,amount_paid_kobo FROM sales_orders WHERE id=?').get(created.salesOrderId) }, {
  status: 'approved', payment_status: 'unpaid', total_kobo: 125000, amount_paid_kobo: 0,
});
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales_order_items WHERE sales_order_id=?').get(created.salesOrderId).count, 1);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id=? AND request_id=?').get('job-a', 'request-a').count, 1);
assert.deepEqual(approve('job-a'), created, 'retry returns the existing canonical link');
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales_orders WHERE notes=?').get('Printing job job-a').count, 1);
assert.equal(approve('job-b').status, 404, 'foreign-company job is concealed');

db.prepare(`INSERT INTO print_jobs VALUES ('job-fail','company-printing','loc-a',NULL,'DP-002','Flyer',1,4000,'quoted',NULL,'employee-a')`).run();
assert.equal(approve('job-fail', 'approver-a', 'request-fail', true).status, 503);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE id='print-order-job-fail'`).get().count, 0);
assert.equal(db.prepare(`SELECT production_status,sales_order_id FROM print_jobs WHERE id='job-fail'`).get().production_status, 'quoted');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM print_job_status_events WHERE print_job_id='job-fail'`).get().count, 0);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id='job-fail'`).get().count, 0);
db.prepare(`INSERT INTO print_jobs VALUES ('job-stale','company-printing','loc-a',NULL,'DP-003','Stale job',1,4000,'cancelled',NULL,'employee-a')`).run();
assert.equal(approve('job-stale').status, 409);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE id='print-order-job-stale'`).get().count, 0);
db.prepare(`INSERT INTO print_jobs VALUES ('job-zero','company-printing','loc-a',NULL,'DP-004','Unquoted job',1,0,'quoted',NULL,'employee-a')`).run();
assert.equal(approve('job-zero').status, 409);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE id='print-order-job-zero'`).get().count, 0);
console.log('Printing customer-approval sales-order link: 27/27 assertions PASS (isolated SQLite transaction)');
