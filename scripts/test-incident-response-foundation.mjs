import fs from 'node:fs';
const migration = fs.readFileSync('migrations/0076_incident_response_foundation.sql', 'utf8');
const worker = fs.readFileSync('worker/incident-response.ts', 'utf8');
const checks = [
  ['operation id uniqueness', migration.includes('operation_id TEXT NOT NULL UNIQUE')],
  ['location unavailable is valid', migration.includes("location_status IN ('live','degraded','paused','unavailable','ended')") && worker.includes("'unavailable'")],
  ['neutral unauthorized denial', worker.includes("const neutral = () => json({ error: 'Incident not found.' }, 404)")],
  ['incident scoped timestamp/source', worker.includes('location_updated_at') && worker.includes('locationSource')],
  ['audit evidence', migration.includes('safety_incident_audit') && worker.includes("'created'")],
  ['create permission is scoped to target company', worker.includes("hasPermission(context, 'security.access', 'create', companyId)") && worker.includes("hasPermission(context, 'alerting.access', 'manage', companyId)")],
  ['Owner retains group-wide incident creation authority', worker.includes("context.roles.some((role) => role.code === 'owner')") && worker.includes('if (!membership && !isOwner) return neutral()')],
  ['idempotency key is company scoped and opaque', worker.includes('scopedOperationId(companyId, operationId)') && worker.includes('WHERE operation_id=? AND company_id=?')],
  ['concurrent retries do not create duplicate incidents', worker.includes('ON CONFLICT(operation_id) DO NOTHING') && worker.includes('inserted.meta?.changes')],
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
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
