// SQLite-backed role identity + representative ERP query fixtures; no provider or production calls.
// Run on approved base with --source worker/owner-intelligence.orig.ts to reproduce unsafe behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
const file=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'worker/owner-intelligence.ts';
const compile=(file)=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const auth={hasPermission:(ctx,code,min='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const v=(companyId?ctx.companyPermissions[companyId]?.[code]:ctx.permissions[code])||'none';return levels.indexOf(v)>=levels.indexOf(min)}};
const module={exports:{}};
new Function('module','exports','require',compile(file))(module,module.exports,(id)=>{if(id==='./auth')return auth;throw Error(id)});
const {routeOwnerIntelligence}=module.exports;
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE employees(id TEXT,employment_status TEXT);
CREATE TABLE companies(id TEXT,active INTEGER);
CREATE TABLE employee_company_memberships(employee_id TEXT,company_id TEXT,active INTEGER);
CREATE TABLE roles(id TEXT,code TEXT,company_id TEXT,active INTEGER);
CREATE TABLE employee_roles(employee_id TEXT,company_id TEXT,role_id TEXT);
CREATE TABLE payroll_runs(company_id TEXT,period_end TEXT,status TEXT,gross_total_kobo INTEGER,net_total_kobo INTEGER);
INSERT INTO companies VALUES('company-printing',1),('company-bakery',1);
INSERT INTO employees VALUES('mgr', 'active'),('fake','active'),('owner','active'),('ga','active'),('stale','active');
INSERT INTO employee_company_memberships VALUES('mgr','company-printing',1),('mgr','company-bakery',1),('fake','company-printing',1),('owner','company-printing',1),('ga','company-printing',1),('stale','company-printing',1);
INSERT INTO roles VALUES('fake-owner','owner','company-printing',1),('global-owner','owner',NULL,1),('global-ga','group_admin',NULL,1),('stale-ga','group_admin',NULL,1);
INSERT INTO employee_roles VALUES('fake','company-printing','fake-owner'),('owner','company-printing','global-owner'),('ga','company-printing','global-ga'),('stale','company-printing','stale-ga');
INSERT INTO payroll_runs VALUES('company-printing','2026-10-10','approved',600000,470000),('company-bakery','2026-10-10','approved',950000,800000);`);
const sqlLog=[], prompts=[];
const env={DB:{
  prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},
    async first(){
      sqlLog.push({sql,args:this.args});
      if(sql.includes('FROM employee_roles er'))return db.prepare(sql).get(...this.args)??null;
      if(sql.includes('FROM payroll_runs'))return db.prepare(sql).get(...this.args)??null;
      if(sql.includes('FROM sales_orders'))return {orders:3,revenueKobo:111111,collectedKobo:9999};
      if(sql.includes('FROM inventory_items'))return {valueKobo:222222,lowStock:2};
      if(sql.includes('FROM employee_company_memberships m LEFT JOIN attendance_days'))return {employees:9,present:8,incomplete:1};
      if(sql.includes('FROM maintenance_work_orders'))return {open:7,urgent:3,costKobo:333333};
      if(sql.includes('FROM security_logs'))return {highRisk:4};
      if(sql.includes('FROM requirement_completions')||sql.includes('FROM form_submissions'))return {count:5};
      return {revenueKobo:111111,activeProjects:1,budgetKobo:0,spentKobo:0,overdueMilestones:0,postedJournals:0,operatingExpenseKobo:555555,outstandingReceivablesKobo:0,overdueReceivables:0};
    },
    async run(){sqlLog.push({sql,args:this.args});return {meta:{changes:1}};}
  }},
  async batch(statements){return Promise.all(statements.map(async s=>({results:[await s.first()]})));}
},AI:{async run(_model,arg){prompts.push(arg.messages[1].content);return {response:'Filtered brief'};}}};
const contexts={
 mgr:{employee:{id:'mgr'},companies:[{id:'company-printing'},{id:'company-bakery'}],roles:[],companyPermissions:{'company-printing':{'dashboard.access':'manage','payroll.access':'view','ai_guide.access':'view'},'company-bakery':{}},permissions:{'dashboard.access':'manage','payroll.access':'view','ai_guide.access':'view'}},
 fake:{employee:{id:'fake'},companies:[{id:'company-printing'}],roles:[{code:'owner',companyId:'company-printing'}],companyPermissions:{'company-printing':{'payroll.access':'view'}},permissions:{'payroll.access':'view'}},
 owner:{employee:{id:'owner'},companies:[{id:'company-printing'}],roles:[{code:'owner',companyId:'company-printing'}],companyPermissions:{'company-printing':{'ai_guide.access':'view'}},permissions:{'ai_guide.access':'view'}},
 ga:{employee:{id:'ga'},companies:[{id:'company-printing'}],roles:[{code:'group_admin',companyId:'company-printing'}],companyPermissions:{'company-printing':{}},permissions:{}},
 stale:{employee:{id:'stale'},companies:[{id:'company-printing'}],roles:[{code:'group_admin',companyId:'company-printing'}],companyPermissions:{'company-printing':{}},permissions:{}},
};
const call=async(who,path,body)=>{const req=new Request('https://example.test'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const res=await routeOwnerIntelligence(req,env,contexts[who]);return {status:res.status,body:await res.json()}};
const results=[];
async function check(name,fn){try{await fn();console.log('PASS '+name);results.push(true)}catch(e){console.log('FAIL '+name+': '+e.message);results.push(false)}}
await check('any-company dashboard manage cannot open group intelligence',async()=>assert.equal((await call('mgr','/api/owner/intelligence')).status,403));
await check('company-level owner role cannot open group intelligence',async()=>assert.equal((await call('fake','/api/owner/intelligence')).status,403));
await check('company-scoped payroll view includes only its own actual payroll',async()=>{const r=await call('mgr','/api/owner/intelligence?companyId=company-printing');assert.equal(r.status,200);assert.equal(r.body.group.payrollNetKobo,470000);assert.equal(r.body.companies.printing.payroll.netKobo,470000)});
await check('unauthorized domains omitted, not zero-filled',async()=>{const r=await call('mgr','/api/owner/intelligence?companyId=company-printing');assert.equal('inventory' in r.body.companies.printing,false);assert.equal('workforce' in r.body.companies.printing,false);assert.equal('finance' in r.body,false);assert.equal('revenueKobo' in r.body.group,false);assert.equal('highRiskSecurity' in r.body.group,false)});
await check('second-company membership never grants payroll values without payroll permission',async()=>{const r=await call('mgr','/api/owner/intelligence?companyId=company-bakery');assert.equal(r.status,403);assert.ok(!JSON.stringify(r).includes('800000'))});
await check('unknown and forbidden companyId neutral',async()=>{const a=await call('mgr','/api/owner/intelligence?companyId=company-bakery');const b=await call('mgr','/api/owner/intelligence?companyId=not-found');assert.deepEqual(a,b)});
await check('current group-level Owner receives group overview',async()=>{const r=await call('owner','/api/owner/intelligence');assert.equal(r.status,200);assert.ok(r.body.scope.companyIds.includes('company-bakery'))});
await check('active group admin gets group scope but no ungranted figures',async()=>{const r=await call('ga','/api/owner/intelligence');assert.equal(r.status,200);assert.equal('payrollNetKobo' in r.body.group,false)});
await check('withdrawn group admin blocked',async()=>{db.prepare("DELETE FROM employee_roles WHERE employee_id='stale'").run();assert.equal((await call('stale','/api/owner/intelligence')).status,403)});
await check('AI brief includes only authorized filtered payroll data',async()=>{const before=prompts.length;const r=await call('mgr','/api/owner/ai',{companyId:'company-printing',question:'Payroll today'});assert.equal(r.status,200);assert.equal(prompts.length,before+1);const p=prompts.at(-1);assert.ok(p.includes('470000'));assert.ok(!p.includes('800000'));assert.ok(!p.includes('222222'))});
await check('AI brief rejects out-of-scope company without calling provider',async()=>{const before=prompts.length;assert.equal((await call('mgr','/api/owner/ai',{companyId:'company-bakery'})).status,403);assert.equal(prompts.length,before)});
console.log('Owner Intelligence company scope: '+results.filter(Boolean).length+'/'+results.length+' PASS');
if(results.some(x=>!x))process.exitCode=1;