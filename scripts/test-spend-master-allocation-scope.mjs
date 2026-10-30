// Owner intelligence must stay inside the actor's authority. Group-wide figures only for the database-confirmed
// group Owner or a current group admin; company figures only where the actor holds that domain's permission in
// that company; anything else is omitted (not zeroed), and an out-of-scope companyId gets one neutral denial.
// Loads the real worker/auth.ts session + permission resolution and ALL repository migrations on node:sqlite.
// Usage: node scripts/test-owner-intelligence-p0-221-v30-full-schema.mjs [--source worker/other.ts]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');

// Load this worktree's actual source and schema, never an external review snapshot.
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = sourceFlag > 0 ? process.argv[sourceFlag + 1] : 'worker/owner-intelligence.ts';
const pepper = 'owner-intelligence-company-scope-fixture';
const COOKIE = 'daenem_workforce_session';

function instantiate(source, modules) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
    if (!(specifier in modules)) throw new Error(`unexpected import ${specifier}`);
    return modules[specifier];
  });
  return loaded.exports;
}

// D1 shim over node:sqlite. batch() runs statements in one transaction and returns per-statement results.
function d1(database) {
  const statement = (sql) => ({
    sql,
    values: [],
    bind(...values) { this.values = values; return this; },
    async first() { return database.prepare(sql).get(...this.values) ?? null; },
    async all() { return { success: true, results: database.prepare(sql).all(...this.values) }; },
    async run() { const r = database.prepare(sql).run(...this.values); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: statement,
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const out = statements.map(({ sql, values }) => {
          if (/^\s*SELECT/i.test(sql)) return { success: true, results: database.prepare(sql).all(...values) };
          const r = database.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(r.changes) }, results: [] };
        });
        database.exec('COMMIT');
        return out;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}

const migrationNames = (await readdir(new URL('migrations/', root))).filter((name) => name.endsWith('.sql')).sort();
const [authSource, ownerSource, ...migrations] = await Promise.all([
  read('worker/auth.ts'), read(sourcePath),
  ...migrationNames.map((name) => read(`migrations/${name}`)),
]);
const auth = instantiate(authSource, {});
const intelligence = instantiate(ownerSource, { './auth': auth });
const spend = instantiate(await read('worker/spend.ts'), { './auth': auth });

const database = new DatabaseSync(':memory:');
for (const sql of migrations) database.exec(sql);
const env = {
  APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: d1(database),
  AI: {
    async run(_model, arg) { aiPrompts.push(arg.messages[1].content); return { response: 'Filtered brief' }; },
  },
};
const aiPrompts = [];
const run = (sql, ...values) => database.prepare(sql).run(...values);
const one = (sql, ...values) => database.prepare(sql).get(...values);

// ---- fixtures -------------------------------------------------------------------------------
// Month-internal date so every row falls inside the current-month window at any hour.
const now = new Date();
const monthDay = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-15`;

run("INSERT INTO company_locations(id,company_id,name) VALUES('loc-printing','company-printing','QA Printing Site')");
const people = {
  owner: ['emp-owner', ['company-printing']],        // group-level Owner
  groupAdmin: ['emp-group-admin', ['company-printing']], // group-level Group Admin, no domain grants
  staleAdmin: ['emp-stale-admin', ['company-printing']], // Group Admin whose membership ended
  dashboardMgr: ['emp-dash-mgr', ['company-printing', 'company-bakery']], // dashboard.access in printing only
  payroll: ['emp-payroll', ['company-printing']],    // payroll.access view + ai_guide view in printing only
  fakeOwner: ['emp-fake-owner', ['company-printing']], // company-level role coded owner, payroll view in printing
};
const tokens = {};
for (const [key, [id, companies]] of Object.entries(people)) {
  run('INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES(?,?,?,?,?)', id, `QA-${key}`, `QA ${key}`, `${key.toLowerCase()}@example.test`, 'active');
  companies.forEach((companyId, index) => run('INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,?,1)', `m-${id}-${companyId}`, id, companyId, index === 0 ? 1 : 0));
  tokens[key] = `token-${key}`;
  run("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 day'))", `s-${id}`, id, createHash('sha256').update(`${tokens[key]}:${pepper}`).digest('hex'));
}
run(`INSERT INTO roles(id,company_id,code,name) VALUES
  ('role-qa-dashboard-mgr','company-printing','qa_dashboard_mgr','QA dashboard manager'),
  ('role-qa-payroll','company-printing','qa_payroll','QA payroll viewer'),
  ('role-qa-fake-owner','company-printing','owner','Company-level role reusing the owner code')`);
const grantPermission = (id, roleId, code, level) => run(
  'INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT ?,?,id,? FROM permissions WHERE code=?', id, roleId, level, code);
grantPermission('rp-qa-dash-dashboard', 'role-qa-dashboard-mgr', 'dashboard.access', 'manage');
grantPermission('rp-qa-payroll-payroll', 'role-qa-payroll', 'payroll.access', 'view');
grantPermission('rp-qa-payroll-ai', 'role-qa-payroll', 'ai_guide.access', 'view');
grantPermission('rp-qa-fake-payroll', 'role-qa-fake-owner', 'payroll.access', 'view');
const grant = (id, employeeId, companyId, roleId) => run('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)', id, employeeId, companyId, roleId);
grant('er-owner', 'emp-owner', 'company-printing', 'role-owner');
grant('er-group-admin', 'emp-group-admin', 'company-printing', 'role-group-admin');
grant('er-stale-admin', 'emp-stale-admin', 'company-printing', 'role-group-admin');
grant('er-dash-mgr', 'emp-dash-mgr', 'company-printing', 'role-qa-dashboard-mgr');
grant('er-payroll', 'emp-payroll', 'company-printing', 'role-qa-payroll');
grant('er-fake-owner', 'emp-fake-owner', 'company-printing', 'role-qa-fake-owner');
// Withdrawn: membership in the company the Group Admin role was assigned through has ended.
run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-stale-admin' AND company_id='company-printing'");

// Representative company data with distinct markers, so a leak is visible in any response body.
run(`INSERT INTO payroll_runs(id,company_id,period_start,period_end,status,gross_total_kobo,net_total_kobo,prepared_by) VALUES
  ('pr-printing','company-printing',?,?, 'approved',600000,470000,'emp-owner'),
  ('pr-bakery','company-bakery',?,?, 'approved',950000,800000,'emp-owner')`, monthDay, monthDay, monthDay, monthDay);
run(`INSERT INTO inventory_items(id,company_id,sku,name,unit_cost_kobo,reorder_level,active) VALUES('inv-printing','company-printing','QA-SKU-1','QA stock item',111111,5,1)`);
run(`INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity,reserved_quantity) VALUES('sb-printing','company-printing','loc-printing','inv-printing',2,0)`);
run(`INSERT INTO maintenance_work_orders(id,company_id,title,status,priority,actual_cost_kobo) VALUES('mwo-printing','company-printing','QA repair','reported','high',333333)`);
run(`INSERT INTO sales_orders(id,company_id,order_no,order_date,status,total_kobo,created_by) VALUES('so-printing','company-printing','QA-SO-1',?, 'approved',444444,'emp-owner')`, monthDay);
run(`INSERT INTO security_logs(id,event_type,severity,company_id) VALUES('sec-printing','qa_probe','high','company-printing')`);

// Markers that only authorized figures may show.
const MARK = { payrollPrintingNet: '470000', payrollBakeryNet: '800000', inventoryValue: '222222', maintenanceCost: '333333', sales: '444444' };

// ---- helpers --------------------------------------------------------------------------------
async function call(actor, path, body) {
  const request = new Request(`https://staffportal.test${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { cookie: `${COOKIE}=${tokens[actor]}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = await auth.getSessionContext(request, env);
  assert.ok(context, `${actor} has a valid fixture session`);
  const response = await intelligence.routeOwnerIntelligence(request, env, context);
  assert.ok(response, `${path} is handled`);
  return { status: response.status, body: await response.json() };
}
const group = (actor) => call(actor, '/api/owner/intelligence');
const company = (actor, companyId) => call(actor, `/api/owner/intelligence?companyId=${companyId}`);
const ai = (actor, body) => call(actor, '/api/owner/ai', body);
const aiLogs = () => one('SELECT COUNT(*) AS n FROM ai_activity_logs').n;
const NEUTRAL = { error: 'Owner intelligence scope is unavailable.' };

