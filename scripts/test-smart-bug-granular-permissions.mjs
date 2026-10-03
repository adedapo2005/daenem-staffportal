import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/smart-bug-management.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0095_smart_bug_granular_permissions.sql', import.meta.url), 'utf8');

const deniedAt = source.indexOf("if (!hasCrossCompany && companyIds.length === 0) return json({ error: 'Smart Bug Management is unavailable.' }, 404)");
const queryAt = source.indexOf("if (runIntegrityScan) {");
assert.ok(deniedAt >= 0 && queryAt > deniedAt, 'unauthorized scope is denied before detector queries');
assert.match(source, /runIntegrityScan \? 'smart_bug\.detectors'/);
assert.match(source, /storageMirrorIntegrity \|\| reconciliationImportIntegrity \? 'smart_bug\.integrity'/);
assert.match(source, /: 'smart_bug\.incidents'/);
assert.match(source, /const level = runIntegrityScan \? 'edit' : 'view'/);
assert.match(source, /function canCompany\(context: SessionContext, permission: string, level: 'view' \| 'edit', companyId: string\)/);
assert.match(source, /hasPermission\(context, permission, level, companyId\)/);
assert.match(source, /return hasPermission\(context, permission, level\) &&\s*hasPermission\(context, 'smart_bug\.cross_company', 'view'\)/);
assert.match(source, /filter\(\(companyId\) => canCompany\(context, permission, level, companyId\)\)/);
assert.match(source, /const scopeSql = hasCrossCompany \? '' : ` AND company_id IN/);
assert.match(source, /const companyRows = hasCrossCompany[\s\S]*?SELECT id FROM companies ORDER BY id/);
assert.match(source, /const canViewDiagnostics = canCompany\(context, 'smart_bug\.diagnostics', 'view', String\(incident\.companyId \|\| ''\)\)/);
assert.match(source, /const evidence = canViewDiagnostics \? await env\.DB\.prepare/);
assert.match(source, /if \(companyId && !hasCrossCompany && !companyIds\.includes\(companyId\)\) return json\(\{ incidents: \[\]/);
for (const code of ['smart_bug.incidents','smart_bug.diagnostics','smart_bug.integrity','smart_bug.detectors','smart_bug.cross_company']) {
  assert.ok(migration.includes(`'${code}'`), `migration defines ${code}`);
}
assert.match(migration, /rp-owner-smart-bug-incidents/);
assert.match(migration, /rp-owner-smart-bug-cross-company/);
assert.doesNotMatch(migration, /auto_remediation_enabled\s*=\s*1/i);
assert.doesNotMatch(source, /DELETE FROM|UPDATE smart_bug_control|auto_remediation_enabled\s*=\s*1/i);
console.log('PASS 23 Smart Bug granular permission boundary assertions');
