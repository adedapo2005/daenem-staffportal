import { decryptSocialSecret } from './social-crypto';
import type { SocialEnv, SocialQueueMessage } from './social-engine';

interface DispatchJob {
  id: string;
  brandId: string;
  jobType: SocialQueueMessage['jobType'];
  entityId?: string;
  platform?: string;
  payloadJson?: string;
  attempts: number;
  status: string;
}

interface PublishVariant {
  variantId: string;
  contentItemId: string;
  brandId: string;
  platform: string;
  caption: string;
  mediaJson?: string;
  optionsJson?: string;
  targetUrl?: string;
  contentType: string;
  aiGenerated: number;
  disclosureRequired: number;
  connectionId?: string;
  platformAccountId?: string;
  platformBusinessId?: string;
  platformAdAccountId?: string;
  platformCatalogId?: string;
  accessTokenCiphertext?: string;
  metadataJson?: string;
  connectionStatus?: string;
}

const graphVersion = (env: SocialEnv) => env.META_GRAPH_VERSION || 'v24.0';

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function providerJson(response: Response) {
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  if (!response.ok) {
    const message = body && typeof body === 'object' ? JSON.stringify(body).slice(0, 1200) : String(body || response.statusText);
    throw new Error(`Provider returned HTTP ${response.status}: ${message}`);
  }
  return body as Record<string, unknown>;
}

async function connectionToken(env: SocialEnv, variant: PublishVariant) {
  if (!variant.connectionId || variant.connectionStatus !== 'connected') throw new Error(`No connected ${variant.platform} account is available for this brand.`);
  if (!variant.accessTokenCiphertext) throw new Error(`${variant.platform} authorization token is not stored. Reconnect the account through Social Engine.`);
  return decryptSocialSecret(env, variant.accessTokenCiphertext);
}

async function publishFacebook(env: SocialEnv, variant: PublishVariant, token: string) {
  if (!variant.platformAccountId) throw new Error('Facebook Page ID is missing from the connection.');
  const body = new URLSearchParams();
  body.set('message', variant.caption);
  if (variant.targetUrl) body.set('link', variant.targetUrl);
  const response = await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(variant.platformAccountId)}/feed`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  const result = await providerJson(response);
  return { externalId: String(result.id || ''), permalink: '' };
}

async function publishInstagram(env: SocialEnv, variant: PublishVariant, token: string) {
  if (!variant.platformAccountId) throw new Error('Instagram Professional Account ID is missing from the connection.');
  const media = parseJson<Array<{ url?: string; type?: string } | string>>(variant.mediaJson, []);
  const first = media[0];
  const mediaUrl = typeof first === 'string' ? first : first?.url;
  if (!mediaUrl) throw new Error('Instagram publishing requires an externally accessible image/video URL. Upload/select media before scheduling.');
  const create = new URLSearchParams();
  create.set('caption', variant.caption);
  const isVideo = variant.contentType === 'video' || variant.contentType === 'reel' || (typeof first === 'object' && first?.type === 'video');
  if (isVideo) {
    create.set('media_type', 'REELS');
    create.set('video_url', mediaUrl);
  } else create.set('image_url', mediaUrl);
  let response = await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(variant.platformAccountId)}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: create,
  });
  const container = await providerJson(response);
  const creationId = String(container.id || '');
  if (!creationId) throw new Error('Instagram did not return a media container ID.');
  const publish = new URLSearchParams({ creation_id: creationId });
  response = await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(variant.platformAccountId)}/media_publish`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: publish,
  });
  const result = await providerJson(response);
  return { externalId: String(result.id || creationId), permalink: '' };
}

async function publishTikTok(_env: SocialEnv, variant: PublishVariant, token: string) {
  const media = parseJson<Array<{ url?: string; type?: string } | string>>(variant.mediaJson, []);
  const options = parseJson<Record<string, unknown>>(variant.optionsJson, {});
  const first = media[0];
  const firstUrl = typeof first === 'string' ? first : first?.url;
  if (!firstUrl) throw new Error('TikTok Direct Post requires an externally accessible photo/video URL.');
  const privacyLevel = String(options.privacyLevel || 'PUBLIC_TO_EVERYONE');
  const isVideo = variant.contentType === 'video' || variant.contentType === 'reel' || (typeof first === 'object' && first?.type === 'video');
  let endpoint = 'https://open.tiktokapis.com/v2/post/publish/content/init/';
  let payload: Record<string, unknown>;
  if (isVideo) {
    endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
    payload = {
      post_info: {
        title: variant.caption,
        privacy_level: privacyLevel,
        disable_comment: Boolean(options.disableComment || false),
        disable_duet: Boolean(options.disableDuet || false),
        disable_stitch: Boolean(options.disableStitch || false),
        brand_organic_toggle: true,
        is_aigc: Boolean(variant.disclosureRequired),
      },
      source_info: { source: 'PULL_FROM_URL', video_url: firstUrl },
    };
  } else {
    const photoUrls = media.map((item) => typeof item === 'string' ? item : item.url).filter((value): value is string => Boolean(value)).slice(0, 35);
    payload = {
      post_info: {
        title: String(options.title || '').slice(0, 90),
        description: variant.caption,
        privacy_level: privacyLevel,
        disable_comment: Boolean(options.disableComment || false),
        auto_add_music: Boolean(options.autoAddMusic || false),
        brand_organic_toggle: true,
        brand_content_toggle: false,
      },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: photoUrls },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    };
  }
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify(payload) });
  const result = await providerJson(response);
  const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
  const error = result.error && typeof result.error === 'object' ? result.error as Record<string, unknown> : {};
  if (error.code && error.code !== 'ok') throw new Error(`TikTok publishing error: ${String(error.message || error.code)}`);
  return { externalId: String(data.publish_id || ''), permalink: '' };
}

