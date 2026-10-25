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
 "CREATE TABLE bakery_products(id TEXT PRIMARY KEY,inventory_item_id TEXT,shelf_life_hours INTEGER,sales_unit TEXT,company_id TEXT);",
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
 "INSERT INTO inventory_items VALUES('flour','company-bakery','kg',0,1,NULL,'FLOUR','Flour');",
 "INSERT INTO inventory_items VALUES('sugar','company-bakery','kg',0,1,NULL,'SUGAR','Sugar');",
 "INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('legacy-flour','company-bakery','HQ','flour',50);",
 "INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('legacy-sugar','company-bakery','HQ','sugar',10);",
 "INSERT INTO inventory_items VALUES('bread-item','company-bakery','piece',0,1,NULL,'BAK-BREAD','Bread');",
 "INSERT INTO bakery_products VALUES('bread','bread-item',24,'piece','company-bakery');",
 "INSERT INTO bakery_recipes VALUES('recipe1');",
 "INSERT INTO bakery_batches(id,company_id,location_id,recipe_id,product_id,status) VALUES('batch1','company-bakery','HQ','recipe1','bread','packaging');",
 "INSERT INTO bakery_recipe_ingredients VALUES('ri1','recipe1','yeast',100,'g',0,1);"
].join('\n');
db.exec(schema);
// The production opening guard also checks Inventory's finished-good category.
db.exec("ALTER TABLE inventory_items ADD COLUMN category_id TEXT");
db.exec("CREATE TABLE inventory_categories(id TEXT PRIMARY KEY,company_id TEXT,category_type TEXT)");
db.exec("INSERT INTO inventory_categories(id,company_id,category_type) VALUES('raw-ingredient','company-bakery','stock'),('finished-ingredient','company-bakery','finished_good')");
for(const migration of ['0106_bakery_material_unit_rules.sql','0107_bakery_precise_material_valuation.sql','0108_bakery_verified_opening_valuations.sql']){
 db.exec(fs.readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
}
db.prepare("INSERT INTO bakery_material_unit_rules(id,company_id,inventory_item_id,input_unit,inventory_unit,base_quantity_per_input,version_no,status,reason,proposed_by,reviewed_by,review_note,reviewed_at) VALUES('rule-yeast','company-bakery','yeast','carton','g',1000,1,'approved','Supplier carton is exactly 1,000 g','operator','reviewer','Supplier label independently checked',CURRENT_TIMESTAMP)").run();
const inputs={
 './bakery-material-valuation':fs.readFileSync(new URL('../worker/bakery-material-valuation.ts',import.meta.url),'utf8'),
 './bakery-material-units':fs.readFileSync(new URL('../worker/bakery-material-units.ts',import.meta.url),'utf8'),
 './inventory':fs.readFileSync(new URL('../worker/inventory.ts',import.meta.url),'utf8'),
 './bakery':fs.readFileSync(new URL('../worker/bakery.ts',import.meta.url),'utf8'),
 './bakery-material-openings':fs.readFileSync(new URL('../worker/bakery-material-openings.ts',import.meta.url),'utf8'),
 './bakery-material-transfers':fs.readFileSync(new URL('../worker/bakery-material-transfers.ts',import.meta.url),'utf8')
};
const cache=new Map();
function load(name){
 if(name==='./auth')return{hasPermission:context=>context.deny!==true};
 if(cache.has(name))return cache.get(name);
 assert(inputs[name],name);
 const module={exports:{}};cache.set(name,module.exports);
 const output=ts.transpileModule(inputs[name],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new vm.Script('(function(require,module,exports){'+output+'\n})').runInNewContext({
  Request,Response,URL,Intl,crypto:webcrypto,TextEncoder,TextDecoder,console
 })(load,module,module.exports);
 return module.exports;
}
const {routeInventory}=load('./inventory'),{routeBakery}=load('./bakery'),{routeBakeryMaterialOpenings}=load('./bakery-material-openings');
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
const reviewer={companies:[{id:'company-bakery'}],employee:{id:'reviewer'},permissions:{}};
async function post(route,path,body,who=context){
 const response=await route(new Request('https://test.invalid'+path,{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,who);
 assert(response instanceof Response);
 return{code:response.status,data:await response.json()};
}
async function get(route,path,who=context){
 const response=await route(new Request('https://test.invalid'+path),env,who);
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
db.exec("INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('legacy-dest','company-bakery','HQ2','yeast',2)");
result=await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'yeast',quantity:1
});
assert.equal(result.code,409,'Destination with unvalued legacy stock cannot accept precise-value material');
assert.equal(stock(),10);
db.exec("DELETE FROM stock_balances WHERE id='legacy-dest'");
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
result=await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'yeast',quantity:2
});
assert.equal(result.code,200,JSON.stringify(result.data));
assert.equal(result.data.valueMicroKobo,10000000,'Two grams carry 10,000,000 microkobo');
const stockAt=locationId=>db.prepare("SELECT quantity FROM stock_balances WHERE location_id=? AND item_id='yeast'").get(locationId)?.quantity||0;
const valueAt=locationId=>db.prepare("SELECT remaining_quantity_micro AS qty,remaining_value_microkobo AS value FROM bakery_material_valuation_balances WHERE location_id=? AND inventory_item_id='yeast'").get(locationId);
assert.equal(stockAt('HQ'),8);assert.equal(stockAt('HQ2'),2);
assert.equal(valueAt('HQ').value,40000000);assert.equal(valueAt('HQ2').value,10000000);
const beforeTransferEvents=count("SELECT COUNT(*) AS n FROM bakery_material_valuation_events");
beforeBatch=()=>db.prepare("UPDATE stock_balances SET quantity=quantity+1 WHERE location_id='HQ2' AND item_id='yeast'").run();
result=await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'yeast',quantity:1
});
assert.equal(result.code,409,'Stale destination count blocks entire transfer');
assert.equal(stockAt('HQ'),8);assert.equal(stockAt('HQ2'),3,'Concurrent change exists but transfer did not post');
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_material_valuation_events"),beforeTransferEvents);
db.prepare("UPDATE stock_balances SET quantity=quantity-1 WHERE location_id='HQ2' AND item_id='yeast'").run();
assert.equal(valueAt('HQ').value+valueAt('HQ2').value,50000000,'Transfer did not create or destroy value');
assert.equal(valueAt('HQ').qty+valueAt('HQ2').qty,10000000,'Transfer did not create or destroy quantity');

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
// The opening proposal never manufactures extra physical units; independent approval
// activates the precise valuation only against the unchanged existing stock quantity.
db.prepare("UPDATE inventory_items SET category_id='finished-ingredient' WHERE id='flour'").run();
const finishedOpening=await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',
 {locationId:'HQ',inventoryItemId:'flour',countedQuantity:50,totalValueNaira:25000,
  reason:'Finished goods must not receive raw material opening values',
  evidenceReference:'FINISHED-GOODS-CATEGORY-TEST'});
