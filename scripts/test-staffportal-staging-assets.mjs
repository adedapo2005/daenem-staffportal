const base = new URL(process.env.STAFFPORTAL_STAGING_URL || 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev');
const assetPattern = /(?:\/assets\/|\.\/|assets\/)[A-Za-z0-9_./-]+\.(?:js|mjs|css|woff2?|png|jpe?g|svg|webp)/g;
const expectedTypes = {
  '.js': /(?:javascript|ecmascript)/i,
  '.mjs': /(?:javascript|ecmascript)/i,
  '.css': /text\/css/i,
  '.woff': /font|woff|octet-stream/i,
  '.woff2': /font|woff|octet-stream/i,
  '.png': /image\/png/i,
  // Approved V115 keeps .jpg source references, while staging serves the verified responsive WebP derivative behind the same URL.
  '.jpg': /image\/(?:jpeg|webp)/i,
  '.jpeg': /image\/(?:jpeg|webp)/i,
  '.svg': /image\/svg\+xml/i,
  '.webp': /image\/webp/i,
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const extension = (pathname) => Object.keys(expectedTypes).find((value) => pathname.endsWith(value));

async function responseFor(url) {
  return fetch(url, { headers: { accept: '*/*', 'cache-control': 'no-cache' }, redirect: 'manual' });
}

async function verifyOnce() {
  const root = new URL('/', base);
  root.searchParams.set('__asset_gate', String(Date.now()));
  const rootResponse = await responseFor(root);
  if (rootResponse.status !== 200 || !/text\/html/i.test(rootResponse.headers.get('content-type') || '')) {
    throw new Error(`Staging shell returned ${rootResponse.status} ${rootResponse.headers.get('content-type') || 'without content type'}`);
  }
  const rootHtml = await rootResponse.text();
  const queue = [];
  const checked = new Set();
  const addReferences = (text, parent) => {
    for (const match of text.matchAll(assetPattern)) {
      const value = match[0];
      const url = new URL(value.startsWith('assets/') ? `/${value}` : value, parent);
      if (url.origin === base.origin && !checked.has(url.pathname)) queue.push(url);
    }
  };
  addReferences(rootHtml, root);
  if (!queue.length) throw new Error('No versioned staging assets were found in the deployed shell.');

  while (queue.length) {
    const url = queue.shift();
    if (!url || checked.has(url.pathname)) continue;
    checked.add(url.pathname);
    if (checked.size > 500) throw new Error('Staging asset graph exceeded the 500-file safety limit.');
    const response = await responseFor(url);
    const type = response.headers.get('content-type') || '';
    const suffix = extension(url.pathname);
    if (response.status !== 200) throw new Error(`${url.pathname} returned ${response.status}.`);
    if (!suffix || !expectedTypes[suffix].test(type)) throw new Error(`${url.pathname} returned unexpected content type ${type || 'missing'}.`);
    if (suffix === '.js' || suffix === '.mjs' || suffix === '.css') {
      const text = await response.text();
      if (/^\s*<!doctype html/i.test(text)) throw new Error(`${url.pathname} returned the SPA HTML fallback.`);
      addReferences(text, url);
    }
  }
  if (![...checked].some((path) => /qa-review-v115-runtime-.*\.css$/.test(path))) {
    throw new Error('The approved post-login stylesheet was not reachable from the deployed asset graph.');
  }
  return checked.size;
}

let lastError;
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    const first = await verifyOnce();
    await delay(2_000);
    const second = await verifyOnce();
    console.log(`StaffPortal staging asset integrity PASS (${first}/${second} assets across two stable reads).`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`Asset integrity attempt ${attempt}/5 failed: ${error instanceof Error ? error.message : String(error)}`);
    if (attempt < 5) await delay(4_000);
  }
}
throw lastError;
