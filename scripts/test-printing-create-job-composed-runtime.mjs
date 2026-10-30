import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Effective staging -> runtime -> canonical session/permissions -> job creation.
// Committed schema in isolated SQLite; unrelated pre-route guards are stubbed.
// This does not claim remote D1, provider, browser or independent QA acceptance.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships',
    'roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides', 'auth_sessions', 'audit_logs']],
  ['0002_identity_auth.sql', ['employee_preferences', 'app_settings']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'sales_order_items', 'payments', 'printing_services', 'print_jobs', 'print_job_status_events', 'inventory_categories', 'inventory_items', 'stock_balances', 'stock_movements', 'print_job_materials']],
  ['0019_employee_permission_overrides_v2.sql', ['employee_permission_overrides_v2']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}

let afterRead = null, readPoint = null, beforeBatch = null, afterBatch = null, failAuthorization = false, batches = 0, networkCalls = 0;
let sequenceBarrier = null;
const env = {
  APP_STAGE: 'test', AUTH_PEPPER: 'synthetic-create-job-test-only',
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.test',
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (failAuthorization && sql.includes('FROM auth_sessions')) throw new Error('Injected authorization failure');
          const result = db.prepare(sql).get(...this.values) || null;
          if (sequenceBarrier && sql.includes('SELECT job_no AS value')) await sequenceBarrier();
          if (afterRead && sql.includes(readPoint)) {
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
      if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; hook(); }
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const result = db.prepare(statement.sql).run(...statement.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        });
        db.exec('COMMIT');
        if (afterBatch) { const hook = afterBatch; afterBatch = null; hook(); }
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
const printing = await load('printing', { './auth': auth });
const production = await load('printing-production', { './auth': auth });
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
Object.assign(dependencies, { './auth': auth, './printing': printing, './printing-production': production, './workspace-route': workspace });
const runtime = await load('runtime', dependencies);
const staging = await load('staffportal-staging', {
  './runtime': runtime, './workspace-route': workspace,
  './v180-public-assets': { routeV180PublicAssets: async request => {
    assert.equal(new URL(request.url).pathname, '/api/printing/jobs');
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
  ['editor', 'company-printing', 'edit'], ['viewer', 'company-printing', 'view'],
  ['creator', 'company-printing', 'create'], ['approver', 'company-printing', 'approve'], ['owner', 'company-printing', 'manage'], ['other', 'company-bakery', 'manage'],
]) {
  db.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)').run(actor, `Synthetic ${actor}`);
  for (const company of ['company-printing', 'company-bakery']) {
    db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id) VALUES(?,?,?)').run(`${actor}-${company}`, actor, company);
  }
  db.prepare('INSERT INTO roles(id,company_id,code,name,is_system) VALUES(?,?,?,?,?)')
    .run(actor, actor === 'owner' ? null : target, actor, actor, actor === 'owner' ? 1 : 0);
  db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)').run(actor, actor, target, actor);
  db.prepare('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)').run(actor, actor, 'print-access', level);
  const token = `synthetic-create-job-session-${actor}`;
  tokens.set(actor, token);
  const hash = createHash('sha256').update(`${token}:${env.AUTH_PEPPER}`).digest('hex');
  db.prepare("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 hour'))").run(actor, actor, hash);
}

