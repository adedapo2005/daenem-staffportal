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

await check('No Group grant table denies Group Overview despite Owner role',async()=>{
 const r=await spendCall('/api/spend/owner/overview');
 assert.equal(r.status,403,JSON.stringify(r.body));
 assert.ok(!JSON.stringify(r.body).includes('991003'));
});
await check('No Group grant table denies foreign Bakery Group Detail',async()=>{
 const r=await spendCall('/api/spend/owner/detail?companyId=company-bakery');
 assert.equal(r.status,403,JSON.stringify(r.body));
 assert.ok(!JSON.stringify(r.body).includes('qa-bakery-foreign'));
});
await check('No Group grant table denies unfiltered Group Detail',async()=>{
 const r=await spendCall('/api/spend/owner/detail');
 assert.equal(r.status,403,JSON.stringify(r.body));
});
database.exec(`
CREATE TABLE employee_group_permission_grants(
 id TEXT PRIMARY KEY, employee_id TEXT, permission_id TEXT, access_level TEXT,
 active INTEGER, granted_by TEXT, reviewed_by TEXT, reviewed_at TEXT,
 expires_at TEXT, revoked_by TEXT, revoked_at TEXT);
`);
run("INSERT INTO permissions(id,code,module,action,description,sensitive) VALUES('qa-expense-group-report','expense.group.report','spend','group_report','Synthetic local test',1)");
run("INSERT INTO employee_group_permission_grants(id,employee_id,permission_id,access_level,active,granted_by,reviewed_by,reviewed_at,expires_at) VALUES('qa-group-grant','emp-owner','qa-expense-group-report','view',1,'emp-group-admin','emp-payroll',datetime('now'),datetime('now','+1 day'))");
await check('Reviewed view Group report grant allows Overview',async()=>{
 const r=await spendCall('/api/spend/owner/overview');
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.ok(Number(r.body.metrics.requestedKobo)>=991003);
});
await check('View-level grant does not authorize Group Detail',async()=>{
 const r=await spendCall('/api/spend/owner/detail?companyId=company-bakery');
 assert.equal(r.status,403,JSON.stringify(r.body));
});
run("UPDATE employee_group_permission_grants SET access_level='manage' WHERE id='qa-group-grant'");
await check('Explicit managed Group grant permits Bakery Detail',async()=>{
 const r=await spendCall('/api/spend/owner/detail?companyId=company-bakery');
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.ok(r.body.requests.some(x=>x.id==='qa-bakery-foreign'));
});
await check('Expired Group report grant fails closed',async()=>{
 run("UPDATE employee_group_permission_grants SET expires_at=datetime('now','-1 minute') WHERE id='qa-group-grant'");
 try{assert.equal((await spendCall('/api/spend/owner/overview')).status,403);}
 finally{run("UPDATE employee_group_permission_grants SET expires_at=datetime('now','+1 day') WHERE id='qa-group-grant'");}
});
await check('Grant issuer and reviewer must be different',async()=>{
 run("UPDATE employee_group_permission_grants SET reviewed_by='emp-group-admin' WHERE id='qa-group-grant'");
 try{assert.equal((await spendCall('/api/spend/owner/overview')).status,403);}
 finally{run("UPDATE employee_group_permission_grants SET reviewed_by='emp-payroll' WHERE id='qa-group-grant'");}
});
await check('Revoked Group report grant fails closed',async()=>{
 run("UPDATE employee_group_permission_grants SET active=0,revoked_by='emp-payroll',revoked_at=CURRENT_TIMESTAMP WHERE id='qa-group-grant'");
 try{assert.equal((await spendCall('/api/spend/owner/overview')).status,403);}
 finally{run("UPDATE employee_group_permission_grants SET active=1,revoked_by=NULL,revoked_at=NULL WHERE id='qa-group-grant'");}
});
await check('Revoked Owner membership rejects stale request context',async()=>{
 const req=new Request('https://staffportal.test/api/spend/owner/overview',{headers:{cookie:COOKIE+'='+tokens.owner}});
 const ctx=await auth.getSessionContext(req,env);assert.ok(ctx);
 run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-owner' AND company_id='company-printing'");
 try{
  const r=await spend.routeSpend(req,env,ctx);
  assert.equal(r.status,403,await r.text());
 }finally{run("UPDATE employee_company_memberships SET active=1 WHERE employee_id='emp-owner' AND company_id='company-printing'");}
});
await check('Revoked exact session rejects stale request context',async()=>{
 const req=new Request('https://staffportal.test/api/spend/owner/overview',{headers:{cookie:COOKIE+'='+tokens.owner}});
 const ctx=await auth.getSessionContext(req,env);assert.ok(ctx);
 run("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='s-emp-owner'");
 try{
  const r=await spend.routeSpend(req,env,ctx);
  assert.equal(r.status,403,await r.text());
 }finally{run("UPDATE auth_sessions SET revoked_at=NULL WHERE id='s-emp-owner'");}
});
await check('Revocation during Group Overview DB read suppresses financial data',async()=>{
 const req=new Request('https://staffportal.test/api/spend/owner/overview',{headers:{cookie:COOKIE+'='+tokens.owner}});
 const ctx=await auth.getSessionContext(req,env);assert.ok(ctx);
 const prior=env.DB.prepare;let injected=0;
 env.DB.prepare=(sql)=>{
  const statement=prior(sql);
  if(sql.includes('COUNT(*) AS requestCount') && sql.includes('FROM spend_expense_requests')){
   const baseFirst=statement.first;
   statement.first=async function(...args){
    const value=await baseFirst.apply(this,args);
    injected++;
    run("UPDATE employee_group_permission_grants SET active=0,revoked_by='emp-payroll',revoked_at=CURRENT_TIMESTAMP WHERE id='qa-group-grant'");
    return value;
   };
  }
  return statement;
 };
 try{
  const res=await spend.routeSpend(req,env,ctx),body=await res.json();
  assert.equal(injected,1,'the actual financial-read boundary was not reached');
  assert.equal(res.status,403,JSON.stringify(body));
  assert.ok(!JSON.stringify(body).includes('991003'));
 }finally{
  env.DB.prepare=prior;
  run("UPDATE employee_group_permission_grants SET active=1,revoked_by=NULL,revoked_at=NULL WHERE id='qa-group-grant'");
 }
});
await check('Inactive independent Group grant reviewer cannot authorize financial reports',async()=>{
 run("UPDATE employees SET employment_status='inactive' WHERE id='emp-payroll'");
 try{assert.equal((await spendCall('/api/spend/owner/overview')).status,403);}
 finally{run("UPDATE employees SET employment_status='active' WHERE id='emp-payroll'");}
});
await check('Inactive Group grant issuer cannot authorize financial reports',async()=>{
 run("UPDATE employees SET employment_status='inactive' WHERE id='emp-group-admin'");
 try{assert.equal((await spendCall('/api/spend/owner/overview')).status,403);}
 finally{run("UPDATE employees SET employment_status='active' WHERE id='emp-group-admin'");}
});
await check('Group Owner role removed mid-session cannot authorize Group reporting',async()=>{
 const req=new Request('https://staffportal.test/api/spend/owner/overview',{headers:{cookie:COOKIE+'='+tokens.owner}});
 const ctx=await auth.getSessionContext(req,env);assert.ok(ctx);
 run("DELETE FROM employee_roles WHERE id='er-owner'");
 try{
  const res=await spend.routeSpend(req,env,ctx);
  assert.equal(res.status,403,await res.text());
 }finally{grant('er-owner','emp-owner','company-printing','role-owner');}
});
await check('Company-scoped role pretending to be Owner cannot use an explicit Group grant',async()=>{
 run("INSERT INTO employee_group_permission_grants(id,employee_id,permission_id,access_level,active,granted_by,reviewed_by,reviewed_at,expires_at) VALUES('qa-fake-owner-group','emp-fake-owner','qa-expense-group-report','manage',1,'emp-group-admin','emp-payroll',datetime('now'),datetime('now','+1 day'))");
 try{assert.equal((await spendCall('/api/spend/owner/overview','fakeOwner')).status,403);}
 finally{run("DELETE FROM employee_group_permission_grants WHERE id='qa-fake-owner-group'");}
});
await check('Group Admin without Group Owner role cannot use a standalone Group Spend grant',async()=>{
 run("INSERT INTO employee_group_permission_grants(id,employee_id,permission_id,access_level,active,granted_by,reviewed_by,reviewed_at,expires_at) VALUES('qa-admin-group','emp-group-admin','qa-expense-group-report','manage',1,'emp-payroll','emp-owner',datetime('now'),datetime('now','+1 day'))");
 try{assert.equal((await spendCall('/api/spend/owner/overview','groupAdmin')).status,403);}
 finally{run("DELETE FROM employee_group_permission_grants WHERE id='qa-admin-group'");}
});
await check('Revocation during detailed financial D1 read suppresses foreign expense rows',async()=>{
 const req=new Request('https://staffportal.test/api/spend/owner/detail?companyId=company-bakery',{headers:{cookie:COOKIE+'='+tokens.owner}});
 const ctx=await auth.getSessionContext(req,env);assert.ok(ctx);
 const prior=env.DB.prepare;let injected=0;
 env.DB.prepare=(sql)=>{
  const statement=prior(sql);
  if(sql.includes('FROM spend_expense_requests r JOIN employees e') && sql.includes('JOIN companies c')){
   const actualAll=statement.all;
   statement.all=async function(...args){
    const value=await actualAll.apply(this,args);
    injected++;
    run("UPDATE employee_group_permission_grants SET active=0,revoked_by='emp-payroll',revoked_at=CURRENT_TIMESTAMP WHERE id='qa-group-grant'");
    return value;
   };
  }
  return statement;
 };
 try{
  const response=await spend.routeSpend(req,env,ctx),body=await response.json();
  assert.equal(injected,1,'the actual detailed D1 read boundary was not reached');
  assert.equal(response.status,403,JSON.stringify(body));
  assert.ok(!JSON.stringify(body).includes('qa-bakery-foreign'));
 }finally{
  env.DB.prepare=prior;
  run("UPDATE employee_group_permission_grants SET active=1,revoked_by=NULL,revoked_at=NULL WHERE id='qa-group-grant'");
 }
});
const failed=results.filter(x=>!x.pass);
console.log('GROUP_REPORT_GRANT_SECURITY '+(results.length-failed.length)+'/'+results.length+' PASS');
for(const f of failed) console.log('CASE_FAILURE '+f.name+' '+f.error);
database.close();
if(failed.length)process.exitCode=1;
