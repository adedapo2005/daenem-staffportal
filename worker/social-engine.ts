import { type AuthEnv, type SessionContext } from './auth';
import { encryptSocialSecret, type SocialCryptoEnv } from './social-crypto';
import { listAccessibleSocialBrands, requireSocialBrand, socialPermission, type SocialBrand } from './social-access';

export interface SocialQueueMessage {
  jobId: string;
  jobType: 'publish_content' | 'sync_analytics' | 'sync_messages' | 'send_message' | 'ad_action' | 'catalog_sync';
}

export interface SocialEnv extends AuthEnv, SocialCryptoEnv {
  AI: Ai;
  FILES: R2Bucket;
  SOCIAL_CACHE?: KVNamespace;
  SOCIAL_QUEUE?: Queue;
  SOCIAL_AI_MODEL?: string;
  META_GRAPH_VERSION?: string;
  APP_STAGE: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const kobo = (naira: unknown) => Math.max(0, Math.round(Number(naira || 0) * 100));
const platformValues = ['facebook', 'instagram', 'tiktok', 'x', 'whatsapp'] as const;
type SocialPlatform = typeof platformValues[number];

const platformCapabilities: Record<SocialPlatform, Record<string, unknown>> = {
  facebook: {
    accountCreation: 'guided_external', connection: 'oauth', publishing: true, comments: true, directMessages: true, ads: true,
    note: 'Daenem connects and manages an existing Facebook Page through Meta authorization. Page creation/identity verification remains an owner action in Meta when required.',
  },
  instagram: {
    accountCreation: 'guided_external', connection: 'oauth', publishing: true, comments: true, directMessages: true, ads: true,
    note: 'Instagram publishing requires an authorized Professional account. Daenem can manage it after OAuth authorization.',
  },
  tiktok: {
    accountCreation: 'guided_external', connection: 'oauth', publishing: true, comments: 'scope_dependent', directMessages: 'access_dependent', ads: true,
    note: 'TikTok Direct Post requires an authorized account and approved publishing scope; unaudited clients may be restricted by TikTok.',
  },
  x: {
    accountCreation: 'guided_external', connection: 'oauth', publishing: true, comments: true, directMessages: 'access_dependent', ads: true,
    note: 'Daenem connects an existing X account with OAuth. Posting and Ads capabilities depend on the X API access available to the app/account.',
  },
  whatsapp: {
    accountCreation: 'embedded_signup', connection: 'embedded_signup', publishing: false, comments: false, directMessages: true, ads: false, commerce: true,
    note: 'WhatsApp Business Platform supports embedded onboarding, phone registration, messaging, templates and catalog-driven commerce. It is treated as a messaging/order channel, not a public feed.',
  },
};

function validPlatform(value: string): value is SocialPlatform {
  return platformValues.includes(value as SocialPlatform);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function aiText(result: unknown) {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const candidate = result as Record<string, unknown>;
    if (typeof candidate.response === 'string') return candidate.response;
    if (typeof candidate.result === 'string') return candidate.result;
  }
  return '';
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

async function audit(env: SocialEnv, context: SessionContext, brand: SocialBrand | null, action: string, entityType: string, entityId?: string, after?: unknown) {
  await env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(uid('audit'), context.employee.id, brand?.companyId || null, 'social', action, entityType, entityId || null, after ? JSON.stringify(after) : null, 'web').run();
}

async function brands(env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.access')) return json({ error: 'Social Engine access is not assigned.' }, 403);
  const list = await listAccessibleSocialBrands(env, context);
  return json({ brands: list.map((brand) => ({ ...brand, toneProfile: parseJson(brand.toneProfileJson, {}) })), platformCapabilities });
}

async function overview(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.access')) return json({ error: 'Social Engine access is not assigned.' }, 403);
  const url = new URL(request.url);
  const brand = await requireSocialBrand(env, context, url.searchParams.get('brandId') || '');
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const since = url.searchParams.get('since') || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [connections, content, analytics, orders, conversations, ads, ai] = await Promise.all([
    env.DB.prepare(`SELECT id,platform,account_type AS accountType,platform_account_id AS platformAccountId,handle,display_name AS displayName,status,onboarding_mode AS onboardingMode,token_expires_at AS tokenExpiresAt,last_sync_at AS lastSyncAt,last_error AS lastError,metadata_json AS metadataJson FROM social_platform_connections WHERE brand_id=? ORDER BY platform`).bind(brand.id).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT status,COUNT(*) AS count FROM social_content_items WHERE brand_id=? GROUP BY status`).bind(brand.id).all<{ status: string; count: number }>(),
    env.DB.prepare(`SELECT platform,SUM(impressions) AS impressions,SUM(reach) AS reach,SUM(engagements) AS engagements,SUM(clicks) AS clicks,SUM(messages_started) AS messagesStarted,SUM(orders) AS orders,SUM(conversions) AS conversions,SUM(revenue_kobo) AS revenueKobo,SUM(spend_kobo) AS spendKobo,MAX(followers) AS followers FROM social_analytics_daily WHERE brand_id=? AND metric_date>=? GROUP BY platform ORDER BY platform`).bind(brand.id, since).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status NOT IN ('completed','cancelled','refunded') THEN 1 ELSE 0 END),0) AS open,COALESCE(SUM(CASE WHEN status='completed' THEN total_kobo ELSE 0 END),0) AS completedRevenueKobo FROM social_orders WHERE brand_id=? AND created_at>=?`).bind(brand.id, `${since}T00:00:00`).first<Record<string, number>>(),
    env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status IN ('open','assigned','waiting_customer') THEN 1 ELSE 0 END),0) AS open FROM social_conversations WHERE brand_id=?`).bind(brand.id).first<Record<string, number>>(),
    env.DB.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN status='active' THEN 1 ELSE 0 END),0) AS active,COALESCE(SUM(daily_budget_kobo),0) AS dailyBudgetKobo FROM social_ad_campaigns WHERE brand_id=?`).bind(brand.id).first<Record<string, number>>(),
    env.DB.prepare(`SELECT COUNT(*) AS newSuggestions FROM social_ai_suggestions WHERE brand_id=? AND status='new'`).bind(brand.id).first<{ newSuggestions: number }>(),
  ]);
  return json({
    brand: { ...brand, toneProfile: parseJson(brand.toneProfileJson, {}) },
    since,
    connections: (connections.results || []).map((row) => ({ ...row, metadata: parseJson(row.metadataJson, {}) })),
    content: Object.fromEntries((content.results || []).map((row) => [row.status, Number(row.count)])),
    analytics: analytics.results || [],
    orders: { total: Number(orders?.total || 0), open: Number(orders?.open || 0), completedRevenueKobo: Number(orders?.completedRevenueKobo || 0) },
    conversations: { total: Number(conversations?.total || 0), open: Number(conversations?.open || 0) },
    ads: { total: Number(ads?.total || 0), active: Number(ads?.active || 0), dailyBudgetKobo: Number(ads?.dailyBudgetKobo || 0) },
    ai: { newSuggestions: Number(ai?.newSuggestions || 0) },
  });
}

