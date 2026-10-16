// A finance account may only be attached to a parent account of the SAME company, and that parent must be
// active. Loads the real worker/auth.ts session + permission resolution, applies the real migrations to SQLite
// (foreign keys on, as in D1), and checks database state on every refusal.
// Usage: node scripts/test-finance-account-parent-company-scope-sqlite.mjs [--source worker/other.ts]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = sourceFlag > 0 ? process.argv[sourceFlag + 1] : 'worker/finance.ts';
const pepper = 'finance-account-parent-company-scope-fixture';
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
run(`INSERT INTO finance_accounts(id,company_id,code,name,account_type,active) VALUES
  ('fa-a-cash','co-a','1000','A cash','asset',1),
  ('fa-a-retired','co-a','1900','A retired','asset',0),
  ('fa-b-cash','co-b','1000','B cash','asset',1),
  ('fa-b-parent','co-b','2000','B secret parent','liability',1)`);
run(`INSERT INTO roles(id,company_id,code,name) VALUES
  ('role-qa-coa-editor',NULL,'qa_coa_editor','QA Chart of Accounts Editor'),
  ('role-qa-fake-owner','co-a','owner','Company-level role reusing the owner code')`);
const grantPermission = (id, roleId, code, level) => run(
  'INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT ?,?,id,? FROM permissions WHERE code=?', id, roleId, level, code);
grantPermission('rp-qa-coa-editor', 'role-qa-coa-editor', 'finance.coa', 'edit');
grantPermission('rp-qa-fake-owner', 'role-qa-fake-owner', 'finance.coa', 'edit');
assert.equal(one("SELECT COUNT(*) AS n FROM role_permissions WHERE id IN ('rp-qa-coa-editor','rp-qa-fake-owner')").n, 2, 'fixture permissions exist');

