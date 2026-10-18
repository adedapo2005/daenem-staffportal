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
assert.equal((source.match(/INSERT INTO audit_logs\(/g) || []).length >= 2, true, 'required Printing audit writes must fail the transaction on ID collision');
assert.doesNotMatch(source, /INSERT OR IGNORE INTO audit_logs/);
assert.match(source, /'approved','unpaid','NGN'/);
assert.match(source, /UPDATE sales_orders SET status='approved'.*production_status='customer_approved'/);
assert.match(source, /if\(to==='completed'\)/);
assert.match(source, /UPDATE sales_orders SET status='completed'.*status IN \('approved','processing'\).*payment_status!='refunded'/);
assert.match(source, /production_status='delivered' AND sales_order_id=\?/);
assert.match(source, /completed_sales_order_eligible/);
assert.match(source, /paymentStatus:existing\?\.paymentStatus\|\|'unpaid'/);
assert.match(source, /requestCorrelationId\(request\)/);
assert.match(source, /if\(to==='customer_approved'&&from==='customer_approved'\)/);
const approvalReplay = source.slice(source.indexOf("if(to==='customer_approved'&&from==='customer_approved')"), source.indexOf('if(!(forward[from]||[]).includes(to))'));
assert.match(approvalReplay, /SELECT id,company_id AS companyId,status,payment_status AS paymentStatus,total_kobo AS totalKobo,[\s\S]*?FROM sales_orders WHERE id=\? AND company_id=\?/);
assert.match(approvalReplay, /hasAudit/);
assert.match(source, /linked\.status!=='approved'\|\|linked\.paymentStatus==='refunded'\|\|Number\(linked\.totalKobo\)!==Number\(job\.quotedKobo\|\|0\)/);
const financeAutopost = readFileSync(new URL('../worker/finance-sales-autopost.ts', import.meta.url), 'utf8');
assert.match(financeAutopost, /so\.status='completed'/);

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
  if (job.production_status === 'customer_approved') {
    const linked = job.sales_order_id && db.prepare(`SELECT id,company_id,status,payment_status,total_kobo FROM sales_orders WHERE id=? AND company_id=?`)
      .get(job.sales_order_id, 'company-printing');
    if (!linked || linked.status !== 'approved' || linked.payment_status === 'refunded' || Number(linked.total_kobo) !== Number(job.quoted_kobo || 0)) return { ok: false, status: 409 };
    return { ok: true, salesOrderId: linked.id };
  }
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
    db.prepare(`INSERT INTO audit_logs
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

function complete(jobId, actor = 'approver-a', requestId = 'request-complete', failAudit = false) {
  const job = db.prepare('SELECT * FROM print_jobs WHERE id=? AND company_id=?').get(jobId, 'company-printing');
  if (!job) return { ok: false, status: 404 };
  if (job.production_status !== 'delivered' || !job.sales_order_id) return { ok: false, status: 409 };
  const order = db.prepare('SELECT status,payment_status FROM sales_orders WHERE id=? AND company_id=?').get(job.sales_order_id, 'company-printing');
  if (!order || !['approved', 'processing'].includes(order.status) || order.payment_status === 'refunded') return { ok: false, status: 409 };
  try {
    db.exec('BEGIN');
    db.prepare(`UPDATE sales_orders SET status='completed' WHERE id=? AND company_id='company-printing'
      AND status IN ('approved','processing') AND payment_status!='refunded'
      AND EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id='company-printing'
        AND production_status='delivered' AND sales_order_id=?)`)
      .run(job.sales_order_id, jobId, job.sales_order_id);
    db.prepare(`UPDATE print_jobs SET production_status='completed' WHERE id=? AND company_id='company-printing'
      AND production_status='delivered' AND sales_order_id=?
      AND EXISTS(SELECT 1 FROM sales_orders WHERE id=? AND company_id='company-printing'
        AND status='completed' AND payment_status!='refunded')`)
      .run(jobId, job.sales_order_id, job.sales_order_id);
    db.prepare(`INSERT OR IGNORE INTO print_job_status_events
      (id,print_job_id,from_status,to_status,changed_by,note)
      SELECT ?,id,'delivered','completed',?,'Delivered Printing job completed and linked sale made Finance eligible'
      FROM print_jobs WHERE id=? AND company_id='company-printing'
        AND production_status='completed' AND sales_order_id=?`)
      .run(`print-event-completed-${jobId}`, actor, jobId, job.sales_order_id);
    if (failAudit) db.exec(`CREATE TRIGGER deny_completion_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END`);
    db.prepare(`INSERT INTO audit_logs
      (id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id)
      SELECT ?,?,'company-printing','printing','completed_sales_order_eligible','print_job',?,
        '{"status":"delivered"}',?,'web',? FROM print_jobs pj JOIN sales_orders so
        ON so.id=pj.sales_order_id AND so.company_id=pj.company_id
      WHERE pj.id=? AND pj.company_id='company-printing' AND pj.production_status='completed'
        AND pj.sales_order_id=? AND so.status='completed' AND so.payment_status!='refunded'`)
      .run(`print-audit-completed-${jobId}`, actor, jobId,
        JSON.stringify({ status: 'completed', salesOrderId: job.sales_order_id, paymentStatus: order.payment_status }),
        requestId, jobId, job.sales_order_id);
    if (failAudit) db.exec('DROP TRIGGER deny_completion_audit');
    db.exec('COMMIT');
    const linked = db.prepare(`SELECT pj.sales_order_id,so.status,so.payment_status FROM print_jobs pj
      JOIN sales_orders so ON so.id=pj.sales_order_id AND so.company_id=pj.company_id
      WHERE pj.id=? AND pj.company_id='company-printing' AND pj.production_status='completed'`).get(jobId);
    return linked?.sales_order_id === job.sales_order_id && linked.status === 'completed' && linked.payment_status !== 'refunded'
      ? { ok: true, salesOrderId: linked.sales_order_id }
      : { ok: false, status: 409 };
  } catch {
    try { db.exec('ROLLBACK'); } catch {}
    try { db.exec('DROP TRIGGER IF EXISTS deny_completion_audit'); } catch {}
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

db.prepare(`INSERT INTO sales_orders(id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by)
  VALUES('foreign-replay-order','company-bakery',NULL,NULL,'BAK-9','other',date('now'),'approved','unpaid','NGN',125000,0,0,125000,0,NULL,'employee-b')`).run();
db.prepare(`INSERT INTO print_jobs VALUES ('job-cross-link','company-printing','loc-a',NULL,'DP-X','Corrupt cross-company link',1,125000,'customer_approved','foreign-replay-order','employee-a')`).run();
assert.equal(approve('job-cross-link').status, 409, 'approval replay does not disclose or accept a foreign-company linked order');

db.prepare(`INSERT INTO sales_orders(id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by)
  VALUES('wrong-total-order','company-printing',NULL,NULL,'PRINT-BAD','other',date('now'),'approved','unpaid','NGN',1,0,0,1,0,NULL,'employee-a')`).run();
db.prepare(`INSERT INTO print_jobs VALUES ('job-wrong-total-link','company-printing','loc-a',NULL,'DP-W','Mismatched linked order',1,125000,'customer_approved','wrong-total-order','employee-a')`).run();
assert.equal(approve('job-wrong-total-link').status, 409, 'approval replay rejects an order whose amount no longer matches the job quote');

// A delivered Printing job completes its same-company canonical sale without changing payment truth.
db.prepare(`UPDATE print_jobs SET production_status='delivered' WHERE id='job-a'`).run();
assert.deepEqual(complete('job-a'), { ok: true, salesOrderId: 'print-order-job-a' });
assert.deepEqual({ ...db.prepare('SELECT status,payment_status,total_kobo,amount_paid_kobo FROM sales_orders WHERE id=?').get('print-order-job-a') }, {
  status: 'completed', payment_status: 'unpaid', total_kobo: 125000, amount_paid_kobo: 0,
});
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE company_id='company-printing'
  AND status='completed' AND payment_status!='refunded' AND id=?`).get('print-order-job-a').count, 1,
  'existing Finance autopost candidate query can now see the completed sale');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id='job-a'
  AND action='completed_sales_order_eligible' AND request_id='request-complete'`).get().count, 1);
assert.deepEqual(complete('job-a'), { ok: false, status: 409 }, 'completion replay is denied after the terminal transition');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM print_job_status_events WHERE print_job_id='job-a' AND to_status='completed'`).get().count, 1);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id='job-a' AND action='completed_sales_order_eligible'`).get().count, 1);

db.prepare(`INSERT INTO sales_orders(id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by)
  VALUES('foreign-order','company-bakery',NULL,NULL,'BAK-1','other',date('now'),'approved','unpaid','NGN',1000,0,0,1000,0,NULL,'employee-b')`).run();
db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,customer_id,job_no,title,quantity,quoted_kobo,production_status,sales_order_id,created_by)
  VALUES('job-cross','company-printing','loc-a',NULL,'DP-X','Cross-company order',1,1000,'delivered','foreign-order','employee-a')`).run();
