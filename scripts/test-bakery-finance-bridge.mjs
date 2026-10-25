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
assert(modules['./bakery-accountability'].includes("return routeBakeryDispatchFinanceBridge(request,env,context)"),
 'Dispatch remittance evidence must be registered in the canonical Bakery router.');
const cache=new Map();
function load(name){
 if(name==='./auth')return {hasPermission:(ctx,code,_level,companyId)=>
   companyId==='company-bakery'&&ctx.grants?.includes(code)===true};
 if(name==='./bakery-material-units')return {routeBakeryMaterialUnits:async()=>null};
 if(name==='./bakery-dispatch-history-integrity')return {routeBakeryDispatchHistoryIntegrity:async()=>null};
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
  source_id TEXT,status TEXT,posted_amount_kobo INTEGER,cost_amount_kobo INTEGER,
  journal_entry_id TEXT,receivable_id TEXT);
 CREATE TABLE journal_entries(id TEXT PRIMARY KEY,company_id TEXT,source_module TEXT,
  source_type TEXT,source_id TEXT,status TEXT);
 CREATE TABLE finance_accounts(id TEXT PRIMARY KEY,company_id TEXT,code TEXT);
 CREATE TABLE journal_lines(journal_entry_id TEXT,account_id TEXT,debit_kobo INTEGER,credit_kobo INTEGER);
 CREATE TABLE finance_receivables(id TEXT PRIMARY KEY,company_id TEXT,source_module TEXT,
  source_id TEXT,amount_kobo INTEGER,paid_kobo INTEGER,balance_kobo INTEGER,status TEXT);
 CREATE TABLE finance_receivable_payments(id TEXT PRIMARY KEY,receivable_id TEXT,amount_kobo INTEGER,reference TEXT);
