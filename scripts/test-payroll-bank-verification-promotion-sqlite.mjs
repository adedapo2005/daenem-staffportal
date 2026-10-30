import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [source, authSource, coreMigration, payrollMigration, permissionOverridesMigration] = await Promise.all([
  read('../worker/payroll-bank-draft.ts'),
  read('../worker/auth.ts'),
  read('../migrations/0001_core.sql'),
  read('../migrations/0035_group_erp_operational.sql'),
  read('../migrations/0019_employee_permission_overrides_v2.sql')
]);
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', 'require', js)(exports, () => ({ hasPermission: (context, key, _level, companyId) => context.companyPermissions?.[companyId]?.[key] === 'edit' }));
const { promoteVerifiedEmployeeBankAccount } = exports;
const roleQuery = authSource.match(/const rolesResult = await env\.DB\.prepare\(`([\s\S]*?)`\)/)?.[1];
const permissionQuery = authSource.match(/const permissionRows = await env\.DB\.prepare\(`([\s\S]*?)`\)/)?.[1];
assert.ok(roleQuery, 'canonical session role query is present');
assert.ok(permissionQuery, 'canonical session permission query is present');

function migrationTable(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${escaped}\\s*\\([\\s\\S]*?\\);`, 'i'));
  assert.ok(match, `missing committed migration DDL for ${name}`);
  return match[0];
}

function adapterFor(db, { revokeAfterPendingRead = false, revokeActorAfterPendingRead = false, revokeActorGrantAfterPendingRead = false, deactivateActorRoleAfterPendingRead = false } = {}) {
  let pendingReadCount = 0;
  return {
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          const row = db.prepare(sql).get(...this.args) ?? null;
          if (revokeAfterPendingRead && sql.includes('FROM employee_bank_accounts candidate') && row && pendingReadCount++ === 0) {
            db.prepare('UPDATE employee_company_memberships SET active=0 WHERE employee_id=? AND company_id=?').run('employee-a', 'company-a');
          }
          if (revokeActorAfterPendingRead && sql.includes('FROM employee_bank_accounts candidate') && row && pendingReadCount++ === 0) {
            db.prepare('UPDATE employee_company_memberships SET active=0 WHERE employee_id=? AND company_id=?').run('actor-a', 'company-a');
          }
          if (revokeActorGrantAfterPendingRead && sql.includes('FROM employee_bank_accounts candidate') && row && pendingReadCount++ === 0) {
            db.prepare('DELETE FROM employee_roles WHERE employee_id=? AND company_id=? AND role_id=?').run('actor-a', 'company-a', 'payroll-role-a');
          }
          if (deactivateActorRoleAfterPendingRead && sql.includes('FROM employee_bank_accounts candidate') && row && pendingReadCount++ === 0) {
            db.prepare('UPDATE roles SET active=0 WHERE id=?').run('payroll-role-a');
          }
          return row;
        }
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const prepared = db.prepare(statement.sql);
          if (/^\s*(SELECT|WITH)\b/i.test(statement.sql)) return { results: prepared.all(...statement.args) };
          prepared.run(...statement.args);
          return { results: [] };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function createDatabase({ revokeAfterPendingRead = false, revokeActorAfterPendingRead = false, revokeActorGrantAfterPendingRead = false, deactivateActorRoleAfterPendingRead = false, denyActorPermission = false, failAudit = false, ignoreAudit = false, actorRoleCompanyId = 'company-a', actorRoleActive = 1, ownerRoleCompanyId = null } = {}, databasePath = ':memory:') {
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(migrationTable(coreMigration, 'companies'));
  db.exec('CREATE TABLE employees(id TEXT PRIMARY KEY); CREATE TABLE company_locations(id TEXT PRIMARY KEY);');
  db.exec(migrationTable(coreMigration, 'employee_company_memberships'));
  for (const table of ['roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides']) db.exec(migrationTable(coreMigration, table));
  db.exec(migrationTable(permissionOverridesMigration, 'employee_permission_overrides_v2'));
  db.exec(migrationTable(coreMigration, 'audit_logs'));
  db.exec(migrationTable(payrollMigration, 'employee_bank_accounts'));
  db.prepare('INSERT INTO companies(id,code,name,business_type) VALUES(?,?,?,?)').run('company-a', 'COMPANY-A', 'Company A', 'other');
  db.prepare('INSERT INTO companies(id,code,name,business_type) VALUES(?,?,?,?)').run('company-b', 'COMPANY-B', 'Company B', 'other');
  db.prepare('INSERT INTO employees(id) VALUES(?)').run('employee-a');
  db.prepare('INSERT INTO employees(id) VALUES(?)').run('actor-a');
  db.prepare('INSERT INTO employees(id) VALUES(?)').run('owner-a');
  db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,1)').run('membership-a', 'employee-a', 'company-a');
  db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,1)').run('actor-membership-a', 'actor-a', 'company-a');
  // A global Owner role is projected only while its assigned company has an
  // active backing membership. An orphaned Owner role must fail closed.
  db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,1)').run('owner-membership-a', 'owner-a', 'company-a');
  db.prepare('INSERT INTO roles(id,company_id,code,name,is_system,active) VALUES(?,?,?,?,1,?)').run('payroll-role-a', actorRoleCompanyId, 'payroll-manager', 'Payroll Manager', actorRoleActive);
  db.prepare('INSERT INTO roles(id,company_id,code,name,is_system,active) VALUES(?,?,?,?,1,1)').run('owner-role-a', ownerRoleCompanyId, 'owner', 'Owner');
  db.prepare('INSERT INTO permissions(id,code,module,action) VALUES(?,?,?,?)').run('payroll-access', 'payroll.access', 'payroll', 'access');
  db.prepare('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)').run('payroll-role-grant', 'payroll-role-a', 'payroll-access', 'edit');
  db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)').run('actor-payroll-role', 'actor-a', 'company-a', 'payroll-role-a');
  db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)').run('owner-role-assignment', 'owner-a', 'company-a', 'owner-role-a');
  if (denyActorPermission) db.prepare('INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES(?,?,?,?,?,?,?)').run('actor-payroll-deny', 'actor-a', 'company-a', 'payroll-access', 'none', 'Fixture deny-wins check', 'owner-a');
  const insert = db.prepare(`INSERT INTO employee_bank_accounts(id,employee_id,bank_key,bank_name,account_number_ciphertext,account_number_iv,account_number_last4,verified_at,verification_source,is_primary,active)
    VALUES(?,?,'test-bank','Test Bank','cipher','iv','1234',?,?,?,1)`);
  insert.run('primary-a', 'employee-a', '2026-01-01T00:00:00.000Z', 'bank:old', 1);
  insert.run('candidate-a', 'employee-a', null, null, 0);
  insert.run('candidate-b', 'employee-a', null, null, 0);
  if (failAudit) db.exec(`CREATE TRIGGER fail_bank_audit BEFORE INSERT ON audit_logs WHEN NEW.action='verify_employee_bank' BEGIN SELECT RAISE(ABORT,'forced audit failure'); END;`);
  if (ignoreAudit) db.exec(`CREATE TRIGGER ignore_bank_audit BEFORE INSERT ON audit_logs WHEN NEW.action='verify_employee_bank' BEGIN SELECT RAISE(IGNORE); END;`);

  const adapter = adapterFor(db, { revokeAfterPendingRead, revokeActorAfterPendingRead, revokeActorGrantAfterPendingRead, deactivateActorRoleAfterPendingRead });
  return { db, adapter };
}

const context = {
  employee: { id: 'actor-a' },
  roles: [{ code: 'payroll-manager' }],
  companies: [{ id: 'company-a' }],
  companyPermissions: { 'company-a': { 'payroll.access': 'edit' } }
};
const input = { companyId: 'company-a', employeeId: 'employee-a', bankAccountId: 'candidate-a', verificationSource: 'bank', verificationReference: 'promotion-123', verifiedAt: '2026-10-10T12:00:00.000Z' };

{
  const { db } = createDatabase();
  const rows = db.prepare(permissionQuery).all('actor-a', 'active');
  assert.deepEqual(rows.map(row => [row.companyId, row.code, row.accessLevel]), [['company-a', 'payroll.access', 'edit']], 'active role scoped to its assigned company contributes its permission');
  assert.deepEqual(db.prepare(roleQuery).all('owner-a', 'active').map(row => row.code), ['owner'], 'global Owner role with active assigned membership remains available');
  db.prepare('UPDATE employee_company_memberships SET active=0 WHERE employee_id=? AND company_id=?').run('owner-a', 'company-a');
  assert.deepEqual(db.prepare(roleQuery).all('owner-a', 'active').map(row => row.code), [], 'revoked Owner membership must immediately remove the global Owner role');
  db.close();
}

{
  const { db } = createDatabase({ actorRoleActive: 0 });
  assert.equal(db.prepare(permissionQuery).all('actor-a', 'active').length, 0, 'inactive role grants no session permission');
  db.close();
}

{
  const { db } = createDatabase({ actorRoleCompanyId: 'company-b' });
  assert.equal(db.prepare(permissionQuery).all('actor-a', 'active').length, 0, 'role scoped to another company grants no session permission');
  db.close();
}

{
  const { db } = createDatabase({ ownerRoleCompanyId: 'company-b' });
  assert.equal(db.prepare(roleQuery).all('owner-a', 'active').length, 0, 'company-scoped Owner role cannot become group Owner authority');
  db.close();
}
const request = new Request('https://staffportal.test/api/payroll/employee-bank/verify', { headers: { 'x-request-id': 'sqlite-promotion-test' } });

{
  const { db, adapter } = createDatabase();
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 200);
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 0);
  assert.equal(db.prepare("SELECT is_primary,verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 1);
  assert.equal(db.prepare("SELECT request_id FROM audit_logs WHERE action='verify_employee_bank'").get().request_id, 'sqlite-promotion-test');
  db.close();
}

{
  const { db, adapter } = createDatabase();
  const first = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  const replay = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(first.status, 200, 'first verified promotion succeeds');
  assert.equal(replay.status, 200, 'same-key replay returns the original safe success');
  assert.equal(db.prepare("SELECT id FROM employee_bank_accounts WHERE employee_id='employee-a' AND active=1 AND is_primary=1").get().id, 'candidate-a');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 1, 'replay creates no second success audit');
  const changedTimestampReplay = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, { ...input, verifiedAt: '2026-10-11T12:00:00.000Z' });
  assert.equal(changedTimestampReplay.status, 200, 'same-key replay uses the original durable operation despite a regenerated timestamp');
  const conflictingReplay = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, { ...input, bankAccountId: 'candidate-b' });
  assert.equal(conflictingReplay.status, 404, 'same operation key cannot be replayed against a different account');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 1, 'conflicting key reuse creates no audit');
  db.close();
}

{
  const directory = mkdtempSync(join(tmpdir(), 'staffportal-payroll-promotion-'));
  const databasePath = join(directory, 'promotion.sqlite');
  const { db, adapter } = createDatabase({}, databasePath);
  const competingDb = new DatabaseSync(databasePath);
  competingDb.exec('PRAGMA foreign_keys=ON;');
  const competingAdapter = adapterFor(competingDb);
  try {
    const competingInput = { ...input, bankAccountId: 'candidate-b', verificationReference: 'promotion-456' };
    const [first, second] = await Promise.all([
      promoteVerifiedEmployeeBankAccount(new Request('https://staffportal.test/api/payroll/employee-bank/verify', { headers: { 'x-request-id': 'sqlite-race-a' } }), { DB: adapter }, context, input),
      promoteVerifiedEmployeeBankAccount(new Request('https://staffportal.test/api/payroll/employee-bank/verify', { headers: { 'x-request-id': 'sqlite-race-b' } }), { DB: competingAdapter }, context, competingInput)
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 404], 'exactly one independent-connection candidate promotion wins');
    const winnerId = db.prepare("SELECT id FROM employee_bank_accounts WHERE employee_id='employee-a' AND active=1 AND is_primary=1").get().id;
    assert.ok(['candidate-a', 'candidate-b'].includes(winnerId), 'one candidate is the sole primary');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM employee_bank_accounts WHERE employee_id='employee-a' AND active=1 AND is_primary=1").get().count, 1, 'race leaves exactly one active primary');
    const audits = db.prepare("SELECT entity_id,request_id FROM audit_logs WHERE action='verify_employee_bank'").all();
    assert.equal(audits.length, 1, 'losing invocation creates no success audit');
    assert.equal(audits[0].entity_id, winnerId, 'success audit belongs to the promoted candidate');
    assert.ok(['sqlite-race-a', 'sqlite-race-b'].includes(audits[0].request_id), 'winner audit preserves request correlation');
  } finally {
    competingDb.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

{
  const directory = mkdtempSync(join(tmpdir(), 'staffportal-payroll-same-key-'));
  const databasePath = join(directory, 'promotion.sqlite');
  const { db, adapter } = createDatabase({}, databasePath);
  const competingDb = new DatabaseSync(databasePath);
  competingDb.exec('PRAGMA foreign_keys=ON;');
  const competingAdapter = adapterFor(competingDb);
  try {
    const [first, replay] = await Promise.all([
      promoteVerifiedEmployeeBankAccount(new Request('https://staffportal.test/api/payroll/employee-bank/verify', { headers: { 'x-request-id': 'sqlite-same-key-a' } }), { DB: adapter }, context, input),
      promoteVerifiedEmployeeBankAccount(new Request('https://staffportal.test/api/payroll/employee-bank/verify', { headers: { 'x-request-id': 'sqlite-same-key-b' } }), { DB: competingAdapter }, context, input)
    ]);
    assert.deepEqual([first.status, replay.status].sort(), [200, 200], 'concurrent identical operation keys safely return success to both callers');
    assert.equal(db.prepare("SELECT id FROM employee_bank_accounts WHERE employee_id='employee-a' AND active=1 AND is_primary=1").get().id, 'candidate-a');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 1, 'same-key race has one durable winning audit');
  } finally {
    competingDb.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

{
  const { db, adapter } = createDatabase({ ownerRoleCompanyId: 'company-b' });
  const ownerContext = { ...context, employee: { id: 'owner-a' }, roles: [{ code: 'owner' }], companies: [], companyPermissions: {} };
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, ownerContext, input);
  assert.equal(response.status, 404, 'company-scoped Owner role cannot act as group Owner across companies');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase({ revokeAfterPendingRead: true });
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 404);
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT is_primary,verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().is_primary, 0);
  assert.equal(db.prepare("SELECT verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().verified_at, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase({ revokeActorAfterPendingRead: true });
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 404, 'acting employee membership revoked after preflight denies promotion');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().verified_at, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase({ revokeActorGrantAfterPendingRead: true });
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 404, 'acting employee Payroll role revoked after preflight denies promotion');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().verified_at, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase({ deactivateActorRoleAfterPendingRead: true });
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 404, 'acting employee inactive Payroll role after preflight denies promotion');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().verified_at, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase({ actorRoleCompanyId: 'company-b' });
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 404, 'Payroll role scoped to another company denies promotion');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase({ denyActorPermission: true });
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 404, 'current explicit company deny overrides the stale session grant');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase();
  const ownerContext = { ...context, employee: { id: 'owner-a' }, roles: [{ code: 'owner' }], companies: [], companyPermissions: {} };
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, ownerContext, input);
  assert.equal(response.status, 200, 'current group Owner authority remains group-wide');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='candidate-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT actor_employee_id FROM audit_logs WHERE action='verify_employee_bank'").get().actor_employee_id, 'owner-a');
  db.close();
}

{
  const { db, adapter } = createDatabase({ failAudit: true });
  await assert.rejects(promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input), /forced audit failure/);
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT is_primary,verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().is_primary, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

{
  const { db, adapter } = createDatabase({ ignoreAudit: true });
  const response = await promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input);
  assert.equal(response.status, 404, 'a silently ignored required audit fails closed');
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1,
    'silent audit failure preserves the existing primary');
  assert.equal(db.prepare("SELECT is_primary,verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().is_primary, 0,
    'silent audit failure rolls back candidate promotion');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0,
    'silent audit failure records no success evidence');
  db.close();
}

console.log('PASS payroll bank promotion SQLite: canonical active/company-scoped session grants, target and actor revocation, role deactivation and company mismatch, deny-wins override, Owner group authority, and required-audit rollback including silent audit suppression');
