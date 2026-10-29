/** Canonical Account A companies seeded by migrations/0001_core.sql. */
export const STAFFPORTAL_COMPANY_IDS = [
  'company-printing',
  'company-bakery',
  'company-autos',
  'company-logistics',
  'company-properties',
] as const;

const companyIdsSql = `(${STAFFPORTAL_COMPANY_IDS.map((id) => `'${id}'`).join(',')})`;

/** SQL scope for fixed source-owned column references; caller data is never interpolated. */
export function staffPortalCompanyPredicate(column: 'co.id' | 'm.company_id'): string {
  return `${column} IN ${companyIdsSql}`;
}

export function isStaffPortalCompanyId(value: string): value is (typeof STAFFPORTAL_COMPANY_IDS)[number] {
  return (STAFFPORTAL_COMPANY_IDS as readonly string[]).includes(value);
}
