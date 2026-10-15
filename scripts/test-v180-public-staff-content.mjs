import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/v180-public-staff-content.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { routeV180PublicStaffContent } = loaded.exports;
const checks = [];
const check = async (name, action) => { await action(); checks.push(name); console.log(`PASS: ${name}`); };
const request = (path = '/api/staff-content', init = {}) => new Request(`https://staffportal.example.test${path}`, init);
const originalFetch = globalThis.fetch;
const payload = {
  spotlight: { id: 's-1', title: 'Today', body: 'Office update', category: 'Staff', created_by_id: 'private' },
  inspiration: { id: 'i-1', message: 'Keep learning', attribution: 'Team', category: 'Growth', private_note: 'hidden' },
  provider: 'approved-provider', providerConnected: false,
  intervalStartedAt: '2026-10-15T10:00:00.000Z', expiresAt: '2026-10-15T10:15:00.000Z', api_key: 'private',
};
const respond = (body, status = 200, headers = { 'content-type': 'application/json' }) => new Response(body, { status, headers });

try {
  await check('fixed public route is wired before authenticated application routing', async () => {
    assert.match(entry, /routeV180PublicStaffContent\(request\)/);
    assert.ok(entry.indexOf('routeV180PublicStaffContent(request)') < entry.indexOf('await getSessionContext(request,env)'));
  });

  await check('fixed-origin GET preserves provider truth and projects only approved public content fields', async () => {
    let observed;
    globalThis.fetch = async (url, init) => { observed = { url, init }; return respond(JSON.stringify(payload)); };
    const response = await routeV180PublicStaffContent(request('/api/staff-content', {
      headers: { cookie: 'session-secret', authorization: 'Bearer secret' },
    }));
    assert.equal(response.status, 200);
    assert.equal(observed.url, 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site/api/staff-content');
    assert.equal(observed.init.method, 'GET');
    assert.equal(observed.init.redirect, 'manual');
    assert.deepEqual(Object.keys(observed.init.headers), ['accept']);
    assert.equal(observed.init.cache, 'no-store');
    const body = await response.json();
    assert.deepEqual(body, {
      spotlight: { id: 's-1', title: 'Today', body: 'Office update', category: 'Staff' },
      inspiration: { id: 'i-1', message: 'Keep learning', attribution: 'Team', category: 'Growth' },
      provider: 'approved-provider', providerConnected: false,
      intervalStartedAt: '2026-10-15T10:00:00.000Z', expiresAt: '2026-10-15T10:15:00.000Z',
    });
    assert.match(response.headers.get('cache-control'), /max-age=15, s-maxage=30/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  await check('unsupported methods and query variants never reach the upstream', async () => {
    globalThis.fetch = async () => { throw new Error('upstream must not be called'); };
    assert.equal((await routeV180PublicStaffContent(request('/api/staff-content', { method: 'POST' }))).status, 405);
    assert.equal((await routeV180PublicStaffContent(request('/api/staff-content?next=https://attacker.test'))).status, 404);
  });

  for (const [name, response] of [
    ['upstream redirect', respond('', 302, { location: 'https://attacker.test', 'content-type': 'application/json' })],
    ['unexpected content type', respond('<html>private</html>', 200, { 'content-type': 'text/html' })],
    ['missing provider truth', respond(JSON.stringify({ ...payload, providerConnected: undefined }))],
    ['invalid expiration timestamp', respond(JSON.stringify({ ...payload, expiresAt: 'unknown' }))],
    ['malformed content shape', respond(JSON.stringify({ ...payload, spotlight: { title: 'incomplete' } }))],
    ['oversized response', respond(' '.repeat(256_001))],
  ]) {
    await check(`${name} fails closed without caching`, async () => {
      globalThis.fetch = async () => response.clone();
      const result = await routeV180PublicStaffContent(request());
      assert.equal(result.status, 503);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await result.json(), { error: 'Staff content is temporarily unavailable.' });
    });
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`v180 public staff content adapter: ${checks.length}/${checks.length} PASS`);
