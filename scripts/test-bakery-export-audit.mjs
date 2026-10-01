import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/bakery-accountability.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function exportReport(');
const end = source.indexOf('\nexport async function routeBakeryAccountability', start);
assert.ok(start >= 0 && end > start, 'Bakery export handler must exist');
const handler = source.slice(start, end);

assert.ok(handler.indexOf("accountabilityReports(request,env,context)") >= 0, 'export must reuse the governed report projection');
assert.match(handler, /if\(!capabilities\.flour\)return json\(\{error:'Flour Usage Report permission is required\.'\},403\)/);
assert.match(handler, /'export_report','bakery_accountability_report'/);
assert.match(handler, /actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id/);
assert.match(handler, /COMPANY,[\s\S]*requestCorrelationId\(request\)/, 'export audit must be company-scoped and request-correlated');
assert.match(handler, /JSON\.stringify\(\{format:'csv',section,dateFrom:report\.dateFrom,dateTo:report\.dateTo,rowCount:rows\.length\}\)/, 'audit metadata must remain bounded');
const auditMetadata = handler.slice(handler.indexOf('JSON.stringify({format:\'csv\''), handler.indexOf('JSON.stringify({format:\'csv\'') + 140);
assert.doesNotMatch(auditMetadata, /(?:body|content|reference|account|token|filename)/i, 'audit metadata must not include export contents or sensitive row values');
assert.ok(handler.indexOf("'export_report'") < handler.indexOf('new Response(csv'), 'audit must succeed before export bytes are returned');
assert.match(handler, /catch\{return json\(\{error:'The report is temporarily unavailable\.'\},503\)\}/, 'audit failure must fail closed');

console.log('Bakery accountability CSV export audit: 9/9 assertions PASS');
