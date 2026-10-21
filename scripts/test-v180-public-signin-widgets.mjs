import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['worker/v180-public-signin-widgets.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { routeV180PublicSignInWidgets: route } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const originalFetch = globalThis.fetch;
let calls = [], upstream;
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return upstream(); };
const domains = ['Security', 'Economy', 'Politics', 'Agriculture', 'Energy', 'Infrastructure'];
const item = { id: 'one', title: 'Verified headline', source: 'Configured source', link: 'https://example.org/article', published: '2026-10-20T12:00:00Z', summary: 'Attributed reporting', categories: 'Nigeria', private: 'must not pass' };
const fixture = { state: 'partial', latest: [item], intelligence: Object.fromEntries(domains.map(domain => [domain, [item]])), sources: [{ name: item.source, secret: 'must not pass' }], owner: { secret: 'must not pass' }, padding: 'x'.repeat(355_000) };
const news = 'https://staging.example/api/context/signin/news';
const settings = 'https://staging.example/api/context/signin/widget-settings';
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  check(await route(new Request('https://staging.example/api/owner/intelligence')) === null, 'owner route is not made public');
  check(await route(new Request('https://staging.example/api/context/postlogin')) === null, 'postlogin route is not intercepted');
  check((await route(new Request(news + '?url=https://example.org/private'))).status === 404, 'query targets rejected');
  check((await route(new Request(news, { method: 'POST', body: '{}' }))).status === 405, 'writes rejected');
  check(calls.length === 0, 'rejected and unrelated routes never fetch');
  upstream = () => Response.json(fixture, { headers: { 'set-cookie': 'must-not-forward=1' } });
  const result = await route(new Request(news, { headers: { authorization: 'Bearer must-not-forward', cookie: 'private=must-not-forward' } }));
  const payload = await result.json();
  check(result.status === 200 && payload.latest.length === 1, 'real-sized feed is accepted');
  check(payload.state === 'partial', 'usable partial feed is retained');
  check(domains.every(domain => payload.intelligence[domain].length === 1), 'all six domains retained');
  check(!JSON.stringify(payload).includes('must not pass') && !('padding' in payload), 'only public content fields projected');
  check(!result.headers.has('set-cookie'), 'upstream headers not forwarded');
  check(calls.at(-1).url === 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site/api/news', 'fixed approved source');
  check(JSON.stringify(calls.at(-1).init.headers) === '{"accept":"application/json"}', 'no incoming credentials forwarded');
  check(calls.at(-1).init.redirect === 'manual', 'redirects disabled');
  check(calls.at(-1).init.signal instanceof AbortSignal, 'bounded request deadline');
  upstream = () => Response.json({ ...fixture, latest: [{ ...item, link: 'javascript:alert(1)' }, { ...item, id: 'two', link: 'https://user:password@example.org/' }] });
  const invalidLinks = await (await route(new Request(news))).json();
  check(invalidLinks.latest.every(item => item.link === ''), 'unsafe links remain unlinked');
  upstream = () => Response.json({ settings: { owner: 'must not pass', widgets: { news: { autoScroll: true, rotationSeconds: 60, tickerSpeed: 'slow', tickerPauseOnHover: true, overlayStyle: 'glass', background: 'must not pass', enabledSources: [item.source] }, intelligence: { cycleSeconds: 30 }, spotlight: {}, inspiration: {} }, contentAutomation: { intervalMinutes: 10, apiKey: 'must not pass' } } });
  const projected = await (await route(new Request(settings))).json();
  check(projected.widgets.news.rotationSeconds === 60 && projected.widgets.intelligence.cycleSeconds === 30, 'approved rotation controls retained');
  check(projected.widgets.news.tickerSpeed === 'slow' && projected.widgets.news.tickerPauseOnHover, 'ticker controls retained');
  check(projected.contentAutomation.intervalMinutes === 10, 'existing content cadence retained');
  check(!JSON.stringify(projected).includes('glass') && !JSON.stringify(projected).includes('must not pass'), 'paint and private configuration excluded');
  for (const factory of [
    () => new Response('redirect', { status: 302, headers: { location: 'https://example.org/private' } }),
    () => new Response('<html>not JSON</html>', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    () => Response.json({ private: 'not a public feed' }),
    () => Response.json(fixture, { headers: { 'content-length': '1500001' } }),
    () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_500_001)); controller.close(); } }), { headers: { 'content-type': 'application/json' } }),
    () => { throw new Error('provider unavailable'); },
  ]) { upstream = factory; check((await route(new Request(news))).status === 503, 'upstream error and oversized body fail safely'); }
  console.log(`PASS ${checks} public Sign-In widget adapter checks`);
} finally { globalThis.fetch = originalFetch; }
