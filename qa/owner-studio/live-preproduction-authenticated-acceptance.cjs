'use strict';
/**
 * Read-only authenticated Cloudflare acceptance. Never prints session secrets.
 *
 * Run without session credentials for anonymous boundary checks.
 * Optional securely provisioned process environment:
 *   STAFFPORTAL_QA_OWNER_COOKIE / STAFFPORTAL_QA_OWNER_BEARER
 *   STAFFPORTAL_QA_SECOND_OWNER_COOKIE / STAFFPORTAL_QA_SECOND_OWNER_BEARER
 *   STAFFPORTAL_QA_NONOWNER_COOKIE / STAFFPORTAL_QA_NONOWNER_BEARER
 *
 * Does NOT create, edit or delete any app_settings or audit_logs records.
 * It is not an authenticated D1 write/audit acceptance replacement.
 */
const assert=require('node:assert/strict');
const host='daenem-staffportal-api-staging.adedapo2005.workers.dev';
const base='https://'+host;
const paths=[
 '/api/theme/signin/designs',
 '/api/theme/signin/designs/review',
 '/api/theme/signin/designs/rehearsal',
];
const selected=new URL(process.env.STAFFPORTAL_PREPRODUCTION_URL||base);
assert.equal(selected.hostname,host,'Never send session data to an unapproved hostname.');
assert.equal(selected.protocol,'https:','HTTPS required for authenticated staging verification.');
assert.equal(selected.username,'');
assert.equal(selected.password,'');
assert.equal(selected.port,'');
const summary={environment:'Cloudflare Pre-Production',stagingHostname:host,
 mode:'read-only',publicDesign:'Approved V180 Sign-In',anonymous:{},owner:null,
 secondOwner:null,nonOwner:null,writeAcceptance:'NOT_RUN',auditReadback:'NOT_RUN'};
function headersFor(key){
 const cookie=process.env['STAFFPORTAL_QA_'+key+'_COOKIE'];
 const bearer=process.env['STAFFPORTAL_QA_'+key+'_BEARER'];
 if(!cookie&&!bearer)return null;
 const headers={'accept':'application/json','cache-control':'no-store'};
 if(cookie)headers.cookie=cookie;
 if(bearer)headers.authorization='Bearer '+bearer;
 return headers;
}
async function get(path,headers){
 const response=await fetch(base+path,{method:'GET',headers:{
  'accept':'application/json','cache-control':'no-store',...(headers||{})
 },redirect:'manual',signal:AbortSignal.timeout(25000)});
 const bodyText=await response.text();
 let data=null;
 try{data=JSON.parse(bodyText)}catch{}
 return {status:response.status,type:response.headers.get('content-type')||'',data,
  noStore:(response.headers.get('cache-control')||'').includes('no-store')};
}
async function all(headers){
 const values={};
 for(const path of paths)values[path]=await get(path,headers);
 return values;
}
function validateOwner(records){
 const lib=records[paths[0]],review=records[paths[1]],rehearsal=records[paths[2]];
 for(const record of [lib,review,rehearsal])
  assert.equal(record.status,200,'Authenticated Owner API must return JSON HTTP 200.');
 assert.ok(lib.type.includes('application/json'));
 assert.ok(Number.isInteger(lib.data?.revision) && Array.isArray(lib.data?.designs));
 assert.equal(lib.data?.canManage,true);
 assert.equal(review.data?.published,false,'Review may never change public V180.');
 assert.ok(Number.isInteger(review.data?.revision));
 assert.equal(rehearsal.data?.published,false,'Rehearsal must be strictly non-public.');
 assert.equal(rehearsal.data?.activationAvailable,false,'Activation remains gated.');
 assert.ok(Number.isInteger(rehearsal.data?.revision));
 assert.equal(rehearsal.data?.currentPublicDesign,'Approved V180 Sign-In');
 for(const record of [lib,review,rehearsal])assert.equal(record.noStore,true);
 return {result:'PASS_READ_ONLY',revisions:{
  library:lib.data.revision,review:review.data.revision,rehearsal:rehearsal.data.revision
 },designCount:lib.data.designs.length,hasPendingReview:Boolean(review.data.candidate),
  hasCheckpoint:Boolean(rehearsal.data.entry)};
}
(async()=>{
 const anonymous=await all(null);
 for(const [path,result] of Object.entries(anonymous)){
  assert.ok([401,403].includes(result.status),'Anonymous Owner route exposed: '+path+' HTTP '+result.status);
  assert.ok(!Array.isArray(result.data?.designs),'Anonymous response exposed Owner designs.');
  assert.ok(!result.data?.entry,'Anonymous response exposed Owner rehearsal.');
  summary.anonymous[path]=result.status;
 }
 const ownerHeaders=headersFor('OWNER');
 if(!ownerHeaders){
  summary.owner={result:'BLOCKED_NO_AUTHENTICATED_SESSION'};
  summary.secondOwner={result:'NOT_RUN'};
  summary.nonOwner={result:'NOT_RUN'};
  console.log(JSON.stringify(summary,null,2));
  process.exitCode=2;
  return;
 }
 const owner=validateOwner(await all(ownerHeaders));
 summary.owner=owner;
 const secondHeaders=headersFor('SECOND_OWNER');
 if(secondHeaders){
  const second=validateOwner(await all(secondHeaders));
  assert.deepEqual(second.revisions,owner.revisions,
   'Separate Owner sessions saw different revisions; investigate concurrency or D1 consistency.');
  summary.secondOwner={result:'PASS_FRESH_SESSION_READBACK'};
 }else summary.secondOwner={result:'BLOCKED_SECOND_SESSION_NOT_AVAILABLE'};
 const nonOwnerHeaders=headersFor('NONOWNER');
 if(nonOwnerHeaders){
  const nonOwner=await all(nonOwnerHeaders);
  for(const response of Object.values(nonOwner))
   assert.equal(response.status,403,'Authenticated non-Owner must be forbidden, not just unauthenticated.');
  summary.nonOwner={result:'PASS_ALL_OWNER_ROUTES_FORBIDDEN'};
 }else summary.nonOwner={result:'BLOCKED_NONOWNER_SESSION_NOT_AVAILABLE'};
 console.log(JSON.stringify(summary,null,2));
 if(!secondHeaders||!nonOwnerHeaders)process.exitCode=2;
})().catch(error=>{
 console.error('Pre-Production acceptance FAILED: '+String(error.message||error).slice(0,240));
 process.exitCode=1;
});
