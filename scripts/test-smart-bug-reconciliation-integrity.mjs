import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/smart-bug-management.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (reconciliationImportIntegrity) {");
const end = source.indexOf("if (incidentDetail) {", start);
const detector = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'reconciliation import integrity detector is registered');
assert.match(source, /url\.pathname === '\/api\/admin\/smart-bugs\/integrity\/reconciliation-imports'/);
assert.ok(source.includes("const reconciliationImportIntegrity = url.pathname === '/api/admin/smart-bugs/integrity/reconciliation-imports'"));
assert.match(detector, /FROM financial_reconciliation_imports i/);
assert.match(detector, /i\.row_count != \(/);
assert.match(detector, /SELECT COUNT\(\*\) FROM financial_reconciliation_import_rows r WHERE r\.import_id=i\.id/);
assert.match(detector, /\$\{scopeSql\}/);
assert.match(detector, /\.bind\(\.\.\.binds\)/);
assert.match(detector, /readOnly: true/);
assert.match(detector, /importsWithRowCountMismatch: findingCount/);
assert.match(detector, /findingCount > 0 \? 'finding' : 'clear'/);
assert.doesNotMatch(detector, /INSERT |UPDATE |DELETE |provider_reference|description|amount_minor|r2_key/i);
assert.match(source, /storageMirrorIntegrity \|\| reconciliationImportIntegrity/);

console.log('Smart Bug reconciliation import integrity sentinel: 13/13 PASS');
