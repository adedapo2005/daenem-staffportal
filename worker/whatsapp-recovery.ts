import type { AuthEnv } from './auth.js';
import type { SocialCryptoEnv } from './social-crypto.js';
import { startWhatsAppChallenge, verifyWhatsAppChallenge } from './whatsapp-auth.js';
import { RECOVERY_SETTING_KEY, recoveryMethods, resolveScopedSetting, type RecoveryMethodPolicy } from './scoped-settings.js';

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
  let body: { identifier?:string };
  try { body = await request.json(); }
  catch { return json({ error:'Invalid request body.' }, 400); }
  const identifier = String(body.identifier || '').trim().toLowerCase();
  if (!identifier) return json({ error:'Enter your username or email address.' }, 400);
  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM security_logs
    WHERE ip_address=? AND event_type IN ('password_reset_requested','whatsapp_password_reset_requested')
      AND datetime(occurred_at)>=datetime('now','-15 minutes')
  `).bind(requestIp(request) || '').first<{count:number}>();
  if (Number(recent?.count || 0) >= 5) {
    return json({error:'Too many recovery requests. Wait 15 minutes and try again.'},429);
  }
  const publicChallengeId = uid('password-reset');
  const account = await env.DB.prepare(`
    SELECT e.id AS employeeId,m.company_id AS companyId
    FROM employee_credentials c
    JOIN employees e ON e.id=c.employee_id
    JOIN employee_company_memberships m ON m.employee_id=e.id AND m.active=1
    JOIN companies co ON co.id=m.company_id AND co.active=1 AND lower(co.name) NOT LIKE '%farm%'
    WHERE (LOWER(c.username)=LOWER(?) OR LOWER(e.email)=LOWER(?))
      AND e.employment_status IN ('active','provisional')
    ORDER BY m.is_primary DESC,co.id ASC
    LIMIT 1
  `).bind(identifier,identifier).first<{employeeId:string;companyId:string}>();
  let row: { employeeId:string; companyId:string; phone:string; revision:number } | null = null;
  if (account) {
    const policy=await resolveScopedSetting(env,RECOVERY_SETTING_KEY,account.companyId,'email');
    if (recoveryMethods(policy.value as RecoveryMethodPolicy).includes('whatsapp')) {
      row = await env.DB.prepare(`
        SELECT vc.normalized_value AS phone,vc.revision
        FROM employee_verified_contacts vc
        WHERE vc.employee_id=? AND vc.company_id=?
          AND vc.contact_type='phone' AND vc.revoked_at IS NULL
        ORDER BY vc.verified_at DESC
        LIMIT 1
      `).bind(account.employeeId,account.companyId).first<{phone:string;revision:number}>()
        .then((contact) => contact ? { ...account, ...contact } : null);
    }
  }
  if (row) {
    try {
      await startWhatsAppChallenge(env,request,{
        purpose:'password_reset',
        challengeId:publicChallengeId,
        companyId:row.companyId,
        employeeId:row.employeeId,
        phone:row.phone,
        contactRevision:Number(row.revision || 1),
        contactAlreadyVerified:true,
      });
    } catch {
      // Keep the public response indistinguishable when delivery is unavailable.
    }
  }
  await security(env,request,'whatsapp_password_reset_requested',account?.employeeId,account?.companyId,{
    accountMatched:Boolean(account && row),
  });
  return json({
    ok:true,
    challengeId:publicChallengeId,
    destination:'your verified recovery contact',
    message:'If the account details match an eligible employee login, a verification code has been sent to the verified recovery contact on file.',
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
