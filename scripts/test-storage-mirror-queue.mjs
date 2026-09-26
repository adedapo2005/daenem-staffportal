import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0077_storage_mirror_queue.sql', import.meta.url), 'utf8');
const source = await readFile(new URL('../worker/offline.ts', import.meta.url), 'utf8');
assert.match(migration, /provider TEXT NOT NULL CHECK \(provider = 'microsoft_onedrive'\)/);
assert.match(migration, /'pending','syncing','mirrored','retrying','failed','disabled','provider_required'/);
assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/);
assert.match(migration, /UNIQUE\(provider, source_module, source_id, sha256\)/);
assert.match(migration, /provider_item_id TEXT/);
assert.match(migration, /last_error_code TEXT/);
const upload = source.slice(source.indexOf('async function uploadAttachment'), source.indexOf('\nexport async function routeOffline'));
assert.match(upload, /companyInScope\(context, companyId\)/);
assert.match(upload, /Attachment scope conflicts with its existing record/);
assert.match(upload, /await env\.DB\.batch\(\[env\.DB\.prepare\([\s\S]*?INSERT OR IGNORE INTO storage_mirror_jobs/);
assert.match(upload, /'microsoft_onedrive','offline',id,company_id,r2_key,original_name/);
assert.match(upload, /backupStatus:'provider_required'/);
assert.doesNotMatch(upload, /graph\.microsoft|graph\.microsoft\.com|Authorization.*Bearer/);
console.log('OneDrive mirror queue boundary: PASS');
