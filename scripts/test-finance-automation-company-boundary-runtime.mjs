// Non-production isolated route regression. Does not call Cloudflare, banks, or a real D1 database.
// Models worker/auth.ts hasPermission exactly: explicit companyId uses companyPermissions; otherwise aggregate permissions.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'worker','finance-automation.ts'),'utf8');
const sourceSha256=createHash('sha256').update(source).digest('hex');
const localRef=path.join(root,'.git','refs','heads','automation','staffportal-autonomous-worker-01');
const revision=fs.existsSync(localRef)?fs.readFileSync(localRef,'utf8').trim():null;
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const levels=['none','view','create','edit','approve','manage'];
const hasPermission=(context,code,minimum='view',companyId)=>{
 const granted=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');
 return levels.indexOf(granted)>=levels.indexOf(minimum);
};
let reconciliations=0,auditWrites=0;
const module={exports:{}};
const mockDb={prepare(sql){
 return {bind(...args){
  return {
   async first(){
    if(sql.includes('FROM companies'))return {id:args[0],name:'Synthetic '+args[0]};
    return {count:0,amountKobo:0,costKobo:0};
   },
   async all(){return {results:[{id:'synthetic-posting',customerName:'Synthetic Example'}]}},
   async run(){auditWrites++;return {success:true,meta:{changes:1}}}
  };
 }};
}};
const safeRequire=(specifier)=>{
 if(specifier==='./auth')return {hasPermission};
 if(specifier==='./finance-sales-autopost')return {reconcileFulfilledSalesOrders:async (_env,_limit,companyId)=>{
  reconciliations++;return {companyId,scanned:1,posted:0,skipped:1,failed:0,errors:[]};
 }};
 throw new Error('Unexpected import: '+specifier);
};
vm.runInNewContext(compiled,{exports:module.exports,module,require:safeRequire,Request,Response,URL,crypto:globalThis.crypto,console},{filename:'worker/finance-automation.ts',timeout:2000});
const route=module.exports.routeFinanceAutomation;
if(typeof route!=='function')throw new Error('Route did not transpile');
const employee={id:'employee-test',status:'active'};
const staff={employee,roles:[{code:'staff'}],companies:[{id:'A'},{id:'B'}],permissions:{'finance.ledger':'view','finance.journal':'create'},companyPermissions:{A:{'finance.ledger':'view','finance.journal':'create'},B:{}}};
const owner={employee,roles:[{code:'owner'}],companies:[{id:'A'},{id:'B'}],permissions:{},companyPermissions:{A:{},B:{}}};
const admin={employee,roles:[{code:'group_admin'}],companies:[{id:'A'},{id:'B'}],permissions:{},companyPermissions:{A:{},B:{}}};
const env={DB:mockDb};
const cases=[];
async function check(label,context,company,method,expectedStatus,expectedNewRuns){
 const before=reconciliations;
 const url='http://localhost/api/finance/automation/'+(method==='GET'?'status?companyId='+company:'reconcile');
 const request=new Request(url,{method,...(method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify({companyId:company})}:{})});
 const result=await route(request,env,context);
 const body=await result.json();
 const delta=reconciliations-before;
 const ok=result.status===expectedStatus&&delta===expectedNewRuns;
 cases.push({label,expectedStatus,actualStatus:result.status,expectedReconciliations:expectedNewRuns,actualReconciliations:delta,pass:ok,syntheticResponseKeys:Object.keys(body)});
}
await check('A-scoped authorized staff status',staff,'A','GET',200,0);
await check('A-scoped authorized staff reconcile',staff,'A','POST',200,1);
await check('B membership without B finance: direct GET denied',staff,'B','GET',403,0);
await check('B membership without B finance: direct POST denied',staff,'B','POST',403,0);
await check('Global-admin role without B finance: direct GET denied',admin,'B','GET',403,0);
await check('Global-admin role without B finance: direct POST denied',admin,'B','POST',403,0);
await check('Owner authorized group-wide status',owner,'B','GET',200,0);
await check('Owner authorized group-wide reconciliation',owner,'B','POST',200,1);
const scopedAdminB={...admin,companyPermissions:{A:{},B:{'finance.ledger':'view','finance.journal':'create'}}};
await check('Explicit B-scoped Admin status allowed',scopedAdminB,'B','GET',200,0);
await check('Explicit B-scoped Admin reconcile allowed',scopedAdminB,'B','POST',200,1);
const scopedViewerB={...staff,companyPermissions:{...staff.companyPermissions,B:{'finance.ledger':'view'}}};
await check('B-scoped viewer status allowed',scopedViewerB,'B','GET',200,0);
await check('B-scoped viewer cannot reconcile with A journal privilege',scopedViewerB,'B','POST',403,0);
const nonmember={...staff,companies:[{id:'A'}]};
await check('Non-member direct GET denied',nonmember,'B','GET',403,0);
await check('Non-member direct POST denied',nonmember,'B','POST',403,0);
const failures=cases.filter(item=>!item.pass);
const report={generatedAt:new Date().toISOString(),scope:'StaffPortal isolated route, mock DB and faithful auth permission semantics',sourceRevision:revision,sourceSha256,total:cases.length,passed:cases.length-failures.length,failed:failures.length,findings:failures.map(c=>c.label),reconciliations,auditWrites,productionMutated:false,backendMutated:false,liveProviderSend:false,cases};
const destination=path.join(root,'qa-artifacts','finance-posting-company-qa','worker-route-isolated-negative.json');
fs.mkdirSync(path.dirname(destination),{recursive:true});
fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:failures.length?'SECURITY_BOUNDARY_FAILURE':'PASS',passed:report.passed,total:report.total,failures:report.findings,evidence:destination},null,2));
if(failures.length)process.exitCode=1;
