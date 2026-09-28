import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/reconciliation-imports')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-summary')", start);
const endpoint = source.slice(start, end);
const readModel = endpoint.slice(endpoint.indexOf("if (request.method !== 'GET')"));

assert.ok(start >= 0 && end > start, 'reconciliation import read model exists');
assert.match(source, /'\/api\/financial-gateway\/reconciliation-imports'/);
assert.match(readModel, /request\.method !== 'GET'/);
assert.match(readModel, /companyIds\.includes\(requestedCompanyId\)/);
assert.match(readModel, /Choose between 1 and 100 reconciliation imports/);
assert.match(readModel, /\['staged', 'review_required', 'reviewed', 'cancelled'\]/);
assert.match(readModel, /i\.company_id IN \(\$\{placeholders\}\)/);
assert.match(readModel, /unmatchedCount/);
assert.match(readModel, /partialCount/);
assert.match(readModel, /resolvedCount/);
assert.match(readModel, /visibleCompanyIds: scopedCompanyIds/);
assert.doesNotMatch(readModel, /INSERT INTO|UPDATE financial_reconciliation|sales_|payroll_|provider_reference|description/);
console.log('Financial reconciliation import read model: 12 assertions PASS');
