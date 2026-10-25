import imageManifest from './v180-public-image-manifest.json';

const UPSTREAM = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
const MAX_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 12_000_000;
const IMAGE_ROUTE = '/api/assets/images/';
type VerifiedImage = { sha256: string; mime: string; bytes: number };
const verifiedImages: Record<string, VerifiedImage> = imageManifest;
const CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
const PUBLIC_FIELDS = [
  'id', 'asset_key', 'category', 'purpose', 'image_url', 'default_image_url',
  'zoom', 'focal_x', 'focal_y', 'display_enabled', 'master_width', 'master_height',
] as const;

type AssetField = typeof PUBLIC_FIELDS[number];
type PublicAsset = Partial<Record<AssetField, string | number | boolean>>;

const unavailable = () => new Response(JSON.stringify({ error: 'Public assets are temporarily unavailable.' }), {
  status: 503,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

async function readBounded(response: Response, limit = MAX_BYTES): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function publicImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    // Reject before URL parsing can normalize traversal, credentials or escapes.
    const path = value.startsWith('/') ? value : value.slice(value.indexOf('/', 8));
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:webp|png|jpg|jpeg)$/.test(path)) return null;
    const url = new URL(value, UPSTREAM);
    if (value !== path && value !== url.origin + path) return null;
    if (url.origin === UPSTREAM) {
      if (!path.startsWith('/assets/')) return null;
    } else if (url.origin === 'https://media.base44.com') {
      // Only the public media namespaces observed in the approved manifest.
      if (!/^\/images\/public\/(?:6ab5b6bf4880fcfae2d44d4a|6ab5ccef159888436a51d726)\/[A-Za-z0-9_-]+\.(?:webp|png|jpg|jpeg)$/.test(path)) return null;
    } else return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeAsset(value: unknown): PublicAsset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  // Publication authority is independent of presentation settings. Filter first.
  if (source.qa_status !== 'approved' && source.qa_status !== 'approved_v179') return null;
  if (source.display_enabled !== true) return null;
  const asset: PublicAsset = {};
  for (const field of PUBLIC_FIELDS) {
    const entry = source[field];
    if (entry === undefined || entry === null || entry === '') continue;
    if (field === 'image_url' || field === 'default_image_url') {
      const imageUrl = publicImageUrl(entry);
      if (!imageUrl) return null;
      asset[field] = imageUrl;
      continue;
    }
    if (field === 'zoom' || field === 'focal_x' || field === 'focal_y' || field === 'master_width' || field === 'master_height') {
      if (typeof entry !== 'number' || !Number.isFinite(entry)) return null;
      if ((field === 'focal_x' || field === 'focal_y') && (entry < 0 || entry > 1)) return null;
      if ((field === 'master_width' || field === 'master_height') && (!Number.isInteger(entry) || entry < 1 || entry > 20_000)) return null;
      if (field === 'zoom' && (entry < 0 || entry > 20)) return null;
      asset[field] = entry;
      continue;
    }
    if (field === 'display_enabled') {
      if (typeof entry !== 'boolean') return null;
      asset[field] = entry;
      continue;
    }
    if (typeof entry !== 'string' || entry.length > 500) return null;
    asset[field] = entry;
  }
  if (typeof asset.asset_key !== 'string' || typeof asset.image_url !== 'string') return null;
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(asset.asset_key) || asset.asset_key.length > 200) return null;
  return asset;
}

const notFound = (status = 404) => new Response(JSON.stringify({ error: 'Not found.' }), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'allow': 'GET' },
});

async function publicImage(source: string, signal: AbortSignal): Promise<Response> {
  const verified = Object.hasOwn(verifiedImages, source) ? verifiedImages[source] : undefined;
  if (!verified) return notFound();
  const response = await fetch(source, {
    method: 'GET', headers: { accept: verified.mime }, credentials: 'omit',
    redirect: 'manual', cache: 'no-store', signal,
  });
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (response.status !== 200 || response.redirected || mime !== verified.mime ||
      Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    return notFound(response.status === 404 || response.status === 410 ? 404 : 502);
  }
  const bytes = await readBounded(response, MAX_IMAGE_BYTES);
  if (!bytes || bytes.length !== verified.bytes) return notFound(502);
  // Pins are produced only after a full raster decode; signatures alone cannot
  // distinguish corrupt compressed data from a usable image. See audit script.
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== verified.sha256) return notFound(502);
  return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: {
    'content-type': verified.mime, 'content-length': String(bytes.length),
    // Recheck live publication on every image request, including after revocation.
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
  } });
}

export async function routeV180PublicAssets(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const isImage = url.pathname.startsWith(IMAGE_ROUTE);
  if (url.pathname !== '/api/assets' && !isImage) return null;
  if (request.method !== 'GET' || url.search) return notFound(request.method === 'GET' ? 404 : 405);
  const image = isImage ? /^\/api\/assets\/images\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\/(image|default)$/.exec(url.pathname) : null;
  if (isImage && (!image || image[1].length > 200)) return notFound();

  try {
    const signal = AbortSignal.timeout(15_000);
    const upstream = await fetch(`${UPSTREAM}/api/assets`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      redirect: 'manual',
      signal,
      cache: 'no-store',
    });
    if (upstream.status !== 200 || upstream.redirected || !/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) return unavailable();
    const declaredBytes = Number(upstream.headers.get('content-length') || 0);
    if (declaredBytes > MAX_BYTES) return unavailable();
    const bytes = await readBounded(upstream);
    if (!bytes) return unavailable();
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { assets?: unknown };
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.assets) || payload.assets.length > 500) return unavailable();
    // Ambiguous keys fail closed even if only one duplicate is approved.
    const counts = new Map<unknown, number>();
    for (const row of payload.assets) {
      const key = row && typeof row === 'object' ? (row as Record<string, unknown>).asset_key : undefined;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const assets = payload.assets.map(safeAsset).filter((asset): asset is PublicAsset => asset !== null && counts.get(asset.asset_key) === 1);
    if (image) {
      const asset = assets.find(asset => asset.asset_key === image[1]);
      const source = asset?.[image[2] === 'image' ? 'image_url' : 'default_image_url'];
      return typeof source === 'string' ? await publicImage(source, signal) : notFound();
    }
    for (const asset of assets) {
      asset.image_url = `${IMAGE_ROUTE}${asset.asset_key}/image`;
      if (asset.default_image_url) asset.default_image_url = `${IMAGE_ROUTE}${asset.asset_key}/default`;
    }
    return new Response(JSON.stringify({ assets }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': CACHE_CONTROL,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return unavailable();
  }
}