assert.equal(finishedOpening.code,404,'A categorized finished good cannot receive a raw material financial opening');
db.prepare("UPDATE inventory_items SET category_id='raw-ingredient' WHERE id='flour'").run();
const openingBody={locationId:'HQ',inventoryItemId:'flour',countedQuantity:50,totalValueNaira:25000,
 reason:'Counted and independently costed the existing flour at HQ',
 evidenceReference:'PHYSICAL-STOCK-COUNT-FLOUR-01'};
const deniedReviewer={companies:[{id:'company-bakery'}],employee:{id:'reviewer'},deny:true};
const externalReviewer={companies:[{id:'company-printing'}],employee:{id:'reviewer'}};
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',
 openingBody,deniedReviewer)).code,403,'Bakery opening requires actual Inventory edit authority');
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',
 openingBody,externalReviewer)).code,403,'Other companies cannot create Bakery financial openings');
const openingStockMovementCount=count("SELECT COUNT(*) AS n FROM stock_movements WHERE item_id='flour'");
const opening=await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',openingBody);
assert.equal(opening.code,201,JSON.stringify(opening.data));
const openingId=opening.data.id;
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',openingBody)).code,409,'Duplicate pending opening is blocked');
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/review',
 {openingId,decision:'approved',reviewNote:'I independently counted and valued this stock'})).code,403,'Opening proposer cannot self-approve');
