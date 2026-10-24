/**
 * Permission-scoped StaffPortal Facilities activity.
 * Never expose raw audit before_json/after_json to read-only module users:
 * they can contain customer, employee or operational details.
 */
export type FacilityAuditEvent = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string;
  readingId: string | null;
};

type FacilityAuditRow = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  afterJson: string | null;
};

function readingReference(row: FacilityAuditRow): string | null {
  if (row.action !== 'record_reading' || !row.afterJson) return null;
  try {
    const data: unknown = JSON.parse(row.afterJson);
    if (!data || typeof data !== 'object' || !('readingId' in data)) return null;
    const value = (data as { readingId?: unknown }).readingId;
    return typeof value === 'string' && /^asset-reading-[a-f0-9-]{36}$/i.test(value)
      ? value : null;
  } catch {
    return null;
  }
}

export async function recentFacilitiesAudit(
  db: D1Database,
  companyId: string,
): Promise<FacilityAuditEvent[]> {
  if (!companyId) return [];
  const result = await db.prepare(
    `SELECT l.id, l.occurred_at AS occurredAt, l.action,
        l.entity_type AS entityType, l.entity_id AS entityId,
        e.display_name AS actorName, l.after_json AS afterJson
       FROM audit_logs l
       LEFT JOIN employees e ON e.id=l.actor_employee_id AND e.company_id=l.company_id
       WHERE l.company_id=? AND l.module='facilities'
       ORDER BY l.occurred_at DESC, l.id DESC LIMIT 25`,
  ).bind(companyId).all<FacilityAuditRow>();
  return (result.results || []).map(row => ({
    id: String(row.id),
    occurredAt: String(row.occurredAt),
    action: String(row.action),
    entityType: String(row.entityType),
    entityId: row.entityId == null ? null : String(row.entityId),
    actorName: row.actorName?.trim() || 'Staff Member',
    readingId: readingReference(row),
  }));
}
