import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
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
    CREATE TABLE spend_cost_centers(id TEXT PRIMARY KEY,company_id TEXT);
    INSERT INTO companies VALUES('company-printing'),('company-bakery');`);
  for (const name of ['0079_financial_provider_cost_events', '0081_financial_provider_cost_event_module',
    '0086_financial_provider_pricing_revision', '0089_financial_provider_cost_center', '0090_financial_provider_cost_service']) {
    db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  const insert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,occurred_at,estimated_cost_minor,actual_cost_minor,cost_currency,service)
    VALUES(?,?,'estimate','paystack',?,'2026-09-15T12:00:00Z',20,?,?,?)`);
  insert.run('a', 'company-printing', 'finance', 10, 'NGN', 'Verify Account');
  insert.run('b', 'company-printing', 'finance', null, 'NGN', 'Verify Account');
  insert.run('c', 'company-printing', 'hr', 30, 'USD', 'Verify Account');
  insert.run('d', 'company-printing', 'finance', 40, 'NGN', null);
  insert.run('e', 'company-printing', 'finance', 50, 'NGN', 'verify account');
  insert.run('f', 'company-bakery', 'finance', 900, 'NGN', 'Verify Account');
  insert.run('g', 'company-bakery', 'finance', 800, 'NGN', 'Private Service');
  const invalid = ['', ' ', 'x'.repeat(121), 'a\nb', 'a\u0000b', 'a\u007fb'];
  for (const value of invalid) assert.throws(() => insert.run('invalid', 'company-printing', 'finance', 1, 'NGN', value), /CHECK/);
  assert.throws(() => db.exec("UPDATE financial_provider_cost_events SET service='Changed' WHERE id='a'"), /append-only/);
  let reads = 0;
  const env = { DB: { prepare(sql) {
    assert.match(sql, /^\s*SELECT/);
    return { bind(...args) { return { async all() {
      reads++;
      return { results: db.prepare(sql).all(...args) };
    } }; } };
  } } };
  const context = { roles: [], companies: [{ id: 'company-printing' }], allowed: ['company-printing', 'company-bakery'] };
  const request = (endpoint, query = {}, session = context) => routeFinancialGateway(
    new Request(`https://portal.invalid/api/financial-gateway/${endpoint}?${new URLSearchParams({ month: '2026-09', ...query })}`), env, session);
  const read = async (endpoint, query, session) => (await request(endpoint, query, session)).json();
  const filter = { service: 'Verify Account' };
  const summary = await read('cost-summary', filter);
  assert.equal(summary.service, filter.service);
  assert.deepEqual(summary.summaries.map(row => [row.currency, row.eventCount, row.actualCostEventCount, row.actualCostMinor, row.estimatedCostMinor]),
    [['NGN', 2, 1, 10, 40], ['USD', 1, 1, 30, 20]]);
  const ids = [];
  let cursor;
  do {
    const page = await read('cost-events', { ...filter, limit: '1', ...(cursor ? { cursor } : {}) });
    assert.ok(page.events.every(row => row.service === filter.service && row.companyId === 'company-printing'));
    ids.push(...page.events.map(row => row.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(ids, ['c', 'b', 'a']);
  const first = await read('cost-summary', { ...filter, limit: '1' });
  const second = await read('cost-summary', { ...filter, limit: '1', cursor: first.nextCursor });
  assert.deepEqual([...first.summaries, ...second.summaries], summary.summaries);
  assert.equal(second.nextCursor, null);
  assert.equal((await read('cost-events')).events.find(row => row.id === 'd').service, null);
  assert.equal((await read('cost-summary')).summaries.find(row => row.currency === 'NGN').actualCostMinor, 100);
  for (const endpoint of ['cost-events', 'cost-summary']) {
    const key = endpoint === 'cost-events' ? 'events' : 'summaries';
    assert.deepEqual((await read(endpoint, { service: 'Private Service' }))[key],
      (await read(endpoint, { service: 'Absent' }))[key]);
    assert.deepEqual((await read(endpoint, { service: "a' OR 1=1" }))[key], []);
    assert.deepEqual((await read(endpoint, { ...filter, module: 'hr', costCurrency: 'NGN' }))[key], []);
    assert.deepEqual((await read(endpoint, { ...filter, provider: 'mono' }))[key], []);
    const multi = { ...context, companies: [{ id: 'company-printing' }, { id: 'company-bakery' }] };
    const bakery = await read(endpoint, { ...filter, companyId: 'company-bakery' }, multi);
    assert.equal(bakery[key].length, 1);
    assert.equal(bakery[key][0].companyId, 'company-bakery');
    const before = reads;
    for (const service of invalid) assert.equal((await request(endpoint, { service })).status, 400);
    assert.equal((await request(endpoint, filter, { ...context, allowed: [] })).status, 403);
    assert.equal((await request(endpoint, { ...filter, companyId: 'company-bakery' })).status, 403);
    assert.equal(reads, before, 'invalid and denied requests do not read evidence');
  }
  assert.equal((await request('cost-summary', { ...filter, cursor: first.nextCursor }, { ...context, allowed: [] })).status, 403);
  console.log('Provider-cost service attribution, scoped drilldown and summary pagination: PASS');
} finally {
  db.close();
}
