import { assertStaffPortalCompany } from './communications-repository.js';
import { resolveMetaCredential, type MetaCredentialEnv } from './meta-credentials.js';

export interface WhatsAppOutboundEnv extends MetaCredentialEnv {
  COMMUNICATIONS_WHATSAPP_LIVE_SEND?: string;
}

type PreparedMessage={
  messageId:string; conversationId:string; companyId:string; customerWaId:string;
  senderId:string; phoneNumberId:string; replyMode:string; body:string;
  templateId?:string|null; templateName?:string|null; templateLanguage?:string|null; status:string;
  lastCustomerMessageAt?:string|null;
  idempotencyKey?:string|null;
};

export type WhatsAppSendPreparation={
  ready:boolean; liveSend:boolean; reason?:string; endpoint?:string;
  idempotencyKey:string; payload:Record<string,unknown>; messageId:string;
  phoneNumberId:string; tokenConfigured:boolean;
};

async function liveEnabled(env:WhatsAppOutboundEnv){
  if(String(env.COMMUNICATIONS_WHATSAPP_LIVE_SEND||'').toLowerCase()!=='true')return false;
  const row=await env.DB.prepare(`SELECT setting_value AS value FROM app_settings WHERE setting_key='communications.whatsapp_live_send' LIMIT 1`).first<{value:string}>();
  return String(row?.value||'').toLowerCase()==='true';
}

function normalizeRecipient(value:string){
  return value.replace(/^\+/,'').replace(/\D/g,'');
}
async function loadPreparedMessage(
  env:WhatsAppOutboundEnv,companyId:string,conversationId:string,messageId:string,
){
  assertStaffPortalCompany(companyId);
  return env.DB.prepare(`
    SELECT m.id AS messageId,m.conversation_id AS conversationId,m.company_id AS companyId,
      m.reply_mode AS replyMode,m.body,m.template_id AS templateId,m.template_name AS templateName,
      m.template_language AS templateLanguage,m.status,m.idempotency_key AS idempotencyKey,
      c.customer_wa_id AS customerWaId,c.sender_id AS senderId,c.last_customer_message_at AS lastCustomerMessageAt,
      s.phone_number_id AS phoneNumberId
    FROM communication_inbox_messages m
    JOIN communication_inbox_conversations c ON c.id=m.conversation_id
    JOIN communication_whatsapp_senders s ON s.id=c.sender_id
    WHERE m.id=? AND m.conversation_id=? AND m.company_id=? AND c.company_id=?
      AND m.direction='outbound' AND m.status='draft'
      AND s.status IN ('configured','connected')
      AND EXISTS(
        SELECT 1 FROM communication_whatsapp_sender_companies sc
        WHERE sc.sender_id=s.id AND sc.company_id=? AND sc.enabled=1
      )
    LIMIT 1
  `).bind(messageId,conversationId,companyId,companyId,companyId).first<PreparedMessage>();
}
function buildPayload(row:PreparedMessage,templateComponents?:Record<string,unknown>[]){
  const to=normalizeRecipient(row.customerWaId);
  if(row.replyMode==='template'){
    if(!row.templateName||!row.templateLanguage)throw new Error('APPROVED_TEMPLATE_REQUIRED');
    return {
      messaging_product:'whatsapp',
      recipient_type:'individual',
      to,
      type:'template',
      template:{name:row.templateName,language:{code:row.templateLanguage},...(templateComponents?.length?{components:templateComponents}:{})},
    };
  }
  return {
    messaging_product:'whatsapp',
    recipient_type:'individual',
    to,
    type:'text',
    text:{preview_url:false,body:row.body},
  };
}

