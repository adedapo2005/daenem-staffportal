// Local composed Worker acceptance. Never invokes Wrangler, providers or a remote DB.
// In restricted shells pass {sha, files:{path:gitObjectText}} on stdin with --baseline-stdin.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

// Use the exact checked-out candidate, not an ancestor absent from shallow CI clones.
const SHA = process.argv.includes('--baseline-stdin') ? null : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
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
    const names = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'worker', 'migrations', 'src'], { encoding: 'utf8' }).trim().split('\n');
    for (const name of names) files[name] = execFileSync('git', ['show', `HEAD:${name}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    baseline = { sha: SHA, files };
  }
  check(SHA === null || baseline.sha === SHA, 'Exact checked-out candidate baseline');
  const sources = { ...baseline.files };
  sources['worker/staging-qa-seeder.ts'] = fs.readFileSync('worker/staging-qa-seeder.ts', 'utf8');
  // On the current branch the guarded QA route is already registered. Do not
  // insert it a second time or override the working Worker entrypoint.
  const workingEntry = fs.readFileSync('worker/staffportal-staging.ts', 'utf8');
  check(workingEntry.includes('if(qaResponse)return qaResponse;') &&
    workingEntry.indexOf('routeStagingQaSeeder(request,') < workingEntry.indexOf("if(request.method==='OPTIONS')"),
    'Current staging route guard precedes middleware');

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
  check(migrations.length === 109 &&
    migrations.includes('migrations/0102_staffportal_v180_media_publication.sql') &&
    migrations.includes('migrations/0103_staffportal_v180_media_approved_seed.sql') &&
    migrations.includes('migrations/0104_staffportal_staff_content_publication.sql'),
    'All 109 migrations, including approved media and Cloudflare-only Staff Content');
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) { lastCheck = `Schema: ${migration}`; db.exec(baseline.files[migration]); }
  check(db.prepare("SELECT COUNT(*) AS n FROM staffportal_staff_content_publication").get().n===0,
    'Never fabricate or automatically publish editorial content');
  check(db.prepare("SELECT sensitive FROM permissions WHERE code='staffportal.content.publish'").get().sensitive===1,
    'Staff content publication permission is sensitive and explicit');
  const rows = sql => db.prepare(sql).all();
  const scalar = sql => Object.values(db.prepare(sql).get())[0];
  const snapshot = () => JSON.stringify(rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map(({ name }) => [name, rows(`SELECT * FROM "${name}" ORDER BY rowid`)]));
  // Authenticated Worker requests normally update auth_sessions.last_seen_at
  // outside the operation's D1 batch. A financial/facility rollback must
  // preserve EVERY other database field, but not compare a legitimate session
  // heartbeat that may cross a second boundary while the test is running.
  const transactionSnapshot = () => JSON.stringify(JSON.parse(snapshot()).map(([name, records]) => [
    name,
    name === 'auth_sessions'
      ? records.map(record => ({ ...record, last_seen_at: null }))
      : records,
  ]));
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
  const missingPepper = await operation('seed', { env: { ...env, AUTH_PEPPER: undefined } });
  check(missingPepper.headers.get('x-qa-error-class') === 'configuration', 'Bounded failure classification');
  check(missingPepper.headers.get('x-qa-error-phase') === 'fixture-configuration', 'Configuration failure phase');
  await summary(missingPepper, 503, 'Missing pepper fails closed');
  same(snapshot(), before, 'Missing pepper leaves DB intact');
  await summary(await operation('reset'), 200, 'Absent fixture reset');
  const resetBatchLength = lastBatchLength;
  check(resetBatchLength <= 50, 'Reset stays within the lowest D1 per-invocation query limit');
  same(snapshot(), before, 'Absent reset has no state change');
  failureIndex = 35;
  const forcedSeedFailure = await operation('seed');
  check(forcedSeedFailure.headers.get('x-qa-error-phase') === 'database-batch', 'Database failure phase');
  await summary(forcedSeedFailure, 503, 'Forced seed failure');
  same(snapshot(), before, 'Seed rollback preserves entire DB');
  failureIndex = -1;
  await summary(await operation('seed'), 200, 'Authorized seed');
  const seedBatchLength = lastBatchLength;
  check(seedBatchLength <= 50, 'Seed stays within the lowest D1 per-invocation query limit');
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
    const allowedCompany = qa('company-' + scope);
    const expectedFacilityLevel = persona === 'owner' ? 'manage' : persona === 'manager' ? 'edit' : 'view';
    check(auth.hasPermission(context, 'facilities.access', expectedFacilityLevel, allowedCompany), 'Scoped Facilities persona permission');
    check(!auth.hasPermission(context, 'facilities.access', 'view', qa('company-' + (scope === 'a' ? 'b' : 'a'))) || persona === 'owner',
      'Facilities foreign-company grant denied');
  }

  // Simulate the observed legacy staged QA state: identities seeded before
  // the Facilities grant was added. Only this in-memory database is modified.
  const grantIds=['owner','manager','employee'].map(name=>qa('grant-'+name+'-facilities.access'));
  const roleAuditBefore=rows("SELECT * FROM role_permissions WHERE role_id NOT LIKE 'qa-staging-v1-%' ORDER BY id");
  const credentialsBefore=rows("SELECT * FROM employee_credentials ORDER BY employee_id");
  for(const grantId of grantIds)db.prepare('DELETE FROM role_permissions WHERE id=?').run(grantId);
  check(scalar("SELECT COUNT(*) FROM role_permissions WHERE id IN ('"+grantIds.join("','")+"')")===0,
    'Old staged fixture is missing exactly three QA Facilities grants');
  const readiness=load('worker/facilities-qa-readiness.ts');
  const stale=await readiness.inspectFacilitiesQaReadiness(env.DB);
  check(stale.state==='incomplete'&&stale.facilitiesGrants===0&&stale.credentials===3,
    'Readiness detects missing Facilities grants while QA identities remain intact');

  const facilitiesRoutes=load('worker/facilities.ts');
  const groupOwner={
    employee:{id:'employee-owner-bootstrap'},
    roles:[{code:'owner',companyId:'company-printing'}],
    companies:[{id:'company-printing'}],
    permissions:{'facilities.access':'manage'},
    companyPermissions:{'company-printing':{'facilities.access':'manage'}},
  };

  // The guarded Pre-Production-only operator page is a separately protected
  // Worker endpoint, not a Sign-In or product UI modification.
  const controlBase='https://qa.invalid/api/facilities/qa-grants/control';
  const control=async(url=controlBase,asContext=groupOwner,asEnv=env)=>
    facilitiesRoutes.routeFacilities(new Request(url),asEnv,asContext);
  const snapshotBeforeControl=snapshot();
  const pageResponse=await control();
  check(pageResponse.status===200,'Owner receives isolated QA operator page');
  check(pageResponse.headers.get('cache-control')==='no-store'&&
    pageResponse.headers.get('content-security-policy')?.includes("script-src 'self'")&&
    pageResponse.headers.get('x-frame-options')==='DENY',
    'Operator page has strong no-store, CSP and framing protections');
  const markup=await pageResponse.text();
  check(markup.includes('Repair Synthetic QA Permissions')&&
    markup.includes('id="ack" disabled')&&markup.includes('id="repair"')&&
    markup.includes('type="button"')&&
    markup.includes('/api/facilities/qa-grants/control.js')&&
    !markup.includes('<script>')&&!markup.includes('sessionId'),
    'Operator page loads no inline executable code or session material');
  const jsResponse=await control(controlBase+'.js');
  check(jsResponse.status===200&&
    jsResponse.headers.get('content-type')?.startsWith('application/javascript'),
    `Authenticated owner can load guarded operator script [HTTP ${jsResponse.status}; content-type ${jsResponse.headers.get('content-type')||'none'}]`);
  const scriptText=await jsResponse.text();
  new vm.Script(scriptText,{filename:'qa-grant-control.js'});
  check(scriptText.includes("method:'POST'")&&scriptText.includes("qa-grants/reconcile")&&
    scriptText.includes("credentials:'same-origin'")&&
    scriptText.includes("'X-DAENEM-QA-REPAIR':'qa-staging-v1'")&&
    scriptText.includes("state.eligible")&&
    scriptText.includes('Preconditions changed; no write attempted.'),
    'Operator script compiles, gates mutation and uses credentialled same-origin POST');
  const cssResponse=await control(controlBase+'.css');
  check(cssResponse.status===200&&
    cssResponse.headers.get('content-type')?.startsWith('text/css')&&
    (await cssResponse.text()).includes('prefers-reduced-motion'),
    'Authenticated owner can load accessible operator styles');
  for(const url of [controlBase,controlBase+'.js',controlBase+'.css']){
    check((await control(url,{...groupOwner,employee:{id:qa('owner')}})).status===403,
      'Synthetic user denied QA operator resources');
    check((await control(url,{...groupOwner,roles:[{code:'manager',companyId:'company-printing'}]})).status===403,
      'Manager denied QA operator resources');
    check((await control(url,groupOwner,{...env,APP_STAGE:'production'})).status===404,
      'Operator resources absent from production stage');
    check((await control(url,groupOwner,{...env,STAFFPORTAL_DATABASE_NAME:'other-db'})).status===404,
      'Operator resources absent without exact staging binding');
  }
  same(snapshot(),snapshotBeforeControl,'All operator GET requests are read-only');
  const reconcilePath='https://qa.invalid/api/facilities/qa-grants/reconcile';
  const repairHeaders={origin:'https://qa.invalid','sec-fetch-site':'same-origin','x-daenem-qa-repair':'qa-staging-v1'};
  const repairRequest=()=>new Request(reconcilePath,{method:'POST',headers:repairHeaders});
  async function reconcile(asContext=groupOwner,asEnv=env,request=repairRequest()){
    return facilitiesRoutes.routeFacilities(request,asEnv,asContext);
  }
  check((await reconcile(groupOwner,env,new Request(reconcilePath,{method:'POST'}))).status===403,
    'QA repair requires same-origin browser invocation');
  const beforeRequestGate=snapshot();
  const crossOrigin=await reconcile(groupOwner,env,new Request(reconcilePath,{
    method:'POST',headers:{...repairHeaders,origin:'https://evil.example'}}));
  check(crossOrigin.status===403&&
    (await crossOrigin.json()).code==='QA_REPAIR_ORIGIN_MISMATCH',
    'QA repair refuses mismatched Origin even with a valid custom header');
  const crossSite=await reconcile(groupOwner,env,new Request(reconcilePath,{
    method:'POST',headers:{...repairHeaders,'sec-fetch-site':'cross-site'}}));
  check(crossSite.status===403&&
    (await crossSite.json()).code==='QA_REPAIR_FETCH_SITE',
    'QA repair rejects cross-site fetch metadata');
  const missingGuard=await reconcile(groupOwner,env,new Request(reconcilePath,{
    method:'POST',headers:{origin:'https://qa.invalid','sec-fetch-site':'same-origin'}}));
  check(missingGuard.status===403&&
    (await missingGuard.json()).code==='QA_REPAIR_SAME_ORIGIN_REQUIRED',
    'QA repair always requires explicit CSRF-protective header');
  const noOriginOrFetchSite=await reconcile(groupOwner,env,new Request(reconcilePath,{
    method:'POST',headers:{'x-daenem-qa-repair':'qa-staging-v1'}}));
  check(noOriginOrFetchSite.status===403,
    'QA repair refuses missing Origin and missing fetch metadata');
  const nonEmptyPayload=await reconcile(groupOwner,env,new Request(reconcilePath,{
    method:'POST',headers:repairHeaders,body:'unexpected'}));
  check(nonEmptyPayload.status===403&&
    (await nonEmptyPayload.json()).code==='QA_REPAIR_PAYLOAD',
    'QA repair rejects requests containing any submitted bytes');
  same(snapshot(),beforeRequestGate,'All invalid origin, CSRF and payload attempts are read-only');
  check((await reconcile({...groupOwner,employee:{id:qa('owner')}})).status===403,
    'Synthetic QA owner cannot elevate its own grants');
  check((await reconcile({...groupOwner,roles:[{code:'manager',companyId:'company-printing'}]})).status===403,
    'Non-owner operator cannot repair QA grants');
  check((await reconcile(groupOwner,{...env,APP_STAGE:'production'})).status===404,
    'QA grant repair never available in production');
  check((await reconcile(groupOwner,{...env,STAFFPORTAL_DATABASE_NAME:'daenem-staffportal-production-db'})).status===404,
    'QA grant repair never available with a nonstaging D1 binding');
  const beforeMalformed=snapshot();
  db.prepare('UPDATE roles SET code=? WHERE id=?').run('unexpected',qa('role-employee'));
  const malformed=snapshot();
  check((await reconcile()).status===409,'QA grant repair refuses modified synthetic identity anchors');
  same(snapshot(),malformed,'Rejected repair does not modify the database');
  db.prepare('UPDATE roles SET code=? WHERE id=?').run('employee',qa('role-employee'));
  same(snapshot(),beforeMalformed,'QA identity restored after isolated negative test');

  const repaired=await reconcile();
  check(repaired.status===200,'Authenticated canonical owner repairs missing synthetic grants');
  const repairResult=await repaired.json();
  check(repairResult.ok===true&&repairResult.scope==='qa-staging-v1'&&repairResult.facilitiesGrants===3,
    'Reconciliation response bounded to the QA namespace and grant count');
  const ready=await readiness.inspectFacilitiesQaReadiness(env.DB);
  check(ready.state==='ready'&&ready.facilitiesGrants===3&&ready.credentials===3,
    'Reconciled QA roles become ready without changing existing credentials');
  check(scalar("SELECT COUNT(*) FROM audit_logs WHERE module='qa-fixture-access' AND action='qa_facilities_grants_reconciled'")===1,
    'QA grant change has a single durable immutable audit record');
  same(rows("SELECT * FROM role_permissions WHERE role_id NOT LIKE 'qa-staging-v1-%' ORDER BY id"),
    roleAuditBefore,'No real-company role permission is changed by QA reconciliation');
  same(rows("SELECT * FROM employee_credentials ORDER BY employee_id"),credentialsBefore,
    'Existing synthetic and business credentials remain untouched');
  const repairedState=snapshot();
  check((await reconcile()).status===200,'QA grant repair supports safe idempotent retry');
  same(snapshot(),repairedState,'Replaying QA grant repair creates no new mutations');
  const originOmittedRequest=new Request(reconcilePath,{
    method:'POST',headers:{'sec-fetch-site':'same-origin','x-daenem-qa-repair':'qa-staging-v1'}});
  check((await reconcile(groupOwner,env,originOmittedRequest)).status===200,
    'Browser Fetch Metadata plus custom header safely supports absent Origin');
  const emptyBodyStream=new ReadableStream({start(controller){controller.close();}});
  const streamRequest=new Request(reconcilePath,{
    method:'POST',headers:repairHeaders,body:emptyBodyStream,duplex:'half'});
  check((await reconcile(groupOwner,env,streamRequest)).status===200,
    'An actually empty POST stream is permitted without accepting payloads');
  same(snapshot(),repairedState,
    'Origin fallback and empty POST stream create no additional grants or audit writes');

  const managerAfterRepair=await auth.getSessionContext(new Request('https://qa.invalid/api/auth/me',
    {headers:{cookie:cookies.manager}}),env);
  check(auth.hasPermission(managerAfterRepair,'facilities.access','edit',qa('company-a')),
    'Existing manager session receives correct company A Facilities permission');
  check(!auth.hasPermission(managerAfterRepair,'facilities.access','view',qa('company-b')),
    'Existing manager session remains denied in foreign company B');


  // Real synthetic-password acceptance, without any Facilities record writes.
  const personaUrl='https://qa.invalid/api/facilities/qa-persona/verify';
  const personaHeaders={origin:'https://qa.invalid','sec-fetch-site':'same-origin',
    'x-daenem-qa-persona':'qa-staging-v1'};
  const personaRequest=(headers=personaHeaders,body)=>new Request(personaUrl,{
    method:'POST',headers,body
  });
  const verifyPersona=(asContext=groupOwner,asEnv=env,request=personaRequest())=>
    facilitiesRoutes.routeFacilities(request,asEnv,asContext);
  const personaSnapshot=snapshot();
  check((await verifyPersona(groupOwner,env,personaRequest({origin:'https://qa.invalid'}))).status===403,
    'Synthetic persona verification requires a custom CSRF header');
  check((await verifyPersona(groupOwner,env,
    personaRequest({...personaHeaders,origin:'https://other.invalid'}))).status===403,
    'Synthetic persona verification refuses cross-origin requests');
  check((await verifyPersona(groupOwner,env,
    personaRequest({...personaHeaders,'sec-fetch-site':'cross-site'}))).status===403,
    'Synthetic persona verification rejects cross-site fetch metadata');
  check((await verifyPersona(groupOwner,env,personaRequest(personaHeaders,'unexpected'))).status===403,
    'Synthetic persona verification rejects payloads');
  check((await verifyPersona({...groupOwner,employee:{id:qa('manager')}})).status===403,
    'Synthetic manager cannot invoke Owner-only QA verification');
  check((await verifyPersona({...groupOwner,roles:[{code:'manager',companyId:'company-printing'}]})).status===403,
    'Non-owner denied synthetic QA verification');
  check((await verifyPersona(groupOwner,{...env,APP_STAGE:'production'})).status===404,
    'Synthetic QA verification never operates in Production');
  check((await verifyPersona(groupOwner,{...env,STAFFPORTAL_DATABASE_NAME:'wrong-db'})).status===404,
    'Synthetic QA verification cannot use non-staging D1');
  same(snapshot(),personaSnapshot,
    'Unauthorized synthetic persona verification attempts have no D1 writes');
  const missingSecret=await verifyPersona(groupOwner,
    {...env,STAFFPORTAL_QA_MANAGER_PASSWORD:'a-different-synthetic-secret-123'});
  check(missingSecret.status===409&&
    (await missingSecret.json()).code==='QA_PERSONA_SECRET_MISMATCH',
    'Synthetic credential mismatch fails before canonical login or account lockout');
  same(snapshot(),personaSnapshot,
    'Synthetic credential preflight rejection leaves all database records unchanged');
  const priorSessionIds=new Set(db.prepare(
    "SELECT id FROM auth_sessions WHERE employee_id IN ('qa-staging-v1-manager','qa-staging-v1-employee')"
  ).all().map(row=>row.id));
  const priorCredentialHashes=rows("SELECT employee_id,password_hash,password_salt FROM employee_credentials ORDER BY employee_id");
  const priorFacilitiesCounts=rows("SELECT company_id,COUNT(*) AS count FROM facilities GROUP BY company_id ORDER BY company_id");
  const attested=await verifyPersona();
  check(attested.status===200,'Real QA password auth and scoped Facilities checks succeed');
  const attestedJson=await attested.json();
  check(attestedJson.ok===true&&attestedJson.scope==='qa-staging-v1'&&
    attestedJson.companyIsolation===true&&attestedJson.managerCompanyA===true&&
    attestedJson.managerDeniedCompanyB===true&&attestedJson.employeeCompanyB===true&&
    attestedJson.employeeDeniedCompanyA===true&&attestedJson.employeeWriteDenied===true&&
    attestedJson.credentialsUnchanged===true&&attestedJson.facilitiesEvidence===0&&
    attestedJson.temporarySessionsRevoked===true,
    'Bounded attestation truthfully reports manager and employee company isolation');
  const addedSessions=db.prepare(
    "SELECT id,employee_id,revoked_at FROM auth_sessions WHERE employee_id IN ('qa-staging-v1-manager','qa-staging-v1-employee')"
  ).all().filter(row=>!priorSessionIds.has(row.id));
  check(addedSessions.length===2&&addedSessions.every(row=>row.revoked_at!==null),
    'Both new synthetic test sessions are revoked, preserving pre-existing sessions');
  same(rows("SELECT employee_id,password_hash,password_salt FROM employee_credentials ORDER BY employee_id"),
    priorCredentialHashes,'Synthetic QA verification does not rotate any credentials');
  same(rows("SELECT company_id,COUNT(*) AS count FROM facilities GROUP BY company_id ORDER BY company_id"),
    priorFacilitiesCounts,'Canonical QA authentication does not manufacture Facilities rows');
  const afterAuth=await readiness.inspectFacilitiesQaReadiness(env.DB);
  check(afterAuth.state==='ready'&&afterAuth.facilitiesGrants===3&&
    Object.values(afterAuth.evidence).every(value=>value===0),
    'Live-persona acceptance does not consume Facilities transaction readiness');

  const facilitiesAllowed = await get(`/api/facilities/overview?companyId=${qa('company-a')}`, 'manager');
  check(facilitiesAllowed.status === 200, 'Manager accesses authorized Facilities overview');
  const facilitiesDenied = await get(`/api/facilities/overview?companyId=${qa('company-b')}`, 'manager');
  check(facilitiesDenied.status === 403, 'Manager denied foreign Facilities overview');
  const employeeFacilities = await get(`/api/facilities/overview?companyId=${qa('company-b')}`, 'employee');
  check(employeeFacilities.status === 200, 'Employee views own Facilities company');
  const deniedCreate = await fetchWorker(new Request('https://qa.invalid/api/facilities',{method:'POST',
    headers:{cookie:cookies.employee,'content-type':'application/json'},
    body:JSON.stringify({companyId:qa('company-b'),name:'QA unauthorized facility'})}));
  check(deniedCreate.status === 403, 'View-only employee cannot create Facilities record');
  const foreignCreate = await fetchWorker(new Request('https://qa.invalid/api/facilities',{method:'POST',
    headers:{cookie:cookies.manager,'content-type':'application/json'},
    body:JSON.stringify({companyId:qa('company-b'),name:'QA foreign facility'})}));
  check(foreignCreate.status === 403, 'Manager cannot write into foreign Facilities company');
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
  failureIndex = Math.floor(resetBatchLength / 2);
  await summary(await operation('reset'), 503, 'Mid-reset failure');
  same(snapshot(), active, 'Reset rollback preserves credentials sessions permissions and finance');
  failureIndex = resetBatchLength - 1;
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
  // Reset intentionally revokes all previous sessions. Re-authenticate newly
  // seeded synthetic personas before exercising Facilities transactions.
  for (const persona of ['owner','manager','employee']) {
    const response = await login(persona);
    check(response.status===200,'Post-reset QA persona can authenticate');
    cookies[persona] = response.headers.get('set-cookie')?.split(';')[0];
    check(Boolean(cookies[persona]),'Post-reset authenticated session issued');
  }
  // Exercise canonical Worker -> SQLite transactions with real auth cookies.
  // All rows live only in this in-memory QA database; no remote D1 or providers.
  const companyA = qa('company-a'), companyB = qa('company-b');
  async function postFacility(route, persona, body) {
    return fetchWorker(new Request('https://qa.invalid' + route, {
      method: 'POST', headers: { cookie: cookies[persona], 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
  }

  // Validate the entire one-shot acceptance against the same composed Worker,
  // canonical QA login, 109-migration schema and transaction-capable in-memory D1.
  const txEvidenceUrl='https://qa.invalid/api/facilities/qa-transaction/evidence';
  const txRunUrl='https://qa.invalid/api/facilities/qa-transaction/run';
  const txHeaders={origin:'https://qa.invalid','sec-fetch-site':'same-origin',
    'x-daenem-qa-transaction':'qa-staging-v1'};
  const txGet=(asContext=groupOwner,asEnv=env)=>
    facilitiesRoutes.routeFacilities(new Request(txEvidenceUrl),asEnv,asContext);
  const txPost=(asContext=groupOwner,asEnv=env,request=new Request(txRunUrl+'?phase=prepare',{
    method:'POST',headers:txHeaders
  }))=>facilitiesRoutes.routeFacilities(request,asEnv,asContext);
  const txWrite=()=>txPost(groupOwner,env,new Request(txRunUrl+'?phase=write',{
    method:'POST',headers:txHeaders
  }));
  const noTransactionYet=await txGet();
  check(noTransactionYet.status===200,'Owner can inspect fixed-namespace transaction evidence');
  const initialTx=await noTransactionYet.json();
  check(initialTx.scope==='qa-staging-v1'&&initialTx.state==='not_started'&&
    initialTx.reserved===false&&initialTx.rollbackProbeAbsent===true&&
    initialTx.companyBIsolated===true&&initialTx.evidence.facilities===0,
    'Pre-run D1 evidence proves no synthetic Facilities transaction occurred');
  check((await txGet({...groupOwner,employee:{id:qa('manager')}})).status===403,
    'Synthetic persona cannot inspect Owner-only transaction evidence');
  check((await txGet(groupOwner,{...env,APP_STAGE:'production'})).status===404,
    'Transaction evidence route does not exist in Production');
  check((await txGet(groupOwner,{...env,STAFFPORTAL_DATABASE_NAME:'not-staging'})).status===404,
    'Transaction evidence requires exact QA D1 binding');

  const beforeTxGuards=snapshot();
  check((await txPost({...groupOwner,employee:{id:qa('manager')}})).status===403,
    'Only actual Group Owner can invoke canonical QA transactions');
  check((await txPost(groupOwner,{...env,APP_STAGE:'production'})).status===404,
    'Canonical live QA transactions never execute in Production');
  check((await txPost(groupOwner,{...env,STAFFPORTAL_DATABASE_NAME:'not-staging'})).status===404,
    'Canonical QA transactions reject non-staging D1');
  check((await txPost(groupOwner,env,new Request(txRunUrl,{
    method:'POST',headers:{origin:'https://qa.invalid'}
  }))).status===403,'One-shot transaction requires a non-safelisted CSRF header');
  check((await txPost(groupOwner,env,new Request(txRunUrl,{
    method:'POST',headers:{...txHeaders,origin:'https://cross-origin.invalid'}
  }))).status===403,'One-shot transaction denies mismatched Origin');
  check((await txPost(groupOwner,env,new Request(txRunUrl,{
    method:'POST',headers:{...txHeaders,'sec-fetch-site':'cross-site'}
  }))).status===403,'One-shot transaction denies cross-site Fetch Metadata');
  check((await txPost(groupOwner,env,new Request(txRunUrl,{
    method:'POST',headers:txHeaders,body:'unexpected bytes'
  }))).status===403,'One-shot transaction refuses submitted body bytes');
  same(snapshot(),beforeTxGuards,
    'Bad-stage, foreign-origin, non-owner and malformed acceptance requests create no data');

  const txSecretMismatch=await txPost(groupOwner,{
    ...env,STAFFPORTAL_QA_MANAGER_PASSWORD:'another-unmatched-test-secret-1234567'
  });
  check(txSecretMismatch.status===409&&
    (await txSecretMismatch.json()).code==='QA_TRANSACTION_SECRET_MISMATCH',
    'QA transaction preflight detects mismatched sealed password without login');
  same(snapshot(),beforeTxGuards,'Missing sealed credential blocks all D1 changes');

  const beforeTxSessions=db.prepare(
    "SELECT id FROM auth_sessions WHERE employee_id='qa-staging-v1-manager'"
  ).all().map(row=>row.id);
  const beforeTxCred=rows("SELECT employee_id,password_hash,password_salt FROM employee_credentials ORDER BY employee_id");
  const prepareQueryStart=calls;
  const prepared=await txPost();
  check(calls-prepareQueryStart<=50,'Live prepare phase stays below staging D1 50-query limit');
  check(prepared.status===200,'Canonical QA acceptance reserves its synthetic slot and proves rollback');
  const preparedResult=await prepared.json();
  check(preparedResult.ok===true&&preparedResult.state==='prepared'&&
    preparedResult.rollbackVerified===true&&preparedResult.syntheticSessionRevoked===true,
    'Prepare phase reports bounded rollback confirmation');
  const reservedEvidence=await txGet();
  check(reservedEvidence.status===200,'Reserved transaction is independently inspectable');
  const reservedState=await reservedEvidence.json();
  check(reservedState.state==='in_progress'&&reservedState.reserved===true&&
    reservedState.rollbackProbeAbsent===true&&reservedState.evidence.facilities===0&&
    reservedState.safeToReset===false,'Preparation persists only its immutable reservation');
  const reservedReadiness=await readiness.inspectFacilitiesQaReadiness(env.DB);
  check(reservedReadiness.state==='transaction_reserved'&&reservedReadiness.safeToReset===false&&
    Object.values(reservedReadiness.evidence).every(value=>value===0),
    'Canonical staging readiness blocks reset once transaction is reserved');
  const beforeReservedReset=snapshot();
  await summary(await operation('reset'),503,'Reservation alone blocks staging QA fixture reset');
  same(snapshot(),beforeReservedReset,'Denied reset leaves immutable acceptance reservation intact');
  const writeQueryStart=calls;
  const txCompleted=await txWrite();
  check(calls-writeQueryStart<=50,'Live write phase stays below staging D1 50-query limit');
  check(txCompleted.status===200,'Canonical QA Facilities write phase succeeds');
  const txResult=await txCompleted.json();
  check(txResult.ok===true&&txResult.scope==='qa-staging-v1'&&txResult.state==='written'&&
    txResult.facility===1&&txResult.equipment===1&&txResult.readings===1&&
    txResult.facilitiesAudits===3&&txResult.rollbackVerified===true&&
    txResult.companyIsolationVerified===true&&txResult.syntheticSessionRevoked===true&&
    txResult.realCompanyMutated===false,'Write phase reports bounded canonical operations');
  const checkTx=await txGet();
  check(checkTx.status===200,'After-write independent transaction evidence endpoint responds');
  const persistedTx=await checkTx.json();
  check(persistedTx.state==='verified'&&persistedTx.reserved===true&&
    persistedTx.facilityPersisted===true&&persistedTx.equipmentPersisted===true&&
    persistedTx.readingPersisted===true&&persistedTx.runningHoursUpdated===true&&
    persistedTx.auditCorrelated===true&&persistedTx.rollbackProbeAbsent===true&&
    persistedTx.companyBIsolated===true&&persistedTx.safeToReset===false&&
    persistedTx.evidence.facilities===1&&persistedTx.evidence.equipment===1&&
    persistedTx.evidence.readings===1&&persistedTx.evidence.auditEvents===3,
    'Independent D1 proof correlates all three Facilities writes with immutable audits');
  const actualTxSessions=db.prepare(
    "SELECT id,revoked_at FROM auth_sessions WHERE employee_id='qa-staging-v1-manager'"
  ).all().filter(row=>!beforeTxSessions.includes(row.id));
  check(actualTxSessions.length===2&&actualTxSessions.every(session=>session.revoked_at!==null),
    'Both synthetic phase sessions revoked without affecting prior sessions');
  same(rows("SELECT employee_id,password_hash,password_salt FROM employee_credentials ORDER BY employee_id"),
    beforeTxCred,'One-shot QA transactions never rotate passwords');
  check(scalar(
    "SELECT COUNT(*) FROM audit_logs WHERE id='qa-staging-v1-facilities-transaction-start'"
  )===1,'Immutable reservation created once and never overwritten');
  check(scalar(
    "SELECT COUNT(*) FROM facilities WHERE name='QA Staging Rollback Probe Must Not Persist'"
  )===0,'Injected canonical audit-stage failure leaves no facility row');
  const afterTx=snapshot();
  const secondTx=await txPost();
  check(secondTx.status===409,'Preparation cannot repeat after persistent evidence');
  check((await txWrite()).status===409,'Write phase cannot repeat after committed Facilities evidence');
  same(snapshot(),afterTx,'Repeat acceptance requests cannot duplicate synthetic records');
  await summary(await operation('reset'),503,'Immutable transaction reservation blocks fixture reset');
  same(snapshot(),afterTx,'Fixture reset refusal preserves transaction reservation and evidence');
  const facilityDraft = { companyId: companyA, locationId: qa('site-a'),
    facilityType: 'office', name: 'QA Transaction Acceptance Building' };
  const failedCreateBefore = transactionSnapshot();
  failureIndex = 1; // Fail the audit write after the facility insert.
  let createRolledBack = false;
  try { await postFacility('/api/facilities', 'manager',
    { ...facilityDraft, name: 'QA Rollback Must Not Persist' }); }
  catch { createRolledBack = true; }
  finally { failureIndex = -1; }
  check(createRolledBack, 'Facility audit failure propagates instead of falsely succeeding');
  same(transactionSnapshot(), failedCreateBefore, 'Facility insert and audit fail atomically');

  const facilityResponse = await postFacility('/api/facilities', 'manager', facilityDraft);
  check(facilityResponse.status === 201, 'Authenticated Facilities creation persists in isolated D1');
  const facility = (await facilityResponse.json()).facility;
  check(typeof facility?.id === 'string' && facility.id.startsWith('facility-'), 'Canonical facility ID returned');
  const persistedFacility = db.prepare('SELECT company_id,location_id,name FROM facilities WHERE id=?').get(facility.id);
  check(persistedFacility?.company_id === companyA &&
    persistedFacility?.location_id === qa('site-a') &&
    persistedFacility?.name === facilityDraft.name, 'Created facility persisted under company A');

  const catalogResponse = await get(`/api/facilities/catalog?companyId=${companyA}`, 'manager');
  check(catalogResponse.status === 200, 'Authorized Facilities catalog read');
  const catalog = await catalogResponse.json();
  check(catalog.facilities.some(record => record.id === facility.id && record.name === facilityDraft.name),
    'Created facility appears in canonical D1 read-back');
  const duplicateFacility = await postFacility('/api/facilities', 'manager', facilityDraft);
  check(duplicateFacility.status === 409, 'Duplicate facility rejected without second write');

  const assetResponse = await postFacility('/api/facilities/assets', 'manager',
    { companyId: companyA, facilityId: facility.id, category: 'generator',
      name: 'QA Generator Asset for Transaction Acceptance' });
  check(assetResponse.status === 201, 'Company-scoped equipment registration succeeds');
  const asset = (await assetResponse.json()).asset;
  check(typeof asset?.id === 'string' && asset.id.startsWith('asset-'), 'Canonical equipment ID returned');
  const persistedAsset = db.prepare('SELECT company_id,facility_id FROM assets WHERE id=?').get(asset.id);
  check(persistedAsset?.company_id === companyA && persistedAsset?.facility_id === facility.id,
    'Equipment D1 row belongs to its registered QA facility');

  const meterInput = { companyId: companyA, facilityId: facility.id, assetId: asset.id,
    readingType: 'running_hours', readingValue: 321.5, unit: 'hours' };
  const beforeMeter = transactionSnapshot();
  failureIndex = 1; // Fail audit: meter insert and asset update must roll back.
  let meterRolledBack = false;
  try { await postFacility('/api/facilities/readings', 'manager', meterInput); }
  catch { meterRolledBack = true; }
  finally { failureIndex = -1; }
  check(meterRolledBack, 'Meter audit failure propagates instead of falsely succeeding');
  same(transactionSnapshot(), beforeMeter, 'Meter write, audit and running-hours update roll back atomically');

  const meterResponse = await postFacility('/api/facilities/readings', 'manager', meterInput);
  // The established Worker API returns HTTP 200 with the canonical readingId.
  // Do not change its response contract solely to satisfy a new test.
  check(meterResponse.status === 200, 'Authenticated meter reading persists');
  const readingId = (await meterResponse.json()).readingId;
  check(typeof readingId === 'string' && readingId.startsWith('asset-reading-'),
    'Canonical persisted reading ID returned');
  const persistedMeter = db.prepare('SELECT company_id,asset_id,reading_value FROM asset_readings WHERE id=?').get(readingId);
  check(persistedMeter?.company_id === companyA && persistedMeter?.asset_id === asset.id &&
    persistedMeter?.reading_value === 321.5, 'Meter reading persisted accurately in company A');
  const updatedAsset = db.prepare('SELECT running_hours FROM assets WHERE id=?').get(asset.id);
  check(updatedAsset?.running_hours === 321.5, 'Generator hours updated atomically with reading');

  const readingsResponse = await get(`/api/facilities/readings?companyId=${companyA}`, 'manager');
  check(readingsResponse.status === 200, 'Authenticated meter-history endpoint accessible');
  check((await readingsResponse.json()).readings.some(record =>
    record.id === readingId && record.readingValue === 321.5 && record.assetId === asset.id),
    'Read-back returns the persisted meter reading, not fixture presentation data');
  const auditResponse = await get(`/api/facilities/audit?companyId=${companyA}`, 'manager');
  check(auditResponse.status === 200, 'Authenticated Facilities audit endpoint accessible');
  const events = (await auditResponse.json()).events;
  check(events.some(event => event.action === 'create' && event.entityType === 'facility' &&
    event.entityId === facility.id), 'Facility creation has a matching audit event');
  check(events.some(event => event.action === 'record_reading' &&
    event.readingId === readingId && event.entityId === asset.id),
    'Meter reading correlates with its own persisted audit event');

  const employeeCatalog = await get(`/api/facilities/catalog?companyId=${companyB}`, 'employee');
  check(employeeCatalog.status === 200, 'View-only QA employee sees only company B');
  check(!(await employeeCatalog.text()).includes(facility.id), 'Company B catalog never discloses A facility');
  const employeeReadings = await get(`/api/facilities/readings?companyId=${companyB}`, 'employee');
  check(employeeReadings.status === 200 &&
    !(await employeeReadings.text()).includes(readingId), 'Company B reading history excludes A reading');
  const employeeAudit = await get(`/api/facilities/audit?companyId=${companyB}`, 'employee');
  check(employeeAudit.status === 200 &&
    !(await employeeAudit.text()).includes(readingId), 'Company B audit feed excludes A reading');
  const unauthorizedMeter = await postFacility('/api/facilities/readings', 'employee',
    { ...meterInput, companyId: companyB });
  check(unauthorizedMeter.status === 403, 'View-only employee cannot write meter readings');
  const foreignMeter = await postFacility('/api/facilities/readings', 'manager',
    { ...meterInput, companyId: companyB });
  check(foreignMeter.status === 403, 'Manager cannot write a meter reading into company B');
  const qaReadiness = await get('/api/facilities/qa-readiness','owner');
  check(qaReadiness.status===200,'Owner sees staging Facilities QA readiness');
  const qaState=await qaReadiness.json();
  check(qaState.scope==='qa-staging-v1' &&
    qaState.syntheticCompanies===2 && qaState.syntheticEmployees===3 &&
    qaState.state==='transaction_evidence_present' && qaState.safeToReset===false &&
    qaState.evidence.facilities===2 && qaState.evidence.equipment===2 &&
    qaState.evidence.readings===2 && qaState.evidence.auditEvents===6,
    'QA readiness truthfully counts both the canonical acceptance and legacy regression records');
  check((await get('/api/facilities/qa-readiness','manager')).status===403,
    'Non-owner cannot inspect QA readiness');
  check((await get('/api/facilities/qa-readiness','employee')).status===403,
    'View-only employee cannot inspect QA readiness');
  const qaNonStaging = await fetchWorker(new Request('https://qa.invalid/api/facilities/qa-readiness',
    {headers:{cookie:cookies.owner}}),{...env,APP_STAGE:'production'});
  check(qaNonStaging.status===404,'QA readiness is unavailable outside staging');
  // A reset must never strand Facilities data or erase transaction history.
  const withFacilityEvidence=snapshot();
  await summary(await operation('reset'),503,'Facilities evidence blocks QA reset');
  const afterBlockedReset = snapshot();
  if (afterBlockedReset !== withFacilityEvidence) {
    const beforeTables = new Map(JSON.parse(withFacilityEvidence));
    const afterTables = new Map(JSON.parse(afterBlockedReset));
    const changedNames = [...beforeTables.keys()].filter(name =>
      JSON.stringify(beforeTables.get(name)) !== JSON.stringify(afterTables.get(name)));
    // Emit only database table names (never rows, tokens, hashes or user data).
    console.error('QA reset preservation changed table names: ' + changedNames.join(','));
  }
  same(afterBlockedReset,withFacilityEvidence,'Refused reset preserves all Facilities transactions and identity');

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
  console.log(`PASS staging QA composed runtime: ${assertions} checks; seed ${seedBatchLength}/50; reset ${resetBatchLength}/50; 109 migrations; zero external calls.`);
}

main().catch(() => {
  // Never serialize thrown database/auth errors, rows, hashes, tokens or inputs.
  console.error(`FAIL staging QA composed runtime at check ${assertions}: ${lastCheck}.`);
  process.exitCode = 1;
});