db.prepare("UPDATE stock_balances SET quantity=49 WHERE item_id='flour' AND location_id='HQ'").run();
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/review',
 {openingId,decision:'approved',reviewNote:'Independent counted-stock valuation verification'},reviewer)).code,409,'Stale physical counts fail closed');
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_material_valuation_balances WHERE inventory_item_id='flour'"),0);
db.prepare("UPDATE stock_balances SET quantity=50,reserved_quantity=1 WHERE item_id='flour' AND location_id='HQ'").run();
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/review',
 {openingId,decision:'approved',reviewNote:'Independent counted-stock valuation verification'},reviewer)).code,409,'Reserved unverified opening is blocked');
db.prepare("UPDATE stock_balances SET reserved_quantity=0 WHERE item_id='flour' AND location_id='HQ'").run();
const openingApproved=await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/review',
 {openingId,decision:'approved',reviewNote:'I verified the quantity, supplier invoices and value'},reviewer);
assert.equal(openingApproved.code,200,JSON.stringify(openingApproved.data));
assert.equal(openingApproved.data.stockAdded,0);
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE location_id='HQ' AND item_id='flour'").get().quantity,50);
const openingValue=db.prepare("SELECT remaining_quantity_micro AS q,remaining_value_microkobo AS v FROM bakery_material_valuation_balances WHERE location_id='HQ' AND inventory_item_id='flour'").get();
assert.equal(openingValue.q,50000000);assert.equal(openingValue.v,2500000000000);
assert.equal(count("SELECT COUNT(*) AS n FROM stock_movements WHERE item_id='flour'"),openingStockMovementCount,'Opening valuation must not create a fictional receipt');
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/review',
 {openingId,decision:'approved',reviewNote:'No duplicate approvals should be posted'},reviewer)).code,409);
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',openingBody)).code,409,'No second opening after approval');
assert.throws(()=>db.prepare("UPDATE bakery_material_opening_valuations SET opening_value_microkobo=1 WHERE id=?").run(openingId),/immutable/i);
assert.throws(()=>db.prepare("DELETE FROM bakery_material_opening_valuations WHERE id=?").run(openingId),/deleted/i);
const sugarOpening=await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',
 {...openingBody,inventoryItemId:'sugar',countedQuantity:10,reason:'Counted the existing sugar stock'},context);
assert.equal(sugarOpening.code,201);
// The same physical quantity with new receipt/issue activity is NOT the same historical stock snapshot.
db.prepare("INSERT INTO stock_movements(id,company_id,item_id,movement_type,quantity,to_location_id,created_by) VALUES('sugar-new-receipt','company-bakery','sugar','receipt',1,'HQ','reviewer')").run();
db.prepare("INSERT INTO stock_movements(id,company_id,item_id,movement_type,quantity,from_location_id,created_by) VALUES('sugar-new-issue','company-bakery','sugar','issue',1,'HQ','reviewer')").run();
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/review',
 {openingId:sugarOpening.data.id,decision:'approved',reviewNote:'Independent review with unchanged numerical count'},reviewer)).code,409,
 'New stock movements invalidate opening evidence even when stock returns to same quantity');
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/review',
 {openingId:sugarOpening.data.id,decision:'rejected',reviewNote:'Supplier invoice valuation has not been verified'},reviewer)).code,200);
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_material_valuation_balances WHERE inventory_item_id='sugar'"),0);
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',
 {...openingBody,locationId:'OTHER'})).code,404,'Cross-company location not permitted');
assert.equal((await post(routeBakeryMaterialOpenings,'/api/inventory/bakery/openings/propose',
 {...openingBody,countedQuantity:51})).code,409,'Count must match actual stock');
