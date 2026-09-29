import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0088_financial_provider_routing_policies.sql', import.meta.url), 'utf8');
const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/routing-policies')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/pricing/admin')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'routing policy handler is registered before other financial routes');
assert.match(migration, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(migration, /company-farms/);
assert.match(migration, /provider IN \('paystack','monnify','mono','manual_import'\)/);
assert.match(migration, /UNIQUE\(company_id,service,provider\)/);
assert.match(migration, /UNIQUE\(company_id,service,priority\)/);
assert.match(endpoint, /if \(request\.method === 'POST'\) \{\s*if \(!isOwner\).*403/s);
assert.match(endpoint, /hasPermission\(context, 'finance\.reports', 'view', id\)/);
assert.match(endpoint, /Number\.isInteger\(priority\).*priority < 1 \|\| priority > 20/);
assert.match(endpoint, /'enabled', 'disabled', 'owner_action_required'/);
assert.match(endpoint, /WHERE changes\(\)=1 AND EXISTS/);
assert.match(endpoint, /Number\(results\[0\].*meta\?\.changes.*!== 1/);
assert.match(endpoint, /save_provider_routing_policy/);
assert.match(endpoint, /providerCallMade: false/);
assert.match(endpoint, /providerExecutionEnabled: false/);
assert.doesNotMatch(endpoint, /fetch\(|Authorization|access_token|client_secret/i);

console.log('Financial provider routing policy boundaries: 16/16 PASS');