async function publishX(_env: SocialEnv, variant: PublishVariant, token: string) {
  const media = parseJson<Array<Record<string, unknown> | string>>(variant.mediaJson, []);
  const mediaIds = media.map((item) => typeof item === 'object' ? item.mediaId : undefined).filter((value): value is string => typeof value === 'string' && Boolean(value));
  const payload: Record<string, unknown> = { text: variant.caption };
  if (mediaIds.length) payload.media = { media_ids: mediaIds };
  if (variant.disclosureRequired && mediaIds.length) payload.made_with_ai = true;
  const response = await fetch('https://api.x.com/2/tweets', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await providerJson(response);
  const data = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
  const id = String(data.id || '');
  return { externalId: id, permalink: id ? `https://x.com/i/web/status/${id}` : '' };
}

async function publishVariant(env: SocialEnv, variantId: string) {
  const variant = await env.DB.prepare(`
    SELECT v.id AS variantId,v.content_item_id AS contentItemId,c.brand_id AS brandId,v.platform,v.caption,
           v.media_json AS mediaJson,v.platform_options_json AS optionsJson,c.target_url AS targetUrl,c.content_type AS contentType,
           c.ai_generated AS aiGenerated,c.disclosure_required AS disclosureRequired,
           conn.id AS connectionId,conn.platform_account_id AS platformAccountId,conn.platform_business_id AS platformBusinessId,
           conn.platform_ad_account_id AS platformAdAccountId,conn.platform_catalog_id AS platformCatalogId,
           conn.access_token_ciphertext AS accessTokenCiphertext,conn.metadata_json AS metadataJson,conn.status AS connectionStatus
    FROM social_content_variants v
    JOIN social_content_items c ON c.id=v.content_item_id
    LEFT JOIN social_platform_connections conn ON conn.brand_id=c.brand_id AND conn.platform=v.platform
    WHERE v.id=?
  `).bind(variantId).first<PublishVariant>();
  if (!variant) throw new Error('Social content variant not found.');
  if (variant.platform === 'whatsapp') throw new Error('WhatsApp is a messaging/order channel. Use an approved WhatsApp message/template workflow instead of public-post publishing.');
  const token = await connectionToken(env, variant);
  await env.DB.prepare(`UPDATE social_content_variants SET status='publishing',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(variant.variantId).run();
  let result: { externalId: string; permalink: string };
  if (variant.platform === 'facebook') result = await publishFacebook(env, variant, token);
  else if (variant.platform === 'instagram') result = await publishInstagram(env, variant, token);
  else if (variant.platform === 'tiktok') result = await publishTikTok(env, variant, token);
  else if (variant.platform === 'x') result = await publishX(env, variant, token);
  else throw new Error(`Unsupported social publishing platform: ${variant.platform}`);
  await env.DB.prepare(`UPDATE social_content_variants SET status='published',external_post_id=?,external_permalink=?,published_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result.externalId || null, result.permalink || null, variant.variantId).run();
  const remaining = await env.DB.prepare(`SELECT COUNT(*) AS count FROM social_content_variants WHERE content_item_id=? AND status NOT IN ('published','skipped')`).bind(variant.contentItemId).first<{ count: number }>();
  await env.DB.prepare(`UPDATE social_content_items SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(remaining?.count || 0) === 0 ? 'published' : 'partially_published', variant.contentItemId).run();
  return result;
}

async function sendWhatsAppMessage(env: SocialEnv, messageId: string) {
  const row = await env.DB.prepare(`
    SELECT m.id,m.text_body AS textBody,m.conversation_id AS conversationId,c.brand_id AS brandId,c.customer_handle AS customerHandle,c.platform,
           conn.platform_account_id AS phoneNumberId,conn.access_token_ciphertext AS accessTokenCiphertext,conn.status AS connectionStatus
    FROM social_messages m JOIN social_conversations c ON c.id=m.conversation_id
    LEFT JOIN social_platform_connections conn ON conn.brand_id=c.brand_id AND conn.platform='whatsapp'
    WHERE m.id=?
  `).bind(messageId).first<{ id: string; textBody?: string; conversationId: string; brandId: string; customerHandle?: string; platform: string; phoneNumberId?: string; accessTokenCiphertext?: string; connectionStatus?: string }>();
  if (!row || row.platform !== 'whatsapp') throw new Error('WhatsApp outbound message not found.');
  if (row.connectionStatus !== 'connected' || !row.phoneNumberId || !row.accessTokenCiphertext) throw new Error('Connected WhatsApp Business phone authorization is required.');
  if (!row.customerHandle) throw new Error('WhatsApp customer number/ID is missing.');
  const token = await decryptSocialSecret(env, row.accessTokenCiphertext);
  const response = await fetch(`https://graph.facebook.com/${graphVersion(env)}/${encodeURIComponent(row.phoneNumberId)}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: row.customerHandle, type: 'text', text: { preview_url: false, body: row.textBody || '' } }),
  });
  const result = await providerJson(response);
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const providerId = messages[0] && typeof messages[0] === 'object' ? String((messages[0] as Record<string, unknown>).id || '') : '';
  await env.DB.prepare(`UPDATE social_messages SET external_message_id=?,status='sent' WHERE id=?`).bind(providerId || null, row.id).run();
  return { externalId: providerId };
}

