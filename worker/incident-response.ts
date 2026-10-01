import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface IncidentEnv extends AuthEnv {}
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const neutral = () => json({ error: 'Incident not found.' }, 404);

function canAccess(context: SessionContext, companyId: string) {
  return hasPermission(context, 'alerting.access', 'view', companyId) || hasPermission(context, 'security.access', 'view', companyId);
}

async function scopedOperationId(companyId: string, operationId: string) {
  const bytes = new TextEncoder().encode(`${companyId}\u0000${operationId}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `incident-op-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function routeIncidentResponse(request: Request, env: IncidentEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/incidents')) return null;
  if (url.pathname === '/api/incidents' && request.method === 'POST') {
    let body: { operationId?: string; companyId?: string; incidentType?: string; summary?: string; latitude?: number; longitude?: number; accuracyM?: number; locationSource?: string };
    try { body = await request.json(); } catch { return json({ error: 'Invalid incident request.' }, 400); }
    const operationId = String(body.operationId || '').trim();
    const companyId = String(body.companyId || '').trim();
    const incidentType = String(body.incidentType || '').trim();
    if (!operationId || operationId.length > 160 || !companyId || companyId.length > 160 || !incidentType || incidentType.length > 80) return json({ error: 'Operation, business and incident type are required.' }, 400);
    const isOwner = context.roles.some((role) => role.code === 'owner');
    if (!isOwner && !hasPermission(context, 'security.access', 'create', companyId) && !hasPermission(context, 'alerting.access', 'manage', companyId)) return neutral();
    const membership = await env.DB.prepare('SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1').bind(context.employee.id, companyId).first();
    if (!membership && !isOwner) return neutral();

    const latitude = body.latitude == null ? null : Number(body.latitude);
    const longitude = body.longitude == null ? null : Number(body.longitude);
    const accuracy = body.accuracyM == null ? null : Number(body.accuracyM);
    if ((latitude !== null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude !== null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180)) || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) || ((latitude === null) !== (longitude === null))) return json({ error: 'Incident location is invalid.' }, 400);
    const locationSource = String(body.locationSource || '').trim().slice(0, 80) || null;
    const summary = String(body.summary || '').trim().slice(0, 1000) || null;
    const scopedId = await scopedOperationId(companyId, operationId);
    const incidentId = id('incident'), now = new Date().toISOString(), locationStatus = latitude !== null ? 'degraded' : 'unavailable';
    const [inserted] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO safety_incidents(id,operation_id,company_id,reporter_employee_id,incident_type,location_status,current_latitude,current_longitude,current_accuracy_m,location_updated_at,location_source,summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING`).bind(incidentId, scopedId, companyId, context.employee.id, incidentType, locationStatus, latitude, longitude, accuracy, latitude !== null ? now : null, locationSource, summary),
      env.DB.prepare(`INSERT INTO safety_incident_audit(id,incident_id,actor_employee_id,action,details_json) SELECT ?,?,?,?,? WHERE changes()=1`).bind(id('incident-audit'), incidentId, context.employee.id, 'created', JSON.stringify({ locationStatus })),
      env.DB.prepare(`INSERT INTO safety_incident_location_events(id,incident_id,latitude,longitude,accuracy_m,source,recorded_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM safety_incident_audit WHERE incident_id=? AND action='created') AND ? IS NOT NULL AND ? IS NOT NULL`).bind(id('incident-location'), incidentId, latitude, longitude, accuracy, locationSource || 'reported', now, incidentId, latitude, longitude),
    ]);
    if (Number(inserted.meta?.changes || 0) === 0) {
      const existing = await env.DB.prepare('SELECT id,status,location_status AS locationStatus FROM safety_incidents WHERE operation_id=? AND company_id=?').bind(scopedId, companyId).first<Record<string, unknown>>();
      return existing ? json({ ok: true, created: false, incident: existing }) : neutral();
    }
    return json({ ok: true, created: true, incident: { id: incidentId, status: 'open', locationStatus } }, 201);
  }
  const detailMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)$/);
  if (detailMatch && request.method === 'GET') {
    const incidentId = decodeURIComponent(detailMatch[1]);
    if (!incidentId || incidentId.length > 160) return neutral();
    const incident = await env.DB.prepare(`SELECT id,company_id AS companyId,incident_type AS incidentType,status,location_status AS locationStatus,
      current_latitude AS currentLatitude,current_longitude AS currentLongitude,current_accuracy_m AS currentAccuracyM,
      location_updated_at AS locationUpdatedAt,location_source AS locationSource,tracking_started_at AS trackingStartedAt,
      tracking_ended_at AS trackingEndedAt,summary,created_at AS createdAt,updated_at AS updatedAt
      FROM safety_incidents WHERE id=?`).bind(incidentId).first<Record<string, unknown>>();
    if (!incident) return neutral();
    const isOwner = context.roles.some((role) => role.code === 'owner');
    const companyId = String(incident.companyId || '');
    const authorized = isOwner || (canAccess(context, companyId) && Boolean(await env.DB.prepare(
      'SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1'
    ).bind(context.employee.id, companyId).first()));
    if (!authorized) return neutral();
    const terminal = ['resolved', 'cancelled'].includes(String(incident.status));
    const safeIncident = { ...incident };
    if (terminal) {
      safeIncident.currentLatitude = null;
      safeIncident.currentLongitude = null;
      safeIncident.currentAccuracyM = null;
      safeIncident.locationUpdatedAt = null;
      safeIncident.locationSource = null;
      safeIncident.locationStatus = 'ended';
    }
    return json({ ok: true, incident: safeIncident });
  }
  return json({ error: 'Incident route not found.' }, 404);
}
