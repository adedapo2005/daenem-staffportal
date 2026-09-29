import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function listSummary');
const end = source.indexOf('\nasync function listHistory', start);
assert.ok(start >= 0 && end > start, 'authenticated alert summary read model exists');
const summary = source.slice(start, end);
assert.match(summary, /if \(!canView\(context\)\).*403/s);
assert.match(summary, /const scope = companyScope\(context\)/);
assert.match(summary, /ar\.employee_id=\?/);
assert.match(summary, /status IN \('open','acknowledged','reopened'\)/);
assert.match(summary, /AS attentionCount/);
assert.match(summary, /acknowledgement_required=1/);
assert.match(summary, /ar\.acknowledged_at IS NULL OR ar\.id IS NULL/);
assert.match(summary, /MAX\(COALESCE\(ar\.created_at,a\.created_at\)\) AS latestArrivalAt/);
assert.match(source, /\/api\/alerting\/summary' && request\.method === 'GET'\) return listSummary/);
assert.doesNotMatch(summary, /summary|related_path|title|payload_json/);
console.log('Alerting summary authorization, scope and disclosure boundary: 10/10 PASS');
