import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const migration = await readFile(new URL('../migrations/0078_financial_provider_pricing_registry.sql', import.meta.url), 'utf8');
const route = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');

assert.match(migration, /CREATE TABLE IF NOT EXISTS financial_provider_pricing/);
assert.match(migration, /UNKNOWN_REVERIFY/);
assert.match(migration, /UNIQUE\(provider, service, currency\)/);
const revisionMigration = await readFile(new URL('../migrations/0086_financial_provider_pricing_revision.sql', import.meta.url), 'utf8');
assert.match(revisionMigration, /ADD COLUMN revision INTEGER NOT NULL DEFAULT 1/);
assert.match(revisionMigration, /ADD COLUMN pricing_revision INTEGER/);
assert.match(migration, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(migration, /company-farms/);
assert.match(route, /hasPermission\(context, 'finance\.reports', 'view', companyId\)/);
assert.match(route, /role\.code === 'owner'/);
assert.match(route, /TARGET_COMPANIES\.filter/);
assert.match(route, /WHERE EXISTS\s*\([\s\S]*?scoped\.company_id IN/);
assert.match(route, /cache-control': 'no-store'/);
assert.match(entry, /routeFinancialGateway\(request,env,context\)/);
assert.match(route, /export function estimateProviderCost/);
assert.match(route, /\/api\/financial-gateway\/pricing\/admin/);
assert.match(route, /Owner pricing administration access is required/);
assert.match(route, /new Set\(companies\)\.size !== companies\.length/);
assert.match(route, /minimum != null && \(\(maximum != null && maximum < minimum\) \|\| \(cap != null && cap < minimum\)\)/);
assert.match(route, /PRICING_COMPANIES\.has\(company\)/);
assert.match(route, /status === 'verified' && \(vatTreatment === 'unknown'[\s\S]*?pricingTermsComplete\)/);
assert.match(route, /pricingModel === 'TIERED' \|\| pricingModel === 'UNKNOWN_REVERIFY' \|\| !pricingTermsComplete/);
assert.match(route, /INSERT INTO audit_logs[\s\S]*?financial_provider_pricing/);
assert.match(route, /availableBusinesses: companies, providerCallMade: false/);
assert.doesNotMatch(route.slice(route.indexOf('async function maintainPricing'), route.indexOf('\nexport async function routeFinancialGateway')), /fetch\(|.send\(/);
assert.match(route, /pricing\.status === 'verified'/);
assert.match(route, /revision=financial_provider_pricing\.revision\+1/);
assert.match(route, /pricingRevision: pricing\.revision/);
assert.match(route, /verifiedAt >= effectiveAt/);
assert.match(route, /pricing_or_vat_unverified/);
assert.match(route, /pricingModel === 'FREE'/);
assert.match(route, /freePricingHasFeeTerms[\s\S]*?freePricingHasFeeTerms \|\|/);
assert.match(route, /pricing_model_requires_explicit_terms/);
assert.match(route, /\/api\/financial-gateway\/estimate/);
assert.match(route, /b\.company_id=\? AND b\.available=1/);
assert.match(route, /estimateProviderCost\(pricing, body\)/);
assert.doesNotMatch(route.slice(route.indexOf("if (url.pathname === '/api/financial-gateway/estimate')"), route.indexOf("if (request.method !== 'GET')")), /fetch\(|\.put\(|\.send\(/);

const estimator = route.slice(route.indexOf('export function estimateProviderCost'), route.indexOf('\nconst PRICING_MODELS'));
const javascript = ts.transpileModule(estimator, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { estimateProviderCost } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const verified = { pricingModel: 'PERCENTAGE_FIXED', fixedAmountMinor: 25, percentageBps: 150,
  minimumAmountMinor: 0, maximumAmountMinor: 500, capAmountMinor: 400, vatTreatment: 'included',
  currency: 'NGN', effectiveAt: '2026-01-01T00:00:00.000Z', lastVerifiedAt: '2026-09-01T00:00:00.000Z', status: 'verified' };
assert.deepEqual(estimateProviderCost(verified, { amountMinor: 10001 }, Date.parse('2026-09-27T00:00:00Z')),
  { decision: 'estimated', estimatedCostMinor: 176, currency: 'NGN' });
assert.deepEqual(estimateProviderCost({ ...verified, minimumAmountMinor: 401 }, { amountMinor: 10001 }, Date.parse('2026-09-27T00:00:00Z')),
  { decision: 'verification_required', reason: 'pricing_bounds_conflict', currency: 'NGN' });
assert.deepEqual(estimateProviderCost({ ...verified, pricingModel: 'PERCENTAGE', fixedAmountMinor: null,
  percentageBps: 138, minimumAmountMinor: null, maximumAmountMinor: null, capAmountMinor: null },
  { amountMinor: 9007199254144565 }, Date.parse('2026-09-27T00:00:00Z')),
  { decision: 'estimated', estimatedCostMinor: 124299349707195, currency: 'NGN' });
assert.deepEqual(estimateProviderCost({ ...verified, pricingModel: 'FREE', fixedAmountMinor: null, percentageBps: null,
  minimumAmountMinor: null, maximumAmountMinor: null, capAmountMinor: null, vatTreatment: 'not_applicable' }, {}, Date.parse('2026-09-27T00:00:00Z')),
  { decision: 'free', estimatedCostMinor: 0, currency: 'NGN' });
assert.deepEqual(estimateProviderCost({ ...verified, pricingModel: 'FREE', vatTreatment: 'not_applicable' }, {}, Date.parse('2026-09-27T00:00:00Z')),
  { decision: 'verification_required', reason: 'free_pricing_has_fee_terms', currency: 'NGN' });
assert.equal(estimateProviderCost({ ...verified, pricingModel: 'TIERED' }, {}, Date.parse('2026-09-27T00:00:00Z')).decision, 'verification_required');
assert.equal(estimateProviderCost({ ...verified, lastVerifiedAt: '2025-12-01T00:00:00.000Z' }, { amountMinor: 10001 }, Date.parse('2026-09-27T00:00:00Z')).decision, 'verification_required');
console.log('Financial pricing registry and estimate boundary: PASS');
