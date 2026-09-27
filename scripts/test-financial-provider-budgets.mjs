import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../migrations/0080_financial_provider_budgets.sql', import.meta.url), 'utf8');

assert.match(source, /CREATE TABLE IF NOT EXISTS financial_provider_budgets/);
assert.match(source, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(source, /company-farms/);
assert.match(source, /period IN \('monthly','daily'\)/);
assert.match(source, /budget_minor INTEGER NOT NULL CHECK \(budget_minor > 0\)/);
assert.match(source, /alert_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK \(alert_threshold_percent BETWEEN 1 AND 100\)/);
assert.match(source, /exhausted_action IN \('require_approval','block_noncritical'\)/);
assert.match(source, /UNIQUE\(company_id, provider_scope, module_scope, period, currency\)/);
assert.match(source, /created_by TEXT REFERENCES employees\(id\)/);
assert.match(source, /updated_by TEXT REFERENCES employees\(id\)/);
assert.doesNotMatch(source, /INSERT INTO financial_provider_budgets/);
assert.doesNotMatch(source, /company_id[^\n]*company-farms/i);

console.log('Financial provider budget schema boundary: 11/11 PASS');
