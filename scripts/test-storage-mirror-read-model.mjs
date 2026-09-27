import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/storage-mirror.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/admin/storage/mirror-jobs'");
const end = source.indexOf("if (url.pathname === '/api/admin/storage/mirror-retry'", start);
const route = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'mirror job read model route exists');
assert.match(route, /if \(!authorized\(context\)\).*403/s);
assert.match(route, /allowedStatuses\.includes\(status\)/);
assert.match(route, /limit > 100/);
assert.match(route, /company_id IN \(\$\{companyIds\.map\(\(\) => '\?'\)\.join\(','\)\}\)/);
assert.match(route, /WHERE provider='microsoft_onedrive'/);
assert.match(route, /source_module AS sourceModule,status,attempt_count AS attemptCount/);
assert.match(route, /last_error_code AS lastErrorCode,created_at AS createdAt/);
assert.doesNotMatch(route, /original_name|r2_key|provider_item_id|sha256|size_bytes/);
assert.match(route, /ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'retrying' THEN 1 WHEN 'pending' THEN 2/);
assert.match(route, /\.bind\(\.\.\.\(isOwner \? \[\] : companyIds\), \.\.\.\(status \? \[status\] : \[\]\), limit\)/);

const healthStart = source.indexOf("if (url.pathname !== '/api/admin/storage/mirror-health'");
const health = source.slice(healthStart);
assert.match(health, /providerRequired: 0/);
assert.match(health, /counts\.pending \+ counts\.syncing \+ counts\.retrying \+ counts\.providerRequired/);
assert.match(health, /queued \? 'backup_pending'/);

console.log('Storage mirror Admin read model: 13/13 PASS');
