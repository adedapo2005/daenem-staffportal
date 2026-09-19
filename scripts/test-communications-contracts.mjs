import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../.tmp-communications-test/worker/communications/index.js');
const {
  APPLICATION,
  CommunicationError,
  effectivePolicy,
  authorize,
  generateDraft,
  approveIntent,
  assertDispatchAllowed,
  authenticationPayload,
  verifyWebhookSignature,
  renderPlaceholders,
} = core;

const scope = {
  application: APPLICATION,
  organizationId: 'daenem-group',
  companyId: 'company-comm-test',
};

const allowRule = {
  enabled: true,
  aiEnabled: true,
  autoGenerate: true,
  autoSend: true,
  requireHumanApproval: false,
  channels: ['whatsapp','in_app'],
  languages: ['en'],
  maxCharacters: 1000,
};

function policy(eventId, overrides = {}) {
  return {
    scope,
    eventId,
    revision: 'r1',
    validUntilMs: Date.now() + 60_000,
    global: { ...allowRule },
    organization: { ...allowRule },
    module: { ...allowRule },
    useCase: { ...allowRule, ...overrides },
    restrictions: [],
  };
}

const boundary = {
  application: APPLICATION,
  targets: [{ organizationId:'daenem-group', companyId:'company-comm-test' }],
  killSwitch: false,
};

const authz = {
  hasPermission: () => true,
  canReadSource: () => true,
};

function context(eventId, actorId = 'employee-a') {
  return {
    scope,
    actorId,
    eventId,
    channel: 'whatsapp',
    language: 'en',
    sourceRecordId: 'record-1',
    sourceRevision: 'source-r1',
  };
}
test('deny wins across policy layers', () => {
  const p = policy('hr.onboarding.reminder');
  p.restrictions = [{ ...allowRule, enabled:false }];
  const effective = effectivePolicy(p,Date.now());
  assert.equal(effective.enabled,false);
});

test('environment boundary denies unlisted companies', () => {
  assert.throws(
    () => authorize(
      { ...context('hr.onboarding.reminder'), scope:{ ...scope, companyId:'company-other' } },
      'generate',
      policy('hr.onboarding.reminder'),
      boundary,
      authz,
      Date.now(),
    ),
    error => error instanceof CommunicationError && error.code === 'TARGET_NOT_ALLOWLISTED',
  );
});

test('AI is never allowed for authentication events', async () => {
  await assert.rejects(
    () => generateDraft({
      context:context('identity.signup_verification'),
      policy:policy('identity.signup_verification'),
      boundary,
      authorization:authz,
      style:{ version:'1',tone:'professional',instructions:'Use clear approved wording.',model:'mock' },
      operation:'generate',
      requestedPlaceholders:['code'],
      automaticGeneration:false,
      generationCapacityReserved:true,
      nowMs:Date.now(),
    }, { generate:async () => ({ body:'{{code}}' }) }),
    error => error instanceof CommunicationError && error.code === 'AI_NOT_ALLOWED',
  );
});

test('AI model sees placeholders rather than employee values', async () => {
  let captured;
  const result = await generateDraft({
    context:context('hr.onboarding.reminder'),
    policy:policy('hr.onboarding.reminder'),
    boundary,
    authorization:authz,
    style:{ version:'1',tone:'professional',instructions:'Keep it brief and respectful.',model:'mock' },
    operation:'generate',
    requestedPlaceholders:['first_name','organization_name','portal_link'],
    automaticGeneration:false,
    generationCapacityReserved:true,
    nowMs:Date.now(),
  }, {
    async generate(request) {
      captured = JSON.stringify(request);
      return { body:'Hello {{first_name}}, open {{portal_link}} for {{organization_name}}.' };
    },
  });
  assert.equal(result.status,'needs_human_review');
  assert.match(captured,/first_name/);
  assert.doesNotMatch(captured,/Alice|Daenem Group|staffportal\.daenem\.com/);
});

test('self approval is denied', async () => {
  const intent = {
    ...context('hr.leave.status_ready'),
    id:'intent-1',
    revision:1,
    authorId:'employee-a',
    recipientRef:'employee-b',
    recipientContactRevision:'1',
    senderRef:'sender-1',
    templateRef:'template-1',
    templateRevision:'1',
    templateCategory:'utility',
    policyRevision:'r1',
    body:'Decision available in the secure portal.',
    contentOrigin:'deterministic',
    expiresAtMs:Date.now() + 60_000,
  };
  await assert.rejects(
    () => approveIntent(intent,'employee-a',policy('hr.leave.status_ready'),boundary,authz,Date.now()),
    error => error instanceof CommunicationError && error.code === 'SELF_APPROVAL_DENIED',
  );
});

