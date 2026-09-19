import type { AuthEnv } from './auth.js';
import { verifyWebhookSignature } from './communications/whatsapp.js';
import { assertStaffPortalCompany } from './communications-repository.js';

export interface CommunicationsWebhookEnv extends AuthEnv {
  META_APP_SECRET?: string;
  COMMUNICATIONS_WEBHOOK_VERIFY_TOKEN?: string;
}

const encoder = new TextEncoder();
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  });

async function sha256(raw: Uint8Array) {
  const bytes = raw.buffer.slice(raw.byteOffset,raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2,'0'))
    .join('');
}

function webhookValues(payload: Record<string, unknown>) {
  const values: Record<string, unknown>[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? (entry as Record<string, unknown>).changes as unknown[]
      : [];
    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const value = (change as Record<string, unknown>).value;
      if (value && typeof value === 'object') values.push(value as Record<string, unknown>);
    }
  }
  return values;
}

async function resolveSenderCompany(
  env: CommunicationsWebhookEnv,
  phoneNumberId: string,
) {
  const row = await env.DB.prepare(`
    SELECT c.id AS connectionId,b.company_id AS companyId
    FROM social_platform_connections c
    JOIN social_brands b ON b.id=c.brand_id
    JOIN communication_templates t
      ON t.sender_connection_id=c.id AND t.company_id=b.company_id
    WHERE c.platform='whatsapp' AND c.platform_account_id=?
      AND c.status='connected'
      AND t.channel='whatsapp'
      AND t.internal_status='approved'
    ORDER BY t.revision DESC
    LIMIT 1
  `).bind(phoneNumberId).first<{ connectionId:string;companyId:string }>();
  if (!row?.companyId) return null;
  assertStaffPortalCompany(row.companyId);
  return row;
}

async function persistInbox(
  env: CommunicationsWebhookEnv,
  bodyHash: string,
  connectionId: string,
  providerEventId?: string,
) {
  const id = `comm-webhook-${crypto.randomUUID()}`;
  try {
    await env.DB.prepare(`
      INSERT INTO communication_webhook_inbox(
        id,provider,connection_ref,provider_event_id,body_sha256,processing_status
      ) VALUES(?,'meta_whatsapp',?,?,?,'received')
    `).bind(id,connectionId,providerEventId || null,bodyHash).run();
    return { id, duplicate:false };
  } catch {
    const existing = await env.DB.prepare(`
      SELECT id FROM communication_webhook_inbox
      WHERE provider='meta_whatsapp'
        AND (body_sha256=? OR (? IS NOT NULL AND provider_event_id=?))
      LIMIT 1
    `).bind(bodyHash,providerEventId || null,providerEventId || null).first<{id:string}>();
    if (existing) return { id:existing.id,duplicate:true };
    throw new Error('WEBHOOK_INBOX_PERSIST_FAILED');
  }
}

function firstProviderEventId(values: Record<string, unknown>[]) {
  for (const value of values) {
    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    const first = statuses[0];
    if (first && typeof first === 'object') {
      const id = String((first as Record<string, unknown>).id || '');
      if (id) return id;
    }
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const message = messages[0];
    if (message && typeof message === 'object') {
      const id = String((message as Record<string, unknown>).id || '');
      if (id) return id;
    }
  }
  return undefined;
}

async function applyStatuses(
  env: CommunicationsWebhookEnv,
  companyId: string,
  values: Record<string, unknown>[],
) {
  let updates = 0;
  for (const value of values) {
    const statuses = Array.isArray(value.statuses)
      ? value.statuses as Array<Record<string, unknown>>
      : [];
    for (const statusRow of statuses) {
      const providerMessageId = String(statusRow.id || '');
      const providerStatus = String(statusRow.status || '').toLowerCase();
      if (!providerMessageId) continue;
      const nextStatus =
        providerStatus === 'delivered' ? 'delivered' :
        providerStatus === 'read' ? 'read' :
        providerStatus === 'failed' ? 'failed' :
        providerStatus === 'sent' ? 'accepted' :
        '';
      if (!nextStatus) continue;
      const errors = Array.isArray(statusRow.errors) ? statusRow.errors : [];
      const firstError = errors[0];
      const errorCode = firstError && typeof firstError === 'object'
        ? String((firstError as Record<string, unknown>).code || '').slice(0,80)
        : null;
      const result = await env.DB.prepare(`
        UPDATE communication_outbox
        SET status=?,
          accepted_at=CASE WHEN ?='accepted' THEN COALESCE(accepted_at,CURRENT_TIMESTAMP) ELSE accepted_at END,
          delivered_at=CASE WHEN ?='delivered' THEN COALESCE(delivered_at,CURRENT_TIMESTAMP) ELSE delivered_at END,
          read_at=CASE WHEN ?='read' THEN COALESCE(read_at,CURRENT_TIMESTAMP) ELSE read_at END,
          last_error_code=CASE WHEN ?='failed' THEN ? ELSE last_error_code END,
          updated_at=CURRENT_TIMESTAMP
        WHERE company_id=? AND provider_message_id=?
          AND status NOT IN ('cancelled','expired')
      `).bind(
        nextStatus,nextStatus,nextStatus,nextStatus,nextStatus,errorCode,
        companyId,providerMessageId,
      ).run();
      updates += Number(result.meta?.changes || 0);
    }
  }
  return updates;
}

