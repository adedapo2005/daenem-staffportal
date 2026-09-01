import type { SessionContext } from './auth';
import { decryptSocialSecret } from './social-crypto';
import { requireSocialBrand, socialPermission, type SocialBrand } from './social-access';
import type { SocialEnv } from './social-engine';

export interface SocialProviderEnv extends SocialEnv {
  META_APP_SECRET?: string;
  META_GRAPH_VERSION?: string;
}

type Platform = 'facebook' | 'instagram' | 'tiktok' | 'x' | 'whatsapp';
type Connection = {
  id: string; brandId: string; platform: Platform; platformAccountId?: string; platformAdAccountId?: string;
  accessTokenCiphertext?: string; scopesJson?: string; status: string; metadataJson?: string;
};
type Metrics = { followers: number; impressions: number; reach: number; profileViews: number; engagements: number; clicks: number; messagesStarted: number; orders: number; conversions: number; revenueKobo: number; spendKobo: number };

const enc = new TextEncoder();
const uid = (p: string) => `${p}-${crypto.randomUUID()}`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const graph = (env: SocialProviderEnv) => env.META_GRAPH_VERSION || 'v24.0';
const today = () => new Date().toISOString().slice(0, 10);
const dateDaysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
function parse<T>(value: unknown, fallback: T): T { if (typeof value !== 'string' || !value) return fallback; try { return JSON.parse(value) as T; } catch { return fallback; } }
function scopes(c: Connection) { return new Set(parse<string[]>(c.scopesJson, []).map(x => String(x).toLowerCase())); }
function hasAny(s: Set<string>, values: string[]) { return values.some(v => s.has(v)); }
function emptyMetrics(): Metrics { return { followers: 0, impressions: 0, reach: 0, profileViews: 0, engagements: 0, clicks: 0, messagesStarted: 0, orders: 0, conversions: 0, revenueKobo: 0, spendKobo: 0 }; }

async function providerJson(response: Response) {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try { body = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { body = { raw: text.slice(0, 1200) }; }
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1200)}`);
  return body;
}

async function audit(env: SocialProviderEnv, context: SessionContext, brand: SocialBrand, action: string, entityType: string, entityId?: string, after?: unknown) {
  await env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(uid('audit'), context.employee.id, brand.companyId || null, 'social', action, entityType, entityId || null, after ? JSON.stringify(after) : null, 'web').run();
}

async function getConnections(env: SocialProviderEnv, brandId?: string) {
  const sql = `SELECT id,brand_id AS brandId,platform,platform_account_id AS platformAccountId,platform_ad_account_id AS platformAdAccountId,access_token_ciphertext AS accessTokenCiphertext,scopes_json AS scopesJson,status,metadata_json AS metadataJson FROM social_platform_connections WHERE status='connected'${brandId ? ' AND brand_id=?' : ''} ORDER BY brand_id,platform`;
  return brandId ? (await env.DB.prepare(sql).bind(brandId).all<Connection>()).results || [] : (await env.DB.prepare(sql).all<Connection>()).results || [];
}

async function localAttribution(env: SocialProviderEnv, brandId: string, platform: Platform, days = 1) {
  const since = `${dateDaysAgo(Math.max(0, days - 1))}T00:00:00`;
  const [messages, orders] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT conversation_id) AS count FROM social_messages m JOIN social_conversations c ON c.id=m.conversation_id WHERE c.brand_id=? AND c.platform=? AND m.direction='inbound' AND m.occurred_at>=?`).bind(brandId, platform, since).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) AS conversions,COALESCE(SUM(CASE WHEN status='completed' THEN total_kobo ELSE 0 END),0) AS revenueKobo FROM social_orders WHERE brand_id=? AND source_platform=? AND created_at>=?`).bind(brandId, platform, since).first<{ orders: number; conversions: number; revenueKobo: number }>(),
  ]);
  return { messagesStarted: n(messages?.count), orders: n(orders?.orders), conversions: n(orders?.conversions), revenueKobo: n(orders?.revenueKobo) };
}

async function upsertDaily(env: SocialProviderEnv, c: Connection, m: Metrics, source: unknown) {
  const id = `social-analytics-${c.brandId}-${c.platform}-${today()}`;
  await env.DB.prepare(`INSERT INTO social_analytics_daily(id,brand_id,connection_id,platform,metric_date,followers,impressions,reach,profile_views,engagements,clicks,messages_started,orders,conversions,revenue_kobo,spend_kobo,source_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(brand_id,platform,metric_date) DO UPDATE SET connection_id=excluded.connection_id,followers=excluded.followers,impressions=excluded.impressions,reach=excluded.reach,profile_views=excluded.profile_views,engagements=excluded.engagements,clicks=excluded.clicks,messages_started=excluded.messages_started,orders=excluded.orders,conversions=excluded.conversions,revenue_kobo=excluded.revenue_kobo,spend_kobo=excluded.spend_kobo,source_json=excluded.source_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, c.brandId, c.id, c.platform, today(), Math.round(m.followers), Math.round(m.impressions), Math.round(m.reach), Math.round(m.profileViews), Math.round(m.engagements), Math.round(m.clicks), Math.round(m.messagesStarted), Math.round(m.orders), Math.round(m.conversions), Math.round(m.revenueKobo), Math.round(m.spendKobo), JSON.stringify(source).slice(0, 12000)).run();
}

