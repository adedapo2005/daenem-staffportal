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
const projectAsset = new Function('module', 'exports', 'require', `${compiled}\nreturn safeAsset;`)(loaded, loaded.exports, () => ({ default: {} }));
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
const upstreamOrigin = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
const privateFields = {
  created_by_id: 'private-actor', created_by: { email: 'private@example.test' },
  created_date: 'private-date', audit_reason: 'private-reason', audit: { actor: 'private-actor' },
  token: 'private-token', cookies: 'private-cookie', authorization: 'private-authorization',
  unpublished_path: '/private/unpublished.webp', arbitrary: { secret: 'private-secret' },
};
const approved = (overrides = {}) => ({
  asset_key: 'safe', qa_status: 'approved', display_enabled: true,
  image_url: '/assets/safe.webp', ...privateFields, ...overrides,
});
const safePublicAsset = { asset_key: 'safe', image_url: '/api/assets/images/safe/image', display_enabled: true };
const unsafeUrls = [
  ['protocol-relative', '//attacker.test/image.webp'],
  ['credentialed', 'https://user:password@cdn.example.test/image.webp'],
  ['empty credentials', 'https://@cdn.example.test/image.webp'],
  ['javascript', 'javascript:alert(1)'],
  ['http', 'http://cdn.example.test/image.webp'],
  ['malformed host', 'https://[broken/image.webp'],
  ['malformed escape', 'https://cdn.example.test/image%zz.webp'],
  ['missing authority', 'https:///cdn.example.test/image.webp'],
  ['missing scheme slashes', 'https:cdn.example.test/image.webp'],
  ['wrong relative prefix', '/private/image.webp'],
  ['path-relative', 'assets/image.webp'],
  ['relative prefix lookalike', '/assets-evil/image.webp'],
  ['relative case mismatch', '/Assets/image.webp'],
  ['relative traversal', '/assets/../private/image.webp'],
  ['encoded relative traversal', '/assets/%2e%2e/private/image.webp'],
  ['double-encoded relative traversal', '/assets/%252e%252e/private/image.webp'],
  ['encoded path separator', '/assets/%2f%2fattacker.test/image.webp'],
  ['backslash origin trick', '/\\attacker.test/image.webp'],
  ['relative backslash traversal', '/assets/..\\private/image.webp'],
  ['encoded backslash', '/assets/%5cprivate/image.webp'],
  ['leading whitespace', ' https://cdn.example.test/image.webp'],
  ['embedded newline', 'https://cdn.exam\nple.test/image.webp'],
  ['embedded tab', '/assets/image\t.webp'],
  ['embedded null', '/assets/image\u0000.webp'],
  ['encoded control', '/assets/image%0a.webp'],
  ['oversized URL', `https://cdn.example.test/${'a'.repeat(2048)}`],
];
const rejectedRecords = [
  ...unsafeUrls.map(([name, image_url]) => approved({ asset_key: `rejected-${name}`, image_url })),
  approved({ asset_key: 'pending-private', qa_status: 'pending_review', display_enabled: true }),
  approved({ asset_key: 'draft-private', qa_status: 'draft_review', display_enabled: true }),
  approved({ qa_status: 'pending' }), approved({ qa_status: 'draft' }),
  approved({ qa_status: undefined }), approved({ qa_status: null }),
  approved({ qa_status: 'APPROVED' }), approved({ qa_status: ' approved' }),
  approved({ qa_status: { approved: true } }),
  approved({ display_enabled: false }), approved({ display_enabled: 'true' }),
  approved({ display_enabled: null }),
  approved({ image_url: undefined }), approved({ image_url: '' }), approved({ image_url: null }),
  approved({ image_url: { url: '/assets/image.webp' } }),
  approved({ image_url: undefined, default_image_url: '/assets/default.webp' }),
  approved({ default_image_url: 'javascript:alert(1)' }),
  approved({ asset_key: undefined }), approved({ asset_key: { private: true } }),
  approved({ zoom: '1' }), approved({ focal_x: 2 }), approved({ master_width: 0 }),
  null, [], 'malformed-record', 7,
].map((row, index) => row && typeof row === 'object' && !Array.isArray(row) && typeof row.asset_key === 'string' ? { ...row, asset_key: `rejected-${index}` } : row);
const serveAssets = (assets) => { globalThis.fetch = async () => respond(JSON.stringify({ assets, ...privateFields })); };
const assertAssets = async (assets) => {
  const response = await routeV180PublicAssets(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { assets });
};

