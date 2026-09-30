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
assert.match(endpoint, /\.bind\(\.\.\.scopedCompanyIds, provider, provider, requestingModule, requestingModule, day, day, month, month, actorEmployeeId, actorEmployeeId, providerReference, providerReference, action, action, pricingId, pricingId, evidenceReference, evidenceReference, retryOfEventId, retryOfEventId, beforeTime, beforeTime, beforeTime, beforeId, limit \+ 1\)/);
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
