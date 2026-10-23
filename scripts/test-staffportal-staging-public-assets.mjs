import assert from 'node:assert/strict';

const stagingBase = new URL(
  process.env.STAFFPORTAL_STAGING_URL || 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev',
);
const upstreamBase = new URL('https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site');
const trustedImageOrigins = new Set([upstreamBase.origin, 'https://media.base44.com']);
const approvedStates = new Set(['approved', 'approved_v179']);
const publicFields = new Set([
  'id',
  'asset_key',
  'category',
  'purpose',
  'image_url',
  'default_image_url',
  'zoom',
  'focal_x',
  'focal_y',
  'display_enabled',
  'master_width',
  'master_height',
]);
const numericFields = new Set(['zoom', 'focal_x', 'focal_y', 'master_width', 'master_height']);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function read(url, init = {}) {
  return fetch(url, {
    redirect: 'manual',
    cache: 'no-store',
    headers: { accept: 'application/json', ...(init.headers || {}) },
    ...init,
  });
}

function normalizedSourceImage(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null;
  let url;
  try {
    if (value.startsWith('/assets/')) {
      if (value.includes('\\') || value.includes('?') || value.includes('#')) return null;
      url = new URL(value, upstreamBase);
      if (url.origin !== upstreamBase.origin || !url.pathname.startsWith('/assets/')) return null;
    } else {
      url = new URL(value);
    }
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !trustedImageOrigins.has(url.origin)) return null;
  return url.toString();
}

function buildApprovedSourceMap(payload) {
  assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload), 'upstream body must be an object');
  assert.ok(Array.isArray(payload.assets), 'upstream body must contain an assets array');
  assert.ok(payload.assets.length <= 500, 'upstream asset list exceeds the 500-record safety limit');

  const approved = new Map();
  for (const source of payload.assets) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    if (!approvedStates.has(source.qa_status) || source.display_enabled !== true) continue;
    if (typeof source.asset_key !== 'string' || !source.asset_key) continue;
    const imageUrl = normalizedSourceImage(source.image_url);
    if (!imageUrl) continue;
    assert.ok(!approved.has(source.asset_key), `approved upstream asset_key is duplicated: ${source.asset_key}`);
    approved.set(source.asset_key, {
      image_url: imageUrl,
      default_image_url: normalizedSourceImage(source.default_image_url),
    });
  }
  assert.ok(approved.size > 0, 'upstream contains no eligible approved public assets');
  return approved;
}

function assertSafePublicAsset(asset, approvedSource, seen) {
  assert.ok(asset && typeof asset === 'object' && !Array.isArray(asset), 'public asset must be an object');
  for (const field of Object.keys(asset)) {
    assert.ok(publicFields.has(field), `public asset leaked unexpected field: ${field}`);
  }

  assert.equal(typeof asset.asset_key, 'string', 'public asset_key must be a string');
  assert.ok(asset.asset_key.length > 0, 'public asset_key must not be empty');
  assert.ok(!seen.has(asset.asset_key), `public asset_key is duplicated: ${asset.asset_key}`);
  seen.add(asset.asset_key);

  const source = approvedSource.get(asset.asset_key);
  assert.ok(source, `public response exposed a non-approved, disabled, missing-image, or unknown asset: ${asset.asset_key}`);

  assert.equal(typeof asset.image_url, 'string', `${asset.asset_key} image_url must be a string`);
  const image = new URL(asset.image_url);
  assert.equal(image.protocol, 'https:', `${asset.asset_key} image_url must use HTTPS`);
  assert.equal(image.username, '', `${asset.asset_key} image_url must not contain credentials`);
  assert.equal(image.password, '', `${asset.asset_key} image_url must not contain credentials`);
  assert.equal(image.toString(), source.image_url, `${asset.asset_key} image_url does not match its approved source record`);

  if (asset.default_image_url !== undefined) {
    assert.ok(source.default_image_url, `${asset.asset_key} exposed an unapproved default_image_url`);
    const fallback = new URL(asset.default_image_url);
    assert.equal(fallback.protocol, 'https:', `${asset.asset_key} default_image_url must use HTTPS`);
    assert.equal(fallback.username, '', `${asset.asset_key} default_image_url must not contain credentials`);
    assert.equal(fallback.password, '', `${asset.asset_key} default_image_url must not contain credentials`);
    assert.equal(fallback.toString(), source.default_image_url, `${asset.asset_key} default_image_url does not match its approved source record`);
  }

  if (asset.display_enabled !== undefined) {
    assert.equal(asset.display_enabled, true, `${asset.asset_key} must not expose a disabled asset`);
  }
  for (const field of numericFields) {
    if (asset[field] !== undefined) assert.ok(Number.isFinite(asset[field]), `${asset.asset_key} ${field} must be finite`);
  }
}

