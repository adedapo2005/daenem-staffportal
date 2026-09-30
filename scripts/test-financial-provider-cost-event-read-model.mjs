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
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, provider, provider, requestingModule, requestingModule, day, day, month, month, actorEmployeeId, actorEmployeeId, providerReference, providerReference, action, action, pricingId, pricingId, pricingRevision, pricingRevision, evidenceReference, evidenceReference, retryOfEventId, retryOfEventId, reversalOfEventId, reversalOfEventId, approvalId, approvalId, makerEmployeeId, makerEmployeeId, checkerEmployeeId, checkerEmployeeId, costCurrency, costCurrency, currency, currency, actorRoleCode, actorRoleCode, beforeTime, beforeTime, beforeTime, beforeId, limit \+ 1\)/);
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
  const actionInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,occurred_at,provider_result)
    VALUES(?, ?, ?, 'paystack','finance','synthetic-user','action-reference','2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  const action = "Verify / A+%_&'";
  for (const [id, company, value] of [
    ['action-1', 'company-printing', action], ['action-2', 'company-printing', action],
    ['action-3', 'company-printing', action], ['action-foreign', 'company-bakery', action],
    ['action-case', 'company-printing', action.toLowerCase()],
    ['action-prefix', 'company-printing', `${action}suffix`],
    ['action-space', 'company-printing', ` ${action} `],
    ['action-private', 'company-bakery', 'private-action'],
    ['action-max', 'company-printing', 'x'.repeat(100)],
    ['action-unicode', 'company-printing', '😀'.repeat(100)],
  ]) actionInsert.run(id, company, value);
  const actionQuery = new URLSearchParams({ action, provider: 'paystack', module: 'finance',
    actorEmployeeId: 'synthetic-user', providerReference: 'action-reference', month: '2026-09', day: '2026-09-15', limit: '2' });
  const actionFirst = await (await request(actionQuery)).json();
  assert.equal(actionFirst.action, action);
  assert.deepEqual(actionFirst.events.map(event => event.id), ['action-3', 'action-2']);
  assert.ok(actionFirst.nextCursor);
  actionQuery.set('cursor', actionFirst.nextCursor);
  const actionLast = await (await request(actionQuery)).json();
  assert.deepEqual(actionLast.events.map(event => event.id), ['action-1']);
  assert.equal(actionLast.nextCursor, null);
  assert.ok(!JSON.stringify(actionLast).includes('internal-result-must-not-leak'));
  for (const [key, value] of [['provider', 'mono'], ['module', 'attendance'], ['actorEmployeeId', 'another-user'],
    ['providerReference', 'absent'], ['month', '2026-08'], ['day', '2026-09-01'], ['action', "' OR 1=1 --"]]) {
    const mismatch = new URLSearchParams(actionQuery);
    mismatch.set(key, value);
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects the action continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const value of ['private-action', 'absent-action']) {
    const result = await (await request(new URLSearchParams({ action: value }))).json();
    assert.deepEqual(result.events, [], 'foreign and absent actions are indistinguishable');
  }
  const actionReads = reads;
  assert.equal((await request(actionQuery, { ...context, allowed: [] })).status, 403);
  actionQuery.set('companyId', 'company-bakery');
  assert.equal((await request(actionQuery)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(101), '😀'.repeat(101), 'action\n', 'action\u0000', 'action\u007f']) {
    assert.equal((await request(new URLSearchParams({ action: value }))).status, 400);
  }
  assert.equal(reads, actionReads, 'invalid actions and denied requests never query evidence');
  for (const [value, id] of [['x'.repeat(100), 'action-max'], ['😀'.repeat(100), 'action-unicode'], [` ${action} `, 'action-space']]) {
    const result = await (await request(new URLSearchParams({ action: value }))).json();
    assert.deepEqual(result.events.map(event => event.id), [id]);
  }
  const omittedAction = await (await request('providerReference=action-reference')).json();
  assert.equal(omittedAction.action, null);
  assert.equal(omittedAction.events.length, 8, 'omitted action retains all authorized action values');
  const pricingId = 'Price:Record_01-A';
  const pricingInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,occurred_at,provider_result)
    VALUES(?,?,'estimate','paystack','finance','synthetic-user','pricing-reference',?,'2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  for (const value of [pricingId, pricingId.toLowerCase(), `${pricingId}suffix`, 'private-price', 'x'.repeat(160)]) {
    db.prepare('INSERT INTO financial_provider_pricing(id) VALUES(?)').run(value);
  }
  for (const [id, company, value] of [
    ['price-1', 'company-printing', pricingId], ['price-2', 'company-printing', pricingId],
    ['price-3', 'company-printing', pricingId], ['price-foreign', 'company-bakery', pricingId],
    ['price-case', 'company-printing', pricingId.toLowerCase()],
    ['price-prefix', 'company-printing', `${pricingId}suffix`],
    ['price-private', 'company-bakery', 'private-price'],
    ['price-max', 'company-printing', 'x'.repeat(160)],
    ['price-null', 'company-printing', null],
  ]) pricingInsert.run(id, company, value);
  const pricingQuery = new URLSearchParams({ pricingId, action: 'estimate', provider: 'paystack', module: 'finance',
    actorEmployeeId: 'synthetic-user', providerReference: 'pricing-reference', month: '2026-09', day: '2026-09-15', limit: '2' });
  const pricingFirst = await (await request(pricingQuery)).json();
  assert.equal(pricingFirst.pricingId, pricingId);
  assert.deepEqual(pricingFirst.events.map(event => event.id), ['price-3', 'price-2']);
  assert.ok(pricingFirst.nextCursor);
  pricingQuery.set('cursor', pricingFirst.nextCursor);
  const pricingLast = await (await request(pricingQuery)).json();
  assert.deepEqual(pricingLast.events.map(event => event.id), ['price-1']);
  assert.equal(pricingLast.nextCursor, null);
  assert.ok(!JSON.stringify(pricingLast).includes('internal-result-must-not-leak'));
  for (const [key, value] of [['provider', 'mono'], ['module', 'attendance'], ['actorEmployeeId', 'another-user'],
    ['providerReference', 'absent'], ['month', '2026-08'], ['day', '2026-09-01'], ['action', 'other'], ['pricingId', 'absent']]) {
    const mismatch = new URLSearchParams(pricingQuery);
    mismatch.set(key, value);
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects the pricing continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const value of ['private-price', 'absent-price']) {
    const result = await (await request(new URLSearchParams({ pricingId: value }))).json();
    assert.deepEqual(result.events, [], 'foreign and absent pricing records are indistinguishable');
  }
  const pricingReads = reads;
  assert.equal((await request(pricingQuery, { ...context, allowed: [] })).status, 403);
  pricingQuery.set('companyId', 'company-bakery');
  assert.equal((await request(pricingQuery)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(161), 'price\n', 'price\u0000', "' OR 1=1 --", 'price/path']) {
    assert.equal((await request(new URLSearchParams({ pricingId: value }))).status, 400);
  }
  assert.equal(reads, pricingReads, 'invalid pricing IDs and denied requests never query evidence');
  for (const [value, id] of [['x'.repeat(160), 'price-max'], [pricingId.toLowerCase(), 'price-case'], [`${pricingId}suffix`, 'price-prefix']]) {
    const result = await (await request(new URLSearchParams({ pricingId: value }))).json();
    assert.deepEqual(result.events.map(event => event.id), [id]);
  }
  const omittedPricing = await (await request('providerReference=pricing-reference')).json();
  assert.equal(omittedPricing.pricingId, null);
  assert.equal(omittedPricing.events.length, 7, 'omitting pricing includes authorized evidence with and without pricing');
  const evidenceReference = "Evidence / A+%_&'";
  const evidenceInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,evidence_reference,occurred_at,provider_result)
    VALUES(?,?,'estimate','paystack','finance','synthetic-user','evidence-provider',?,?,'2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  for (const [id, company, value] of [
    ['evidence-1', 'company-printing', evidenceReference], ['evidence-2', 'company-printing', evidenceReference],
    ['evidence-3', 'company-printing', evidenceReference], ['evidence-foreign', 'company-bakery', evidenceReference],
    ['evidence-case', 'company-printing', evidenceReference.toLowerCase()],
    ['evidence-prefix', 'company-printing', `${evidenceReference}suffix`],
    ['evidence-space', 'company-printing', ` ${evidenceReference} `],
    ['evidence-private', 'company-bakery', 'private-evidence'],
    ['evidence-max', 'company-printing', 'x'.repeat(160)],
    ['evidence-unicode', 'company-printing', '\u{1f600}'.repeat(160)],
    ['evidence-null', 'company-printing', null],
  ]) evidenceInsert.run(id, company, pricingId, value);
  const evidenceQuery = new URLSearchParams({ evidenceReference, pricingId, action: 'estimate', provider: 'paystack', module: 'finance',
    actorEmployeeId: 'synthetic-user', providerReference: 'evidence-provider', month: '2026-09', day: '2026-09-15', limit: '2' });
  const evidenceFirst = await (await request(evidenceQuery)).json();
  assert.equal(evidenceFirst.evidenceReference, evidenceReference);
  assert.deepEqual(evidenceFirst.events.map(event => event.id), ['evidence-3', 'evidence-2']);
  assert.ok(evidenceFirst.nextCursor);
  evidenceQuery.set('cursor', evidenceFirst.nextCursor);
  const evidenceLast = await (await request(evidenceQuery)).json();
  assert.deepEqual(evidenceLast.events.map(event => event.id), ['evidence-1']);
  assert.equal(evidenceLast.nextCursor, null);
  assert.ok(!JSON.stringify(evidenceLast).includes('internal-result-must-not-leak'));
  for (const [key, value] of [['provider', 'mono'], ['module', 'attendance'], ['actorEmployeeId', 'another-user'],
    ['providerReference', 'absent'], ['month', '2026-08'], ['day', '2026-09-01'], ['action', 'other'],
    ['pricingId', 'absent'], ['evidenceReference', "' OR 1=1 --"]]) {
    const mismatch = new URLSearchParams(evidenceQuery);
    mismatch.set(key, value);
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects the evidence continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const value of ['private-evidence', 'absent-evidence']) {
    const result = await (await request(new URLSearchParams({ evidenceReference: value }))).json();
    assert.deepEqual(result.events, [], 'foreign and absent evidence references are indistinguishable');
    assert.equal(result.nextCursor, null);
  }
  const evidenceReads = reads;
  assert.equal((await request(evidenceQuery, { ...context, allowed: [] })).status, 403);
  evidenceQuery.set('companyId', 'company-bakery');
  assert.equal((await request(evidenceQuery)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(161), '\u{1f600}'.repeat(161), 'ref\n', 'ref\u0000', 'ref\u007f']) {
    assert.equal((await request(new URLSearchParams({ evidenceReference: value }))).status, 400);
  }
  assert.equal(reads, evidenceReads, 'invalid references and denied requests never query evidence');
  for (const [value, id] of [['x'.repeat(160), 'evidence-max'], ['\u{1f600}'.repeat(160), 'evidence-unicode'],
    [evidenceReference.toLowerCase(), 'evidence-case'], [`${evidenceReference}suffix`, 'evidence-prefix'], [` ${evidenceReference} `, 'evidence-space']]) {
    const result = await (await request(new URLSearchParams({ evidenceReference: value }))).json();
    assert.deepEqual(result.events.map(event => event.id), [id]);
  }
  const omittedEvidence = await (await request('providerReference=evidence-provider')).json();
  assert.equal(omittedEvidence.evidenceReference, null);
  assert.equal(omittedEvidence.events.length, 9, 'omission includes authorized evidence with and without references');
  const retryOfEventId = "Original / A+%_&'";
  for (const id of [retryOfEventId, retryOfEventId.toLowerCase(), `${retryOfEventId}suffix`, 'private-original', 'x'.repeat(160)]) {
    insert.run(id, id === 'private-original' ? 'company-bakery' : 'company-printing', '2026-08-01T00:00:00Z');
  }
  const retryInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,evidence_reference,retry_of_event_id,occurred_at,provider_result)
    VALUES(?,?,'estimate','paystack','finance','synthetic-user','retry-provider',?,'retry-evidence',?,'2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  for (const [id, company, value] of [
    ['retry-1', 'company-printing', retryOfEventId], ['retry-2', 'company-printing', retryOfEventId],
    ['retry-3', 'company-printing', retryOfEventId], ['retry-foreign', 'company-bakery', retryOfEventId],
    ['retry-case', 'company-printing', retryOfEventId.toLowerCase()],
    ['retry-prefix', 'company-printing', `${retryOfEventId}suffix`],
    ['retry-private', 'company-bakery', 'private-original'],
    ['retry-max', 'company-printing', 'x'.repeat(160)], ['retry-null', 'company-printing', null],
  ]) retryInsert.run(id, company, pricingId, value);
  const retryQuery = new URLSearchParams({ retryOfEventId, evidenceReference: 'retry-evidence', pricingId,
    action: 'estimate', provider: 'paystack', module: 'finance', actorEmployeeId: 'synthetic-user',
    providerReference: 'retry-provider', month: '2026-09', day: '2026-09-15', limit: '2' });
  const retryFirst = await (await request(retryQuery)).json();
  assert.equal(retryFirst.retryOfEventId, retryOfEventId);
  assert.deepEqual(retryFirst.events.map(event => event.id), ['retry-3', 'retry-2']);
  assert.ok(retryFirst.nextCursor);
  retryQuery.set('cursor', retryFirst.nextCursor);
  const retryLast = await (await request(retryQuery)).json();
  assert.deepEqual(retryLast.events.map(event => event.id), ['retry-1']);
  assert.equal(retryLast.nextCursor, null);
  assert.ok(!JSON.stringify(retryLast).includes('internal-result-must-not-leak'));
  for (const [key, value] of [['provider', 'mono'], ['module', 'attendance'], ['actorEmployeeId', 'another-user'],
    ['providerReference', 'absent'], ['month', '2026-08'], ['day', '2026-09-01'], ['action', 'other'],
    ['pricingId', 'absent'], ['evidenceReference', 'absent'], ['retryOfEventId', "' OR 1=1 --"]]) {
    const mismatch = new URLSearchParams(retryQuery);
    mismatch.set(key, value);
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects the retry continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const value of ['private-original', 'absent-original']) {
    const result = await (await request(new URLSearchParams({ retryOfEventId: value }))).json();
    assert.deepEqual(result.events, [], 'foreign and absent originals disclose no evidence');
    assert.equal(result.nextCursor, null);
  }
  const retryReads = reads;
  assert.equal((await request(retryQuery, { ...context, allowed: [] })).status, 403);
  retryQuery.set('companyId', 'company-bakery');
  assert.equal((await request(retryQuery)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(161), 'id\n', 'id\u0000', 'id\u007f']) {
    assert.equal((await request(new URLSearchParams({ retryOfEventId: value }))).status, 400);
  }
  assert.equal(reads, retryReads, 'invalid retry IDs and denied requests never query evidence');
  for (const [value, id] of [['x'.repeat(160), 'retry-max'], [retryOfEventId.toLowerCase(), 'retry-case'],
    [`${retryOfEventId}suffix`, 'retry-prefix']]) {
    const result = await (await request(new URLSearchParams({ retryOfEventId: value }))).json();
    assert.deepEqual(result.events.map(event => event.id), [id]);
  }
  const omittedRetry = await (await request('providerReference=retry-provider')).json();
  assert.equal(omittedRetry.retryOfEventId, null);
  assert.equal(omittedRetry.events.length, 7, 'omission includes authorized original and retry evidence');
  const reversalOfEventId = retryOfEventId;
  const reversalInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,evidence_reference,reversal_of_event_id,retry_of_event_id,occurred_at,provider_result)
    VALUES(?,?,'estimate','paystack','finance','synthetic-user','reversal-provider',?,'reversal-evidence',?,'september-start','2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  for (const [id, company, value] of [
    ['reversal-1', 'company-printing', reversalOfEventId], ['reversal-2', 'company-printing', reversalOfEventId],
    ['reversal-3', 'company-printing', reversalOfEventId], ['reversal-foreign', 'company-bakery', reversalOfEventId],
    ['reversal-case', 'company-printing', reversalOfEventId.toLowerCase()],
    ['reversal-prefix', 'company-printing', `${reversalOfEventId}suffix`],
    ['reversal-private', 'company-bakery', 'private-original'],
    ['reversal-max', 'company-printing', 'x'.repeat(160)], ['reversal-null', 'company-printing', null],
  ]) reversalInsert.run(id, company, pricingId, value);
  const reversalQuery = new URLSearchParams({ reversalOfEventId, retryOfEventId: 'september-start', evidenceReference: 'reversal-evidence', pricingId,
    action: 'estimate', provider: 'paystack', module: 'finance', actorEmployeeId: 'synthetic-user',
    providerReference: 'reversal-provider', month: '2026-09', day: '2026-09-15', limit: '2' });
  const reversalFirst = await (await request(reversalQuery)).json();
  assert.equal(reversalFirst.reversalOfEventId, reversalOfEventId);
  assert.deepEqual(reversalFirst.events.map(event => event.id), ['reversal-3', 'reversal-2']);
  assert.ok(reversalFirst.nextCursor);
  reversalQuery.set('cursor', reversalFirst.nextCursor);
  const reversalLast = await (await request(reversalQuery)).json();
  assert.deepEqual(reversalLast.events.map(event => event.id), ['reversal-1']);
  assert.equal(reversalLast.nextCursor, null);
  assert.ok(!JSON.stringify(reversalLast).includes('internal-result-must-not-leak'));
  for (const [key, value] of [['provider', 'mono'], ['module', 'attendance'], ['actorEmployeeId', 'another-user'],
    ['providerReference', 'absent'], ['month', '2026-08'], ['day', '2026-09-01'], ['action', 'other'],
    ['pricingId', 'absent'], ['evidenceReference', 'absent'], ['retryOfEventId', 'absent'], ['reversalOfEventId', "' OR 1=1 --"]]) {
    const mismatch = new URLSearchParams(reversalQuery);
    mismatch.set(key, value);
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects the reversal continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const value of ['private-original', 'absent-original']) {
    const result = await (await request(new URLSearchParams({ reversalOfEventId: value }))).json();
    assert.deepEqual(result.events, [], 'foreign and absent originals disclose no evidence');
    assert.equal(result.nextCursor, null);
  }
  const reversalReads = reads;
  assert.equal((await request(reversalQuery, { ...context, allowed: [] })).status, 403);
  reversalQuery.set('companyId', 'company-bakery');
  assert.equal((await request(reversalQuery)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(161), 'id\n', 'id\u0000', 'id\u007f']) {
    assert.equal((await request(new URLSearchParams({ reversalOfEventId: value }))).status, 400);
  }
  assert.equal(reads, reversalReads, 'invalid reversal IDs and denied requests never query evidence');
  for (const [value, id] of [['x'.repeat(160), 'reversal-max'], [reversalOfEventId.toLowerCase(), 'reversal-case'],
    [`${reversalOfEventId}suffix`, 'reversal-prefix']]) {
    const result = await (await request(new URLSearchParams({ reversalOfEventId: value }))).json();
    assert.deepEqual(result.events.map(event => event.id), [id]);
  }
  const omittedReversal = await (await request('providerReference=reversal-provider')).json();
  assert.equal(omittedReversal.reversalOfEventId, null);
  assert.equal(omittedReversal.events.length, 7, 'omission includes authorized original and reversal evidence');
  const approvalId = retryOfEventId;
  const approvalInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,evidence_reference,approval_id,retry_of_event_id,reversal_of_event_id,occurred_at,provider_result)
    VALUES(?,?,'estimate','paystack','finance','synthetic-user','approval-provider',?,'approval-evidence',?,'september-start','september-end','2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  for (const [id, company, value] of [
    ['approval-1', 'company-printing', approvalId], ['approval-2', 'company-printing', approvalId],
    ['approval-3', 'company-printing', approvalId], ['approval-foreign', 'company-bakery', approvalId],
    ['approval-case', 'company-printing', approvalId.toLowerCase()],
    ['approval-prefix', 'company-printing', `${approvalId}suffix`],
    ['approval-private', 'company-bakery', 'private-original'],
    ['approval-max', 'company-printing', 'x'.repeat(160)], ['approval-null', 'company-printing', null],
  ]) approvalInsert.run(id, company, pricingId, value);
  const approvalQuery = new URLSearchParams({ approvalId, reversalOfEventId: 'september-end', retryOfEventId: 'september-start', evidenceReference: 'approval-evidence', pricingId,
    action: 'estimate', provider: 'paystack', module: 'finance', actorEmployeeId: 'synthetic-user',
    providerReference: 'approval-provider', month: '2026-09', day: '2026-09-15', limit: '2' });
  const approvalFirst = await (await request(approvalQuery)).json();
  assert.equal(approvalFirst.approvalId, approvalId);
  assert.deepEqual(approvalFirst.events.map(event => event.id), ['approval-3', 'approval-2']);
  assert.ok(approvalFirst.nextCursor);
  approvalQuery.set('cursor', approvalFirst.nextCursor);
  const approvalLast = await (await request(approvalQuery)).json();
  assert.deepEqual(approvalLast.events.map(event => event.id), ['approval-1']);
  assert.equal(approvalLast.nextCursor, null);
  assert.ok(!JSON.stringify(approvalLast).includes('internal-result-must-not-leak'));
  for (const [key, value] of [['provider', 'mono'], ['module', 'attendance'], ['actorEmployeeId', 'another-user'],
    ['providerReference', 'absent'], ['month', '2026-08'], ['day', '2026-09-01'], ['action', 'other'],
    ['pricingId', 'absent'], ['evidenceReference', 'absent'], ['retryOfEventId', 'absent'], ['reversalOfEventId', 'absent'], ['approvalId', "' OR 1=1 --"]]) {
    const mismatch = new URLSearchParams(approvalQuery);
    mismatch.set(key, value);
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects the approval continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const value of ['private-original', 'absent-original']) {
    const result = await (await request(new URLSearchParams({ approvalId: value }))).json();
    assert.deepEqual(result.events, [], 'foreign and absent approvals disclose no evidence');
    assert.equal(result.nextCursor, null);
  }
  const approvalReads = reads;
  assert.equal((await request(approvalQuery, { ...context, allowed: [] })).status, 403);
  approvalQuery.set('companyId', 'company-bakery');
  assert.equal((await request(approvalQuery)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(161), 'id\n', 'id\u0000', 'id\u007f']) {
    assert.equal((await request(new URLSearchParams({ approvalId: value }))).status, 400);
  }
  assert.equal(reads, approvalReads, 'invalid approval IDs and denied requests never query evidence');
  for (const [value, id] of [['x'.repeat(160), 'approval-max'], [approvalId.toLowerCase(), 'approval-case'],
    [`${approvalId}suffix`, 'approval-prefix']]) {
    const result = await (await request(new URLSearchParams({ approvalId: value }))).json();
    assert.deepEqual(result.events.map(event => event.id), [id]);
  }
  const omittedApproval = await (await request('providerReference=approval-provider')).json();
  assert.equal(omittedApproval.approvalId, null);
  assert.equal(omittedApproval.events.length, 7, 'omission includes authorized linked and unlinked approval evidence');
  // Exercise both employee audit roles independently and together. No employee
  // lookup should disclose whether a filter belongs to another company.
  for (const field of ['makerEmployeeId', 'checkerEmployeeId']) {
    const column = field === 'makerEmployeeId' ? 'maker_employee_id' : 'checker_employee_id';
    const otherColumn = field === 'makerEmployeeId' ? 'checker_employee_id' : 'maker_employee_id';
    const otherField = field === 'makerEmployeeId' ? 'checkerEmployeeId' : 'makerEmployeeId';
    const employee = `${field}:A_1`;
    const employeeInsert = db.prepare('INSERT OR IGNORE INTO employees(id) VALUES(?)');
    for (const value of [employee, employee.toLowerCase(), `${employee}suffix`, 'private-employee', 'x'.repeat(160)]) employeeInsert.run(value);
    const roleInsert = db.prepare(`INSERT INTO financial_provider_cost_events
      (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,evidence_reference,approval_id,retry_of_event_id,reversal_of_event_id,${column},${otherColumn},occurred_at,provider_result)
      VALUES(?,?,'estimate','paystack','finance','synthetic-user',?,?,'role-evidence','role-approval','september-start','september-end',?,'synthetic-user','2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
    for (const [suffix, company, value] of [
      ['1', 'company-printing', employee], ['2', 'company-printing', employee], ['3', 'company-printing', employee],
      ['foreign', 'company-bakery', employee], ['private', 'company-bakery', 'private-employee'],
      ['case', 'company-printing', employee.toLowerCase()], ['prefix', 'company-printing', `${employee}suffix`],
      ['max', 'company-printing', 'x'.repeat(160)], ['null', 'company-printing', null],
    ]) roleInsert.run(`${field}-${suffix}`, company, field, pricingId, value);
    const roleQuery = new URLSearchParams({ [field]: employee, [otherField]: 'synthetic-user',
      providerReference: field, pricingId, evidenceReference: 'role-evidence', approvalId: 'role-approval',
      retryOfEventId: 'september-start', reversalOfEventId: 'september-end', action: 'estimate',
      provider: 'paystack', module: 'finance', actorEmployeeId: 'synthetic-user', day: '2026-09-15', month: '2026-09', limit: '2' });
    const first = await (await request(roleQuery)).json();
    assert.equal(first[field], employee);
    assert.equal(first[otherField], 'synthetic-user');
    assert.deepEqual(first.events.map(event => event.id), [`${field}-3`, `${field}-2`]);
    assert.ok(first.nextCursor);
    roleQuery.set('cursor', first.nextCursor);
    const last = await (await request(roleQuery)).json();
    assert.deepEqual(last.events.map(event => event.id), [`${field}-1`]);
    assert.equal(last.nextCursor, null);
    assert.ok(!JSON.stringify(last).includes('internal-result-must-not-leak'));
    for (const key of [field, otherField, 'actorEmployeeId', 'provider', 'module', 'providerReference', 'pricingId',
      'evidenceReference', 'approvalId', 'retryOfEventId', 'reversalOfEventId', 'action', 'day', 'month']) {
      const mismatch = new URLSearchParams(roleQuery);
      mismatch.set(key, key === 'day' ? '2026-08-01' : key === 'month' ? '2026-08' : 'absent');
      const result = await (await request(mismatch)).json();
      assert.deepEqual(result.events, [], `${key} intersects ${field} continuation`);
    }
    for (const value of ['private-employee', 'absent-employee']) {
      const result = await (await request(new URLSearchParams({ [field]: value }))).json();
      assert.deepEqual(result.events, []);
      assert.equal(result.nextCursor, null);
    }
    const beforeRejection = reads;
    assert.equal((await request(roleQuery, { ...context, allowed: [] })).status, 403);
    assert.equal((await request(`${roleQuery}&companyId=company-bakery`)).status, 403);
    for (const value of ['', ' ', 'x'.repeat(161), 'id\n', 'id\u0000', 'id\u007f', "' OR 1=1 --", 'id/1']) {
      assert.equal((await request(new URLSearchParams({ [field]: value }))).status, 400);
    }
    assert.equal(reads, beforeRejection, 'invalid role IDs and unauthorized requests do not query evidence');
    for (const [value, suffix] of [[employee.toLowerCase(), 'case'], [`${employee}suffix`, 'prefix'], ['x'.repeat(160), 'max']]) {
      const result = await (await request(new URLSearchParams({ [field]: value, providerReference: field }))).json();
      assert.deepEqual(result.events.map(event => event.id), [`${field}-${suffix}`]);
    }
    const omitted = await (await request(new URLSearchParams({ providerReference: field }))).json();
    assert.equal(omitted[field], null);
    assert.equal(omitted[otherField], null);
    assert.equal(omitted.events.length, 7, 'omitted role filters include authorized linked and unlinked evidence');
  }
  // Revisions are exact positive integers, independent of current registry state.
  db.prepare('INSERT INTO financial_provider_pricing(id) VALUES(?)').run('revision-other-price');
  const revisionInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,pricing_revision,
     evidence_reference,approval_id,retry_of_event_id,reversal_of_event_id,maker_employee_id,checker_employee_id,occurred_at,provider_result)
    VALUES(?,?,'estimate','paystack','finance','synthetic-user','revision-provider',?,?,'revision-evidence',
      'revision-approval','september-start','september-end','synthetic-user','synthetic-user',
      '2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  for (const [suffix, company, price, revision] of [
    ['1', 'company-printing', pricingId, 2], ['2', 'company-printing', pricingId, 2],
    ['3', 'company-printing', pricingId, 2], ['foreign', 'company-bakery', pricingId, 2],
    ['private', 'company-bakery', pricingId, 777], ['other-price', 'company-printing', 'revision-other-price', 2],
    ['other-revision', 'company-printing', pricingId, 1], ['null', 'company-printing', pricingId, null],
    ['max', 'company-printing', pricingId, Number.MAX_SAFE_INTEGER],
  ]) revisionInsert.run(`revision-${suffix}`, company, price, revision);
  const revisionQuery = new URLSearchParams({ pricingRevision: '2', pricingId,
    providerReference: 'revision-provider', evidenceReference: 'revision-evidence', approvalId: 'revision-approval',
    retryOfEventId: 'september-start', reversalOfEventId: 'september-end', action: 'estimate',
    makerEmployeeId: 'synthetic-user', checkerEmployeeId: 'synthetic-user', actorEmployeeId: 'synthetic-user',
    provider: 'paystack', module: 'finance', day: '2026-09-15', month: '2026-09', limit: '2' });
  const revisionFirst = await (await request(revisionQuery)).json();
  assert.equal(revisionFirst.pricingRevision, 2);
  assert.deepEqual(revisionFirst.events.map(event => event.id), ['revision-3', 'revision-2']);
  assert.ok(revisionFirst.nextCursor);
  revisionQuery.set('cursor', revisionFirst.nextCursor);
  const revisionLast = await (await request(revisionQuery)).json();
  assert.deepEqual(revisionLast.events.map(event => event.id), ['revision-1']);
  assert.equal(revisionLast.nextCursor, null);
  assert.ok(!JSON.stringify(revisionLast).includes('internal-result-must-not-leak'));
  for (const key of ['pricingRevision', 'pricingId', 'providerReference', 'evidenceReference', 'approvalId',
    'retryOfEventId', 'reversalOfEventId', 'action', 'makerEmployeeId', 'checkerEmployeeId', 'actorEmployeeId',
    'provider', 'module', 'day', 'month']) {
    const mismatch = new URLSearchParams(revisionQuery);
    mismatch.set(key, key === 'pricingRevision' ? '3' : key === 'day' ? '2026-08-01' : key === 'month' ? '2026-08' : 'absent');
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects revision continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const revision of ['777', '778']) {
    const result = await (await request(`pricingRevision=${revision}`)).json();
    assert.deepEqual(result.events, [], 'foreign and absent revisions disclose no evidence');
    assert.equal(result.nextCursor, null);
  }
  const revisionReads = reads;
  assert.equal((await request(revisionQuery, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${revisionQuery}&companyId=company-bakery`)).status, 403);
  for (const value of ['', ' ', '0', '-1', '1.5', '2.0', '2e0', '0x2', '+2', '02', '2\n', '2\u0000',
    'Infinity', 'NaN', '9007199254740992', "2 OR 1=1"]) {
    assert.equal((await request(new URLSearchParams({ pricingRevision: value }))).status, 400);
  }
  assert.equal(reads, revisionReads, 'invalid revisions and revoked permission reject before SQL');
  const maximumRevision = await (await request(`pricingRevision=${Number.MAX_SAFE_INTEGER}`)).json();
  assert.deepEqual(maximumRevision.events.map(event => event.id), ['revision-max']);
  const revisionWithoutPrice = await (await request('pricingRevision=2')).json();
  assert.deepEqual(revisionWithoutPrice.events.map(event => event.id).sort(),
    ['revision-1', 'revision-2', 'revision-3', 'revision-other-price']);
  const omittedRevision = await (await request('providerReference=revision-provider')).json();
  assert.equal(omittedRevision.pricingRevision, null);
  assert.equal(omittedRevision.events.length, 7, 'omission includes all authorized revisions and legacy null evidence');
  // Cost currency is independent of the customer transaction currency.
  const currencyInsert = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,pricing_revision,
     evidence_reference,approval_id,retry_of_event_id,reversal_of_event_id,maker_employee_id,checker_employee_id,
     amount_minor,currency,estimated_cost_minor,cost_currency,occurred_at,provider_result)
    VALUES(?,?,'estimate','paystack','finance','synthetic-user','currency-provider',?,2,'currency-evidence',
      'currency-approval','september-start','september-end','synthetic-user','synthetic-user',
      100,?,?,?,'2026-09-15T12:00:00Z','internal-result-must-not-leak')`);
  for (const [suffix, company, currency, costCurrency] of [
    ['1', 'company-printing', 'USD', 'NGN'], ['2', 'company-printing', 'USD', 'NGN'],
    ['3', 'company-printing', 'USD', 'NGN'], ['foreign', 'company-bakery', 'USD', 'NGN'],
    ['private', 'company-bakery', 'USD', 'EUR'], ['other', 'company-printing', 'NGN', 'USD'],
    ['null', 'company-printing', 'NGN', null],
  ]) currencyInsert.run(`currency-${suffix}`, company, pricingId, currency, costCurrency === null ? null : 10, costCurrency);
  const currencyQuery = new URLSearchParams({ costCurrency: 'NGN', pricingRevision: '2', pricingId,
    providerReference: 'currency-provider', evidenceReference: 'currency-evidence', approvalId: 'currency-approval',
    retryOfEventId: 'september-start', reversalOfEventId: 'september-end', action: 'estimate',
    makerEmployeeId: 'synthetic-user', checkerEmployeeId: 'synthetic-user', actorEmployeeId: 'synthetic-user',
    provider: 'paystack', module: 'finance', day: '2026-09-15', month: '2026-09', limit: '2' });
  const currencyFirst = await (await request(currencyQuery)).json();
  assert.equal(currencyFirst.costCurrency, 'NGN');
  assert.deepEqual(currencyFirst.events.map(event => event.id), ['currency-3', 'currency-2']);
  assert.ok(currencyFirst.nextCursor);
  currencyQuery.set('cursor', currencyFirst.nextCursor);
  const currencyLast = await (await request(currencyQuery)).json();
  assert.deepEqual(currencyLast.events.map(event => event.id), ['currency-1']);
  assert.equal(currencyLast.nextCursor, null);
  assert.ok(!JSON.stringify(currencyLast).includes('internal-result-must-not-leak'));
  for (const key of ['costCurrency', 'pricingRevision', 'pricingId', 'providerReference', 'evidenceReference', 'approvalId',
    'retryOfEventId', 'reversalOfEventId', 'action', 'makerEmployeeId', 'checkerEmployeeId', 'actorEmployeeId',
    'provider', 'module', 'day', 'month']) {
    const mismatch = new URLSearchParams(currencyQuery);
    mismatch.set(key, key === 'costCurrency' ? 'GBP' : key === 'pricingRevision' ? '3' :
      key === 'day' ? '2026-08-01' : key === 'month' ? '2026-08' : 'absent');
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects currency continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const costCurrency of ['EUR', 'GBP']) {
    const result = await (await request(`costCurrency=${costCurrency}`)).json();
    assert.deepEqual(result.events, [], 'foreign and absent currencies disclose no evidence');
    assert.equal(result.nextCursor, null);
  }
  const currencyReads = reads;
  assert.equal((await request(currencyQuery, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${currencyQuery}&companyId=company-bakery`)).status, 403);
  for (const value of ['', ' ', 'ngn', 'Ngn', 'NG', 'NGNN', ' NGN', 'NGN ', 'NGN\n', 'NGN\u0000', '123', 'ＮＧＮ', "NGN' OR 1=1"]) {
    assert.equal((await request(new URLSearchParams({ costCurrency: value }))).status, 400);
  }
  assert.equal(reads, currencyReads, 'invalid currencies and revoked permission reject before SQL');
  const usdCosts = await (await request('costCurrency=USD')).json();
  assert.deepEqual(usdCosts.events.map(event => event.id), ['currency-other']);
  assert.equal(usdCosts.events[0].currency, 'NGN', 'filter uses provider cost denomination, not transaction currency');
  const omittedCurrency = await (await request('providerReference=currency-provider')).json();
  assert.equal(omittedCurrency.costCurrency, null);
  assert.equal(omittedCurrency.events.length, 5, 'omission includes all authorized currencies and null evidence');
  console.log('Financial cost-currency drilldown: runtime/SQLite PASS');
  // Transaction denomination is independent of the provider's cost denomination.
  currencyInsert.run('transaction-private', 'company-bakery', pricingId, 'EUR', 10, 'NGN');
  const transactionQuery = new URLSearchParams(currencyQuery);
  transactionQuery.delete('cursor');
  transactionQuery.set('currency', 'USD');
  const transactionFirst = await (await request(transactionQuery)).json();
  assert.equal(transactionFirst.currency, 'USD');
  assert.deepEqual(transactionFirst.events.map(event => event.id), ['currency-3', 'currency-2']);
  assert.ok(transactionFirst.nextCursor);
  transactionQuery.set('cursor', transactionFirst.nextCursor);
  const transactionLast = await (await request(transactionQuery)).json();
  assert.deepEqual(transactionLast.events.map(event => event.id), ['currency-1']);
  assert.equal(transactionLast.nextCursor, null);
  assert.ok(!JSON.stringify(transactionLast).includes('internal-result-must-not-leak'));
  for (const key of ['currency', 'costCurrency', 'pricingRevision', 'pricingId', 'providerReference',
    'evidenceReference', 'approvalId', 'retryOfEventId', 'reversalOfEventId', 'action',
    'makerEmployeeId', 'checkerEmployeeId', 'actorEmployeeId', 'provider', 'module', 'day', 'month']) {
    const mismatch = new URLSearchParams(transactionQuery);
    mismatch.set(key, ['currency', 'costCurrency'].includes(key) ? 'GBP' : key === 'pricingRevision' ? '3' :
      key === 'day' ? '2026-08-01' : key === 'month' ? '2026-08' : 'absent');
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects transaction currency continuation`);
    assert.equal(result.nextCursor, null);
  }
  const transactionReads = reads;
  assert.equal((await request(transactionQuery, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${transactionQuery}&companyId=company-bakery`)).status, 403);
  for (const value of ['', ' ', 'usd', 'Usd', 'US', 'USDD', ' USD', 'USD ', 'USD\n', 'USD\u0000', '123', 'ＵＳＤ', "USD' OR 1=1"]) {
    assert.equal((await request(new URLSearchParams({ currency: value }))).status, 400);
  }
  assert.equal(reads, transactionReads, 'invalid currencies and revoked access reject before SQL');
  for (const currency of ['EUR', 'GBP']) {
    const result = await (await request(`currency=${currency}`)).json();
    assert.deepEqual(result.events, [], 'foreign-only and absent transaction currencies disclose no evidence');
    assert.equal(result.nextCursor, null);
  }
  const nairaTransactions = await (await request('currency=NGN&costCurrency=USD')).json();
  assert.deepEqual(nairaTransactions.events.map(event => event.id), ['currency-other']);
  const noCostTransactions = await (await request('currency=NGN')).json();
  assert.deepEqual(noCostTransactions.events.map(event => event.id).sort(), ['currency-null', 'currency-other']);
  const omittedTransaction = await (await request('providerReference=currency-provider')).json();
  assert.equal(omittedTransaction.currency, null);
  assert.equal(omittedTransaction.events.length, 5);
  const legacyTransaction = await (await request('day=2026-08-31')).json();
  assert.ok(legacyTransaction.events.some(event => event.currency === null), 'omission retains legacy null denomination');
  assert.deepEqual((await (await request('day=2026-08-31&currency=USD')).json()).events, []);
  // Clone synthetic currency evidence with historical role codes; never mutate audit rows.
  const roleClone = db.prepare(`INSERT INTO financial_provider_cost_events
    (id,company_id,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,pricing_revision,
     evidence_reference,approval_id,retry_of_event_id,reversal_of_event_id,maker_employee_id,checker_employee_id,
     amount_minor,currency,estimated_cost_minor,cost_currency,occurred_at,provider_result,actor_role_code)
    SELECT ?,?,action,provider,requesting_module,actor_employee_id,provider_reference,pricing_id,pricing_revision,
     evidence_reference,approval_id,retry_of_event_id,reversal_of_event_id,maker_employee_id,checker_employee_id,
     amount_minor,currency,estimated_cost_minor,cost_currency,occurred_at,provider_result,?
    FROM financial_provider_cost_events WHERE id='currency-1'`);
  for (const [suffix, company, role] of [
    ['1', 'company-printing', 'FINANCE_MANAGER'], ['2', 'company-printing', 'FINANCE_MANAGER'],
    ['3', 'company-printing', 'FINANCE_MANAGER'], ['foreign', 'company-bakery', 'FINANCE_MANAGER'],
    ['private', 'company-bakery', 'PRIVATE_ROLE'], ['case', 'company-printing', 'finance_manager'],
    ['prefix', 'company-printing', 'FINANCE_MANAGER_2'], ['max', 'company-printing', 'x'.repeat(160)],
    ['literal', 'company-printing', "Role / A+%_&'"],
  ]) roleClone.run(`actor-role-${suffix}`, company, role);
  const actorRoleQuery = new URLSearchParams(transactionQuery);
  actorRoleQuery.delete('cursor');
  actorRoleQuery.set('actorRoleCode', 'FINANCE_MANAGER');
  const actorRoleFirst = await (await request(actorRoleQuery)).json();
  assert.equal(actorRoleFirst.actorRoleCode, 'FINANCE_MANAGER');
  assert.deepEqual(actorRoleFirst.events.map(event => event.id), ['actor-role-3', 'actor-role-2']);
  assert.ok(actorRoleFirst.nextCursor);
  actorRoleQuery.set('cursor', actorRoleFirst.nextCursor);
  const actorRoleLast = await (await request(actorRoleQuery)).json();
  assert.deepEqual(actorRoleLast.events.map(event => event.id), ['actor-role-1']);
  assert.equal(actorRoleLast.nextCursor, null);
  assert.ok(actorRoleLast.events.every(event => event.actorRoleCode === 'FINANCE_MANAGER'));
  assert.ok(!JSON.stringify(actorRoleLast).includes('internal-result-must-not-leak'));
  for (const key of [...actorRoleQuery.keys()].filter(key => !['cursor', 'limit'].includes(key))) {
    const mismatch = new URLSearchParams(actorRoleQuery);
    mismatch.set(key, ['currency', 'costCurrency'].includes(key) ? 'GBP' : key === 'pricingRevision' ? '3' :
      key === 'day' ? '2026-08-01' : key === 'month' ? '2026-08' : 'absent');
    const result = await (await request(mismatch)).json();
    assert.deepEqual(result.events, [], `${key} intersects actor-role continuation`);
    assert.equal(result.nextCursor, null);
  }
  for (const role of ['PRIVATE_ROLE', 'ABSENT_ROLE', "' OR 1=1 --"]) {
    const result = await (await request(new URLSearchParams({ actorRoleCode: role }))).json();
    assert.deepEqual(result.events, []);
    assert.equal(result.nextCursor, null);
  }
  const actorRoleReads = reads;
  assert.equal((await request(actorRoleQuery, { ...context, allowed: [] })).status, 403);
  assert.equal((await request(`${actorRoleQuery}&companyId=company-bakery`)).status, 403);
  for (const value of ['', ' ', 'x'.repeat(161), 'role\n', 'role\u0000', 'role\u007f']) {
    assert.equal((await request(new URLSearchParams({ actorRoleCode: value }))).status, 400);
  }
  assert.equal(reads, actorRoleReads, 'invalid roles and revoked access reject before SQL');
  for (const [value, suffix] of [['finance_manager', 'case'], ['FINANCE_MANAGER_2', 'prefix'],
    ['x'.repeat(160), 'max'], ["Role / A+%_&'", 'literal']]) {
    const result = await (await request(new URLSearchParams({ actorRoleCode: value }))).json();
    assert.deepEqual(result.events.map(event => event.id), [`actor-role-${suffix}`]);
  }
  const omittedRole = await (await request('providerReference=currency-provider')).json();
  assert.equal(omittedRole.actorRoleCode, null);
  assert.equal(omittedRole.events.length, 12);
  assert.ok(omittedRole.events.some(event => event.actorRoleCode === null));
  console.log('Financial actor-role drilldown: runtime/SQLite PASS');
  console.log('Financial transaction-currency drilldown: runtime/SQLite PASS');
  console.log('Financial pricing-revision drilldown: runtime/SQLite PASS');
  console.log('Financial maker/checker drilldown: runtime/SQLite PASS');
  console.log('Financial approval-record drilldown: runtime/SQLite PASS');
  console.log('Financial reversal-event drilldown: runtime/SQLite PASS');
  console.log('Financial retry-event drilldown: runtime/SQLite PASS');
  console.log('Financial evidence-reference drilldown: runtime/SQLite PASS');
  console.log('Financial pricing-record drilldown: runtime/SQLite PASS');
  console.log('Financial provider-action drilldown: runtime/SQLite PASS');
  console.log('Financial provider-reference drilldown: runtime/SQLite PASS');
  console.log('Financial provider-cost keyset pagination: runtime/SQLite PASS');
  console.log('Financial provider-cost monthly drilldown: runtime/SQLite PASS');
} finally {
  db.close();
}
