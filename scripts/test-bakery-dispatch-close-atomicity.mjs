// Exercise real Bakery close handler and migration using isolated SQLite.
// Never connect to Cloudflare D1, Finance GL or a payment provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const source=fs.readFileSync(new URL('../worker/bakery-accountability.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0111_bakery_dispatch_atomic_close.sql',import.meta.url),'utf8');
const closeAuditMigration=fs.readFileSync(new URL('../migrations/0112_bakery_dispatch_closure_audit.sql',import.meta.url),'utf8');
const load=name=>{
 if(name==='./auth')return {hasPermission:(ctx,code,level,company)=>
   ctx.companies?.some(x=>x.id===company)===true
   &&ctx.grants?.includes(code+':'+level)===true};
 if(name==='./bakery-material-units')return {routeBakeryMaterialUnits:async()=>null};
 if(name==='./bakery-finance-bridge')return {
  routeBakeryFinanceBridge:async()=>null,routeBakeryDispatchFinanceBridge:async()=>null
 };
 throw new Error('Unexpected module '+name);
};
const output=ts.transpileModule(source,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const module={exports:{}};
new vm.Script('(function(require,module,exports){'+output+'\n})').runInNewContext({
 Request,Response,URL,crypto:webcrypto,console,TextEncoder,TextDecoder,Intl
})(load,module,module.exports);
const route=module.exports.routeBakeryAccountability;
assert.equal(typeof route,'function');
const db=new DatabaseSync(':memory:');
db.exec(`
 CREATE TABLE employees(id TEXT PRIMARY KEY);
 CREATE TABLE bakery_dispatches(
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,custodian_id TEXT NOT NULL,
  status TEXT NOT NULL,closed_at TEXT,closed_by TEXT,updated_at TEXT);
 CREATE TABLE bakery_dispatch_items(
  dispatch_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity REAL NOT NULL,unit_price_kobo INTEGER NOT NULL);
 CREATE TABLE bakery_bread_ledger(
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,dispatch_id TEXT,product_id TEXT,
  status TEXT NOT NULL,quantity REAL NOT NULL,buyer_type TEXT,unit_price_kobo INTEGER);
 CREATE TABLE bakery_money_ledger(
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,dispatch_id TEXT,status TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL,direction TEXT NOT NULL,reference TEXT);
 CREATE TABLE bakery_dispatch_return_receipts(
  id TEXT PRIMARY KEY,company_id TEXT NOT NULL,dispatch_id TEXT,product_id TEXT,quantity REAL NOT NULL);
 CREATE TABLE audit_logs(
  id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,
  module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,
  before_json TEXT,after_json TEXT,source TEXT);
`);
db.exec("INSERT INTO employees VALUES('manager-1')");
db.exec(migration);
db.exec(closeAuditMigration);
const owner={companies:[{id:'company-bakery'}],employee:{id:'manager-1'},
 grants:['bakery.reconciliation:approve']};
const denied={...owner,grants:[]};
const dispatchSql=db.prepare("INSERT INTO bakery_dispatches(id,company_id,custodian_id,status) VALUES(?,'company-bakery','agent-1',?)");
const dispatchItem=db.prepare("INSERT INTO bakery_dispatch_items(dispatch_id,product_id,quantity,unit_price_kobo) VALUES(?,'bread',10,1000)");
const breadSql=db.prepare("INSERT INTO bakery_bread_ledger(id,company_id,dispatch_id,product_id,status,quantity,buyer_type,unit_price_kobo) VALUES(?,'company-bakery',?,'bread',?,?,?,?)");
const moneySql=db.prepare("INSERT INTO bakery_money_ledger(id,company_id,dispatch_id,status,amount_kobo,direction,reference) VALUES(?,'company-bakery',?,'cash_received',?,'in',?)");
const returnsSql=db.prepare("INSERT INTO bakery_dispatch_return_receipts(id,company_id,dispatch_id,product_id,quantity) VALUES(?,'company-bakery',?,'bread',?)");
let sequence=0;
const unique=()=>String(++sequence);
function seed(id,{sold=8,returned=2,verified=2,cash=[8000],buyer='individual',salePrice=1000,items=true,status='reconciling',refs=null}={}){
 dispatchSql.run(id,status);
 if(items)dispatchItem.run(id);
 if(sold)breadSql.run('sold-'+unique(),id,'sold',sold,buyer,salePrice);
 if(returned)breadSql.run('returned-'+unique(),id,'returned',returned,null,null);
 if(verified)returnsSql.run('verified-'+unique(),id,verified);
 cash.forEach((amount,i)=>moneySql.run('money-'+unique(),id,amount,refs?.[i]??'CASH-'+id+'-'+i));
}
function count(sql,id){return Number(db.prepare(sql).get(id).n)}
const closeAudit=(id)=>count("SELECT COUNT(*) AS n FROM audit_logs WHERE action='close_reconciliation' AND entity_id=?",id);
const state=id=>db.prepare('SELECT status FROM bakery_dispatches WHERE id=?').get(id)?.status;
let beforeBatch=null;
const env={DB:{
 prepare(sql){return{bind(...params){return{
  sql,params,
  async first(){return db.prepare(sql).get(...params)},
  async all(){return{results:db.prepare(sql).all(...params)}},
  async run(){return db.prepare(sql).run(...params)}
 }}}},
 async batch(stmts){
  if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook()}
  db.exec('BEGIN IMMEDIATE');
  try{
   const out=stmts.map(statement=>{
    const r=db.prepare(statement.sql).run(...statement.params);
    return{meta:{changes:Number(r.changes)},results:[]};
   });
   db.exec('COMMIT');return out;
  }catch(error){db.exec('ROLLBACK');throw error}
 }
}};
async function close(id,who=owner){
 const response=await route(new Request('https://test.invalid/api/bakery/accountability/close',
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dispatchId:id})}),env,who);
 assert(response instanceof Response);
 return{code:response.status,data:await response.json()};
}
seed('normal');
assert.equal((await close('normal',denied)).code,403,'Approval permission remains mandatory');
const good=await close('normal');
assert.equal(good.code,200,JSON.stringify(good.data));
assert.equal(state('normal'),'closed');
assert.equal(closeAudit('normal'),1);
const audited=db.prepare("SELECT id,actor_employee_id AS actor,company_id AS company,source,before_json AS beforeJson,after_json AS afterJson FROM audit_logs WHERE action='close_reconciliation' AND entity_id=?").get('normal');
assert.equal(audited.id,'bakery-dispatch-closure-normal');
assert.equal(audited.actor,'manager-1');
assert.equal(audited.company,'company-bakery');
assert.equal(audited.source,'database','Every close has exactly one D1-owned audit');
assert.equal(JSON.parse(audited.beforeJson).status,'reconciling');
assert.equal(JSON.parse(audited.afterJson).auditOrigin,'database_trigger');
assert.throws(()=>db.prepare("UPDATE audit_logs SET after_json='{}' WHERE id=?").run(audited.id),
 /Bakery database closure audit is immutable/);