async function resolveInboxTemplateComponents(env:WhatsAppOutboundEnv,row:PreparedMessage){
  const mapping=await env.DB.prepare(`
    SELECT id FROM communication_template_mappings
    WHERE template_id=? AND company_id=? AND use_case_id='support.reply'
      AND provider_template_name=? AND language=?
      AND category='customer_support' AND enabled=1 AND status='approved'
    LIMIT 1
  `).bind(String(row.templateId||''),row.companyId,String(row.templateName||''),String(row.templateLanguage||'')).first<{id:string}>();
  if(!mapping)throw new Error('WHATSAPP_TEMPLATE_MAPPING_NOT_READY');
  const result=await env.DB.prepare(`
    SELECT component,component_name AS componentName,position,source_field AS sourceField,
      source_module AS sourceModule,data_type AS dataType,required,max_length AS maxLength,
      formatter,fallback_policy AS fallbackPolicy,fallback_value AS fallbackValue,sensitivity
    FROM communication_template_variable_mappings WHERE mapping_id=?
    ORDER BY component,component_name,position LIMIT 100
  `).bind(mapping.id).all<Record<string,unknown>>();
  const variables=result.results||[];
  if(!variables.length)throw new Error('WHATSAPP_TEMPLATE_VARIABLES_REQUIRED');
  // This bounded Inbox slice resolves only the canonical customer display name
  // into Meta text HEADER and BODY parameters. Other sources/components remain
  // fail-closed until their source and provider format contracts are explicit.
  if(variables.some(v=>!['header','body'].includes(String(v.component))||v.componentName||v.sourceField!=='customer_display_name'||
      v.sourceModule!=='communications'||v.dataType!=='text'||v.formatter!=='none'||
      !Number.isInteger(Number(v.position))||Number(v.position)<1||Number(v.position)>100||
      !Number.isInteger(Number(v.maxLength))||Number(v.maxLength)<1||Number(v.maxLength)>4096||
      v.sensitivity==='prohibited'))throw new Error('WHATSAPP_TEMPLATE_VARIABLE_SOURCE_UNAVAILABLE');
  const conversation=await env.DB.prepare(`
    SELECT customer_display_name AS customerDisplayName FROM communication_inbox_conversations
    WHERE id=? AND company_id=? LIMIT 1
  `).bind(row.conversationId,row.companyId).first<{customerDisplayName:string|null}>();
  const parametersByComponent = new Map<string,Record<string,unknown>[]>();
  for(const variable of variables){
    const value=typeof conversation?.customerDisplayName==='string'?conversation.customerDisplayName.trim():'';
    const approvedFallback=variable.fallbackPolicy==='approved_value'&&typeof variable.fallbackValue==='string'?variable.fallbackValue:'';
    const resolved=value||approvedFallback;
    if(!resolved)throw new Error(Number(variable.required)===1?'WHATSAPP_TEMPLATE_REQUIRED_VALUE_MISSING':'WHATSAPP_TEMPLATE_FALLBACK_UNAVAILABLE');
    if(resolved.length>Number(variable.maxLength))throw new Error('WHATSAPP_TEMPLATE_VALUE_TOO_LONG');
    const parameters=parametersByComponent.get(String(variable.component))||[];
    parameters.push({type:'text',text:resolved});
    parametersByComponent.set(String(variable.component),parameters);
  }
  return (['header','body'] as const).flatMap(component=>{
    const parameters=parametersByComponent.get(component);
    return parameters?.length?[{type:component,parameters}]:[];
  });
}

async function ensureIdempotencyKey(
  env:WhatsAppOutboundEnv,row:PreparedMessage,
){
  const key=row.idempotencyKey||`wa-inbox:${row.companyId}:${row.messageId}:v1`;
  if(row.idempotencyKey)return key;
  const result=await env.DB.prepare(`
    UPDATE communication_inbox_messages SET idempotency_key=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND idempotency_key IS NULL AND status='draft'
  `).bind(key,row.messageId).run();
  if(Number(result.meta?.changes||0)!==1){
    const existing=await env.DB.prepare(
      'SELECT idempotency_key AS idempotencyKey FROM communication_inbox_messages WHERE id=? LIMIT 1'
    ).bind(row.messageId).first<{idempotencyKey?:string}>();
    if(!existing?.idempotencyKey)throw new Error('IDEMPOTENCY_PERSIST_FAILED');
    return existing.idempotencyKey;
  }
  return key;
}
export async function prepareWhatsAppInboxSend(
  env:WhatsAppOutboundEnv,input:{companyId:string;conversationId:string;messageId:string},
):Promise<WhatsAppSendPreparation>{
  const row=await loadPreparedMessage(env,input.companyId,input.conversationId,input.messageId);
  if(!row)throw new Error('WHATSAPP_DRAFT_NOT_SENDABLE');
  let templateComponents:Record<string,unknown>[]|undefined;
  if(row.replyMode==='freeform'){
    const lastMs=row.lastCustomerMessageAt?Date.parse(row.lastCustomerMessageAt):NaN;
    if(!Number.isFinite(lastMs)||Date.now()>=lastMs+24*60*60*1000)throw new Error('WHATSAPP_TEMPLATE_REQUIRED');
  }
  if(row.replyMode==='template'){
    const current=await env.DB.prepare(`
      SELECT id FROM communication_templates
      WHERE id=? AND company_id=? AND channel='whatsapp'
        AND internal_status='approved' AND provider_status='approved'
      LIMIT 1
    `).bind(String(row.templateId||''),row.companyId).first();
    if(!current)throw new Error('WHATSAPP_TEMPLATE_NOT_APPROVED');
    templateComponents=await resolveInboxTemplateComponents(env,row);
  }
  if(!normalizeRecipient(row.customerWaId))throw new Error('WHATSAPP_RECIPIENT_INVALID');
  const idempotencyKey=await ensureIdempotencyKey(env,row);
  const payload=buildPayload(row,templateComponents);
  const version=(await resolveMetaCredential(env,'meta_graph_version'))||'v24.0';
  const endpoint=`https://graph.facebook.com/${version}/${encodeURIComponent(row.phoneNumberId)}/messages`;
  const tokenConfigured=Boolean(await resolveMetaCredential(env,'meta_system_user_token'));
  const liveSend=await liveEnabled(env);
  const reason=!liveSend?'LIVE_SEND_DISABLED':!tokenConfigured?'META_SYSTEM_USER_TOKEN_MISSING':undefined;
  return {
    ready:!reason,liveSend,reason,endpoint,idempotencyKey,payload,
    messageId:row.messageId,phoneNumberId:row.phoneNumberId,tokenConfigured,
  };
}

