import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const matcherStart = source.indexOf('const reconciliationImportDetail =');
const matcherEnd = source.indexOf("if (url.pathname === '/api/financial-gateway/pricing/admin')", matcherStart);
const routeStart = source.indexOf("if (reconciliationImportDetail && request.method === 'GET')");
const routeEnd = source.indexOf("if (reconciliationReview && request.method === 'POST')", routeStart);
const matcher = source.slice(matcherStart, matcherEnd);
const route = source.slice(routeStart, routeEnd);

assert.ok(matcherStart >= 0 && matcherEnd > matcherStart && routeStart >= 0 && routeEnd > routeStart, 'scoped reconciliation detail route exists');
assert.match(matcher, /reconciliation-imports\\\/\(\[A-Za-z0-9:_-\]\{1,160\}\)/);
assert.match(route, /if \(requestedCompanyId && !companyIds\.includes\(requestedCompanyId\)\)/);
assert.match(route, /WHERE id=\? AND company_id IN \(\$\{placeholders\}\)/);
assert.match(route, /if \(!reconciliationImport\).*404/s);
assert.match(route, /FROM financial_reconciliation_import_rows[\s\S]*WHERE import_id=\? ORDER BY row_number LIMIT 100/);
assert.match(route, /reconciliation_status AS reconciliationStatus/);
assert.match(route, /candidate_reference AS candidateReference/);
assert.doesNotMatch(route, /INSERT INTO|UPDATE financial_|fetch\(|\.send\(/);
console.log('Financial reconciliation import detail read model: 9 assertions PASS');
