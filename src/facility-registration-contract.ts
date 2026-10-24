/**
 * Approved StaffPortal facility classifications.
 * These represent buildings and operating spaces, not company locations.
 * Keep names practical for Nigerian staff; do not create FarmPortal masters.
 */
export const STAFFPORTAL_FACILITY_TYPES = [
  { value: 'office', label: 'Office / Administration' },
  { value: 'production', label: 'Production / Factory' },
  { value: 'warehouse', label: 'Warehouse / Store' },
  { value: 'workshop', label: 'Workshop / Service Bay' },
  { value: 'retail', label: 'Retail / Showroom' },
  { value: 'residential', label: 'Residential / Managed Property' },
  { value: 'utility', label: 'Utility / Plant Room' },
  { value: 'security', label: 'Security / Gatehouse' },
  { value: 'other', label: 'Other Registered Facility' },
] as const;

export type ApprovedFacilityType = (typeof STAFFPORTAL_FACILITY_TYPES)[number]['value'];

export function isApprovedFacilityType(value: unknown): value is ApprovedFacilityType {
  return typeof value === 'string'
    && STAFFPORTAL_FACILITY_TYPES.some(item => item.value === value);
}

export function suggestFacilityName(
  type: string,
  location?: { name: string } | null,
): string {
  const selected = STAFFPORTAL_FACILITY_TYPES.find(item => item.value === type);
  if (!selected) return '';
  const typeLabel = selected.label.split(' / ')[0];
  const locationName = location?.name?.trim();
  return (locationName ? `${typeLabel} — ${locationName}` : typeLabel).slice(0, 180);
}

export function normaliseFacilityName(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
}
