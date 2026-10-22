const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const filename=path.resolve('worker/signin-design-library.ts');
const transformed=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const memory={value:null,audit:[],owner:'owner-123',lastChanges:0,failAudit:false,conflictUpdate:false};
const db={prepare(sql){
 let args=[];
 const st={bind(...values){args=values;return st;},
 async first(){return memory.value===null?null:{setting_value:memory.value};},
 async run(){
  if(sql.includes('INSERT INTO audit_logs')){
   if(memory.failAudit)throw Error('Injected audit failure');
   if(memory.lastChanges!==1||memory.value!==args[5])return {meta:{changes:0}};
   memory.audit.push(args);memory.lastChanges=1;return {meta:{changes:1}};
  }
  if(sql.includes('UPDATE app_settings')){
    if(memory.conflictUpdate||memory.value!==args[3]){memory.lastChanges=0;return {meta:{changes:0}};}
    memory.value=args[0];memory.lastChanges=1;return {meta:{changes:1}};
  }
  if(sql.includes('INSERT INTO app_settings')){
    if(memory.value!==null){memory.lastChanges=0;return {meta:{changes:0}};}
    memory.value=args[1];memory.lastChanges=1;return {meta:{changes:1}};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 return st;
},async batch(statements){
 const original={value:memory.value,audit:memory.audit.slice(),lastChanges:memory.lastChanges};
 try{
  const results=[];
  for(const statement of statements)results.push(await statement.run());
  return results;
 }catch(error){
  memory.value=original.value;memory.audit.splice(0,memory.audit.length,...original.audit);
  memory.lastChanges=original.lastChanges;throw error;
 }
}};
const readiness={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve('worker/signin-design-readiness.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:readiness.exports,module:readiness});
const mod={exports:{}};
vm.runInNewContext(transformed,{exports:mod.exports,module:mod,require(name){
 if(name==='./auth')return {hasPermission:(_ctx,module,action)=>module==='settings.access'&&action==='manage'};
 if(name==='./signin-design-readiness')return readiness.exports;
 throw Error('Unexpected dependency '+name);
},Response,Request,URL,crypto:require('node:crypto').webcrypto,console});
const route=mod.exports.routeSignInDesignLibrary;
const owner={employee:{id:memory.owner},roles:[{code:'owner'}]};
const employee={employee:{id:'employee-123'},roles:[{code:'employee'}]};
const env={DB:db};
const url='https://test.daenem.local/api/theme/signin/designs';
const req=(method,body)=>new Request(url,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
const draft={name:'Preview Design',blocks:[{id:'weather-one',kind:'weather',label:'Weather',x:10,y:12,width:250,height:145,items:[{id:'temperature',label:'Temperature',x:15,y:22}]}]};
(async()=>{
 let r=await route(req('GET'),env,employee);assert.equal(r.status,403,'non-owner read blocked');
 r=await route(req('POST',{revision:0,designs:[draft]}),env,employee);assert.equal(r.status,403,'non-owner write blocked');
 r=await route(req('GET'),env,owner);assert.equal(r.status,200);assert.equal((await r.json()).revision,0);
 r=await route(req('POST',{revision:0,designs:[draft]}),env,owner);assert.equal(r.status,200,'owner write');
 assert.equal((await r.json()).revision,1);assert.equal(memory.audit.length,1,'successful save audited');
 r=await route(req('POST',{revision:0,designs:[]}),env,owner);assert.equal(r.status,409,'stale revisions rejected');
 r=await route(req('POST',{revision:1,designs:[{name:'Unsafe',blocks:[{...draft.blocks[0],kind:'script'}]}]}),env,owner);
 assert.equal(r.status,400,'unsupported elements rejected');
 r=await route(req('GET'),env,owner);assert.equal((await r.json()).designs[0].blocks[0].items[0].label,'Temperature');
 assert.equal(memory.audit.length,1,'rejected changes not audited as successful');
 memory.failAudit=true;
 r=await route(req('POST',{revision:1,designs:[{...draft,name:'Cannot Persist Unlogged'}]}),env,owner);
 assert.equal(r.status,503,'audit failure fails save atomically');
 assert.equal(JSON.parse(memory.value).revision,1,'failed audit rolls back saved revision');
 assert.equal(memory.audit.length,1,'audit failure creates no partial record');
 memory.failAudit=false;
 memory.conflictUpdate=true;
 r=await route(req('POST',{revision:1,designs:[{...draft,name:'Concurrent Candidate'}]}),env,owner);
 assert.equal(r.status,409,'concurrent write CAS conflict');
 assert.equal(memory.audit.length,1,'conflicted write creates no false audit');
 assert.equal(JSON.parse(memory.value).revision,1,'conflicted write leaves library intact');
 memory.conflictUpdate=false;
 r=await route(req('POST',{revision:1,designs:[{...draft,name:'Audited Recovered Save'}]}),env,owner);
 assert.equal(r.status,200,'saving works after transaction failure');
 assert.equal((await r.json()).revision,2);
 assert.equal(memory.audit.length,2,'second save adds exactly one audit');
 assert.ok(!transformed.includes('publish_signin_design'),'no publisher exposed');
 console.log('PASS: Owner-only design library, audited save, validation, conflict protection, readback, no publisher');
})().catch(error=>{console.error(error);process.exitCode=1});
