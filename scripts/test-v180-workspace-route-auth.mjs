import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/workspace-route.ts', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../worker/runtime.ts', import.meta.url), 'utf8');
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
      if (cookie.includes('active-session')) return {
        sessionId: 'active-session',
        companies: [{ id: 'company-a' }],
      };
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

await check('foreign-company workspace hint is denied before fetching workspace HTML', async () => {
  const response = await route(request('/workspace?companyId=company-b', {
    headers: { cookie: 'daenem_workforce_session=active-session' },
  }), env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(assetRequests.length, 0);
});

await check('canonical active session serves only workspace/index.html with no-store response', async () => {
  const response = await route(request('/workspace?companyId=company-a', { headers: { cookie: 'daenem_workforce_session=active-session' } }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<main>workspace</main>');
  assert.equal(new URL(assetRequests[0].url).pathname, '/workspace/index.html');
  assert.equal(new URL(assetRequests[0].url).search, '');
  assert.equal(assetRequests[0].headers.get('cookie'), null);
  assert.equal(assetRequests[0].headers.get('authorization'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

await check('unrelated paths and API routes are left to the existing secured route tree', async () => {
  assert.equal(await route(request('/'), env), null);
  assert.equal(await route(request('/api/dashboard/summary'), env), null);
  assert.equal(await route(request('/workspace/settings'), env), null);
  assert.equal(sessionLookups.length, 4);
});

await check('non-navigation writes to the protected shell are denied without asset disclosure', async () => {
  const response = await route(request('/workspace', { method: 'POST' }), env);
  assert.equal(response.status, 404);
  assert.equal(assetRequests.length, 1);
});

await check('configured Worker runtime dispatches this guard before the legacy SPA fallback', async () => {
  assert.match(runtime, /import \{ routeWorkspaceShell \} from '\.\/workspace-route';/);
  const guardIndex = runtime.indexOf('await routeWorkspaceShell(request, env)');
  const fallbackIndex = runtime.indexOf('return appHandler.fetch(request, env, ctx)');
  assert(guardIndex >= 0 && fallbackIndex > guardIndex, 'Workspace guard is not ahead of the SPA fallback');
});

// Explicit static HTML URLs must be guarded, not bypassed by the SPA asset fallback.
await check('anonymous direct /workspace/index.html denies without disclosing an asset', async () => {
  const before = assetRequests.length;
  const result = await route(request('/workspace/index.html'), env);
  assert.equal(result?.status, 303);
  assert.equal(result?.headers.get('cache-control'), 'no-store');
  assert.equal(assetRequests.length, before);
});

await check('revoked and foreign-company direct HTML requests never reach the asset binding', async () => {
  const before = assetRequests.length;
  const revoked = await route(request('/workspace/index.html', {
    headers: { cookie: 'daenem_workforce_session=revoked-session' },
  }), env);
  const foreign = await route(request('/workspace/index.html?companyId=company-b', {
    headers: { cookie: 'daenem_workforce_session=active-session' },
  }), env);
  assert.equal(revoked?.status, 303);
  assert.equal(foreign?.status, 303);
  assert.equal(assetRequests.length, before);
});

await check('authorized direct HTML access serves only the no-store sanitized workspace asset', async () => {
  const before = assetRequests.length;
  const result = await route(request('/workspace/index.html?companyId=company-a', {
    headers: { cookie: 'daenem_workforce_session=active-session', authorization: 'Bearer should-not-forward' },
  }), env);
  assert.equal(result?.status, 200);
  assert.equal(await result.text(), '<main>workspace</main>');
  assert.equal(assetRequests.length, before + 1);
  const asset = assetRequests.at(-1);
  assert.equal(new URL(asset.url).pathname, '/workspace/index.html');
  assert.equal(new URL(asset.url).search, '');
  assert.equal(asset.headers.get('cookie'), null);
  assert.equal(asset.headers.get('authorization'), null);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});

await check('ambiguous or blank company hints are rejected before fetching workspace HTML', async () => {
  const before = assetRequests.length;
  for (const query of ['?companyId=company-a&companyId=company-b', '?companyId=&companyId=company-a', '?companyId=']) {
    const response = await route(request(`/workspace/index.html${query}`, { headers: { cookie: 'daenem_workforce_session=active-session' } }), env);
    assert.equal(response?.status, 303, `ambiguous company hint must be denied: ${query}`);
  }
  assert.equal(assetRequests.length, before);
});

console.log(`Workspace route authorization: ${checks.length}/${checks.length} PASS`);