export async function sendWhatsAppInboxMessage(
  env:WhatsAppOutboundEnv,input:{companyId:string;conversationId:string;messageId:string},
){
  const prepared=await prepareWhatsAppInboxSend(env,input);
  if(!prepared.liveSend)return {accepted:false,blocked:true,errorCode:'LIVE_SEND_DISABLED'};
  if(!prepared.tokenConfigured)return {accepted:false,blocked:true,errorCode:'META_SYSTEM_USER_TOKEN_MISSING'};
  const token=await resolveMetaCredential(env,'meta_system_user_token');
  if(!token)return {accepted:false,blocked:true,errorCode:'META_SYSTEM_USER_TOKEN_MISSING'};
  const claim=await env.DB.prepare(`
    UPDATE communication_inbox_messages
    SET status='sending',send_requested_at=COALESCE(send_requested_at,CURRENT_TIMESTAMP),
      updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='draft' AND idempotency_key=?
  `).bind(prepared.messageId,prepared.idempotencyKey).run();
  if(Number(claim.meta?.changes||0)!==1){
    return {accepted:false,blocked:true,errorCode:'SEND_ALREADY_CLAIMED'};
  }
  let response:Response;
  try{
    response=await fetch(prepared.endpoint!,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify(prepared.payload),
    });
  }catch{
    await env.DB.prepare(`
      UPDATE communication_inbox_messages
      SET status='failed',last_error_code='PROVIDER_TRANSPORT_AMBIGUOUS',updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='sending'
    `).bind(prepared.messageId).run();
    return {accepted:false,ambiguous:true,errorCode:'PROVIDER_TRANSPORT_AMBIGUOUS'};
  }
  const raw=await response.text();
  let body:Record<string,unknown>={};try{body=raw?JSON.parse(raw):{}}catch{}
  const messages=Array.isArray(body.messages)?body.messages as Array<Record<string,unknown>>:[];
  const providerMessageId=String(messages[0]?.id||'');
  if(response.ok&&providerMessageId){
    await env.DB.prepare(`
      UPDATE communication_inbox_messages
      SET status='sent',provider_message_id=?,send_requested_at=COALESCE(send_requested_at,CURRENT_TIMESTAMP),
        last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='sending'
    `).bind(providerMessageId,prepared.messageId).run();
    return {accepted:true,providerMessageId};
  }
  const errorCode=String(
    body.error&&typeof body.error==='object'
      ? (body.error as Record<string,unknown>).code||'META_REJECTED'
      : 'META_REJECTED'
  );
  await env.DB.prepare(`
    UPDATE communication_inbox_messages
    SET status='failed',last_error_code=?,send_requested_at=COALESCE(send_requested_at,CURRENT_TIMESTAMP),
      updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='sending'
  `).bind(errorCode,prepared.messageId).run();
  return {accepted:false,errorCode};
}
