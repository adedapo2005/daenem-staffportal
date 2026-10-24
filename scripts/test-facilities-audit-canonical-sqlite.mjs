import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { recentFacilitiesAudit } from '../worker/facility-audit-feed.ts';

// Run the real Facilities audit SELECT against tables extracted directly from
// the canonical Cloudflare D1 migration. A mocked prepare() cannot catch
// nonexistent columns such as employees.company_id (the prior Worker 1101).
const migration = readFileSync(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8');
function tableSql(name) {
  const anchor = 'CREATE TABLE IF NOT EXISTS ' + name + ' (';
  const start = migration.indexOf(anchor);
  assert.ok(start !== -1, 'canonical D1 table missing: ' + name);
  const end = migration.indexOf('\n);', start);
  assert.ok(end !== -1, 'canonical D1 table incomplete: ' + name);
  return migration.slice(start, end + 3);
}

const sqlite = new DatabaseSync(':memory:');
let cases = 0;
const equal = (actual, expected, description) => {
  assert.deepEqual(actual, expected, description);
  cases += 1;
};
const okay = (value, description) => {
  assert.ok(value, description);
  cases += 1;
};
try {
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of ['companies', 'company_locations', 'employees', 'employee_company_memberships', 'audit_logs']) {
    sqlite.exec(tableSql(name));
  }
  const employeeColumns = sqlite.prepare('PRAGMA table_info(employees)').all().map(row => row.name);
  equal(employeeColumns.includes('company_id'), false, 'employees are not themselves company-scoped');
  const memberships = sqlite.prepare('PRAGMA table_info(employee_company_memberships)').all().map(row => row.name);
  okay(memberships.includes('company_id') && memberships.includes('active'), 'company membership schema exists');

  const insertCompany = sqlite.prepare('INSERT INTO companies(id,code,name,business_type) VALUES(?,?,?,?)');
  insertCompany.run('company-printing', 'TEST-PR', 'Synthetic Company Printing', 'printing');
  insertCompany.run('company-autos', 'TEST-AU', 'Synthetic Company Autos', 'autos');
  sqlite.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)').run('employee-a', 'Staff A');
  sqlite.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)').run('employee-b', 'Staff B');
  sqlite.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)').run('employee-c', 'Staff C');
  const insertMember = sqlite.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES(?,?,?,?)');
  insertMember.run('member-a', 'employee-a', 'company-printing', 1);
  insertMember.run('member-b', 'employee-b', 'company-autos', 1);
  insertMember.run('member-c', 'employee-c', 'company-printing', 0);

  const readingId = 'asset-reading-123e4567-e89b-42d3-a456-426614174000';
  const insertAudit = sqlite.prepare(
    'INSERT INTO audit_logs(id,occurred_at,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json) VALUES(?,?,?,?,?,?,?,?,?)',
  );
  insertAudit.run('audit-one', '2026-10-24 00:01:00', 'employee-a', 'company-printing', 'facilities', 'create', 'facility', 'facility-one', '{}');
  insertAudit.run('audit-reading', '2026-10-24 00:05:00', 'employee-a', 'company-printing', 'facilities', 'record_reading', 'asset', 'asset-one', JSON.stringify({ readingId, privateNotes: 'never expose' }));
  insertAudit.run('audit-foreign-actor', '2026-10-24 00:03:00', 'employee-b', 'company-printing', 'facilities', 'create', 'asset', 'asset-two', '{}');
  insertAudit.run('audit-revoked-actor', '2026-10-24 00:04:00', 'employee-c', 'company-printing', 'facilities', 'create', 'asset', 'asset-three', '{}');
  insertAudit.run('audit-payroll', '2026-10-24 00:06:00', 'employee-a', 'company-printing', 'payroll', 'create', 'payroll_run', 'run-one', '{}');
  insertAudit.run('audit-autos', '2026-10-24 00:06:00', 'employee-b', 'company-autos', 'facilities', 'create', 'facility', 'autos-one', '{}');

  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...args) }; },
          };
        },
      };
    },
  };

  const printing = await recentFacilitiesAudit(DB, 'company-printing');
  equal(printing.length, 4, 'only company Printing facilities events returned');
  equal(printing.map(row => row.id), ['audit-reading','audit-revoked-actor','audit-foreign-actor','audit-one'], 'deterministic actual SQL ordering');
  equal(printing[0].readingId, readingId, 'actual persisted reading reference correlates to audit');
  equal(printing[0].actorName, 'Staff A', 'active authorised company actor attributed');
  equal(printing[1].actorName, 'Staff Member', 'revoked actor not disclosed');
  equal(printing[2].actorName, 'Staff Member', 'foreign-company actor not disclosed');
  equal(printing[3].actorName, 'Staff A', 'company-local creator attributed');
  okay(!JSON.stringify(printing).includes('never expose'), 'raw D1 audit metadata not disclosed');
  okay(!printing.some(row => row.id === 'audit-payroll'), 'foreign audit module excluded');
  okay(!printing.some(row => row.id === 'audit-autos'), 'foreign company audit excluded');
  const autos = await recentFacilitiesAudit(DB, 'company-autos');
  equal(autos.map(row => row.id), ['audit-autos'], 'second company sees only own activity');
  equal(autos[0].actorName, 'Staff B', 'other company actor resolved only in own scope');
  equal(await recentFacilitiesAudit(DB, 'company-unknown'), [], 'no records for unassigned company ID');
  equal(await recentFacilitiesAudit(DB, ''), [], 'missing company fails closed');
  equal(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n, 6, 'read-only audit query did not modify records');

  console.log('Facilities canonical D1 schema and audit SQL passed (' + cases + ' checks).');
} finally {
  sqlite.close();
}
