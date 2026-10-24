/**
 * StaffPortal maintenance guided-entry helpers.
 *
 * These suggestions use only the authenticated, company-scoped
 * /api/facilities/catalog response. They never invent asset IDs or issue types.
 */
export type FacilityLookup = { id: string; name: string };
export type MaintenanceCategoryLookup = { code: string; name: string; defaultPriority?: string };
export type MaintenanceAssetLookup = {
  id: string;
  name: string;
  category: string;
  facilityId?: string | null;
  facilityName?: string;
};

export const WORK_ORDER_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export function assetsForSelectedFacility<T extends MaintenanceAssetLookup>(
  assets: readonly T[], facilityId: string,
): T[] {
  return facilityId ? assets.filter((asset) => asset.facilityId === facilityId) : [...assets];
}

export function recommendedWorkPriority(
  category?: MaintenanceCategoryLookup,
): WorkOrderPriority {
  const value = category?.defaultPriority?.trim().toLowerCase();
  return WORK_ORDER_PRIORITIES.find((priority) => priority === value) ?? 'normal';
}

export function suggestedWorkTitle(
  category?: MaintenanceCategoryLookup,
  facility?: FacilityLookup,
  asset?: MaintenanceAssetLookup,
): string {
  if (!category?.name?.trim()) return '';
  const what = category.name.trim();
  const where = asset?.name?.trim() || facility?.name?.trim();
  return (where ? `${what} — ${where}` : `${what} Maintenance`).slice(0, 180);
}

/**
 * Never submit stale cross-facility references from the UI. Server-side
 * company/asset authority remains mandatory, independent of this guard.
 */
export function validFacilitySelection(
  facilityId: string,
  assetId: string,
  facilities: readonly FacilityLookup[],
  assets: readonly MaintenanceAssetLookup[],
): boolean {
  if (facilityId && !facilities.some((item) => item.id === facilityId)) return false;
  if (!assetId) return true;
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) return false;
  return !facilityId || !asset.facilityId || asset.facilityId === facilityId;
}
