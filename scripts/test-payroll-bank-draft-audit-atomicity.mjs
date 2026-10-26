import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/payroll-bank-draft.ts', import.meta.url), 'utf8');
const assertion = source.match(/SELECT CASE WHEN changes\(\)=1 THEN 1 ELSE json_extract\('audit insert was suppressed', '\$'\) END AS audit_required/);
assert.ok(assertion, 'payment draft batch must fail if its audit insert makes no row');

function runBatch({ suppressAudit }) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE drafts(id TEXT PRIMARY KEY); CREATE TABLE audits(id TEXT PRIMARY KEY);');
  if (suppressAudit) db.exec(`CREATE TRIGGER suppress_audit BEFORE INSERT ON audits BEGIN SELECT RAISE(IGNORE); END;`);
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO drafts(id) VALUES(?)').run('batch-1');
    db.prepare('INSERT INTO audits(id) VALUES(?)').run('audit-1');
    db.prepare(assertion[0]).get();
    db.exec('COMMIT');
    return { committed: true, drafts: db.prepare('SELECT count(*) AS n FROM drafts').get().n };
  } catch (error) {
    db.exec('ROLLBACK');
    return { committed: false, drafts: db.prepare('SELECT count(*) AS n FROM drafts').get().n, error };
  } finally {
    db.close();
  }
}

const complete = runBatch({ suppressAudit: false });
assert.deepEqual({ committed: complete.committed, drafts: complete.drafts }, { committed: true, drafts: 1 }, 'a recorded audit permits the draft transaction to commit');

const suppressed = runBatch({ suppressAudit: true });
assert.equal(suppressed.committed, false, 'a silently suppressed audit aborts the batch');
assert.equal(suppressed.drafts, 0, 'the batch draft rolls back with the missing audit');
assert.match(String(suppressed.error), /malformed JSON/i, 'the in-transaction assertion raises when the preceding audit insert changed no row');

console.log('PASS: payroll payment draft audit suppression aborts and rolls back the batch transaction');
