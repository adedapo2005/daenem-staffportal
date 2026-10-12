import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'worker', 'kuda-stage.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, crypto: globalThis.crypto }, { filename: 'worker/kuda-stage.ts' });
const getToken = module.exports.getKudaStageAccessToken;
const getBankList = module.exports.getKudaStageBankList;
const queryNameEnquiry = module.exports.queryKudaStageNameEnquiry;
assert.equal(typeof getToken, 'function');
assert.equal(typeof getBankList, 'function');
assert.equal(typeof queryNameEnquiry, 'function');

let calls = 0;
let requestUrl = '';
let requestInit;
const fakeFetch = async (url, init) => {
  calls++;
  requestUrl = String(url);
  requestInit = init;
  return new Response('header.payload.signature', { status: 200 });
};
const goodStage = {
  APP_STAGE: 'staging',
  KUDA_STAGE_BUSINESS_EMAIL: 'stage@example.invalid',
  KUDA_STAGE_API_KEY: 'nonsecret-test-value',
};

await assert.rejects(() => getToken({ ...goodStage, APP_STAGE: 'production' }, fakeFetch), /outside an explicit stage/);
assert.equal(calls, 0, 'production stage rejection happens before any network call');
await assert.rejects(() => getToken({ ...goodStage, APP_STAGE: 'bootstrap' }, fakeFetch), /outside an explicit stage/);
assert.equal(calls, 0, 'bootstrap runtime cannot call Kuda');
await assert.rejects(() => getToken({ APP_STAGE: 'stage' }, fakeFetch), /credentials are not configured/);
assert.equal(calls, 0, 'missing secrets fail before any network call');

const token = await getToken(goodStage, fakeFetch);
assert.equal(token, 'header.payload.signature');
assert.equal(requestUrl, 'https://kuda-openapi-uat.kudabank.com/v2.1/Account/GetToken');
assert.equal(requestInit.method, 'POST');
assert.equal(requestInit.redirect, 'error', 'redirects cannot forward credentials to another host');
assert.deepEqual(JSON.parse(requestInit.body), {
  email: 'stage@example.invalid',
  apiKey: 'nonsecret-test-value',
});

await assert.rejects(() => getToken(goodStage, async () => new Response('provider detail', { status: 401 })), /authentication is unavailable/);
await assert.rejects(() => getToken(goodStage, async () => new Response('{"token":"header.payload.signature"}', { status: 200 })), /invalid authentication response/);

let bankListCalls = 0;
let bankListRequest;
const bankListFetch = async (url, init) => {
  bankListCalls++;
  if (String(url).endsWith('/Account/GetToken')) return new Response('header.payload.signature', { status: 200 });
  bankListRequest = { url: String(url), init };
  return new Response(JSON.stringify({ status: true, data: [{ bankCode: '999129', bankName: 'Synthetic UAT Bank' }] }), { status: 200 });
};
await assert.rejects(() => getBankList({ ...goodStage, APP_STAGE: 'production' }, bankListFetch), /outside an explicit stage/);
assert.equal(bankListCalls, 0, 'bank list is stage-guarded before token acquisition');
const bankList = await getBankList(goodStage, bankListFetch);
assert.equal(bankListCalls, 2, 'bank list uses token endpoint and one UAT API request');
assert.equal(bankListRequest.url, 'https://kuda-openapi-uat.kudabank.com/v2.1');
assert.equal(bankListRequest.init.method, 'POST');
assert.equal(bankListRequest.init.redirect, 'error');
assert.match(bankListRequest.init.headers.authorization, /^Bearer header\.payload\.signature$/);
assert.deepEqual(JSON.parse(bankListRequest.init.body), {
  serviceType: 'BANK_LIST',
  requestRef: bankList.requestRef,
  data: {},
});
assert.match(bankList.requestRef, /^BANK[A-Z0-9]+$/);
assert.deepEqual(bankList.payload, { status: true, data: [{ bankCode: '999129', bankName: 'Synthetic UAT Bank' }] });
await assert.rejects(() => getBankList(goodStage, async (url) => String(url).endsWith('/Account/GetToken')
  ? new Response('header.payload.signature', { status: 200 })
  : new Response('provider detail', { status: 502 })), /bank reference data is unavailable/);
