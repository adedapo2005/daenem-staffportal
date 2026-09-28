import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/budgets')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/estimate')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'budget read route exists before estimate handling');
assert.match(source, /TARGET_COMPANIES = \['company-printing', 'company-bakery', 'company-autos', 'company-properties', 'company-logistics'\]/);
assert.match(source, /hasPermission\(context, 'finance\.reports', 'view', companyId\)/);
assert.match(endpoint, /if \(request\.method === 'POST'\)/);
assert.match(endpoint, /if \(!owner\) return json\(\{ error: 'Owner provider-budget administration access is required\.'/);
assert.match(endpoint, /company_id,provider_scope,module_scope,period,budget_minor,currency/);
assert.match(endpoint, /budgetMinor <= 0/);
assert.match(endpoint, /alertThresholdPercent < 1 \|\| alertThresholdPercent > 100/);
assert.match(endpoint, /ON CONFLICT\(company_id,provider_scope,module_scope,period,currency\) DO UPDATE/);
assert.match(endpoint, /upsert_provider_budget/);
assert.match(endpoint, /providerCallMade: false/);
assert.match(endpoint, /request\.method !== 'GET'\) return json\(\{ error: 'Use GET or POST for provider budgets\.'/);
assert.match(endpoint, /!companyIds\.includes\(requestedCompanyId\)/);
assert.match(endpoint, /FROM financial_provider_budgets\s+WHERE company_id IN \(\$\{placeholders\}\)/);
assert.match(endpoint, /LIMIT 500/);
for (const field of ['provider_scope AS providerScope', 'module_scope AS moduleScope', 'budget_minor AS budgetMinor',
  'alert_threshold_percent AS alertThresholdPercent', 'exhausted_action AS exhaustedAction', 'active']) {
  assert.ok(endpoint.includes(field), `budget policy includes ${field}`);
}
const readModel = endpoint.slice(endpoint.indexOf('const requestedCompanyId'), endpoint.indexOf("if (url.pathname === '/api/financial-gateway/estimate'"));
assert.doesNotMatch(readModel, /provider_reference|actor_employee_id|created_by|updated_by|access_token|client_secret/i);
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds\)/);
console.log('Financial provider budget read/write boundary: PASS');
