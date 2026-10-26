import assert from 'node:assert/strict';

const official = 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev';
const base = new URL(process.env.STAFFPORTAL_STAGING_URL || official);
assert.equal(base.origin, official, 'Only the authorized StaffPortal Cloudflare Pre-Production origin may be verified');

const allowedFields = new Set([
  'id','asset_key','category','purpose','image_url','default_image_url',
  'zoom','focal_x','focal_y','display_enabled','master_width','master_height',
]);
const numericFields = ['zoom','focal_x','focal_y','master_width','master_height'];
const formerOrigins = [
  'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site',
  'https://daenem-staffportal-qa-review.daenem-group-9873.chatgpt.site',
];
const request = (pathname, init = {}) => fetch(new URL(pathname, base), {
  redirect: 'manual',
  cache: 'no-store',
  signal: AbortSignal.timeout(30000),
  headers: {accept: '*/*', ...(init.headers || {})},
  ...init,
});
const mime = (value) => (value || '').split(';')[0].trim().toLowerCase();
const imageMagicMime = (bytes) => {
  const b = Buffer.from(bytes);
  if (b.length >= 12 && b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  if (b.length >= 8 && b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'image/png';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  return null;
};
const noStore = (response, label) => {
  assert.match(response.headers.get('cache-control') || '', /(?:^|,)\s*no-store(?:,|$)/i, label + ' must not cache revocable media');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', label + ' must prevent content sniffing');
  assert.equal(response.headers.get('x-staffportal-auth-runtime'), 'worker-password-auth-v1', label + ' must preserve approved auth runtime');
};

const publicResponse = await request('/api/assets', {headers: {accept: 'application/json'}});
assert.equal(publicResponse.status, 200, 'Pre-Production public assets must return HTTP 200');
assert.equal(mime(publicResponse.headers.get('content-type')), 'application/json');
noStore(publicResponse, 'Public catalogue');
const payload = await publicResponse.json();
assert.deepEqual(Object.keys(payload).sort(), ['assets'], 'Only public assets envelope may be exposed');
assert.ok(Array.isArray(payload.assets), 'Public assets must be an array');
assert.equal(payload.assets.length, 50, 'Exactly 50 approved V180 assets are required');

const keys = new Set();
const counts = {global: 0, widget: 0};
const tasks = [];
for (const row of payload.assets) {
  assert.ok(row && typeof row === 'object' && !Array.isArray(row), 'Asset must be a record');
  for (const field of Object.keys(row)) assert.ok(allowedFields.has(field), 'Private asset metadata leaked: ' + field);
  assert.match(row.asset_key, /^[A-Za-z0-9_.-]{1,120}$/, 'Invalid approved asset key');
  assert.ok(!keys.has(row.asset_key), 'Duplicate approved asset key: ' + row.asset_key);
  keys.add(row.asset_key);
  assert.equal(row.display_enabled, true, 'Disabled asset must not be public');
  assert.ok(row.category === 'global' || row.category === 'widget', 'Invalid public category');
  counts[row.category]++;
  for (const field of numericFields) {
    if (row[field] !== undefined && row[field] !== null) assert.ok(Number.isFinite(row[field]), 'Invalid numeric field: ' + field);
  }
  for (const [field, suffix] of [['image_url','image'], ['default_image_url','default']]) {
    assert.equal(typeof row[field], 'string', 'Missing public image path: ' + field);
    const url = new URL(row[field], base);
    assert.equal(url.origin, base.origin, 'No external Sites, Base44 or public R2 host may deliver media');
    assert.equal(url.pathname, '/api/assets/images/' + row.asset_key + '/' + suffix, 'Only canonical Worker image paths are allowed');
    assert.equal(url.search, '', 'Image path must not contain a query');
    assert.equal(url.hash, '', 'Image path must not contain a fragment');
    tasks.push({assetKey: row.asset_key, field, path: url.pathname});
  }
}
assert.deepEqual(counts, {global:10, widget:40}, 'Approved image family inventory changed');
assert.equal(tasks.length, 100, 'Both image and default paths must be verified for all 50 assets');

let verified = 0;
async function verifyMedia(item) {
  const label = item.assetKey + '/' + item.field;
  const head = await request(item.path,{method:'HEAD'});
  assert.equal(head.status,200,label + ' HEAD must succeed');
  const headMime = mime(head.headers.get('content-type'));
  assert.ok(['image/webp','image/png','image/jpeg'].includes(headMime),label + ' HEAD returned non-image MIME');
  noStore(head,label + ' HEAD');
  const response = await request(item.path,{headers:{accept:'image/*'}});
  assert.equal(response.status,200,label + ' GET must succeed');
  assert.equal(mime(response.headers.get('content-type')),headMime,label + ' GET/HEAD MIME disagreement');
  noStore(response,label + ' GET');
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.byteLength > 0 && bytes.byteLength <= 12_000_000,label + ' invalid image size');
  assert.equal(imageMagicMime(bytes),headMime,label + ' actual bytes are not an image');
  verified++;
}
// Bounded concurrency protects the Cloudflare Worker and prevents redundant hammering.
await Promise.all(Array.from({length:3},async(_,worker) => {
  for(let index=worker;index<tasks.length;index+=3) await verifyMedia(tasks[index]);
}));
assert.equal(verified,100, 'All 100 private Worker media GET/HEAD pairs must pass');

for (const origin of formerOrigins) {
  // A header-only request to Cloudflare; do not browse or fetch from retired Sites.
  const response = await request('/api/assets',{headers:{Origin:origin}});
  assert.notEqual(response.headers.get('access-control-allow-origin'),origin,'Retired Sites CORS still enabled');
  assert.notEqual(response.headers.get('access-control-allow-credentials'),'true','Retired Sites may not receive credentialed CORS');
}
const officialCors = await request('/api/assets',{headers:{Origin:official}});
assert.equal(officialCors.headers.get('access-control-allow-origin'),official,'Official Cloudflare origin must be configured');

const queryVariant = await request('/api/assets?probe=1');
assert.equal(queryVariant.status,404,'Catalogue query variant must fail closed');
const methodVariant = await request('/api/assets',{method:'POST'});
assert.equal(methodVariant.status,405,'Non-GET catalogue request must not mutate media');
const missing = await request('/api/assets/images/unpublished-qa-probe/image');
assert.equal(missing.status,404,'Unknown image must not fall through to a successful HTML page');
assert.equal(mime(missing.headers.get('content-type')),'application/json');
for(const pathname of ['/api/auth/me','/api/finance/transactions']){
  const response=await request(pathname);
  assert.equal(response.status,401,'Anonymous protected API access must remain denied');
}
console.log(JSON.stringify({
  ok:true,scope:'StaffPortal Cloudflare Pre-Production only',approvedRecords:keys.size,
  categories:counts,validImageGetAndHeadPairs:verified,retiredSitesAllowed:0,
  tests:['D1-approved-only public projection','canonical same-origin Worker image links',
  'real GET and HEAD image MIME and magic','revocation-safe no-store',
  'retired Sites credentialed CORS denied','unknown/invalid paths denied',
  'anonymous protected routes 401'],
  browserVisualAcceptance:'separately required',
  sitesUsedAsRuntimeSource:false,cloudflareWrites:0,productionWrites:0
},null,2));