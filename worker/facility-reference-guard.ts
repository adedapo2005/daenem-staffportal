/**
 * Server-authoritative maintenance reference resolution.
 *
 * The client selector is not an authorization boundary. Every supplied
 * category, facility and equipment ID is independently checked against the
 * current D1 catalog before a work-order can be written.
 */
export type MaintenanceReferenceInput = {
  issueCategory?: string;
  facilityId?: string;
  assetId?: string;
};

export type MaintenanceReferenceResult =
  | { ok: true; categoryCode: string; facilityId: string | null; assetId: string | null; defaultPriority: string }
  | { ok: false; reason: 'category' | 'facility' | 'asset' | 'asset_facility_mismatch' };

export async function resolveMaintenanceReferences(
  db: D1Database,
  companyId: string,
  input: MaintenanceReferenceInput,
): Promise<MaintenanceReferenceResult> {
  const categoryCode = String(input.issueCategory || '').trim();
  const facilityId = String(input.facilityId || '').trim();
  const assetId = String(input.assetId || '').trim();
  if (!companyId || !categoryCode) return { ok: false, reason: 'category' };

  const category = await db.prepare(
    'SELECT code, default_priority AS defaultPriority FROM maintenance_categories WHERE code=? AND active=1',
  ).bind(categoryCode).first<{ code: string; defaultPriority: string | null }>();
  if (!category) return { ok: false, reason: 'category' };

  let registeredFacility = '';
  if (assetId) {
    const asset = await db.prepare(
      "SELECT id, facility_id AS facilityId FROM assets WHERE id=? AND company_id=? AND status!='retired'",
    ).bind(assetId, companyId).first<{ id: string; facilityId: string | null }>();
    if (!asset) return { ok: false, reason: 'asset' };
    registeredFacility = asset.facilityId || '';
    if (facilityId && registeredFacility && facilityId !== registeredFacility) {
      return { ok: false, reason: 'asset_facility_mismatch' };
    }
  }

  const resolvedFacilityId = facilityId || registeredFacility;
  if (resolvedFacilityId) {
    const facility = await db.prepare(
      'SELECT id FROM facilities WHERE id=? AND company_id=? AND active=1',
    ).bind(resolvedFacilityId, companyId).first<{ id: string }>();
    if (!facility) return { ok: false, reason: 'facility' };
  }

  return {
    ok: true,
    categoryCode: category.code,
    facilityId: resolvedFacilityId || null,
    assetId: assetId || null,
    defaultPriority: category.defaultPriority || 'normal',
  };
}
