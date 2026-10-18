import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/bakery.ts', import.meta.url), 'utf8');
const withoutAuthImport = source.replace(
  "import{hasPermission,type AuthEnv,type SessionContext}from'./auth';",
  `const hasPermission=(context,resource,action)=>Boolean(context.permissions?.[resource]?.includes(action));`,
);
const { outputText } = ts.transpileModule(withoutAuthImport, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeBakery } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY, setting_value TEXT);
    CREATE TABLE sales_orders(
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, location_id TEXT NOT NULL, customer_id TEXT,
      order_no TEXT NOT NULL, channel TEXT NOT NULL, order_date TEXT NOT NULL, due_date TEXT,
      status TEXT NOT NULL, payment_status TEXT NOT NULL, total_kobo INTEGER NOT NULL,
      amount_paid_kobo INTEGER NOT NULL, notes TEXT, created_by TEXT NOT NULL
    );
    CREATE TABLE bakery_products(
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, inventory_item_id TEXT NOT NULL,
      name TEXT NOT NULL, selling_price_kobo INTEGER NOT NULL, wholesale_price_kobo INTEGER, active INTEGER NOT NULL
    );
    CREATE TABLE stock_balances(
      item_id TEXT NOT NULL, location_id TEXT NOT NULL, quantity REAL NOT NULL,
      reserved_quantity REAL NOT NULL DEFAULT 0, updated_at TEXT
    );
    CREATE TABLE inventory_items(id TEXT PRIMARY KEY, unit_cost_kobo INTEGER NOT NULL);
    CREATE TABLE bakery_order_details(
      sales_order_id TEXT PRIMARY KEY, order_type TEXT NOT NULL, pickup_or_delivery_at TEXT,
      delivery_address TEXT, special_instructions TEXT, fulfillment_status TEXT NOT NULL
    );
    CREATE TABLE sales_order_items(
      id TEXT PRIMARY KEY, sales_order_id TEXT NOT NULL, inventory_item_id TEXT NOT NULL,
      description TEXT NOT NULL, quantity REAL NOT NULL, unit_price_kobo INTEGER NOT NULL,
      unit_cost_kobo INTEGER NOT NULL, line_total_kobo INTEGER NOT NULL, metadata_json TEXT
    );
    CREATE TABLE stock_movements(
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, item_id TEXT NOT NULL, movement_type TEXT NOT NULL,
      quantity REAL NOT NULL, from_location_id TEXT NOT NULL, reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL, reason TEXT NOT NULL, created_by TEXT NOT NULL
    );
    CREATE TABLE bakery_bread_ledger(
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, business_date TEXT NOT NULL, product_id TEXT NOT NULL,
      status TEXT NOT NULL, quantity REAL NOT NULL, direction TEXT NOT NULL, reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL, reason TEXT NOT NULL, recorded_by TEXT NOT NULL
    );
    CREATE TABLE payments(
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, customer_id TEXT, sales_order_id TEXT NOT NULL,
      payment_no TEXT NOT NULL, method TEXT NOT NULL, amount_kobo INTEGER NOT NULL, reference TEXT,
      received_by TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE bakery_money_ledger(
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, business_date TEXT NOT NULL,
      sales_order_id TEXT NOT NULL, status TEXT NOT NULL, amount_kobo INTEGER NOT NULL,
      direction TEXT NOT NULL, reference TEXT, reason TEXT NOT NULL, recorded_by TEXT NOT NULL
    );
    CREATE TABLE audit_logs(
      id TEXT PRIMARY KEY, actor_employee_id TEXT NOT NULL, company_id TEXT NOT NULL,
      module TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      after_json TEXT NOT NULL, source TEXT NOT NULL
    );
    INSERT INTO bakery_products VALUES('bread-1','company-bakery','item-1','Bread',50000,NULL,1);
    INSERT INTO inventory_items VALUES('item-1',20000);
    INSERT INTO stock_balances(item_id,location_id,quantity,reserved_quantity) VALUES('item-1','location-bakery-hq',10,0);
  `);

  const statement = (sql, values = []) => ({
    sql, values,
    bind(...args) { return statement(sql, args); },
    async first() { return sqlite.prepare(sql).get(...values); },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
    async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
  });
  const DB = {
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((item) => {
          const result = sqlite.prepare(item.sql).run(...item.values);
          return { meta: { changes: Number(result.changes) } };
        });
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
  employee: { id: 'cashier-a' },
  companies: [{ id: 'company-bakery' }],
  permissions: { 'sales.access': ['create'] },
};
const createSale = (env, paymentMethod, extras = {}) => routeBakery(new Request('https://staffportal.invalid/api/bakery/pos/sale', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    orderType: 'walk_in', items: [{ productId: 'bread-1', quantity: 2 }],
    paymentMethod, ...extras,
  }),
}), env, context);

const transfer = fixture();
let response = await createSale(transfer.env, 'bank_transfer', {
  amountPaidNaira: 1000, reference: 'CLIENT-CLAIMED-TRANSFER', fulfillNow: true,
});
assert.equal(response.status, 201);
let transferBody = await response.json();
assert.equal(transferBody.sale.amountPaidKobo, 0);
assert.equal(transferBody.sale.paymentStatus, 'unpaid');
assert.equal(transferBody.sale.fulfillmentStatus, 'pending');
assert.equal(transfer.sqlite.prepare('SELECT status,payment_status,amount_paid_kobo FROM sales_orders').get().payment_status, 'unpaid');
assert.equal(transfer.sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0);
assert.equal(transfer.sqlite.prepare("SELECT quantity FROM stock_balances WHERE item_id='item-1'").get().quantity, 10);
assert.equal(transfer.sqlite.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n, 0);

const missingCashAmount = fixture();
response = await createSale(missingCashAmount.env, 'cash', { fulfillNow: true });
const missingCashBody = await response.json();
assert.equal(missingCashBody.sale.paymentStatus, 'unpaid', 'missing cash amount cannot default to the full order total');
assert.equal(missingCashBody.sale.fulfillmentStatus, 'pending');
assert.equal(missingCashAmount.sqlite.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0);
assert.equal(missingCashAmount.sqlite.prepare('SELECT quantity FROM stock_balances').get().quantity, 10);

const cash = fixture();
response = await createSale(cash.env, 'cash', { amountPaidNaira: 1000, fulfillNow: true });
const cashBody = await response.json();
assert.equal(cashBody.sale.paymentStatus, 'paid');
assert.equal(cashBody.sale.fulfillmentStatus, 'fulfilled');
assert.equal(cash.sqlite.prepare('SELECT status FROM payments').get().status, 'confirmed');
assert.equal(cash.sqlite.prepare('SELECT quantity FROM stock_balances').get().quantity, 8);

console.log('PASS Bakery POS SQLite acceptance: non-cash claims stay unpaid/unreleased, missing cash amount stays unpaid, explicit full cash permits walk-in release');
