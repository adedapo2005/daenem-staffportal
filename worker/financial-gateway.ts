import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface FinancialGatewayEnv extends AuthEnv {}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const TARGET_COMPANIES = ['company-printing', 'company-bakery', 'company-autos', 'company-properties', 'company-logistics'];

export async function routeFinancialGateway(request: Request, env: FinancialGatewayEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/financial-gateway/pricing' || request.method !== 'GET') return null;

  const owner = context.roles.some((role) => role.code === 'owner');
  const companyIds = owner
    ? TARGET_COMPANIES
    : TARGET_COMPANIES.filter((companyId) => context.companies.some((company) => company.id === companyId) && hasPermission(context, 'finance.reports', 'view', companyId));
  if (companyIds.length === 0) return json({ error: 'Financial provider-cost access is not assigned.' }, 403);

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
