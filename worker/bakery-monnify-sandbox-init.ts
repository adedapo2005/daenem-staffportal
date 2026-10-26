// Backend-only, sandbox-only Monnify hosted-checkout initialization.
// PAID is not a bank/wallet settlement. Never write Finance A/R or GL here.
export interface SandboxMonnifyEnv {
 APP_STAGE:string;MONNIFY_MODE?:string;MONNIFY_SANDBOX_ENABLED?:string;
 MONNIFY_API_KEY?:string;MONNIFY_SECRET_KEY?:string;
 MONNIFY_CONTRACT_CODE?:string;MONNIFY_SANDBOX_REDIRECT_URL?:string;
}
export type SandboxInput={
 paymentReference:string;expectedAmountKobo:number;customerEmail:string;orderNo:string;
};
export type SandboxResult={state:'initialized'|'provider_unavailable'|'invalid_request'|'not_configured';
 transactionReference?:string;checkoutUrl?:string};
const origin='https://sandbox.monnify.com';
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
export const validCheckout=(raw:string)=>{
 try{
  const url=new URL(raw);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port
   &&!url.search&&!url.hash
   &&['sandbox.sdk.monnify.com','sandbox.monnify.com'].includes(url.hostname)
   &&url.pathname.startsWith('/checkout/')&&url.pathname.length>10;
 }catch{return false}
};
const validRedirect=(raw:string)=>{
 try{
  const url=new URL(raw);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port
   &&!url.search&&!url.hash
   &&url.hostname==='daenem-staffportal-api-staging.adedapo2005.workers.dev'
   &&['/','/workspace'].includes(url.pathname);
 }catch{return false}
};
export const configuredSandbox=(env:SandboxMonnifyEnv)=>
 env.APP_STAGE==='staging'&&env.MONNIFY_SANDBOX_ENABLED==='true'
 &&env.MONNIFY_MODE==='sandbox'
 &&/^MK_TEST_[\x21-\x7e]{1,248}$/.test(str(env.MONNIFY_API_KEY))
 &&/^[\x21-\x7e]{12,256}$/.test(str(env.MONNIFY_SECRET_KEY))
 &&/^[A-Za-z0-9]{5,35}$/.test(str(env.MONNIFY_CONTRACT_CODE))
 &&validRedirect(str(env.MONNIFY_SANDBOX_REDIRECT_URL));
const responseJson=async(res:Response)=>{
 if(!res.ok||Number(res.headers.get('content-length')||0)>65536)return null;
 try{
  const source=await res.text();if(source.length>65536)return null;
  const value=JSON.parse(source);
  return value&&typeof value==='object'&&!Array.isArray(value)
   ?value as Record<string,unknown>:null;
 }catch{return null}
};
const object=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)
 ?v as Record<string,unknown>:null;
export async function initializeBakeryMonnifySandbox(
 env:SandboxMonnifyEnv,input:SandboxInput,fetcher:typeof fetch=fetch
):Promise<SandboxResult>{
 if(!configuredSandbox(env))return{state:'not_configured'};
 if(!/^[A-Za-z0-9._:-]{12,128}$/.test(input.paymentReference)
  ||!Number.isSafeInteger(input.expectedAmountKobo)||input.expectedAmountKobo<=0
  ||input.customerEmail.length>254
  ||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.customerEmail)
  ||!/^[A-Za-z0-9._/-]{1,100}$/.test(input.orderNo))
  return{state:'invalid_request'};
 try{
  const auth=await fetcher(origin+'/api/v1/auth/login',{
   method:'POST',redirect:'error',cache:'no-store',
   headers:{authorization:'Basic '+btoa(str(env.MONNIFY_API_KEY)+':'+str(env.MONNIFY_SECRET_KEY)),
    accept:'application/json'},signal:AbortSignal.timeout(8000)
  });
  const authData=await responseJson(auth),token=str(object(authData?.responseBody)?.accessToken);
  if(authData?.requestSuccessful!==true||String(authData.responseCode)!=='0'
   ||token.length<12||token.length>4096)return{state:'provider_unavailable'};
  const digits=String(input.expectedAmountKobo);
  const amount=digits.length<=2?'0.'+digits.padStart(2,'0')
   :digits.slice(0,-2)+'.'+digits.slice(-2);
  // Customer email and amount must come from trusted company-scoped D1 reads.
  const payload={amount:Number(amount),customerEmail:input.customerEmail,
   paymentReference:input.paymentReference,
   paymentDescription:'DAENEM Bakery sales order '+input.orderNo,
   currencyCode:'NGN',contractCode:str(env.MONNIFY_CONTRACT_CODE),
   redirectUrl:str(env.MONNIFY_SANDBOX_REDIRECT_URL),
   paymentMethods:['CARD','ACCOUNT_TRANSFER','USSD']};
  const initiated=await fetcher(origin+'/api/v1/merchant/transactions/init-transaction',{
   method:'POST',redirect:'error',cache:'no-store',
   headers:{authorization:'Bearer '+token,'content-type':'application/json',
    accept:'application/json'},body:JSON.stringify(payload),
   signal:AbortSignal.timeout(8000)
  });
  const response=await responseJson(initiated),details=object(response?.responseBody);
  const paymentReference=str(details?.paymentReference);
  const transactionReference=str(details?.transactionReference);
  const checkoutUrl=str(details?.checkoutUrl);
  if(response?.requestSuccessful!==true||String(response.responseCode)!=='0'
   ||paymentReference!==input.paymentReference
   ||!/^[A-Za-z0-9._:|-]{1,200}$/.test(transactionReference)
   ||!validCheckout(checkoutUrl))return{state:'provider_unavailable'};
  return{state:'initialized',transactionReference,checkoutUrl};
 }catch{
  // Never log provider credentials, tokens, customer PII or raw payloads.
  return{state:'provider_unavailable'};
 }
}
