import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-events')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/budgets')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'provider-cost event read model exists');
assert.match(source, /'\/api\/financial-gateway\/cost-events'/);
assert.match(endpoint, /request\.method !== 'GET'/);
assert.match(endpoint, /companyIds\.includes\(requestedCompanyId\)/);
assert.match(endpoint, /!Number\.isInteger\(limit\).*limit < 1 \|\| limit > 100/s);
assert.match(endpoint, /FROM financial_provider_cost_events\s+WHERE company_id IN \(\$\{placeholders\}\)/);
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, limit\)/);
assert.match(endpoint, /ORDER BY occurred_at DESC,id DESC/);
for (const field of ['estimated_cost_minor AS estimatedCostMinor', 'actual_cost_minor AS actualCostMinor',
  'pricing_verified_at AS pricingVerifiedAt', 'requesting_module AS requestingModule',
  'actor_employee_id AS actorEmployeeId', 'provider_reference AS providerReference']) {
  assert.ok(endpoint.includes(field), `internal finance projection includes ${field}`);
}
assert.doesNotMatch(endpoint, /provider_result|access_token|refresh_token|client_secret/i);
assert.match(endpoint, /visibleCompanyIds:\s*scopedCompanyIds/);
console.log('Financial provider-cost event read model: 13 assertions PASS');
