import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { routeStorageMirror } from '../worker/storage-mirror.ts';

// Synthetic non-production SQLite fixture from the committed StaffPortal schema;
// no network, production D1, secrets, or Microsoft provider access.
const db = new DatabaseSync(':memory:');
for (const migration of ['0001_core.sql', '0019_employee_permission_overrides_v2.sql', '0077_storage_mirror_queue.sql']) {
  db.exec(readFileSync(new URL('../migrations/' + migration, import.meta.url), 'utf8'));
}
const A = 'company-printing', B = 'company-bakery';
const employee = 'mirror-test-admin', sessionId = 'mirror-test-session';
const sql = (q, ...args) => db.prepare(q).run(...args);
const first = (q, ...args) => db.prepare(q).get(...args);
sql("INSERT INTO employees(id,display_name,employment_status) VALUES(?,'Storage Test Administrator','active')", employee);
sql("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,'2099-01-01 00:00:00')",
  sessionId, employee, 'synthetic-token-hash-not-a-credential');
for (const companyId of [A, B]) {
  sql("INSERT INTO employee_company_memberships(id,employee_id,company_id) VALUES(?,?,?)",
    'member-' + companyId, employee, companyId);
}
for (const [id, code] of [['role-test-admin','group_admin'], ['role-test-owner','owner']]) {
  sql('INSERT INTO roles(id,code,name,is_system) VALUES(?,?,?,1)', id, code, code);
}
sql('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)',
  'admin-A', employee, A, 'role-test-admin');
sql("INSERT INTO permissions(id,code,module,action) VALUES('test-settings','settings.access','settings','access')");
const addJob = (id, companyId, status='failed') => {
  sql(`INSERT INTO storage_mirror_jobs(
    id,provider,source_module,source_id,company_id,r2_key,original_name,mime_type,
    size_bytes,sha256,idempotency_key,status
  ) VALUES(?,'microsoft_onedrive','forms',?,?,'synthetic-r2-key','safe.txt','text/plain',
    10,?, ?,?)`, id, id, companyId, 'a'.repeat(64), 'idempotent-' + id, status);
};
addJob('job-A', A);
addJob('job-B', B);
addJob('job-null', null);

