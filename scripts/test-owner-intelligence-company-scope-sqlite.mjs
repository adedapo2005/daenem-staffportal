// Owner intelligence must stay inside the actor's authority. Group-wide figures only for the database-confirmed
// group Owner or a current group admin; company figures only where the actor holds that domain's permission in
// that company; anything else is omitted (not zeroed), and an out-of-scope companyId gets one neutral denial.
// Loads the real worker/auth.ts session + permission resolution and ALL repository migrations on node:sqlite.
// Usage: node scripts/test-owner-intelligence-company-scope-sqlite.mjs [--source worker/other.ts]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = sourceFlag > 0 ? process.argv[sourceFlag + 1] : 'worker/owner-intelligence.ts';
const pepper = 'owner-intelligence-company-scope-fixture';
const COOKIE = 'daenem_workforce_session';

function instantiate(source, modules) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
    if (!(specifier in modules)) throw new Error(`unexpected import ${specifier}`);
    return modules[specifier];
  });
  return loaded.exports;
}

// D1 shim over node:sqlite. batch() runs statements in one transaction and returns per-statement results.
function d1(database) {
  const statement = (sql) => ({
    sql,
    values: [],
    bind(...values) { this.values = values; return this; },
    async first() { return database.prepare(sql).get(...this.values) ?? null; },
    async all() { return { success: true, results: database.prepare(sql).all(...this.values) }; },
    async run() { const r = database.prepare(sql).run(...this.values); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: statement,
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const out = statements.map(({ sql, values }) => {
          if (/^\s*SELECT/i.test(sql)) return { success: true, results: database.prepare(sql).all(...values) };
          const r = database.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(r.changes) }, results: [] };
        });
        database.exec('COMMIT');
        return out;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}

const migrationNames = (await readdir(new URL('migrations/', root))).filter((name) => name.endsWith('.sql')).sort();
const [authSource, ownerSource, ...migrations] = await Promise.all([
  read('worker/auth.ts'), read(sourcePath),
  ...migrationNames.map((name) => read(`migrations/${name}`)),
]);
const auth = instantiate(authSource, {});
const intelligence = instantiate(ownerSource, { './auth': auth });

const database = new DatabaseSync(':memory:');
for (const sql of migrations) database.exec(sql);
const env = {
  APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: d1(database),
  AI: {
    async run(_model, arg) { aiPrompts.push(arg.messages[1].content); return { response: 'Filtered brief' }; },
  },
};
const aiPrompts = [];
const run = (sql, ...values) => database.prepare(sql).run(...values);
const one = (sql, ...values) => database.prepare(sql).get(...values);

// ---- fixtures -------------------------------------------------------------------------------
// Month-internal date so every row falls inside the current-month window at any hour.
const now = new Date();
const monthDay = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-15`;

run("INSERT INTO company_locations(id,company_id,name) VALUES('loc-printing','company-printing','QA Printing Site')");
const people = {
  owner: ['emp-owner', ['company-printing']],        // group-level Owner
  groupAdmin: ['emp-group-admin', ['company-printing']], // group-level Group Admin, no domain grants
  staleAdmin: ['emp-stale-admin', ['company-printing']], // Group Admin whose membership ended
  dashboardMgr: ['emp-dash-mgr', ['company-printing', 'company-bakery']], // dashboard.access in printing only
  payroll: ['emp-payroll', ['company-printing']],    // payroll.access view + ai_guide view in printing only
  fakeOwner: ['emp-fake-owner', ['company-printing']], // company-level role coded owner, payroll view in printing
};
const tokens = {};
for (const [key, [id, companies]] of Object.entries(people)) {
  run('INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES(?,?,?,?,?)', id, `QA-${key}`, `QA ${key}`, `${key.toLowerCase()}@example.test`, 'active');
  companies.forEach((companyId, index) => run('INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,?,1)', `m-${id}-${companyId}`, id, companyId, index === 0 ? 1 : 0));
  tokens[key] = `token-${key}`;
  run("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 day'))", `s-${id}`, id, createHash('sha256').update(`${tokens[key]}:${pepper}`).digest('hex'));
}
run(`INSERT INTO roles(id,company_id,code,name) VALUES
  ('role-qa-dashboard-mgr','company-printing','qa_dashboard_mgr','QA dashboard manager'),
  ('role-qa-payroll','company-printing','qa_payroll','QA payroll viewer'),
  ('role-qa-fake-owner','company-printing','owner','Company-level role reusing the owner code')`);
const grantPermission = (id, roleId, code, level) => run(
  'INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT ?,?,id,? FROM permissions WHERE code=?', id, roleId, level, code);
grantPermission('rp-qa-dash-dashboard', 'role-qa-dashboard-mgr', 'dashboard.access', 'manage');
grantPermission('rp-qa-payroll-payroll', 'role-qa-payroll', 'payroll.access', 'view');
grantPermission('rp-qa-payroll-ai', 'role-qa-payroll', 'ai_guide.access', 'view');
grantPermission('rp-qa-fake-payroll', 'role-qa-fake-owner', 'payroll.access', 'view');
const grant = (id, employeeId, companyId, roleId) => run('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)', id, employeeId, companyId, roleId);
grant('er-owner', 'emp-owner', 'company-printing', 'role-owner');
grant('er-group-admin', 'emp-group-admin', 'company-printing', 'role-group-admin');
grant('er-stale-admin', 'emp-stale-admin', 'company-printing', 'role-group-admin');
grant('er-dash-mgr', 'emp-dash-mgr', 'company-printing', 'role-qa-dashboard-mgr');
grant('er-payroll', 'emp-payroll', 'company-printing', 'role-qa-payroll');
grant('er-fake-owner', 'emp-fake-owner', 'company-printing', 'role-qa-fake-owner');
// Withdrawn: membership in the company the Group Admin role was assigned through has ended.
run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-stale-admin' AND company_id='company-printing'");

// Representative company data with distinct markers, so a leak is visible in any response body.
run(`INSERT INTO payroll_runs(id,company_id,period_start,period_end,status,gross_total_kobo,net_total_kobo,prepared_by) VALUES
  ('pr-printing','company-printing',?,?, 'approved',600000,470000,'emp-owner'),
  ('pr-bakery','company-bakery',?,?, 'approved',950000,800000,'emp-owner')`, monthDay, monthDay, monthDay, monthDay);
run(`INSERT INTO inventory_items(id,company_id,sku,name,unit_cost_kobo,reorder_level,active) VALUES('inv-printing','company-printing','QA-SKU-1','QA stock item',111111,5,1)`);
run(`INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity,reserved_quantity) VALUES('sb-printing','company-printing','loc-printing','inv-printing',2,0)`);
run(`INSERT INTO maintenance_work_orders(id,company_id,title,status,priority,actual_cost_kobo) VALUES('mwo-printing','company-printing','QA repair','reported','high',333333)`);
run(`INSERT INTO sales_orders(id,company_id,order_no,order_date,status,total_kobo,created_by) VALUES('so-printing','company-printing','QA-SO-1',?, 'approved',444444,'emp-owner')`, monthDay);
run(`INSERT INTO security_logs(id,event_type,severity,company_id) VALUES('sec-printing','qa_probe','high','company-printing')`);

// Markers that only authorized figures may show.
const MARK = { payrollPrintingNet: '470000', payrollBakeryNet: '800000', inventoryValue: '222222', maintenanceCost: '333333', sales: '444444' };

// ---- helpers --------------------------------------------------------------------------------
async function call(actor, path, body) {
  const request = new Request(`https://staffportal.test${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { cookie: `${COOKIE}=${tokens[actor]}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = await auth.getSessionContext(request, env);
  assert.ok(context, `${actor} has a valid fixture session`);
  const response = await intelligence.routeOwnerIntelligence(request, env, context);
  assert.ok(response, `${path} is handled`);
  return { status: response.status, body: await response.json() };
}
const group = (actor) => call(actor, '/api/owner/intelligence');
const company = (actor, companyId) => call(actor, `/api/owner/intelligence?companyId=${companyId}`);
const ai = (actor, body) => call(actor, '/api/owner/ai', body);
const aiLogs = () => one('SELECT COUNT(*) AS n FROM ai_activity_logs').n;
const NEUTRAL = { error: 'Owner intelligence scope is unavailable.' };

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); } catch (error) { results.push([name, false, error.message.split('\n')[0]]); }
}

