import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE auth_sessions(id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, token_hash TEXT NOT NULL);
  CREATE TABLE employee_credentials(employee_id TEXT PRIMARY KEY, failed_attempts INTEGER, locked_until TEXT, last_login_at TEXT);
  CREATE TABLE security_logs(id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, company_id TEXT, session_id TEXT NOT NULL, event_type TEXT NOT NULL, result TEXT NOT NULL);
  INSERT INTO employee_credentials(employee_id, failed_attempts) VALUES('employee-a', 3);
`);

function issueSession({ sessionId, tokenHash, failSession = false }) {
  db.exec('BEGIN');
  try {
    if (failSession) throw new Error('injected session insert failure');
    db.prepare('INSERT INTO auth_sessions(id, employee_id, token_hash) VALUES(?, ?, ?)')
      .run(sessionId, 'employee-a', tokenHash);
    db.prepare(`UPDATE employee_credentials SET failed_attempts=0, locked_until=NULL,
      last_login_at=CURRENT_TIMESTAMP WHERE employee_id=?`).run('employee-a');
    db.prepare(`INSERT INTO security_logs(id, employee_id, company_id, session_id, event_type, result)
      VALUES(?, ?, ?, ?, ?, ?)`)
      .run(`audit-${sessionId}`, 'employee-a', 'company-a', sessionId, 'password_signin_whatsapp_stepup_success', 'success');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

issueSession({ sessionId: 'session-success', tokenHash: 'derived-token-hash' });
assert.equal(db.prepare('SELECT token_hash FROM auth_sessions WHERE id=?').get('session-success').token_hash, 'derived-token-hash');
assert.equal(db.prepare('SELECT session_id FROM security_logs WHERE id=?').get('audit-session-success').session_id, 'session-success');
console.log('PASS: successful session and success audit persist together with the derived token hash');

db.exec(`CREATE TRIGGER reject_success_audit BEFORE INSERT ON security_logs
  WHEN NEW.event_type='password_signin_whatsapp_stepup_success'
  BEGIN SELECT RAISE(ABORT, 'injected audit insert failure'); END;`);
assert.throws(() => issueSession({ sessionId: 'session-audit-failure', tokenHash: 'must-not-survive' }), /injected audit insert failure/);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE id=?').get('session-audit-failure').count, 0);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM security_logs WHERE id=?').get('audit-session-audit-failure').count, 0);
console.log('PASS: required audit failure rolls back session creation');

assert.throws(() => issueSession({ sessionId: 'session-write-failure', tokenHash: 'must-not-survive', failSession: true }), /injected session insert failure/);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions WHERE id=?').get('session-write-failure').count, 0);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM security_logs WHERE id=?').get('audit-session-write-failure').count, 0);
console.log('PASS: session persistence failure creates no success audit');

db.close();
console.log('3/3 PASS');