assert.throws(()=>db.prepare("DELETE FROM audit_logs WHERE id=?").run(audited.id),
 /Bakery database closure audit cannot be deleted/);
assert.equal(closeAudit('normal'),1,'Tamper attempts must not affect audit evidence');
assert.equal((await close('normal')).code,404,'A closed dispatch cannot be closed again');
assert.equal(closeAudit('normal'),1,'An existing close must not post another audit');
assert.throws(()=>moneySql.run('after-close-cash','normal',1000,'AFTER-CLOSE'),
 /Closed Bakery dispatch cannot accept money events/);
assert.throws(()=>breadSql.run('after-close-bread','normal','sold',1,'individual',1000),
 /Closed Bakery dispatch cannot accept bread events/);
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='reconciling' WHERE id='normal'").run(),
 /requires governed reopen/);

seed('money-race');
const initialAudit=closeAudit('money-race');
beforeBatch=()=>moneySql.run('raced-extra-cash','money-race',1000,'CASH-RACED');
const racedCash=await close('money-race');
assert.equal(racedCash.code,409,'Money inserted after preflight must stop the close');
assert.equal(state('money-race'),'reconciling');
assert.equal(closeAudit('money-race'),initialAudit,'Failed close cannot create a false audit');
assert.equal(count("SELECT COUNT(*) AS n FROM bakery_money_ledger WHERE dispatch_id=?", 'money-race'),2,
 'Racing money is retained for investigation, not silently changed');