// ---- denied ---------------------------------------------------------------------------------
await check('dashboard manager (manage in printing) cannot open the group-wide view', async () => {
  const response = await group('dashboardMgr');
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, NEUTRAL);
});
await check('company-level role coded owner cannot open the group-wide view', async () => {
  assert.equal((await group('fakeOwner')).status, 403);
});
await check('withdrawn Group Admin (membership ended) cannot open the group-wide view', async () => {
  assert.equal((await group('staleAdmin')).status, 403);
});
await check('payroll viewer without group authority cannot open the group-wide view', async () => {
  assert.equal((await group('payroll')).status, 403);
});
await check('company the actor has no domain in: neutral denial identical to an unknown company', async () => {
  const foreign = await company('payroll', 'company-bakery');
  const unknown = await company('payroll', 'company-does-not-exist');
  assert.equal(foreign.status, 403);
  assert.equal(unknown.status, 403);
  assert.deepEqual(foreign.body, NEUTRAL);
  assert.deepEqual(unknown.body, NEUTRAL);
  assert.ok(!JSON.stringify(foreign.body).includes('Bakery'), 'no company metadata in the denial');
});
await check('dashboard manager with membership but no bakery domain is denied for bakery', async () => {
  const response = await company('dashboardMgr', 'company-bakery');
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, NEUTRAL);
});
await check('AI brief for a company outside the actor scope is denied and calls no provider', async () => {
  const before = aiPrompts.length, logsBefore = aiLogs();
  const response = await ai('payroll', { companyId: 'company-bakery', question: 'Payroll?' });
  assert.equal(response.status, 403);
  assert.equal(aiPrompts.length, before, 'no provider call');
  assert.equal(aiLogs(), logsBefore, 'no activity log row');
});
await check('AI brief without a company is denied to a non-group actor', async () => {
  const before = aiPrompts.length;
  assert.equal((await ai('payroll', { question: 'Payroll?' })).status, 403);
  assert.equal(aiPrompts.length, before, 'no provider call');
});

