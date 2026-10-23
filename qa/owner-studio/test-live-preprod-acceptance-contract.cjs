'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'live-preproduction-authenticated-acceptance.cjs'),'utf8');
const routes=['/api/theme/signin/designs','/api/theme/signin/designs/review','/api/theme/signin/designs/rehearsal'];
async function scenario(options={}){
 const output=[],errors=[],requests=[];
 const processSandbox={env:options.env||{},exitCode:0};
 const fetch=async(url,init)=>{
  requests.push({url,method:init.method||'GET',redirect:init.redirect});
  assert.equal(init.method,'GET','Acceptance runner must never write');
  assert.equal(new URL(url).hostname,'daenem-staffportal-api-staging.adedapo2005.workers.dev');
  const cookie=init.headers.cookie;
  let status=401;
  let body={error:'No session'};
  if(cookie==='owner-good'||cookie==='owner-second'){
   status=options.deniedOwner?403:200;
   const revision=options.drift&&cookie==='owner-second'?9:5;
   const route=new URL(url).pathname;
   if(status===200){
    body=route===routes[0]?{revision,designs:[{name:'safe preview',blocks:[]}],canManage:true}:
      route===routes[1]?{revision:3,candidate:null,published:false,currentPublicDesign:'Approved V180 Sign-In'}:
      {revision:2,entry:null,published:false,activationAvailable:false,currentPublicDesign:'Approved V180 Sign-In'};
   }
  }else if(cookie==='staff-good'){status=403;body={error:'Owner authorization required'};}
  const text=JSON.stringify(body);
  return{status,headers:{get:k=>k==='content-type'?'application/json':k==='cache-control'?'no-store':null},text:async()=>text};
 };
 const sandbox={
  require,URL,AbortSignal,process:processSandbox,fetch,
  console:{log:s=>output.push(String(s)),error:s=>errors.push(String(s))}
 };
 await vm.runInNewContext(source,sandbox,{filename:'live-preproduction-authenticated-acceptance.cjs'});
 return{exitCode:processSandbox.exitCode,output:output.join('\n'),errors:errors.join('\n'),requests};
}
(async()=>{
 const anonymous=await scenario();
 assert.equal(anonymous.exitCode,2);
 assert.equal(anonymous.requests.length,3);
 assert.match(anonymous.output,/BLOCKED_NO_AUTHENTICATED_SESSION/);
 const ownerOnly=await scenario({env:{STAFFPORTAL_QA_OWNER_COOKIE:'owner-good'}});
 assert.equal(ownerOnly.exitCode,2);
 assert.match(ownerOnly.output,/PASS_READ_ONLY/);
 assert.match(ownerOnly.output,/BLOCKED_SECOND_SESSION_NOT_AVAILABLE/);
 const complete=await scenario({env:{
  STAFFPORTAL_QA_OWNER_COOKIE:'owner-good',
  STAFFPORTAL_QA_SECOND_OWNER_COOKIE:'owner-second',
  STAFFPORTAL_QA_NONOWNER_COOKIE:'staff-good'
 }});
 assert.equal(complete.exitCode,0);
 assert.equal(complete.requests.length,12);
 assert.match(complete.output,/PASS_FRESH_SESSION_READBACK/);
 assert.match(complete.output,/PASS_ALL_OWNER_ROUTES_FORBIDDEN/);
 assert.doesNotMatch(complete.output,/owner-good|owner-second|staff-good/,'Never print session cookies');
 const badSession=await scenario({env:{STAFFPORTAL_QA_OWNER_COOKIE:'owner-good'},deniedOwner:true});
 assert.equal(badSession.exitCode,1);
 const conflicting=await scenario({env:{
  STAFFPORTAL_QA_OWNER_COOKIE:'owner-good',
  STAFFPORTAL_QA_SECOND_OWNER_COOKIE:'owner-second',
  STAFFPORTAL_QA_NONOWNER_COOKIE:'staff-good'
 },drift:true});
 assert.equal(conflicting.exitCode,1);
 await assert.rejects(()=>scenario({env:{
  STAFFPORTAL_PREPRODUCTION_URL:'https://untrusted.invalid',
  STAFFPORTAL_QA_OWNER_COOKIE:'owner-good'
 }}),/unapproved hostname/);
 console.log('PASS: staging acceptance runner enforces read-only methods, Owner/second-Owner/non-Owner checks, refusal on missing or invalid sessions, revision drift detection, fixed HTTPS staging host, and redacted session secrets');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
