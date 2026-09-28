import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../migrations/0084_financial_reconciliation_imports.sql', import.meta.url), 'utf8');
assert.match(source, /CREATE TABLE IF NOT EXISTS financial_reconciliation_imports/);
assert.match(source, /CREATE TABLE IF NOT EXISTS financial_reconciliation_import_rows/);
assert.match(source, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(source, /company-farms/);
assert.match(source, /source_type IN \('provider_api','provider_webhook','csv','excel','manual'\)/);
assert.match(source, /UNIQUE\(company_id, source_type, idempotency_key\)/);
assert.match(source, /UNIQUE\(import_id, row_number\)/);
for (const state of ['unmatched','partial','exact','overpayment','duplicate','reversed','refunded']) {
  assert.ok(source.includes(`'${state}'`), `missing reconciliation state ${state}`);
}
assert.match(source, /file_sha256 TEXT CHECK/);
assert.match(source, /amount_minor INTEGER NOT NULL CHECK \(amount_minor >= 0\)/);
assert.match(source, /-- Provider-neutral statement import staging\.[\s\S]*?do not create or alter a business ledger transaction/);
assert.doesNotMatch(source, /INSERT INTO (sales|purchase|payroll|finance)_/i);
console.log('Financial reconciliation import schema: 18 assertions PASS');
