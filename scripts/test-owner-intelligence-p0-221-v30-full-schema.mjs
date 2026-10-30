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

// Control only the fence's second-resolution clock. Session/override expiry
// still uses SQLite datetime(). Ordinary success cases must not flake when
// the test happens to start at a real second boundary; rollover is tested below.
let fenceClock = one("SELECT strftime('%Y-%m-%d %H:%M:%S','now') AS value").value;
database.function('strftime', (format, value) => {
  assert.equal(format, '%Y-%m-%d %H:%M:%S');
  assert.equal(value, 'now');
  return fenceClock;
});

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); } catch (error) { results.push([name, false, error.message.split('\n')[0]]); }
}

// ---- V18 P0 #221: explicit current grants; never implicit Owner authority ----
run("DELETE FROM role_permissions WHERE role_id='role-owner'");
run("DELETE FROM role_permissions WHERE role_id='role-group-admin'");
grantPermission('rp-qa-owner-payroll', 'role-owner', 'payroll.access', 'view');
const cases=[];
async function expectCase(name,fn){
 try{await fn();cases.push({name,pass:true});}
 catch(err){cases.push({name,pass:false,error:String(err.message).slice(0,550)});}
}
const isNeutral=response=>{assert.equal(response.status,403);assert.deepEqual(response.body,NEUTRAL);};
const assertNoLeak=body=>{
 const text=JSON.stringify(body);
 for(const marker of [MARK.payrollBakeryNet,MARK.inventoryValue,MARK.maintenanceCost,MARK.sales])
  assert.ok(!text.includes(marker),'forbidden data leak');
};
await expectCase('Company-only employee with payroll grant but no Group role is denied',async()=>isNeutral(await company('payroll','company-printing')));
await expectCase('Group Admin with no domain grant is denied',async()=>isNeutral(await group('groupAdmin')));
await expectCase('Fake company-coded Owner is denied',async()=>isNeutral(await company('fakeOwner','company-printing')));
await expectCase('Group Admin with deactivated membership is denied',async()=>isNeutral(await group('staleAdmin')));
await expectCase('Owner foreign Bakery and unknown company get identical neutral denial',async()=>{
 const a=await company('owner','company-bakery'),b=await company('owner','company-does-not-exist');
 isNeutral(a);isNeutral(b);assert.deepEqual(a.body,b.body);
});
await expectCase('Owner with only Printing payroll sees no finance, sales, inventory, other companies',async()=>{
 const r=await group('owner');
 assert.equal(r.status,200);
 assert.deepEqual(r.body.scope.companyIds,['company-printing']);
 assert.equal(r.body.companies.printing.payroll.netKobo,470000);
 assert.equal(r.body.group.payrollNetKobo,470000);
 assert.equal('finance' in r.body,false);
 for(const k of ['inventory','workforce','maintenance','current','previous'])assert.equal(k in r.body.companies.printing,false,k);
 for(const k of ['bakery','autos','logistics','properties'])assert.equal(k in r.body.companies,false,k);
 for(const k of ['revenueKobo','highRiskSecurity','inventoryValueKobo'])assert.equal(k in r.body.group,false,k);
 assertNoLeak(r.body);
});
await expectCase('Explicit Printing selection is authorized and only returns payroll',async()=>{
 const r=await company('owner','company-printing');
 assert.equal(r.status,200);assert.deepEqual(r.body.scope.companyIds,['company-printing']);
 assert.equal(r.body.companies.printing.payroll.netKobo,470000);assertNoLeak(r.body);
});
await expectCase('Stale context after revoked membership is rejected at collection start',async()=>{
 const req=new Request('https://staffportal.test/api/owner/intelligence',{headers:{cookie:COOKIE+'='+tokens.owner}});
 const snapshot=await auth.getSessionContext(req,env);assert.ok(snapshot);
 run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-owner' AND company_id='company-printing'");
 try{await assert.rejects(()=>intelligence.collectOwnerIntelligence(env,snapshot),/Owner intelligence scope is unavailable/);}
 finally{run("UPDATE employee_company_memberships SET active=1 WHERE employee_id='emp-owner' AND company_id='company-printing'");}
});
await expectCase('Revocation DURING payroll D1 read suppresses response',async()=>{
 const oldPrepare=env.DB.prepare;let revoked=false;
 env.DB.prepare=sql=>{
  const statement=oldPrepare(sql);
  if(/FROM payroll_runs/.test(sql)){
   const previous=statement.first;
   statement.first=async function(...args){
    const got=await previous.apply(this,args);
    if(!revoked){
     revoked=true;
     run("UPDATE role_permissions SET access_level='none' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='payroll.access')");
    }
    return got;
   };
  }
  return statement;
 };
 try{isNeutral(await group('owner'));assert.equal(revoked,true);}
 finally{
  env.DB.prepare=oldPrepare;
  run("UPDATE role_permissions SET access_level='view' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='payroll.access')");
 }
});
await expectCase('AI without scoped company entitlement is denied before provider and audit',async()=>{
 const before=aiPrompts.length,logs=aiLogs();
 const r=await ai('owner',{companyId:'company-printing',question:'What was payroll?'});
 assert.equal(r.status,403);assert.equal(aiPrompts.length,before);assert.equal(aiLogs(),logs);
});
grantPermission('rp-qa-owner-ai', 'role-owner', 'ai_guide.access', 'view');
await expectCase('Authorized AI sees only Printing payroll and no disallowed data',async()=>{
 const before=aiPrompts.length;
 const r=await ai('owner',{companyId:'company-printing',question:'Payroll Printing only'});
 assert.equal(r.status,200);assert.equal(aiPrompts.length,before+1);
 const prompt=aiPrompts.at(-1);assert.ok(prompt.includes(MARK.payrollPrintingNet));
 for(const marker of [MARK.payrollBakeryNet,MARK.inventoryValue,MARK.maintenanceCost,MARK.sales])assert.ok(!prompt.includes(marker));
});
await expectCase('AI grant revoked DURING provider call denies success and audit',async()=>{
 const original=env.AI.run,before=aiLogs();
 env.AI.run=async(...args)=>{
  run("UPDATE role_permissions SET access_level='none' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='ai_guide.access')");
  return original(...args);
 };
 try{isNeutral(await ai('owner',{companyId:'company-printing',question:'Payroll?'}));assert.equal(aiLogs(),before);}
 finally{env.AI.run=original;run("UPDATE role_permissions SET access_level='view' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='ai_guide.access')");}
});
await expectCase('Payroll domain revoked DURING AI provider run suppresses stale brief and audit',async()=>{
 const original=env.AI.run,before=aiLogs();
 env.AI.run=async(...args)=>{
  run("UPDATE role_permissions SET access_level='none' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='payroll.access')");
  return original(...args);
 };
 try{isNeutral(await ai('owner',{companyId:'company-printing',question:'Payroll?'}));assert.equal(aiLogs(),before);}
 finally{
  env.AI.run=original;
  run("UPDATE role_permissions SET access_level='view' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='payroll.access')");
 }
});
await expectCase('AI Bakery foreign-company request calls no provider',async()=>{
 const before=aiPrompts.length;
 isNeutral(await ai('owner',{companyId:'company-bakery',question:'Bakery balances?'}));
 assert.equal(aiPrompts.length,before);
});
await expectCase('Revoked session with stale context is denied',async()=>{
 const req=new Request('https://staffportal.test/api/owner/intelligence',{headers:{cookie:COOKIE+'='+tokens.owner}});
 const stale=await auth.getSessionContext(req,env);assert.ok(stale);
 run("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE employee_id='emp-owner'");
 try{await assert.rejects(()=>intelligence.collectOwnerIntelligence(env,stale),/Owner intelligence scope is unavailable/);}
 finally{run("UPDATE auth_sessions SET revoked_at=NULL WHERE employee_id='emp-owner'");}
});
run("INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES('m-owner-bakery','emp-owner','company-bakery',0,1)");
await expectCase('Membership alone cannot add Bakery to intelligence',async()=>{
 isNeutral(await company('owner','company-bakery'));
 const r=await group('owner');assert.equal(r.status,200);
 assert.deepEqual(r.body.scope.companyIds,['company-printing']);
 assert.ok(!JSON.stringify(r.body).includes(MARK.payrollBakeryNet));
});
run("INSERT INTO roles(id,company_id,code,name) VALUES('role-qa-bakery-payroll','company-bakery','qa_bakery_payroll','QA Bakery Payroll')");
grantPermission('rp-qa-bakery-payroll', 'role-qa-bakery-payroll', 'payroll.access', 'view');
grant('er-owner-bakery-payroll','emp-owner','company-bakery','role-qa-bakery-payroll');
await expectCase('Two independently permitted company payroll scopes aggregate only both',async()=>{
 const r=await group('owner');
 assert.equal(r.status,200);
 assert.deepEqual(r.body.scope.companyIds,['company-printing','company-bakery']);
 assert.equal(r.body.group.payrollNetKobo,470000+800000);
 assert.equal('finance' in r.body,false);
 assert.equal('revenueKobo' in r.body.group,false);
 assert.ok(!JSON.stringify(r.body).includes(MARK.inventoryValue));
});
await expectCase('AI cannot union Printing-only guide grant to read Bakery',async()=>{
 const before=aiPrompts.length;
 const r=await ai('owner',{question:'All payroll?'});
 assert.equal(r.status,403);assert.equal(aiPrompts.length,before);
});

