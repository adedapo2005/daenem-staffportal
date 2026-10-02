import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/construction.ts', import.meta.url), 'utf8');

assert.match(source, /async function audit\(request:Request/);
assert.match(source, /requestCorrelationId\(request\)\)\.run\(\)\.catch/);
assert.match(source, /'upload_evidence'.*requestCorrelationId\(request\)/);
assert.match(source, /await audit\(request,env,c,companyId,'create_project'/);
assert.match(source, /await audit\(request,env,c,p\.companyId,`add_\$\{kind\}`/);
assert.equal((source.match(/await audit\(request,env,c,/g) || []).length, 2);
console.log('Construction audit request correlation: 6/6 assertions PASS');
