import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LEGACY_ORIGIN, OFFICIAL_ORIGIN, evaluatePublication, evaluateDirectMedia,
  validatePrivateMediaList, safeImageURL, rangeGetStatusOnly,
} from './lib/staffportal-sites-zero-disclosure.mjs';

const publicAsset = n => ({
 asset_key:'global.city'+n+'.day',
 image_url:LEGACY_ORIGIN+'/assets/global/city'+n+'.webp',
 default_image_url:LEGACY_ORIGIN+'/assets/global/city'+n+'.webp',
 display_enabled:true, category:'global', phase:'day', label:'City',
 focal_x:0.5, focal_y:0.5,
});
const recordSet = () => {
 const legacy={assets:[...Array(50)].map((_,i)=>publicAsset(i))};
 const official={assets:legacy.assets.map(x=>({
  asset_key:x.asset_key,image_url:x.image_url,display_enabled:true
 }))};
 return {legacy,official};
};
const codes = r => r.violations.map(x=>x.code);
test('50 approved public-only assets pass JSON release checks',()=>{
 const {legacy,official}=recordSet();
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'PASS');
 assert.equal(r.legacyRecords,50);
 assert.equal(r.officialRecords,50);
 assert.equal(r.unpublishedMediaLeakChecks,'NOT_COVERED_BY_JSON_ONLY');
});
test('32 pending/draft rows are blocked and only safe counts appear',()=>{
 const {legacy,official}=recordSet();
 legacy.assets.push(...Array.from({length:28},(_,i)=>({...publicAsset(100+i),qa_status:'pending_review',created_by_id:'SUPER-SECRET'})));
 legacy.assets.push(...Array.from({length:4},(_,i)=>({...publicAsset(200+i),qa_status:'draft_review',prompt_version:'PRIVATE',image_url:LEGACY_ORIGIN+'/assets/secret'+i+'.webp'})));
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.equal(r.legacyRecords,82);
 assert.equal(r.unapprovedRecords,32);
 assert.ok(codes(r).includes('UNAPPROVED_EXPOSED'));
 assert.ok(codes(r).includes('PRIVATE_OR_UNKNOWN_FIELDS_EXPOSED'));
 assert.ok(!JSON.stringify(r).includes('SUPER-SECRET'));
 assert.ok(!JSON.stringify(r).includes('secret0.webp'));
});
test('approved status is still private and must not appear on public API',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[0].qa_status='approved';
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('QA_STATUSES_EXPOSED'));
 assert.equal(r.unapprovedRecords,0);
});
test('disabled approved record fails even at correct count',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[0].display_enabled=false;
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('DISABLED_EXPOSED'));
});
test('unexpected private author, review, prompt and source fields fail',()=>{
 const {legacy,official}=recordSet();
 Object.assign(legacy.assets[0],{created_by_id:'PERSON',audit_reason:'TOP SECRET',source_detail:'PRIVATE'});
 const r=evaluatePublication(legacy,official);
 assert.ok(codes(r).includes('PRIVATE_OR_UNKNOWN_FIELDS_EXPOSED'));
 assert.ok(!JSON.stringify(r).includes('TOP SECRET'));
});
test('stale cached-default response fails even if records look safe',()=>{
 const {legacy,official}=recordSet();
 legacy.state='cached_default';
 assert.ok(codes(evaluatePublication(legacy,official)).includes('UNVERIFIED_STALE_FALLBACK'));
});
test('unknown shapes fail closed',()=>{
 const {legacy,official}=recordSet();
 for(const body of [null,{}, {assets:{}},{assets:[]}, {assets:[null]}, {assets:[...Array(501)].map((_,i)=>publicAsset(i))}]){
  assert.equal(evaluatePublication(body,official).status,'FAIL');
 }
 assert.equal(evaluatePublication(legacy,{assets:[null]}).status,'FAIL');
});
test('duplicate asset key fails despite 50 total rows',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[0].asset_key=legacy.assets[1].asset_key;
 assert.ok(codes(evaluatePublication(legacy,official)).includes('DUPLICATE_LEGACY_KEYS'));
});
test('approved keys must agree with Cloudflare proxy',()=>{
 const {legacy,official}=recordSet();
 official.assets[0].asset_key='other.allowed.city';
 const r=evaluatePublication(legacy,official);
 assert.ok(codes(r).includes('MISSING_APPROVED_PUBLIC_KEYS'));
 assert.ok(codes(r).includes('EXTRA_PUBLIC_KEYS'));
});
test('unsafe URL forms are rejected without reflecting any URL',()=>{
 for(const candidate of [
  'http://media.base44.com/images/public/6ab5b6bf4880fcfae2d44d4a/test.png',
  'https://bad.example.test/assets/a.webp',
  '//media.base44.com/images/public/6ab5b6bf4880fcfae2d44d4a/test.png',
  '/assets/../secrets/b.webp',
  '/assets/%2e%2e/secrets/b.webp',
  '/assets/%252e%252e/secrets/b.webp',
  '/assets/ok.webp?token=SECRET',
  'https://user:pass@media.base44.com/images/public/6ab5b6bf4880fcfae2d44d4a/test.png',
  'data:image/png;base64,AAA',
  'javascript:alert(1)',
  '/assets\\evil.webp',
  ' /assets/ok.webp',
  '/assets/noextension',
 ]) assert.equal(safeImageURL(candidate),null,'Must reject unsafe source');
 const good=safeImageURL('/assets/global/banner.webp');
 assert.equal(good,LEGACY_ORIGIN+'/assets/global/banner.webp');
});
test('approved provider image may be present only on allowlisted public path',()=>{
 const media='https://media.base44.com/images/public/6ab5b6bf4880fcfae2d44d4a/banner.png';
 assert.equal(safeImageURL(media),media);
 assert.equal(safeImageURL(media.replace('/public/','/private/')),null);
});
test('worker image can be a same-origin approved proxy route',()=>{
 const media=OFFICIAL_ORIGIN+'/api/assets/images/media-reference';
 assert.equal(safeImageURL(media,OFFICIAL_ORIGIN),media);
});
test('format bounds reject missing and excessive expected counts',()=>{
 const {legacy,official}=recordSet();
 for(const expected of [0,-1,501,'50',1.5]) assert.throws(()=>evaluatePublication(legacy,official,{expected}));
});
test('media gate accepts only 401,403,404,410 as denial',async()=>{
 const urls=[
  LEGACY_ORIGIN+'/assets/unpublished/one.webp',
  LEGACY_ORIGIN+'/assets/unpublished/two.webp',
  'https://media.base44.com/images/public/6ab5b6bf4880fcfae2d44d4a/three.png',
 ];
 const statusByUrl=new Map(urls.map((url,i)=>[url,[403,404,410][i]]));
 const res=await evaluateDirectMedia(urls,{
  head:async url=>statusByUrl.get(url),
  get:async url=>statusByUrl.get(url), getFull:async url=>statusByUrl.get(url),
 });
 assert.equal(res.status,'PASS'); assert.equal(res.denied,3);
 assert.equal(res.statusOnlyGetRequests,3);
 assert.ok(!JSON.stringify(res).includes('unpublished'));
});
test('HTTP 200 octet-stream cannot be mistaken for denial',async()=>{
 const url=LEGACY_ORIGIN+'/assets/review.webp';
 let getCalled=false;
 const res=await evaluateDirectMedia([url],{
  head:async()=>200,get:async()=>{getCalled=true;return 404;},getFull:async()=>404,
 });
 assert.equal(res.status,'FAIL');assert.equal(res.anonymouslyAccessible,1);
 assert.equal(res.statusOnlyGetRequests,0);
 assert.equal(getCalled,false);
});
test('redirect and outage are unknown, so gate still fails',async()=>{
 const urls=[LEGACY_ORIGIN+'/assets/one.webp',LEGACY_ORIGIN+'/assets/two.webp'];
 const res=await evaluateDirectMedia(urls,{
  head:async u=>{
   if(u.includes('one.webp'))return 302;
   throw new Error('secret-bearing timeout');
  },
  get:async()=>404, getFull:async()=>404,
 });
 assert.equal(res.status,'FAIL');assert.equal(res.unknown,2);
 assert.ok(!JSON.stringify(res).includes('secret-bearing'));
});
test('media audit refuses duplicated, approved, malformed, untrusted URLs',()=>{
 const good=LEGACY_ORIGIN+'/assets/known.webp';
 const wrong='https://attacker.invalid/f.webp';
 assert.throws(()=>validatePrivateMediaList([good,good]));
 assert.throws(()=>validatePrivateMediaList([wrong]));
 assert.throws(()=>validatePrivateMediaList([good],{approvedURLs:[good]}));
 assert.throws(()=>validatePrivateMediaList([]));
});
test('concurrent media adapter never fetches body and respects count',async()=>{
 const urls=[...Array(24)].map((_,i)=>LEGACY_ORIGIN+'/assets/review/'+i+'.webp');
 let active=0,peak=0,calls=0;
 const r=await evaluateDirectMedia(urls,{
  concurrency:4,
  head:async()=>{
   calls++;active++;peak=Math.max(peak,active);
   await Promise.resolve();active--;
   return 404;
  },
  get:async()=>404, getFull:async()=>404,
 });
 assert.equal(r.checked,24);assert.equal(calls,24);assert.ok(peak<=4);
 assert.equal(r.status,'PASS');
});


