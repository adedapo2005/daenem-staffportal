import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0078_financial_provider_pricing_registry.sql', import.meta.url), 'utf8');
const route = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS financial_provider_pricing/);
assert.match(migration, /UNKNOWN_REVERIFY/);
assert.match(migration, /UNIQUE\(provider, service, currency\)/);
assert.match(migration, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(migration, /company-farms/);
assert.match(route, /hasPermission\(context, 'finance\.reports', 'view', companyId\)/);
assert.match(route, /role\.code === 'owner'/);
assert.match(route, /TARGET_COMPANIES\.filter/);
assert.match(route, /WHERE EXISTS\s*\([\s\S]*?scoped\.company_id IN/);
assert.match(route, /cache-control': 'no-store'/);
assert.match(entry, /routeFinancialGateway\(request,env,context\)/);

console.log('Financial pricing registry boundary: 11/11 PASS');
