import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Effective staging -> runtime -> canonical session/permissions -> status writer.
// SQLite uses committed table definitions; unrelated pre-route guards are stubbed.
// No provider, R2, remote D1, or payment behavior is simulated as acceptance.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships',
    'roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides', 'auth_sessions', 'audit_logs']],
  ['0002_identity_auth.sql', ['employee_preferences', 'app_settings']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'sales_order_items', 'payments', 'printing_services', 'print_jobs', 'inventory_categories', 'inventory_items', 'print_job_materials', 'print_job_status_events', 'print_proofs', 'print_quality_checks']],
  ['0012_printing_production_controls.sql', ['print_delivery_records']],
  ['0019_employee_permission_overrides_v2.sql', ['employee_permission_overrides_v2']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}

let afterRead = null, readBoundary = '', failAuthorization = false, batches = 0, networkCalls = 0;
const env = {
  APP_STAGE: 'test', AUTH_PEPPER: 'synthetic-printing-test-only',
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.test',
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (failAuthorization && sql.includes('FROM auth_sessions')) throw new Error('Injected authorization failure');
          const result = db.prepare(sql).get(...this.values) || null;
          if (afterRead && sql.includes(readBoundary)) {
            const hook = afterRead; afterRead = null; hook();
          }
          return result;
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
    assert.equal(new URL(request.url).pathname, '/api/printing/jobs/status');
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
  ['approver', 'company-printing', 'approve'], ['editor', 'company-printing', 'edit'], ['operator', 'company-printing', 'create'], ['viewer', 'company-printing', 'view'],
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
  INSERT INTO printing_services(id,code,name,category) VALUES('service-a','DIGITAL','Synthetic service','Digital Print');
  INSERT INTO inventory_items(id,company_id,sku,name) VALUES('material-a','company-printing','TEST','Synthetic material');
  INSERT INTO print_jobs(id,company_id,job_no,title,production_status,quoted_kobo,created_by,service_id,artwork_status,proof_status) VALUES
    ('job-a','company-printing','PRINT-SECRET-A','Protected job A','enquiry',10000,'owner','service-a','approved','approved'),
    ('job-b','company-bakery','PRINT-SECRET-B','Protected job B','enquiry',20000,'other',NULL,'approved','approved');
  INSERT INTO print_job_materials(id,print_job_id,item_id,actual_quantity,issued_by) VALUES('usage-a','job-a','material-a',1,'owner');
  INSERT INTO print_proofs(id,print_job_id,version_no,customer_response) VALUES('proof-a','job-a',1,'approved');
  INSERT INTO print_quality_checks(id,print_job_id,checked_by,result) VALUES('qc-a','job-a','owner','pass');
  INSERT INTO print_delivery_records(id,print_job_id,method,delivered_by,delivered_at)
    VALUES('delivery-a','job-a','pickup','owner',CURRENT_TIMESTAMP);
`);
const tables = ['print_jobs', 'sales_orders', 'sales_order_items', 'payments', 'print_job_status_events', 'audit_logs',
  'print_job_materials', 'print_proofs', 'print_quality_checks', 'print_delivery_records'];
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
const reset = (from = 'enquiry') => {
  db.exec(`DELETE FROM audit_logs; DELETE FROM print_job_status_events;
    UPDATE print_jobs SET sales_order_id=NULL,started_at=NULL,ready_at=NULL,completed_at=NULL WHERE id='job-a';
    DELETE FROM sales_order_items; DELETE FROM sales_orders;`);
  db.prepare("UPDATE print_jobs SET production_status=? WHERE id='job-a'").run(from);
  if (from === 'delivered') {
    db.exec(`INSERT INTO sales_orders(id,company_id,order_no,order_date,status,total_kobo,created_by)
      VALUES('order-a','company-printing','SALE-SECRET-A',date('now'),'approved',10000,'owner');
      UPDATE print_jobs SET sales_order_id='order-a' WHERE id='job-a';`);
  }
  readBoundary = 'FROM print_jobs pj';
};
let cases = 0, requestCount = 0;
const check = async (name, test) => { await test(); cases++; console.log(`PASS ${name}`); };
const request = (actor = 'approver', toStatus = 'quoted', jobId = 'job-a') => new Request('https://staffportal.test/api/printing/jobs/status', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://staffportal.test',
    'x-request-id': `status-${++requestCount}`,
    ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid'}` } : {}) },
  body: JSON.stringify({ jobId, toStatus, note: 'Synthetic transition' }),
});
const send = async input => {
  const response = await staging.default.fetch(input, env, {});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://staffportal.test');
  return response;
};
const deny = async (input, status) => {
  const before = snapshot(), writesBefore = batches;
  const response = await send(input);
  assert.equal(response.status, status);
  const body = await response.text();
  assert.doesNotMatch(body, /PRINT-SECRET|Protected job|SALE-SECRET|salesOrderId|SELECT|INSERT|Injected|synthetic-session/);
  assert.deepEqual(snapshot(), before, 'no job, sale, item, payment, evidence, event or audit changes');
  assert.equal(batches, writesBefore, 'denied before the write transaction');
  return body;
};
const accepted = async (actor, from, to) => {
  reset(from);
  const before = snapshot(), input = request(actor, to), response = await send(input);
  assert.equal(response.status, 200, `${actor}: ${from} -> ${to}`);
  const body = await response.json(), after = snapshot();
  assert.equal(body.ok, true); assert.equal(body.status, to);
  assert.equal(after.print_jobs.find(row => row.id === 'job-a').production_status, to);
  assert.deepEqual(after.print_jobs.find(row => row.id === 'job-b'), before.print_jobs.find(row => row.id === 'job-b'));
  assert.equal(after.print_job_status_events.length, 1);
  const event = after.print_job_status_events[0];
  assert.equal(event.print_job_id, 'job-a'); assert.equal(event.changed_by, actor);
  assert.equal(event.from_status, from); assert.equal(event.to_status, to);
  assert.equal(after.audit_logs.length, 1);
  const audit = after.audit_logs[0];
  assert.equal(audit.company_id, 'company-printing'); assert.equal(audit.entity_id, 'job-a');
  assert.equal(audit.actor_employee_id, actor); assert.equal(audit.request_id, input.headers.get('x-request-id'));
  assert.equal(JSON.parse(audit.before_json).status, from); assert.equal(JSON.parse(audit.after_json).status, to);
  assert.doesNotMatch(JSON.stringify(audit), /synthetic-session/);
  assert.deepEqual(after.payments, []);
  for (const order of after.sales_orders) {
    assert.equal(order.company_id, 'company-printing'); assert.equal(order.payment_status, 'unpaid');
    assert.equal(order.amount_paid_kobo, 0);
    assert.equal(order.status, to === 'completed' ? 'completed' : 'approved');
  }
  for (const table of ['print_job_materials', 'print_proofs', 'print_quality_checks', 'print_delivery_records']) {
    assert.deepEqual(after[table], before[table], `status change preserves ${table}`);
  }
};
const revocations = [
  ['session revoked', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='approver'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='approver'", 401],
  ['session expired', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='approver'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='approver'", 401],
  ['employee inactive', "UPDATE employees SET employment_status='inactive' WHERE id='approver'", "UPDATE employees SET employment_status='active' WHERE id='approver'", 401],
  ['membership revoked', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='approver' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='approver' AND company_id='company-printing'", 403],
  ['role disabled', "UPDATE roles SET active=0 WHERE id='approver'", "UPDATE roles SET active=1 WHERE id='approver'", 403],
  ['edit downgraded', "UPDATE role_permissions SET access_level='view' WHERE id='approver'", "UPDATE role_permissions SET access_level='approve' WHERE id='approver'", 403],
  ['explicit company deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('status-deny','approver','company-printing','print-access','none','Synthetic revocation','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='status-deny'", 403],
  ['session actor replaced', "UPDATE auth_sessions SET employee_id='owner' WHERE id='approver'", "UPDATE auth_sessions SET employee_id='approver' WHERE id='approver'", 401],
  ['session identity replaced', "UPDATE auth_sessions SET id='replacement' WHERE id='approver'", "UPDATE auth_sessions SET id='approver' WHERE id='replacement'", 401],
];
const scenarios = [
  ['job lookup', 'enquiry', 'quoted', 'FROM print_jobs pj'],
  ['proof preflight', 'proof', 'queued', 'FROM print_proofs WHERE'],
  ['QC preflight', 'quality_control', 'packaging', 'SELECT result FROM print_quality_checks'],
  ['approval order preflight', 'quoted', 'customer_approved', 'FROM sales_orders WHERE id=?'],
  ['completion order preflight', 'delivered', 'completed', 'FROM sales_orders WHERE id=?'],
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('No network in isolated Printing acceptance'); };
try {
  reset();
  await check('missing session denied', () => deny(request(null), 401));
  await check('foreign company grant denied despite membership', () => deny(request('other'), 403));
  await check('view and create cannot change status', async () => {
    for (const actor of ['viewer', 'operator']) await deny(request(actor), 403);
  });
  await check('foreign and missing jobs have identical denial', async () => {
    assert.equal(await deny(request('approver', 'quoted', 'job-b'), 404), await deny(request('approver', 'quoted', 'missing'), 404));
  });
  const transitions = [['enquiry','quoted'], ['quoted','customer_approved'], ['customer_approved','design'],
    ['design','proof'], ['proof','queued'], ['queued','printing'], ['printing','finishing'],
    ['finishing','quality_control'], ['quality_control','packaging'], ['packaging','ready'],
    ['ready','delivered'], ['delivered','completed'], ['printing','on_hold'], ['on_hold','cancelled']];
  for (const [from, to] of transitions) {
    await check(`authorized ${from} -> ${to} is scoped and correlated without payment truth`, () => accepted('approver', from, to));
  }
  for (const [from, to] of [['quoted','customer_approved'], ['delivered','completed'], ['enquiry','cancelled']]) {
    await check(`edit cannot ${to}; Owner retains authority`, async () => {
      reset(from); await deny(request('editor', to), 403); await accepted('owner', from, to);
    });
  }
  await check('editor retains ordinary production authority', () => accepted('editor', 'queued', 'printing'));
  for (const [boundary, from, to, sql] of scenarios) {
    for (const [name, revoke, restore, status] of revocations) {
      await check(`${name} after ${boundary} prevents ${to}`, async () => {
        reset(from); readBoundary = sql; afterRead = () => db.exec(revoke);
        try { await deny(request('approver', to), status); assert.equal(afterRead, null, 'race hook executed'); }
        finally { db.exec(restore); afterRead = null; }
      });
    }
    await check(`authorization failure after ${boundary} is bounded and writes nothing`, async () => {
      reset(from); readBoundary = sql; afterRead = () => { failAuthorization = true; };
      try { await deny(request('approver', to), 503); assert.equal(afterRead, null); }
      finally { failAuthorization = false; afterRead = null; }
    });
  }
  for (const [from, to, sql] of [['quoted','customer_approved','FROM sales_orders WHERE id=?'],
    ['delivered','completed','FROM sales_orders WHERE id=?'], ['enquiry','cancelled','FROM print_jobs pj']]) {
    await check(`approval downgrade after preflight blocks ${to} despite retained edit`, async () => {
      reset(from); readBoundary = sql;
      afterRead = () => db.exec("UPDATE role_permissions SET access_level='edit' WHERE id='approver'");
      try { await deny(request('approver', to), 403); assert.equal(afterRead, null); }
      finally { db.exec("UPDATE role_permissions SET access_level='approve' WHERE id='approver'"); afterRead = null; }
    });
  }
  await check('authorized approval replay returns the same order and creates nothing', async () => {
    await accepted('approver', 'quoted', 'customer_approved');
    const before = snapshot(), writesBefore = batches;
    const response = await send(request('approver', 'customer_approved'));
    assert.equal(response.status, 200); assert.equal((await response.json()).salesOrderId, 'print-order-job-a');
    assert.deepEqual(snapshot(), before); assert.equal(batches, writesBefore);
  });
  for (const [name, revoke, restore, status] of revocations) {
    await check(`${name} during approval replay conceals the order link`, async () => {
      await accepted('approver', 'quoted', 'customer_approved');
      readBoundary = 'FROM sales_orders WHERE id=? AND company_id=?'; afterRead = () => db.exec(revoke);
      try { await deny(request('approver', 'customer_approved'), status); assert.equal(afterRead, null); }
      finally { db.exec(restore); afterRead = null; }
    });
  }
  await check('approval-only revocation during replay conceals the order link', async () => {
    await accepted('approver', 'quoted', 'customer_approved');
    readBoundary = 'FROM sales_orders WHERE id=? AND company_id=?';
    afterRead = () => db.exec("UPDATE role_permissions SET access_level='edit' WHERE id='approver'");
    try { await deny(request('approver', 'customer_approved'), 403); assert.equal(afterRead, null); }
    finally { db.exec("UPDATE role_permissions SET access_level='approve' WHERE id='approver'"); afterRead = null; }
  });
  await check('authorization lookup failure during replay is bounded and writes nothing', async () => {
    await accepted('approver', 'quoted', 'customer_approved');
    readBoundary = 'FROM sales_orders WHERE id=? AND company_id=?'; afterRead = () => { failAuthorization = true; };
    try { await deny(request('approver', 'customer_approved'), 503); assert.equal(afterRead, null); }
    finally { failAuthorization = false; afterRead = null; }
  });
  for (const auditFailure of [false, true]) {
    await check(`revocation during ${auditFailure ? 'failed-write recovery' : 'committed approval confirmation'} conceals the link`, async () => {
      reset('quoted'); const before = snapshot();
      readBoundary = 'SELECT pj.sales_order_id AS salesOrderId';
      afterRead = () => db.exec("UPDATE role_permissions SET access_level='edit' WHERE id='approver'");
      if (auditFailure) db.exec("CREATE TRIGGER status_audit_fault BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'injected'); END");
      try {
        const response = await send(request('approver', 'customer_approved'));
        assert.equal(response.status, 403); assert.equal(afterRead, null);
        assert.doesNotMatch(await response.text(), /salesOrderId|PRINT-SECRET|injected/);
        if (auditFailure) assert.deepEqual(snapshot(), before);
        else {
          // Revocation happened after commit: preserve the legitimate transaction,
          // but withhold its link. A newly authorized retry can recover its receipt.
          assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n, 1);
          assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales_orders').get().n, 1);
          assert.equal(db.prepare("SELECT payment_status FROM sales_orders WHERE id='print-order-job-a'").get().payment_status, 'unpaid');
        }
      } finally {
        db.exec("UPDATE role_permissions SET access_level='approve' WHERE id='approver'"); afterRead = null;
        if (auditFailure) db.exec('DROP TRIGGER status_audit_fault');
      }
    });
  }
  for (const [from, to] of [['quoted','customer_approved'], ['delivered','completed']]) {
    for (const mode of ['ABORT', 'IGNORE']) {
      await check(`required audit ${mode} rolls back ${to}`, async () => {
        reset(from); const before = snapshot();
        db.exec(`CREATE TRIGGER status_audit_fault BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(${mode}${mode === 'ABORT' ? ",'injected audit failure'" : ''}); END`);
        try {
          const response = await send(request('approver', to));
          assert.equal(response.status, 503);
          assert.doesNotMatch(await response.text(), /injected|SELECT|INSERT|PRINT-SECRET|salesOrderId/);
          assert.deepEqual(snapshot(), before);
        } finally { db.exec('DROP TRIGGER status_audit_fault'); }
      });
    }
  }
  await check('no network, payment writes or foreign-key violations', async () => {
    assert.equal(networkCalls, 0); assert.deepEqual(db.prepare('SELECT * FROM payments').all(), []);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  });
  console.log(`Printing status composed staging/runtime/session/SQLite acceptance: ${cases}/${cases} PASS; productionMutated=false`);
} finally { globalThis.fetch = originalFetch; db.close(); }
