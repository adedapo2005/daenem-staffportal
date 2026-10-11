import {hasPermission,type AuthEnv,type SessionContext} from './auth';
import {reconcileFulfilledSalesOrders} from './finance-sales-autopost';

interface Env extends AuthEnv {}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const isOwner=(context:SessionContext)=>context.roles.some(r=>r.code==='owner');
const member=(context:SessionContext,companyId:string)=>isOwner(context)||context.companies.some(c=>c.id===companyId);
const canView=(context:SessionContext,companyId:string)=>isOwner(context)||hasPermission(context,'finance.ledger','view',companyId)||hasPermission(context,'finance.reports','view',companyId);
const canRun=(context:SessionContext,companyId:string)=>isOwner(context)||hasPermission(context,'finance.journal','create',companyId)||hasPermission(context,'finance.journal','manage',companyId);

async function status(request:Request,env:Env,context:SessionContext){
 const companyId=new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'';
 if(!companyId||!member(context,companyId)||!canView(context,companyId))return json({error:'Access is not assigned.'},403);
 const [company,pending,posted,failed,recent]=await Promise.all([
   env.DB.prepare(`SELECT id,name FROM companies WHERE id=? AND active=1`).bind(companyId).first<{id:string;name:string}>(),
   env.DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(so.total_kobo),0) AS amountKobo FROM sales_orders so WHERE so.company_id=? AND so.status='completed' AND so.payment_status!='refunded' AND NOT EXISTS(SELECT 1 FROM finance_source_postings p WHERE p.company_id=so.company_id AND p.source_module='sales' AND p.source_type='sales_order' AND p.source_id=so.id AND p.status IN ('posted','reversed'))`).bind(companyId).first<{count:number;amountKobo:number}>(),
   env.DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(posted_amount_kobo),0) AS amountKobo,COALESCE(SUM(cost_amount_kobo),0) AS costKobo FROM finance_source_postings WHERE company_id=? AND source_module='sales' AND source_type='sales_order' AND status='posted'`).bind(companyId).first<{count:number;amountKobo:number;costKobo:number}>(),
   env.DB.prepare(`SELECT COUNT(*) AS count FROM finance_source_postings WHERE company_id=? AND source_module='sales' AND source_type='sales_order' AND status='failed'`).bind(companyId).first<{count:number}>(),
   env.DB.prepare(`SELECT p.id,p.source_id AS salesOrderId,so.order_no AS orderNo,so.order_date AS orderDate,so.status AS salesStatus,so.payment_status AS paymentStatus,so.total_kobo AS salesTotalKobo,p.posted_amount_kobo AS postedAmountKobo,p.cost_amount_kobo AS costAmountKobo,p.status,p.error_text AS errorText,p.posted_at AS postedAt,p.journal_entry_id AS journalEntryId,je.entry_no AS journalEntryNo,p.receivable_id AS receivableId,fr.invoice_no AS receivableInvoiceNo,fr.balance_kobo AS receivableBalanceKobo,c.name AS customerName FROM finance_source_postings p LEFT JOIN sales_orders so ON so.id=p.source_id LEFT JOIN customers c ON c.id=so.customer_id LEFT JOIN journal_entries je ON je.id=p.journal_entry_id LEFT JOIN finance_receivables fr ON fr.id=p.receivable_id WHERE p.company_id=? AND p.source_module='sales' AND p.source_type='sales_order' ORDER BY datetime(p.posted_at) DESC LIMIT 100`).bind(companyId).all<Record<string,unknown>>()
 ]);
 if(!company)return json({error:'Company not found.'},404);
 return json({company,pending:{count:Number(pending?.count||0),amountKobo:Number(pending?.amountKobo||0)},posted:{count:Number(posted?.count||0),amountKobo:Number(posted?.amountKobo||0),costKobo:Number(posted?.costKobo||0)},failed:{count:Number(failed?.count||0)},recent:recent.results||[],scheduler:{salesReconciliation:'hourly',socialPublishing:'every_5_minutes',idempotent:true}})
}

async function reconcile(request:Request,env:Env,context:SessionContext){
 let body:{companyId?:string;limit?:number};try{body=await request.json()}catch{return json({error:'Invalid reconciliation request.'},400)}
 const companyId=String(body.companyId||context.companies[0]?.id||'');if(!companyId||!member(context,companyId)||!canRun(context,companyId))return json({error:'Access is not assigned.'},403);
 const runId=`sales-reconciliation-${crypto.randomUUID()}`;
 const requestId=(request.headers.get('x-request-id')||request.headers.get('cf-ray')||crypto.randomUUID()).slice(0,128);
 const audit=(action:string,after:Record<string,unknown>)=>env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) VALUES(?,?,?,'finance',?,'finance_automation',?,?,'web',?)`).bind(`audit-${crypto.randomUUID()}`,context.employee.id,companyId,action,runId,JSON.stringify({runId,...after}),requestId).run();
 try{await audit('sales_reconciliation_run_started',{phase:'started'});}catch{return json({error:'Reconciliation could not start because required audit evidence could not be recorded.'},503)}
 let result:Awaited<ReturnType<typeof reconcileFulfilledSalesOrders>>;
 try{result=await reconcileFulfilledSalesOrders(env,Math.max(1,Math.min(200,Number(body.limit||75))),companyId)}catch{
  try{await audit('sales_reconciliation_run_failed',{phase:'failed',outcome:'reconciliation_failed'});}catch{return json({error:'Reconciliation stopped after its start was recorded, but the completion audit could not be recorded.',runId,runStatus:'interrupted'},503)}
  return json({error:'Reconciliation could not be completed.',runId,runStatus:'failed'},503)
 }
 try{await audit('sales_reconciliation_run',{phase:'completed',result});}catch{return json({error:'Reconciliation completed, but its completion audit could not be recorded.',companyId,runId,runStatus:'completed_with_audit_failure',result},503)}
 return json({ok:true,companyId,runId,result})
}

export async function routeFinanceAutomation(request:Request,env:Env,context:SessionContext):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname==='/api/finance/automation/status'&&request.method==='GET')return status(request,env,context);
 if(url.pathname==='/api/finance/automation/reconcile'&&request.method==='POST')return reconcile(request,env,context);
 return null;
}
