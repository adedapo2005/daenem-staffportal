import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(path.join(root, 'worker/v180-cloudflare-public-media.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const moduleBox = { exports: {} };
new Function('exports', 'module', 'require', compiled.outputText)(moduleBox.exports, moduleBox, require);
const { routeCloudflareV180Media } = moduleBox.exports;

const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE permissions (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, module TEXT NOT NULL, action TEXT NOT NULL, description TEXT, sensitive INTEGER NOT NULL);`);
database.exec(fs.readFileSync(path.join(root, 'migrations/0102_staffportal_v180_media_publication.sql'), 'utf8'));
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64');
const sha = crypto.createHash('sha256').update(image).digest('hex');
const key = `staffportal/approved-v180/sha256/${sha.slice(0, 2)}/${sha}.png`;
const insert = database.prepare(`INSERT INTO staffportal_v180_media_publication
  (asset_key,id,category,purpose,qa_status,display_enabled,has_default_image,sort_order,image_r2_key,image_sha256,image_bytes,image_mime,publication_version,changed_by)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (const [assetKey, status, enabled] of [
  ['global.safe.image', 'approved', 1],
  ['global.safe.default', 'approved_v179', 1],
  ['global.pending.image', 'pending_review', 1],
  ['global.draft.image', 'draft_review', 1],
  ['global.disabled.image', 'approved', 0],
]) insert.run(assetKey, assetKey, 'global', 'approved test media', status, enabled, 1, 1,
  key, sha, image.length, 'image/png', 1, 'test-fixture');

const objects = new Map([[key, { bytes: image, mime: 'image/png' }]]);
let gets = 0;
let heads = 0;
let afterRead = null;
const env = {
  DB: { prepare(sql) {
    return {
      all: async () => ({ results: database.prepare(sql).all() }),
      bind(...values) { const stmt = database.prepare(sql); return { first: async () => stmt.get(...values) || null }; },
    };
  } },
  FILES: {
    get: async objectKey => {
      gets++;
      const value = objects.get(objectKey);
      if (!value) return null;
      return { size: value.bytes.length, httpMetadata: { contentType: value.mime }, arrayBuffer: async () => {
        if (afterRead) await afterRead();
        return value.bytes.buffer.slice(value.bytes.byteOffset, value.bytes.byteOffset + value.bytes.byteLength);
      } };
    },
    head: async objectKey => { heads++; const value = objects.get(objectKey); return value ? { size: value.bytes.length, httpMetadata: { contentType: value.mime } } : null; },
  },
};
const request = (route, method = 'GET') => new Request(`https://staffportal.example.test${route}`, { method });
const imageRoute = '/api/assets/images/global.safe.image/image';
const response = async (route, method) => routeCloudflareV180Media(request(route, method), env);

let result = await response('/api/assets');
assert.equal(result.status, 200);
let feed = await result.json();
assert.equal(feed.assets.length, 2, 'pending, draft and disabled records are not public');
assert.deepEqual(feed.assets.map(row => row.asset_key), ['global.safe.default', 'global.safe.image']);
assert.equal(feed.assets[1].image_url, `${imageRoute}`);
assert.equal(feed.assets[1].default_image_url, '/api/assets/images/global.safe.image/default');
assert.equal(result.headers.get('cache-control'), 'no-store');
assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
assert.ok(!JSON.stringify(feed).includes('image_r2_key') && !JSON.stringify(feed).includes(sha), 'public feed omits storage pins');

result = await response(imageRoute);
assert.equal(result.status, 200);
assert.equal(result.headers.get('content-type'), 'image/png');
assert.equal(result.headers.get('cross-origin-resource-policy'), 'same-origin');
assert.equal(result.headers.get('cache-control'), 'no-store');
assert.deepEqual(Buffer.from(await result.arrayBuffer()), image, 'verified image bytes are delivered');

result = await response(imageRoute, 'HEAD');
assert.equal(result.status, 200);
assert.equal(result.headers.get('content-length'), String(image.length));
assert.equal(await result.text(), '');
assert.equal(heads, 1);

for (const route of [
  '/api/assets/images/global.pending.image/image',
  '/api/assets/images/global.draft.image/image',
  '/api/assets/images/global.disabled.image/image',
  '/api/assets/images/global.safe.image/default/extra',
  '/api/assets/images/%2e%2e/image',
  '/api/assets/images/global.safe.image/image?url=https://attacker.test',
]) {
  result = await response(route);
  assert.ok(result.status === 404, `unapproved or malformed media path denied: ${route}`);
}
assert.equal(gets, 1, 'denied routes never read R2');

objects.delete(key);
result = await response(imageRoute);
assert.equal(result.status, 503, 'missing private object fails closed');
objects.set(key, { bytes: Buffer.alloc(image.length, 0x3c), mime: 'text/html' });
result = await response(imageRoute);
assert.equal(result.status, 502, 'HTML with HTTP success is not served as an image');
objects.set(key, { bytes: Buffer.from(image).fill(0), mime: 'image/png' });
result = await response(imageRoute);
assert.equal(result.status, 502, 'wrong image bytes fail SHA verification');

objects.set(key, { bytes: image, mime: 'image/png' });
afterRead = async () => {
  database.prepare(`UPDATE staffportal_v180_media_publication SET qa_status='revoked',display_enabled=0,
    publication_version=publication_version+1,changed_by='owner-test' WHERE asset_key='global.safe.image'`).run();
};
result = await response(imageRoute);
assert.equal(result.status, 404, 'revocation during R2 read is rechecked before bytes are returned');
assert.equal(await result.text().then(text => text.includes('iVBOR')), false);

console.log('V180 Cloudflare public media: 31 focused assertions passed');
