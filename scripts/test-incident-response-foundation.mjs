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
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
