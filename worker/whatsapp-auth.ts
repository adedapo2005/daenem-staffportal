import type { AuthEnv } from './auth.js';
import { decryptSocialSecret, type SocialCryptoEnv } from './social-crypto.js';
import {
  authenticationPayload,
  type AuthenticationDelivery,
} from './communications/whatsapp.js';
import { checkBoundary, effectivePolicy } from './communications/policy.js';
import {
  communicationBoundary,
  communicationScope,
  loadPolicySnapshot,
  reserveCapacity,
} from './communications-repository.js';

export interface WhatsAppAuthEnv extends AuthEnv, SocialCryptoEnv {
  META_GRAPH_VERSION?: string;
}

export type WhatsAppAuthPurpose =
  | 'signup_phone'
  | 'signin_step_up'
  | 'password_reset';

export interface StartWhatsAppChallengeInput {
  purpose: WhatsAppAuthPurpose;
  companyId: string;
  employeeId?: string;
  signupVerificationId?: string;
  phone: string;
  contactRevision: number;
  contactAlreadyVerified: boolean;
  transactionContext?: Record<string, unknown>;
}

export interface VerifiedWhatsAppChallenge {
  id: string;
  purpose: WhatsAppAuthPurpose;
  companyId: string;
  employeeId?: string;
  signupVerificationId?: string;
  phone: string;
  contactRevision: number;
  transactionContext: Record<string, unknown>;
}

const encoder = new TextEncoder();
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

function normalizePhone(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `+234${digits.slice(1)}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (/^\+[1-9]\d{6,14}$/.test(raw)) return raw;
  return '';
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `WhatsApp ending in ${digits.slice(-4)}` : 'WhatsApp contact on file';
}

function pepper(env: WhatsAppAuthEnv) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function challengeHash(
  env: WhatsAppAuthEnv,
  purpose: WhatsAppAuthPurpose,
  challengeId: string,
  code: string,
) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return sha256(`whatsapp-auth:${purpose}:${challengeId}:${code}:${secret}`);
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function setting(env: WhatsAppAuthEnv, key: string, fallback: string) {
  const row = await env.DB.prepare(
    'SELECT setting_value AS value FROM app_settings WHERE setting_key=? LIMIT 1',
  ).bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

function requestIp(request: Request) {
  return request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;
}

async function security(
  env: WhatsAppAuthEnv,
  request: Request,
  eventType: string,
  employeeId?: string,
  companyId?: string,
  details?: Record<string, unknown>,
) {
  await env.DB.prepare(`
    INSERT INTO security_logs(
      id,employee_id,company_id,event_type,severity,result,
      ip_address,user_agent,details_json
    ) VALUES(?,?,?,?, 'info','recorded',?,?,?)
  `).bind(
    uid('security'),
    employeeId || null,
    companyId || null,
    eventType,
    requestIp(request),
    request.headers.get('user-agent'),
    details ? JSON.stringify(details) : null,
  ).run().catch(() => undefined);
}

const eventByPurpose: Record<WhatsAppAuthPurpose, string> = {
  signup_phone:'identity.signup_verification',
  signin_step_up:'identity.signin_verification',
  password_reset:'identity.recovery_verification',
};

async function loadAuthenticationTemplate(
  env: WhatsAppAuthEnv,
  companyId: string,
  eventId: string,
) {
  return env.DB.prepare(`
    SELECT t.id,t.name,t.language,t.sender_connection_id AS senderConnectionId,
      c.platform_account_id AS phoneNumberId,
      c.access_token_ciphertext AS accessTokenCiphertext,
      c.status AS connectionStatus,
      b.company_id AS senderCompanyId
    FROM communication_templates t
    JOIN social_platform_connections c
      ON c.id=t.sender_connection_id AND c.platform='whatsapp'
    JOIN social_brands b ON b.id=c.brand_id
    WHERE t.company_id=? AND t.event_id=? AND t.channel='whatsapp'
      AND t.category='authentication'
      AND t.internal_status='approved'
      AND t.provider_status='approved'
      AND b.company_id=?
    ORDER BY t.revision DESC
    LIMIT 1
  `).bind(companyId,eventId,companyId).first<{
    id:string;
    name:string;
    language:string;
    senderConnectionId:string;
    phoneNumberId:string;
    accessTokenCiphertext:string;
    connectionStatus:string;
    senderCompanyId:string;
  }>();
}

async function providerSend(
  env: WhatsAppAuthEnv,
  companyId: string,
  eventId: string,
  payload: Record<string, unknown>,
) {
  const liveEnabled = await setting(env, 'communications.whatsapp_live_send_enabled', 'false');
  if (liveEnabled !== 'true') {
    throw new Error('WHATSAPP_LIVE_SEND_DISABLED');
  }
  const template = await loadAuthenticationTemplate(env, companyId, eventId);
  if (!template ||
      template.connectionStatus !== 'connected' ||
      !template.phoneNumberId ||
      !template.accessTokenCiphertext) {
    throw new Error('WHATSAPP_AUTH_SENDER_NOT_READY');
  }
  const token = await decryptSocialSecret(env, template.accessTokenCiphertext);
  const graphVersion = String(env.META_GRAPH_VERSION || 'v24.0');
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(template.phoneNumberId)}/messages`,
    {
      method:'POST',
      headers:{
        authorization:`Bearer ${token}`,
        'content-type':'application/json',
      },
      body:JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    throw new Error(`WHATSAPP_PROVIDER_REJECTED_${response.status}`);
  }
  const result = await response.json() as Record<string, unknown>;
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const first = messages[0];
  return first && typeof first === 'object'
    ? String((first as Record<string, unknown>).id || '')
    : '';
}

