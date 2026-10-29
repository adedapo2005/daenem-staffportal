import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../worker/employee-self-service.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
runInNewContext(js, {
  exports,
  require(id) {
    assert.equal(id, './auth');
    return { hasPermission(context, permission, level, companyId) {
      return context.permissions?.[`${permission}:${level}:${companyId}`] === true;
    } };
  },
  crypto: webcrypto, URL, Request, Response, Date, Intl, JSON, Promise, Set, Math, Number, String, RegExp,
});

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=OFF');
for (const path of ['../migrations/0001_core.sql', '../migrations/0002_identity_auth.sql', '../migrations/0018_access_control_admin.sql', '../migrations/0019_employee_permission_overrides_v2.sql', '../migrations/0021_employee_self_service.sql', '../migrations/0092_central_audit_immutability.sql']) {
  let migration = readFileSync(new URL(path, import.meta.url), 'utf8');
  if (path.includes('0002_') || path.includes('0018_') || path.includes('0021_')) migration = migration.replace(/PRAGMA foreign_keys\s*=\s*ON\s*;/gi, 'PRAGMA foreign_keys = OFF;');
  sqlite.exec(migration);
}
sqlite.exec('PRAGMA foreign_keys=ON');
sqlite.exec(`
  INSERT INTO companies(id,code,name,business_type) VALUES('company-a','A','Company A','general');
  INSERT INTO employees(id,employee_no,display_name,employment_status) VALUES
    ('employee-a','A1','Employee A','active'),('employee-b','B1','Employee B','active'),('employee-inactive','I1','Inactive','inactive');
  INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES
    ('membership-a','employee-a','company-a',1),('membership-b','employee-b','company-a',1);
  INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES
    ('session-a','employee-a','synthetic-session-a','2099-01-01 00:00:00'),
    ('session-revoked','employee-a','synthetic-session-revoked','2099-01-01 00:00:00');
  INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by)
    VALUES('review-grant','employee-a','company-a','perm-reviews','view','synthetic test grant','employee-b');
  INSERT INTO employee_notifications(id,employee_id,company_id,title,body,requires_ack,expires_at) VALUES
    ('notice-required','employee-a','company-a','Required','Synthetic notice',1,NULL),
    ('notice-optional','employee-a','company-a','Optional','Synthetic notice',0,NULL),
    ('notice-expired','employee-a','company-a','Expired','Synthetic notice',1,'2000-01-01 00:00:00'),
    ('notice-foreign','employee-b','company-a','Foreign','Synthetic notice',1,NULL);
  INSERT INTO broadcasts(id,created_by,company_id,broadcast_type,title,body,audience_type,acknowledgement_required,approval_status,published_at)
    VALUES('broadcast-published','employee-a','company-a','notice','Published','Synthetic broadcast','company',1,'published',CURRENT_TIMESTAMP),
          ('broadcast-draft','employee-a','company-a','notice','Draft','Synthetic broadcast','company',1,'draft',NULL);
  INSERT INTO broadcast_recipients(id,broadcast_id,employee_id) VALUES
    ('recipient-published','broadcast-published','employee-a'),('recipient-draft','broadcast-draft','employee-a');
  INSERT INTO employee_reviews(id,employee_id,company_id,review_period_start,review_period_end,status)
    VALUES('review-shared','employee-a','company-a','2026-01-01','2026-06-30','shared'),
    ('review-foreign','employee-b','company-a','2026-01-01','2026-06-30','shared'),
    ('review-revoked-grant','employee-a','company-a','2026-01-01','2026-06-30','shared'),
    ('review-revoked-session','employee-a','company-a','2026-01-01','2026-06-30','shared'),
    ('review-race','employee-a','company-a','2026-01-01','2026-06-30','shared');
  INSERT INTO employee_notifications(id,employee_id,company_id,title,body,requires_ack)
    VALUES('notice-revoked-session','employee-a','company-a','Revoked session','Synthetic notice',1),
          ('notice-race','employee-a','company-a','Concurrent acknowledgement','Synthetic notice',1);
`);

