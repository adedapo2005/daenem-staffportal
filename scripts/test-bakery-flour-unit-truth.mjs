// Real Bakery accountability report calculations and configured unit rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
const worker=fs.readFileSync(new URL('../worker/bakery-accountability.ts',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/bakery-v2.tsx',import.meta.url),'utf8');
assert(worker.includes('f.bag_weight_kg AS bagWeightKg'),'Flour query must not invent a 50 kg bag');
assert(!worker.includes('COALESCE(f.bag_weight_kg,50)'),'Unconfigured bag weight must remain unknown');
const start=worker.indexOf('const flourUsage=(flour.results||[]).map(row=>');
const end=worker.indexOf(';\n const breadRows=',start);
assert(start>0&&end>start,'Cannot identify actual flour report mapper');
const mapperSource='const mapper=(flour)=>{'+worker.slice(start,end+1)+'return flourUsage;};';
const mapper=vm.runInNewContext(ts.transpileModule(mapperSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';mapper');
const rows=[
 {name:'Flour kg without verified bag weight',unit:'kg',bagWeightKg:null,usedQuantity:100,wasteQuantity:10,plannedQuantity:120},
 {name:'Flour kg with approved 25kg bags',unit:'kg',bagWeightKg:25,usedQuantity:100,wasteQuantity:5,plannedQuantity:110},
 {name:'Flour bought and consumed in bags',unit:'bag',bagWeightKg:null,usedQuantity:8,wasteQuantity:1,plannedQuantity:10},
 {name:'Flour recorded in grams',unit:'g',bagWeightKg:null,usedQuantity:1000,wasteQuantity:50,plannedQuantity:1200}
];
const mapped=mapper({results:rows});
assert.equal(mapped[0].usedBags,null);
assert.equal(mapped[0].wasteBags,null);
assert.equal(mapped[0].conversionStatus,'unverified');
assert.equal(mapped[1].usedBags,4);
assert.equal(mapped[1].wasteBags,.2);
assert.equal(mapped[1].bagWeightKg,25);
assert.equal(mapped[1].conversionStatus,'configured_kg');
assert.equal(mapped[2].usedBags,8);
assert.equal(mapped[2].wasteBags,1);
assert.equal(mapped[2].conversionStatus,'native_bags');
assert.equal(mapped[3].usedBags,null);
assert.equal(mapped[3].conversionStatus,'unverified');
assert(ui.includes('Bag equivalent unavailable')&&ui.includes('current setting'),'UI must reveal unverified and current conversions');

const js=ts.transpileModule(worker,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const out={exports:{}};
new vm.Script('(function(require,module,exports){'+js+'\n})').runInNewContext({Request,Response,URL,crypto:webcrypto,Intl,TextEncoder,TextDecoder,console})(
 name=>{assert.equal(name,'./auth');return {hasPermission:()=>true}},out,out.exports
);
const route=out.exports.routeBakeryAccountability;
assert.equal(typeof route,'function');
const context={companies:[{id:'company-bakery'}],employee:{id:'manager-test'}};
let writes=0,reads=0;
function env(unit){
 return {DB:{prepare(sql){
  return{bind(){return this},async first(){
   reads++;
   assert(sql.includes('FROM inventory_items')&&sql.includes('unit'),'Flour item unit must be read before saving conversion');
   return{id:'flour',name:'Flour',unit};
  }};
 },async batch(statements){writes++;assert.equal(statements.length,2);return statements;}}};
}
async function send(value,unit){
 const res=await route(new Request('https://test.invalid/api/bakery/accountability/flour-bag',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({inventoryItemId:'flour',bagWeightKg:value})}),env(unit),context);
 return{code:res.status,body:await res.json()};
}
assert.equal((await send('50','kg')).code,400,'String conversion not accepted as certified number');
assert.equal((await send(-1,'kg')).code,400);
assert.equal((await send(0,'kg')).code,400);
assert.equal((await send(1200,'kg')).code,400);
assert.equal(reads,0);
assert.equal((await send(50,'bag')).code,409,'Cannot attach kg-per-bag conversion to inventory tracked in bags');
assert.equal((await send(50,'g')).code,409,'Cannot attach kg-per-bag conversion to gram inventory');
assert.equal(writes,0);
assert.equal((await send(50,'kg')).code,200);
assert.equal(writes,1);
console.log('PASS Flour report: configured kg, native bags and unverified grams/weights never invent bag counts');
console.log('PASS Flour conversion endpoint: only kg-based inventory and finite approved bag weights, otherwise no writes');
