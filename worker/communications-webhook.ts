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

type SenderMapping = {
  senderId:string;
  companyId:string|null;
  routingMode:'shared_group'|'company_dedicated';
};

async function resolveSenderScope(
  env: CommunicationsWebhookEnv,
  phoneNumberId: string,
):Promise<SenderMapping|null> {
  const row=await env.DB.prepare(`
    SELECT id AS senderId,routing_mode AS routingMode,dedicated_company_id AS companyId
    FROM communication_whatsapp_senders
    WHERE phone_number_id=? AND status IN ('configured','connected')
    LIMIT 1
  `).bind(phoneNumberId).first<SenderMapping>();
  if(!row)return null;
  if(row.companyId)assertStaffPortalCompany(row.companyId);
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

async function persistInboundMessages(
  env:CommunicationsWebhookEnv,
  mapping:SenderMapping,
  values:Record<string,unknown>[],
){
  let inserted=0;
  for(const value of values){
    const contacts=Array.isArray(value.contacts)?value.contacts as Array<Record<string,unknown>>:[];
    const contactNames=new Map<string,string>();
    for(const contact of contacts){
      const waId=String(contact.wa_id||'');
      const profile=contact.profile&&typeof contact.profile==='object'?contact.profile as Record<string,unknown>:{};
      if(waId)contactNames.set(waId,String(profile.name||'').slice(0,160));
    }
    const messages=Array.isArray(value.messages)?value.messages as Array<Record<string,unknown>>:[];
    for(const message of messages){
      const providerId=String(message.id||''),from=String(message.from||'');
      if(!providerId||!from)continue;
      let thread=await env.DB.prepare(`SELECT id FROM communication_inbox_conversations
        WHERE sender_id=? AND customer_wa_id=? LIMIT 1`).bind(mapping.senderId,from).first<{id:string}>();
      if(!thread){
        const id=`comm-conv-${crypto.randomUUID()}`;
        await env.DB.prepare(`INSERT OR IGNORE INTO communication_inbox_conversations(
          id,company_id,sender_id,customer_wa_id,customer_display_name
        ) VALUES(?,?,?,?,?)`).bind(id,mapping.companyId,mapping.senderId,from,contactNames.get(from)||null).run();
        thread=await env.DB.prepare(`SELECT id FROM communication_inbox_conversations
          WHERE sender_id=? AND customer_wa_id=? LIMIT 1`).bind(mapping.senderId,from).first<{id:string}>();
      }
      if(!thread)throw new Error('INBOX_CONVERSATION_PERSIST_FAILED');
      const type=String(message.type||'unknown').slice(0,40);
      const text=message.text&&typeof message.text==='object'?message.text as Record<string,unknown>:{};
      const body=type==='text'?String(text.body||'').slice(0,4096):null;
      const rawTs=String(message.timestamp||'');
      const providerTimestamp=/^\d+$/.test(rawTs)?new Date(Number(rawTs)*1000).toISOString():null;
      const result=await env.DB.prepare(`INSERT OR IGNORE INTO communication_inbox_messages(
        id,conversation_id,company_id,direction,provider_message_id,message_type,body,status,provider_timestamp
      ) VALUES(?,?,?,'inbound',?,?,?,'received',?)`).bind(
        `comm-msg-${crypto.randomUUID()}`,thread.id,mapping.companyId,providerId,type,body,providerTimestamp
      ).run();
      if(Number(result.meta?.changes||0)>0){
        inserted++;
        await env.DB.prepare(`UPDATE communication_inbox_conversations SET
          customer_display_name=COALESCE(?,customer_display_name),status='open',
          unread_count=unread_count+1,last_message_at=COALESCE(?,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
          WHERE id=?`).bind(contactNames.get(from)||null,providerTimestamp,thread.id).run();
      }
    }
  }
  return inserted;
}

export function canAdvanceDeliveryStatus(current:string,next:string){
  if(current===next)return true;
  if(['cancelled','expired','read','failed'].includes(current))return false;
  const rank:Record<string,number>={queued:0,sending:0,accepted:1,delivered:2,read:3};
  if(next==='failed')return ['sending','accepted','delivered'].includes(current);
  return (rank[next]??-1)>=(rank[current]??-1);
}

async function applyStatuses(env:CommunicationsWebhookEnv,companyId:string|null,values:Record<string,unknown>[]){
  let updates=0;
  for(const value of values){
    const statuses=Array.isArray(value.statuses)?value.statuses as Array<Record<string,unknown>>:[];
    for(const statusRow of statuses){
      const providerMessageId=String(statusRow.id||''),providerStatus=String(statusRow.status||'').toLowerCase();
      if(!providerMessageId)continue;
      const nextStatus=providerStatus==='delivered'?'delivered':providerStatus==='read'?'read':providerStatus==='failed'?'failed':providerStatus==='sent'?'accepted':'';
      if(!nextStatus)continue;
      const inboxStatus=nextStatus==='accepted'?'sent':nextStatus;
      const inboxCurrent=await env.DB.prepare(`SELECT status FROM communication_inbox_messages WHERE provider_message_id=? LIMIT 1`).bind(providerMessageId).first<{status:string}>();
      if(inboxCurrent&&canAdvanceDeliveryStatus(inboxCurrent.status,inboxStatus)){
        const result=await env.DB.prepare(`UPDATE communication_inbox_messages SET status=?,updated_at=CURRENT_TIMESTAMP WHERE provider_message_id=? AND status=?`).bind(inboxStatus,providerMessageId,inboxCurrent.status).run();
        updates+=Number(result.meta?.changes||0);
      }
      if(!companyId)continue;
      const current=await env.DB.prepare(`SELECT status FROM communication_outbox WHERE company_id=? AND provider_message_id=? LIMIT 1`).bind(companyId,providerMessageId).first<{status:string}>();
      if(!current||!canAdvanceDeliveryStatus(current.status,nextStatus))continue;
      const result=await env.DB.prepare(`UPDATE communication_outbox SET status=?,
        accepted_at=CASE WHEN ? IN ('accepted','delivered','read') THEN COALESCE(accepted_at,CURRENT_TIMESTAMP) ELSE accepted_at END,
        delivered_at=CASE WHEN ? IN ('delivered','read') THEN COALESCE(delivered_at,CURRENT_TIMESTAMP) ELSE delivered_at END,
        read_at=CASE WHEN ?='read' THEN COALESCE(read_at,CURRENT_TIMESTAMP) ELSE read_at END,
        updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND provider_message_id=? AND status=?`)
        .bind(nextStatus,nextStatus,nextStatus,nextStatus,companyId,providerMessageId,current.status).run();
      updates+=Number(result.meta?.changes||0);
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

  const senderMappings = new Map<string,SenderMapping>();
  for (const value of values) {
    const metadata=value.metadata&&typeof value.metadata==='object'?value.metadata as Record<string,unknown>:{};
    const phoneNumberId=String(metadata.phone_number_id||'');
    if(!phoneNumberId)continue;
    const mapping=await resolveSenderScope(env,phoneNumberId);
    if(!mapping)return json({error:'Unknown communications sender.'},403);
    senderMappings.set(phoneNumberId,mapping);
  }
  if(!senderMappings.size)return json({error:'Communications sender mapping is required.'},403);
  const senderIds=new Set([...senderMappings.values()].map(value=>value.senderId));
  if(senderIds.size!==1)return json({error:'Mixed sender webhook payload is not accepted.'},400);
  const mapping=[...senderMappings.values()][0]!;

  const bodyHash=await sha256(raw);
  const providerEventId=firstProviderEventId(values);
  let receipt:{id:string;duplicate:boolean};
  try{
    receipt=await persistInbox(env,bodyHash,mapping.senderId,providerEventId);
  }catch{
    return json({error:'Webhook receipt could not be stored.'},503);
  }
  if(receipt.duplicate)return json({received:true,duplicate:true});

  try {
    const statusUpdates=await applyStatuses(env,mapping.companyId,values);
    const inboundMessages=await persistInboundMessages(env,mapping,values);
    await env.DB.prepare(`
      UPDATE communication_webhook_inbox
      SET processing_status='processed',processed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(receipt.id).run();
    return json({ received:true,statusUpdates,inboundMessages });
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
