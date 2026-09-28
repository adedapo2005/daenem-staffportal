import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root=process.cwd();
const dispatch=await import(pathToFileURL(path.join(root,'.tmp-communications-remediation','worker','communications-dispatch.js')));
const webhook=await import(pathToFileURL(path.join(root,'.tmp-communications-remediation','worker','communications-webhook.js')));

test('retry scheduling blocks future attempts and permits due attempts',()=>{
  const now=Date.parse('2026-09-19T20:00:00Z');
  assert.equal(dispatch.retryDue('2026-09-19T20:01:00Z',now),false);
  assert.equal(dispatch.retryDue('2026-09-19T19:59:00Z',now),true);
  assert.equal(dispatch.retryDue(null,now),true);
});

test('quiet hours handle daytime and overnight windows',()=>{
  const daytime={start:'09:00',end:'17:00',timezoneOffsetMinutes:0};
  assert.equal(dispatch.quietHoursActive(daytime,new Date('2026-09-19T12:00:00Z')),true);
  assert.equal(dispatch.quietHoursActive(daytime,new Date('2026-09-19T18:00:00Z')),false);
  const overnight={start:'22:00',end:'07:00',timezoneOffsetMinutes:0};
  assert.equal(dispatch.quietHoursActive(overnight,new Date('2026-09-19T23:00:00Z')),true);
  assert.equal(dispatch.quietHoursActive(overnight,new Date('2026-09-19T08:00:00Z')),false);
});

test('invalid provider timestamps are ignored without aborting webhook processing',()=>{
  assert.equal(webhook.providerTimestamp('1790000000'),'2026-09-21T14:13:20.000Z');
  assert.equal(webhook.providerTimestamp('not-a-time'),null);
  assert.equal(webhook.providerTimestamp('9999999999999'),null);
  assert.equal(webhook.providerTimestamp(''),null);
});

test('webhook delivery states advance monotonically',()=>{
  assert.equal(webhook.canAdvanceDeliveryStatus('accepted','delivered'),true);
  assert.equal(webhook.canAdvanceDeliveryStatus('accepted','read'),true);
  assert.equal(webhook.canAdvanceDeliveryStatus('delivered','read'),true);
  assert.equal(webhook.canAdvanceDeliveryStatus('read','delivered'),false);
  assert.equal(webhook.canAdvanceDeliveryStatus('read','accepted'),false);
});

test('failed delivery is terminal for later delivery callbacks',()=>{
  assert.equal(webhook.canAdvanceDeliveryStatus('accepted','failed'),true);
  assert.equal(webhook.canAdvanceDeliveryStatus('delivered','failed'),true);
  assert.equal(webhook.canAdvanceDeliveryStatus('failed','delivered'),false);
  assert.equal(webhook.canAdvanceDeliveryStatus('failed','read'),false);
});

test('dispatcher source contains atomic lease and due-time gates',async()=>{
  const source=await readFile(path.join(root,'worker','communications-dispatch.ts'),'utf8');
  assert.match(source,/lease_owner=\?/);
  assert.match(source,/lease_expires_at=datetime\('now','\+60 seconds'\)/);
  assert.match(source,/next_attempt_at IS NULL OR datetime\(next_attempt_at\)<=datetime\('now'\)/);
  assert.match(source,/Number\(leased\.meta\?\.changes\|\|0\)!==1/);
});

test('terminal outbox writes compare-and-set the observed retryable state',async()=>{
  const source=await readFile(path.join(root,'worker','communications-dispatch.ts'),'utf8');
  const expiry=source.slice(source.indexOf("const expired=await env.DB.prepare"),source.indexOf("if(Number(expired.meta"));
  assert.match(expiry,/WHERE id=\? AND status IN \('queued','failed'\)/);
  assert.match(expiry,/datetime\(expires_at\)<=datetime\('now'\)/);
  assert.match(expiry,/datetime\(lease_expires_at\)<=datetime\('now'\)/);
  assert.match(source,/if\(Number\(expired\.meta\?\.changes\|\|0\)!==1\)return \{status:'not_acquired'\}/);
  const terminal=source.slice(source.indexOf("const terminal=await env.DB.prepare"),source.indexOf("if(Number(terminal.meta"));
  assert.match(terminal,/WHERE id=\? AND status IN \('queued','failed'\) AND attempts>=max_attempts/);
  assert.match(terminal,/datetime\(next_attempt_at\)<=datetime\('now'\)/);
  assert.match(terminal,/datetime\(lease_expires_at\)<=datetime\('now'\)/);
  assert.match(source,/if\(Number\(terminal\.meta\?\.changes\|\|0\)!==1\)return \{status:'not_acquired'\}/);
});

