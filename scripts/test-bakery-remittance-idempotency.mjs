// Bakery remittance idempotency: execute the REAL handler and migration
// against isolated in-memory SQLite; never touch Cloudflare D1 or bank systems.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const source=fs.readFileSync(new URL('../worker/bakery-accountability.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0110_bakery_remittance_idempotency.sql',import.meta.url),'utf8');
const load=name=>{
 if(name==='./auth')return {hasPermission:(ctx,perm,level,company)=>
   company==='company-bakery'&&ctx.grants?.includes(perm+':'+level)===true};
 if(name==='./bakery-material-units')return {routeBakeryMaterialUnits:async()=>null};
 if(name==='./bakery-dispatch-history-integrity')return {routeBakeryDispatchHistoryIntegrity:async()=>null};
 if(name==='./bakery-finance-bridge')return {
   routeBakeryFinanceBridge:async()=>null,routeBakeryDispatchFinanceBridge:async()=>null
 };
 throw new Error('Unexpected module '+name);
};
const js=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const module={exports:{}};
new vm.Script('(function(require,module,exports){'+js+'\n})').runInNewContext({
 Request,Response,URL,crypto:webcrypto,console,TextEncoder,TextDecoder,Intl
})(load,module,module.exports);
const route=module.exports.routeBakeryAccountability;
assert.equal(typeof route,'function');

const db=new DatabaseSync(':memory:');
db.exec(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE companies(id TEXT PRIMARY KEY);
 CREATE TABLE employees(id TEXT PRIMARY KEY);
 CREATE TABLE bakery_dispatches(
  id TEXT PRIMARY KEY,company_id TEXT REFERENCES companies(id),
  custodian_id TEXT NOT NULL,status TEXT NOT NULL);
 CREATE TABLE bakery_money_ledger(
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),
  business_date TEXT NOT NULL,dispatch_id TEXT REFERENCES bakery_dispatches(id),
  custodian_id TEXT,status TEXT NOT NULL,amount_kobo INTEGER NOT NULL CHECK(amount_kobo>0),
  direction TEXT NOT NULL,reference TEXT,reason TEXT,recorded_by TEXT REFERENCES employees(id));
 CREATE TABLE audit_logs(
  id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,
  module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,
  after_json TEXT,source TEXT);
 INSERT INTO companies VALUES('company-bakery'),('company-printing');
 INSERT INTO employees VALUES('staff-1');
 INSERT INTO bakery_dispatches VALUES
  ('dispatch-1','company-bakery','agent-1','reconciling'),
  ('dispatch-2','company-bakery','agent-2','received'),
  ('dispatch-closed','company-bakery','agent-1','closed'),
  ('dispatch-race','company-bakery','agent-1','reconciling'),
  ('dispatch-legacy','company-bakery','agent-1','reconciling'),
  ('dispatch-foreign','company-printing','agent-1','reconciling');
 INSERT INTO bakery_money_ledger VALUES
  ('legacy-1','company-bakery','2026-10-24','dispatch-legacy','agent-1',
   'cash_received',1200,'in','OLD-SAME','Legacy cash','staff-1'),
  ('legacy-2','company-bakery','2026-10-24','dispatch-legacy','agent-1',
   'cash_received',1200,'in','old-same','Legacy cash','staff-1');
