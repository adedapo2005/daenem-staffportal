import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const source = readFileSync(new URL('../worker/auth-context-v2.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8');
const overridesMigration = readFileSync(new URL('../migrations/0019_employee_permission_overrides_v2.sql', import.meta.url), 'utf8');
const roleQuery = source.match(/const roleRows = await env\.DB\.prepare\(`([\s\S]*?)`\)/)?.[1];
const overrideQuery = source.match(/const overrides = await env\.DB\.prepare\(`([\s\S]*?)`\)/)?.[1];
assert.ok(roleQuery, 'actual enhanced role query must be extractable');
assert.ok(overrideQuery, 'actual permission override query must be extractable');
assert.match(source, /for \(const \[companyId, permissions\] of Object\.entries\(companyPermissions\)\)/, 'override projection must iterate only current base companies');
assert.match(source, /applyPermissionOverrides\(companyPermissions, overrides\.results \|\| \[\]\)/, 'enhanced session must use the tested override projection');

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const authContextModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: authContextModule,
  exports: authContextModule.exports,
  require: () => ({ getSessionContext: async () => null }),
}, { filename: 'worker/auth-context-v2.ts' });
const applyPermissionOverrides = authContextModule.exports.applyPermissionOverrides;
assert.equal(typeof applyPermissionOverrides, 'function', 'production override projection is testable');

