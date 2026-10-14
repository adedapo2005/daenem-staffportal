import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/staffportal-staging.ts', import.meta.url), 'utf8');
const config = JSON.parse(await readFile(new URL('../wrangler.staffportal-staging.jsonc', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const delegated = [];
const runtimeHandler = {
  fetch: async (request) => {
    delegated.push(new URL(request.url).pathname);
    if (new URL(request.url).pathname.startsWith('/api/finance/')) {
      return new Response('{"error":"Authentication required."}', { status: 401, headers: { 'content-type': 'application/json' } });
    }
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return new Response('{"error":"API route not found."}', { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return new Response('runtime asset response', { status: 200 });
  },
};
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
  assert.equal(specifier, './runtime');
  return { __esModule: true, default: runtimeHandler };
});

const handler = loaded.exports.default;
const env = { STAFF_PORTAL_FRONTEND_ORIGIN: 'https://review.example.test, https://second.example.test' };
const ctx = {};
const request = (path, init = {}) => new Request(`https://staffportal-staging.example.test${path}`, init);
const checks = [];
const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS: ${name}`); };

await check('staging serves the current built client through Worker-first SPA assets', async () => {
  assert.deepEqual(config.assets, {
    directory: './dist/client',
    binding: 'ASSETS',
    run_worker_first: true,
    not_found_handling: 'single-page-application',
  });
  assert.match(source, /runtimeHandler\.fetch\(request,runtimeEnv,ctx\)/);
  for (const path of ['/', '/index.html', '/staff-portal-signin']) {
    const response = await handler.fetch(request(path), env, ctx);
    assert.equal(response.status, 200, path);
  }
  assert.deepEqual(delegated, ['/', '/index.html', '/staff-portal-signin']);
});

await check('authenticated API route tree preserves its neutral unauthenticated response', async () => {
  const response = await handler.fetch(request('/api/finance/receivables'), env, ctx);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required.' });
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(delegated.at(-1), '/api/finance/receivables');
});

await check('unrecognized API requests remain JSON 404 responses instead of SPA documents', async () => {
  const response = await handler.fetch(request('/api/unknown'), env, ctx);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { error: 'API route not found.' });
});

await check('approved preflight allows Idempotency-Key and rejects unknown origins', async () => {
  const allowed = await handler.fetch(request('/api/finance/receivables', {
    method: 'OPTIONS', headers: { origin: 'https://review.example.test' },
  }), env, ctx);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://review.example.test');
  assert.match(allowed.headers.get('access-control-allow-headers'), /Idempotency-Key/);
  const denied = await handler.fetch(request('/api/finance/receivables', {
    method: 'OPTIONS', headers: { origin: 'https://attacker.example.test' },
  }), env, ctx);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await denied.json(), { error: 'Origin not allowed.' });
});

await check('health remains staging-only and does not invoke module routing', async () => {
  const before = delegated.length;
  const response = await handler.fetch(request('/health'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'daenem-staffportal-api-staging', stage: 'staging' });
  assert.equal(delegated.length, before);
});

console.log(`Staging routing acceptance: ${checks.length}/${checks.length} PASS`);
