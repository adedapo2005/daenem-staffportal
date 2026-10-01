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
    (id,company_id,action,provider,requesting_module,occurred_at,actual_cost_minor,cost_currency)
    VALUES(?,?,'estimate',?,'finance',?,?,?)`);
  const add = (id,time,cost,currency='NGN',company='company-printing',provider='paystack') =>
    insert.run(id,company,provider,time,cost,currency);
  add('a','2026-09-01T00:00:00Z',10);
  add('offset-in','2026-08-31T23:30:00-01:00',20);
  add('b','2026-09-02T00:00:00Z',null);
  add('offset-out','2026-09-01T00:30:00+01:00',700);
  add('end-out','2026-09-30T23:30:00-01:00',800);
  add('usd','2026-09-01T12:00:00Z',5,'USD');
  add('foreign','2026-09-01T12:00:00Z',900,'NGN','company-bakery');
  let reads = 0;
  const env = { DB: { prepare(sql) {
    assert.match(sql, /^\s*SELECT/);
    return { bind(...args) { return { async all() {
      reads++; return { results: db.prepare(sql).all(...args) };
    } }; } };
  } } };
  const context = { roles: [], companies: [{ id: 'company-printing' }], allowed: ['company-printing','company-bakery'] };
  const base = 'month=2026-09&groupBy=day';
  const request = (query = base, session = context) => routeFinancialGateway(
    new Request('https://portal.invalid/api/financial-gateway/cost-summary?' + query), env, session);
  const grouped = await (await request()).json();
  assert.deepEqual(grouped.summaries.map(r => [r.day,r.currency,r.eventCount,r.actualCostMinor]),
    [['2026-09-01','NGN',2,30],['2026-09-02','NGN',1,null],['2026-09-01','USD',1,5]]);
  const first = await (await request(base + '&limit=1')).json();
  let cursor = null; const collected = [];
  do {
    const page = await (await request(base + '&limit=1' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))).json();
    collected.push(...page.summaries); cursor = page.nextCursor;
    assert.ok(collected.length <= 3, 'continuation must advance');
  } while (cursor);
  assert.deepEqual(collected, grouped.summaries);
  assert.deepEqual((await (await request(base + '&day=2026-09-01')).json()).summaries,
    [grouped.summaries[0],grouped.summaries[2]]);
  for (const [key,value] of [['provider','mono'],['module','payroll'],['service','missing'],['day','2026-08-31'],
    ['costCurrency','EUR'],['action','missing'],['actorEmployeeId','missing'],['costCenterId','missing']]) {
    assert.deepEqual((await (await request(base + '&cursor=' + encodeURIComponent(first.nextCursor) + '&' +
      new URLSearchParams({[key]:value}))).json()).summaries, []);
  }
  const multi = {...context, companies:[{id:'company-printing'},{id:'company-bakery'}]};
  const both = await (await request(base, multi)).json();
  assert.equal(both.summaries[0].actualCostMinor,900);
  const multiPage = await (await request(base + '&limit=1', multi)).json();
  assert.deepEqual((await (await request(base + '&cursor=' + encodeURIComponent(multiPage.nextCursor))).json()).summaries,
    grouped.summaries, 'cursor grants no company access');
  const before = reads;
  for (const grouping of ['', '&groupBy=service', '&groupBy=costCenter', '&groupBy=actorEmployee']) {
    assert.equal((await request('month=2026-09' + grouping + '&cursor=' + encodeURIComponent(first.nextCursor))).status,400);
  }
  for (const position of [['company-printing',null,null,null],['company-printing',null,null,null,null],
    ['company-printing',null,null,null,null,'actorEmployee']]) {
    assert.equal((await request(base + '&cursor=' + encodeURIComponent(JSON.stringify(position)))).status,400);
  }
  assert.equal((await request(base + '&cursor=' + encodeURIComponent(first.nextCursor), {...context,allowed:[]})).status,403);
  assert.equal((await request(base + '&companyId=company-bakery')).status,403);
  assert.equal(reads,before,'invalid cursors and denied scope fail before SQL');
  for (let n=0;n<501;n++) add('bulk-'+n,'2026-09-03T00:00:00Z',null,'NGN','company-printing','bulk-'+String(n).padStart(3,'0'));
  const bulk = await (await request()).json();
  const rest = await (await request(base + '&cursor=' + encodeURIComponent(bulk.nextCursor))).json();
  assert.equal(bulk.summaries.length,500);
  assert.equal(rest.summaries.length,4);
  assert.equal(rest.nextCursor,null);
  assert.equal(new Set([...bulk.summaries,...rest.summaries].map(r => JSON.stringify([r.companyId,r.provider,r.currency,r.day]))).size,504);
  console.log('UTC-day cost totals, timezone boundaries, currencies, pagination and company authorization: PASS');
} finally { db.close(); }
