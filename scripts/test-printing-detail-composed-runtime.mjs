import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Real staging wrapper -> shared runtime -> cookie/session/permission resolver
// -> Printing handler -> SQLite. Only unrelated pre-route guards are replaced.
// This is isolated acceptance, not Cloudflare D1 or temporary-password QA.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const [file, tables] of [
  ['0001_core.sql', ['companies', 'company_locations', 'employees', 'employee_company_memberships',
    'roles', 'employee_roles', 'permissions', 'role_permissions', 'employee_permission_overrides', 'auth_sessions', 'audit_logs']],
  ['0002_identity_auth.sql', ['employee_preferences']],
  ['0005_commerce_printing.sql', ['customers', 'sales_orders', 'printing_services', 'print_jobs', 'inventory_categories', 'inventory_items', 'print_job_materials', 'print_job_status_events', 'print_proofs', 'print_quality_checks']],
  ['0012_printing_production_controls.sql', ['print_artwork_versions', 'print_finishing_records', 'print_delivery_records', 'print_job_notes']],
  ['0019_employee_permission_overrides_v2.sql', ['employee_permission_overrides_v2']],
]) {
  const migration = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
  for (const table of tables) {
    const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    assert.ok(definition, `committed definition for ${table}`);
    db.exec(definition[0]);
  }
}

