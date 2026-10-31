/**
 * StaffPortal: a new applicant must be able to enter Profile Setup before we
 * accept a registration. The role and its permissions are administrator-owned:
 * fail closed on missing/disabled grants rather than recreating or elevating them.
 *
 * Used by verified OAuth (Google/Microsoft) and local/email/WhatsApp-assisted
 * enrollment before any new employee, challenge or security audit is created.
 */
export async function provisionalEnrollmentReady(
  db: D1Database, companyId: string,
): Promise<boolean> {
  if (!companyId) return false;
  try {
    const grant = await db.prepare(`
      SELECT r.id
      FROM companies c
      JOIN roles r ON r.id='role-provisional' AND r.code='provisional'
        AND r.active=1 AND (r.company_id IS NULL OR r.company_id=c.id)
      JOIN role_permissions rp ON rp.role_id=r.id
        AND rp.access_level IN ('edit','manage')
      JOIN permissions p ON p.id=rp.permission_id AND p.code='profile.access'
      WHERE c.id=? AND c.active=1
      LIMIT 1
    `).bind(companyId).first<{ id: string }>();
    return Boolean(grant);
  } catch {
    // Do not enroll an account that would be stranded outside Profile Setup.
    return false;
  }
}