function ddl(sql, name) {
  const found = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\s*\\([\\s\\S]*?\\);`, 'i'));
  assert.ok(found, `migration DDL for ${name} must exist`);
  return found[0];
}

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const name of ['companies', 'company_locations', 'employees', 'employee_company_memberships', 'roles', 'employee_roles', 'permissions', 'role_permissions']) {
  db.exec(ddl(core, name));
}
db.exec(ddl(overridesMigration, 'employee_permission_overrides_v2'));

const run = (sql, values = []) => db.prepare(sql).run(...values);
const addCompany = (id, active = 1) => run('INSERT INTO companies(id,code,name,business_type,active) VALUES(?,?,?,?,?)', [id, id, id, 'other', active]);
const addMembership = (id, company, active = 1) => run('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,?)', [id, 'actor', company, active]);
const addRole = (id, company, code = `role-${id}`, active = 1) => run('INSERT INTO roles(id,company_id,code,name,active) VALUES(?,?,?,?,?)', [id, company, code, code, active]);
const addRoleGrant = (role, company, permission = 'protected.access', level = 'manage') => {
  run('INSERT OR IGNORE INTO permissions(id,code,module,action) VALUES(?,?,?,?)', [`permission-${permission}`, permission, 'test', 'access']);
  run('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)', [`grant-${role}`, role, `permission-${permission}`, level]);
  run('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)', [`assignment-${role}`, 'actor', company, role]);
};
const addOverride = (id, company, permission, level) => {
  run('INSERT OR IGNORE INTO permissions(id,code,module,action) VALUES(?,?,?,?)', [`permission-${permission}`, permission, 'test', 'access']);
  run('INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES(?,?,?,?,?,?,?)', [id, 'actor', company, `permission-${permission}`, level, 'fixture', 'actor']);
};

try {
  run('INSERT INTO employees(id,display_name) VALUES(?,?)', ['actor', 'Synthetic actor']);
  addCompany('company-a'); addCompany('company-b'); addCompany('company-c');
  addMembership('membership-a', 'company-a'); addMembership('membership-b', 'company-b');
  addRole('role-a', 'company-a'); addRoleGrant('role-a', 'company-a');
  const roleRows = () => db.prepare(roleQuery).all('actor');
  const overrideRows = () => db.prepare(overrideQuery).all('actor');

  assert.deepEqual(roleRows().map(row => [row.companyId, row.code]), [['company-a', 'protected.access']], 'active scoped role is included');
  console.log('PASS active company role');
  run('UPDATE roles SET active=0 WHERE id=?', ['role-a']);
  assert.deepEqual(roleRows(), [], 'inactive role is not projected');
  run('UPDATE roles SET active=1 WHERE id=?', ['role-a']);
  console.log('PASS inactive role denied');

  run('UPDATE employee_company_memberships SET active=0 WHERE id=?', ['membership-a']);
  assert.deepEqual(roleRows(), [], 'revoked membership removes role projection');
  console.log('PASS revoked membership removes role');
  addOverride('scoped-revoked', 'company-a', 'override.access', 'manage');
  assert.deepEqual(overrideRows(), [], 'revoked membership removes scoped override');
  console.log('PASS revoked membership removes scoped override');

  run('UPDATE employee_company_memberships SET active=1 WHERE id=?', ['membership-a']);
  assert.equal(overrideRows().some(row => row.companyId === 'company-a' && row.code === 'override.access'), true, 'authorized scoped override remains');
  console.log('PASS authorized scoped override');

  run('UPDATE companies SET active=0 WHERE id=?', ['company-a']);
  assert.deepEqual(roleRows(), [], 'inactive company removes role projection');
  assert.deepEqual(overrideRows(), [], 'inactive company removes scoped override');
  console.log('PASS inactive company removes scoped role and override');

  run('UPDATE companies SET active=1 WHERE id=?', ['company-a']);
  addRole('role-mismatch', 'company-b', 'mismatched.access');
  addRoleGrant('role-mismatch', 'company-a', 'mismatched.access');
  assert.equal(roleRows().some(row => row.code === 'mismatched.access'), false, 'role company must align with assignment company');
  console.log('PASS mismatched role company denied');

  addOverride('global-owner', null, 'owner.control', 'manage');
  const globalRows = overrideRows().filter(row => row.companyId == null);
  assert.equal(globalRows.length, 1, 'global Owner override remains available');
  const allowedCompanies = { 'company-a': {}, 'company-b': {} };
  for (const row of globalRows) for (const companyId of Object.keys(allowedCompanies)) allowedCompanies[companyId][row.code] = row.accessLevel;
  assert.equal(allowedCompanies['company-a']['owner.control'], 'manage');
  assert.equal(allowedCompanies['company-b']['owner.control'], 'manage');
  assert.equal(Object.hasOwn(allowedCompanies, 'company-c'), false, 'global override does not synthesize an unauthorized company');
  console.log('PASS global override remains limited to base companies');

  addOverride('global-deny', null, 'deny.access', 'none');
  addOverride('scoped-grant-over-global-deny', 'company-a', 'deny.access', 'manage');
  addOverride('global-grant', null, 'precedence.access', 'manage');
  addOverride('scoped-deny-over-global-grant', 'company-a', 'precedence.access', 'none');
  addOverride('global-positive-manage', null, 'duplicate-global.access', 'manage');
  addOverride('global-positive-view', null, 'duplicate-global.access', 'view');
  const precedenceRows = overrideRows();
  const firstOrder = applyPermissionOverrides({ 'company-a': {}, 'company-b': {} }, precedenceRows);
  const reverseOrder = applyPermissionOverrides({ 'company-a': {}, 'company-b': {} }, precedenceRows.slice().reverse());
  assert.equal(firstOrder['company-a']['deny.access'], 'none', 'global explicit deny overrides scoped grant');
  assert.equal(firstOrder['company-b']['deny.access'], 'none', 'global explicit deny applies to each authorized company');
  assert.equal(firstOrder['company-a']['precedence.access'], 'none', 'scoped explicit deny overrides global grant');
  assert.equal(firstOrder['company-b']['precedence.access'], 'manage', 'global grant applies to another authorized company');
  assert.equal(firstOrder['company-a']['duplicate-global.access'], 'view', 'duplicate global grants resolve to least privilege');
  assert.deepEqual(JSON.parse(JSON.stringify(reverseOrder)), JSON.parse(JSON.stringify(firstOrder)), 'override order cannot change effective permissions');
  assert.equal(Object.hasOwn(firstOrder, 'company-c'), false, 'overrides cannot create a company outside the session');
  console.log('PASS deterministic deny-wins override composition');

  console.log('AUTH_CONTEXT_V2_COMPANY_SCOPE=9/9 PASS');
} finally {
  db.close();
}
