import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/budgets')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/estimate')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'budget read route exists before estimate handling');
assert.match(source, /TARGET_COMPANIES = \['company-printing', 'company-bakery', 'company-autos', 'company-properties', 'company-logistics'\]/);
assert.match(source, /hasPermission\(context, 'finance\.reports', 'view', companyId\)/);
assert.match(endpoint, /request\.method !== 'GET'/);
assert.match(endpoint, /!companyIds\.includes\(requestedCompanyId\)/);
assert.match(endpoint, /FROM financial_provider_budgets\s+WHERE company_id IN \(\$\{placeholders\}\)/);
assert.match(endpoint, /LIMIT 500/);
for (const field of ['provider_scope AS providerScope', 'module_scope AS moduleScope', 'budget_minor AS budgetMinor',
  'alert_threshold_percent AS alertThresholdPercent', 'exhausted_action AS exhaustedAction', 'active']) {
  assert.ok(endpoint.includes(field), `budget policy includes ${field}`);
}
assert.doesNotMatch(endpoint, /provider_reference|actor_employee_id|created_by|updated_by|access_token|client_secret/i);
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds\)/);
console.log('Financial provider budget read model: 12/12 assertions PASS');
