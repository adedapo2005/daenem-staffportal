import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function saveRule');
const end = source.indexOf('\nexport async function routeAlerting', start);
const saveRule = source.slice(start, end);
const rulesStart = source.indexOf('async function listRules');
const rulesEnd = source.indexOf('\nasync function saveRule', rulesStart);
const listRules = source.slice(rulesStart, rulesEnd);
const scopeStart = source.indexOf('function companyScope(');
const scopeEnd = source.indexOf('\n}', scopeStart);
const companyScope = source.slice(scopeStart, scopeEnd);

assert.match(companyScope, /if \(owner\(context\)\) return \{ sql: '', values: \[\] as string\[\] \}/);
assert.doesNotMatch(companyScope, /if \(canManage\(context\)\) return \{ sql: '', values: \[\] as string\[\] \}/);
assert.match(companyScope, /const ids = context\.companies\.map\(\(company\) => company\.id\)/);

assert.match(listRules, /const companyIds = \[\.\.\.new Set\(context\.companies\.map\(\(company\) => company\.id\)\)\]/);
assert.match(listRules, /if \(!owner\(context\) && companyIds\.length === 0\) return json\(\{ rules: \[\] \}\)/);
assert.match(listRules, /const scopeSql = owner\(context\) \? '' : `WHERE company_id IN/);
assert.match(listRules, /FROM platform_alert_rules \$\{scopeSql\}/);
assert.match(listRules, /\.bind\(\.\.\.\(owner\(context\) \? \[\] : companyIds\)\)/);

assert.match(saveRule, /SELECT company_id companyId FROM platform_alert_rules WHERE id=\?/);
assert.match(saveRule, /body\.id !== undefined && \(typeof body\.id !== 'string' \|\| !body\.id\.trim\(\)\)/);
assert.match(saveRule, /if \(!existing\) return json\(\{ error: 'Alert rule not found\.' \}, 404\)/);
assert.match(saveRule, /if \(!owner\(context\) && \(!existing\.companyId \|\| !context\.companies\.some\(\(company\) => company\.id === existing\.companyId\)\)\)/);
assert.match(saveRule, /if \(!owner\(context\) && existing\.companyId !== companyId\)/);
assert.match(saveRule, /selector\.type !== 'business'[\s\S]*?company\.id === selector\.id/);
assert.match(saveRule, /Business recipient access is not assigned\./);
assert.match(saveRule, /if \(!owner\(context\) && Array\.isArray\(recipients\)[\s\S]*?selector\.id !== companyId/);
assert.match(saveRule, /const id = requestedId \|\| uid\('alert-rule'\)/);
assert.match(saveRule, /if \(!owner\(context\) && !companyId\) return json\(\{ error: 'Company access is not assigned\.' \}, 403\)/);
console.log('Alert rule company and business recipient scope: 15/15 PASS');