test('HEAD 404 but GET 200 is still anonymously accessible',async()=>{
 const url=LEGACY_ORIGIN+'/assets/review.webp';
 const result=await evaluateDirectMedia([url],{
  head:async()=>404, get:async()=>200,getFull:async()=>404,
 });
 assert.equal(result.status,'FAIL');
 assert.equal(result.headDenied,1);
 assert.equal(result.getAccessible,1);
 assert.equal(result.anonymouslyAccessible,1);
 assert.equal(result.denied,0);
 assert.equal(result.statusOnlyGetRequests,1);
});
test('HEAD 403 but range GET 206 fails release',async()=>{
 const url=LEGACY_ORIGIN+'/assets/review.webp';
 const result=await evaluateDirectMedia([url],{
  head:async()=>403, get:async()=>206,getFull:async()=>404,
 });
 assert.equal(result.status,'FAIL');
 assert.equal(result.getAccessible,1);
});
test('HEAD denial and GET 410 both pass historical media check',async()=>{
 const result=await evaluateDirectMedia([LEGACY_ORIGIN+'/assets/review.webp'],{
  head:async()=>404,get:async()=>410,getFull:async()=>410,
 });
 assert.equal(result.status,'PASS');
 assert.equal(result.denied,1);
 assert.equal(result.getDenied,1);
});
test('HEAD denial and a GET timeout never count as access denial',async()=>{
 const result=await evaluateDirectMedia([LEGACY_ORIGIN+'/assets/review.webp'],{
  head:async()=>404,get:async()=>{throw new Error('SECRET_PRIVATE_URL');},getFull:async()=>404,
 });
 assert.equal(result.status,'FAIL');
 assert.equal(result.unknown,1);
 assert.ok(!JSON.stringify(result).includes('SECRET_PRIVATE_URL'));
});
test('GET redirect after HEAD 404 remains unknown',async()=>{
 const result=await evaluateDirectMedia([LEGACY_ORIGIN+'/assets/review.webp'],{
  head:async()=>404,get:async()=>302,getFull:async()=>404,
 });
 assert.equal(result.status,'FAIL');
 assert.equal(result.unknown,1);
});
test('HEAD-only release adapter is rejected rather than declaring pass',async()=>{
 await assert.rejects(evaluateDirectMedia([LEGACY_ORIGIN+'/assets/review.webp'],{
  head:async()=>404,
 }),/HEAD, Range GET and plain GET status-only adapters are required/);
});
test('approved images cannot be accidentally included in private media scan',async()=>{
 const image=LEGACY_ORIGIN+'/assets/approved.webp';
 await assert.rejects(evaluateDirectMedia([image],{
  approvedURLs:[image],
  head:async()=>404,get:async()=>404, getFull:async()=>404,
 }),/Untrusted, approved, or duplicate/);
});
test('status-only range GET reads headers and cancels body, never reading bytes',async()=>{
 const url=LEGACY_ORIGIN+'/assets/review.webp';
 let fetchCalls=0,cancelCount=0,readCount=0,request;
 const response={
  status:404,
  body:{
   cancel:async()=>{cancelCount++;},
   getReader:()=>{readCount++;throw Error('body must never be read');},
  }
 };
 const status=await rangeGetStatusOnly(url,{fetchImpl:async(_url,init)=>{
  fetchCalls++;
  request=init;
  assert.equal(_url,url);
  return response;
 }});
 assert.equal(status,404);
 assert.equal(fetchCalls,1);
 assert.equal(cancelCount,1);
 assert.equal(readCount,0);
 assert.equal(request.method,'GET');
 assert.equal(request.headers.range,'bytes=0-0');
 assert.equal(request.redirect,'manual');
 assert.equal(request.signal.aborted,true);
});
test('status-only GET rejects unsafe adapter and timeouts',async()=>{
 await assert.rejects(rangeGetStatusOnly(LEGACY_ORIGIN+'/assets/test.webp',{fetchImpl:null}),/Invalid status-only GET transport/);
 await assert.rejects(rangeGetStatusOnly(LEGACY_ORIGIN+'/assets/test.webp',{fetchImpl:()=>{},timeoutMs:0}),/Invalid status-only GET transport/);
});


