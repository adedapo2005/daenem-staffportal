/**
 * Canonical company-scoped maintenance work-order assignment authority.
 *
 * Foreign keys alone do not prevent an assignee/vendor from a different
 * business from being linked to a maintenance order. Reject those references
 * before any D1 batch writes; never trust UI select options.
 */
export type WorkOrderPartyInput = {
  assignedToEmployeeId?: unknown;
  vendorId?: unknown;
};

export type WorkOrderPartyResult =
  | { ok: true; assignedToEmployeeId: string | null; vendorId: string | null }
  | { ok: false; error: string };

export async function resolveWorkOrderParties(
  db: D1Database,
  companyId: string,
  input: WorkOrderPartyInput,
): Promise<WorkOrderPartyResult> {
  if (!companyId) return { ok: false, error: 'Company is required.' };
  const employeeValue = input.assignedToEmployeeId;
  const vendorValue = input.vendorId;
  if ((employeeValue != null && typeof employeeValue !== 'string') ||
      (vendorValue != null && typeof vendorValue !== 'string')) {
    return { ok: false, error: 'Select valid maintenance assignments.' };
  }

  const assignedToEmployeeId = typeof employeeValue === 'string' ? employeeValue.trim() : '';
  const vendorId = typeof vendorValue === 'string' ? vendorValue.trim() : '';
  if (assignedToEmployeeId.length > 180 || vendorId.length > 180) {
    return { ok: false, error: 'Select valid maintenance assignments.' };
  }

  if (assignedToEmployeeId) {
    const assigned = await db.prepare(
      `SELECT e.id FROM employees e
       JOIN employee_company_memberships m ON m.employee_id=e.id
       WHERE e.id=? AND m.company_id=? AND m.active=1
         AND e.employment_status='active'
       LIMIT 1`,
    ).bind(assignedToEmployeeId, companyId).first<{ id: string }>();
    if (!assigned) return { ok: false, error: 'Select an active employee assigned to this company.' };
  }

  if (vendorId) {
    const vendor = await db.prepare(
      `SELECT id FROM maintenance_vendors
       WHERE id=? AND active=1 AND approved=1
         AND (company_id=? OR company_id IS NULL)
       LIMIT 1`,
    ).bind(vendorId, companyId).first<{ id: string }>();
    if (!vendor) return { ok: false, error: 'Select an approved vendor for this company.' };
  }

  return { ok: true, assignedToEmployeeId: assignedToEmployeeId || null, vendorId: vendorId || null };
}
