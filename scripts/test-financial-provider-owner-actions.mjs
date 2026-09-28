import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0083_financial_provider_owner_actions.sql', import.meta.url), 'utf8');
const route = await readFile(new URL('../worker/financial-provider-owner-actions.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
assert.match(migration, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(migration, /company-farms|secret|token|credential/i);
for (const field of ['reason','blocked','not_blocked','clearing_evidence','status']) assert.ok(migration.includes(field));
assert.match(route, /role\.code === 'owner'/);
assert.match(route, /FROM financial_provider_owner_actions/);
assert.match(route, /financial_provider_owner_action/);
assert.match(route, /providerCallMade: false/);
assert.match(route, /company_id=excluded\.company_id AND provider=excluded\.provider AND action=excluded\.action/);
assert.doesNotMatch(route, /fetch\(|access_token|refresh_token|client_secret/i);
assert.match(entry, /routeFinancialProviderOwnerActions\(request,env,context\)/);
console.log('Financial provider Owner Action Queue boundaries: PASS');