test('same approved asset key but different image URL fails exact-image acceptance',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[1].image_url=LEGACY_ORIGIN+'/assets/unapproved/replacement.webp';
 const result=evaluatePublication(legacy,official);
 assert.equal(result.status,'FAIL');
 assert.ok(codes(result).includes('APPROVED_IMAGE_SOURCE_MISMATCH'));
 assert.equal(result.legacyRecords,50);
 assert.ok(!JSON.stringify(result).includes('unapproved/replacement.webp'));
});
test('same approved key but different fallback URL fails approval gate',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[2].default_image_url=LEGACY_ORIGIN+'/assets/unapproved/fallback.png';
 const result=evaluatePublication(legacy,official);
 assert.equal(result.status,'FAIL');
 assert.ok(codes(result).includes('APPROVED_FALLBACK_IMAGE_MISMATCH'));
 assert.equal(result.legacyRecords,50);
 assert.ok(!JSON.stringify(result).includes('unapproved/fallback.png'));
});


// End-to-end CLI tests inject an entirely synthetic, offline fetch adapter.
// No real StaffPortal endpoint, private media or credentials are accessed.
const CLI_FIXTURE_SOURCE = [  "const origin='https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';",
  "const approved=Array.from({length:50},(_,i)=>({",
  "  asset_key:'global.synthetic'+i+'.day',",
  "  image_url:origin+'/assets/approved/synthetic'+i+'.webp',",
  "  display_enabled:true",
  "}));",
  "globalThis.fetch=async (url,options={})=>{",
  "  const value=String(url);",
  "  if(value.endsWith('/api/assets'))",
  "    return new Response(JSON.stringify({assets:approved}),{status:200,headers:{'content-type':'application/json'}});",
  "  if(options.method==='HEAD')return new Response(null,{status:404});",
  "  if(options.method==='GET' && options.headers?.range==='bytes=0-0')",
  "    return new Response('SYNTHETIC-PRIVATE-MEDIA-MUST-NEVER-APPEAR-IN-LOGS',{",
  "      status:200,headers:{'content-type':'application/octet-stream'}",
  "    });",
  "  if(options.method==='GET' && !options.headers?.range) return new Response(null,{status:404});",
  "  throw new Error('UNEXPECTED_NETWORK_REQUEST');",
  "};",
].join('\n');
const CLI_FIXTURE_URL='data:text/javascript,'+encodeURIComponent(CLI_FIXTURE_SOURCE);
const CLI_SCRIPT=fileURLToPath(new URL('./check-staffportal-sites-zero-disclosure-live.mjs',import.meta.url));
const invokeMockCLI=args=>spawnSync(process.execPath,['--import',CLI_FIXTURE_URL,CLI_SCRIPT,...args],{
  encoding:'utf8',timeout:12000,maxBuffer:3_000_000,
});
test('API-only command never exits 0 even when synthetic public feed passes',()=>{
 const result=invokeMockCLI(['--api-only']);
 assert.equal(result.status,2,result.stderr?.slice(0,260));
 const receipt=JSON.parse(result.stdout);
 assert.equal(receipt.api.status,'PASS');
 assert.equal(receipt.media.status,'NOT_RUN');
 assert.equal(receipt.decision,'API_ONLY_PASS_MEDIA_UNVERIFIED');
});
test('real CLI wiring checks HEAD then Range GET; GET 200 still blocks release',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'staffportal-p0-gate-fixture-'));
 const privateLabel='SYNTHETIC-PRIVATE-MEDIA-MUST-NEVER-APPEAR-IN-LOGS';
 try{
  const urls=Array.from({length:24},(_,i)=>LEGACY_ORIGIN+'/assets/unpublished/synthetic'+i+'.webp');
  const fixture=path.join(temp,'fake-private-url-inventory.json');
  fs.writeFileSync(fixture,JSON.stringify({urls}));
  const result=invokeMockCLI(['--media-manifest',fixture]);
  assert.equal(result.status,1,result.stderr?.slice(0,260));
  const receipt=JSON.parse(result.stdout);
  assert.equal(receipt.api.status,'PASS');
  assert.equal(receipt.media.status,'FAIL');
  assert.equal(receipt.media.checked,24);
  assert.equal(receipt.media.headDenied,24);
  assert.equal(receipt.media.statusOnlyGetRequests,24);
  assert.equal(receipt.media.getAccessible,24);
  assert.equal(receipt.media.anonymouslyAccessible,24);
  assert.ok(!result.stdout.includes('/assets/unpublished/'));
  assert.ok(!result.stdout.includes(privateLabel));
  assert.equal(receipt.originalUrlsOrPrivateRecordsIncluded,false);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});


