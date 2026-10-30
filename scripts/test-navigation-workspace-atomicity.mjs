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
  CREATE TABLE roles(id TEXT PRIMARY KEY,code TEXT NOT NULL,company_id TEXT,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE role_permissions(id TEXT PRIMARY KEY,role_id TEXT NOT NULL,permission_id TEXT NOT NULL,access_level TEXT NOT NULL,UNIQUE(role_id,permission_id));
  CREATE TABLE employees(id TEXT PRIMARY KEY,employment_status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE employee_company_memberships(employee_id TEXT,company_id TEXT,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(employee_id,company_id));
  CREATE TABLE employee_roles(employee_id TEXT,company_id TEXT,role_id TEXT);
  CREATE TABLE employee_permission_overrides_v2(id TEXT PRIMARY KEY,employee_id TEXT,company_id TEXT,permission_id TEXT,access_level TEXT,reason TEXT,assigned_by TEXT,expires_at TEXT,UNIQUE(employee_id,company_id,permission_id));
  CREATE TABLE employee_permission_overrides(id TEXT PRIMARY KEY,employee_id TEXT,company_id TEXT,permission_id TEXT,access_level TEXT,reason TEXT,granted_by TEXT,expires_at TEXT);
  CREATE TABLE navigation_access_changes(id TEXT PRIMARY KEY,company_id TEXT,target_type TEXT,target_id TEXT,item_key TEXT,permission_code TEXT,old_access_level TEXT,new_access_level TEXT,reason TEXT,changed_by TEXT);
  CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,before_json TEXT,after_json TEXT,source TEXT);
  CREATE TABLE employee_navigation_preferences(employee_id TEXT PRIMARY KEY,style_id TEXT,group_order_json TEXT,item_order_json TEXT,pinned_items_json TEXT,updated_by TEXT,updated_at TEXT);
  CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT,value_type TEXT,updated_at TEXT);
  INSERT INTO permissions VALUES('p-printing','printing.access');
  INSERT INTO roles VALUES('role-worker','staff','company-printing',1);
  INSERT INTO employees VALUES('employee-owner','active'),('employee-target','active');
  INSERT INTO employee_company_memberships VALUES('employee-target','company-printing',1);
  INSERT INTO role_permissions VALUES('rp-initial','role-worker','p-printing','view');
  INSERT INTO employee_permission_overrides_v2 VALUES('override-v2','employee-target','company-printing','p-printing','view','initial','employee-owner',NULL);
  INSERT INTO employee_permission_overrides VALUES('override-v1','employee-target','company-printing','p-printing','view','initial','employee-owner',NULL);
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

const DB = {
  prepare: statement,
  async batch(statements) {
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

console.log(`PASS navigation workspace mutation/audit atomicity (${checks} assertions; actual Worker module + disposable SQLite)`);
sqlite.close();