async function listConnections(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.connections')) return json({ error: 'Social connection access is not assigned.' }, 403);
  const brand = await requireSocialBrand(env, context, new URL(request.url).searchParams.get('brandId') || '');
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const rows = await env.DB.prepare(`SELECT id,platform,account_type AS accountType,platform_account_id AS platformAccountId,platform_business_id AS platformBusinessId,platform_ad_account_id AS platformAdAccountId,platform_catalog_id AS platformCatalogId,handle,display_name AS displayName,status,onboarding_mode AS onboardingMode,scopes_json AS scopesJson,token_expires_at AS tokenExpiresAt,webhook_verified_at AS webhookVerifiedAt,last_sync_at AS lastSyncAt,last_error AS lastError,metadata_json AS metadataJson,created_at AS createdAt,updated_at AS updatedAt FROM social_platform_connections WHERE brand_id=? ORDER BY platform`).bind(brand.id).all<Record<string, unknown>>();
  return json({ connections: (rows.results || []).map((row) => ({ ...row, scopes: parseJson(row.scopesJson, []), metadata: parseJson(row.metadataJson, {}) })), capabilities: platformCapabilities });
}

async function onboarding(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.connections', 'create')) return json({ error: 'Social account onboarding permission is required.' }, 403);
  let body: { brandId?: string; platform?: string; businessEmail?: string; businessPhone?: string; businessName?: string; websiteUrl?: string; verificationDetails?: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ error: 'Invalid onboarding request.' }, 400); }
  const brand = await requireSocialBrand(env, context, String(body.brandId || ''));
  const platform = String(body.platform || '').toLowerCase();
  if (!brand || !validPlatform(platform)) return json({ error: 'A valid accessible brand and platform are required.' }, 400);
  const businessName = String(body.businessName || brand.name).trim();
  const capability = platformCapabilities[platform];
  let status = 'owner_action_required';
  let nextStepCode = 'authorize_existing_account';
  let nextStepText = `Create or confirm the ${platform} business identity in the provider, then return to authorize Daenem Social Engine.`;
  if (platform === 'whatsapp') {
    nextStepCode = 'embedded_signup';
    nextStepText = 'Launch Meta Embedded Signup to create/select the WhatsApp Business Account, verify the business phone number, and authorize Daenem Social Engine.';
  } else if (platform === 'instagram') {
    nextStepCode = 'professional_account';
    nextStepText = 'Create or convert the Instagram identity to a Professional account if needed, then authorize Daenem Social Engine through the official Instagram/Meta login flow.';
  } else if (platform === 'facebook') {
    nextStepCode = 'facebook_page';
    nextStepText = 'Create or confirm the Facebook Page in Meta Business if needed, then authorize Daenem Social Engine to manage the Page.';
  } else if (platform === 'tiktok') {
    nextStepCode = 'tiktok_business_authorization';
    nextStepText = 'Create or confirm the TikTok business identity, then authorize Daenem Social Engine. Direct public posting activates after TikTok app/scope approval.';
  } else if (platform === 'x') {
    nextStepCode = 'x_oauth';
    nextStepText = 'Create or confirm the X business account, then authorize Daenem Social Engine with the X OAuth flow and required API access.';
  }
  const id = uid('social-onboarding');
  await env.DB.prepare(`INSERT INTO social_onboarding_requests(id,brand_id,platform,business_email,business_phone,business_name,website_url,verification_details_json,status,next_step_code,next_step_text,requested_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, brand.id, platform, body.businessEmail || null, body.businessPhone || null, businessName, body.websiteUrl || null, body.verificationDetails ? JSON.stringify(body.verificationDetails) : null, status, nextStepCode, nextStepText, context.employee.id).run();
  await env.DB.prepare(`INSERT INTO social_platform_connections(id,brand_id,platform,status,onboarding_mode,connected_by) VALUES(?,?,?,?,?,?) ON CONFLICT(brand_id,platform) DO UPDATE SET status='onboarding',onboarding_mode=excluded.onboarding_mode,updated_at=CURRENT_TIMESTAMP`)
    .bind(uid('social-connection'), brand.id, platform, 'onboarding', String(capability.connection) === 'embedded_signup' ? 'embedded_signup' : String(capability.accountCreation) === 'guided_external' ? 'guided_external' : 'oauth', context.employee.id).run();
  await audit(env, context, brand, 'onboarding_started', 'social_onboarding_request', id, { platform, nextStepCode });
  return json({ id, status, platform, capability, nextStepCode, nextStepText, passwordRequested: false }, 201);
}

async function onboardingList(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.connections')) return json({ error: 'Social connection access is not assigned.' }, 403);
  const brand = await requireSocialBrand(env, context, new URL(request.url).searchParams.get('brandId') || '');
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const rows = await env.DB.prepare(`SELECT id,platform,business_email AS businessEmail,business_phone AS businessPhone,business_name AS businessName,website_url AS websiteUrl,status,next_step_code AS nextStepCode,next_step_text AS nextStepText,provider_reference AS providerReference,created_at AS createdAt,updated_at AS updatedAt FROM social_onboarding_requests WHERE brand_id=? ORDER BY created_at DESC`).bind(brand.id).all<Record<string, unknown>>();
  return json({ onboarding: rows.results || [] });
}

async function completeConnection(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.connections', 'manage')) return json({ error: 'Manage Social Connections permission is required.' }, 403);
  let body: { brandId?: string; platform?: string; platformAccountId?: string; platformBusinessId?: string; platformAdAccountId?: string; platformCatalogId?: string; handle?: string; displayName?: string; scopes?: string[]; accessToken?: string; refreshToken?: string; tokenExpiresAt?: string; metadata?: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ error: 'Invalid connection result.' }, 400); }
  const brand = await requireSocialBrand(env, context, String(body.brandId || ''));
  const platform = String(body.platform || '').toLowerCase();
  if (!brand || !validPlatform(platform) || !String(body.platformAccountId || '').trim()) return json({ error: 'Brand, platform and provider account ID are required.' }, 400);
  let accessCipher: string | null = null;
  let refreshCipher: string | null = null;
  try {
    if (body.accessToken) accessCipher = await encryptSocialSecret(env, body.accessToken);
    if (body.refreshToken) refreshCipher = await encryptSocialSecret(env, body.refreshToken);
  } catch (error) {
    return json({ error: (error as Error).message }, 503);
  }
  const existing = await env.DB.prepare(`SELECT id FROM social_platform_connections WHERE brand_id=? AND platform=?`).bind(brand.id, platform).first<{ id: string }>();
  const id = existing?.id || uid('social-connection');
  await env.DB.prepare(`INSERT INTO social_platform_connections(id,brand_id,platform,platform_account_id,platform_business_id,platform_ad_account_id,platform_catalog_id,handle,display_name,status,onboarding_mode,scopes_json,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,metadata_json,connected_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'connected',?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(brand_id,platform) DO UPDATE SET platform_account_id=excluded.platform_account_id,platform_business_id=excluded.platform_business_id,platform_ad_account_id=excluded.platform_ad_account_id,platform_catalog_id=excluded.platform_catalog_id,handle=excluded.handle,display_name=excluded.display_name,status='connected',scopes_json=excluded.scopes_json,access_token_ciphertext=COALESCE(excluded.access_token_ciphertext,social_platform_connections.access_token_ciphertext),refresh_token_ciphertext=COALESCE(excluded.refresh_token_ciphertext,social_platform_connections.refresh_token_ciphertext),token_expires_at=excluded.token_expires_at,metadata_json=excluded.metadata_json,connected_by=excluded.connected_by,last_error=NULL,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, brand.id, platform, body.platformAccountId, body.platformBusinessId || null, body.platformAdAccountId || null, body.platformCatalogId || null, body.handle || null, body.displayName || null, platform === 'whatsapp' ? 'embedded_signup' : 'oauth', JSON.stringify(body.scopes || []), accessCipher, refreshCipher, body.tokenExpiresAt || null, body.metadata ? JSON.stringify(body.metadata) : null, context.employee.id).run();
  await env.DB.prepare(`UPDATE social_onboarding_requests SET status='connected',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE brand_id=? AND platform=? AND status!='connected'`).bind(brand.id, platform).run();
  await audit(env, context, brand, 'connection_completed', 'social_platform_connection', id, { platform, platformAccountId: body.platformAccountId, scopes: body.scopes || [] });
  return json({ ok: true, id, status: 'connected', tokenStoredEncrypted: Boolean(accessCipher || refreshCipher) });
}

