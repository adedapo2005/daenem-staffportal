// Execute the real Bakery/Finance evidence-bridge route on isolated SQLite.
// Never touch Cloudflare D1, bank providers, live money or an external service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const modules={
 './bakery-finance-bridge':fs.readFileSync(new URL('../worker/bakery-finance-bridge.ts',import.meta.url),'utf8'),
 './bakery-accountability':fs.readFileSync(new URL('../worker/bakery-accountability.ts',import.meta.url),'utf8')
};
assert(modules['./bakery-accountability'].includes("return routeBakeryFinanceBridge(request,env,context)"),
 'The Finance evidence endpoint must be registered in the canonical Bakery router.');
const cache=new Map();
function load(name){
 if(name==='./auth')return {hasPermission:(ctx,code,_level,companyId)=>
   companyId==='company-bakery'&&ctx.grants?.includes(code)===true};
 if(name==='./bakery-material-units')return {routeBakeryMaterialUnits:async()=>null};
 if(cache.has(name))return cache.get(name);
 assert(modules[name],name);
 const mod={exports:{}};cache.set(name,mod.exports);
 const output=ts.transpileModule(modules[name],{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
 }}).outputText;
 new vm.Script('(function(require,module,exports){'+output+'\n})').runInNewContext({
  Request,Response,URL,crypto:webcrypto,console,TextEncoder,TextDecoder,Intl
 })(load,mod,mod.exports);
 return mod.exports;
}
const route=load('./bakery-accountability').routeBakeryAccountability;
assert.equal(typeof route,'function');
const db=new DatabaseSync(':memory:');
db.exec(`
 CREATE TABLE sales_orders(id TEXT PRIMARY KEY,company_id TEXT,order_no TEXT,order_date TEXT,
  status TEXT,payment_status TEXT,total_kobo INTEGER,amount_paid_kobo INTEGER);
 CREATE TABLE bakery_order_details(sales_order_id TEXT PRIMARY KEY);
 CREATE TABLE payments(id TEXT PRIMARY KEY,company_id TEXT,sales_order_id TEXT,
  status TEXT,method TEXT,amount_kobo INTEGER);
 CREATE TABLE bakery_money_ledger(id TEXT PRIMARY KEY,company_id TEXT,sales_order_id TEXT,
  status TEXT,direction TEXT,amount_kobo INTEGER);
 CREATE TABLE finance_source_postings(company_id TEXT,source_module TEXT,source_type TEXT,
  source_id TEXT,status TEXT,posted_amount_kobo INTEGER,journal_entry_id TEXT,receivable_id TEXT);
 CREATE TABLE journal_entries(id TEXT PRIMARY KEY,company_id TEXT,source_module TEXT,
  source_type TEXT,source_id TEXT,status TEXT);
 CREATE TABLE journal_lines(journal_entry_id TEXT,debit_kobo INTEGER,credit_kobo INTEGER);
 CREATE TABLE finance_receivables(id TEXT PRIMARY KEY,company_id TEXT,source_module TEXT,
  source_id TEXT,balance_kobo INTEGER);
`);
const sale=db.prepare("INSERT INTO sales_orders VALUES(?,? ,?,'2026-10-24',?,?,?,?)");
const detail=db.prepare("INSERT INTO bakery_order_details VALUES(?)");
const payment=db.prepare("INSERT INTO payments VALUES(?,?,?,'confirmed','cash',?)");
const money=db.prepare("INSERT INTO bakery_money_ledger VALUES(?,?,?,'cash_received','in',?)");
const source=db.prepare("INSERT INTO finance_source_postings VALUES(?,'sales','sales_order',?,?,?, ?,?)");
const journal=db.prepare("INSERT INTO journal_entries VALUES(?,?,'sales','sales_order',?,'posted')");
const line=db.prepare("INSERT INTO journal_lines VALUES(?,?,?)");
const receivable=db.prepare("INSERT INTO finance_receivables VALUES(?,?,'sales',?,?)");
function addSale(id,{company='company-bakery',status='completed',total=10000,paid=0,paymentStatus='unpaid'}={}){
 sale.run(id,company,id,status,paymentStatus,total,paid);
 detail.run(id);
}
function addPosting(id,{company='company-bakery',status='posted',total=10000,balanced=true,journalId='j-'+id,receivableId='r-'+id,open=10000}={}){
 source.run(company,id,status,total,journalId,receivableId);
 if(status==='posted'&&journalId){
  journal.run(journalId,company,id);
  line.run(journalId,total,0);
  line.run(journalId,0,balanced?total:total-100);
 }
 if(receivableId)receivable.run(receivableId,company,id,open);
}
addSale('sale-a',{paid:10000,paymentStatus:'paid'});
payment.run('p-a','company-bakery','sale-a',10000);
money.run('m-a','company-bakery','sale-a',10000);
addPosting('sale-a');
addSale('sale-b');
addSale('sale-c',{paid:2000,paymentStatus:'part_paid'});
payment.run('p-c','company-bakery','sale-c',2000);
addPosting('sale-c',{status:'failed',journalId:null,receivableId:null});
addSale('sale-d');
addPosting('sale-d',{balanced:false});
addSale('sale-e',{paid:5000,paymentStatus:'part_paid'});
payment.run('p-e','company-bakery','sale-e',10000);
money.run('m-e','company-bakery','sale-e',10000);
source.run('company-bakery','sale-e','posted',10000,'missing-journal','missing-receivable');
addSale('sale-foreign',{company:'company-printing'});
addSale('sale-draft',{status:'draft'});
// More than one page without claiming that one page is the whole company.
for(let i=0;i<103;i++)addSale('sale-page-'+String(i).padStart(3,'0'));
const allowed={companies:[{id:'company-bakery'}],employee:{id:'test-reviewer'},
 grants:['bakery.reconciliation','finance.ledger']};
