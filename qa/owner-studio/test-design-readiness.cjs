const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(path.resolve(file),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const readiness={exports:{}};
vm.runInNewContext(compile('worker/signin-design-readiness.ts'),{module:readiness,exports:readiness.exports});
const settings=new Map();
const audits=[];
const db={
 prepare(sql){
  let args=[];
  const statement={
   bind(...v){args=v;return statement;},
   async first(){const value=settings.get(args[0]);return value===undefined?null:{setting_value:value};},
   async run(){
    if(sql.startsWith('UPDATE app_settings')){
     if(settings.get(args[2])!==args[3])return {meta:{changes:0}};
     settings.set(args[2],args[0]);return {meta:{changes:1}};
    }
    if(sql.startsWith('INSERT INTO app_settings')){
     if(settings.has(args[0]))return {meta:{changes:0}};
     settings.set(args[0],args[1]);return {meta:{changes:1}};
    }
    if(sql.includes('INSERT INTO audit_logs')){
     if(sql.includes('SELECT') && settings.get(args[5])!==args[6])return {meta:{changes:0}};
     audits.push(args);return {meta:{changes:1}};
    }
    throw Error('Unexpected SQL '+sql);
   }
  };
  return statement;
 },
 async batch(statements){
  const priorSettings=new Map(settings),priorAudits=audits.slice();
  try{
   const results=[];
   for(const statement of statements)results.push(await statement.run());
   if(results[1]?.meta?.changes!==1){
    settings.clear();for(const [k,v] of priorSettings)settings.set(k,v);
    audits.splice(0,audits.length,...priorAudits);
   }
   return results;
  }catch(e){settings.clear();for(const [k,v] of priorSettings)settings.set(k,v);
   audits.splice(0,audits.length,...priorAudits);throw e;}
 }
};
const worker={exports:{}};
vm.runInNewContext(compile('worker/signin-design-library.ts'),{
 module:worker,exports:worker.exports,require(specifier){
  if(specifier==='./signin-design-readiness')return readiness.exports;
  if(specifier==='./auth')return {hasPermission:(_ctx,p,a)=>p==='settings.access'&&a==='manage'};
  throw Error('Unexpected import '+specifier);
 },URL,Request,Response,Date,crypto:require('node:crypto').webcrypto,console
});
const route=worker.exports.routeSignInDesignLibrary;
const owner={employee:{id:'owner-1'},roles:[{code:'owner'}]};
const staff={employee:{id:'staff-1'},roles:[{code:'employee'}]};
const root='https://staff-qa.example/api/theme/signin/designs';
const req=(suffix,method,body)=>new Request(root+suffix,{method,
 headers:body?{'content-type':'application/json'}:undefined,
 body:body?JSON.stringify(body):undefined});
const base={
 name:'DAENEM Alternative Sign-In',blocks:[
  {id:'brand',kind:'brand',label:'DAENEM Branding',x:20,y:20,width:210,height:60,items:[]},
  {id:'heading',kind:'heading',label:'One Secure Workspace',x:20,y:100,width:330,height:65,items:[]},
  {id:'auth',kind:'auth',label:'Protected Sign-In',x:20,y:180,width:310,height:290,items:[]},
 ]
};
(async()=>{
 let r=await route(req('/readiness','POST',{libraryRevision:0,designIndex:0}),db.env||{DB:db},staff);
 assert.equal(r.status,403,'Only Owner allowed to check readiness');
 r=await route(req('','POST',{revision:0,designs:[{name:'Empty',blocks:[]}]}),{DB:db},owner);
 assert.equal(r.status,200);
 r=await route(req('/readiness','POST',{libraryRevision:1,designIndex:0}),{DB:db},owner);
 assert.equal(r.status,200);
 let payload=await r.json();
 assert.equal(payload.structuralPass,false,'Empty canvas is not reviewable');
 assert.ok(payload.blockers.some(s=>s.includes('Protected authentication')),'Missing auth identified');
 assert.equal(payload.readyToPublish,false);
 r=await route(req('/review','POST',{libraryRevision:1,designIndex:0,reviewRevision:0}),{DB:db},owner);
 assert.equal(r.status,422,'Release review rejects incomplete design');
 assert.ok(!settings.has('ui.signin_design_review_v1'),'Failed review creates no candidate');
 r=await route(req('','POST',{revision:1,designs:[base]}),{DB:db},owner);
 assert.equal(r.status,200);
 r=await route(req('/readiness','POST',{libraryRevision:1,designIndex:0}),{DB:db},owner);
 assert.equal(r.status,409,'Old library revision rejected');
 r=await route(req('/readiness','POST',{libraryRevision:2,designIndex:0}),{DB:db},owner);
 assert.equal(r.status,200);
 payload=await r.json();
 assert.equal(payload.structuralPass,true,'Valid structure passes preflight');
 assert.equal(payload.readyToPublish,false,'Preflight never publishes');
 assert.ok(payload.pendingAcceptance.some(s=>s.includes('authentication') || s.includes('Sign-In')),'Real auth acceptance outstanding');
 r=await route(req('/review','GET'),{DB:db},owner);
 assert.equal(r.status,200);assert.equal((await r.json()).revision,0);
 r=await route(req('/review','POST',{libraryRevision:2,designIndex:0,reviewRevision:0}),{DB:db},owner);
 assert.equal(r.status,200,'Owner can request pending review');
 payload=await r.json();
 assert.equal(payload.published,false);
 assert.equal(payload.candidate.status,'awaiting-authenticated-acceptance');
 assert.equal(audits.filter(a=>a.includes('request_signin_design_review')).length,1);
 r=await route(req('/review','POST',{libraryRevision:2,designIndex:0,reviewRevision:0}),{DB:db},owner);
 assert.equal(r.status,409,'Concurrent review requests rejected');
 r=await route(req('/review','GET'),{DB:db},staff);assert.equal(r.status,403);
 r=await route(req('','POST',{revision:2,designs:[base,{...base,name:'Second'}]}),{DB:db},owner);
 assert.equal(r.status,200);
 r=await route(req('/review','GET'),{DB:db},owner);
 assert.equal((await r.json()).stale,true,'Review flags changed source designs');
 r=await route(req('/review','DELETE',{reviewRevision:1}),{DB:db},owner);
 assert.equal(r.status,200,'Owner can withdraw pending review');
 payload=await r.json();
 assert.equal(payload.candidate,null);assert.equal(payload.published,false);
 assert.ok(!settings.has('ui.signin_active_design'),'No live activation key set');
 console.log('PASS: Sign-In preflight, essential auth, viewport checks, owner-only review, conflict, audit, withdraw, no activation');
})().catch(error=>{console.error(error);process.exitCode=1});
