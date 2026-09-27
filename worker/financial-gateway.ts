import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface FinancialGatewayEnv extends AuthEnv {}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const TARGET_COMPANIES = ['company-printing', 'company-bakery', 'company-autos', 'company-properties', 'company-logistics'];

type PricingFacts = {
  pricingModel: string; fixedAmountMinor: number | null; percentageBps: number | null;
  minimumAmountMinor: number | null; maximumAmountMinor: number | null; capAmountMinor: number | null;
  vatTreatment: string; currency: string; effectiveAt: string | null; lastVerifiedAt: string | null; status: string;
};

export function estimateProviderCost(pricing: PricingFacts, input: { amountMinor?: unknown; quantity?: unknown }, now = Date.now()) {
  const amount = input.amountMinor;
  const quantity = input.quantity === undefined ? 1 : input.quantity;
  const moneyAmount = typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
  const units = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 100_000 ? quantity : null;
  const verifiedAt = pricing.lastVerifiedAt ? Date.parse(pricing.lastVerifiedAt) : NaN;
  const effectiveAt = pricing.effectiveAt ? Date.parse(pricing.effectiveAt) : NaN;
  const verified = pricing.status === 'verified' && Number.isFinite(verifiedAt) && verifiedAt <= now &&
    Number.isFinite(effectiveAt) && effectiveAt <= now && verifiedAt >= effectiveAt;
  if (!verified || (pricing.vatTreatment !== 'included' && pricing.vatTreatment !== 'not_applicable')) {
    return { decision: 'verification_required' as const, reason: 'pricing_or_vat_unverified', currency: pricing.currency };
  }
  if (pricing.pricingModel === 'FREE') return { decision: 'free' as const, estimatedCostMinor: 0, currency: pricing.currency };
  if (!units) return { decision: 'verification_required' as const, reason: 'valid_quantity_required', currency: pricing.currency };
  if (['PERCENTAGE', 'PERCENTAGE_FIXED'].includes(pricing.pricingModel) && moneyAmount === null) {
    return { decision: 'verification_required' as const, reason: 'valid_transaction_amount_required', currency: pricing.currency };
  }
  let estimate: number;
  switch (pricing.pricingModel) {
    case 'FIXED':
      if (pricing.fixedAmountMinor === null) break;
      estimate = pricing.fixedAmountMinor;
      break;
    case 'PERCENTAGE':
    case 'PERCENTAGE_FIXED': {
      if (pricing.percentageBps === null || (pricing.pricingModel === 'PERCENTAGE_FIXED' && pricing.fixedAmountMinor === null)) break;
      estimate = Math.ceil((moneyAmount as number) * pricing.percentageBps / 10_000) + (pricing.pricingModel === 'PERCENTAGE_FIXED' ? pricing.fixedAmountMinor as number : 0);
      if (pricing.minimumAmountMinor !== null) estimate = Math.max(estimate, pricing.minimumAmountMinor);
      if (pricing.maximumAmountMinor !== null) estimate = Math.min(estimate, pricing.maximumAmountMinor);
      if (pricing.capAmountMinor !== null) estimate = Math.min(estimate, pricing.capAmountMinor);
      break;
    }
    case 'PER_PAGE':
    case 'PER_REQUEST':
    case 'PER_SUCCESSFUL_REQUEST':
      if (pricing.fixedAmountMinor === null) break;
      estimate = pricing.fixedAmountMinor * units;
      break;
    default:
      return { decision: 'verification_required' as const, reason: 'pricing_model_requires_explicit_terms', currency: pricing.currency };
  }
  if (!Number.isSafeInteger(estimate!) || estimate! < 0) {
    return { decision: 'verification_required' as const, reason: 'pricing_terms_incomplete', currency: pricing.currency };
  }
  return { decision: estimate! === 0 ? 'free' as const : 'estimated' as const, estimatedCostMinor: estimate!, currency: pricing.currency };
}

