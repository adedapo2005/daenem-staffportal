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
    CREATE TABLE spend_cost_centers(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id));
    INSERT INTO companies VALUES('company-printing'),('company-bakery');
    INSERT INTO spend_cost_centers VALUES('print-general','company-printing'),('print-ops','company-printing'),('bakery-general','company-bakery');`);
  for (const name of ['0079_financial_provider_cost_events', '0081_financial_provider_cost_event_module',
    '0086_financial_provider_pricing_revision', '0089_financial_provider_cost_center', '0090_financial_provider_cost_service']) {
    db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  const insert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,occurred_at,estimated_cost_minor,actual_cost_minor,cost_currency,cost_center_id)
    VALUES(?,?,'estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,'NGN',?)`);
  insert.run('print-general-event', 'company-printing', 10, 'print-general');
  insert.run('print-ops-event', 'company-printing', 30, 'print-ops');
  insert.run('print-legacy-event', 'company-printing', 40, null);
  insert.run('bakery-event', 'company-bakery', 900, 'bakery-general');
  assert.throws(() => insert.run('cross-company', 'company-printing', 50, 'bakery-general'),
    /provider-cost centre must belong to the event company/);
  assert.throws(() => db.prepare('UPDATE financial_provider_cost_events SET cost_center_id=? WHERE id=?')
    .run('print-ops', 'print-general-event'), /append-only/);

  let reads = 0;
  const env = { DB: { prepare(sql) {
    assert.match(sql, /^\s*SELECT/);
    return { bind(...args) { return { async all() {
      reads++;
      return { results: db.prepare(sql).all(...args) };
    } }; } };
  } } };
  const context = { roles: [], companies: [{ id: 'company-printing' }], allowed: ['company-printing', 'company-bakery'] };
  const request = (endpoint, query, session = context) => routeFinancialGateway(
    new Request(`https://portal.invalid/api/financial-gateway/${endpoint}?${query}`), env, session);
  const summaryQuery = 'month=2026-09&costCenterId=print-general';
  const summary = await (await request('cost-summary', summaryQuery)).json();
  assert.equal(summary.costCenterId, 'print-general');
  assert.deepEqual(summary.visibleCompanyIds, ['company-printing']);
  assert.deepEqual(summary.summaries.map(row => [row.eventCount, row.actualCostMinor]), [[1, 10]]);
  const detail = await (await request('cost-events', 'costCenterId=print-general&month=2026-09')).json();
  assert.deepEqual(detail.events.map(row => [row.id, row.costCenterId]), [['print-general-event', 'print-general']]);
  assert.equal(detail.costCenterId, 'print-general');
  const all = await (await request('cost-summary', 'month=2026-09')).json();
  assert.equal(all.summaries[0].actualCostMinor, 80, 'unattributed historical evidence remains included');
  assert.deepEqual((await (await request('cost-events', 'costCenterId=bakery-general')).json()).events, []);
  const multi = { ...context, companies: [{ id: 'company-printing' }, { id: 'company-bakery' }] };
  const bakery = await (await request('cost-summary', 'month=2026-09&costCenterId=bakery-general', multi)).json();
  assert.deepEqual(bakery.summaries.map(row => [row.companyId, row.actualCostMinor]), [['company-bakery', 900]]);
  assert.deepEqual((await (await request('cost-summary', 'month=2026-09&costCenterId=bakery-general')).json()).summaries, []);
  const before = reads;
  for (const endpoint of ['cost-summary', 'cost-events']) {
    const base = endpoint === 'cost-summary' ? 'month=2026-09&' : '';
    for (const value of ['', ' ', 'x'.repeat(161), "a' OR 1=1", 'a/b']) {
      assert.equal((await request(endpoint, `${base}${new URLSearchParams({ costCenterId: value })}`)).status, 400);
    }
    assert.equal((await request(endpoint, `${base}costCenterId=print-general`, { ...context, allowed: [] })).status, 403);
    assert.equal((await request(endpoint, `${base}companyId=company-bakery&costCenterId=bakery-general`)).status, 403);
  }
  assert.equal(reads, before, 'invalid and denied requests never read cost evidence');
  console.log('Provider-cost centre attribution and scoped drilldown: PASS');
} finally {
  db.close();
}
