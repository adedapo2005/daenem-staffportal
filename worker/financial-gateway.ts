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
  if (pricing.pricingModel === 'FREE') {
    const hasConflictingFeeTerms = pricing.fixedAmountMinor !== null || pricing.percentageBps !== null ||
      pricing.minimumAmountMinor !== null || pricing.maximumAmountMinor !== null || pricing.capAmountMinor !== null;
    if (hasConflictingFeeTerms) {
      return { decision: 'verification_required' as const, reason: 'free_pricing_has_fee_terms', currency: pricing.currency };
    }
    return { decision: 'free' as const, estimatedCostMinor: 0, currency: pricing.currency };
  }
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

const PRICING_MODELS = ['FREE', 'FIXED', 'PERCENTAGE', 'PERCENTAGE_FIXED', 'TIERED', 'PER_PAGE', 'PER_REQUEST', 'PER_SUCCESSFUL_REQUEST', 'UNKNOWN_REVERIFY'];
const PRICING_COMPANIES = new Set(TARGET_COMPANIES);

async function maintainPricing(request: Request, env: FinancialGatewayEnv, context: SessionContext) {
  if (!context.roles.some((role) => role.code === 'owner')) return json({ error: 'Owner pricing administration access is required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: 'Invalid provider pricing record.' }, 400); }
  const id = typeof body.id === 'string' && body.id.length <= 160 ? body.id : '';
  const provider = typeof body.provider === 'string' ? body.provider.trim() : '';
  const service = typeof body.service === 'string' ? body.service.trim() : '';
  const pricingModel = typeof body.pricingModel === 'string' ? body.pricingModel : '';
  const currency = typeof body.currency === 'string' ? body.currency : '';
  const vatTreatment = typeof body.vatTreatment === 'string' ? body.vatTreatment : '';
  const status = typeof body.status === 'string' ? body.status : '';
  const officialSource = typeof body.officialSource === 'string' ? body.officialSource.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const companies = body.businesses;
  const effectiveAt = body.effectiveAt == null ? null : body.effectiveAt;
  const lastVerifiedAt = body.lastVerifiedAt == null ? null : body.lastVerifiedAt;
  const integerOrNull = (value: unknown) => value === null || value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
  const dateOrNull = (value: unknown) => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  const fixed = body.fixedAmountMinor;
  const pct = body.percentageBps;
  const minimum = body.minimumAmountMinor;
  const maximum = body.maximumAmountMinor;
  const cap = body.capAmountMinor;
  const hasFixedRate = pricingModel === 'FIXED' || ['PER_PAGE', 'PER_REQUEST', 'PER_SUCCESSFUL_REQUEST'].includes(pricingModel);
  const hasPercentageRate = pricingModel === 'PERCENTAGE' || pricingModel === 'PERCENTAGE_FIXED';
  const pricingTermsComplete = pricingModel === 'FREE' ||
    (hasFixedRate && fixed != null) ||
    (hasPercentageRate && pct != null && (pricingModel !== 'PERCENTAGE_FIXED' || fixed != null));
  const freePricingHasFeeTerms = pricingModel === 'FREE' &&
    [fixed, pct, minimum, maximum, cap].some((value) => value !== null && value !== undefined);
  if (!id || !/^[A-Za-z0-9:_-]{1,160}$/.test(id) || !provider || provider.length > 80 || !service || service.length > 120 ||
      !PRICING_MODELS.includes(pricingModel) || !/^[A-Z]{3}$/.test(currency) ||
      !['included', 'excluded', 'not_applicable', 'unknown'].includes(vatTreatment) ||
      !['verified', 'unknown_reverify', 'inactive'].includes(status) ||
      !Array.isArray(companies) || companies.length < 1 || companies.length > TARGET_COMPANIES.length ||
      companies.some((company) => typeof company !== 'string' || !PRICING_COMPANIES.has(company)) || new Set(companies).size !== companies.length ||
      !integerOrNull(fixed) || !integerOrNull(minimum) || !integerOrNull(maximum) || !integerOrNull(cap) ||
      freePricingHasFeeTerms ||
      pct !== null && pct !== undefined && (typeof pct !== 'number' || !Number.isSafeInteger(pct) || pct < 0 || pct > 10_000) ||
      minimum != null && maximum != null && Number(maximum) < Number(minimum) ||
      !dateOrNull(effectiveAt) || !dateOrNull(lastVerifiedAt) ||
      officialSource.length > 500 || (officialSource && (() => { try { return new URL(officialSource).protocol !== 'https:'; } catch { return true; } })()) ||
      notes.length > 1000 || (status === 'verified' && (vatTreatment === 'unknown' || !effectiveAt || !lastVerifiedAt || !officialSource ||
        pricingModel === 'TIERED' || pricingModel === 'UNKNOWN_REVERIFY' || !pricingTermsComplete))) {
    return json({ error: 'Provider pricing fields, verified source and business availability must be valid and bounded.' }, 400);
  }
  const facts = {
    provider, service, pricingModel,
    fixedAmountMinor: fixed ?? null, percentageBps: pct ?? null,
    minimumAmountMinor: minimum ?? null, maximumAmountMinor: maximum ?? null, capAmountMinor: cap ?? null,
    vatTreatment, currency, effectiveAt, lastVerifiedAt, officialSource: officialSource || null,
    status, notes: notes || null,
  };
  const existing = await env.DB.prepare('SELECT id FROM financial_provider_pricing WHERE id=? LIMIT 1').bind(id).first<{ id: string }>();
  if (!existing) {
    const conflict = await env.DB.prepare('SELECT id FROM financial_provider_pricing WHERE provider=? AND service=? AND currency=? LIMIT 1').bind(provider, service, currency).first<{ id: string }>();
    if (conflict) return json({ error: 'A pricing record already exists for this provider, service and currency.' }, 409);
  }
  const statements = [
    env.DB.prepare(`INSERT INTO financial_provider_pricing(
      id,provider,service,pricing_model,fixed_amount_minor,percentage_bps,minimum_amount_minor,maximum_amount_minor,cap_amount_minor,
      vat_treatment,currency,effective_at,last_verified_at,official_source,status,notes
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      provider=excluded.provider,service=excluded.service,pricing_model=excluded.pricing_model,
      fixed_amount_minor=excluded.fixed_amount_minor,percentage_bps=excluded.percentage_bps,
      minimum_amount_minor=excluded.minimum_amount_minor,maximum_amount_minor=excluded.maximum_amount_minor,
      cap_amount_minor=excluded.cap_amount_minor,vat_treatment=excluded.vat_treatment,currency=excluded.currency,
      effective_at=excluded.effective_at,last_verified_at=excluded.last_verified_at,official_source=excluded.official_source,
      status=excluded.status,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`)
      .bind(id, provider, service, pricingModel, facts.fixedAmountMinor, facts.percentageBps, facts.minimumAmountMinor,
        facts.maximumAmountMinor, facts.capAmountMinor, vatTreatment, currency, effectiveAt, lastVerifiedAt,
        facts.officialSource, status, facts.notes),
    ...TARGET_COMPANIES.map((companyId) => env.DB.prepare(`INSERT INTO financial_provider_pricing_businesses(pricing_id,company_id,available)
      VALUES(?,?,?) ON CONFLICT(pricing_id,company_id) DO UPDATE SET available=excluded.available`)
      .bind(id, companyId, (companies as string[]).includes(companyId) ? 1 : 0)),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
      VALUES(?,?,NULL,'financial_gateway',?,'financial_provider_pricing',?,?,'web')`)
      .bind(`audit-${crypto.randomUUID()}`, context.employee.id, existing ? 'update_provider_pricing' : 'create_provider_pricing', id,
        JSON.stringify({ ...facts, availableBusinesses: companies })),
  ];
  try { await env.DB.batch(statements); }
  catch { return json({ error: 'Provider pricing could not be saved. Check for an existing provider/service/currency record.' }, 409); }
  return json({ ok: true, id, status, availableBusinesses: companies, providerCallMade: false });
}

export async function routeFinancialGateway(request: Request, env: FinancialGatewayEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!['/api/financial-gateway/pricing', '/api/financial-gateway/pricing/admin', '/api/financial-gateway/estimate', '/api/financial-gateway/budgets', '/api/financial-gateway/cost-events'].includes(url.pathname) || !['GET', 'POST'].includes(request.method)) return null;

  if (url.pathname === '/api/financial-gateway/pricing/admin') {
    if (request.method !== 'POST') return json({ error: 'Use POST to maintain provider pricing.' }, 405);
    return maintainPricing(request, env, context);
  }

  const owner = context.roles.some((role) => role.code === 'owner');
  const companyIds = owner
    ? TARGET_COMPANIES
    : TARGET_COMPANIES.filter((companyId) => context.companies.some((company) => company.id === companyId) && hasPermission(context, 'finance.reports', 'view', companyId));
  if (companyIds.length === 0) return json({ error: 'Financial provider-cost access is not assigned.' }, 403);

  if (url.pathname === '/api/financial-gateway/cost-events') {
    if (request.method !== 'GET') return json({ error: 'Use GET to read provider-cost events.' }, 405);
    const requestedCompanyId = url.searchParams.get('companyId');
    if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
      return json({ error: 'Financial provider-cost access is not assigned.' }, 403);
    }
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return json({ error: 'Choose between 1 and 100 provider-cost events.' }, 400);
    }
    const scopedCompanyIds = requestedCompanyId ? [requestedCompanyId] : companyIds;
    const placeholders = scopedCompanyIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id,company_id AS companyId,actor_employee_id AS actorEmployeeId,
        actor_role_code AS actorRoleCode,action,amount_minor AS amountMinor,currency,
        provider,estimated_cost_minor AS estimatedCostMinor,
        actual_cost_minor AS actualCostMinor,cost_currency AS costCurrency,
        pricing_id AS pricingId,pricing_verified_at AS pricingVerifiedAt,
        approval_id AS approvalId,maker_employee_id AS makerEmployeeId,
        checker_employee_id AS checkerEmployeeId,provider_reference AS providerReference,
        retry_of_event_id AS retryOfEventId,reversal_of_event_id AS reversalOfEventId,
        occurred_at AS occurredAt,evidence_reference AS evidenceReference,
        requesting_module AS requestingModule
      FROM financial_provider_cost_events
      WHERE company_id IN (${placeholders})
      ORDER BY occurred_at DESC,id DESC
      LIMIT ?
    `).bind(...scopedCompanyIds, limit).all<Record<string, unknown>>();
    return json({ events: rows.results || [], visibleCompanyIds: scopedCompanyIds, limit });
  }

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
