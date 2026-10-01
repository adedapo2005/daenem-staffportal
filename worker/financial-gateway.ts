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
  revision?: number;
};

function budgetUsage(actualSpentMinor: number, budgetMinor: number, alertThresholdPercent: number, active: boolean) {
  if (!Number.isSafeInteger(actualSpentMinor) || actualSpentMinor < 0 ||
      !Number.isSafeInteger(budgetMinor) || budgetMinor <= 0 ||
      !Number.isInteger(alertThresholdPercent) || alertThresholdPercent < 1 || alertThresholdPercent > 100) {
    return { utilizationPercent: null, thresholdReached: active };
  }
  const spent = BigInt(actualSpentMinor);
  const budget = BigInt(budgetMinor);
  const utilization = spent * 100n / budget;
  const maxJsonInteger = BigInt(Number.MAX_SAFE_INTEGER);
  return {
    utilizationPercent: Number(utilization > maxJsonInteger ? maxJsonInteger : utilization),
    thresholdReached: active && spent * 100n >= budget * BigInt(alertThresholdPercent),
  };
}

function safeActualSpend(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

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
  // Validate persisted facts as well as save inputs: legacy rows can contain
  // fractional/unsafe terms that throw in BigInt or are hidden by fee bounds.
  const numericTerms = [pricing.fixedAmountMinor, pricing.percentageBps,
    pricing.minimumAmountMinor, pricing.maximumAmountMinor, pricing.capAmountMinor];
  if (numericTerms.some((value) => value !== null &&
      (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) ||
      (pricing.percentageBps !== null && pricing.percentageBps > 10_000)) {
    return { decision: 'verification_required' as const, reason: 'pricing_numeric_terms_invalid', currency: pricing.currency };
  }
  if (pricing.pricingModel === 'FREE') {
    const hasConflictingFeeTerms = pricing.fixedAmountMinor !== null || pricing.percentageBps !== null ||
      pricing.minimumAmountMinor !== null || pricing.maximumAmountMinor !== null || pricing.capAmountMinor !== null;
    if (hasConflictingFeeTerms) {
      return { decision: 'verification_required' as const, reason: 'free_pricing_has_fee_terms', currency: pricing.currency };
    }
    return { decision: 'free' as const, estimatedCostMinor: 0, currency: pricing.currency };
  }
  // Contradictory bounds must never produce a deceptively low estimate. This
  // check also protects estimates for legacy rows that predate save validation.
  if (pricing.minimumAmountMinor !== null &&
      ((pricing.maximumAmountMinor !== null && pricing.maximumAmountMinor < pricing.minimumAmountMinor) ||
       (pricing.capAmountMinor !== null && pricing.capAmountMinor < pricing.minimumAmountMinor))) {
    return { decision: 'verification_required' as const, reason: 'pricing_bounds_conflict', currency: pricing.currency };
  }
  if (!units) return { decision: 'verification_required' as const, reason: 'valid_quantity_required', currency: pricing.currency };
  if (['PERCENTAGE', 'PERCENTAGE_FIXED'].includes(pricing.pricingModel) && moneyAmount === null) {
    return { decision: 'verification_required' as const, reason: 'valid_transaction_amount_required', currency: pricing.currency };
  }
  // Legacy rows can bypass the current save validator. Never estimate a
  // percentage-only model while silently discarding a stored fixed fee, or
  // per-unit pricing while discarding percentage terms.
  if ((pricing.pricingModel === 'PERCENTAGE' && pricing.fixedAmountMinor !== null) ||
      (['FIXED', 'PER_PAGE', 'PER_REQUEST', 'PER_SUCCESSFUL_REQUEST'].includes(pricing.pricingModel) && pricing.percentageBps !== null)) {
    return { decision: 'verification_required' as const, reason: 'pricing_terms_conflict', currency: pricing.currency };
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
      // Compute basis-point fees without floating-point multiplication. A safe
      // integer transaction amount can still produce an inexact intermediate
      // when multiplied by the rate, which can overstate the rounded fee.
      const amount = BigInt(moneyAmount as number);
      const basisPoints = BigInt(pricing.percentageBps);
      const percentageFee = (amount * basisPoints + 9_999n) / 10_000n;
      const fixedFee = BigInt(pricing.pricingModel === 'PERCENTAGE_FIXED' ? pricing.fixedAmountMinor as number : 0);
      const combinedFee = percentageFee + fixedFee;
      if (combinedFee > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { decision: 'verification_required' as const, reason: 'pricing_terms_incomplete', currency: pricing.currency };
      }
      estimate = Number(combinedFee);
      if (pricing.minimumAmountMinor !== null) estimate = Math.max(estimate, pricing.minimumAmountMinor);
      if (pricing.maximumAmountMinor !== null) estimate = Math.min(estimate, pricing.maximumAmountMinor);
      if (pricing.capAmountMinor !== null) estimate = Math.min(estimate, pricing.capAmountMinor);
      break;
    }
    case 'PER_PAGE':
    case 'PER_REQUEST':
    case 'PER_SUCCESSFUL_REQUEST': {
      if (pricing.fixedAmountMinor === null || !Number.isSafeInteger(pricing.fixedAmountMinor) || pricing.fixedAmountMinor < 0) break;
      const total = BigInt(pricing.fixedAmountMinor) * BigInt(units);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { decision: 'verification_required' as const, reason: 'pricing_terms_incomplete', currency: pricing.currency };
      }
      estimate = Number(total);
      break;
    }
    default:
      return { decision: 'verification_required' as const, reason: 'pricing_model_requires_explicit_terms', currency: pricing.currency };
  }
  if (!Number.isSafeInteger(estimate!) || estimate! < 0) {
    return { decision: 'verification_required' as const, reason: 'pricing_terms_incomplete', currency: pricing.currency };
  }
  return { decision: estimate! === 0 ? 'free' as const : 'estimated' as const, estimatedCostMinor: estimate!, currency: pricing.currency };
}

