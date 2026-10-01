import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/bakery-accountability.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function streamInvestigationEvidence(');
const end = source.indexOf('async function listInvestigationEvidence', start);
assert.ok(start >= 0 && end > start, 'evidence stream handler must exist');
const handler = source.slice(start, end);

assert.ok(handler.indexOf("allowed(context,'bakery.investigation','view')") < handler.indexOf('env.DB.prepare'), 'permission must be checked before evidence lookup');
assert.match(handler, /WHERE id=\? AND company_id=\?/);
assert.ok(handler.indexOf('env.FILES.get(row.filePath)') < handler.indexOf("'protected_file_read'"), 'only an existing authorized file is audited as read');
assert.match(handler, /actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id/);
assert.match(handler, /requestCorrelationId\(request\)/, 'audit must preserve request correlation');
assert.ok(handler.indexOf("'protected_file_read'") < handler.indexOf('new Response('), 'audit must succeed before file bytes are returned');
assert.match(handler, /catch\{return json\(\{error:'Evidence file is temporarily unavailable\.'\},503\)\}/, 'audit failure must fail closed');
assert.match(handler, /JSON\.stringify\(\{method:request\.method,outcome:'authorized_read',mimeType:/);
assert.doesNotMatch(handler, /JSON\.stringify\(\{[^}]*(?:filename|filePath|body|sha256|account|token)/i, 'audit metadata must not include file contents or sensitive identifiers');
assert.match(handler, /'cache-control':'private, no-store'/);

console.log('Bakery protected evidence read audit: 11/11 assertions PASS');
