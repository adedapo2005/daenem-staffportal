// Bakery dispatch custody and item identity acceptance. This runs the real
// TypeScript HTTP handler plus migrations against isolated in-memory SQLite.
// No Cloudflare D1, customer funds, inventory or production data are touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const source=fs.readFileSync(new URL('../worker/bakery-accountability.ts',import.meta.url),'utf8');
const base=fs.readFileSync(new URL('../migrations/0111_bakery_dispatch_atomic_close.sql',import.meta.url),'utf8');
const audit=fs.readFileSync(new URL('../migrations/0112_bakery_dispatch_closure_audit.sql',import.meta.url),'utf8');
const custody=fs.readFileSync(new URL('../migrations/0113_bakery_dispatch_issued_custody_lock.sql',import.meta.url),'utf8');
const load=name=>{
 if(name==='./auth')return {hasPermission:(ctx,code,level,company)=>
  ctx.companies.some(c=>c.id===company)&&ctx.grants.includes(code+':'+level)};
 if(name==='./bakery-material-units')return {routeBakeryMaterialUnits:async()=>null};
 if(name==='./bakery-finance-bridge')return {
  routeBakeryFinanceBridge:async()=>null,routeBakeryDispatchFinanceBridge:async()=>null};
 throw Error('Unexpected dependency '+name);
};
const js=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};
new vm.Script('(function(require,module,exports){'+js+'\n})').runInNewContext({
 Request,Response,URL,crypto:webcrypto,console,TextEncoder,TextDecoder,Intl
})(load,module,module.exports);
const route=module.exports.routeBakeryAccountability;
assert.equal(typeof route,'function');

