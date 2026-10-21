// Read only the approved, already-public V180 feeds. Never forward credentials,
// owner configuration, arbitrary URLs, or upstream response headers.
const UPSTREAM = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
const NEWS_PATH = '/api/context/signin/news';
const SETTINGS_PATH = '/api/context/signin/widget-settings';
const DOMAINS = ['Security', 'Economy', 'Politics', 'Agriculture', 'Energy', 'Infrastructure'] as const;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? 'public, max-age=60, s-maxage=60, stale-while-revalidate=300' : 'no-store',
    'x-content-type-options': 'nosniff',
    ...(status === 405 ? { allow: 'GET' } : {}),
  },
});

function publicLink(value: unknown) {
  try {
    const url = new URL(text(value, 4_000));
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function items(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).flatMap((item: unknown) => {
    const raw = record(item);
    const title = text(raw.title, 600), source = text(raw.source, 160);
    if (!title || !source) return [];
    const published = text(raw.published, 64);
    return [{ id: text(raw.id, 200), title, source, link: publicLink(raw.link),
      summary: text(raw.summary, 2_000), categories: text(raw.categories, 160),
      published: Number.isFinite(Date.parse(published)) ? published : '' }];
  });
}

function newsPayload(value: unknown) {
  const raw = record(value), news = record(raw.news), intelligence = record(raw.intelligence);
  if (!Array.isArray(raw.latest) && !Array.isArray(news.all) && !DOMAINS.some(domain => Array.isArray(intelligence[domain]))) return null;
  const latest = items(raw.latest);
  const all = latest.length ? latest : items(Array.isArray(news.all) ? news.all : Object.values(news).flat());
  return {
    state: ['live', 'partial', 'cached', 'unavailable'].includes(String(raw.state)) ? raw.state : all.length ? 'partial' : 'unavailable',
    latest: all,
    intelligence: Object.fromEntries(DOMAINS.map(domain => [domain, items(intelligence[domain])])),
    sources: Array.isArray(raw.sources) ? raw.sources.slice(0, 60).flatMap(value => {
      const source = record(value), name = text(source.name, 160);
      return name ? [{ name }] : [];
    }) : [],
    updated_at: Number.isFinite(Date.parse(String(raw.updated_at))) ? text(raw.updated_at, 64) : '',
  };
}

// Behaviour only: preserve the approved sign-in geometry, photos and no-glass
// paint. Do not expose the rest of portal-config to the anonymous client.
function widgetSettings(value: unknown) {
  const settings = record(record(value).settings), widgets = record(settings.widgets);
  if (!Object.keys(widgets).length) return null;
  const booleanKeys = ['liveMode', 'autoScroll', 'rotationPaused', 'wireEnabled', 'tickerPaused', 'tickerPauseOnHover', 'tickerShowSource', 'tickerShowFreshness', 'showMeta', 'showSourceTime', 'showSource', 'showFreshness', 'showSummary'];
  const numberLimits: Record<string, [number, number]> = {
    refreshMinutes: [10, 120], cycleSeconds: [5, 300], rotationSeconds: [5, 300],
    autoCycleIntervalSeconds: [5, 300], resumeSeconds: [1, 60], transitionDuration: [0, 1.5],
  };
  const enums: Record<string, string[]> = {
    scrollBehavior: ['vertical_continuous', 'static', 'horizontal'],
    scrollSpeed: ['slow', 'standard', 'fast'], tickerSpeed: ['slow', 'standard', 'fast'], wireSpeed: ['slow', 'standard', 'fast'],
    tickerDirection: ['left', 'right'], tickerSeparator: ['bullet', 'slash', 'line', 'diamond'],
    transitionStyle: ['crossfade', 'none'], transition: ['crossfade', 'none'],
    rotationMode: ['smart', 'sequential'], contentOrder: ['time_source', 'source_time'],
  };
  const result = Object.fromEntries(['news', 'intelligence', 'spotlight', 'inspiration'].map(key => {
    const raw = record(widgets[key]), projected: Record<string, unknown> = {};
    for (const field of booleanKeys) if (typeof raw[field] === 'boolean') projected[field] = raw[field];
    for (const [field, [min, max]] of Object.entries(numberLimits)) if (typeof raw[field] === 'number' && Number.isFinite(raw[field])) projected[field] = Math.max(min, Math.min(max, raw[field]));
    for (const [field, allowed] of Object.entries(enums)) if (allowed.includes(String(raw[field]))) projected[field] = raw[field];
    for (const field of ['enabledSources', 'sourcePriority']) if (Array.isArray(raw[field])) projected[field] = raw[field].slice(0, 60).map(item => text(item, 160)).filter(Boolean);
    if (typeof raw.dominantSource === 'string') projected.dominantSource = text(raw.dominantSource, 160);
    return [key, projected];
  }));
  const automation = record(settings.contentAutomation);
  const interval = Number(automation.intervalMinutes);
  return { widgets: result, contentAutomation: { intervalMinutes: Number.isFinite(interval) ? Math.max(5, Math.min(60, interval)) : 10 } };
}

async function readBounded(upstream: Response, max: number) {
  if (!upstream.body || Number(upstream.headers.get('content-length') || 0) > max) return null;
  const reader = upstream.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) { void reader.cancel().catch(() => undefined); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

export async function routeV180PublicSignInWidgets(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== NEWS_PATH && url.pathname !== SETTINGS_PATH) return null;
  if (request.method !== 'GET' || url.search) return response({ error: 'Not found.' }, request.method === 'GET' ? 404 : 405);
  const news = url.pathname === NEWS_PATH;
  try {
    const upstream = await fetch(`${UPSTREAM}${news ? '/api/news' : '/api/portal-config'}`, {
      method: 'GET', headers: { accept: 'application/json' }, redirect: 'manual',
      signal: AbortSignal.timeout(15_000), cache: 'no-store',
    });
    if (upstream.status !== 200 || upstream.redirected || !/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) throw new Error('Unavailable');
    // The approved news feed is approximately 355 KB before projection.
    const raw = await readBounded(upstream, news ? 1_500_000 : 1_000_000);
    const payload = news ? newsPayload(raw) : widgetSettings(raw);
    return payload ? response(payload) : response({ error: 'Widget updates are temporarily unavailable.' }, 503);
  } catch { return response({ error: 'Widget updates are temporarily unavailable.' }, 503); }
}