`);
db.exec("INSERT INTO finance_accounts VALUES('coa-cash','company-bakery','1000'),('coa-ar','company-bakery','1100'),('coa-inventory','company-bakery','1200'),('coa-revenue','company-bakery','4000'),('coa-cogs','company-bakery','5000'),('coa-expense','company-bakery','6000')");
const sale=db.prepare("INSERT INTO sales_orders VALUES(?,? ,?,'2026-10-24',?,?,?,?)");
const detail=db.prepare("INSERT INTO bakery_order_details VALUES(?)");
const payment=db.prepare("INSERT INTO payments VALUES(?,?,?,'confirmed','cash',?)");
const money=db.prepare("INSERT INTO bakery_money_ledger VALUES(?,?,?,'cash_received','in',?)");
const source=db.prepare("INSERT INTO finance_source_postings VALUES(?,'sales','sales_order',?,?,?,?,?,?)");
const journal=db.prepare("INSERT INTO journal_entries VALUES(?,?,'sales','sales_order',?,'posted')");
const line=db.prepare("INSERT INTO journal_lines VALUES(?,?,?,?)");
const receivable=db.prepare("INSERT INTO finance_receivables VALUES(?,?,'sales',?,?,?,?,?)");
const arPayment=db.prepare("INSERT INTO finance_receivable_payments VALUES(?,?,?,?)");
function addSale(id,{company='company-bakery',status='completed',total=10000,paid=0,paymentStatus='unpaid'}={}){
 sale.run(id,company,id,status,paymentStatus,total,paid);
 detail.run(id);
}
function addPosting(id,{company='company-bakery',status='posted',total=10000,balanced=true,
 journalId='j-'+id,receivableId='r-'+id,open=10000,arAmount=10000,arPaid=0,
 arStatus='open',cost=0,arJournalDebit=total,revenueJournalCredit=null,
 cashJournalDebit=0,cogsDebit=cost,inventoryCredit=cost,extraLines=false}={}){
 source.run(company,id,status,total,cost,journalId,receivableId);
 if(status==='posted'&&journalId){
  journal.run(journalId,company,id);
  line.run(journalId,'coa-ar',arJournalDebit,0);
  line.run(journalId,'coa-revenue',0,revenueJournalCredit??(balanced?total:total-100));
  if(cashJournalDebit>0)line.run(journalId,'coa-cash',cashJournalDebit,0);
  if(cost>0){
   line.run(journalId,'coa-cogs',cogsDebit,0);
   line.run(journalId,'coa-inventory',0,inventoryCredit);
  }
  if(extraLines){
   line.run(journalId,'coa-expense',250,0);
   line.run(journalId,'coa-expense',0,250);
  }
 }
 if(receivableId)receivable.run(receivableId,company,id,arAmount,arPaid,open,arStatus);
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
source.run('company-bakery','sale-e','posted',10000,0,'missing-journal','missing-receivable');

// Finance A/R balances and receivable-payment evidence have an independent
// accounting lifecycle. Inject stale, inconsistent and duplicate scenarios.
addSale('sale-f');
addPosting('sale-f',{arPaid:2000,open:9000,arStatus:'part_paid'});
arPayment.run('ar-f','r-sale-f',2000,'PAY-F');
addSale('sale-g');
addPosting('sale-g',{arPaid:1000,open:9000,arStatus:'part_paid'});
addSale('sale-h');
addPosting('sale-h',{arPaid:5000,open:5000,arStatus:'part_paid'});
arPayment.run('ar-h1','r-sale-h',2500,' Bank-PAY-H ');
arPayment.run('ar-h2','r-sale-h',2500,'bank-pay-h');
addSale('sale-i');
addPosting('sale-i',{arPaid:5000,open:5000,arStatus:'paid'});
arPayment.run('ar-i','r-sale-i',5000,'PAY-I');
addSale('sale-j');
addPosting('sale-j');
journal.run('j-extra','company-bakery','sale-j');
addSale('sale-k');
addPosting('sale-k',{arAmount:11000,open:11000});
addSale('sale-l');
addPosting('sale-l',{arPaid:10000,open:0,arStatus:'paid'});
arPayment.run('ar-l','r-sale-l',10000,'PAY-L');

 // Sales auto-posting must use A/R debit and revenue credit, NOT unverified
 // cash. A mathematically balanced journal can still be financially wrong.
 addSale('sale-m');
 addPosting('sale-m',{arJournalDebit:9000,revenueJournalCredit:9000});
 addSale('sale-n');
 addPosting('sale-n',{arJournalDebit:0,cashJournalDebit:10000});
 addSale('sale-o');
 addPosting('sale-o',{cost:2000,cogsDebit:1500,inventoryCredit:1500});
 addSale('sale-p');
 addPosting('sale-p',{cost:2500});
 addSale('sale-q');
 addPosting('sale-q',{extraLines:true});
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
 'finance_source_postings','journal_entries','journal_lines','finance_accounts',
 'finance_receivables','finance_receivable_payments'];
const snapshot=()=>JSON.stringify(tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));
const before=snapshot();
const first=await request(uri);
assert.equal(first.status,200,JSON.stringify(first.data));
assert.equal(first.data.readOnly,true);
assert.equal(first.data.scope,'completed_bakery_sales_page_only');
assert.equal(first.data.bankSettlementAssessed,false);
assert.equal(first.data.financePaymentSettlementAssessed,false);
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
assert(row('sale-f').issues.includes('finance_receivable_balance_inconsistent'),
 'The sum of Finance recorded paid + outstanding must match original AR');
assert(!row('sale-f').issues.includes('finance_payment_records_disagree_with_receivable'));
assert(row('sale-g').issues.includes('finance_payment_records_disagree_with_receivable'),
 'A changed AR paid field without matching Finance payment records is an exception');
assert(row('sale-h').issues.includes('duplicate_finance_payment_references'),
 'Duplicate normalized Finance payment references require an investigation');
assert.equal(row('sale-h').duplicateFinancePaymentReferences,1);
assert(row('sale-h').reviewRequired.includes('finance_payment_evidence_not_bank_verified'),
 'Finance payment rows are not independent bank/provider settlement proof');
assert(row('sale-i').issues.includes('finance_receivable_status_inconsistent'));
assert(row('sale-j').issues.includes('unexpected_posted_sales_journal_count'),
 'Two posted sales journals for the same order must never look reconciled');
assert.equal(row('sale-j').postedSourceJournalCount,2);
assert(row('sale-k').issues.includes('finance_receivable_original_disagrees_with_sale'));
assert.deepEqual(Array.from(row('sale-l').issues),[]);
assert(row('sale-l').reviewRequired.includes('finance_payment_evidence_not_bank_verified'));
assert.equal(row('sale-l').amounts.financePaymentRecordsKobo,10000);
assert(row('sale-m').issues.includes('sales_journal_receivable_debit_mismatch'),
 'Balanced but understated AR debit cannot be accepted');
assert(row('sale-m').issues.includes('sales_journal_revenue_credit_mismatch'),
 'Balanced but understated revenue cannot be accepted');
assert(row('sale-n').issues.includes('unverified_cash_recognized_in_sales_journal'),
 'Cash posted from unverified Bakery POS evidence must be flagged');
assert(row('sale-n').issues.includes('sales_journal_receivable_debit_mismatch'));
assert(row('sale-o').issues.includes('sales_journal_cost_of_sales_mismatch'));
assert(row('sale-o').issues.includes('sales_journal_inventory_credit_mismatch'));
assert.equal(row('sale-o').amounts.financeCostKobo,2000);
assert.deepEqual(Array.from(row('sale-p').issues),[],
 'Correct A/R, revenue and cost journal lines must pass');
assert.equal(row('sale-p').journalLineCount,4);
assert(row('sale-q').issues.includes('unexpected_sales_journal_line_count'),
 'Additional debit/credit pairs must not escape even if totals are balanced');
assert.equal(row('sale-q').journalLineCount,4);
assert.equal(snapshot(),before,'Financial evidence queries must never change money, sales, journal or AR rows');

// Agent dispatch money is NOT equivalent to verified bank settlement or a
// Finance journal. Exercise the actual dispatch SQL separately from POS.
db.exec(`
 ALTER TABLE bakery_money_ledger ADD COLUMN dispatch_id TEXT;
 ALTER TABLE bakery_money_ledger ADD COLUMN reference TEXT;
 CREATE TABLE bakery_dispatches(id TEXT PRIMARY KEY,company_id TEXT,dispatch_no TEXT,status TEXT);
 CREATE TABLE bakery_dispatch_items(dispatch_id TEXT,product_id TEXT,quantity REAL,unit_price_kobo INTEGER);
 CREATE TABLE bakery_bread_ledger(id TEXT PRIMARY KEY,company_id TEXT,dispatch_id TEXT,
  product_id TEXT,status TEXT,quantity REAL,unit_price_kobo INTEGER);
 CREATE TABLE bakery_dispatch_return_receipts(id TEXT PRIMARY KEY,company_id TEXT,
  dispatch_id TEXT,product_id TEXT,quantity REAL);
