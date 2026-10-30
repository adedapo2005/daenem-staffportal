/**
 * StaffPortal-only OAuth applicant enrollment. A verified provider identity may
 * request provisional onboarding, but must never create an authenticated session
 * or inherit an existing employee's permissions by matching a mutable email.
 */
export type OAuthApplicant = {
  provider: 'google' | 'microsoft';
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  microsoftTenantId?: string;
  microsoftObjectId?: string;
};
export type ApplicantResult = 'pending' | 'existing' | 'disabled' | 'unavailable' | 'rate_limited';

type SignupEnv = { DB: D1Database };
const uid = (prefix: string) => prefix + '-' + crypto.randomUUID();
const normalizedEmail = (value: string) => value.trim().toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export type OAuthApplicantApproval = 'not_applicant' | 'pending' | 'not_approved' | 'approved';

/** Only explicit management approval may unlock a social applicant. */
export async function oauthApplicantApproval(
  db: D1Database, employeeId: string,
): Promise<OAuthApplicantApproval> {
  const row = await db.prepare(
    "SELECT status FROM signup_requests WHERE employee_id=? " +
    "AND requested_role_text IN ('Social Applicant: google','Social Applicant: microsoft') " +
    "ORDER BY created_at DESC, id DESC LIMIT 1"
  ).bind(employeeId).first<{ status: string }>();
  if (!row) return 'not_applicant';
  if (row.status === 'approved') return 'approved';
  if (row.status === 'pending') return 'pending';
  return 'not_approved';
}

/**
 * Resolve a newly verified applicant only from a pending request. Microsoft
 * must match its immutable tenant/object pair as well as the verified email.
 */
export async function pendingOAuthApplicantId(
  db: D1Database, applicant: OAuthApplicant,
): Promise<string | null> {
  const email = normalizedEmail(applicant.email);
  if (!validEmail(email)) return null;
  if (applicant.provider === 'microsoft') {
    if (!applicant.microsoftTenantId || !applicant.microsoftObjectId) return null;
    const row = await db.prepare(`
      SELECT e.id
      FROM staffportal_external_identity_links link
      JOIN employees e ON e.id=link.employee_id
      JOIN signup_requests sr ON sr.employee_id=e.id
      WHERE link.provider='microsoft' AND link.tenant_id=?
        AND link.object_id=? AND link.revoked_at IS NULL
        AND lower(e.email)=? AND e.employment_status='provisional'
        AND sr.status='pending' AND sr.requested_role_text='Social Applicant: microsoft'
      LIMIT 1
    `).bind(applicant.microsoftTenantId,applicant.microsoftObjectId,email)
      .first<{ id: string }>();
    return row?.id || null;
  }
  const row = await db.prepare(`
    SELECT e.id FROM employees e
    JOIN signup_requests sr ON sr.employee_id=e.id
    WHERE lower(e.email)=? AND e.employment_status='provisional'
      AND sr.status='pending' AND sr.requested_role_text='Social Applicant: google'
    LIMIT 1
  `).bind(email).first<{ id: string }>();
  return row?.id || null;
}

