import type { ScopedCompany } from "./staffportal-api";

export function governedCompanySelection(
  current: string[],
  companies: ScopedCompany[],
  manageableCompanyIds: string[],
  sessionCompany: string,
) {
  const visibleIds = new Set(companies.map((company) => company.id));
  const manageableIds = new Set(manageableCompanyIds);
  const retained = current.filter(
    (companyId) => visibleIds.has(companyId) && manageableIds.has(companyId),
  );

  if (retained.length > 0) return retained;
  if (
    sessionCompany !== "group" &&
    visibleIds.has(sessionCompany) &&
    manageableIds.has(sessionCompany)
  ) {
    return [sessionCompany];
  }
  return [];
}
