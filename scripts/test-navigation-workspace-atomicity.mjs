import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  module._compile(javascript, filename);
};
const { routeNavigationWorkspace } = require(path.resolve('worker/navigation-workspace.ts'));

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE permissions(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE);
  CREATE TABLE companies(id TEXT PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE roles(id TEXT PRIMARY KEY,code TEXT NOT NULL,company_id TEXT,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE role_permissions(id TEXT PRIMARY KEY,role_id TEXT NOT NULL,permission_id TEXT NOT NULL,access_level TEXT NOT NULL,UNIQUE(role_id,permission_id));
  CREATE TABLE employees(id TEXT PRIMARY KEY,employment_status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,employee_id TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT);
  CREATE TABLE employee_company_memberships(employee_id TEXT,company_id TEXT,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(employee_id,company_id));
  CREATE TABLE employee_roles(employee_id TEXT,company_id TEXT,role_id TEXT);
  CREATE TABLE employee_permission_overrides_v2(id TEXT PRIMARY KEY,employee_id TEXT,company_id TEXT,permission_id TEXT,access_level TEXT,reason TEXT,assigned_by TEXT,expires_at TEXT,UNIQUE(employee_id,company_id,permission_id));
  CREATE TABLE employee_permission_overrides(id TEXT PRIMARY KEY,employee_id TEXT,company_id TEXT,permission_id TEXT,access_level TEXT,reason TEXT,granted_by TEXT,expires_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE navigation_access_changes(id TEXT PRIMARY KEY,company_id TEXT,target_type TEXT,target_id TEXT,item_key TEXT,permission_code TEXT,old_access_level TEXT,new_access_level TEXT,reason TEXT,changed_by TEXT);
  CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,before_json TEXT,after_json TEXT,source TEXT);
  CREATE TABLE employee_navigation_preferences(employee_id TEXT PRIMARY KEY,style_id TEXT,group_order_json TEXT,item_order_json TEXT,pinned_items_json TEXT,updated_by TEXT,updated_at TEXT);
  CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT,value_type TEXT,updated_at TEXT);
  INSERT INTO permissions VALUES('p-printing','printing.access'),('p-nav-assign','navigation.assign');
  INSERT INTO companies VALUES('company-printing',1);
  INSERT INTO roles VALUES('role-worker','staff','company-printing',1);
  INSERT INTO employees VALUES('employee-owner','active'),('employee-target','active');
  INSERT INTO employee_company_memberships VALUES('employee-target','company-printing',1);
  INSERT INTO role_permissions VALUES('rp-initial','role-worker','p-printing','view');
  INSERT INTO roles VALUES('role-owner','owner',NULL,1),('role-manager','manager','company-printing',1);
  INSERT INTO employee_company_memberships VALUES('employee-owner','company-printing',1);
  INSERT INTO employee_roles VALUES('employee-owner','company-printing','role-owner'),('employee-owner','company-printing','role-manager');
  INSERT INTO role_permissions VALUES('rp-owner-nav','role-owner','p-nav-assign','manage'),('rp-manager-nav','role-manager','p-nav-assign','manage');
  INSERT INTO auth_sessions VALUES('session-owner','employee-owner','2099-12-31T00:00:00Z',NULL);
  INSERT INTO employee_permission_overrides_v2 VALUES('override-v2','employee-target','company-printing','p-printing','view','initial','employee-owner',NULL);
  INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level,reason,granted_by,expires_at) VALUES('override-v1','employee-target','company-printing','p-printing','view','initial','employee-owner',NULL);
  INSERT INTO app_settings VALUES('navigation.default_style','guided-groups','string',CURRENT_TIMESTAMP),('navigation.forced_style','','string',CURRENT_TIMESTAMP),('navigation.allow_employee_choice','true','boolean',CURRENT_TIMESTAMP);
