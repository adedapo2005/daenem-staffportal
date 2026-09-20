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
