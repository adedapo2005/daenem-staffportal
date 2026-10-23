// Local composed Worker acceptance. Never invokes Wrangler, providers or a remote DB.
// In restricted shells pass {sha, files:{path:gitObjectText}} on stdin with --baseline-stdin.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

const SHA = '1af3a9b8d643b07d7a3a2ebf05e59f73f7449686';
let assertions = 0, externalCalls = 0, lastCheck = 'Initialization';
function check(value, label) { assertions++; lastCheck = label; if (!value) throw new Error(label); }
const same = (left, right, label) => check(JSON.stringify(left) === JSON.stringify(right), label);
const failExternal = () => { externalCalls++; throw new Error('External activity prohibited'); };
const qa = label => `qa-staging-v1-${label}`;
const random = () => webcrypto.randomUUID() + webcrypto.randomUUID();

async function main() {
  let baseline;
  if (process.argv.includes('--baseline-stdin')) baseline = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  else {
    const files = {};
    const names = execFileSync('git', ['ls-tree', '-r', '--name-only', SHA, 'worker', 'migrations', 'src/dashboard-capabilities.ts', 'src/layout-system.ts'], { encoding: 'utf8' }).trim().split('\n');
    for (const name of names) files[name] = execFileSync('git', ['show', `${SHA}:${name}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    baseline = { sha: SHA, files };
  }
  check(baseline.sha === SHA, 'Exact authoritative baseline');
  const sources = { ...baseline.files };
  sources['worker/staging-qa-seeder.ts'] = fs.readFileSync('worker/staging-qa-seeder.ts', 'utf8');
  // Register only this delta on the exact baseline; shared HEAD contains other completed lanes.
  const workingEntry = fs.readFileSync('worker/staffportal-staging.ts', 'utf8');
  const routeRegistration = workingEntry.slice(workingEntry.indexOf("    if(new URL(request.url).pathname==='/api/staging/qa-fixture')"), workingEntry.indexOf("    if(request.method==='OPTIONS')"));
  check(routeRegistration.length > 0, 'Staging route registration extracted');
  sources['worker/staffportal-staging.ts'] = baseline.files['worker/staffportal-staging.ts']
    .replace("    if(request.method==='OPTIONS')", `${routeRegistration}    if(request.method==='OPTIONS')`);
  check(workingEntry.includes('if(qaResponse)return qaResponse;') && workingEntry.indexOf('routeStagingQaSeeder(request,') < workingEntry.indexOf("if(request.method==='OPTIONS')"), 'Working entry guard precedes middleware');

  const cache = new Map();
  const sandbox = vm.createContext({ crypto: webcrypto, Request, Response, Headers, URL, URLSearchParams,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Blob, FormData, ReadableStream, atob, btoa,
    setTimeout, clearTimeout, fetch: failExternal,
    console: { log: failExternal, warn: failExternal, error: failExternal } });
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    check(typeof sources[name] === 'string', `Committed module available: ${name}`);
    const module = { exports: {} }; cache.set(name, module);
    const output = ts.transpileModule(sources[name], { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    const require = dependency => {
      if (dependency === 'cloudflare:email') return { EmailMessage: class { constructor() { failExternal(); } } };
      check(dependency.startsWith('.'), 'No external runtime dependency');
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), dependency)).replace(/\.js$/, '.ts');
      return load(resolved.endsWith('.ts') ? resolved : `${resolved}.ts`);
    };
    const run = new vm.Script(`(function(require,module,exports){${output}\n})`, { filename: name }).runInContext(sandbox);
    run(require, module, module.exports);
    return module.exports;
  }
  const worker = load('worker/staffportal-staging.ts').default;
  const auth = load('worker/auth.ts');
  const migrations = Object.keys(baseline.files).filter(name => name.startsWith('migrations/') && name.endsWith('.sql')).sort();
  check(migrations.length === 106, 'All 106 committed migrations');
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) { lastCheck = `Schema: ${migration}`; db.exec(baseline.files[migration]); }
  const rows = sql => db.prepare(sql).all();
  const scalar = sql => Object.values(db.prepare(sql).get())[0];
  const snapshot = () => JSON.stringify(rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map(({ name }) => [name, rows(`SELECT * FROM "${name}" ORDER BY rowid`)]));
  // Preserve every pre-existing row, including the canonical non-QA companies/roles.
  const original = rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .map(({ name }) => ({ name, data: rows(`SELECT rowid AS qa_rowid,* FROM "${name}"`) }));
  let calls = 0, batches = 0, failureIndex = -1, lastBatchLength = 0;
  const env = { APP_STAGE: 'staging', STAFFPORTAL_DATABASE_NAME: 'daenem-staffportal-staging-db',
    APP_NAME: 'QA', AUTH_PEPPER: random(), STAFFPORTAL_QA_ADMIN_SECRET: random(),
    STAFFPORTAL_QA_OWNER_PASSWORD: random(), STAFFPORTAL_QA_MANAGER_PASSWORD: random(), STAFFPORTAL_QA_EMPLOYEE_PASSWORD: random(),
    EMAIL: { send: failExternal }, SOCIAL_QUEUE: { send: failExternal },
    DB: {
      prepare(sql) {
        calls++;
        let bound = [];
        const statement = {
          bind(...values) { bound = values; return statement; },
          async first(column) { const row = db.prepare(sql).get(...bound); return column ? row?.[column] ?? null : row ?? null; },
          async all() { return { success: true, results: db.prepare(sql).all(...bound) }; },
          async run() { const result = execute(); return result; },
          execute,
        };
        function execute() {
          const prepared = db.prepare(sql);
          if (/^\s*SELECT\b/i.test(sql)) return { success: true, results: prepared.all(...bound), meta: { changes: 0 } };
          const result = prepared.run(...bound);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        }
        return statement;
      },
      async batch(statements) {
        batches++; lastBatchLength = statements.length;
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = statements.map((statement, index) => {
            if (index === failureIndex) throw new Error('Injected failure');
            return statement.execute();
          });
          db.exec('COMMIT'); return result;
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    },
  };
  const secrets = [env.AUTH_PEPPER, env.STAFFPORTAL_QA_ADMIN_SECRET, env.STAFFPORTAL_QA_OWNER_PASSWORD,
    env.STAFFPORTAL_QA_MANAGER_PASSWORD, env.STAFFPORTAL_QA_EMPLOYEE_PASSWORD];
  const fetchWorker = (request, suppliedEnv = env) => worker.fetch(request, suppliedEnv, { waitUntil: failExternal });
  const operation = (action, options = {}) => fetchWorker(new Request('https://qa.invalid/api/staging/qa-fixture', {
    method: 'POST', headers: { authorization: `Bearer ${env.STAFFPORTAL_QA_ADMIN_SECRET}`, ...options.headers },
    body: options.body ?? JSON.stringify({ action }),
  }), options.env || env);
  async function summary(response, status, label) {
    check(response.status === status, label);
    const text = await response.text();
    check(secrets.every(value => !text.includes(value)), 'Response contains no secret');
    check(!/@|password|hash|SELECT|INSERT|invariant|constraint/i.test(text), 'Bounded neutral response');
    check(text.length < 160, 'Bounded response size');
    return text;
  }
  for (const stage of [undefined, '', 'local', 'bootstrap', 'production', 'Staging', 'staging ']) {
    const guarded = new Proxy({ APP_STAGE: stage }, { get(target, key) {
      if (key === 'APP_STAGE') return target[key]; throw new Error('Guard accessed forbidden environment property');
    } });
    await summary(await fetchWorker({ url: 'https://qa.invalid/api/staging/qa-fixture' }, guarded), 404, 'Stage guard precedes request and secret access');
  }
  for (const database of [undefined, '', 'daenem-staffportal-staging-db ', 'DAENEM-STAFFPORTAL-STAGING-DB', 'daenem-staffportal-production-db', 'daenem-staffportal-staging-db-copy']) {
    const guarded = new Proxy({ APP_STAGE: 'staging', STAFFPORTAL_DATABASE_NAME: database }, { get(target, key) {
      if (key in target) return target[key]; throw new Error('Database guard accessed forbidden environment property');
    } });
    await summary(await fetchWorker({ url: 'https://qa.invalid/api/staging/qa-fixture' }, guarded), 404, 'Database guard precedes request and secret access');
  }
  const forbiddenBody = { url: 'https://qa.invalid/api/staging/qa-fixture', method: 'POST', headers: new Headers(),
    get body() { throw new Error('Unauthorized body read'); } };
  await summary(await fetchWorker(forbiddenBody), 404, 'Unauthorized body is unread');
  await summary(await operation('seed', { headers: { authorization: `Bearer ${random()}` } }), 404, 'Wrong administrative secret');
  await summary(await operation('seed', { headers: { origin: 'https://qa.invalid' } }), 404, 'Browser-origin administrative request refused');
  check(calls === 0 && batches === 0, 'All preauthorization denials have zero DB access');
  await summary(await operation('seed', { body: JSON.stringify({ action: 'seed', extra: true }) }), 400, 'Unknown body properties refused');
  await summary(await operation('seed', { body: ' '.repeat(65) }), 400, 'Streaming body limit');
  const before = snapshot();
  await summary(await operation('seed', { env: { ...env, AUTH_PEPPER: undefined } }), 503, 'Missing pepper fails closed');
  same(snapshot(), before, 'Missing pepper leaves DB intact');
  await summary(await operation('reset'), 200, 'Absent fixture reset');
  same(snapshot(), before, 'Absent reset has no state change');
  failureIndex = 35;
  await summary(await operation('seed'), 503, 'Forced seed failure');
  same(snapshot(), before, 'Seed rollback preserves entire DB');
  failureIndex = -1;
  await summary(await operation('seed'), 200, 'Authorized seed');
  const seeded = snapshot();
  for (const response of await Promise.all([operation('seed'), operation('seed')])) await summary(response, 200, 'Concurrent idempotent seed');
  same(snapshot(), seeded, 'Concurrent retries preserve exact fixture and evidence');
  check(scalar(`SELECT count(*) FROM employee_credentials WHERE employee_id LIKE 'qa-staging-v1-%'`) === 3, 'Three canonical credentials');
  check(scalar(`SELECT count(*) FROM employees WHERE id LIKE 'qa-staging-v1-%' AND (email IS NOT NULL OR phone IS NOT NULL OR whatsapp IS NOT NULL)`) === 0, 'No delivery destinations');
  const immutable = rows(`SELECT * FROM access_control_changes WHERE id='${qa('access-evidence')}'`);
  const seedAudit = rows(`SELECT * FROM audit_logs WHERE id='${qa('audit-seed')}'`);
  const cookies = {};
  async function login(persona) {
    return fetchWorker(new Request('https://qa.invalid/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: qa(persona), password: env[`STAFFPORTAL_QA_${persona.toUpperCase()}_PASSWORD`] }) }));
  }
  async function get(url, persona) { return fetchWorker(new Request(`https://qa.invalid${url}`, { headers: { cookie: cookies[persona] } })); }
  for (const persona of ['owner', 'manager', 'employee']) {
    const response = await login(persona);
    check(response.status === 200, 'Canonical password login');
    cookies[persona] = response.headers.get('set-cookie')?.split(';')[0];
    check(Boolean(cookies[persona]), 'Canonical session issued');
    const context = await auth.getSessionContext(new Request('https://qa.invalid/api/auth/me', { headers: { cookie: cookies[persona] } }), env);
    check(context?.roles.some(role => role.code === persona), 'Canonical role truth');
    check(context.companies.length === (persona === 'owner' ? 2 : 1), 'Canonical membership truth');
    const scope = persona === 'employee' ? 'b' : 'a';
    check(context.companies.some(company => company.id === qa(`company-${scope}`) && company.locationId === qa(`site-${scope}`)), 'Canonical site membership truth');
    check(auth.hasPermission(context, 'payroll.access', 'edit', qa('company-a')) === (persona !== 'employee'), 'Composed Payroll permission');
  }
  const positive = await get(`/api/finance/receivables?companyId=${qa('company-a')}`, 'manager');
  check(positive.status === 200 && (await positive.json()).receivables.some(row => row.id === qa('receivable-a')), 'Authorized Finance fixture');
  const negative = await get(`/api/finance/receivables?companyId=${qa('company-b')}`, 'manager');
  check(negative.status === 403 && !(await negative.text()).includes(qa('receivable-b')), 'Cross-company Finance denial');
  const site = await get(`/api/attendance/today?companyId=${qa('company-a')}`, 'manager');
  check(site.status === 200 && (await site.json()).policy.locationId === qa('site-a'), 'Assigned site access');
  const deniedSite = await get(`/api/attendance/today?companyId=${qa('company-b')}`, 'manager');
  check(deniedSite.status === 400 && !(await deniedSite.text()).includes(qa('site-b')), 'Cross-company site denial');
  db.prepare('UPDATE employee_company_memberships SET active=0 WHERE id=?').run(qa('membership-manager-a'));
  const revoked = await get(`/api/finance/receivables?companyId=${qa('company-a')}`, 'manager');
  check(revoked.status === 403 && !(await revoked.text()).includes(qa('receivable-a')), 'Membership revocation reauthorizes existing session');
  await summary(await operation('seed'), 200, 'Reseed restores deterministic membership');
  // The last statement checks required reset evidence, so inject at early and late boundaries.
  const active = snapshot();
  failureIndex = 70;
  await summary(await operation('reset'), 503, 'Mid-reset failure');
  same(snapshot(), active, 'Reset rollback preserves credentials sessions permissions and finance');
  failureIndex = lastBatchLength - 1;
  await summary(await operation('reset'), 503, 'Late reset failure');
  same(snapshot(), active, 'Late rollback preserves full prior fixture');
  failureIndex = -1;
  db.exec(`CREATE TRIGGER qa_ignore_reset_audit BEFORE INSERT ON audit_logs WHEN NEW.id='${qa('audit-reset')}' BEGIN SELECT RAISE(IGNORE); END;`);
  await summary(await operation('reset'), 503, 'Ignored required audit fails closed');
  same(snapshot(), active, 'Ignored audit rolls back reset');
  db.exec('DROP TRIGGER qa_ignore_reset_audit');
  await summary(await operation('reset'), 200, 'Atomic logical reset');
  const reset = snapshot();
  await summary(await operation('reset'), 200, 'Idempotent reset');
  same(snapshot(), reset, 'Reset replay has no duplicate evidence');
  same(rows(`SELECT * FROM access_control_changes WHERE id='${qa('access-evidence')}'`), immutable, 'Immutable access evidence retained');
  same(rows(`SELECT * FROM audit_logs WHERE id='${qa('audit-seed')}'`), seedAudit, 'Immutable seed evidence retained');
  for (const persona of ['owner', 'manager', 'employee']) {
    check((await login(persona)).status === 401, 'Reset principal cannot authenticate');
    const context = await auth.getSessionContext(new Request('https://qa.invalid/api/auth/me', { headers: { cookie: cookies[persona] } }), env);
    check(context === null, 'Reset session has no effective authority');
  }
  check(scalar(`SELECT count(*) FROM payroll_runs WHERE id LIKE 'qa-staging-v1-%' AND status<>'cancelled'`) === 0, 'No actionable QA Payroll');
  check(scalar(`SELECT count(*) FROM finance_receivables WHERE id LIKE 'qa-staging-v1-%' AND (status<>'cancelled' OR balance_kobo<>0)`) === 0, 'No actionable QA Finance');
  check(scalar(`SELECT count(*) FROM employee_roles WHERE employee_id LIKE 'qa-staging-v1-%'`) === 0, 'No QA role assignments after reset');
  await summary(await operation('seed'), 200, 'Reseed after reset');
  check((await login('manager')).status === 200, 'Reseed restores canonical login');
  check(scalar(`SELECT count(*) FROM audit_logs WHERE module='qa-staging-v1'`) === 2, 'Lifecycle evidence is deterministic');
  // Collision on an anchor must leave even the conflicting row unchanged.
  db.prepare('UPDATE employees SET department=? WHERE id=?').run('Non-QA ownership', qa('manager'));
  const collision = snapshot();
  await summary(await operation('seed'), 503, 'Foreign anchor collision refuses seed');
  await summary(await operation('reset'), 503, 'Foreign anchor collision refuses reset');
  same(snapshot(), collision, 'Collision leaves prior data untouched');
  for (const { name, data } of original) for (const row of data) {
    const current = db.prepare(`SELECT rowid AS qa_rowid,* FROM "${name}" WHERE rowid=?`).get(row.qa_rowid);
    same(current, row, `Non-QA preservation: ${name}`);
  }
  const auditText = JSON.stringify(rows(`SELECT * FROM audit_logs WHERE module='qa-staging-v1'`));
  check(secrets.every(value => !auditText.includes(value)) && !/@|password_hash|password_salt/.test(auditText), 'Audit has no private material');
  for (const row of rows(`SELECT password_hash,password_salt FROM employee_credentials WHERE employee_id LIKE 'qa-staging-v1-%'`))
    check(!auditText.includes(row.password_hash) && !auditText.includes(row.password_salt), 'Audit excludes derived credential material');
  check(externalCalls === 0, 'Zero provider delivery logging or external calls');
  check(rows('PRAGMA foreign_key_check').length === 0, 'Canonical foreign keys intact');
  db.close();
  console.log(`PASS staging QA composed runtime: ${assertions} checks; 106 migrations; zero external calls.`);
}

main().catch(() => {
  // Never serialize thrown database/auth errors, rows, hashes, tokens or inputs.
  console.error(`FAIL staging QA composed runtime at check ${assertions}: ${lastCheck}.`);
  process.exitCode = 1;
});
