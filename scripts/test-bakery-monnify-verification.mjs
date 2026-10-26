// No real Monnify network, merchant credentials, D1 or Finance updates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const src=fs.readFileSync(new URL('../worker/bakery-monnify-verification.ts',import.meta.url),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{
 target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS
}}).outputText;
const module={exports:{}};
const runtime=new vm.Script('(function(require,module,exports){'+js+'\n})')
 .runInNewContext({Response,URL,AbortSignal,btoa,fetch:()=>{throw Error('Unexpected network')}});
runtime(()=>{throw Error('Unexpected dependency')},module,module.exports);
const verify=module.exports.verifyBoundBakeryMonnifyTransaction;
assert.equal(typeof verify,'function');
const valid={
 companyId:'company-bakery',receivableId:'qa-bakery-ar',
 paymentReference:'BAKERY-QA-REF-100',expectedAmountKobo:10000,
 currency:'NGN',referenceOrigin:'server_initiated'
};
const sandbox={MONNIFY_MODE:'sandbox',MONNIFY_API_KEY:'MK_TEST_FAKE_QA',
 MONNIFY_SECRET_KEY:'SK_TEST_FAKE_QA'};
const goodBody={
 requestSuccessful:true,responseCode:'0',responseMessage:'success',
 responseBody:{
  paymentReference:valid.paymentReference,
  transactionReference:'MNFY|99|QA|001',
  paymentStatus:'PAID',currencyCode:'NGN',
  amountPaid:'100.00',totalPayable:'100.00',
  settlementAmount:'98.00',
  customerDTO:{name:'SYNTHETIC QA CUSTOMER',email:'synthetic@example.invalid'}
 }
};
const res=(body,code=200)=>new Response(JSON.stringify(body),{
 status:code,headers:{'content-type':'application/json'}
});
const calls=[];
const fake=(body=goodBody,{authFail=false,status=200}={})=>async(url,options)=>{
 const dest=String(url);calls.push({dest,method:options.method,headers:options.headers,redirect:options.redirect});
 assert.equal(options.redirect,'error','Provider redirects are forbidden');
 assert(options.signal,'Every provider call must be bounded');
 if(dest.endsWith('/api/v1/auth/login')){
  assert.equal(options.method,'POST');
  assert.equal(options.headers.authorization,'Basic '+btoa(
   sandbox.MONNIFY_API_KEY+':'+sandbox.MONNIFY_SECRET_KEY));
  return authFail?res({requestSuccessful:false,responseCode:'1'},401):
   res({requestSuccessful:true,responseCode:'0',
    responseBody:{accessToken:'synthetic_token_for_QA_only'}});
 }
 assert.equal(options.method,'GET');
 assert(dest.startsWith('https://sandbox.monnify.com/api/v2/merchant/transactions/query?'));
 assert.equal(new URL(dest).searchParams.get('paymentReference'),valid.paymentReference);
 assert.equal(options.headers.authorization,'Bearer synthetic_token_for_QA_only');
 return res(body,status);
};
const checks=result=>{
 assert.equal(result.bankSettlementConfirmed,false,
  'Monnify collection status must never be treated as bank settlement');
 assert.equal(result.settlementAssessed,false);
 assert.equal(result.financeReceivableUpdated,false);
 assert(!JSON.stringify(result).includes('synthetic_token'),
  'Provider token cannot leak into verification results');
 assert(!JSON.stringify(result).includes(sandbox.MONNIFY_SECRET_KEY),
  'Secret Key cannot leak into verification results');
 assert(!JSON.stringify(result).includes('SYNTHETIC QA CUSTOMER'),
  'Customer PII cannot leak into evidence results');
};
let used=0;
const noFetch=async()=>{used++;throw Error('Network should not be called')};
const noConfig=await verify({},valid,noFetch);
assert.equal(noConfig.state,'not_configured');checks(noConfig);
assert.equal(used,0);
const invalid=await verify(sandbox,{...valid,companyId:'company-printing'},noFetch);
assert.equal(invalid.state,'invalid_binding');checks(invalid);assert.equal(used,0);
for(const binding of [
 {...valid,referenceOrigin:'user_claim'},
 {...valid,paymentReference:'https://evil.invalid/redirect'},
 {...valid,expectedAmountKobo:0},
 {...valid,receivableId:''}
]){
 const evidence=await verify(sandbox,binding,noFetch);
 assert.equal(evidence.state,'invalid_binding');
}
assert.equal(used,0);
const success=await verify(sandbox,valid,fake());
checks(success);
assert.equal(success.state,'provider_paid_not_settled');
assert.equal(success.providerStatus,'PAID');
assert.equal(success.amountPaidKobo,10000);
assert.equal(success.providerQuerySucceeded,true);
assert.equal(success.providerTransactionReference,'MNFY|99|QA|001');
assert.equal(calls.length,2);
for(const scenario of [
 {name:'paid short amount',paymentStatus:'PAID',amountPaid:'99.99',expected:'amount_mismatch_review'},
 {name:'paid excess amount',paymentStatus:'PAID',amountPaid:'120.00',expected:'amount_mismatch_review'},
 {name:'partial',paymentStatus:'PARTIALLY_PAID',amountPaid:'75.00',expected:'partial_payment_review'},
 {name:'underpaid',paymentStatus:'UNDERPAID',amountPaid:'75.00',expected:'partial_payment_review'},
 {name:'overpaid',paymentStatus:'OVERPAID',amountPaid:'110.00',expected:'amount_mismatch_review'},
 {name:'reversed',paymentStatus:'REVERSED',amountPaid:'100.00',expected:'reversed_or_refunded_review'},
 {name:'refunded',paymentStatus:'REFUNDED',amountPaid:'100.00',expected:'reversed_or_refunded_review'},
 {name:'pending',paymentStatus:'PENDING',amountPaid:'0',expected:'not_paid'},
 {name:'cancelled',paymentStatus:'CANCELLED',amountPaid:'0',expected:'not_paid'},
 {name:'unknown status',paymentStatus:'BANK_SETTLED',amountPaid:'100.00',expected:'provider_status_review'},
 {name:'invalid monetary exponent',paymentStatus:'PAID',amountPaid:'1e2',expected:'reference_mismatch_review'}
]){
 const body={...goodBody,responseBody:{
  ...goodBody.responseBody,paymentStatus:scenario.paymentStatus,amountPaid:scenario.amountPaid
 }};
 const result=await verify(sandbox,valid,fake(body));
 checks(result);assert.equal(result.state,scenario.expected,scenario.name);
}
for(const change of [
 {paymentReference:'ANOTHER-MERCHANT-REF'},
 {currencyCode:'USD'},
 {currencyCode:null,currency:'USD'},
 {transactionReference:''}
]){
 const body={...goodBody,responseBody:{...goodBody.responseBody,...change}};
 const result=await verify(sandbox,valid,fake(body));
 checks(result);assert.equal(result.state,'reference_mismatch_review');
}
const boundWithTransaction={...valid,expectedTransactionReference:'MNFY|99|QA|DIFFERENT'};
const mismatch=await verify(sandbox,boundWithTransaction,fake());
assert.equal(mismatch.state,'reference_mismatch_review');
const badAuth=await verify(sandbox,valid,fake(goodBody,{authFail:true}));
assert.equal(badAuth.state,'provider_unavailable');checks(badAuth);
const badBody=await verify(sandbox,valid,fake(
 {requestSuccessful:false,responseCode:'1'}));