`);
const oldMoney=db.prepare("SELECT COUNT(*) AS n FROM bakery_money_ledger").get().n;
db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bakery_money_ledger").get().n,oldMoney,
 'Migration must preserve every historical financial entry, including duplicates');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name='bakery_dispatch_money_unique_reference'").get().n,1);
let beforeBatch=null;
const env={DB:{
 prepare(sql){return{bind(...args){return{
  sql,params:args,
  async first(){return db.prepare(sql).get(...args)},
  async all(){return{results:db.prepare(sql).all(...args)}},
  async run(){return db.prepare(sql).run(...args)}
 }}}},
 async batch(statements){
  if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook()}
  db.exec('BEGIN IMMEDIATE');
  try{const results=statements.map(stmt=>db.prepare(stmt.sql).run(...stmt.params));
   db.exec('COMMIT');return results}
  catch(error){db.exec('ROLLBACK');throw error}
 }
}};
const owner={companies:[{id:'company-bakery'}],employee:{id:'staff-1'},
 grants:['bakery.remittance:edit','bakery.remittance:approve']};
const noApprove={...owner,grants:['bakery.remittance:edit']};
const noMoneyAccess={...owner,grants:[]};
const foreign={...owner,companies:[{id:'company-printing'}]};
const moneyCount=()=>db.prepare("SELECT COUNT(*) AS n FROM bakery_money_ledger").get().n;
const claimCount=()=>db.prepare("SELECT COUNT(*) AS n FROM bakery_remittance_requests").get().n;
const auditCount=()=>db.prepare("SELECT COUNT(*) AS n FROM audit_logs").get().n;
const path='/api/bakery/accountability/money';
async function post(body,{who=owner,key=null}={}){
 const headers={'content-type':'application/json'};
 if(key)headers['idempotency-key']=key;
 const response=await route(new Request('https://test.invalid'+path,
  {method:'POST',headers,body:JSON.stringify(body)}),env,who);
 assert(response instanceof Response);
 return{code:response.status,body:await response.json()};
}
const cash=(reference='CASH-0001',amountNaira=125.35,dispatchId='dispatch-1')=>({
 dispatchId,status:'cash_received',amountNaira,reference,
 reason:'Cash counted and signed',cashReceivedConfirmed:true
});
const beforeUnauthorized=moneyCount();
assert.equal((await post(cash(),{who:foreign})).code,403);
assert.equal((await post(cash(),{who:noMoneyAccess})).code,403);
assert.equal((await post({...cash(),cashReceivedConfirmed:false})).code,400);
assert.equal((await post({...cash(),status:'transfer_received'})).code,409);
assert.equal((await post({...cash(),status:'pos_received'})).code,409);
assert.equal(moneyCount(),beforeUnauthorized,'Denied operations must never write money');

const legacy=await post(cash('OLD-SAME',12,'dispatch-legacy'));
assert.equal(legacy.code,409,'Historical duplicate receipts need investigation, not automated acknowledgement');
assert.equal(moneyCount(),beforeUnauthorized);
const first=await post(cash());
assert.equal(first.code,201,JSON.stringify(first.body));
assert.equal(first.body.idempotencyProtected,true);
assert.equal(first.body.duplicate,false);
assert.equal(moneyCount(),beforeUnauthorized+1);
assert.equal(claimCount(),1);
assert.equal(auditCount(),1);
const retry=await post(cash());
assert.equal(retry.code,200,JSON.stringify(retry.body));
assert.equal(retry.body.duplicate,true);
assert.equal(retry.body.moneyLedgerId,first.body.moneyLedgerId);
const caseRetry=await post(cash('cash-0001'));
assert.equal(caseRetry.code,200,'Receipt normalization must not double-post a differently cased reference');
assert.equal((await post(cash('cash-0001',125.36))).code,409,
 'One reference cannot silently be reused for a different amount');
assert.equal((await post({...cash(),reason:'Edited justification'})).code,409,
 'Changing evidence with an existing key requires a separate reviewed correction');
assert.equal((await post(cash(),{key:'another-client-event-01'})).code,409,
 'A different idempotency key cannot bypass the physical receipt reference');
assert.equal(moneyCount(),beforeUnauthorized+1);
assert.equal(auditCount(),1);
assert.throws(()=>db.prepare(`
 INSERT INTO bakery_money_ledger VALUES
 ('direct-duplicate','company-bakery','2026-10-24','dispatch-1','agent-1',
  'cash_received',12535,'in',' Cash-0001 ','Cash counted and signed','staff-1')`).run(),
 /Duplicate Bakery dispatch remittance reference/,
 'A direct database writer must also be unable to post the same receipt');

const second=await post(cash('CASH-0002',125.35));
assert.equal(second.code,201,'Different verified receipt references remain independently recordable');
assert.equal(moneyCount(),beforeUnauthorized+2);
const outstanding={dispatchId:'dispatch-2',status:'outstanding',amountNaira:50,
 reference:'',reason:'Agent customer balance awaiting payment'};
const keyed=await post(outstanding,{key:'dispatch2-outstanding-01'});
assert.equal(keyed.code,201);
assert.equal((await post(outstanding,{key:'dispatch2-outstanding-01'})).code,200,
 'Identified outstanding requests must be replay safe even without a receipt reference');
assert.equal((await post({...outstanding,amountNaira:60},{key:'dispatch2-outstanding-01'})).code,409);
const unkeyed=await post({...outstanding,amountNaira:15});
assert.equal(unkeyed.code,201,'Existing legacy outstanding form must continue working');
assert.equal(unkeyed.body.idempotencyProtected,false,
 'Do not falsely claim replay protection where neither request key nor reference exists');
assert.equal((await post(outstanding,{key:'short'})).code,400,
 'Malformed explicit idempotency keys must be rejected');

const refund={dispatchId:'dispatch-1',status:'refunded',amountNaira:5,
 reference:'REF-0001',reason:'Manager-approved refund'};
assert.equal((await post(refund,{who:noApprove})).code,403);
assert.equal((await post(refund)).code,201);
assert.equal((await post(refund)).code,200,
 'Approved refunds cannot post a second refund under the same reference');
assert.equal((await post(cash('AFTER-CLOSE',1,'dispatch-closed'))).code,404);
const beforeCloseRace=[moneyCount(),claimCount(),auditCount()];
beforeBatch=()=>db.prepare("UPDATE bakery_dispatches SET status='closed' WHERE id='dispatch-race'").run();
const raced=await post(cash('CASH-RACE',10,'dispatch-race'));
assert.equal(raced.code,409,JSON.stringify(raced.body));
assert.deepEqual([moneyCount(),claimCount(),auditCount()],beforeCloseRace,
 'Concurrent dispatch closure must roll back the claim, money and audit together');

// Concurrent raw reference insertion after initial query cannot create a
// second money row or be acknowledged as an audited event.
const beforeCompeting=moneyCount(),beforeAudit= auditCount();
beforeBatch=()=>db.prepare(`
 INSERT INTO bakery_money_ledger VALUES
 ('unreviewed-race','company-bakery','2026-10-24','dispatch-2','agent-2',
 'cash_received',7200,'in','CASH-COMPETE','Cash counted and signed','staff-1')`).run();
const competed=await post(cash('CASH-COMPETE',72,'dispatch-2'));
assert.equal(competed.code,409,'A concurrent, unaudited ledger insert must not be acknowledged');
assert.equal(moneyCount(),beforeCompeting+1,'The second receipt must not be inserted');
assert.equal(auditCount(),beforeAudit,'The failed batch must not invent audit evidence');

// Even an original claim must not be acknowledged if its audit evidence
// becomes disconnected; the request must fail closed, never post twice.
db.prepare("DELETE FROM audit_logs WHERE json_extract(after_json,'$.moneyLedgerId')=?").run(first.body.moneyLedgerId);
const missingAudit=await post(cash());
assert.equal(missingAudit.code,503,'Missing immutable audit evidence prevents false replay success');
assert.equal(moneyCount(),beforeCompeting+1);
db.close();
console.log('PASS Bakery remittance: idempotent cash, refunds and keyed outstanding; conflicting keys fail');
console.log('PASS normalized reference trigger, untouched historical duplicates, concurrent closure/duplicate rollback');
console.log('PASS required audit evidence and unkeyed legacy limitations reported accurately; zero external systems');
