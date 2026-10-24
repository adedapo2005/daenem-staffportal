/**
 * Read-only, bounded evidence of real Facilities meter / fuel entries.
 * This intentionally queries persisted D1 rows; it never extrapolates
 * historical readings or returns legacy V115 demonstration records.
 *
 * Authorization is enforced by the caller's StaffPortal session, followed
 * by the company-scoped WHERE and company-matched asset JOIN below.
 */
export type PersistedFacilityReading = {
  id: string;
  assetId: string;
  assetName: string;
  readingType: string;
  readingValue: number;
  unit: string | null;
  recordedAt: string;
  facilityName: string | null;
};

export async function recentFacilityReadings(
  db: D1Database,
  companyId: string,
): Promise<PersistedFacilityReading[]> {
  if (!companyId) return [];
  const result = await db.prepare(
    `SELECT r.id AS id, r.asset_id AS assetId, a.name AS assetName,
        r.reading_type AS readingType, r.reading_value AS readingValue,
        r.unit AS unit, r.recorded_at AS recordedAt, f.name AS facilityName
     FROM asset_readings r
     JOIN assets a ON a.id=r.asset_id AND a.company_id=r.company_id
     LEFT JOIN facilities f ON f.id=r.facility_id AND f.company_id=r.company_id
     WHERE r.company_id=?
     ORDER BY r.recorded_at DESC, r.id DESC
     LIMIT 20`,
  ).bind(companyId).all<PersistedFacilityReading>();
  return (result.results || []).map(row => ({
    id: String(row.id),
    assetId: String(row.assetId),
    assetName: String(row.assetName),
    readingType: String(row.readingType),
    readingValue: Number(row.readingValue),
    unit: row.unit == null ? null : String(row.unit),
    recordedAt: String(row.recordedAt),
    facilityName: row.facilityName == null ? null : String(row.facilityName),
  }));
}
