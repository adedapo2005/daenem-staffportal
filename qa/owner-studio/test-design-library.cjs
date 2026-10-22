const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const filename=path.resolve('worker/signin-design-library.ts');
const transformed=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const memory={value:null,audit:[],owner:'owner-123'};
const db={prepare(sql){
 let args=[];
 const st={bind(...values){args=values;return st;},
 async first(){return memory.value===null?null:{setting_value:memory.value};},
 async run(){
  if(sql.includes('INSERT INTO audit_logs')){memory.audit.push(args);return {meta:{changes:1}};}
  if(sql.includes('UPDATE app_settings')){
    if(memory.value!==args[3])return {meta:{changes:0}};
    memory.value=args[0];return {meta:{changes:1}};
  }
  if(sql.includes('INSERT INTO app_settings')){
    if(memory.value!==null)return {meta:{changes:0}};
    memory.value=args[1];return {meta:{changes:1}};
  }
  throw Error('Unexpected SQL '+sql);
 }};
 return st;
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
 assert.ok(!transformed.includes('publish_signin_design'),'no publisher exposed');
 console.log('PASS: Owner-only design library, audited save, validation, conflict protection, readback, no publisher');
})().catch(error=>{console.error(error);process.exitCode=1});
