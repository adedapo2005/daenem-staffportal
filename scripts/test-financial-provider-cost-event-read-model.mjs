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
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, provider, provider, requestingModule, requestingModule, day, day, month, month, actorEmployeeId, actorEmployeeId, providerReference, providerReference, beforeTime, beforeTime, beforeTime, beforeId, limit \+ 1\)/);
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
  for (let i = 0; i < 205; i++) insert.run(`tied-${String(i).padStart(3, '0')}`, 'company-printing', '2026-09-15T12:00:00Z');
  const query = 'month=2026-09&provider=paystack&module=finance&actorEmployeeId=synthetic-user&limit=100';
  const first = await (await request(query)).json();
  assert.equal(first.events.length, 100);
  assert.ok(first.nextCursor);
  // A newer append between pages must not shift an offset and repeat evidence.
  insert.run('new-after-first-page', 'company-printing', '2026-09-30T23:59:59.999Z');
  const collected = [...first.events];
  let cursor = first.nextCursor;
  let pages = 1;
  while (cursor) {
    assert.ok(++pages <= 4, 'pagination terminates');
    const page = await (await request(`${query}&cursor=${encodeURIComponent(cursor)}`)).json();
    assert.ok(page.events.length <= 100);
    collected.push(...page.events);
    cursor = page.nextCursor;
  }
  const expected = db.prepare(`SELECT id FROM financial_provider_cost_events WHERE company_id='company-printing'
    AND strftime('%Y-%m',occurred_at)='2026-09' AND id!='new-after-first-page' ORDER BY occurred_at DESC,id DESC`).all();
  assert.deepEqual(collected.map(event => event.id), expected.map(event => event.id));
  assert.equal(new Set(collected.map(event => event.id)).size, 208);
  const last = collected.at(-1);
  const exhausted = await (await request(`${query}&cursor=${encodeURIComponent(JSON.stringify([last.occurredAt, last.id]))}`)).json();
  assert.deepEqual(exhausted.events, []);
  assert.equal(exhausted.nextCursor, null);
  const exactPage = await (await request('day=2026-09-01&limit=1')).json();
  assert.equal(exactPage.events.length, 1);
  assert.equal(exactPage.nextCursor, null, 'exact page size has no phantom continuation');
  const foreignCursor = encodeURIComponent(JSON.stringify(['2026-09-15T00:00:00Z', 'other-company']));
  const scoped = await (await request(`${query}&cursor=${foreignCursor}`)).json();
  assert.ok(scoped.events.every(event => event.companyId === 'company-printing'));
  for (const filter of ['provider=mono', 'module=attendance', 'actorEmployeeId=another-user', 'month=2026-08&day=2026-09-01']) {
    const filtered = await (await request(`${filter}&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    assert.deepEqual(filtered.events, [], 'continuation retains every requested filter');
    assert.equal(filtered.nextCursor, null);
  }
  const injectedPosition = encodeURIComponent(JSON.stringify(['2026-09-15T00:00:00Z', "' OR 1=1 --"]));
  const injection = await (await request(`${query}&cursor=${injectedPosition}`)).json();
  assert.ok(injection.events.every(event => event.companyId === 'company-printing'));
  const deniedReads = reads;
  assert.equal((await request(`${query}&cursor=${encodeURIComponent(first.nextCursor)}`, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${query}&companyId=company-bakery&cursor=${foreignCursor}`)).status, 403);
  for (const invalid of ['', 'null', '{}', '[]', '[1,2]', '["bad-date","id"]', '["2026-09-01",""]', JSON.stringify(['2026-09-01', 'x'.repeat(161)]), 'x'.repeat(1025)]) {
    assert.equal((await request(`${query}&cursor=${encodeURIComponent(invalid)}`)).status, 400);
  }
  assert.equal(reads, deniedReads, 'invalid cursors and revoked permissions reject before evidence query');
  assert.ok(!JSON.stringify(collected).includes('internal-result-must-not-leak'));
  const reference = "Txn / A+%_&'";
  const referenceInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,actor_employee_id,action,provider,requesting_module,occurred_at,provider_reference,provider_result)
    VALUES(?,?,'synthetic-user','estimate','paystack','finance',?,?,'internal-result-must-not-leak')`);
  const setReference = { run(value, id) {
    referenceInsert.run(`ref-${id}`, id === 'other-company' ? 'company-bakery' : 'company-printing',
      id === 'august' ? '2026-08-15T12:00:00Z' : '2026-09-15T12:00:00Z', value);
  } };
  for (const id of ['tied-001', 'tied-002', 'tied-003', 'other-company', 'august']) setReference.run(reference, id);
  setReference.run(reference.toLowerCase(), 'tied-004');
  setReference.run(`${reference}suffix`, 'tied-005');
  const referenceQuery = new URLSearchParams({ providerReference: reference, month: '2026-09',
    provider: 'paystack', module: 'finance', actorEmployeeId: 'synthetic-user', day: '2026-09-15', limit: '2' });
  const referenceFirst = await (await request(referenceQuery)).json();
  assert.equal(referenceFirst.providerReference, reference);
  assert.deepEqual(referenceFirst.events.map(event => event.id), ['ref-tied-003', 'ref-tied-002']);
  assert.ok(referenceFirst.nextCursor);
  referenceQuery.set('cursor', referenceFirst.nextCursor);
  const referenceLast = await (await request(referenceQuery)).json();
  assert.deepEqual(referenceLast.events.map(event => event.id), ['ref-tied-001']);
  assert.equal(referenceLast.nextCursor, null);
  assert.ok(!JSON.stringify(referenceLast).includes('internal-result-must-not-leak'));
  for (const [key, value] of [['provider', 'mono'], ['module', 'attendance'], ['actorEmployeeId', 'another-user'],
    ['month', '2026-08'], ['day', '2026-09-01'], ['providerReference', "' OR 1=1 --"]]) {
    const mismatched = new URLSearchParams(referenceQuery);
    mismatched.set(key, value);
    const result = await (await request(mismatched)).json();
    assert.deepEqual(result.events, [], `${key} remains intersected on continuation`);
    assert.equal(result.nextCursor, null);
  }
  referenceInsert.run('ref-private', 'company-bakery', '2026-09-15T12:00:00Z', 'private-reference');
  for (const value of ['private-reference', 'missing-reference']) {
    const result = await (await request(new URLSearchParams({ providerReference: value }))).json();
    assert.deepEqual(result.events, [], 'foreign and absent references both return empty evidence');
    assert.equal(result.nextCursor, null);
  }
  const referenceReads = reads;
  assert.equal((await request(referenceQuery, { ...context, allowed: [] })).status, 403);
  referenceQuery.set('companyId', 'company-bakery');
  assert.equal((await request(referenceQuery)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(201), 'ref\n', 'ref\u0000', 'ref\u007f']) {
    assert.equal((await request(new URLSearchParams({ providerReference: value }))).status, 400);
  }
  assert.equal(reads, referenceReads, 'invalid references and unauthorized requests never read evidence');
  setReference.run('x'.repeat(200), 'max-length');
  const boundedReference = await (await request(new URLSearchParams({ providerReference: 'x'.repeat(200) }))).json();
  assert.deepEqual(boundedReference.events.map(event => event.id), ['ref-max-length']);
  console.log('Financial provider-reference drilldown: runtime/SQLite PASS');
  console.log('Financial provider-cost keyset pagination: runtime/SQLite PASS');
  console.log('Financial provider-cost monthly drilldown: runtime/SQLite PASS');
} finally {
  db.close();
}
