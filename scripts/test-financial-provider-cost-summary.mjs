import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-summary')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-events')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'monthly provider-cost summary exists');
assert.match(source, /'\/api\/financial-gateway\/cost-summary'/);
assert.match(endpoint, /request\.method !== 'GET'/);
assert.ok(endpoint.includes("if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month))"), 'month filter is strictly YYYY-MM');
assert.match(endpoint, /companyIds\.includes\(requestedCompanyId\)/);
assert.match(endpoint, /const provider = url\.searchParams\.get\('provider'\)/);
assert.match(endpoint, /const module = url\.searchParams\.get\('module'\)/);
assert.ok(endpoint.includes("/^[a-z][a-z0-9_-]{0,79}$/.test(provider)"), 'provider filter is syntax-bounded');
assert.ok(endpoint.includes("/^[a-z][a-z0-9_.:-]{0,79}$/.test(module)"), 'module filter is syntax-bounded');
assert.match(endpoint, /WHERE company_id IN \(\$\{placeholders\}\) AND strftime\('%Y-%m',occurred_at\)=\?/);
assert.match(endpoint, /AND \(\? IS NULL OR provider=\?\) AND \(\? IS NULL OR requesting_module=\?\)/);
assert.match(endpoint, /GROUP BY company_id,provider,cost_currency,requesting_module/);
assert.match(endpoint, /COUNT\(actual_cost_minor\) AS actualCostEventCount/);
assert.match(endpoint, /SUM\(actual_cost_minor\) AS actualCostMinor/);
assert.match(endpoint, /SUM\(estimated_cost_minor\) AS estimatedCostMinor/);
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, month, provider, provider, module, module\)/);
assert.match(endpoint, /return json\(\{ month, provider, module, summaries:/);
assert.match(endpoint, /visibleCompanyIds: scopedCompanyIds/);
assert.doesNotMatch(endpoint, /company-farms|access_token|refresh_token|client_secret/i);

console.log('Financial provider-cost monthly summary: 17/17 PASS');
