'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const transpile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const readiness={exports:{}};
vm.runInNewContext(transpile('worker/signin-design-readiness.ts'),{module:readiness,exports:readiness.exports});
const worker={exports:{}};
vm.runInNewContext(transpile('worker/signin-design-library.ts'),{
 module:worker,exports:worker.exports,URL,Request,Response,Date,TextEncoder,crypto:require('node:crypto').webcrypto,
 require(name){
  if(name==='./signin-design-readiness')return readiness.exports;
  if(name==='./auth')return {hasPermission:()=>true};
  throw Error('Unexpected import '+name);
 }
});
const handler=worker.exports.routeSignInDesignLibrary;
let queried=0;
const env={DB:{prepare(){queried++;throw Error('Cross-origin request reached D1!')}}};
const owner={roles:[{code:'owner'}],employee:{id:'owner-1'}};
const base='https://staffportal-qa.invalid';
async function probe(path,method,headers){
 const before=queried;
 const request=new Request(base+path,{
  method,headers:{'content-type':'application/json',...headers},
  body:JSON.stringify({revision:0,designs:[],reviewRevision:0,rehearsalRevision:0})
 });
 const response=await handler(request,env,owner);
 assert.ok(response,'Route missing: '+path);
 assert.equal(response.status,403,'Cross-origin '+method+' was not blocked at '+path);
 assert.equal(queried,before,'Cross-origin '+method+' accessed the D1 database at '+path);
}
(async()=>{
 const mutating=[
  ['/api/theme/signin/designs','POST'],
  ['/api/theme/signin/designs/readiness','POST'],
  ['/api/theme/signin/designs/review','POST'],
  ['/api/theme/signin/designs/review','DELETE'],
  ['/api/theme/signin/designs/rehearsal','POST'],
  ['/api/theme/signin/designs/rehearsal','DELETE'],
 ];
 for(const [path,method] of mutating){
  await probe(path,method,{origin:'https://evil.invalid'});
  await probe(path,method,{'sec-fetch-site':'cross-site'});
  await probe(path,method,{origin:base,'sec-fetch-site':'same-site'});
 }
 // Legitimate same-origin Owner requests must still reach the normal D1 route.
 await assert.rejects(
  handler(new Request(base+'/api/theme/signin/designs',{
   method:'POST',headers:{origin:base,'sec-fetch-site':'same-origin',
    'content-type':'application/json'},
   body:JSON.stringify({revision:0,designs:[]})
  }),env,owner),/Cross-origin request reached D1/
 );
 const nonOwner={roles:[{code:'staff'}],employee:{id:'employee-1'}};
 const denied=await handler(new Request(base+'/api/theme/signin/designs',{
  method:'POST',headers:{origin:base,'content-type':'application/json'},
  body:JSON.stringify({revision:0,designs:[]})
 }),env,nonOwner);
 assert.equal(denied.status,403,'Non-Owners must be rejected before D1');
 console.log('PASS: '+mutating.length*3+' cross-origin mutations blocked before D1; same-origin Owner and non-Owner boundaries preserved');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
