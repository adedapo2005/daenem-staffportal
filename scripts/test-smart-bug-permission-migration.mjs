import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const migration = await readFile(new URL('../migrations/0095_smart_bug_granular_permissions.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE roles(id TEXT PRIMARY KEY);
  CREATE TABLE permissions(
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, module TEXT NOT NULL,
    action TEXT NOT NULL, description TEXT NOT NULL, sensitive INTEGER NOT NULL
  );
  CREATE TABLE role_permissions(
    id TEXT PRIMARY KEY, role_id TEXT NOT NULL, permission_id TEXT NOT NULL, access_level TEXT NOT NULL
  );
  INSERT INTO roles(id) VALUES ('role-owner'), ('role-group-admin');
`);
db.exec(migration);

const permissions = db.prepare('SELECT code FROM permissions ORDER BY code').all().map((row) => row.code);
assert.deepEqual(permissions, [
  'smart_bug.cross_company', 'smart_bug.detectors', 'smart_bug.diagnostics',
  'smart_bug.incidents', 'smart_bug.integrity',
]);
const ownerGrants = db.prepare(`SELECT p.code,rp.access_level AS level FROM role_permissions rp
  JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id='role-owner' ORDER BY p.code`).all();
assert.equal(ownerGrants.length, 5);
assert.ok(ownerGrants.every((grant) => grant.level === 'manage'));
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM role_permissions WHERE role_id='role-group-admin'").get().count, 0);
console.log('PASS 3 isolated SQLite Smart Bug permission migration assertions');
db.close();
