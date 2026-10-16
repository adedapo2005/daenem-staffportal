// Finance budgets and reports must be authorized in the TARGET company, never by a grant in
// another company plus mere membership. Loads the real worker/auth.ts session + permission
// resolution, applies the real migrations to SQLite, and checks database state for every denial.
// Usage: node scripts/test-finance-budget-company-scope-sqlite.mjs [--source worker/other.ts]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = sourceFlag > 0 ? process.argv[sourceFlag + 1] : 'worker/finance-advanced.ts';
const pepper = 'finance-budget-company-scope-fixture';
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
        const out = statements.map(({ sql, values }) => ({ success: true, meta: { changes: Number(database.prepare(sql).run(...values).changes) } }));
        database.exec('COMMIT');
        return out;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}

const [authSource, financeSource, ...migrations] = await Promise.all([
  read('worker/auth.ts'), read(sourcePath),
  ...['0001_core', '0002_identity_auth', '0019_employee_permission_overrides_v2', '0022_finance_ledger']
    .map((name) => read(`migrations/${name}.sql`)),
]);
const auth = instantiate(authSource, {});
const finance = instantiate(financeSource, { './auth': auth });

const database = new DatabaseSync(':memory:');
for (const sql of migrations) database.exec(sql);
const env = { APP_STAGE: 'test', AUTH_PEPPER: pepper, DB: d1(database) };
const run = (sql, ...values) => database.prepare(sql).run(...values);
const one = (sql, ...values) => database.prepare(sql).get(...values);
const many = (sql, ...values) => database.prepare(sql).all(...values);

// ---- fixtures -------------------------------------------------------------------------------
run("INSERT INTO companies(id,code,name,business_type) VALUES('co-a','QA-A','QA Company A','other'),('co-b','QA-B','QA Company B','other')");
run(`INSERT INTO finance_accounts(id,company_id,code,name,account_type) VALUES
  ('fa-a-exp','co-a','5000','QA A Expenses','expense'),('fa-a-rev','co-a','4000','QA A Revenue','revenue'),
  ('fa-b-exp','co-b','5000','QA B Expenses','expense'),('fa-b-rev','co-b','4000','QA B Revenue','revenue')`);
run(`INSERT INTO fiscal_periods(id,company_id,name,start_date,end_date) VALUES
  ('fp-a','co-a','QA A FY','2026-01-01','2026-12-31'),('fp-b','co-b','QA B FY','2026-01-01','2026-12-31')`);
run(`INSERT INTO budgets(id,company_id,fiscal_period_id,name,status) VALUES
  ('bud-a','co-a','fp-a','QA A plan','draft'),('bud-b','co-b','fp-b','QA B plan','draft'),('bud-b2','co-b','fp-b','QA B second plan','draft')`);
run(`INSERT INTO budget_lines(id,budget_id,account_id,period_key,amount_kobo) VALUES
  ('bl-a','bud-a','fa-a-exp','2026-01',100000),('bl-b','bud-b','fa-b-exp','2026-01',777700)`);
run(`INSERT INTO journal_entries(id,company_id,entry_no,entry_date,description,status) VALUES
  ('je-b','co-b','QA-B-1','2026-02-01','QA B sale','posted')`);
run(`INSERT INTO journal_lines(id,journal_entry_id,account_id,debit_kobo,credit_kobo) VALUES
  ('jl-b-1','je-b','fa-b-exp',0,0),('jl-b-2','je-b','fa-b-rev',0,555500)`);

run(`INSERT INTO roles(id,company_id,code,name) VALUES
  ('role-qa-budget-approver',NULL,'qa_budget_approver','QA Budget Approver'),
  ('role-qa-budget-editor',NULL,'qa_budget_editor','QA Budget Editor'),
  ('role-qa-reports',NULL,'qa_reports','QA Reports Viewer'),
  ('role-qa-fake-owner','co-a','owner','Company-level role reusing the owner code')`);
const grantPermission = (id, roleId, code, level) => run(
  'INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT ?,?,id,? FROM permissions WHERE code=?', id, roleId, level, code);
