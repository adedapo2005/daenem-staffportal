import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../worker/monnify-collections.ts', import.meta.url), 'utf8');
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module, exports: module.exports, URL, URLSearchParams, btoa, Date, Number, String, RegExp, Error,
}, { filename: 'worker/monnify-collections.ts', timeout: 2000 });

const verify = module.exports.verifyMonnifyCollection;
const env = { MONNIFY_STAGE_API_KEY: 'stage-key', MONNIFY_STAGE_SECRET_KEY: 'stage-secret' };
const expected = { paymentReference: 'ORDER-001', expectedAmountKobo: 123450, currencyCode: 'NGN' };
const providerBody = (overrides = {}) => ({
  requestSuccessful: true,
  responseBody: {
    transactionReference: 'MNFY|20261012|000001', paymentReference: 'ORDER-001',
    paymentStatus: 'PAID', amountPaid: '1234.50', currencyCode: 'NGN', paidOn: '2026-10-12T14:00:00.000Z',
    ...overrides,
  },
});
function fakeFetch(body = providerBody(), options = {}) {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url: String(url), init });
    if (requests.length === options.networkFailureAt) throw new Error('synthetic timeout containing no provider response');
    if (requests.length === 1) {
      if (options.authFailure) return new Response('{}', { status: 401 });
      return Response.json({ requestSuccessful: true, responseBody: { accessToken: 'synthetic-stage-token' } });
    }
    if (options.verifyFailure) return new Response('{}', { status: 502 });
    return Response.json(body);
  };
  return { fetcher, requests };
}

const exact = fakeFetch();
const facts = await verify(env, expected, exact.fetcher);
assert.equal(facts.exactPaidMatch, true);
assert.equal(facts.amountPaidKobo, 123450);
assert.deepEqual(exact.requests.map(({ url }) => new URL(url).origin), ['https://sandbox.monnify.com', 'https://sandbox.monnify.com']);
assert.equal(exact.requests[0].init.headers.authorization, `Basic ${btoa('stage-key:stage-secret')}`);
assert.equal(exact.requests[1].init.headers.authorization, 'Bearer synthetic-stage-token');
assert.equal(new URL(exact.requests[1].url).searchParams.get('paymentReference'), expected.paymentReference);
console.log('PASS exact sandbox verification yields provider facts only');

const noCredentials = fakeFetch();
await assert.rejects(() => verify({}, expected, noCredentials.fetcher), /not configured/);
assert.equal(noCredentials.requests.length, 0, 'missing stage credentials causes no provider call');
console.log('PASS missing stage credentials fail closed before fetch');

const mismatch = await verify(env, expected, fakeFetch(providerBody({ amountPaid: '1234.49' })).fetcher);
assert.equal(mismatch.exactPaidMatch, false, 'amount mismatch cannot be treated as exact payment');
console.log('PASS amount mismatch is not an exact paid match');

const partial = await verify(env, expected, fakeFetch(providerBody({ paymentStatus: 'PARTIALLY_PAID' })).fetcher);
assert.equal(partial.paymentStatus, 'PARTIALLY_PAID');
assert.equal(partial.exactPaidMatch, false);
console.log('PASS partial payment remains non-final');

const wrongReference = await verify(env, expected, fakeFetch(providerBody({ paymentReference: 'OTHER-ORDER' })).fetcher);
assert.equal(wrongReference.exactPaidMatch, false, 'provider reference must match the server expectation');
console.log('PASS provider reference mismatch remains unmatched');

const badStatus = fakeFetch(providerBody({ paymentStatus: 'SETTLED' }));
await assert.rejects(() => verify(env, expected, badStatus.fetcher), /response is invalid/);
console.log('PASS unknown status is rejected');

const authFailure = fakeFetch(undefined, { authFailure: true });
await assert.rejects(() => verify(env, expected, authFailure.fetcher), /authentication failed/);
assert.equal(authFailure.requests.length, 1, 'failed auth stops before transaction verification');
console.log('PASS auth failure stops transaction verification');

const providerFailure = fakeFetch(undefined, { verifyFailure: true });
await assert.rejects(() => verify(env, expected, providerFailure.fetcher), /verification failed/);
console.log('PASS provider failure fails closed');

const timeout = fakeFetch(undefined, { networkFailureAt: 2 });
await assert.rejects(() => verify(env, expected, timeout.fetcher), /transaction verification failed/);
assert.equal(timeout.requests.length, 2, 'network failure cannot trigger a provider retry');
console.log('PASS verification timeout is sanitized and not retried');

const unsafeRef = fakeFetch();
await assert.rejects(() => verify(env, { ...expected, paymentReference: 'ORDER/../../secret' }, unsafeRef.fetcher), /expectation is invalid/);
assert.equal(unsafeRef.requests.length, 0, 'invalid reference causes no provider call');
console.log('PASS malformed reference rejected before fetch');

const zeroAmount = fakeFetch(providerBody({ amountPaid: '0.00' }));
await assert.rejects(() => verify(env, { ...expected, expectedAmountKobo: 0 }, zeroAmount.fetcher), /expectation is invalid/);
assert.equal(zeroAmount.requests.length, 0, 'zero-value expectation causes no provider call');
console.log('PASS zero-value payment expectation rejected before fetch');

for (const [label, paidOn] of [['missing', null], ['invalid', 'not-a-date']]) {
  const unverified = await verify(env, expected, fakeFetch(providerBody({ paidOn })).fetcher);
  assert.equal(unverified.paymentStatus, 'PAID', `${label} timestamp does not rewrite provider status`);
  assert.equal(unverified.paidOn, null, `${label} timestamp remains absent from normalized provider facts`);
  assert.equal(unverified.exactPaidMatch, false, `${label} timestamp cannot satisfy exact payment evidence`);
  console.log(`PASS ${label} paidOn preserves provider status but withholds exact match`);
}

console.log('MONNIFY_COLLECTIONS_VERIFICATION=13/13 PASS; fake-fetch only; no persistence or money movement');
