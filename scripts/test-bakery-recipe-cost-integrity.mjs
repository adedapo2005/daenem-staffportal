// Actual Bakery route plus exact critical-ingredient SQL, executed only in-memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../worker/bakery.ts',import.meta.url),'utf8');
const transpiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};
new vm.Script('(function(require,module,exports){'+transpiled+'\n})').runInNewContext({Request,Response,URL,crypto:webcrypto,TextDecoder,TextEncoder,Intl})(
 name=>{assert.equal(name,'./auth');return {hasPermission:()=>true}},m,m.exports
);
const route=m.exports.routeBakery,ctx={companies:[{id:'company-bakery'}],employee:{id:'employee-test'}};
let batches=0;
function makeEnv(units={inventory:'kg',recipe:'kg'},missing=0){
 return {DB:{prepare(sql){
  return {bind(){return this},async first(){
   if(sql.includes('FROM bakery_products'))return {id:'bread'};
   if(sql.includes('MAX(version_no)'))return {version:2};
   if(sql.includes('FROM inventory_items'))return {id:'flour',unit:units.inventory,unitCostKobo:400,availableQty:100};
   if(sql.includes('FROM bakery_batches bb'))return {id:'batch-1',status:'packaging',recipeId:'recipe-1',locationId:'hq',product_id:'bread',actual_yield_qty:0};
   if(sql.includes('FROM bakery_batches ')||sql.includes('FROM bakery_batches WHERE'))return {id:'batch-1',status:'mixing',recipeId:'recipe-1',locationId:'hq'};
   if(sql.includes('FROM bakery_recipe_ingredients')&&sql.includes('inventory_item_id=?'))return {quantity:3,unit:units.recipe};
   if(sql.includes('JOIN inventory_items i ON i.id=bri.inventory_item_id'))return {ingredientCount:units.empty?0:1,invalidUnitCount:units.inventory===units.recipe?0:1};
   if(sql.includes('NOT EXISTS (SELECT 1 FROM bakery_batch_ingredients'))return {count:missing};
   if(sql.includes('FROM app_settings'))return null;
   throw Error('Unexpected SQL: '+sql.slice(0,130));
  }};
 },async batch(statements){batches++;return statements;}}};
}
async function post(path,body,env){
 const res=await route(new Request('https://test.invalid'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,ctx);
 return {status:res.status,body:await res.json()};
}
const routeRecipe='/api/bakery/recipes';
const valid={productId:'bread',name:'700g Bread',batchYieldQty:200,ingredients:[{inventoryItemId:'flour',quantity:20,unit:'kg'}]};
for(const [payload,status] of [
 [{...valid,ingredients:[]},400],
 [{...valid,ingredients:[{inventoryItemId:'flour',quantity:-2,unit:'kg'}]},400],
 [{...valid,ingredients:[{inventoryItemId:'flour',quantity:0,unit:'kg'}]},400],
 [{...valid,ingredients:[{inventoryItemId:'flour',quantity:20,unit:'bag'}]},409],
 [{...valid,ingredients:[{inventoryItemId:'flour',quantity:20,unit:'kg'},{inventoryItemId:'flour',quantity:2,unit:'kg'}]},400],
 [{...valid,labourCostNaira:-500},400],
 [{...valid,packagingCostNaira:2.009},400],
 [{...valid,ingredients:[{inventoryItemId:'flour',quantity:20,unit:'kg',expectedWastePct:-1}]},400],
 [{...valid,ingredients:[{inventoryItemId:'flour',quantity:20,unit:'kg',expectedWastePct:101}]},400],
]){
 const n=batches,res=await post(routeRecipe,payload,makeEnv());
 assert.equal(res.status,status,JSON.stringify(payload));
 assert.equal(batches,n,'Invalid recipe must not be written');
}
const good=await post(routeRecipe,valid,makeEnv());
assert.equal(good.status,201,'Valid base-unit recipe must still work');
assert.equal(batches,1,'Valid recipe should be recorded in one D1 batch');
const issue=await post('/api/bakery/batches/ingredient',
 {batchId:'batch-1',inventoryItemId:'flour',actualQuantity:2,wasteQuantity:0},
 makeEnv({inventory:'kg',recipe:'bag'}));
assert.equal(issue.status,409,'Historic unmatched recipe/inventory units must block ingredient issue');
const complete={batchId:'batch-1',status:'completed',actualYieldQty:100,wasteQty:0,rejectedQty:0};
const wrongUnit=await post('/api/bakery/batches/status',complete,makeEnv({inventory:'kg',recipe:'bag'}));
assert.equal(wrongUnit.status,409);
const noRecipeIngredients=await post('/api/bakery/batches/status',complete,makeEnv({inventory:'kg',recipe:'kg',empty:true}));assert.equal(noRecipeIngredients.status,409,'Legacy empty recipe must never complete');
const missingCritical=await post('/api/bakery/batches/status',complete,makeEnv({inventory:'kg',recipe:'kg'},1));
assert.equal(missingCritical.status,409,'Unissued critical ingredient must block completion');
assert.equal(batches,1,'Blocked batch completion must not post finished stock');

function extractSql(marker){
 const i=source.indexOf(marker),tick=String.fromCharCode(96);
 assert(i>=0,marker);return source.slice(source.lastIndexOf(tick,i)+1,source.indexOf(tick,i));
}
const critical=extractSql('SELECT COUNT(*) AS count FROM bakery_recipe_ingredients ri WHERE ri.recipe_id=? AND ri.critical=1 AND NOT EXISTS');
const mismatched=extractSql('SELECT COUNT(*) AS ingredientCount,COALESCE(SUM(CASE WHEN');
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE bakery_recipe_ingredients(recipe_id TEXT,inventory_item_id TEXT,critical INTEGER,unit TEXT);');
db.exec('CREATE TABLE bakery_batch_ingredients(batch_id TEXT,inventory_item_id TEXT,actual_quantity REAL,waste_quantity REAL);');
db.exec('CREATE TABLE inventory_items(id TEXT,unit TEXT);');
db.exec("INSERT INTO inventory_items VALUES ('flour','kg'),('sugar','kg');");
db.exec("INSERT INTO bakery_recipe_ingredients VALUES ('recipe-1','flour',1,'kg');");
db.exec("INSERT INTO bakery_batch_ingredients VALUES ('batch-1','sugar',5,0);");
const count=()=>db.prepare(critical).get('recipe-1','batch-1').count;
assert.equal(count(),1,'Unrelated ingredient must not satisfy flour requirement');
db.exec("INSERT INTO bakery_batch_ingredients VALUES ('batch-1','flour',0,2);");
assert.equal(count(),1,'Wasted ingredient with zero actual use must not satisfy critical requirement');
db.exec("INSERT INTO bakery_batch_ingredients VALUES ('batch-1','flour',4,0);");
assert.equal(count(),0,'Recorded critical flour use must satisfy requirement');
db.exec("UPDATE bakery_recipe_ingredients SET unit='bag' WHERE inventory_item_id='flour';");
assert.equal(db.prepare(mismatched).get('recipe-1').invalidUnitCount,1,'Legacy mismatched units must be flagged');
db.exec("DELETE FROM bakery_recipe_ingredients WHERE recipe_id='recipe-1';");
assert.equal(db.prepare(mismatched).get('recipe-1').ingredientCount,0,'Legacy empty recipes must be detectable');
db.close();
console.log('PASS Bakery recipe API: invalid/duplicate/mismatched ingredients and negative costs reject without writes');
console.log('PASS Bakery batch/issue API: legacy unit mismatch and missing critical inputs fail closed');
console.log('PASS actual SQL: sugar cannot substitute for flour, waste alone does not count, wrong units blocked');
