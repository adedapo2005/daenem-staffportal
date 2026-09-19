import type { AuthEnv, AccessLevel } from './auth.js';
import { assertStaffPortalCompany, loadPolicySnapshot, reserveCapacity } from './communications-repository.js';
import { effectivePolicy } from './communications/policy.js';
import { eventById } from './communications/catalog.js';
import type { Channel } from './communications/types.js';

type DraftRow = {
  id:string; companyId:string; eventId:string; sourceType:string; sourceId:string;
  sourceRevision:string; authorId:string; recipientId:string; channel:string; language:string;
  body:string; contentOrigin:string; policyRevision:string; status:string; expiresAt:string;
};

type ApprovalRow = {
  id:string; approverId:string; contentDigest:string; policyRevision:string;
  approvedAt:string; expiresAt:string; revokedAt?:string;
};

export interface DeliveryProvider {
  send(input:{
    outboxId:string;
    companyId:string;
    eventId:string;
    recipient:string;
    senderConnectionId:string;
    templateName:string;
    language:string;
    body:string;
    idempotencyKey:string;
  }): Promise<{ accepted:boolean; providerMessageId?:string; ambiguous?:boolean; errorCode?:string }>;
}

const levels:AccessLevel[]=['none','view','create','edit','approve','manage'];
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;

function levelAtLeast(value:AccessLevel, minimum:AccessLevel){
  return levels.indexOf(value)>=levels.indexOf(minimum);
}

export function retryDue(nextAttemptAt: unknown, nowMs = Date.now()) {
  if (!nextAttemptAt) return true;
  const next = new Date(String(nextAttemptAt)).getTime();
  return Number.isFinite(next) && next <= nowMs;
}

export function quietHoursActive(
  config: unknown,
  now = new Date(),
) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const row = config as Record<string, unknown>;
  const start = String(row.start || '');
  const end = String(row.end || '');
  const offset = Number(row.timezoneOffsetMinutes || 0);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || !Number.isFinite(offset)) return false;
  const toMinutes = (value:string) => {
    const [h,m]=value.split(':').map(Number);
    return h>=0&&h<24&&m>=0&&m<60 ? h*60+m : -1;
  };
  const startMinutes=toMinutes(start),endMinutes=toMinutes(end);
  if(startMinutes<0||endMinutes<0||startMinutes===endMinutes)return false;
  const local = new Date(now.getTime()+offset*60_000);
  const current=local.getUTCHours()*60+local.getUTCMinutes();
  return startMinutes<endMinutes
    ? current>=startMinutes&&current<endMinutes
    : current>=startMinutes||current<endMinutes;
}

async function permissionLevel(
  env:AuthEnv,
  employeeId:string,
  companyId:string,
  code:string,
):Promise<AccessLevel>{
  const override=await env.DB.prepare(`
    SELECT o.access_level AS accessLevel
    FROM employee_permission_overrides_v2 o
    JOIN permissions p ON p.id=o.permission_id
    WHERE o.employee_id=? AND p.code=?
      AND (o.company_id=? OR o.company_id IS NULL)
      AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
    ORDER BY CASE WHEN o.company_id=? THEN 0 ELSE 1 END
    LIMIT 1
  `).bind(employeeId,code,companyId,companyId).first<{accessLevel:AccessLevel}>();
  if(override?.accessLevel)return override.accessLevel;
  const rows=await env.DB.prepare(`
    SELECT rp.access_level AS accessLevel
    FROM employee_roles er
    JOIN roles r ON r.id=er.role_id AND r.active=1
    JOIN role_permissions rp ON rp.role_id=er.role_id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE er.employee_id=? AND er.company_id=? AND p.code=?
  `).bind(employeeId,companyId,code).all<{accessLevel:AccessLevel}>();
  let best:AccessLevel='none';
  for(const row of rows.results||[]){
    if(levels.indexOf(row.accessLevel)>levels.indexOf(best))best=row.accessLevel;
  }
  return best;
}

