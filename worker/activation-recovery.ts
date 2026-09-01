import type { PasswordAuthEnv } from './password-auth';

const encoder = new TextEncoder();

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function pepper(env: PasswordAuthEnv) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function codeHash(env: PasswordAuthEnv, challengeId: string, code: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured.');
  return sha256(`password-reset:${challengeId}:${code}:${secret}`);
}

async function resetTokenHash(env: PasswordAuthEnv, token: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured.');
  return sha256(`password-reset:${token}:${secret}`);
}

function randomToken(bytes = 32) {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  let value = '';
  for (const byte of raw) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function securityLog(env: PasswordAuthEnv, request: Request, employeeId: string, eventType: string, result: string) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  await env.DB.prepare(`
    INSERT INTO security_logs(id,employee_id,event_type,severity,result,ip_address,user_agent,details_json)
    VALUES(?,?,?,'info',?,?,?,?)
  `).bind(
    `security-${crypto.randomUUID()}`,
    employeeId,
    eventType,
    result,
    ip,
    request.headers.get('user-agent'),
    JSON.stringify({ flow: 'first_time_login_activation' }),
  ).run().catch(() => undefined);
}

/**
 * Handles OTP verification specifically for employees that do not yet have an
 * employee_credentials row. This keeps first-time Owner/Admin-created access on
 * one coherent recovery path and prevents the generic reset handler from making
 * assumptions that a credential row already exists.
 */
export async function routeActivationRecovery(request: Request, env: PasswordAuthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/auth/password/verify-reset' || request.method !== 'POST') return null;

  let body: { challengeId?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid verification request.' }, 400);
  }

  const challengeId = String(body.challengeId || '');
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  if (!challengeId || code.length !== 6) return json({ error: 'Enter the 6-digit verification code.' }, 400);

  try {
    const row = await env.DB.prepare(`
      SELECT pr.id, pr.employee_id AS employeeId, pr.code_hash AS codeHash,
             pr.attempts, pr.max_attempts AS maxAttempts, pr.expires_at AS expiresAt,
             pr.consumed_at AS consumedAt,
             EXISTS(SELECT 1 FROM employee_credentials c WHERE c.employee_id=pr.employee_id) AS hasCredential,
             EXISTS(SELECT 1 FROM employee_roles er WHERE er.employee_id=pr.employee_id AND er.role_id='role-owner') AS isOwner,
             EXISTS(
               SELECT 1 FROM employee_login_access_requests ar
               WHERE ar.employee_id=pr.employee_id AND ar.status='ready'
                 AND (ar.expires_at IS NULL OR datetime(ar.expires_at)>datetime('now'))
             ) AS hasReadyAccess
      FROM password_reset_challenges pr
      WHERE pr.id=? LIMIT 1
    `).bind(challengeId).first<{
      id: string;
      employeeId: string;
      codeHash: string;
      attempts: number;
      maxAttempts: number;
      expiresAt: string;
      consumedAt?: string;
      hasCredential: number;
      isOwner: number;
      hasReadyAccess: number;
    }>();

    // Existing credential resets continue through the established reset handler.
    if (!row || row.hasCredential || (!row.isOwner && !row.hasReadyAccess)) return null;

    if (row.consumedAt || new Date(row.expiresAt).getTime() <= Date.now()) {
      return json({ error: 'This verification code has expired. Start again from Forgot password.' }, 401);
    }
    if (Number(row.attempts) >= Number(row.maxAttempts)) {
      return json({ error: 'Too many verification attempts. Start password recovery again.' }, 429);
    }

    const supplied = await codeHash(env, challengeId, code);
    if (!constantTimeEqual(supplied, row.codeHash)) {
      await env.DB.prepare('UPDATE password_reset_challenges SET attempts=attempts+1 WHERE id=?').bind(challengeId).run();
      await securityLog(env, request, row.employeeId, 'login_access_activation_code_failed', 'denied');
      return json({ error: 'The verification code is incorrect.' }, 401);
    }

    const resetToken = randomToken();
    const tokenHash = await resetTokenHash(env, resetToken);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    await env.DB.prepare(`
      UPDATE password_reset_challenges
      SET verified_at=CURRENT_TIMESTAMP, reset_token_hash=?, reset_token_expires_at=?
      WHERE id=? AND consumed_at IS NULL
    `).bind(tokenHash, expiresAt, challengeId).run();

    await securityLog(env, request, row.employeeId, 'login_access_activation_identity_verified', 'verified');
    return json({
      ok: true,
      resetToken,
      message: 'Identity verified. Create your password to activate your Daenem login.',
    });
  } catch (error) {
    console.error('first_time_activation_verify_failed', error);
    return json({ error: 'We could not verify the access code. Please request a new code and try again.' }, 503);
  }
}