for (const [name, payload] of [
  ['provider rejection', { status: false, message: 'synthetic provider rejection', data: null }],
  ['missing status', { data: [{ bankCode: '999129', bankName: 'Synthetic UAT Bank' }] }],
  ['missing bank list', { status: true }],
  ['non-array bank list', { status: true, data: { bankCode: '999129' } }],
  ['malformed bank row', { status: true, data: [null] }],
]) {
  let callsForFailure = 0;
  await assert.rejects(() => getBankList(goodStage, async (url) => {
    callsForFailure++;
    return String(url).endsWith('/Account/GetToken')
      ? new Response('header.payload.signature', { status: 200 })
      : new Response(JSON.stringify(payload), { status: 200 });
  }), (error) => {
    assert.equal(error.message, 'Kuda stage bank reference data is unavailable.', `${name} uses a neutral error`);
    for (const sensitive of ['synthetic provider rejection', 'header.payload.signature', 'nonsecret-test-value']) {
      assert.equal(error.message.includes(sensitive), false, `${name} does not disclose provider or credential data`);
    }
    return true;
  });
  assert.equal(callsForFailure, 2, `${name} makes one fake token and one fake UAT request`);
}

let enquiryCalls = 0;
let enquiryRequest;
const enquiryFetch = async (url, init) => {
  enquiryCalls++;
  if (String(url).endsWith('/Account/GetToken')) return new Response('header.payload.signature', { status: 200 });
  enquiryRequest = { url: String(url), init };
  return new Response(JSON.stringify({ status: true, data: { accountName: 'Synthetic UAT Beneficiary' } }), { status: 200 });
};
await assert.rejects(() => queryNameEnquiry({ ...goodStage, APP_STAGE: 'production' }, { accountNumber: '0123456789', bankCode: '999129' }, enquiryFetch), /outside an explicit stage/);
assert.equal(enquiryCalls, 0, 'production enquiry is rejected before token acquisition');
await assert.rejects(() => queryNameEnquiry(goodStage, { accountNumber: 'bad-account', bankCode: '999129' }, enquiryFetch), /input is invalid/);
assert.equal(enquiryCalls, 0, 'invalid account identifiers are rejected before token acquisition');
const enquiry = await queryNameEnquiry(goodStage, { accountNumber: '0123456789', bankCode: '999129' }, enquiryFetch);
assert.equal(enquiryCalls, 2, 'name enquiry makes one fake token and one UAT request');
assert.equal(enquiryRequest.url, 'https://kuda-openapi-uat.kudabank.com/v2.1');
assert.equal(enquiryRequest.init.method, 'POST');
assert.equal(enquiryRequest.init.redirect, 'error');
assert.match(enquiryRequest.init.headers.authorization, /^Bearer header\.payload\.signature$/);
const enquiryBody = JSON.parse(enquiryRequest.init.body);
assert.equal(enquiryBody.serviceType, 'NAME_ENQUIRY');
assert.match(enquiryBody.requestRef, /^NAME[A-Z0-9]+$/);
assert.deepEqual(enquiryBody.data, { accountNumber: '0123456789', bankCode: '999129' });
assert.deepEqual(enquiry.payload, { status: true, data: { accountName: 'Synthetic UAT Beneficiary' } });
assert.equal(Object.hasOwn(enquiry, 'verified'), false, 'provider payload is not promoted into a StaffPortal verification decision');
for (const [name, response] of [
  ['provider rejection', new Response(JSON.stringify({ status: false, message: 'synthetic rejection', data: null }), { status: 200 })],
  ['HTTP failure', new Response('synthetic provider detail', { status: 502 })],
  ['invalid payload', new Response('{not-json', { status: 200 })],
  ['missing enquiry data', new Response(JSON.stringify({ status: true }), { status: 200 })],
  ['null enquiry data', new Response(JSON.stringify({ status: true, data: null }), { status: 200 })],
  ['array enquiry data', new Response(JSON.stringify({ status: true, data: [] }), { status: 200 })],
  ['scalar enquiry data', new Response(JSON.stringify({ status: true, data: 'Synthetic UAT Beneficiary' }), { status: 200 })],
]) {
  const start = enquiryCalls;
  await assert.rejects(() => queryNameEnquiry(goodStage, { accountNumber: '0123456789', bankCode: '999129' }, async (url) =>
    String(url).endsWith('/Account/GetToken') ? new Response('header.payload.signature', { status: 200 }) : response), (error) => {
    assert.equal(error.message, 'Kuda stage account validation is unavailable.', `${name} uses a neutral error`);
    for (const sensitive of ['synthetic rejection', 'synthetic provider detail', 'header.payload.signature', 'nonsecret-test-value']) {
      assert.equal(error.message.includes(sensitive), false, `${name} does not disclose provider or credential data`);
    }
    return true;
  });
  assert.equal(enquiryCalls, start, `${name} uses its isolated fetcher`);
}
console.log('PASS: Kuda stage auth guard blocks production/bootstrap and missing config; UAT-only auth, BANK_LIST, and read-only NAME_ENQUIRY request references, redirects, bounded input, response failures, and neutral errors verified. No live provider call made.');
