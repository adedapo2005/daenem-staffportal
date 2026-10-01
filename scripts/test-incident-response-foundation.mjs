import fs from 'node:fs';
const migration = fs.readFileSync('migrations/0076_incident_response_foundation.sql', 'utf8');
const worker = fs.readFileSync('worker/incident-response.ts', 'utf8');
const checks = [
  ['operation id uniqueness', migration.includes('operation_id TEXT NOT NULL UNIQUE')],
  ['location unavailable is valid', migration.includes("location_status IN ('live','degraded','paused','unavailable','ended')") && worker.includes("'unavailable'")],
  ['neutral unauthorized denial', worker.includes("const neutral = () => json({ error: 'Incident not found.' }, 404)")],
  ['incident scoped timestamp/source', worker.includes('location_updated_at') && worker.includes('locationSource')],
  ['audit evidence', migration.includes('safety_incident_audit') && worker.includes("'created'")],
];
for (const [name, ok] of checks) { if (!ok) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); }