assert.equal(badBody.state,'provider_unavailable');checks(badBody);
const badHttp=await verify(sandbox,valid,fake(goodBody,{status:503}));
assert.equal(badHttp.state,'provider_unavailable');checks(badHttp);
const networkFailure=await verify(sandbox,valid,async()=>{throw Error('Synthetic network outage')});
assert.equal(networkFailure.state,'provider_unavailable');checks(networkFailure);
const wrongMode=await verify({...sandbox,MONNIFY_MODE:'prod'},valid,noFetch);
assert.equal(wrongMode.state,'not_configured');assert.equal(used,0);
const liveKeyMismatch=await verify({...sandbox,MONNIFY_MODE:'live'},valid,noFetch);
assert.equal(liveKeyMismatch.state,'not_configured');assert.equal(used,0);

// The configured live endpoint must never silently fall back to sandbox.
const live={MONNIFY_MODE:'live',MONNIFY_API_KEY:'MK_PROD_FAKE_QA',
 MONNIFY_SECRET_KEY:'SK_PROD_FAKE_QA'};
const liveCalls=[];
const liveFetch=async(url,options)=>{
 liveCalls.push(String(url));
 assert(String(url).startsWith('https://api.monnify.com/'));
 if(String(url).endsWith('/api/v1/auth/login'))
  return res({requestSuccessful:true,responseCode:'0',
   responseBody:{accessToken:'synthetic_live_token_QA'}});
 return res(goodBody);
};
const liveResult=await verify(live,valid,liveFetch);
assert.equal(liveResult.state,'provider_paid_not_settled');
checks(liveResult);assert.equal(liveCalls.length,2);
console.log('PASS Monnify server inquiry: sandbox/live fixed URLs, authentication and status/amount/reference validation');
console.log('PASS paid NOT bank-settled, reversals/partial/overpayment isolated, no Finance writes or PII');
console.log('PASS missing keys, invalid bindings, network errors, wrong currency and forged references fail closed');