try {
  await check('publication and disabled checks run before reading any image or projecting fields', async () => {
    for (const fields of [
      { qa_status: 'pending_review', display_enabled: true },
      { qa_status: 'draft_review', display_enabled: true },
      { display_enabled: true },
      { qa_status: 'approved', display_enabled: false },
    ]) {
      const record = { ...fields };
      for (const field of ['asset_key', 'image_url', 'default_image_url']) {
        Object.defineProperty(record, field, { get() { throw new Error('Unpublishable fields must not be read'); } });
      }
      assert.equal(projectAsset(record), null);
    }
  });

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
        image_url: `${upstreamOrigin}/assets/hero.webp`, default_image_url: '/assets/default.webp',
        display_enabled: true, zoom: 1.25, focal_x: 0.5, focal_y: 0.4,
        qa_status: 'approved', ...privateFields,
      }] }));
    };
    const response = await routeV180PublicAssets(request('/api/assets', { headers: {
      cookie: 'session-secret', authorization: 'Bearer secret',
      'proxy-authorization': 'Basic private', 'x-api-key': 'private-api-key',
      'cf-access-client-secret': 'private-access-secret',
    } }));
    assert.equal(response.status, 200);
    assert.equal(observed.url, 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site/api/assets');
    assert.equal(observed.init.method, 'GET');
    assert.equal(observed.init.redirect, 'manual');
    assert.equal(observed.init.credentials, 'omit');
    assert.equal(observed.init.cache, 'no-store');
    assert.equal(observed.init.body, undefined);
    assert.deepEqual(Object.keys(observed.init.headers).sort(), ['accept']);
    assert.deepEqual(observed.init.headers, { accept: 'application/json' });
    const body = await response.json();
    assert.deepEqual(body.assets[0], {
      id: 'asset-1', asset_key: 'hero', category: 'hero', purpose: 'sign-in',
      image_url: '/api/assets/images/hero/image', default_image_url: '/api/assets/images/hero/default',
      display_enabled: true, zoom: 1.25, focal_x: 0.5, focal_y: 0.4,
    });
    assert.match(response.headers.get('cache-control'), /max-age=60, s-maxage=300/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  await check('approved relative image and default image resolve only against the pinned origin', async () => {
    serveAssets([approved({ default_image_url: '/assets/default-image.webp' })]);
    await assertAssets([{ ...safePublicAsset, default_image_url: '/api/assets/images/safe/default' }]);
  });

  await check('publication requires an explicit enabled flag, including approved_v179', async () => {
    serveAssets([approved({ qa_status: 'approved_v179', display_enabled: undefined })]);
    await assertAssets([]);
    serveAssets([approved({ qa_status: 'approved_v179' })]);
    await assertAssets([safePublicAsset]);
  });

  await check('untrusted absolute HTTPS hosts are never published or fetched', async () => {
    serveAssets([approved({ image_url: 'https://cdn.example.test/image.webp?v=2', default_image_url: 'https://images.example.test/default.webp' })]);
    await assertAssets([]);
  });

  for (const [name, image_url] of unsafeUrls) {
    await check(`${name} image is omitted without losing the approved record`, async () => {
      serveAssets([
        approved({ asset_key: 'unsafe-private', image_url }),
        approved({ asset_key: 'unsafe-default-private', default_image_url: image_url }),
        approved(),
      ]);
      await assertAssets([safePublicAsset]);
    });
  }

  await check('mixed feed omits every unapproved, disabled, missing-image and malformed record without private field leakage', async () => {
    serveAssets([
      ...rejectedRecords.slice(0, 10), approved(), ...rejectedRecords.slice(10),
      approved({ asset_key: 'legacy', qa_status: 'approved_v179', image_url: '/assets/legacy.webp' }),
      approved({ asset_key: 'absolute', image_url: `${upstreamOrigin}/assets/image.webp` }),
    ]);
    await assertAssets([
      safePublicAsset,
      { asset_key: 'legacy', image_url: '/api/assets/images/legacy/image', display_enabled: true },
      { asset_key: 'absolute', image_url: '/api/assets/images/absolute/image', display_enabled: true },
    ]);
  });

  await check('all-unpublishable and empty feeds return 200 with no record or private field leakage', async () => {
    for (const assets of [rejectedRecords, []]) {
      serveAssets(assets);
      await assertAssets([]);
    }
  });

  await check('staging serves the sanitized public asset feed before the authenticated runtime fallback', async () => {
    stagingRuntimeCalls = 0;
    globalThis.fetch = async () => respond(JSON.stringify({ assets: [{
      id: 'asset-staging', asset_key: 'hero', image_url: '/assets/hero.webp',
      qa_status: 'approved', display_enabled: true,
      created_by_id: 'private-actor', audit_reason: 'private-reason',
    }] }));
    const response = await stagingHandler.fetch(request('/api/assets'), {}, {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { assets: [{
      id: 'asset-staging', asset_key: 'hero', image_url: '/api/assets/images/hero/image', display_enabled: true,
    }] });
    assert.match(response.headers.get('cache-control'), /max-age=60, s-maxage=300/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(stagingRuntimeCalls, 0, 'public asset response must not fall through to the authenticated runtime');
  });

  await check('non-GET and query variants do not reach the upstream', async () => {
    globalThis.fetch = async () => { throw new Error('upstream must not be called'); };
    assert.equal((await routeV180PublicAssets(request('/api/assets', { method: 'POST' }))).status, 405);
    assert.equal((await routeV180PublicAssets(request('/api/assets?next=https://attacker.test'))).status, 404);
    assert.equal(await routeV180PublicAssets(request('/api/unrelated')), null);
  });

  for (const [name, response] of [
    ['upstream redirect', respond('', 302, { location: 'https://attacker.test', 'content-type': 'application/json' })],
    ['unexpected content type', respond('<html>private</html>', 200, { 'content-type': 'text/html' })],
    ['unexpected response shape', respond(JSON.stringify({ rows: [] }))],
    ['null response shape', respond('null')],
    ['array response shape', respond('[]')],
    ['invalid assets collection', respond('{"assets":{}}')],
    ['too many records', respond(JSON.stringify({ assets: Array.from({ length: 501 }, () => approved()) }))],
    ['upstream outage', respond('unavailable', 503)],
    ['oversized response', respond(' '.repeat(1_500_001))],
    ['oversized declared response', respond('{"assets":[]}', 200, { 'content-type': 'application/json', 'content-length': '1500001' })],
    ['malformed JSON', respond('{"assets":[')],
    ['invalid UTF-8', respond(new Uint8Array([0xff]))],
  ]) {
    await check(`${name} fails closed without caching`, async () => {
      globalThis.fetch = async () => response.clone();
      const result = await routeV180PublicAssets(request());
      assert.equal(result.status, 503);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await result.json(), { error: 'Public assets are temporarily unavailable.' });
    });
  }

  await check('upstream network failure fails closed without disclosing errors or credentials', async () => {
    globalThis.fetch = async () => { throw new Error('private-upstream-error'); };
    const response = await routeV180PublicAssets(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Public assets are temporarily unavailable.' });
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log(`v180 public assets adapter: ${checks.length}/${checks.length} PASS`);