async function upsertPostMetric(env: SocialProviderEnv, c: Connection, externalPostId: string, metric: Partial<Record<'impressions'|'reach'|'videoViews'|'likes'|'comments'|'shares'|'saves'|'clicks'|'engagements', number>>, source: unknown) {
  const variant = await env.DB.prepare(`SELECT id FROM social_content_variants WHERE platform=? AND external_post_id=? LIMIT 1`).bind(c.platform, externalPostId).first<{ id: string }>();
  const id = `social-post-metric-${c.platform}-${externalPostId}-${today()}`;
  await env.DB.prepare(`INSERT INTO social_post_metrics_daily(id,brand_id,connection_id,content_variant_id,platform,external_post_id,metric_date,impressions,reach,video_views,likes,comments,shares,saves,clicks,engagements,source_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(platform,external_post_id,metric_date) DO UPDATE SET connection_id=excluded.connection_id,content_variant_id=COALESCE(excluded.content_variant_id,social_post_metrics_daily.content_variant_id),impressions=excluded.impressions,reach=excluded.reach,video_views=excluded.video_views,likes=excluded.likes,comments=excluded.comments,shares=excluded.shares,saves=excluded.saves,clicks=excluded.clicks,engagements=excluded.engagements,source_json=excluded.source_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, c.brandId, c.id, variant?.id || null, c.platform, externalPostId, today(), n(metric.impressions), n(metric.reach), n(metric.videoViews), n(metric.likes), n(metric.comments), n(metric.shares), n(metric.saves), n(metric.clicks), n(metric.engagements), JSON.stringify(source).slice(0, 10000)).run();
}

async function saveState(env: SocialProviderEnv, c: Connection, state: { profile?: string; analytics?: string; community?: string; ads?: string; missing?: string[]; error?: string; success?: boolean }) {
  const s = scopes(c);
  await env.DB.prepare(`INSERT INTO social_provider_connection_state(connection_id,brand_id,platform,profile_capability,analytics_capability,community_capability,ads_capability,granted_scopes_json,missing_scopes_json,last_profile_sync_at,last_analytics_sync_at,last_ads_sync_at,next_sync_at,consecutive_failures,last_error,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,datetime('now','+30 minutes'),?,?,CURRENT_TIMESTAMP) ON CONFLICT(connection_id) DO UPDATE SET profile_capability=excluded.profile_capability,analytics_capability=excluded.analytics_capability,community_capability=excluded.community_capability,ads_capability=excluded.ads_capability,granted_scopes_json=excluded.granted_scopes_json,missing_scopes_json=excluded.missing_scopes_json,last_profile_sync_at=CASE WHEN excluded.profile_capability='ready' THEN CURRENT_TIMESTAMP ELSE social_provider_connection_state.last_profile_sync_at END,last_analytics_sync_at=CASE WHEN excluded.analytics_capability='ready' THEN CURRENT_TIMESTAMP ELSE social_provider_connection_state.last_analytics_sync_at END,last_ads_sync_at=CASE WHEN excluded.ads_capability='ready' THEN CURRENT_TIMESTAMP ELSE social_provider_connection_state.last_ads_sync_at END,next_sync_at=datetime('now','+30 minutes'),consecutive_failures=CASE WHEN ?=1 THEN 0 ELSE social_provider_connection_state.consecutive_failures+1 END,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP`)
    .bind(c.id, c.brandId, c.platform, state.profile || 'unknown', state.analytics || 'unknown', state.community || (c.platform === 'facebook' || c.platform === 'instagram' ? 'webhook' : c.platform === 'whatsapp' ? 'webhook' : 'unsupported'), state.ads || (c.platform === 'facebook' || c.platform === 'instagram' ? (c.platformAdAccountId ? 'unknown' : 'account_required') : 'unsupported'), JSON.stringify([...s]), JSON.stringify(state.missing || []), state.success === false ? 1 : 0, state.error || null, state.success === false ? 0 : 1).run();
  await env.DB.prepare(`UPDATE social_platform_connections SET last_sync_at=CURRENT_TIMESTAMP,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(state.error || null, c.id).run();
}

async function syncMetaAds(env: SocialProviderEnv, c: Connection, token: string, metrics: Metrics, warnings: string[]) {
  const s = scopes(c);
  if (!c.platformAdAccountId) return { capability: 'account_required', read: 0 };
  if (!hasAny(s, ['ads_read', 'ads_management'])) return { capability: 'missing_scope', read: 0, missing: ['ads_read'] };
  const accountId = c.platformAdAccountId.startsWith('act_') ? c.platformAdAccountId : `act_${c.platformAdAccountId}`;
  let currency = '';
  try {
    const account = await providerJson(await fetch(`https://graph.facebook.com/${graph(env)}/${encodeURIComponent(accountId)}?fields=currency`, { headers: { Authorization: `Bearer ${token}` } }));
    currency = String(account.currency || '');
    const range = encodeURIComponent(JSON.stringify({ since: dateDaysAgo(6), until: today() }));
    const result = await providerJson(await fetch(`https://graph.facebook.com/${graph(env)}/${encodeURIComponent(accountId)}/insights?level=account&fields=impressions,reach,clicks,spend,actions&time_range=${range}`, { headers: { Authorization: `Bearer ${token}` } }));
    const rows = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
    for (const row of rows) {
      metrics.impressions += n(row.impressions); metrics.reach += n(row.reach); metrics.clicks += n(row.clicks);
      if (currency === 'NGN') metrics.spendKobo += Math.round(n(row.spend) * 100); else if (n(row.spend) > 0) warnings.push(`Meta ad spend is in ${currency || 'an unknown currency'} and was not mixed into NGN totals.`);
      const actions = Array.isArray(row.actions) ? row.actions as Array<Record<string, unknown>> : [];
      for (const a of actions) if (['purchase','lead','offsite_conversion.fb_pixel_purchase'].includes(String(a.action_type))) metrics.conversions += n(a.value);
    }
    return { capability: 'ready', read: rows.length };
  } catch (error) { warnings.push(`Meta Ads: ${(error as Error).message}`); return { capability: 'error', read: 0 }; }
}

async function syncFacebook(env: SocialProviderEnv, c: Connection, token: string) {
  const metrics = emptyMetrics(), warnings: string[] = [], s = scopes(c); let read = 0, written = 0;
  if (!c.platformAccountId) throw new Error('Facebook Page ID is missing.');
  const profile = await providerJson(await fetch(`https://graph.facebook.com/${graph(env)}/${encodeURIComponent(c.platformAccountId)}?fields=id,name,fan_count,followers_count`, { headers: { Authorization: `Bearer ${token}` } }));
  metrics.followers = Math.max(n(profile.followers_count), n(profile.fan_count)); read++;
  if (s.has('pages_read_engagement')) {
    try {
      const posts = await providerJson(await fetch(`https://graph.facebook.com/${graph(env)}/${encodeURIComponent(c.platformAccountId)}/feed?limit=50&fields=id,created_time,shares,likes.limit(0).summary(true),comments.limit(0).summary(true)`, { headers: { Authorization: `Bearer ${token}` } }));
      const rows = Array.isArray(posts.data) ? posts.data as Array<Record<string, unknown>> : [];
      for (const post of rows) {
        const likes = post.likes && typeof post.likes === 'object' ? n(((post.likes as Record<string, unknown>).summary as Record<string, unknown> | undefined)?.total_count) : 0;
        const comments = post.comments && typeof post.comments === 'object' ? n(((post.comments as Record<string, unknown>).summary as Record<string, unknown> | undefined)?.total_count) : 0;
        const shares = post.shares && typeof post.shares === 'object' ? n((post.shares as Record<string, unknown>).count) : 0;
        metrics.engagements += likes + comments + shares;
        if (post.id) { await upsertPostMetric(env, c, String(post.id), { likes, comments, shares, engagements: likes + comments + shares }, post); written++; }
      }
      read += rows.length;
    } catch (error) { warnings.push(`Facebook post metrics: ${(error as Error).message}`); }
  }
  const ads = await syncMetaAds(env, c, token, metrics, warnings);
  const local = await localAttribution(env, c.brandId, c.platform); Object.assign(metrics, { messagesStarted: local.messagesStarted, orders: local.orders, revenueKobo: local.revenueKobo }); metrics.conversions += local.conversions;
  await upsertDaily(env, c, metrics, { profile, warnings, provider: 'meta_graph' });
  return { metrics, warnings, read: read + ads.read, written: written + 1, state: { profile: 'ready', analytics: 'ready', community: 'webhook', ads: ads.capability, missing: ads.missing || [] } };
}

async function syncInstagram(env: SocialProviderEnv, c: Connection, token: string) {
  const metrics = emptyMetrics(), warnings: string[] = []; let read = 0;
  if (!c.platformAccountId) throw new Error('Instagram Professional Account ID is missing.');
  const profile = await providerJson(await fetch(`https://graph.facebook.com/${graph(env)}/${encodeURIComponent(c.platformAccountId)}?fields=id,username,name,followers_count,media_count`, { headers: { Authorization: `Bearer ${token}` } }));
  metrics.followers = n(profile.followers_count); read++;
  const s = scopes(c); let analyticsCapability = hasAny(s, ['instagram_manage_insights', 'read_insights']) ? 'ready' : 'missing_scope';
  if (analyticsCapability === 'ready') {
    try {
      const insight = await providerJson(await fetch(`https://graph.facebook.com/${graph(env)}/${encodeURIComponent(c.platformAccountId)}/insights?metric=reach,profile_views&period=day&since=${dateDaysAgo(6)}&until=${today()}`, { headers: { Authorization: `Bearer ${token}` } }));
      const rows = Array.isArray(insight.data) ? insight.data as Array<Record<string, unknown>> : [];
      for (const metric of rows) {
        const name = String(metric.name || ''); const values = Array.isArray(metric.values) ? metric.values as Array<Record<string, unknown>> : [];
        const total = values.reduce((a, v) => a + n(v.value), 0); if (name === 'reach') metrics.reach += total; if (name === 'profile_views') metrics.profileViews += total;
      }
      read += rows.length;
    } catch (error) { warnings.push(`Instagram Insights: ${(error as Error).message}`); analyticsCapability = 'error'; }
  }
  const ads = await syncMetaAds(env, c, token, metrics, warnings);
  const local = await localAttribution(env, c.brandId, c.platform); metrics.messagesStarted = local.messagesStarted; metrics.orders = local.orders; metrics.conversions += local.conversions; metrics.revenueKobo = local.revenueKobo;
  await upsertDaily(env, c, metrics, { profile, warnings, provider: 'instagram_graph' });
  return { metrics, warnings, read: read + ads.read, written: 1, state: { profile: 'ready', analytics: analyticsCapability, community: 'webhook', ads: ads.capability, missing: [...(analyticsCapability === 'missing_scope' ? ['instagram_manage_insights'] : []), ...(ads.missing || [])] } };
}

async function syncTikTok(env: SocialProviderEnv, c: Connection, token: string) {
  const metrics = emptyMetrics(), warnings: string[] = [], s = scopes(c);
  const missing = ['user.info.stats','video.list'].filter(v => !s.has(v));
  if (missing.includes('user.info.stats')) {
    const local = await localAttribution(env, c.brandId, c.platform); metrics.messagesStarted = local.messagesStarted; metrics.orders = local.orders; metrics.conversions = local.conversions; metrics.revenueKobo = local.revenueKobo; await upsertDaily(env, c, metrics, { warning: 'TikTok stats scope not authorized.' });
    return { metrics, warnings, read: 0, written: 1, state: { profile: 'missing_scope', analytics: 'missing_scope', community: 'unsupported', ads: 'unsupported', missing } };
  }
  const info = await providerJson(await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,follower_count,following_count,likes_count,video_count', { headers: { Authorization: `Bearer ${token}` } }));
  const user = info.data && typeof info.data === 'object' && (info.data as Record<string, unknown>).user && typeof (info.data as Record<string, unknown>).user === 'object' ? (info.data as Record<string, unknown>).user as Record<string, unknown> : {};
  metrics.followers = n(user.follower_count); let read = 1, written = 0;
  if (s.has('video.list')) {
    try {
      const videos = await providerJson(await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,share_url,video_description,duration,like_count,comment_count,share_count,view_count', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ max_count: 20 }) }));
      const data = videos.data && typeof videos.data === 'object' ? videos.data as Record<string, unknown> : {}; const rows = Array.isArray(data.videos) ? data.videos as Array<Record<string, unknown>> : [];
      for (const v of rows) { const likes=n(v.like_count),comments=n(v.comment_count),shares=n(v.share_count),views=n(v.view_count),eng=likes+comments+shares; metrics.impressions += views; metrics.engagements += eng; if(v.id){await upsertPostMetric(env,c,String(v.id),{videoViews:views,impressions:views,likes,comments,shares,engagements:eng},v);written++;} }
      read += rows.length;
    } catch (error) { warnings.push(`TikTok video metrics: ${(error as Error).message}`); }
  }
  const local = await localAttribution(env, c.brandId, c.platform); metrics.messagesStarted = local.messagesStarted; metrics.orders = local.orders; metrics.conversions = local.conversions; metrics.revenueKobo = local.revenueKobo;
  await upsertDaily(env, c, metrics, { profile: user, warnings, provider: 'tiktok_display' });
  return { metrics, warnings, read, written: written + 1, state: { profile: 'ready', analytics: missing.includes('video.list') ? 'missing_scope' : 'ready', community: 'unsupported', ads: 'unsupported', missing } };
}

async function syncX(env: SocialProviderEnv, c: Connection, token: string) {
  const metrics = emptyMetrics(), warnings: string[] = [];
  const me = await providerJson(await fetch('https://api.x.com/2/users/me?user.fields=id,name,username,public_metrics', { headers: { Authorization: `Bearer ${token}` } }));
  const user = me.data && typeof me.data === 'object' ? me.data as Record<string, unknown> : {}; const pm = user.public_metrics && typeof user.public_metrics === 'object' ? user.public_metrics as Record<string, unknown> : {}; metrics.followers = n(pm.followers_count); let read = 1, written = 0;
  if (user.id) {
    try {
      const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(String(user.id))}/tweets`); url.searchParams.set('max_results','100'); url.searchParams.set('start_time', isoDaysAgo(29)); url.searchParams.set('tweet.fields','created_at,public_metrics');
      const feed = await providerJson(await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })); const rows = Array.isArray(feed.data) ? feed.data as Array<Record<string, unknown>> : [];
      for (const t of rows) { const p=t.public_metrics&&typeof t.public_metrics==='object'?t.public_metrics as Record<string,unknown>:{}; const impressions=n(p.impression_count),likes=n(p.like_count),comments=n(p.reply_count),shares=n(p.retweet_count)+n(p.quote_count),saves=n(p.bookmark_count),eng=likes+comments+shares+saves; metrics.impressions+=impressions;metrics.engagements+=eng;if(t.id){await upsertPostMetric(env,c,String(t.id),{impressions,likes,comments,shares,saves,engagements:eng},t);written++;} }
      read += rows.length;
    } catch (error) { warnings.push(`X post metrics: ${(error as Error).message}`); }
  }
  const local = await localAttribution(env, c.brandId, c.platform); metrics.messagesStarted = local.messagesStarted; metrics.orders = local.orders; metrics.conversions = local.conversions; metrics.revenueKobo = local.revenueKobo;
  await upsertDaily(env, c, metrics, { profile: user, warnings, provider: 'x_api_v2' });
  return { metrics, warnings, read, written: written + 1, state: { profile: 'ready', analytics: 'ready', community: 'unsupported', ads: 'unsupported', missing: [] as string[] } };
}

async function syncWhatsApp(env: SocialProviderEnv, c: Connection) {
  const metrics = emptyMetrics(), local = await localAttribution(env, c.brandId, c.platform); metrics.messagesStarted=local.messagesStarted;metrics.orders=local.orders;metrics.conversions=local.conversions;metrics.revenueKobo=local.revenueKobo; await upsertDaily(env,c,metrics,{provider:'whatsapp_cloud',source:'local_webhook_and_order_attribution'});
  return { metrics, warnings: [] as string[], read: local.messagesStarted, written: 1, state: { profile: 'ready', analytics: 'ready', community: 'webhook', ads: 'unsupported', missing: [] as string[] } };
}

async function syncConnection(env: SocialProviderEnv, c: Connection, triggerSource: 'scheduled'|'manual'|'system' = 'scheduled', startedBy?: string) {
  const runId = uid('social-sync');
  await env.DB.prepare(`INSERT INTO social_provider_sync_runs(id,brand_id,connection_id,platform,sync_kind,trigger_source,status,started_by) VALUES(?,?,?,?,? ,?,'running',?)`).bind(runId,c.brandId,c.id,c.platform,'full',triggerSource,startedBy||null).run();
  try {
    if (c.status !== 'connected') throw new Error('Social connection is not connected.');
    let result;
    if (c.platform === 'whatsapp') result = await syncWhatsApp(env,c);
    else {
      if (!c.accessTokenCiphertext) throw new Error(`${c.platform} authorization token is not stored. Reconnect the account.`);
      const token = await decryptSocialSecret(env,c.accessTokenCiphertext);
      if(c.platform==='facebook')result=await syncFacebook(env,c,token); else if(c.platform==='instagram')result=await syncInstagram(env,c,token); else if(c.platform==='tiktok')result=await syncTikTok(env,c,token); else result=await syncX(env,c,token);
    }
    await saveState(env,c,{...result.state,success:true,error:result.warnings[0]||undefined});
    await env.DB.prepare(`UPDATE social_provider_sync_runs SET status=?,records_read=?,records_written=?,warnings_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result.warnings.length?'partial':'completed',result.read,result.written,JSON.stringify(result.warnings),runId).run();
    return { runId, platform:c.platform, ...result };
  } catch (error) {
    const text=(error as Error).message.slice(0,1500); await saveState(env,c,{profile:'error',analytics:'error',success:false,error:text}); await env.DB.prepare(`UPDATE social_provider_sync_runs SET status='failed',error_text=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(text,runId).run(); return { runId, platform:c.platform, error:text, warnings:[], read:0, written:0 };
  }
}

async function firstPartySnapshot(env: SocialProviderEnv, brandId: string) {
  const since=`${dateDaysAgo(29)}T00:00:00`;
  const rows=await env.DB.prepare(`SELECT event_type AS eventType,COUNT(*) AS count,COALESCE(SUM(value_kobo),0) AS valueKobo FROM social_first_party_events WHERE brand_id=? AND occurred_at>=? GROUP BY event_type`).bind(brandId,since).all<{eventType:string;count:number;valueKobo:number}>();
  const map=Object.fromEntries((rows.results||[]).map(r=>[r.eventType,{count:n(r.count),valueKobo:n(r.valueKobo)}]));
  return { pageViews:map.page_view?.count||0,ctaClicks:map.cta_click?.count||0,whatsappClicks:map.whatsapp_click?.count||0,productViews:map.product_view?.count||0,leads:map.lead?.count||0,purchases:map.purchase?.count||0,purchaseValueKobo:map.purchase?.valueKobo||0 };
}

async function status(request: Request, env: SocialProviderEnv, context: SessionContext) {
  if(!socialPermission(context,'social.analytics'))return json({error:'Social Analytics access is required.'},403);
  const brand=await requireSocialBrand(env,context,new URL(request.url).searchParams.get('brandId')||'');if(!brand)return json({error:'Brand access is not assigned.'},403);
  const [connections,runs,posts,inbox,ads,funnel]=await Promise.all([
    env.DB.prepare(`SELECT c.id,c.platform,c.display_name AS displayName,c.handle,c.status,c.platform_ad_account_id AS platformAdAccountId,c.last_sync_at AS lastSyncAt,s.profile_capability AS profileCapability,s.analytics_capability AS analyticsCapability,s.community_capability AS communityCapability,s.ads_capability AS adsCapability,s.missing_scopes_json AS missingScopesJson,s.next_sync_at AS nextSyncAt,s.consecutive_failures AS consecutiveFailures,s.last_error AS lastError FROM social_platform_connections c LEFT JOIN social_provider_connection_state s ON s.connection_id=c.id WHERE c.brand_id=? ORDER BY c.platform`).bind(brand.id).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,platform,sync_kind AS syncKind,trigger_source AS triggerSource,status,records_read AS recordsRead,records_written AS recordsWritten,warnings_json AS warningsJson,error_text AS errorText,started_at AS startedAt,completed_at AS completedAt FROM social_provider_sync_runs WHERE brand_id=? ORDER BY started_at DESC LIMIT 20`).bind(brand.id).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT p.platform,p.external_post_id AS externalPostId,p.impressions,p.reach,p.video_views AS videoViews,p.likes,p.comments,p.shares,p.saves,p.clicks,p.engagements,v.external_permalink AS permalink,v.caption FROM social_post_metrics_daily p LEFT JOIN social_content_variants v ON v.id=p.content_variant_id WHERE p.brand_id=? AND p.metric_date>=? ORDER BY p.engagements DESC,p.impressions DESC LIMIT 10`).bind(brand.id,dateDaysAgo(29)).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) AS open,COALESCE(SUM(CASE WHEN assigned_employee_id IS NULL AND status IN ('open','assigned') THEN 1 ELSE 0 END),0) AS unassigned,MIN(CASE WHEN status IN ('open','assigned','waiting_customer') THEN last_message_at END) AS oldestOpenAt FROM social_conversations WHERE brand_id=? AND status IN ('open','assigned','waiting_customer')`).bind(brand.id).first<Record<string,unknown>>(),
    env.DB.prepare(`SELECT a.id,a.platform,a.name,a.status,a.daily_budget_kobo AS dailyBudgetKobo,a.external_campaign_id AS externalCampaignId,p.provider_effective_status AS providerEffectiveStatus,p.launch_guard_state AS launchGuardState,p.spend_kobo AS spendKobo,p.impressions,p.reach,p.clicks,p.conversions,p.last_provider_sync_at AS lastProviderSyncAt,p.last_error AS lastError FROM social_ad_campaigns a LEFT JOIN social_ad_provider_state p ON p.social_ad_campaign_id=a.id WHERE a.brand_id=? ORDER BY a.updated_at DESC LIMIT 20`).bind(brand.id).all<Record<string,unknown>>(),
    firstPartySnapshot(env,brand.id)
  ]);
  return json({brand:{id:brand.id,name:brand.name,code:brand.code},connections:(connections.results||[]).map(r=>({...r,missingScopes:parse(r.missingScopesJson,[])})),runs:(runs.results||[]).map(r=>({...r,warnings:parse(r.warningsJson,[])})),topPosts:posts.results||[],inbox:{open:n(inbox?.open),unassigned:n(inbox?.unassigned),oldestOpenAt:inbox?.oldestOpenAt||null},ads:ads.results||[],funnel});
}

