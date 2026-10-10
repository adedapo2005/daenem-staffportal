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
assert.equal(typeof getToken, 'function');
assert.equal(typeof getBankList, 'function');

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
console.log('PASS: Kuda stage auth guard blocks production/bootstrap and missing config; UAT-only auth and BANK_LIST request, reference, redirects, raw JWT validation, and neutral provider failures verified. No live provider call made.');
