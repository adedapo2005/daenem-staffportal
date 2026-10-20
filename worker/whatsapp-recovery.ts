import type { AuthEnv } from './auth.js';
import type { SocialCryptoEnv } from './social-crypto.js';
import { startWhatsAppChallenge, verifyWhatsAppChallenge } from './whatsapp-auth.js';
import { RECOVERY_SETTING_KEY, recoveryMethods, resolveScopedSetting, type RecoveryMethodPolicy } from './scoped-settings.js';
import { resolveRecoveryCompanyForIdentifier } from './recovery-company-resolution.js';

export interface WhatsAppRecoveryEnv extends AuthEnv, SocialCryptoEnv {
  META_GRAPH_VERSION?: string;
}

const encoder = new TextEncoder();
const uid = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  });
}

function randomToken(bytes = 32) {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  let value = '';
  for (const byte of raw) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256',encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

function pepper(env: WhatsAppRecoveryEnv) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}

async function resetTokenHash(env: WhatsAppRecoveryEnv, token: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return sha256(`password-reset:${token}:${secret}`);
}

function requestIp(request: Request) {
  return request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;
}

async function setting(env: WhatsAppRecoveryEnv, key:string, fallback:string) {
  const row = await env.DB.prepare(
    'SELECT setting_value AS value FROM app_settings WHERE setting_key=? LIMIT 1',
  ).bind(key).first<{value:string}>();
  return row?.value ?? fallback;
}
async function security(
  env: WhatsAppRecoveryEnv,
  request: Request,
  eventType: string,
  employeeId?: string,
  companyId?: string,
  details?: Record<string, unknown>,
) {
  await env.DB.prepare(`
    INSERT INTO security_logs(
      id,employee_id,company_id,event_type,severity,result,ip_address,user_agent,details_json
    ) VALUES(?,?,?,?, 'info','recorded',?,?,?)
  `).bind(
    uid('security'),employeeId || null,companyId || null,eventType,
    requestIp(request),request.headers.get('user-agent'),
    details ? JSON.stringify(details) : null,
  ).run().catch(() => undefined);
}

export async function startPasswordRecoveryWhatsApp(
  request: Request,
  env: WhatsAppRecoveryEnv,
) {
  let body: { identifier?:string; companyCode?:string };
  try { body = await request.json(); }
  catch { return json({ error:'Invalid request body.' }, 400); }
  const identifier = String(body.identifier || '').trim().toLowerCase();
  const companyCode = String(body.companyCode || '').trim();
  if (!identifier) return json({ error:'Enter your username or email address.' }, 400);
  const publicChallengeId = uid('wa-auth');
  const generic = () => json({
    ok:true,challengeId:publicChallengeId,
    destination:'your enrolled WhatsApp contact',
    message:'If your account is eligible and has verified WhatsApp recovery enabled, check WhatsApp for a verification code.',
  });
  const inferred = companyCode ? null : await resolveRecoveryCompanyForIdentifier(
    env, identifier, 'whatsapp',
  );
  const company = await env.DB.prepare(
    "SELECT id,code,name FROM companies WHERE active=1 AND lower(code)=lower(?) AND lower(name) NOT LIKE '%farm%' LIMIT 1",
  ).bind(companyCode || inferred?.companyCode || '').first<{id:string;code:string;name:string}>();
  if (!company || (!companyCode && !inferred)) {
    if (companyCode) return json({ error:'Select a valid company.' }, 400);
    await security(env,request,'whatsapp_password_reset_requested',undefined,undefined,{accountMatched:false});
    return generic();
  }
  const policy = await resolveScopedSetting(env,RECOVERY_SETTING_KEY,company.id,'email');
  if (!recoveryMethods(policy.value as RecoveryMethodPolicy).includes('whatsapp')) {
    if (companyCode) return json({
      error:'WhatsApp password recovery is not enabled for this company.',
      code:'RECOVERY_METHOD_NOT_ALLOWED',
    },409);
    await security(env,request,'whatsapp_password_reset_requested',undefined,undefined,{
      accountMatched:false,
    });
    return generic();
  }
  let challengeId = publicChallengeId;
  const row = await env.DB.prepare(`
    SELECT e.id AS employeeId,m.company_id AS companyId,
      vc.normalized_value AS phone,vc.revision
    FROM employee_credentials c
    JOIN employees e ON e.id=c.employee_id
    JOIN employee_company_memberships m ON m.employee_id=e.id AND m.company_id=? AND m.active=1
    JOIN employee_verified_contacts vc
      ON vc.employee_id=e.id AND vc.company_id=m.company_id
      AND vc.contact_type='phone' AND vc.revoked_at IS NULL
    WHERE (LOWER(c.username)=LOWER(?) OR LOWER(e.email)=LOWER(?))
      AND e.employment_status IN ('active','provisional')
       AND (?='' OR e.id=?)
    ORDER BY m.is_primary DESC,vc.verified_at DESC
    LIMIT 1
  `).bind(company.id,identifier,identifier,
     inferred?.employeeId || '',inferred?.employeeId || '').first<{
    employeeId:string;companyId:string;phone:string;revision:number;
  }>();
  if (row) {
    try {
      const challenge = await startWhatsAppChallenge(env,request,{
        purpose:'password_reset',
        companyId:row.companyId,
        employeeId:row.employeeId,
        phone:row.phone,
        contactRevision:Number(row.revision || 1),
        contactAlreadyVerified:true,
      });
      challengeId = challenge.challengeId;
    } catch {
      challengeId = publicChallengeId;
    }
  }
  await security(env,request,'whatsapp_password_reset_requested',row?.employeeId,row?.companyId,{
    accountMatched:Boolean(row),
  });
  return json({
    ok:true,
    challengeId,
    destination:'your enrolled WhatsApp contact',
    message:'If your account is eligible and has verified WhatsApp recovery enabled, check WhatsApp for a verification code.',
  });
}

export async function verifyPasswordRecoveryWhatsApp(
  request: Request,
  env: WhatsAppRecoveryEnv,
) {
  let body: { challengeId?:string; code?:string };
  try { body = await request.json(); }
  catch { return json({ error:'Invalid request body.' }, 400); }
  let verified;
  try {
    verified = await verifyWhatsAppChallenge(
      env,request,'password_reset',String(body.challengeId || ''),String(body.code || ''),
    );
  } catch {
    return json({ error:'This password reset verification is invalid or has expired.' }, 401);
  }
  if (!verified.employeeId) {
    return json({ error:'This password reset verification is invalid.' }, 401);
  }
  const resetToken = randomToken();
  const tokenHash = await resetTokenHash(env,resetToken);
  const minutes = Number(await setting(env,'security.password_reset_token_minutes','10')) || 10;
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const resetChallengeId = uid('password-reset');
  const completedProofHash = await sha256(`whatsapp-verified:${verified.id}`);
  await env.DB.prepare(`
    INSERT INTO password_reset_challenges(
      id,employee_id,code_hash,requested_ip,requested_user_agent,expires_at,
      verified_at,reset_token_hash,reset_token_expires_at
    ) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?)
  `).bind(
    resetChallengeId,verified.employeeId,completedProofHash,
    requestIp(request),request.headers.get('user-agent'),expiresAt,
    tokenHash,expiresAt,
  ).run();
  await security(env,request,'password_reset_identity_verified',
    verified.employeeId,verified.companyId,{ method:'whatsapp' });
  return json({
    ok:true,
    resetToken,
    expiresAt,
    message:'Identity verified through WhatsApp. You can now create a new password.',
  });
}