const deniedFinance={...allowed,grants:['bakery.reconciliation']};
const deniedBakery={...allowed,grants:['finance.ledger']};
const foreign={...allowed,companies:[{id:'company-printing'}]};
let queries=0;
const env={DB:{prepare(sql){queries++;return{bind(...args){return{
 async all(){return{results:db.prepare(sql).all(...args)}}
}}}}}};
async function request(path,who=allowed,method='GET'){
 const response=await route(new Request('https://test.invalid'+path,{method}),env,who);
 if(response===null)return{status:null,data:null};
 assert(response instanceof Response);
 return{status:response.status,data:await response.json()};
}
const uri='/api/bakery/accountability/finance-bridge';
const beforeDenied=queries;
for(const who of [foreign,deniedFinance,deniedBakery]){
 const resp=await request(uri,who);
 assert.equal(resp.status,403);
}
assert.equal(queries,beforeDenied,'Unauthorized users must have zero financial database reads');
assert.equal((await request(uri+'?afterOrderId=a&afterOrderId=b')).status,400);
assert.equal((await request(uri+'?afterOrderId='+('x'.repeat(129)))).status,400);
assert.equal((await request(uri,allowed,'POST')).status,null,'The evidence endpoint is read-only');
const tables=['sales_orders','bakery_order_details','payments','bakery_money_ledger',
 'finance_source_postings','journal_entries','journal_lines','finance_receivables'];
const snapshot=()=>JSON.stringify(tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));
const before=snapshot();
const first=await request(uri);
assert.equal(first.status,200,JSON.stringify(first.data));
assert.equal(first.data.readOnly,true);
assert.equal(first.data.scope,'completed_bakery_sales_page_only');
assert.equal(first.data.bankSettlementAssessed,false);
assert.equal(first.data.returned,100);
assert.equal(first.data.hasMore,true);
assert(first.data.nextCursor?.afterOrderId);
const second=await request(uri+'?'+new URLSearchParams(first.data.nextCursor));
assert.equal(second.status,200,JSON.stringify(second.data));
assert.equal(second.data.hasMore,false);
const all=[...first.data.items,...second.data.items];
assert.equal(new Set(all.map(x=>x.salesOrderId)).size,all.length,'No duplicates between page cursors');
assert(all.some(x=>x.salesOrderId==='sale-page-102'),'Final row must be accessible');
assert(!all.some(x=>x.salesOrderId==='sale-foreign'),'Foreign-company orders must not leak');
assert(!all.some(x=>x.salesOrderId==='sale-draft'),'Uncompleted sales are outside stated scope');
const row=id=>{const x=all.find(x=>x.salesOrderId===id);assert(x,id);return x};
assert.deepEqual(Array.from(row('sale-a').issues),[]);
assert(row('sale-a').reviewRequired.includes('cash_evidence_against_open_finance_receivable'),
 'Cash physically confirmed on Bakery POS must not imply GL receivable cleared');
assert.equal(row('sale-a').amounts.confirmedCashRecordsKobo,10000);
assert.equal(row('sale-a').amounts.bakeryCashLedgerKobo,10000);
assert(row('sale-b').reviewRequired.includes('finance_source_posting_not_recorded'));
assert(row('sale-c').issues.includes('finance_source_posting_failed'));
assert(row('sale-c').issues.includes('cash_records_disagree_with_bakery_ledger'));
assert(row('sale-d').issues.includes('journal_lines_not_balanced'));
assert(row('sale-e').issues.includes('payment_records_disagree_with_order'));
assert(row('sale-e').issues.includes('posted_journal_link_invalid'));
assert(row('sale-e').issues.includes('finance_receivable_link_invalid'));
assert.equal(snapshot(),before,'Financial evidence queries must never change money, sales, journal or AR rows');
db.close();
console.log('PASS Bakery-to-Finance read-only bridge: actual SQLite sales/payments/cash evidence, source posting, journal balance and AR links');
console.log('PASS company and dual-permission isolation, >100-row pagination, unverified settlement caution and zero database writes');
