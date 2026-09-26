import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function saveRule');
const end = source.indexOf('\nexport async function routeAlerting', start);
const saveRule = source.slice(start, end);
const scopeStart = source.indexOf('function companyScope(');
const scopeEnd = source.indexOf('\n}', scopeStart);
const companyScope = source.slice(scopeStart, scopeEnd);

assert.match(companyScope, /if \(owner\(context\)\) return \{ sql: '', values: \[\] as string\[\] \}/);
assert.doesNotMatch(companyScope, /if \(canManage\(context\)\) return \{ sql: '', values: \[\] as string\[\] \}/);
assert.match(companyScope, /const ids = context\.companies\.map\(\(company\) => company\.id\)/);

assert.match(saveRule, /SELECT company_id companyId FROM platform_alert_rules WHERE id=\?/);
assert.match(saveRule, /body\.id !== undefined && \(typeof body\.id !== 'string' \|\| !body\.id\.trim\(\)\)/);
assert.match(saveRule, /if \(!existing\) return json\(\{ error: 'Alert rule not found\.' \}, 404\)/);
assert.match(saveRule, /if \(!owner\(context\) && \(!existing\.companyId \|\| !context\.companies\.some\(\(company\) => company\.id === existing\.companyId\)\)\)/);
assert.match(saveRule, /if \(!owner\(context\) && existing\.companyId !== companyId\)/);
assert.match(saveRule, /const id = requestedId \|\| uid\('alert-rule'\)/);
console.log('Alert rule update company scope: 6/6 PASS');
