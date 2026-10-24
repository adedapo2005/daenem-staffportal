import { rotateDefaultCuratedContent } from './v180-curated-content-schedule';

const UPSTREAM = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
const MAX_BYTES = 256_000;
const CACHE_CONTROL = 'public, max-age=15, s-maxage=30, stale-while-revalidate=15';

type ContentItem = { id: string; title: string; body: string; category: string };
type InspirationItem = { id: string; message: string; attribution: string; category: string };

const unavailable = () => new Response(JSON.stringify({ error: 'Staff content is temporarily unavailable.' }), {
  status: 503,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
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
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function safeItem(value: unknown, fields: readonly string[], limits: readonly number[]): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i++) {
    if (!boundedText(source[fields[i]], limits[i])) return null;
    result[fields[i]] = source[fields[i]] as string;
  }
  return result;
}

function validTimestamp(value: unknown): value is string {
  return boundedText(value, 64) && Number.isFinite(Date.parse(value));
}

export async function routeV180PublicStaffContent(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/staff-content') return null;
  if (request.method !== 'GET' || url.search) {
    return new Response(JSON.stringify({ error: 'Not found.' }), {
      status: request.method === 'GET' ? 404 : 405,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'allow': 'GET' },
    });
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/api/staff-content`, {
      method: 'GET', headers: { accept: 'application/json' }, redirect: 'manual',
      signal: AbortSignal.timeout(15_000), cache: 'no-store',
    });
    if (upstream.status !== 200 || upstream.redirected || !/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) return unavailable();
    if (Number(upstream.headers.get('content-length') || 0) > MAX_BYTES) return unavailable();
    const bytes = await readBounded(upstream);
    if (!bytes) return unavailable();
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return unavailable();
    const spotlight = safeItem(payload.spotlight, ['id', 'title', 'body'], [128, 300, 8_000]);
    // Approved upstream spotlight items do not always carry a category.
    // Preserve their authored title/body and use the neutral section label.
    if (spotlight) spotlight.category = boundedText((payload.spotlight as Record<string, unknown>).category, 120) ? (payload.spotlight as Record<string, string>).category : 'Daily Spotlight';
    // Approved Owner-authored inspiration items may omit the presentation-only
    // category while still providing a valid id, message and attribution.
    // Preserve the authored message and use a neutral display section label.
    const inspiration = safeItem(payload.inspiration, ['id', 'message', 'attribution'], [128, 4_000, 300]);
    if (inspiration) inspiration.category = boundedText((payload.inspiration as Record<string, unknown>).category, 120)
      ? (payload.inspiration as Record<string, string>).category : 'Employee Inspiration';
    if (!spotlight || !inspiration || !boundedText(payload.provider, 120) || typeof payload.providerConnected !== 'boolean' ||
        !validTimestamp(payload.intervalStartedAt) || !validTimestamp(payload.expiresAt)) return unavailable();

    // The original default items never changed even when the Owner Studio
    // returned a new refresh window. Rotate curated supplemental copy only for
    // those exact default IDs. Any Owner-authored or provider-connected content
    // remains authoritative and passes through without modification.
    const editorial = rotateDefaultCuratedContent({
      spotlight: spotlight as ContentItem, inspiration: inspiration as InspirationItem,
      provider: payload.provider as string, providerConnected: payload.providerConnected,
    });
    return new Response(JSON.stringify({
      spotlight: editorial?.spotlight || spotlight,
      inspiration: editorial?.inspiration || inspiration,
      provider: payload.provider, providerConnected: payload.providerConnected,
      intervalStartedAt: editorial?.intervalStartedAt || payload.intervalStartedAt,
      expiresAt: editorial?.expiresAt || payload.expiresAt,
      ...(editorial ? { contentMode: editorial.contentMode } : {}),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': CACHE_CONTROL, 'x-content-type-options': 'nosniff' },
    });
  } catch {
    return unavailable();
  }
}
