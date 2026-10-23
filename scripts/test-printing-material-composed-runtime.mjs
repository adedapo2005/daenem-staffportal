import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Effective staging -> runtime -> canonical session/permissions -> material writer.
// Committed schema in isolated SQLite; unrelated pre-route guards are stubbed.
// This does not claim remote D1, provider, browser or independent QA acceptance.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships',
    'roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides', 'auth_sessions', 'audit_logs']],
  ['0002_identity_auth.sql', ['employee_preferences', 'app_settings']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'sales_order_items', 'payments', 'printing_services', 'print_jobs', 'inventory_categories', 'inventory_items', 'stock_balances', 'stock_movements', 'print_job_materials']],
  ['0019_employee_permission_overrides_v2.sql', ['employee_permission_overrides_v2']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}

let afterRead = null, readPoint = null, beforeBatch = null, failAuthorization = false, batches = 0, networkCalls = 0;
const env = {
  APP_STAGE: 'test', AUTH_PEPPER: 'synthetic-material-test-only',
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.test',
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (failAuthorization && sql.includes('FROM auth_sessions')) throw new Error('Injected authorization failure');
          const result = db.prepare(sql).get(...this.values) || null;
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
    assert.equal(new URL(request.url).pathname, '/api/printing/jobs/materials');
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
  const token = `synthetic-material-session-${actor}`;
  tokens.set(actor, token);
  const hash = createHash('sha256').update(`${token}:${env.AUTH_PEPPER}`).digest('hex');
  db.prepare("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 hour'))").run(actor, actor, hash);
}
db.exec(`
  INSERT INTO print_jobs(id,company_id,job_no,title,production_status,quoted_kobo,created_by) VALUES
    ('job-a','company-printing','PRINT-SECRET-A','Protected job A','quality_control',10000,'owner'),
    ('job-b','company-bakery','PRINT-SECRET-B','Protected job B','quality_control',20000,'other');
`);
const tables = ['print_jobs', 'stock_balances', 'print_job_materials', 'stock_movements', 'audit_logs', 'sales_orders', 'sales_order_items', 'payments'];
const snapshot = () => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
const reset = (status = 'printing') => {
  db.exec("DELETE FROM audit_logs; DELETE FROM stock_movements; DELETE FROM print_job_materials; UPDATE stock_balances SET quantity=7,reserved_quantity=2; UPDATE print_jobs SET material_cost_kobo=0,gross_profit_kobo=0,margin_basis_points=0;");
  db.prepare("UPDATE print_jobs SET production_status=?,company_id='company-printing' WHERE id='job-a'").run(status);
};
let cases = 0, requestCount = 0;
const check = async (name, test) => { await test(); cases++; console.log(`PASS ${name}`); };
const request = (actor = 'editor', overrides = {}) => new Request('https://staffportal.test/api/printing/jobs/materials', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://staffportal.test',
    'x-request-id': `material-${++requestCount}`,
    ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid'}` } : {}) },
  body: JSON.stringify({ jobId: 'job-a', itemId: 'paper-a', locationId: 'location-a', actualQuantity: 1, wasteQuantity: 1, ...overrides }),
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
  assert.doesNotMatch(body, /PRINT-SECRET|Protected job|Protected paper|Available quantity|SELECT|INSERT|Injected|synthetic-material-session/);
  assert.deepEqual(snapshot(), before, 'no material, stock, audit, job or commercial writes');
  assert.equal(batches, writesBefore, 'denial precedes mutation batch');
  return body;
};
const revocations = [
  ['session revoked', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='editor'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='editor'", 401],
  ['session expired', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='editor'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='editor'", 401],
  ['employee inactive', "UPDATE employees SET employment_status='inactive' WHERE id='editor'", "UPDATE employees SET employment_status='active' WHERE id='editor'", 401],
  ['membership revoked', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='editor' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='editor' AND company_id='company-printing'", 403],
  ['role disabled', "UPDATE roles SET active=0 WHERE id='editor'", "UPDATE roles SET active=1 WHERE id='editor'", 403],
  ['edit downgraded', "UPDATE role_permissions SET access_level='view' WHERE id='editor'", "UPDATE role_permissions SET access_level='edit' WHERE id='editor'", 403],
  ['explicit company deny', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('qc-deny','editor','company-printing','print-access','none','Synthetic revocation','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='qc-deny'", 403],
  ['session actor replaced', "UPDATE auth_sessions SET employee_id='owner' WHERE id='editor'", "UPDATE auth_sessions SET employee_id='editor' WHERE id='editor'", 401],
  ['session identity replaced', "UPDATE auth_sessions SET id='replacement' WHERE id='editor'", "UPDATE auth_sessions SET id='editor' WHERE id='replacement'", 401],
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('No network in isolated Printing acceptance'); };

db.exec(`
  INSERT INTO company_locations(id,company_id,name) VALUES('location-a','company-printing','Protected location');
  INSERT INTO inventory_items(id,company_id,sku,name,unit_cost_kobo) VALUES('paper-a','company-printing','PAPER','Protected paper',100);
  INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity,reserved_quantity) VALUES('stock-a','company-printing','location-a','paper-a',7,2);
`);
try {
  await check('missing and invalid session denied', async () => {
    await deny(request(null), 401); await deny(request('unknown'), 401);
  });
  await check('foreign grant and view authority cannot consume stock', async () => {
    for (const actor of ['other','viewer']) await deny(request(actor), 403);
  });
  await check('foreign and missing jobs share neutral denial', async () => {
    assert.equal(await deny(request('editor', {jobId:'job-b'}),404), await deny(request('editor',{jobId:'missing'}),404));
  });
  for (const actor of ['creator','editor','owner']) {
    await check(actor + ' records scoped usage, stock movement and correlated audit', async () => {
      reset(); const before = snapshot(), input = request(actor);
      const response = await send(input); assert.equal(response.status,200);
      const after = snapshot(), material = after.print_job_materials[0], movement = after.stock_movements[0], audit = after.audit_logs[0];
      assert.equal(after.print_job_materials.length,1); assert.equal(after.stock_movements.length,1); assert.equal(after.audit_logs.length,1);
      assert.equal(material.print_job_id,'job-a'); assert.equal(material.actual_quantity,1); assert.equal(material.waste_quantity,1);
      assert.equal(material.issued_by,actor); assert.equal(material.unit_cost_kobo,100);
      assert.equal(movement.company_id,'company-printing'); assert.equal(movement.reference_id,'job-a'); assert.equal(movement.quantity,2);
      assert.equal(after.stock_balances[0].quantity,5); assert.equal(after.stock_balances[0].reserved_quantity,2);
      assert.equal(after.print_jobs[0].material_cost_kobo,200); assert.equal(after.print_jobs[0].gross_profit_kobo,9800);
      assert.equal(audit.actor_employee_id,actor); assert.equal(audit.company_id,'company-printing'); assert.equal(audit.entity_id,'job-a');
      assert.equal(audit.action,'record_material_usage'); assert.equal(audit.request_id,input.headers.get('x-request-id'));
      assert.deepEqual(JSON.parse(audit.after_json),{itemId:'paper-a',actual:1,waste:1,unitCostKobo:100});
      assert.deepEqual(after.print_jobs[1],before.print_jobs[1]);
      for (const table of ['sales_orders','sales_order_items','payments']) assert.deepEqual(after[table],before[table]);
    });
  }
  const points = ['SELECT id, production_status AS status FROM print_jobs','SELECT id, name, unit_cost_kobo','SELECT id FROM company_locations','SELECT id, quantity, reserved_quantity'];
  for (const point of points) for (const [name,revoke,restore,status] of revocations) {
    await check(name + ' after ' + point + ' denies with zero writes', async () => {
      reset(); readPoint=point; afterRead=()=>db.exec(revoke);
      try { await deny(request(),status); assert.equal(afterRead,null,'race hook executed'); }
      finally { db.exec(restore); afterRead=null; }
    });
  }
  await check('revocation during body parsing denies without mutation', async () => {
    reset(); const input=request(), parse=input.json.bind(input);
    input.json=async()=>{const body=await parse();db.exec("UPDATE roles SET active=0 WHERE id='editor'");return body;};
    try {await deny(input,403);} finally {db.exec("UPDATE roles SET active=1 WHERE id='editor'");}
  });
  for (const jobId of ['job-a','job-b','missing']) {
    await check('revocation conceals existence and terminal state for '+jobId, async () => {
      reset('completed'); readPoint=points[0];afterRead=()=>db.exec("UPDATE roles SET active=0 WHERE id='editor'");
      try {assert.equal(await deny(request('editor',{jobId}),403),JSON.stringify({error:'Create Printing data permission is required.'}));}
      finally {db.exec("UPDATE roles SET active=1 WHERE id='editor'");afterRead=null;}
    });
  }
  for (const overrides of [{actualQuantity:100},{locationId:'missing'}]) {
    await check('revocation conceals location and insufficient-stock responses',async()=>{
      reset();readPoint=overrides.locationId?points[2]:points[3];afterRead=()=>db.exec("UPDATE roles SET active=0 WHERE id='editor'");
      try {await deny(request('editor',overrides),403);}finally{db.exec("UPDATE roles SET active=1 WHERE id='editor'");afterRead=null;}
    });
  }
  await check('financial override requires current authority', async()=>{
    reset();await deny(request('editor',{unitCostNaira:3}),403);
    assert.equal((await send(request('approver',{unitCostNaira:3}))).status,200);
    assert.equal(db.prepare('SELECT unit_cost_kobo FROM print_job_materials').get().unit_cost_kobo,300);
    reset();readPoint=points[3];afterRead=()=>db.exec("UPDATE role_permissions SET access_level='create' WHERE id='approver'");
    try {await deny(request('approver',{unitCostNaira:3}),403);}finally{db.exec("UPDATE role_permissions SET access_level='approve' WHERE id='approver'");afterRead=null;}
  });
  await check('authorization lookup failure is bounded 503',async()=>{
    reset();readPoint=points[3];afterRead=()=>{failAuthorization=true;};
    try{await deny(request(),503);assert.equal(afterRead,null);}finally{failAuthorization=false;afterRead=null;}
  });
  for(const status of ['completed','cancelled']) await check('terminal '+status+' denies usage',async()=>{reset(status);await deny(request(),409);});
  for(const mutation of ["production_status='completed'","company_id='company-bakery'"]) {
    await check('commit-time '+mutation+' prevents consumption',async()=>{
      reset();beforeBatch=()=>db.exec("UPDATE print_jobs SET "+mutation+" WHERE id='job-a'");
      assert.equal((await send(request())).status,409);assert.equal(beforeBatch,null);
      assert.equal(db.prepare('SELECT quantity FROM stock_balances').get().quantity,7);
      for(const table of ['print_job_materials','stock_movements','audit_logs'])assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);
    });
  }
  for(const [table,event] of [['stock_balances','UPDATE'],['print_job_materials','INSERT'],['stock_movements','INSERT'],['audit_logs','INSERT'],['print_jobs','UPDATE OF material_cost_kobo']])for(const mode of ['ABORT','IGNORE']){
    await check(table+' '+mode+' rolls back consumption and all evidence',async()=>{
      reset();const before=snapshot();
      db.exec('CREATE TRIGGER material_fault BEFORE '+event+' ON '+table+' BEGIN SELECT RAISE('+mode+(mode==='ABORT'?",'Injected failure'":'')+'); END');
      try{const response=await send(request());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Injected|SELECT|INSERT|Protected paper/);assert.deepEqual(snapshot(),before);}
      finally{db.exec('DROP TRIGGER material_fault');}
      assert.equal((await send(request())).status,200);
    });
  }
  await check('competing stock claims preserve reserved stock and one-winner evidence',async()=>{
    reset();const responses=await Promise.all([send(request('editor',{actualQuantity:4,wasteQuantity:0})),send(request('creator',{actualQuantity:4,wasteQuantity:0}))]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal(db.prepare('SELECT quantity FROM stock_balances').get().quantity,3);
    for(const table of ['print_job_materials','stock_movements','audit_logs'])assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,1);
  });
  await check('zero network/payment activity and no foreign-key violations',async()=>{
    assert.equal(networkCalls,0);assert.deepEqual(db.prepare('SELECT * FROM payments').all(),[]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  });
  console.log('Printing material composed staging/runtime/session/SQLite acceptance: '+cases+'/'+cases+' PASS; productionMutated=false');
}finally{globalThis.fetch=originalFetch;db.close();}
