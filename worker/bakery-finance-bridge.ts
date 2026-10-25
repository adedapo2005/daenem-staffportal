import {hasPermission,type AuthEnv,type SessionContext} from './auth';

// Read-only Bakery-to-Finance evidence bridge. It never posts, clears or reverses
// a payment or journal. A cashier-confirmed receipt is NOT bank settlement.
interface Env extends AuthEnv {}
const COMPANY='company-bakery';
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
type EvidenceRow={
 salesOrderId:string;orderNo:string;orderDate:string;totalKobo:number;
 paymentStatus:string;orderPaidKobo:number;
 confirmedPaymentsKobo:number;confirmedCashKobo:number;
 cashLedgerKobo:number;noncashLedgerKobo:number;refundLedgerKobo:number;
 financeSourceStatus:string|null;financePostedKobo:number|null;
 sourceJournalId:string|null;journalId:string|null;journalStatus:string|null;
 journalDebitKobo:number|null;journalCreditKobo:number|null;
 sourceReceivableId:string|null;receivableId:string|null;
 receivableBalanceKobo:number|null;
 receivableOriginalKobo:number|null;receivablePaidKobo:number|null;
 receivableStatus:string|null;receivableRecordedPaymentsKobo:number|null;
 receivablePaymentCount:number|null;duplicateReceivablePaymentReferences:number|null;
 postedSourceJournalCount:number;
 financeCostKobo:number|null;journalLineCount:number|null;
 journalArDebitKobo:number|null;journalRevenueCreditKobo:number|null;
 journalCashDebitKobo:number|null;journalCogsDebitKobo:number|null;
 journalInventoryCreditKobo:number|null
};
const validMoney=(value:unknown):number|null=>{
 const number=Number(value);
 return Number.isSafeInteger(number)&&number>=0?number:null;
};

