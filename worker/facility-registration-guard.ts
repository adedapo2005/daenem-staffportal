import {
  isApprovedFacilityType,
  normaliseFacilityName,
  type ApprovedFacilityType,
} from '../src/facility-registration-contract';

/**
 * D1-backed facility registration preflight. Do not trust free-text location
 * IDs or company scope supplied by the browser. This does not replace the
 * existing authenticated permission gate in createFacility.
 */
export async function validateFacilityRegistration(
  db: D1Database,
  companyId: string,
  input: { name?: unknown; facilityType?: unknown; locationId?: unknown; description?: unknown },
): Promise<
  | { ok: true; name: string; facilityType: ApprovedFacilityType; locationId: string | null; description: string | null }
  | { ok: false; code: 'FACILITY_NAME_INVALID' | 'FACILITY_TYPE_INVALID' | 'FACILITY_LOCATION_INVALID' | 'FACILITY_DUPLICATE' | 'FACILITY_DESCRIPTION_INVALID'; error: string }
> {
  const name = normaliseFacilityName(input.name);
  if (!name || name.length > 180) {
    return { ok: false, code: 'FACILITY_NAME_INVALID', error: 'Enter a facility name (up to 180 characters).' };
  }
  const facilityType = input.facilityType === undefined || input.facilityType === ''
    ? 'office' : input.facilityType;
  if (!isApprovedFacilityType(facilityType)) {
    return { ok: false, code: 'FACILITY_TYPE_INVALID', error: 'Choose an approved facility type.' };
  }
  if (input.locationId != null && typeof input.locationId !== 'string') {
    return { ok: false, code: 'FACILITY_LOCATION_INVALID', error: 'Choose a registered company location.' };
  }
  const locationId = typeof input.locationId === 'string' ? input.locationId.trim() : '';
  if (locationId) {
    const location = await db.prepare(
      'SELECT id FROM company_locations WHERE id=? AND company_id=? AND active=1',
    ).bind(locationId, companyId).first<{ id: string }>();
    if (!location) {
      return { ok: false, code: 'FACILITY_LOCATION_INVALID', error: 'Location is not active or does not belong to the selected company.' };
    }
  }
  if (input.description != null && typeof input.description !== 'string') {
    return { ok: false, code: 'FACILITY_DESCRIPTION_INVALID', error: 'Facility details must be text.' };
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > 2000) {
    return { ok: false, code: 'FACILITY_DESCRIPTION_INVALID', error: 'Facility details must be 2,000 characters or fewer.' };
  }
  const duplicate = await db.prepare(
    "SELECT id FROM facilities WHERE company_id=? AND active=1 AND lower(trim(name))=lower(?) AND COALESCE(location_id,'')=? LIMIT 1",
  ).bind(companyId, name, locationId).first<{ id: string }>();
  if (duplicate) {
    return { ok: false, code: 'FACILITY_DUPLICATE', error: 'A facility with this name and location already exists. Select the existing facility.' };
  }
  return { ok: true, name, facilityType, locationId: locationId || null, description: description || null };
}
