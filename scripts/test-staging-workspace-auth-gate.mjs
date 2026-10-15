import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/staffportal-staging.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

const runtimeCalls = [];
const assetCalls = [];
const workspaceCalls = [];
let sessionContext = null;
const runtimeHandler = {
  fetch: async (request) => {
    runtimeCalls.push(request.url);
    return new Response('runtime response', { status: 401 });
  },
};
const module = { exports: {} };
const mockRequire = (specifier) => {
  if (specifier === './runtime') return { __esModule: true, default: runtimeHandler };
  if (specifier === './workspace-route') return {
    routeWorkspaceShell: async (request, env) => {
      workspaceCalls.push(new URL(request.url).pathname);
      if (!['/workspace', '/workspace/'].includes(new URL(request.url).pathname)) return null;
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Not found', { status: 404 });
      if (!sessionContext) return new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store' } });
      const companyId = new URL(request.url).searchParams.get('companyId');
      if (companyId && !sessionContext.companies.some((company) => company.id === companyId)) {
        return new Response(null, { status: 303, headers: { location: '/', 'cache-control': 'no-store' } });
      }
      if (!env.ASSETS) return new Response('Not found', { status: 404 });
      return env.ASSETS.fetch(new Request(new URL('/workspace/index.html', request.url)));
    },
  };
  throw new Error(`Unexpected import: ${specifier}`);
};
new Function('require', 'module', 'exports', compiled)(mockRequire, module, module.exports);
const worker = module.exports.default;

const env = {
  APP_NAME: 'Staff Portal',
  APP_STAGE: 'staging',
  DB: {},
  ASSETS: {
    fetch: async (request) => {
      assetCalls.push(request);
      return new Response('<html>workspace</html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  },
};
const request = (path, headers = {}, method = 'GET') => new Request(`https://staffportal.test${path}`, { method, headers });
const fetch = (input) => worker.fetch(input, env, { waitUntil() {}, passThroughOnException() {} });
const passed = [];
const check = async (name, action) => {
  await action();
  passed.push(name);
  console.log(`PASS: ${name}`);
};

await check('unauthenticated direct workspace navigation redirects before asset or runtime access', async () => {
  sessionContext = null;
  const response = await fetch(request('/workspace'));
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get('location'), 'https://staffportal.test').pathname, '/');
  assert.equal(assetCalls.length, 0);
  assert.equal(runtimeCalls.length, 0);
});

await check('foreign-company workspace hint is denied before asset or runtime access', async () => {
  sessionContext = { sessionId: 'session-test', employee: { id: 'employee-test' }, companies: [{ id: 'company-a' }] };
  const response = await fetch(request('/workspace?companyId=company-b', { cookie: 'daenem_workforce_session=valid' }));
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get('location'), 'https://staffportal.test').pathname, '/');
  assert.equal(assetCalls.length, 0);
  assert.equal(runtimeCalls.length, 0);
});

await check('revoked or expired session lookup denies the direct workspace shell', async () => {
  sessionContext = null;
  const response = await fetch(request('/workspace/', { cookie: 'daenem_workforce_session=revoked' }));
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get('location'), 'https://staffportal.test').pathname, '/');
  assert.equal(assetCalls.length, 0);
  assert.equal(runtimeCalls.length, 0);
});

await check('confirmed session receives only the exact workspace index asset without forwarding credentials', async () => {
  sessionContext = { sessionId: 'session-test', employee: { id: 'employee-test' }, companies: [{ id: 'company-a' }] };
  const response = await fetch(request('/workspace?companyId=company-a', {
    cookie: 'daenem_workforce_session=valid',
    authorization: 'Bearer must-not-reach-assets',
  }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<html>workspace</html>');
  assert.equal(assetCalls.length, 1);
  assert.equal(assetCalls[0].url, 'https://staffportal.test/workspace/index.html');
  assert.equal(assetCalls[0].headers.get('cookie'), null);
  assert.equal(assetCalls[0].headers.get('authorization'), null);
  assert.equal(runtimeCalls.length, 0);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

await check('auth API requests remain on the secured runtime route tree', async () => {
  sessionContext = null;
  const response = await fetch(request('/api/auth/me', { cookie: 'daenem_workforce_session=revoked' }));
  assert.equal(response.status, 401);
  assert.deepEqual(runtimeCalls, ['https://staffportal.test/api/auth/me']);
  assert.equal(assetCalls.length, 1);
});

await check('workspace shell is not served for non-GET methods', async () => {
  const response = await fetch(request('/workspace', {}, 'POST'));
  assert.equal(response.status, 404);
  assert.equal(assetCalls.length, 1);
  assert.equal(runtimeCalls.length, 1);
});

console.log(`Staging workspace auth gate: ${passed.length}/${passed.length} PASS`);
