import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Keep synthetic import substitution portable across LF (GitHub CI) and CRLF (Windows checkout).
const source = (await readFile(new URL('../worker/spend.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const authImport = `import {\n  hasPermission,\n  logSecurity,\n  requestIp,\n  requestLocationLabel,\n  type AuthEnv,\n  type SessionContext,\n} from './auth';`;
const executableSource = source.replace(authImport, `const hasPermission=()=>true; const logSecurity=async()=>{}; const requestIp=()=>''; const requestLocationLabel=()=>'';`);
assert.notEqual(executableSource, source, 'runtime fixture replaces only the authorization dependency');
const compiled = ts.transpileModule(executableSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, () => ({}));
const { routeSpend } = loaded.exports;

function fixture({ ignoreAudit = false, ignoreEvent = false, synchronizeReads = false, synchronizeSubmitReads = false, initialStatus = 'submitted', ownerOnlyRole = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE spend_expense_requests(id TEXT PRIMARY KEY,company_id TEXT,status TEXT,requester_employee_id TEXT,approved_at TEXT,submitted_at TEXT,updated_at TEXT);
    CREATE TABLE spend_expense_approvals(id TEXT PRIMARY KEY,expense_request_id TEXT,rule_id TEXT,step_no INTEGER,approver_role_code TEXT,status TEXT,approver_employee_id TEXT,reason TEXT,acted_at TEXT);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,after_json TEXT,reason TEXT,source TEXT,request_id TEXT,occurred_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE spend_expense_events(id TEXT PRIMARY KEY,expense_request_id TEXT,actor_employee_id TEXT,company_id TEXT,action TEXT,previous_status TEXT,next_status TEXT,reason TEXT,request_id TEXT,source TEXT,captured_at TEXT,metadata_json TEXT,server_received_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,employee_id TEXT,expires_at TEXT,revoked_at TEXT);
    CREATE TABLE employees(id TEXT PRIMARY KEY,employment_status TEXT);
    CREATE TABLE employee_company_memberships(employee_id TEXT,company_id TEXT,active INTEGER);
    CREATE TABLE companies(id TEXT PRIMARY KEY,active INTEGER);
    CREATE TABLE employee_roles(id TEXT PRIMARY KEY,employee_id TEXT,company_id TEXT,role_id TEXT);
    CREATE TABLE roles(id TEXT PRIMARY KEY,company_id TEXT,code TEXT,active INTEGER);
    CREATE TABLE permissions(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE role_permissions(id TEXT PRIMARY KEY,role_id TEXT,permission_id TEXT,access_level TEXT);
    CREATE TABLE employee_permission_overrides(id TEXT PRIMARY KEY,employee_id TEXT,permission_id TEXT,access_level TEXT,expires_at TEXT);
    CREATE TABLE employee_permission_overrides_v2(id TEXT PRIMARY KEY,employee_id TEXT,permission_id TEXT,company_id TEXT,access_level TEXT,expires_at TEXT);
  `);
  db.prepare('INSERT INTO spend_expense_requests(id,company_id,status,requester_employee_id) VALUES(?,?,?,?)').run('expense-a', 'company-a', initialStatus, 'requester-a');
  // Authorize the synthetic Manager using the SAME persisted D1 rows checked
  // inside the atomic approval/submit batch. Owner role alone grants nothing.
  db.exec(`
    INSERT INTO employees(id,employment_status) VALUES('manager-a','active');
    INSERT INTO companies(id,active) VALUES('company-a',1);
    INSERT INTO employee_company_memberships(employee_id,company_id,active) VALUES('manager-a','company-a',1);
    INSERT INTO auth_sessions(id,employee_id,expires_at,revoked_at) VALUES('session-manager-a','manager-a','2099-12-31T23:59:59Z',NULL);
    INSERT INTO roles(id,company_id,code,active) VALUES('role-manager',NULL,'manager',1);
    INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES('er-manager-a','manager-a','company-a','role-manager');
    INSERT INTO permissions(id,code) VALUES('perm-approve','expense.approve'),('perm-request','expense.requests');
    INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES
      ('grant-approve','role-manager','perm-approve','approve'),
      ('grant-request','role-manager','perm-request','create');
  `);
  if (initialStatus === 'submitted') db.prepare('INSERT INTO spend_expense_approvals(id,expense_request_id,status) VALUES(?,?,?)').run('approval-a', 'expense-a', 'pending');
  if (ignoreAudit) db.exec(`CREATE TRIGGER ignore_action_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(IGNORE); END;`);
  if (ignoreEvent) db.exec(`CREATE TRIGGER ignore_action_event BEFORE INSERT ON spend_expense_events BEGIN SELECT RAISE(IGNORE); END;`);
  const row = { id: 'expense-a', companyId: 'company-a', requesterEmployeeId: 'requester-a', status: initialStatus, categoryId: 'category-a', totalKobo: 9000, costCenterId: 'cost-a' };
  let readCount = 0;
  let unblock;
  const readBarrier = synchronizeReads || synchronizeSubmitReads ? new Promise(resolve => { unblock = resolve; }) : null;
  const env = { DB: {
    prepare(sql) {
      return { sql, args: [], bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('FROM spend_expense_requests r')) {
            const result = { ...row, status: db.prepare(`SELECT status FROM spend_expense_requests WHERE id='expense-a'`).get().status };
            if (synchronizeSubmitReads && readCount < 2) { readCount++; if (readCount === 2) unblock(); await readBarrier; }
            return result;
          }
          if (sql.includes('FROM spend_categories')) return null;
          if (sql.includes('FROM spend_evidence_policies')) return null;
          if (sql.includes('COUNT(*) AS count FROM spend_expense_evidence')) return { count: 0 };
          if (sql.includes('FROM spend_expense_approvals a LEFT JOIN spend_approval_rules')) {
            const approval = db.prepare('SELECT id,status FROM spend_expense_approvals WHERE expense_request_id=? AND status=\'pending\' LIMIT 1').get(this.args[0]);
            if (synchronizeReads) { readCount++; if (readCount === 2) unblock(); await readBarrier; }
            return approval?.status === 'pending' ? { id: 'approval-a', stepNo: 1, approverRoleCode: 'manager', requiredPermission: 'expense.approve' } : null;
          }
          if (sql.includes('COUNT(*) AS count FROM spend_expense_approvals')) return { count: db.prepare(`SELECT COUNT(*) AS count FROM spend_expense_approvals WHERE expense_request_id=? AND status='pending'`).get(...this.args).count };
          throw new Error(`Unexpected first query: ${sql}`);
        },
        async all() { return { results: [] }; },
        async run() { return db.prepare(sql).run(...this.args); },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          const prepared = db.prepare(statement.sql);
          try {
            if (/^\s*SELECT\b/i.test(statement.sql)) results.push({ results: prepared.all(...statement.args) });
            else results.push({ meta: prepared.run(...statement.args) });
          } catch (error) { throw new Error(`Batch statement ${index} failed: ${error}`); }
        }
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  } };
  const context = { employee: { id: 'manager-a', department: 'Finance' }, sessionId: 'session-manager-a', roles: ownerOnlyRole ? [{ code: 'owner' }] : [{ code: 'manager', companyId: 'company-a' }], companies: [{ id: 'company-a' }], companyPermissions: {} };
  const request = action => new Request('https://staffportal.test/api/spend/requests/expense-a/action', { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': `request-${action}` }, body: JSON.stringify({ action, reason: action === 'approve' ? undefined : 'Reviewed and recorded.', missingEvidenceReason: action === 'submit' ? 'Receipt restoration is pending.' : undefined }) });
  return { db, env, context, request };
}

// Even with a request-time permission stub, Owner identity cannot bypass the
// assigned Manager approval step. A denial audit is required, but no business write may occur.
{
  const { db, env, context, request } = fixture({ ownerOnlyRole: true });
  const response = await routeSpend(request('approve'), env, context);
  assert.equal(response.status, 403, 'Owner role cannot bypass the Manager approval step');
  assert.equal(db.prepare("SELECT status FROM spend_expense_requests WHERE id='expense-a'").get().status, 'submitted');
  const rejectedAudit = db.prepare('SELECT action,after_json FROM audit_logs').get();
  assert.equal(rejectedAudit?.action, 'approval_role_denied', 'the denial itself must be audited');
  assert.equal(JSON.parse(rejectedAudit.after_json).outcome, 'rejected');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 0);
  db.close();
}

for (const action of ['approve', 'return', 'reject']) {
  const { db, env, context, request } = fixture();
  const response = await routeSpend(request(action), env, context);
  assert.equal(response.status, 200, `${action} action succeeds: ${await response.clone().text()}`);
  const expectedStatus = action === 'approve' ? 'approved' : action === 'return' ? 'returned' : 'rejected';
  assert.equal(db.prepare(`SELECT status FROM spend_expense_requests WHERE id='expense-a'`).get().status, expectedStatus);
  assert.equal(db.prepare(`SELECT status,approver_employee_id FROM spend_expense_approvals WHERE id='approval-a'`).get().status, expectedStatus === 'approved' ? 'approved' : expectedStatus);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 1);
  db.close();
}

{
  const { db, env, context, request } = fixture({ initialStatus: 'draft' });
  const response = await routeSpend(request('submit'), env, context);
  assert.equal(response.status, 200, `submission succeeds: ${await response.clone().text()}`);
  assert.equal(db.prepare(`SELECT status FROM spend_expense_requests WHERE id='expense-a'`).get().status, 'submitted');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1, 'submission audit is committed with the state change');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 1, 'submission event is committed with the state change');
  db.close();
}

{
  const { db, env, context, request } = fixture({ initialStatus: 'draft', ignoreAudit: true });
  const response = await routeSpend(request('submit'), env, context);
  assert.equal(response.status, 409, 'a suppressed audit prevents submission');
  assert.equal(db.prepare(`SELECT status FROM spend_expense_requests WHERE id='expense-a'`).get().status, 'draft', 'failed evidence rolls back submitted status');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0, 'failed submission leaves no audit row');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 0, 'failed submission leaves no event row');
  db.close();
}

{
  const { db, env, context, request } = fixture({ initialStatus: 'draft', ignoreEvent: true });
  await assert.rejects(routeSpend(request('submit'), env, context), /malformed JSON/i, 'a suppressed event aborts submission');
  assert.equal(db.prepare(`SELECT status FROM spend_expense_requests WHERE id='expense-a'`).get().status, 'draft', 'missing event rolls back submitted status');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0, 'event failure rolls back audit row');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 0, 'event suppression leaves no event row');
  db.close();
}

{
  const { db, env, context, request } = fixture({ initialStatus: 'draft', synchronizeSubmitReads: true });
  const results = await Promise.all([routeSpend(request('submit'), env, context), routeSpend(request('submit'), env, context)]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409], 'only one concurrent submission wins');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 1);
  db.close();
}

{
  const { db, env, context, request } = fixture({ ignoreAudit: true });
  const response = await routeSpend(request('approve'), env, context);
  assert.equal(response.status, 409, 'ignored audit leaves transition unchanged');
  assert.equal(db.prepare(`SELECT status FROM spend_expense_requests WHERE id='expense-a'`).get().status, 'submitted');
  assert.equal(db.prepare(`SELECT status FROM spend_expense_approvals WHERE id='approval-a'`).get().status, 'pending');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 0);
  db.close();
}

{
  const { db, env, context, request } = fixture({ ignoreEvent: true });
  await assert.rejects(routeSpend(request('approve'), env, context), /malformed JSON|malformed JSON/i);
  assert.equal(db.prepare(`SELECT status FROM spend_expense_requests WHERE id='expense-a'`).get().status, 'submitted', 'missing event rolls back request state');
  assert.equal(db.prepare(`SELECT status FROM spend_expense_approvals WHERE id='approval-a'`).get().status, 'pending', 'missing event rolls back approval state');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 0, 'missing event rolls back success audit');
  db.close();
}

{
  const { db, env, context, request } = fixture({ synchronizeReads: true });
  const results = await Promise.all([routeSpend(request('approve'), env, context), routeSpend(request('approve'), env, context)]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409], 'one concurrent approval wins and the stale request conflicts');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spend_expense_events').get().count, 1);
  db.close();
}

console.log('PASS Spend submit and approval transitions: atomic submit audit/event/rules, stale concurrent submit, approve/return/reject, evidence suppression rollback, and concurrent stale approval');
