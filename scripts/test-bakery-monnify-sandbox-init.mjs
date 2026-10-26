import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../worker/bakery-monnify-sandbox-init.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new vm.Script('(function(require,module,exports){'+js+'\n})').runInNewContext({
 URL,Response,btoa,AbortSignal,fetch:()=>{throw Error('No real network')}
})(()=>{throw Error('Unexpected dependency')},mod,mod.exports);
const {initializeBakeryMonnifySandbox:initialize,configuredSandbox,validCheckout}=mod.exports;
const env={APP_STAGE:'staging',MONNIFY_SANDBOX_ENABLED:'true',MONNIFY_MODE:'sandbox',
 MONNIFY_API_KEY:'MK_TEST_SYNTHETIC_FAKE',MONNIFY_SECRET_KEY:'SYNTHETIC_NO_SECRET_12345',
 MONNIFY_CONTRACT_CODE:'123456789',MONNIFY_SANDBOX_REDIRECT_URL:
 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev/workspace'};
const input={paymentReference:'BAK-SYNTHETIC-REF-123',expectedAmountKobo:10001,
 customerEmail:'qa@example.invalid',orderNo:'BAK-2026-001'};
assert(configuredSandbox(env));
assert.equal(configuredSandbox({...env,APP_STAGE:'production'}),false);
assert.equal(configuredSandbox({...env,MONNIFY_MODE:'live'}),false);
for(const url of ['https://evil.invalid/checkout/123','http://sandbox.monnify.com/checkout/123',
 'https://sandbox.monnify.com.evil.invalid/checkout/123',
 'https://sandbox.monnify.com@evil.invalid/checkout/123',
 'https://sandbox.monnify.com/checkout/123?leak=secret'])
 assert.equal(validCheckout(url),false);
const auth={requestSuccessful:true,responseCode:'0',responseBody:{accessToken:'SYNTHETIC_TOKEN_12345'}};
const payment={requestSuccessful:true,responseCode:'0',responseBody:{paymentReference:input.paymentReference,
 transactionReference:'MNFY|123|QA',checkoutUrl:'https://sandbox.monnify.com/checkout/123'}};
const calls=[];
const fake=async(url,opts)=>{
 calls.push({url:String(url),options:opts});
 if(calls.length===1)return new Response(JSON.stringify(auth));
 return new Response(JSON.stringify(payment));
};
const good=await initialize(env,input,fake);
assert.equal(good.state,'initialized');
assert.equal(calls.length,2);
assert.equal(calls[0].url,'https://sandbox.monnify.com/api/v1/auth/login');
assert.equal(calls[1].url,'https://sandbox.monnify.com/api/v1/merchant/transactions/init-transaction');
const sent=JSON.parse(calls[1].options.body);
assert.equal(sent.amount,100.01);
assert.equal(sent.paymentReference,input.paymentReference);
assert.equal(sent.customerEmail,input.customerEmail);
assert.equal(sent.currencyCode,'NGN');
assert.equal(calls[1].options.redirect,'error');
assert.equal((await initialize({...env,MONNIFY_MODE:'live'},input,()=>{throw Error('No fetch')})).state,'not_configured');
assert.equal((await initialize(env,{...input,expectedAmountKobo:0},()=>{throw Error('No fetch')})).state,'invalid_request');
const wrong=await initialize(env,input,async(url)=>String(url).endsWith('/auth/login')
 ?new Response(JSON.stringify(auth)):new Response(JSON.stringify({...payment,
 responseBody:{...payment.responseBody,paymentReference:'forged'}})));
assert.equal(wrong.state,'provider_unavailable');
assert.equal((await initialize(env,input,async()=>{throw Error('network failure')})).state,'provider_unavailable');
console.log('PASS Monnify sandbox-only fixed-host init, amount/reference binding, invalid provider fail-closed');
console.log('NOTE isolated provider mocks only; no live checkout, D1 financial posting or bank settlement');