let jobReads = 0, childReads = 0, batches = 0, networkCalls = 0, productWrites = 0;
let afterDetailRead = null, failAuthorization = false;
const env = {
  APP_STAGE: 'test',
  AUTH_PEPPER: 'synthetic-printing-test-only',
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.test',
  DB: {
    prepare(sql) {
      return {
        sql, values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          if (sql.includes('FROM print_jobs pj')) jobReads++;
          if (failAuthorization && sql.includes('FROM auth_sessions')) throw new Error('Injected private authorization failure');
          return db.prepare(sql).get(...this.values) || null;
        },
        async all() {
          const results = db.prepare(sql).all(...this.values);
          if (/FROM print_/.test(sql)) childReads++;
          if (sql.includes('FROM print_job_status_events') && afterDetailRead) {
            const hook = afterDetailRead; afterDetailRead = null; hook();
          }
          return { results };
        },
        async run() {
          if (!sql.startsWith('UPDATE auth_sessions SET last_seen_at')) productWrites++;
          const result = db.prepare(sql).run(...this.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      batches++;
      db.exec('BEGIN');
      try {
        const results = statements.map(statement => {
          const result = db.prepare(statement.sql).run(...statement.values);
          return { success: true, meta: { changes: Number(result.changes) } };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  },
};

async function load(file, dependencies = {}) {
  const source = await readFile(new URL(`../worker/${file}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(module, module.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `explicit dependency boundary: ${file} ${name}`);
    return dependencies[name];
  });
  return module.exports;
}
const auth = await load('auth');
const printing = await load('printing-production', { './auth': auth });
const workspace = await load('workspace-route', { './auth': auth });
const runtimeSource = await readFile(new URL('../worker/runtime.ts', import.meta.url), 'utf8');
const noOpGuards = new Set(['routeOwnerTemporaryPasswordRepair', 'routeOwnerTemporaryAccess',
  'routeTemporaryPasswordSelf', 'guardTemporaryPasswordChange', 'guardOwnerForcedPasswordChange']);
const dependencies = {};
for (const [, name] of runtimeSource.matchAll(/from '(\.\/[^']+)'/g)) {
  dependencies[name] = new Proxy({}, { get(_target, member) {
    if (noOpGuards.has(member)) return async () => null;
    return () => { throw new Error(`Unexpected dispatch: ${name}.${String(member)}`); };
  } });
}
Object.assign(dependencies, { './auth': auth, './printing-production': printing, './workspace-route': workspace });
const runtime = await load('runtime', dependencies);
const staging = await load('staffportal-staging', {
  './runtime': runtime, './workspace-route': workspace,
  './v180-public-assets': { routeV180PublicAssets: async request => {
    assert.equal(new URL(request.url).pathname, '/api/printing/jobs/detail');
    return null;
  } },
});

db.exec(`
  INSERT INTO companies(id,code,name,business_type) VALUES
    ('company-printing','PRINTING','Printing fixture','printing'),('company-bakery','BAKERY','Other fixture','bakery');
  INSERT INTO permissions(id,code,module,action) VALUES
    ('print-access','printing.access','printing','access'),('finance-access','finance.access','finance','access');
`);
const tokens = new Map();
for (const [actor, target, level] of [
  ['viewer', 'company-printing', 'view'], ['finance', 'company-printing', 'view'], ['foreign-finance', 'company-printing', 'view'], ['approver', 'company-printing', 'approve'],
  ['owner', 'company-printing', 'manage'], ['other', 'company-bakery', 'manage'],
]) {
  db.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)').run(actor, `Synthetic ${actor}`);
  for (const company of ['company-printing', 'company-bakery']) {
    db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id) VALUES(?,?,?)').run(`${actor}-${company}`, actor, company);
  }
  db.prepare('INSERT INTO roles(id,company_id,code,name,is_system) VALUES(?,?,?,?,?)')
    .run(actor, actor === 'owner' ? null : target, actor, actor, actor === 'owner' ? 1 : 0);
  db.prepare('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)').run(actor, actor, target, actor);
  db.prepare('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)').run(actor, actor, 'print-access', level);
  const token = `synthetic-session-${actor}`;
  tokens.set(actor, token);
  const hash = createHash('sha256').update(`${token}:${env.AUTH_PEPPER}`).digest('hex');
  db.prepare("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 hour'))").run(actor, actor, hash);
}

db.exec(`
  INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES('finance-view','finance','finance-access','view');
  INSERT INTO roles(id,company_id,code,name) VALUES('foreign-finance-role','company-bakery','finance-reader','Other Finance');
  INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES('foreign-finance-role','foreign-finance','company-bakery','foreign-finance-role');
  INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES('foreign-finance-view','foreign-finance-role','finance-access','view');
  INSERT INTO print_jobs(id,company_id,job_no,title,created_by,quoted_kobo,invoiced_kobo,material_cost_kobo,labour_cost_kobo,finishing_cost_kobo,other_cost_kobo,gross_profit_kobo,margin_basis_points) VALUES
    ('job-a','company-printing','PRINT-SECRET-A','Protected job A','owner',111111,222222,333333,444444,555555,666666,777777,8888),
    ('job-b','company-bakery','PRINT-SECRET-B','Protected job B','owner',999999,0,0,0,0,0,0,0);
  INSERT INTO inventory_items(id,company_id,sku,name) VALUES('paper','company-printing','PAPER','Paper fixture');
  INSERT INTO print_job_materials(id,print_job_id,item_id,actual_quantity,waste_quantity,unit_cost_kobo) VALUES('material-a','job-a','paper',10,2,98765);
  INSERT INTO print_artwork_versions(id,print_job_id,file_key,created_by) VALUES('art-a','job-a','printing/job-a/artwork/private.txt','owner');
  INSERT INTO print_proofs(id,print_job_id,file_key) VALUES('proof-a','job-a','printing/job-a/proof/private.txt');
  INSERT INTO print_quality_checks(id,print_job_id,checked_by,result,photo_key) VALUES('qc-a','job-a','owner','pass','printing/job-a/qc/private.txt');
  INSERT INTO print_finishing_records(id,print_job_id,finishing_type,cost_kobo,recorded_by) VALUES('finish-a','job-a','Binding',87654,'owner');
  INSERT INTO print_delivery_records(id,print_job_id,recipient_name,proof_key) VALUES('delivery-a','job-a','Private fixture recipient','printing/job-a/delivery/private.txt');
  INSERT INTO print_job_notes(id,print_job_id,note_type,note,created_by) VALUES
    ('note-a','job-a','production','Private fixture production note','owner'),
    ('finance-a','job-a','finance','FINANCE-SECRET-A','owner'),
    ('finance-b','job-b','finance','FINANCE-SECRET-B','other');
  INSERT INTO print_job_status_events(id,print_job_id,to_status,changed_by,note) VALUES('event-a','job-a','enquiry','owner','Private fixture timeline');
`);
const tables = ['print_jobs', 'print_job_materials', 'print_artwork_versions', 'print_proofs', 'print_quality_checks',
  'print_finishing_records', 'print_delivery_records', 'print_job_notes', 'print_job_status_events', 'audit_logs'];
const snapshot = () => tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
const baseline = snapshot();
const financialFields = ['quotedKobo', 'invoicedKobo', 'materialCostKobo', 'labourCostKobo', 'finishingCostKobo',
  'otherCostKobo', 'grossProfitKobo', 'marginBasisPoints', 'costKobo', 'unitCostKobo'];
let cases = 0;
const check = async (name, run) => { await run(); cases++; console.log(`PASS: ${name}`); };
const request = (actor, jobId = 'job-a') => new Request(`https://staffportal.test/api/printing/jobs/detail?jobId=${jobId}`, {
  headers: { origin: 'https://staffportal.test',
    ...(actor ? { cookie: `daenem_workforce_session=${tokens.get(actor) || 'invalid-fixture-session'}` } : {}) },
});
const send = async (actor, jobId) => {
  const response = await staging.default.fetch(request(actor, jobId), env, {});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://staffportal.test');
  assert.equal(response.headers.get('set-cookie'), null);
  return response;
};
const denied = async (actor, status, jobId = 'job-a', beforeQuery = false) => {
  const reads = [jobReads, childReads];
  const response = await send(actor, jobId);
  assert.equal(response.status, status);
  const text = await response.text();
  assert.doesNotMatch(text, /PRINT-SECRET|FINANCE-SECRET|Protected job|Private fixture|printing\/job|quotedKobo|SELECT|injected/i);
  if (beforeQuery) assert.deepEqual([jobReads, childReads], reads, 'denied before protected queries');
  return text;
};
const detail = async actor => {
  const response = await send(actor);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.job.id, 'job-a');
  assert.equal(result.job.status, 'enquiry', 'detail does not fabricate production/payment truth');
  for (const key of ['artwork', 'proofs', 'materials', 'qualityChecks', 'finishing', 'delivery', 'events']) {
    assert.equal(result[key].length, 1, `${key} remains available`);
  }
  assert.equal(result.materials[0].actualQuantity, 10);
  assert.equal(result.materials[0].wasteQuantity, 2);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-B|Protected job B/);
  return result;
};
const assertOperational = result => {
  const serialized = JSON.stringify(result);
  for (const field of financialFields) assert.ok(!serialized.includes(`"${field}"`), `no ${field}`);
  assert.doesNotMatch(serialized, /FINANCE-SECRET|111111|222222|98765|87654/);
  assert.deepEqual(result.notes.map(row => row.id), ['note-a']);
};
const assertFinancial = result => {
  assert.equal(result.job.quotedKobo, 111111);
  assert.equal(result.job.invoicedKobo, 222222);
  assert.equal(result.materials[0].unitCostKobo, 98765);
  assert.equal(result.finishing[0].costKobo, 87654);
  assert.ok(result.notes.some(row => row.note === 'FINANCE-SECRET-A'));
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden in Printing detail acceptance'); };
try {
  for (const actor of [null, 'invalid']) {
    await check(`missing/invalid session ${actor} denied before protected queries`, () => denied(actor, 401, 'job-a', true));
  }
  await check('other-company Printing authority cannot authorize target despite membership', () => denied('other', 403, 'job-a', true));
  await check('foreign and nonexistent job return the same neutral denial without child queries', async () => {
    const reads = childReads;
    assert.equal(await denied('viewer', 404, 'job-b'), await denied('viewer', 404, 'missing'));
    assert.equal(childReads, reads);
  });
  for (const actor of ['viewer', 'foreign-finance']) {
    await check(`${actor} gets operational detail without financial fields or finance notes`, async () => assertOperational(await detail(actor)));
  }
  for (const actor of ['approver', 'finance', 'owner']) {
    await check(`${actor} retains same-company financial detail`, async () => assertFinancial(await detail(actor)));
  }
  await check('explicit target-company finance denial wins over finance grant', async () => {
    db.exec("INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('deny-finance','finance','company-printing','finance-access','none','Fixture denial','owner')");
    assertOperational(await detail('finance'));
    db.exec("DELETE FROM employee_permission_overrides_v2 WHERE id='deny-finance'");
  });
  // Inject at the last child read: the response must not rely on the context
  // captured before these awaited queries. Use actual canonical auth SQL.
  for (const [name, mutate, restore, status] of [
    ['session revocation', "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id='viewer'", "UPDATE auth_sessions SET revoked_at=NULL WHERE id='viewer'", 401],
    ['session expiry', "UPDATE auth_sessions SET expires_at=datetime('now','-1 hour') WHERE id='viewer'", "UPDATE auth_sessions SET expires_at=datetime('now','+1 hour') WHERE id='viewer'", 401],
    ['inactive employee', "UPDATE employees SET employment_status='inactive' WHERE id='viewer'", "UPDATE employees SET employment_status='active' WHERE id='viewer'", 401],
    ['membership revocation', "UPDATE employee_company_memberships SET active=0 WHERE employee_id='viewer' AND company_id='company-printing'", "UPDATE employee_company_memberships SET active=1 WHERE employee_id='viewer' AND company_id='company-printing'", 403],
    ['role revocation', "UPDATE roles SET active=0 WHERE id='viewer'", "UPDATE roles SET active=1 WHERE id='viewer'", 403],
    ['company deactivation', "UPDATE companies SET active=0 WHERE id='company-printing'", "UPDATE companies SET active=1 WHERE id='company-printing'", 403],
    ['explicit none', "INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('deny-viewer','viewer','company-printing','print-access','none','Fixture denial','owner')", "DELETE FROM employee_permission_overrides_v2 WHERE id='deny-viewer'", 403],
  ]) {
    await check(`${name} during detail queries prevents disclosure`, async () => {
      afterDetailRead = () => db.exec(mutate);
      try { await denied('viewer', status); assert.equal(afterDetailRead, null); }
      finally { db.exec(restore); }
    });
  }
  await check('financial permission revoked during queries removes figures and finance notes', async () => {
    afterDetailRead = () => db.exec("UPDATE role_permissions SET access_level='none' WHERE id='finance-view'");
    try { assertOperational(await detail('finance')); }
    finally { db.exec("UPDATE role_permissions SET access_level='view' WHERE id='finance-view'"); }
  });
  await check('Printing approver downgraded during queries gets operational fields only', async () => {
    afterDetailRead = () => db.exec("UPDATE role_permissions SET access_level='view' WHERE id='approver'");
    try { assertOperational(await detail('approver')); }
    finally { db.exec("UPDATE role_permissions SET access_level='approve' WHERE id='approver'"); }
  });
  await check('job moved to another company during queries returns no captured detail', async () => {
    afterDetailRead = () => db.exec("UPDATE print_jobs SET company_id='company-bakery' WHERE id='job-a'");
    try { await denied('viewer', 404); }
    finally { db.exec("UPDATE print_jobs SET company_id='company-printing' WHERE id='job-a'"); }
  });
  await check('failed final authorization lookup returns bounded 503 without captured detail', async () => {
    afterDetailRead = () => { failAuthorization = true; };
    try { await denied('viewer', 503); }
    finally { failAuthorization = false; }
  });
  await check('read acceptance leaves all Printing/audit records unchanged and makes no external calls', async () => {
    assert.deepEqual(snapshot(), baseline);
    assert.equal(productWrites, 0, 'only canonical session last_seen updates are permitted');
    assert.equal(batches, 0);
    assert.equal(networkCalls, 0);
  });
  console.log(JSON.stringify({ passed: cases, total: cases, productionMutated: false, liveProviderCalls: networkCalls,
    limitation: 'Isolated SQLite composed route; real D1, independent exact-SHA QA and staging remain separate gates.' }));
} finally { globalThis.fetch = originalFetch; db.close(); }
