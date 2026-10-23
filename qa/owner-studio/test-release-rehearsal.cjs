'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {webcrypto}=require('node:crypto');
const ts=require('typescript');

const transpile=file=>ts.transpileModule(fs.readFileSync(path.resolve(file),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const readiness={exports:{}};
vm.runInNewContext(transpile('worker/signin-design-readiness.ts'),{module:readiness,exports:readiness.exports});
const worker={exports:{}};
vm.runInNewContext(transpile('worker/signin-design-library.ts'),{
 module:worker,exports:worker.exports,URL,Request,Response,Date,TextEncoder,crypto:webcrypto,console,
 require(specifier){
  if(specifier==='./signin-design-readiness')return readiness.exports;
  if(specifier==='./auth')return {hasPermission:(_ctx,p,level)=>p==='settings.access'&&level==='manage'};
  throw Error('Unexpected import '+specifier);
 }
});
const route=worker.exports.routeSignInDesignLibrary;
const sql=new DatabaseSync(':memory:');
sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE employees(id TEXT PRIMARY KEY); INSERT INTO employees(id) VALUES('owner-1'),('staff-1'); CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, value_type TEXT, updated_by TEXT REFERENCES employees(id), updated_at TEXT); CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT NOT NULL REFERENCES employees(id),module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,after_json TEXT,source TEXT)");
let failNextAudit=false;
let forceConcurrentMutation=false;
let forceConcurrentReviewMutation=false;
const DB={
 prepare(query){
  let args=[];
  return {
   bind(...next){args=next;return this},
   async first(){return sql.prepare(query).get(...args)||null},
   async run(){
    if(failNextAudit&&query.includes('INSERT INTO audit_logs')){failNextAudit=false;throw Error('Injected audit failure');}
    const out=sql.prepare(query).run(...args);
    return {meta:{changes:Number(out.changes)}};
   }
  };
 },
 async batch(statements){
  sql.exec('BEGIN IMMEDIATE');
  try{
   if(forceConcurrentReviewMutation){
    forceConcurrentReviewMutation=false;
    const key='ui.signin_design_review_v1';
    const prior=sql.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?').get(key);
    if(prior){
     const changed=JSON.parse(prior.setting_value);
     changed.revision++;
     sql.prepare('UPDATE app_settings SET setting_value=? WHERE setting_key=?').run(JSON.stringify(changed),key);
    }
   }
   if(forceConcurrentMutation){
    forceConcurrentMutation=false;
    const current=sql.prepare("SELECT setting_value FROM app_settings WHERE setting_key='ui.signin_design_release_rehearsal_v1'").get();
    if(current){
     sql.prepare("UPDATE app_settings SET setting_value=? WHERE setting_key='ui.signin_design_release_rehearsal_v1'").run(JSON.stringify({...JSON.parse(current.setting_value),marker:'raced'}));
    }
   }
   const result=[];
   for(const st of statements)result.push(await st.run());
   sql.exec('COMMIT');
   return result;
  }catch(error){sql.exec('ROLLBACK');throw error}
 }
};
const env={DB};
const owner={employee:{id:'owner-1'},roles:[{code:'owner'}]};
const employee={employee:{id:'staff-1'},roles:[{code:'employee'}]};
const prefix='https://staffportal-qa.invalid/api/theme/signin/designs';
function request(suffix,method='GET',body){
 return new Request(prefix+suffix,{method,headers:body?{'content-type':'application/json'}:undefined,
  body:body?JSON.stringify(body):undefined});
}
async function call(suffix,method,body,ctx=owner){
 const response=await route(request(suffix,method,body),env,ctx);
 if(!response)throw Error('Route did not match '+suffix);
 return {status:response.status,data:await response.json()};
}
const countAudit=()=>sql.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n;
const saved=()=>Object.fromEntries(sql.prepare('SELECT setting_key,setting_value FROM app_settings').all().map(x=>[x.setting_key,x.setting_value]));
const candidate={
 name:'DAENEM Release Rehearsal Concept',blocks:[
  {id:'brand',kind:'brand',label:'DAENEM Branding',x:20,y:20,width:210,height:60,items:[]},
  {id:'heading',kind:'heading',label:'One Secure Workspace',x:20,y:100,width:330,height:65,items:[]},
  {id:'auth',kind:'auth',label:'Protected Sign-In',x:20,y:190,width:310,height:290,items:[]}
 ]
};
(async()=>{
 const badOrigin=await route(new Request(prefix+'/rehearsal',{method:'POST',headers:{
  origin:'https://untrusted.invalid','content-type':'application/json'
 },body:JSON.stringify({rehearsalRevision:0})}),env,owner);
 assert.equal(badOrigin.status,403,'Cross-origin rehearsal mutations are rejected');
 let r=await call('/rehearsal','GET',undefined,employee);
 assert.equal(r.status,403,'Non-Owner cannot read release rehearsal');
 r=await call('/rehearsal','POST',{rehearsalRevision:0,reviewRevision:0,reviewRequestId:'fake',libraryRevision:0,designIndex:0},employee);
 assert.equal(r.status,403,'Non-Owner cannot prepare');
 r=await call('/rehearsal','DELETE',{rehearsalRevision:0,rehearsalId:'fake'},employee);
 assert.equal(r.status,403,'Non-Owner cannot roll back');
 r=await call('/rehearsal','GET');
 assert.equal(r.status,200);assert.equal(r.data.entry,null);assert.equal(r.data.published,false);
 r=await call('/rehearsal','POST',{rehearsalRevision:0,reviewRevision:0,reviewRequestId:'fake',libraryRevision:0,designIndex:0});
 assert.equal(r.status,409,'Cannot prepare without reviewed saved design');

 r=await call('','POST',{revision:0,designs:[candidate]});
 assert.equal(r.status,200);assert.equal(r.data.revision,1);
 r=await call('/readiness','POST',{libraryRevision:1,designIndex:0});
 assert.equal(r.data.structuralPass,true,'Valid reviewed candidate required');
 r=await call('/review','POST',{libraryRevision:1,designIndex:0,reviewRevision:0});
 assert.equal(r.status,200);
 const review=r.data.candidate;
 const payload={rehearsalRevision:0,reviewRevision:1,reviewRequestId:review.requestId,libraryRevision:1,designIndex:0};
 const before=countAudit();
 r=await call('/rehearsal','POST',{...payload,reviewRequestId:'another-request'});
 assert.equal(r.status,409);
 r=await call('/rehearsal','POST',{...payload,reviewRevision:0});
 assert.equal(r.status,409);
 assert.equal(countAudit(),before,'Rejected requests cannot create false audit entries');
 r=await call('/rehearsal','POST',payload);
 assert.equal(r.status,200,'Owner can prepare a guarded non-public rehearsal');
 assert.equal(r.data.published,false);
 assert.equal(r.data.activationAvailable,false);
 assert.equal(r.data.currentPublicDesign,'Approved V180 Sign-In');
 assert.equal(r.data.revision,1);
 assert.equal(r.data.entry.status,'prepared-not-published');
 assert.match(r.data.entry.designFingerprint,/^[a-f0-9]{64}$/);
 const rehearsalId=r.data.entry.rehearsalId;
 assert.equal(countAudit(),before+1);
 r=await call('/rehearsal','GET');
 assert.equal(r.data.stale,false);
 assert.equal(r.data.entry.rehearsalId,rehearsalId);
 // A compromised storage row with the same revision must invalidate the fingerprint.
 const libraryKey='ui.signin_design_library_v1';
 const originalLibrary=saved()[libraryKey];
 const tampered=JSON.parse(originalLibrary);
 tampered.designs[0].blocks[0].label='Tampered DAENEM Branding';
 sql.prepare('UPDATE app_settings SET setting_value=? WHERE setting_key=?').run(JSON.stringify(tampered),libraryKey);
 r=await call('/rehearsal','GET');
 assert.equal(r.data.stale,true,'Fingerprint and reviewed source must detect unversioned tampering');
 sql.prepare('UPDATE app_settings SET setting_value=? WHERE setting_key=?').run(originalLibrary,libraryKey);
 r=await call('/rehearsal','GET');
 assert.equal(r.data.stale,false,'Restoring the reviewed source restores checkpoint integrity');
 r=await call('/rehearsal','GET',undefined,employee);
 assert.equal(r.status,403);
 r=await call('/rehearsal','POST',{...payload,rehearsalRevision:1});
 assert.equal(r.status,409,'Must roll back existing rehearsal before preparing another');
 r=await call('/rehearsal','DELETE',{rehearsalRevision:1,rehearsalId:'not-current'});
 assert.equal(r.status,409);
 assert.equal(countAudit(),before+1);

 failNextAudit=true;
 r=await call('/rehearsal','DELETE',{rehearsalRevision:1,rehearsalId});
 assert.equal(r.status,503,'Audit failure must roll back attempted rollback');
 r=await call('/rehearsal','GET');
 assert.equal(r.data.entry.rehearsalId,rehearsalId,'Rollback audit failure keeps original checkpoint');
 assert.equal(r.data.revision,1);
 assert.equal(countAudit(),before+1);

 r=await call('/rehearsal','DELETE',{rehearsalRevision:1,rehearsalId});
 assert.equal(r.status,200);assert.equal(r.data.entry,null);assert.equal(r.data.revision,2);
 assert.equal(r.data.published,false);
 assert.equal(countAudit(),before+2);
 r=await call('/rehearsal','DELETE',{rehearsalRevision:2,rehearsalId});
 assert.equal(r.status,409,'Repeated rollback with stale ID rejected');
 forceConcurrentReviewMutation=true;
 r=await call('/rehearsal','POST',{...payload,rehearsalRevision:2});
 assert.equal(r.status,409,'Concurrent review revision invalidates preparation inside the D1 write transaction');
 r=await call('/rehearsal','GET');
 assert.equal(r.data.entry,null,'Concurrent review must never leave an armed rehearsal');
 assert.equal(r.data.revision,2,'Review race must not advance the rehearsal revision');
 assert.equal(countAudit(),before+2,'Concurrent review must never create a false rehearsal audit');
 r=await call('/rehearsal','POST',{...payload,rehearsalRevision:2,reviewRevision:2});
 assert.equal(r.status,200,'A fresh valid review revision can prepare a new rehearsal');
 const secondId=r.data.entry.rehearsalId;
 assert.equal(r.data.revision,3);
 r=await call('/review','DELETE',{reviewRevision:2});
 assert.equal(r.status,200);
 r=await call('/rehearsal','GET');
 assert.equal(r.data.stale,true,'Withdrawing a review invalidates the prepared checkpoint');
 r=await call('/rehearsal','DELETE',{rehearsalRevision:3,rehearsalId:secondId});
 assert.equal(r.status,200,'A stale/withdrawn review cannot block Owner rollback');
 assert.equal(r.data.entry,null);assert.equal(r.data.revision,4);
 r=await call('/rehearsal','POST',{...payload,rehearsalRevision:4,reviewRevision:3});
 assert.equal(r.status,409,'Withdrawn review cannot prepare release rehearsal');
 const keys=Object.keys(saved());
 assert.ok(!keys.includes('ui.signin_active_design'),'Must never write public activation key');
 assert.ok(!keys.includes('ui.signin_active_design_v1'),'Must never create alternate activation key');
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='prepare_signin_design_rehearsal'").get().n,2);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='rollback_signin_design_rehearsal'").get().n,2);
 console.log('PASS: Owner-only release rehearsal, review identity/revision guards, SHA-256 fingerprint, no public activation, audited prepare and rollback, audit-error transaction rollback, stale/withdrawn protection');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sql.close());
