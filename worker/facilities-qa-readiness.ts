/**
 * Bounded, read-only D1 inventory for the existing qa-staging-v1 namespace.
 * No business-company rows, identities, contacts, tokens or audit payloads
 * are returned. Access and staging-only guards are enforced by routeFacilities.
 *
 * This does NOT provision or reset QA records.
 */
export type FacilitiesQaReadiness = {
  scope: 'qa-staging-v1';
  state: 'not_seeded' | 'ready' | 'transaction_evidence_present' | 'incomplete';
  syntheticCompanies: number;
  syntheticSites: number;
  syntheticEmployees: number;
  activeMemberships: number;
  credentials: number;
  facilitiesGrants: number;
  evidence: {
    facilities: number;
    equipment: number;
    readings: number;
    workOrders: number;
    schedules: number;
    inspections: number;
    auditEvents: number;
  };
  safeToReset: boolean;
};

type Inventory = {
  companies: number;
  sites: number;
  employees: number;
  memberships: number;
  credentials: number;
  grants: number;
  facilities: number;
  equipment: number;
  readings: number;
  orders: number;
  schedules: number;
  inspections: number;
  audits: number;
};

export async function inspectFacilitiesQaReadiness(db: D1Database): Promise<FacilitiesQaReadiness> {
  // All IDs are fixed literals, not caller-supplied company IDs or wildcard filters.
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM companies WHERE id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b') AND active=1) AS companies,
      (SELECT COUNT(*) FROM company_locations WHERE id IN ('qa-staging-v1-site-a','qa-staging-v1-site-b') AND active=1) AS sites,
      (SELECT COUNT(*) FROM employees WHERE id IN ('qa-staging-v1-owner','qa-staging-v1-manager','qa-staging-v1-employee') AND employment_status='active') AS employees,
      (SELECT COUNT(*) FROM employee_company_memberships WHERE id IN
        ('qa-staging-v1-membership-owner-a','qa-staging-v1-membership-owner-b','qa-staging-v1-membership-manager-a','qa-staging-v1-membership-employee-b')
        AND active=1) AS memberships,
      (SELECT COUNT(*) FROM employee_credentials WHERE employee_id IN
        ('qa-staging-v1-owner','qa-staging-v1-manager','qa-staging-v1-employee')) AS credentials,
      (SELECT COUNT(*) FROM role_permissions WHERE role_id IN
        ('qa-staging-v1-role-owner','qa-staging-v1-role-manager','qa-staging-v1-role-employee')
        AND permission_id=(SELECT id FROM permissions WHERE code='facilities.access')) AS grants,
      (SELECT COUNT(*) FROM facilities WHERE company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b')) AS facilities,
      (SELECT COUNT(*) FROM assets WHERE company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b')) AS equipment,
      (SELECT COUNT(*) FROM asset_readings WHERE company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b')) AS readings,
      (SELECT COUNT(*) FROM maintenance_work_orders WHERE company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b')) AS orders,
      (SELECT COUNT(*) FROM preventive_maintenance_schedules WHERE company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b')) AS schedules,
      (SELECT COUNT(*) FROM facility_inspections WHERE company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b')) AS inspections,
      (SELECT COUNT(*) FROM audit_logs WHERE module='facilities' AND company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b')) AS audits
  `).first<Inventory>();
  if (!row) throw new Error('QA D1 readiness unavailable');
  const count = (v: number) => Math.max(0, Number(v) || 0);
  const evidence = {
    facilities: count(row.facilities),
    equipment: count(row.equipment),
    readings: count(row.readings),
    workOrders: count(row.orders),
    schedules: count(row.schedules),
    inspections: count(row.inspections),
    auditEvents: count(row.audits),
  };
  const evidencePresent = Object.values(evidence).some(value => value > 0);
  const hasAnyIdentity = [row.companies,row.sites,row.employees,row.memberships,row.credentials,row.grants]
    .some(value => Number(value) > 0);
  const complete = row.companies === 2 && row.sites === 2 && row.employees === 3 &&
    row.memberships === 4 && row.credentials === 3 && row.grants === 3;
  const state = complete
    ? (evidencePresent ? 'transaction_evidence_present' : 'ready')
    : (!hasAnyIdentity && !evidencePresent ? 'not_seeded' : 'incomplete');
  return {
    scope: 'qa-staging-v1',
    state,
    syntheticCompanies: count(row.companies),
    syntheticSites: count(row.sites),
    syntheticEmployees: count(row.employees),
    activeMemberships: count(row.memberships),
    credentials: count(row.credentials),
    facilitiesGrants: count(row.grants),
    evidence,
    safeToReset: !evidencePresent,
  };
}
