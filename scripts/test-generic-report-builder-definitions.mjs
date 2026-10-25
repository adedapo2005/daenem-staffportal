import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('worker/generic-report-builder-definitions.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics || [], [], 'TypeScript compiler diagnostics');
const { routePrivateReportDefinitions } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64')
);
const companyId = 'company-alpha', siteId = 'site-alpha';
const context = {
  sessionId: 'session-valid',
  employee: { id: 'employee-owner', status: 'active' },
  companies: [{ id: companyId }], roles: [], permissions: {}, companyPermissions: {},
};
const fields = [
  { id: 'name', label: 'Name', sensitivity: 'standard', filterOperators: ['eq'],
    sortable: true, aggregatable: false, exportable: false },
  { id: 'department', label: 'Department', sensitivity: 'standard', filterOperators: ['eq'],
    sortable: true, aggregatable: false, exportable: false },
  { id: 'payrollSecret', label: 'Hidden', sensitivity: 'restricted', filterOperators: ['eq'],
    sortable: false, aggregatable: false, exportable: false },
];
function harness() {
  const state = { active: true, company: true, site: true, dataset: true, field: true,
    save: true, get: true };
  let createCalls = 0, readCalls = 0, auditEvents = 0, sourceFetches = 0;
  const records = new Map();
  const dataset = {
    id: 'directory_active', label: 'Directory', module: 'directory', siteScoped: true,
    fields, maxRows: 20, timeoutMs: 2500, auditClass: 'directory',
    fetchPreview: async () => { sourceFetches++; throw Error('never fetch source for a saved definition'); },
  };
  const authority = {
    activeSession: async () => state.active,
    company: async () => state.company,
    site: async () => state.site,
    dataset: async () => state.dataset,
    field: async (_ctx, _company, _dataset, field) => state.field && field.id !== 'payrollSecret',
    record: async () => true,
  };
  const store = {
    createPrivate: async (_ctx, definition) => {
      createCalls++;
      if (!state.save) return false;
      records.set(definition.id, structuredClone(definition));
      auditEvents++;
      return true;
    },
    // Deliberately permissive fake store: the route must ALSO inspect row scope.
    getPrivate: async ({ id }) => { readCalls++; return state.get ? records.get(id) ?? null : null; },
  };
  return {
    deps: { authority, datasets: [dataset], store }, state, records,
    counts: () => ({ createCalls, readCalls, auditEvents, sourceFetches }),
  };
}
const payload = () => ({
  companyId, siteId, datasetId: 'directory_active', title: 'Private Attendance Summary',
  fields: ['name', 'department'], filters: [{ field: 'department', operator: 'eq', value: 'QA' }],
  sort: { field: 'name', direction: 'asc' }, limit: 10,
});
async function create(h, value = payload(), ctx = context, headers = {}) {
  const request = new Request('https://staffportal.test/api/report-builder/definitions', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(value),
  });
  const result = await routePrivateReportDefinitions(request, ctx, h.deps);
  return { status: result.status, text: await result.text(), headers: result.headers };
}
async function read(h, id, company = companyId, site = siteId, ctx = context) {
  const url = new URL('https://staffportal.test/api/report-builder/definitions/' + id);
  url.searchParams.set('companyId', company);
  if (site !== null) url.searchParams.set('siteId', site);
  const result = await routePrivateReportDefinitions(new Request(url), ctx, h.deps);
  return { status: result.status, text: await result.text(), headers: result.headers };
}
let count = 0;
async function check(label, fn) {
  await fn();
  count++;
  console.log('PASS ' + label);
}
const h = harness();
let createdId = '';
await check('create is private, server-ID, version 1 and atomically audited by store', async () => {
  const result = await create(h); assert.equal(result.status, 201);
  const body = JSON.parse(result.text); createdId = body.id;
  assert.match(createdId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual({ version: body.version, private: body.private }, { version: 1, private: true });
  assert.equal(h.counts().createCalls, 1); assert.equal(h.counts().auditEvents, 1);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(h.records.get(createdId).ownerId, context.employee.id);
});
await check('owner reads saved private definition only in authorized scope', async () => {
  const r = await read(h, createdId); assert.equal(r.status, 200);
  const definition = JSON.parse(r.text).definition;
  assert.equal(definition.title, payload().title);
  assert.deepEqual(definition.fields, ['name', 'department']);
  assert.equal(definition.private, true);
  assert.equal(definition.ownerId, undefined);
});
await check('other owner gets neutral denial even with deliberately lax store', async () => {
  const other = { ...context, employee: { id: 'other-person' } };
  const r = await read(h, createdId, companyId, siteId, other);
  assert.equal(r.status, 403); assert.equal(r.text.includes('Private Attendance'), false);
});
await check('foreign company denied before repository lookup', async () => {
  const before = h.counts().readCalls; const r = await read(h, createdId, 'company-beta');
  assert.equal(r.status, 403); assert.equal(h.counts().readCalls, before);
});
await check('foreign site denied before repository lookup', async () => {
  h.state.site = false; const before = h.counts().readCalls;
  const r = await read(h, createdId); assert.equal(r.status, 403);
  assert.equal(h.counts().readCalls, before); h.state.site = true;
});
await check('revoked session denies reading all titles', async () => {
  h.state.active = false; const before = h.counts().readCalls;
  const r = await read(h, createdId); assert.equal(r.status, 403);
  assert.equal(h.counts().readCalls, before); h.state.active = true;
});
await check('revoked field denies existing definition without field-name leak', async () => {
  h.state.field = false; const r = await read(h, createdId);
  assert.equal(r.status, 403); assert.equal(r.text.includes('department'), false);
  h.state.field = true;
});
await check('unknown report ID has the same neutral response', async () => {
  const r = await read(h, 'not-found'); assert.equal(r.status, 403);
  assert.equal(r.text, (await read(h, createdId, 'company-beta')).text);
});
await check('protected source field denied before persistence', async () => {
  const before = h.counts().createCalls;
  const r = await create(h, { ...payload(), fields: ['payrollSecret'] });
  assert.equal(r.status, 403); assert.equal(h.counts().createCalls, before);
});
await check('unknown dataset denied before persistence', async () => {
  const before = h.counts().createCalls;
  const r = await create(h, { ...payload(), datasetId: 'unregistered' });
  assert.equal(r.status, 403); assert.equal(h.counts().createCalls, before);
});
await check('unknown filter field denied', async () => {
  const r = await create(h, { ...payload(), filters: [{ field: 'hidden', operator: 'eq', value: 'x' }] });
  assert.equal(r.status, 403);
});
await check('arbitrary SQL and group aggregate are rejected', async () => {
  assert.equal((await create(h, { ...payload(), sql: 'SELECT 1' })).status, 400);
  assert.equal((await create(h, { ...payload(), groupBy: ['department'] })).status, 400);
});
await check('save never permits requested owner, version or sharing', async () => {
  assert.equal((await create(h, { ...payload(), ownerId: 'other-person' })).status, 400);
  assert.equal((await create(h, { ...payload(), private: false })).status, 400);
  assert.equal((await create(h, { ...payload(), version: 99 })).status, 400);
});
await check('oversized limit rejected without saving', async () => {
  assert.equal((await create(h, { ...payload(), limit: 100000 })).status, 400);
  assert.equal((await create(h, { ...payload(), limit: 30 })).status, 403);
});
await check('missing site, revoked dataset, and session are denied', async () => {
  assert.equal((await create(h, { ...payload(), siteId: null })).status, 403);
  h.state.dataset = false; assert.equal((await create(h)).status, 403);
  h.state.dataset = true; h.state.active = false;
  assert.equal((await create(h)).status, 403); h.state.active = true;
});
await check('failed atomic store does not signal successful creation', async () => {
  h.state.save = false; const r = await create(h); assert.equal(r.status, 503);
  assert.equal(r.text.includes(payload().title), false); h.state.save = true;
});
await check('forged cross-company source row cannot be retrieved', async () => {
  const fake = { ...h.records.get(createdId), companyId: 'company-beta' };
  h.records.set(createdId, fake);
  const r = await read(h, createdId); assert.equal(r.status, 403);
  assert.equal(r.text.includes(payload().title), false);
  h.records.set(createdId, { ...fake, companyId });
});
await check('store absent fails closed', async () => {
  const old = h.deps.store; h.deps.store = undefined;
  assert.equal((await create(h)).status, 403); h.deps.store = old;
});
await check('unapproved routes cannot expose or share definitions', async () => {
  const r = await routePrivateReportDefinitions(
    new Request('https://staffportal.test/api/report-builder/definitions', { method: 'GET' }),
    context, h.deps);
  assert.equal(r.status, 404);
});
await check('save boundary does not fetch source data or count records', async () => {
  assert.equal(h.counts().sourceFetches, 0);
  assert.equal(JSON.stringify(h.records.get(createdId)).includes('rowCount'), false);
});
await check('revocation during field authorization denies private report disclosure', async () => {
  const previous = h.deps.authority.field;
  const oldSession = h.deps.authority.activeSession;
  let calls = 0;
  let live = true;
  h.deps.authority.field = async (...args) => {
    calls++;
    if (calls === 2) live = false;
    return previous(...args);
  };
  h.deps.authority.activeSession = async () => live;
  try {
    const result = await read(h, createdId);
    assert.equal(result.status, 403);
    assert.equal(result.text.includes(payload().title), false);
  } finally {
    h.deps.authority.field = previous;
    h.deps.authority.activeSession = oldSession;
  }
});
console.log('REPORT_PRIVATE_DEFINITIONS=' + count + '/' + count + ' PASS');
