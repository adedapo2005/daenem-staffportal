import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

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
assert.match(endpoint, /FROM financial_provider_budgets b\s+WHERE b\.company_id IN \(\$\{placeholders\}\)/);
assert.match(endpoint, /LIMIT 500/);
for (const field of ['provider_scope AS providerScope', 'module_scope AS moduleScope', 'budget_minor AS budgetMinor',
  'alert_threshold_percent AS alertThresholdPercent', 'exhausted_action AS exhaustedAction', 'active']) {
  assert.ok(endpoint.includes(field), `budget policy includes ${field}`);
}
const readModel = endpoint.slice(endpoint.indexOf('const requestedCompanyId'), endpoint.indexOf("if (url.pathname === '/api/financial-gateway/estimate'"));
assert.doesNotMatch(readModel, /provider_reference|actor_employee_id|created_by|updated_by|access_token|client_secret/i);
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds\)/);
assert.match(endpoint, /SUM\(e\.actual_cost_minor\)/);
assert.match(endpoint, /e\.company_id=b\.company_id AND e\.cost_currency=b\.currency/);
assert.match(endpoint, /WHEN 'daily' THEN date\('now','start of day'\)\s+ELSE date\('now','start of month'\)/);
assert.match(endpoint, /b\.provider_scope='\*' OR e\.provider=b\.provider_scope/);
assert.match(endpoint, /b\.module_scope='\*' OR e\.requesting_module=b\.module_scope/);
assert.match(endpoint, /const usage = budgetUsage\(actualSpentMinor, budgetMinor, alertThresholdPercent, Boolean\(budget\.active\)\)/);
assert.match(source, /spent \* 100n >= budget \* BigInt\(alertThresholdPercent\)/);
assert.match(source, /utilization = spent \* 100n \/ budget/);
const helper = source.slice(source.indexOf('function budgetUsage'), source.indexOf('\nexport function estimateProviderCost'));
const javascript = ts.transpileModule(`${helper}\nexport { budgetUsage };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { budgetUsage } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
assert.deepEqual(budgetUsage(90_071_992_547_409, 90_071_992_547_410, 100, true),
  { utilizationPercent: 99, thresholdReached: false });
assert.deepEqual(budgetUsage(90_071_992_547_410, 90_071_992_547_410, 100, true),
  { utilizationPercent: 100, thresholdReached: true });
assert.deepEqual(budgetUsage(Number.MAX_SAFE_INTEGER, 1, 80, true),
  { utilizationPercent: Number.MAX_SAFE_INTEGER, thresholdReached: true });
assert.deepEqual(budgetUsage(Number.MAX_SAFE_INTEGER + 1, 100, 80, true),
  { utilizationPercent: null, thresholdReached: true });
console.log('Financial provider budget read/write boundary: PASS');