assert.equal(complete('job-cross').status, 409, 'cross-company sales order cannot complete a Printing job');
assert.equal(db.prepare(`SELECT status FROM sales_orders WHERE id='foreign-order'`).get().status, 'approved');

db.prepare(`INSERT INTO sales_orders(id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by)
  VALUES('refunded-order','company-printing',NULL,NULL,'PRINT-R','other',date('now'),'approved','refunded','NGN',1000,0,0,1000,0,NULL,'employee-a')`).run();
db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,customer_id,job_no,title,quantity,quoted_kobo,production_status,sales_order_id,created_by)
  VALUES('job-refunded','company-printing','loc-a',NULL,'DP-R','Refunded order',1,1000,'delivered','refunded-order','employee-a')`).run();
assert.equal(complete('job-refunded').status, 409, 'refunded sales order cannot be made Finance eligible');
assert.equal(db.prepare(`SELECT production_status FROM print_jobs WHERE id='job-refunded'`).get().production_status, 'delivered');

db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,customer_id,job_no,title,quantity,quoted_kobo,production_status,sales_order_id,created_by)
  VALUES('job-no-link','company-printing','loc-a',NULL,'DP-N','Missing link',1,1000,'delivered',NULL,'employee-a')`).run();
assert.equal(complete('job-no-link').status, 409, 'unlinked Printing job cannot become a Finance posting candidate');