// ---- filtered (authorized but not everything) ----------------------------------------------
await check('payroll viewer sees only own-company payroll; other domains omitted, not zeroed', async () => {
  const response = await company('payroll', 'company-printing');
  assert.equal(response.status, 200);
  const text = JSON.stringify(response.body);
  assert.ok(text.includes(MARK.payrollPrintingNet), 'authorized payroll figure present');
  assert.ok(!text.includes(MARK.inventoryValue), 'inventory value withheld');
  assert.ok(!text.includes(MARK.maintenanceCost), 'maintenance cost withheld');
  assert.ok(!text.includes(MARK.sales), 'sales figure withheld');
  assert.ok(!text.includes(MARK.payrollBakeryNet), 'other company payroll withheld');
  assert.equal('inventory' in response.body.companies.printing, false, 'inventory omitted, not zero-filled');
  assert.equal('maintenance' in response.body.companies.printing, false, 'maintenance omitted, not zero-filled');
  assert.equal('workforce' in response.body.companies.printing, false, 'workforce omitted, not zero-filled');
  assert.equal('finance' in response.body, false, 'finance omitted');
  assert.equal('construction' in response.body, false, 'construction omitted');
  assert.equal('highRiskSecurity' in response.body.group, false, 'security omitted');
  assert.deepEqual(response.body.scope.companyIds, ['company-printing']);
});
await check('group Admin without domain grants gets the group scope with no ungranted figures', async () => {
  const response = await group('groupAdmin');
  assert.equal(response.status, 200);
  const text = JSON.stringify(response.body);
  for (const marker of Object.values(MARK)) assert.ok(!text.includes(marker), `marker ${marker} withheld`);
  assert.equal('payrollNetKobo' in response.body.group, false);
  assert.equal('inventoryValueKobo' in response.body.group, false);
  assert.equal('revenueKobo' in response.body.group, false);
  assert.equal('finance' in response.body, false);
  assert.equal('construction' in response.body, false);
});
await check('AI brief uses only the filtered data available to the actor', async () => {
  const before = aiPrompts.length;
  const response = await ai('payroll', { companyId: 'company-printing', question: 'Payroll today' });
  assert.equal(response.status, 200);
  assert.equal(aiPrompts.length, before + 1, 'provider called once');
  const prompt = aiPrompts.at(-1);
  assert.ok(prompt.includes(MARK.payrollPrintingNet), 'authorized payroll reaches the brief');
  assert.ok(!prompt.includes(MARK.inventoryValue), 'inventory withheld from the brief');
  assert.ok(!prompt.includes(MARK.maintenanceCost), 'maintenance withheld from the brief');
  assert.ok(!prompt.includes(MARK.payrollBakeryNet), 'other company withheld from the brief');
});

// ---- authorized (must still work) -----------------------------------------------------------
await check('group Owner receives every company and every domain', async () => {
  const response = await group('owner');
  assert.equal(response.status, 200);
  const text = JSON.stringify(response.body);
  for (const marker of Object.values(MARK)) assert.ok(text.includes(marker), `owner sees ${marker}`);
  assert.equal(response.body.group.payrollNetKobo, 470000 + 800000);
  assert.ok(response.body.scope.companyIds.includes('company-bakery'));
  assert.ok('finance' in response.body);
});
await check('group Owner can scope to a company they are not a member of', async () => {
  const response = await company('owner', 'company-bakery');
  assert.equal(response.status, 200);
  assert.equal(response.body.companies.bakery.payroll.netKobo, 800000);
});
await check('payroll viewer still sees the payroll figure they are granted (positive control)', async () => {
  const response = await company('payroll', 'company-printing');
  assert.equal(response.body.companies.printing.payroll.netKobo, 470000);
});

// ---- summary --------------------------------------------------------------------------------
database.close();
const failed = results.filter(([, ok]) => !ok);
for (const [name, ok, reason] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${reason}`}`);
console.log(`Owner intelligence company scope (${sourcePath}): ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;
