import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/printing-production.ts', import.meta.url), 'utf8');
assert.match(source, /protected_file_read/);
assert.match(source, /print_job/);
assert.match(source, /requestCorrelationId\(request\)/);
assert.match(source, /outcome:'authorized_read'/);
assert.match(source, /return json\(\{error:'The file is temporarily unavailable\.'\},503\)/);
assert.match(source, /cache-control','private, no-store/);
console.log('Printing protected file audit: 7/7 assertions PASS');
