import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const auth = readFileSync(new URL('../worker/auth.ts', import.meta.url), 'utf8');
const core = readFileSync(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8');
const query = auth.match(/const rolesResult = await env\.DB\.prepare\(`([\s\S]*?)`\)/)?.[1];
assert.ok(query, 'session role projection query must be extractable from auth.ts');
assert.ok(auth.includes("roles: (rolesResult.results || []).map"), 'session response must project the tested role rows');

function ddl(name) {
  const found = core.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\s*\\([\\s\\S]*?\\);`, 'i'));
  assert.ok(found, `actual 0001 migration DDL for ${name} must exist`);
  return found[0];
}

function database({ membershipActive = 1, companyActive = 1, roleCompany = 'company-a', code = 'payroll-manager' } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(ddl('companies'));
  db.exec(ddl('company_locations'));
  db.exec(ddl('employees'));
  db.exec(ddl('employee_company_memberships'));
  db.exec(ddl('roles'));
  db.exec(ddl('employee_roles'));
  db.prepare('INSERT INTO companies(id,code,name,business_type,active) VALUES(?,?,?,?,?)')
    .run('company-a', 'A', 'Synthetic A', 'other', companyActive);
  db.prepare('INSERT INTO companies(id,code,name,business_type,active) VALUES(?,?,?,?,1)')
    .run('company-b', 'B', 'Synthetic B', 'other');
  db.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)').run('actor-a', 'Synthetic actor');
  db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,?)')
    .run('membership-a', 'actor-a', 'company-a', membershipActive);
  db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,1)')
    .run('membership-b', 'actor-a', 'company-b');
  db.prepare('INSERT INTO roles(id,company_id,code,name,active) VALUES(?,?,?,?,1)')
    .run('role-a', roleCompany, code, 'Synthetic role');
  db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)')
    .run('assignment-a', 'actor-a', 'company-a', 'role-a');
  return db;
}

function roles(db) {
  return db.prepare(query).all('actor-a', 'active');
}

const cases = [
  ['active company role remains visible', {}, [{ code: 'payroll-manager', companyId: 'company-a' }]],
  ['revoked company membership hides its role', { membershipActive: 0 }, []],
  ['inactive company hides its role', { companyActive: 0 }, []],
  ['role assigned to another company is hidden', { roleCompany: 'company-b' }, []],
  ['company-scoped Owner role remains excluded', { code: 'owner' }, []],
  ['global Owner with active company membership remains visible', { roleCompany: null, code: 'owner' }, [{ code: 'owner', companyId: 'company-a' }]],
  ['revoked company membership hides global Owner assignment', { membershipActive: 0, roleCompany: null, code: 'owner' }, []],
  ['inactive company hides global Owner assignment', { companyActive: 0, roleCompany: null, code: 'owner' }, []],
];

let passed = 0;
for (const [name, options, expected] of cases) {
  const db = database(options);
  try {
    const actual = roles(db).map(row => ({ code: row.code, companyId: row.companyId }));
    assert.deepEqual(actual, expected, name);
    console.log(`PASS ${name}`);
    passed++;
  } finally {
    db.close();
  }
}

console.log(`AUTH_SESSION_ROLE_PROJECTION=${passed}/${cases.length} PASS`);
