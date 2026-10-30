import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const pepper = 'password-reset-parallel-sqlite-fixture';
const token = 'parallel-reset-token';
const tokenHash = createHash('sha256').update(`password-reset:${token}:${pepper}`).digest('hex');

function loadRoute(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
    if (specifier === './credential-security') return { WORKER_SAFE_PASSWORD_ITERATIONS: 8000 };
    if (specifier === './staffportal-account-scope') return {
      staffPortalCompanyPredicate: (column) => `${column} IN ('company-printing','company-bakery','company-autos','company-logistics','company-properties')`,
    };
    throw new Error(`Unexpected auth-refinement dependency: ${specifier}`);
  });
  return loaded.exports.routeAuthRefinement;
}

class SqliteD1 {
  constructor(database, barrier) {
    database.exec('PRAGMA busy_timeout=10000');
    this.database = database;
    this.barrier = barrier;
    this.env = { APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: {
      prepare: (sql) => ({
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return database.prepare(sql).get(...this.values) ?? null; },
        async run() {
          const result = database.prepare(sql).run(...this.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      }),
      batch: async (statements) => {
        if (barrier) {
          Atomics.add(barrier, 0, 1);
          Atomics.notify(barrier, 0);
          while (Atomics.load(barrier, 0) < 2) Atomics.wait(barrier, 0, 1, 10000);
          if (Atomics.load(barrier, 0) < 2) throw new Error('parallel reset barrier timed out');
        }
        database.exec('BEGIN IMMEDIATE');
        try {
          const results = statements.map(({ sql, values }) => ({
            success: true,
            meta: { changes: Number(database.prepare(sql).run(...values).changes) },
          }));
          database.exec('COMMIT');
          return results;
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      },
    } };
  }
}

async function workerMain() {
  const source = await read('worker/auth-refinement.ts');
  const route = loadRoute(source);
  const database = new DatabaseSync(workerData.databasePath);
  const fixture = new SqliteD1(database, new Int32Array(workerData.barrier));
  let result;
  try {
    const response = await route(new Request('https://staffportal.test/api/auth/password/reset', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resetToken: token, newPassword: 'ParallelReset!Pass9' }),
    }), fixture.env);
    result = { status: response?.status ?? null };
  } catch (error) {
    result = { error: String(error?.stack || error) };
  } finally {
    database.close();
    parentPort.postMessage(result);
  }
}

if (!isMainThread) {
  await workerMain();
} else {
  const [source, core, identity, credentials, refinement] = await Promise.all([
    read('worker/auth-refinement.ts'), read('migrations/0001_core.sql'), read('migrations/0002_identity_auth.sql'),
    read('migrations/0010_password_credentials.sql'), read('migrations/0033_auth_profile_refinement.sql'),
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'staffportal-password-reset-parallel-'));
  const tempRoot = join(tmpdir(), '');
  assert.ok(directory.startsWith(tempRoot), 'fixture cleanup remains inside the system temporary directory');
  const databasePath = join(directory, 'reset.sqlite');
  let database = new DatabaseSync(databasePath);
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  try {
    database.exec(core);
    database.exec(identity);
    database.exec(credentials);
    database.exec(refinement);
    database.prepare("INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES('employee-a','QA-A-001','Ada Staff','ada@example.test','active'),('employee-b','QA-B-001','Ben Staff','ben@example.test','active')").run();
    database.prepare("INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES('membership-a','employee-a','company-printing',1)").run();
    database.prepare(`INSERT INTO password_reset_challenges
      (id,employee_id,code_hash,expires_at,reset_token_hash,verified_at,consumed_at,reset_token_expires_at)
      VALUES('reset-a','employee-a','fixture-code-hash',datetime('now','+10 minutes'),?,CURRENT_TIMESTAMP,NULL,datetime('now','+10 minutes'))`).run(tokenHash);
    database.prepare("INSERT INTO employee_credentials(employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,password_changed_at) VALUES('employee-a','ada.staff','old-hash','old-salt','PBKDF2-SHA256',1000,'old-time')").run();
    database.prepare("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at,revoked_at) VALUES('session-a1','employee-a','session-hash-a1',datetime('now','+1 day'),NULL),('session-a2','employee-a','session-hash-a2',datetime('now','+1 day'),NULL),('session-b1','employee-b','session-hash-b1',datetime('now','+1 day'),NULL)").run();
    database.close();
    database = null;

    const workers = Array.from({ length: 2 }, () => new Worker(new URL(import.meta.url), {
      workerData: { databasePath, barrier },
    }));
    const results = await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
      let result;
      worker.once('message', (message) => { result = message; });
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) reject(new Error(`reset worker exited ${code}`));
        else if (!result) reject(new Error('reset worker exited without a result'));
        else resolve(result);
      });
    })));
    assert.deepEqual(results.filter((result) => result.error), [], 'parallel route workers complete without fixture errors');
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 401], 'two independent workers have exactly one reset winner');

    const verify = new DatabaseSync(databasePath);
    try {
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM security_logs WHERE employee_id='employee-a' AND event_type='password_reset_completed' AND result='success'").get().count, 1);
      assert.notEqual(verify.prepare("SELECT consumed_at FROM password_reset_challenges WHERE id='reset-a'").get().consumed_at, null);
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-a' AND revoked_at IS NULL").get().count, 0);
      assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE employee_id='employee-b' AND revoked_at IS NULL").get().count, 1);
    } finally {
      verify.close();
    }
    console.log('Password reset parallel independent-worker SQLite race: 1/1 PASS (exactly one success, one audit, target-only revocation)');
  } finally {
    database?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