grantPermission('rp-qa-approver', 'role-qa-budget-approver', 'finance.budgets', 'approve');
grantPermission('rp-qa-editor', 'role-qa-budget-editor', 'finance.budgets', 'create');
grantPermission('rp-qa-reports', 'role-qa-reports', 'finance.reports', 'view');
grantPermission('rp-qa-fake-owner-budgets', 'role-qa-fake-owner', 'finance.budgets', 'approve');
grantPermission('rp-qa-fake-owner-reports', 'role-qa-fake-owner', 'finance.reports', 'view');
assert.equal(one("SELECT COUNT(*) AS n FROM role_permissions WHERE id LIKE 'rp-qa-%'").n, 5, 'fixture permissions exist');

const people = {
  owner: ['emp-owner', ['co-a']],            // group Owner, deliberately NOT a member of co-b
  mgrA: ['emp-mgr-a', ['co-a', 'co-b']],     // approver + reports in A only; plain member of B
  mgrB: ['emp-mgr-b', ['co-b']],
  editorA: ['emp-editor-a', ['co-a', 'co-b']], // create in A only
  fakeOwner: ['emp-fake-owner', ['co-a']],   // company-level role coded 'owner' in A
  multi: ['emp-multi', ['co-a', 'co-b']],    // approver in both A and B
  overridden: ['emp-overridden', ['co-a', 'co-b']], // approver in A and B, scoped override 'none' in B
  movedB: ['emp-moved-b', ['co-a', 'co-b']], // approver in A and B, B membership ended
  stale: ['emp-stale', ['co-a']],
};
const tokens = {};
for (const [key, [id, companies]] of Object.entries(people)) {
  run('INSERT INTO employees(id,employee_no,display_name,email,employment_status) VALUES(?,?,?,?,?)', id, `QA-${key}`, `QA ${key}`, `${key.toLowerCase()}@example.test`, 'active');
  companies.forEach((companyId, index) => run('INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,?,1)', `m-${id}-${companyId}`, id, companyId, index === 0 ? 1 : 0));
  tokens[key] = `token-${key}`;
  run("INSERT INTO auth_sessions(id,employee_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+1 day'))", `s-${id}`, id, createHash('sha256').update(`${tokens[key]}:${pepper}`).digest('hex'));
}
const grant = (id, employeeId, companyId, roleId) => run('INSERT INTO employee_roles(id,employee_id,company_id,role_id) VALUES(?,?,?,?)', id, employeeId, companyId, roleId);
grant('er-owner', 'emp-owner', 'co-a', 'role-owner');
grant('er-mgr-a', 'emp-mgr-a', 'co-a', 'role-qa-budget-approver');
grant('er-mgr-a-rep', 'emp-mgr-a', 'co-a', 'role-qa-reports');
grant('er-mgr-b', 'emp-mgr-b', 'co-b', 'role-qa-budget-approver');
grant('er-mgr-b-rep', 'emp-mgr-b', 'co-b', 'role-qa-reports');
grant('er-editor-a', 'emp-editor-a', 'co-a', 'role-qa-budget-editor');
grant('er-fake-owner', 'emp-fake-owner', 'co-a', 'role-qa-fake-owner');
grant('er-multi-a', 'emp-multi', 'co-a', 'role-qa-budget-approver');
grant('er-multi-b', 'emp-multi', 'co-b', 'role-qa-budget-approver');
grant('er-overridden-a', 'emp-overridden', 'co-a', 'role-qa-budget-approver');
grant('er-overridden-b', 'emp-overridden', 'co-b', 'role-qa-budget-approver');
run("INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by) VALUES('ov-b','emp-overridden','co-b','perm-finance-budgets','none','QA deny-wins','emp-owner')");
grant('er-moved-b-a', 'emp-moved-b', 'co-a', 'role-qa-budget-approver');
grant('er-moved-b-b', 'emp-moved-b', 'co-b', 'role-qa-budget-approver');
run("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-moved-b' AND company_id='co-b'");
grant('er-stale', 'emp-stale', 'co-a', 'role-qa-budget-approver');