// Use the real SQLite clock so expiration and legitimate scheduling delays
// are exercised rather than forcing an unrelated second-based denial.


// Isolated Stage 0 / P0 #212 Spend company-scope test using the actual
// checked-out worker/auth.ts and worker/spend.ts and 106 real SQL migration
// files, in a DISPOSABLE in-memory SQLite database; no hosted transactions.
run("DELETE FROM role_permissions WHERE role_id='role-owner'");
run("DELETE FROM role_permissions WHERE role_id='role-group-admin'");
const fixtureTreatment=one("SELECT id FROM spend_accounting_treatments WHERE active=1 LIMIT 1");
assert.ok(fixtureTreatment?.id,'seeded Spend accounting treatment required');
run("INSERT INTO spend_cost_centers(id,company_id,code,name) VALUES('qa-scope-print-cc','company-printing','QA-PRINT-CC','Scoped Printing Cost Center')");
run("INSERT INTO spend_cost_centers(id,company_id,code,name) VALUES('qa-scope-bakery-cc','company-bakery','QA-BAKERY-CC','Foreign Bakery Cost Center')");
run("INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES('qa-spend-print','QA-SPEND-P','QA Printing Staff','qa-spend-p@example.test','active')");
run("INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES('qa-spend-bakery','QA-SPEND-B','QA Bakery Staff','qa-spend-b@example.test','active')");
run("INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES('qa-spend-member-p','qa-spend-print','company-printing',1,1)");
run("INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES('qa-spend-member-b','qa-spend-bakery','company-bakery',1,1)");
const expenseSQL="INSERT INTO spend_expense_requests(id,request_no,requester_employee_id,company_id,purpose,business_reason,total_kobo,accounting_treatment_id,status) VALUES(?,?,?,?,?,?,?,?,'submitted')";
run(expenseSQL,'qa-print-other','QA-PRINT-OTHER','qa-spend-print','company-printing','Synthetic Printing expense','Authorized local QA',111001,String(fixtureTreatment.id));
run(expenseSQL,'qa-print-owner','QA-PRINT-OWNER','emp-owner','company-printing','Synthetic Owner expense','Authorized local QA',111002,String(fixtureTreatment.id));
run(expenseSQL,'qa-bakery-foreign','QA-BAKERY-FOREIGN','qa-spend-bakery','company-bakery','Synthetic Foreign Bakery expense','Unauthorized local QA sentinel',991003,String(fixtureTreatment.id));
async function spendCall(path,actor='owner'){
 const request=new Request('https://staffportal.test'+path,{headers:{cookie:COOKIE+'='+tokens[actor]}});
 const context=await auth.getSessionContext(request,env);
 assert.ok(context,'must have authenticated synthetic context');
 const response=await spend.routeSpend(request,env,context);
 assert.ok(response,'Spend route unhandled');
 return {status:response.status,body:await response.json()};
}
const results=[];
async function check(name,fn){
 try{await fn();results.push({name,pass:true});console.log('PASS '+name);}
 catch(error){results.push({name,pass:false,error:String(error.stack||error).slice(0,600)});console.log('FAIL '+name+' '+String(error.message||error));}
}