interface ContentInput {
  brandId?: string;
  campaignId?: string;
  title?: string;
  contentType?: string;
  masterCaption?: string;
  creativeBrief?: string;
  targetUrl?: string;
  productId?: string;
  platforms?: string[];
  scheduledFor?: string;
  variants?: Record<string, { caption?: string; hashtags?: string[]; media?: unknown[]; options?: Record<string, unknown> }>;
}

async function createContentRecord(env: SocialEnv, context: SessionContext, brand: SocialBrand, body: ContentInput, sourceMode: 'manual' | 'ai' | 'ai_assisted', aiModel?: string, aiGenerated = false) {
  const platforms = [...new Set((body.platforms || []).map((p) => p.toLowerCase()).filter(validPlatform))];
  if (!platforms.length) throw new Error('Select at least one supported platform.');
  const id = uid('social-content');
  const status = aiGenerated ? 'ai_draft' : 'draft';
  await env.DB.prepare(`INSERT INTO social_content_items(id,brand_id,campaign_id,title,content_type,source_mode,master_caption,creative_brief,target_url,product_id,tone,ai_model,ai_generated,status,scheduled_for,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, brand.id, body.campaignId || null, body.title || null, body.contentType || 'post', sourceMode, body.masterCaption || '', body.creativeBrief || null, body.targetUrl || null, body.productId || null, 'natural_nigerian', aiModel || null, aiGenerated ? 1 : 0, status, body.scheduledFor || null, context.employee.id).run();
  const statements = platforms.map((platform) => {
    const variant = body.variants?.[platform] || {};
    return env.DB.prepare(`INSERT INTO social_content_variants(id,content_item_id,platform,caption,hashtags_json,media_json,platform_options_json,status,scheduled_for) VALUES(?,?,?,?,?,?,?,'draft',?)`)
      .bind(uid('social-variant'), id, platform, variant.caption || body.masterCaption || '', JSON.stringify(variant.hashtags || []), JSON.stringify(variant.media || []), JSON.stringify(variant.options || {}), body.scheduledFor || null);
  });
  if (statements.length) await env.DB.batch(statements);
  await audit(env, context, brand, aiGenerated ? 'ai_content_created' : 'content_created', 'social_content_item', id, { platforms, status });
  return id;
}

async function content(request: Request, env: SocialEnv, context: SessionContext) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (!socialPermission(context, 'social.content')) return json({ error: 'Social content access is not assigned.' }, 403);
    const brand = await requireSocialBrand(env, context, url.searchParams.get('brandId') || '');
    if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
    const status = url.searchParams.get('status');
    const rows = await env.DB.prepare(`SELECT c.id,c.title,c.content_type AS contentType,c.source_mode AS sourceMode,c.master_caption AS masterCaption,c.target_url AS targetUrl,c.tone,c.ai_generated AS aiGenerated,c.ai_model AS aiModel,c.status,c.scheduled_for AS scheduledFor,c.approved_at AS approvedAt,c.created_at AS createdAt,c.updated_at AS updatedAt,(SELECT COUNT(*) FROM social_content_variants v WHERE v.content_item_id=c.id) AS platformCount,(SELECT COUNT(*) FROM social_content_variants v WHERE v.content_item_id=c.id AND v.status='published') AS publishedCount FROM social_content_items c WHERE c.brand_id=? AND (? IS NULL OR c.status=?) ORDER BY COALESCE(c.scheduled_for,c.created_at) DESC LIMIT 200`).bind(brand.id, status, status).all<Record<string, unknown>>();
    return json({ content: rows.results || [] });
  }
  if (!socialPermission(context, 'social.content', 'create')) return json({ error: 'Create Social Content permission is required.' }, 403);
  let body: ContentInput;
  try { body = await request.json(); } catch { return json({ error: 'Invalid content request.' }, 400); }
  const brand = await requireSocialBrand(env, context, String(body.brandId || ''));
  if (!brand || !String(body.masterCaption || '').trim()) return json({ error: 'Accessible brand and caption are required.' }, 400);
  try {
    const id = await createContentRecord(env, context, brand, body, 'manual');
    return json({ ok: true, id, status: 'draft' }, 201);
  } catch (error) { return json({ error: (error as Error).message }, 400); }
}

async function contentDetail(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.content')) return json({ error: 'Social content access is not assigned.' }, 403);
  const id = new URL(request.url).searchParams.get('id') || '';
  const item = await env.DB.prepare(`SELECT c.id,c.brand_id AS brandId,c.campaign_id AS campaignId,c.title,c.content_type AS contentType,c.source_mode AS sourceMode,c.master_caption AS masterCaption,c.creative_brief AS creativeBrief,c.target_url AS targetUrl,c.product_id AS productId,c.tone,c.ai_generated AS aiGenerated,c.ai_model AS aiModel,c.disclosure_required AS disclosureRequired,c.status,c.scheduled_for AS scheduledFor,c.approved_at AS approvedAt,c.rejected_reason AS rejectedReason,c.created_at AS createdAt,c.updated_at AS updatedAt FROM social_content_items c WHERE c.id=?`).bind(id).first<Record<string, unknown>>();
  if (!item) return json({ error: 'Content item not found.' }, 404);
  const brand = await requireSocialBrand(env, context, String(item.brandId));
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const variants = await env.DB.prepare(`SELECT id,platform,caption,hashtags_json AS hashtagsJson,media_json AS mediaJson,platform_options_json AS optionsJson,status,scheduled_for AS scheduledFor,external_post_id AS externalPostId,external_permalink AS externalPermalink,published_at AS publishedAt,last_error AS lastError,retry_count AS retryCount FROM social_content_variants WHERE content_item_id=? ORDER BY platform`).bind(id).all<Record<string, unknown>>();
  return json({ content: item, variants: (variants.results || []).map((v) => ({ ...v, hashtags: parseJson(v.hashtagsJson, []), media: parseJson(v.mediaJson, []), options: parseJson(v.optionsJson, {}) })) });
}

async function generateContent(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.ai', 'create') || !socialPermission(context, 'social.content', 'create')) return json({ error: 'AI Social Content permission is required.' }, 403);
  let body: { brandId?: string; objective?: string; details?: string; productOrService?: string; offer?: string; audience?: string; platforms?: string[]; saveDraft?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'Invalid AI content request.' }, 400); }
  const brand = await requireSocialBrand(env, context, String(body.brandId || ''));
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const platforms = [...new Set((body.platforms || ['facebook', 'instagram']).map((p) => p.toLowerCase()).filter(validPlatform))];
  const model = '@cf/zai-org/glm-4.7-flash';
  const tone = parseJson<Record<string, unknown>>(brand.toneProfileJson, {});
  const system = [
    'You are Daenem Social Engine, the internal marketing assistant for a Nigerian business group.',
    'Write natural, polished Nigerian English suitable for the specific brand. Sound like a capable local marketing team, not a generic chatbot.',
    'Do not deliberately add errors or fake slang to disguise AI involvement. Use light Nigerian phrasing only when it naturally fits the audience and brand.',
    'Never invent prices, stock, delivery coverage, certifications, customer testimonials, vehicle condition, property facts, farm output, or promotions not supplied by the user.',
    'Avoid clichés such as “game-changer”, “unlock the power”, “elevate your journey”, and excessive emojis.',
    'Use direct calls to action. Keep WhatsApp-oriented calls concise and practical.',
    'Do not promise virality. You may suggest why a post could perform well, but label predictions as estimates.',
    'Return ONLY valid JSON with keys: title, masterCaption, rationale, variants. variants must be an object keyed by requested platform. Each variant must contain caption and hashtags array.',
  ].join('\n');
  const user = JSON.stringify({ brand: brand.name, market: brand.primaryMarket, tone, defaultCta: brand.defaultCta, objective: body.objective || 'engagement and sales', productOrService: body.productOrService || '', offer: body.offer || '', audience: body.audience || 'customers in Nigeria', details: body.details || '', platforms });
  let result: unknown;
  try { result = await env.AI.run(model, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }); }
  catch (error) { return json({ error: `Cloudflare AI generation failed: ${(error as Error).message}` }, 502); }
  const text = aiText(result);
  const parsed = extractJsonObject(text);
  if (!parsed) return json({ error: 'AI returned an unusable draft. Please try again.', rawPreview: text.slice(0, 500) }, 502);
  const variantsRaw = parsed.variants && typeof parsed.variants === 'object' ? parsed.variants as Record<string, unknown> : {};
  const variants: ContentInput['variants'] = {};
  for (const platform of platforms) {
    const value = variantsRaw[platform];
    if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      variants[platform] = { caption: String(row.caption || parsed.masterCaption || ''), hashtags: Array.isArray(row.hashtags) ? row.hashtags.map(String).slice(0, 20) : [] };
    } else variants[platform] = { caption: String(parsed.masterCaption || ''), hashtags: [] };
  }
  const draft = { title: String(parsed.title || ''), masterCaption: String(parsed.masterCaption || ''), rationale: String(parsed.rationale || ''), variants, platforms, aiModel: model, aiGenerated: true };
  if (!body.saveDraft) return json({ draft });
  try {
    const id = await createContentRecord(env, context, brand, { brandId: brand.id, title: draft.title, masterCaption: draft.masterCaption, platforms, variants }, 'ai', model, true);
    return json({ draft, id, status: 'ai_draft' }, 201);
  } catch (error) { return json({ error: (error as Error).message }, 400); }
}

async function reviewContent(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.approve', 'approve')) return json({ error: 'Approve Social Content permission is required.' }, 403);
  let body: { id?: string; decision?: 'approve' | 'reject'; reason?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid review request.' }, 400); }
  const item = await env.DB.prepare(`SELECT id,brand_id AS brandId,status FROM social_content_items WHERE id=?`).bind(body.id || '').first<{ id: string; brandId: string; status: string }>();
  if (!item) return json({ error: 'Content item not found.' }, 404);
  const brand = await requireSocialBrand(env, context, item.brandId);
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  if (body.decision === 'reject') {
    await env.DB.prepare(`UPDATE social_content_items SET status='rejected',rejected_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.reason || 'Rejected during editorial review', item.id).run();
    await audit(env, context, brand, 'content_rejected', 'social_content_item', item.id, { reason: body.reason || null });
    return json({ ok: true, status: 'rejected' });
  }
  await env.DB.prepare(`UPDATE social_content_items SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,rejected_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(context.employee.id, item.id).run();
  await env.DB.prepare(`UPDATE social_content_variants SET status='ready',updated_at=CURRENT_TIMESTAMP WHERE content_item_id=? AND status='draft'`).bind(item.id).run();
  await audit(env, context, brand, 'content_approved', 'social_content_item', item.id);
  return json({ ok: true, status: 'approved' });
}

async function enqueueJob(env: SocialEnv, jobId: string, jobType: SocialQueueMessage['jobType']) {
  if (!env.SOCIAL_QUEUE) return false;
  await env.SOCIAL_QUEUE.send({ jobId, jobType });
  return true;
}

async function scheduleContent(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.publish', 'create')) return json({ error: 'Schedule/Publish Social Content permission is required.' }, 403);
  let body: { id?: string; scheduledFor?: string; publishNow?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'Invalid schedule request.' }, 400); }
  const item = await env.DB.prepare(`SELECT id,brand_id AS brandId,status FROM social_content_items WHERE id=?`).bind(body.id || '').first<{ id: string; brandId: string; status: string }>();
  if (!item) return json({ error: 'Content item not found.' }, 404);
  const brand = await requireSocialBrand(env, context, item.brandId);
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  if (item.status !== 'approved' && item.status !== 'scheduled' && item.status !== 'partially_published') return json({ error: 'Content must be approved before it can be scheduled or published.' }, 409);
  const scheduledFor = body.publishNow ? new Date().toISOString() : String(body.scheduledFor || '').trim();
  if (!scheduledFor || Number.isNaN(Date.parse(scheduledFor))) return json({ error: 'A valid publish date/time is required.' }, 400);
  const variants = await env.DB.prepare(`SELECT id,platform,status FROM social_content_variants WHERE content_item_id=? AND status IN ('ready','failed','queued')`).bind(item.id).all<{ id: string; platform: string; status: string }>();
  if (!(variants.results || []).length) return json({ error: 'No publishable platform variants remain.' }, 409);
  const statements: D1PreparedStatement[] = [];
  const jobs: Array<{ id: string; type: SocialQueueMessage['jobType'] }> = [];
  for (const variant of variants.results || []) {
    const jobId = uid('social-job');
    jobs.push({ id: jobId, type: 'publish_content' });
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO social_dispatch_jobs(id,brand_id,job_type,entity_id,platform,status,available_at,idempotency_key) VALUES(?,?,?,?,?,'queued',?,?)`).bind(jobId, brand.id, 'publish_content', variant.id, variant.platform, scheduledFor, `publish:${variant.id}:${scheduledFor}`));
    statements.push(env.DB.prepare(`UPDATE social_content_variants SET status='queued',scheduled_for=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(scheduledFor, variant.id));
  }
  statements.push(env.DB.prepare(`UPDATE social_content_items SET status='scheduled',scheduled_for=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(scheduledFor, item.id));
  await env.DB.batch(statements);
  let queuedNow = 0;
  if (Date.parse(scheduledFor) <= Date.now() + 5000) {
    for (const job of jobs) if (await enqueueJob(env, job.id, job.type)) queuedNow += 1;
  }
  await audit(env, context, brand, body.publishNow ? 'publish_requested' : 'content_scheduled', 'social_content_item', item.id, { scheduledFor, platforms: variants.results?.map((v) => v.platform), queuedNow });
  return json({ ok: true, status: 'scheduled', scheduledFor, jobs: jobs.length, queuedNow });
}