export async function provisionOAuthApplicant(
  env: SignupEnv, applicant: OAuthApplicant, request: Request,
): Promise<ApplicantResult> {
  const email = normalizedEmail(applicant.email);
  if (!validEmail(email)) return 'unavailable';
  if (applicant.provider === 'microsoft' &&
      (!applicant.microsoftTenantId || !applicant.microsoftObjectId)) return 'unavailable';

  const enabled = await env.DB.prepare(
    "SELECT setting_value AS value FROM app_settings WHERE setting_key='portal.allow_self_signup'"
  ).first<{ value: string }>();
  if (enabled?.value === 'false') return 'disabled';

  const existing = await env.DB.prepare(
    'SELECT id FROM employees WHERE lower(email)=lower(?) LIMIT 1'
  ).bind(email).first<{ id: string }>();
  if (existing) return 'existing';

  const sourceIp = request.headers.get('cf-connecting-ip') || null;
  if (sourceIp) {
    const volume = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM security_logs WHERE event_type='oauth_signup_requested' " +
      "AND ip_address=? AND datetime(occurred_at)>=datetime('now','-15 minutes')"
    ).bind(sourceIp).first<{ n: number }>();
    if (Number(volume?.n || 0) >= 5) return 'rate_limited';
  }

  const defaultSetting = await env.DB.prepare(
    "SELECT setting_value AS code FROM app_settings WHERE setting_key='portal.default_signup_company_code'"
  ).first<{ code: string }>();
  const companyCode = String(defaultSetting?.code || 'PRINT').trim().toUpperCase();
  const company = await env.DB.prepare(
    'SELECT id FROM companies WHERE code=? AND active=1 LIMIT 1'
  ).bind(companyCode).first<{ id: string }>();
  if (!company) return 'unavailable';

  if (applicant.provider === 'microsoft') {
    const linked = await env.DB.prepare(
      "SELECT employee_id AS id FROM staffportal_external_identity_links " +
      "WHERE provider='microsoft' AND tenant_id=? AND object_id=? LIMIT 1"
    ).bind(applicant.microsoftTenantId, applicant.microsoftObjectId).first<{ id: string }>();
    if (linked) return 'existing';
  }

  const displayName = applicant.name.trim().slice(0, 160) || email.split('@')[0];
  const firstName = (applicant.firstName || displayName.split(/\s+/)[0] || '').trim().slice(0, 80);
  const lastName = (applicant.lastName || displayName.split(/\s+/).slice(1).join(' ')).trim().slice(0, 80);
  const employeeId = uid('employee');
  const linkId = uid('membership');
  const roleId = uid('employee-role');
  const requestId = uid('signup');
  const statements = [
    env.DB.prepare(
      "INSERT INTO employees(id,display_name,legal_name,first_name,last_name,email,employment_status) " +
      "VALUES(?,?,?,?,?,?,'provisional')"
    ).bind(employeeId, displayName, displayName, firstName, lastName, email),
    env.DB.prepare(
      'INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,1,1)'
    ).bind(linkId, employeeId, company.id),
    env.DB.prepare(
      "INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,'role-provisional')"
    ).bind(roleId, employeeId, company.id),
    env.DB.prepare(
      'INSERT INTO signup_requests(id,employee_id,requested_company_id,requested_role_text,submitted_ip,submitted_user_agent) ' +
      'VALUES(?,?,?,?,?,?)'
    ).bind(requestId, employeeId, company.id, 'Social Applicant: ' + applicant.provider,
      sourceIp, request.headers.get('user-agent')),
  ];
  if (applicant.provider === 'microsoft') {
    statements.push(env.DB.prepare(
      "INSERT INTO staffportal_external_identity_links" +
      "(id,provider,tenant_id,object_id,employee_id,linked_by_employee_id) " +
      "VALUES(?,'microsoft',?,?,?,?)"
    ).bind(uid('external-identity'), applicant.microsoftTenantId, applicant.microsoftObjectId,
      employeeId, employeeId));
  }
  statements.push(env.DB.prepare(
    "INSERT INTO security_logs(id,employee_id,event_type,severity,result,ip_address,user_agent,details_json) " +
    "VALUES(?,?,'oauth_signup_requested','info','pending',?,?,?)"
  ).bind(uid('security'), employeeId, sourceIp, request.headers.get('user-agent'),
    JSON.stringify({ provider: applicant.provider, companyId: company.id,
      verifiedBy: 'signed_provider_identity', approvalRequired: true })));
  // A trigger may silently ignore the mandatory audit insert. Keep the check
  // inside the batch so an ignored audit rolls back every provisional row.
  statements.push(env.DB.prepare(
    "SELECT CASE WHEN changes()=1 THEN 1 " +
    "ELSE json_extract('oauth signup security audit required','$') END AS audit_required"
  ));

  try {
    // D1.batch commits all writes or rolls all of them back on SQL failure.
    const results = await env.DB.batch(statements);
    if (results.slice(0, -1).some(result => Number(result?.meta?.changes || 0) !== 1)) {
      console.error('staffportal_oauth_signup_incomplete_batch');
      return 'unavailable';
    }
    return 'pending';
  } catch (error) {
    // Concurrent callbacks must not create two employees or inherit an existing
    // identity. The winning provisional request remains the only applicant.
    const winner = await env.DB.prepare(
      "SELECT sr.id FROM signup_requests sr JOIN employees e ON e.id=sr.employee_id " +
      "WHERE lower(e.email)=lower(?) AND sr.status='pending' LIMIT 1"
    ).bind(email).first<{ id: string }>().catch(() => null);
    if (winner) return 'pending';
    console.error('staffportal_oauth_signup_atomic_write_failed',
      error instanceof Error ? error.name : 'unknown');
    return 'unavailable';
  }
}
