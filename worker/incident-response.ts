import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface IncidentEnv extends AuthEnv {}
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const neutral = () => json({ error: 'Incident not found.' }, 404);

function canAccess(context: SessionContext, companyId: string) {
  return hasPermission(context, 'alerting.access', 'view', companyId) || hasPermission(context, 'security.access', 'view', companyId);
}

function canManageLocation(context: SessionContext, companyId: string) {
  return context.roles.some((role) => role.code === 'owner') || hasPermission(context, 'security.access', 'edit', companyId);
}

function routeId(value: string) {
  try { return decodeURIComponent(value); } catch { return ''; }
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
      env.DB.prepare(`INSERT INTO safety_incidents(id,operation_id,company_id,reporter_employee_id,incident_type,location_status,current_latitude,current_longitude,current_accuracy_m,location_updated_at,location_source,tracking_started_at,summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING`).bind(incidentId, scopedId, companyId, context.employee.id, incidentType, locationStatus, latitude, longitude, accuracy, latitude !== null ? now : null, locationSource, latitude !== null ? now : null, summary),
      env.DB.prepare(`INSERT INTO safety_incident_audit(id,incident_id,actor_employee_id,action,details_json) SELECT ?,?,?,?,? WHERE changes()=1`).bind(id('incident-audit'), incidentId, context.employee.id, 'created', JSON.stringify({ locationStatus })),
      env.DB.prepare(`INSERT INTO safety_incident_location_events(id,incident_id,latitude,longitude,accuracy_m,source,recorded_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM safety_incident_audit WHERE incident_id=? AND action='created') AND ? IS NOT NULL AND ? IS NOT NULL`).bind(id('incident-location'), incidentId, latitude, longitude, accuracy, locationSource || 'reported', now, incidentId, latitude, longitude),
    ]);
    if (Number(inserted.meta?.changes || 0) === 0) {
      const existing = await env.DB.prepare('SELECT id,reporter_employee_id AS reporterEmployeeId,status,location_status AS locationStatus FROM safety_incidents WHERE operation_id=? AND company_id=?').bind(scopedId, companyId).first<Record<string, unknown>>();
      return existing && existing.reporterEmployeeId === context.employee.id
        ? json({ ok: true, created: false, incident: { id: existing.id, status: existing.status, locationStatus: existing.locationStatus } })
        : neutral();
    }
    return json({ ok: true, created: true, incident: { id: incidentId, status: 'open', locationStatus } }, 201);
  }
  const locationMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)\/location$/);
  const locationStopMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)\/location\/stop$/);
  if ((locationMatch && request.method === 'POST') || (locationStopMatch && request.method === 'POST')) {
    const incidentId = routeId((locationMatch || locationStopMatch)![1]);
    if (!incidentId || incidentId.length > 160) return neutral();
    const target = await env.DB.prepare('SELECT company_id AS companyId FROM safety_incidents WHERE id=?').bind(incidentId).first<{ companyId: string }>();
    if (!target) return neutral();
    const companyId = String(target.companyId || '');
    const isOwner = context.roles.some((role) => role.code === 'owner');
    const membership = isOwner || Boolean(await env.DB.prepare(
      'SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1'
    ).bind(context.employee.id, companyId).first());
    if (!membership || !canManageLocation(context, companyId)) return neutral();

    if (locationMatch) {
      let body: { latitude?: number; longitude?: number; accuracyM?: number; source?: string };
      try { body = await request.json(); } catch { return json({ error: 'Invalid incident location.' }, 400); }
      const latitude = body.latitude == null ? NaN : Number(body.latitude);
      const longitude = body.longitude == null ? NaN : Number(body.longitude);
      const accuracy = body.accuracyM == null ? null : Number(body.accuracyM);
      const source = String(body.source || '').trim().slice(0, 80);
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 || (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) || !source) {
        return json({ error: 'Incident location is invalid.' }, 400);
      }
      const now = new Date().toISOString();
      const [updated] = await env.DB.batch([
        env.DB.prepare(`UPDATE safety_incidents SET location_status='degraded',current_latitude=?,current_longitude=?,current_accuracy_m=?,location_updated_at=?,location_source=?,tracking_started_at=COALESCE(tracking_started_at,?),tracking_ended_at=NULL,updated_at=? WHERE id=? AND status IN ('open','acknowledged','actioned')`)
          .bind(latitude, longitude, accuracy, now, source, now, now, incidentId),
        env.DB.prepare(`INSERT INTO safety_incident_location_events(id,incident_id,latitude,longitude,accuracy_m,source,recorded_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1`)
          .bind(id('incident-location'), incidentId, latitude, longitude, accuracy, source, now),
        env.DB.prepare(`INSERT INTO safety_incident_audit(id,incident_id,actor_employee_id,action,details_json) SELECT ?,?,?,?,? WHERE changes()=1`)
          .bind(id('incident-audit'), incidentId, context.employee.id, 'location_updated', JSON.stringify({ source, locationStatus: 'degraded' })),
      ]);
      if (Number(updated.meta?.changes || 0) !== 1) return neutral();
      return json({ ok: true, locationStatus: 'degraded', locationUpdatedAt: now });
    }

    const now = new Date().toISOString();
    const [stopped] = await env.DB.batch([
      env.DB.prepare(`UPDATE safety_incidents SET location_status='paused',current_latitude=NULL,current_longitude=NULL,current_accuracy_m=NULL,location_updated_at=NULL,location_source=NULL,tracking_ended_at=?,updated_at=? WHERE id=? AND status IN ('open','acknowledged','actioned') AND location_status IN ('live','degraded','paused')`)
        .bind(now, now, incidentId),
      env.DB.prepare(`INSERT INTO safety_incident_audit(id,incident_id,actor_employee_id,action,details_json) SELECT ?,?,?,?,? WHERE changes()=1`)
        .bind(id('incident-audit'), incidentId, context.employee.id, 'location_tracking_stopped', JSON.stringify({ locationStatus: 'paused', trackingEndedAt: now })),
    ]);
    if (Number(stopped.meta?.changes || 0) !== 1) return neutral();
    return json({ ok: true, locationStatus: 'paused', trackingEndedAt: now });
  }
  const detailMatch = url.pathname.match(/^\/api\/incidents\/([^/]+)$/);
  if (detailMatch && request.method === 'GET') {
    const incidentId = routeId(detailMatch[1]);
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
    const locationHistoryResult = await env.DB.prepare(`SELECT latitude,longitude,accuracy_m AS accuracyM,source,recorded_at AS recordedAt
      FROM (SELECT latitude,longitude,accuracy_m,source,recorded_at,id FROM safety_incident_location_events
        WHERE incident_id=? ORDER BY recorded_at DESC,id DESC LIMIT 101)
      ORDER BY recorded_at ASC,id ASC`).bind(incidentId).all<Record<string, unknown>>();
    const locationHistory = locationHistoryResult.results || [];
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
    return json({ ok: true, incident: safeIncident, locationHistory: locationHistory.slice(0, 100), locationHistoryHasMore: locationHistory.length > 100 });
  }
  return json({ error: 'Incident route not found.' }, 404);
}