async function draftDigest(row:DraftRow){
  const canonical=JSON.stringify([
    row.id,row.companyId,row.eventId,row.sourceId,row.sourceRevision,row.authorId,
    row.recipientId,row.channel,row.language,row.body,row.contentOrigin,row.policyRevision,row.expiresAt,
  ]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function currentSourceRevision(env:AuthEnv,row:DraftRow){
  if(row.sourceType==='hr_lifecycle_task'){
    const source=await env.DB.prepare(
      'SELECT updated_at AS revision FROM hr_lifecycle_tasks WHERE id=? LIMIT 1'
    ).bind(row.sourceId).first<{revision:string}>();
    return source?.revision;
  }
  if(row.sourceType==='leave_request'){
    const source=await env.DB.prepare(
      'SELECT updated_at AS revision FROM leave_requests WHERE id=? AND company_id=? LIMIT 1'
    ).bind(row.sourceId,row.companyId).first<{revision:string}>();
    return source?.revision;
  }
  if(row.sourceType==='attendance_day'){
    const source=await env.DB.prepare(
      'SELECT updated_at AS revision FROM attendance_days WHERE id=? AND company_id=? AND status=\'incomplete\' LIMIT 1'
    ).bind(row.sourceId,row.companyId).first<{revision:string}>();
    return source?.revision;
  }
  return undefined;
}

async function quietHoursConfig(env:AuthEnv,companyId:string,eventId:string){
  const row=await env.DB.prepare(
    'SELECT quiet_hours_json AS value FROM communication_policy_rules WHERE company_id=? AND event_id=? LIMIT 1'
  ).bind(companyId,eventId).first<{value:string}>();
  if(!row?.value)return {};
  try{
    const parsed=JSON.parse(row.value);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch{return {};}
}

async function loadDraft(env:AuthEnv,draftId:string,companyId:string){
  return env.DB.prepare(`
    SELECT id,company_id AS companyId,event_id AS eventId,source_type AS sourceType,
      source_id AS sourceId,source_revision AS sourceRevision,
      author_employee_id AS authorId,recipient_employee_id AS recipientId,
      channel,language,body,content_origin AS contentOrigin,
      policy_revision AS policyRevision,status,expires_at AS expiresAt
    FROM communication_drafts WHERE id=? AND company_id=? LIMIT 1
  `).bind(draftId,companyId).first<DraftRow>();
}

async function loadCurrentApproval(env:AuthEnv,draftId:string){
  return env.DB.prepare(`
    SELECT id,approver_employee_id AS approverId,content_digest AS contentDigest,
      policy_revision AS policyRevision,approved_at AS approvedAt,expires_at AS expiresAt,
      revoked_at AS revokedAt
    FROM communication_approvals
    WHERE draft_id=? AND revoked_at IS NULL
    ORDER BY approved_at DESC LIMIT 1
  `).bind(draftId).first<ApprovalRow>();
}

export async function queueApprovedDraft(
  env:AuthEnv,
  input:{companyId:string;draftId:string;requestedBy:string},
){
  assertStaffPortalCompany(input.companyId);
  const row=await loadDraft(env,input.draftId,input.companyId);
  if(!row||row.status!=='approved')throw new Error('APPROVED_DRAFT_REQUIRED');
  if(new Date(row.expiresAt).getTime()<=Date.now())throw new Error('DRAFT_EXPIRED');
  const event=eventById(row.eventId);
  const sendLevel=await permissionLevel(
    env,input.requestedBy,input.companyId,`communications.${event.module}.send`
  );
  if(!levelAtLeast(sendLevel,'create'))throw new Error('SEND_PERMISSION_REQUIRED');

  const approval=await loadCurrentApproval(env,row.id);
  if(!approval||new Date(approval.expiresAt).getTime()<=Date.now()){
    throw new Error('CURRENT_APPROVAL_REQUIRED');
  }
  if(approval.approverId===row.authorId)throw new Error('SELF_APPROVAL_DENIED');
  if(approval.policyRevision!==row.policyRevision)throw new Error('APPROVAL_POLICY_MISMATCH');
  if(approval.contentDigest!==await draftDigest(row))throw new Error('APPROVAL_INVALIDATED');

  const template=await env.DB.prepare(`
    SELECT t.id,t.revision,t.sender_connection_id AS senderConnectionId
    FROM communication_templates t
    WHERE t.company_id=? AND t.event_id=? AND t.channel=? AND t.language=?
      AND t.internal_status='approved'
      AND (t.provider_status='approved' OR ?<>'whatsapp')
    ORDER BY t.revision DESC LIMIT 1
  `).bind(row.companyId,row.eventId,row.channel,row.language,row.channel).first<{
    id:string;revision:number;senderConnectionId?:string;
  }>();
  if(!template)throw new Error('APPROVED_TEMPLATE_REQUIRED');
  if(row.channel==='whatsapp'&&!template.senderConnectionId)throw new Error('APPROVED_SENDER_REQUIRED');

  const contact=await env.DB.prepare(`
    SELECT id,revision,normalized_value AS value
    FROM employee_verified_contacts
    WHERE employee_id=? AND company_id=? AND contact_type='phone' AND revoked_at IS NULL
    ORDER BY verified_at DESC LIMIT 1
  `).bind(row.recipientId,row.companyId).first<{id:string;revision:number;value:string}>();
  if(row.channel==='whatsapp'&&!contact)throw new Error('VERIFIED_RECIPIENT_REQUIRED');

  const consent=await env.DB.prepare(`
    SELECT granted,revoked_at AS revokedAt FROM communication_consents
    WHERE employee_id=? AND company_id=? AND channel=? AND purpose=? LIMIT 1
  `).bind(row.recipientId,row.companyId,row.channel,row.eventId).first<{
    granted:number;revokedAt?:string;
  }>();
  if(row.channel==='whatsapp'&&(!consent?.granted||consent.revokedAt))throw new Error('CONSENT_REQUIRED');

  const proposedId=uid('comm-outbox');
  const idempotencyKey=`comm:${row.companyId}:${row.id}:r1`;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO communication_outbox(
      id,company_id,event_id,employee_id,channel,draft_id,template_id,
      recipient_contact_revision,priority,status,idempotency_key,expires_at,
      send_requested_by,next_attempt_at
    ) VALUES(?,?,?,?,?,?,?,?,50,'queued',?,?,?,CURRENT_TIMESTAMP)
  `).bind(
    proposedId,row.companyId,row.eventId,row.recipientId,row.channel,row.id,template.id,
    contact?.revision||null,idempotencyKey,row.expiresAt,input.requestedBy
  ).run();
  const persisted=await env.DB.prepare(
    'SELECT id,status FROM communication_outbox WHERE idempotency_key=? LIMIT 1'
  ).bind(idempotencyKey).first<{id:string;status:string}>();
  if(!persisted)throw new Error('OUTBOX_PERSIST_FAILED');
  await env.DB.prepare(`
    UPDATE communication_drafts SET status='queued',updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='approved'
  `).bind(row.id).run();
  return {id:persisted.id,idempotencyKey,status:persisted.status};
}

export async function dispatchCommunicationOutboxItem(
  env:AuthEnv,
  outboxId:string,
  provider:DeliveryProvider,
){
  const outbox=await env.DB.prepare(`
    SELECT o.id,o.company_id AS companyId,o.event_id AS eventId,o.employee_id AS employeeId,
      o.channel,o.draft_id AS draftId,o.template_id AS templateId,
      o.recipient_contact_revision AS contactRevision,o.idempotency_key AS idempotencyKey,
      o.expires_at AS expiresAt,o.send_requested_by AS requestedBy,o.attempts,o.max_attempts AS maxAttempts,
      o.next_attempt_at AS nextAttemptAt,o.lease_owner AS leaseOwner,o.lease_expires_at AS leaseExpiresAt,
      o.ambiguity_state AS ambiguityState,o.status
    FROM communication_outbox o WHERE o.id=? LIMIT 1
  `).bind(outboxId).first<Record<string,unknown>>();
  if(!outbox)throw new Error('OUTBOX_NOT_FOUND');
  const companyId=String(outbox.companyId||'');
  assertStaffPortalCompany(companyId);
  if(!['queued','failed'].includes(String(outbox.status)))return {status:String(outbox.status)};
  if(String(outbox.ambiguityState||'clear')==='provider_unknown'){
    return {status:'failed',ambiguous:true,awaitingReconciliation:true};
  }
  if(new Date(String(outbox.expiresAt||0)).getTime()<=Date.now()){
    await env.DB.prepare("UPDATE communication_outbox SET status='expired',lease_owner=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(outboxId).run();
    return {status:'expired'};
  }
  if(!retryDue(outbox.nextAttemptAt)){
    return {status:String(outbox.status),retryDeferred:true};
  }
  if(Number(outbox.attempts||0)>=Number(outbox.maxAttempts||5)){
    await env.DB.prepare("UPDATE communication_outbox SET status='failed',last_error_code='MAX_ATTEMPTS',lease_owner=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(outboxId).run();
    return {status:'failed'};
  }

  const row=await loadDraft(env,String(outbox.draftId||''),companyId);
  if(!row||row.status!=='queued')throw new Error('DRAFT_NOT_QUEUEABLE');
  const approval=await loadCurrentApproval(env,row.id);
  if(!approval||new Date(approval.expiresAt).getTime()<=Date.now())throw new Error('APPROVAL_EXPIRED');
  const policy=await loadPolicySnapshot(env,companyId,row.eventId,[
    String(outbox.requestedBy||''),row.authorId,row.recipientId,approval.approverId,
  ]);
  const effective=effectivePolicy(policy,Date.now());
  if(!effective.enabled)throw new Error('USE_CASE_DISABLED');
  if(!effective.channels.includes(row.channel as Channel))throw new Error('CHANNEL_DISABLED');
  if(!effective.languages.includes(row.language))throw new Error('LANGUAGE_DISABLED');
  if(policy.revision!==row.policyRevision)throw new Error('POLICY_CHANGED');
  const sourceRevision=await currentSourceRevision(env,row);
  if(!sourceRevision||String(sourceRevision)!==row.sourceRevision)throw new Error('SOURCE_CHANGED');

  if(approval.contentDigest!==await draftDigest(row))throw new Error('APPROVAL_INVALIDATED');
  const event=eventById(row.eventId);
  const approverLevel=await permissionLevel(env,approval.approverId,companyId,`communications.${event.module}.approve`);
  if(!levelAtLeast(approverLevel,'approve'))throw new Error('APPROVER_PERMISSION_REVOKED');
  const senderLevel=await permissionLevel(env,String(outbox.requestedBy||''),companyId,`communications.${event.module}.send`);
  if(!levelAtLeast(senderLevel,'create'))throw new Error('SEND_PERMISSION_REVOKED');

  const contact=await env.DB.prepare(`
    SELECT revision,normalized_value AS value FROM employee_verified_contacts
    WHERE employee_id=? AND company_id=? AND contact_type='phone' AND revoked_at IS NULL
      AND revision=? LIMIT 1
  `).bind(row.recipientId,companyId,Number(outbox.contactRevision||0)).first<{revision:number;value:string}>();
  if(row.channel==='whatsapp'&&!contact)throw new Error('RECIPIENT_CHANGED_OR_UNVERIFIED');

  const consent=await env.DB.prepare(`
    SELECT granted,revoked_at AS revokedAt FROM communication_consents
    WHERE employee_id=? AND company_id=? AND channel=? AND purpose=? LIMIT 1
  `).bind(row.recipientId,companyId,row.channel,row.eventId).first<{granted:number;revokedAt?:string}>();
  if(row.channel==='whatsapp'&&(!consent?.granted||consent.revokedAt))throw new Error('CONSENT_REVOKED');

  const template=await env.DB.prepare(`
    SELECT t.name,t.language,t.internal_status AS internalStatus,t.provider_status AS providerStatus,
      t.sender_connection_id AS senderConnectionId,c.status AS connectionStatus,b.company_id AS senderCompanyId
    FROM communication_templates t
    LEFT JOIN social_platform_connections c ON c.id=t.sender_connection_id
    LEFT JOIN social_brands b ON b.id=c.brand_id
    WHERE t.id=? AND t.company_id=? LIMIT 1
  `).bind(String(outbox.templateId||''),companyId).first<{
    name:string;language:string;internalStatus:string;providerStatus:string;
    senderConnectionId?:string;connectionStatus?:string;senderCompanyId?:string;
  }>();
  if(!template||template.internalStatus!=='approved')throw new Error('TEMPLATE_NOT_APPROVED');
  if(row.channel==='whatsapp'&&(
    template.providerStatus!=='approved'||template.connectionStatus!=='connected'||
    template.senderCompanyId!==companyId||!template.senderConnectionId
  ))throw new Error('SENDER_OR_TEMPLATE_NOT_READY');

  const quietConfig=await quietHoursConfig(env,companyId,row.eventId);
  if(quietHoursActive(quietConfig))throw new Error('QUIET_HOURS_ACTIVE');

  const leaseOwner=uid('comm-lease');
  const leased=await env.DB.prepare(`
    UPDATE communication_outbox
    SET status='sending',attempts=attempts+1,lease_owner=?,
      lease_expires_at=datetime('now','+60 seconds'),updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status IN ('queued','failed')
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now'))
      AND (lease_expires_at IS NULL OR datetime(lease_expires_at)<=datetime('now'))
      AND ambiguity_state<>'provider_unknown'
  `).bind(leaseOwner,outboxId).run();
  if(Number(leased.meta?.changes||0)!==1){
    return {status:'not_acquired'};
  }

  const capacityReserved=await reserveCapacity(env,{
    companyId,
    actorId:String(outbox.requestedBy||'')||undefined,
    type:'provider_send',
    eventId:row.eventId,
    sourceId:row.sourceId,
  });
  if(!capacityReserved){
    await env.DB.prepare(`
      UPDATE communication_outbox SET status='failed',last_error_code='PROVIDER_BUDGET_LIMIT',
        next_attempt_at=datetime('now','+60 minutes'),lease_owner=NULL,lease_expires_at=NULL,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND lease_owner=?
    `).bind(outboxId,leaseOwner).run();
    return {status:'failed',budgetLimited:true};
  }

  let result;
  try{
    result=await provider.send({
      outboxId,
      companyId,
      eventId:row.eventId,
      recipient:contact?.value||'',
      senderConnectionId:template.senderConnectionId||'',
      templateName:template.name,
      language:template.language,
      body:row.body,
      idempotencyKey:String(outbox.idempotencyKey||''),
    });
  }catch{
    result={accepted:false,ambiguous:true,errorCode:'PROVIDER_TRANSPORT_ERROR'};
  }

  if(result.accepted&&result.providerMessageId){
    await env.DB.prepare(`
      UPDATE communication_outbox SET status='accepted',provider_message_id=?,
        accepted_at=CURRENT_TIMESTAMP,last_provider_response_at=CURRENT_TIMESTAMP,
        ambiguity_state='clear',next_attempt_at=NULL,lease_owner=NULL,lease_expires_at=NULL,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND lease_owner=?
    `).bind(result.providerMessageId,outboxId,leaseOwner).run();
    return {status:'accepted',providerMessageId:result.providerMessageId};
  }
  if(result.ambiguous){
    await env.DB.prepare(`
      UPDATE communication_outbox SET status='failed',ambiguity_state='provider_unknown',
        last_error_code=?,next_attempt_at=NULL,lease_owner=NULL,lease_expires_at=NULL,
        last_provider_response_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND lease_owner=?
    `).bind(result.errorCode||'PROVIDER_UNKNOWN',outboxId,leaseOwner).run();
    return {status:'failed',ambiguous:true,awaitingReconciliation:true};
  }
  const delay=Math.min(60,Math.max(1,2**Math.min(6,Number(outbox.attempts||0))));
  await env.DB.prepare(`
    UPDATE communication_outbox SET status='failed',last_error_code=?,
      next_attempt_at=datetime('now',?),lease_owner=NULL,lease_expires_at=NULL,
      last_provider_response_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND lease_owner=?
  `).bind(result.errorCode||'PROVIDER_REJECTED',`+${delay} minutes`,outboxId,leaseOwner).run();
  return {status:'failed'};
}
