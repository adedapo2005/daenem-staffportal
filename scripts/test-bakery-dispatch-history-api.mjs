// Read-only authenticated Bakery dispatch history acceptance.
// Execute the REAL worker module + SQL against isolated in-memory SQLite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';

const file=fs.readFileSync(new URL('../worker/bakery-dispatch-history-integrity.ts',import.meta.url),'utf8');
const fullScan=fs.readFileSync(new URL('./bakery-dispatch-history-readonly.sql',import.meta.url),'utf8');
const js=ts.transpileModule(file,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const module={exports:{}};
new vm.Script('(function(require,module,exports){'+js+'\n})').runInNewContext({URL,Request,Response,console})(
 name=>name==='./auth'?{hasPermission:(ctx,permission,level,company)=>
   company==='company-bakery'&&ctx.grants.includes(permission+':'+level)}:
 (()=>{throw Error('Unexpected module: '+name)})(),
 module,module.exports
);
const route=module.exports.routeBakeryDispatchHistoryIntegrity;
assert.equal(typeof route,'function');
const db=new DatabaseSync(':memory:');
db.exec(`
 CREATE TABLE bakery_dispatches(id TEXT PRIMARY KEY,company_id TEXT,status TEXT,location_id TEXT);
 CREATE TABLE bakery_dispatch_items(dispatch_id TEXT,product_id TEXT,quantity REAL);
 CREATE TABLE bakery_products(id TEXT,company_id TEXT,inventory_item_id TEXT);
 CREATE TABLE stock_movements(id TEXT,company_id TEXT,reference_type TEXT,
  reference_id TEXT,movement_type TEXT,item_id TEXT,from_location_id TEXT,quantity REAL);
 CREATE TABLE audit_logs(company_id TEXT,entity_id TEXT,module TEXT,action TEXT,
  entity_type TEXT,source TEXT);
 INSERT INTO bakery_products VALUES('bread','company-bakery','inv-bread');
`);
const addDispatch=db.prepare('INSERT INTO bakery_dispatches VALUES(?,?,?,?)');
const addItem=db.prepare('INSERT INTO bakery_dispatch_items VALUES(?,?,?)');
const addMove=db.prepare('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?,?)');
const addAudit=db.prepare('INSERT INTO audit_logs VALUES(?,?,?,?,?,?)');
for(let i=1;i<=52;i++){
 const id='qa-'+String(i).padStart(2,'0');
 addDispatch.run(id,'company-bakery','closed','bakery-hq');
 addItem.run(id,'bread',2);
 if(i!==1)addMove.run('stock-'+id,'company-bakery',
  'bakery_dispatch',id,'transfer_out','inv-bread',
  i===3?'other-location':'bakery-hq',2);
 if(i!==1&&i!==51){
  addAudit.run('company-bakery',id,'bakery','issue_dispatch','bakery_dispatch','database');
  addAudit.run('company-bakery',id,'bakery','close_reconciliation','bakery_dispatch','database');
 }
}
addDispatch.run('foreign-only','company-printing','closed','other-location');
addItem.run('foreign-only','bread',4);
const env={DB:{prepare(sql){return {bind(...args){return{
 async all(){return{results:db.prepare(sql).all(...args)}}
}}}}}};
const ok={companies:[{id:'company-bakery'}],grants:[
 'bakery.reconciliation:view','finance.ledger:view']};
const noFinance={...ok,grants:['bakery.reconciliation:view']};
const noBakery={...ok,grants:['finance.ledger:view']};
const noCompany={...ok,companies:[{id:'company-printing'}]};
const url='https://example.invalid/api/bakery/accountability/dispatch-history-integrity';
const request=(query='',method='GET')=>new Request(url+query,{method});
const before=db.prepare('SELECT total_changes() AS changed').get().changed;
for(const context of [noFinance,noBakery,noCompany]){
 const response=await route(request(),env,context);
 assert.equal(response.status,403,'Missing company or either permission must fail closed');
}
for(const query of ['?companyId=company-printing','?limit=1000',
 '?afterDispatchId=qa-1&afterDispatchId=qa-2','?afterDispatchId=%3D%27%3B']){
 const response=await route(request(query),env,ok);
 assert.equal(response.status,400,'Company picker, invalid and duplicate cursors are forbidden');
}
assert.equal(await route(request('','POST'),env,ok),null,
 'No non-read-only method is handled by the evidence endpoint');
const firstResponse=await route(request(),env,ok);
assert.equal(firstResponse.status,200);
assert.equal(firstResponse.headers.get('cache-control'),'no-store');
const first=await firstResponse.json();
assert.equal(first.readOnly,true);
assert.equal(first.settlementAssessed,false);
assert.equal(first.companyScope,'permission-derived');
assert.equal(first.scannedDispatches,50);
assert.equal(first.hasMore,true);
assert.equal(first.nextAfterDispatchId,'qa-50');
assert(first.issues.every(x=>x.dispatch_id<='qa-50'));
const flags=(items,id)=>new Set(items.filter(x=>x.dispatch_id===id).map(x=>x.issue_code));
assert(flags(first.issues,'qa-01').has('DISPATCH_STOCK_QUANTITY_MISMATCH'));
assert(flags(first.issues,'qa-01').has('CLOSED_WITHOUT_DATABASE_AUDIT_REVIEW'));
assert(flags(first.issues,'qa-03').has('UNEXPECTED_DISPATCH_STOCK_MOVEMENT'));
assert.equal(flags(first.issues,'qa-02').size,0);
const secondResponse=await route(request('?afterDispatchId='+first.nextAfterDispatchId),env,ok);
assert.equal(secondResponse.status,200);
const second=await secondResponse.json();
assert.equal(second.scannedDispatches,2);
assert.equal(second.hasMore,false);
assert.equal(second.nextAfterDispatchId,null);
assert(flags(second.issues,'qa-51').has('ISSUED_WITHOUT_DATABASE_AUDIT_REVIEW'));
assert.equal(flags(second.issues,'foreign-only').size,0);
const empty=await (await route(request('?afterDispatchId=qa-99'),env,ok)).json();
assert.equal(empty.scannedDispatches,0);
assert.deepEqual(empty.issues,[]);
assert.equal(empty.hasMore,false);
assert.equal(db.prepare('SELECT total_changes() AS changed').get().changed,before,
 'Reading a report cannot change any money, stock or audit record');

// The endpoint and the standalone full SQL release scan must agree on the
// same dispatches and issue codes. Orphans are only in the full release scan.
const full=db.prepare(fullScan).all();
const expected=full.filter(x=>x.dispatch_id.startsWith('qa-'))
 .map(x=>[x.dispatch_id,x.issue_code,x.inventory_item_id,x.expected_quantity,x.recorded_quantity])
 .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const actual=[...first.issues,...second.issues]
 .map(x=>[x.dispatch_id,x.issue_code,x.inventory_item_id,x.expected_quantity,x.recorded_quantity])
 .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
assert.deepEqual(actual,expected,'API discrepancies must match the read-only release SQL exactly');
db.close();
console.log('PASS Bakery history API: permissions, no company picker, keyset pagination 50+2, no writes');
console.log('PASS Bakery history API: issue codes and amounts match independently maintained full release SQL');
