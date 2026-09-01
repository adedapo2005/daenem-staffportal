import type { SocialEnv } from './social-engine';

const encoder = new TextEncoder();
const allowedEvents = new Set(['page_view','cta_click','whatsapp_click','product_view','add_to_cart','lead','order_started','purchase','form_submit','heatmap_click']);
const nonEssentialEvents = new Set(['page_view','cta_click','whatsapp_click','product_view','add_to_cart','heatmap_click']);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' } });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function deviceType(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  if (/bot|crawler|spider|slurp/.test(ua)) return 'bot';
  return 'desktop';
}

function hostOnly(value: string | undefined) {
  if (!value) return undefined;
  try { return new URL(value).hostname.slice(0, 200); } catch { return undefined; }
}

function cfLocation(request: Request) {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  return {
    countryCode: typeof cf?.country === 'string' ? cf.country.slice(0, 8) : undefined,
    region: typeof cf?.region === 'string' ? cf.region.slice(0, 120) : undefined,
    city: typeof cf?.city === 'string' ? cf.city.slice(0, 120) : undefined,
  };
}

async function rateLimit(request: Request, env: SocialEnv) {
  if (!env.SOCIAL_CACHE) return true;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const bucket = Math.floor(Date.now() / 60000);
  const key = `social-rate:${await sha256(`${ip}:${bucket}`)}`;
  const current = Number(await env.SOCIAL_CACHE.get(key) || 0);
  if (current >= 300) return false;
  await env.SOCIAL_CACHE.put(key, String(current + 1), { expirationTtl: 120 });
  return true;
}

async function firstPartyEvent(request: Request, env: SocialEnv) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!(await rateLimit(request, env))) return json({ error: 'Too many tracking events.' }, 429);
  let body: { brand?: string; eventType?: string; visitorId?: string; sessionId?: string; consentState?: string; pagePath?: string; elementKey?: string; xPercent?: number; yPercent?: number; referrer?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; orderId?: string; valueNaira?: number; metadata?: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ error: 'Invalid event payload.' }, 400); }
  const brandCode = String(body.brand || '').trim().toLowerCase();
  const eventType = String(body.eventType || '').trim();
  if (!brandCode || !allowedEvents.has(eventType)) return json({ error: 'Valid brand and event type are required.' }, 400);
  const brand = await env.DB.prepare(`SELECT id FROM social_brands WHERE code=? AND active=1`).bind(brandCode).first<{ id: string }>();
  if (!brand) return json({ error: 'Unknown brand.' }, 404);
  const consentState = ['essential','analytics','marketing'].includes(String(body.consentState)) ? String(body.consentState) : 'unknown';
  if (nonEssentialEvents.has(eventType) && !['analytics','marketing'].includes(consentState)) return json({ accepted: false, reason: 'analytics_consent_not_granted' }, 202);
  const salt = String(env.SOCIAL_TOKEN_KEY || env.AUTH_PEPPER || '');
  const visitorHash = body.visitorId && salt ? await sha256(`${salt}:visitor:${body.visitorId}`) : null;
  const sessionHash = body.sessionId && salt ? await sha256(`${salt}:session:${body.sessionId}`) : null;
  const location = cfLocation(request);
  const x = Number(body.xPercent);
  const y = Number(body.yPercent);
  await env.DB.prepare(`INSERT INTO social_first_party_events(id,brand_id,event_type,visitor_hash,session_hash,consent_state,page_path,element_key,x_percent,y_percent,referrer_host,utm_source,utm_medium,utm_campaign,device_type,country_code,region,city,order_id,value_kobo,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(uid('social-event'), brand.id, eventType, visitorHash, sessionHash, consentState, String(body.pagePath || '').slice(0, 500) || null, String(body.elementKey || '').slice(0, 200) || null, Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : null, Number.isFinite(y) ? Math.max(0, Math.min(100, y)) : null, hostOnly(body.referrer) || null, String(body.utmSource || '').slice(0, 150) || null, String(body.utmMedium || '').slice(0, 150) || null, String(body.utmCampaign || '').slice(0, 180) || null, deviceType(request.headers.get('user-agent') || ''), location.countryCode || null, location.region || null, location.city || null, body.orderId || null, body.valueNaira == null ? null : Math.max(0, Math.round(Number(body.valueNaira || 0) * 100)), body.metadata ? JSON.stringify(body.metadata).slice(0, 8000) : null).run();
  return json({ accepted: true }, 201);
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyMetaSignature(rawBody: string, signature: string, appSecret: string) {
  if (!signature.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = `sha256=${bytesToHex(digest)}`;
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

async function metaWebhook(request: Request, env: SocialEnv, platform: 'meta' | 'whatsapp') {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    const expected = (env as SocialEnv & { SOCIAL_WEBHOOK_VERIFY_TOKEN?: string }).SOCIAL_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && expected && token === expected) return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
    return json({ error: 'Webhook verification failed.' }, 403);
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';
  const appSecret = (env as SocialEnv & { META_APP_SECRET?: string }).META_APP_SECRET || '';
  const verified = Boolean(appSecret && await verifyMetaSignature(rawBody, signature, appSecret));
  if (env.APP_STAGE === 'production' && !verified) return json({ error: 'Webhook signature verification failed.' }, 401);
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return json({ error: 'Invalid webhook JSON.' }, 400); }
  const externalEventId = request.headers.get('x-hub-signature-256') ? await sha256(`${platform}:${request.headers.get('x-hub-signature-256')}:${rawBody.slice(0, 512)}`) : await sha256(`${platform}:${rawBody}`);
  await env.DB.prepare(`INSERT OR IGNORE INTO social_webhook_events(id,platform,external_event_id,event_type,signature_verified,payload_json,status) VALUES(?,?,?,?,?,?,'received')`)
    .bind(uid('social-webhook'), platform, externalEventId, platform === 'whatsapp' ? 'whatsapp_event' : 'meta_event', verified ? 1 : 0, JSON.stringify(payload)).run();
  return json({ received: true });
}

export async function routeSocialPublic(request: Request, env: SocialEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/social/public/event') return firstPartyEvent(request, env);
  if (url.pathname === '/api/social/webhooks/meta') return metaWebhook(request, env, 'meta');
  if (url.pathname === '/api/social/webhooks/whatsapp') return metaWebhook(request, env, 'whatsapp');
  if (url.pathname.startsWith('/api/social/webhooks/')) return json({ error: 'This provider webhook verification adapter is not enabled yet.' }, 501);
  return null;
}