export async function routeCommunicationsWebhook(
  request: Request,
  env: CommunicationsWebhookEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/communications/webhooks/whatsapp') return null;

  if (request.method === 'GET') {
    const expected = String(env.COMMUNICATIONS_WEBHOOK_VERIFY_TOKEN || '');
    const valid =
      url.searchParams.get('hub.mode') === 'subscribe' &&
      expected &&
      url.searchParams.get('hub.verify_token') === expected;
    return valid
      ? new Response(url.searchParams.get('hub.challenge') || '', {
          status:200,
          headers:{ 'content-type':'text/plain; charset=utf-8' },
        })
      : json({ error:'Webhook verification failed.' },403);
  }
  if (request.method !== 'POST') return json({ error:'Method not allowed.' },405);
  const secret = String(env.META_APP_SECRET || '');
  if (!secret) return json({ error:'Webhook authentication is unavailable.' },503);

  const rawBuffer = await request.arrayBuffer();
  if (rawBuffer.byteLength > 1_048_576) return json({ error:'Webhook payload too large.' },413);
  const raw = new Uint8Array(rawBuffer);
  const signature = request.headers.get('x-hub-signature-256');
  if (!await verifyWebhookSignature(raw,signature,secret)) {
    return json({ error:'Webhook signature verification failed.' },401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
  } catch {
    return json({ error:'Invalid webhook JSON.' },400);
  }
  if (payload.object !== 'whatsapp_business_account') {
    return json({ error:'Unsupported webhook object.' },400);
  }
  const values = webhookValues(payload);
  if (!values.length) return json({ received:true,ignored:true });

  const senderMappings = new Map<string,{connectionId:string;companyId:string}>();
  for (const value of values) {
    const metadata = value.metadata && typeof value.metadata === 'object'
      ? value.metadata as Record<string, unknown>
      : {};
    const phoneNumberId = String(metadata.phone_number_id || '');
    if (!phoneNumberId) continue;
    const mapping = await resolveSenderCompany(env,phoneNumberId);
    if (!mapping) return json({ error:'Unknown communications sender.' },403);
    senderMappings.set(phoneNumberId,mapping);
  }
  if (!senderMappings.size) return json({ error:'Communications sender mapping is required.' },403);
  const companies = new Set([...senderMappings.values()].map(value => value.companyId));
  if (companies.size !== 1) return json({ error:'Mixed company webhook payload is not accepted.' },400);
  const companyId = [...companies][0]!;
  const connectionIds = new Set([...senderMappings.values()].map(value => value.connectionId));
  if (connectionIds.size !== 1) return json({ error:'Mixed sender webhook payload is not accepted.' },400);
  const connectionId = [...connectionIds][0]!;

  const bodyHash = await sha256(raw);
  const providerEventId = firstProviderEventId(values);
  let receipt: {id:string;duplicate:boolean};
  try {
    receipt = await persistInbox(env,bodyHash,connectionId,providerEventId);
  } catch {
    return json({ error:'Webhook receipt could not be stored.' },503);
  }
  if (receipt.duplicate) return json({ received:true,duplicate:true });

  try {
    const statusUpdates = await applyStatuses(env,companyId,values);
    await env.DB.prepare(`
      UPDATE communication_webhook_inbox
      SET processing_status='processed',processed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(receipt.id).run();
    return json({ received:true,statusUpdates });
  } catch {
    await env.DB.prepare(`
      UPDATE communication_webhook_inbox
      SET processing_status='failed',last_error_code='STATUS_PROCESSING_FAILED'
      WHERE id=?
    `).bind(receipt.id).run().catch(() => undefined);
    // Durable receipt already exists; return 200 so Meta does not create an uncontrolled retry storm.
    return json({ received:true,processingDeferred:true });
  }
}