db.prepare(`INSERT INTO sales_orders(id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by)
  VALUES('failed-completion-order','company-printing',NULL,NULL,'PRINT-F','other',date('now'),'approved','unpaid','NGN',3000,0,0,3000,0,NULL,'employee-a')`).run();
db.prepare(`INSERT INTO print_jobs(id,company_id,location_id,customer_id,job_no,title,quantity,quoted_kobo,production_status,sales_order_id,created_by)
  VALUES('job-failed-completion','company-printing','loc-a',NULL,'DP-F','Audit rollback',1,3000,'delivered','failed-completion-order','employee-a')`).run();
assert.equal(complete('job-failed-completion', 'approver-a', 'request-failed-completion', true).status, 503);
assert.equal(db.prepare(`SELECT production_status FROM print_jobs WHERE id='job-failed-completion'`).get().production_status, 'delivered');
assert.equal(db.prepare(`SELECT status FROM sales_orders WHERE id='failed-completion-order'`).get().status, 'approved');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM print_job_status_events WHERE print_job_id='job-failed-completion'`).get().count, 0);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id='job-failed-completion'`).get().count, 0);

db.prepare(`INSERT INTO print_jobs VALUES ('job-fail','company-printing','loc-a',NULL,'DP-002','Flyer',1,4000,'quoted',NULL,'employee-a')`).run();
assert.equal(approve('job-fail', 'approver-a', 'request-fail', true).status, 503);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE id='print-order-job-fail'`).get().count, 0);
assert.equal(db.prepare(`SELECT production_status,sales_order_id FROM print_jobs WHERE id='job-fail'`).get().production_status, 'quoted');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM print_job_status_events WHERE print_job_id='job-fail'`).get().count, 0);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id='job-fail'`).get().count, 0);

db.prepare(`INSERT INTO print_jobs VALUES ('job-audit-collision','company-printing','loc-a',NULL,'DP-005','Audit collision',1,4500,'quoted',NULL,'employee-a')`).run();
db.prepare(`INSERT INTO audit_logs(id,entity_id,action) VALUES('print-audit-customer-approved-job-audit-collision','unrelated','unrelated')`).run();
assert.equal(approve('job-audit-collision').status, 503, 'audit ID collision must fail closed');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE id='print-order-job-audit-collision'`).get().count, 0);
assert.deepEqual({ ...db.prepare(`SELECT production_status,sales_order_id FROM print_jobs WHERE id='job-audit-collision'`).get() },
  { production_status: 'quoted', sales_order_id: null }, 'audit collision rolls back the linked order and job transition');
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM print_job_status_events WHERE print_job_id='job-audit-collision'`).get().count, 0);
db.prepare(`INSERT INTO print_jobs VALUES ('job-stale','company-printing','loc-a',NULL,'DP-003','Stale job',1,4000,'cancelled',NULL,'employee-a')`).run();
assert.equal(approve('job-stale').status, 409);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE id='print-order-job-stale'`).get().count, 0);
db.prepare(`INSERT INTO print_jobs VALUES ('job-zero','company-printing','loc-a',NULL,'DP-004','Unquoted job',1,0,'quoted',NULL,'employee-a')`).run();
assert.equal(approve('job-zero').status, 409);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM sales_orders WHERE id='print-order-job-zero'`).get().count, 0);
console.log('Printing customer approval, delivered completion, and Finance handoff: PASS (isolated SQLite transaction)');
