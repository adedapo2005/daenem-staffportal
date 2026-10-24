// Run the real Bakery HTTP route handler against read-only fake D1 preflight.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../worker/bakery.ts',import.meta.url),'utf8');
const unitsSource=fs.readFileSync(new URL('../worker/bakery-material-units.ts',import.meta.url),'utf8');
const unitsOut=ts.transpileModule(unitsSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const unitsModule={exports:{}};
const unitsFn=new vm.Script('(function(require,module,exports){'+unitsOut+'\n})').runInNewContext({Request,Response,URL,crypto:webcrypto,TextEncoder,TextDecoder,Intl});
unitsFn(name=>{assert.equal(name,'./auth');return{hasPermission:()=>true}},unitsModule,unitsModule.exports);
const output=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const mod={exports:{}};
const sandbox=vm.createContext({Request,Response,URL,crypto:webcrypto,TextEncoder,TextDecoder,console,Intl});
const fn=new vm.Script('(function(require,module,exports){'+output+'\n})',{filename:'real-worker-bakery.ts'}).runInContext(sandbox);
fn(name=>name==='./auth'?{hasPermission:()=>true}:name==='./bakery-material-units'?unitsModule.exports:null,mod,mod.exports);
const route=mod.exports.routeBakery;
assert.equal(typeof route,'function');
const context={companies:[{id:'company-bakery'}],employee:{id:'worker-test'},roles:[],permissions:{}};
let dbCalls=0;
const guardedDb={DB:{prepare(){dbCalls++;throw Error('Unexpected D1 access for invalid input');}}};
async function post(path,body,env=guardedDb){
 const request=new Request('https://test.invalid'+path,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const response=await route(request,env,context);
 assert(response instanceof Response);
 return {status:response.status,body:await response.json()};
}
for(const payload of [
 {actualQuantity:-4,wasteQuantity:5},
 {actualQuantity:3,wasteQuantity:-1},
 {actualQuantity:'3',wasteQuantity:1},
 {actualQuantity:null,wasteQuantity:1},
 {actualQuantity:0,wasteQuantity:0},
 {actualQuantity:1e309,wasteQuantity:0},
 {actualQuantity:2,wasteQuantity:1e309}
]){
 const result=await post('/api/bakery/batches/ingredient',{batchId:'batch-id',inventoryItemId:'flour',...payload});
 assert.equal(result.status,400,'invalid ingredient input must fail before D1');
 assert(/quantit/i.test(result.body.error||''));
}
assert.equal(dbCalls,0);
function missingLocationEnv(){
 let mutations=0;
 const DB={
  prepare(sql){
   assert(sql.includes('company_locations')&&sql.includes('company_id=?')&&sql.includes('active=1'),'must check active company-scoped location before any other query');
   return {bind(){return this},async first(){return null}};
  },
  async batch(){mutations++;throw Error('No writes permitted');}
 };
 return {DB,get mutations(){return mutations}};
}
for(const [routePath,data] of [
 ['/api/bakery/batches',{recipeId:'r1',locationId:'other-company-location'}],
 ['/api/bakery/pos/sale',{items:[{productId:'p1',quantity:1}],orderType:'walk_in',
   locationId:'other-company-location',amountPaidNaira:1100,cashReceivedConfirmed:true}]
]){
 const fake=missingLocationEnv();
 const result=await post(routePath,data,fake);
 assert.equal(result.status,404,'wrong-company location must fail before creating a transaction');
 assert.equal(fake.mutations,0);
}
let batchWrites=0;
const batchGuardEnv={DB:{prepare(sql){
 assert(sql.includes('FROM bakery_batches bb')&&sql.includes('company_locations'),'Expected company-scoped batch lookup');
 return {bind(){return this},async first(){return {id:'batch-1',status:'packaging',product_id:'p1',recipe_id:'r1',location_id:'office'}}};
},async batch(){batchWrites++;throw Error('No writes for invalid production totals');}}};
for(const bad of [
 {actualYieldQty:100,wasteQty:-2,rejectedQty:0},
 {actualYieldQty:100,wasteQty:0,rejectedQty:-4},
 {actualYieldQty:-5,wasteQty:5,rejectedQty:0},
 {actualYieldQty:4.5,wasteQty:0,rejectedQty:0}
]){
 const res=await post('/api/bakery/batches/status',{batchId:'batch-1',status:'completed',...bad},batchGuardEnv);
 assert.equal(res.status,400,'Invalid completion count must be rejected');
}
const early=await post('/api/bakery/batches/status',{batchId:'batch-1',status:'mixing',wasteQty:-3},batchGuardEnv);
assert.equal(early.status,400,'Non-completion stage cannot alter counters');
assert.equal(batchWrites,0,'Invalid production count must never post stock');
console.log('PASS real Bakery HTTP route: negative/wrong production counts and premature quantity changes reject before D1 writes');
console.log('PASS real Bakery HTTP route: invalid ingredient quantities fail before any D1 call');
console.log('PASS real Bakery HTTP route: wrong-company/inactive production and POS locations fail before writes');
