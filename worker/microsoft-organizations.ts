/**
 * StaffPortal staging-only Microsoft Entra organizations support.
 * Immutable identity (tenant ID, object ID), never mutable email or UPN.
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

export async function organizationsLinkStorageReady(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' " +
      "AND name='staffportal_external_identity_links' LIMIT 1",
    ).first<{ name: string }>();
    return row?.name === 'staffportal_external_identity_links';
  } catch {
    return false;
  }
}

export async function linkedMicrosoftEmployee(db: D1Database, identity: OrganizationIdentity) {
  const row = await db.prepare(
    "SELECT l.employee_id AS employeeId " +
    "FROM staffportal_external_identity_links l " +
    "JOIN employees e ON e.id=l.employee_id " +
    "WHERE l.provider='microsoft' AND l.tenant_id=? AND l.object_id=? " +
    "AND l.revoked_at IS NULL AND e.employment_status IN ('active','provisional') " +
    "AND EXISTS (SELECT 1 FROM employee_company_memberships m " +
    "JOIN companies c ON c.id=m.company_id " +
    "WHERE m.employee_id=e.id AND m.active=1 AND c.active=1) LIMIT 1",
  ).bind(identity.tenantId, identity.objectId).first<{ employeeId: string }>();
  return row?.employeeId || null;
}

export async function linkedMicrosoftIdentityForEmployee(db: D1Database, employeeId: string) {
  return db.prepare(
    "SELECT tenant_id AS tenantId, object_id AS objectId, revoked_at AS revokedAt " +
    "FROM staffportal_external_identity_links WHERE provider='microsoft' AND employee_id=? LIMIT 1",
  ).bind(employeeId).first<{ tenantId: string; objectId: string; revokedAt: string | null }>();
}

export async function microsoftLinkSessionEligible(
  db: D1Database, employeeId: string, companyId: string, sessionId: string,
) {
  const row = await db.prepare(
    "SELECT e.id FROM employees e " +
    "JOIN employee_company_memberships m ON m.employee_id=e.id AND m.company_id=? AND m.active=1 " +
    "JOIN companies c ON c.id=m.company_id AND c.active=1 " +
    "JOIN auth_sessions s ON s.employee_id=e.id AND s.id=? AND s.revoked_at IS NULL " +
    "AND datetime(s.expires_at)>datetime('now') " +
    "AND datetime(s.created_at)>=datetime('now','-15 minutes') " +
    "WHERE e.id=? AND e.employment_status IN ('active','provisional') LIMIT 1",
  ).bind(companyId, sessionId, employeeId).first<{ id: string }>();
  return Boolean(row);
}

// Exported exact SQL is exercised against separate SQLite connections in QA.
export const microsoftLinkInsertSql = [
  'INSERT OR IGNORE INTO staffportal_external_identity_links',
  ' (id, provider, tenant_id, object_id, employee_id, linked_by_employee_id)',
  " SELECT ?, 'microsoft', ?, ?, e.id, e.id",
  ' FROM employees e',
  ' JOIN employee_company_memberships m ON m.employee_id=e.id AND m.company_id=? AND m.active=1',
  ' JOIN companies c ON c.id=m.company_id AND c.active=1',
  ' JOIN auth_sessions s ON s.employee_id=e.id AND s.id=? AND s.revoked_at IS NULL',
  " AND datetime(s.expires_at)>datetime('now')",
  " AND datetime(s.created_at)>=datetime('now','-15 minutes')",
  " WHERE e.id=? AND e.employment_status IN ('active','provisional') LIMIT 1",
].join('\n');

export const microsoftLinkAuditSql = [
  'INSERT INTO security_logs',
  ' (id, employee_id, company_id, session_id, event_type,',
  '  severity, result, ip_address, user_agent, details_json)',
  " SELECT ?, l.employee_id, ?, ?, 'microsoft_identity_linked',",
  " 'info', 'linked', ?, ?, ?",
  ' FROM staffportal_external_identity_links l',
  " WHERE l.id=? AND l.employee_id=? AND l.provider='microsoft'",
  ' AND l.tenant_id=? AND l.object_id=? AND l.revoked_at IS NULL',
].join('\n');

/**
 * The link INSERT and mandatory audit INSERT execute in a single D1 batch
 * transaction, automatically rolled back together on any SQL failure.
 * The unique fresh link ID makes the audit SELECT execute only for the new
 * link committed by this request. Ignored concurrent attempts cannot
 * fabricate an audit of a successful association.
 */
export async function bindMicrosoftEmployeeIdentity(
  db: D1Database, employeeId: string, identity: OrganizationIdentity,
  sessionId: string, companyId: string, request: Request,
): Promise<'linked' | 'existing' | 'conflict'> {
  if (!await microsoftLinkSessionEligible(db, employeeId, companyId, sessionId)) {
    return 'conflict';
  }
  const existing = await linkedMicrosoftIdentityForEmployee(db, employeeId);
  if (existing) {
    return !existing.revokedAt && existing.tenantId === identity.tenantId &&
      existing.objectId === identity.objectId ? 'existing' : 'conflict';
  }
  const linkId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const details = JSON.stringify({
    authentication: 'microsoft_organizations',
    tenantId: identity.tenantId,
    objectId: identity.objectId,
  });
  // Re-check active company, employee status and fresh session INSIDE the
  // INSERT transaction; revocation after the first check must fail closed.
  const results = await db.batch([
    db.prepare(microsoftLinkInsertSql).bind(
      linkId, identity.tenantId, identity.objectId, companyId, sessionId, employeeId,
    ),
    db.prepare(microsoftLinkAuditSql).bind(
      auditId, companyId, sessionId,
      request.headers.get('cf-connecting-ip'), request.headers.get('user-agent'), details,
      linkId, employeeId, identity.tenantId, identity.objectId,
    ),
  ]);
  const inserted = Number(results[0]?.meta?.changes || 0);
  const audited = Number(results[1]?.meta?.changes || 0);
  if (inserted === 1) {
    if (audited !== 1) throw new Error('Microsoft link mandatory audit invariant failed');
    return 'linked';
  }
  const winner = await linkedMicrosoftIdentityForEmployee(db, employeeId);
  return winner && !winner.revokedAt && winner.tenantId === identity.tenantId &&
    winner.objectId === identity.objectId &&
    await microsoftLinkSessionEligible(db, employeeId, companyId, sessionId)
    ? 'existing' : 'conflict';
}