const people = {
  owner: ['emp-owner', ['co-a']],              // group Owner, member of A only
  editorA: ['emp-editor-a', ['co-a', 'co-b']], // chart-of-accounts editor in A; plain member of B
  editorB: ['emp-editor-b', ['co-b']],         // chart-of-accounts editor in B only
  fakeOwner: ['emp-fake-owner', ['co-a']],     // company-level role coded 'owner' in A
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
grant('er-editor-a', 'emp-editor-a', 'co-a', 'role-qa-coa-editor');
grant('er-editor-b', 'emp-editor-b', 'co-b', 'role-qa-coa-editor');
grant('er-fake-owner', 'emp-fake-owner', 'co-a', 'role-qa-fake-owner');

// ---- helpers --------------------------------------------------------------------------------
async function call(actor, method, path, body) {
  const request = new Request(`https://staffportal.test${path}`, {
    method,
    headers: { cookie: `${COOKIE}=${tokens[actor]}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = await auth.getSessionContext(request, env);
  assert.ok(context, `${actor} has a valid fixture session`);
  const response = await finance.routeFinance(request, env, context);
  assert.ok(response, `${method} ${path} is handled`);
  return { status: response.status, body: await response.json() };
}
const createAccount = (actor, companyId, code, parentId) => call(actor, 'POST', '/api/finance/accounts', {
  companyId, code, name: `QA ${code}`, accountType: 'asset', ...(parentId === undefined ? {} : { parentId }),
});
const accountState = () => JSON.stringify(many('SELECT id,company_id,code,name,account_type,parent_id,active FROM finance_accounts ORDER BY id'));
const leaksB = (body) => JSON.stringify(body).match(/fa-b-|B cash|B secret|2000|QA-B/g) || [];

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([name, true]); } catch (error) { results.push([name, false, error.message.split('\n')[0]]); }
}
// Refused: exact status, no Company B metadata in the body, and the account table is unchanged.
async function assertRefused(actor, companyId, code, parentId, statuses) {
  const before = accountState();
  const response = await createAccount(actor, companyId, code, parentId);
  assert.ok(statuses.includes(response.status), `expected ${statuses.join('/')}, got ${response.status}`);
  assert.deepEqual(leaksB(response.body), [], 'no Company B metadata in the response');
  assert.equal(accountState(), before, 'no account row written');
  return response;
}

// ---- denied: a Company B parent on a Company A account ---------------------------------------
await check('A editor (also B member) cannot attach a B parent to an A account', () =>
  assertRefused('editorA', 'co-a', 'A-X1', 'fa-b-parent', [400]));
await check('group Owner cannot attach a B parent to an A account (integrity, not authorization)', () =>
  assertRefused('owner', 'co-a', 'A-X2', 'fa-b-parent', [400]));
await check('company-level role coded owner cannot attach a B parent to an A account', () =>
  assertRefused('fakeOwner', 'co-a', 'A-X3', 'fa-b-parent', [400]));
await check('a foreign parent and a nonexistent parent get the identical neutral response', async () => {
  const foreign = await assertRefused('editorA', 'co-a', 'A-X4', 'fa-b-parent', [400]);
  const missing = await assertRefused('editorA', 'co-a', 'A-X5', 'fa-does-not-exist', [400]);
  assert.equal(foreign.status, missing.status);
  assert.deepEqual(foreign.body, missing.body);
  assert.equal(foreign.body.error, 'Parent account is not valid for this company.');
});

// ---- denied: an inactive parent --------------------------------------------------------------
await check('retired (inactive) A parent is refused with no write', () =>
  assertRefused('editorA', 'co-a', 'A-X6', 'fa-a-retired', [400]));

// ---- denied: a B-only editor cannot create in A at all ---------------------------------------
await check('B-only editor cannot create an A account, with or without a parent', async () => {
  await assertRefused('editorB', 'co-a', 'A-X7', undefined, [403]);
  await assertRefused('editorB', 'co-a', 'A-X8', 'fa-a-cash', [403]);
});

// ---- authorized (must still work) -----------------------------------------------------------
await check('A editor attaches a same-company active parent', async () => {
  const before = accountState();
  const response = await createAccount('editorA', 'co-a', 'A-1100', 'fa-a-cash');
  assert.equal(response.status, 201);
  assert.equal(one('SELECT parent_id AS p, company_id AS c FROM finance_accounts WHERE id=?', response.body.id).p, 'fa-a-cash');
  assert.equal(one('SELECT company_id AS c FROM finance_accounts WHERE id=?', response.body.id).c, 'co-a');
  assert.notEqual(accountState(), before, 'the valid account is written');
});
await check('top-level account with no parent still works', async () => {
  const response = await createAccount('editorA', 'co-a', 'A-1200');
  assert.equal(response.status, 201);
  assert.equal(one('SELECT parent_id AS p FROM finance_accounts WHERE id=?', response.body.id).p, null);
});
await check('a null parent is treated as top-level', async () => {
  const response = await createAccount('editorA', 'co-a', 'A-1300', null);
  assert.equal(response.status, 201);
  assert.equal(one('SELECT parent_id AS p FROM finance_accounts WHERE id=?', response.body.id).p, null);
});
await check('B editor attaches a B parent to a B account (same-company positive)', async () => {
  const response = await createAccount('editorB', 'co-b', 'B-2100', 'fa-b-parent');
  assert.equal(response.status, 201);
  assert.equal(one('SELECT parent_id AS p FROM finance_accounts WHERE id=?', response.body.id).p, 'fa-b-parent');
});
await check('group Owner attaches an A parent to an A account', async () => {
  const response = await createAccount('owner', 'co-a', 'A-1400', 'fa-a-cash');
  assert.equal(response.status, 201);
});

// ---- summary --------------------------------------------------------------------------------
database.close();
const failed = results.filter(([, ok]) => !ok);
for (const [name, ok, reason] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${reason}`}`);
console.log(`Finance account parent company scope (${sourcePath}): ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) process.exitCode = 1;
