import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-events')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/budgets')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'provider-cost event read model exists');
assert.match(source, /'\/api\/financial-gateway\/cost-events'/);
assert.match(endpoint, /request\.method !== 'GET'/);
assert.match(endpoint, /companyIds\.includes\(requestedCompanyId\)/);
assert.match(endpoint, /const requestingModule = url\.searchParams\.get\('module'\)/);
assert.match(endpoint, /const provider = url\.searchParams\.get\('provider'\)/);
assert.match(endpoint, /const day = url\.searchParams\.get\('day'\)/);
assert.match(endpoint, /const actorEmployeeId = url\.searchParams\.get\('actorEmployeeId'\)/);
assert.match(endpoint, /date\(occurred_at\)=\?/);
assert.match(endpoint, /actor_employee_id=\?/);
assert.match(endpoint, /Choose a valid day in YYYY-MM-DD format/);
assert.match(endpoint, /Choose a valid requesting-user filter/);
assert.match(endpoint, /provider !== null && !\/\^\[a-z\]\[a-z0-9_-\]\{0,79\}\$\//);
assert.match(endpoint, /\^\[a-z\]\[a-z0-9_\.:-\]\{0,79\}\$/);
assert.match(endpoint, /requesting_module=\?/);
assert.match(endpoint, /provider=\?\)/);
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, provider, provider, requestingModule, requestingModule, day, day, month, month, actorEmployeeId, actorEmployeeId, limit\)/);
assert.match(endpoint, /module: requestingModule/);
assert.match(endpoint, /provider, module: requestingModule/);
assert.match(endpoint, /!Number\.isInteger\(limit\).*limit < 1 \|\| limit > 100/s);
assert.match(endpoint, /FROM financial_provider_cost_events\s+WHERE company_id IN \(\$\{placeholders\}\)/);
assert.match(endpoint, /strftime\('%Y-%m',occurred_at\)=\?/);
assert.match(endpoint, /ORDER BY occurred_at DESC,id DESC/);
for (const field of ['estimated_cost_minor AS estimatedCostMinor', 'actual_cost_minor AS actualCostMinor',
  'pricing_revision AS pricingRevision', 'pricing_verified_at AS pricingVerifiedAt', 'requesting_module AS requestingModule',
  'actor_employee_id AS actorEmployeeId', 'provider_reference AS providerReference']) {
  assert.ok(endpoint.includes(field), `internal finance projection includes ${field}`);
}
assert.doesNotMatch(endpoint, /provider_result|access_token|refresh_token|client_secret/i);
assert.match(endpoint, /visibleCompanyIds:\s*scopedCompanyIds/);
console.log('Financial provider-cost event read model: 24 assertions PASS');

// Execute the real route and SQL against synthetic, in-memory evidence only.
// Permission resolution is stubbed; the handler must still intersect its result
// with company membership and reject a requested company outside that scope.
const javascript = ts.transpileModule(source.replace(/^import .* from '\.\/auth';/m,
  `const hasPermission = (context, resource, action, companyId) =>
    resource === 'finance.reports' && action === 'view' && context.allowed.includes(companyId);`),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { routeFinancialGateway } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const db = new DatabaseSync(':memory:');
try {
  db.exec(`CREATE TABLE companies(id TEXT PRIMARY KEY);
    CREATE TABLE employees(id TEXT PRIMARY KEY);
    CREATE TABLE financial_provider_pricing(id TEXT PRIMARY KEY);
    INSERT INTO companies VALUES('company-printing'),('company-bakery');
    INSERT INTO employees VALUES('synthetic-user');`);
  for (const name of ['0079_financial_provider_cost_events', '0081_financial_provider_cost_event_module', '0086_financial_provider_pricing_revision']) {
    db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  const insert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,action,provider,requesting_module,occurred_at,provider_result)
    VALUES(?,?,'synthetic-user','estimate','paystack','finance',?,'internal-result-must-not-leak')`);
  for (const [id, company, time] of [
    ['august', 'company-printing', '2026-08-31T23:59:59Z'],
    ['september-start', 'company-printing', '2026-09-01T00:00:00Z'],
    ['september-end', 'company-printing', '2026-09-30T23:59:59Z'],
    ['october', 'company-printing', '2026-10-01T00:00:00Z'],
    ['offset-september', 'company-printing', '2026-10-01T00:30:00+01:00'],
    ['other-company', 'company-bakery', '2026-09-15T00:00:00Z'],
  ]) insert.run(id, company, time);
  let reads = 0;
  const env = { DB: { prepare(sql) {
    assert.match(sql, /^\s*SELECT/);
    return { bind(...args) { return { async all() {
      reads++;
      return { results: db.prepare(sql).all(...args) };
    } }; } };
  } } };
  const context = { roles: [], companies: [{ id: 'company-printing' }], allowed: ['company-printing', 'company-bakery'] };
  const request = (query, session = context) => routeFinancialGateway(
    new Request(`https://portal.invalid/api/financial-gateway/cost-events?${query}`), env, session);
  let response = await request('month=2026-09&provider=paystack&module=finance&actorEmployeeId=synthetic-user');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  let body = await response.json();
  assert.equal(body.month, '2026-09');
  assert.deepEqual(body.visibleCompanyIds, ['company-printing']);
  assert.deepEqual(body.events.map(event => event.id).sort(), ['offset-september', 'september-end', 'september-start']);
  assert.ok(!JSON.stringify(body).includes('internal-result-must-not-leak'));
  body = await (await request('month=2026-09&day=2026-09-01')).json();
  assert.deepEqual(body.events.map(event => event.id), ['september-start']);
  body = await (await request('month=2026-09&day=2026-08-31')).json();
  assert.deepEqual(body.events, []);
  body = await (await request('month=2026-09&limit=1')).json();
  assert.equal(body.events.length, 1);
  body = await (await request('')).json();
  assert.equal(body.month, null);
  assert.equal(body.events.length, 5, 'omitting month preserves existing behavior');
  const readsBeforeRejections = reads;
  for (const month of ['', '2026-00', '2026-13', '2026-9', '2026-09-01', "2026-09' OR 1=1"]) {
    assert.equal((await request(`month=${encodeURIComponent(month)}`)).status, 400);
  }
  assert.equal((await request('month=2026-09&companyId=company-bakery')).status, 403);
  assert.equal((await request('month=2026-09', { ...context, allowed: [] })).status, 403);
  assert.equal(reads, readsBeforeRejections, 'invalid and unauthorized requests never query cost evidence');
  console.log('Financial provider-cost monthly drilldown: runtime/SQLite PASS');
} finally {
  db.close();
}
