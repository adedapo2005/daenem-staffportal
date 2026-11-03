import fs from 'node:fs';
import path from 'node:path';
import {
 LEGACY_ORIGIN, OFFICIAL_ORIGIN,
 evaluatePublication, evaluateDirectMedia, rangeGetStatusOnly,
} from './lib/staffportal-sites-zero-disclosure.mjs';

// This tool is intentionally invoked manually, and is always READ ONLY.
// The Owner-only media input is a local JSON file with { "urls": [ ... ] }.
// Never commit that file or print raw URLs, keys, private images, headers, or
// response bodies in GitHub Actions logs / issue comments.
const args=process.argv.slice(2);
let mediaManifest=null, reportPath=null, apiOnly=false, expected=50;
for(let i=0;i<args.length;i++){
 const arg=args[i];
 if(arg==='--api-only') apiOnly=true;
 else if(arg==='--media-manifest') mediaManifest=args[++i] || null;
 else if(arg==='--report') reportPath=args[++i] || null;
 else if(arg==='--expected-public') expected=Number(args[++i]);
 else throw new Error('Unsupported or incomplete gate argument');
}
if(apiOnly && mediaManifest) throw new Error('Use either --api-only or a private media manifest');
if(!Number.isSafeInteger(expected)||expected<1||expected>500) throw new Error('Invalid expected public count');

async function readPublicJSON(origin) {
 const url=origin+'/api/assets';
 const response=await fetch(url,{
  method:'GET',redirect:'manual',
  headers:{accept:'application/json','cache-control':'no-cache'},
  signal:AbortSignal.timeout(22000),
 });
 if(response.status!==200)throw new Error('PUBLIC_ENDPOINT_NOT_HTTP_200');
 if(!/application\/json/i.test(response.headers.get('content-type')||''))
  throw new Error('PUBLIC_ENDPOINT_NOT_JSON');
 const len=response.headers.get('content-length');
 if(len && Number(len)>1_000_000)throw new Error('PUBLIC_ENDPOINT_TOO_LARGE');
 const body=await response.text();
 if(body.length>1_000_000)throw new Error('PUBLIC_ENDPOINT_TOO_LARGE');
 try { return JSON.parse(body); } catch { throw new Error('PUBLIC_ENDPOINT_INVALID_JSON'); }
}
function safeErrorMessage(error) {
 // Never reproduce untrusted URL, network or provider error body.
 if(error?.message && /^PUBLIC_ENDPOINT_[A-Z0-9_]+$/.test(error.message))return error.message;
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'PUBLIC_ENDPOINT_TIMEOUT';
 return 'PUBLIC_ENDPOINT_FETCH_ERROR';
}
const started=new Date().toISOString();
const receipt={
 generatedAt:started,project:'DAENEM StaffPortal',
 scope:'Read-only Sites public API and optional Owner-only historical direct-media HEAD release gate',
 originalUrlsOrPrivateRecordsIncluded:false,
 productionMutation:false,filesUploaded:0,filesDeleted:0,
 expectedPublicCount:expected,api:null,media:null,decision:null,
};
let exitCode=0;
let approvedPublicURLs=null;
try{
 const [legacy,worker]=await Promise.all([
  readPublicJSON(LEGACY_ORIGIN),readPublicJSON(OFFICIAL_ORIGIN),
 ]);
 receipt.api=evaluatePublication(legacy,worker,{expected});
 // Refuse to audit an Owner-private manifest until the approved public
 // inventory is independently available to protect approved image sources.
 if(Array.isArray(worker.assets) && worker.assets.length===expected) {
  approvedPublicURLs=worker.assets.flatMap(item=>[
    item.image_url,item.default_image_url,
  ]).filter(value=>typeof value==='string' && value.length>0);
 }
}catch(error){
 receipt.api={
  status:'UNVERIFIED',reason:safeErrorMessage(error),violations:[{code:'UNVERIFIED_PUBLIC_FEED',count:1}],
 };
 exitCode=2;
}
if(apiOnly){
 receipt.media={status:'NOT_RUN',reason:'API_ONLY_MODE',checked:0,rawURLsRecorded:false};
 receipt.decision=receipt.api.status==='PASS'?'API_ONLY_PASS_MEDIA_UNVERIFIED':'FAIL_OR_UNVERIFIED';
 // Even if the API passes, an API-only run is NOT release-success evidence.
 // Exit 2 prevents accidental approval by a CI/release script checking only $?
 exitCode=receipt.api.status==='FAIL'?1:2;
}else if(!mediaManifest){
 receipt.media={status:'NOT_RUN',reason:'OWNER_PRIVATE_MEDIA_MANIFEST_REQUIRED',
  checked:0,rawURLsRecorded:false};
 receipt.decision='INCOMPLETE_RELEASE_GATE';
 exitCode=2;
}else{
 try{
  const input=JSON.parse(fs.readFileSync(mediaManifest,'utf8'));
  if(!Array.isArray(input.urls)||input.urls.length!==24)
   throw new TypeError('Unexpected confidential historical direct media inventory count');
  if(!approvedPublicURLs?.length)throw new Error('Approved public image list not verified');
  receipt.media=await evaluateDirectMedia(input.urls,{
   concurrency:4,
   approvedURLs:approvedPublicURLs,
   head:async url=>{
    const response=await fetch(url,{
     method:'HEAD',redirect:'manual',
     headers:{accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.1',
      'cache-control':'no-cache'},
     signal:AbortSignal.timeout(13000),
    });
    return response.status;
   },
   // Only reached if HEAD was already denied. A HEAD 404 can mask a GET 200.
   // Inspect the status of a one-byte-range GET; abort/cancel without storing
   // its response body. A response that ignores Range still fails on HTTP 2xx.
   get:async url=>rangeGetStatusOnly(url),
   getFull:async url=>rangeGetStatusOnly(url,{plain:true}),
  });
 }catch{
  receipt.media={status:'UNVERIFIED',reason:'PRIVATE_MEDIA_PROBE_UNVERIFIED',
    checked:0,rawURLsRecorded:false};
 }
 receipt.decision=receipt.api.status==='PASS'&&receipt.media.status==='PASS'?
  'PASS_FULL_HISTORICAL_RELEASE_GATE':'FAIL_OR_UNVERIFIED';
 if(receipt.api.status!=='PASS'||receipt.media.status!=='PASS')
  exitCode=receipt.api.status==='UNVERIFIED'||receipt.media.status==='UNVERIFIED'?2:1;
}
receipt.issuesRemainOpen=receipt.decision!=='PASS_FULL_HISTORICAL_RELEASE_GATE';
// A full historical pass cannot certify new unlisted URLs, CDN caches, permissions,
// responsive Sign-In or authenticated Owner Studio. Those remain separate gates.
receipt.remainingAcceptanceEvenOnPass=[
 'current Sites source release and Owner authorization checks',
 'newly introduced URL aliases/CDN cache and authenticated Owner Studio',
 'approved Sign-In responsive and no-regression browser QA',
 'Cloudflare private R2 production-safe integration and release approval',
];
if(reportPath){
 const directory=path.dirname(path.resolve(reportPath));
 if(!fs.existsSync(directory))throw new Error('Report directory must already exist');
 fs.writeFileSync(reportPath,JSON.stringify(receipt,null,2),{flag:'w'});
}
console.log(JSON.stringify(receipt,null,2));
process.exitCode=exitCode;