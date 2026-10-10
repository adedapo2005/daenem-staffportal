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
vm.runInNewContext(compiled, { module, exports: module.exports }, { filename: 'worker/kuda-stage.ts' });
const getToken = module.exports.getKudaStageAccessToken;
assert.equal(typeof getToken, 'function');

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
console.log('PASS: Kuda stage auth guard blocks production/bootstrap and missing config; UAT-only URL, redirect rejection, raw JWT validation, and neutral provider failures verified. No live provider call made.');