test('ambiguous provider outcomes require reconciliation instead of automatic retry',async()=>{
  const source=await readFile(path.join(root,'worker','communications-dispatch.ts'),'utf8');
  assert.match(source,/ambiguity_state='provider_unknown'/);
  assert.match(source,/next_attempt_at=NULL/);
  assert.match(source,/awaitingReconciliation:true/);
});

test('WhatsApp auth applies resend cooldown and supersedes prior active challenges',async()=>{
  const source=await readFile(path.join(root,'worker','whatsapp-auth.ts'),'utf8');
  assert.match(source,/communications\.whatsapp_auth_resend_seconds/);
  assert.match(source,/WHATSAPP_AUTH_RESEND_TOO_SOON/);
  assert.match(source,/UPDATE whatsapp_auth_challenges[\s\S]*SET consumed_at=CURRENT_TIMESTAMP/);
});

test('policy revision fingerprints applicable role and employee restrictions',async()=>{
  const source=await readFile(path.join(root,'worker','communications-repository.ts'),'utf8');
  assert.match(source,/restrictionFingerprint/);
  assert.match(source,/:restr:\$\{restrictionRevision\}/);
  assert.match(source,/ORDER BY subject_type,subject_id/);
});


test('queue idempotency returns the persisted outbox identity',async()=>{
  const source=await readFile(path.join(root,'worker','communications-dispatch.ts'),'utf8');
  assert.match(source,/SELECT id,status FROM communication_outbox WHERE idempotency_key=\?/);
  assert.match(source,/return \{id:persisted\.id,idempotencyKey,status:persisted\.status\}/);
});

test('dispatch evaluates effective deny-wins policy and provider budget',async()=>{
  const source=await readFile(path.join(root,'worker','communications-dispatch.ts'),'utf8');
  assert.match(source,/const effective=effectivePolicy\(policy,Date\.now\(\)\)/);
  assert.match(source,/effective\.channels\.includes/);
  assert.match(source,/effective\.languages\.includes/);
  assert.match(source,/type:'provider_send'/);
  assert.match(source,/QUIET_HOURS_ACTIVE/);
});

test('shared inbox routing is one-way, permission-gated, sender-scoped and audited',async()=>{
  const source=await readFile(path.join(root,'worker','communications-inbox.ts'),'utf8');
  assert.match(source,/routingMode\|\|''\)!=='shared_group'/);
  assert.match(source,/Conversation is already routed/);
  assert.match(source,/can\(context,targetCompanyId,'communications\.support\.inbox\.assign','edit'\)/);
  assert.match(source,/communication_whatsapp_sender_companies WHERE sender_id=\? AND company_id=\? AND enabled=1/);
  assert.match(source,/WHERE id=\? AND company_id IS NULL/);
  assert.match(source,/const \[routed,audited\]=await env\.DB\.batch/);
  assert.match(source,/routeAuditStatement\(env,context,id,targetCompanyId,senderId,auditId,routeAt\)/);
});

test('WhatsApp reply policy derives the customer service window and keeps live send disabled',async()=>{
  const inbox=await readFile(path.join(root,'worker','communications-inbox.ts'),'utf8');
  const webhookSource=await readFile(path.join(root,'worker','communications-webhook.ts'),'utf8');
  const migration=await readFile(path.join(root,'migrations','0067_whatsapp_reply_state.sql'),'utf8');
  assert.match(inbox,/WHATSAPP_SERVICE_WINDOW_MS=24\*60\*60\*1000/);
  assert.match(inbox,/composerState=!item\.companyId\?'routing_required':serviceWindowState==='open'\?'send_ready':'template_required'/);
  assert.match(inbox,/liveSend:false/);
  assert.match(inbox,/Route this shared conversation to a company before drafting a reply/);
  assert.match(webhookSource,/last_customer_message_at=COALESCE\(\?,CURRENT_TIMESTAMP\)/);
  assert.match(migration,/ADD COLUMN last_customer_message_at TEXT/);
});