// Independent review: revoke permissions/session AFTER the final post-provider
// check but BEFORE ai_activity_logs is written. Interception simulates an
// intervening D1 commit; only disposable in-memory records are used.
async function aiAtWriteWindow(label, mutate, restore) {
 const originalPrepare=env.DB.prepare;
 let injected=0;
 const before=aiLogs();
 env.DB.prepare=sql=>{
   const statement=originalPrepare(sql);
   if(/^\s*INSERT INTO ai_activity_logs\b/i.test(sql)) {
     const originalRun=statement.run;
     statement.run=async function(...args) {
       if(injected===0){injected++;mutate();}
       return originalRun.apply(this,args);
     };
   }
   return statement;
 };
 try{
   const response=await ai('owner',{companyId:'company-printing',question:'Give an authorized Printing payroll brief'});
   const activityDelta=aiLogs()-before;
   console.log('AI_ATWRITE_WINDOW '+JSON.stringify({label,HTTP:response.status,injected,activityDelta}));
   return {response,activityDelta,injected};
 } finally{env.DB.prepare=originalPrepare;restore();}
}
await expectCase('ATWRITE revoked exact session prevents AI brief and activity INSERT',async()=>{
 const {response,activityDelta,injected}=await aiAtWriteWindow(
 'session-revoked',
 ()=>run("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id='emp-owner'"),
 ()=>run("UPDATE auth_sessions SET revoked_at=NULL WHERE employee_id='emp-owner'")
 );
 assert.equal(injected,1,'AI activity D1 write boundary not reached');
 isNeutral(response);
 assert.equal(activityDelta,0,'revoked session still inserted AI activity event');
});
await expectCase('ATWRITE revoked payroll domain prevents AI brief and activity INSERT',async()=>{
 const {response,activityDelta,injected}=await aiAtWriteWindow(
 'payroll-revoked',
 ()=>run("UPDATE role_permissions SET access_level='none' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='payroll.access')"),
 ()=>run("UPDATE role_permissions SET access_level='view' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='payroll.access')")
 );
 assert.equal(injected,1);
 isNeutral(response);
 assert.equal(activityDelta,0,'revoked payroll entitlement still inserted activity');
});
await expectCase('ATWRITE revoked AI company grant prevents AI brief and activity INSERT',async()=>{
 const {response,activityDelta,injected}=await aiAtWriteWindow(
 'ai-guide-revoked',
 ()=>run("UPDATE role_permissions SET access_level='none' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='ai_guide.access')"),
 ()=>run("UPDATE role_permissions SET access_level='view' WHERE role_id='role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='ai_guide.access')")
 );
 assert.equal(injected,1);
 isNeutral(response);
 assert.equal(activityDelta,0,'revoked company AI grant still inserted activity');
});
await expectCase('ATWRITE revoked company membership prevents AI brief and activity INSERT',async()=>{
 const {response,activityDelta,injected}=await aiAtWriteWindow(
 'printing-membership-revoked',
 ()=>run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-owner' AND company_id='company-printing'"),
 ()=>run("UPDATE employee_company_memberships SET active=1 WHERE employee_id='emp-owner' AND company_id='company-printing'")
 );
 assert.equal(injected,1);
 isNeutral(response);
 assert.equal(activityDelta,0,'revoked member still inserted activity');
});
await expectCase('Scoped payroll deny overrides Owner role grant before any disclosure',async()=>{
 run(`INSERT INTO employee_permission_overrides_v2
   (id,employee_id,company_id,permission_id,access_level,reason,assigned_by)
   SELECT 'qa-owner-payroll-deny','emp-owner','company-printing',id,'none',
          'Explicit company denial fixture','emp-owner'
   FROM permissions WHERE code='payroll.access'`);
 try{isNeutral(await company('owner','company-printing'));}
 finally{run("DELETE FROM employee_permission_overrides_v2 WHERE id='qa-owner-payroll-deny'");}
});
await expectCase('ATWRITE scoped AI deny overrides Owner role grant and prevents activity',async()=>{
 const {response,activityDelta,injected}=await aiAtWriteWindow(
  'scoped-ai-deny',
  ()=>run(`INSERT INTO employee_permission_overrides_v2
    (id,employee_id,company_id,permission_id,access_level,reason,assigned_by)
    SELECT 'qa-owner-ai-deny','emp-owner','company-printing',id,'none',
           'Explicit company denial fixture','emp-owner'
    FROM permissions WHERE code='ai_guide.access'`),
  ()=>run("DELETE FROM employee_permission_overrides_v2 WHERE id='qa-owner-ai-deny'")
 );
 assert.equal(injected,1);isNeutral(response);assert.equal(activityDelta,0);
});
await expectCase('Fence second rollover preserves authorized write and audit',async()=>{
 const previousClock=fenceClock;
 const before=aiLogs(),prompts=aiPrompts.length;
 const {response,activityDelta,injected}=await aiAtWriteWindow(
  'clock-second-rollover',
  ()=>{fenceClock=one('SELECT datetime(?,\'+1 second\') AS value',previousClock).value;},
  ()=>{}
 );
 assert.equal(injected,1);assert.equal(response.status,200);
 assert.equal(activityDelta,1,'legitimate clock rollover must not suppress the authorized audit');
 assert.equal(aiPrompts.length-prompts,1,'legitimate clock rollover must not suppress the authorized brief');
});
const failed=cases.filter(x=>!x.pass);
for(const c of cases)console.log((c.pass?'PASS':'FAIL')+' '+c.name+(c.pass?'':' -> '+c.error));
console.log('V30 P0 #221 Actual Auth + Real-Schema SQLite D1: '+(cases.length-failed.length)+'/'+cases.length+' PASS');
database.close();
if(failed.length)process.exitCode=1;
