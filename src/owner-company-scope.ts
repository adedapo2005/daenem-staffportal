import type { WorkforceContext } from './auth';
import type { Company } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model';

/**
 * Owner navigation is a presentation projection, not a grant.
 * Only companies returned in the authenticated context with an active Owner
 * membership and at least one explicit company-scoped permission are included.
 * The role title alone never expands a single-company Owner to every business.
 */
export function ownerCompanyScopes(context: WorkforceContext): Company[] {
  const ownerCompanyIds = new Set(
    context.roles
      .filter((role) => /owner|super.?admin/i.test(`${role.code} ${role.name}`))
      .map((role) => role.companyId),
  );
  const result: Company[] = [];
  for (const company of context.companies) {
    if (!ownerCompanyIds.has(company.id)) continue;
    const grants = context.companyPermissions?.[company.id];
    if (!grants || !Object.values(grants).some((level) => ['view', 'create', 'edit', 'approve', 'manage'].includes(level))) continue;
    const value = `${company.code} ${company.name}`.toLowerCase();
    const key: Company = value.includes('printing') || value.includes('technology')
      ? 'printing'
      : value.includes('bakery')
        ? 'bakery'
        : value.includes('autos') || value.includes('automotive')
          ? 'autos'
          : value.includes('logistics')
            ? 'logistics'
            : value.includes('properties') || value.includes('homes')
              ? 'properties'
              : 'group';
    if (key !== 'group' && !result.includes(key)) result.push(key);
  }
  return result;
}
