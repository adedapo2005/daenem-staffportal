// Read-only execution of the real shared Inventory receipt endpoint with Bakery conversions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';

const units=fs.readFileSync(new URL('../worker/bakery-material-units.ts',import.meta.url),'utf8');
const inventory=fs.readFileSync(new URL('../worker/inventory.ts',import.meta.url),'utf8');
const valuation=fs.readFileSync(new URL('../worker/bakery-material-valuation.ts',import.meta.url),'utf8');
const runModule=(source,resolver)=>{
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const obj={exports:{}};
 new vm.Script('(function(require,module,exports){'+compiled+'\n})').runInNewContext({Request,Response,URL,crypto:webcrypto,Intl,console})(resolver,obj,obj.exports);
 return obj.exports;
};
const fakeAuth={hasPermission:()=>true};
const unitService=runModule(units,name=>{assert.equal(name,'./auth');return fakeAuth});
const valuationService=runModule(valuation,()=>{throw Error('Valuation helper has no imports')});
const {routeInventory}=runModule(inventory,name=>name==='./auth'?fakeAuth:name==='./bakery-material-units'?unitService:name==='./bakery-material-valuation'?valuationService:null);
assert.equal(typeof routeInventory,'function');
const context={companies:[{id:'company-bakery'},{id:'company-printing'}],employee:{id:'employee-stock'}};
let posted=[];
function envFor(factor,baseUnit='kg',company='company-bakery'){
 return {DB:{
  prepare(query){
   return{bind(...params){
    return {query,params,async first(){
     if(query.includes('FROM company_locations'))return {id:'bakery-hq'};
     if(query.includes('FROM inventory_items'))return {id:'flour',unit:baseUnit,unitCostKobo:85000};
     if(query.includes('FROM bakery_material_unit_rules'))return factor===null?null:{id:'rule-v1',fromUnit:'bag',inventoryUnit:baseUnit,factor,versionNo:1};
     if(query.includes('FROM bakery_material_valuation_balances'))return null;
     if(query.includes('FROM stock_balances'))return {quantity:1};
     throw Error('Unexpected D1 read: '+query.slice(0,100));
    }};
   }};
  },
  async batch(statements){posted=statements;return statements.map(x=>({success:true}))}
 }};
}
async function receipt(body,env){
 posted=[];
 const res=await routeInventory(new Request('https://test.invalid/api/inventory/receive',{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,context);
 assert(res instanceof Response);
 return{status:res.status,json:await res.json(),posted};
}
const request={companyId:'company-bakery',locationId:'bakery-hq',itemId:'flour',quantity:2,receivedUnit:'bag',
 purchaseUnitCostNaira:45000,supplierId:'supplier-1',supplierReference:'INV-1234'};
let r=await receipt(request,envFor(50));
assert.equal(r.status,200,JSON.stringify(r.json));
assert.equal(r.json.baseQuantity,100);
assert.equal(r.json.conversion.ruleId,'rule-v1');
assert.equal(r.json.conversion.totalCostKobo,9000000);
assert.equal(r.posted.length,4);
const upsert=r.posted[0],price=r.posted[1],movement=r.posted[2],audit=r.posted[3];
assert.equal(upsert.params.at(-1),100,'Shared Inventory receives 100kg, not two inventory units');
assert.equal(price.params[0],90000,'45000 naira/bag divided by 50kg is 90000 kobo/kg');
assert.equal(movement.params[3],100);
const movementProof=JSON.parse(movement.params.at(-1));
assert.equal(movementProof.conversion.factor,50);
assert.equal(movementProof.conversion.inputQuantity,2);
assert.equal(movementProof.conversion.totalCostKobo,9000000);
assert.equal(movementProof.baseQuantity,100);
assert.equal(JSON.parse(audit.params.at(-1)).baseQuantity,100);
assert.equal((await receipt(request,envFor(null))).status,409,'Unapproved conversion cannot receive stock');
assert.equal((await receipt({...request,purchaseUnitCostNaira:undefined},envFor(50))).status,400,'Converted receipt requires supplier unit cost');
assert.equal((await receipt({...request,unitCostNaira:45000},envFor(50))).status,400,'Ambiguous cost units are blocked');
assert.equal((await receipt({...request,purchaseUnitCostNaira:-1},envFor(50))).status,400,'Negative cost cannot be accepted');
assert.equal((await receipt({...request,purchaseUnitCostNaira:45.001},envFor(50))).status,400,'Sub-kobo purchase unit cost blocked');
assert.equal((await receipt({...request,quantity:0.000000001},envFor(50))).status,400,'Unrepresentable quantity blocked');
const carton={...request,quantity:1,receivedUnit:'carton',purchaseUnitCostNaira:1};
assert.equal((await receipt(carton,envFor(1000,'g'))).status,409,'An unvalued opening balance cannot be combined with a fractional-cost receipt');
assert.equal((await receipt({...request,receivedUnit:'kg',purchaseUnitCostNaira:45000},envFor(50))).status,400,'No separate price field in base units');
const plain={...request,quantity:20,receivedUnit:'kg',purchaseUnitCostNaira:undefined,unitCostNaira:900};
r=await receipt(plain,envFor(50));
assert.equal(r.status,200,'Legacy base-unit Inventory receipt remains functional');
assert.equal(r.json.baseQuantity,20);
assert.equal(r.json.conversion,null);
console.log('PASS existing Inventory receipt: approved bag-to-kg conversion, exact cost and immutable movement metadata');
console.log('PASS fail-closed receipt safeguards: unauthorized units, fractional-kobo prices, precision, missing approval and ambiguous cost');