export async function startWhatsAppChallenge(
  env: WhatsAppAuthEnv,
  request: Request,
  input: StartWhatsAppChallengeInput,
) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error('INVALID_WHATSAPP_PHONE');
  let contactAlreadyVerified = false;
  if (input.purpose === 'signup_phone') {
    if (!input.signupVerificationId) throw new Error('SIGNUP_TRANSACTION_REQUIRED');
    const signup = await env.DB.prepare(`
      SELECT phone,company_id AS companyId,phone_contact_revision AS contactRevision,
        consumed_at AS consumedAt,expires_at AS expiresAt
      FROM signup_verifications WHERE id=? LIMIT 1
    `).bind(input.signupVerificationId).first<{
      phone:string;companyId:string;contactRevision:number;consumedAt?:string;expiresAt:string;
    }>();
    if (!signup || signup.consumedAt || new Date(signup.expiresAt).getTime() <= Date.now() ||
        signup.companyId !== input.companyId || normalizePhone(signup.phone) !== phone ||
        Number(signup.contactRevision || 1) !== Number(input.contactRevision)) {
      throw new Error('SIGNUP_CONTACT_CHANGED_OR_EXPIRED');
    }
  } else {
    if (!input.employeeId) throw new Error('EMPLOYEE_REQUIRED');
    const verified = await env.DB.prepare(`
      SELECT id FROM employee_verified_contacts
      WHERE employee_id=? AND company_id=? AND contact_type='phone'
        AND normalized_value=? AND revision=? AND revoked_at IS NULL
      ORDER BY verified_at DESC LIMIT 1
    `).bind(input.employeeId,input.companyId,phone,input.contactRevision).first<{id:string}>();
    if (!verified) throw new Error('ENROLLED_CONTACT_REQUIRED');
    contactAlreadyVerified = true;
  }
  const resendSecondsRaw=Number(await setting(env,'communications.whatsapp_auth_resend_seconds','60'));
  const resendSeconds=Number.isFinite(resendSecondsRaw)
    ? Math.max(15,Math.min(600,Math.floor(resendSecondsRaw)))
    : 60;
  const recent=await env.DB.prepare(`
    SELECT id FROM whatsapp_auth_challenges
    WHERE purpose=? AND company_id=? AND normalized_phone=? AND consumed_at IS NULL
      AND datetime(expires_at)>datetime('now')
      AND datetime(created_at)>datetime('now',?)
    ORDER BY created_at DESC LIMIT 1
  `).bind(input.purpose,input.companyId,phone,`-${resendSeconds} seconds`).first<{id:string}>();
  if(recent)throw new Error('WHATSAPP_AUTH_RESEND_TOO_SOON');

  const eventId = eventByPurpose[input.purpose];
  const policy = await loadPolicySnapshot(env, input.companyId, eventId, input.employeeId ? [input.employeeId] : []);
  const boundary = await communicationBoundary(env, input.companyId);
  const capacityReserved = await reserveCapacity(env, {
    companyId:input.companyId,
    actorId:input.employeeId,
    type:'provider_send',
    eventId,
    sourceId:input.signupVerificationId || input.employeeId,
  });
  if (!capacityReserved) throw new Error('WHATSAPP_AUTH_RATE_OR_BUDGET_LIMIT');

  const template = await loadAuthenticationTemplate(env, input.companyId, eventId);
  if (!template) throw new Error('WHATSAPP_AUTH_TEMPLATE_NOT_READY');
  const challengeId = uid('wa-auth');
  const code = randomCode();
  const digest = await challengeHash(env,input.purpose,challengeId,code);
  const minutes = Number(await setting(env,'communications.whatsapp_auth_code_minutes','5')) || 5;
  const maxAttempts = Number(await setting(env,'communications.whatsapp_auth_max_attempts','6')) || 6;
  const expiresAtMs = Date.now() + Math.max(1,Math.min(15,minutes)) * 60_000;
  const payload = authenticationPayload({
    scope:communicationScope(input.companyId),
    purpose:input.purpose,
    challengeId,
    code,
    toE164:phone,
    contactRevision:String(input.contactRevision),
    currentContactRevision:String(input.contactRevision),
    contactAlreadyVerified,
    expiresAtMs,
    consumed:false,
    explicitChannelRequest:true,
    phishingResistantRequired:false,
    identityTransactionAuthorized:true,
    abuseAndBudgetCapacityReserved:true,
    template:{
      scope:communicationScope(input.companyId),
      name:template.name,
      language:template.language,
      category:'authentication',
      internallyApproved:true,
      providerApproved:true,
      enabled:true,
      allowedPurposes:[input.purpose],
    },
  } satisfies AuthenticationDelivery, policy, boundary, Date.now());

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE whatsapp_auth_challenges
      SET consumed_at=CURRENT_TIMESTAMP
      WHERE purpose=? AND company_id=? AND normalized_phone=? AND consumed_at IS NULL
        AND datetime(expires_at)>datetime('now')
    `).bind(input.purpose,input.companyId,phone),
    env.DB.prepare(`
      INSERT INTO whatsapp_auth_challenges(
        id,purpose,employee_id,signup_verification_id,company_id,
        normalized_phone,contact_revision,code_hash,attempts,max_attempts,
        transaction_context_json,requested_ip,requested_user_agent,expires_at
      ) VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?,?)
    `).bind(
      challengeId,input.purpose,input.employeeId || null,input.signupVerificationId || null,
      input.companyId,phone,input.contactRevision,digest,maxAttempts,
      input.transactionContext ? JSON.stringify(input.transactionContext) : null,
      requestIp(request),request.headers.get('user-agent'),
      new Date(expiresAtMs).toISOString(),
    ),
  ]);

  try {
    const providerMessageId = await providerSend(env,input.companyId,eventId,payload);
    await security(env,request,'whatsapp_auth_challenge_sent',input.employeeId,input.companyId,{
      purpose:input.purpose,
      challengeId,
      providerMessageId:providerMessageId || null,
    });
  } catch (error) {
    await env.DB.prepare('DELETE FROM whatsapp_auth_challenges WHERE id=?').bind(challengeId).run();
    throw error;
  }
  return {
    challengeId,
    destination:maskPhone(phone),
    expiresAt:new Date(expiresAtMs).toISOString(),
  };
}

export async function verifyWhatsAppChallenge(
  env: WhatsAppAuthEnv,
  request: Request,
  purpose: WhatsAppAuthPurpose,
  challengeId: string,
  submittedCode: string,
): Promise<VerifiedWhatsAppChallenge> {
  const code = submittedCode.replace(/\D/g,'').slice(0,6);
  if (!challengeId || code.length !== 6) throw new Error('INVALID_WHATSAPP_CODE');
  const row = await env.DB.prepare(`
    SELECT id,purpose,employee_id AS employeeId,
      signup_verification_id AS signupVerificationId,
      company_id AS companyId,normalized_phone AS phone,
      contact_revision AS contactRevision,code_hash AS codeHash,
      attempts,max_attempts AS maxAttempts,transaction_context_json AS transactionContextJson,
      expires_at AS expiresAt,consumed_at AS consumedAt
    FROM whatsapp_auth_challenges WHERE id=? AND purpose=? LIMIT 1
  `).bind(challengeId,purpose).first<{
    id:string;
    purpose:WhatsAppAuthPurpose;
    employeeId?:string;
    signupVerificationId?:string;
    companyId:string;
    phone:string;
    contactRevision:number;
    codeHash:string;
    attempts:number;
    maxAttempts:number;
    transactionContextJson?:string;
    expiresAt:string;
    consumedAt?:string;
  }>();
  if (!row || row.consumedAt ||
      new Date(row.expiresAt).getTime() <= Date.now()) {
    throw new Error('WHATSAPP_CHALLENGE_EXPIRED');
  }
  if (Number(row.attempts) >= Number(row.maxAttempts)) {
    throw new Error('WHATSAPP_CHALLENGE_ATTEMPTS_EXCEEDED');
  }
  const currentPolicy = await loadPolicySnapshot(env,row.companyId,eventByPurpose[purpose],row.employeeId ? [row.employeeId] : []);
  const currentBoundary = await communicationBoundary(env,row.companyId);
  checkBoundary(communicationScope(row.companyId),currentBoundary);
  const currentEffective = effectivePolicy(currentPolicy,Date.now());
  if (!currentEffective.enabled || !currentEffective.channels.includes('whatsapp')) {
    throw new Error('WHATSAPP_AUTH_DISABLED');
  }
  if (purpose === 'signup_phone') {
    const signup = await env.DB.prepare(`
      SELECT phone,phone_contact_revision AS contactRevision,consumed_at AS consumedAt,expires_at AS expiresAt
      FROM signup_verifications WHERE id=? AND company_id=? LIMIT 1
    `).bind(row.signupVerificationId || '',row.companyId).first<{
      phone:string;contactRevision:number;consumedAt?:string;expiresAt:string;
    }>();
    if (!signup || signup.consumedAt || new Date(signup.expiresAt).getTime() <= Date.now() ||
        normalizePhone(signup.phone) !== row.phone ||
        Number(signup.contactRevision || 1) !== Number(row.contactRevision)) {
      throw new Error('SIGNUP_CONTACT_CHANGED_OR_EXPIRED');
    }
  } else {
    const verified = await env.DB.prepare(`
      SELECT id FROM employee_verified_contacts
      WHERE employee_id=? AND company_id=? AND contact_type='phone'
        AND normalized_value=? AND revision=? AND revoked_at IS NULL
      ORDER BY verified_at DESC LIMIT 1
    `).bind(row.employeeId || '',row.companyId,row.phone,row.contactRevision).first<{id:string}>();
    if (!verified) throw new Error('ENROLLED_CONTACT_REQUIRED');
  }
  const supplied = await challengeHash(env,purpose,challengeId,code);
  if (!constantTimeEqual(supplied,row.codeHash)) {
    await env.DB.prepare(`
      UPDATE whatsapp_auth_challenges
      SET attempts=attempts+1
      WHERE id=? AND consumed_at IS NULL
    `).bind(challengeId).run();
    await security(env,request,'whatsapp_auth_challenge_failed',row.employeeId,row.companyId,{
      purpose,
      challengeId,
    });
    throw new Error('WHATSAPP_CODE_INCORRECT');
  }
  const consumed = await env.DB.prepare(`
    UPDATE whatsapp_auth_challenges
    SET consumed_at=CURRENT_TIMESTAMP
    WHERE id=? AND consumed_at IS NULL
      AND attempts<max_attempts
      AND datetime(expires_at)>datetime('now')
  `).bind(challengeId).run();
  if (Number(consumed.meta?.changes || 0) !== 1) {
    throw new Error('WHATSAPP_CHALLENGE_ALREADY_CONSUMED');
  }
  let transactionContext: Record<string, unknown> = {};
  if (row.transactionContextJson) {
    try {
      const parsed = JSON.parse(row.transactionContextJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        transactionContext = parsed as Record<string, unknown>;
      }
    } catch {
      transactionContext = {};
    }
  }
  await security(env,request,'whatsapp_auth_challenge_verified',row.employeeId,row.companyId,{
    purpose,
    challengeId,
  });
  return {
    id:row.id,
    purpose,
    companyId:row.companyId,
    employeeId:row.employeeId,
    signupVerificationId:row.signupVerificationId,
    phone:row.phone,
    contactRevision:Number(row.contactRevision || 1),
    transactionContext,
  };
}