export async function routeBakeryFinanceBridge(
 request:Request,env:Env,context:SessionContext
):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname!=='/api/bakery/accountability/finance-bridge'||request.method!=='GET')return null;
 if(!context.companies.some(x=>x.id===COMPANY)
   ||!hasPermission(context,'bakery.reconciliation','view',COMPANY)
   ||!hasPermission(context,'finance.ledger','view',COMPANY))
  return json({error:'Bakery reconciliation and Finance ledger view permissions are both required.'},403);
 const afterOrderId=(url.searchParams.get('afterOrderId')||'').trim();
 if(afterOrderId.length>128||url.searchParams.getAll('afterOrderId').length>1)
  return json({error:'Invalid sales-order page cursor.'},400);
 const records=await env.DB.prepare(`SELECT
     so.id AS salesOrderId,so.order_no AS orderNo,so.order_date AS orderDate,
     so.total_kobo AS totalKobo,so.payment_status AS paymentStatus,
     so.amount_paid_kobo AS orderPaidKobo,
     COALESCE((SELECT SUM(pm.amount_kobo) FROM payments pm WHERE pm.company_id=so.company_id
       AND pm.sales_order_id=so.id AND pm.status='confirmed'),0) AS confirmedPaymentsKobo,
     COALESCE((SELECT SUM(pm.amount_kobo) FROM payments pm WHERE pm.company_id=so.company_id
       AND pm.sales_order_id=so.id AND pm.status='confirmed' AND pm.method='cash'),0) AS confirmedCashKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml WHERE ml.company_id=so.company_id
       AND ml.sales_order_id=so.id AND ml.status='cash_received' AND ml.direction='in'),0) AS cashLedgerKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml WHERE ml.company_id=so.company_id
       AND ml.sales_order_id=so.id AND ml.status IN ('pos_received','transfer_received')
       AND ml.direction='in'),0) AS noncashLedgerKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml WHERE ml.company_id=so.company_id
       AND ml.sales_order_id=so.id AND ml.status='refunded' AND ml.direction='out'),0) AS refundLedgerKobo,
     fp.status AS financeSourceStatus,fp.posted_amount_kobo AS financePostedKobo,
     fp.cost_amount_kobo AS financeCostKobo,
     fp.journal_entry_id AS sourceJournalId,je.id AS journalId,je.status AS journalStatus,
     (SELECT COALESCE(SUM(jl.debit_kobo),0) FROM journal_lines jl
       WHERE jl.journal_entry_id=je.id) AS journalDebitKobo,
     (SELECT COALESCE(SUM(jl.credit_kobo),0) FROM journal_lines jl
       WHERE jl.journal_entry_id=je.id) AS journalCreditKobo,
     (SELECT COUNT(*) FROM journal_lines jl WHERE jl.journal_entry_id=je.id) AS journalLineCount,
     (SELECT COALESCE(SUM(CASE WHEN fa.code='1100' AND fa.company_id=so.company_id
       THEN jl.debit_kobo ELSE 0 END),0)
      FROM journal_lines jl LEFT JOIN finance_accounts fa ON fa.id=jl.account_id
      WHERE jl.journal_entry_id=je.id) AS journalArDebitKobo,
     (SELECT COALESCE(SUM(CASE WHEN fa.code='4000' AND fa.company_id=so.company_id
       THEN jl.credit_kobo ELSE 0 END),0)
      FROM journal_lines jl LEFT JOIN finance_accounts fa ON fa.id=jl.account_id
      WHERE jl.journal_entry_id=je.id) AS journalRevenueCreditKobo,
     (SELECT COALESCE(SUM(CASE WHEN fa.code='1000' AND fa.company_id=so.company_id
       THEN jl.debit_kobo ELSE 0 END),0)
      FROM journal_lines jl LEFT JOIN finance_accounts fa ON fa.id=jl.account_id
      WHERE jl.journal_entry_id=je.id) AS journalCashDebitKobo,
     (SELECT COALESCE(SUM(CASE WHEN fa.code='5000' AND fa.company_id=so.company_id
       THEN jl.debit_kobo ELSE 0 END),0)
      FROM journal_lines jl LEFT JOIN finance_accounts fa ON fa.id=jl.account_id
      WHERE jl.journal_entry_id=je.id) AS journalCogsDebitKobo,
     (SELECT COALESCE(SUM(CASE WHEN fa.code='1200' AND fa.company_id=so.company_id
       THEN jl.credit_kobo ELSE 0 END),0)
      FROM journal_lines jl LEFT JOIN finance_accounts fa ON fa.id=jl.account_id
      WHERE jl.journal_entry_id=je.id) AS journalInventoryCreditKobo,
     fp.receivable_id AS sourceReceivableId,fr.id AS receivableId,
     fr.balance_kobo AS receivableBalanceKobo,
     fr.amount_kobo AS receivableOriginalKobo,fr.paid_kobo AS receivablePaidKobo,
     fr.status AS receivableStatus,
     CASE WHEN fr.id IS NULL THEN NULL ELSE
      COALESCE((SELECT SUM(rp.amount_kobo) FROM finance_receivable_payments rp
       WHERE rp.receivable_id=fr.id),0) END AS receivableRecordedPaymentsKobo,
     CASE WHEN fr.id IS NULL THEN NULL ELSE
      (SELECT COUNT(*) FROM finance_receivable_payments rp
       WHERE rp.receivable_id=fr.id) END AS receivablePaymentCount,
     CASE WHEN fr.id IS NULL THEN NULL ELSE
      (SELECT COUNT(*) FROM (
       SELECT lower(trim(rp.reference)) AS normalizedRef
       FROM finance_receivable_payments rp
       WHERE rp.receivable_id=fr.id AND length(trim(COALESCE(rp.reference,'')))>0
       GROUP BY lower(trim(rp.reference)) HAVING COUNT(*)>1
      )) END AS duplicateReceivablePaymentReferences,
     (SELECT COUNT(*) FROM journal_entries linked
      WHERE linked.company_id=so.company_id
        AND linked.source_module='sales' AND linked.source_type='sales_order'
        AND linked.source_id=so.id AND linked.status='posted') AS postedSourceJournalCount
   FROM sales_orders so
   JOIN bakery_order_details bd ON bd.sales_order_id=so.id
   LEFT JOIN finance_source_postings fp ON fp.company_id=so.company_id
     AND fp.source_module='sales' AND fp.source_type='sales_order' AND fp.source_id=so.id
   LEFT JOIN journal_entries je ON je.id=fp.journal_entry_id AND je.company_id=so.company_id
     AND je.source_module='sales' AND je.source_type='sales_order' AND je.source_id=so.id
   LEFT JOIN finance_receivables fr ON fr.id=fp.receivable_id AND fr.company_id=so.company_id
     AND fr.source_module='sales' AND fr.source_id=so.id
   WHERE so.company_id=? AND so.status='completed' AND so.id>?
   ORDER BY so.id LIMIT 101`).bind(COMPANY,afterOrderId).all<EvidenceRow>();
 const result=records.results||[],page=result.slice(0,100),hasMore=result.length>100;
 const items=page.map(row=>{
  const amounts={
   saleKobo:validMoney(row.totalKobo),
   orderReportedPaidKobo:validMoney(row.orderPaidKobo),
   confirmedPaymentRecordsKobo:validMoney(row.confirmedPaymentsKobo),
   confirmedCashRecordsKobo:validMoney(row.confirmedCashKobo),
   bakeryCashLedgerKobo:validMoney(row.cashLedgerKobo),
   bakeryNoncashLedgerKobo:validMoney(row.noncashLedgerKobo),
   bakeryRefundLedgerKobo:validMoney(row.refundLedgerKobo),
   financePostedKobo:row.financePostedKobo===null?null:validMoney(row.financePostedKobo),
    financeCostKobo:row.financeCostKobo===null?null:validMoney(row.financeCostKobo),
    journalArDebitKobo:row.journalId===null?null:validMoney(row.journalArDebitKobo),
    journalRevenueCreditKobo:row.journalId===null?null:validMoney(row.journalRevenueCreditKobo),
    journalCashDebitKobo:row.journalId===null?null:validMoney(row.journalCashDebitKobo),
    journalCogsDebitKobo:row.journalId===null?null:validMoney(row.journalCogsDebitKobo),
    journalInventoryCreditKobo:row.journalId===null?null:validMoney(row.journalInventoryCreditKobo),
   journalDebitsKobo:row.journalId===null?null:validMoney(row.journalDebitKobo),
   journalCreditsKobo:row.journalId===null?null:validMoney(row.journalCreditKobo),
   receivableOutstandingKobo:row.receivableId===null?null:validMoney(row.receivableBalanceKobo),
    receivableOriginalKobo:row.receivableId===null?null:validMoney(row.receivableOriginalKobo),
    receivablePaidKobo:row.receivableId===null?null:validMoney(row.receivablePaidKobo),
    financePaymentRecordsKobo:row.receivableId===null?null:validMoney(row.receivableRecordedPaymentsKobo)
   };
  const issues:string[]=[];
  const review:string[]=[];
  if(Object.entries(amounts).some(([key,value])=>value===null&&![
   'financePostedKobo','journalDebitsKobo','journalCreditsKobo','receivableOutstandingKobo'
  ].includes(key)))issues.push('invalid_operational_money');
  if(amounts.saleKobo!==null&&amounts.orderReportedPaidKobo!==null
    &&amounts.confirmedPaymentRecordsKobo!==null
    &&amounts.orderReportedPaidKobo!==amounts.confirmedPaymentRecordsKobo)
   issues.push('payment_records_disagree_with_order');
  if(amounts.confirmedCashRecordsKobo!==null&&amounts.bakeryCashLedgerKobo!==null
    &&amounts.confirmedCashRecordsKobo!==amounts.bakeryCashLedgerKobo)
   issues.push('cash_records_disagree_with_bakery_ledger');
  if(row.financeSourceStatus===null)review.push('finance_source_posting_not_recorded');
  else if(row.financeSourceStatus==='failed')issues.push('finance_source_posting_failed');
  else if(row.financeSourceStatus==='reversed')review.push('finance_source_posting_reversed');
  else if(row.financeSourceStatus==='posted'){
   if(!row.journalId||row.journalStatus!=='posted')issues.push('posted_journal_link_invalid');
   else if(amounts.journalDebitsKobo===null||amounts.journalCreditsKobo===null
     ||amounts.journalDebitsKobo!==amounts.journalCreditsKobo
     ||amounts.journalDebitsKobo===0)issues.push('journal_lines_not_balanced');
   if(amounts.saleKobo!==null&&amounts.financePostedKobo!==amounts.saleKobo)
    issues.push('finance_posted_amount_disagrees_with_sale');
   // Accounts must match the receivable-first auto-posting contract even if
   // aggregate journal debits equal credits. Unverified POS cash is NOT settled.
   if(row.journalId!==null&&row.journalStatus==='posted'){
    const cost=amounts.financeCostKobo,sale=amounts.saleKobo;
    if(cost===null)issues.push('invalid_finance_cost_amount');
    if(sale!==null&&amounts.journalArDebitKobo!==sale)
     issues.push('sales_journal_receivable_debit_mismatch');
    if(sale!==null&&amounts.journalRevenueCreditKobo!==sale)
     issues.push('sales_journal_revenue_credit_mismatch');
    if(amounts.journalCashDebitKobo!==0)
     issues.push('unverified_cash_recognized_in_sales_journal');
    if(cost!==null&&amounts.journalCogsDebitKobo!==cost)
     issues.push('sales_journal_cost_of_sales_mismatch');
    if(cost!==null&&amounts.journalInventoryCreditKobo!==cost)
     issues.push('sales_journal_inventory_credit_mismatch');
    if(!Number.isSafeInteger(Number(row.journalLineCount))
     ||Number(row.journalLineCount)!==(cost!==null&&cost>0?4:2))
     issues.push('unexpected_sales_journal_line_count');
   }
   if(!row.sourceReceivableId||!row.receivableId)issues.push('finance_receivable_link_invalid');
    if(!Number.isSafeInteger(Number(row.postedSourceJournalCount))
     ||Number(row.postedSourceJournalCount)!==1)issues.push('unexpected_posted_sales_journal_count');
    if(row.receivableId!==null){
     const original=amounts.receivableOriginalKobo,paid=amounts.receivablePaidKobo;
     const remaining=amounts.receivableOutstandingKobo,recorded=amounts.financePaymentRecordsKobo;
     if(original===null||paid===null||remaining===null||recorded===null)
      issues.push('invalid_finance_receivable_amount');
     else{
      if(original!==amounts.saleKobo)issues.push('finance_receivable_original_disagrees_with_sale');
      if(!Number.isSafeInteger(paid+remaining)||paid+remaining!==original)
       issues.push('finance_receivable_balance_inconsistent');
      if(recorded!==paid)issues.push('finance_payment_records_disagree_with_receivable');
     }
     if((row.receivableStatus==='paid'&&remaining!==0)
       ||(row.receivableStatus==='open'&&paid!==0)
       ||(row.receivableStatus==='part_paid'&&!(paid!==null&&remaining!==null&&paid>0&&remaining>0))
       ||(remaining===0&&row.receivableStatus!=='paid'))
      issues.push('finance_receivable_status_inconsistent');
     if(!Number.isSafeInteger(Number(row.duplicateReceivablePaymentReferences))
       ||Number(row.duplicateReceivablePaymentReferences)>0)
      issues.push('duplicate_finance_payment_references');
     if(Number(row.receivablePaymentCount)>0)
      review.push('finance_payment_evidence_not_bank_verified');
    }
   }else issues.push('unrecognised_finance_source_status');
  if(amounts.confirmedCashRecordsKobo!==null&&amounts.confirmedCashRecordsKobo>0
    &&row.financeSourceStatus==='posted'&&amounts.receivableOutstandingKobo!==null
    &&amounts.receivableOutstandingKobo>0)
   review.push('cash_evidence_against_open_finance_receivable');
  if(amounts.bakeryNoncashLedgerKobo!==null&&amounts.bakeryNoncashLedgerKobo>0)
   review.push('external_settlement_evidence_not_assessed');
  if(amounts.bakeryRefundLedgerKobo!==null&&amounts.bakeryRefundLedgerKobo>0
    ||row.paymentStatus==='refunded')review.push('refund_or_reversal_needs_separate_accounting_review');
  return{
   salesOrderId:row.salesOrderId,orderNo:row.orderNo,orderDate:row.orderDate,
   paymentStatus:row.paymentStatus,amounts,financeSourceStatus:row.financeSourceStatus,
   journalId:row.journalId,receivableId:row.receivableId,
    receivableStatus:row.receivableStatus,postedSourceJournalCount:Number(row.postedSourceJournalCount),
    journalLineCount:row.journalId===null?null:Number(row.journalLineCount),
    financePaymentRecordCount:row.receivableId===null?null:Number(row.receivablePaymentCount),
    duplicateFinancePaymentReferences:row.receivableId===null?null:Number(row.duplicateReceivablePaymentReferences),
    issues,reviewRequired:review,
   state:issues.length?'exception':review.length?'review_required':'no_flag_on_page'
  };
 });
 const last=page.at(-1);
 return json({companyId:COMPANY,readOnly:true,scope:'completed_bakery_sales_page_only',
  items,returned:items.length,exceptionsOnPage:items.filter(x=>x.issues.length>0).length,
  reviewsOnPage:items.filter(x=>x.reviewRequired.length>0).length,
  hasMore,nextCursor:hasMore&&last?{afterOrderId:last.salesOrderId}:null,
  bankSettlementAssessed:false,financePaymentSettlementAssessed:false,
   otherJournalSourcesAssessed:false,dispatchRemittancesAssessed:false,
  explanation:'Read-only evidence compares sales journals to chart-of-accounts amounts and receivable balances. This report never certifies bank settlement or clears a receivable.'});
}


