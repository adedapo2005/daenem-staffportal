// Backend-only Monnify transaction inquiry. Do NOT turn the query response
// into cash/bank settlement or a Finance receivable update. The caller must
// first retrieve the immutable, server-created receivable/payment-reference
// binding; client callbacks, screenshots and cashier references do not qualify.
//
// Official endpoints (sandbox and live):
// POST /api/v1/auth/login
// GET /api/v2/merchant/transactions/query?paymentReference=...
// Monnify PAID confirms customer collection, NOT merchant bank settlement.
export interface MonnifyVerificationEnv {
 MONNIFY_MODE?:string;
 MONNIFY_API_KEY?:string;
 MONNIFY_SECRET_KEY?:string;
}
export interface BoundBakeryPayment {
 companyId:string;
 receivableId:string;
 paymentReference:string;
 expectedAmountKobo:number;
 currency:'NGN';
 // Must have been persisted BEFORE a payment through the trusted server
 // payment-initiation workflow; not supplied by a caller of a public route.
 referenceOrigin:'server_initiated';
 expectedTransactionReference?:string;
}
type State='not_configured'|'invalid_binding'|'provider_unavailable'
 |'reference_mismatch_review'|'amount_mismatch_review'
 |'provider_paid_not_settled'|'partial_payment_review'
 |'reversed_or_refunded_review'|'not_paid'
 |'provider_status_review';
export interface MonnifyTransactionEvidence{
 state:State;
 providerStatus:string|null;
 amountPaidKobo:number|null;
 providerTransactionReference:string|null;
 // Never infer bank or merchant wallet settlement from a transaction query.
 bankSettlementConfirmed:false;
 financeReceivableUpdated:false;
 settlementAssessed:false;
 providerQuerySucceeded:boolean;
}
const value=(state:State,providerStatus:string|null=null,
 amountPaidKobo:number|null=null,providerTransactionReference:string|null=null,
 providerQuerySucceeded=false):MonnifyTransactionEvidence=>({
 state,providerStatus,amountPaidKobo,providerTransactionReference,
 bankSettlementConfirmed:false,financeReceivableUpdated:false,
 settlementAssessed:false,providerQuerySucceeded
});
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const parseNgnKobo=(raw:unknown):number|null=>{
 if(typeof raw!=='string'&&typeof raw!=='number')return null;
 const text=String(raw);
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text))return null;
 const parts=text.split('.'),whole=Number(parts[0]);
 const fraction=Number((parts[1]||'').padEnd(2,'0'));
 const amount=whole*100+fraction;
 return Number.isSafeInteger(amount)&&amount>=0?amount:null;
};
const jsonBody=async(response:Response):Promise<Record<string,unknown>|null>=>{
 const length=Number(response.headers.get('content-length')||0);
 if(!response.ok||(Number.isFinite(length)&&length>65536))return null;
 try{
  const text=await response.text();
  if(text.length>65536)return null;
  const body=JSON.parse(text);
  return body&&typeof body==='object'&&!Array.isArray(body)?body:null;
 }catch{return null}
};
const validBinding=(binding:BoundBakeryPayment):boolean=>
 binding.companyId==='company-bakery'
 &&binding.currency==='NGN'
 &&binding.referenceOrigin==='server_initiated'
 &&/^[a-zA-Z0-9._:|/-]{1,128}$/.test(binding.paymentReference)
 &&/^[a-zA-Z0-9._:-]{1,128}$/.test(binding.receivableId)
 &&Number.isSafeInteger(binding.expectedAmountKobo)
 &&binding.expectedAmountKobo>0
 &&(!binding.expectedTransactionReference
  ||/^[a-zA-Z0-9._:|/-]{1,200}$/.test(binding.expectedTransactionReference));

export async function verifyBoundBakeryMonnifyTransaction(
 env:MonnifyVerificationEnv,binding:BoundBakeryPayment,
 fetcher:typeof fetch=fetch
):Promise<MonnifyTransactionEvidence>{
 if(!validBinding(binding))return value('invalid_binding');
 const mode=str(env.MONNIFY_MODE),key=str(env.MONNIFY_API_KEY),
 secret=str(env.MONNIFY_SECRET_KEY);
 if(!['sandbox','live'].includes(mode)||!key||!secret
   ||!/^[\x21-\x7e]{1,256}$/.test(key)
   ||!/^[\x21-\x7e]{1,256}$/.test(secret)
   ||(mode==='live'&&key.startsWith('MK_TEST_')))
  return value('not_configured');

 const origin=mode==='sandbox'
  ?'https://sandbox.monnify.com':'https://api.monnify.com';
 try{
  const auth=await fetcher(origin+'/api/v1/auth/login',{
   method:'POST',redirect:'error',cache:'no-store',
   headers:{authorization:'Basic '+btoa(key+':'+secret),
    accept:'application/json'},
   signal:AbortSignal.timeout(8000)
  });
  const authData=await jsonBody(auth);
  const tokenBody=authData?.responseBody;
  const token=str(tokenBody&&typeof tokenBody==='object'
   ?(tokenBody as Record<string,unknown>).accessToken:null);
  if(authData?.requestSuccessful!==true
   ||String(authData.responseCode)!=='0'
   ||token.length<12||token.length>4096)return value('provider_unavailable');

  const url=new URL('/api/v2/merchant/transactions/query',origin);
  url.searchParams.set('paymentReference',binding.paymentReference);
  const response=await fetcher(url.toString(),{
   method:'GET',redirect:'error',cache:'no-store',
   headers:{authorization:'Bearer '+token,accept:'application/json'},
   signal:AbortSignal.timeout(8000)
  });
  const data=await jsonBody(response);
  const body=data?.responseBody;
  if(data?.requestSuccessful!==true||String(data.responseCode)!=='0'
    ||!body||typeof body!=='object'||Array.isArray(body))
    return value('provider_unavailable');
  const b=body as Record<string,unknown>;
  const status=str(b.paymentStatus).toUpperCase(),
   reference=str(b.paymentReference),
   transactionReference=str(b.transactionReference),
   currency=str(b.currencyCode||b.currency),
   amount=parseNgnKobo(b.amountPaid);
  if(reference!==binding.paymentReference
    ||!transactionReference||transactionReference.length>200
    ||(binding.expectedTransactionReference
      &&binding.expectedTransactionReference!==transactionReference)
    ||currency!=='NGN'||amount===null)
    return value('reference_mismatch_review',status,amount,null,true);

  if(status==='REVERSED'||status==='REFUNDED')
   return value('reversed_or_refunded_review',status,amount,transactionReference,true);
  if(status==='PARTIALLY_PAID'||status==='UNDERPAID')
   return value('partial_payment_review',status,amount,transactionReference,true);
  if(status==='PAID'){
   return value(amount===binding.expectedAmountKobo
    ?'provider_paid_not_settled':'amount_mismatch_review',
    status,amount,transactionReference,true);
  }
  if(status==='OVERPAID')
   return value('amount_mismatch_review',status,amount,transactionReference,true);
  if(['PENDING','FAILED','CANCELLED','ABANDONED','EXPIRED'].includes(status))
   return value('not_paid',status,amount,transactionReference,true);
  return value('provider_status_review',status,amount,transactionReference,true);
 }catch{
  // No credentials, response payload, URLs or customer PII are logged.
  return value('provider_unavailable');
 }
}
