import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import ts from 'typescript';

const origin = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const source = await readFile(new URL('../worker/v180-public-assets.ts', import.meta.url), 'utf8');
const pins = {};
const images = new Map();
for (const format of ['png', 'jpeg', 'webp']) {
  const bytes = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#346789' } }).toFormat(format).toBuffer();
  const url = `${origin}/assets/test.${format}`;
  pins[url] = { sha256: createHash('sha256').update(bytes).digest('hex'), mime: `image/${format}`, bytes: bytes.length };
  images.set(format, { bytes, url });
}
const module = { exports: {} };
new Function('module', 'exports', 'require', compile(source))(module, module.exports, name => {
  assert.equal(name, './v180-public-image-manifest.json');
  return { default: pins };
});
const { routeV180PublicAssets: route } = module.exports;
const stagingSource = await readFile(new URL('../worker/staffportal-staging.ts', import.meta.url), 'utf8');
const stagingModule = { exports: {} };
new Function('module', 'exports', 'require', compile(stagingSource))(stagingModule, stagingModule.exports, name => {
  if (name === './v180-public-assets') return { routeV180PublicAssets: route };
  if (name === './workspace-route') return { routeWorkspaceShell() { throw new Error('Image must not reach SPA'); } };
  if (name === './runtime') return { default: { fetch() { throw new Error('Image must not reach authenticated runtime'); } } };
  throw new Error(`Unexpected import ${name}`);
});
const originalFetch = globalThis.fetch;
const originalTimeout = AbortSignal.timeout;
const asset = (overrides = {}) => ({ asset_key: 'hero.day', qa_status: 'approved', display_enabled: true, image_url: images.get('png').url, default_image_url: images.get('jpeg').url, ...overrides });
const request = (path = '/api/assets/images/hero.day/image', init) => new Request(`https://staffportal.example.test${path}`, init);
let calls;
const mock = (rows = [asset()], imageResponse = () => new Response(images.get('png').bytes, { headers: { 'content-type': 'image/png' } })) => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url === `${origin}/api/assets`) return Response.json({ assets: rows });
    return imageResponse(url, init);
  };
};
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS: ${name}`); };
const failure = async (response, status) => {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /secret|private|<html>|https:/);
};

try {
  for (const [format, { bytes, url }] of images) {
    await check(`approved ${format} bytes survive same-origin delivery and full decode`, async () => {
      mock([asset({ image_url: url })], () => new Response(bytes, { headers: {
        'content-type': `image/${format}`, 'set-cookie': 'secret-cookie', authorization: 'private',
        'x-provider-token': 'private', location: 'https://private.test', 'cache-control': 'private',
      } }));
      const response = await stagingModule.exports.default.fetch(request(undefined, { headers: {
        cookie: 'secret', authorization: 'Bearer private', 'x-api-key': 'private',
        'cf-access-client-secret': 'private', range: 'bytes=0-2', 'if-none-match': 'secret',
      } }), {}, {});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), `image/${format}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      for (const name of ['set-cookie', 'authorization', 'x-provider-token', 'location', 'etag']) assert.equal(response.headers.get(name), null);
      const delivered = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(delivered, bytes);
      const decoded = await sharp(delivered).raw().toBuffer({ resolveWithObject: true });
      assert.equal(decoded.info.width, 8);
      assert.equal(decoded.info.height, 6);
      assert.equal(calls.length, 2);
      for (const { init } of calls) {
        assert.deepEqual(Object.keys(init.headers), ['accept']);
        assert.equal(init.method, 'GET');
        assert.equal(init.credentials, 'omit');
        assert.equal(init.redirect, 'manual');
        assert.equal(init.cache, 'no-store');
        assert.equal(init.body, undefined);
        assert.ok(init.signal instanceof AbortSignal);
      }
      assert.equal(calls[0].init.signal, calls[1].init.signal, 'one total request deadline');
    });
  }
  await check('default image uses its own approved bytes, never an automatic substitution', async () => {
    const { bytes, url } = images.get('jpeg');
    mock([asset()], target => { assert.equal(target, url); return new Response(bytes, { headers: { 'content-type': 'image/jpeg' } }); });
    assert.equal((await route(request('/api/assets/images/hero.day/default'))).status, 200);
    mock([asset({ default_image_url: undefined })]);
    await failure(await route(request('/api/assets/images/hero.day/default')), 404);
    assert.equal(calls.length, 1);
  });
  for (const [name, factory, status] of [
    ['HTML 200', () => new Response('<html>private</html>', { headers: { 'content-type': 'text/html' } }), 502],
    ['HTML with image MIME', () => new Response('<html>private</html>', { headers: { 'content-type': 'image/png' } }), 502],
    ['SVG active content', () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), 502],
    ['missing object', () => new Response('private', { status: 404 }), 404],
    ['gone object', () => new Response('private', { status: 410 }), 404],
    ['source outage', () => new Response('private', { status: 503 }), 502],
    ['unexpected host redirect', () => new Response(null, { status: 302, headers: { location: 'https://attacker.test/private' } }), 502],
    ['same-host redirect', () => new Response(null, { status: 307, headers: { location: `${origin}/assets/test.png` } }), 502],
    ['redirect loop', () => new Response(null, { status: 301, headers: { location: images.get('png').url } }), 502],
    ['wrong image MIME', () => new Response(images.get('png').bytes, { headers: { 'content-type': 'image/jpeg' } }), 502],
    ['truncated image', () => new Response(images.get('png').bytes.subarray(0, 32), { headers: { 'content-type': 'image/png' } }), 502],
    ['corrupted compressed image with matching size and MIME', () => {
      const bytes = Buffer.from(images.get('png').bytes); bytes[50] ^= 255;
      return new Response(bytes, { headers: { 'content-type': 'image/png' } });
    }, 502],
    ['oversized declared image', () => new Response('', { headers: { 'content-type': 'image/png', 'content-length': '12000001' } }), 502],
    ['oversized streamed image', () => new Response(new Uint8Array(12_000_001), { headers: { 'content-type': 'image/png' } }), 502],
  ]) {
    await check(`${name} fails closed without fallback, caching or disclosure`, async () => {
      mock([asset()], factory);
      await failure(await stagingModule.exports.default.fetch(request(), {}, {}), status);
      assert.equal(calls.length, 2);
    });
  }
  await check('already-followed redirect is rejected even with correct pinned image bytes', async () => {
    mock([asset()], () => {
      const response = new Response(images.get('png').bytes, { headers: { 'content-type': 'image/png' } });
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    });
    await failure(await route(request()), 502);
  });
  for (const fields of [
    { qa_status: 'pending' }, { qa_status: 'pending_review' }, { qa_status: 'draft' }, { qa_status: 'draft_review' },
    { qa_status: undefined }, { display_enabled: false }, { display_enabled: undefined }, { display_enabled: 'true' },
  ]) {
    await check(`nonpublic image is not fetched: ${JSON.stringify(fields)}`, async () => {
      mock([asset(fields)]);
      await failure(await route(request()), 404);
      assert.equal(calls.length, 1);
    });
  }
  await check('approved_v179 works and revocation takes effect on the next image request', async () => {
    mock([asset({ qa_status: 'approved_v179' })]);
    assert.equal((await route(request())).status, 200);
    mock([asset({ display_enabled: false })]);
    await failure(await route(request()), 404);
    assert.equal(calls.length, 1);
  });
  await check('duplicate keys, absent keys and unverified sources cannot fetch image bytes', async () => {
    for (const rows of [[], [asset(), asset({ qa_status: 'draft' })], [asset({ image_url: '/assets/not-verified.png' })]]) {
      mock(rows);
      await failure(await route(request()), 404);
      assert.equal(calls.length, 1);
    }
  });
  for (const image_url of [
    'https://127.0.0.1/assets/test.png', 'https://169.254.169.254/assets/test.png',
    `${origin}.attacker.test/assets/test.png`, `${origin}/assets/../private/test.png`,
    `${origin}/assets/%2e%2e/private/test.png`, `${origin}/assets/test.png?token=secret`,
    `${origin}/assets/test.png#private`, `${origin}/assets/%252e%252e/test.png`,
    `${origin}/assets/%2ftest.png`, `${origin}/assets/test.png/extra`,
    'https://media.base44.com/images/private/6ab5ccef159888436a51d726/test.png',
    'https://media.base44.com/images/public/another-project/test.png',
    'https://user:secret@media.base44.com/images/public/6ab5ccef159888436a51d726/test.png',
  ]) {
    await check(`malicious or unpinned source is rejected: ${image_url}`, async () => {
      mock([asset({ image_url })]);
      await failure(await route(request()), 404);
      assert.equal(calls.length, 1);
    });
  }
  await check('query, encoded traversal, arbitrary URLs and non-GET routes do not fetch a manifest', async () => {
    for (const path of [
      '/api/assets/images/hero.day/image?url=https://attacker.test',
      '/api/assets/images/hero%2eday/image', '/api/assets/images/%252e%252e/image',
      '/api/assets/images/https%3A%2F%2Fattacker.test/image', '/api/assets/images/hero.day/other',
    ]) {
      mock(); await failure(await route(request(path)), 404); assert.equal(calls.length, 0);
    }
    for (const method of ['POST', 'PUT', 'HEAD', 'DELETE']) {
      mock(); await failure(await route(request(undefined, { method })), 405); assert.equal(calls.length, 0);
    }
  });
  await check('image fetch and body timeouts fail closed', async () => {
    AbortSignal.timeout = () => originalTimeout(15);
    // A referenced timer keeps Node alive while the abort timer is unreferenced.
    const keepAlive = setInterval(() => {}, 100);
    try {
      for (const bodyTimeout of [false, true]) {
        mock([asset()], async (_, { signal }) => {
          if (!bodyTimeout) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('private timeout')), { once: true }));
          return new Response(new ReadableStream({ start(controller) {
            signal.addEventListener('abort', () => controller.error(new Error('private timeout')), { once: true });
          } }), { headers: { 'content-type': 'image/png' } });
        });
        await failure(await route(request()), 503);
      }
    } finally { clearInterval(keepAlive); AbortSignal.timeout = originalTimeout; }
  });
} finally {
  globalThis.fetch = originalFetch;
  AbortSignal.timeout = originalTimeout;
}
console.log(`v180 public image delivery: ${checks}/${checks} PASS`);
