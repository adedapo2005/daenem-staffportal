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


/**
 * Use a category from the authenticated company catalogue and only details
 * typed by the current operator. Never invent an asset identity or tag.
 */
export function suggestedAssetName(
  category?: MaintenanceCategoryLookup,
  make?: string,
  model?: string,
): string {
  if (!category?.name?.trim()) return '';
  const descriptor = [make, model].map(value => String(value || '').trim()).filter(Boolean).join(' ');
  return (descriptor ? `${category.name.trim()} — ${descriptor}` : category.name.trim()).slice(0, 180);
}

export const ASSET_READING_TYPES = [
  { value: 'running_hours', label: 'Running Hours', defaultUnit: 'hours' },
  { value: 'fuel_added_litres', label: 'Fuel Added', defaultUnit: 'litres' },
  { value: 'diesel_litres', label: 'Diesel Tank Level', defaultUnit: 'litres' },
  { value: 'energy_kwh', label: 'Energy', defaultUnit: 'kWh' },
  { value: 'battery_voltage', label: 'Battery Voltage', defaultUnit: 'V' },
  { value: 'water_level', label: 'Water Level', defaultUnit: '' },
  { value: 'temperature', label: 'Temperature', defaultUnit: '°C' },
  { value: 'pressure', label: 'Pressure', defaultUnit: '' },
  { value: 'other', label: 'Other', defaultUnit: '' },
] as const;

export const STANDARD_READING_UNITS = [
  'hours', 'litres', 'kWh', 'V', '°C', '%', 'm', 'cm', 'mm', 'bar', 'kPa',
] as const;

export function recommendedReadingUnit(readingType: string): string {
  return ASSET_READING_TYPES.find(item => item.value === readingType)?.defaultUnit || '';
}
