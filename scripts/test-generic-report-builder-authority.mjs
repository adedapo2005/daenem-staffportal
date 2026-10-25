import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('worker/generic-report-builder.ts', 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.deepEqual(transpiled.diagnostics || [], [], 'TypeScript transpile diagnostics');
const { routeGenericReportBuilder } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
);
let assertions = 0;
let fetchCalls = 0;
const A = 'company-alpha', B = 'company-beta', SITE = 'site-alpha';
const session = () => ({
  sessionId: 'session-valid', employee: { id: 'employee-valid', displayName: 'Test Owner', status: 'active' },
  companies: [{ id: A, code: 'A', name: 'Alpha', primary: true }],
  roles: [], permissions: {}, companyPermissions: {},
});
const flags = () => ({
  sessionActive: true, companyAllowed: true, siteAllowed: true,
  datasetAllowed: true, recordAllowed: true, restrictedAllowed: false,
});
const fields = [
  { id: 'displayName', label: 'Name', sensitivity: 'standard', filterOperators: ['eq', 'startsWith'], sortable: true, aggregatable: false, exportable: false },
  { id: 'department', label: 'Department', sensitivity: 'standard', filterOperators: ['eq'], sortable: true, aggregatable: false, exportable: false },
  { id: 'secretField', label: 'Protected', sensitivity: 'restricted', filterOperators: [], sortable: false, aggregatable: false, exportable: false },
];
function harness() {
  const state = flags();
  const seen = [];
  const authority = {
    activeSession: async () => state.sessionActive,
    company: async (_session, company) => state.companyAllowed && company === A,
    site: async (_session, company, site) => state.siteAllowed && company === A && site === SITE,
    dataset: async (_session, company, dataset) => state.datasetAllowed && company === A && dataset.id === 'directory_active',
    field: async (_session, _company, _dataset, field, _op) =>
      field.id !== 'secretField' || state.restrictedAllowed,
    record: async (_session, _company, _dataset, row) =>
      state.recordAllowed && row.recordId !== 'record-denied',
  };
  const dataset = {
    id: 'directory_active', label: 'Company directory', module: 'directory', siteScoped: true,
    fields, maxRows: 50, timeoutMs: 2500, auditClass: 'restricted-directory',
    fetchPreview: async (selector) => {
      fetchCalls++;
      seen.push(selector);
      return [{ recordId: 'record-visible', companyId: A, siteId: SITE,
        values: { displayName: 'Synthetic Employee', department: 'QA', secretField: 'not-visible' } }];
    },
  };
  return { deps: { authority, datasets: [dataset] }, state, dataset, seen, session: session() };
}
const payload = () => ({ companyId: A, siteId: SITE, datasetId: 'directory_active',
  fields: ['displayName'], filters: [], limit: 10 });