db.exec(`
  INSERT INTO company_locations(id,company_id,name) VALUES
    ('location-a','company-printing','Protected location'),('location-b','company-bakery','Foreign location');
  INSERT INTO customers(id,company_id,customer_no,name) VALUES
    ('customer-a','company-printing','A','Protected customer'),('customer-b','company-bakery','B','Foreign customer');
  INSERT INTO printing_services(id,company_id,code,name,category) VALUES
    ('service-a','company-printing','A','Protected service','offset'),('service-b','company-bakery','B','Foreign service','offset');
  INSERT INTO employees(id,display_name) VALUES('designer','Synthetic designer'),('operator','Synthetic operator'),('foreign-assignee','Foreign assignee');
  INSERT INTO employee_company_memberships(id,employee_id,company_id) VALUES
    ('designer-a','designer','company-printing'),('operator-a','operator','company-printing'),('assignee-b','foreign-assignee','company-bakery');
  INSERT INTO print_jobs(id,company_id,job_no,title,created_by) VALUES
    ('foreign-job','company-bakery','FOREIGN-JOB','Foreign protected job','other');
`);
const tables = ['print_jobs','print_job_status_events','audit_logs','sales_orders','sales_order_items','payments','stock_balances','stock_movements'];
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
const reset = () => db.exec("DELETE FROM audit_logs; DELETE FROM print_job_status_events; DELETE FROM print_jobs WHERE company_id='company-printing'");
let cases = 0, requestCount = 0;
const check = async (name, test) => { await test(); cases++; console.log(`PASS ${name}`); };
const request = (actor = 'creator', overrides = {}) => new Request('https://staffportal.test/api/printing/jobs', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://staffportal.test',
    'x-request-id': `create-job-${++requestCount}`,
    ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid'}` } : {}) },
  body: JSON.stringify({ title: 'Synthetic job', customerId: 'customer-a', serviceId: 'service-a', locationId: 'location-a', designerId: 'designer', operatorId: 'operator', ...overrides }),
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
  assert.doesNotMatch(body, /Protected|Foreign|FOREIGN-JOB|SELECT|INSERT|Injected|synthetic-create-job-session/);
  assert.deepEqual(snapshot(), before, 'denied request has zero job/evidence/commercial/stock writes');
  assert.equal(batches, writesBefore, 'denial precedes mutation batch');
  return body;
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('No network in isolated Printing acceptance'); };
try {
  await check('unauthenticated, foreign-company grant and view-only requests make zero writes', async () => {
    await deny(request(null),401); await deny(request('unknown'),401);
    await deny(request('other'),403); await deny(request('viewer'),403);
  });
  for (const actor of ['creator','editor','approver','owner']) {
    await check(actor+' creates only a scoped enquiry, initial event and correlated audit',async()=>{
      reset(); const before=snapshot(), financial=['approver','owner'].includes(actor);
      const input=request(actor,financial?{quotedNaira:123}:{}), response=await send(input);
      assert.equal(response.status,201); const body=await response.json(), after=snapshot();
      const job=after.print_jobs.find(row=>row.id===body.job.id);
      assert.equal(after.print_jobs.length,2); assert.equal(job.company_id,'company-printing');
      assert.equal(job.production_status,'enquiry'); assert.equal(job.sales_order_id,null);
      assert.equal(job.customer_id,'customer-a'); assert.equal(job.service_id,'service-a'); assert.equal(job.location_id,'location-a');
      assert.equal(job.assigned_designer_id,'designer'); assert.equal(job.assigned_operator_id,'operator');
      assert.equal(job.quoted_kobo,financial?12300:0); assert.equal(job.invoiced_kobo,0);
      assert.equal(Object.hasOwn(body.job,'quotedKobo'),financial);
      assert.equal(after.print_job_status_events.length,1); assert.equal(after.audit_logs.length,1);
      const event=after.print_job_status_events[0], audit=after.audit_logs[0];
      assert.equal(event.print_job_id,job.id); assert.equal(event.from_status,null); assert.equal(event.to_status,'enquiry'); assert.equal(event.changed_by,actor);
      assert.equal(audit.entity_id,job.id); assert.equal(audit.company_id,'company-printing'); assert.equal(audit.actor_employee_id,actor);
      assert.equal(audit.action,'create_job'); assert.equal(audit.request_id,input.headers.get('x-request-id'));
      assert.deepEqual(JSON.parse(audit.after_json),{jobNo:job.job_no,title:'Synthetic job',quotedKobo:job.quoted_kobo});
      assert.deepEqual(after.print_jobs.find(row=>row.id==='foreign-job'),before.print_jobs[0]);
      for(const table of tables.slice(3))assert.deepEqual(after[table],before[table]);
    });
  }
  for(const [field,foreign] of [['customerId','customer-b'],['serviceId','service-b'],['locationId','location-b'],['designerId','foreign-assignee'],['operatorId','foreign-assignee']]) {
    await check(field+' missing and foreign/ineligible references are neutral and make zero writes',async()=>{
      reset();assert.equal(await deny(request('creator',{[field]:foreign}),400),await deny(request('creator',{[field]:'absent'}),400));
    });
  }
  await check('quote write needs financial authority',async()=>{reset();await deny(request('creator',{quotedNaira:12}),403);});
  const points=['SELECT id FROM customers','SELECT id FROM printing_services','SELECT id FROM company_locations','SELECT e.id FROM employees e','SELECT job_no AS value'];
  const revocations=[
    ['session revoked',"UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='creator'","UPDATE auth_sessions SET revoked_at=NULL WHERE id='creator'",401],
    ['employee inactive',"UPDATE employees SET employment_status='inactive' WHERE id='creator'","UPDATE employees SET employment_status='active' WHERE id='creator'",401],
    ['membership revoked',"UPDATE employee_company_memberships SET active=0 WHERE employee_id='creator' AND company_id='company-printing'","UPDATE employee_company_memberships SET active=1 WHERE employee_id='creator' AND company_id='company-printing'",403],
    ['role disabled',"UPDATE roles SET active=0 WHERE id='creator'","UPDATE roles SET active=1 WHERE id='creator'",403],
    ['grant downgraded',"UPDATE role_permissions SET access_level='view' WHERE id='creator'","UPDATE role_permissions SET access_level='create' WHERE id='creator'",403],
    ['company deny',"INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('deny','creator','company-printing','print-access','none','Synthetic revocation','owner')","DELETE FROM employee_permission_overrides_v2 WHERE id='deny'",403],
    ['actor replaced',"UPDATE auth_sessions SET employee_id='owner' WHERE id='creator'","UPDATE auth_sessions SET employee_id='creator' WHERE id='creator'",401],
    ['session replaced',"UPDATE auth_sessions SET id='replacement' WHERE id='creator'","UPDATE auth_sessions SET id='creator' WHERE id='replacement'",401],
  ];
  for(const point of points)for(const [name,revoke,restore,status]of revocations)await check(name+' after '+point+' denies before write',async()=>{
    reset();readPoint=point;afterRead=()=>db.exec(revoke);
    try{await deny(request(),status);assert.equal(afterRead,null,'hook executed');}finally{db.exec(restore);afterRead=null;}
  });
  await check('body parsing revocation is checked before reference lookup',async()=>{
    reset();const input=request(),parse=input.json.bind(input);
    input.json=async()=>{const body=await parse();db.exec("UPDATE roles SET active=0 WHERE id='creator'");return body;};
    try{await deny(input,403);}finally{db.exec("UPDATE roles SET active=1 WHERE id='creator'");}
  });
  await check('financial authority revoked during sequence read cannot set quote',async()=>{
    reset();readPoint=points.at(-1);afterRead=()=>db.exec("UPDATE role_permissions SET access_level='create' WHERE id='approver'");
    try{await deny(request('approver',{quotedNaira:12}),403);}finally{db.exec("UPDATE role_permissions SET access_level='approve' WHERE id='approver'");afterRead=null;}
  });
  await check('failed authorization refresh returns bounded 503 before writes',async()=>{
    reset();readPoint=points.at(-1);afterRead=()=>{failAuthorization=true;};
    try{await deny(request(),503);}finally{failAuthorization=false;afterRead=null;}
  });
  const referenceRaces=[
    ["UPDATE customers SET active=0 WHERE id='customer-a'","UPDATE customers SET active=1 WHERE id='customer-a'"],
    ["UPDATE customers SET company_id='company-bakery' WHERE id='customer-a'","UPDATE customers SET company_id='company-printing' WHERE id='customer-a'"],
    ["UPDATE printing_services SET active=0 WHERE id='service-a'","UPDATE printing_services SET active=1 WHERE id='service-a'"],
    ["UPDATE printing_services SET company_id='company-bakery' WHERE id='service-a'","UPDATE printing_services SET company_id='company-printing' WHERE id='service-a'"],
    ["UPDATE company_locations SET active=0 WHERE id='location-a'","UPDATE company_locations SET active=1 WHERE id='location-a'"],
    ["UPDATE company_locations SET company_id='company-bakery' WHERE id='location-a'","UPDATE company_locations SET company_id='company-printing' WHERE id='location-a'"],
    ...['designer','operator'].flatMap(actor=>[
      [`UPDATE employees SET employment_status='inactive' WHERE id='${actor}'`,`UPDATE employees SET employment_status='active' WHERE id='${actor}'`],
      [`UPDATE employee_company_memberships SET active=0 WHERE employee_id='${actor}'`,`UPDATE employee_company_memberships SET active=1 WHERE employee_id='${actor}'`],
    ]),
  ];
  for(const [mutate,restore]of referenceRaces)await check('commit-time reference invalidation rolls back: '+mutate,async()=>{
    reset();const before=snapshot();beforeBatch=()=>db.exec(mutate);
    try{const response=await send(request());assert.equal(response.status,503);assert.equal(beforeBatch,null);assert.deepEqual(snapshot(),before);}
    finally{db.exec(restore);beforeBatch=null;}
  });
  for(const table of ['print_jobs','print_job_status_events','audit_logs'])for(const mode of ['ABORT','IGNORE'])await check(table+' '+mode+' cannot leave a partial job or false success',async()=>{
    reset();const before=snapshot();
    db.exec('CREATE TRIGGER create_fault BEFORE INSERT ON '+table+' BEGIN SELECT RAISE('+mode+(mode==='ABORT'?",'Injected failure'":'')+'); END');
    try{const response=await send(request());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Injected|INSERT|SELECT/);assert.deepEqual(snapshot(),before);}
    finally{db.exec('DROP TRIGGER create_fault');}
    assert.equal((await send(request())).status,201,'clean retry works after rollback');
  });
  await check('competing same-number creates leave exactly one job/event/audit',async()=>{
    reset();
    // Both requests must read the same sequence before either can commit.
    // Promise.all alone also permits valid sequential creates with different numbers.
    let arrivals=0, release;
    const ready=new Promise(resolve=>{release=resolve;});
    sequenceBarrier=async()=>{if(++arrivals===2)release();await ready;};
    let responses;
    try{responses=await Promise.all([send(request('creator')),send(request('editor'))]);}
    finally{sequenceBarrier=null;}
    assert.equal(arrivals,2,'both creates reached the sequence collision');
    assert.deepEqual(responses.map(response=>response.status).sort(),[201,503]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE company_id='company-printing'").get().n,1);
    for(const table of ['print_job_status_events','audit_logs'])assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,1);
  });
  await check('revocation after authorized commit conceals the created record response',async()=>{
    reset();afterBatch=()=>db.exec("UPDATE roles SET active=0 WHERE id='creator'");
    try{
      const response=await send(request());assert.equal(response.status,403);
      assert.deepEqual(await response.json(),{error:'Create Printing Job permission is required.'});
      assert.equal(afterBatch,null);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE company_id='company-printing'").get().n,1);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1,'authorized committed evidence is preserved');
    }finally{db.exec("UPDATE roles SET active=1 WHERE id='creator'");afterBatch=null;}
  });
  await check('optional references remain optional and enquiry does not create payment truth',async()=>{
    reset();assert.equal((await send(request('creator',{customerId:null,serviceId:null,designerId:null,operatorId:null}))).status,201);
    assert.equal(networkCalls,0);for(const table of ['sales_orders','sales_order_items','payments','stock_balances','stock_movements'])assert.deepEqual(db.prepare('SELECT * FROM '+table).all(),[]);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
  console.log(`Printing job creation composed staging/runtime/session/SQLite acceptance: ${cases}/${cases} PASS; productionMutated=false`);
}finally{globalThis.fetch=originalFetch;db.close();}
