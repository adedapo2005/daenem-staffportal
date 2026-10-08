import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/logistics-v2.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const routeCalls = [];
const module = { exports: {} };
const mockRequire = (specifier) => {
  if (specifier === './auth') return {
    hasPermission: (context, code, minimum, companyId) => {
      const level = context.companyPermissions[companyId]?.[code] || 'none';
      const ranks = { none: 0, view: 1, create: 2, edit: 3, approve: 4, manage: 5 };
      return ranks[level] >= ranks[minimum];
    },
  };
  if (specifier === './logistics') return {
    routeLogistics: async (request) => {
      routeCalls.push(request.url);
      return new Response(JSON.stringify({ ok: true }), { status: 201 });
    },
  };
  throw new Error(`Unexpected import: ${specifier}`);
};
new Function('require', 'module', 'exports', compiled)(mockRequire, module, module.exports);
const { routeLogisticsV2 } = module.exports;

const companyId = 'company-logistics';
const financial = { quotedKobo: 125000, invoicedKobo: 110000, amountPaidKobo: 40000 };
const context = ({ permissions = {}, globalPermissions = {}, companies = [companyId], roles = [] } = {}) => ({
  sessionId: 'session-test', employee: { id: 'employee-test', displayName: 'Test Employee', status: 'active' },
  companies: companies.map((id) => ({ id, code: 'LOGISTICS', name: 'Logistics', primary: true })),
  roles, permissions: globalPermissions, companyPermissions: { [companyId]: permissions },
});

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async all() {
    this.db.queries.push({ sql: this.sql, values: this.values });
    const row = { id: 'shipment-1', shipmentNo: 'LOG-001', status: 'in_transit' };
    if (this.sql.includes('AS quotedKobo')) Object.assign(row, financial);
    return { results: [row] };
  }
  async first() {
    this.db.queries.push({ sql: this.sql, values: this.values });
    return this.db.assigned ? { ok: 1 } : null;
  }
}
const env = (assigned = true) => {
  const db = { queries: [], assigned, prepare(sql) { return new Statement(this, sql); } };
  return { DB: db };
};
const getShipments = async (ctx, db = env()) => {
  const response = await routeLogisticsV2(new Request('https://staffportal.test/api/logistics/shipments'), db, ctx);
  return { response, body: await response.json(), db };
};
const cases = [];
const check = async (name, fn) => { await fn(); cases.push(name); console.log(`PASS: ${name}`); };

await check('shipment-only non-driver receives rows without financial projection', async () => {
  const { response, body, db } = await getShipments(context({ permissions: { 'logistics.shipments': 'view' } }));
  assert.equal(response.status, 200);
  assert.equal('quotedKobo' in body.shipments[0], false);
  assert.equal('invoicedKobo' in body.shipments[0], false);
  assert.equal('amountPaidKobo' in body.shipments[0], false);
  assert.equal(db.DB.queries[0].sql.includes('s.quoted_kobo AS quotedKobo'), false);
});

await check('assigned driver shipment view remains assignment scoped and omits finance', async () => {
  const ctx = context({ permissions: { 'logistics.shipments': 'view' }, roles: [{ code: 'driver' }] });
  const { body, db } = await getShipments(ctx);
  assert.equal('quotedKobo' in body.shipments[0], false);
  assert.match(db.DB.queries[0].sql, /EXISTS\([\s\S]*t\.driver_employee_id=\?/);
  assert.deepEqual(db.DB.queries[0].values, [companyId, 1, 'employee-test']);
});

await check('dispatch view in the target company receives financial projection', async () => {
  const { body, db } = await getShipments(context({ permissions: {
    'logistics.shipments': 'view', 'logistics.dispatch': 'view',
  } }));
  assert.deepEqual(body.shipments[0], { id: 'shipment-1', shipmentNo: 'LOG-001', status: 'in_transit', ...financial });
  assert.equal(db.DB.queries[0].sql.includes('s.quoted_kobo AS quotedKobo'), true);
  assert.deepEqual(db.DB.queries[0].values, [companyId, 0, 'employee-test']);
});

await check('global permission cannot override explicit target-company dispatch denial', async () => {
  const { body, db } = await getShipments(context({
    permissions: { 'logistics.shipments': 'view', 'logistics.dispatch': 'none' },
    globalPermissions: { 'logistics.dispatch': 'manage' },
  }));
  assert.equal('quotedKobo' in body.shipments[0], false);
  assert.equal(db.DB.queries[0].sql.includes('s.quoted_kobo AS quotedKobo'), false);
});

await check('cross-company and null-scope readers are denied before shipment query', async () => {
  for (const ctx of [
    context({ permissions: { 'logistics.shipments': 'view' }, companies: ['company-other'] }),
    context({ permissions: { 'logistics.shipments': 'view' }, companies: [] }),
    context({ companies: [companyId] }),
  ]) {
    const { response, body, db } = await getShipments(ctx);
    assert.equal(response.status, 403);
    assert.equal(JSON.stringify(body).includes('shipment-1'), false);
    assert.equal(db.DB.queries.length, 0);
  }
});

await check('POD route keeps neutral assignment denial and delegates an assigned company trip', async () => {
  routeCalls.length = 0;
  const ctx = context({ permissions: { 'logistics.pod': 'create' }, roles: [{ code: 'driver' }] });
  const request = () => new Request('https://staffportal.test/api/logistics/pod', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tripId: 'trip-1', shipmentId: 'shipment-1' }),
  });
  const unassigned = env(false);
  const denied = await routeLogisticsV2(request(), unassigned, ctx);
  assert.equal(denied.status, 404);
  assert.deepEqual(await denied.json(), { error: 'Shipment not found.' });
  assert.equal(routeCalls.length, 0);
  assert.deepEqual(unassigned.DB.queries[0].values, ['trip-1', 'shipment-1', companyId, 0, 'employee-test']);

  const assigned = env(true);
  const accepted = await routeLogisticsV2(request(), assigned, ctx);
  assert.equal(accepted.status, 201);
  assert.equal(routeCalls.length, 1);
  assert.deepEqual(assigned.DB.queries[0].values, ['trip-1', 'shipment-1', companyId, 0, 'employee-test']);
});

console.log(`Logistics financial projection runtime: ${cases.length}/${cases.length} PASS`);
