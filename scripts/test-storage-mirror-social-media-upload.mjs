import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/social-media.ts', import.meta.url), 'utf8');
const start = source.indexOf("if(url.pathname==='/api/social/media/upload'");
const end = source.indexOf('return null}', start);
const upload = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'authenticated Social Media upload route exists');
assert.match(upload, /socialPermission\(context,'social\.content','create'\)/);
assert.match(upload, /requireSocialBrand\(env,context,brandId\)/);
assert.match(upload, /bytes=await value\.arrayBuffer\(\),digest=await sha256Bytes\(bytes\)/);
assert.match(upload, /await env\.FILES\.put\(key,bytes/);
assert.match(upload, /env\.DB\.batch\(\[env\.DB\.prepare\(`INSERT INTO social_media_assets/);
assert.match(upload, /INSERT OR IGNORE INTO storage_mirror_jobs/);
assert.match(upload, /'microsoft_onedrive','social',/);
assert.match(upload, /microsoft_onedrive:social:\$\{id\}:\$\{digest\}/);
assert.match(upload, /'provider_required'/);
assert.match(upload, /backupStatus:'provider_required'/);
assert.match(upload, /sha256:digest/);
assert.match(upload, /catch\(error\)\{await env\.FILES\.delete\(key\);throw error\}/);
assert.doesNotMatch(upload, /graph\.microsoft|Authorization.*Bearer/);

console.log('Social Media upload OneDrive mirror boundary: 13/13 PASS');
