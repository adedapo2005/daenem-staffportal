import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
let checks = 0;
function check(label, fn) {
  fn();
  checks++;
  console.log(`PASS ${label}`);
}

try {
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE companies(id TEXT PRIMARY KEY);
    CREATE TABLE employees(id TEXT PRIMARY KEY);
    CREATE TABLE permissions(
      id TEXT PRIMARY KEY, code TEXT, module TEXT, action TEXT,
      description TEXT, sensitive INTEGER
    );
    INSERT INTO companies(id) VALUES('test-company');
    INSERT INTO employees(id) VALUES('test-employee');
  `);

  const foundation = read('migrations/0076_incident_response_foundation.sql');
  const successor = read('migrations/0091_incident_response_foundation.sql');
  db.exec(foundation);
  const canonicalSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='safety_incidents'",
  ).get().sql;
  db.exec(successor);

  check('0091 preserves the already established 0076 incident schema', () => {
    const current = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='safety_incidents'",
    ).get().sql;
    assert.equal(current, canonicalSchema);
    assert.match(current, /reporter_employee_id/);
    assert.doesNotMatch(current, /incident_no/);
  });

  const handler = read('worker/incident-response.ts');
  const appEntry = read('worker/app-entry.ts');
  const workerEntry = read('worker/index.ts');
  check('both effective routes use the canonical incident-response handler', () => {
    assert.match(appEntry, /import \{ routeIncidentResponse \} from '\.\/incident-response'/);
    assert.match(appEntry, /routeIncidentResponse\(request, env, context, ctx\)/);
    assert.match(workerEntry, /routeIncidentResponse\(request, env, context, _ctx\)/);
    assert.doesNotMatch(appEntry + workerEntry, /routeIncidents/);
    assert.doesNotMatch(handler, /incident_no|created_by|safety_incident_locations|location_state/);
  });

  const createSql = handler.match(/env\.DB\.prepare\(`(INSERT INTO safety_incidents[\s\S]*?)`\)\.bind/);
  assert.ok(createSql, 'canonical incident create SQL is present');
  const insert = db.prepare(createSql[1]);
  check('canonical incident creation SQL compiles after both migrations', () => {
    assert.equal(insert.columns().length, 0);
  });

  const insertResult = insert.run(
    'incident-1', 'operation-1', 'test-company', 'test-employee', 'safety',
    'unavailable', null, null, null, null, null, null, 'Test incident',
  );
  check('location-unavailable incident creation remains valid and company scoped', () => {
    assert.equal(insertResult.changes, 1);
    assert.deepEqual(
      { ...db.prepare('SELECT company_id,status,location_status FROM safety_incidents WHERE id=?').get('incident-1') },
      { company_id: 'test-company', status: 'open', location_status: 'unavailable' },
    );
  });

  check('the established status constraint rejects the competing active state', () => {
    assert.throws(() => db.prepare(
      `INSERT INTO safety_incidents(id,operation_id,company_id,reporter_employee_id,incident_type,status)
       VALUES('incident-2','operation-2','test-company','test-employee','safety','active')`,
    ).run(), /CHECK constraint failed/);
  });

  check('0091 permission rows coexist with the canonical incident tables', () => {
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS n FROM permissions WHERE code IN ('incidents.access','incidents.location')",
    ).get().n, 2);
    assert.ok(db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='safety_incident_location_events'",
    ).get());
    assert.equal(db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('safety_incident_locations')",
    ).get().n, 0);
    const canonical = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='safety_incidents'",
    ).get().sql;
    assert.match(canonical, /reporter_employee_id/);
    assert.match(canonical, /location_status/);
    assert.doesNotMatch(canonical, /incident_no|created_by|location_state/);
  });

  console.log(`SCOPE=isolated in-memory SQLite; no Wrangler, D1, provider, or production access`);
  console.log(`ACCEPTED=${checks}/6`);
} finally {
  db.close();
}
