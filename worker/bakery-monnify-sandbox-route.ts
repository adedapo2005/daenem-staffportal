import {hasPermission,type AuthEnv,type SessionContext} from './auth';
import {initializeBakeryMonnifySandbox,configuredSandbox,validCheckout,type SandboxMonnifyEnv} from './bakery-monnify-sandbox-init';
import {verifyBoundBakeryMonnifyTransaction,type MonnifyVerificationEnv} from './bakery-monnify-verification';

interface Env extends AuthEnv,SandboxMonnifyEnv,MonnifyVerificationEnv {}
const C='company-bakery';
const reply=(data:Record<string,unknown>,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const permitted=(ctx:SessionContext,level:'view'|'edit')=>ctx.companies.some(c=>c.id===C)&&hasPermission(ctx,'bakery.reconciliation',level,C)&&hasPermission(ctx,'finance.receivables',level,C);
const validId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(v)?v:null;
const payload=async(req:Request):Promise<Record<string,unknown>|null>=>{try{if(Number(req.headers.get('content-length')||0)>2048)return null;const raw=await req.text();if(raw.length>2048)return null;const p=JSON.parse(raw);return p&&typeof p==='object'&&!Array.isArray(p)?p:null}catch{return null}};
const source=async(env:Env,id:string)=>env.DB.prepare(`SELECT fr.id,fr.company_id AS companyId,fr.source_module AS sourceModule,fr.amount_kobo AS amountKobo,fr.paid_kobo AS paidKobo,fr.balance_kobo AS balanceKobo,fr.status AS arStatus,so.order_no AS orderNo,so.status AS saleStatus,so.payment_status AS salePaymentStatus,so.amount_paid_kobo AS salePaidKobo,so.total_kobo AS saleTotalKobo,c.email AS email FROM finance_receivables fr JOIN sales_orders so ON so.id=fr.source_id AND so.company_id=fr.company_id LEFT JOIN customers c ON c.id=so.customer_id AND c.company_id=so.company_id AND c.active=1 WHERE fr.id=? AND fr.company_id=?`).bind(id,C).first<Record<string,unknown>>();
const eligible=(row:Record<string,unknown>|null)=>!!row&&row.companyId===C&&row.sourceModule==='sales'&&['open','overdue'].includes(String(row.arStatus))&&row.saleStatus==='completed'&&row.salePaymentStatus==='unpaid'&&row.paidKobo===0&&row.salePaidKobo===0&&Number.isSafeInteger(row.amountKobo)&&Number(row.amountKobo)>0&&row.balanceKobo===row.amountKobo&&row.saleTotalKobo===row.amountKobo;
const intent=async(env:Env,id:string)=>env.DB.prepare(`SELECT id,receivable_id AS receivableId,payment_reference AS paymentReference,expected_amount_kobo AS amountKobo,provider_transaction_reference AS transactionReference,checkout_url AS checkoutUrl,status,initialized_at AS initializedAt FROM bakery_monnify_sandbox_intents WHERE id=? AND company_id=?`).bind(id,C).first<Record<string,unknown>>();
export async function routeBakeryMonnifySandbox(request:Request,env:Env,ctx:SessionContext,fetcher:typeof fetch=fetch):Promise<Response|null>{
 const path=new URL(request.url).pathname,base='/api/bakery/accountability/monnify-sandbox';
 if(!path.startsWith(base))return null;
 if(!permitted(ctx,path===base+'/status'?'view':'edit'))return reply({error:'Bakery and Finance permissions are required.'},403);
 if(path===base+'/status'&&request.method==='GET'){
  const id=validId(new URL(request.url).searchParams.get('intentId'));if(!id)return reply({error:'Valid intent ID required.'},400);
  const record=await intent(env,id);if(!record)return reply({error:'Intent not found.'},404);
  return reply({intentId:record.id,status:record.status,amountKobo:record.amountKobo,currency:'NGN',bankSettlementConfirmed:false,financeReceivableUpdated:false});
 }
 if(!['POST'].includes(request.method)||![base+'/initiate',base+'/verify'].includes(path))return reply({error:'Action unavailable.'},404);
 if(!configuredSandbox(env))return reply({error:'Sandbox-only payment integration is not configured.'},503);
 const data=await payload(request);if(!data)return reply({error:'Invalid request.'},400);
 if(path===base+'/initiate'){
  const arId=validId(data.receivableId);if(!arId||Object.keys(data).some(k=>k!=='receivableId'))return reply({error:'Only receivableId is accepted.'},400);
  const row=await source(env,arId);if(!eligible(row))return reply({error:'Eligible unpaid Bakery sale not found.'},409);
  const email=String(row?.email||'').trim();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||email.length>254)return reply({error:'Registered customer email is required.'},409);
  const iid='bakery-monnify-intent-'+crypto.randomUUID(),reference='BAK-'+crypto.randomUUID(),audit='audit-'+crypto.randomUUID();
  try{
   const out=await env.DB.batch([
    env.DB.prepare(`INSERT INTO bakery_monnify_sandbox_intents(id,company_id,receivable_id,payment_reference,expected_amount_kobo,currency,provider_environment,status,created_by) SELECT ?,?, ?,?,?,'NGN','sandbox','reserved',? WHERE EXISTS(SELECT 1 FROM finance_receivables fr JOIN sales_orders so ON so.id=fr.source_id AND so.company_id=fr.company_id WHERE fr.id=? AND fr.company_id=? AND fr.source_module='sales' AND fr.amount_kobo=? AND fr.paid_kobo=0 AND fr.balance_kobo=fr.amount_kobo AND fr.status IN ('open','overdue') AND so.status='completed' AND so.payment_status='unpaid' AND so.amount_paid_kobo=0 AND so.total_kobo=fr.amount_kobo)`).bind(iid,C,arId,reference,row?.amountKobo,ctx.employee.id,arId,C,row?.amountKobo),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) SELECT ?,?,?,'bakery','monnify_sandbox_intent_reserved','bakery_monnify_sandbox_intent',?,?,'web' WHERE changes()=1`).bind(audit,ctx.employee.id,C,iid,JSON.stringify({receivableId:arId})),
    env.DB.prepare(`SELECT json_extract(CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND action='monnify_sandbox_intent_reserved') THEN '{' ELSE '{}' END,'$')`).bind(audit)
   ]);
   if(Number(out[0]?.meta?.changes||0)!==1||Number(out[1]?.meta?.changes||0)!==1)return reply({error:'Reservation conflict.'},409);
  }catch{return reply({error:'Reservation conflict; do not retry checkout without review.'},409)}
  const provider=await initializeBakeryMonnifySandbox(env,{paymentReference:reference,expectedAmountKobo:Number(row?.amountKobo),customerEmail:email,orderNo:String(row?.orderNo)},fetcher);
  if(provider.state!=='initialized'){
   try{await env.DB.prepare(`UPDATE bakery_monnify_sandbox_intents SET status='review_required' WHERE id=? AND status='reserved'`).bind(iid).run()}catch{}
   return reply({error:'Provider initiation uncertain; investigation required.',intentId:iid},503);
  }
  const audit2='audit-'+crypto.randomUUID();
  try{
   const out=await env.DB.batch([
    env.DB.prepare(`UPDATE bakery_monnify_sandbox_intents SET status='initialized',provider_transaction_reference=?,checkout_url=?,initialized_at=CURRENT_TIMESTAMP WHERE id=? AND status='reserved'`).bind(provider.transactionReference,provider.checkoutUrl,iid),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) SELECT ?,?,?,'bakery','monnify_sandbox_intent_initialized','bakery_monnify_sandbox_intent',?,?,'web' WHERE changes()=1`).bind(audit2,ctx.employee.id,C,iid,JSON.stringify({providerTransactionReference:provider.transactionReference})),
    env.DB.prepare(`SELECT json_extract(CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND action='monnify_sandbox_intent_initialized') THEN '{' ELSE '{}' END,'$')`).bind(audit2)
   ]);
   if(Number(out[0]?.meta?.changes||0)!==1||Number(out[1]?.meta?.changes||0)!==1)return reply({error:'Provider result requires reconciliation.',intentId:iid},503);
  }catch{return reply({error:'Provider result requires reconciliation.',intentId:iid},503)}
  return reply({intentId:iid,status:'initialized',checkoutUrl:provider.checkoutUrl,amountKobo:row?.amountKobo,currency:'NGN',bankSettlementConfirmed:false,financeReceivableUpdated:false},201);
 }
 const iid=validId(data.intentId);if(!iid||Object.keys(data).some(k=>k!=='intentId'))return reply({error:'Only intentId is accepted.'},400);
 const bound=await intent(env,iid);if(!bound||bound.status!=='initialized'||!bound.transactionReference)return reply({error:'Initialized intent required.'},409);
 const row=await source(env,String(bound.receivableId));if(!eligible(row)||row?.amountKobo!==bound.amountKobo)return reply({error:'Receivable eligibility changed.'},409);
 const evidence=await verifyBoundBakeryMonnifyTransaction(env,{companyId:C,receivableId:String(bound.receivableId),paymentReference:String(bound.paymentReference),expectedAmountKobo:Number(bound.amountKobo),expectedTransactionReference:String(bound.transactionReference),currency:'NGN',referenceOrigin:'server_initiated'},fetcher);
 const eid='bakery-monnify-inquiry-'+crypto.randomUUID(),audit='audit-'+crypto.randomUUID();
 try{
  const result=await env.DB.batch([
   env.DB.prepare(`INSERT INTO bakery_monnify_collection_inquiries(id,intent_id,company_id,collection_state,provider_status,amount_paid_kobo,provider_transaction_reference,checked_by) VALUES(?,?,?,?,?,?,?,?)`).bind(eid,iid,C,evidence.state,evidence.providerStatus,evidence.amountPaidKobo,evidence.providerTransactionReference,ctx.employee.id),
   env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) SELECT ?,?,?,'bakery','monnify_sandbox_collection_inquiry','bakery_monnify_collection_inquiry',?,?,'web' WHERE changes()=1`).bind(audit,ctx.employee.id,C,eid,JSON.stringify({state:evidence.state,intentId:iid})),
   env.DB.prepare(`SELECT json_extract(CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND action='monnify_sandbox_collection_inquiry') THEN '{' ELSE '{}' END,'$')`).bind(audit)
  ]);
  if(Number(result[0]?.meta?.changes||0)!==1||Number(result[1]?.meta?.changes||0)!==1)return reply({error:'Inquiry evidence could not be saved.'},503);
 }catch{return reply({error:'Inquiry evidence could not be saved.'},503)}
 return reply({intentId:iid,inquiryId:eid,...evidence});
}
