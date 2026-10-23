'use strict';
const base=(process.env.DAENEM_STAFFPORTAL_PREPRODUCTION_URL||'https://daenem-staffportal-api-staging.adedapo2005.workers.dev/').replace(/\/$/,'');
const paths=['/api/theme/signin/designs','/api/theme/signin/designs/review'];
(async()=>{
 let unprotected=0;
 for(const path of paths){
  const response=await fetch(base+path,{method:'GET',redirect:'manual',credentials:'omit',headers:{accept:'application/json','cache-control':'no-store'}});
  const type=response.headers.get('content-type')||'';
  const text=await response.text();
  const json=type.includes('json');
  const expose=response.status>=200&&response.status<300&&json&&/\b(designs|candidate|revision)\b/.test(text);
  if(expose)unprotected++;
  console.log(JSON.stringify({route:path,status:response.status,contentType:type,protected:response.status===401||response.status===403,exposedOwnerJSON:expose}));
 }
 if(unprotected)throw Error('Owner-only API returned protected JSON to unauthenticated client.');
})().catch(error=>{console.error(error.message);process.exitCode=1});
