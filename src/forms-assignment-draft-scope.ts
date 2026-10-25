/**
 * Resolve draft storage from the assigned form's server-provided company scope.
 * Never substitute a route selection, user's primary company, or first grant:
 * those can refer to a completely different authorised business.
 *
 * Group-wide assignments have no company-specific offline namespace and must
 * remain online-only until the dedicated group draft contract is implemented.
 */
export function assignedFormDraftCompany(item: { companyId?: string | null }): string | null {
  const companyId = typeof item.companyId === 'string' ? item.companyId.trim() : '';
  return companyId || null;
}