export function isSafeOfficialPricingSource(value: string) {
  try {
    const source = new URL(value);
    return source.protocol === 'https:' && !source.username && !source.password &&
      !source.search && !source.hash;
  } catch { return false; }
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
  const pricingTermsConflict =
    (pricingModel === 'PERCENTAGE' && fixed != null) ||
    (hasFixedRate && pct != null);
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
      pricingTermsConflict ||
      minimum != null && ((maximum != null && maximum < minimum) || (cap != null && cap < minimum)) ||
      pct !== null && pct !== undefined && (typeof pct !== 'number' || !Number.isSafeInteger(pct) || pct < 0 || pct > 10_000) ||
      minimum != null && maximum != null && Number(maximum) < Number(minimum) ||
      !dateOrNull(effectiveAt) || !dateOrNull(lastVerifiedAt) ||
      officialSource.length > 500 || (officialSource && !isSafeOfficialPricingSource(officialSource)) ||
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
  const existing = await env.DB.prepare('SELECT id,revision FROM financial_provider_pricing WHERE id=? LIMIT 1').bind(id).first<{ id: string; revision: number }>();
  if (!existing) {
    const conflict = await env.DB.prepare('SELECT id FROM financial_provider_pricing WHERE provider=? AND service=? AND currency=? LIMIT 1').bind(provider, service, currency).first<{ id: string }>();
    if (conflict) return json({ error: 'A pricing record already exists for this provider, service and currency.' }, 409);
  }
  const expectedRevision = existing ? Number(existing.revision) + 1 : 1;
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
      status=excluded.status,notes=excluded.notes,revision=financial_provider_pricing.revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE financial_provider_pricing.revision=?`)
      .bind(id, provider, service, pricingModel, facts.fixedAmountMinor, facts.percentageBps, facts.minimumAmountMinor,
        facts.maximumAmountMinor, facts.capAmountMinor, vatTreatment, currency, effectiveAt, lastVerifiedAt,
        facts.officialSource, status, facts.notes, existing?.revision ?? 0),
    ...TARGET_COMPANIES.map((companyId) => env.DB.prepare(`INSERT INTO financial_provider_pricing_businesses(pricing_id,company_id,available)
      SELECT ?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM financial_provider_pricing WHERE id=? AND revision=? AND provider=? AND service=? AND currency=?)
      ON CONFLICT(pricing_id,company_id) DO UPDATE SET available=excluded.available`)
      .bind(id, companyId, (companies as string[]).includes(companyId) ? 1 : 0, id, expectedRevision, provider, service, currency)),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
      SELECT ?,?,NULL,'financial_gateway',?,'financial_provider_pricing',?,?,'web'
      WHERE changes()=1 AND EXISTS(SELECT 1 FROM financial_provider_pricing WHERE id=? AND revision=? AND provider=? AND service=? AND currency=?)`)
      .bind(`audit-${crypto.randomUUID()}`, context.employee.id, existing ? 'update_provider_pricing' : 'create_provider_pricing', id,
        JSON.stringify({ ...facts, availableBusinesses: companies }), id, expectedRevision, provider, service, currency),
  ];
  try {
    const results = await env.DB.batch(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[results.length - 1]?.meta?.changes || 0) !== 1) {
      return json({ error: 'Provider pricing changed concurrently. Reload the registry and try again.' }, 409);
    }
  }
  catch { return json({ error: 'Provider pricing could not be saved. Check for an existing provider/service/currency record.' }, 409); }
  return json({ ok: true, id, status, availableBusinesses: companies, providerCallMade: false });
}

