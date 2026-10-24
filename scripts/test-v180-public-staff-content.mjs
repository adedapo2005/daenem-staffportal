import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/v180-public-staff-content.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
const helperSource = await readFile(new URL('../worker/v180-curated-content-schedule.ts', import.meta.url), 'utf8');
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
const compiled = ts.transpileModule(source, { compilerOptions: options }).outputText;
const helperCompiled = ts.transpileModule(helperSource, { compilerOptions: options }).outputText;
const helper = { exports: {} };
new Function('module', 'exports', helperCompiled)(helper, helper.exports);
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, (name) => {
  assert.equal(name, './v180-curated-content-schedule');
  return helper.exports;
});
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

  await check('Owner-curated inspiration without category is accepted with a neutral label', async () => {
    const owner = { ...payload,
      spotlight: { id: 'spotlight-clarity', title: 'Make The Next Handoff Clear', body: 'Keep the next action visible.', category: 'Communication' },
      inspiration: { id: 'staff-portal-welcome-inspiration', message: 'Build a workplace where communication helps.', attribution: 'DAENEM Staff Team', active: true },
      provider: 'curated', providerConnected: false };
    globalThis.fetch = async () => respond(JSON.stringify(owner));
    const result = await routeV180PublicStaffContent(request());
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.deepEqual(body.inspiration, {
      id: 'staff-portal-welcome-inspiration', message: 'Build a workplace where communication helps.',
      attribution: 'DAENEM Staff Team', category: 'Employee Inspiration',
    });
    assert.equal(body.spotlight.title, owner.spotlight.title);
    assert.equal(body.provider, 'curated');
    assert.equal(body.providerConnected, false);
    assert.equal(body.contentMode, undefined, 'Owner-authored content is never replaced with default rotation');
    assert.ok(!JSON.stringify(body).includes('active'));
  });

  await check('invalid optional category does not block otherwise valid curated content', async () => {
    for (const category of [42, 'x'.repeat(121), '', null]) {
      globalThis.fetch = async () => respond(JSON.stringify({
        ...payload, inspiration: { ...payload.inspiration, category },
      }));
      const result = await routeV180PublicStaffContent(request());
      assert.equal(result.status, 200);
      assert.equal((await result.json()).inspiration.category, 'Employee Inspiration');
    }
  });

  await check('missing required inspiration attribution still fails closed', async () => {
    globalThis.fetch = async () => respond(JSON.stringify({
      ...payload, inspiration: { id: 'unattributed', message: 'Needs a real attribution', category: 'Staff' },
    }));
    const result = await routeV180PublicStaffContent(request());
    assert.equal(result.status, 503);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  });

  await check('default editorial items rotate on the approved schedule without claiming an AI connection', async () => {
    const rotation = helper.exports.rotateDefaultCuratedContent;
    const first = rotation({
      spotlight: { id: 'staff-portal-welcome-spotlight', title: 'Default', body: 'Default body', category: 'Daily Spotlight' },
      inspiration: { id: 'inspiration-growth', message: 'Default quote', attribution: 'DAENEM Staff Team', category: 'Professional Growth' },
      provider: 'curated', providerConnected: false,
    }, Date.UTC(2026, 9, 24, 3));
    const later = rotation({
      spotlight: { id: 'staff-portal-welcome-spotlight', title: 'Default', body: 'Default body', category: 'Daily Spotlight' },
      inspiration: { id: 'inspiration-growth', message: 'Default quote', attribution: 'DAENEM Staff Team', category: 'Professional Growth' },
      provider: 'curated', providerConnected: false,
    }, Date.UTC(2026, 9, 25, 12));
    assert.equal(first.contentMode, 'scheduled_curated');
    assert.notEqual(first.spotlight.id, later.spotlight.id);
    assert.notEqual(first.inspiration.id, later.inspiration.id);
    assert.ok(Date.parse(first.expiresAt) > Date.parse(first.intervalStartedAt));
    assert.equal(rotation({
      spotlight: { id: 'owner-override', title: 'Owner message', body: 'Approved body', category: 'Daily Spotlight' },
      inspiration: { id: 'inspiration-growth', message: 'Owner quote', attribution: 'Team', category: 'Growth' },
      provider: 'curated', providerConnected: false,
    }), null, 'Owner Studio overrides always remain authoritative');
  });

  await check('default curated live adapter responds with a changing content ID and truthful provider status', async () => {
    const basic = { ...payload,
      spotlight: { ...payload.spotlight, id: 'staff-portal-welcome-spotlight' },
      inspiration: { ...payload.inspiration, id: 'inspiration-growth' },
      provider: 'curated', providerConnected: false };
    globalThis.fetch = async () => respond(JSON.stringify(basic));
    const result = await routeV180PublicStaffContent(request());
    assert.equal(result.status, 200);
    const response = await result.json();
    assert.equal(response.contentMode, 'scheduled_curated');
    assert.match(response.spotlight.id, /^daenem-editorial-day-/);
    assert.match(response.inspiration.id, /^daenem-editorial-block-/);
    assert.equal(response.provider, 'curated');
    assert.equal(response.providerConnected, false);
    assert.equal(JSON.stringify(response).includes('private_note'), false);
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
