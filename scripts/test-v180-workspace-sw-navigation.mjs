import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const origin = 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev';
const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const handlers = new Map();
const storage = new Map();
const sent = [];
const visited = [];
let offline = false;
let authenticated = false;
let claimed = false;
const keyFor = (request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
const cacheFor = (name) => {
  if (!storage.has(name)) storage.set(name, new Map());
  const entries = storage.get(name);
  return {
    put: async (request, response) => entries.set(keyFor(request), response.clone()),
    match: async (request) => entries.get(keyFor(request))?.clone(),
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
  };
};
const caches = {
  open: async (name) => cacheFor(name),
  keys: async () => [...storage.keys()],
  delete: async (name) => storage.delete(name),
};
const ok = (body, type = 'text/plain') => new Response(body, {
  status: 200, headers: { 'content-type': type, 'cache-control': 'public, max-age=300' },
});
const fetchMock = async (request, options = {}) => {
  const url = new URL(keyFor(request));
  visited.push({ path: url.pathname, cache: options.cache || null });
  if (offline) throw new TypeError('network offline');
  if (url.pathname === '/manifest.webmanifest') return ok('{"name":"DAENEM"}', 'application/manifest+json');
  if (url.pathname === '/assets/private.js') return new Response('SENSITIVE', {
    status: 200, headers: { 'cache-control': 'private, no-store', 'content-type': 'application/javascript' },
  });
  if (url.pathname.startsWith('/assets/')) return ok('PUBLIC_STATIC_ASSET', 'application/javascript');
  if (url.pathname === '/workspace' && options.cache !== 'no-store') {
    throw new Error('workspace navigation must be network-only');
  }
  if (url.pathname === '/workspace' && !authenticated) {
    return new Response(null, { status: 302, headers: { location: '/' } });
  }
  return ok(url.pathname === '/workspace' ? 'PRIVATE_WORKSPACE_DATA' : 'PUBLIC_V180_HTML', 'text/html');
};
const self = {
  location: { origin },
  skipWaiting: async () => undefined,
  clients: {
    claim: async () => { claimed = true; },
    matchAll: async () => [{ postMessage: (message) => sent.push(message) }],
  },
  addEventListener: (name, fn) => handlers.set(name, fn),
};
runInNewContext(worker, { self, URL, Request, Response, caches, fetch: fetchMock, console });

async function fire(name, data = {}) {
  const tasks = [];
  let handled = false;
  let response;
  const event = {
    ...data,
    waitUntil(promise) { tasks.push(Promise.resolve(promise)); },
    respondWith(promise) { handled = true; response = Promise.resolve(promise); },
  };
  handlers.get(name)(event);
  const result = handled ? await response : undefined;
  await Promise.all(tasks);
  return { handled, result };
}
const nav = (path) => ({ url: origin + path, method: 'GET', mode: 'navigate' });
const asset = (path) => ({ url: origin + path, method: 'GET', mode: 'cors' });
let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('PASS ' + name);
}

await check('install never precaches root or Workspace HTML', async () => {
  await fire('install');
  assert(!visited.some((item) => item.path === '/' || item.path === '/workspace'));
  assert(![...storage.values()].some((items) => [...items.keys()].some((value) => new URL(value).pathname === '/')));
});
await check('activation deletes old root/Workspace caches but preserves unrelated storage', async () => {
  await (await caches.open('daenem-workforce-shell-v8-offline-foundation-v1')).put('/', ok('PRIVATE_WORKSPACE_DATA', 'text/html'));
  await (await caches.open('unrelated-offline-attachments')).put('/safe', ok('encrypted'));
  await fire('activate');
  assert(claimed);
  assert(!storage.has('daenem-workforce-shell-v8-offline-foundation-v1'));
  assert(storage.has('unrelated-offline-attachments'));
});
await check('unauthenticated direct Workspace request retains backend redirect', async () => {
  const { result } = await fire('fetch', { request: nav('/workspace') });
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), '/');
  assert.equal(visited.at(-1).cache, 'no-store');
});
await check('public v180 root uses network and never writes navigation cache', async () => {
  const { result } = await fire('fetch', { request: nav('/') });
  assert.match(await result.text(), /PUBLIC_V180_HTML/);
  assert(![...storage.values()].some((items) => items.has(origin + '/')));
});
await check('authenticated Workspace HTML is served online without ever entering CacheStorage', async () => {
  authenticated = true;
  const { result } = await fire('fetch', { request: nav('/workspace') });
  assert.match(await result.text(), /PRIVATE_WORKSPACE_DATA/);
  assert(![...storage.values()].some((items) => items.has(origin + '/workspace')));
});
await check('offline Workspace navigation never replays previously cached private content', async () => {
  offline = true;
  const { result } = await fire('fetch', { request: nav('/workspace') });
  assert.equal(result.status, 503);
  assert.match(await result.text(), /Connection required/);
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
await check('offline root and approved sign-in route also show neutral no-data response', async () => {
  for (const path of ['/', '/staff-portal-signin']) {
    const { result } = await fire('fetch', { request: nav(path) });
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /PRIVATE_WORKSPACE_DATA|PUBLIC_V180_HTML/);
  }
});
await check('offline static asset cache remains available', async () => {
  offline = false;
  const first = await fire('fetch', { request: asset('/assets/app-abc.js') });
  assert.equal(await first.result.text(), 'PUBLIC_STATIC_ASSET');
  offline = true;
  const second = await fire('fetch', { request: asset('/assets/app-abc.js') });
  assert.equal(await second.result.text(), 'PUBLIC_STATIC_ASSET');
});
await check('private or no-store assets never enter offline cache', async () => {
  offline = false;
  await fire('fetch', { request: asset('/assets/private.js') });
  offline = true;
  const { result } = await fire('fetch', { request: asset('/assets/private.js') });
  assert.equal(result.type, 'error');
});
await check('auth API and logout operations are never intercepted', async () => {
  for (const request of [
    { url: origin + '/api/auth/me', method: 'GET', mode: 'cors' },
    { url: origin + '/api/auth/logout', method: 'POST', mode: 'cors' },
  ]) {
    const event = await fire('fetch', { request });
    assert.equal(event.handled, false);
  }
});
await check('offline background sync notification remains intact', async () => {
  await fire('sync', { tag: 'daenem-offline-sync' });
  assert.deepEqual(sent.map((item) => item.type), ['daenem-offline-sync']);
});
console.log(passed + '/' + passed + ' PASS - v180/workspace service worker navigation boundary');