// The newly opened valuation moves with the same ordinary Inventory transfer screen.
const flourTransfer=await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',
 itemId:'flour',quantity:10,reason:'Deliver verified flour to the second Bakery location'
});
assert.equal(flourTransfer.code,200,JSON.stringify(flourTransfer.data));
const flourAt=locationId=>db.prepare("SELECT remaining_quantity_micro AS q,remaining_value_microkobo AS v FROM bakery_material_valuation_balances WHERE location_id=? AND inventory_item_id='flour'").get(locationId);
assert.equal(flourAt('HQ').q,40000000);assert.equal(flourAt('HQ').v,2000000000000);
assert.equal(flourAt('HQ2').q,10000000);assert.equal(flourAt('HQ2').v,500000000000);
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE location_id='HQ2' AND item_id='flour'").get().quantity,10);
assert.equal(flourAt('HQ').v+flourAt('HQ2').v,openingValue.v,'Transfer preserves all financially approved opening value');
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_material_valuation_events WHERE inventory_item_id='flour'"),2);
assert.equal(count("SELECT COUNT(*) AS n FROM stock_movements WHERE item_id='flour'"),openingStockMovementCount+2);
// A second transfer into a location that already has a precise ledger uses the existing value
// balance; it must not create a second opening or replace the previous destination value.
const secondTransfer=await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',
 itemId:'flour',quantity:5,reason:'Additional verified material shipment'
});
assert.equal(secondTransfer.code,200,JSON.stringify(secondTransfer.data));
assert.equal(flourAt('HQ').q,35000000);assert.equal(flourAt('HQ').v,1750000000000);
assert.equal(flourAt('HQ2').q,15000000);assert.equal(flourAt('HQ2').v,750000000000);
assert.equal(flourAt('HQ').v+flourAt('HQ2').v,openingValue.v);
const movementNet=db.prepare("SELECT COALESCE(SUM(CASE WHEN movement_type='transfer_in' THEN value_microkobo ELSE -value_microkobo END),0) AS net FROM bakery_material_valuation_events WHERE inventory_item_id='flour'").get().net;
assert.equal(movementNet,0,'Both sides of exact-value transfer must balance');
db.exec("INSERT INTO company_locations VALUES('HQ3','company-bakery',1)");
db.exec("INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('unvalued-flour','company-bakery','HQ3','flour',5)");
assert.equal((await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ3',toLocationId:'HQ2',itemId:'flour',quantity:1
})).code,409,'Unvalued source cannot contaminate financial inventory in destination');
const beforeFlourEvents=count("SELECT COUNT(*) AS n FROM bakery_material_valuation_events WHERE inventory_item_id='flour'");
beforeBatch=()=>db.prepare("UPDATE stock_balances SET quantity=quantity+1 WHERE location_id='HQ2' AND item_id='flour'").run();
const contested=await post(routeInventory,'/api/inventory/transfer',{
 companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'flour',quantity:2
});
assert.equal(contested.code,409,'Concurrently changed destination must reject and roll back valuation and stock');
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_material_valuation_events WHERE inventory_item_id='flour'"),beforeFlourEvents);
assert.equal(flourAt('HQ').v+flourAt('HQ2').v,openingValue.v);
db.prepare("UPDATE stock_balances SET quantity=quantity-1 WHERE location_id='HQ2' AND item_id='flour'").run();
// A legacy Bakery receipt / transfer must never race into an independently
// approved precision balance. Simulate a reviewer landing the valuation after
// the handler has read its initial state but before the batch starts.
db.exec("INSERT INTO inventory_items(id,company_id,unit,unit_cost_kobo,active,updated_at,sku,name) VALUES('race-item','company-bakery','kg',100,1,NULL,'RACE','Race material')");
db.exec("INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('race-source','company-bakery','HQ','race-item',8)");
const noRaceEvents=()=>count("SELECT COUNT(*) FROM stock_movements WHERE item_id='race-item'");
const noRaceStock=()=>db.prepare("SELECT quantity FROM stock_balances WHERE location_id='HQ' AND item_id='race-item'").get().quantity;
const addRaceValuation=locationId=>db.prepare(
 "INSERT INTO bakery_material_valuation_balances(id,company_id,location_id,inventory_item_id,remaining_quantity_micro,remaining_value_microkobo) VALUES(?,?,?,?,?,?)"
).run('race-valuation-'+locationId,'company-bakery',locationId,'race-item',locationId==='HQ'?8000000:0,locationId==='HQ'?800000000:0);
const raceReceive={companyId:'company-bakery',locationId:'HQ',itemId:'race-item',quantity:2,unitCostNaira:1};
beforeBatch=()=>addRaceValuation('HQ');
const raceReceipt=await post(routeInventory,'/api/inventory/receive',raceReceive);
assert.equal(raceReceipt.code,409,'Legacy receipt must reject newly approved valuation');
assert.equal(noRaceStock(),8,'Racing legacy receipt leaves the physical count intact');
assert.equal(noRaceEvents(),0,'Racing legacy receipt must not write stock movements');
assert.equal(db.prepare("SELECT remaining_quantity_micro AS q FROM bakery_material_valuation_balances WHERE inventory_item_id='race-item' AND location_id='HQ'").get().q,8000000);
db.prepare("DELETE FROM bakery_material_valuation_balances WHERE inventory_item_id='race-item'").run();
beforeBatch=()=>addRaceValuation('HQ');
const raceTransfer=await post(routeInventory,'/api/inventory/transfer',
 {companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'race-item',quantity:2});
