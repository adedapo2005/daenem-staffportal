import { hasPermission, type AuthEnv, type SessionContext, type AccessLevel } from './auth';

export interface SocialBrand {
  id: string;
  companyId?: string;
  code: string;
  name: string;
  shortName?: string;
  primaryMarket: string;
  timezone: string;
  locale: string;
  toneProfileJson?: string;
  defaultCta?: string;
  defaultWhatsappPhone?: string;
  active: number;
}

export function isSocialGroupOperator(context: SessionContext) {
  return context.roles.some((role) => ['owner', 'group_admin'].includes(role.code));
}

export function socialPermission(context: SessionContext, code: string, level: AccessLevel = 'view') {
  return hasPermission(context, code, level);
}

export function canAccessSocialBrand(context: SessionContext, brand: Pick<SocialBrand, 'companyId'>) {
  if (isSocialGroupOperator(context)) return true;
  return Boolean(brand.companyId && context.companies.some((company) => company.id === brand.companyId));
}

export async function getSocialBrand(env: AuthEnv, brandId: string) {
  return env.DB.prepare(`
    SELECT id,company_id AS companyId,code,name,short_name AS shortName,
           primary_market AS primaryMarket,timezone,locale,tone_profile_json AS toneProfileJson,
           default_cta AS defaultCta,default_whatsapp_phone AS defaultWhatsappPhone,active
    FROM social_brands WHERE id=? AND active=1
  `).bind(brandId).first<SocialBrand>();
}

export async function requireSocialBrand(env: AuthEnv, context: SessionContext, brandId: string) {
  const brand = await getSocialBrand(env, brandId);
  if (!brand || !canAccessSocialBrand(context, brand)) return null;
  return brand;
}

export async function listAccessibleSocialBrands(env: AuthEnv, context: SessionContext) {
  const rows = await env.DB.prepare(`
    SELECT id,company_id AS companyId,code,name,short_name AS shortName,
           primary_market AS primaryMarket,timezone,locale,tone_profile_json AS toneProfileJson,
           default_cta AS defaultCta,default_whatsapp_phone AS defaultWhatsappPhone,active
    FROM social_brands WHERE active=1 ORDER BY CASE code WHEN 'farms' THEN 1 WHEN 'printing' THEN 2 WHEN 'bakery' THEN 3 WHEN 'autos' THEN 4 WHEN 'properties' THEN 5 ELSE 6 END
  `).all<SocialBrand>();
  return (rows.results || []).filter((brand) => canAccessSocialBrand(context, brand));
}
