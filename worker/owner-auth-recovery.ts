import type { PasswordAuthEnv } from './password-auth';
import { WORKER_SAFE_PASSWORD_ITERATIONS, derivePasswordHash, randomSaltHex } from './credential-security';

interface Env extends PasswordAuthEnv {}
const enc = new TextEncoder();
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const hex = (a: Uint8Array) => [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
const uid = (p: string) => `${p}-${crypto.randomUUID()}`;

function pepper(env: Env) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}
async function sha(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))); }
async function resetTokenHash(env: Env, token: string) { const secret = pepper(env); if (!secret) throw new Error('AUTH_PEPPER missing'); return sha(`password-reset:${token}:${secret}`); }
async function setting(env: Env, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?').bind(key).first<{ setting_value: string }>();
  return row?.setting_value ?? fallback;
}
function validUsername(value: string) { return /^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/.test(value); }
function passwordErrors(password: string) {
  const errors: string[] = [];
  if (password.length < 6) errors.push('Use at least 6 characters.');
  if (password.length > 128) errors.push('Use no more than 128 characters.');
  if (new Set(['123456','password','qwerty','abcdef','welcome','daenem']).has(password.toLowerCase())) errors.push('Choose a less common password.');
  return errors;
}
async function logFailure(env: Env, request: Request, employeeId: string, reference: string, phase: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  await env.DB.prepare(`INSERT INTO security_logs(id,employee_id,event_type,severity,result,ip_address,user_agent,details_json) VALUES(?,?,'owner_password_activation_failure','high','failed',?,?,?)`)
    .bind(uid('security'), employeeId, request.headers.get('cf-connecting-ip'), request.headers.get('user-agent'), JSON.stringify({ reference, phase, message, recoveryVersion: 'v3' })).run().catch(() => undefined);
}

export async function routeOwnerAuthRecovery(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/auth/password/reset' || request.method !== 'POST') return null;

  let body: { resetToken?: string; newPassword?: string };
  try { body = await request.clone().json(); } catch { return null; }
  const token = String(body.resetToken || '');
  const password = String(body.newPassword || '');
  if (!token || !password) return null;

  const tokenHash = await resetTokenHash(env, token);
  const row = await env.DB.prepare(`
    SELECT pr.id AS challengeId, pr.employee_id AS employeeId, e.email, e.display_name AS displayName,
           c.username AS currentUsername,
           EXISTS(SELECT 1 FROM employee_roles er WHERE er.employee_id=e.id AND er.role_id='role-owner') AS isOwner
    FROM password_reset_challenges pr
    JOIN employees e ON e.id=pr.employee_id
    LEFT JOIN employee_credentials c ON c.employee_id=e.id
    WHERE pr.reset_token_hash=? AND pr.verified_at IS NOT NULL AND pr.consumed_at IS NULL
      AND datetime(pr.reset_token_expires_at)>datetime('now')
    LIMIT 1
  `).bind(tokenHash).first<{ challengeId: string; employeeId: string; email?: string; displayName: string; currentUsername?: string; isOwner: number }>();

  if (!row || !row.isOwner) return null;
  const errors = passwordErrors(password);
  if (errors.length) return json({ error: 'Please update the new password before continuing.', passwordErrors: errors }, 400);

  const reference = `OWN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let phase = 'resolve_username';
  try {
    let preferred = row.currentUsername || String(await setting(env, 'owner.bootstrap_username', 'owner')).trim().toLowerCase();
    if (!validUsername(preferred)) preferred = 'owner';
    if (!row.currentUsername) {
      const collision = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE lower(username)=lower(?) AND employee_id<>?').bind(preferred, row.employeeId).first<{ employee_id: string }>();
      if (collision) preferred = 'daenem.owner';
    }

    // Password recovery runs inside the request CPU budget. The earlier 310,000
    // iteration setting could terminate the Worker after identity verification,
    // leaving the Owner at the generic activation-failed screen. Store the work
    // factor with the credential so sign-in can verify it and upgrade it later.
    phase = 'derive_password';
    const configured = Number(await setting(env, 'security.worker_safe_pbkdf2_iterations', String(WORKER_SAFE_PASSWORD_ITERATIONS)));
    const iterations = Number.isFinite(configured) && configured >= 1000
      ? Math.min(configured, 20000)
      : WORKER_SAFE_PASSWORD_ITERATIONS;
    const salt = randomSaltHex();
    const derived = await derivePasswordHash(env, password, salt, iterations);

    phase = 'save_credential';
    const existing = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE employee_id=? LIMIT 1')
      .bind(row.employeeId).first<{ employee_id: string }>();
    const credentialWrite = existing
      ? env.DB.prepare(`UPDATE employee_credentials SET username=?,password_hash=?,password_salt=?,password_algorithm='PBKDF2-SHA256',password_iterations=?,email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP),password_changed_at=CURRENT_TIMESTAMP,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE employee_id=?`)
          .bind(preferred, derived, salt, iterations, row.employeeId)
      : env.DB.prepare(`INSERT INTO employee_credentials(employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,email_verified_at,password_changed_at,failed_attempts,locked_until) VALUES(?,?,?,?,'PBKDF2-SHA256',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)`)
          .bind(row.employeeId, preferred, derived, salt, iterations);

    phase = 'complete_recovery';
    await env.DB.batch([
      credentialWrite,
      env.DB.prepare(`UPDATE employees SET employment_status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.employeeId),
      env.DB.prepare(`UPDATE password_reset_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL`).bind(row.challengeId),
      env.DB.prepare(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL`).bind(row.employeeId),
    ]);
    await env.DB.prepare(`UPDATE employee_login_access_requests SET status='activated',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP) WHERE employee_id=? AND status='ready'`).bind(row.employeeId).run().catch(() => undefined);
    await env.DB.prepare(`INSERT INTO security_logs(id,employee_id,event_type,severity,result,ip_address,user_agent,details_json) VALUES(?,?,'owner_password_activation_completed','info','success',?,?,?)`)
      .bind(uid('security'), row.employeeId, request.headers.get('cf-connecting-ip'), request.headers.get('user-agent'), JSON.stringify({ reference, username: preferred, passwordIterations: iterations, recoveryVersion: 'v3' })).run().catch(() => undefined);

    return json({ ok: true, username: preferred, message: `Owner access is ready. Sign in with ${preferred} or your email and your new password.` });
  } catch (error) {
    await logFailure(env, request, row.employeeId, reference, phase, error);
    return json({ error: 'We could not finish securing your Owner access. Your verified identity remains protected. Request a new code and try again.', code: 'OWNER_ACTIVATION_FAILED', reference, phase }, 503);
  }
}
