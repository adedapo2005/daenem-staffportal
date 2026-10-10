import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../migrations/0022_finance_ledger.sql', import.meta.url), 'utf8');
const invariant = readFileSync(new URL('../migrations/0098_finance_fiscal_period_no_overlap.sql', import.meta.url), 'utf8');
const start = migration.indexOf('CREATE TABLE IF NOT EXISTS fiscal_periods (');
const end = migration.indexOf('CREATE INDEX IF NOT EXISTS idx_fiscal_period_company', start);
assert.ok(start >= 0 && end > start, 'committed fiscal-period table definition exists');

const db = new DatabaseSync(':memory:');
try {
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE companies(id TEXT PRIMARY KEY); CREATE TABLE employees(id TEXT PRIMARY KEY);');
  db.exec(migration.slice(start, end));
  db.exec(invariant);
  db.exec("INSERT INTO companies(id) VALUES('company-a'),('company-b')");
  const insert = db.prepare("INSERT INTO fiscal_periods(id,company_id,name,start_date,end_date,status) VALUES(?,?,?,?,?,'open')");
  const attempt = (operation) => { try { operation(); return 'accepted'; } catch { return 'rejected'; } };

  insert.run('primary', 'company-a', 'October', '2026-10-01', '2026-10-31');
  assert.equal(attempt(() => insert.run('overlap', 'company-a', 'Overlap', '2026-10-15', '2026-11-15')), 'rejected', 'overlapping range is rejected');
  assert.equal(attempt(() => insert.run('duplicate', 'company-a', 'Duplicate', '2026-10-01', '2026-10-31')), 'rejected', 'identical range remains rejected');
  assert.equal(attempt(() => insert.run('adjacent', 'company-a', 'November', '2026-11-01', '2026-11-30')), 'accepted', 'adjacent range is allowed');
  assert.equal(attempt(() => insert.run('other-company', 'company-b', 'Other', '2026-10-15', '2026-11-15')), 'accepted', 'another company may use an overlapping range');

  const update = db.prepare('UPDATE fiscal_periods SET start_date=?,end_date=? WHERE id=?');
  assert.equal(attempt(() => update.run('2026-10-20', '2026-11-20', 'adjacent')), 'rejected', 'an update cannot move a period into overlap');
  assert.equal(attempt(() => update.run('2026-11-01', '2026-11-30', 'adjacent')), 'accepted', 'a non-overlapping update remains allowed');
  console.log('PASS: Finance fiscal-period overlap invariant (6 assertions)');
} finally {
  db.close();
}
