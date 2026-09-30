import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = await readFile(new URL('../worker/financial-gateway.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-summary')");
const end = source.indexOf("if (url.pathname === '/api/financial-gateway/cost-events')", start);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'monthly provider-cost summary exists');
assert.match(source, /'\/api\/financial-gateway\/cost-summary'/);
assert.match(endpoint, /request\.method !== 'GET'/);
assert.ok(endpoint.includes("if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month))"), 'month filter is strictly YYYY-MM');
assert.match(endpoint, /companyIds\.includes\(requestedCompanyId\)/);
assert.match(endpoint, /const provider = url\.searchParams\.get\('provider'\)/);
assert.match(endpoint, /const module = url\.searchParams\.get\('module'\)/);
assert.ok(endpoint.includes("/^[a-z][a-z0-9_-]{0,79}$/.test(provider)"), 'provider filter is syntax-bounded');
assert.ok(endpoint.includes("/^[a-z][a-z0-9_.:-]{0,79}$/.test(module)"), 'module filter is syntax-bounded');
assert.match(endpoint, /WHERE company_id IN \(\$\{placeholders\}\) AND strftime\('%Y-%m',occurred_at\)=\?/);
assert.match(endpoint, /AND \(\? IS NULL OR provider=\?\) AND \(\? IS NULL OR requesting_module=\?\)/);
assert.match(endpoint, /GROUP BY company_id,provider,cost_currency,requesting_module/);
assert.match(endpoint, /COUNT\(actual_cost_minor\) AS actualCostEventCount/);
assert.match(endpoint, /SUM\(actual_cost_minor\) AS actualCostMinor/);
assert.match(endpoint, /SUM\(estimated_cost_minor\) AS estimatedCostMinor/);
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, month, provider, provider, module, module, actorEmployeeId, actorEmployeeId, costCurrency, costCurrency, action, action, pricingId, pricingId\)/);
assert.match(endpoint, /return json\(\{ month, provider, module, actorEmployeeId, costCurrency, action, pricingId, summaries:/);
assert.match(endpoint, /visibleCompanyIds: scopedCompanyIds/);
assert.doesNotMatch(endpoint, /company-farms|access_token|refresh_token|client_secret/i);

console.log('Financial provider-cost monthly summary: 17/17 PASS');

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
    INSERT INTO employees VALUES('user-a'),('user-b'),('USER-A'),('user-a-suffix'),('foreign-user');`);
  for (const name of ['0079_financial_provider_cost_events', '0081_financial_provider_cost_event_module']) {
    db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  const insert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,pricing_id,provider_result)
    VALUES(?,?,?,?,?,?,?,?,?,?,?, 'internal-result-must-not-leak')`);
  let id = 0;
  const add = (actor, actual, currency = 'NGN', company = 'company-printing', provider = 'paystack',
    module = 'finance', time = '2026-09-15T12:00:00Z', action = 'estimate', pricingId = null) =>
    insert.run(String(++id), company, actor, action, provider, module, time, 20, actual, currency, pricingId);
  add('user-a', 10);
  add('user-a', null);
  add('user-a', 30, 'USD');
  add('user-a', 40, 'NGN', 'company-bakery');
  add('foreign-user', 999, 'NGN', 'company-bakery');
  add('user-a', 50, 'NGN', 'company-printing', 'mono');
  add('user-a', 60, 'NGN', 'company-printing', 'paystack', 'payroll');
  add('user-a', 70, 'NGN', 'company-printing', 'paystack', 'finance', '2026-08-31T23:59:59Z');
  for (const actor of ['user-b', null, 'USER-A', 'user-a-suffix']) add(actor, 100);
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
    new Request(`https://portal.invalid/api/financial-gateway/cost-summary?${query}`), env, session);
  const base = 'month=2026-09&provider=paystack&module=finance';
  const response = await request(`${base}&actorEmployeeId=user-a`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.actorEmployeeId, 'user-a');
  assert.deepEqual(result.visibleCompanyIds, ['company-printing']);
  assert.deepEqual(result.summaries, [
    { companyId: 'company-printing', provider: 'paystack', currency: 'NGN', module: 'finance',
      eventCount: 2, actualCostEventCount: 1, actualCostMinor: 10, estimatedCostMinor: 40 },
    { companyId: 'company-printing', provider: 'paystack', currency: 'USD', module: 'finance',
      eventCount: 1, actualCostEventCount: 1, actualCostMinor: 30, estimatedCostMinor: 20 },
  ]);
  const omitted = await (await request(base)).json();
  assert.equal(omitted.actorEmployeeId, null);
  assert.equal(omitted.summaries[0].eventCount, 6, 'omission includes null actors');
  assert.equal(omitted.summaries[0].actualCostMinor, 410);
  for (const actor of ['USER-A', 'user-a-suffix']) {
    const body = await (await request(`${base}&actorEmployeeId=${actor}`)).json();
    assert.equal(body.summaries[0].actualCostMinor, 100, 'exact case and full ID match');
  }
  for (const actor of ['missing-user', 'foreign-user', 'x'.repeat(160)]) {
    assert.deepEqual((await (await request(`${base}&actorEmployeeId=${actor}`)).json()).summaries, []);
  }
  const before = reads;
  for (const actor of ['', ' ', 'x'.repeat(161), "a' OR 1=1", 'a\n', 'a/b', 'é']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ actorEmployeeId: actor })}`)).status, 400);
  }
  assert.equal((await request(`${base}&actorEmployeeId=user-a`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&actorEmployeeId=user-a&companyId=company-bakery`)).status, 403);
  assert.equal(reads, before, 'invalid or unauthorized requests never read evidence');
  const multi = { ...context, companies: [{ id: 'company-printing' }, { id: 'company-bakery' }] };
  const both = await (await request(`${base}&actorEmployeeId=user-a`, multi)).json();
  assert.equal(both.summaries.length, 3, 'companies remain separate groups');
  assert.equal(both.summaries[0].companyId, 'company-bakery');
  assert.equal(both.summaries[0].actualCostMinor, 40);
  assert.ok(!JSON.stringify(both).includes('internal-result-must-not-leak'));
  assert.equal(omitted.costCurrency, null);
  for (const currency of ['NGN', 'USD']) {
    const filtered = await (await request(`${base}&actorEmployeeId=user-a&costCurrency=${currency}`)).json();
    assert.equal(filtered.costCurrency, currency);
    assert.deepEqual(filtered.summaries, result.summaries.filter(row => row.currency === currency));
  }
  const scopedCurrency = await (await request(`${base}&actorEmployeeId=user-a&costCurrency=NGN`, multi)).json();
  assert.deepEqual(scopedCurrency.summaries, both.summaries.filter(row => row.currency === 'NGN'));
  const singleCompany = await (await request(`${base}&actorEmployeeId=user-a&costCurrency=NGN&companyId=company-bakery`, multi)).json();
  assert.deepEqual(singleCompany.summaries, [both.summaries[0]]);
  const allActors = await (await request(`${base}&costCurrency=NGN`)).json();
  assert.deepEqual(allActors.summaries, [omitted.summaries[0]], 'currency filter retains null actors');
  const unknownActual = await (await request(`${base}&actorEmployeeId=user-a&costCurrency=EUR`)).json();
  assert.deepEqual(unknownActual.summaries, []);
  add('user-a', null, 'EUR');
  const pendingActual = await (await request(`${base}&actorEmployeeId=user-a&costCurrency=EUR`)).json();
  assert.equal(pendingActual.summaries[0].actualCostMinor, null, 'unknown actual costs never become zero');
  assert.equal(pendingActual.summaries[0].actualCostEventCount, 0);
  add('foreign-user', 900, 'GBP', 'company-bakery');
  for (const currency of ['GBP', 'CAD']) {
    assert.deepEqual((await (await request(`${base}&costCurrency=${currency}`)).json()).summaries, [],
      'foreign-only and absent currencies disclose no evidence');
  }
  for (const [filter, amount] of [['provider=mono&module=finance', 50], ['provider=paystack&module=payroll', 60],
    ['provider=paystack&module=finance&month=2026-08', 70]]) {
    const params = new URLSearchParams(`month=2026-09&${filter}&actorEmployeeId=user-a&costCurrency=NGN`);
    if (filter.includes('month=2026-08')) params.set('month', '2026-08');
    const body = await (await request(params)).json();
    assert.equal(body.summaries.length, 1);
    assert.equal(body.summaries[0].actualCostMinor, amount);
  }
  const currencyReads = reads;
  for (const currency of ['', ' ', 'ngn', 'Ngn', 'NG', 'NGNN', 'NGN\n', 'NG\u0000', "' OR 1=1", '€UR']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ costCurrency: currency })}`)).status, 400);
  }
  assert.equal((await request(`${base}&costCurrency=NGN`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&costCurrency=GBP&companyId=company-bakery`)).status, 403);
  assert.equal(reads, currencyReads, 'invalid currencies and revoked permissions reject before SQL');
  assert.ok(!JSON.stringify(scopedCurrency).includes('internal-result-must-not-leak'));
  console.log('Monthly cost-currency totals: real route / SQLite regression PASS');
  console.log('Monthly requesting-user totals: real route / SQLite regression PASS');
  assert.equal(omitted.action, null);
  assert.deepEqual((await (await request(`${base}&actorEmployeeId=user-a&action=estimate&costCurrency=NGN`)).json()).summaries,
    [result.summaries[0]], 'action intersects existing filters without changing totals');
  const actions = ['Estimate', 'estimate-suffix', "verify:bank's account", '\u{1f4b0}'.repeat(100)];
  for (const action of actions) {
    add('user-a', 81, 'NGN', 'company-printing', 'paystack', 'finance', '2026-09-15T12:00:00Z', action);
    add('user-a', 82, 'NGN', 'company-bakery', 'paystack', 'finance', '2026-09-15T12:00:00Z', action);
    const query = `${base}&actorEmployeeId=user-a&costCurrency=NGN&${new URLSearchParams({ action })}`;
    const body = await (await request(query)).json();
    assert.equal(body.action, action);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], eventCount: 1, actualCostEventCount: 1,
      actualCostMinor: 81, estimatedCostMinor: 20 }], 'exact case/punctuation/Unicode and company isolation');
    const companies = await (await request(query, multi)).json();
    assert.equal(companies.summaries.length, 2);
    assert.equal(companies.summaries[0].actualCostMinor, 82);
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} remains applied`);
    }
  }
  add(null, null, 'NGN', 'company-printing', 'paystack', 'finance', '2026-09-15T12:00:00Z', 'pending');
  const pending = await (await request(`${base}&action=pending`)).json();
  assert.equal(pending.summaries[0].actualCostMinor, null);
  assert.equal(pending.summaries[0].actualCostEventCount, 0);
  add('foreign-user', 900, 'NGN', 'company-bakery', 'paystack', 'finance', '2026-09-15T12:00:00Z', 'foreign-only');
  for (const action of ['foreign-only', 'absent', "x' OR 1=1 --"]) {
    assert.deepEqual((await (await request(`${base}&${new URLSearchParams({ action })}`)).json()).summaries, []);
  }
  const actionReads = reads;
  for (const action of ['', ' ', 'x'.repeat(101), '\u{1f4b0}'.repeat(101), 'estimate\n', 'a\u0000', 'a\u007f']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ action })}`)).status, 400);
  }
  assert.equal((await request(`${base}&action=estimate`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&action=foreign-only&companyId=company-bakery`)).status, 403);
  assert.equal(reads, actionReads, 'invalid actions and denied scope reject before SQL');
  assert.ok(!JSON.stringify(pending).includes('internal-result-must-not-leak'));
  console.log('Monthly action totals: real route / SQLite regression PASS');
  assert.equal(omitted.pricingId, null);
  const pricingIds = ['price-a', 'PRICE-A', 'price-a-suffix', 'price:_1', 'x'.repeat(160)];
  for (const [index, pricingId] of pricingIds.entries()) {
    db.prepare('INSERT INTO financial_provider_pricing VALUES(?)').run(pricingId);
    add('user-a', 101 + index, 'NGN', 'company-printing', 'paystack', 'finance', '2026-09-15T12:00:00Z', 'estimate', pricingId);
    add('user-a', null, 'NGN', 'company-printing', 'paystack', 'finance', '2026-09-15T12:00:00Z', 'estimate', pricingId);
    add('user-a', 201 + index, 'NGN', 'company-bakery', 'paystack', 'finance', '2026-09-15T12:00:00Z', 'estimate', pricingId);
    const query = `${base}&actorEmployeeId=user-a&costCurrency=NGN&action=estimate&${new URLSearchParams({ pricingId })}`;
    const body = await (await request(query)).json();
    assert.equal(body.pricingId, pricingId);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 101 + index }],
      'pricing IDs match exact case and full value; null actual costs do not inflate totals');
    const companies = await (await request(query, multi)).json();
    assert.equal(companies.summaries.length, 2);
    assert.equal(companies.summaries[0].actualCostMinor, 201 + index);
    const single = await (await request(`${query}&companyId=company-bakery`, multi)).json();
    assert.deepEqual(single.summaries, [companies.summaries[0]]);
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects pricing filter`);
    }
    assert.ok(!JSON.stringify(body).includes('internal-result-must-not-leak'));
  }
  db.prepare('INSERT INTO financial_provider_pricing VALUES(?)').run('foreign-price');
  add('foreign-user', 900, 'NGN', 'company-bakery', 'paystack', 'finance', '2026-09-15T12:00:00Z', 'estimate', 'foreign-price');
  for (const pricingId of ['foreign-price', 'absent-price']) {
    assert.deepEqual((await (await request(`${base}&pricingId=${pricingId}`)).json()).summaries, []);
  }
  const allPricing = await (await request(`${base}&actorEmployeeId=user-a&costCurrency=NGN&action=estimate`)).json();
  assert.equal(allPricing.summaries[0].eventCount, 12, 'omission retains legacy null pricing IDs');
  assert.equal(allPricing.summaries[0].actualCostMinor, 525);
  const pricingReads = reads;
  for (const pricingId of ['', ' ', 'x'.repeat(161), "x' OR 1=1", 'price-a\n', 'a/b', '\u00e9', 'a\u0000']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ pricingId })}`)).status, 400);
  }
  assert.equal((await request(`${base}&pricingId=price-a`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&pricingId=foreign-price&companyId=company-bakery`)).status, 403);
  assert.equal(reads, pricingReads, 'invalid pricing IDs and denied scope reject before SQL');
  console.log('Monthly pricing-record totals: real route / SQLite regression PASS');
} finally {
  db.close();
}
