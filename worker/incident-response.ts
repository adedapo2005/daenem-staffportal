import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface IncidentEnv extends AuthEnv {}
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const neutral = () => json({ error: 'Incident not found.' }, 404);

function canAccess(context: SessionContext) {
  return hasPermission(context, 'alerting.access', 'view') || hasPermission(context, 'security.access', 'view');
}

export async function routeIncidentResponse(request: Request, env: IncidentEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/incidents')) return null;
  if (!canAccess(context)) return neutral();
  if (url.pathname === '/api/incidents' && request.method === 'POST') {
    let body: { operationId?: string; companyId?: string; incidentType?: string; summary?: string; latitude?: number; longitude?: number; accuracyM?: number; locationSource?: string };
    try { body = await request.json(); } catch { return json({ error: 'Invalid incident request.' }, 400); }
    const operationId = String(body.operationId || '').trim();
    const companyId = String(body.companyId || '').trim();
    const incidentType = String(body.incidentType || '').trim();
    if (!operationId || operationId.length > 160 || !companyId || !incidentType || incidentType.length > 80) return json({ error: 'Operation, business and incident type are required.' }, 400);
    if (!hasPermission(context, 'security.access', 'create') && !hasPermission(context, 'alerting.access', 'manage')) return neutral();
    const membership = await env.DB.prepare('SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1').bind(context.employee.id, companyId).first();
    if (!membership && context.employee.role !== 'Owner') return neutral();
    const existing = await env.DB.prepare('SELECT id,status,location_status FROM safety_incidents WHERE operation_id=?').bind(operationId).first<Record<string, unknown>>();
    if (existing) return json({ ok: true, created: false, incident: existing });
    const latitude = body.latitude == null ? null : Number(body.latitude), longitude = body.longitude == null ? null : Number(body.longitude), accuracy = body.accuracyM == null ? null : Number(body.accuracyM);
    if ((latitude !== null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) || (longitude !== null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180)) || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0))) return json({ error: 'Incident location is invalid.' }, 400);
    const incidentId = id('incident'), now = new Date().toISOString(), locationStatus = latitude !== null && longitude !== null ? 'degraded' : 'unavailable';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO safety_incidents(id,operation_id,company_id,reporter_employee_id,incident_type,location_status,current_latitude,current_longitude,current_accuracy_m,location_updated_at,location_source,summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(incidentId, operationId, companyId, context.employee.id, incidentType, locationStatus, latitude, longitude, accuracy, latitude !== null ? now : null, body.locationSource || null, body.summary || null),
      env.DB.prepare(`INSERT INTO safety_incident_audit(id,incident_id,actor_employee_id,action,details_json) VALUES(?,?,?,?,?)`).bind(id('incident-audit'), incidentId, context.employee.id, 'created', JSON.stringify({ locationStatus })),
      ...(latitude !== null && longitude !== null ? [env.DB.prepare(`INSERT INTO safety_incident_location_events(id,incident_id,latitude,longitude,accuracy_m,source,recorded_at) VALUES(?,?,?,?,?,?,?)`).bind(id('incident-location'), incidentId, latitude, longitude, accuracy, body.locationSource || 'reported', now)] : []),
    ]);
    return json({ ok: true, created: true, incident: { id: incidentId, status: 'open', locationStatus } }, 201);
  }
  return json({ error: 'Incident route not found.' }, 404);
}