async function route(actor,method,path,body){
 const request=new Request('https://staffportal.test'+path,{
   method,
   headers:{cookie:COOKIE+'='+tokens[actor],'content-type':'application/json'},
   ...(body ? {body:JSON.stringify(body)}:{})
 });
 const context=await auth.getSessionContext(request,env);
 assert.ok(context,'synthetic session was not found');
 const response=await spend.routeSpend(request,env,context);
 assert.ok(response,'Spend handler not reached');
 return {status:response.status,body:await response.json()};
}
const get=(path,actor='owner')=>route(actor,'GET',path);
const post=(path,data,actor='owner')=>route(actor,'POST',path,data);
const supplierCount=(needle)=>one('SELECT COUNT(*) AS n FROM spend_suppliers WHERE name=?',needle).n;
const expenseCount=(id)=>one('SELECT COUNT(*) AS n FROM spend_expense_requests WHERE id=?',id).n;
const scopeSupplier={kind:'supplier',action:'create',companyId:'company-bakery',name:'QA Unauthorized Bakery Supplier',phone:'07000001001',email:'bakery-secret@example.test'};
await check('Owner with no expense.master may not list foreign Bakery master data',async()=>{
 const r=await get('/api/spend/admin/master?companyId=company-bakery');
 assert.equal(r.status,403,JSON.stringify(r.body));
 assert.ok(!JSON.stringify(r.body).includes('QA-BAKERY-CC'));
});
await check('Owner with no expense.master may not list unfiltered global master data',async()=>{
 const r=await get('/api/spend/admin/master');
 assert.equal(r.status,403,JSON.stringify(r.body));
});
await check('Owner with no expense.master cannot create Bakery supplier',async()=>{
 const before=supplierCount(scopeSupplier.name),r=await post('/api/spend/admin/master',scopeSupplier);
 assert.equal(r.status,403,JSON.stringify(r.body));
 assert.equal(supplierCount(scopeSupplier.name),before,'unauthorized supplier write occurred');
});
grantPermission('qa-owner-expense-master','role-owner','expense.master','manage');
await check('Printing-scoped expense.master grant permits Printing master GET',async()=>{
 const r=await get('/api/spend/admin/master?companyId=company-printing');
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.ok(r.body.costCenters.some(x=>x.id==='qa-scope-print-cc'));
 assert.ok(!r.body.costCenters.some(x=>x.id==='qa-scope-bakery-cc'));
});
await check('Printing master grant does not list Bakery master data',async()=>{
 const r=await get('/api/spend/admin/master?companyId=company-bakery');
 assert.equal(r.status,403,JSON.stringify(r.body));
});
await check('Unfiltered master list with Printing grant never returns Bakery data',async()=>{
 const r=await get('/api/spend/admin/master');
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.ok(r.body.costCenters.some(x=>x.id==='qa-scope-print-cc'));
 assert.ok(!JSON.stringify(r.body).includes('QA-BAKERY-CC'));
});
await check('Printing master permission allows legitimate Printing supplier creation',async()=>{
 const r=await post('/api/spend/admin/master',{kind:'supplier',action:'create',companyId:'company-printing',name:'QA Legitimate Printing Supplier'});
 assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal(supplierCount('QA Legitimate Printing Supplier'),1);
});
await check('Printing master grant cannot create Bakery supplier',async()=>{
 const before=supplierCount(scopeSupplier.name),r=await post('/api/spend/admin/master',scopeSupplier);
 assert.equal(r.status,403,JSON.stringify(r.body));
 assert.equal(supplierCount(scopeSupplier.name),before);
});
await check('Printing master grant never allows unapproved global approval policy creation',async()=>{
 const before=Number(one('SELECT COUNT(*) AS n FROM spend_approval_rules WHERE company_id IS NULL').n);
 const r=await post('/api/spend/admin/master',{kind:'approval_rule',action:'create',minAmountKobo:2000,approverRoleCode:'owner',requiredPermission:'expense.approve'});
 assert.equal(r.status,403,JSON.stringify(r.body));
 assert.equal(Number(one('SELECT COUNT(*) AS n FROM spend_approval_rules WHERE company_id IS NULL').n),before);
});
await check('Printing master grant cannot edit global approval policy through a Printing filter',async()=>{
 const global=one('SELECT id,min_amount_kobo FROM spend_approval_rules WHERE company_id IS NULL LIMIT 1');
 assert.ok(global?.id,'official migration must have a global approval rule');
 const r=await post('/api/spend/admin/master',{kind:'approval_rule',action:'edit',companyId:'company-printing',id:global.id,minAmountKobo:888888,reason:'synthetic QA blocked'});
 assert.equal(r.status,403,JSON.stringify(r.body));
 assert.equal(Number(one('SELECT min_amount_kobo AS n FROM spend_approval_rules WHERE id=?',global.id).n),Number(global.min_amount_kobo));
});
grantPermission('qa-owner-expense-create','role-owner','expense.requests','create');
run("INSERT INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,employee_request_allowed,direct_shared_policy,active) VALUES('qa-shared-category','company-printing','QA-SHARED','Synthetic Shared Category','synthetic shared category','spend-treatment-opex',1,'either',1)");
const shared=(id)=>({
 requestId:id,companyId:'company-printing',categoryId:'qa-shared-category',
 costCenterId:'qa-scope-print-cc',purpose:'Synthetic shared cost',
 businessReason:'Synthetic cost allocation validation',
 amountKobo:50000,directShared:'shared',allocationMethod:'percentage',
 allocations:[{companyId:'company-printing',costCenterId:'qa-scope-print-cc',percentage:50},{companyId:'company-bakery',costCenterId:'qa-scope-bakery-cc',percentage:50}]
});
await check('Group Owner without allocation grant cannot charge foreign Bakery beneficiary',async()=>{
 const id='qa-shared-foreign-1',r=await post('/api/spend/requests',shared(id));
 assert.ok([403,422].includes(r.status),JSON.stringify(r.body));
 assert.equal(expenseCount(id),0,'unauthorized cross-company allocation persisted');
});
grantPermission('qa-owner-expense-alloc','role-owner','expense.allocations','manage');
await check('Source Printing allocation grant does not authorize foreign Bakery beneficiary',async()=>{
 const id='qa-shared-foreign-2',r=await post('/api/spend/requests',shared(id));
 assert.ok([403,422].includes(r.status),JSON.stringify(r.body));
 assert.equal(expenseCount(id),0);
});
run("INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES('qa-alloc-bakery-membership','emp-owner','company-bakery',0,1)");
await check('Bakery membership without its own allocation grant cannot be charged',async()=>{
 const id='qa-shared-foreign-3',r=await post('/api/spend/requests',shared(id));
 assert.ok([403,422].includes(r.status),JSON.stringify(r.body));
 assert.equal(expenseCount(id),0);
});
run("INSERT INTO roles(id,company_id,code,name) VALUES('qa-alloc-bakery-role','company-bakery','qa_bakery_allocator','Bakery Allocator')");
grantPermission('qa-alloc-bakery-perm','qa-alloc-bakery-role','expense.allocations','manage');
grant('qa-alloc-bakery-role-bind','emp-owner','company-bakery','qa-alloc-bakery-role');
await check('Explicit active allocation grants in BOTH companies permit a legitimate shared expense',async()=>{
 const id='qa-shared-authorized',r=await post('/api/spend/requests',shared(id));
 assert.equal(r.status,201,JSON.stringify(r.body));
 const allocated=database.prepare('SELECT company_id AS companyId,allocated_amount_kobo AS kobo FROM spend_expense_allocations WHERE expense_request_id=? ORDER BY company_id').all(id);
 assert.equal(allocated.length,2);
 assert.equal(allocated.reduce((sum,x)=>sum+x.kobo,0),50000);
});
await check('Revoking destination Bakery allocation grant blocks the next shared expense',async()=>{
 run("UPDATE role_permissions SET access_level='none' WHERE id='qa-alloc-bakery-perm'");
 try{
  const id='qa-shared-foreign-4',r=await post('/api/spend/requests',shared(id));
  assert.ok([403,422].includes(r.status),JSON.stringify(r.body));
  assert.equal(expenseCount(id),0);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-alloc-bakery-perm'");}
});
async function midflightSharedRevocation(id,sql,undo){
 const prior=env.DB.batch;let injected=0;
 env.DB.batch=async function(statements){
  injected++;
  run(sql);
  return prior(statements);
 };
 try{
  const response=await post('/api/spend/requests',shared(id));
  assert.equal(injected,1,'D1 write boundary was not reached');
  assert.ok([403,409,422].includes(response.status),JSON.stringify(response.body));
  assert.equal(expenseCount(id),0,'Revoked access still created a financial request');
 }finally{
  env.DB.batch=prior;
  run(undo);
 }
}
await check('At-write Bakery allocation permission revocation prevents financial write',async()=>{
 await midflightSharedRevocation('qa-shared-write-revoke-bakery',
 "UPDATE role_permissions SET access_level='none' WHERE id='qa-alloc-bakery-perm'",
 "UPDATE role_permissions SET access_level='manage' WHERE id='qa-alloc-bakery-perm'");
});
await check('At-write source expense.create revocation prevents financial write',async()=>{
 await midflightSharedRevocation('qa-shared-write-revoke-create',
 "UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-create'",
 "UPDATE role_permissions SET access_level='create' WHERE id='qa-owner-expense-create'");
});
await check('At-write Bakery membership revocation prevents financial write',async()=>{
 await midflightSharedRevocation('qa-shared-write-revoke-member',
 "UPDATE employee_company_memberships SET active=0 WHERE id='qa-alloc-bakery-membership'",
 "UPDATE employee_company_memberships SET active=1 WHERE id='qa-alloc-bakery-membership'");
});
await check('At-write exact session revocation prevents financial write',async()=>{
 await midflightSharedRevocation('qa-shared-write-revoke-session',
 "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='s-emp-owner'",
 "UPDATE auth_sessions SET revoked_at=NULL WHERE id='s-emp-owner'");
});

// Master-data contract: no implicit approval of cross-business template
// participants. The authorization and every item write must be atomic.
const tmplName=(suffix)=>'QA Cross Company Template '+suffix;
const tmpl=(suffix)=>({
 kind:'template',action:'create',companyId:'company-printing',
 name:tmplName(suffix),method:'percentage',
 items:[
  {companyId:'company-printing',costCenterId:'qa-scope-print-cc',percentage:50},
  {companyId:'company-bakery',costCenterId:'qa-scope-bakery-cc',percentage:50}
 ]
});
const countTemplate=(name)=>Number(one('SELECT COUNT(*) AS n FROM spend_allocation_templates WHERE name=?',name).n);
const countMasterAudit=(action,id)=>Number(one('SELECT COUNT(*) AS n FROM audit_logs WHERE module=? AND action=? AND entity_id=?','spend',action,id).n);
async function withBatchRevocation(fn,work){
 const old=env.DB.batch; let hits=0;
 env.DB.batch=async function(statements){hits++;fn();return old(statements)};
 try{return {response:await work(),hits};}
 finally{env.DB.batch=old;}
}
const denyAndNoRecord=(response,name)=> {
 assert.ok([403,409,422].includes(response.status),JSON.stringify(response));
 assert.equal(countTemplate(name),0,'unauthorized template was persisted');
};
await check('Template: existing Bakery membership without allocation manage cannot create cross-company template',async()=>{
 run("UPDATE role_permissions SET access_level='none' WHERE id='qa-alloc-bakery-perm'");
 const name=tmplName('Bakery Grant Missing');
 try{denyAndNoRecord(await post('/api/spend/admin/master',tmpl('Bakery Grant Missing')),name);}
 finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-alloc-bakery-perm'");}
});
await check('Template: source Printing allocation permission revoked blocks cross-company template',async()=>{
 run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-alloc'");
 const name=tmplName('Printing Grant Missing');
 try{denyAndNoRecord(await post('/api/spend/admin/master',tmpl('Printing Grant Missing')),name);}
 finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-alloc'");}
});
await check('Template: explicit master plus both companies allocation grants create complete template once',async()=>{
 const name=tmplName('Valid');
 const response=await post('/api/spend/admin/master',tmpl('Valid'));
 assert.equal(response.status,201,JSON.stringify(response));
 assert.equal(countTemplate(name),1);
 const id=response.body.id;
 const children=database.prepare('SELECT company_id AS companyId,percentage FROM spend_allocation_template_items WHERE template_id=? ORDER BY company_id').all(id);
 assert.equal(children.length,2);
 assert.deepEqual(children.map(x=>x.companyId),['company-bakery','company-printing']);
 assert.equal(children.reduce((sum,row)=>sum+Number(row.percentage),0),100);
 assert.equal(countMasterAudit('master_value_created',id),1);
});
const revokedTemplateWrite=async(suffix,mutate,undo)=>{
 const name=tmplName(suffix);
 try{
  const {response,hits}=await withBatchRevocation(()=>run(mutate),()=>post('/api/spend/admin/master',tmpl(suffix)));
  assert.equal(hits,1,'must reach atomic D1 batch');
  denyAndNoRecord(response,name);
  const orphans=Number(one('SELECT COUNT(*) AS n FROM spend_allocation_template_items ti LEFT JOIN spend_allocation_templates t ON t.id=ti.template_id WHERE t.id IS NULL').n);
  assert.equal(orphans,0,'orphaned template items');
 }finally{run(undo);}
};
await check('Template: revoking Bakery allocation grant at write blocks template and items',async()=>{
 await revokedTemplateWrite('Midflight Bakery Allocation',
  "UPDATE role_permissions SET access_level='none' WHERE id='qa-alloc-bakery-perm'",
  "UPDATE role_permissions SET access_level='manage' WHERE id='qa-alloc-bakery-perm'");
});
await check('Template: revoking Printing master permission at write blocks template and items',async()=>{
 await revokedTemplateWrite('Midflight Printing Master',
  "UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-master'",
  "UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-master'");
});
await check('Template: revoking exact session at write blocks template and items',async()=>{
 await revokedTemplateWrite('Midflight Session',
  "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='s-emp-owner'",
  "UPDATE auth_sessions SET revoked_at=NULL WHERE id='s-emp-owner'");
});
await check('Template: deactivating Bakery membership at write blocks template and items',async()=>{
 await revokedTemplateWrite('Midflight Membership',
  "UPDATE employee_company_memberships SET active=0 WHERE id='qa-alloc-bakery-membership'",
  "UPDATE employee_company_memberships SET active=1 WHERE id='qa-alloc-bakery-membership'");
});
await check('Supplier Create: master permission revoked at write cannot create supplier or audit',async()=>{
 const name='QA Midflight Supplier Missing Master';
 const original=Number(supplierCount(name));
 try{
  const {response,hits}=await withBatchRevocation(
   ()=>run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-master'"),
   ()=>post('/api/spend/admin/master',{kind:'supplier',action:'create',companyId:'company-printing',name}));
  assert.equal(hits,1);
  assert.equal(response.status,403,JSON.stringify(response));
  assert.equal(Number(supplierCount(name)),original);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-master'");}
});
await check('Supplier Edit: master grant revoked at write cannot modify supplier',async()=>{
 const name='QA Legitimate Printing Supplier';
 const initial=one('SELECT id,name FROM spend_suppliers WHERE name=?',name);
 assert.ok(initial?.id);
 try{
  const {response,hits}=await withBatchRevocation(
   ()=>run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-master'"),
   ()=>post('/api/spend/admin/master',{kind:'supplier',action:'edit',companyId:'company-printing',id:initial.id,name:'QA Unapproved Edit',reason:'Local QA attempted edit'}));
  assert.equal(hits,1);
  assert.equal(response.status,403,JSON.stringify(response));
  assert.equal(one('SELECT name FROM spend_suppliers WHERE id=?',initial.id).name,name);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-master'");}
});
await check('Supplier Deactivate: master grant revoked at write cannot change active state',async()=>{
 const initial=one('SELECT id,active FROM spend_suppliers WHERE name=?','QA Legitimate Printing Supplier');
 assert.ok(initial?.id);
 try{
  const {response,hits}=await withBatchRevocation(
   ()=>run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-master'"),
   ()=>post('/api/spend/admin/master',{kind:'supplier',action:'deactivate',companyId:'company-printing',id:initial.id,reason:'Local QA attempted deactivate'}));
  assert.equal(hits,1);
  assert.equal(response.status,403,JSON.stringify(response));
  assert.equal(Number(one('SELECT active FROM spend_suppliers WHERE id=?',initial.id).active),Number(initial.active));
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-master'");}
});

await check('Template Edit: Bakery allocation grant revoked denies editing controlled template',async()=>{
 const original=one('SELECT id,name FROM spend_allocation_templates WHERE name=?',tmplName('Valid'));
 assert.ok(original?.id);
 run("UPDATE role_permissions SET access_level='none' WHERE id='qa-alloc-bakery-perm'");
 try{
  const r=await post('/api/spend/admin/master',{kind:'template',action:'edit',companyId:'company-printing',id:original.id,name:'QA Unauthorized Template Edit',reason:'Synthetic edit denied'});
  assert.equal(r.status,403,JSON.stringify(r));
  assert.equal(one('SELECT name FROM spend_allocation_templates WHERE id=?',original.id).name,original.name);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-alloc-bakery-perm'");}
});
await check('Template Edit: authorized two-company allocation manager may edit template',async()=>{
 const original=one('SELECT id,name FROM spend_allocation_templates WHERE name=?',tmplName('Valid'));
 assert.ok(original?.id);
 const r=await post('/api/spend/admin/master',{kind:'template',action:'edit',companyId:'company-printing',id:original.id,name:'QA Authorized Template Edit',reason:'Synthetic approved edit'});
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(one('SELECT name FROM spend_allocation_templates WHERE id=?',original.id).name,'QA Authorized Template Edit');
});
await check('Template Edit: revoking Bakery grant at D1 write blocks update',async()=>{
 const initial=one("SELECT id,name FROM spend_allocation_templates WHERE name='QA Authorized Template Edit'");
 assert.ok(initial?.id);
 try{
  const {response,hits}=await withBatchRevocation(
   ()=>run("UPDATE role_permissions SET access_level='none' WHERE id='qa-alloc-bakery-perm'"),
   ()=>post('/api/spend/admin/master',{kind:'template',action:'edit',companyId:'company-printing',id:initial.id,name:'QA Unauthorized Midflight Template',reason:'Synthetic late denial'}));
  assert.equal(hits,1);
  assert.equal(response.status,403,JSON.stringify(response));
  assert.equal(one('SELECT name FROM spend_allocation_templates WHERE id=?',initial.id).name,initial.name);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-alloc-bakery-perm'");}
});
await check('Supplier Merge: revoking master permission at D1 write prevents merge',async()=>{
 const old=one("SELECT id,active,superseded_by AS supersededBy FROM spend_suppliers WHERE name='QA Legitimate Printing Supplier'");
 assert.ok(old?.id);
 const replacement=await post('/api/spend/admin/master',{kind:'supplier',action:'create',companyId:'company-printing',name:'QA Supplier Replacement For Merge'});
 assert.equal(replacement.status,201,JSON.stringify(replacement));
 try{
  const {response,hits}=await withBatchRevocation(
   ()=>run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-master'"),
   ()=>post('/api/spend/admin/master',{kind:'supplier',action:'merge',companyId:'company-printing',id:old.id,replacementId:replacement.body.id,reason:'Synthetic denied merge'}));
  assert.equal(hits,1);
  assert.equal(response.status,403,JSON.stringify(response));
  const after=one('SELECT active,superseded_by AS supersededBy FROM spend_suppliers WHERE id=?',old.id);
  assert.equal(after.active,old.active);
  assert.equal(after.supersededBy,old.supersededBy);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-master'");}
});
await check('Supplier Create: scoped explicit none override at D1 write wins over master grant',async()=>{
 const name='QA Supplier Scoped Deny At Write';
 const denySql="INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by,expires_at) SELECT 'qa-master-atwrite-deny','emp-owner','company-printing',id,'none','Synthetic scoped write denial','emp-owner',datetime('now','+1 day') FROM permissions WHERE code='expense.master'";
 try{
  const {response,hits}=await withBatchRevocation(()=>run(denySql),
   ()=>post('/api/spend/admin/master',{kind:'supplier',action:'create',companyId:'company-printing',name}));
  assert.equal(hits,1);
  assert.equal(response.status,403,JSON.stringify(response));
  assert.equal(Number(supplierCount(name)),0);
 }finally{run("DELETE FROM employee_permission_overrides_v2 WHERE id='qa-master-atwrite-deny'");}
});

// Audit/data atomicity: a hard failure of the final audit SQL must roll back
// the already prepared master mutations AND every allocation-template child.
async function failMasterAuditWrite(action) {
 const prepare = env.DB.prepare, batch = env.DB.batch;
 let batchAudits=0, separatedAudits=0;
 env.DB.prepare=(sql)=>{
  const stmt=prepare(sql);
  if(/INSERT\s+INTO\s+audit_logs/i.test(sql)){
   const actualRun=stmt.run;
   stmt.run=async (...args)=>{separatedAudits++;throw new Error('SYNTHETIC_MASTER_AUDIT_STORAGE_FAILURE');};
  }
  return stmt;
 };
 env.DB.batch=async(statements)=>{
  if(statements.some(x=>/INSERT\s+INTO\s+audit_logs/i.test(x.sql))) {
   batchAudits++;
   // Inject an invalid final SQL statement AFTER the real master statements.
   // The simulated SQLite D1 batch will roll back every earlier write.
   return batch([...statements.slice(0,-1),prepare('INSERT INTO synthetic_audit_sink_missing(id) VALUES(?)').bind('qa-fault')]);
  }
  return batch(statements);
 };
 try {
  await assert.rejects(action(),/SYNTHETIC_MASTER_AUDIT_STORAGE_FAILURE|synthetic_audit_sink_missing|no such table/i);
  assert.ok(batchAudits+separatedAudits>0,'audit failure not injected');
  return {batchAudits,separatedAudits};
 }finally{env.DB.prepare=prepare;env.DB.batch=batch;}
}
await check('Audit storage failure rolls back new Printing supplier and audit',async()=>{
 const name='QA Atomic Master Audit Supplier';
 const before=Number(supplierCount(name));
 await failMasterAuditWrite(()=>post('/api/spend/admin/master',{kind:'supplier',action:'create',companyId:'company-printing',name}));
 assert.equal(Number(supplierCount(name)),before,'master change committed without audit');
});
await check('Audit storage failure rolls back template parent and all beneficiaries',async()=>{
 const name=tmplName('Audit Atomicity');
 const before=countTemplate(name);
 await failMasterAuditWrite(()=>post('/api/spend/admin/master',tmpl('Audit Atomicity')));
 assert.equal(countTemplate(name),before,'template committed without audit');
 assert.equal(Number(one("SELECT COUNT(*) AS n FROM spend_allocation_template_items i LEFT JOIN spend_allocation_templates t ON t.id=i.template_id WHERE t.id IS NULL").n),0);
});
await check('Audit storage failure rolls back supplier edit without partial mutation',async()=>{
 const row=one("SELECT id,name FROM spend_suppliers WHERE name='QA Legitimate Printing Supplier'");
 assert.ok(row?.id);
 await failMasterAuditWrite(()=>post('/api/spend/admin/master',{
   kind:'supplier',action:'edit',companyId:'company-printing',
   id:row.id,name:'QA Audit Failure Edited Supplier',reason:'Synthetic denied audit'
 }));
 assert.equal(one('SELECT name FROM spend_suppliers WHERE id=?',row.id).name,row.name);
});
async function revokeAtMasterGetRead(actor,query,mutation,reversal) {
 const prepare=env.DB.prepare;
 let readCount=0;
 env.DB.prepare=(sql)=>{
  const stmt=prepare(sql);
  if(/FROM\s+spend_cost_centers\s+WHERE\s+company_id\s+IN/i.test(sql)) {
   const actualAll=stmt.all;
   stmt.all=async function(...args){
    const rows=await actualAll.apply(this,args);
    readCount++;
    run(mutation);
    return rows;
   };
  }
  return stmt;
 };
 try {
  const response=await get(query,actor);
  assert.equal(readCount,1,'actual master D1 cost-center read boundary not reached');
  assert.equal(response.status,403,JSON.stringify(response.body));
  assert.ok(!JSON.stringify(response.body).includes('qa-scope-print-cc'),'master data leaked after revocation');
 }finally{env.DB.prepare=prepare;run(reversal);}
}
await check('Master GET revocation of master grant during D1 read suppresses company data',async()=>{
 await revokeAtMasterGetRead('owner','/api/spend/admin/master?companyId=company-printing',
 "UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-master'",
 "UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-master'");
});
await check('Master GET exact session revoked during D1 read suppresses company data',async()=>{
 await revokeAtMasterGetRead('owner','/api/spend/admin/master?companyId=company-printing',
 "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='s-emp-owner'",
 "UPDATE auth_sessions SET revoked_at=NULL WHERE id='s-emp-owner'");
});
await check('Master GET company membership revoked during D1 read suppresses company data',async()=>{
 await revokeAtMasterGetRead('owner','/api/spend/admin/master',
 "UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-owner' AND company_id='company-printing'",
 "UPDATE employee_company_memberships SET active=1 WHERE employee_id='emp-owner' AND company_id='company-printing'");
});

// Every denied mutation must leave zero business and audit rows.
function assertNoIndependentExpenseWrites(id){
 for(const [table,column] of [
  ['spend_expense_requests','id'],
  ['spend_expense_lines','expense_request_id'],
  ['spend_expense_allocations','expense_request_id'],
  ['spend_expense_approvals','expense_request_id'],
  ['spend_expense_events','expense_request_id'],
  ['audit_logs','entity_id'],
 ]) assert.equal(Number(one(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`,id).n),0,`${table} must retain no rows after authorization denial`);
}
// Independent regression: source company is not a beneficiary.
// Product source remains unmodified; all mutations occur only in :memory: SQLite.
run("INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES('qa-independent-autos-membership','emp-owner','company-autos',0,1)");
run("INSERT INTO roles(id,company_id,code,name) VALUES('qa-independent-autos-role','company-autos','qa_independent_autos_allocator','QA Independent Autos Allocator')");
grantPermission('qa-independent-autos-perm','qa-independent-autos-role','expense.allocations','manage');
grant('qa-independent-autos-bind','emp-owner','company-autos','qa-independent-autos-role');
run("INSERT INTO spend_cost_centers(id,company_id,code,name) VALUES('qa-independent-autos-cc','company-autos','QA-INDEPENDENT-AUTOS','QA Independent Autos Cost Center')");
const foreignOnlyShared=(id)=>({...shared(id),allocations:[
 {companyId:'company-bakery',costCenterId:'qa-scope-bakery-cc',percentage:50},
 {companyId:'company-autos',costCenterId:'qa-independent-autos-cc',percentage:50}
]});
await check('Independent positive control: source Printing may allocate only to Bakery and Autos with all three grants',async()=>{
 const id='qa-independent-source-not-beneficiary-positive';
 const r=await post('/api/spend/requests',foreignOnlyShared(id));
 console.log('INDEPENDENT_POSITIVE '+JSON.stringify({status:r.status,requestCount:expenseCount(id),allocations:database.prepare('SELECT company_id,allocated_amount_kobo FROM spend_expense_allocations WHERE expense_request_id=? ORDER BY company_id').all(id)}));
 assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal(expenseCount(id),1);
});
await check('Independent negative control: source Printing allocation grant is required before request',async()=>{
 const id='qa-independent-source-not-beneficiary-preflight-deny';
 run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-alloc'");
 try {
  const r=await post('/api/spend/requests',foreignOnlyShared(id));
  console.log('INDEPENDENT_PREFLIGHT_DENY '+JSON.stringify({status:r.status,requestCount:expenseCount(id),error:r.body.error}));
  assert.ok([403,422].includes(r.status));
  assertNoIndependentExpenseWrites(id);
 } finally { run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-alloc'"); }
});
await check('Independent source allocation revocation at write must block foreign-only beneficiaries',async()=>{
 const id='qa-independent-source-not-beneficiary-midflight';
 const originalBatch=env.DB.batch;
 let injected=0;
 env.DB.batch=async function(statements){
  injected++;
  run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-alloc'");
  return originalBatch(statements);
 };
 try {
  const r=await post('/api/spend/requests',foreignOnlyShared(id));
  const observations={status:r.status,injected,sourceGrant:one("SELECT access_level FROM role_permissions WHERE id='qa-owner-expense-alloc'").access_level,requestCount:expenseCount(id),allocations:database.prepare('SELECT company_id,allocated_amount_kobo FROM spend_expense_allocations WHERE expense_request_id=? ORDER BY company_id').all(id),auditCount:one('SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=?',id).n,eventCount:one('SELECT COUNT(*) AS n FROM spend_expense_events WHERE expense_request_id=?',id).n};
  console.log('INDEPENDENT_AT_WRITE_RESULT '+JSON.stringify(observations));
  assert.equal(injected,1,'Must reach the D1 batch boundary exactly once');
  assert.ok([403,409,422].includes(r.status),'Source permission was revoked but returned HTTP '+r.status);
  assertNoIndependentExpenseWrites(id);
 } finally { env.DB.batch=originalBatch;run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-alloc'"); }
});
// Direct explicit allocation and default implicit direct must have different gates.
const explicitDirect=(id)=>({...shared(id),directShared:'direct',allocations:[
 {companyId:'company-printing',costCenterId:'qa-scope-print-cc',percentage:100}
]});
const implicitDirect=(id)=>{const body={...shared(id),directShared:'direct'};delete body.allocations;delete body.allocationMethod;return body;};
await check('Independent direct-explicit positive control with current source allocation grant',async()=>{
 const id='qa-independent-direct-explicit-positive';
 const r=await post('/api/spend/requests',explicitDirect(id));
 console.log('INDEPENDENT_DIRECT_EXPLICIT_POSITIVE '+JSON.stringify({status:r.status,requestCount:expenseCount(id)}));
 assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal(expenseCount(id),1);
});
await check('Independent direct-explicit preflight source allocation denial',async()=>{
 const id='qa-independent-direct-explicit-preflight';
 run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-alloc'");
 try{
  const r=await post('/api/spend/requests',explicitDirect(id));
  console.log('INDEPENDENT_DIRECT_EXPLICIT_PREFLIGHT_DENY '+JSON.stringify({status:r.status,requestCount:expenseCount(id),error:r.body.error}));
  assert.ok([403,422].includes(r.status));
  assertNoIndependentExpenseWrites(id);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-alloc'");}
});
await check('Independent default implicit direct expense works with expense.requests and no allocation grant',async()=>{
 const id='qa-independent-direct-implicit-no-alloc-grant';
 run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-alloc'");
 try{
  const r=await post('/api/spend/requests',implicitDirect(id));
  console.log('INDEPENDENT_IMPLICIT_DIRECT_NO_ALLOC_GRANT '+JSON.stringify({status:r.status,requestCount:expenseCount(id),sourceGrant:one("SELECT access_level FROM role_permissions WHERE id='qa-owner-expense-alloc'").access_level}));
  assert.equal(r.status,201,JSON.stringify(r.body));
  assert.equal(expenseCount(id),1);
 }finally{run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-alloc'");}
});
await check('Independent explicit direct source allocation revocation at write must block',async()=>{
 const id='qa-independent-direct-explicit-midflight';
 const originalBatch=env.DB.batch;let injected=0;
 env.DB.batch=async function(statements){injected++;run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-alloc'");return originalBatch(statements);};
 try{
  const r=await post('/api/spend/requests',explicitDirect(id));
  const observations={status:r.status,injected,sourceGrant:one("SELECT access_level FROM role_permissions WHERE id='qa-owner-expense-alloc'").access_level,requestCount:expenseCount(id),allocations:database.prepare('SELECT company_id,allocated_amount_kobo FROM spend_expense_allocations WHERE expense_request_id=?').all(id),auditCount:one('SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=?',id).n,eventCount:one('SELECT COUNT(*) AS n FROM spend_expense_events WHERE expense_request_id=?',id).n};
  console.log('INDEPENDENT_DIRECT_EXPLICIT_AT_WRITE '+JSON.stringify(observations));
  assert.equal(injected,1);
  assert.ok([403,409,422].includes(r.status),'Explicit direct source allocation revoked but HTTP '+r.status);
  assertNoIndependentExpenseWrites(id);
 }finally{env.DB.batch=originalBatch;run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-alloc'");}
});
// Approved templates also require the source grant at the final write boundary.
const independentTemplateCreated=await post('/api/spend/admin/master',{
 kind:'template',action:'create',companyId:'company-printing',
 name:'QA Independent Foreign Only Approved Template',method:'percentage',
 items:[{companyId:'company-bakery',costCenterId:'qa-scope-bakery-cc',percentage:50},
        {companyId:'company-autos',costCenterId:'qa-independent-autos-cc',percentage:50}]
});
assert.equal(independentTemplateCreated.status,201,JSON.stringify(independentTemplateCreated.body));
const approvedDirectTemplate=(id)=>{
 const body={...shared(id),directShared:'direct',allocationTemplateId:independentTemplateCreated.body.id};
 delete body.allocations;delete body.allocationMethod;return body;
};
await check('Independent approved-template direct allocation works with current source and destination grants',async()=>{
 const id='qa-independent-approved-template-positive';
 const r=await post('/api/spend/requests',approvedDirectTemplate(id));
 console.log('INDEPENDENT_APPROVED_TEMPLATE_POSITIVE '+JSON.stringify({status:r.status,requestCount:expenseCount(id),allocations:database.prepare('SELECT company_id,allocated_amount_kobo FROM spend_expense_allocations WHERE expense_request_id=? ORDER BY company_id').all(id)}));
 assert.equal(r.status,201,JSON.stringify(r.body));
 assert.equal(expenseCount(id),1);
});
await check('Independent approved-template source allocation revocation at write must block',async()=>{
 const id='qa-independent-approved-template-midflight';
 const originalBatch=env.DB.batch;let injected=0;
 env.DB.batch=async function(statements){injected++;run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-alloc'");return originalBatch(statements);};
 try{
  const r=await post('/api/spend/requests',approvedDirectTemplate(id));
  const observations={status:r.status,injected,sourceGrant:one("SELECT access_level FROM role_permissions WHERE id='qa-owner-expense-alloc'").access_level,requestCount:expenseCount(id),allocationCount:one('SELECT COUNT(*) AS n FROM spend_expense_allocations WHERE expense_request_id=?',id).n,auditCount:one('SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=?',id).n,eventCount:one('SELECT COUNT(*) AS n FROM spend_expense_events WHERE expense_request_id=?',id).n};
  console.log('INDEPENDENT_APPROVED_TEMPLATE_AT_WRITE '+JSON.stringify(observations));
  assert.equal(injected,1);
  assert.ok([403,409,422].includes(r.status),'Approved-template source allocation revoked but HTTP '+r.status);
  assertNoIndependentExpenseWrites(id);
 }finally{env.DB.batch=originalBatch;run("UPDATE role_permissions SET access_level='manage' WHERE id='qa-owner-expense-alloc'");}
});
const failed=results.filter(x=>!x.pass);
console.log('SPEND_MASTER_ALLOCATION_SCOPE '+(results.length-failed.length)+'/'+results.length+' PASS');
for(const f of failed) console.log('CASE_FAILURE '+f.name+' '+f.error);
database.close();
if(failed.length)process.exitCode=1;
