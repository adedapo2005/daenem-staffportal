import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/construction.ts', import.meta.url), 'utf8');

assert.match(source, /function audit\(request:Request/);
assert.match(source, /requestCorrelationId\(request\)\)\}\n/);
assert.doesNotMatch(source, /audit\([^\n]*\.catch\(/);
assert.match(source, /'upload_evidence'.*requestCorrelationId\(request\)/);
assert.match(source, /await env\.DB\.batch\(\[env\.DB\.prepare\(`INSERT INTO construction_projects[\s\S]*?audit\(request,env,c,companyId,'create_project'/);
assert.match(source, /writes\.push\(audit\(request,env,c,p\.companyId,`add_\$\{kind\}`/);
assert.match(source, /writes\.push\(env\.DB\.prepare\(`INSERT INTO construction_progress_updates/);
assert.match(source, /writes\.push\(audit\(request,env,c,p\.companyId[\s\S]*?await env\.DB\.batch\(writes\)/);
assert.equal((source.match(/audit\(request,env,c,/g) || []).length, 2);
console.log('Construction audit durability and request correlation: 9/9 assertions PASS');
