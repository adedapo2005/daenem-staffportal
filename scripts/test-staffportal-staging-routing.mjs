import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/staffportal-staging.ts', import.meta.url), 'utf8');
const workspaceSource = await readFile(new URL('../worker/workspace-route.ts', import.meta.url), 'utf8');
const config = JSON.parse(await readFile(new URL('../wrangler.staffportal-staging.jsonc', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const delegated = [];
const workspaceAssetRequests = [];
const cloudflareMediaRequests = [];
const staffContentRequests = [];
const workspaceCompiled = ts.transpileModule(workspaceSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const workspaceModule = { exports: {} };
new Function('module', 'exports', 'require', workspaceCompiled)(workspaceModule, workspaceModule.exports, (specifier) => {
  assert.equal(specifier, './auth');
  return {
    getSessionContext: async (request) => request.headers.get('cookie')?.includes('active-session') ? {
      sessionId: 'active-session',
      companies: [{ id: 'company-a' }],
    } : null,
  };
});
const { routeWorkspaceShell } = workspaceModule.exports;
const runtimeHandler = {
  fetch: async (request) => {
    delegated.push(new URL(request.url).pathname);
    if (new URL(request.url).pathname === '/api/assets') {
      return new Response('{"assets":[]}', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
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
  if (specifier === './workspace-route') return { routeWorkspaceShell };
  if (specifier === './v180-cloudflare-public-media') return { routeCloudflareV180Media: async (input) => {
    cloudflareMediaRequests.push(new URL(input.url).pathname);
    if (new URL(input.url).pathname !== '/api/assets') return null;
    return new Response('{"assets":[]}', { status: 200, headers: {
      'content-type': 'application/json', 'cache-control': 'no-store',
    } });
  } };
  if (specifier === './v180-media-publication-admin') return { routeOwnerStudioV180Media: async () => null };
  if (specifier === './v180-public-staff-content') return { routeV180PublicStaffContent: async (input) => {
    const path = new URL(input.url).pathname;
    staffContentRequests.push(path);
    if (path === '/api/staff-content') return new Response('{"error":"Staff content is temporarily unavailable."}', {
      status: 503, headers: { 'content-type':'application/json','cache-control':'no-store' },
    });
    if (path === '/api/owner/studio/staff-content') return new Response('{"error":"Publication permission required."}', {
      status: 403, headers: { 'content-type':'application/json','cache-control':'no-store' },
    });
    return null;
  } };
  assert.equal(specifier, './runtime');
  return { __esModule: true, default: runtimeHandler };
});

const handler = loaded.exports.default;
const env = {
  STAFF_PORTAL_FRONTEND_ORIGIN: 'https://review.example.test, https://second.example.test',
  ASSETS: { fetch: async (assetRequest) => {
    workspaceAssetRequests.push(assetRequest);
    return new Response('<main>workspace shell</main>', { headers: { 'content-type': 'text/html' } });
  } },
};
const ctx = {};
const request = (path, init = {}) => new Request(`https://staffportal-staging.example.test${path}`, init);
const checks = [];
const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS: ${name}`); };

await check('staging serves the current built client through Worker-first SPA assets', async () => {
  assert.equal(config.main, './worker/staffportal-staging.ts');
  assert.equal(config.vars.STAFF_PORTAL_FRONTEND_ORIGIN, 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev');
  assert.doesNotMatch(config.vars.STAFF_PORTAL_FRONTEND_ORIGIN, /chatgpt\.site/i);
  assert.match(source, /runtimeHandler\.fetch\(request,runtimeEnv,ctx\)/);
  for (const path of ['/', '/index.html', '/staff-portal-signin']) {
    const response = await handler.fetch(request(path), env, ctx);
    assert.equal(response.status, 200, path);
  }
  assert.deepEqual(delegated.slice(-3), ['/', '/index.html', '/staff-portal-signin']);
});

await check('direct unauthenticated workspace navigation is denied before runtime and asset access', async () => {
  const runtimeBefore = delegated.length;
  const assetsBefore = workspaceAssetRequests.length;
  const response = await handler.fetch(request('/workspace'), env, ctx);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(delegated.length, runtimeBefore);
  assert.equal(workspaceAssetRequests.length, assetsBefore);
});

await check('valid session serves only the protected workspace entry without forwarding credentials', async () => {
  const runtimeBefore = delegated.length;
  const response = await handler.fetch(request('/workspace?companyId=company-a', {
    headers: { cookie: 'daenem_workforce_session=active-session', authorization: 'Bearer private-token' },
  }), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<main>workspace shell</main>');
  assert.equal(delegated.length, runtimeBefore);
  assert.equal(workspaceAssetRequests.length, 1);
  assert.equal(new URL(workspaceAssetRequests[0].url).pathname, '/workspace/index.html');
  assert.equal(workspaceAssetRequests[0].headers.get('cookie'), null);
  assert.equal(workspaceAssetRequests[0].headers.get('authorization'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

await check('revoked and foreign-company workspace requests never reach runtime or asset binding', async () => {
  const runtimeBefore = delegated.length;
  const assetsBefore = workspaceAssetRequests.length;
  for (const input of [
    request('/workspace/', { headers: { cookie: 'daenem_workforce_session=revoked-session' } }),
    request('/workspace?companyId=company-b', { headers: { cookie: 'daenem_workforce_session=active-session' } }),
  ]) {
    const response = await handler.fetch(input, env, ctx);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
  }
  assert.equal(delegated.length, runtimeBefore);
  assert.equal(workspaceAssetRequests.length, assetsBefore);
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

await check('revocation-safe public asset no-store survives staging response hardening', async () => {
  const runtimeBefore = delegated.length;
  const response = await handler.fetch(request('/api/assets'), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '{"assets":[]}');
  assert.equal(delegated.length, runtimeBefore, 'public asset feed is served by its explicit safe adapter');
  assert.equal(cloudflareMediaRequests.at(-1), '/api/assets', 'Cloudflare D1 media adapter owns the public asset feed');
});

await check('approved preflight allows Idempotency-Key and rejects unknown origins', async () => {
  const allowed = await handler.fetch(request('/api/finance/receivables', {
    method: 'OPTIONS', headers: { origin: 'https://review.example.test' },
  }), env, ctx);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://review.example.test');
  assert.match(allowed.headers.get('access-control-allow-methods'), /PUT/);
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

await check('approved scenery JPG-to-responsive-WebP rewrite survives media and content cutover', async () => {
  const before = workspaceAssetRequests.length;
  const delegatedBefore = delegated.length;
  const response = await handler.fetch(request('/assets/scenery/approved-ops-v115.jpg'), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(workspaceAssetRequests.length, before + 1);
  assert.equal(new URL(workspaceAssetRequests.at(-1).url).pathname, '/assets/scenery/approved-ops-v115-1280.webp');
  assert.equal(delegated.length, delegatedBefore);
});

await check('staff content is Cloudflare-owned, denied before publication and separate from approved Sign-In context', async () => {
  const before = delegated.length;
  const unpublished = await handler.fetch(request('/api/staff-content'), env, ctx);
  assert.equal(unpublished.status, 503);
  assert.equal(unpublished.headers.get('cache-control'), 'no-store');
  assert.equal(unpublished.headers.get('x-staffportal-auth-runtime'), 'worker-password-auth-v1');
  assert.equal(staffContentRequests.at(-1), '/api/staff-content');
  assert.equal(delegated.length, before);
  const denied = await handler.fetch(request('/api/owner/studio/staff-content'), env, ctx);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const signinContext = await handler.fetch(request('/api/context/signin'), env, ctx);
  assert.equal(signinContext.status, 404);
  assert.equal(delegated.at(-1), '/api/context/signin');
});

console.log(`Staging routing acceptance: ${checks.length}/${checks.length} PASS`);