`);
const dispatch=db.prepare("INSERT INTO bakery_dispatches VALUES(?,?,?,?)");
const dispatched=db.prepare("INSERT INTO bakery_dispatch_items VALUES(?,?,?,?)");
const bread=db.prepare("INSERT INTO bakery_bread_ledger VALUES(?,?,?,?,?,?,?)");
const returnReceipt=db.prepare("INSERT INTO bakery_dispatch_return_receipts VALUES(?,?,?,?,?)");
const remittance=db.prepare("INSERT INTO bakery_money_ledger(id,company_id,dispatch_id,status,direction,amount_kobo,reference) VALUES(?, 'company-bakery',?,?,?,?,?)");
const addDispatch=(id,status='reconciling',company='company-bakery')=>dispatch.run(id,company,id,status);
const sell=(id,qty,price=1000)=>bread.run('bread-'+id,'company-bakery',id,'bread','sold',qty,price);
addDispatch('dispatch-balanced','closed');
dispatched.run('dispatch-balanced','bread',10,500);
bread.run('bread-return-balanced','company-bakery','dispatch-balanced','bread','returned',2,null);
sell('dispatch-balanced',8,500);
returnReceipt.run('return-balanced','company-bakery','dispatch-balanced','bread',2);
remittance.run('cash-balanced','dispatch-balanced','cash_received','in',4000,'CASH-001');
addDispatch('dispatch-duplicate','closed');
dispatched.run('dispatch-duplicate','bread',4,1000);
sell('dispatch-duplicate',4);
remittance.run('cash-dup1','dispatch-duplicate','cash_received','in',2000,'Cash-Dup');
remittance.run('cash-dup2','dispatch-duplicate','cash_received','in',2000,'cash-dup');
addDispatch('dispatch-short','closed');
dispatched.run('dispatch-short','bread',5,1000);
sell('dispatch-short',5);
remittance.run('cash-short','dispatch-short','cash_received','in',2000,'CASH-SHORT');
addDispatch('dispatch-open');
dispatched.run('dispatch-open','bread',5,1000);
sell('dispatch-open',2);
bread.run('bread-return-open','company-bakery','dispatch-open','bread','returned',2,null);
remittance.run('transfer-open','dispatch-open','transfer_received','in',1000,'BANK-PENDING');
remittance.run('fee-open','dispatch-open','pos_charges','out',100,'POS-FEE');
remittance.run('outstanding-open','dispatch-open','outstanding','in',1000,'DEBT');
addDispatch('dispatch-overreturns');
dispatched.run('dispatch-overreturns','bread',1,1000);
bread.run('bread-return-excess','company-bakery','dispatch-overreturns','bread','returned',1,null);
returnReceipt.run('return-excess','company-bakery','dispatch-overreturns','bread',2);
addDispatch('dispatch-refund');
dispatched.run('dispatch-refund','bread',2,1000);
sell('dispatch-refund',2);
remittance.run('cash-refund','dispatch-refund','cash_received','in',2000,'CASH-REFUND');
remittance.run('refund-refund','dispatch-refund','refunded','out',500,'REFUND-001');
addDispatch('dispatch-missing-ref');
dispatched.run('dispatch-missing-ref','bread',1,1000);
sell('dispatch-missing-ref',1);
remittance.run('cash-missing','dispatch-missing-ref','cash_received','in',1000,'');
addDispatch('dispatch-other','closed','company-printing');
dispatched.run('dispatch-other','bread',99,1000);
for(let n=0;n<103;n++)addDispatch('dispatch-page-'+String(n).padStart(3,'0'));

const dispatchUri='/api/bakery/accountability/dispatch-finance-bridge';
const beforeDispatchDenials=queries;
for(const who of [foreign,deniedFinance,deniedBakery])
 assert.equal((await request(dispatchUri,who)).status,403);
assert.equal(queries,beforeDispatchDenials,'Dispatch money queries require both permission scopes and company membership');
assert.equal((await request(dispatchUri+'?afterDispatchId=A&afterDispatchId=B')).status,400);
assert.equal((await request(dispatchUri+'?afterDispatchId='+('x'.repeat(129)))).status,400);
assert.equal((await request(dispatchUri,allowed,'POST')).status,null,'Dispatch evidence cannot create a payment');
const dispatchTables=['bakery_dispatches','bakery_dispatch_items','bakery_bread_ledger',
 'bakery_dispatch_return_receipts',...tables];
const dispatchSnapshot=()=>JSON.stringify(dispatchTables.map(t=>
 db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));
const dispatchBefore=dispatchSnapshot();
const dispatchFirst=await request(dispatchUri);
assert.equal(dispatchFirst.status,200,JSON.stringify(dispatchFirst.data));
assert.equal(dispatchFirst.data.readOnly,true);
assert.equal(dispatchFirst.data.bankSettlementAssessed,false);
assert.equal(dispatchFirst.data.financeGlLinkAssessed,false);
assert.equal(dispatchFirst.data.sourceAccountingEntriesCreated,false);
assert.equal(dispatchFirst.data.scope,'bakery_dispatch_page_only');
assert.equal(dispatchFirst.data.returned,100);
assert.equal(dispatchFirst.data.hasMore,true);
const dispatchSecond=await request(dispatchUri+'?'+new URLSearchParams(dispatchFirst.data.nextCursor));
assert.equal(dispatchSecond.status,200,JSON.stringify(dispatchSecond.data));
assert.equal(dispatchSecond.data.hasMore,false);
const dispatchAll=[...dispatchFirst.data.items,...dispatchSecond.data.items];
assert.equal(new Set(dispatchAll.map(r=>r.dispatchId)).size,dispatchAll.length);
assert(dispatchAll.some(r=>r.dispatchId==='dispatch-page-102'));
assert(!dispatchAll.some(r=>r.dispatchId==='dispatch-other'),'Foreign-company dispatch money must never leak');
const getDispatch=id=>{const row=dispatchAll.find(x=>x.dispatchId===id);assert(row,id);return row};
assert.deepEqual(Array.from(getDispatch('dispatch-balanced').issues),[]);
assert.equal(getDispatch('dispatch-balanced').money.soldKobo,4000);
assert.equal(getDispatch('dispatch-balanced').cashVarianceKobo,0);
assert.equal(getDispatch('dispatch-balanced').returnVariance,0);
assert(getDispatch('dispatch-balanced').reviewRequired.includes('dispatch_cash_not_reconciled_to_finance_gl_or_bank'));
assert(getDispatch('dispatch-duplicate').issues.includes('duplicate_cash_receipt_references'));
assert.equal(getDispatch('dispatch-duplicate').duplicateCashReferenceGroups,1);
assert(getDispatch('dispatch-short').issues.includes('closed_dispatch_money_variance'));
assert.equal(getDispatch('dispatch-short').cashVarianceKobo,3000);
assert(getDispatch('dispatch-open').reviewRequired.includes('declared_returns_await_physical_verification'));
assert(getDispatch('dispatch-open').reviewRequired.includes('external_payment_settlement_not_verified'));
assert(getDispatch('dispatch-open').reviewRequired.includes('outstanding_is_not_received_cash'));
assert(getDispatch('dispatch-open').reviewRequired.includes('pos_charges_finance_posting_not_assessed'));
assert(getDispatch('dispatch-open').reviewRequired.includes('dispatch_bread_not_fully_accounted'));
assert(getDispatch('dispatch-overreturns').issues.includes('verified_returns_exceed_declarations'));
assert(getDispatch('dispatch-refund').reviewRequired.includes('refund_finance_posting_not_assessed'));
assert.equal(getDispatch('dispatch-refund').cashVarianceKobo,500);
assert(getDispatch('dispatch-missing-ref').issues.includes('cash_receipt_reference_missing'));
assert.equal(dispatchSnapshot(),dispatchBefore,'The dispatch bridge must not write to any money, stock, returns or Finance table');
console.log('PASS Bakery dispatch-to-Finance evidence: 100-row pagination, cash duplicates, remittance gaps, returns and refund controls');
console.log('PASS dual-permission isolation, external settlement not asserted, and zero dispatch/Finance writes');

db.close();
console.log('PASS Bakery-to-Finance read-only bridge: actual SQLite sales/payments/cash evidence, source posting, journal balance and AR links');
console.log('PASS company and dual-permission isolation, >100-row pagination, unverified settlement caution and zero database writes');