test('WhatsApp template drafts require approved company templates and never live-send',async()=>{
  const inbox=await readFile(path.join(root,'worker','communications-inbox.ts'),'utf8');
  const migration=await readFile(path.join(root,'migrations','0068_whatsapp_template_drafts.sql'),'utf8');
  assert.match(inbox,/internal_status='approved' AND provider_status='approved'/);
  assert.match(inbox,/An approved WhatsApp template is required outside the customer service window/);
  assert.match(inbox,/Selected WhatsApp template is not approved for this company/);
  assert.match(inbox,/reply_mode,template_id,template_name,template_language,template_category/);
  assert.match(inbox,/replyMode:'template',templateId,sendReady:true,liveSend:false/);
  assert.match(migration,/ADD COLUMN template_id TEXT REFERENCES communication_templates/);
  assert.match(migration,/reply_mode TEXT NOT NULL DEFAULT 'freeform'/);
});

test('WhatsApp outbound adapter is idempotent, scoped, audited and double-gated',async()=>{
  const adapter=await readFile(path.join(root,'worker','communications-whatsapp-outbound.ts'),'utf8');
  const inbox=await readFile(path.join(root,'worker','communications-inbox.ts'),'utf8');
  const migration=await readFile(path.join(root,'migrations','0069_whatsapp_outbound_adapter.sql'),'utf8');
  assert.match(adapter,/wa-inbox:\$\{row\.companyId\}:\$\{row\.messageId\}:v1/);
  assert.match(adapter,/communications\.whatsapp_live_send/);
  assert.match(adapter,/COMMUNICATIONS_WHATSAPP_LIVE_SEND/);
  assert.match(adapter,/META_SYSTEM_USER_TOKEN_MISSING/);
  assert.match(adapter,/WHATSAPP_TEMPLATE_REQUIRED/);
  assert.match(adapter,/WHATSAPP_TEMPLATE_NOT_APPROVED/);
  assert.match(adapter,/communication_template_mappings/);
  assert.match(adapter,/m\.enabled=1 AND m\.status='approved'/);
  assert.match(adapter,/WHATSAPP_TEMPLATE_MAPPING_NOT_READY/);
  assert.match(adapter,/resolveInboxTemplateComponents\(env,row\)/);
  assert.match(adapter,/PROVIDER_TRANSPORT_AMBIGUOUS/);
  assert.match(inbox,/'prepare_send'/);
  assert.match(inbox,/prepare-send/);
  assert.match(migration,/UNIQUE INDEX IF NOT EXISTS uq_comm_inbox_message_idempotency/);
  assert.match(migration,/communications\.whatsapp_live_send','false'/);
});

test('WhatsApp outbound transport atomically claims one provider send',async()=>{
  const adapter=await readFile(path.join(root,'worker','communications-whatsapp-outbound.ts'),'utf8');
  assert.match(adapter,/SET status='sending',send_requested_at=COALESCE/);
  assert.match(adapter,/WHERE id=\? AND status='draft' AND idempotency_key=\?/);
  assert.match(adapter,/Number\(claim\.meta\?\.changes\|\|0\)!==1/);
  assert.match(adapter,/SEND_ALREADY_CLAIMED/);
  assert.equal((adapter.match(/WHERE id=\? AND status='sending'/g)||[]).length,3);
});

test('WhatsApp inbox send handoff stays gated, scoped and audited',async()=>{
  const inbox=await readFile(path.join(root,'worker','communications-inbox.ts'),'utf8');
  assert.match(inbox,/sendWhatsAppInboxMessage/);
  assert.match(inbox,/messages\\\/\(\[\^\/\]\+\)\\\/send/);
  assert.match(inbox,/'communications','send_attempt','communication_inbox_message'/);
  assert.match(inbox,/Conversation must be routed to this company first/);
  assert.match(inbox,/result\.blocked/);
  assert.match(inbox,/PROVIDER_TRANSPORT_AMBIGUOUS/);
});

test('Inbox send-readiness UI uses guarded prepare and send handoffs',async()=>{
  const ui=await readFile(path.join(root,'src','communications-inbox-entry.tsx'),'utf8');
  assert.match(ui,/\/prepare-send/);
  assert.match(ui,/\/send`/);
  assert.match(ui,/Check readiness/);
  assert.match(ui,/Send to WhatsApp/);
  assert.match(ui,/Provider send release-gated/);
  assert.match(ui,/META_SYSTEM_USER_TOKEN_MISSING/);
  assert.match(ui,/!currentReadiness\?\.ready\|\|!currentReadiness\.liveSend/);
});

test('Webhook status updates are bound to the resolved canonical sender',async()=>{
  const source=await readFile(path.join(root,'worker','communications-webhook.ts'),'utf8');
  assert.match(source,/JOIN communication_inbox_conversations c ON c\.id=m\.conversation_id/);
  assert.match(source,/m\.provider_message_id=\? AND c\.sender_id=\?/);
  assert.match(source,/c\.id=communication_inbox_messages\.conversation_id AND c\.sender_id=\?/);
  assert.match(source,/applyStatuses\(env,mapping,values\)/);
});

test('Webhook rejects any value without canonical sender metadata',async()=>{
  const source=await readFile(path.join(root,'worker','communications-webhook.ts'),'utf8');
  assert.match(source,/if\(!phoneNumberId\)return json\(\{error:'Communications sender mapping is required\.'\},403\)/);
  assert.doesNotMatch(source,/if\(!phoneNumberId\)continue/);
});

test('Webhook processing failures are durably claimable and provider-retryable',async()=>{
  const source=await readFile(path.join(root,'worker','communications-webhook.ts'),'utf8');
  assert.match(source,/processing_status AS processingStatus,last_error_code AS lastErrorCode/);
  assert.match(source,/SET processing_status='received',last_error_code='PROCESSING_IN_PROGRESS'/);
  assert.match(source,/processing_status IN \('received','failed'\)/);
  assert.match(source,/Number\(processingClaim\.meta\?\.changes\|\|0\)!==1/);
  assert.match(source,/processing_status='processed',processed_at=CURRENT_TIMESTAMP,last_error_code=NULL/);
  assert.match(source,/WHERE id=\? AND last_error_code='PROCESSING_IN_PROGRESS'/);
  assert.match(source,/return json\(\{ received:false,processingDeferred:true \},503\)/);
  assert.doesNotMatch(source,/return 200 so Meta does not create an uncontrolled retry storm/);
});

test('AI draft requests normalize language and use exact-language approved profiles',async()=>{
  const service=await readFile(path.join(root,'worker','communications-service.ts'),'utf8');
  assert.match(service,/function normalizeLanguageTag/);
  assert.match(service,/WHERE company_id=\? AND module='hr' AND language=\? AND active=1/);
  assert.match(service,/instructionProfile\(env, companyId, language\)/);
  assert.match(service,/language,\s*sourceRecordId/);
});

test('AI provider failures remain neutral, retryable and do not create a draft',async()=>{
  const drafts=await readFile(path.join(root,'worker','communications','drafts.ts'),'utf8');
  const service=await readFile(path.join(root,'worker','communications-service.ts'),'utf8');
  assert.match(drafts,/throw new CommunicationError\('AI_PROVIDER_UNAVAILABLE'\)/);
  assert.match(service,/code === 'AI_PROVIDER_UNAVAILABLE' \? 503 : 409/);
  assert.ok(service.indexOf("code === 'AI_PROVIDER_UNAVAILABLE' ? 503 : 409") < service.indexOf('INSERT INTO communication_drafts'));
});

test('Communications governance requires module-specific authority and neutralizes unknown events',async()=>{
  const governance=await readFile(path.join(root,'worker','communications-governance.ts'),'utf8');
  const service=await readFile(path.join(root,'worker','communications-service.ts'),'utf8');
  assert.match(governance,/try\{\s*const event=eventById\(eventId\)/);
  assert.doesNotMatch(governance,/can\(context,companyId,'settings\.access'/);
  assert.match(service,/function managedEvent/);
  assert.doesNotMatch(service,/!can\(context, companyId, 'settings\.access', 'view'\)/);
});

test('Communications administrative projections are bounded and language-scoped',async()=>{
  const governance=await readFile(path.join(root,'worker','communications-governance.ts'),'utf8');
  assert.ok((governance.match(/LIMIT 200/g)||[]).length>=4);
  assert.match(governance,/SELECT id,module,version,tone,language,instructions,model,active/);
  assert.match(governance,/SET active=0[\s\S]*company_id=\? AND module=\? AND language=\?/);
  assert.match(governance,/companyId,event\.module,row\.language/);
});

test('Draft approval is compare-and-set and creates one current approval',async()=>{
  const service=await readFile(path.join(root,'worker','communications-service.ts'),'utf8');
  assert.match(service,/INSERT INTO communication_approvals[\s\S]*WHERE EXISTS\([\s\S]*status='pending_approval'/);
  assert.match(service,/WHERE id=\? AND company_id=\? AND status='pending_approval'[\s\S]*communication_approvals/);
  assert.match(service,/approvalCreated\.meta\?\.changes[\s\S]*draftApproved\.meta\?\.changes/);
});

test('Draft queue persistence and state transition share one atomic batch',async()=>{
  const dispatch=await readFile(path.join(root,'worker','communications-dispatch.ts'),'utf8');
  assert.match(dispatch,/await env\.DB\.batch\(\[[\s\S]*INSERT OR IGNORE INTO communication_outbox[\s\S]*UPDATE communication_drafts/);
  assert.match(dispatch,/WHERE id=\? AND company_id=\? AND status='approved'/);
  assert.match(dispatch,/idempotency_key=\? AND company_id=\? AND draft_id=\?/);
  assert.match(dispatch,/DRAFT_QUEUE_CONFLICT/);
});

test('Governance version allocation occurs inside the insert statement',async()=>{
  const governance=await readFile(path.join(root,'worker','communications-governance.ts'),'utf8');
  assert.match(governance,/INSERT INTO communication_templates[\s\S]*COALESCE\(MAX\(revision\),0\)\+1/);
  assert.match(governance,/INSERT INTO communication_instruction_profiles[\s\S]*COALESCE\(MAX\(version\),0\)\+1/);
  assert.doesNotMatch(governance,/const current=await env\.DB\.prepare\([\s\S]{0,200}MAX\((revision|version)\)/);
});

test('Template approval uses a stale-write guard',async()=>{
  const governance=await readFile(path.join(root,'worker','communications-governance.ts'),'utf8');
  assert.match(governance,/internal_status='draft' AND approved_by IS NULL/);
  assert.match(governance,/approved\.meta\?\.changes[\s\S]*already reviewed or changed/);
});

test('Instruction activation is claimed once and database-enforced per language',async()=>{
  const governance=await readFile(path.join(root,'worker','communications-governance.ts'),'utf8');
  const migration=await readFile(path.join(root,'migrations','0074_communications_governance_concurrency.sql'),'utf8');
  assert.match(governance,/SET approved_by=\?[\s\S]*active=0 AND approved_by IS NULL/);
  assert.match(governance,/const \[claimed,,activated,audited\]=await env\.DB\.batch/);
  assert.match(governance,/claimed\.meta\?\.changes[\s\S]*activated\.meta\?\.changes[\s\S]*audited\.meta\?\.changes/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*company_id,module,language[\s\S]*WHERE active=1/);
});

test('Governance upserts atomically audit the canonical persisted identity',async()=>{
  const governance=await readFile(path.join(root,'worker','communications-governance.ts'),'utf8');
  assert.equal((governance.match(/const \[saved,audited\]=await env\.DB\.batch\(\[/g)||[]).length,3);
  assert.match(governance,/upsert_restriction[\s\S]*FROM communication_policy_restrictions[\s\S]*company_id=\? AND event_id=\? AND subject_type=\? AND subject_id=\?/);
  assert.match(governance,/upsert_trigger[\s\S]*FROM communication_trigger_rules[\s\S]*company_id=\? AND event_id=\? AND trigger_code=\?/);
  assert.equal((governance.match(/saved\.meta\?\.changes[\s\S]{0,80}audited\.meta\?\.changes/g)||[]).length,3);
  assert.doesNotMatch(governance,/await audit\(env,context,companyId,'upsert_(restriction|trigger)'/);
});

test('Template and instruction governance writes persist audit evidence atomically',async()=>{
  const governance=await readFile(path.join(root,'worker','communications-governance.ts'),'utf8');
  assert.equal((governance.match(/const \[created,audited\]=await env\.DB\.batch\(\[/g)||[]).length,3);
  assert.match(governance,/const \[approved,audited\]=await env\.DB\.batch\(\[/);
  assert.match(governance,/const \[claimed,,activated,audited\]=await env\.DB\.batch\(\[/);
  assert.equal((governance.match(/changes\(\)=1/g)||[]).length,4);
  assert.doesNotMatch(governance,/async function audit\(/);
  assert.doesNotMatch(governance,/await audit\(/);
});

test('Draft queue authorization precedes lookup and readiness failures are neutral',async()=>{
  const service=await readFile(path.join(root,'worker','communications-service.ts'),'utf8');
  const normalizedService=service.replaceAll('\r\n','\n');
  const start=normalizedService.indexOf('async function queueDraftForDelivery');
  const end=normalizedService.indexOf('\n}\n\nexport async function routeCommunications',start)+2;
  const queue=normalizedService.slice(start,end);
  assert.ok(queue.indexOf("communicationPermission(context,companyId,'hr','send','create')")<queue.indexOf('queueApprovedDraft(env'));
  assert.match(queue,/Send HR Communications permission is required\./);
  assert.match(queue,/catch\{[\s\S]*Draft is not ready for delivery\./);
  assert.doesNotMatch(queue,/mapCommunicationError/);
});

test('Meta credential vault is encrypted, masked, owner-managed and runtime-resolved',async()=>{
  const vault=await readFile(path.join(root,'worker','meta-credentials.ts'),'utf8');
  const service=await readFile(path.join(root,'worker','communications-service.ts'),'utf8');
  const webhook=await readFile(path.join(root,'worker','communications-webhook.ts'),'utf8');
  const outbound=await readFile(path.join(root,'worker','communications-whatsapp-outbound.ts'),'utf8');
  const oauth=await readFile(path.join(root,'worker','social-oauth.ts'),'utf8');
  const whatsappAuth=await readFile(path.join(root,'worker','whatsapp-auth.ts'),'utf8');
  const ui=await readFile(path.join(root,'src','communications-admin-entry.tsx'),'utf8');
  const migration=await readFile(path.join(root,'migrations','0070_meta_credentials_vault.sql'),'utf8');
  assert.match(vault,/encryptSocialSecret/);
  assert.match(vault,/decryptSocialSecret/);
  assert.match(vault,/SELECT credential_key AS key,updated_at AS updatedAt FROM meta_credentials_vault/);
  assert.doesNotMatch(vault,/SELECT credential_key AS key,ciphertext/);
  assert.match(service,/Group Owner or Group Admin access is required/);
  assert.match(service,/update_meta_credential/);
  assert.match(service,/delete_meta_credential/);
  assert.match(webhook,/resolveMetaCredential\(env,'meta_app_secret'\)/);
  assert.match(webhook,/resolveMetaCredential\(env,'communications_webhook_verify_token'\)/);
  assert.match(outbound,/resolveMetaCredential\(env,'meta_system_user_token'\)/);
  assert.match(oauth,/withResolvedMetaCredentials/);
  assert.match(oauth,/This brand is outside the Staff Portal provider scope/);
  assert.match(whatsappAuth,/resolveMetaCredential\(env,'meta_graph_version'\)/);
  assert.match(ui,/How To Get This Credential/);
  assert.match(ui,/type=\{item\.secret\?'password':'text'\}/);
  assert.match(ui,/Saved values are encrypted server-side and are never returned to this browser/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS meta_credentials_vault/);
});


test('Outbox administration is company/use-case authorized with a bounded projection',async()=>{
  const source=await readFile(path.join(root,'worker','communications-outbox-admin.ts'),'utf8');
  const service=await readFile(path.join(root,'worker','communications-service.ts'),'utf8');
  const list=source.slice(source.indexOf('async function listOutbox'),source.indexOf('type AdminAction'));
  assert.ok(list.indexOf('companyAllowed(context,companyId)')<list.indexOf('env.DB.prepare'));
  assert.ok(list.indexOf("canManageEvent(context,companyId,eventId,'view')")<list.indexOf('env.DB.prepare'));
  assert.match(list,/Math\.min\(100,requested\)/);
  assert.match(list,/WHERE company_id=\? AND event_id=\?/);
  assert.match(list,/LIMIT \?/);
  assert.doesNotMatch(list,/employee_id AS/);
  assert.doesNotMatch(list,/provider_message_id AS/);
  assert.match(service,/routeCommunicationOutboxAdmin/);
});

test('Outbox reconciliation requires manage authority and atomically records audit evidence',async()=>{
  const source=await readFile(path.join(root,'worker','communications-outbox-admin.ts'),'utf8');
  const apply=source.slice(source.indexOf('async function applyOutboxAction'),source.indexOf('export async function routeCommunicationOutboxAdmin'));
  assert.ok(apply.indexOf("canManageEvent(context,companyId,eventId,'manage')")<apply.indexOf('env.DB.batch'));
  assert.match(apply,/const \[audited,updated\]=await env\.DB\.batch/);
  assert.match(apply,/actionAudit\(env,input\)[\s\S]*actionUpdate\(env,input\)/);
  assert.match(source,/FROM audit_logs a[\s\S]*a\.id=\?/);
  assert.match(source,/status='failed' AND ambiguity_state='provider_unknown'/);
  assert.match(source,/audited\.meta\?\.changes[\s\S]*updated\.meta\?\.changes/);
});

test('Outbox actions remain fail-closed, neutral and never invoke provider delivery',async()=>{
  const source=await readFile(path.join(root,'worker','communications-outbox-admin.ts'),'utf8');
  assert.match(source,/Outbox action could not be applied\./);
  assert.doesNotMatch(source,/OUTBOX_NOT_FOUND/);
  assert.match(source,/ambiguity_state<>'provider_unknown'/);
  assert.match(source,/provider_not_sent/);
  assert.match(source,/provider_accepted/);
  assert.doesNotMatch(source,/provider\.send|dispatchCommunicationOutboxItem/);
});


test('Communications dispatch scheduler is release-gated and provider-explicit',async()=>{
  const source=await readFile(path.join(root,'worker','communications-dispatch-orchestrator.ts'),'utf8');
  const runtime=await readFile(path.join(root,'worker','runtime.ts'),'utf8');
  assert.ok(source.indexOf('communicationsDispatchReleaseState(env)')<source.indexOf('communication_outbox'));
  assert.ok(source.indexOf("if (!options.provider) return emptySummary('provider_adapter_unavailable')")<source.indexOf('communication_outbox'));
  assert.match(source,/COMMUNICATIONS_WHATSAPP_LIVE_SEND/);
  assert.match(source,/communications\.kill_switch/);
  assert.match(source,/communications\.whatsapp_live_send/);
  assert.match(source,/resolveMetaCredential\(env, 'meta_system_user_token'\)/);
  assert.match(runtime,/dispatchDueCommunications\(env\)/);
  assert.doesNotMatch(runtime,/dispatchDueCommunications\(env,\s*\{[\s\S]{0,120}provider/);
});

test('Communications dispatch discovery is bounded, due-only and ambiguity-safe',async()=>{
  const source=await readFile(path.join(root,'worker','communications-dispatch-orchestrator.ts'),'utf8');
  assert.match(source,/Math\.max\(1, Math\.min\(25,/);
  assert.match(source,/status IN \('queued','failed'\)/);
  assert.match(source,/COALESCE\(ambiguity_state,'clear'\)<>'provider_unknown'/);
  assert.match(source,/datetime\(next_attempt_at\)<=datetime\('now'\)/);
  assert.match(source,/datetime\(lease_expires_at\)<=datetime\('now'\)/);
  assert.match(source,/datetime\(expires_at\)>datetime\('now'\)/);
  assert.match(source,/ORDER BY priority DESC,created_at ASC[\s\S]*LIMIT \?/);
  assert.doesNotMatch(source,/fetch\(|graph\.facebook\.com/);
});