type DispatchEvidenceRow={
 dispatchId:string;dispatchNo:string;dispatchStatus:string;
 dispatchedQty:number;accountedQty:number;declaredReturnsQty:number;verifiedReturnsQty:number;
 soldValueKobo:number;cashReceivedKobo:number;externalReceivedKobo:number;
 refundedKobo:number;outstandingKobo:number;posChargesKobo:number;
 duplicateCashRefGroups:number;missingCashReferences:number
};

// Agent dispatch cash evidence must not be conflated with Finance GL posting
// or provider/bank settlement. This page checks existing immutable evidence.
export async function routeBakeryDispatchFinanceBridge(
 request:Request,env:Env,context:SessionContext
):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname!=='/api/bakery/accountability/dispatch-finance-bridge'||request.method!=='GET')return null;
 if(!context.companies.some(x=>x.id===COMPANY)
   ||!hasPermission(context,'bakery.reconciliation','view',COMPANY)
   ||!hasPermission(context,'finance.ledger','view',COMPANY))
  return json({error:'Bakery reconciliation and Finance ledger view permissions are both required.'},403);
 const afterDispatchId=(url.searchParams.get('afterDispatchId')||'').trim();
 if(afterDispatchId.length>128||url.searchParams.getAll('afterDispatchId').length>1)
  return json({error:'Invalid dispatch page cursor.'},400);
 const rows=await env.DB.prepare(`SELECT d.id AS dispatchId,d.dispatch_no AS dispatchNo,
     d.status AS dispatchStatus,
     COALESCE((SELECT SUM(di.quantity) FROM bakery_dispatch_items di
       WHERE di.dispatch_id=d.id),0) AS dispatchedQty,
     COALESCE((SELECT SUM(bl.quantity) FROM bakery_bread_ledger bl
       WHERE bl.dispatch_id=d.id AND bl.company_id=d.company_id
       AND bl.status IN ('sold','returned','damaged','promotional','staff_consumption','in_store')),0) AS accountedQty,
     COALESCE((SELECT SUM(bl.quantity) FROM bakery_bread_ledger bl
       WHERE bl.dispatch_id=d.id AND bl.company_id=d.company_id AND bl.status='returned'),0) AS declaredReturnsQty,
     COALESCE((SELECT SUM(rr.quantity) FROM bakery_dispatch_return_receipts rr
       WHERE rr.dispatch_id=d.id AND rr.company_id=d.company_id),0) AS verifiedReturnsQty,
     COALESCE((SELECT SUM(bl.quantity*COALESCE(bl.unit_price_kobo,di.unit_price_kobo))
       FROM bakery_bread_ledger bl
       JOIN bakery_dispatch_items di ON di.dispatch_id=bl.dispatch_id AND di.product_id=bl.product_id
       WHERE bl.dispatch_id=d.id AND bl.company_id=d.company_id AND bl.status='sold'),0) AS soldValueKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml
       WHERE ml.dispatch_id=d.id AND ml.company_id=d.company_id
       AND ml.status='cash_received' AND ml.direction='in'),0) AS cashReceivedKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml
       WHERE ml.dispatch_id=d.id AND ml.company_id=d.company_id
       AND ml.status IN ('pos_received','transfer_received') AND ml.direction='in'),0) AS externalReceivedKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml
       WHERE ml.dispatch_id=d.id AND ml.company_id=d.company_id
       AND ml.status='refunded' AND ml.direction='out'),0) AS refundedKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml
       WHERE ml.dispatch_id=d.id AND ml.company_id=d.company_id AND ml.status='outstanding'),0) AS outstandingKobo,
     COALESCE((SELECT SUM(ml.amount_kobo) FROM bakery_money_ledger ml
       WHERE ml.dispatch_id=d.id AND ml.company_id=d.company_id AND ml.status='pos_charges'),0) AS posChargesKobo,
     (SELECT COUNT(DISTINCT lower(trim(ml.reference)))
       FROM bakery_money_ledger ml
       WHERE ml.dispatch_id=d.id AND ml.company_id=d.company_id
         AND ml.status='cash_received' AND ml.direction='in'
         AND ml.reference IS NOT NULL AND length(trim(ml.reference))>0
         AND EXISTS(SELECT 1 FROM bakery_money_ledger dup
           WHERE dup.company_id=ml.company_id AND dup.dispatch_id=ml.dispatch_id
             AND dup.status='cash_received' AND dup.direction='in'
             AND dup.id<>ml.id
             AND lower(trim(dup.reference))=lower(trim(ml.reference)))) AS duplicateCashRefGroups,
     (SELECT COUNT(*) FROM bakery_money_ledger ml
       WHERE ml.dispatch_id=d.id AND ml.company_id=d.company_id
       AND ml.status='cash_received' AND ml.direction='in'
       AND length(trim(COALESCE(ml.reference,'')))<4) AS missingCashReferences
   FROM bakery_dispatches d
   WHERE d.company_id=? AND d.id>?
   ORDER BY d.id LIMIT 101`).bind(COMPANY,afterDispatchId).all<DispatchEvidenceRow>();
 const all=rows.results||[],page=all.slice(0,100),hasMore=all.length>100;
 const items=page.map(row=>{
  const money={
   soldKobo:validMoney(row.soldValueKobo),
   cashReceivedKobo:validMoney(row.cashReceivedKobo),
   externalReceivedKobo:validMoney(row.externalReceivedKobo),
   refundedKobo:validMoney(row.refundedKobo),
   outstandingKobo:validMoney(row.outstandingKobo),
   posChargesKobo:validMoney(row.posChargesKobo)
  };
  const quantities={
   dispatched:Number(row.dispatchedQty),accounted:Number(row.accountedQty),
   returnsDeclared:Number(row.declaredReturnsQty),returnsVerified:Number(row.verifiedReturnsQty)
  };
  const issues:string[]=[],review:string[]=[];
  if(Object.values(money).some(x=>x===null))issues.push('invalid_money_evidence');
  if(Object.values(quantities).some(x=>!Number.isSafeInteger(x)||x<0))
   issues.push('invalid_bread_quantity');
  const moneySafe=Object.values(money).every(x=>x!==null);
  const receivedKobo=moneySafe?money.cashReceivedKobo!+money.externalReceivedKobo!-money.refundedKobo!:null;
  const cashVarianceKobo=receivedKobo!==null&&money.soldKobo!==null
   &&Number.isSafeInteger(receivedKobo)&&Number.isSafeInteger(money.soldKobo-receivedKobo)
   ?money.soldKobo-receivedKobo:null;
  const breadVariance=Number.isSafeInteger(quantities.dispatched-quantities.accounted)
   ?quantities.dispatched-quantities.accounted:null;
  const returnVariance=Number.isSafeInteger(quantities.returnsDeclared-quantities.returnsVerified)
   ?quantities.returnsDeclared-quantities.returnsVerified:null;
  if(cashVarianceKobo===null||breadVariance===null||returnVariance===null)
   issues.push('unsafe_reconciliation_arithmetic');
  if(Number(row.duplicateCashRefGroups)>0)issues.push('duplicate_cash_receipt_references');
  if(Number(row.missingCashReferences)>0)issues.push('cash_receipt_reference_missing');
  if(returnVariance!==null&&returnVariance<0)issues.push('verified_returns_exceed_declarations');
  else if(returnVariance!==null&&returnVariance>0)review.push('declared_returns_await_physical_verification');
  if(row.dispatchStatus==='closed'){
   if(breadVariance!==0)issues.push('closed_dispatch_bread_variance');
   if(cashVarianceKobo!==0)issues.push('closed_dispatch_money_variance');
   if(returnVariance!==0)issues.push('closed_dispatch_return_verification_variance');
  }else{
   if(breadVariance!==0)review.push('dispatch_bread_not_fully_accounted');
   if(cashVarianceKobo!==0)review.push('dispatch_money_not_fully_remitted');
  }
  if(money.externalReceivedKobo!==null&&money.externalReceivedKobo>0)
   review.push('external_payment_settlement_not_verified');
  if(money.refundedKobo!==null&&money.refundedKobo>0)
   review.push('refund_finance_posting_not_assessed');
  if(money.posChargesKobo!==null&&money.posChargesKobo>0)
   review.push('pos_charges_finance_posting_not_assessed');
  if(money.outstandingKobo!==null&&money.outstandingKobo>0)
   review.push('outstanding_is_not_received_cash');
  if(receivedKobo!==null&&receivedKobo>0)
   review.push('dispatch_cash_not_reconciled_to_finance_gl_or_bank');
  return{
   dispatchId:row.dispatchId,dispatchNo:row.dispatchNo,dispatchStatus:row.dispatchStatus,
   quantities,breadVariance,returnVariance,money,receivedKobo,cashVarianceKobo,
   duplicateCashReferenceGroups:Number(row.duplicateCashRefGroups),
   missingCashReferences:Number(row.missingCashReferences),
   issues,reviewRequired:review,
   state:issues.length?'exception':review.length?'review_required':'no_flag_on_page'
  };
 });
 const last=page.at(-1);
 return json({
  companyId:COMPANY,readOnly:true,scope:'bakery_dispatch_page_only',
  items,returned:items.length,exceptionsOnPage:items.filter(x=>x.issues.length>0).length,
  reviewsOnPage:items.filter(x=>x.reviewRequired.length>0).length,
  hasMore,nextCursor:hasMore&&last?{afterDispatchId:last.dispatchId}:null,
  bankSettlementAssessed:false,financeGlLinkAssessed:false,sourceAccountingEntriesCreated:false,
  explanation:'Dispatch remittance and custody evidence only. Receipt references, matching totals and ledger entries do not establish external settlement or a Finance journal.'
 });
}
