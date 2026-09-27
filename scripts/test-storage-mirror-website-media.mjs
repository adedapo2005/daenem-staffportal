import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/platform-center.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function uploadMedia(');
const end = source.indexOf('\nasync function siteForCompany', start);
const upload = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'Business Website media upload route exists');
assert.match(upload, /requireCompany\(context, companyId, 'website\.content', 'create'\)/);
assert.match(upload, /await crypto\.subtle\.digest\('SHA-256', bytes\)/);
assert.match(upload, /customMetadata: \{ siteId: site\.id, companyId, uploadedBy: context\.employee\.id, altText, sha256: digest \}/);
assert.match(upload, /await env\.DB\.batch\(\[[\s\S]*?INSERT INTO website_media_assets[\s\S]*?INSERT OR IGNORE INTO storage_mirror_jobs/);
assert.match(upload, /'microsoft_onedrive','website'/);
assert.match(upload, /microsoft_onedrive:website:\$\{id\}:\$\{digest\}/);
assert.match(upload, /'provider_required'/);
assert.match(upload, /backupStatus: 'provider_required'/);
assert.match(upload, /catch \(error\) \{\s*await env\.FILES\.delete\(key\);\s*throw error;/);
assert.doesNotMatch(upload, /graph\.microsoft|Authorization.*Bearer/);
assert.doesNotMatch(upload, /sha256.*(?:access.?token|refresh.?token)|provider_item_id/i);

console.log('Business Website media OneDrive mirror boundary: 11/11 PASS');
