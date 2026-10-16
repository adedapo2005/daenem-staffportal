import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/v180-public-assets.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
const staging = await readFile(new URL('../worker/staffportal-staging.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { routeV180PublicAssets } = loaded.exports;
const stagingCompiled = ts.transpileModule(staging, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let stagingRuntimeCalls = 0;
const stagingModule = { exports: {} };
new Function('module', 'exports', 'require', stagingCompiled)(stagingModule, stagingModule.exports, (specifier) => {
  if (specifier === './runtime') return { default: { fetch: async () => {
    stagingRuntimeCalls += 1;
    return new Response('runtime fallback', { status: 404 });
  } } };
  if (specifier === './workspace-route') return { routeWorkspaceShell: async () => null };
  if (specifier === './v180-public-assets') return { routeV180PublicAssets };
  throw new Error(`Unexpected staging import: ${specifier}`);
});
const stagingHandler = stagingModule.exports.default;
const checks = [];
const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS: ${name}`); };
const request = (path = '/api/assets', init = {}) => new Request(`https://staffportal.example.test${path}`, init);
const originalFetch = globalThis.fetch;
const respond = (body, status = 200, headers = { 'content-type': 'application/json' }) => new Response(body, { status, headers });

try {
  await check('public assets route is wired before authenticated application routing', async () => {
    assert.match(entry, /routeV180PublicAssets\(request\)/);
    assert.ok(entry.indexOf('routeV180PublicAssets(request)') < entry.indexOf('await getSessionContext(request,env)'));
    assert.match(staging, /import \{ routeV180PublicAssets \} from '\.\/v180-public-assets';/);
    assert.ok(staging.indexOf('await routeV180PublicAssets(request)') < staging.indexOf('runtimeHandler.fetch(request,runtimeEnv,ctx)'));
    assert.match(staging, /pathname==='\/api\/assets'&&response\.status===200/);
  });

  await check('fixed-origin GET projects only public visual fields without forwarding caller credentials', async () => {
    let observed;
    globalThis.fetch = async (url, init) => {
      observed = { url, init };
      return respond(JSON.stringify({ assets: [{
        id: 'asset-1', asset_key: 'hero', category: 'hero', purpose: 'sign-in',
        image_url: 'https://cdn.example.test/hero.webp', default_image_url: 'https://cdn.example.test/default.webp',
        display_enabled: true, zoom: 1.25, focal_x: 0.5, focal_y: 0.4,
        created_by_id: 'private-actor', created_date: 'private-date', audit_reason: 'private-reason',
      }] }));
    };
    const response = await routeV180PublicAssets(request('/api/assets', { headers: { cookie: 'session-secret', authorization: 'Bearer secret' } }));
    assert.equal(response.status, 200);
    assert.equal(observed.url, 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site/api/assets');
    assert.equal(observed.init.method, 'GET');
    assert.equal(observed.init.redirect, 'manual');
    assert.deepEqual(Object.keys(observed.init.headers).sort(), ['accept']);
    const body = await response.json();
    assert.deepEqual(body.assets[0], {
      id: 'asset-1', asset_key: 'hero', category: 'hero', purpose: 'sign-in',
      image_url: 'https://cdn.example.test/hero.webp', default_image_url: 'https://cdn.example.test/default.webp',
      display_enabled: true, zoom: 1.25, focal_x: 0.5, focal_y: 0.4,
    });
    assert.match(response.headers.get('cache-control'), /max-age=60, s-maxage=300/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  await check('staging serves the sanitized public asset feed before the authenticated runtime fallback', async () => {
    stagingRuntimeCalls = 0;
    globalThis.fetch = async () => respond(JSON.stringify({ assets: [{
      id: 'asset-staging', asset_key: 'hero', image_url: 'https://cdn.example.test/hero.webp',
      created_by_id: 'private-actor', audit_reason: 'private-reason',
    }] }));
    const response = await stagingHandler.fetch(request('/api/assets'), {}, {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { assets: [{
      id: 'asset-staging', asset_key: 'hero', image_url: 'https://cdn.example.test/hero.webp',
    }] });
    assert.match(response.headers.get('cache-control'), /max-age=60, s-maxage=300/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(stagingRuntimeCalls, 0, 'public asset response must not fall through to the authenticated runtime');
  });

  await check('non-GET and query variants do not reach the upstream', async () => {
    globalThis.fetch = async () => { throw new Error('upstream must not be called'); };
    assert.equal((await routeV180PublicAssets(request('/api/assets', { method: 'POST' }))).status, 405);
    assert.equal((await routeV180PublicAssets(request('/api/assets?next=https://attacker.test'))).status, 404);
  });

  for (const [name, response] of [
    ['upstream redirect', respond('', 302, { location: 'https://attacker.test', 'content-type': 'application/json' })],
    ['unexpected content type', respond('<html>private</html>', 200, { 'content-type': 'text/html' })],
    ['unexpected response shape', respond(JSON.stringify({ rows: [] }))],
    ['unsafe image URL scheme', respond(JSON.stringify({ assets: [{ asset_key: 'bad', image_url: 'javascript:alert(1)' }] }))],
    ['oversized response', respond(' '.repeat(1_500_001))],
  ]) {
    await check(`${name} fails closed without caching`, async () => {
      globalThis.fetch = async () => response.clone();
      const result = await routeV180PublicAssets(request());
      assert.equal(result.status, 503);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await result.json(), { error: 'Public assets are temporarily unavailable.' });
    });
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`v180 public assets adapter: ${checks.length}/${checks.length} PASS`);
