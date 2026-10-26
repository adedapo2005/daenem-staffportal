import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_ORIGIN, OFFICIAL_ORIGIN, evaluatePublication, evaluateDirectMedia,
  validatePrivateMediaList, safeImageURL,
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
 const statuses=[403,404,410];
 const res=await evaluateDirectMedia(urls,{head:async()=>statuses.shift()});
 assert.equal(res.status,'PASS'); assert.equal(res.denied,3);
 assert.ok(!JSON.stringify(res).includes('unpublished'));
});
test('HTTP 200 octet-stream cannot be mistaken for denial',async()=>{
 const url=LEGACY_ORIGIN+'/assets/review.webp';
 const res=await evaluateDirectMedia([url],{head:async()=>200});
 assert.equal(res.status,'FAIL');assert.equal(res.anonymouslyAccessible,1);
});
test('redirect and outage are unknown, so gate still fails',async()=>{
 const urls=[LEGACY_ORIGIN+'/assets/one.webp',LEGACY_ORIGIN+'/assets/two.webp'];
 const res=await evaluateDirectMedia(urls,{head:async u=>{
  if(u.includes('one.webp'))return 302;
  throw new Error('secret-bearing timeout');
 }});
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
 });
 assert.equal(r.checked,24);assert.equal(calls,24);assert.ok(peak<=4);
 assert.equal(r.status,'PASS');
});