assert.equal(raceTransfer.code,409,'Legacy transfer must reject newly approved source valuation');
assert.equal(noRaceStock(),8,'Racing legacy transfer must roll back the source debit');
assert.equal(noRaceEvents(),0,'Racing legacy transfer must not create movement records');
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE location_id='HQ2' AND item_id='race-item'").get(),undefined);
db.prepare("DELETE FROM bakery_material_valuation_balances WHERE inventory_item_id='race-item'").run();
beforeBatch=()=>addRaceValuation('HQ2');
const destRace=await post(routeInventory,'/api/inventory/transfer',
 {companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'race-item',quantity:2});
assert.equal(destRace.code,409,'Legacy transfer must reject newly approved destination valuation');
assert.equal(noRaceStock(),8,'Destination approval race rolls back source debit');
assert.equal(noRaceEvents(),0,'Destination approval race leaves no movements');
db.prepare("DELETE FROM bakery_material_valuation_balances WHERE inventory_item_id='race-item'").run();
const legacyTransfer=await post(routeInventory,'/api/inventory/transfer',
 {companyId:'company-bakery',fromLocationId:'HQ',toLocationId:'HQ2',itemId:'race-item',quantity:2});
assert.equal(legacyTransfer.code,200,JSON.stringify(legacyTransfer.data));
assert.equal(noRaceStock(),6);
assert.equal(noRaceEvents(),2);
const legacyReceipt=await post(routeInventory,'/api/inventory/receive',raceReceive);
assert.equal(legacyReceipt.code,200,JSON.stringify(legacyReceipt.data));
assert.equal(noRaceStock(),8);
assert.equal(noRaceEvents(),3);
// Production issues must not bypass a valuation approved while an older
// unvalued issue request is awaiting its atomic Inventory stock transaction.
db.exec("INSERT INTO bakery_recipe_ingredients(id,recipe_id,inventory_item_id,quantity,unit) VALUES('ri-race','recipe1','race-item',1,'kg')");
db.exec("INSERT INTO bakery_batches(id,company_id,location_id,recipe_id,product_id,status) VALUES('batch-race','company-bakery','HQ','recipe1','bread','mixing')");
const issueBefore=count("SELECT COUNT(*) FROM bakery_batch_ingredients WHERE batch_id='batch-race'");
const stockBeforeIssueRace=noRaceStock();
beforeBatch=()=>addRaceValuation('HQ');
const racedIngredient=await post(routeBakery,'/api/bakery/batches/ingredient',
 {batchId:'batch-race',inventoryItemId:'race-item',actualQuantity:1,wasteQuantity:0});
assert.equal(racedIngredient.code,409,'Legacy production issue cannot race an approved opening valuation');
assert.equal(noRaceStock(),stockBeforeIssueRace,'Racing legacy issue must roll back stock deduction');
assert.equal(count("SELECT COUNT(*) FROM bakery_batch_ingredients WHERE batch_id='batch-race'"),issueBefore,
 'Racing legacy issue must not create an ingredient cost line');
assert.equal(noRaceEvents(),3,'Racing legacy issue must not create an unvalued stock movement');
assert.equal(db.prepare("SELECT remaining_quantity_micro AS q FROM bakery_material_valuation_balances WHERE inventory_item_id='race-item' AND location_id='HQ'").get().q,8000000);

// Validate the real, read-only reconciliation API against SQLite, not mock
// fixture JSON. No accounting entries or physical stock may be changed.
db.exec("ALTER TABLE company_locations ADD COLUMN name TEXT");
db.exec("UPDATE company_locations SET name=id");
const deniedReconciliation=await get(routeInventory,'/api/inventory/bakery/reconciliation',
 {companies:[{id:'company-printing'}],employee:{id:'reviewer'}});
assert.equal(deniedReconciliation.code,403,'Other companies cannot view Bakery stock valuations');
assert.equal((await get(routeInventory,'/api/inventory/bakery/reconciliation?afterLocationId=HQ')).code,400,
 'Reconciliation pagination refuses incomplete cursor pairs');
