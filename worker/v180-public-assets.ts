const UPSTREAM = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
const MAX_BYTES = 1_500_000;
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

async function readBounded(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
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

function safeAsset(value: unknown): PublicAsset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const asset: PublicAsset = {};
  for (const field of PUBLIC_FIELDS) {
    const entry = source[field];
    if (entry === undefined || entry === null || entry === '') continue;
    if (field === 'image_url' || field === 'default_image_url') {
      if (typeof entry !== 'string' || entry.length > 2048) return null;
      let imageUrl: URL;
      try { imageUrl = new URL(entry); } catch { return null; }
      if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password) return null;
      asset[field] = imageUrl.toString();
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
  return asset;
}

export async function routeV180PublicAssets(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/assets') return null;
  if (request.method !== 'GET' || url.search) {
    return new Response(JSON.stringify({ error: 'Not found.' }), {
      status: request.method === 'GET' ? 404 : 405,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'allow': 'GET' },
    });
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/api/assets`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (upstream.status !== 200 || upstream.redirected || !/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) return unavailable();
    const declaredBytes = Number(upstream.headers.get('content-length') || 0);
    if (declaredBytes > MAX_BYTES) return unavailable();
    const bytes = await readBounded(upstream);
    if (!bytes) return unavailable();
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { assets?: unknown };
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.assets) || payload.assets.length > 500) return unavailable();
    const assets = payload.assets.map(safeAsset);
    if (assets.some((asset) => asset === null)) return unavailable();
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
