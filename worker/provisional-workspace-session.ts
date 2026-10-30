import { sessionCookie, type AuthEnv } from './auth';

/**
 * Issue exactly the same signed-in workspace cookie used by ordinary staff,
 * but only after a verified applicant has a pending management review and
 * an administrator-enabled Provisional role with Profile Edit permission.
 * Role permissions remain evaluated by the regular session-context queries.
 */
export async function createProvisionalWorkspaceSession(
  request: Request,
  env: AuthEnv,
  employeeId: string,
  method: 'google' | 'microsoft' | 'local' | 'whatsapp',
): Promise<{ cookie: string; next: string; access: 'provisional' } | null> {
  const eligible = await env.DB.prepare(`
    SELECT e.id
    FROM employees e
    JOIN employee_company_memberships m ON m.employee_id=e.id AND m.active=1
    JOIN companies c ON c.id=m.company_id AND c.active=1
    JOIN employee_roles er ON er.employee_id=e.id AND er.company_id=c.id
      AND er.role_id='role-provisional'
    JOIN roles r ON r.id=er.role_id AND r.active=1
    JOIN role_permissions rp ON rp.role_id=r.id AND rp.access_level IN ('edit','manage')
    JOIN permissions p ON p.id=rp.permission_id AND p.code='profile.access'
    WHERE e.id=? AND e.employment_status='provisional'
      AND EXISTS (
        SELECT 1 FROM signup_requests sr
        WHERE sr.employee_id=e.id AND sr.status='pending'
      )
      AND NOT EXISTS (
        SELECT 1 FROM signup_requests sr
        WHERE sr.employee_id=e.id AND sr.status IN ('rejected','cancelled','expired')
      )
    LIMIT 1
  `).bind(employeeId).first<{ id: string }>();
  if (!eligible) return null;
  const profileRevoked = await env.DB.prepare(`
    SELECT 1 FROM employee_permission_overrides o
    JOIN permissions p ON p.id=o.permission_id AND p.code='profile.access'
    WHERE o.employee_id=? AND o.access_level='none'
      AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
    UNION
    SELECT 1 FROM employee_permission_overrides_v2 o
    JOIN permissions p ON p.id=o.permission_id AND p.code='profile.access'
    JOIN employee_company_memberships m ON m.employee_id=o.employee_id AND m.active=1
      AND (o.company_id IS NULL OR o.company_id=m.company_id)
    WHERE o.employee_id=? AND o.access_level='none'
      AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
    LIMIT 1
  `).bind(employeeId,employeeId).first();
  if (profileRevoked) return null;

  const secret = env.AUTH_PEPPER ||
    (env.APP_STAGE !== 'production' ? 'bootstrap-stage-only-change-before-production' : '');
  if (!secret) return null;
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = btoa(String.fromCharCode(...random))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const digest = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(token + ':' + secret),
  );
  const tokenHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const id = 'session-' + crypto.randomUUID();
  const hoursSetting = await env.DB.prepare(
    "SELECT setting_value FROM app_settings WHERE setting_key='security.session_hours'",
  ).first<{ setting_value: string }>();
  const hours = Math.max(1, Math.min(24, Number(hoursSetting?.setting_value || 12) || 12));
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO auth_sessions(
          id,employee_id,token_hash,device_name,user_agent,ip_address,
          login_geofence_result,expires_at
        )
        SELECT ?,e.id,?,?,?,?, 'not_required',?
        FROM employees e
        WHERE e.id=? AND e.employment_status='provisional'
          AND EXISTS (
            SELECT 1 FROM signup_requests sr
            WHERE sr.employee_id=e.id AND sr.status='pending'
          )
          AND EXISTS (
            SELECT 1 FROM employee_company_memberships m
            JOIN companies c ON c.id=m.company_id AND c.active=1
            JOIN employee_roles er ON er.employee_id=e.id
              AND er.company_id=m.company_id AND er.role_id='role-provisional'
            JOIN roles r ON r.id=er.role_id AND r.active=1
            JOIN role_permissions rp ON rp.role_id=r.id
              AND rp.access_level IN ('edit','manage')
            JOIN permissions p ON p.id=rp.permission_id AND p.code='profile.access'
            WHERE m.employee_id=e.id AND m.active=1
          )
          AND NOT EXISTS (
            SELECT 1 FROM signup_requests sr
            WHERE sr.employee_id=e.id AND sr.status IN ('rejected','cancelled','expired')
          )
      `).bind(id,tokenHash,'Provisional · ' + method,
        request.headers.get('user-agent'),request.headers.get('cf-connecting-ip'),expiresAt,employeeId),
      env.DB.prepare(`
        INSERT INTO security_logs(
          id,employee_id,session_id,event_type,severity,result,details_json
        )
        SELECT ?,? ,?,'provisional_workspace_session','info','success',?
        WHERE EXISTS (SELECT 1 FROM auth_sessions WHERE id=? AND employee_id=?)
      `).bind('security-' + crypto.randomUUID(),employeeId,id,
        JSON.stringify({ method, managementApprovalRequired: true }),id,employeeId),
      // Do not issue a session if the mandatory security audit is silently
      // ignored; D1.batch rolls back the whole transaction on this failure.
      env.DB.prepare(
        "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('required audit was not recorded','$') END AS audit_required",
      ),
    ]);
    if (Number(results[0]?.meta?.changes) !== 1 || Number(results[1]?.meta?.changes) !== 1) {
      return null;
    }
    return { cookie: sessionCookie(request,token,hours * 3600), next: '/workspace/', access: 'provisional' };
  } catch (error) {
    console.error('staffportal_provisional_workspace_session_failed',
      error instanceof Error ? error.name : 'unknown');
    return null;
  }
}