test('private data added to the legacy response envelope must fail release',()=>{
 const {legacy,official}=recordSet();
 legacy.ownerInternal={auditNote:'SECRET-ENVELOPE-DATA'};
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('LEGACY_UNEXPECTED_ENVELOPE_FIELDS'));
 assert.ok(!JSON.stringify(r).includes('SECRET-ENVELOPE-DATA'));
});
test('private data added to the official response envelope must fail release',()=>{
 const {legacy,official}=recordSet();
 official.ownerDebug={token:'SECRET-OFFICIAL-DATA'};
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('OFFICIAL_UNEXPECTED_ENVELOPE_FIELDS'));
 assert.ok(!JSON.stringify(r).includes('SECRET-OFFICIAL-DATA'));
});
test('allowlisted legacy visual fields cannot contain nested private objects',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[0].label={privatePrompt:'SECRET-LABEL-OBJECT'};
 legacy.assets[1].purpose=['SECRET-PURPOSE-ARRAY'];
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('INVALID_LEGACY_VISUAL_FIELD_VALUES'));
 assert.ok(!JSON.stringify(r).includes('SECRET-'));
});
test('allowlisted official visual fields cannot contain nested private objects',()=>{
 const {legacy,official}=recordSet();
 official.assets[0].category={privateOwner:'SECRET-WORKER-OBJECT'};
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('INVALID_OFFICIAL_VISUAL_FIELD_VALUES'));
 assert.ok(!JSON.stringify(r).includes('SECRET-WORKER-OBJECT'));
});
test('out-of-range or nonfinite visual numerics are not public-safe',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[0].focal_x=-0.2;
 legacy.assets[1].zoom=Number.NaN;
 official.assets[2].sort_order=10001;
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('INVALID_LEGACY_VISUAL_FIELD_VALUES'));
 assert.ok(codes(r).includes('INVALID_OFFICIAL_VISUAL_FIELD_VALUES'));
});
test('invalid visual enumeration, boolean and oversize text fail',()=>{
 const {legacy,official}=recordSet();
 legacy.assets[0].phase='private';
 legacy.assets[1].fit_mode='javascript';
 legacy.assets[2].is_virtual={draft:true};
 legacy.assets[3].purpose='x'.repeat(181);
 const r=evaluatePublication(legacy,official);
 assert.equal(r.status,'FAIL');
 assert.ok(codes(r).includes('INVALID_LEGACY_VISUAL_FIELD_VALUES'));
});