const readReconciliation=()=>get(routeInventory,'/api/inventory/bakery/reconciliation');
const base=await readReconciliation();
assert.equal(base.code,200,JSON.stringify(base.data));
assert.equal(base.data.readOnly,true);
assert.equal(base.data.scope,'page_only','A limited response must not claim company-wide reconciliation');
const entry=(res,loc,item)=>res.data.entries.find(x=>x.locationId===loc&&x.itemId===item);
assert.equal(entry(base,'HQ','flour').status,'reconciled','Opened flour matches valued stock exactly');
assert.equal(entry(base,'HQ2','flour').status,'reconciled','Transferred flour matches precise carried value');
assert.equal(entry(base,'HQ3','flour').status,'unvalued_stock','Unvalued legacy flour is flagged without inventing cost');
assert.equal(entry(base,'HQ','sugar').status,'unvalued_stock','Unvalued sugar is visible for reconciliation');
assert(!base.data.entries.some(x=>x.itemId==='bread-item'),'Finished Bakery products do not appear in raw-material valuation');
db.prepare("UPDATE stock_balances SET quantity=quantity+1 WHERE location_id='HQ' AND item_id='flour'").run();
const countMismatch=await readReconciliation();
assert.equal(entry(countMismatch,'HQ','flour').status,'quantity_mismatch');
assert.equal(entry(countMismatch,'HQ','flour').quantityVarianceMicro,1000000,'Exactly one kg variance is retained');
db.prepare("UPDATE stock_balances SET quantity=quantity-1 WHERE location_id='HQ' AND item_id='flour'").run();
db.prepare("UPDATE stock_balances SET reserved_quantity=99 WHERE location_id='HQ' AND item_id='flour'").run();
assert.equal(entry(await readReconciliation(),'HQ','flour').status,'invalid_reservation');
db.prepare("UPDATE stock_balances SET reserved_quantity=0 WHERE location_id='HQ' AND item_id='flour'").run();

const currentFlourValue=flourAt('HQ').v;
db.prepare("UPDATE bakery_material_valuation_balances SET remaining_value_microkobo=remaining_value_microkobo+100 WHERE location_id='HQ' AND inventory_item_id='flour'").run();
const valueDrift=await readReconciliation();
assert.equal(entry(valueDrift,'HQ','flour').status,'valuation_event_mismatch',
 'Stock count parity cannot conceal altered monetary value');
assert.equal(entry(valueDrift,'HQ','flour').valueVarianceMicroKobo,100);
db.prepare("UPDATE bakery_material_valuation_balances SET remaining_value_microkobo=? WHERE location_id='HQ' AND inventory_item_id='flour'").run(currentFlourValue);
db.prepare("UPDATE inventory_items SET unit='g' WHERE id='flour'").run();
assert.equal(entry(await readReconciliation(),'HQ','flour').status,'opening_unit_changed',
 'Changing the Inventory base unit after opening must surface an exception');
db.prepare("UPDATE inventory_items SET unit='kg' WHERE id='flour'").run();
db.prepare("UPDATE inventory_items SET category_id='finished-ingredient' WHERE id='flour'").run();
assert.equal(entry(await readReconciliation(),'HQ','flour').status,'category_conflict',
 'Reclassifying valued raw material as finished goods cannot hide its financial balance');
db.prepare("UPDATE inventory_items SET category_id='raw-ingredient' WHERE id='flour'").run();
assert.equal(entry(await readReconciliation(),'HQ','flour').status,'reconciled');

db.exec("INSERT INTO inventory_items(id,company_id,unit,unit_cost_kobo,active,updated_at,sku,name,category_id) VALUES('orphan-material','company-bakery','kg',0,1,NULL,'ORPHAN','Orphan value','raw-ingredient')");
db.prepare("INSERT INTO bakery_material_valuation_balances(id,company_id,location_id,inventory_item_id,remaining_quantity_micro,remaining_value_microkobo) VALUES(?,?,?,?,?,?)")
 .run('orphan-balance','company-bakery','HQ','orphan-material',0,1234567);
assert.equal(entry(await readReconciliation(),'HQ','orphan-material').status,'orphan_value',
 'A remaining monetary value with no physical material must never be called reconciled');