seed('bread-race');
beforeBatch=()=>breadSql.run('raced-extra-bread','bread-race','sold',1,'individual',1000);
assert.equal((await close('bread-race')).code,409,
 'Bread issued after preflight must stop the close');
assert.equal(state('bread-race'),'reconciling');
assert.equal(closeAudit('bread-race'),0);

seed('already-closed-race');
beforeBatch=()=>db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='already-closed-race'").run();
assert.equal((await close('already-closed-race')).code,409,
 'A concurrent completed close cannot be reported as a second success');
assert.equal(state('already-closed-race'),'closed');
assert.equal(closeAudit('already-closed-race'),1,
 'A real competing closure creates one mandatory D1 audit; the no-op creates none');

// A direct SQL writer also receives the same immutable closure audit.
seed('direct-sql');
db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='direct-sql'").run();
assert.equal(state('direct-sql'),'closed');
assert.equal(closeAudit('direct-sql'),1,'Direct SQL cannot bypass the database audit');
assert.equal(db.prepare("SELECT source FROM audit_logs WHERE entity_id='direct-sql' AND action='close_reconciliation'").get().source,'database');

// An attempted closure with missing human attribution must never succeed.
seed('anonymous-close');
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='closed' WHERE id='anonymous-close'").run(),
 /Bakery closure requires a named actor and closure timestamp/);
assert.equal(state('anonymous-close'),'reconciling');
assert.equal(closeAudit('anonymous-close'),0);

// Simulate an audit insertion failure. Its collision must roll the whole
// status update back, not leave a financially closed dispatch without proof.
seed('audit-collision');
db.prepare("INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,source) VALUES('bakery-dispatch-closure-audit-collision','manager-1','company-bakery','bakery','synthetic_collision','bakery_dispatch','audit-collision','web')").run();
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='audit-collision'").run(),
 /UNIQUE constraint failed: audit_logs.id/);
assert.equal(state('audit-collision'),'reconciling');
assert.equal(closeAudit('audit-collision'),0);

seed('pending-returns',{verified:0});
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='pending-returns'").run(),
 /physical returns are not reconciled/,'Direct database writers cannot bypass physical verification');
assert.equal(state('pending-returns'),'reconciling');
assert.equal((await close('pending-returns')).code,409);

seed('unclassified-sale',{buyer:null});
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='unclassified-sale'").run(),
 /Unclassified Bakery agent sales cannot close/);
assert.equal(state('unclassified-sale'),'reconciling');

seed('money-short',{cash:[7000]});
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='money-short'").run(),
 /money changed before closure/);
assert.equal(state('money-short'),'reconciling');
seed('duplicate-ref',{cash:[4000,4000],refs:['RECEIPT-X',' receipt-x ']});
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='duplicate-ref'").run(),
 /Duplicate Bakery dispatch cash references require investigation/);

seed('no-items',{items:false,sold:0,returned:0,verified:0,cash:[]});
assert.throws(()=>db.prepare("UPDATE bakery_dispatches SET status='closed',closed_by='manager-1',closed_at=CURRENT_TIMESTAMP WHERE id='no-items'").run(),
 /without issued bread/);
db.close();
console.log('PASS atomic Bakery dispatch closure: genuine handler and direct SQL create one immutable D1 audit');
console.log('PASS D1 audit collision rolls back closure, anonymous actor rejected, failed closes create zero audit');
console.log('PASS direct D1 triggers: money/bread races, physical returns, sale classification and duplicate receipts');
