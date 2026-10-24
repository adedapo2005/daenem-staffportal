import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
// Isolated execution of the ACTUAL Inventory and Bakery handlers against real SQLite SQL.
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
const schema=[
 "CREATE TABLE companies(id TEXT PRIMARY KEY);",
 "CREATE TABLE employees(id TEXT PRIMARY KEY);",
 "CREATE TABLE company_locations(id TEXT PRIMARY KEY,company_id TEXT,active INTEGER);",
 "CREATE TABLE inventory_items(id TEXT PRIMARY KEY,company_id TEXT,unit TEXT,unit_cost_kobo INTEGER,active INTEGER,updated_at TEXT,sku TEXT,name TEXT);",
 "CREATE TABLE bakery_recipe_ingredients(id TEXT PRIMARY KEY,recipe_id TEXT,inventory_item_id TEXT,quantity REAL,unit TEXT,expected_waste_pct REAL DEFAULT 0,critical INTEGER DEFAULT 1);",
 "CREATE TABLE bakery_batch_ingredients(id TEXT PRIMARY KEY,batch_id TEXT,inventory_item_id TEXT,planned_quantity REAL,actual_quantity REAL,waste_quantity REAL,unit TEXT,unit_cost_kobo INTEGER,stock_movement_id TEXT,issued_by TEXT,note TEXT,issued_at TEXT DEFAULT CURRENT_TIMESTAMP);",
 "CREATE TABLE bakery_batches(id TEXT PRIMARY KEY,company_id TEXT,location_id TEXT,recipe_id TEXT,product_id TEXT,status TEXT,started_at TEXT,updated_at TEXT,ingredient_cost_kobo INTEGER DEFAULT 0,actual_yield_qty REAL DEFAULT 0,waste_qty REAL DEFAULT 0,rejected_qty REAL DEFAULT 0,labour_cost_kobo INTEGER DEFAULT 0,energy_cost_kobo INTEGER DEFAULT 0,packaging_cost_kobo INTEGER DEFAULT 0,other_cost_kobo INTEGER DEFAULT 0,total_batch_cost_kobo INTEGER DEFAULT 0,unit_cost_kobo INTEGER DEFAULT 0,best_before_at TEXT,completed_at TEXT,note TEXT);",
 "CREATE TABLE bakery_products(id TEXT PRIMARY KEY,inventory_item_id TEXT,shelf_life_hours INTEGER,sales_unit TEXT);",
 "CREATE TABLE bakery_recipes(id TEXT PRIMARY KEY);",
 "CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT);",
 "CREATE TABLE bakery_bread_ledger(id TEXT PRIMARY KEY,company_id TEXT,business_date TEXT,product_id TEXT,batch_id TEXT,status TEXT,quantity REAL,direction TEXT,reference_type TEXT,reference_id TEXT,reason TEXT,recorded_by TEXT);",
 "CREATE TABLE stock_balances(id TEXT PRIMARY KEY,company_id TEXT,location_id TEXT,item_id TEXT,quantity REAL NOT NULL,reserved_quantity REAL DEFAULT 0,updated_at TEXT,UNIQUE(location_id,item_id));",
 "CREATE TABLE stock_movements(id TEXT PRIMARY KEY,company_id TEXT,item_id TEXT,movement_type TEXT,quantity REAL NOT NULL,unit_cost_kobo INTEGER,to_location_id TEXT,from_location_id TEXT,reference_type TEXT,reference_id TEXT,reason TEXT,lot_no TEXT,expiry_date TEXT,created_by TEXT,metadata_json TEXT);",
 "CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,after_json TEXT,source TEXT);",
 "CREATE TABLE bakery_waste_records(id TEXT PRIMARY KEY,company_id TEXT,location_id TEXT,batch_id TEXT,inventory_item_id TEXT,stage TEXT,reason TEXT,quantity REAL,unit TEXT,estimated_cost_kobo INTEGER,recorded_by TEXT);",
 "INSERT INTO companies VALUES('company-bakery'),('company-printing');",
 "INSERT INTO employees VALUES('operator'),('reviewer');",
 "INSERT INTO company_locations VALUES('HQ','company-bakery',1),('OTHER','company-printing',1);",
 "INSERT INTO inventory_items VALUES('yeast','company-bakery','g',0,1,NULL,'YEAST','Yeast');",
 "INSERT INTO inventory_items VALUES('bread-item','company-bakery','piece',0,1,NULL,'BAK-BREAD','Bread');",
 "INSERT INTO bakery_products VALUES('bread','bread-item',24,'piece');",
 "INSERT INTO bakery_recipes VALUES('recipe1');",
 "INSERT INTO bakery_batches(id,company_id,location_id,recipe_id,product_id,status) VALUES('batch1','company-bakery','HQ','recipe1','bread','packaging');",
 "INSERT INTO bakery_recipe_ingredients VALUES('ri1','recipe1','yeast',100,'g',0,1);"
].join('\n');
db.exec(schema);
for(const migration of ['0106_bakery_material_unit_rules.sql','0107_bakery_precise_material_valuation.sql']){
 db.exec(fs.readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
}
db.prepare("INSERT INTO bakery_material_unit_rules(id,company_id,inventory_item_id,input_unit,inventory_unit,base_quantity_per_input,version_no,status,reason,proposed_by,reviewed_by,review_note,reviewed_at) VALUES('rule-yeast','company-bakery','yeast','carton','g',1000,1,'approved','Supplier carton is exactly 1,000 g','operator','reviewer','Supplier label independently checked',CURRENT_TIMESTAMP)").run();
const inputs={
 './bakery-material-valuation':fs.readFileSync(new URL('../worker/bakery-material-valuation.ts',import.meta.url),'utf8'),
 './bakery-material-units':fs.readFileSync(new URL('../worker/bakery-material-units.ts',import.meta.url),'utf8'),
 './inventory':fs.readFileSync(new URL('../worker/inventory.ts',import.meta.url),'utf8'),
 './bakery':fs.readFileSync(new URL('../worker/bakery.ts',import.meta.url),'utf8')
};
const cache=new Map();
function load(name){
 if(name==='./auth')return{hasPermission:()=>true};
 if(cache.has(name))return cache.get(name);
 assert(inputs[name],name);
 const module={exports:{}};cache.set(name,module.exports);
 const output=ts.transpileModule(inputs[name],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new vm.Script('(function(require,module,exports){'+output+'\n})').runInNewContext({
  Request,Response,URL,Intl,crypto:webcrypto,TextEncoder,TextDecoder,console
 })(load,module,module.exports);
 return module.exports;
}
const {routeInventory}=load('./inventory'),{routeBakery}=load('./bakery');
const {materialQuantityMicro,materialCostMicroKobo,allocateMaterialValue}=load('./bakery-material-valuation');
assert.equal(materialQuantityMicro(0.0000001),null);
assert.equal(materialCostMicroKobo(Number.MAX_SAFE_INTEGER),null);
let batches=0,beforeBatch=null;
const env={DB:{
 prepare(sql){return{bind(...params){return{
  sql,params,async first(){return db.prepare(sql).get(...params)||null},
  async all(){return{results:db.prepare(sql).all(...params)}},
  async run(){return db.prepare(sql).run(...params)}
 }}}},
 async batch(statements){
  if(beforeBatch){const callback=beforeBatch;beforeBatch=null;callback()}
  db.exec('BEGIN IMMEDIATE');
  try{const results=[];for(const st of statements)results.push(await st.run());db.exec('COMMIT');batches++;return results}
  catch(error){db.exec('ROLLBACK');throw error}
 }
}};
const context={companies:[{id:'company-bakery'}],employee:{id:'operator'},permissions:{}};
async function post(route,path,body){
 const response=await route(new Request('https://test.invalid'+path,{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,context);
 assert(response instanceof Response);
 return{code:response.status,data:await response.json()};
}
const count=sql=>Number(Object.values(db.prepare(sql).get())[0]);
const stock=()=>db.prepare("SELECT quantity FROM stock_balances WHERE item_id='yeast'").get()?.quantity||0;
const state=()=>{const row=db.prepare("SELECT remaining_quantity_micro AS q,remaining_value_microkobo AS v FROM bakery_material_valuation_balances WHERE inventory_item_id='yeast'").get();return row?{q:row.q,v:row.v}:undefined};
const receipt={companyId:'company-bakery',locationId:'HQ',itemId:'yeast',quantity:1,receivedUnit:'carton',purchaseUnitCostNaira:1,supplierReference:'SUP-1234'};
db.exec("INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('legacy','company-bakery','HQ','yeast',20)");
let result=await post(routeInventory,'/api/inventory/receive',receipt);
assert.equal(result.code,409,'Cannot invent a valuation for legacy stock');
assert.equal(stock(),20);assert.equal(state(),undefined);
db.exec("DELETE FROM stock_balances WHERE id='legacy'");
result=await post(routeInventory,'/api/inventory/receive',receipt);
assert.equal(result.code,200,JSON.stringify(result.data));
assert.equal(result.data.valuation.receiptCostKobo,100);
assert.equal(stock(),1000);
assert.deepEqual(state(),{q:1000000000,v:100000000});
assert.equal(db.prepare("SELECT unit_cost_kobo AS n FROM inventory_items WHERE id='yeast'").get().n,0);
assert.equal(db.prepare("SELECT value_microkobo AS n FROM bakery_material_valuation_events WHERE movement_type='receipt'").get().n,100000000);
const receiptProof=JSON.parse(db.prepare("SELECT metadata_json AS j FROM stock_movements WHERE movement_type='receipt'").get().j);
assert.equal(receiptProof.receiptValueMicroKobo,100000000);
const issue=(used,waste=0)=>post(routeBakery,'/api/bakery/batches/ingredient',{batchId:'batch1',inventoryItemId:'yeast',actualQuantity:used,wasteQuantity:waste});
result=await issue(1);
assert.equal(result.code,200,JSON.stringify(result.data));
assert.equal(result.data.preciseCostMicroKobo,100000,'One gram equals 0.1 kobo');
assert.equal(stock(),999);assert.deepEqual(state(),{q:999000000,v:99900000});
result=await issue(999);
assert.equal(result.code,200,JSON.stringify(result.data));
assert.equal(result.data.preciseCostMicroKobo,99900000);
assert.equal(stock(),0);assert.deepEqual(state(),{q:0,v:0});
assert.equal(count("SELECT SUM(precise_cost_microkobo) AS n FROM bakery_batch_ingredients"),100000000);
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_material_valuation_events"),3);
assert.equal(count("SELECT COUNT(*) AS n FROM stock_movements"),3);
assert.equal(db.prepare("SELECT COALESCE(SUM(COALESCE(precise_cost_microkobo,ROUND((actual_quantity+waste_quantity)*unit_cost_kobo*1000000,0))),0) AS cost FROM bakery_batch_ingredients WHERE batch_id='batch1'").get().cost,100000000);
result=await post(routeInventory,'/api/inventory/receive',{
 companyId:'company-bakery',locationId:'HQ',itemId:'yeast',quantity:10,receivedUnit:'g',unitCostNaira:0.05,supplierReference:'SUP-BASE'
});
assert.equal(result.code,200,JSON.stringify(result.data));
assert.equal(stock(),10);assert.deepEqual(state(),{q:10000000,v:50000000});
db.exec("INSERT INTO company_locations VALUES('HQ2','company-bakery',1)");
result=await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'yeast',quantity:1
});
assert.equal(result.code,409,'Unpriced transfers cannot move a precise-value material');
assert.equal(stock(),10);
beforeBatch=()=>db.prepare("UPDATE stock_balances SET quantity=quantity+1 WHERE item_id='yeast'").run();
let stale=false;try{await issue(1)}catch{stale=true}
assert(stale,'Stale shared stock must roll back');
assert.equal(stock(),11);assert.equal(count("SELECT COUNT(*) AS n FROM bakery_batch_ingredients"),2);
db.prepare("UPDATE stock_balances SET quantity=quantity-1 WHERE item_id='yeast'").run();
beforeBatch=()=>db.prepare("UPDATE bakery_material_valuation_balances SET remaining_value_microkobo=remaining_value_microkobo+1 WHERE inventory_item_id='yeast'").run();
stale=false;try{await issue(1)}catch{stale=true}
assert(stale,'Stale money balance must roll back');
assert.equal(stock(),10);assert.equal(count("SELECT COUNT(*) AS n FROM bakery_batch_ingredients"),2);
db.prepare("UPDATE bakery_material_valuation_balances SET remaining_value_microkobo=remaining_value_microkobo-1 WHERE inventory_item_id='yeast'").run();
const postedValue=db.prepare("SELECT COALESCE(SUM(value_microkobo*(CASE WHEN movement_type IN ('receipt','transfer_in') THEN 1 ELSE -1 END)),0) AS n FROM bakery_material_valuation_events").get().n;
assert.equal(postedValue,state().v,'All exact value must reconcile to immutable events');
let balance={quantityMicro:1000000000,valueMicroKobo:100000000};
for(let j=0;j<997;j++)balance=allocateMaterialValue(balance,1000000).next;
const tail=allocateMaterialValue(balance,balance.quantityMicro);
assert.equal(tail.next.quantityMicro,0,'Final material quantity fully consumed');assert.equal(tail.next.valueMicroKobo,0,'Last allocation receives all value remainder');
const completionRequest={batchId:'batch1',status:'completed',actualYieldQty:100,wasteQty:0,rejectedQty:0};
const stockBeforeCompletion=count("SELECT COUNT(*) AS n FROM stock_movements");
beforeBatch=()=>db.prepare("UPDATE bakery_batches SET status='completed' WHERE id='batch1'").run();
let completionRaceBlocked=false;
try{await post(routeBakery,'/api/bakery/batches/status',completionRequest)}catch{completionRaceBlocked=true}
assert(completionRaceBlocked,'A racing duplicate completion must fail its atomic finished-stock guard');
assert.equal(count("SELECT COUNT(*) AS n FROM stock_movements"),stockBeforeCompletion,
 'A stale completed batch cannot post any finished stock movement');
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE item_id='bread-item'").get(),undefined,
 'No finished stock may be added on a failed completion');
db.prepare("UPDATE bakery_batches SET status='packaging' WHERE id='batch1'").run();
const completion=await post(routeBakery,'/api/bakery/batches/status',completionRequest);
assert.equal(completion.code,200,JSON.stringify(completion.data));
assert.equal(completion.data.costing.ingredientCostMicroKobo,100000000);
assert.equal(completion.data.costing.ingredientCostKobo,100);
const finished=db.prepare("SELECT ingredient_cost_kobo AS kobo,ingredient_cost_microkobo AS micro,status FROM bakery_batches WHERE id='batch1'").get();
assert.equal(finished.kobo,100);assert.equal(finished.micro,100000000);assert.equal(finished.status,'completed');
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE item_id='bread-item'").get().quantity,100);
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_bread_ledger WHERE status='produced'"),1);
const duplicate=await post(routeBakery,'/api/bakery/batches/status',{batchId:'batch1',status:'completed',actualYieldQty:100,wasteQty:0,rejectedQty:0});
assert.equal(duplicate.code,409,'Completed bread must never be stocked twice');
db.close();
console.log('PASS real HTTP batch completion: precise ingredient value posts 100-kobo batch cost and 100 saleable loaves once');
console.log('PASS real Inventory + Bakery SQL: 1 carton ₦1 -> 1,000 grams -> 0.1 kobo per gram');
console.log('PASS conservation: exact total receipt cost, each production issue, final stock value, and movements');
console.log('PASS transaction rollback: stale stock or valuation cannot create a phantom material issue');