db.exec("INSERT INTO inventory_items(id,company_id,unit,unit_cost_kobo,active,updated_at,sku,name,category_id) VALUES('finished-category-only','company-bakery','kg',0,1,NULL,'FINISHED','Finished category','finished-ingredient')");
db.exec("INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('finished-only-balance','company-bakery','HQ','finished-category-only',3)");
db.exec("INSERT INTO inventory_items(id,company_id,unit,unit_cost_kobo,active,updated_at,sku,name) VALUES('printing-material','company-printing','kg',0,1,NULL,'PRINTING','Printing material')");
db.exec("INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES('printing-material-balance','company-printing','OTHER','printing-material',2)");
const insertItem=db.prepare("INSERT INTO inventory_items(id,company_id,unit,unit_cost_kobo,active,updated_at,sku,name,category_id) VALUES(?,'company-bakery','kg',0,1,NULL,?,?, 'raw-ingredient')");
const insertStock=db.prepare("INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity) VALUES(?,'company-bakery','HQ',?,1)");
for(let j=0;j<105;j++){const item='page-material-'+String(j).padStart(3,'0');insertItem.run(item,item,item);insertStock.run('stock-'+item,item)}
const beforeReadStock=JSON.stringify(db.prepare("SELECT * FROM stock_balances ORDER BY location_id,item_id").all());
const beforeReadValue=JSON.stringify(db.prepare("SELECT * FROM bakery_material_valuation_balances ORDER BY location_id,inventory_item_id").all());
const beforeReadMovements=count("SELECT COUNT(*) AS n FROM stock_movements");
const beforeReadAudits=count("SELECT COUNT(*) AS n FROM audit_logs");
const firstPage=await readReconciliation();
assert.equal(firstPage.code,200,JSON.stringify(firstPage.data));
assert.equal(firstPage.data.returned,100,'Pagination limits each response to 100 material locations/items');
assert.equal(firstPage.data.hasMore,true);
assert(firstPage.data.nextCursor?.afterLocationId&&firstPage.data.nextCursor?.afterItemId);
const nextPage=await get(routeInventory,'/api/inventory/bakery/reconciliation?'+new URLSearchParams(firstPage.data.nextCursor));
assert.equal(nextPage.code,200,JSON.stringify(nextPage.data));
assert.equal(nextPage.data.hasMore,false);
const allEntries=[...firstPage.data.entries,...nextPage.data.entries];
const uniqueKeys=new Set(allEntries.map(x=>x.locationId+'/'+x.itemId));
assert.equal(uniqueKeys.size,allEntries.length,'Every paginated material location appears once');
assert(allEntries.some(x=>x.itemId==='page-material-104'),'Pagination reaches the final material');
assert(!allEntries.some(x=>x.itemId==='printing-material'),'Other company financial stock is never disclosed');
assert(!allEntries.some(x=>x.itemId==='finished-category-only'),'Categorized finished goods are never treated as raw material');
assert(!allEntries.some(x=>x.itemId==='bread-item'),'Bakery finished products are excluded');
assert.equal(JSON.stringify(db.prepare("SELECT * FROM stock_balances ORDER BY location_id,item_id").all()),beforeReadStock);
assert.equal(JSON.stringify(db.prepare("SELECT * FROM bakery_material_valuation_balances ORDER BY location_id,inventory_item_id").all()),beforeReadValue);
assert.equal(count("SELECT COUNT(*) AS n FROM stock_movements"),beforeReadMovements);
assert.equal(count("SELECT COUNT(*) AS n FROM audit_logs"),beforeReadAudits);
console.log('PASS real read-only material reconciliation: quantities, orphan value, reservations, permissions, finished goods and 100-row pagination');
db.close();
console.log('PASS real opening approval SQL: independently verified 50kg, ₦25,000; stale counts blocked; physical stock never duplicated');
console.log('PASS real exact-value transfer: approved flour opening value conserved across Bakery locations and disputed stock rolls back');
console.log('PASS real HTTP batch completion: precise ingredient value posts 100-kobo batch cost and 100 saleable loaves once');
console.log('PASS real Inventory + Bakery SQL: 1 carton ₦1 -> 1,000 grams -> 0.1 kobo per gram');
console.log('PASS conservation: exact total receipt cost, each production issue, final stock value, and movements');
console.log('PASS transaction rollback: stale stock or valuation cannot create a phantom material issue');
