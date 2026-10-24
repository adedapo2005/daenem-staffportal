/**
 * Validates optional preventive-maintenance references against canonical D1.
 * Never trust reference IDs provided by the browser or a stale company selector.
 */
export async function validateScheduleReferences(
  db: D1Database,
  companyId: string,
  input: { facilityId?: unknown; assetId?: unknown; categoryCode?: unknown;
    defaultAssigneeEmployeeId?: unknown; defaultVendorId?: unknown },
): Promise<
  | { ok: true; facilityId: string | null; assetId: string | null;
      categoryCode: string | null; defaultAssigneeEmployeeId: string | null; defaultVendorId: string | null }
  | { ok: false; error: string }
> {
  const values = ['facilityId','assetId','categoryCode','defaultAssigneeEmployeeId','defaultVendorId'] as const;
  const ids: Record<string,string> = {};
  for (const field of values) {
    const value = input[field];
    if (value != null && typeof value !== 'string') return { ok:false,error:'Choose valid maintenance references.' };
    ids[field] = typeof value === 'string' ? value.trim() : '';
    if (ids[field].length > 180) return { ok:false,error:'Choose valid maintenance references.' };
  }
  if (!companyId) return { ok:false,error:'Company is required.' };
  if (ids.facilityId) {
    const facility=await db.prepare('SELECT id FROM facilities WHERE id=? AND company_id=? AND active=1')
      .bind(ids.facilityId,companyId).first<{id:string}>();
    if (!facility) return { ok:false,error:'Facility not found for this company.' };
  }
  let assetFacilityId:string|null=null;
  if (ids.assetId) {
    const asset=await db.prepare("SELECT id,facility_id AS facilityId FROM assets WHERE id=? AND company_id=? AND status!='retired'")
      .bind(ids.assetId,companyId).first<{id:string;facilityId:string|null}>();
    if (!asset) return { ok:false,error:'Equipment not found for this company.' };
    assetFacilityId=asset.facilityId;
    if (ids.facilityId && assetFacilityId && ids.facilityId!==assetFacilityId)
      return { ok:false,error:'Equipment does not belong to the selected facility.' };
    if (!ids.facilityId && assetFacilityId) {
      const facility=await db.prepare('SELECT id FROM facilities WHERE id=? AND company_id=? AND active=1')
        .bind(assetFacilityId,companyId).first<{id:string}>();
      if (!facility) return { ok:false,error:'Equipment facility is unavailable.' };
    }
  }
  if (ids.categoryCode) {
    const category=await db.prepare('SELECT code FROM maintenance_categories WHERE code=? AND active=1')
      .bind(ids.categoryCode).first<{code:string}>();
    if (!category) return { ok:false,error:'Select an approved maintenance category.' };
  }
  if (ids.defaultAssigneeEmployeeId) {
    const employee=await db.prepare(
      "SELECT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id WHERE e.id=? AND m.company_id=? AND m.active=1 AND e.employment_status='active' LIMIT 1"
    ).bind(ids.defaultAssigneeEmployeeId,companyId).first<{id:string}>();
    if (!employee) return { ok:false,error:'Select an active employee assigned to this company.' };
  }
  if (ids.defaultVendorId) {
    const vendor=await db.prepare(
      'SELECT id FROM maintenance_vendors WHERE id=? AND active=1 AND approved=1 AND (company_id=? OR company_id IS NULL)'
    ).bind(ids.defaultVendorId,companyId).first<{id:string}>();
    if (!vendor) return { ok:false,error:'Select an approved vendor for this company.' };
  }
  return {ok:true,facilityId:ids.facilityId||assetFacilityId||null,assetId:ids.assetId||null,
    categoryCode:ids.categoryCode||null,defaultAssigneeEmployeeId:ids.defaultAssigneeEmployeeId||null,
    defaultVendorId:ids.defaultVendorId||null};
}
