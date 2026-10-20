/**
 * StaffPortal account recovery routing — never disclose company membership or
 * account existence to an unauthenticated browser. No recovery method is
 * enabled without a currently active, non-FarmPortal company membership and
 * its existing Owner/Admin policy.
 */
import { RECOVERY_SETTING_KEY, recoveryMethods, resolveScopedSetting,
  type RecoveryMethodPolicy } from './scoped-settings';

export type RecoveryChannel = 'email' | 'whatsapp';
export type RecoveryCompany = {
  employeeId: string;
  companyId: string;
  companyCode: string;
};

/**
 * Resolve only an UNAMBIGUOUS StaffPortal employee identity. A reused email,
 * or an identifier matching a username on one record and email on another,
 * must NEVER select an arbitrary account with SQL LIMIT 1.
 *
 * The result stays server-side. The public endpoints use the same generic
 * response for unknown, ambiguous and disallowed identities.
 */
export async function resolveRecoveryCompanyForIdentifier(
  env: { DB: D1Database }, identifier: string, channel: RecoveryChannel,
): Promise<RecoveryCompany | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || normalized.length > 254) return null;
  const unique = await env.DB.prepare(
    'SELECT DISTINCT e.id AS employeeId FROM employees e ' +
    'JOIN employee_credentials ec ON ec.employee_id=e.id ' +
    "WHERE e.employment_status IN ('active','provisional') " +
    'AND (LOWER(ec.username)=? OR LOWER(e.email)=?) ' +
    'AND EXISTS (SELECT 1 FROM employee_company_memberships m ' +
    'JOIN companies c ON c.id=m.company_id AND c.active=1 ' +
    "AND LOWER(c.name) NOT LIKE '%farm%' " +
    'WHERE m.employee_id=e.id AND m.active=1) LIMIT 2',
  ).bind(normalized, normalized).all<{ employeeId: string }>();
  const employees = unique.results || [];
  if (employees.length !== 1) return null;

  const employeeId = employees[0].employeeId;
  const memberships = await env.DB.prepare(
    'SELECT m.company_id AS companyId, c.code AS companyCode ' +
    'FROM employee_company_memberships m JOIN companies c ON c.id=m.company_id ' +
    "WHERE m.employee_id=? AND m.active=1 AND c.active=1 " +
    "AND LOWER(c.name) NOT LIKE '%farm%' " +
    'ORDER BY m.is_primary DESC, c.code ASC LIMIT 24',
  ).bind(employeeId).all<{ companyId: string; companyCode: string }>();
  for (const company of memberships.results || []) {
    // Preserve company policy and global fallback; a selected company must
    // actually permit the requested recovery channel.
    const setting = await resolveScopedSetting(
      env, RECOVERY_SETTING_KEY, company.companyId, 'email',
    );
    if (recoveryMethods(setting.value as RecoveryMethodPolicy).includes(channel)) {
      return { employeeId, companyId: company.companyId, companyCode: company.companyCode };
    }
  }
  return null;
}