async function manualSync(request:Request,env:SocialProviderEnv,context:SessionContext){if(!socialPermission(context,'social.analytics','edit')&&!socialPermission(context,'social.connections','manage'))return json({error:'Manage Social Connections or edit Social Analytics permission is required.'},403);let b:{brandId?:string;platform?:Platform|'all'};try{b=await request.json()}catch{return json({error:'Invalid sync request.'},400)}const brand=await requireSocialBrand(env,context,String(b.brandId||''));if(!brand)return json({error:'Brand access is not assigned.'},403);const all=await getConnections(env,brand.id),targets=b.platform&&b.platform!=='all'?all.filter(c=>c.platform===b.platform):all;if(!targets.length)return json({ok:true,results:[],message:'No connected accounts match this sync request.'});const results=[];for(const c of targets)results.push(await syncConnection(env,c,'manual',context.employee.id));await audit(env,context,brand,'provider_sync_requested','social_brand',brand.id,{platform:b.platform||'all',connections:targets.length});return json({ok:true,results});}

function aiText(result:unknown){if(typeof result==='string')return result;if(result&&typeof result==='object'){const r=result as Record<string,unknown>;if(typeof r.response==='string')return r.response;if(typeof r.result==='string')return r.result;}return ''}
async function marketingBrief(request:Request,env:SocialProviderEnv,context:SessionContext){if(!socialPermission(context,'social.ai','create')||!socialPermission(context,'social.analytics'))return json({error:'Social AI and Analytics permissions are required.'},403);let b:{brandId?:string};try{b=await request.json()}catch{return json({error:'Invalid marketing brief request.'},400)}const brand=await requireSocialBrand(env,context,String(b.brandId||''));if(!brand)return json({error:'Brand access is not assigned.'},403);const fake=new Request(`${new URL(request.url).origin}/api/social/provider/status?brandId=${encodeURIComponent(brand.id)}`,{headers:request.headers});const statusResponse=await status(fake,env,context);const summary=await statusResponse.json() as Record<string,unknown>;const model='@cf/zai-org/glm-4.7-flash';const system=['You are Daenem Social Engine, the internal marketing analyst for a Nigerian business group.','Use only the supplied authorized metrics. Never invent missing platform data.','Write concise, natural Nigerian business English. Identify what needs attention, what is working, and 3-6 practical actions.','Do not recommend increasing ad spend merely because data is missing. Flag missing scopes/connections separately.'].join('\n');let result:unknown;try{result=await env.AI.run(model,{messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(summary)}]});}catch(error){return json({error:`Cloudflare AI analysis failed: ${(error as Error).message}`},502)}const analysis=aiText(result).trim();const briefId=uid('social-brief');await env.DB.prepare(`INSERT INTO social_marketing_briefs(id,brand_id,period_start,period_end,summary_json,ai_analysis,generated_by) VALUES(?,?,?,?,?,?,?)`).bind(briefId,brand.id,dateDaysAgo(29),today(),JSON.stringify(summary).slice(0,50000),analysis,context.employee.id).run();await audit(env,context,brand,'marketing_brief_generated','social_marketing_brief',briefId);return json({ok:true,briefId,analysis,summary});}