const db=new DatabaseSync(':memory:');
db.exec(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE employees(id TEXT PRIMARY KEY);
 CREATE TABLE company_locations(id TEXT PRIMARY KEY,company_id TEXT,active INTEGER);
 CREATE TABLE bakery_custodians(id TEXT PRIMARY KEY,company_id TEXT,active INTEGER);
 CREATE TABLE bakery_products(
  id TEXT PRIMARY KEY,company_id TEXT,active INTEGER,
  inventory_item_id TEXT,selling_price_kobo INTEGER);
 CREATE TABLE stock_balances(
  location_id TEXT,item_id TEXT,company_id TEXT,
  quantity INTEGER,reserved_quantity INTEGER,updated_at TEXT);
 CREATE TABLE stock_movements(
  id TEXT PRIMARY KEY,company_id TEXT,item_id TEXT,movement_type TEXT,
  quantity INTEGER NOT NULL,from_location_id TEXT,reference_type TEXT,
  reference_id TEXT,reason TEXT,created_by TEXT);
 CREATE TABLE bakery_dispatches(
  id TEXT PRIMARY KEY,company_id TEXT,dispatch_no TEXT,
  location_id TEXT,custodian_id TEXT,status TEXT,
  dispatched_at TEXT,note TEXT,created_by TEXT,
  received_at TEXT,closed_at TEXT,closed_by TEXT,updated_at TEXT);
 CREATE TABLE bakery_dispatch_items(
  id TEXT PRIMARY KEY,dispatch_id TEXT,product_id TEXT,
  quantity INTEGER NOT NULL,unit_price_kobo INTEGER);
 CREATE TABLE bakery_bread_ledger(
  id TEXT PRIMARY KEY,company_id TEXT,business_date TEXT,
  product_id TEXT,dispatch_id TEXT,custodian_id TEXT,status TEXT,
  quantity INTEGER,direction TEXT,reference_type TEXT,reference_id TEXT,
  reason TEXT,recorded_by TEXT,buyer_type TEXT,unit_price_kobo INTEGER);
 CREATE TABLE bakery_money_ledger(
  id TEXT PRIMARY KEY,company_id TEXT,dispatch_id TEXT,status TEXT,
  amount_kobo INTEGER,direction TEXT,reference TEXT);
 CREATE TABLE bakery_dispatch_return_receipts(
  id TEXT PRIMARY KEY,company_id TEXT,dispatch_id TEXT,product_id TEXT,quantity INTEGER);
 CREATE TABLE audit_logs(
  id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,
  module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,
  before_json TEXT,after_json TEXT,source TEXT);
 INSERT INTO employees VALUES('manager-1');
 INSERT INTO company_locations VALUES('bakery-hq','company-bakery',1);
 INSERT INTO bakery_custodians VALUES('agent-1','company-bakery',1);
 INSERT INTO bakery_products VALUES
 ('bread-1','company-bakery',1,'inv-1',1000),
 ('bread-2','company-bakery',1,'inv-2',1500);
 INSERT INTO stock_balances(location_id,item_id,company_id,quantity,reserved_quantity)
 VALUES('bakery-hq','inv-1','company-bakery',20,0),
       ('bakery-hq','inv-2','company-bakery',15,0);
`);
db.exec(base);db.exec(audit);db.exec(custody);

let beforeBatch=null;
const env={DB:{
 prepare(sql){return {bind(...args){return{
  sql,args,
  async first(){return db.prepare(sql).get(...args)},
  async all(){return{results:db.prepare(sql).all(...args)}},
  async run(){return db.prepare(sql).run(...args)}
 }}}},
 async batch(stmts){
  if(beforeBatch){const callback=beforeBatch;beforeBatch=null;callback()}
  db.exec('BEGIN IMMEDIATE');
  try{
   const result=stmts.map(q=>{const changed=db.prepare(q.sql).run(...q.args);
    return{meta:{changes:Number(changed.changes)},results:[]};});
   db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error}
 }
}};
const manager={companies:[{id:'company-bakery'}],employee:{id:'manager-1'},
 grants:['bakery.dispatch:create']};
const denied={...manager,grants:[]};
const request=()=>new Request('https://test.invalid/api/bakery/accountability/dispatches',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({custodianId:'agent-1',locationId:'bakery-hq',items:[
 {productId:'bread-1',quantity:5},{productId:'bread-2',quantity:3}]})
});
const counts=()=>db.prepare(`SELECT
 (SELECT COUNT(*) FROM bakery_dispatches) AS dispatches,
 (SELECT COUNT(*) FROM bakery_dispatch_items) AS items,
 (SELECT COUNT(*) FROM bakery_bread_ledger) AS bread,
 (SELECT COUNT(*) FROM stock_movements) AS movements,
 (SELECT COUNT(*) FROM audit_logs WHERE action='create_dispatch') AS audits`).get();
assert.equal((await route(request(),env,denied)).status,403);
assert.equal(counts().dispatches,0);
const response=await route(request(),env,manager);
const data=await response.json();
assert.equal(response.status,201,JSON.stringify(data));
const dispatchId=data.dispatch.id;
assert.equal(data.dispatch.status,'in_transit');
assert.deepEqual({...counts()},{dispatches:1,items:2,bread:2,movements:2,audits:1});
const issued=db.prepare('SELECT status,dispatched_at AS at FROM bakery_dispatches WHERE id=?').get(dispatchId);
assert.equal(issued.status,'in_transit');assert(issued.at,'Issue time must be set');
assert.deepEqual(db.prepare(`SELECT product_id AS product,quantity,unit_price_kobo AS price
 FROM bakery_dispatch_items WHERE dispatch_id=? ORDER BY product_id`).all(dispatchId),
 [{product:'bread-1',quantity:5,price:1000},{product:'bread-2',quantity:3,price:1500}]);
assert.deepEqual(db.prepare(`SELECT item_id,quantity FROM stock_balances ORDER BY item_id`).all(),
 [{item_id:'inv-1',quantity:15},{item_id:'inv-2',quantity:12}]);
const oneItem=db.prepare('SELECT id FROM bakery_dispatch_items WHERE dispatch_id=? LIMIT 1').get(dispatchId).id;
const rejects=[
 ['item quantity',()=>db.prepare('UPDATE bakery_dispatch_items SET quantity=999 WHERE id=?').run(oneItem),/Issued Bakery dispatch items and prices are immutable/],
 ['item price',()=>db.prepare('UPDATE bakery_dispatch_items SET unit_price_kobo=1 WHERE id=?').run(oneItem),/Issued Bakery dispatch items and prices are immutable/],
 ['item deletion',()=>db.prepare('DELETE FROM bakery_dispatch_items WHERE id=?').run(oneItem),/Issued Bakery dispatch items cannot be deleted/],
 ['item append',()=>db.prepare("INSERT INTO bakery_dispatch_items VALUES('fake-item',?,'bread-1',5,1000)").run(dispatchId),/Issued Bakery dispatch cannot add bread items/],
 ['custodian swap',()=>db.prepare("UPDATE bakery_dispatches SET custodian_id='another-agent' WHERE id=?").run(dispatchId),/Issued Bakery dispatch identity is immutable/],
 ['dispatch number swap',()=>db.prepare("UPDATE bakery_dispatches SET dispatch_no='FAKE' WHERE id=?").run(dispatchId),/Issued Bakery dispatch identity is immutable/],
 ['issued dispatch deletion',()=>db.prepare('DELETE FROM bakery_dispatches WHERE id=?').run(dispatchId),/Issued Bakery dispatch cannot be deleted/]
];
for(const [name,act,error] of rejects)assert.throws(act,error,name);
assert.deepEqual({...counts()},{dispatches:1,items:2,bread:2,movements:2,audits:1},
 'Rejected edits must preserve all monetary and custody evidence');

// A direct raw SQL writer cannot issue an empty or partially accounted draft.
db.prepare(`INSERT INTO bakery_dispatches(id,company_id,dispatch_no,
 location_id,custodian_id,status,created_by)
 VALUES('raw-draft','company-bakery','RAW-QA','bakery-hq','agent-1','draft','manager-1')`).run();
assert.throws(()=>db.prepare(`UPDATE bakery_dispatches SET status='in_transit'
 WHERE id='raw-draft'`).run(),/issue requires bread items/);
db.prepare(`INSERT INTO bakery_dispatch_items VALUES
 ('raw-item','raw-draft','bread-1',2,1000)`).run();
assert.throws(()=>db.prepare(`UPDATE bakery_dispatches SET status='in_transit'
 WHERE id='raw-draft'`).run(),/bread custody evidence is incomplete/);
db.prepare(`INSERT INTO bakery_bread_ledger
 (id,company_id,business_date,product_id,dispatch_id,custodian_id,status,
  quantity,direction,reference_type,reference_id,recorded_by)
 VALUES('raw-ledger','company-bakery','2026-10-25','bread-1','raw-draft',
        'agent-1','in_transit',2,'out','bakery_dispatch','raw-draft','manager-1')`).run();
db.prepare(`UPDATE bakery_dispatches SET status='in_transit'
 WHERE id='raw-draft'`).run();
assert.equal(db.prepare("SELECT status FROM bakery_dispatches WHERE id='raw-draft'").get().status,'in_transit');

// Simulate a stock shortage between validation and transactional posting.
// The mandatory stock movement must fail, rolling back the entire dispatch.
const before=counts();
beforeBatch=()=>db.prepare("UPDATE stock_balances SET quantity=0 WHERE item_id='inv-2'").run();
await assert.rejects(()=>route(request(),env,manager));
assert.deepEqual({...counts()},{...before},
 'A stale stock validation cannot leave a phantom dispatch or custody trail');
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE item_id='inv-1'").get().quantity,15);
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE item_id='inv-2'").get().quantity,0);

// A fully accounted issued dispatch can still reach a one-audit final close.
db.prepare(`INSERT INTO bakery_bread_ledger
 (id,company_id,business_date,product_id,dispatch_id,custodian_id,status,
  quantity,direction,reference_type,reference_id,recorded_by,
  buyer_type,unit_price_kobo)
 VALUES('sold-1','company-bakery','2026-10-25','bread-1',?,'agent-1',
        'sold',5,'out','sale','sold-1','manager-1','individual',1000)`).run(dispatchId);
db.prepare(`INSERT INTO bakery_bread_ledger
 (id,company_id,business_date,product_id,dispatch_id,custodian_id,status,
  quantity,direction,reference_type,reference_id,recorded_by,
  buyer_type,unit_price_kobo)
 VALUES('sold-2','company-bakery','2026-10-25','bread-2',?,'agent-1',
        'sold',3,'out','sale','sold-2','manager-1','individual',1500)`).run(dispatchId);
db.prepare(`INSERT INTO bakery_money_ledger
 VALUES('cash-final','company-bakery',?,'cash_received',9500,'in','QA-CASH-FINAL')`).run(dispatchId);
db.prepare(`UPDATE bakery_dispatches SET status='closed',closed_at=CURRENT_TIMESTAMP,
 closed_by='manager-1' WHERE id=?`).run(dispatchId);
assert.equal(db.prepare('SELECT status FROM bakery_dispatches WHERE id=?').get(dispatchId).status,'closed');
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=?
 AND action='close_reconciliation' AND source='database'`).get(dispatchId).n,1);
assert.throws(()=>db.prepare('UPDATE bakery_dispatches SET note=? WHERE id=?').run('tampered',dispatchId),
 /Final Bakery dispatch cannot be modified/);
assert.throws(()=>db.prepare('DELETE FROM bakery_dispatches WHERE id=?').run(dispatchId),
 /Issued Bakery dispatch cannot be deleted/);
assert.throws(()=>db.prepare('UPDATE bakery_dispatch_items SET unit_price_kobo=1 WHERE dispatch_id=?').run(dispatchId),
 /Issued Bakery dispatch items and prices are immutable/);
db.close();
console.log('PASS Bakery staged dispatch: 2 products, canonical stock issue, immutable issued prices/quantities');
console.log('PASS raw issue rejects missing custody; race rolls back draft, stock, ledger and audit');
console.log('PASS final dispatch metadata, prices, identity and delete locked; valid closure keeps 1 audit');