async function verifyOnce() {
  const upstreamResponse = await read(new URL('/api/assets', upstreamBase));
  assert.equal(upstreamResponse.status, 200, `approved source returned ${upstreamResponse.status}`);
  assert.match(upstreamResponse.headers.get('content-type') || '', /^application\/json(?:\s*;|$)/i, 'approved source must return JSON');
  const approvedSource = buildApprovedSourceMap(await upstreamResponse.json());

  const publicResponse = await read(new URL('/api/assets', stagingBase));
  assert.equal(publicResponse.status, 200, `deployed /api/assets returned ${publicResponse.status}`);
  assert.match(publicResponse.headers.get('content-type') || '', /^application\/json(?:\s*;|$)/i, 'deployed /api/assets must return JSON');
  assert.match(publicResponse.headers.get('cache-control') || '', /(?:^|,)\s*public(?:,|$)/i, 'deployed /api/assets must be publicly cacheable');
  assert.equal(publicResponse.headers.get('x-content-type-options'), 'nosniff', 'deployed /api/assets must prevent content sniffing');

  const payload = await publicResponse.json();
  assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload), 'public response body must be an object');
  assert.deepEqual(Object.keys(payload).sort(), ['assets'], 'public response must contain only the assets envelope');
  assert.ok(Array.isArray(payload.assets), 'public response must contain an assets array');
  assert.ok(payload.assets.length > 0, 'public response must contain at least one approved asset');
  assert.ok(payload.assets.length <= 500, 'public response exceeds the 500-record safety limit');

  const seen = new Set();
  for (const asset of payload.assets) assertSafePublicAsset(asset, approvedSource, seen);
  return { publicCount: seen.size, approvedEligibleCount: approvedSource.size };
}

let lastError;
let result;
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    result = await verifyOnce();
    lastError = undefined;
    break;
  } catch (error) {
    lastError = error;
    console.error(`Public asset contract attempt ${attempt}/5 failed: ${error instanceof Error ? error.message : String(error)}`);
    if (attempt < 5) await delay(4_000);
  }
}
if (lastError) throw lastError;

const queryVariant = await read(new URL('/api/assets?probe=1', stagingBase));
assert.equal(queryVariant.status, 404, `query variant must return 404, got ${queryVariant.status}`);

const methodVariant = await read(new URL('/api/assets', stagingBase), { method: 'POST' });
assert.equal(methodVariant.status, 405, `non-GET variant must return 405, got ${methodVariant.status}`);
assert.equal(methodVariant.headers.get('allow'), 'GET', 'non-GET response must advertise Allow: GET');

console.log(JSON.stringify({
  ok: true,
  surface: 'staffportal-staging-public-assets',
  publicCount: result.publicCount,
  approvedEligibleCount: result.approvedEligibleCount,
  checks: [
    'deployed-200-json',
    'approved-and-enabled-source-membership',
    'safe-public-field-projection',
    'trusted-image-url-normalization',
    'no-duplicate-asset-keys',
    'public-cache-and-nosniff',
    'query-and-method-rejection',
  ],
}, null, 2));