const unwrap = statement => {
  let values = [];
  const prepared = sqlite.prepare(statement);
  return {
    bind(...args) { values = args; return this; },
    async first() { return prepared.get(...values) ?? null; },
    async all() { return { results: prepared.all(...values) }; },
    async run() { const result = prepared.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    execute() { return prepared.run(...values); },
  };
};
const db = {
  prepare: unwrap,
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement => {
        const result = statement.execute();
        return { success: true, meta: { changes: Number(result.changes) } };
      });
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};
const context = {
  sessionId: 'session-a',
  employee: { id: 'employee-a', department: 'Operations' },
  companies: [{ id: 'company-a' }],
  roles: [],
  permissions: { 'reviews.access:view:company-a': true },
};
const call = async (path, body, actor = context) => exports.routeEmployeeSelfService(new Request(`https://worker.test${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}), { DB: db }, actor);
const listNotifications = async (actor = context) => exports.routeEmployeeSelfService(new Request('https://worker.test/api/ess/notifications'), { DB: db }, actor);
const countAudit = (entityType, entityId) => Number(sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type=? AND entity_id=?').get(entityType, entityId).n);

let listing = await listNotifications();
assert.equal(listing.status, 200, 'assigned recipient can list notifications using the real broadcast schema');
let listed = await listing.json();
assert.deepEqual(listed.notifications.map(item => item.id).sort(), ['notice-optional', 'notice-race', 'notice-required', 'notice-revoked-session']);
assert.deepEqual(listed.broadcasts.map(item => item.recipientId), ['recipient-published'], 'draft broadcast remains private');
assert.equal(listed.broadcasts[0].category, 'notice');
assert.equal(listed.broadcasts[0].severity, 'info');
assert.equal(listed.broadcasts[0].requiresAck, 1);

let response = await call('/api/ess/notifications/action', { id: 'notice-required', acknowledge: true });
assert.equal(response.status, 200, 'required own notification can be acknowledged');
assert.equal(sqlite.prepare("SELECT acknowledged_at IS NOT NULL AS ok FROM employee_notifications WHERE id='notice-required'").get().ok, 1);
assert.equal(countAudit('employee_notification', 'notice-required'), 1, 'notification transition has immutable audit evidence');

for (const [id, acknowledge, status] of [
  ['notice-optional', true, 409], ['notice-expired', true, 409], ['notice-foreign', true, 409], ['missing-notice', false, 409],
]) {
  response = await call('/api/ess/notifications/action', { id, acknowledge });
  assert.equal(response.status, status, `${id} cannot produce false success`);
  assert.equal(countAudit('employee_notification', id), 0, `${id} denial adds no success audit`);
}
response = await call('/api/ess/notifications/action', { id: 'notice-required', acknowledge: true });
assert.equal(response.status, 409, 'duplicate acknowledgement is not reported as a new transition');
assert.equal(countAudit('employee_notification', 'notice-required'), 1, 'duplicate acknowledgement adds no audit event');

const notificationRace = await Promise.all([
  call('/api/ess/notifications/action', { id: 'notice-race', acknowledge: true }),
  call('/api/ess/notifications/action', { id: 'notice-race', acknowledge: true }),
]);
assert.deepEqual(notificationRace.map(item => item.status).sort(), [200, 409], 'concurrent notification retries have one winner');
assert.equal(countAudit('employee_notification', 'notice-race'), 1, 'concurrent notification retry records one audit event');

response = await call('/api/ess/notifications/action', { id: 'recipient-published', kind: 'broadcast', acknowledge: true });
assert.equal(response.status, 200, 'assigned recipient can acknowledge published broadcast without broadcasts.admin permission');
assert.equal(sqlite.prepare("SELECT acknowledged_at IS NOT NULL AS ok FROM broadcast_recipients WHERE id='recipient-published'").get().ok, 1);
assert.equal(countAudit('broadcast_recipient', 'recipient-published'), 1);
response = await call('/api/ess/notifications/action', { id: 'recipient-draft', kind: 'broadcast', acknowledge: true });
assert.equal(response.status, 409, 'unpublished broadcast cannot be acknowledged');

response = await call('/api/ess/reviews/acknowledge', { id: 'review-shared', employeeComments: 'Received and reviewed.' });
assert.equal(response.status, 200, 'employee can acknowledge own shared review');
assert.equal(countAudit('employee_review', 'review-shared'), 1, 'review receipt has immutable audit evidence');
response = await call('/api/ess/reviews/acknowledge', { id: 'review-foreign', employeeComments: '' });
assert.equal(response.status, 409, 'employee cannot acknowledge another employee review');
response = await call('/api/ess/reviews/acknowledge', { id: 'review-shared', employeeComments: 'repeat' });
assert.equal(response.status, 409, 'review acknowledgement cannot be replayed as success');
response = await call('/api/ess/reviews/acknowledge', { id: 'review-invalid', employeeComments: 'x'.repeat(501) });
assert.equal(response.status, 400, 'review comments are bounded to 500 characters');

sqlite.prepare("UPDATE employee_permission_overrides_v2 SET access_level='none' WHERE id='review-grant'").run();
response = await call('/api/ess/reviews/acknowledge', { id: 'review-revoked-grant', employeeComments: 'Received.' });
assert.equal(response.status, 409, 'a revoked review grant defeats a stale request permission snapshot');
assert.equal(sqlite.prepare("SELECT status FROM employee_reviews WHERE id='review-revoked-grant'").get().status, 'shared');
assert.equal(countAudit('employee_review', 'review-revoked-grant'), 0);
sqlite.prepare("UPDATE employee_permission_overrides_v2 SET access_level='view' WHERE id='review-grant'").run();

const reviewRace = await Promise.all([
  call('/api/ess/reviews/acknowledge', { id: 'review-race', employeeComments: 'Received.' }),
  call('/api/ess/reviews/acknowledge', { id: 'review-race', employeeComments: 'Received.' }),
]);
assert.deepEqual(reviewRace.map(item => item.status).sort(), [200, 409], 'concurrent review retries have one winner');
assert.equal(countAudit('employee_review', 'review-race'), 1, 'concurrent review retry records one audit event');

sqlite.prepare("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='session-revoked'").run();
const revokedContext = { ...context, sessionId: 'session-revoked' };
response = await call('/api/ess/notifications/action', { id: 'notice-revoked-session', acknowledge: true }, revokedContext);
assert.equal(response.status, 409, 'a session revoked after request authentication cannot mutate a notification');
assert.equal(sqlite.prepare("SELECT acknowledged_at FROM employee_notifications WHERE id='notice-revoked-session'").get().acknowledged_at, null);
assert.equal(countAudit('employee_notification', 'notice-revoked-session'), 0);
response = await call('/api/ess/reviews/acknowledge', { id: 'review-revoked-session', employeeComments: 'Received.' }, revokedContext);
assert.equal(response.status, 409, 'a session revoked after request authentication cannot acknowledge a review');
assert.equal(sqlite.prepare("SELECT status FROM employee_reviews WHERE id='review-revoked-session'").get().status, 'shared');
assert.equal(countAudit('employee_review', 'review-revoked-session'), 0);

sqlite.exec(`INSERT INTO employee_reviews(id,employee_id,company_id,review_period_start,review_period_end,status) VALUES('review-audit-fail','employee-a','company-a','2026-01-01','2026-06-30','shared');
  INSERT INTO employee_notifications(id,employee_id,company_id,title,body,requires_ack) VALUES('notice-audit-fail','employee-a','company-a','Audit failure','Synthetic notice',1);
  CREATE TRIGGER fail_ess_audit BEFORE INSERT ON audit_logs WHEN NEW.module='employee_self_service' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`);
response = await call('/api/ess/reviews/acknowledge', { id: 'review-audit-fail', employeeComments: 'Received.' });
assert.equal(response.status, 409, 'audit failure is never reported as successful');
assert.equal(sqlite.prepare("SELECT status FROM employee_reviews WHERE id='review-audit-fail'").get().status, 'shared', 'audit failure rolls back the review transition');
assert.equal(countAudit('employee_review', 'review-audit-fail'), 0);
response = await call('/api/ess/notifications/action', { id: 'notice-audit-fail', acknowledge: true });
assert.equal(response.status, 409, 'notification audit failure is never reported as successful');
assert.equal(sqlite.prepare("SELECT acknowledged_at FROM employee_notifications WHERE id='notice-audit-fail'").get().acknowledged_at, null, 'audit failure rolls back the notification transition');
assert.equal(countAudit('employee_notification', 'notice-audit-fail'), 0);

sqlite.prepare("UPDATE employee_company_memberships SET active=0 WHERE employee_id='employee-a' AND company_id='company-a'").run();
response = await call('/api/ess/notifications/action', { id: 'notice-optional', acknowledge: false });
assert.equal(response.status, 409, 'revoked company membership blocks a stale-session notification action');
assert.equal(countAudit('employee_notification', 'notice-optional'), 0);
listing = await listNotifications();
assert.equal(listing.status, 200);
listed = await listing.json();
assert.equal(listed.notifications.length, 0, 'revoked company notifications are hidden from stale sessions');
assert.equal(listed.broadcasts.length, 0, 'revoked company broadcasts are hidden from stale sessions');

console.log('PASS ESS notification and review audit integrity with real-schema listing');
sqlite.close();