test('approval is invalidated when reviewed content changes', async () => {
  const base = {
    ...context('hr.leave.status_ready'),
    id:'intent-2',
    revision:1,
    authorId:'employee-a',
    recipientRef:'employee-b',
    recipientContactRevision:'1',
    senderRef:'sender-1',
    templateRef:'template-1',
    templateRevision:'1',
    templateCategory:'utility',
    policyRevision:'r1',
    body:'Decision available in the secure portal.',
    contentOrigin:'deterministic',
    expiresAtMs:Date.now() + 60_000,
  };
  const approval = await approveIntent(
    base,'employee-c',policy('hr.leave.status_ready'),boundary,authz,Date.now(),
  );
  const changed = { ...base, body:'Changed after approval.' };
  await assert.rejects(
    () => assertDispatchAllowed({
      intent:changed,
      policy:policy('hr.leave.status_ready'),
      boundary,
      authz,
      recipient:{
        scope,ref:'employee-b',contactRevision:'1',verified:true,active:true,
        optedInEventIds:['hr.leave.status_ready'],optedOut:false,
      },
      sender:{ scope,ref:'sender-1',active:true,allowedEventIds:['hr.leave.status_ready'] },
      template:{
        scope,ref:'template-1',revision:'1',language:'en',category:'utility',
        internallyApproved:true,providerApproved:true,enabled:true,
      },
      approval,mode:'manual',capacityReserved:true,inQuietHours:false,nowMs:Date.now(),
    }),
    error => error instanceof CommunicationError && error.code === 'APPROVAL_INVALIDATED',
  );
});

test('dispatch rechecks recipient consent', async () => {
  const intent = {
    ...context('hr.training.due'),
    id:'intent-3',revision:1,authorId:'employee-a',
    recipientRef:'employee-b',recipientContactRevision:'1',
    senderRef:'sender-1',templateRef:'template-1',templateRevision:'1',
    templateCategory:'utility',policyRevision:'r1',
    body:'Training reminder.',contentOrigin:'deterministic',
    expiresAtMs:Date.now() + 60_000,
  };
  await assert.rejects(
    () => assertDispatchAllowed({
      intent,policy:policy('hr.training.due'),boundary,authz,
      recipient:{
        scope,ref:'employee-b',contactRevision:'1',verified:true,active:true,
        optedInEventIds:[],optedOut:true,
      },
      sender:{ scope,ref:'sender-1',active:true,allowedEventIds:['hr.training.due'] },
      template:{
        scope,ref:'template-1',revision:'1',language:'en',category:'utility',
        internallyApproved:true,providerApproved:true,enabled:true,
      },
      mode:'manual',capacityReserved:true,inQuietHours:false,nowMs:Date.now(),
    }),
    error => error instanceof CommunicationError && error.code === 'CONSENT_REQUIRED',
  );
});

test('automatic sending refuses AI content', async () => {
  const p = policy('hr.training.due',{ requireHumanApproval:false });
  const intent = {
    ...context('hr.training.due'),
    id:'intent-4',revision:1,authorId:'employee-a',
    recipientRef:'employee-b',recipientContactRevision:'1',
    senderRef:'sender-1',templateRef:'template-1',templateRevision:'1',
    templateCategory:'utility',policyRevision:'r1',
    body:'Training reminder.',contentOrigin:'ai',
    expiresAtMs:Date.now() + 60_000,
  };
  await assert.rejects(
    () => assertDispatchAllowed({
      intent,policy:p,boundary,authz,
      recipient:{
        scope,ref:'employee-b',contactRevision:'1',verified:true,active:true,
        optedInEventIds:['hr.training.due'],optedOut:false,
      },
      sender:{ scope,ref:'sender-1',active:true,allowedEventIds:['hr.training.due'] },
      template:{
        scope,ref:'template-1',revision:'1',language:'en',category:'utility',
        internallyApproved:true,providerApproved:true,enabled:true,
      },
      mode:'automatic',capacityReserved:true,inQuietHours:false,nowMs:Date.now(),
    }),
    error => error instanceof CommunicationError && error.code === 'AI_OR_FREEFORM_AUTO_SEND_DENIED',
  );
});

test('authentication payload requires an approved authentication template', () => {
  assert.throws(
    () => authenticationPayload({
      scope,
      purpose:'signup_phone',
      challengeId:'challenge-1',
      code:'123456',
      toE164:'+15551234567',
      contactRevision:'1',
      currentContactRevision:'1',
      contactAlreadyVerified:false,
      expiresAtMs:Date.now() + 60_000,
      consumed:false,
      explicitChannelRequest:true,
      phishingResistantRequired:false,
      identityTransactionAuthorized:true,
      abuseAndBudgetCapacityReserved:true,
      template:{
        scope,name:'staff_signup',language:'en',category:'authentication',
        internallyApproved:true,providerApproved:false,enabled:true,
        allowedPurposes:['signup_phone'],
      },
    }, policy('identity.signup_verification'), boundary, Date.now()),
    error => error instanceof CommunicationError && error.code === 'AUTH_TEMPLATE_NOT_APPROVED',
  );
});

test('secure portal placeholders reject foreign links', () => {
  assert.throws(
    () => renderPlaceholders(
      'hr.onboarding.reminder',
      'Hello {{first_name}}, open {{portal_link}} for {{organization_name}}.',
      {
        first_name:'Ayo',
        portal_link:'https://example.com/phish',
        organization_name:'Daenem',
      },
      'https://staffportal.daenem.com',
    ),
    error => error instanceof CommunicationError && error.code === 'INVALID_PORTAL_LINK',
  );
});

test('webhook signature verification accepts only matching HMAC', async () => {
  const raw = new TextEncoder().encode('{"object":"whatsapp_business_account"}');
  const key = await crypto.subtle.importKey(
    'raw',new TextEncoder().encode('test-secret'),
    { name:'HMAC',hash:'SHA-256' },false,['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC',key,raw);
  const hex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2,'0')).join('');
  assert.equal(await verifyWebhookSignature(raw,`sha256=${hex}`,'test-secret'),true);
  assert.equal(await verifyWebhookSignature(raw,`sha256=${'0'.repeat(64)}`,'test-secret'),false);
});