async function processDispatchJob(env: SocialEnv, job: DispatchJob) {
  await env.DB.prepare(`UPDATE social_dispatch_jobs SET status='processing',started_at=CURRENT_TIMESTAMP,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(job.id).run();
  if (job.jobType === 'publish_content') {
    if (!job.entityId) throw new Error('Publish job has no content variant ID.');
    await publishVariant(env, job.entityId);
  } else if (job.jobType === 'send_message') {
    if (!job.entityId) throw new Error('Message job has no Social message ID.');
    await sendWhatsAppMessage(env, job.entityId);
  } else if (job.jobType === 'ad_action') {
    throw new Error('The ad campaign is approved internally, but provider activation needs the platform-specific ad account/creative adapter to be fully configured before money can be spent.');
  } else {
    throw new Error(`${job.jobType} adapter is not enabled yet.`);
  }
  await env.DB.prepare(`UPDATE social_dispatch_jobs SET status='completed',completed_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(job.id).run();
}

export async function dispatchDueSocialJobs(env: SocialEnv) {
  if (!env.SOCIAL_QUEUE) return { queued: 0, reason: 'queue_binding_unavailable' };
  const rows = await env.DB.prepare(`SELECT id,job_type AS jobType FROM social_dispatch_jobs WHERE status IN ('queued','retry') AND datetime(available_at)<=datetime('now') ORDER BY available_at,created_at LIMIT 50`).all<{ id: string; jobType: SocialQueueMessage['jobType'] }>();
  let queued = 0;
  for (const row of rows.results || []) {
    try {
      await env.SOCIAL_QUEUE.send({ jobId: row.id, jobType: row.jobType });
      await env.DB.prepare(`UPDATE social_dispatch_jobs SET status='processing',started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','retry')`).bind(row.id).run();
      queued += 1;
    } catch (error) {
      await env.DB.prepare(`UPDATE social_dispatch_jobs SET status='retry',last_error=?,available_at=datetime('now','+5 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind((error as Error).message.slice(0, 1200), row.id).run();
    }
  }
  return { queued };
}

export async function processSocialQueue(batch: MessageBatch, env: SocialEnv) {
  for (const message of batch.messages) {
    const body = message.body as SocialQueueMessage;
    const job = await env.DB.prepare(`SELECT id,brand_id AS brandId,job_type AS jobType,entity_id AS entityId,platform,payload_json AS payloadJson,attempts,status FROM social_dispatch_jobs WHERE id=?`).bind(body?.jobId || '').first<DispatchJob>();
    if (!job) { message.ack(); continue; }
    try {
      await processDispatchJob(env, job);
      message.ack();
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      const terminal = attempts >= 5;
      await env.DB.prepare(`UPDATE social_dispatch_jobs SET status=?,last_error=?,available_at=datetime('now','+10 minutes'),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(terminal ? 'failed' : 'retry', (error as Error).message.slice(0, 1200), job.id).run();
      if (job.jobType === 'publish_content' && job.entityId) await env.DB.prepare(`UPDATE social_content_variants SET status='failed',last_error=?,retry_count=retry_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind((error as Error).message.slice(0, 1200), job.entityId).run();
      if (terminal) message.ack(); else message.retry();
    }
  }
}
