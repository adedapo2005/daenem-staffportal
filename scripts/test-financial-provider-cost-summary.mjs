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
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, month, day, day, provider, provider, module, module, actorEmployeeId, actorEmployeeId, costCurrency, costCurrency, action, action, pricingId, pricingId, pricingRevision, pricingRevision, actorRoleCode, actorRoleCode, currency, currency, providerReference, providerReference, evidenceReference, evidenceReference, retryOfEventId, retryOfEventId, reversalOfEventId, reversalOfEventId, approvalId, approvalId, makerEmployeeId, makerEmployeeId, checkerEmployeeId, checkerEmployeeId,/);
assert.match(endpoint, /return json\(\{ month, day, provider, module, actorEmployeeId, costCurrency, action, pricingId, pricingRevision, actorRoleCode, currency, providerReference, evidenceReference, retryOfEventId, reversalOfEventId, approvalId, makerEmployeeId, checkerEmployeeId, summaries, nextCursor, limit,/);
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
  for (const name of ['0079_financial_provider_cost_events', '0081_financial_provider_cost_event_module', '0086_financial_provider_pricing_revision']) {
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
    db.prepare('INSERT INTO financial_provider_pricing(id) VALUES(?)').run(pricingId);
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
  db.prepare('INSERT INTO financial_provider_pricing(id) VALUES(?)').run('foreign-price');
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
  assert.equal(omitted.pricingRevision, null);
  const revisionInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,pricing_id,pricing_revision,provider_result)
    VALUES(?,?, 'user-a','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,'NGN','price-a',?,
      'internal-result-must-not-leak')`);
  for (const revision of [1, 2, Number.MAX_SAFE_INTEGER]) {
    revisionInsert.run(String(++id), 'company-printing', 51, revision);
    revisionInsert.run(String(++id), 'company-printing', null, revision);
    revisionInsert.run(String(++id), 'company-bakery', 91, revision);
    const query = `${base}&actorEmployeeId=user-a&costCurrency=NGN&action=estimate&pricingId=price-a&pricingRevision=${revision}`;
    const body = await (await request(query)).json();
    assert.equal(body.pricingRevision, revision);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 51 }]);
    const companies = await (await request(query, multi)).json();
    assert.equal(companies.summaries.length, 2);
    assert.equal(companies.summaries[0].actualCostMinor, 91);
    assert.deepEqual((await (await request(`${query}&companyId=company-bakery`, multi)).json()).summaries,
      [companies.summaries[0]]);
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'], ['pricingId', 'PRICE-A']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects revision filter`);
    }
    assert.ok(!JSON.stringify(body).includes('internal-result-must-not-leak'));
  }
  revisionInsert.run(String(++id), 'company-printing', null, 3);
  const unknownRevisionCost = await (await request(`${base}&pricingRevision=3`)).json();
  assert.equal(unknownRevisionCost.summaries[0].actualCostMinor, null);
  assert.equal(unknownRevisionCost.summaries[0].actualCostEventCount, 0);
  revisionInsert.run(String(++id), 'company-bakery', 999, 4);
  for (const revision of [4, 5]) {
    assert.deepEqual((await (await request(`${base}&pricingRevision=${revision}`)).json()).summaries, [],
      'foreign-only and absent revisions are indistinguishable');
  }
  const allRevisions = await (await request(`${base}&pricingId=price-a`)).json();
  assert.equal(allRevisions.pricingRevision, null);
  assert.equal(allRevisions.summaries[0].eventCount, 9, 'omission includes legacy null revisions');
  assert.equal(allRevisions.summaries[0].actualCostMinor, 254);
  const revisionReads = reads;
  for (const revision of ['', ' ', '0', '-1', '01', '+1', '1.0', '1e1', '1\n', '9007199254740992',
    'Infinity', 'NaN', "1 OR 1=1", '9'.repeat(400)]) {
    assert.equal((await request(`${base}&${new URLSearchParams({ pricingRevision: revision })}`)).status, 400);
  }
  assert.equal((await request(`${base}&pricingRevision=1`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&pricingRevision=4&companyId=company-bakery`)).status, 403);
  assert.equal(reads, revisionReads, 'invalid revisions and revoked permissions reject before SQL');
  console.log('Monthly pricing-revision totals: real route / SQLite regression PASS');
  assert.equal(omitted.actorRoleCode, null);
  const roleInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,pricing_id,pricing_revision,provider_result)
    VALUES(?,?,'user-a',?,'estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,'NGN','price-a',1,
      'internal-result-must-not-leak')`);
  const roleQuery = `${base}&actorEmployeeId=user-a&costCurrency=NGN&action=estimate&pricingId=price-a&pricingRevision=1`;
  for (const [index, role] of ['finance', 'FINANCE', 'finance-suffix', "finance:owner's role", '\u{1f4b0}'.repeat(160)].entries()) {
    roleInsert.run(String(++id), 'company-printing', role, 61 + index);
    roleInsert.run(String(++id), 'company-printing', role, null);
    roleInsert.run(String(++id), 'company-bakery', role, 91 + index);
    const query = `${roleQuery}&${new URLSearchParams({ actorRoleCode: role })}`;
    const body = await (await request(query)).json();
    assert.equal(body.actorRoleCode, role);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 61 + index }],
      'role matches exact case, full value, punctuation and Unicode; unknown costs remain unknown');
    const companies = await (await request(query, multi)).json();
    assert.equal(companies.summaries.length, 2);
    assert.equal(companies.summaries[0].actualCostMinor, 91 + index);
    assert.deepEqual((await (await request(`${query}&companyId=company-bakery`, multi)).json()).summaries,
      [companies.summaries[0]]);
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
      ['pricingId', 'PRICE-A'], ['pricingRevision', '2']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects role filter`);
    }
    assert.ok(!JSON.stringify(body).includes('internal-result-must-not-leak'));
  }
  roleInsert.run(String(++id), 'company-printing', 'pending-role', null);
  const pendingRole = await (await request(`${roleQuery}&actorRoleCode=pending-role`)).json();
  assert.equal(pendingRole.summaries[0].actualCostMinor, null);
  assert.equal(pendingRole.summaries[0].actualCostEventCount, 0);
  roleInsert.run(String(++id), 'company-bakery', 'foreign-role', 999);
  for (const role of ['foreign-role', 'absent-role', "x' OR 1=1 --"]) {
    assert.deepEqual((await (await request(`${roleQuery}&${new URLSearchParams({ actorRoleCode: role })}`)).json()).summaries, [],
      'foreign-only, absent and SQL-like roles disclose no evidence');
  }
  const allRoles = await (await request(roleQuery)).json();
  assert.equal(allRoles.actorRoleCode, null);
  assert.equal(allRoles.summaries[0].eventCount, 13, 'omission retains legacy null roles');
  assert.equal(allRoles.summaries[0].actualCostMinor, 366);
  const roleReads = reads;
  for (const role of ['', ' ', 'x'.repeat(161), '\u{1f4b0}'.repeat(161), 'finance\n', 'a\u0000', 'a\u007f']) {
    assert.equal((await request(`${roleQuery}&${new URLSearchParams({ actorRoleCode: role })}`)).status, 400);
  }
  assert.equal((await request(`${roleQuery}&actorRoleCode=finance`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${roleQuery}&actorRoleCode=foreign-role&companyId=company-bakery`)).status, 403);
  assert.equal(reads, roleReads, 'invalid roles and revoked permissions reject before SQL');
  console.log('Monthly actor-role totals: real route / SQLite regression PASS');
  assert.equal(omitted.currency, null);
  const transactionInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,currency,amount_minor,pricing_id,pricing_revision,provider_result)
    VALUES(?,?,'user-a','finance','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,?,?,
      1000,'price-a',1,'internal-result-must-not-leak')`);
  for (const [company, actual, cost, transaction] of [
    ['company-printing', 71, 'NGN', 'USD'], ['company-printing', null, 'NGN', 'USD'],
    ['company-printing', 72, 'EUR', 'USD'], ['company-printing', 73, 'NGN', 'NGN'],
    ['company-bakery', 91, 'NGN', 'USD'], ['company-bakery', 999, 'NGN', 'GBP'],
  ]) transactionInsert.run(String(++id), company, actual, cost, transaction);
  const transactionQuery = `${roleQuery}&actorRoleCode=finance&currency=USD`;
  const transactionBody = await (await request(transactionQuery)).json();
  assert.equal(transactionBody.currency, 'USD');
  assert.deepEqual(transactionBody.summaries, [{ ...result.summaries[0], actualCostMinor: 71 }],
    'transaction currency filters independently of cost denomination');
  const noCostFilter = new URLSearchParams(transactionQuery);
  noCostFilter.delete('costCurrency');
  const denominations = await (await request(noCostFilter)).json();
  assert.deepEqual(denominations.summaries.map(row => [row.currency, row.actualCostMinor]), [['EUR', 72], ['NGN', 71]],
    'cost denominations remain separate without conversion');
  const bothTransactions = await (await request(transactionQuery, multi)).json();
  assert.equal(bothTransactions.summaries.length, 2);
  assert.equal(bothTransactions.summaries[0].actualCostMinor, 91);
  assert.deepEqual((await (await request(`${transactionQuery}&companyId=company-bakery`, multi)).json()).summaries,
    [bothTransactions.summaries[0]]);
  for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
    ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
    ['pricingId', 'PRICE-A'], ['pricingRevision', '2'], ['actorRoleCode', 'FINANCE']]) {
    const params = new URLSearchParams(transactionQuery);
    params.set(key, value);
    assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects transaction currency`);
  }
  const withoutTransaction = await (await request(`${roleQuery}&actorRoleCode=finance`)).json();
  assert.equal(withoutTransaction.currency, null);
  assert.equal(withoutTransaction.summaries[0].eventCount, 5, 'omission includes legacy null transaction currency');
  assert.equal(withoutTransaction.summaries[0].actualCostMinor, 205);
  transactionInsert.run(String(++id), 'company-printing', null, 'NGN', 'JPY');
  const unknownTransaction = await (await request(`${base}&currency=JPY`)).json();
  assert.equal(unknownTransaction.summaries[0].actualCostMinor, null);
  assert.equal(unknownTransaction.summaries[0].actualCostEventCount, 0);
  for (const currency of ['GBP', 'CAD']) {
    assert.deepEqual((await (await request(`${base}&currency=${currency}`)).json()).summaries, [],
      'foreign-only and absent transaction currencies are indistinguishable');
  }
  const transactionReads = reads;
  for (const currency of ['', ' ', 'usd', 'Usd', 'US', 'USDD', 'USD\n', 'US\u0000', "' OR 1=1", '\u20acUR']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ currency })}`)).status, 400);
  }
  assert.equal((await request(transactionQuery, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${transactionQuery}&companyId=company-bakery`)).status, 403);
  assert.equal(reads, transactionReads, 'invalid transaction currencies and denied scope reject before SQL');
  assert.ok(!JSON.stringify(bothTransactions).includes('internal-result-must-not-leak'));
  console.log('Monthly transaction-currency totals: real route / SQLite regression PASS');
  assert.equal(omitted.providerReference, null);
  const referenceInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,currency,amount_minor,pricing_id,pricing_revision,
      provider_reference,provider_result)
    VALUES(?,?,'user-a','finance','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,?,'USD',
      1000,'price-a',1,?,'internal-result-must-not-leak')`);
  for (const reference of ['ref-a', 'REF-A', 'ref-a-suffix', " bank's/ref:1 ", 'x'.repeat(200), '\u{1f4b0}'.repeat(100)]) {
    referenceInsert.run(String(++id), 'company-printing', 81, 'NGN', reference);
    referenceInsert.run(String(++id), 'company-printing', null, 'NGN', reference);
    referenceInsert.run(String(++id), 'company-printing', 82, 'EUR', reference);
    referenceInsert.run(String(++id), 'company-bakery', 91, 'NGN', reference);
    const query = `${transactionQuery}&${new URLSearchParams({ providerReference: reference })}`;
    const body = await (await request(query)).json();
    assert.equal(body.providerReference, reference);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 81 }],
      'exact opaque reference, including case, punctuation, whitespace and Unicode');
    const both = await (await request(query, multi)).json();
    assert.equal(both.summaries.length, 2);
    assert.equal(both.summaries[0].actualCostMinor, 91);
    assert.deepEqual((await (await request(`${query}&companyId=company-bakery`, multi)).json()).summaries,
      [both.summaries[0]]);
    const denominations = new URLSearchParams(query);
    denominations.delete('costCurrency');
    assert.deepEqual((await (await request(denominations)).json()).summaries.map(row => [row.currency, row.actualCostMinor]),
      [['EUR', 82], ['NGN', 81]], 'cost currencies remain separate');
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
      ['pricingId', 'PRICE-A'], ['pricingRevision', '2'], ['actorRoleCode', 'FINANCE'], ['currency', 'NGN']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects reference`);
    }
    assert.ok(!JSON.stringify(both).includes('internal-result-must-not-leak'));
  }
  referenceInsert.run(String(++id), 'company-printing', null, 'NGN', 'pending-reference');
  const pendingReference = await (await request(`${transactionQuery}&providerReference=pending-reference`)).json();
  assert.equal(pendingReference.summaries[0].actualCostMinor, null);
  assert.equal(pendingReference.summaries[0].actualCostEventCount, 0);
  referenceInsert.run(String(++id), 'company-bakery', 999, 'NGN', 'foreign-reference');
  for (const reference of ['foreign-reference', 'absent-reference', "x' OR 1=1 --"]) {
    assert.deepEqual((await (await request(`${base}&${new URLSearchParams({ providerReference: reference })}`)).json()).summaries, []);
  }
  const withoutReference = await (await request(transactionQuery)).json();
  assert.equal(withoutReference.providerReference, null);
  assert.equal(withoutReference.summaries[0].eventCount, 15, 'omission retains null references');
  assert.equal(withoutReference.summaries[0].actualCostMinor, 557);
  const referenceReads = reads;
  for (const reference of ['', ' ', 'x'.repeat(201), '\u{1f4b0}'.repeat(101), 'ref\n', 'a\u0000', 'a\u007f']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ providerReference: reference })}`)).status, 400);
  }
  assert.equal((await request(`${base}&providerReference=ref-a`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&providerReference=foreign-reference&companyId=company-bakery`)).status, 403);
  assert.equal(reads, referenceReads, 'invalid references and denied scope reject before SQL');
  console.log('Monthly provider-reference totals: real route / SQLite regression PASS');
  assert.equal(omitted.evidenceReference, null);
  const evidenceInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,currency,amount_minor,pricing_id,pricing_revision,
      evidence_reference,provider_reference,provider_result)
    VALUES(?,?,'user-a','finance','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,?,'USD',
      1000,'price-a',1,?,'evidence-provider-ref','internal-result-must-not-leak')`);
  for (const reference of ['ref-a', 'REF-A', 'ref-a-suffix', " bank's/ref:1 ", 'x'.repeat(160), '\u{1f4b0}'.repeat(160)]) {
    evidenceInsert.run(String(++id), 'company-printing', 81, 'NGN', reference);
    evidenceInsert.run(String(++id), 'company-printing', null, 'NGN', reference);
    evidenceInsert.run(String(++id), 'company-printing', 82, 'EUR', reference);
    evidenceInsert.run(String(++id), 'company-bakery', 91, 'NGN', reference);
    const query = `${transactionQuery}&providerReference=evidence-provider-ref&${new URLSearchParams({ evidenceReference: reference })}`;
    const body = await (await request(query)).json();
    assert.equal(body.evidenceReference, reference);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 81 }],
      'exact opaque reference, including case, punctuation, whitespace and Unicode');
    const both = await (await request(query, multi)).json();
    assert.equal(both.summaries.length, 2);
    assert.equal(both.summaries[0].actualCostMinor, 91);
    assert.deepEqual((await (await request(`${query}&companyId=company-bakery`, multi)).json()).summaries,
      [both.summaries[0]]);
    const denominations = new URLSearchParams(query);
    denominations.delete('costCurrency');
    assert.deepEqual((await (await request(denominations)).json()).summaries.map(row => [row.currency, row.actualCostMinor]),
      [['EUR', 82], ['NGN', 81]], 'cost currencies remain separate');
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
      ['pricingId', 'PRICE-A'], ['pricingRevision', '2'], ['actorRoleCode', 'FINANCE'], ['currency', 'NGN'], ['providerReference', 'absent-reference']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects reference`);
    }
    assert.ok(!JSON.stringify(both).includes('internal-result-must-not-leak'));
  }
  evidenceInsert.run(String(++id), 'company-printing', null, 'NGN', 'pending-reference');
  const pendingEvidence = await (await request(`${transactionQuery}&evidenceReference=pending-reference`)).json();
  assert.equal(pendingEvidence.summaries[0].actualCostMinor, null);
  assert.equal(pendingEvidence.summaries[0].actualCostEventCount, 0);
  evidenceInsert.run(String(++id), 'company-bakery', 999, 'NGN', 'foreign-reference');
  for (const reference of ['foreign-reference', 'absent-reference', "x' OR 1=1 --"]) {
    assert.deepEqual((await (await request(`${base}&${new URLSearchParams({ evidenceReference: reference })}`)).json()).summaries, []);
  }
  const withoutEvidence = await (await request(`${transactionQuery}&providerReference=evidence-provider-ref`)).json();
  assert.equal(withoutEvidence.evidenceReference, null);
  assert.equal(withoutEvidence.summaries[0].eventCount, 13, 'omission includes all inserted evidence references');
  assert.equal(withoutEvidence.summaries[0].actualCostMinor, 486);
  const evidenceReads = reads;
  for (const reference of ['', ' ', 'x'.repeat(161), '\u{1f4b0}'.repeat(161), 'ref\n', 'a\u0000', 'a\u007f']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ evidenceReference: reference })}`)).status, 400);
  }
  assert.equal((await request(`${base}&evidenceReference=ref-a`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&evidenceReference=foreign-reference&companyId=company-bakery`)).status, 403);
  assert.equal(reads, evidenceReads, 'invalid references and denied scope reject before SQL');
  console.log('Monthly evidence-reference totals: real route / SQLite regression PASS');
  const legacyEvidence = await (await request(`${transactionQuery}&providerReference=ref-a`)).json();
  assert.equal(legacyEvidence.evidenceReference, null);
  assert.equal(legacyEvidence.summaries[0].eventCount, 2, 'omission retains legacy null evidence');
  assert.equal(omitted.retryOfEventId, null);
  const retryParent = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,occurred_at) VALUES(?,'company-printing','original','2026-08-01T00:00:00Z')`);
  for (const reference of ['ref-a', 'REF-A', 'ref-a-suffix', " bank's/ref:1 ", 'x'.repeat(160),
    '\u{1f4b0}'.repeat(80), 'pending-reference', 'foreign-reference']) retryParent.run(reference);
  const retryInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,currency,amount_minor,pricing_id,pricing_revision,
      retry_of_event_id,provider_reference,evidence_reference,provider_result)
    VALUES(?,?,'user-a','finance','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,?,'USD',
      1000,'price-a',1,?,'retry-provider-ref','retry-evidence-ref','internal-result-must-not-leak')`);
  for (const reference of ['ref-a', 'REF-A', 'ref-a-suffix', " bank's/ref:1 ", 'x'.repeat(160), '\u{1f4b0}'.repeat(80)]) {
    retryInsert.run(String(++id), 'company-printing', 81, 'NGN', reference);
    retryInsert.run(String(++id), 'company-printing', null, 'NGN', reference);
    retryInsert.run(String(++id), 'company-printing', 82, 'EUR', reference);
    retryInsert.run(String(++id), 'company-bakery', 91, 'NGN', reference);
    const query = `${transactionQuery}&providerReference=retry-provider-ref&evidenceReference=retry-evidence-ref&${new URLSearchParams({ retryOfEventId: reference })}`;
    const body = await (await request(query)).json();
    assert.equal(body.retryOfEventId, reference);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 81 }],
      'exact opaque reference, including case, punctuation, whitespace and Unicode');
    const both = await (await request(query, multi)).json();
    assert.equal(both.summaries.length, 2);
    assert.equal(both.summaries[0].actualCostMinor, 91);
    assert.deepEqual((await (await request(`${query}&companyId=company-bakery`, multi)).json()).summaries,
      [both.summaries[0]]);
    const denominations = new URLSearchParams(query);
    denominations.delete('costCurrency');
    assert.deepEqual((await (await request(denominations)).json()).summaries.map(row => [row.currency, row.actualCostMinor]),
      [['EUR', 82], ['NGN', 81]], 'cost currencies remain separate');
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
      ['pricingId', 'PRICE-A'], ['pricingRevision', '2'], ['actorRoleCode', 'FINANCE'], ['currency', 'NGN'], ['providerReference', 'absent-reference'], ['evidenceReference', 'absent-evidence']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects reference`);
    }
    assert.ok(!JSON.stringify(both).includes('internal-result-must-not-leak'));
  }
  retryInsert.run(String(++id), 'company-printing', null, 'NGN', 'pending-reference');
  const pendingRetry = await (await request(`${transactionQuery}&retryOfEventId=pending-reference`)).json();
  assert.equal(pendingRetry.summaries[0].actualCostMinor, null);
  assert.equal(pendingRetry.summaries[0].actualCostEventCount, 0);
  retryInsert.run(String(++id), 'company-bakery', 999, 'NGN', 'foreign-reference');
  for (const reference of ['foreign-reference', 'absent-reference', "x' OR 1=1 --"]) {
    assert.deepEqual((await (await request(`${base}&${new URLSearchParams({ retryOfEventId: reference })}`)).json()).summaries, []);
  }
  const withoutRetry = await (await request(`${transactionQuery}&providerReference=retry-provider-ref&evidenceReference=retry-evidence-ref`)).json();
  assert.equal(withoutRetry.retryOfEventId, null);
  assert.equal(withoutRetry.summaries[0].eventCount, 13, 'omission includes all inserted evidence references');
  assert.equal(withoutRetry.summaries[0].actualCostMinor, 486);
  const retryReads = reads;
  for (const reference of ['', ' ', 'x'.repeat(161), '\u{1f4b0}'.repeat(81), 'ref\n', 'a\u0000', 'a\u007f']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ retryOfEventId: reference })}`)).status, 400);
  }
  assert.equal((await request(`${base}&retryOfEventId=ref-a`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&retryOfEventId=foreign-reference&companyId=company-bakery`)).status, 403);
  assert.equal(reads, retryReads, 'invalid references and denied scope reject before SQL');
  console.log('Monthly retry-event totals: real route / SQLite regression PASS');
  const legacyRetry = await (await request(`${transactionQuery}&providerReference=ref-a`)).json();
  assert.equal(legacyRetry.retryOfEventId, null);
  assert.equal(legacyRetry.summaries[0].eventCount, 2, 'omission retains legacy null retry links');
  assert.equal(omitted.reversalOfEventId, null);
  const reversalInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,currency,amount_minor,pricing_id,pricing_revision,
      reversal_of_event_id,retry_of_event_id,provider_reference,evidence_reference,provider_result)
    VALUES(?,?,'user-a','finance','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,?,'USD',
      1000,'price-a',1,?,'ref-a','reversal-provider-ref','reversal-evidence-ref','internal-result-must-not-leak')`);
  for (const reference of ['ref-a', 'REF-A', 'ref-a-suffix', " bank's/ref:1 ", 'x'.repeat(160), '\u{1f4b0}'.repeat(80)]) {
    reversalInsert.run(String(++id), 'company-printing', 81, 'NGN', reference);
    reversalInsert.run(String(++id), 'company-printing', null, 'NGN', reference);
    reversalInsert.run(String(++id), 'company-printing', 82, 'EUR', reference);
    reversalInsert.run(String(++id), 'company-bakery', 91, 'NGN', reference);
    const query = `${transactionQuery}&providerReference=reversal-provider-ref&evidenceReference=reversal-evidence-ref&retryOfEventId=ref-a&${new URLSearchParams({ reversalOfEventId: reference })}`;
    const body = await (await request(query)).json();
    assert.equal(body.reversalOfEventId, reference);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 81 }],
      'exact opaque reference, including case, punctuation, whitespace and Unicode');
    const both = await (await request(query, multi)).json();
    assert.equal(both.summaries.length, 2);
    assert.equal(both.summaries[0].actualCostMinor, 91);
    assert.deepEqual((await (await request(`${query}&companyId=company-bakery`, multi)).json()).summaries,
      [both.summaries[0]]);
    const denominations = new URLSearchParams(query);
    denominations.delete('costCurrency');
    assert.deepEqual((await (await request(denominations)).json()).summaries.map(row => [row.currency, row.actualCostMinor]),
      [['EUR', 82], ['NGN', 81]], 'cost currencies remain separate');
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
      ['pricingId', 'PRICE-A'], ['pricingRevision', '2'], ['actorRoleCode', 'FINANCE'], ['currency', 'NGN'], ['providerReference', 'absent-reference'], ['evidenceReference', 'absent-evidence'], ['retryOfEventId', 'REF-A']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects reference`);
    }
    assert.ok(!JSON.stringify(both).includes('internal-result-must-not-leak'));
  }
  reversalInsert.run(String(++id), 'company-printing', null, 'NGN', 'pending-reference');
  const pendingReversal = await (await request(`${transactionQuery}&reversalOfEventId=pending-reference`)).json();
  assert.equal(pendingReversal.summaries[0].actualCostMinor, null);
  assert.equal(pendingReversal.summaries[0].actualCostEventCount, 0);
  reversalInsert.run(String(++id), 'company-bakery', 999, 'NGN', 'foreign-reference');
  for (const reference of ['foreign-reference', 'absent-reference', "x' OR 1=1 --"]) {
    assert.deepEqual((await (await request(`${base}&${new URLSearchParams({ reversalOfEventId: reference })}`)).json()).summaries, []);
  }
  const withoutReversal = await (await request(`${transactionQuery}&providerReference=reversal-provider-ref&evidenceReference=reversal-evidence-ref`)).json();
  assert.equal(withoutReversal.reversalOfEventId, null);
  assert.equal(withoutReversal.summaries[0].eventCount, 13, 'omission includes all inserted evidence references');
  assert.equal(withoutReversal.summaries[0].actualCostMinor, 486);
  const reversalReads = reads;
  for (const reference of ['', ' ', 'x'.repeat(161), '\u{1f4b0}'.repeat(81), 'ref\n', 'a\u0000', 'a\u007f']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ reversalOfEventId: reference })}`)).status, 400);
  }
  assert.equal((await request(`${base}&reversalOfEventId=ref-a`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&reversalOfEventId=foreign-reference&companyId=company-bakery`)).status, 403);
  assert.equal(reads, reversalReads, 'invalid references and denied scope reject before SQL');
  console.log('Monthly reversal-event totals: real route / SQLite regression PASS');
  const legacyReversal = await (await request(`${transactionQuery}&providerReference=ref-a`)).json();
  assert.equal(legacyReversal.reversalOfEventId, null);
  assert.equal(legacyReversal.summaries[0].eventCount, 2, 'omission retains legacy null reversal links');
  assert.equal(omitted.approvalId, null);
  const approvalInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,currency,amount_minor,pricing_id,pricing_revision,
      approval_id,reversal_of_event_id,retry_of_event_id,provider_reference,evidence_reference,provider_result)
    VALUES(?,?,'user-a','finance','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,?,'USD',
      1000,'price-a',1,?,'ref-a','ref-a','approval-provider-ref','approval-evidence-ref','internal-result-must-not-leak')`);
  for (const reference of ['ref-a', 'REF-A', 'ref-a-suffix', " bank's/ref:1 ", 'x'.repeat(160), '\u{1f4b0}'.repeat(80)]) {
    approvalInsert.run(String(++id), 'company-printing', 81, 'NGN', reference);
    approvalInsert.run(String(++id), 'company-printing', null, 'NGN', reference);
    approvalInsert.run(String(++id), 'company-printing', 82, 'EUR', reference);
    approvalInsert.run(String(++id), 'company-bakery', 91, 'NGN', reference);
    const query = `${transactionQuery}&providerReference=approval-provider-ref&evidenceReference=approval-evidence-ref&retryOfEventId=ref-a&reversalOfEventId=ref-a&${new URLSearchParams({ approvalId: reference })}`;
    const body = await (await request(query)).json();
    assert.equal(body.approvalId, reference);
    assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 81 }],
      'exact opaque reference, including case, punctuation, whitespace and Unicode');
    const both = await (await request(query, multi)).json();
    assert.equal(both.summaries.length, 2);
    assert.equal(both.summaries[0].actualCostMinor, 91);
    assert.deepEqual((await (await request(`${query}&companyId=company-bakery`, multi)).json()).summaries,
      [both.summaries[0]]);
    const denominations = new URLSearchParams(query);
    denominations.delete('costCurrency');
    assert.deepEqual((await (await request(denominations)).json()).summaries.map(row => [row.currency, row.actualCostMinor]),
      [['EUR', 82], ['NGN', 81]], 'cost currencies remain separate');
    for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
      ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
      ['pricingId', 'PRICE-A'], ['pricingRevision', '2'], ['actorRoleCode', 'FINANCE'], ['currency', 'NGN'], ['providerReference', 'absent-reference'], ['evidenceReference', 'absent-evidence'], ['retryOfEventId', 'REF-A'], ['reversalOfEventId', 'REF-A']]) {
      const params = new URLSearchParams(query);
      params.set(key, value);
      assert.deepEqual((await (await request(params)).json()).summaries, [], `${key} intersects reference`);
    }
    assert.ok(!JSON.stringify(both).includes('internal-result-must-not-leak'));
  }
  approvalInsert.run(String(++id), 'company-printing', null, 'NGN', 'pending-reference');
  const pendingApproval = await (await request(`${transactionQuery}&approvalId=pending-reference`)).json();
  assert.equal(pendingApproval.summaries[0].actualCostMinor, null);
  assert.equal(pendingApproval.summaries[0].actualCostEventCount, 0);
  approvalInsert.run(String(++id), 'company-bakery', 999, 'NGN', 'foreign-reference');
  for (const reference of ['foreign-reference', 'absent-reference', "x' OR 1=1 --"]) {
    assert.deepEqual((await (await request(`${base}&${new URLSearchParams({ approvalId: reference })}`)).json()).summaries, []);
  }
  const withoutApproval = await (await request(`${transactionQuery}&providerReference=approval-provider-ref&evidenceReference=approval-evidence-ref`)).json();
  assert.equal(withoutApproval.approvalId, null);
  assert.equal(withoutApproval.summaries[0].eventCount, 13, 'omission includes all inserted evidence references');
  assert.equal(withoutApproval.summaries[0].actualCostMinor, 486);
  const approvalReads = reads;
  for (const reference of ['', ' ', 'x'.repeat(161), '\u{1f4b0}'.repeat(81), 'ref\n', 'a\u0000', 'a\u007f']) {
    assert.equal((await request(`${base}&${new URLSearchParams({ approvalId: reference })}`)).status, 400);
  }
  assert.equal((await request(`${base}&approvalId=ref-a`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${base}&approvalId=foreign-reference&companyId=company-bakery`)).status, 403);
  assert.equal(reads, approvalReads, 'invalid references and denied scope reject before SQL');
  console.log('Monthly approval-event totals: real route / SQLite regression PASS');
  const legacyApproval = await (await request(`${transactionQuery}&providerReference=ref-a`)).json();
  assert.equal(legacyApproval.approvalId, null);
  assert.equal(legacyApproval.summaries[0].eventCount, 2, 'omission retains legacy null approval links');

  const participantInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,actor_role_code,action,provider,requesting_module,occurred_at,
      estimated_cost_minor,actual_cost_minor,cost_currency,currency,amount_minor,pricing_id,pricing_revision,
      approval_id,reversal_of_event_id,retry_of_event_id,provider_reference,evidence_reference,
      maker_employee_id,checker_employee_id,provider_result)
    VALUES(?,?,'user-a','finance','estimate','paystack','finance','2026-09-15T12:00:00Z',20,?,?,'USD',
      1000,'price-a',1,'ref-a','ref-a','ref-a','participant-provider','participant-evidence',?,?,'internal-result-must-not-leak')`);
  const participantBase = `${transactionQuery}&providerReference=participant-provider&evidenceReference=participant-evidence&approvalId=ref-a&retryOfEventId=ref-a&reversalOfEventId=ref-a`;
  const employees = ['participant:A_1', 'participant:a_1', 'participant:A_1-suffix', 'x'.repeat(160)];
  for (const employee of employees) db.prepare('INSERT INTO employees VALUES(?)').run(employee);
  for (const field of ['makerEmployeeId', 'checkerEmployeeId']) {
    const other = field === 'makerEmployeeId' ? 'checkerEmployeeId' : 'makerEmployeeId';
    assert.equal(omitted[field], null);
    for (const employee of employees) {
      const participants = field === 'makerEmployeeId' ? [employee, 'user-b'] : ['user-b', employee];
      for (const [company, actual, currency] of [['company-printing', 81, 'NGN'],
        ['company-printing', null, 'NGN'], ['company-printing', 82, 'EUR'], ['company-bakery', 91, 'NGN']]) {
        participantInsert.run(String(++id), company, actual, currency, ...participants);
      }
      const query = new URLSearchParams(`${participantBase}&${other}=user-b`);
      query.set(field, employee);
      const body = await (await request(query)).json();
      assert.equal(body[field], employee);
      assert.equal(body[other], 'user-b');
      assert.deepEqual(body.summaries, [{ ...result.summaries[0], actualCostMinor: 81 }]);
      const both = await (await request(query, multi)).json();
      assert.equal(both.summaries.length, 2);
      assert.equal(both.summaries[0].actualCostMinor, 91);
      const companyQuery = new URLSearchParams(query);
      companyQuery.set('companyId', 'company-bakery');
      assert.deepEqual((await (await request(companyQuery, multi)).json()).summaries, [both.summaries[0]]);
      const denominations = new URLSearchParams(query);
      denominations.delete('costCurrency');
      assert.deepEqual((await (await request(denominations)).json()).summaries.map(row => [row.currency, row.actualCostMinor]),
        [['EUR', 82], ['NGN', 81]]);
      for (const [key, value] of [['provider', 'mono'], ['module', 'payroll'], ['month', '2026-08'],
        ['actorEmployeeId', 'user-b'], ['costCurrency', 'USD'], ['action', 'pending'],
        ['pricingId', 'PRICE-A'], ['pricingRevision', '2'], ['actorRoleCode', 'FINANCE'], ['currency', 'NGN'],
        ['providerReference', 'absent'], ['evidenceReference', 'absent'], ['retryOfEventId', 'REF-A'],
        ['reversalOfEventId', 'REF-A'], ['approvalId', 'REF-A'], [other, 'user-a']]) {
        const mismatch = new URLSearchParams(query);
        mismatch.set(key, value);
        assert.deepEqual((await (await request(mismatch)).json()).summaries, [], `${key} intersects ${field}`);
      }
      query.delete(other);
      assert.deepEqual((await (await request(query)).json()).summaries, body.summaries, 'each filter works independently');
      assert.ok(!JSON.stringify(both).includes('internal-result-must-not-leak'));
    }
    const participants = field === 'makerEmployeeId' ? ['foreign-user', null] : [null, 'foreign-user'];
    participantInsert.run(String(++id), 'company-bakery', 999, 'NGN', ...participants);
    for (const employee of ['foreign-user', 'absent-user']) {
      assert.deepEqual((await (await request(`${participantBase}&${field}=${employee}`)).json()).summaries, []);
    }
    const beforeInvalid = reads;
    for (const employee of ['', ' ', 'x'.repeat(161), 'a\n', 'a\u0000', 'a\u007f', 'a/b', 'é', "x' OR 1=1 --"]) {
      assert.equal((await request(`${base}&${new URLSearchParams({ [field]: employee })}`)).status, 400);
    }
    assert.equal((await request(`${base}&${field}=user-a`, { ...context, allowed: [] })).status, 403);
    assert.equal((await request(`${base}&${field}=foreign-user&companyId=company-bakery`)).status, 403);
    assert.equal(reads, beforeInvalid, 'invalid filters and revoked permission reject before SQL');
    const pendingParticipants = field === 'makerEmployeeId' ? ['user-a', null] : [null, 'user-a'];
    participantInsert.run(String(++id), 'company-printing', null, 'NGN', ...pendingParticipants);
    const pending = await (await request(`${participantBase}&${field}=user-a`)).json();
    assert.equal(pending.summaries[0].actualCostMinor, null);
    assert.equal(pending.summaries[0].actualCostEventCount, 0);
  }
  const legacyParticipants = await (await request(`${transactionQuery}&providerReference=ref-a`)).json();
  assert.equal(legacyParticipants.makerEmployeeId, null);
  assert.equal(legacyParticipants.checkerEmployeeId, null);
  assert.equal(legacyParticipants.summaries[0].eventCount, 2, 'omission retains legacy null participants');
  console.log('Monthly maker/checker totals: real route / SQLite regression PASS');
  assert.equal(omitted.day, null);
  for (const [time, actual, company, currency] of [
    ['2024-02-29T00:00:00Z', 10, 'company-printing', 'NGN'],
    ['2024-02-29T23:59:59Z', null, 'company-printing', 'NGN'],
    ['2024-03-01T00:30:00+01:00', 20, 'company-printing', 'USD'],
    ['2024-02-28T23:30:00-01:00', 30, 'company-bakery', 'NGN'],
    ['2024-02-28T23:59:59Z', 40, 'company-printing', 'NGN'],
    ['2024-03-01T00:00:00Z', 50, 'company-printing', 'NGN'],
  ]) add('user-a', actual, currency, company, 'paystack', 'finance', time);
  const dayQuery = 'month=2024-02&day=2024-02-29&provider=paystack&module=finance&actorEmployeeId=user-a';
  const daily = await (await request(dayQuery)).json();
  assert.equal(daily.day, '2024-02-29');
  assert.deepEqual(daily.summaries, [result.summaries[0], { ...result.summaries[1], actualCostMinor: 20 }]);
  const dailyBoth = await (await request(dayQuery, multi)).json();
  assert.equal(dailyBoth.summaries.length, 3);
  assert.equal(dailyBoth.summaries[0].actualCostMinor, 30);
  assert.deepEqual((await (await request(`${dayQuery}&companyId=company-bakery`, multi)).json()).summaries, [dailyBoth.summaries[0]]);
  assert.deepEqual((await (await request(`${dayQuery}&costCurrency=NGN`)).json()).summaries, [daily.summaries[0]]);
  for (const [key, value] of [['month', '2024-03'], ['day', '2024-02-27'], ['provider', 'mono'],
    ['module', 'payroll'], ['actorEmployeeId', 'user-b'], ['action', 'absent'], ['pricingId', 'absent'],
    ['pricingRevision', '2'], ['actorRoleCode', 'absent'], ['currency', 'USD'], ['providerReference', 'absent'],
    ['evidenceReference', 'absent'], ['retryOfEventId', 'absent'], ['reversalOfEventId', 'absent'],
    ['approvalId', 'absent'], ['makerEmployeeId', 'user-b'], ['checkerEmployeeId', 'user-b']]) {
    const query = new URLSearchParams(dayQuery);
    query.set(key, value);
    assert.deepEqual((await (await request(query)).json()).summaries, [], `${key} intersects day`);
  }
  add('user-a', 999, 'NGN', 'company-bakery', 'paystack', 'finance', '2024-02-26T12:00:00Z');
  for (const day of ['2024-02-26', '2024-02-25']) {
    assert.deepEqual((await (await request(`month=2024-02&day=${day}`)).json()).summaries, [], 'foreign and absent days are indistinguishable');
  }
  const dayReads = reads;
  for (const day of ['', ' ', '2023-02-29', '2024-02-30', '2024-04-31', '2024-13-01', '2024-00-01',
    '2024-02-00', '2024-2-29', '2024-02-29T00:00:00Z', '2024-02-29\n', "x' OR 1=1 --"]) {
    assert.equal((await request(new URLSearchParams({ month: '2024-02', day }))).status, 400);
  }
  assert.equal((await request(dayQuery, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${dayQuery}&companyId=company-bakery`)).status, 403);
  assert.equal(reads, dayReads, 'malformed days and denied permissions reject before SQL');
  assert.ok(!JSON.stringify(dailyBoth).includes('internal-result-must-not-leak'));
  console.log('Monthly exact-day totals and UTC boundaries: real route / SQLite regression PASS');

  // More than the old cap, plus legacy NULL and empty provider groups.
  const pageInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,occurred_at)
    VALUES(?,?,'pagination',?,?,'2025-01-15T12:00:00Z')`);
  for (let n = 0; n < 501; n++) pageInsert.run('page-' + n, 'company-printing', 'p' + String(n).padStart(3, '0'), 'finance');
  for (const [n, provider, module] of [[0, null, null], [1, '', null], [2, 'p000', null]]) {
    pageInsert.run('legacy-' + n, 'company-printing', provider, module);
  }
  pageInsert.run('foreign-page', 'company-bakery', 'foreign', 'finance');
  const pageBase = 'month=2025-01&action=pagination';
  const firstPage = await (await request(pageBase)).json();
  assert.equal(firstPage.limit, 500);
  assert.equal(firstPage.summaries.length, 500);
  assert.ok(firstPage.nextCursor);
  const finalPage = await (await request(pageBase + '&cursor=' + encodeURIComponent(firstPage.nextCursor))).json();
  assert.equal(finalPage.summaries.length, 4);
  assert.equal(finalPage.nextCursor, null);
  assert.equal(new Set([...firstPage.summaries, ...finalPage.summaries].map(row => JSON.stringify([row.companyId, row.provider, row.currency, row.module]))).size, 504);
  let next = null; const groups = [];
  do {
    const query = new URLSearchParams(pageBase); query.set('limit', '2');
    if (next) query.set('cursor', next);
    const page = await (await request(query)).json();
    groups.push(...page.summaries); next = page.nextCursor;
  } while (next);
  assert.deepEqual(groups, [...firstPage.summaries, ...finalPage.summaries], 'small pages preserve null ordering and every aggregate');
  assert.equal(groups[0].provider, null);
  assert.equal(groups[1].provider, '');
  assert.equal(groups[2].module, null);
  const query = new URLSearchParams(pageBase); query.set('limit', '1');
  const multiFirst = await (await request(query, multi)).json();
  assert.equal(multiFirst.summaries[0].companyId, 'company-bakery');
  query.set('cursor', multiFirst.nextCursor);
  const narrowed = await (await request(query)).json();
  assert.equal(narrowed.summaries[0].companyId, 'company-printing', 'cursor grants no company authority');
  query.set('provider', 'p500');
  assert.equal((await (await request(query)).json()).summaries[0].provider, 'p500');
  query.set('module', 'payroll');
  assert.deepEqual((await (await request(query)).json()).summaries, []);
  query.delete('module'); query.set('day', '2025-01-14');
  assert.deepEqual((await (await request(query)).json()).summaries, []);
  const costPageQuery = new URLSearchParams(dayQuery); costPageQuery.set('limit', '1');
  const costFirst = await (await request(costPageQuery, multi)).json();
  costPageQuery.set('cursor', costFirst.nextCursor);
  const costSecond = await (await request(costPageQuery, multi)).json();
  costPageQuery.set('cursor', costSecond.nextCursor);
  const costLast = await (await request(costPageQuery, multi)).json();
  assert.deepEqual([...costFirst.summaries,...costSecond.summaries,...costLast.summaries], dailyBoth.summaries,
    'company/currency groups and complete null-aware aggregates survive page boundaries');
  assert.equal(costLast.nextCursor,null);
  // Appending evidence to an earlier group does not shift the continuation position.
  add('user-a', 5, 'NGN', 'company-bakery', 'paystack', 'finance', '2024-02-29T01:00:00Z');
  costPageQuery.set('cursor',costFirst.nextCursor);
  assert.deepEqual((await (await request(costPageQuery,multi)).json()).summaries,costSecond.summaries);
  const pageReads = reads;
  for (const cursor of ['', 'null', '{}', '[]', '[null,null,null,null]', '["company-printing",1,null,null]',
    JSON.stringify(['company-printing','a\n',null,null]), JSON.stringify(['x'.repeat(1025),null,null,null]), 'x'.repeat(8193)]) {
    assert.equal((await request(new URLSearchParams({month:'2025-01',cursor}))).status, 400);
  }
  for (const limit of ['', '0', '-1', '501', '1.5', 'NaN', 'Infinity']) {
    assert.equal((await request(pageBase + '&limit=' + limit)).status, 400);
  }
  assert.equal((await request(query, {...context, allowed:[]})).status,403);
  assert.equal((await request(pageBase + '&companyId=company-bakery&cursor=' + encodeURIComponent(firstPage.nextCursor))).status,403);
  assert.equal(reads,pageReads,'malformed pagination and denied scope reject before SQL');
  const malicious = JSON.stringify(["x' OR 1=1 --",null,null,null]);
  assert.deepEqual((await (await request(pageBase + '&cursor=' + encodeURIComponent(malicious))).json()).summaries,[]);
  assert.ok(!JSON.stringify(groups).includes('internal-result-must-not-leak'));
  console.log('Monthly summary continuation, legacy null ordering and current authorization: real route / SQLite PASS');

} finally {
  db.close();
}