async function products(request: Request, env: SocialEnv, context: SessionContext) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (!socialPermission(context, 'social.commerce')) return json({ error: 'Social Commerce access is not assigned.' }, 403);
    const brand = await requireSocialBrand(env, context, url.searchParams.get('brandId') || '');
    if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
    const rows = await env.DB.prepare(`SELECT id,sku,name,description,unit_label AS unitLabel,price_kobo AS priceKobo,compare_at_price_kobo AS compareAtPriceKobo,currency,whatsapp_order_enabled AS whatsappOrderEnabled,image_r2_key AS imageR2Key,status,internal_source_type AS internalSourceType,internal_source_id AS internalSourceId,updated_at AS updatedAt FROM social_products WHERE brand_id=? ORDER BY status='active' DESC,name`).bind(brand.id).all<Record<string, unknown>>();
    return json({ products: rows.results || [] });
  }
  if (!socialPermission(context, 'social.commerce', 'create')) return json({ error: 'Manage Social Commerce permission is required.' }, 403);
  let body: { brandId?: string; sku?: string; name?: string; description?: string; unitLabel?: string; priceNaira?: number; compareAtPriceNaira?: number; whatsappOrderEnabled?: boolean; imageR2Key?: string; internalSourceType?: string; internalSourceId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid product request.' }, 400); }
  const brand = await requireSocialBrand(env, context, String(body.brandId || ''));
  if (!brand || !String(body.name || '').trim()) return json({ error: 'Brand and product name are required.' }, 400);
  const id = uid('social-product');
  await env.DB.prepare(`INSERT INTO social_products(id,brand_id,internal_source_type,internal_source_id,sku,name,description,unit_label,price_kobo,compare_at_price_kobo,whatsapp_order_enabled,image_r2_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, brand.id, body.internalSourceType || null, body.internalSourceId || null, body.sku || null, String(body.name).trim(), body.description || null, body.unitLabel || null, kobo(body.priceNaira), body.compareAtPriceNaira == null ? null : kobo(body.compareAtPriceNaira), body.whatsappOrderEnabled === false ? 0 : 1, body.imageR2Key || null).run();
  await audit(env, context, brand, 'social_product_created', 'social_product', id, { name: body.name, sku: body.sku || null });
  return json({ ok: true, id }, 201);
}

async function orders(request: Request, env: SocialEnv, context: SessionContext) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (!socialPermission(context, 'social.orders')) return json({ error: 'Social Orders access is not assigned.' }, 403);
    const brand = await requireSocialBrand(env, context, url.searchParams.get('brandId') || '');
    if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
    const rows = await env.DB.prepare(`SELECT o.id,o.order_no AS orderNo,o.source_platform AS sourcePlatform,o.status,o.total_kobo AS totalKobo,o.payment_status AS paymentStatus,o.delivery_city AS deliveryCity,o.delivery_state AS deliveryState,o.assigned_employee_id AS assignedEmployeeId,o.created_at AS createdAt,c.name AS customerName,c.phone,c.whatsapp_id AS whatsappId FROM social_orders o LEFT JOIN social_customers c ON c.id=o.customer_id WHERE o.brand_id=? ORDER BY o.created_at DESC LIMIT 300`).bind(brand.id).all<Record<string, unknown>>();
    return json({ orders: rows.results || [] });
  }
  if (!socialPermission(context, 'social.orders', 'create')) return json({ error: 'Create Social Orders permission is required.' }, 403);
  let body: { brandId?: string; sourcePlatform?: string; customer?: { name?: string; phone?: string; whatsappId?: string; city?: string; state?: string; countryCode?: string }; items?: Array<{ productId?: string; productName?: string; quantity?: number; unitPriceNaira?: number; notes?: string }>; deliveryNaira?: number; discountNaira?: number; deliveryAddress?: string; deliveryCity?: string; deliveryState?: string; customerNotes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid order request.' }, 400); }
  const brand = await requireSocialBrand(env, context, String(body.brandId || ''));
  if (!brand || !body.items?.length) return json({ error: 'Accessible brand and at least one order item are required.' }, 400);
  const source = String(body.sourcePlatform || 'manual').toLowerCase();
  const allowedSources = ['facebook','instagram','tiktok','x','whatsapp','website','manual'];
  if (!allowedSources.includes(source)) return json({ error: 'Unsupported order source.' }, 400);
  const customerId = uid('social-customer');
  const orderId = uid('social-order');
  const orderNo = `SO-${brand.code.toUpperCase()}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const lines = body.items.map((line) => ({ ...line, qty: Math.max(0.01, Number(line.quantity || 1)), unitKobo: kobo(line.unitPriceNaira), lineKobo: Math.round(Math.max(0.01, Number(line.quantity || 1)) * kobo(line.unitPriceNaira)) }));
  const subtotal = lines.reduce((sum, line) => sum + line.lineKobo, 0);
  const delivery = kobo(body.deliveryNaira);
  const discount = Math.min(kobo(body.discountNaira), subtotal + delivery);
  const total = subtotal + delivery - discount;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO social_customers(id,brand_id,name,phone,whatsapp_id,city,state,country_code,first_source) VALUES(?,?,?,?,?,?,?,?,?)`).bind(customerId, brand.id, body.customer?.name || null, body.customer?.phone || null, body.customer?.whatsappId || null, body.customer?.city || null, body.customer?.state || null, body.customer?.countryCode || 'NG', source),
    env.DB.prepare(`INSERT INTO social_orders(id,brand_id,customer_id,source_platform,order_no,subtotal_kobo,delivery_kobo,discount_kobo,total_kobo,delivery_address,delivery_city,delivery_state,customer_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(orderId, brand.id, customerId, source, orderNo, subtotal, delivery, discount, total, body.deliveryAddress || null, body.deliveryCity || null, body.deliveryState || null, body.customerNotes || null),
  ];
  for (const line of lines) statements.push(env.DB.prepare(`INSERT INTO social_order_items(id,order_id,product_id,product_name,quantity,unit_price_kobo,line_total_kobo,notes) VALUES(?,?,?,?,?,?,?,?)`).bind(uid('social-order-line'), orderId, line.productId || null, line.productName || 'Item', line.qty, line.unitKobo, line.lineKobo, line.notes || null));
  await env.DB.batch(statements);
  await audit(env, context, brand, 'social_order_created', 'social_order', orderId, { orderNo, source, totalKobo: total });
  return json({ ok: true, id: orderId, orderNo, totalKobo: total, status: 'new' }, 201);
}

async function updateOrder(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.orders', 'edit')) return json({ error: 'Edit Social Orders permission is required.' }, 403);
  let body: { id?: string; status?: string; assignedEmployeeId?: string | null; paymentStatus?: string; internalNotes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid order update.' }, 400); }
  const order = await env.DB.prepare(`SELECT id,brand_id AS brandId FROM social_orders WHERE id=?`).bind(body.id || '').first<{ id: string; brandId: string }>();
  if (!order) return json({ error: 'Order not found.' }, 404);
  const brand = await requireSocialBrand(env, context, order.brandId);
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const statuses = ['new','confirmed','assigned','processing','ready','out_for_delivery','completed','cancelled','refunded'];
  const payments = ['unpaid','part_paid','paid','refunded'];
  if (body.status && !statuses.includes(body.status)) return json({ error: 'Invalid order status.' }, 400);
  if (body.paymentStatus && !payments.includes(body.paymentStatus)) return json({ error: 'Invalid payment status.' }, 400);
  await env.DB.prepare(`UPDATE social_orders SET status=COALESCE(?,status),assigned_employee_id=CASE WHEN ?=1 THEN ? ELSE assigned_employee_id END,payment_status=COALESCE(?,payment_status),internal_notes=COALESCE(?,internal_notes),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.status || null, Object.prototype.hasOwnProperty.call(body, 'assignedEmployeeId') ? 1 : 0, body.assignedEmployeeId || null, body.paymentStatus || null, body.internalNotes || null, order.id).run();
  await audit(env, context, brand, 'social_order_updated', 'social_order', order.id, body);
  return json({ ok: true });
}

async function analytics(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.analytics')) return json({ error: 'Social Analytics access is not assigned.' }, 403);
  const url = new URL(request.url);
  const brand = await requireSocialBrand(env, context, url.searchParams.get('brandId') || '');
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get('days') || 30)));
  const start = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0,10);
  const [daily, firstParty, topContent] = await Promise.all([
    env.DB.prepare(`SELECT metric_date AS metricDate,platform,followers,follower_change AS followerChange,impressions,reach,profile_views AS profileViews,engagements,clicks,messages_started AS messagesStarted,orders,conversions,revenue_kobo AS revenueKobo,spend_kobo AS spendKobo,audience_json AS audienceJson FROM social_analytics_daily WHERE brand_id=? AND metric_date>=? ORDER BY metric_date,platform`).bind(brand.id, start).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT event_type AS eventType,COUNT(*) AS count,COALESCE(SUM(value_kobo),0) AS valueKobo FROM social_first_party_events WHERE brand_id=? AND occurred_at>=? GROUP BY event_type ORDER BY count DESC`).bind(brand.id, `${start}T00:00:00`).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT c.id,c.title,c.master_caption AS masterCaption,v.platform,v.external_permalink AS permalink,v.published_at AS publishedAt FROM social_content_items c JOIN social_content_variants v ON v.content_item_id=c.id WHERE c.brand_id=? AND v.status='published' ORDER BY v.published_at DESC LIMIT 20`).bind(brand.id).all<Record<string, unknown>>(),
  ]);
  return json({ startDate: start, days, daily: (daily.results || []).map((row) => ({ ...row, audience: parseJson(row.audienceJson, {}) })), firstParty: firstParty.results || [], recentPublished: topContent.results || [] });
}

async function ads(request: Request, env: SocialEnv, context: SessionContext) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (!socialPermission(context, 'social.ads')) return json({ error: 'Social Ads access is not assigned.' }, 403);
    const brand = await requireSocialBrand(env, context, url.searchParams.get('brandId') || '');
    if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
    const rows = await env.DB.prepare(`SELECT id,platform,name,objective,target_locations_json AS targetLocationsJson,target_audience_json AS targetAudienceJson,daily_budget_kobo AS dailyBudgetKobo,lifetime_budget_kobo AS lifetimeBudgetKobo,ai_optimization_enabled AS aiOptimizationEnabled,max_daily_change_percent AS maxDailyChangePercent,status,external_campaign_id AS externalCampaignId,created_at AS createdAt,updated_at AS updatedAt FROM social_ad_campaigns WHERE brand_id=? ORDER BY created_at DESC`).bind(brand.id).all<Record<string, unknown>>();
    return json({ ads: (rows.results || []).map((row) => ({ ...row, targetLocations: parseJson(row.targetLocationsJson, []), targetAudience: parseJson(row.targetAudienceJson, {}) })) });
  }
  if (!socialPermission(context, 'social.ads', 'create')) return json({ error: 'Create Social Ads permission is required.' }, 403);
  let body: { brandId?: string; platform?: string; name?: string; objective?: string; targetLocations?: string[]; targetAudience?: Record<string, unknown>; dailyBudgetNaira?: number; lifetimeBudgetNaira?: number; aiOptimizationEnabled?: boolean; maxDailyChangePercent?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid ad campaign request.' }, 400); }
  const brand = await requireSocialBrand(env, context, String(body.brandId || ''));
  const platform = String(body.platform || '').toLowerCase();
  if (!brand || !['facebook','instagram','tiktok','x'].includes(platform) || !String(body.name || '').trim()) return json({ error: 'Brand, supported ad platform and campaign name are required.' }, 400);
  const id = uid('social-ad');
  await env.DB.prepare(`INSERT INTO social_ad_campaigns(id,brand_id,platform,name,objective,target_locations_json,target_audience_json,daily_budget_kobo,lifetime_budget_kobo,ai_optimization_enabled,max_daily_change_percent,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending_approval',?)`).bind(id, brand.id, platform, String(body.name).trim(), body.objective || 'sales', JSON.stringify(body.targetLocations || []), JSON.stringify(body.targetAudience || {}), kobo(body.dailyBudgetNaira), kobo(body.lifetimeBudgetNaira), body.aiOptimizationEnabled ? 1 : 0, Math.min(50, Math.max(0, Number(body.maxDailyChangePercent ?? 20))), context.employee.id).run();
  await audit(env, context, brand, 'social_ad_created', 'social_ad_campaign', id, { platform, name: body.name });
  return json({ ok: true, id, status: 'pending_approval' }, 201);
}

async function approveAd(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.ads', 'approve')) return json({ error: 'Approve Social Ads permission is required.' }, 403);
  let body: { id?: string; decision?: 'approve' | 'pause' | 'reject' };
  try { body = await request.json(); } catch { return json({ error: 'Invalid ad approval request.' }, 400); }
  const ad = await env.DB.prepare(`SELECT id,brand_id AS brandId,platform,status FROM social_ad_campaigns WHERE id=?`).bind(body.id || '').first<{ id: string; brandId: string; platform: string; status: string }>();
  if (!ad) return json({ error: 'Ad campaign not found.' }, 404);
  const brand = await requireSocialBrand(env, context, ad.brandId);
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const status = body.decision === 'pause' ? 'paused' : body.decision === 'reject' ? 'failed' : 'approved';
  await env.DB.prepare(`UPDATE social_ad_campaigns SET status=?,approved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status, context.employee.id, ad.id).run();
  let queued = false;
  if (status === 'approved') {
    const jobId = uid('social-job');
    await env.DB.prepare(`INSERT INTO social_dispatch_jobs(id,brand_id,job_type,entity_id,platform,status,idempotency_key) VALUES(?,?,?,?,?,'queued',?)`).bind(jobId, brand.id, 'ad_action', ad.id, ad.platform, `ad:${ad.id}:activate`).run();
    queued = await enqueueJob(env, jobId, 'ad_action');
  }
  await audit(env, context, brand, `social_ad_${status}`, 'social_ad_campaign', ad.id);
  return json({ ok: true, status, queued });
}

async function conversations(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.community')) return json({ error: 'Social Community access is not assigned.' }, 403);
  const brand = await requireSocialBrand(env, context, new URL(request.url).searchParams.get('brandId') || '');
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const rows = await env.DB.prepare(`SELECT id,platform,customer_display_name AS customerDisplayName,customer_handle AS customerHandle,status,assigned_employee_id AS assignedEmployeeId,ai_reply_mode AS aiReplyMode,last_message_at AS lastMessageAt,(SELECT text_body FROM social_messages m WHERE m.conversation_id=c.id ORDER BY occurred_at DESC LIMIT 1) AS lastMessage FROM social_conversations c WHERE brand_id=? ORDER BY COALESCE(last_message_at,created_at) DESC LIMIT 200`).bind(brand.id).all<Record<string, unknown>>();
  return json({ conversations: rows.results || [] });
}

async function aiReply(request: Request, env: SocialEnv, context: SessionContext) {
  if (!socialPermission(context, 'social.ai', 'create') || !socialPermission(context, 'social.community')) return json({ error: 'AI Community Reply permission is required.' }, 403);
  let body: { conversationId?: string; instruction?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid AI reply request.' }, 400); }
  const conversation = await env.DB.prepare(`SELECT id,brand_id AS brandId,platform,customer_display_name AS customerDisplayName FROM social_conversations WHERE id=?`).bind(body.conversationId || '').first<{ id: string; brandId: string; platform: string; customerDisplayName?: string }>();
  if (!conversation) return json({ error: 'Conversation not found.' }, 404);
  const brand = await requireSocialBrand(env, context, conversation.brandId);
  if (!brand) return json({ error: 'Brand access is not assigned.' }, 403);
  const messages = await env.DB.prepare(`SELECT direction,sender_type AS senderType,text_body AS textBody,occurred_at AS occurredAt FROM social_messages WHERE conversation_id=? ORDER BY occurred_at DESC LIMIT 12`).bind(conversation.id).all<Record<string, unknown>>();
  const history = [...(messages.results || [])].reverse();
  const model = '@cf/zai-org/glm-4.7-flash';
  const system = [
    `You are replying for ${brand.name} on ${conversation.platform}.`,
    'Write concise, natural Nigerian business English. Be helpful, warm and professional.',
    'Never invent price, stock, delivery dates, discounts, vehicle/property facts or promises. If information is missing, ask one clear question or say a staff member will confirm.',
    'Do not request sensitive payment credentials. Do not claim you already placed an order unless the ERP data says so.',
    'Return only the suggested reply text, without labels or quotation marks.',
  ].join('\n');
  let result: unknown;
  try { result = await env.AI.run(model, { messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ customer: conversation.customerDisplayName || 'Customer', history, instruction: body.instruction || 'Prepare the best reply.' }) }] }); }
  catch (error) { return json({ error: `Cloudflare AI reply generation failed: ${(error as Error).message}` }, 502); }
  const suggestion = aiText(result).trim();
  if (!suggestion) return json({ error: 'AI returned an empty reply.' }, 502);
  const suggestionId = uid('social-ai');
  await env.DB.prepare(`INSERT INTO social_ai_suggestions(id,brand_id,suggestion_type,title,suggestion_json,source_model,status) VALUES(?,?,'reply',?,?,?,'new')`).bind(suggestionId, brand.id, `Reply suggestion for ${conversation.platform}`, JSON.stringify({ conversationId: conversation.id, text: suggestion }), model).run();
  return json({ suggestionId, reply: suggestion, aiGenerated: true, requiresHumanReview: true });
}

export async function routeSocial(request: Request, env: SocialEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/social/brands' && request.method === 'GET') return brands(env, context);
  if (url.pathname === '/api/social/overview' && request.method === 'GET') return overview(request, env, context);
  if (url.pathname === '/api/social/connections' && request.method === 'GET') return listConnections(request, env, context);
  if (url.pathname === '/api/social/onboarding' && request.method === 'GET') return onboardingList(request, env, context);
  if (url.pathname === '/api/social/onboarding' && request.method === 'POST') return onboarding(request, env, context);
  if (url.pathname === '/api/social/connections/complete' && request.method === 'POST') return completeConnection(request, env, context);
  if (url.pathname === '/api/social/content' && (request.method === 'GET' || request.method === 'POST')) return content(request, env, context);
  if (url.pathname === '/api/social/content/detail' && request.method === 'GET') return contentDetail(request, env, context);
  if (url.pathname === '/api/social/content/generate' && request.method === 'POST') return generateContent(request, env, context);
  if (url.pathname === '/api/social/content/review' && request.method === 'POST') return reviewContent(request, env, context);
  if (url.pathname === '/api/social/content/schedule' && request.method === 'POST') return scheduleContent(request, env, context);
  if (url.pathname === '/api/social/products' && (request.method === 'GET' || request.method === 'POST')) return products(request, env, context);
  if (url.pathname === '/api/social/orders' && (request.method === 'GET' || request.method === 'POST')) return orders(request, env, context);
  if (url.pathname === '/api/social/orders/update' && request.method === 'POST') return updateOrder(request, env, context);
  if (url.pathname === '/api/social/analytics' && request.method === 'GET') return analytics(request, env, context);
  if (url.pathname === '/api/social/ads' && (request.method === 'GET' || request.method === 'POST')) return ads(request, env, context);
  if (url.pathname === '/api/social/ads/review' && request.method === 'POST') return approveAd(request, env, context);
  if (url.pathname === '/api/social/conversations' && request.method === 'GET') return conversations(request, env, context);
  if (url.pathname === '/api/social/ai/reply' && request.method === 'POST') return aiReply(request, env, context);
  return null;
}
