import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/autos-v2.ts', import.meta.url), 'utf8');
const activeSaleMigration = fs.readFileSync(new URL('../migrations/0097_autos_active_sale_per_vehicle.sql', import.meta.url), 'utf8');
const withoutAuthImport = source.replace("import { hasPermission, type AuthEnv, type SessionContext } from './auth';", `const hasPermission = (context, resource, action) => Boolean(context.permissions?.[resource]?.includes(action));`);
const { outputText } = ts.transpileModule(withoutAuthImport, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeAutosV2 } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture(status = 'ready') {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE auto_vehicles (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, status TEXT NOT NULL,
      minimum_price_kobo INTEGER, landed_cost_kobo INTEGER NOT NULL DEFAULT 0,
      sale_price_kobo INTEGER, gross_profit_kobo INTEGER, customer_id TEXT,
      sold_by TEXT, sold_at TEXT, updated_at TEXT
    );
    CREATE TABLE auto_sales (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, vehicle_id TEXT NOT NULL,
      lead_id TEXT, customer_id TEXT, sale_no TEXT NOT NULL, sale_price_kobo INTEGER NOT NULL,
      deposit_kobo INTEGER NOT NULL, amount_paid_kobo INTEGER NOT NULL, balance_kobo INTEGER NOT NULL,
      payment_status TEXT NOT NULL, sale_status TEXT NOT NULL, payment_terms TEXT,
      sold_by TEXT NOT NULL, approved_by TEXT, approved_at TEXT, sale_date TEXT NOT NULL,
      UNIQUE(company_id, sale_no)
    );
    CREATE TABLE auto_leads(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, lead_no TEXT, status TEXT, updated_at TEXT);
    CREATE TABLE customers(id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
  `);
  sqlite.exec(activeSaleMigration);
  sqlite.prepare(`INSERT INTO auto_vehicles(id,company_id,status,minimum_price_kobo,landed_cost_kobo) VALUES('vehicle-1','company-autos',?,NULL,90000),('vehicle-2','company-autos',?,NULL,110000)`).run(status, status);
  const statement = (sql, values = []) => ({ sql, values,
    bind(...args) { return statement(sql, args); },
    async first() { return sqlite.prepare(sql).get(...values); },
    async all() { const rows = sqlite.prepare(sql).all(...values); return { results: rows }; },
    async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
  });
  const DB = {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const item of statements) {
          const result = sqlite.prepare(item.sql).run(...item.values);
          results.push({ meta: { changes: Number(result.changes) } });
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, env: { DB } };
}

const context = {
  employee: { id: 'employee-a', displayName: 'Sales User' },
  companies: [{ id: 'company-autos' }],
  permissions: { 'sales.access': ['edit'], 'autos.access': ['edit'] },
};
const createSale = async (env, payload, actor = context) => routeAutosV2(new Request('https://staffportal.invalid/api/autos/sales', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
}), env, actor);
const updateVehicleStatus = async (env, vehicleId, status) => routeAutosV2(new Request('https://staffportal.invalid/api/autos/vehicles/status', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vehicleId, status }),
}), env, context);

const paidAssertion = fixture();
const accepted = await createSale(paidAssertion.env, { vehicleId: 'vehicle-1', salePriceNaira: 1200, depositNaira: 1200, amountPaidNaira: 1200 });
assert.equal(accepted.status, 201);
const acceptedBody = await accepted.json();
assert.equal(acceptedBody.sale.paymentStatus, 'unpaid');
assert.equal(acceptedBody.sale.saleStatus, 'reserved');
assert.equal(acceptedBody.sale.amountPaidKobo, 0);
assert.equal(acceptedBody.sale.balanceKobo, 120000);
const stored = paidAssertion.sqlite.prepare(`SELECT deposit_kobo,amount_paid_kobo,balance_kobo,payment_status,sale_status FROM auto_sales`).get();
assert.deepEqual({ ...stored }, { deposit_kobo: 0, amount_paid_kobo: 0, balance_kobo: 120000, payment_status: 'unpaid', sale_status: 'reserved' });

const reserved = await createSale(paidAssertion.env, { vehicleId: 'vehicle-1', salePriceNaira: 1500 });
assert.equal(reserved.status, 409, 'an already-reserved vehicle cannot be resold');
assert.equal(paidAssertion.sqlite.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 1);

const competing = fixture();
const race = await Promise.all([
  createSale(competing.env, { vehicleId: 'vehicle-1', salePriceNaira: 1200 }),
  createSale(competing.env, { vehicleId: 'vehicle-1', salePriceNaira: 1250 }),
]);
assert.deepEqual(race.map((response) => response.status).sort(), [201, 409]);
assert.equal(competing.sqlite.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 1);
assert.equal(competing.sqlite.prepare(`SELECT status FROM auto_vehicles WHERE id='vehicle-1'`).get().status, 'reserved');

const separateVehicles = fixture();
const independentSales = await Promise.all([
  createSale(separateVehicles.env, { vehicleId: 'vehicle-1', salePriceNaira: 1200 }),
  createSale(separateVehicles.env, { vehicleId: 'vehicle-2', salePriceNaira: 1500 }),
]);
assert.deepEqual(independentSales.map((response) => response.status), [201, 201],
  'independent vehicle sales do not compete for a count-derived sale number');
const uniqueSaleNumbers = separateVehicles.sqlite.prepare('SELECT COUNT(DISTINCT sale_no) AS count FROM auto_sales').get().count;
assert.equal(uniqueSaleNumbers, 2, 'each concurrent sale receives a distinct immutable reference');

const preReserved = fixture('reserved');
const denied = await createSale(preReserved.env, { vehicleId: 'vehicle-1', salePriceNaira: 1200 });
assert.equal(denied.status, 409);
assert.equal(preReserved.sqlite.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 0);

const heldVehicle = fixture('hold');
assert.equal((await createSale(heldVehicle.env, { vehicleId: 'vehicle-1', salePriceNaira: 1200 })).status, 409,
  'non-ready inventory cannot be reserved for sale');
assert.equal(heldVehicle.sqlite.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 0);

for (const status of ['acquired', 'in_transit', 'clearing', 'inspection', 'repair', 'detailing', 'sold', 'delivered', 'retired']) {
  const unavailable = fixture(status);
  assert.equal((await createSale(unavailable.env, { vehicleId: 'vehicle-1', salePriceNaira: 1200 })).status, 409,
    `${status} inventory cannot be reserved for sale`);
  assert.equal(unavailable.sqlite.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 0);
}

const wrongCompany = fixture();
assert.equal((await createSale(wrongCompany.env, { vehicleId: 'vehicle-1', salePriceNaira: 1200 }, {
  ...context, companies: [{ id: 'another-company' }],
})).status, 403, 'another company cannot reserve Autos stock');
assert.equal(wrongCompany.sqlite.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 0);

assert.equal((await updateVehicleStatus(paidAssertion.env, 'vehicle-1', 'ready')).status, 409,
  'manual status updates cannot release a vehicle with an active sale');
assert.equal((await updateVehicleStatus(paidAssertion.env, 'vehicle-1', 'hold')).status, 409,
  'an older status edit cannot replace an active reservation');
assert.equal(paidAssertion.sqlite.prepare(`SELECT status FROM auto_vehicles WHERE id='vehicle-1'`).get().status, 'reserved');
assert.equal((await createSale(paidAssertion.env, { vehicleId: 'vehicle-1', salePriceNaira: 1500 })).status, 409,
  'a reserved vehicle cannot be reopened and resold');
assert.equal(paidAssertion.sqlite.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 1);
assert.throws(() => paidAssertion.sqlite.prepare(`INSERT INTO auto_sales(id,company_id,vehicle_id,sale_no,sale_price_kobo,deposit_kobo,amount_paid_kobo,balance_kobo,payment_status,sale_status,sold_by,sale_date) VALUES('direct-duplicate','company-autos','vehicle-1','DIRECT-2',120000,0,0,120000,'unpaid','reserved','employee-a','2026-10-09')`).run(),
  /UNIQUE constraint failed/, 'database index rejects a second non-cancelled sale');

const duplicateHistory = new DatabaseSync(':memory:');
duplicateHistory.exec(`CREATE TABLE auto_sales(company_id TEXT, vehicle_id TEXT, sale_status TEXT);
  INSERT INTO auto_sales VALUES('company-autos','vehicle-1','reserved');
  INSERT INTO auto_sales VALUES('company-autos','vehicle-1','documentation');`);
assert.throws(() => duplicateHistory.exec(activeSaleMigration), /UNIQUE constraint failed/,
  'migration fails closed when existing active sales conflict');
assert.equal(duplicateHistory.prepare('SELECT COUNT(*) AS count FROM auto_sales').get().count, 2,
  'failed migration does not rewrite conflicting sale history');

console.log('PASS Autos sale truth, ready-only status matrix, company denial, active-sale guard and migration uniqueness assertions');