export async function routeFinancialGateway(request: Request, env: FinancialGatewayEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/financial-gateway/pricing', '/api/financial-gateway/estimate', '/api/financial-gateway/budgets'].includes(url.pathname) || !['GET', 'POST'].includes(request.method)) return null;

  const owner = context.roles.some((role) => role.code === 'owner');
  const companyIds = owner
    ? TARGET_COMPANIES
    : TARGET_COMPANIES.filter((companyId) => context.companies.some((company) => company.id === companyId) && hasPermission(context, 'finance.reports', 'view', companyId));
  if (companyIds.length === 0) return json({ error: 'Financial provider-cost access is not assigned.' }, 403);

  if (url.pathname === '/api/financial-gateway/budgets') {
    if (request.method !== 'GET') return json({ error: 'Use GET to read provider budgets.' }, 405);
    const requestedCompanyId = url.searchParams.get('companyId');
    if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
      return json({ error: 'Financial provider-cost access is not assigned.' }, 403);
    }
    const scopedCompanyIds = requestedCompanyId ? [requestedCompanyId] : companyIds;
    const placeholders = scopedCompanyIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id,company_id AS companyId,provider_scope AS providerScope,
        module_scope AS moduleScope,period,budget_minor AS budgetMinor,currency,
        alert_threshold_percent AS alertThresholdPercent,exhausted_action AS exhaustedAction,
        active,created_at AS createdAt,updated_at AS updatedAt
      FROM financial_provider_budgets
      WHERE company_id IN (${placeholders})
      ORDER BY company_id,period,provider_scope,module_scope,currency,id
      LIMIT 500
    `).bind(...scopedCompanyIds).all<Record<string, unknown>>();
    return json({ budgets: rows.results || [], visibleCompanyIds: scopedCompanyIds });
  }

  if (url.pathname === '/api/financial-gateway/estimate') {
    if (request.method !== 'POST') return json({ error: 'Use POST to request a provider-cost estimate.' }, 405);
    let body: { companyId?: unknown; pricingId?: unknown; amountMinor?: unknown; quantity?: unknown };
    try { body = await request.json() as typeof body; }
    catch { return json({ error: 'Invalid provider-cost estimate request.' }, 400); }
    const companyId = typeof body.companyId === 'string' ? body.companyId : '';
    const pricingId = typeof body.pricingId === 'string' ? body.pricingId : '';
    if (!companyIds.includes(companyId) || !pricingId || pricingId.length > 160 ||
        (body.amountMinor !== undefined && (typeof body.amountMinor !== 'number' || !Number.isSafeInteger(body.amountMinor) || body.amountMinor < 0)) ||
        (body.quantity !== undefined && (typeof body.quantity !== 'number' || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 100_000))) {
      return json({ error: 'A visible business, pricing record and bounded amount or quantity are required.' }, 400);
    }
    const pricing = await env.DB.prepare(`SELECT p.pricing_model AS pricingModel,
      p.fixed_amount_minor AS fixedAmountMinor,p.percentage_bps AS percentageBps,
      p.minimum_amount_minor AS minimumAmountMinor,p.maximum_amount_minor AS maximumAmountMinor,
      p.cap_amount_minor AS capAmountMinor,p.vat_treatment AS vatTreatment,p.currency,
      p.effective_at AS effectiveAt,p.last_verified_at AS lastVerifiedAt,p.status
      FROM financial_provider_pricing p JOIN financial_provider_pricing_businesses b ON b.pricing_id=p.id
      WHERE p.id=? AND b.company_id=? AND b.available=1 LIMIT 1`)
      .bind(pricingId, companyId).first<PricingFacts>();
    if (!pricing) return json({ error: 'Pricing record was not found.' }, 404);
    return json({ companyId, pricingId, ...estimateProviderCost(pricing, body) });
  }
  if (request.method !== 'GET') return json({ error: 'Use GET to read provider pricing.' }, 405);

  const placeholders = companyIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT p.id,p.provider,p.service,p.pricing_model AS pricingModel,
      p.fixed_amount_minor AS fixedAmountMinor,p.percentage_bps AS percentageBps,
      p.minimum_amount_minor AS minimumAmountMinor,p.maximum_amount_minor AS maximumAmountMinor,
      p.cap_amount_minor AS capAmountMinor,p.vat_treatment AS vatTreatment,p.currency,
      p.effective_at AS effectiveAt,p.last_verified_at AS lastVerifiedAt,
      p.official_source AS officialSource,p.status,p.notes,
      b.company_id AS companyId,b.available AS available
    FROM financial_provider_pricing p
    LEFT JOIN financial_provider_pricing_businesses b
      ON b.pricing_id=p.id AND b.company_id IN (${placeholders})
    WHERE EXISTS (
      SELECT 1 FROM financial_provider_pricing_businesses scoped
      WHERE scoped.pricing_id=p.id AND scoped.company_id IN (${placeholders})
    )
    ORDER BY p.provider,p.service,p.currency,b.company_id
  `).bind(...companyIds, ...companyIds).all<Record<string, unknown>>();
  return json({ pricing: rows.results || [], visibleCompanyIds: companyIds });
}
