import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0082_financial_provider_group_budgets.sql', import.meta.url), 'utf8');
const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/budgets')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/estimate')", start);
const endpoint = source.slice(start, end);

assert.match(migration, /CREATE TABLE IF NOT EXISTS financial_provider_group_budgets/);
assert.match(migration, /period IN \('monthly','daily'\)/);
assert.match(migration, /UNIQUE\(provider_scope, module_scope, period, currency\)/);
assert.doesNotMatch(migration, /company-farms/);
assert.match(endpoint, /const groupBudget = companyId === 'group'/);
assert.match(endpoint, /if \(!owner\) return json\(\{ error: 'Owner provider-budget administration access is required\.'/);
assert.match(endpoint, /INSERT INTO financial_provider_group_budgets/);
assert.match(endpoint, /upsert_provider_group_budget/);
assert.match(endpoint, /if \(owner\) \{[\s\S]*?FROM financial_provider_group_budgets b/);
assert.match(endpoint, /e\.company_id IN \(\$\{TARGET_COMPANIES\.map\(\(\) => '\?'\)\.join\(','\)\}\)/);
assert.match(endpoint, /\.bind\(\.\.\.TARGET_COMPANIES\)/);
assert.match(endpoint, /companyId: 'group'/);
assert.match(endpoint, /thresholdReached: Boolean\(budget\.active\)/);

console.log('Financial provider group budget boundary: PASS');
