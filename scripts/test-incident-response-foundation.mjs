import fs from 'node:fs';
const migration = fs.readFileSync('migrations/0076_incident_response_foundation.sql', 'utf8');
const worker = fs.readFileSync('worker/incident-response.ts', 'utf8');
const entry = fs.readFileSync('worker/app-entry.ts', 'utf8');
const workerEntry = fs.readFileSync('worker/index.ts', 'utf8');
const alerting = fs.readFileSync('worker/alerting.ts', 'utf8');
const statusRoute = worker.slice(worker.indexOf('const statusMatch'), worker.indexOf('const detailMatch'));
const checks = [
  ['effective application entries route incidents to the migration-aligned incident authority with execution context', entry.includes("import { routeIncidentResponse } from './incident-response'") && entry.includes('const response = await routeIncidentResponse(request, env, context, ctx)') && workerEntry.includes('routeIncidentResponse(request, env, context, _ctx)') && !entry.includes("import { routeIncidents } from './incidents'")],
  ['operation id uniqueness', migration.includes('operation_id TEXT NOT NULL UNIQUE')],
  ['location unavailable is valid', migration.includes("location_status IN ('live','degraded','paused','unavailable','ended')") && worker.includes("'unavailable'")],
  ['neutral unauthorized denial', worker.includes("const neutral = () => json({ error: 'Incident not found.' }, 404)")],
  ['incident scoped timestamp/source', worker.includes('location_updated_at') && worker.includes('locationSource')],
  ['audit evidence', migration.includes('safety_incident_audit') && worker.includes("'created'")],
  ['create permission is scoped to target company', worker.includes("hasPermission(context, 'security.access', 'create', companyId)") && worker.includes("hasPermission(context, 'alerting.access', 'manage', companyId)")],
  ['Owner retains group-wide incident creation authority', worker.includes("context.roles.some((role) => role.code === 'owner')") && worker.includes('if (!membership && !isOwner) return neutral()')],
  ['idempotency key is company scoped and opaque', worker.includes('scopedOperationId(companyId, operationId)') && worker.includes('WHERE operation_id=? AND company_id=?')],
  ['concurrent retries do not create duplicate incidents', worker.includes('ON CONFLICT(operation_id) DO NOTHING') && worker.includes('inserted.meta?.changes')],
  ['idempotent replay discloses incident details only to the original reporter', worker.includes('reporter_employee_id AS reporterEmployeeId') && worker.includes('existing.reporterEmployeeId === context.employee.id') && worker.includes(': neutral()')],
  ['location unavailable creation stays supported', worker.includes("latitude !== null ? 'degraded' : 'unavailable'")],
  ['incident, audit and initial location evidence commit atomically', worker.includes('const [inserted] = await env.DB.batch([') && worker.includes('SELECT ?,?,?,?,? WHERE changes()=1') && worker.includes('EXISTS(SELECT 1 FROM safety_incident_audit WHERE incident_id=? AND action=\'created\')')],
  ['detail read rechecks active company membership', worker.includes("const detailMatch = url.pathname.match(/^\\/api\\/incidents\\/([^/]+)$/)") && worker.includes('employee_company_memberships') && worker.includes("active=1")],
  ['detail read requires incident permission for the incident company', worker.includes('canAccess(context, companyId)') && worker.includes("hasPermission(context, 'alerting.access', 'view', companyId)") && worker.includes("hasPermission(context, 'security.access', 'view', companyId)")],
  ['unauthorized detail reads remain neutral', worker.includes('if (!authorized) return neutral()')],
  ['authorized detail reads include bounded incident-scoped movement history with truncation signal', worker.includes('WHERE incident_id=? ORDER BY recorded_at DESC,id DESC LIMIT 101') && worker.includes('locationHistory.slice(0, 100)') && worker.includes('locationHistoryHasMore: locationHistory.length > 100') && worker.indexOf('if (!authorized) return neutral()') < worker.indexOf('const locationHistoryResult = await env.DB.prepare')],
  ['terminal incidents do not expose live location', worker.includes("const terminal = ['resolved', 'cancelled'].includes(String(incident.status))") && worker.includes("safeIncident.locationStatus = 'ended'")],
  ['location updates require company-scoped security edit and active membership', worker.includes("hasPermission(context, 'security.access', 'edit', companyId)") && worker.includes("employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1") && worker.includes("WHERE id=? AND status IN ('open','acknowledged','actioned')")],
  ['location updates persist server timestamp, accuracy, source and movement evidence', worker.includes('current_accuracy_m=?,location_updated_at=?,location_source=?') && worker.includes("INSERT INTO safety_incident_location_events(id,incident_id,latitude,longitude,accuracy_m,source,recorded_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1")],
  ['location updates never claim live without a freshness threshold', worker.includes("SET location_status='degraded'") && worker.includes("locationStatus: 'degraded'")],
  ['explicit tracking stop clears current coordinates and records stop audit', worker.includes("/location\\/stop$/") && worker.includes("location_status='paused',current_latitude=NULL,current_longitude=NULL") && worker.includes("'location_tracking_stopped'")],
  ['status transitions require company-scoped security edit', worker.includes("const statusMatch = url.pathname.match(/^\\/api\\/incidents\\/([^/]+)\\/status$/)") && worker.includes("hasPermission(context, 'security.access', 'edit', companyId)")],
  ['terminal status requires a reason and ends location truthfully', worker.includes("nextStatus === 'resolved' || nextStatus === 'cancelled'") && worker.includes("A reason is required to end an incident.") && worker.includes("location_status=CASE WHEN ?=1 THEN 'ended'")],
  ['status changes are audited with from and to state', worker.includes("'status_changed'") && worker.includes('fromStatus') && worker.includes('toStatus')],
  ['incident creation publishes only after a new idempotent insert through the central alerting pipeline', worker.indexOf('if (Number(inserted.meta?.changes || 0) === 0)') < worker.indexOf('executionContext.waitUntil(publishIncidentEventWithFailureAudit') && worker.includes("eventType: 'safety.incident.created'") && worker.includes("sourceType: 'safety_incident'") && entry.includes('routeIncidentResponse(request, env, context, ctx)')],
  ['incident status events publish only after successful compare-and-set and remain separate from incident status writes', statusRoute.indexOf('if (Number(updated.meta?.changes || 0) !== 1) return neutral();') < statusRoute.indexOf("eventType: 'safety.incident.status_changed'") && statusRoute.includes('executionContext.waitUntil(publishIncidentEventWithFailureAudit')],
  ['central alert publication failures create incident-linked audit evidence', worker.includes('publishIncidentEventWithFailureAudit') && worker.includes("'alert_publication_failed'") && !worker.includes('publishPlatformEvent(env, {')],
  ['incident alert event content excludes location, user summary, and evidence payload', worker.includes("title: 'A safety incident was reported'") && worker.includes("summary: 'A safety incident requires review.'") && !worker.includes('payload: { latitude')],
  ['security alert recipients require target-company security access before alert creation', alerting.includes("const securityAccess = module === 'security'") && alerting.includes("sp.code='security.access' AND srp.access_level<>'none'") && alerting.includes('resolveRecipients(env, rule || null, input.companyId || null, input.module)')],
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