test('Range denied but ordinary browser GET 200 blocks release',async()=>{
 const url=LEGACY_ORIGIN+'/assets/private.webp';
 const r=await evaluateDirectMedia([url],{head:async()=>404,get:async()=>404,getFull:async()=>200});
 assert.equal(r.status,'FAIL');assert.equal(r.fullGetAccessible,1);assert.equal(r.denied,0);
});
test('all three methods must deny historical direct media',async()=>{
 const url=LEGACY_ORIGIN+'/assets/private.webp';
 const r=await evaluateDirectMedia([url],{head:async()=>403,get:async()=>404,getFull:async()=>410});
 assert.equal(r.status,'PASS');assert.equal(r.denied,1);assert.equal(r.fullGetDenied,1);
});
test('plain GET adapter missing always fails closed',async()=>{
 await assert.rejects(evaluateDirectMedia([LEGACY_ORIGIN+'/assets/private.webp'],{head:async()=>404,get:async()=>404}),
 /plain GET status-only adapters are required/);
});
test('plain GET cancels response and does not request Range',async()=>{
 let cancel=0;
 const result=await rangeGetStatusOnly(LEGACY_ORIGIN+'/assets/private.webp',{
 plain:true,fetchImpl:async(_url,options)=>{
 assert.equal(options.headers.range,undefined);assert.equal(options.method,'GET');
 return {status:404,body:{cancel:async()=>{cancel++}}};
 }});
 assert.equal(result,404);assert.equal(cancel,1);
});