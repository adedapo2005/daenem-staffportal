import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const migration = await readFile(new URL('../migrations/0088_financial_provider_routing_policies.sql', import.meta.url), 'utf8');
const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/routing-policies')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/pricing/admin')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'routing policy handler is registered before other financial routes');
assert.match(migration, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(migration, /company-farms/);
assert.match(migration, /provider IN \('paystack','monnify','mono','manual_import'\)/);
assert.match(migration, /UNIQUE\(company_id,service,provider\)/);
assert.match(migration, /UNIQUE\(company_id,service,priority\)/);
assert.match(endpoint, /if \(request\.method === 'POST'\) \{\s*if \(!isOwner\).*403/s);
assert.match(endpoint, /hasPermission\(context, 'finance\.reports', 'view', id\)/);
assert.match(endpoint, /Number\.isInteger\(priority\).*priority < 1 \|\| priority > 20/);
assert.match(endpoint, /'enabled', 'disabled', 'owner_action_required'/);
assert.match(endpoint, /WHERE changes\(\)=1 AND EXISTS/);
assert.match(endpoint, /Number\(results\[0\].*meta\?\.changes.*!== 1/);
assert.match(endpoint, /save_provider_routing_policy/);
assert.match(endpoint, /providerCallMade: false/);
assert.match(endpoint, /providerExecutionEnabled: false/);
assert.doesNotMatch(endpoint, /fetch\(|Authorization|access_token|client_secret/i);

const javascript = ts.transpileModule(source.replace(/^import .* from '\.\/auth';/m,
  "const hasPermission = (context, resource, action, companyId) => resource === 'finance.reports' && action === 'view' && context.allowed.includes(companyId);"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { routeFinancialGateway } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const db = new DatabaseSync(':memory:');
try {
  db.exec("CREATE TABLE companies(id TEXT PRIMARY KEY); CREATE TABLE employees(id TEXT PRIMARY KEY); INSERT INTO companies VALUES('company-printing'),('company-bakery');");
  db.exec(migration);
  const insert = db.prepare(`INSERT INTO financial_provider_routing_policies
    (id,company_id,service,provider,priority,status,routing_reason) VALUES(?,?,?,'paystack',1,'disabled','test')`);
  for (let n = 0; n < 5; n++) insert.run(`p${n}`, 'company-printing', `service-${n}`);
  insert.run('p9', 'company-bakery', 'foreign-service');
  let reads = 0;
  const env = { DB: { prepare(sql) {
    assert.match(sql, /^\s*SELECT/);
    return { bind(...args) { return { async all() {
      reads++;
      return { results: db.prepare(sql).all(...args) };
    } }; } };
  } } };
  const allowed = { roles: [], companies: [{ id: 'company-printing' }], allowed: ['company-printing'] };
  const request = (query, context = allowed) => routeFinancialGateway(
    new Request(`https://portal.invalid/api/financial-gateway/routing-policies?${query}`), env, context);
  const first = await (await request('limit=2')).json();
  assert.deepEqual(first.policies.map((row) => row.id), ['p0', 'p1']);
  assert.equal(first.nextCursor, 'p1');
  assert.deepEqual(first.visibleCompanyIds, ['company-printing']);
  assert.equal(first.providerExecutionEnabled, false);
  const second = await (await request(`limit=2&afterId=${first.nextCursor}`)).json();
  assert.deepEqual(second.policies.map((row) => row.id), ['p2', 'p3']);
  assert.equal(second.nextCursor, 'p3');
  const last = await (await request(`limit=2&afterId=${second.nextCursor}`)).json();
  assert.deepEqual(last.policies.map((row) => row.id), ['p4']);
  assert.equal(last.nextCursor, null);
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=2e1', 'afterId=%27']) {
    assert.equal((await request(query)).status, 400);
  }
  assert.equal((await request('companyId=company-bakery')).status, 403);
  const owner = { roles: [{ code: 'owner' }], companies: [], allowed: [] };
  const bakery = await (await request('companyId=company-bakery&limit=2', owner)).json();
  assert.deepEqual(bakery.policies.map((row) => row.id), ['p9']);
  assert.ok(reads >= 4);
} finally {
  db.close();
}

console.log('Financial provider routing policy boundaries and scoped pagination: PASS');