class SyntheticD1 {
  constructor() { this.failAudit = false; this.beforeBatch = null; }
  prepare(statement) {
    const prepared = { statement, args: [], bind(...args) { this.args = args; return this; },
      async first() { return db.prepare(this.statement).get(...this.args) ?? null; },
      async all() { return { results: db.prepare(this.statement).all(...this.args) }; } };
    return prepared;
  }
  async batch(statements) {
    if (this.beforeBatch) { const hook = this.beforeBatch; this.beforeBatch = null; hook(); }
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = statements.map((statement) => {
        if (this.failAudit && statement.statement.includes('INSERT INTO audit_logs')) throw Error('synthetic audit write failure');
        const value = db.prepare(statement.statement).run(...statement.args);
        return { meta: { changes: value.changes } };
      });
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
const D1 = new SyntheticD1();
const env = { DB: D1 };
const context = {
  sessionId, employee: { id: employee }, companies: [{id:A}, {id:B}],
  roles: [{code:'group_admin',companyId:A},{code:'group_admin',companyId:B}],
  permissions: {}, companyPermissions: {},
};
async function route(path, {method='GET', body, ctx=context}={}) {
  const request = new Request('https://staffportal.test' + path, {
    method, headers: { 'content-type': 'application/json', 'x-request-id':'ae82987a-5b4a-4e80-9b6e-445611223344' },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  const response = await routeStorageMirror(request, env, ctx);
  assert.ok(response, 'Storage route exists');
  return {status: response.status, body: await response.json()};
}
const getJobs = (query='') => route('/api/admin/storage/mirror-jobs' + query);
const getHealth = (query='') => route('/api/admin/storage/mirror-health' + query);
const retry = (jobIds, companyId) => route('/api/admin/storage/mirror-retry', {
  method:'POST', body: {jobIds, ...(companyId === undefined ? {} : {companyId})},
});
const auditCount = (jobId) => Number(first(
  "SELECT COUNT(*) AS n FROM audit_logs WHERE action='mirror_retry_requested' AND entity_id=?", jobId).n);
let assertions = 0;
function verify(condition, description) { assert.ok(condition, description); assertions++; }

// Administrator in A and ordinary member in B: every data row must prove its
// own company grant even when cached context claims admin in both companies.
let out = await getJobs();
assert.equal(out.status, 200);
assert.deepEqual(out.body.jobs.map((job) => job.id), ['job-A']);
verify(!JSON.stringify(out.body).includes('job-B'), 'company B not disclosed in list');
verify(!JSON.stringify(out.body).includes('job-null'), 'unscoped job not disclosed');
assert.deepEqual((await getJobs('?companyId=' + A)).body.jobs.map((job) => job.id), ['job-A']);
assert.equal((await getJobs('?companyId=' + B)).status, 403);
assert.equal((await getHealth('?companyId=' + B)).status, 403);
assert.equal((await retry(['job-B'], B)).status, 403);
assert.equal((await getJobs('?companyId=' + encodeURIComponent('A OR 1=1'))).status, 400);
assert.equal((await getJobs('?status=unrecognized')).status, 400);
out = await getHealth();
assert.equal(out.status, 200);
assert.equal(out.body.failedCount, 1);
assert.equal(out.body.primaryStorage, 'Cloudflare R2');
assert.equal(out.body.providerStatus, 'provider_required');
assert.equal(out.body.liveAuthorizationEnabled, false);
assert.equal((await retry(['job-B'])).body.queuedForRetry, 0);
assert.equal(first('SELECT status FROM storage_mirror_jobs WHERE id=?', 'job-B').status, 'failed');
assert.equal(auditCount('job-B'), 0);

// Company B only becomes visible with a current, company-specific grant.
sql('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)',
  'admin-B', employee, B, 'role-test-admin');
assert.deepEqual((await getJobs('?companyId=' + B)).body.jobs.map((job) => job.id), ['job-B']);
sql("DELETE FROM employee_roles WHERE id='admin-B'");
assert.equal((await getJobs('?companyId=' + B)).status, 403);

// Expired/revoked sessions and role, membership, company, employment changes
// must invalidate stale session-context privileges.
sql("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?", sessionId);
assert.equal((await getJobs()).status, 403);
assert.equal((await retry(['job-A'])).status, 403);
sql('UPDATE auth_sessions SET revoked_at=NULL,expires_at=? WHERE id=?', '2000-01-01', sessionId);
assert.equal((await getHealth()).status, 403);
sql('UPDATE auth_sessions SET expires_at=? WHERE id=?', '2099-01-01', sessionId);
sql("DELETE FROM employee_roles WHERE id='admin-A'");
assert.equal((await getJobs()).status, 403);
sql('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)',
  'admin-A', employee, A, 'role-test-admin');
sql('UPDATE employee_company_memberships SET active=0 WHERE employee_id=? AND company_id=?', employee, A);
assert.equal((await getJobs()).status, 403);
sql('UPDATE employee_company_memberships SET active=1 WHERE employee_id=? AND company_id=?', employee, A);
sql('UPDATE companies SET active=0 WHERE id=?', A);
assert.equal((await getHealth()).status, 403);
sql('UPDATE companies SET active=1 WHERE id=?', A);
sql("UPDATE employees SET employment_status='suspended' WHERE id=?", employee);
assert.equal((await getJobs()).status, 403);
sql("UPDATE employees SET employment_status='active' WHERE id=?", employee);

// A role code in another company must not elevate B, including the owner role.
sql('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)',
  'owner-A', employee, A, 'role-test-owner');
assert.equal((await getJobs('?companyId=' + B)).status, 403);
sql("DELETE FROM employee_roles WHERE id='owner-A'");

// Deny-wins: legacy scoped override and v2 scoped/global override.
sql("INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level) VALUES('deny-legacy',?,?,?,'none')",
  employee, A, 'test-settings');
assert.equal((await getJobs()).status, 403);
sql("DELETE FROM employee_permission_overrides WHERE id='deny-legacy'");
sql("INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('deny-v2',?,?,?,'none','synthetic policy',?)",
  employee, A, 'test-settings', employee);
assert.equal((await getJobs()).status, 403);
sql("UPDATE employee_permission_overrides_v2 SET company_id=NULL WHERE id='deny-v2'");
assert.equal((await getHealth()).status, 403);
sql("DELETE FROM employee_permission_overrides_v2 WHERE id='deny-v2'");

// Atomic failed -> pending transition with company-provenance audit.
out = await retry(['job-A']);
assert.equal(out.status, 200);
assert.equal(out.body.queuedForRetry, 1);
assert.equal(first('SELECT status FROM storage_mirror_jobs WHERE id=?','job-A').status, 'pending');
assert.equal(auditCount('job-A'), 1);
assert.equal(first("SELECT company_id FROM audit_logs WHERE entity_id='job-A'").company_id, A);
assert.equal((await retry(['job-A'])).body.queuedForRetry, 0);
assert.equal(auditCount('job-A'), 1);

// Two overlapping requests and a replay yield one winning update and audit.
sql("UPDATE storage_mirror_jobs SET status='failed' WHERE id='job-A'");
const [concurrent1, concurrent2] = await Promise.all([retry(['job-A']), retry(['job-A'])]);
assert.equal(concurrent1.body.queuedForRetry + concurrent2.body.queuedForRetry, 1);
assert.equal(auditCount('job-A'), 2);

// Revocation between request preflight and the transactional UPDATE is checked
// inside the UPDATE, not against a stale eligible-IDs result.
sql("UPDATE storage_mirror_jobs SET status='failed' WHERE id='job-A'");
D1.beforeBatch = () => sql("DELETE FROM employee_roles WHERE id='admin-A'");
assert.equal((await retry(['job-A'])).body.queuedForRetry, 0);
assert.equal(first('SELECT status FROM storage_mirror_jobs WHERE id=?', 'job-A').status, 'failed');
assert.equal(auditCount('job-A'), 2);
sql('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)',
  'admin-A', employee, A, 'role-test-admin');

// Batch audit failure must roll back the queued transition.
D1.failAudit = true;
await assert.rejects(() => retry(['job-A']), /synthetic audit write failure/);
D1.failAudit = false;
assert.equal(first('SELECT status FROM storage_mirror_jobs WHERE id=?','job-A').status, 'failed');
assert.equal(auditCount('job-A'), 2);
assert.equal(first('SELECT status FROM storage_mirror_jobs WHERE id=?','job-B').status, 'failed');
// Missing policy tables must fail closed, not quietly restore cached privileges.
db.exec('DROP TABLE employee_permission_overrides_v2');
assert.equal((await getJobs()).status, 403);
console.log(`Storage company-scope, Zero Disclosure, revocation and CAS/audit: PASS (${assertions} extra invariants)`);
db.close();
