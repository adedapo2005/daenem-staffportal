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

grantPermission('qa-owner-review-only','role-owner','expense.review','view');
let caseNo=0;
const amountForCase=()=>222000+caseNo;
function seedApproval(approvalRole='owner'){
 caseNo++;
 const id='qa-approval-'+caseNo;
 run(expenseSQL,id,'QA-APPROVAL-'+caseNo,'qa-spend-print','company-printing','Approval adversarial case '+caseNo,'Synthetic QA only',amountForCase(),String(fixtureTreatment.id));
 run("INSERT INTO spend_expense_approvals(id,expense_request_id,step_no,approver_role_code,status) VALUES(?,?,1,?,'pending')",id+'-step',id,approvalRole);
 return id;
}
const snapshot=(id)=>({
 status:one('SELECT status FROM spend_expense_requests WHERE id=?',id).status,
 approval:one('SELECT status FROM spend_expense_approvals WHERE expense_request_id=?',id).status,
 audit:Number(one("SELECT COUNT(*) AS count FROM audit_logs WHERE module='spend' AND entity_type='expense_request' AND entity_id=?",id).count),
 events:Number(one("SELECT COUNT(*) AS count FROM spend_expense_events WHERE expense_request_id=?",id).count),
});
async function actionAsOwner(id,action='approve'){
 const request=new Request('https://staffportal.test/api/spend/requests/'+id+'/action',{
  method:'POST',headers:{cookie:COOKIE+'='+tokens.owner,'content-type':'application/json'},
  body:JSON.stringify({action,reason:'Synthetic QA reason'})
 });
 const ctx=await auth.getSessionContext(request,env);
 assert.ok(ctx);
 const response=await spend.routeSpend(request,env,ctx);
 assert.ok(response,'Spend action route not handled');
 return {status:response.status,body:await response.json()};
}
const denied=(response)=>assert.ok([403,404,409].includes(response.status),'Expected fail-closed denial, got '+JSON.stringify(response));
const noTransition=(id,before)=>{
 const after=snapshot(id);
 assert.deepEqual(after,before,'Unauthorized approval wrote expense state/audit/events');
};
async function preBatchMutation(id,fn){
 const original=env.DB.batch;
 let hit=0;
 env.DB.batch=async function(stmts){
  hit++;fn();return original(stmts);
 };
 try{return {response:await actionAsOwner(id),hit};}
 finally{env.DB.batch=original;}
}
await check('Owner with expense.review but no expense.approve cannot approve',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const response=await actionAsOwner(id);denied(response);noTransition(id,before);
});
grantPermission('qa-owner-expense-approve','role-owner','expense.approve','approve');
await check('Owner approval grant without assigned pending role cannot approve',async()=>{
 const id=seedApproval('qa_payroll'),before=snapshot(id);
 const response=await actionAsOwner(id);denied(response);noTransition(id,before);
});
await check('Owner with explicit grant and assigned approval role can approve once with audit',async()=>{
 const id=seedApproval();
 const response=await actionAsOwner(id);
 assert.equal(response.status,200,JSON.stringify(response.body));
 const after=snapshot(id);
 assert.equal(after.status,'approved');
 assert.equal(after.approval,'approved');
 assert.equal(after.audit,1);assert.equal(after.events,1);
 const repeat=await actionAsOwner(id);
 denied(repeat);assert.deepEqual(snapshot(id),after);
});
await check('At-write expense.approve revocation blocks approval and audit',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const {response,hit}=await preBatchMutation(id,()=>run("UPDATE role_permissions SET access_level='none' WHERE id='qa-owner-expense-approve'"));
 try{assert.equal(hit,1);denied(response);noTransition(id,before);}
 finally{run("UPDATE role_permissions SET access_level='approve' WHERE id='qa-owner-expense-approve'");}
});
await check('At-write exact session revocation blocks approval and audit',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const {response,hit}=await preBatchMutation(id,()=>run("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='s-emp-owner'"));
 try{assert.equal(hit,1);denied(response);noTransition(id,before);}
 finally{run("UPDATE auth_sessions SET revoked_at=NULL WHERE id='s-emp-owner'");}
});
await check('At-write company membership revocation blocks approval and audit',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const {response,hit}=await preBatchMutation(id,()=>run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-owner' AND company_id='company-printing'"));
 try{assert.equal(hit,1);denied(response);noTransition(id,before);}
 finally{run("UPDATE employee_company_memberships SET active=1 WHERE employee_id='emp-owner' AND company_id='company-printing'");}
});
await check('At-write matching approver role removal blocks approval and audit',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const {response,hit}=await preBatchMutation(id,()=>run("DELETE FROM employee_roles WHERE id='er-owner'"));
 try{assert.equal(hit,1);denied(response);noTransition(id,before);}
 finally{grant('er-owner','emp-owner','company-printing','role-owner');}
});
await check('At-write company-scoped explicit deny blocks approval and audit',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const override="INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by,expires_at) SELECT 'qa-approver-deny','emp-owner','company-printing',id,'none','Synthetic QA','emp-owner',datetime('now','+1 day') FROM permissions WHERE code='expense.approve'";
 const {response,hit}=await preBatchMutation(id,()=>run(override));
 try{assert.equal(hit,1);denied(response);noTransition(id,before);}
 finally{run("DELETE FROM employee_permission_overrides_v2 WHERE id='qa-approver-deny'");}
});
await check('Assigned approver may return a submitted expense with an audit and event',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const response=await actionAsOwner(id,'return');
 assert.equal(response.status,200,JSON.stringify(response.body));
 const after=snapshot(id);
 assert.equal(after.status,'returned');assert.equal(after.approval,'returned');
 assert.equal(after.audit,before.audit+1);assert.equal(after.events,before.events+1);
});
await check('Assigned approver may reject a submitted expense with an audit and event',async()=>{
 const id=seedApproval(),before=snapshot(id);
 const response=await actionAsOwner(id,'reject');
 assert.equal(response.status,200,JSON.stringify(response.body));
 const after=snapshot(id);
 assert.equal(after.status,'rejected');assert.equal(after.approval,'rejected');
 assert.equal(after.audit,before.audit+1);assert.equal(after.events,before.events+1);
});
const failed=results.filter(c=>!c.pass);
console.log('SPEND_APPROVAL_ATWRITE_SECURITY '+(results.length-failed.length)+'/'+results.length+' PASS');
for(const x of failed)console.log('CASE_FAIL '+x.name+' '+x.error);
database.close();
if(failed.length)process.exitCode=1;