export async function routeFinancialGateway(request: Request, env: FinancialGatewayEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const reconciliationImportDetail = url.pathname.match(/^\/api\/financial-gateway\/reconciliation-imports\/([A-Za-z0-9:_-]{1,160})$/);
  if ((!['/api/financial-gateway/pricing', '/api/financial-gateway/pricing/admin', '/api/financial-gateway/estimate', '/api/financial-gateway/budgets', '/api/financial-gateway/cost-events', '/api/financial-gateway/cost-summary', '/api/financial-gateway/reconciliation-imports', '/api/financial-gateway/routing-policies'].includes(url.pathname) && !reconciliationImportDetail) || !['GET', 'POST'].includes(request.method)) return null;

  if (url.pathname === '/api/financial-gateway/routing-policies') {
    const companyIds = [...new Set(context.companies.map((company) => company.id).filter((id) => PRICING_COMPANIES.has(id)))];
    const isOwner = context.roles.some((role) => role.code === 'owner');
    if (request.method === 'POST') {
      if (!isOwner) return json({ error: 'Owner provider-routing administration access is required.' }, 403);
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; }
      catch { return json({ error: 'Invalid provider routing policy.' }, 400); }
      const companyId = typeof body.companyId === 'string' ? body.companyId : '';
      const id = typeof body.id === 'string' ? body.id : '';
      const service = typeof body.service === 'string' ? body.service.trim() : '';
      const provider = typeof body.provider === 'string' ? body.provider : '';
      const priority = body.priority;
      const status = body.status;
      const routingReason = typeof body.routingReason === 'string' ? body.routingReason.trim() : '';
      if (!PRICING_COMPANIES.has(companyId) || !/^[A-Za-z0-9:_-]{1,160}$/.test(id) || !service || service.length > 120 ||
          !['paystack', 'monnify', 'mono', 'manual_import'].includes(provider) || typeof priority !== 'number' ||
          !Number.isInteger(priority) || priority < 1 || priority > 20 ||
          !['enabled', 'disabled', 'owner_action_required'].includes(String(status)) || !routingReason || routingReason.length > 1000) {
        return json({ error: 'Business, service, approved provider, priority, status and routing reason must be valid and bounded.' }, 400);
      }
      try {
        const results = await env.DB.batch([
          env.DB.prepare(`INSERT INTO financial_provider_routing_policies(id,company_id,service,provider,priority,status,routing_reason,created_by,updated_by)
            VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET priority=excluded.priority,status=excluded.status,
              routing_reason=excluded.routing_reason,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
            WHERE company_id=excluded.company_id AND service=excluded.service AND provider=excluded.provider`)
            .bind(id, companyId, service, provider, priority, status, routingReason, context.employee.id, context.employee.id),
          env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
            SELECT ?,?,?, 'financial_gateway','save_provider_routing_policy','financial_provider_routing_policy',?,?,'web'
            WHERE changes()=1 AND EXISTS(SELECT 1 FROM financial_provider_routing_policies WHERE id=? AND company_id=? AND service=? AND provider=?)`)
            .bind(`audit-${crypto.randomUUID()}`, context.employee.id, companyId, id,
              JSON.stringify({ service, provider, priority, status, routingReason }), id, companyId, service, provider),
        ]);
        if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
          return json({ error: 'Provider routing policy could not be saved.' }, 409);
        }
      } catch { return json({ error: 'Provider routing policy conflicts with an existing business, service or priority.' }, 409); }
      return json({ ok: true, id, companyId, status, providerCallMade: false });
    }
    if (request.method !== 'GET') return json({ error: 'Use GET or POST for provider routing policies.' }, 405);
    const requestedCompanyId = url.searchParams.get('companyId');
    if (requestedCompanyId && !companyIds.includes(requestedCompanyId) && !isOwner) return json({ error: 'Provider routing policy access is not assigned.' }, 403);
    const scopedCompanyIds = isOwner ? TARGET_COMPANIES : companyIds.filter((id) => hasPermission(context, 'finance.reports', 'view', id));
    if (!isOwner && !scopedCompanyIds.length) return json({ error: 'Provider routing policy access is not assigned.' }, 403);
    const visible = requestedCompanyId ? scopedCompanyIds.filter((id) => id === requestedCompanyId) : scopedCompanyIds;
    if (!visible.length) return json({ error: 'Provider routing policy access is not assigned.' }, 403);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam === null ? 100 : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !/^\d+$/.test(limitParam ?? '100')) {
      return json({ error: 'Choose between 1 and 100 provider routing policies.' }, 400);
    }
    const afterId = url.searchParams.get('afterId');
    if (afterId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(afterId)) {
      return json({ error: 'Choose a valid provider routing policy cursor.' }, 400);
    }
    const placeholders = visible.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT id,company_id AS companyId,service,provider,priority,status,
      routing_reason AS routingReason,updated_at AS updatedAt FROM financial_provider_routing_policies
      WHERE company_id IN (${placeholders}) AND (? IS NULL OR id > ?)
      ORDER BY id LIMIT ?`)
      .bind(...visible, afterId, afterId, limit + 1).all<Record<string, unknown>>();
    const page = rows.results || [];
    const policies = page.slice(0, limit);
    const nextCursor = page.length > limit ? String(policies[policies.length - 1].id) : null;
    return json({ policies, nextCursor, limit, visibleCompanyIds: visible, providerExecutionEnabled: false });
  }

  if (url.pathname === '/api/financial-gateway/pricing/admin') {
    if (request.method !== 'POST') return json({ error: 'Use POST to maintain provider pricing.' }, 405);
    return maintainPricing(request, env, context);
  }

  const owner = context.roles.some((role) => role.code === 'owner');
  const companyIds = owner
    ? TARGET_COMPANIES
    : TARGET_COMPANIES.filter((companyId) => context.companies.some((company) => company.id === companyId) && hasPermission(context, 'finance.reports', 'view', companyId));
  if (companyIds.length === 0) return json({ error: 'Financial provider-cost access is not assigned.' }, 403);

  if (url.pathname === '/api/financial-gateway/reconciliation-imports') {
    if (request.method === 'POST') {
      // Staging is an evidence-only operation. It does not post, match, or
      // otherwise change a business ledger.
      if (!owner) return json({ error: 'Owner reconciliation-import access is required.' }, 403);
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 1_000_000) return json({ error: 'Reconciliation import is too large.' }, 413);
      let parsedBody: unknown;
      try { parsedBody = JSON.parse(rawBody); }
      catch { return json({ error: 'Invalid reconciliation import.' }, 400); }
      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) return json({ error: 'Invalid reconciliation import.' }, 400);
      const body = parsedBody as Record<string, unknown>;
      const companyId = typeof body.companyId === 'string' ? body.companyId : '';
      const sourceType = typeof body.sourceType === 'string' ? body.sourceType : '';
      const provider = body.provider == null ? null : typeof body.provider === 'string' ? body.provider.trim() : '';
      const sourceReference = body.sourceReference == null ? null : typeof body.sourceReference === 'string' ? body.sourceReference.trim() : '';
      const fileSha256 = body.fileSha256 == null ? null : typeof body.fileSha256 === 'string' ? body.fileSha256 : '';
      const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
      const inputRows = body.rows;
      if (!TARGET_COMPANIES.includes(companyId) || !['provider_api','provider_webhook','csv','excel','manual'].includes(sourceType) ||
          (provider !== null && (!provider || provider.length > 80)) ||
          (sourceReference !== null && (!sourceReference || sourceReference.length > 160)) ||
          (fileSha256 !== null && !/^[a-f0-9]{64}$/.test(fileSha256)) ||
          !/^[A-Za-z0-9:_-]{1,160}$/.test(idempotencyKey) || !Array.isArray(inputRows) || inputRows.length < 1 || inputRows.length > 100 ||
          inputRows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
        return json({ error: 'Business, source, idempotency key and 1 to 100 normalized rows are required.' }, 400);
      }
      if (!companyIds.includes(companyId)) return json({ error: 'Financial reconciliation access is not assigned.' }, 403);
      const rows = (inputRows as Record<string, unknown>[]).map((row) => ({
        providerReference: row.providerReference == null ? null : typeof row.providerReference === 'string' ? row.providerReference.trim() : '',
        occurredAt: typeof row.occurredAt === 'string' ? row.occurredAt : '',
        direction: row.direction,
        amountMinor: row.amountMinor,
        currency: row.currency,
        description: row.description == null ? null : typeof row.description === 'string' ? row.description.trim() : '',
      }));
      const timestampIsValid = (value: string) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
      if (rows.some((row) => (row.providerReference !== null && (!row.providerReference || row.providerReference.length > 200)) ||
          !timestampIsValid(row.occurredAt) || !['credit','debit'].includes(String(row.direction)) ||
          typeof row.amountMinor !== 'number' || !Number.isSafeInteger(row.amountMinor) || row.amountMinor < 0 ||
          typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency) ||
          (row.description !== null && row.description.length > 1000))) {
        return json({ error: 'Each normalized row needs a valid timestamp, direction, amount, currency and bounded reference or description.' }, 400);
      }
      const existing = await env.DB.prepare(`SELECT id,row_count AS rowCount,provider,source_reference AS sourceReference,file_sha256 AS fileSha256
        FROM financial_reconciliation_imports
        WHERE company_id=? AND source_type=? AND idempotency_key=? LIMIT 1`)
        .bind(companyId, sourceType, idempotencyKey).first<{ id: string; rowCount: number; provider: string | null; sourceReference: string | null; fileSha256: string | null }>();
      if (existing) {
        const stored = await env.DB.prepare(`SELECT provider_reference AS providerReference,occurred_at AS occurredAt,
          direction,amount_minor AS amountMinor,currency,description FROM financial_reconciliation_import_rows
          WHERE import_id=? ORDER BY row_number`).bind(existing.id).all<Record<string, unknown>>();
        const same = Number(existing.rowCount) === rows.length && existing.provider === (provider || null) &&
          existing.sourceReference === (sourceReference || null) && existing.fileSha256 === fileSha256 &&
          JSON.stringify(stored.results || []) === JSON.stringify(rows);
        return same
          ? json({ ok: true, id: existing.id, companyId, rowCount: rows.length, idempotentReplay: true, providerCallMade: false })
          : json({ error: 'The idempotency key is already assigned to different reconciliation evidence.' }, 409);
      }
      const importId = `fri-${crypto.randomUUID()}`;
      const statements = [
        env.DB.prepare(`INSERT INTO financial_reconciliation_imports(
          id,company_id,source_type,provider,source_reference,file_sha256,row_count,idempotency_key,created_by
        ) VALUES(?,?,?,?,?,?,?,?,?)`).bind(importId, companyId, sourceType, provider || null,
          sourceReference || null, fileSha256, rows.length, idempotencyKey, context.employee.id),
        ...rows.map((row, index) => env.DB.prepare(`INSERT INTO financial_reconciliation_import_rows(
          id,import_id,row_number,provider_reference,occurred_at,direction,amount_minor,currency,description
        ) VALUES(?,?,?,?,?,?,?,?,?)`).bind(`frir-${crypto.randomUUID()}`, importId, index + 1,
          row.providerReference || null, row.occurredAt, row.direction, row.amountMinor, row.currency,
          row.description || null)),
        env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
          VALUES(?,?,?,'financial_gateway','stage_reconciliation_import','financial_reconciliation_import',?,?,'web')`)
          .bind(`audit-${crypto.randomUUID()}`, context.employee.id, companyId, importId,
            JSON.stringify({ sourceType, provider, sourceReference, rowCount: rows.length, fileSha256 })),
      ];
      try { await env.DB.batch(statements); }
      catch {
        const replay = await env.DB.prepare(`SELECT id FROM financial_reconciliation_imports
          WHERE company_id=? AND source_type=? AND idempotency_key=? LIMIT 1`)
          .bind(companyId, sourceType, idempotencyKey).first<{ id: string }>();
        if (!replay) return json({ error: 'Reconciliation evidence could not be staged.' }, 409);
        const replayImport = await env.DB.prepare(`SELECT row_count AS rowCount,provider,source_reference AS sourceReference,file_sha256 AS fileSha256
          FROM financial_reconciliation_imports WHERE id=? AND company_id=? LIMIT 1`)
          .bind(replay.id, companyId).first<{ rowCount: number; provider: string | null; sourceReference: string | null; fileSha256: string | null }>();
        const replayRows = await env.DB.prepare(`SELECT provider_reference AS providerReference,occurred_at AS occurredAt,
          direction,amount_minor AS amountMinor,currency,description FROM financial_reconciliation_import_rows
          WHERE import_id=? ORDER BY row_number`).bind(replay.id).all<Record<string, unknown>>();
        const sameEvidence = replayImport && Number(replayImport.rowCount) === rows.length &&
          replayImport.provider === (provider || null) && replayImport.sourceReference === (sourceReference || null) &&
          replayImport.fileSha256 === fileSha256 && JSON.stringify(replayRows.results || []) === JSON.stringify(rows);
        return sameEvidence
          ? json({ ok: true, id: replay.id, companyId, rowCount: rows.length, idempotentReplay: true, providerCallMade: false })
          : json({ error: 'The idempotency key is already assigned to different reconciliation evidence.' }, 409);
      }
      return json({ ok: true, id: importId, companyId, rowCount: rows.length, idempotentReplay: false, providerCallMade: false }, 201);
    }
    if (request.method !== 'GET') return json({ error: 'Use GET or POST for reconciliation imports.' }, 405);
    const requestedCompanyId = url.searchParams.get('companyId');
    if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
      return json({ error: 'Financial reconciliation access is not assigned.' }, 403);
    }
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return json({ error: 'Choose between 1 and 100 reconciliation imports.' }, 400);
    }
    const status = url.searchParams.get('status') || '';
    if (status && !['staged', 'review_required', 'reviewed', 'cancelled'].includes(status)) {
      return json({ error: 'Choose a valid reconciliation import status.' }, 400);
    }
    const rawCursor = url.searchParams.get('cursor');
    let cursor: [number, string, string] | null = null;
    if (rawCursor !== null) {
      try {
        if (rawCursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(rawCursor)) throw new Error('Invalid cursor');
        const decoded = JSON.parse(atob(rawCursor.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
        if (!Array.isArray(decoded) || decoded.length !== 3 ||
            !Number.isInteger(decoded[0]) || decoded[0] < 0 || decoded[0] > 2 ||
            typeof decoded[1] !== 'string' || decoded[1].length > 40 ||
            !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(decoded[1]) ||
            typeof decoded[2] !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(decoded[2])) throw new Error('Invalid cursor');
        cursor = decoded as [number, string, string];
      } catch { return json({ error: 'Choose a valid reconciliation import cursor.' }, 400); }
    }
    const scopedCompanyIds = requestedCompanyId ? [requestedCompanyId] : companyIds;
    const placeholders = scopedCompanyIds.map(() => '?').join(',');
    const statusSql = status ? ' AND i.status=?' : '';
    const statusOrder = "CASE i.status WHEN 'review_required' THEN 0 WHEN 'staged' THEN 1 ELSE 2 END";
    const cursorSql = cursor ? ` AND (${statusOrder} > ? OR
      (${statusOrder} = ? AND i.created_at < ?) OR
      (${statusOrder} = ? AND i.created_at = ? AND i.id > ?))` : '';
    const rows = await env.DB.prepare(`
      SELECT i.id,i.company_id AS companyId,i.source_type AS sourceType,i.provider,
        i.source_reference AS sourceReference,i.status,i.row_count AS rowCount,
        i.created_at AS createdAt,i.reviewed_at AS reviewedAt,
        (SELECT COUNT(*) FROM financial_reconciliation_import_rows r WHERE r.import_id=i.id AND r.reconciliation_status='unmatched') AS unmatchedCount,
        (SELECT COUNT(*) FROM financial_reconciliation_import_rows r WHERE r.import_id=i.id AND r.reconciliation_status='partial') AS partialCount,
        (SELECT COUNT(*) FROM financial_reconciliation_import_rows r WHERE r.import_id=i.id AND r.reconciliation_status IN ('exact','overpayment','duplicate','reversed','refunded')) AS resolvedCount
      FROM financial_reconciliation_imports i
      WHERE i.company_id IN (${placeholders})${statusSql}${cursorSql}
      ORDER BY ${statusOrder},
        i.created_at DESC,i.id ASC
      LIMIT ?
    `).bind(...scopedCompanyIds, ...(status ? [status] : []),
      ...(cursor ? [cursor[0], cursor[0], cursor[1], cursor[0], cursor[1], cursor[2]] : []), limit + 1).all<Record<string, unknown>>();
    const page = rows.results || [];
    const imports = page.slice(0, limit);
    const last = imports[imports.length - 1];
    const nextCursor = page.length > limit && last ? btoa(JSON.stringify([
      last.status === 'review_required' ? 0 : last.status === 'staged' ? 1 : 2,
      last.createdAt, last.id,
    ])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null;
    return json({ imports, nextCursor, limit, status: status || null, visibleCompanyIds: scopedCompanyIds });
  }

  if (reconciliationImportDetail && request.method === 'GET') {
    const importId = reconciliationImportDetail[1];
    const requestedCompanyId = url.searchParams.get('companyId');
    if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
      return json({ error: 'Financial reconciliation access is not assigned.' }, 403);
    }
    const scopedCompanyIds = requestedCompanyId ? [requestedCompanyId] : companyIds;
    const placeholders = scopedCompanyIds.map(() => '?').join(',');
    const reconciliationImport = await env.DB.prepare(`
      SELECT id,company_id AS companyId,source_type AS sourceType,provider,
        source_reference AS sourceReference,status,row_count AS rowCount,created_at AS createdAt,
        reviewed_at AS reviewedAt
      FROM financial_reconciliation_imports
      WHERE id=? AND company_id IN (${placeholders}) LIMIT 1
    `).bind(importId, ...scopedCompanyIds).first<Record<string, unknown>>();
    if (!reconciliationImport) return json({ error: 'Reconciliation import was not found.' }, 404);
    const rows = await env.DB.prepare(`
      SELECT row_number AS rowNumber,provider_reference AS providerReference,occurred_at AS occurredAt,
        direction,amount_minor AS amountMinor,currency,description,
        reconciliation_status AS reconciliationStatus,candidate_reference AS candidateReference,
        reviewed_at AS reviewedAt
      FROM financial_reconciliation_import_rows
      WHERE import_id=? ORDER BY row_number LIMIT 100
    `).bind(importId).all<Record<string, unknown>>();
    return json({ reconciliationImport, rows: rows.results || [], visibleCompanyIds: scopedCompanyIds });
  }

  if (url.pathname === '/api/financial-gateway/cost-summary') {
    if (request.method !== 'GET') return json({ error: 'Use GET to read monthly provider-cost summaries.' }, 405);
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 500 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return json({ error: 'Choose between 1 and 500 provider-cost summary groups.' }, 400);
    }
    const groupBy = url.searchParams.get('groupBy');
    if (groupBy !== null && groupBy !== 'service' && groupBy !== 'costCenter' && groupBy !== 'actorEmployee' && groupBy !== 'day' && groupBy !== 'action' && groupBy !== 'actorRole' && groupBy !== 'pricing') {
      return json({ error: 'Choose a valid provider-cost summary grouping.' }, 400);
    }
    const groupColumn = groupBy === 'service' ? 'service' : groupBy === 'costCenter' ? 'cost_center_id' : groupBy === 'actorEmployee' ? 'actor_employee_id' : groupBy === 'day' ? "strftime('%Y-%m-%d',occurred_at)" : groupBy === 'action' ? 'action' : groupBy === 'actorRole' ? 'actor_role_code' : groupBy === 'pricing' ? 'pricing_id' : null;
    const groupField = groupBy === 'service' ? 'service' : groupBy === 'costCenter' ? 'costCenterId' : groupBy === 'day' ? 'day' : groupBy === 'action' ? 'action' : groupBy === 'actorRole' ? 'actorRoleCode' : groupBy === 'pricing' ? 'pricingId' : 'actorEmployeeId';
    const markedGrouping = groupBy === 'costCenter' || groupBy === 'actorEmployee' || groupBy === 'day' || groupBy === 'action' || groupBy === 'actorRole' || groupBy === 'pricing';
    const cursor = url.searchParams.get('cursor');
    let after: (string | null)[] | null = null;
    if (cursor !== null) {
      try {
        if (cursor.length > 8192) throw new Error('Invalid cursor');
        const position: unknown = JSON.parse(cursor);
        if (!Array.isArray(position) || position.length !== (markedGrouping ? 6 : groupColumn ? 5 : 4) || typeof position[0] !== 'string' ||
            !position[0] || position.some(value => value !== null &&
              (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)))) {
          throw new Error('Invalid cursor');
        }
        if (markedGrouping && position[5] !== groupBy) throw new Error('Invalid cursor');
        after = position.slice(0, 5) as (string | null)[];
      } catch {
        return json({ error: 'Choose a valid provider-cost summary cursor.' }, 400);
      }
    }
    const month = url.searchParams.get('month') || '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return json({ error: 'Choose a month in YYYY-MM format.' }, 400);
    }
    const day = url.searchParams.get('day');
    if (day !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00.000Z`)) ||
        new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day)) {
      return json({ error: 'Choose a valid day in YYYY-MM-DD format.' }, 400);
    }
    const requestedCompanyId = url.searchParams.get('companyId');
    if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
      return json({ error: 'Financial provider-cost access is not assigned.' }, 403);
    }
    const provider = url.searchParams.get('provider');
    if (provider !== null && !/^[a-z][a-z0-9_-]{0,79}$/.test(provider)) {
      return json({ error: 'Choose a valid provider filter.' }, 400);
    }
    const costCurrency = url.searchParams.get('costCurrency');
    if (costCurrency !== null && (costCurrency.length !== 3 || /[^A-Z]/.test(costCurrency))) {
      return json({ error: 'Choose a valid three-letter cost currency.' }, 400);
    }
    const currency = url.searchParams.get('currency');
    if (currency !== null && (currency.length !== 3 || /[^A-Z]/.test(currency))) {
      return json({ error: 'Choose a valid three-letter transaction currency.' }, 400);
    }
    const module = url.searchParams.get('module');
    if (module !== null && !/^[a-z][a-z0-9_.:-]{0,79}$/.test(module)) {
      return json({ error: 'Choose a valid module filter.' }, 400);
    }
    const actorEmployeeId = url.searchParams.get('actorEmployeeId');
    if (actorEmployeeId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(actorEmployeeId)) {
      return json({ error: 'Choose a valid requesting-user filter.' }, 400);
    }
    const service = url.searchParams.get('service');
    if (service !== null && (!service.trim() || [...service].length > 120 ||
        /[\u0000-\u001f\u007f]/.test(service))) {
      return json({ error: 'Choose a valid service filter.' }, 400);
    }
    const costCenterId = url.searchParams.get('costCenterId');
    if (costCenterId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(costCenterId)) {
      return json({ error: 'Choose a valid cost-centre filter.' }, 400);
    }
    // Historical role evidence is an exact value, not a grant of authority.
    const actorRoleCode = url.searchParams.get('actorRoleCode');
    if (actorRoleCode !== null && (!actorRoleCode.trim() || [...actorRoleCode].length > 160 ||
        /[\u0000-\u001f\u007f]/.test(actorRoleCode))) {
      return json({ error: 'Choose a valid actor-role filter.' }, 400);
    }
    const action = url.searchParams.get('action');
    if (action !== null && (!action.trim() || [...action].length > 100 ||
        /[\u0000-\u001f\u007f]/.test(action))) {
      return json({ error: 'Choose a valid action filter.' }, 400);
    }
    const pricingId = url.searchParams.get('pricingId');
    if (pricingId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(pricingId)) {
      return json({ error: 'Choose a valid pricing-record filter.' }, 400);
    }
    const rawPricingRevision = url.searchParams.get('pricingRevision');
    const pricingRevision = rawPricingRevision === null ? null : Number(rawPricingRevision);
    if (rawPricingRevision !== null && (!/^[1-9][0-9]*$/.test(rawPricingRevision) ||
        !Number.isSafeInteger(pricingRevision))) {
      return json({ error: 'Choose a valid positive pricing revision.' }, 400);
    }
    // References are opaque: preserve case and punctuation and compare exactly.
    const providerReference = url.searchParams.get('providerReference');
    if (providerReference !== null && (!providerReference.trim() || providerReference.length > 200 ||
        /[\u0000-\u001f\u007f]/.test(providerReference))) {
      return json({ error: 'Choose a valid provider-reference filter.' }, 400);
    }
    const evidenceReference = url.searchParams.get('evidenceReference');
    if (evidenceReference !== null && (!evidenceReference.trim() || [...evidenceReference].length > 160 ||
        /[\u0000-\u001f\u007f]/.test(evidenceReference))) {
      return json({ error: 'Choose a valid evidence-reference filter.' }, 400);
    }
    const retryOfEventId = url.searchParams.get('retryOfEventId');
    if (retryOfEventId !== null && (!retryOfEventId.trim() || retryOfEventId.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(retryOfEventId))) {
      return json({ error: 'Choose a valid retry-event filter.' }, 400);
    }
    const reversalOfEventId = url.searchParams.get('reversalOfEventId');
    if (reversalOfEventId !== null && (!reversalOfEventId.trim() || reversalOfEventId.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(reversalOfEventId))) {
      return json({ error: 'Choose a valid reversal-event filter.' }, 400);
    }
    const approvalId = url.searchParams.get('approvalId');
    if (approvalId !== null && (!approvalId.trim() || approvalId.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(approvalId))) {
      return json({ error: 'Choose a valid approval-record filter.' }, 400);
    }
    const makerEmployeeId = url.searchParams.get('makerEmployeeId');
    const checkerEmployeeId = url.searchParams.get('checkerEmployeeId');
    if ([makerEmployeeId, checkerEmployeeId].some(id => id !== null &&
        (id.length < 1 || id.length > 160 || /[^A-Za-z0-9:_-]/.test(id)))) {
      return json({ error: 'Choose valid maker/checker filters.' }, 400);
    }
    const scopedCompanyIds = requestedCompanyId ? [requestedCompanyId] : companyIds;
    const placeholders = scopedCompanyIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT company_id AS companyId,provider,cost_currency AS currency,
        requesting_module AS module,${groupColumn ? `${groupColumn} AS ${groupField},` : ''}COUNT(*) AS eventCount,
        COUNT(actual_cost_minor) AS actualCostEventCount,
        SUM(actual_cost_minor) AS actualCostMinor,
        SUM(estimated_cost_minor) AS estimatedCostMinor
      FROM financial_provider_cost_events
      WHERE company_id IN (${placeholders}) AND strftime('%Y-%m',occurred_at)=?
        AND (? IS NULL OR strftime('%Y-%m-%d',occurred_at)=?)
        AND (? IS NULL OR provider=?) AND (? IS NULL OR requesting_module=?)
        AND (? IS NULL OR actor_employee_id=?)
        AND (? IS NULL OR cost_center_id=?)
        AND (? IS NULL OR service=?)
        AND (? IS NULL OR cost_currency=?)
        AND (? IS NULL OR action=?)
        AND (? IS NULL OR pricing_id=?)
        AND (? IS NULL OR pricing_revision=?)
        AND (? IS NULL OR actor_role_code=?)
        AND (? IS NULL OR currency=?)
        AND (? IS NULL OR provider_reference=?)
        AND (? IS NULL OR evidence_reference=?)
        AND (? IS NULL OR retry_of_event_id=?)
        AND (? IS NULL OR reversal_of_event_id=?)
        AND (? IS NULL OR approval_id=?)
        AND (? IS NULL OR maker_employee_id=?)
        AND (? IS NULL OR checker_employee_id=?)
      GROUP BY company_id,provider,cost_currency,requesting_module${groupColumn ? `,${groupColumn}` : ''}
      HAVING (? = 0 OR (company_id,provider IS NOT NULL,COALESCE(provider,''),
        cost_currency IS NOT NULL,COALESCE(cost_currency,''),
        requesting_module IS NOT NULL,COALESCE(requesting_module,'')${groupColumn ? `,${groupColumn} IS NOT NULL,COALESCE(${groupColumn},'')` : ''}) > (${groupColumn ? '?,?,?,?,?,?,?,?,?' : '?,?,?,?,?,?,?'}))
      ORDER BY company_id,provider,cost_currency,requesting_module${groupColumn ? `,${groupColumn}` : ''}
      LIMIT ?
    `).bind(...scopedCompanyIds, month, day, day, provider, provider, module, module, actorEmployeeId, actorEmployeeId, costCenterId, costCenterId, service, service, costCurrency, costCurrency, action, action, pricingId, pricingId, pricingRevision, pricingRevision, actorRoleCode, actorRoleCode, currency, currency, providerReference, providerReference, evidenceReference, evidenceReference, retryOfEventId, retryOfEventId, reversalOfEventId, reversalOfEventId, approvalId, approvalId, makerEmployeeId, makerEmployeeId, checkerEmployeeId, checkerEmployeeId,
      after ? 1 : 0, after?.[0] ?? '', after?.[1] != null ? 1 : 0, after?.[1] ?? '',
      after?.[2] != null ? 1 : 0, after?.[2] ?? '', after?.[3] != null ? 1 : 0, after?.[3] ?? '',
      ...(groupColumn ? [after?.[4] != null ? 1 : 0, after?.[4] ?? ''] : []), limit + 1).all<Record<string, unknown>>();
    // A cursor is only a position; every request reapplies current permissions and filters.
    // Null flags preserve SQLite ordering without conflating NULL with an empty string.
    const summaries = (rows.results || []).slice(0, limit);
    const last = summaries[summaries.length - 1];
    const nextCursor = (rows.results || []).length > limit && last
      ? JSON.stringify([last.companyId, last.provider, last.currency, last.module, ...(groupColumn ? [last[groupField], ...(markedGrouping ? [groupBy] : [])] : [])]) : null;
    return json({ month, day, provider, module, actorEmployeeId, costCenterId, service, costCurrency, action, pricingId, pricingRevision, actorRoleCode, currency, providerReference, evidenceReference, retryOfEventId, reversalOfEventId, approvalId, makerEmployeeId, checkerEmployeeId, summaries, nextCursor, limit, visibleCompanyIds: scopedCompanyIds });
  }

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
    const provider = url.searchParams.get('provider');
    if (provider !== null && !/^[a-z][a-z0-9_-]{0,79}$/.test(provider)) {
      return json({ error: 'Choose a valid provider filter.' }, 400);
    }
    const requestingModule = url.searchParams.get('module');
    if (requestingModule !== null && !/^[a-z][a-z0-9_.:-]{0,79}$/.test(requestingModule)) {
      return json({ error: 'Choose a valid module filter.' }, 400);
    }
    const day = url.searchParams.get('day');
    if (day !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00.000Z`)) ||
        new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) !== day)) {
      return json({ error: 'Choose a valid day in YYYY-MM-DD format.' }, 400);
    }
    // Match the monthly summary's UTC calendar semantics so its drilldown
    // cannot silently include events from another accounting period.
    const month = url.searchParams.get('month');
    if (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return json({ error: 'Choose a month in YYYY-MM format.' }, 400);
    }
    const actorEmployeeId = url.searchParams.get('actorEmployeeId');
    if (actorEmployeeId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(actorEmployeeId)) {
      return json({ error: 'Choose a valid requesting-user filter.' }, 400);
    }
    const service = url.searchParams.get('service');
    if (service !== null && (!service.trim() || [...service].length > 120 ||
        /[\u0000-\u001f\u007f]/.test(service))) {
      return json({ error: 'Choose a valid service filter.' }, 400);
    }
    const costCenterId = url.searchParams.get('costCenterId');
    if (costCenterId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(costCenterId)) {
      return json({ error: 'Choose a valid cost-centre filter.' }, 400);
    }
    // Historical role evidence is an exact value, not a grant of authority.
    const actorRoleCode = url.searchParams.get('actorRoleCode');
    if (actorRoleCode !== null && (!actorRoleCode.trim() || [...actorRoleCode].length > 160 ||
        /[\u0000-\u001f\u007f]/.test(actorRoleCode))) {
      return json({ error: 'Choose a valid actor-role filter.' }, 400);
    }
    const costCurrency = url.searchParams.get('costCurrency');
    if (costCurrency !== null && (costCurrency.length !== 3 || /[^A-Z]/.test(costCurrency))) {
      return json({ error: 'Choose a valid three-letter cost currency.' }, 400);
    }
    const currency = url.searchParams.get('currency');
    if (currency !== null && (currency.length !== 3 || /[^A-Z]/.test(currency))) {
      return json({ error: 'Choose a valid three-letter transaction currency.' }, 400);
    }
    const makerEmployeeId = url.searchParams.get('makerEmployeeId');
    const checkerEmployeeId = url.searchParams.get('checkerEmployeeId');
    if ([makerEmployeeId, checkerEmployeeId].some(id => id !== null &&
        (id.length < 1 || id.length > 160 || /[^A-Za-z0-9:_-]/.test(id)))) {
      return json({ error: 'Choose valid maker/checker filters.' }, 400);
    }
    // References are opaque: preserve case and punctuation and compare exactly.
    const providerReference = url.searchParams.get('providerReference');
    if (providerReference !== null && (!providerReference.trim() || providerReference.length > 200 ||
        /[\u0000-\u001f\u007f]/.test(providerReference))) {
      return json({ error: 'Choose a valid provider-reference filter.' }, 400);
    }
    // Actions use the existing evidence field, with no inferred action catalogue.
    const action = url.searchParams.get('action');
    if (action !== null && (!action.trim() || [...action].length > 100 ||
        /[\u0000-\u001f\u007f]/.test(action))) {
      return json({ error: 'Choose a valid action filter.' }, 400);
    }
    const pricingId = url.searchParams.get('pricingId');
    if (pricingId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(pricingId)) {
      return json({ error: 'Choose a valid pricing-record filter.' }, 400);
    }
    const rawPricingRevision = url.searchParams.get('pricingRevision');
    const pricingRevision = rawPricingRevision === null ? null : Number(rawPricingRevision);
    if (rawPricingRevision !== null && (!/^[1-9][0-9]*$/.test(rawPricingRevision) ||
        !Number.isSafeInteger(pricingRevision))) {
      return json({ error: 'Choose a valid positive pricing revision.' }, 400);
    }
    const evidenceReference = url.searchParams.get('evidenceReference');
    if (evidenceReference !== null && (!evidenceReference.trim() || [...evidenceReference].length > 160 ||
        /[\u0000-\u001f\u007f]/.test(evidenceReference))) {
      return json({ error: 'Choose a valid evidence-reference filter.' }, 400);
    }
    const retryOfEventId = url.searchParams.get('retryOfEventId');
    if (retryOfEventId !== null && (!retryOfEventId.trim() || retryOfEventId.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(retryOfEventId))) {
      return json({ error: 'Choose a valid retry-event filter.' }, 400);
    }
    const reversalOfEventId = url.searchParams.get('reversalOfEventId');
    if (reversalOfEventId !== null && (!reversalOfEventId.trim() || reversalOfEventId.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(reversalOfEventId))) {
      return json({ error: 'Choose a valid reversal-event filter.' }, 400);
    }
    const approvalId = url.searchParams.get('approvalId');
    if (approvalId !== null && (!approvalId.trim() || approvalId.length > 160 ||
        /[\u0000-\u001f\u007f]/.test(approvalId))) {
      return json({ error: 'Choose a valid approval-record filter.' }, 400);
    }
    // The cursor is only a position, never authority: all current scope and
    // filter predicates apply again on every page. Preserve the stored text
    // timestamp to match the existing deterministic ordering exactly.
    const cursor = url.searchParams.get('cursor');
    let beforeTime: string | null = null;
    let beforeId: string | null = null;
    if (cursor !== null) {
      try {
        if (cursor.length > 1024) throw new Error('Invalid cursor');
        const position: unknown = JSON.parse(cursor);
        if (!Array.isArray(position) || position.length !== 2 ||
            typeof position[0] !== 'string' || position[0].length > 80 || !Number.isFinite(Date.parse(position[0])) ||
            typeof position[1] !== 'string' || position[1].length < 1 || position[1].length > 160 ||
            position.some(value => /[\u0000-\u001f\u007f]/.test(value))) throw new Error('Invalid cursor');
        [beforeTime, beforeId] = position;
      } catch {
        return json({ error: 'Choose a valid provider-cost event cursor.' }, 400);
      }
    }
    const scopedCompanyIds = requestedCompanyId ? [requestedCompanyId] : companyIds;
    const placeholders = scopedCompanyIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT id,company_id AS companyId,actor_employee_id AS actorEmployeeId,
        actor_role_code AS actorRoleCode,action,amount_minor AS amountMinor,currency,
        provider,estimated_cost_minor AS estimatedCostMinor,
        actual_cost_minor AS actualCostMinor,cost_currency AS costCurrency,
        pricing_id AS pricingId,pricing_revision AS pricingRevision,pricing_verified_at AS pricingVerifiedAt,
        approval_id AS approvalId,maker_employee_id AS makerEmployeeId,
        checker_employee_id AS checkerEmployeeId,provider_reference AS providerReference,
        retry_of_event_id AS retryOfEventId,reversal_of_event_id AS reversalOfEventId,
        occurred_at AS occurredAt,evidence_reference AS evidenceReference,
        requesting_module AS requestingModule,cost_center_id AS costCenterId,service
      FROM financial_provider_cost_events
      WHERE company_id IN (${placeholders})
        AND (? IS NULL OR provider=?)
        AND (? IS NULL OR requesting_module=?)
        AND (? IS NULL OR date(occurred_at)=?)
        AND (? IS NULL OR strftime('%Y-%m',occurred_at)=?)
        AND (? IS NULL OR actor_employee_id=?)
        AND (? IS NULL OR cost_center_id=?)
        AND (? IS NULL OR service=?)
        AND (? IS NULL OR provider_reference=?)
        AND (? IS NULL OR action=?)
        AND (? IS NULL OR pricing_id=?)
        AND (? IS NULL OR pricing_revision=?)
        AND (? IS NULL OR evidence_reference=?)
        AND (? IS NULL OR retry_of_event_id=?)
        AND (? IS NULL OR reversal_of_event_id=?)
        AND (? IS NULL OR approval_id=?)
        AND (? IS NULL OR maker_employee_id=?)
        AND (? IS NULL OR checker_employee_id=?)
        AND (? IS NULL OR cost_currency=?)
        AND (? IS NULL OR currency=?)
        AND (? IS NULL OR actor_role_code=?)
        AND (? IS NULL OR occurred_at < ? OR (occurred_at = ? AND id < ?))
      ORDER BY occurred_at DESC,id DESC
      LIMIT ?
    `).bind(...scopedCompanyIds, provider, provider, requestingModule, requestingModule, day, day, month, month, actorEmployeeId, actorEmployeeId, costCenterId, costCenterId, service, service, providerReference, providerReference, action, action, pricingId, pricingId, pricingRevision, pricingRevision, evidenceReference, evidenceReference, retryOfEventId, retryOfEventId, reversalOfEventId, reversalOfEventId, approvalId, approvalId, makerEmployeeId, makerEmployeeId, checkerEmployeeId, checkerEmployeeId, costCurrency, costCurrency, currency, currency, actorRoleCode, actorRoleCode, beforeTime, beforeTime, beforeTime, beforeId, limit + 1).all<Record<string, unknown>>();
    const events = (rows.results || []).slice(0, limit);
    const last = events[events.length - 1];
    const nextCursor = (rows.results || []).length > limit && last
      ? JSON.stringify([last.occurredAt, last.id]) : null;
    return json({ events, nextCursor, visibleCompanyIds: scopedCompanyIds, provider, module: requestingModule, day, month, actorEmployeeId, costCenterId, service, providerReference, action, pricingId, pricingRevision, evidenceReference, retryOfEventId, reversalOfEventId, approvalId, makerEmployeeId, checkerEmployeeId, costCurrency, currency, actorRoleCode, limit });
  }

  if (url.pathname === '/api/financial-gateway/budgets') {
    if (request.method === 'POST') {
      if (!owner) return json({ error: 'Owner provider-budget administration access is required.' }, 403);
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; }
      catch { return json({ error: 'Invalid provider budget.' }, 400); }
      const companyId = typeof body.companyId === 'string' ? body.companyId : '';
      const groupBudget = companyId === 'group';
      const providerScope = typeof body.providerScope === 'string' ? body.providerScope.trim() : '';
      const moduleScope = typeof body.moduleScope === 'string' ? body.moduleScope.trim() : '';
      const period = body.period;
      const budgetMinor = body.budgetMinor;
      const currency = body.currency;
      const alertThresholdPercent = body.alertThresholdPercent;
      const exhaustedAction = body.exhaustedAction;
      const active = body.active;
      if ((!groupBudget && !TARGET_COMPANIES.includes(companyId)) || !providerScope || providerScope.length > 80 ||
          (providerScope !== '*' && !/^[A-Za-z0-9_.:-]+$/.test(providerScope)) ||
          !moduleScope || moduleScope.length > 80 ||
          (moduleScope !== '*' && !/^[a-z][a-z0-9_.:-]*$/.test(moduleScope)) ||
          !['monthly', 'daily'].includes(String(period)) ||
          typeof budgetMinor !== 'number' || !Number.isSafeInteger(budgetMinor) || budgetMinor <= 0 ||
          typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) ||
          typeof alertThresholdPercent !== 'number' || !Number.isInteger(alertThresholdPercent) || alertThresholdPercent < 1 || alertThresholdPercent > 100 ||
          !['require_approval', 'block_noncritical'].includes(String(exhaustedAction)) || typeof active !== 'boolean') {
        return json({ error: 'Company, scope, period, positive budget, currency and bounded policy are required.' }, 400);
      }
      const id = `fpb-${crypto.randomUUID()}`;
      try {
        if (groupBudget) {
          await env.DB.batch([
            env.DB.prepare(`INSERT INTO financial_provider_group_budgets(
              id,provider_scope,module_scope,period,budget_minor,currency,
              alert_threshold_percent,exhausted_action,active,created_by,updated_by
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(provider_scope,module_scope,period,currency) DO UPDATE SET
              budget_minor=excluded.budget_minor,alert_threshold_percent=excluded.alert_threshold_percent,
              exhausted_action=excluded.exhausted_action,active=excluded.active,
              updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
              .bind(id, providerScope, moduleScope, period, budgetMinor, currency,
                alertThresholdPercent, exhaustedAction, active ? 1 : 0, context.employee.id, context.employee.id),
            env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
              SELECT ?,?,NULL,'financial_gateway','upsert_provider_group_budget','financial_provider_group_budget',id,?,'web'
              FROM financial_provider_group_budgets WHERE provider_scope=? AND module_scope=? AND period=? AND currency=?`)
              .bind(`audit-${crypto.randomUUID()}`, context.employee.id,
                JSON.stringify({ scope: 'group', providerScope, moduleScope, period, budgetMinor, currency, alertThresholdPercent, exhaustedAction, active }),
                providerScope, moduleScope, period, currency),
          ]);
          return json({ ok: true, companyId: 'group', providerScope, moduleScope, period, budgetMinor, currency, active, providerCallMade: false });
        }
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO financial_provider_budgets(
            id,company_id,provider_scope,module_scope,period,budget_minor,currency,
            alert_threshold_percent,exhausted_action,active,created_by,updated_by
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(company_id,provider_scope,module_scope,period,currency) DO UPDATE SET
            budget_minor=excluded.budget_minor,alert_threshold_percent=excluded.alert_threshold_percent,
            exhausted_action=excluded.exhausted_action,active=excluded.active,
            updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
            .bind(id, companyId, providerScope, moduleScope, period, budgetMinor, currency,
              alertThresholdPercent, exhaustedAction, active ? 1 : 0, context.employee.id, context.employee.id),
          env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
            SELECT ?,?,?, 'financial_gateway','upsert_provider_budget','financial_provider_budget',id,?,'web'
            FROM financial_provider_budgets WHERE company_id=? AND provider_scope=? AND module_scope=? AND period=? AND currency=?`)
            .bind(`audit-${crypto.randomUUID()}`, context.employee.id, companyId,
              JSON.stringify({ providerScope, moduleScope, period, budgetMinor, currency, alertThresholdPercent, exhaustedAction, active }),
              companyId, providerScope, moduleScope, period, currency),
        ]);
      } catch {
        return json({ error: 'Provider budget could not be saved.' }, 409);
      }
      return json({ ok: true, companyId, providerScope, moduleScope, period, budgetMinor, currency, active, providerCallMade: false });
    }
    if (request.method !== 'GET') return json({ error: 'Use GET or POST for provider budgets.' }, 405);
    const requestedCompanyId = url.searchParams.get('companyId');
    if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
      return json({ error: 'Financial provider-cost access is not assigned.' }, 403);
    }
    const scopedCompanyIds = requestedCompanyId ? [requestedCompanyId] : companyIds;
    const placeholders = scopedCompanyIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT b.id,b.company_id AS companyId,b.provider_scope AS providerScope,
        b.module_scope AS moduleScope,b.period,b.budget_minor AS budgetMinor,b.currency,
        b.alert_threshold_percent AS alertThresholdPercent,b.exhausted_action AS exhaustedAction,
        b.active,b.created_at AS createdAt,b.updated_at AS updatedAt,
        COALESCE((SELECT SUM(e.actual_cost_minor)
          FROM financial_provider_cost_events e
          WHERE e.company_id=b.company_id AND e.cost_currency=b.currency
            AND e.actual_cost_minor IS NOT NULL
            AND date(e.occurred_at) >= CASE b.period
              WHEN 'daily' THEN date('now','start of day')
              ELSE date('now','start of month') END
            AND (b.provider_scope='*' OR e.provider=b.provider_scope)
            AND (b.module_scope='*' OR e.requesting_module=b.module_scope)),0) AS actualSpentMinor
      FROM financial_provider_budgets b
      WHERE b.company_id IN (${placeholders})
      ORDER BY b.company_id,b.period,b.provider_scope,b.module_scope,b.currency,b.id
      LIMIT 500
    `).bind(...scopedCompanyIds).all<Record<string, unknown>>();
    const budgets = (rows.results || []).map((budget) => {
      const actualSpentMinor = safeActualSpend(budget.actualSpentMinor);
      const budgetMinor = Number(budget.budgetMinor) || 0;
      const alertThresholdPercent = Number(budget.alertThresholdPercent) || 0;
      const usage = budgetUsage(actualSpentMinor ?? Number.MAX_SAFE_INTEGER + 1, budgetMinor, alertThresholdPercent, Boolean(budget.active));
      return {
        ...budget,
        actualSpentMinor,
        ...usage,
      };
    });
    if (owner) {
      const groupRows = await env.DB.prepare(`
        SELECT b.id,'group' AS companyId,b.provider_scope AS providerScope,
          b.module_scope AS moduleScope,b.period,b.budget_minor AS budgetMinor,b.currency,
          b.alert_threshold_percent AS alertThresholdPercent,b.exhausted_action AS exhaustedAction,
          b.active,b.created_at AS createdAt,b.updated_at AS updatedAt,
          COALESCE((SELECT SUM(e.actual_cost_minor)
            FROM financial_provider_cost_events e
            WHERE e.company_id IN (${TARGET_COMPANIES.map(() => '?').join(',')})
              AND e.cost_currency=b.currency AND e.actual_cost_minor IS NOT NULL
              AND date(e.occurred_at) >= CASE b.period
                WHEN 'daily' THEN date('now','start of day')
                ELSE date('now','start of month') END
              AND (b.provider_scope='*' OR e.provider=b.provider_scope)
              AND (b.module_scope='*' OR e.requesting_module=b.module_scope)),0) AS actualSpentMinor
        FROM financial_provider_group_budgets b
        ORDER BY b.period,b.provider_scope,b.module_scope,b.currency,b.id
        LIMIT 100
      `).bind(...TARGET_COMPANIES).all<Record<string, unknown>>();
      budgets.push(...(groupRows.results || []).map((budget) => {
        const actualSpentMinor = safeActualSpend(budget.actualSpentMinor);
        const budgetMinor = Number(budget.budgetMinor) || 0;
        const alertThresholdPercent = Number(budget.alertThresholdPercent) || 0;
        const usage = budgetUsage(actualSpentMinor ?? Number.MAX_SAFE_INTEGER + 1, budgetMinor, alertThresholdPercent, Boolean(budget.active));
        return {
          ...budget,
          actualSpentMinor,
          ...usage,
        };
      }));
    }
    return json({ budgets, visibleCompanyIds: scopedCompanyIds });
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
      p.effective_at AS effectiveAt,p.last_verified_at AS lastVerifiedAt,p.status,p.revision
      FROM financial_provider_pricing p JOIN financial_provider_pricing_businesses b ON b.pricing_id=p.id
      WHERE p.id=? AND b.company_id=? AND b.available=1 LIMIT 1`)
      .bind(pricingId, companyId).first<PricingFacts>();
    if (!pricing) return json({ error: 'Pricing record was not found.' }, 404);
    return json({ companyId, pricingId, pricingRevision: pricing.revision, ...estimateProviderCost(pricing, body) });
  }
  if (request.method !== 'GET') return json({ error: 'Use GET to read provider pricing.' }, 405);

  const placeholders = companyIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT p.id,p.provider,p.service,p.pricing_model AS pricingModel,
      p.fixed_amount_minor AS fixedAmountMinor,p.percentage_bps AS percentageBps,
      p.minimum_amount_minor AS minimumAmountMinor,p.maximum_amount_minor AS maximumAmountMinor,
      p.cap_amount_minor AS capAmountMinor,p.vat_treatment AS vatTreatment,p.currency,
      p.effective_at AS effectiveAt,p.last_verified_at AS lastVerifiedAt,
      p.official_source AS officialSource,p.status,p.notes,p.revision,
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
