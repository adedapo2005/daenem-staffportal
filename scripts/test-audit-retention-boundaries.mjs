import fs from 'node:fs';

const migration = fs.readFileSync('migrations/0094_activity_retention_policies.sql', 'utf8');
const worker = fs.readFileSync('worker/audit-retention.ts', 'utf8');
const groupErp = fs.readFileSync('worker/group-erp.ts', 'utf8');

const checks = [
  ['policy table is migration-backed', migration.includes('CREATE TABLE IF NOT EXISTS activity_retention_policies')],
  ['durations have no invented bounds or defaults', /client_telemetry_days INTEGER\s+CHECK \(client_telemetry_days IS NULL OR client_telemetry_days > 0\)/.test(migration) && /server_activity_days INTEGER\s+CHECK \(server_activity_days IS NULL OR server_activity_days > 0\)/.test(migration) && !/client_telemetry_days[^,]*DEFAULT/i.test(migration) && !/server_activity_days[^,]*DEFAULT/i.test(migration) && !/BETWEEN\s+\d+\s+AND\s+\d+/i.test(migration)],
  ['preview requires explicit positive whole-number category durations', worker.includes('Number.isSafeInteger(row.clientTelemetryDays)') && worker.includes('row.clientTelemetryDays! <= 0') && worker.includes('Number.isSafeInteger(row.serverActivityDays)') && worker.includes('row.serverActivityDays! <= 0')],
  ['invalid or non-sortable cutoff fails closed before candidate queries', worker.includes('function cutoffForDays(days: number, now = Date.now()): string | null') && worker.includes('if (!Number.isFinite(timestamp)) return null') && worker.includes('if (!Number.isFinite(date.getTime())) return null') && worker.includes("return /^\\d{4}-\\d{2}-\\d{2}T/.test(cutoff) ? cutoff : null") && worker.includes('if (!clientCutoff || !serverCutoff) return json({ error: \'Audit retention preview is unavailable.\' }, 503)') && worker.indexOf('if (!clientCutoff || !serverCutoff)') < worker.indexOf("FROM activity_logs WHERE method='CLIENT'")],
  ['initial policy row leaves category durations unconfigured', /INSERT OR IGNORE INTO activity_retention_policies \(id\)\s+VALUES \('global'\)/.test(migration)],
  ['formal audit cannot expire', migration.includes('formal_audit_days INTEGER NOT NULL DEFAULT 0 CHECK (formal_audit_days = 0)')],
  ['formal security cannot expire', migration.includes('formal_security_days INTEGER NOT NULL DEFAULT 0 CHECK (formal_security_days = 0)')],
  ['policy failure fails closed', worker.includes('return null') && worker.includes('Audit retention policy is unavailable.')],
  ['preview never deletes', worker.includes("deletionEnabled: false") && !worker.match(/\.prepare\([^)]*DELETE/i)],
  ['protected categories are explicit', worker.includes("'formal_audit', 'formal_security', 'financial', 'hr'")],
  ['unclassified server activity is not presented as an eligible count', worker.includes('serverActivity: null') && worker.includes("serverActivity: 'category_classification_required'") && !/method\s*<>\s*'CLIENT'/.test(worker)],
  ['preview is Owner-only and neutral for others', worker.includes("if (!isOwner) return json({ error: 'Audit retention preview is unavailable.' }, 404)")],
  ['route is wired', groupErp.includes("p==='/api/audit/retention/preview'&&m==='GET'")],
];

for (const [name, passed] of checks) {
  if (!passed) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`Audit retention boundary checks: ${checks.length}/${checks.length} PASS`);
