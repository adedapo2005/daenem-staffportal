/**
 * StaffPortal staging-only Microsoft Entra organizations support.
 *
 * External Microsoft user identity is bound by (tid, oid), never by mutable
 * email, preferred_username, UPN or display name. The employee row, existing
 * company memberships and application roles remain the only authorization.
 */
export interface OrganizationIdentity {
  tenantId: string;
  objectId: string;
  issuer: string;
  subject: string;
}

const guid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const consumerTenant = '9188040d-6c67-4c5b-b112-36a304b66dad';
const issuerTemplate = 'https://login.microsoftonline.com/{tenantid}/v2.0';

export function isOrganizationsStaging(env: { APP_STAGE: string; MICROSOFT_AUTH_MODE?: string }) {
  return env.APP_STAGE === 'staging' && env.MICROSOFT_AUTH_MODE === 'organizations';
}

export function organizationIdentity(payload: Record<string, unknown>): OrganizationIdentity | null {
  if (typeof payload.tid !== 'string' || !guid.test(payload.tid) ||
      payload.tid.toLowerCase() === consumerTenant ||
      typeof payload.oid !== 'string' || !guid.test(payload.oid) ||
      typeof payload.sub !== 'string' || !payload.sub ||
      payload.ver !== '2.0' || payload.idtyp === 'app') return null;

  const issuer = 'https://login.microsoftonline.com/' + payload.tid + '/v2.0';
  if (payload.iss !== issuer) return null;

  return {
    tenantId: payload.tid.toLowerCase(),
    objectId: payload.oid.toLowerCase(),
    issuer,
    subject: payload.sub,
  };
}

export function organizationSigningKeyIssuerMatches(keyIssuer: unknown, identity: OrganizationIdentity) {
  return typeof keyIssuer === 'string' &&
    (keyIssuer === issuerTemplate || keyIssuer === identity.issuer);
}

export async function linkedMicrosoftEmployee(db: D1Database, identity: OrganizationIdentity) {
  const row = await db.prepare(
    "SELECT l.employee_id AS employeeId, e.employment_status AS status " +
    "FROM staffportal_external_identity_links l " +
    "JOIN employees e ON e.id=l.employee_id " +
    "WHERE l.provider='microsoft' AND l.tenant_id=? AND l.object_id=? " +
    "AND l.revoked_at IS NULL " +
    "AND EXISTS (SELECT 1 FROM employee_company_memberships m " +
    "WHERE m.employee_id=l.employee_id AND m.active=1) LIMIT 1",
  ).bind(identity.tenantId, identity.objectId)
    .first<{ employeeId: string; status: string }>();
  return row && (row.status === 'active' || row.status === 'provisional')
    ? row.employeeId : null;
}

export async function linkedMicrosoftIdentityForEmployee(db: D1Database, employeeId: string) {
  return db.prepare(
    "SELECT tenant_id AS tenantId, object_id AS objectId, revoked_at AS revokedAt " +
    "FROM staffportal_external_identity_links WHERE provider='microsoft' AND employee_id=? LIMIT 1",
  ).bind(employeeId).first<{ tenantId: string; objectId: string; revokedAt: string | null }>();
}

export async function bindMicrosoftEmployeeIdentity(
  db: D1Database, employeeId: string, identity: OrganizationIdentity,
): Promise<'linked' | 'existing' | 'conflict'> {
  // Existing employee/identity links are immutable: a different identity cannot
  // take over an employee, and one identity cannot belong to two employees.
  const existing = await linkedMicrosoftIdentityForEmployee(db, employeeId);
  if (existing) {
    return !existing.revokedAt && existing.tenantId === identity.tenantId &&
      existing.objectId === identity.objectId ? 'existing' : 'conflict';
  }
  await db.prepare(
    "INSERT OR IGNORE INTO staffportal_external_identity_links " +
    "(id, provider, tenant_id, object_id, employee_id, linked_by_employee_id) " +
    "SELECT ?, 'microsoft', ?, ?, ?, ? WHERE EXISTS " +
    "(SELECT 1 FROM employees e WHERE e.id=? " +
    "AND e.employment_status IN ('active','provisional'))",
  ).bind(crypto.randomUUID(), identity.tenantId, identity.objectId,
    employeeId, employeeId, employeeId).run();
  const verified = await linkedMicrosoftIdentityForEmployee(db, employeeId);
  return verified && !verified.revokedAt && verified.tenantId === identity.tenantId &&
    verified.objectId === identity.objectId ? 'linked' : 'conflict';
}
