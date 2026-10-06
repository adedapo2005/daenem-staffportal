const CACHE = 'daenem-workforce-shell-v8-offline-foundation-v1';
const SHELL = ['/', '/manifest.webmanifest'];

function isCacheableShellAsset(request, url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (request.mode === 'navigate') return true;
  return url.pathname === '/manifest.webmanifest'
    || url.pathname.startsWith('/assets/')
    || /\.(?:css|js|mjs|png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname);
}

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const shellResponse = await fetch('/');
  if (!shellResponse.ok) throw new Error('The Staff Portal shell could not be fetched.');
  await cache.put('/', shellResponse.clone());
  const html = await shellResponse.text();
  const discovered = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter(Boolean)
    .map((value) => new URL(value, self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.pathname);
  const urls = [...new Set([...SHELL.slice(1), ...discovered])].filter((pathname) => {
    const url = new URL(pathname, self.location.origin);
    return isCacheableShellAsset(new Request(url), url);
  });
  await Promise.all(urls.map(async (pathname) => {
    const response = await fetch(pathname);
    if (response.ok) await cache.put(pathname, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !isCacheableShellAsset(request, url)) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          const cacheKey = request.mode === 'navigate' ? new Request('/') : request;
          caches.open(CACHE).then((cache) => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return request.mode === 'navigate' ? caches.match('/') : Response.error();
      }),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'daenem-offline-sync') return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) =>
    Promise.all(clients.map((client) => client.postMessage({ type: 'daenem-offline-sync' })))
  ));
});
