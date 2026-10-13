import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const routeStart = source.indexOf('const reconciliationReview =');
const routeEnd = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-summary')", routeStart);
const route = source.slice(routeStart, routeEnd);

assert.ok(routeStart >= 0 && routeEnd > routeStart, 'reconciliation review route exists');
assert.match(source, /!reconciliationImportDetail && !reconciliationReview/);
assert.match(route, /if \(!owner\).*Owner reconciliation review access is required/);
assert.match(route, /companyIds\.includes\(companyId\)/);
assert.match(route, /\['unmatched', 'partial', 'exact', 'overpayment', 'duplicate', 'reversed', 'refunded'\]/);
assert.match(route, /nextStatus !== 'unmatched' && !candidateReference/);
assert.match(route, /UPDATE financial_reconciliation_import_rows[\s\S]*reconciliation_status=\?[\s\S]*candidate_reference IS \?[\s\S]*EXISTS\(SELECT 1 FROM financial_reconciliation_imports WHERE id=\? AND company_id=\?\)/);
assert.match(route, /expectedStatus, expectedCandidateReference/);
assert.match(route, /INSERT INTO audit_logs[\s\S]*before_json,after_json[\s\S]*review_reconciliation_row/);
assert.match(route, /WHERE changes\(\)=1/);
assert.match(route, /const auditId = `audit-\$\{crypto\.randomUUID\(\)\}`/);
assert.match(route, /SET reconciliation_status=NULL[\s\S]*NOT EXISTS\(SELECT 1 FROM audit_logs WHERE id=\?/);
assert.match(route, /could not be saved with its required audit evidence[\s\S]*503/);
assert.match(route, /reconciliation row was not found or changed/);
assert.doesNotMatch(route, /INSERT INTO (journal_entries|journal_lines|receivables|sales_|payroll_)/);
assert.doesNotMatch(route, /fetch\(|\.send\(/);

console.log('Financial reconciliation row review: 12 assertions PASS');