async function call(h, data = payload(), customSession = h.session, extraHeaders = {}) {
  const req = new Request('https://portal.example.test/api/report-builder/preview', {
    method: 'POST', headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(data),
  });
  const r = await routeGenericReportBuilder(req, customSession, h.deps);
  return { status: r.status, body: await r.json(), headers: r.headers };
}
async function metadata(h, companyId = A, siteId = SITE) {
  const query = new URLSearchParams({ companyId });
  if (siteId !== null) query.set('siteId', siteId);
  const req = new Request(`https://portal.example.test/api/report-builder/datasets?${query}`);
  const res = await routeGenericReportBuilder(req, h.session, h.deps);
  return { status: res.status, body: await res.json() };
}
async function check(label, fn) {
  await fn();
  assertions++;
  console.log('PASS ' + label);
}
function noFetch(before) { assert.equal(fetchCalls, before, 'deny must not access source data'); }
const h = harness();
await check('authorized scoped preview returns only requested columns', async () => {
  const r = await call(h);
  assert.equal(r.status, 200); assert.equal(r.body.previewOnly, true);
  assert.deepEqual(r.body.rows, [{ displayName: 'Synthetic Employee' }]);
  assert.deepEqual(r.body.columns, ['displayName']);
  assert.equal(r.body.total, undefined);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(h.seen[0].actorId, h.session.employee.id);
});
await check('registered metadata only exposes currently allowed fields', async () => {
  const r = await metadata(h); assert.equal(r.status, 200);
  assert.deepEqual(r.body.datasets[0].fields.map(f => f.id), ['displayName', 'department']);
  assert.equal(JSON.stringify(r.body).includes('secretField'), false);
  assert.equal(JSON.stringify(r.body).includes('rowCount'), false);
});
await check('unknown dataset denied without existence disclosure', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), datasetId: 'unknown' });
  assert.equal(r.status, 403); noFetch(before);
});
await check('hidden requested column denied before fetch', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), fields: ['secretField'] });
  assert.equal(r.status, 403); noFetch(before);
});
await check('hidden filter column denied before fetch', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), filters: [{ field: 'secretField', operator: 'eq', value: 'x' }] });
  assert.equal(r.status, 403); noFetch(before);
});
await check('disallowed filter operator rejected before fetch', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), filters: [{ field: 'department', operator: 'startsWith', value: 'Q' }] });
  assert.equal(r.status, 403); noFetch(before);
});
await check('invalid filter operator rejected', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), filters: [{ field: 'department', operator: 'sql', value: 'x' }] });
  assert.equal(r.status, 400); noFetch(before);
});
await check('overbroad limit is rejected', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), limit: 9999 });
  assert.equal(r.status, 400); noFetch(before);
});
await check('aggregate requests are not silently executed', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), aggregate: { op: 'count', field: 'secretField' } });
  assert.equal(r.status, 400); noFetch(before);
});
await check('small-population grouping not exposed', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), groupBy: ['department'] });
  assert.equal(r.status, 400); noFetch(before);
});
await check('SQL input never reaches adapter', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), sql: 'SELECT * FROM employees' });
  assert.equal(r.status, 400); noFetch(before);
});
await check('sort by restricted field denied', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), sort: { field: 'secretField', direction: 'asc' } });
  assert.equal(r.status, 403); noFetch(before);
});
await check('sort by allowed field safely validated', async () => {
  const r = await call(h, { ...payload(), sort: { field: 'department', direction: 'desc' } });
  assert.equal(r.status, 200); assert.deepEqual(h.seen.at(-1).sort, { field: 'department', direction: 'desc' });
});
await check('foreign company excluded before adapter call', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), companyId: B });
  assert.equal(r.status, 403); noFetch(before);
});
await check('effective company revocation excludes source', async () => {
  h.state.companyAllowed = false; const before = fetchCalls; const r = await call(h);
  assert.equal(r.status, 403); noFetch(before); h.state.companyAllowed = true;
});
await check('wrong site excluded before adapter call', async () => {
  const before = fetchCalls; const r = await call(h, { ...payload(), siteId: 'site-other' });
  assert.equal(r.status, 403); noFetch(before);
});
await check('site revocation excludes source', async () => {
  h.state.siteAllowed = false; const before = fetchCalls; const r = await call(h);
  assert.equal(r.status, 403); noFetch(before); h.state.siteAllowed = true;
});
await check('session revocation excludes source', async () => {
  h.state.sessionActive = false; const before = fetchCalls; const r = await call(h);
  assert.equal(r.status, 403); noFetch(before); h.state.sessionActive = true;
});
await check('dataset revocation excludes source', async () => {
  h.state.datasetAllowed = false; const before = fetchCalls; const r = await call(h);
  assert.equal(r.status, 403); noFetch(before); h.state.datasetAllowed = true;
});
await check('forged owner header cannot confer access', async () => {
  h.state.datasetAllowed = false; const before = fetchCalls;
  const r = await call(h, payload(), h.session, { 'x-role': 'owner', 'x-company': A });
  assert.equal(r.status, 403); noFetch(before); h.state.datasetAllowed = true;
});
await check('missing authoritative policy fails closed without fetch', async () => {
  const before = fetchCalls; const other = harness(); other.deps.authority = undefined;
  const r = await call(other); assert.equal(r.status, 403); noFetch(before);
});
await check('unauthorized row removed without total count', async () => {
  h.state.recordAllowed = false; const r = await call(h);
  assert.equal(r.status, 200); assert.deepEqual(r.body.rows, []);
  assert.equal(r.body.total, undefined); h.state.recordAllowed = true;
});
await check('cross-company adapter response cannot leak', async () => {
  const original = h.dataset.fetchPreview;
  h.dataset.fetchPreview = async () => [{ recordId: 'bad-record', companyId: B, siteId: SITE, values: { displayName: 'wrong' } }];
  const r = await call(h); assert.equal(r.status, 503); assert.equal(JSON.stringify(r.body).includes('wrong'), false);
  h.dataset.fetchPreview = original;
});
await check('cross-site adapter response cannot leak', async () => {
  const original = h.dataset.fetchPreview;
  h.dataset.fetchPreview = async () => [{ recordId: 'bad-record', companyId: A, siteId: 'site-other', values: { displayName: 'wrong' } }];
  const r = await call(h); assert.equal(r.status, 503);
  h.dataset.fetchPreview = original;
});
await check('oversized adapter result fails closed rather than truncates', async () => {
  const original = h.dataset.fetchPreview;
  h.dataset.fetchPreview = async () => Array.from({ length: 11 }, (_x, i) => ({
    recordId: 'record-' + i, companyId: A, siteId: SITE, values: { displayName: 'X' },
  }));
  const r = await call(h); assert.equal(r.status, 503); h.dataset.fetchPreview = original;
});
await check('source exception returns neutral error', async () => {
  const original = h.dataset.fetchPreview;
  h.dataset.fetchPreview = async () => { throw new Error('SECRET_COLUMN=bank_account'); };
  const r = await call(h); assert.equal(r.status, 503);
  assert.equal(JSON.stringify(r.body).includes('SECRET_COLUMN'), false);
  h.dataset.fetchPreview = original;
});
await check('no arbitrary export or scheduling endpoint available', async () => {
  const req = new Request('https://portal.example.test/api/report-builder/export', { method: 'POST' });
  const r = await routeGenericReportBuilder(req, h.session, h.deps); assert.equal(r.status, 404);
});
await check('site-scoped metadata without site hides dataset', async () => {
  const r = await metadata(h, A, null); assert.equal(r.status, 200); assert.deepEqual(r.body.datasets, []);
});
await check('current denied dataset metadata is empty', async () => {
  h.state.datasetAllowed = false; const r = await metadata(h);
  assert.equal(r.status, 200); assert.deepEqual(r.body.datasets, []);
});
console.log('GENERIC_REPORT_BUILDER_AUTHORITY=' + assertions + '/' + assertions + ' PASS');