`);

function statement(sql) {
  const prepared = sqlite.prepare(sql);
  let args = [];
  return {
    bind(...values) { args = values; return this; },
    async first() { return prepared.get(...args) ?? null; },
    async all() { return { results: prepared.all(...args) }; },
    async run() { const result = prepared.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
    execute() {
      if (/^\s*SELECT\b/i.test(sql)) return { result: prepared.get(...args), meta: { changes: 0 } };
      const result = prepared.run(...args);
      return { meta: { changes: Number(result.changes) } };
    },
  };
}

// Injects a live authority change after request preflight and before the D1 batch.
let beforeBatchHook = null;
const DB = {
  prepare: statement,
  async batch(statements) {
    if (beforeBatchHook) {
      const fn = beforeBatchHook;
      beforeBatchHook = null;
      fn();
    }
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((item) => item.execute());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};

const context = {
  sessionId: 'session-owner',
  employee: { id: 'employee-owner', displayName: 'QA Owner', status: 'active' },
  companies: [{ id: 'company-printing', code: 'PRINTING', name: 'Printing', primary: true }],
  roles: [{ id: 'owner-role', code: 'owner', name: 'Owner', companyId: 'company-printing' }],
  permissions: {},
  companyPermissions: { 'company-printing': { 'navigation.assign': 'manage' } },
};
const env = { DB };
const call = async (pathname, body) => routeNavigationWorkspace(new Request(`https://worker.test${pathname}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}), env, context);
const get = async pathname => routeNavigationWorkspace(new Request(`https://worker.test${pathname}`), env, context);
const scalar = (sql, ...args) => sqlite.prepare(sql).get(...args);
const installAuditFault = (action) => sqlite.exec(`CREATE TRIGGER fail_${action} BEFORE INSERT ON audit_logs WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END`);
const removeAuditFault = (action) => sqlite.exec(`DROP TRIGGER fail_${action}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

let response = await call('/api/navigation/assign', { companyId: 'company-printing', targetType: 'role', targetId: 'role-worker', itemKey: 'printing', accessLevel: 'manage', reason: 'QA atomicity' });
check(response.status === 200, 'role grant succeeds with a valid audit');
check(scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-printing'").access_level === 'manage', 'role grant is stored');
check(scalar("SELECT COUNT(*) n FROM navigation_access_changes").n === 1, 'role change history is stored');
check(scalar("SELECT COUNT(*) n FROM audit_logs WHERE action='workspace_assignment'").n === 1, 'role assignment audit is stored');

const ownerWithoutCompanyGrant = { ...context, companyPermissions: {}, permissions: {} };
response = await routeNavigationWorkspace(new Request('https://worker.test/api/navigation/assign', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId: 'company-printing', targetType: 'role', targetId: 'role-worker', itemKey: 'printing', accessLevel: 'manage', reason: 'Owner role is not a company grant' }),
}), env, ownerWithoutCompanyGrant);
check(response.status === 403, 'Owner role without company assignment grant cannot write company access');
check(scalar("SELECT COUNT(*) n FROM navigation_access_changes").n === 1, 'denied Owner role adds no assignment history');
response = await routeNavigationWorkspace(new Request('https://worker.test/api/navigation/access'), env, context);
check(response.status === 400, 'access overview requires an explicit company instead of selecting the first membership');
response = await get('/api/navigation/access?companyId=company-foreign');
check(response.status === 403, 'Owner role cannot inspect an unassigned company');

installAuditFault('workspace_assignment');
response = await call('/api/navigation/assign', { companyId: 'company-printing', targetType: 'role', targetId: 'role-worker', itemKey: 'printing', accessLevel: 'edit', reason: 'QA rollback' });
check(response.status === 409, 'role assignment audit failure returns conflict');
check(scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-printing'").access_level === 'manage', 'role grant rolls back when its audit fails');
check(scalar("SELECT COUNT(*) n FROM navigation_access_changes").n === 1, 'role history rolls back with its grant');
removeAuditFault('workspace_assignment');

response = await call('/api/navigation/assign', { companyId: 'company-printing', targetType: 'employee', targetId: 'employee-target', itemKey: 'printing', accessLevel: 'manage', reason: 'QA employee atomicity' });
check(response.status === 200, 'employee override succeeds with a valid audit');
check(scalar("SELECT access_level FROM employee_permission_overrides_v2 WHERE employee_id='employee-target'").access_level === 'manage', 'v2 employee override is stored');
check(scalar("SELECT access_level FROM employee_permission_overrides WHERE employee_id='employee-target'").access_level === 'manage', 'compatibility employee override is stored');

sqlite.exec("CREATE TRIGGER fail_employee_history BEFORE INSERT ON navigation_access_changes WHEN NEW.target_type='employee' BEGIN SELECT RAISE(ABORT,'injected history failure'); END");
response = await call('/api/navigation/assign', { companyId: 'company-printing', targetType: 'employee', targetId: 'employee-target', itemKey: 'printing', accessLevel: 'edit', reason: 'QA history rollback' });
check(response.status === 409, 'employee history failure returns conflict');
check(scalar("SELECT access_level FROM employee_permission_overrides_v2 WHERE employee_id='employee-target'").access_level === 'manage', 'both employee override tables roll back with history failure');
check(scalar("SELECT access_level FROM employee_permission_overrides WHERE employee_id='employee-target'").access_level === 'manage', 'legacy employee override remains unchanged after rollback');
sqlite.exec('DROP TRIGGER fail_employee_history');

response = await call('/api/navigation/preference', { styleId: 'compact-rail' });
check(response.status === 200, 'self preference saves with a valid audit');
installAuditFault('save_preference');
response = await call('/api/navigation/preference', { styleId: 'two-column' });
check(response.status === 409, 'preference audit failure returns conflict');
check(scalar("SELECT style_id FROM employee_navigation_preferences WHERE employee_id='employee-owner'").style_id === 'compact-rail', 'preference rolls back when its audit fails');
removeAuditFault('save_preference');

installAuditFault('update_group_policy');
response = await call('/api/navigation/policy', { defaultStyle: 'two-column' });
check(response.status === 409, 'policy audit failure returns conflict');
check(scalar("SELECT setting_value FROM app_settings WHERE setting_key='navigation.default_style'").setting_value === 'guided-groups', 'policy update rolls back when its audit fails');
removeAuditFault('update_group_policy');
response = await call('/api/navigation/policy', { defaultStyle: 'two-column', allowEmployeeChoice: false });
check(response.status === 200, 'policy saves with a valid audit');
check(scalar("SELECT setting_value FROM app_settings WHERE setting_key='navigation.default_style'").setting_value === 'two-column', 'policy settings are stored');
check(scalar("SELECT COUNT(*) n FROM audit_logs WHERE action='update_group_policy'").n === 1, 'policy audit is stored');

response = await call('/api/navigation/assign', { companyId: 'company-printing', targetType: 'unexpected', targetId: 'role-worker', itemKey: 'printing', accessLevel: 'manage', reason: 'invalid target' });
check(response.status === 400, 'invalid target type is rejected');

// A cached Owner must fail closed when the live Owner role is revoked just
// before an Owner-only grant is committed; ordinary manager permission remains.
const oldAdminGrant = scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-nav-assign'")?.access_level || 'none';
const oldAdminHistory = scalar("SELECT COUNT(*) n FROM navigation_access_changes WHERE item_key='authorized-workspace'").n;
const oldAdminAudit = scalar("SELECT COUNT(*) n FROM audit_logs WHERE action='workspace_assignment'").n;
beforeBatchHook = () => sqlite.exec("UPDATE roles SET active=0 WHERE id='role-owner'");
response = await call('/api/navigation/assign', {
  companyId:'company-printing',targetType:'role',targetId:'role-worker',
  itemKey:'authorized-workspace',accessLevel:'manage',
  reason:'Owner role revoked before privileged write',
});
check(response.status === 409, 'revoked live Owner cannot grant administration access');
check((scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-nav-assign'")?.access_level || 'none') === oldAdminGrant,
  'revoked Owner leaves privileged grant unchanged');
check(scalar("SELECT COUNT(*) n FROM navigation_access_changes WHERE item_key='authorized-workspace'").n === oldAdminHistory
  && scalar("SELECT COUNT(*) n FROM audit_logs WHERE action='workspace_assignment'").n === oldAdminAudit,
  'denied Owner-only grant writes no navigation history or audit');
sqlite.exec("UPDATE roles SET active=1 WHERE id='role-owner'");
response = await call('/api/navigation/assign', {
  companyId:'company-printing',targetType:'role',targetId:'role-worker',
  itemKey:'authorized-workspace',accessLevel:'manage',
  reason:'Valid current Owner administration grant',
});
check(response.status === 200, 'valid live Owner administration grant succeeds');
check(scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-nav-assign'")?.access_level === 'manage',
  'authorized Owner administration grant persisted');
check(scalar("SELECT COUNT(*) n FROM navigation_access_changes WHERE item_key='authorized-workspace'").n === oldAdminHistory + 1
  && scalar("SELECT COUNT(*) n FROM audit_logs WHERE action='workspace_assignment'").n === oldAdminAudit + 1,
  'authorized Owner administration history and audit commit atomically');

// Regression: a cached, previously privileged actor must lose finance /
// navigation write authority immediately upon Active -> Provisional demotion.
const demotionHistory = scalar("SELECT COUNT(*) n FROM navigation_access_changes").n;
const demotionAudit = scalar("SELECT COUNT(*) n FROM audit_logs").n;
const demotionGrant = scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-printing'").access_level;
beforeBatchHook = () => sqlite.exec("UPDATE employees SET employment_status='provisional' WHERE id='employee-owner'");
response = await call('/api/navigation/assign', {
  companyId:'company-printing',targetType:'role',targetId:'role-worker',
  itemKey:'printing',accessLevel:'edit',reason:'Provisional demotion before grant write',
});
check(response.status === 409, 'Provisional demotion blocks cached Owner role assignment at write');
check(scalar("SELECT COUNT(*) n FROM navigation_access_changes").n === demotionHistory
  && scalar("SELECT COUNT(*) n FROM audit_logs").n === demotionAudit
  && scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-printing'").access_level === demotionGrant,
  'Demoted role actor leaves grant, change history and audit unchanged');
sqlite.exec("UPDATE employees SET employment_status='active' WHERE id='employee-owner'");

const demotionPolicy = scalar("SELECT setting_value FROM app_settings WHERE setting_key='navigation.default_style'").value;
beforeBatchHook = () => sqlite.exec("UPDATE employees SET employment_status='provisional' WHERE id='employee-owner'");
response = await call('/api/navigation/policy', { defaultStyle:'guided-groups' });
check(response.status === 409, 'Provisional demotion blocks cached Group Owner policy at write');
check(scalar("SELECT setting_value FROM app_settings WHERE setting_key='navigation.default_style'").value === demotionPolicy
  && scalar("SELECT COUNT(*) n FROM audit_logs").n === demotionAudit,
  'Demoted Group Owner cannot change policy or write an audit');
sqlite.exec("UPDATE employees SET employment_status='active' WHERE id='employee-owner'");

// Nonprivileged personal navigation preference remains available to provisional staff.
beforeBatchHook = () => sqlite.exec("UPDATE employees SET employment_status='provisional' WHERE id='employee-owner'");
response = await call('/api/navigation/preference', { itemOrder:['printing'] });
check(response.status === 200, 'Provisional self-service navigation preference remains permitted');
sqlite.exec("UPDATE employees SET employment_status='active' WHERE id='employee-owner'");

// Finance journal create/post uses the same active-only live write authority.
// Actual Finance Workerd/D1 demotion cases are verified in the isolated QA receipt.
const financeCode = fs.readFileSync(path.resolve('worker/finance.ts'),'utf8');
const financeGate = financeCode.slice(financeCode.indexOf('const financeJournalWriteGate='),financeCode.indexOf('const cents='));
check(financeGate.includes("actor.employment_status='active'")
  && !financeGate.includes("actor.employment_status IN ('active','provisional')"),
  'Finance Journal at-write grant excludes Provisional employment status');


// Group-wide override revocations must reach the D1 write guard even if a
// request already passed its initial cached role/company permission check.
const overrideGrantSql = {
  path:'/api/navigation/assign',
  body:{companyId:'company-printing',targetType:'role',targetId:'role-worker',
    itemKey:'printing',accessLevel:'edit',reason:'QA group-wide override at-write'},
};
const snapshotOverride = () => ({
  level:scalar("SELECT access_level FROM role_permissions WHERE role_id='role-worker' AND permission_id='p-printing'").access_level,
  changes:scalar("SELECT COUNT(*) n FROM navigation_access_changes").n,
  audits:scalar("SELECT COUNT(*) n FROM audit_logs").n,
});
const sameSnapshot = (a,b) => a.level===b.level && a.changes===b.changes && a.audits===b.audits;
let overrideBefore = snapshotOverride();
beforeBatchHook = () => sqlite.exec(
  "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level) VALUES('qa-group-none','employee-owner',NULL,'p-nav-assign','none')",
);
response = await call(overrideGrantSql.path,overrideGrantSql.body);
check(response.status===409, 'Group-wide V2 NONE revocation denies stale role grant at final write');
check(sameSnapshot(overrideBefore,snapshotOverride()),
  'Group-wide V2 deny rolls back role, change history and audit');
sqlite.exec("DELETE FROM employee_permission_overrides_v2 WHERE id='qa-group-none'");

overrideBefore = snapshotOverride();
beforeBatchHook = () => sqlite.exec(
  "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level) VALUES('qa-group-none','employee-owner',NULL,'p-nav-assign','none');"+
  "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level) VALUES('qa-scoped-manage','employee-owner','company-printing','p-nav-assign','manage')",
);
response = await call(overrideGrantSql.path,overrideGrantSql.body);
check(response.status===409 && sameSnapshot(overrideBefore,snapshotOverride()),
  'Group-wide V2 NONE vetoes a conflicting company-level Manage grant');
sqlite.exec("DELETE FROM employee_permission_overrides_v2 WHERE id IN ('qa-group-none','qa-scoped-manage')");

overrideBefore = snapshotOverride();
beforeBatchHook = () => sqlite.exec(
  "INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level) VALUES('qa-legacy-global-none','employee-owner','company-other','p-nav-assign','none')",
);
response = await call(overrideGrantSql.path,overrideGrantSql.body);
check(response.status===409 && sameSnapshot(overrideBefore,snapshotOverride()),
  'Legacy Group-wide NONE on another company revokes navigation write authority');
sqlite.exec("DELETE FROM employee_permission_overrides WHERE id='qa-legacy-global-none'");

overrideBefore = snapshotOverride();
beforeBatchHook = () => sqlite.exec(
  "UPDATE role_permissions SET access_level='none' WHERE permission_id='p-nav-assign';"+
  "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level) VALUES('qa-global-manage','employee-owner',NULL,'p-nav-assign','manage')",
);
response = await call(overrideGrantSql.path,overrideGrantSql.body);
check(response.status===200, 'Group-wide V2 Manage supports authorized write without live role grant');
check(snapshotOverride().changes===overrideBefore.changes+1 &&
  snapshotOverride().audits===overrideBefore.audits+1,
  'Group-wide V2 grant commits permission and audit atomically');
sqlite.exec("DELETE FROM employee_permission_overrides_v2 WHERE id='qa-global-manage';"+
  "UPDATE role_permissions SET access_level='manage' WHERE permission_id='p-nav-assign'");

overrideBefore = snapshotOverride();
beforeBatchHook = () => sqlite.exec(
  "UPDATE role_permissions SET access_level='none' WHERE permission_id='p-nav-assign';"+
  "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level) VALUES('qa-global-manage','employee-owner',NULL,'p-nav-assign','manage');"+
  "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level) VALUES('qa-scoped-none','employee-owner','company-printing','p-nav-assign','none')",
);
response = await call(overrideGrantSql.path,{...overrideGrantSql.body,accessLevel:'manage'});
check(response.status===409 && sameSnapshot(overrideBefore,snapshotOverride()),
  'Company-specific V2 NONE denies despite Group-wide Manage grant');
sqlite.exec("DELETE FROM employee_permission_overrides_v2 WHERE id IN ('qa-global-manage','qa-scoped-none');"+
  "UPDATE role_permissions SET access_level='manage' WHERE permission_id='p-nav-assign'");
check(financeGate.includes("group_deny.company_id IS NULL") &&
  financeGate.includes("group_deny.access_level='none'") &&
  financeGate.includes("g.company_id IS NULL"),
  'Finance journal at-write SQL checks Group-wide NONE and Group-wide V2 grants');
check(financeGate.includes("ORDER BY CASE WHEN o.access_level='none' THEN 0 ELSE 1 END"),
  'Finance journal at-write SQL honors legacy Group-wide denies');

console.log(`PASS navigation workspace mutation/audit atomicity (${checks} assertions; actual Worker module + disposable SQLite)`);
sqlite.close();
