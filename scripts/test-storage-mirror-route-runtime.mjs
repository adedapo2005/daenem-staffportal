import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { routeStorageMirror } from '../worker/storage-mirror.ts';

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE storage_mirror_oauth_config(id TEXT PRIMARY KEY, updated_at TEXT);
CREATE TABLE storage_mirror_jobs(
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, source_module TEXT NOT NULL,
 company_id TEXT, status TEXT NOT NULL, attempt_count INTEGER DEFAULT 0,
 last_error_code TEXT, next_attempt_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP, synced_at TEXT
);
CREATE TABLE audit_logs(
 id TEXT PRIMARY KEY, actor_employee_id TEXT, company_id TEXT, module TEXT,
 action TEXT, entity_type TEXT, entity_id TEXT, after_json TEXT, source TEXT, request_id TEXT
);`);

const prepare = (sql) => {
  const stmt = db.prepare(sql);
  const bind = (...values) => ({
    first: async () => stmt.get(...values) ?? null,
    all: async () => ({ results: stmt.all(...values) }),
    run: async () => stmt.run(...values),
    execute: () => stmt.run(...values),
  });
  return { ...bind(), bind };
};

const env = { DB: {
  prepare,
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(s => ({ meta: { changes: Number(s.execute().changes) } }));
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
}};
const owner = { roles:[{code:'owner'}],companies:[],employee:{id:'owner-1'} };
const adminA = { roles:[{code:'group_admin'}],companies:[{id:'A'}],employee:{id:'admin-A'} };
const adminB = { roles:[{code:'group_admin'}],companies:[{id:'B'}],employee:{id:'admin-B'} };
const viewer = { roles:[{code:'employee'}],companies:[{id:'A'}],employee:{id:'viewer'} };
const unassigned = { roles:[{code:'group_admin'}],companies:[],employee:{id:'unassigned'} };
async function call(route, context=adminA, method='GET', payload, headers={}) {
  const request = new Request('https://portal.example.test/api/admin/storage/' + route, {
    method, headers: { 'content-type':'application/json', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const response = await routeStorageMirror(request, env, context);
  assert.ok(response instanceof Response);
  return { status: response.status, body: await response.json() };
}

const addJob = (id, company, status='failed', code=null) => db.prepare(
  'INSERT INTO storage_mirror_jobs(id,provider,source_module,company_id,status,last_error_code,next_attempt_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)'
).run(id, 'microsoft_onedrive', 'printing', company, status, code);
addJob('A1','A','failed','AUTH_EXPIRED');
addJob('A2','A','failed','Unrecognized provider diagnostic');
addJob('B1','B','failed','RATE_LIMITED');
addJob('N1',null,'provider_required');
let res = await call('mirror-jobs');
assert.equal(res.status,200);
assert.deepEqual(res.body.jobs.map(x=>x.id).sort(),['A1','A2']);
assert.equal(res.body.jobs.find(x=>x.id==='A1').lastErrorCode,'AUTH_EXPIRED');
assert.equal(res.body.jobs.find(x=>x.id==='A2').lastErrorCode,'BACKUP_ERROR');
assert.ok(!JSON.stringify(res.body).includes('Unrecognized provider diagnostic'));
assert.ok(!JSON.stringify(res.body).includes('B1'));

assert.equal((await call('mirror-jobs?status=unknown')).status,400);
const retry = await call('mirror-retry',adminA,'POST',{jobIds:['A1','B1']});
assert.equal(retry.status,200);
assert.equal(retry.body.queuedForRetry,1);
assert.equal(retry.body.unavailableOrOutOfScope,1);
assert.equal(db.prepare("SELECT status FROM storage_mirror_jobs WHERE id='A1'").get().status,'pending');
assert.equal(db.prepare("SELECT status FROM storage_mirror_jobs WHERE id='B1'").get().status,'failed');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1);
const replay = await call('mirror-retry',adminA,'POST',{jobIds:['A1']});
assert.equal(replay.body.queuedForRetry,0);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1);
assert.equal((await call('mirror-retry',adminA,'POST',{jobIds:['A2','A2']})).status,400);
assert.equal((await call('mirror-retry',viewer,'POST',{jobIds:['A2']})).status,403);
db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'test audit abort'); END;");
await assert.rejects(call('mirror-retry',adminA,'POST',{jobIds:['A2']}));
assert.equal(db.prepare("SELECT status FROM storage_mirror_jobs WHERE id='A2'").get().status,'failed');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,1);
db.exec('DROP TRIGGER reject_audit');
db.exec('DELETE FROM storage_mirror_jobs');
addJob('M1','A','mirrored');
const health = await call('mirror-health');
assert.equal(health.body.providerStatus,'provider_required');
assert.equal(health.body.syncHealth,'attention_required');
const healthB = await call('mirror-health',adminB);
assert.equal(healthB.body.counts.mirrored,0);
db.close();
console.log('OneDrive Admin isolated SQLite runtime: permission, redaction, retry CAS, audit rollback and health PASS');
