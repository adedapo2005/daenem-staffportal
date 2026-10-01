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
    (id,company_id,action,provider,requesting_module,occurred_at,actual_cost_minor,estimated_cost_minor,cost_currency)
    VALUES(?,?,?,'paystack','finance',?,?,?,?)`);
  const add = (id,action,cost,estimate=20,currency='NGN',company='company-printing',time='2026-09-01T12:00:00Z') =>
    insert.run(id,company,action,time,cost,estimate,currency);
  add('a','estimate',10);
  add('b','estimate',null);
  add('c','Estimate',3);
  add('d',"review/'quoted'",null);
  add('usd','estimate',5,6,'USD');
  add('foreign','estimate',900,901,'NGN','company-bakery');
  add('outside','estimate',700,701,'NGN','company-printing','2026-10-01T00:00:00Z');
  let reads = 0;
  const env = { DB: { prepare(sql) {
    assert.match(sql, /^\s*SELECT/);
    return { bind(...args) { return { async all() {
      reads++; return { results: db.prepare(sql).all(...args) };
    } }; } };
  } } };
  const context = { roles: [], companies: [{ id: 'company-printing' }], allowed: ['company-printing','company-bakery'] };
  const base = 'month=2026-09&groupBy=action';
  const request = (query = base, session = context) => routeFinancialGateway(
    new Request('https://portal.invalid/api/financial-gateway/cost-summary?' + query), env, session);
  const grouped = await (await request()).json();
  assert.deepEqual(grouped.summaries.map(r => [r.action,r.currency,r.eventCount,r.actualCostEventCount,r.actualCostMinor,r.estimatedCostMinor]),
    [['Estimate','NGN',1,1,3,20],['estimate','NGN',2,1,10,40],["review/'quoted'",'NGN',1,0,null,20],['estimate','USD',1,1,5,6]]);
  assert.ok(grouped.summaries.every(r => r.companyId === 'company-printing'));
  const first = await (await request(base + '&limit=1')).json();
  let cursor = null; const collected = [];
  do {
    const page = await (await request(base + '&limit=1' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''))).json();
    collected.push(...page.summaries); cursor = page.nextCursor;
    assert.ok(collected.length <= 4, 'continuation must advance');
  } while (cursor);
  assert.deepEqual(collected, grouped.summaries);
  assert.deepEqual((await (await request(base + '&action=estimate')).json()).summaries,
    [grouped.summaries[1],grouped.summaries[3]]);
  assert.deepEqual((await (await request(base + '&' + new URLSearchParams({action:"review/'quoted'"}))).json()).summaries,
    [grouped.summaries[2]]);
  const legacy = await (await request('month=2026-09')).json();
  assert.equal(legacy.summaries[0].eventCount,4);
  assert.equal(legacy.summaries[0].actualCostMinor,13);
  assert.ok(!('action' in legacy.summaries[0]));
  for (const [key,value] of [['provider','mono'],['module','payroll'],['service','missing'],['day','2026-08-31'],
    ['costCurrency','EUR'],['action','missing'],['actorEmployeeId','missing'],['costCenterId','missing'],
    ['pricingId','missing'],['pricingRevision','999'],['actorRoleCode','missing'],['currency','EUR'],
    ['providerReference','missing'],['evidenceReference','missing'],['retryOfEventId','missing'],
    ['reversalOfEventId','missing'],['approvalId','missing'],['makerEmployeeId','missing'],['checkerEmployeeId','missing']]) {
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
  for (const grouping of ['', '&groupBy=service', '&groupBy=costCenter', '&groupBy=actorEmployee', '&groupBy=day']) {
    assert.equal((await request('month=2026-09' + grouping + '&cursor=' + encodeURIComponent(first.nextCursor))).status,400);
  }
  for (const position of [['company-printing',null,null,null],['company-printing',null,null,null,null],
    ['company-printing',null,null,null,null,'day']]) {
    assert.equal((await request(base + '&cursor=' + encodeURIComponent(JSON.stringify(position)))).status,400);
  }
  assert.equal((await request(base + '&cursor=' + encodeURIComponent(first.nextCursor), {...context,allowed:[]})).status,403);
  assert.equal((await request(base + '&companyId=company-bakery')).status,403);
  assert.equal(reads,before,'invalid cursors and denied scope fail before SQL');
  for (let n=0;n<501;n++) add('bulk-'+n,'bulk-'+String(n).padStart(3,'0'),null);
  const bulk = await (await request()).json();
  const rest = await (await request(base + '&cursor=' + encodeURIComponent(bulk.nextCursor))).json();
  assert.equal(bulk.summaries.length,500);
  assert.equal(rest.summaries.length,5);
  assert.equal(rest.nextCursor,null);
  assert.equal(new Set([...bulk.summaries,...rest.summaries].map(r => JSON.stringify([r.companyId,r.provider,r.currency,r.module,r.action]))).size,505);
  console.log('Action cost totals, exact audit values, currencies, pagination and company authorization: PASS');
} finally { db.close(); }
