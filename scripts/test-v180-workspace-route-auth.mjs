import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/workspace-route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const assetRequests = [];
const sessionLookups = [];
const env = {
  ASSETS: {
    fetch: async (request) => {
      assetRequests.push(request);
      return new Response('<main>workspace</main>', { headers: { 'content-type': 'text/html' } });
    },
  },
};
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (specifier) => {
  assert.equal(specifier, './auth');
  return {
    getSessionContext: async (request) => {
      const cookie = request.headers.get('cookie') || '';
      sessionLookups.push(cookie);
      if (cookie.includes('active-session')) return { sessionId: 'active-session' };
      return null;
    },
  };
});

const route = loaded.exports.routeWorkspaceShell;
const request = (path, init = {}) => new Request(`https://staffportal.example.test${path}`, init);
const checks = [];
const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS: ${name}`); };

await check('unauthenticated direct /workspace redirects to public v180 without fetching workspace HTML', async () => {
  const response = await route(request('/workspace'), env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(assetRequests.length, 0);
});

await check('revoked session direct /workspace/ redirects and never reaches SPA fallback', async () => {
  const response = await route(request('/workspace/', { headers: { cookie: 'daenem_workforce_session=revoked-session' } }), env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.equal(assetRequests.length, 0);
});

await check('canonical active session serves only workspace/index.html with no-store response', async () => {
  const response = await route(request('/workspace?companyId=company-a', { headers: { cookie: 'daenem_workforce_session=active-session' } }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<main>workspace</main>');
  assert.equal(new URL(assetRequests[0].url).pathname, '/workspace/index.html');
  assert.equal(new URL(assetRequests[0].url).search, '');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

await check('unrelated paths and API routes are left to the existing secured route tree', async () => {
  assert.equal(await route(request('/'), env), null);
  assert.equal(await route(request('/api/dashboard/summary'), env), null);
  assert.equal(await route(request('/workspace/settings'), env), null);
  assert.equal(sessionLookups.length, 3);
});

await check('non-navigation writes to the protected shell are denied without asset disclosure', async () => {
  const response = await route(request('/workspace', { method: 'POST' }), env);
  assert.equal(response.status, 404);
  assert.equal(assetRequests.length, 1);
});

console.log(`Workspace route authorization: ${checks.length}/${checks.length} PASS`);