// ---- helpers --------------------------------------------------------------------------------
async function contextFor(actor) {
  const request = new Request('https://staffportal.test/api/auth/me', { headers: { cookie: `${COOKIE}=${tokens[actor]}` } });
  const context = await auth.getSessionContext(request, env);
  assert.ok(context, `${actor} has a valid fixture session`);
  return context;
}
async function call(actor, method, path, body) {
  const request = new Request(`https://staffportal.test${path}`, {
    method,
    headers: { cookie: `${COOKIE}=${tokens[actor]}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = await auth.getSessionContext(request, env);
  assert.ok(context, `${actor} has a valid fixture session`);
  const response = await finance.routeFinanceAdvanced(request, env, context);
  assert.ok(response, `${method} ${path} is handled`);
  return { status: response.status, body: await response.json() };
}
const list = (actor, companyId) => call(actor, 'GET', `/api/finance/budgets?companyId=${companyId}`);
const detail = (actor, id) => call(actor, 'GET', `/api/finance/budgets/detail?id=${id}`);
const create = (actor, companyId, accountId) => call(actor, 'POST', '/api/finance/budgets', {
  companyId, name: 'QA injected plan', lines: [{ accountId, periodKey: '2026-03', amountNaira: 999 }],
});
const approve = (actor, id, lock = false) => call(actor, 'POST', '/api/finance/budgets/approve', { id, lock });
const report = (actor, companyId) => call(actor, 'GET', `/api/finance/reports?companyId=${companyId}&startDate=2026-01-01&endDate=2026-12-31`);

const budgetState = () => JSON.stringify({
  budgets: many('SELECT id,company_id,status,approved_by,approved_at,name FROM budgets ORDER BY id'),
  lines: many('SELECT id,budget_id,account_id,amount_kobo FROM budget_lines ORDER BY id'),
});
const denials = (employeeId) => one("SELECT COUNT(*) AS n FROM security_logs WHERE employee_id=? AND event_type IN ('finance_budget_denied','finance_report_denied') AND result='denied'", employeeId).n;
const leaksB = (body) => JSON.stringify(body).match(/bud-b|QA B|777700|555500|fa-b-/g) || [];

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); } catch (error) { results.push([name, false, error.message.split('\n')[0]]); }
}
// Every denial: refused, no co-b data in the body, database unchanged. Auditing is checked separately
// so that a missing audit row is never confused with a live access hole.
async function assertDenied(actor, action, statuses) {
  const before = budgetState();
  const response = await action();
  assert.ok(statuses.includes(response.status), `expected ${statuses.join('/')}, got ${response.status}`);
  assert.deepEqual(leaksB(response.body), [], 'no Company B finance data in the response');
  assert.equal(budgetState(), before, 'budgets and budget lines unchanged');
  return response;
}

// ---- denied: Company A grant + Company B membership -----------------------------------------
await check('A approver (also B member) cannot list B budgets', () => assertDenied('mgrA', () => list('mgrA', 'co-b'), [403]));
await check('A approver cannot read B budget detail', () => assertDenied('mgrA', () => detail('mgrA', 'bud-b'), [404]));
await check('A approver cannot approve B budget', () => assertDenied('mgrA', () => approve('mgrA', 'bud-b'), [404]));
await check('A approver cannot lock B budget', () => assertDenied('mgrA', () => approve('mgrA', 'bud-b2', true), [404]));
await check('A editor (also B member) cannot create a B budget', () => assertDenied('editorA', () => create('editorA', 'co-b', 'fa-b-exp'), [403]));
await check('A reports viewer (also B member) cannot read B trial balance / P&L', () => assertDenied('mgrA', () => report('mgrA', 'co-b'), [403]));
await check('B-only approver cannot touch A budgets or reports', async () => {
  await assertDenied('mgrB', () => list('mgrB', 'co-a'), [403]);
  await assertDenied('mgrB', () => approve('mgrB', 'bud-a'), [404]);
  await assertDenied('mgrB', () => report('mgrB', 'co-a'), [403]);
});
await check('unknown budget and foreign budget get the identical neutral response', async () => {
  const unknown = await detail('mgrA', 'bud-does-not-exist');
  const foreign = await detail('mgrA', 'bud-b');
  assert.equal(unknown.status, foreign.status);
  assert.deepEqual(unknown.body, foreign.body);
  const unknownApprove = await approve('mgrA', 'bud-does-not-exist');
  const foreignApprove = await approve('mgrA', 'bud-b');
  assert.equal(unknownApprove.status, foreignApprove.status);
  assert.deepEqual(unknownApprove.body, foreignApprove.body);
});
await check('unknown company and foreign company get the identical neutral response', async () => {
  for (const fn of [list, report]) {
    const unknown = await fn('mgrA', 'co-does-not-exist');
    const foreign = await fn('mgrA', 'co-b');
    assert.equal(unknown.status, foreign.status);
    assert.deepEqual(unknown.body, foreign.body);
  }
  const unknownCreate = await create('editorA', 'co-does-not-exist', 'fa-b-exp');
  const foreignCreate = await create('editorA', 'co-b', 'fa-b-exp');
  assert.equal(unknownCreate.status, foreignCreate.status);
  assert.deepEqual(unknownCreate.body, foreignCreate.body);
});
await check('A editor cannot approve an A budget (create is not approve)', async () => {
  const before = budgetState();
  assert.equal((await approve('editorA', 'bud-a')).status, 403);
  assert.equal(budgetState(), before);
});

// ---- denied: multi-company, deny-wins and revocation ----------------------------------------
await check('scoped override none in B wins over the B role grant', async () => {
  await assertDenied('overridden', () => list('overridden', 'co-b'), [403]);
  await assertDenied('overridden', () => approve('overridden', 'bud-b'), [404]);
});
await check('ended B membership withdraws B budget authority despite the B role', async () => {
  await assertDenied('movedB', () => detail('movedB', 'bud-b'), [404]);
  await assertDenied('movedB', () => approve('movedB', 'bud-b', true), [404]);
});
await check('withdrawn grant is refused at request time with no writes', async () => {
  assert.equal((await list('stale', 'co-a')).status, 200, 'grant works before withdrawal');
  run("DELETE FROM employee_roles WHERE id='er-stale'");
  const before = budgetState();
  assert.equal((await approve('stale', 'bud-a')).status, 403);
  assert.equal((await list('stale', 'co-a')).status, 403);
  assert.equal(budgetState(), before);
});

// ---- fake group Owner: company-level role coded 'owner' -------------------------------------
await check('company-level role coded owner is not treated as group Owner by the session', async () => {
  const context = await contextFor('fakeOwner');
  assert.ok(one("SELECT 1 AS ok FROM employee_roles er JOIN roles r ON r.id=er.role_id WHERE er.employee_id='emp-fake-owner' AND r.code='owner' AND r.company_id='co-a'"), 'fake owner role is assigned in the DB');
  assert.deepEqual(context.roles.filter((r) => r.code === 'owner'), [], 'auth.ts drops company-level owner roles from the session');
  assert.equal(context.companyPermissions['co-a']?.['finance.budgets'], 'approve', 'its ordinary A permissions still apply');
});
// Measures access only (any refusal, no data, no writes); neutral status codes are checked above.
await check('company-level role coded owner cannot reach Company B budgets or reports', async () => {
  await assertDenied('fakeOwner', () => list('fakeOwner', 'co-b'), [403]);
  await assertDenied('fakeOwner', () => detail('fakeOwner', 'bud-b'), [404]);
  await assertDenied('fakeOwner', () => approve('fakeOwner', 'bud-b', true), [404]);
  await assertDenied('fakeOwner', () => create('fakeOwner', 'co-b', 'fa-b-exp'), [400, 403]);
  await assertDenied('fakeOwner', () => report('fakeOwner', 'co-b'), [403]);
});

// ---- audit of denials ------------------------------------------------------------------------
await check('denials are audited against the actor with ids only', async () => {
  for (const [actor, action] of [['mgrA', () => approve('mgrA', 'bud-b')], ['fakeOwner', () => report('fakeOwner', 'co-b')], ['editorA', () => create('editorA', 'co-b', 'fa-b-exp')]]) {
    const employeeId = people[actor][0];
    const logsBefore = denials(employeeId);
    await action();
    assert.equal(denials(employeeId), logsBefore + 1, `${actor} denial recorded once`);
    const row = one("SELECT details_json AS d FROM security_logs WHERE employee_id=? AND event_type LIKE 'finance_%_denied' ORDER BY rowid DESC LIMIT 1", employeeId);
    assert.deepEqual(leaksB(JSON.parse(row.d)).filter((m) => m !== 'bud-b'), [], 'audit details carry ids only, no finance data');
  }
});

// ---- cross-company references inside an authorized create ----------------------------------
await check('A editor cannot attach a B fiscal period or B account to an A budget', async () => {
  const before = budgetState();
  const period = await call('editorA', 'POST', '/api/finance/budgets', { companyId: 'co-a', name: 'QA cross period', fiscalPeriodId: 'fp-b', lines: [] });
  assert.equal(period.status, 400, `foreign fiscal period refused, got ${period.status}`);
  assert.equal((await create('editorA', 'co-a', 'fa-b-exp')).status, 400, 'foreign account refused');
  assert.equal(budgetState(), before);
});

// ---- authorized (must still work) -----------------------------------------------------------
await check('A approver lists, reads and approves own-company budget', async () => {
  const ids = ((await list('mgrA', 'co-a')).body.budgets || []).map((r) => r.id);
  assert.ok(ids.includes('bud-a') && !ids.some((id) => id.startsWith('bud-b')), 'own-company budgets only');
  assert.equal((await detail('mgrA', 'bud-a')).body.lines?.[0]?.amountKobo, 100000);
  assert.equal((await approve('mgrA', 'bud-a')).status, 200);
  assert.equal(one("SELECT status,approved_by AS by FROM budgets WHERE id='bud-a'").by, 'emp-mgr-a');
});
await check('A editor creates an own-company draft budget with own accounts', async () => {
  const response = await create('editorA', 'co-a', 'fa-a-exp');
  assert.equal(response.status, 201);
  assert.equal(one('SELECT company_id AS c FROM budgets WHERE id=?', response.body.id).c, 'co-a');
  assert.equal(one('SELECT COUNT(*) AS n FROM budget_lines WHERE budget_id=?', response.body.id).n, 1);
});
await check('A reports viewer reads own-company reports', async () => {
  const response = await report('mgrA', 'co-a');
  assert.equal(response.status, 200);
  assert.ok(response.body.trialBalance.accounts.some((a) => a.id === 'fa-a-rev'));
});
await check('B approver reads B report and approves B budget', async () => {
  const response = await report('mgrB', 'co-b');
  assert.equal(response.status, 200);
  assert.equal(response.body.profitLoss.revenueKobo, 555500);
  assert.equal((await approve('mgrB', 'bud-b')).status, 200);
});
await check('approver in both companies can work in A and B', async () => {
  assert.equal((await list('multi', 'co-a')).status, 200);
  assert.equal((await list('multi', 'co-b')).status, 200);
  run("INSERT INTO budgets(id,company_id,name,status) VALUES('bud-b3','co-b','QA B multi plan','draft')");
  assert.equal((await approve('multi', 'bud-b3', true)).status, 200);
  assert.equal(one("SELECT status FROM budgets WHERE id='bud-b3'").status, 'locked');
});
await check('group Owner reaches a company without membership (list, detail, create, report)', async () => {
  assert.ok((await list('owner', 'co-b')).body.budgets?.some((r) => r.id === 'bud-b'));
  assert.equal((await detail('owner', 'bud-b')).status, 200);
  assert.equal((await create('owner', 'co-b', 'fa-b-exp')).status, 201);
  assert.equal((await report('owner', 'co-b')).status, 200);
});

// ---- summary --------------------------------------------------------------------------------
database.close();
const failed = results.filter(([, ok]) => !ok);
for (const [name, ok, reason] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${reason}`}`);
console.log(`Finance budget/report company scope (${sourcePath}): ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;
