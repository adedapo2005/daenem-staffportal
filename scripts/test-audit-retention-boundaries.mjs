import fs from 'node:fs';

const migration = fs.readFileSync('migrations/0094_activity_retention_policies.sql', 'utf8');
const worker = fs.readFileSync('worker/audit-retention.ts', 'utf8');
const groupErp = fs.readFileSync('worker/group-erp.ts', 'utf8');

const checks = [
  ['policy table is migration-backed', migration.includes('CREATE TABLE IF NOT EXISTS activity_retention_policies')],
  ['client and server categories are bounded', migration.includes('client_telemetry_days INTEGER') && migration.includes('server_activity_days INTEGER')],
  ['formal audit cannot expire', migration.includes('formal_audit_days INTEGER NOT NULL DEFAULT 0 CHECK (formal_audit_days = 0)')],
  ['formal security cannot expire', migration.includes('formal_security_days INTEGER NOT NULL DEFAULT 0 CHECK (formal_security_days = 0)')],
  ['policy failure fails closed', worker.includes('return null') && worker.includes('Audit retention policy is unavailable.')],
  ['preview never deletes', worker.includes("deletionEnabled: false") && !worker.match(/\.prepare\([^)]*DELETE/i)],
  ['protected categories are explicit', worker.includes("'formal_audit', 'formal_security', 'financial', 'hr'")],
  ['preview is Owner-only and neutral for others', worker.includes("if (!isOwner) return json({ error: 'Audit retention preview is unavailable.' }, 404)")],
  ['route is wired', groupErp.includes("p==='/api/audit/retention/preview'&&m==='GET'")],
];

for (const [name, passed] of checks) {
  if (!passed) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log(`Audit retention boundary checks: ${checks.length}/${checks.length} PASS`);