const objectiveMap:Record<string,string>={awareness:'OUTCOME_AWARENESS',traffic:'OUTCOME_TRAFFIC',engagement:'OUTCOME_ENGAGEMENT',leads:'OUTCOME_LEADS',lead:'OUTCOME_LEADS',sales:'OUTCOME_SALES',conversion:'OUTCOME_SALES',conversions:'OUTCOME_SALES'};
async function createMetaCampaignShell(request:Request,env:SocialProviderEnv,context:SessionContext){if(!socialPermission(context,'social.ads','approve'))return json({error:'Approve Social Ads permission is required.'},403);let b:{adCampaignId?:string};try{b=await request.json()}catch{return json({error:'Invalid campaign request.'},400)}const row=await env.DB.prepare(`SELECT a.id,a.brand_id AS brandId,a.platform,a.name,a.objective,a.status,a.external_campaign_id AS externalCampaignId,c.id AS connectionId,c.platform_ad_account_id AS adAccountId,c.access_token_ciphertext AS tokenCipher,c.scopes_json AS scopesJson,c.status AS connectionStatus FROM social_ad_campaigns a LEFT JOIN social_platform_connections c ON c.brand_id=a.brand_id AND c.platform=a.platform WHERE a.id=?`).bind(String(b.adCampaignId||'')).first<Record<string,unknown>>();if(!row)return json({error:'Social ad campaign not found.'},404);const brand=await requireSocialBrand(env,context,String(row.brandId));if(!brand)return json({error:'Brand access is not assigned.'},403);if(!['facebook','instagram'].includes(String(row.platform)))return json({error:'This first live Ads adapter currently supports Meta campaign shells only. TikTok/X Ads remain provider-access gated.'},409);if(!['approved','paused'].includes(String(row.status)))return json({error:'Campaign must be internally approved before a provider campaign can be created.'},409);if(row.externalCampaignId)return json({ok:true,existing:true,externalCampaignId:row.externalCampaignId,launchGuardState:'campaign_shell_paused'});if(row.connectionStatus!=='connected'||!row.adAccountId||!row.tokenCipher)return json({error:'A connected Meta account with an advertising account is required.'},409);const granted=new Set(parse<string[]>(row.scopesJson,[]));if(!granted.has('ads_management'))return json({error:'Meta ads_management permission is required. Reauthorize the business connection after the Meta app is approved for Ads Management.',missingScope:'ads_management'},409);const token=await decryptSocialSecret(env,String(row.tokenCipher)),account=String(row.adAccountId).startsWith('act_')?String(row.adAccountId):`act_${String(row.adAccountId)}`,form=new URLSearchParams();form.set('name',String(row.name));form.set('objective',objectiveMap[String(row.objective).toLowerCase()]||'OUTCOME_ENGAGEMENT');form.set('status','PAUSED');form.set('special_ad_categories','[]');const created=await providerJson(await fetch(`https://graph.facebook.com/${graph(env)}/${encodeURIComponent(account)}/campaigns`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/x-www-form-urlencoded'},body:form}));const externalId=String(created.id||'');if(!externalId)return json({error:'Meta did not return a campaign ID.'},502);await env.DB.batch([env.DB.prepare(`UPDATE social_ad_campaigns SET external_campaign_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(externalId,row.id),env.DB.prepare(`INSERT INTO social_ad_provider_state(social_ad_campaign_id,brand_id,platform,external_campaign_id,provider_status,provider_effective_status,launch_guard_state,last_provider_sync_at,updated_at) VALUES(?,?,?,?,? ,?,'campaign_shell_paused',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(social_ad_campaign_id) DO UPDATE SET external_campaign_id=excluded.external_campaign_id,provider_status='PAUSED',provider_effective_status='PAUSED',launch_guard_state='campaign_shell_paused',last_provider_sync_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP`).bind(row.id,row.brandId,row.platform,externalId,'PAUSED','PAUSED')]);await audit(env,context,brand,'meta_campaign_shell_created','social_ad_campaign',String(row.id),{externalCampaignId:externalId,status:'PAUSED'});return json({ok:true,externalCampaignId:externalId,providerStatus:'PAUSED',launchGuardState:'campaign_shell_paused',message:'Meta campaign shell created PAUSED. No ad set, creative, ad or spend was activated.'},201);}

async function hex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function verifyMeta(raw:string,signature:string,secret:string){if(!signature.startsWith('sha256='))return false;const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const expected=`sha256=${await hex(await crypto.subtle.sign('HMAC',key,enc.encode(raw)))}`;if(expected.length!==signature.length)return false;let d=0;for(let i=0;i<expected.length;i++)d|=expected.charCodeAt(i)^signature.charCodeAt(i);return d===0}
async function normalizeMetaMessage(env:SocialProviderEnv,platform:'facebook'|'instagram',accountId:string,event:Record<string,unknown>){const sender=event.sender&&typeof event.sender==='object'?String((event.sender as Record<string,unknown>).id||''):'';const msg=event.message&&typeof event.message==='object'?event.message as Record<string,unknown>:{};if(!sender||!msg.mid)return 0;const c=await env.DB.prepare(`SELECT id,brand_id AS brandId FROM social_platform_connections WHERE platform=? AND platform_account_id=? AND status='connected' LIMIT 1`).bind(platform,accountId).first<{id:string;brandId:string}>();if(!c)return 0;const thread=`${accountId}:dm:${sender}`,conversationId=uid('social-conversation');await env.DB.prepare(`INSERT INTO social_conversations(id,brand_id,connection_id,platform,external_thread_id,customer_display_name,customer_handle,status,last_message_at,updated_at) VALUES(?,?,?,?,?,?,?,'open',datetime(?/1000,'unixepoch'),CURRENT_TIMESTAMP) ON CONFLICT(platform,external_thread_id) DO UPDATE SET connection_id=excluded.connection_id,status=CASE WHEN social_conversations.status IN ('resolved','archived') THEN 'open' ELSE social_conversations.status END,last_message_at=excluded.last_message_at,updated_at=CURRENT_TIMESTAMP`).bind(conversationId,c.brandId,c.id,platform,thread,sender,sender,n(event.timestamp)||Date.now()).run();const conv=await env.DB.prepare(`SELECT id FROM social_conversations WHERE platform=? AND external_thread_id=?`).bind(platform,thread).first<{id:string}>();if(!conv)return 0;await env.DB.prepare(`INSERT OR IGNORE INTO social_messages(id,conversation_id,external_message_id,direction,sender_type,message_type,text_body,media_json,status,occurred_at,metadata_json) VALUES(?,?,?,'inbound','customer',?,?,?,'received',datetime(?/1000,'unixepoch'),?)`).bind(uid('social-message'),conv.id,String(msg.mid),msg.attachments?'media':'text',String(msg.text||'')||null,msg.attachments?JSON.stringify(msg.attachments):null,n(event.timestamp)||Date.now(),JSON.stringify({provider:'meta',accountId})).run();await env.DB.prepare(`INSERT INTO social_provider_connection_state(connection_id,brand_id,platform,community_capability,last_community_event_at,updated_at) VALUES(?,?,?,'webhook',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(connection_id) DO UPDATE SET community_capability='webhook',last_community_event_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP`).bind(c.id,c.brandId,platform).run();return 1}
async function normalizeMetaComment(env:SocialProviderEnv,platform:'facebook'|'instagram',accountId:string,value:Record<string,unknown>){const commentId=String(value.comment_id||value.id||''),postId=String(value.post_id||value.media_id||value.parent_id||''),from=value.from&&typeof value.from==='object'?value.from as Record<string,unknown>:{},sender=String(from.id||value.sender_id||'unknown');if(!commentId||!postId)return 0;const c=await env.DB.prepare(`SELECT id,brand_id AS brandId FROM social_platform_connections WHERE platform=? AND platform_account_id=? AND status='connected' LIMIT 1`).bind(platform,accountId).first<{id:string;brandId:string}>();if(!c)return 0;const thread=`${accountId}:comment:${postId}:${sender}`,conversationId=uid('social-conversation');await env.DB.prepare(`INSERT INTO social_conversations(id,brand_id,connection_id,platform,external_thread_id,customer_display_name,customer_handle,status,last_message_at,updated_at) VALUES(?,?,?,?,?,?,?,'open',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(platform,external_thread_id) DO UPDATE SET status=CASE WHEN social_conversations.status IN ('resolved','archived') THEN 'open' ELSE social_conversations.status END,last_message_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(conversationId,c.brandId,c.id,platform,thread,String(from.name||sender),sender).run();const conv=await env.DB.prepare(`SELECT id FROM social_conversations WHERE platform=? AND external_thread_id=?`).bind(platform,thread).first<{id:string}>();if(!conv)return 0;await env.DB.prepare(`INSERT OR IGNORE INTO social_messages(id,conversation_id,external_message_id,direction,sender_type,message_type,text_body,status,metadata_json) VALUES(?,?,?,'inbound','customer','comment',?,'received',?)`).bind(uid('social-message'),conv.id,commentId,String(value.message||value.text||'')||null,JSON.stringify({provider:'meta',postId,verb:value.verb||null})).run();return 1}

export async function routeSocialMetaCommunityWebhook(request:Request,env:SocialProviderEnv):Promise<Response|null>{const url=new URL(request.url);if(url.pathname!=='/api/social/webhooks/meta'||request.method!=='POST')return null;const raw=await request.text(),sig=request.headers.get('x-hub-signature-256')||'',secret=env.META_APP_SECRET||'',verified=Boolean(secret&&await verifyMeta(raw,sig,secret));if(env.APP_STAGE==='production'&&!verified)return json({error:'Webhook signature verification failed.'},401);let payload:Record<string,unknown>;try{payload=JSON.parse(raw)}catch{return json({error:'Invalid webhook JSON.'},400)}const object=String(payload.object||''),platform: 'facebook'|'instagram'=object==='instagram'?'instagram':'facebook',entries=Array.isArray(payload.entry)?payload.entry as Array<Record<string,unknown>>:[];let normalized=0;for(const entry of entries){const accountId=String(entry.id||'');const messaging=Array.isArray(entry.messaging)?entry.messaging as Array<Record<string,unknown>>:[];for(const event of messaging)normalized+=await normalizeMetaMessage(env,platform,accountId,event);const changes=Array.isArray(entry.changes)?entry.changes as Array<Record<string,unknown>>:[];for(const change of changes){const value=change.value&&typeof change.value==='object'?change.value as Record<string,unknown>:{};if(['feed','comments'].includes(String(change.field||''))||value.item==='comment')normalized+=await normalizeMetaComment(env,platform,accountId,value)}}const eventId=await crypto.subtle.digest('SHA-256',enc.encode(`${platform}:${sig}:${raw.slice(0,1024)}`));await env.DB.prepare(`INSERT OR IGNORE INTO social_webhook_events(id,platform,external_event_id,event_type,signature_verified,payload_json,status,processed_at) VALUES(?,?,?,?,?,?,'processed',CURRENT_TIMESTAMP)`).bind(uid('social-webhook'),platform,await hex(eventId),`${platform}_community_event`,verified?1:0,raw.slice(0,100000)).run();return json({received:true,normalized});}

export async function routeSocialProvider(request:Request,env:SocialProviderEnv,context:SessionContext):Promise<Response|null>{const p=new URL(request.url).pathname;if(p==='/api/social/provider/status'&&request.method==='GET')return status(request,env,context);if(p==='/api/social/provider/sync'&&request.method==='POST')return manualSync(request,env,context);if(p==='/api/social/provider/marketing-brief'&&request.method==='POST')return marketingBrief(request,env,context);if(p==='/api/social/provider/meta-campaign-shell'&&request.method==='POST')return createMetaCampaignShell(request,env,context);if(p.startsWith('/api/social/provider/'))return json({error:'Social provider route not found.'},404);return null;}

export async function scheduledSocialProviderSync(env:SocialProviderEnv){const rows=await env.DB.prepare(`SELECT c.id,c.brand_id AS brandId,c.platform,c.platform_account_id AS platformAccountId,c.platform_ad_account_id AS platformAdAccountId,c.access_token_ciphertext AS accessTokenCiphertext,c.scopes_json AS scopesJson,c.status,c.metadata_json AS metadataJson FROM social_platform_connections c LEFT JOIN social_provider_connection_state s ON s.connection_id=c.id WHERE c.status='connected' AND (s.next_sync_at IS NULL OR datetime(s.next_sync_at)<=datetime('now')) ORDER BY COALESCE(s.next_sync_at,'1970-01-01'),c.updated_at LIMIT 12`).all<Connection>();const results=[];for(const c of rows.results||[])results.push(await syncConnection(env,c,'scheduled'));return{scanned:(rows.results||[]).length,results:results.map(r=>({platform:r.platform,runId:r.runId,error:'error'in r?r.error:undefined,recordsWritten:r.written}))};}
