import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/reconciliation-imports')");
const end = source.indexOf("if (reconciliationImportDetail && request.method === 'GET')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'reconciliation import endpoint exists');
assert.match(endpoint, /if \(request\.method === 'POST'\)/);
assert.match(endpoint, /if \(!owner\).*Owner reconciliation-import access is required/);
assert.match(endpoint, /companyIds\.includes\(companyId\)/);
assert.match(endpoint, /inputRows\.length > 100/);
assert.match(endpoint, /\['provider_api','provider_webhook','csv','excel','manual'\]/);
assert.match(endpoint, /\['credit','debit'\]/);
assert.match(endpoint, /\^\[A-Z\]\{3\}\$/);
assert.match(endpoint, /WHERE company_id=\? AND source_type=\? AND idempotency_key=\?/);
assert.match(endpoint, /different reconciliation evidence/);
assert.match(endpoint, /catch \{[\s\S]*?const replayImport = await env\.DB\.prepare/);
assert.match(endpoint, /JSON\.stringify\(replayRows\.results \|\| \[\]\) === JSON\.stringify\(rows\)/);
assert.match(endpoint, /sameEvidence[\s\S]*?idempotentReplay: true, providerCallMade: false/);
assert.match(endpoint, /sameEvidence[\s\S]*?different reconciliation evidence/);
assert.match(endpoint, /INSERT INTO financial_reconciliation_imports/);
assert.match(endpoint, /INSERT INTO financial_reconciliation_import_rows/);
assert.match(endpoint, /stage_reconciliation_import/);
assert.match(endpoint, /providerCallMade: false/);
assert.doesNotMatch(endpoint, /INSERT INTO (journal_entries|journal_lines|receivables|sales_|payroll_)/);
assert.doesNotMatch(endpoint, /fetch\(|\.send\(/);
console.log('Financial reconciliation import staging: 16 assertions PASS');
