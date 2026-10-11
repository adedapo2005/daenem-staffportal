import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [source, coreMigration, payrollMigration] = await Promise.all([
  read('../worker/payroll-bank-draft.ts'),
  read('../migrations/0001_core.sql'),
  read('../migrations/0035_group_erp_operational.sql')
]);
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', 'require', js)(exports, () => ({ hasPermission: (context, key, _level, companyId) => context.companyPermissions?.[companyId]?.[key] === 'edit' }));
const { promoteVerifiedEmployeeBankAccount } = exports;

function migrationTable(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${escaped}\\s*\\([\\s\\S]*?\\);`, 'i'));
  assert.ok(match, `missing committed migration DDL for ${name}`);
  return match[0];
}

function createDatabase({ revokeAfterPendingRead = false, failAudit = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id TEXT PRIMARY KEY); CREATE TABLE employees(id TEXT PRIMARY KEY); CREATE TABLE company_locations(id TEXT PRIMARY KEY);');
  db.exec(migrationTable(coreMigration, 'employee_company_memberships'));
  db.exec(migrationTable(coreMigration, 'audit_logs'));
  db.exec(migrationTable(payrollMigration, 'employee_bank_accounts'));
  db.prepare('INSERT INTO companies(id) VALUES(?)').run('company-a');
  db.prepare('INSERT INTO employees(id) VALUES(?)').run('employee-a');
  db.prepare('INSERT INTO employees(id) VALUES(?)').run('actor-a');
  db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,1)').run('membership-a', 'employee-a', 'company-a');
  const insert = db.prepare(`INSERT INTO employee_bank_accounts(id,employee_id,bank_key,bank_name,account_number_ciphertext,account_number_iv,account_number_last4,verified_at,verification_source,is_primary,active)
    VALUES(?,?,'test-bank','Test Bank','cipher','iv','1234',?,?,?,1)`);
  insert.run('primary-a', 'employee-a', '2026-01-01T00:00:00.000Z', 'bank:old', 1);
  insert.run('candidate-a', 'employee-a', null, null, 0);
  if (failAudit) db.exec(`CREATE TRIGGER fail_bank_audit BEFORE INSERT ON audit_logs WHEN NEW.action='verify_employee_bank' BEGIN SELECT RAISE(ABORT,'forced audit failure'); END;`);

  let pendingReadCount = 0;
  const adapter = {
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
  return { db, adapter };
}

const context = {
  employee: { id: 'actor-a' },
  roles: [{ code: 'payroll-manager' }],
  companies: [{ id: 'company-a' }],
  companyPermissions: { 'company-a': { 'payroll.access': 'edit' } }
};
const input = { companyId: 'company-a', employeeId: 'employee-a', bankAccountId: 'candidate-a', verificationSource: 'bank', verificationReference: 'promotion-123', verifiedAt: '2026-10-10T12:00:00.000Z' };
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
  const { db, adapter } = createDatabase({ failAudit: true });
  await assert.rejects(promoteVerifiedEmployeeBankAccount(request, { DB: adapter }, context, input), /forced audit failure/);
  assert.equal(db.prepare("SELECT is_primary FROM employee_bank_accounts WHERE id='primary-a'").get().is_primary, 1);
  assert.equal(db.prepare("SELECT is_primary,verified_at FROM employee_bank_accounts WHERE id='candidate-a'").get().is_primary, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='verify_employee_bank'").get().count, 0);
  db.close();
}

console.log('PASS payroll bank promotion SQLite: committed migration DDL, authorized promotion, post-preflight membership revocation denial, and required-audit rollback (3 scenarios)');
