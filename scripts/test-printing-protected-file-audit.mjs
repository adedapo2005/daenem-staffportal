import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/printing-production.ts', import.meta.url), 'utf8');
assert.match(source, /protected_file_read/);
assert.match(source, /print_job/);
assert.match(source, /requestCorrelationId\(request\)/);
assert.match(source, /outcome:'authorized_read'/);
assert.match(source, /return json\(\{error:'The file is temporarily unavailable\.'\},503\)/);
assert.match(source, /cache-control','private, no-store/);
const uploadStart = source.indexOf('async function upload(');
const uploadEnd = source.indexOf('async function fileResponse(', uploadStart);
assert.ok(uploadStart >= 0 && uploadEnd > uploadStart, 'printing upload handler must exist');
const uploadHandler = source.slice(uploadStart, uploadEnd);
assert.match(uploadHandler, /'upload_file'/);
assert.match(uploadHandler, /after_json,source,request_id/);
assert.match(uploadHandler, /requestCorrelationId\(request\)/, 'upload audit must preserve request correlation');
console.log('Printing protected file and upload audit: 10/10 assertions PASS');
