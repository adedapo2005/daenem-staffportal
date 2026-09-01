import { clearSessionCookie, getSessionContext, type AuthEnv } from './auth';
import { WORKER_SAFE_PASSWORD_ITERATIONS, derivePasswordHash, permanentPasswordErrors, randomSaltHex } from './credential-security';

interface Env extends AuthEnv {}

const OWNER_ID = 'employee-owner-bootstrap';
const OWNER_USERNAME = 'owner';

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  h.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: h });
}

async function setting(env: Env, key: string) {
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?')
    .bind(key).first<{ setting_value: string }>();
  return row?.setting_value;
}

async function putSetting(env: Env, key: string, value: string, type = 'string') {
  await env.DB.prepare(`
    INSERT INTO app_settings(setting_key,setting_value,value_type,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,value_type=excluded.value_type,updated_at=CURRENT_TIMESTAMP
  `).bind(key, value, type).run();
}

async function logFailure(env: Env, request: Request, reference: string, phase: string, error: unknown, sessionId?: string) {
  await env.DB.prepare(`
    INSERT INTO security_logs(id,employee_id,session_id,event_type,severity,result,ip_address,user_agent,details_json)
    VALUES(?,?,?,'owner_temporary_password_change_failed','high','failed',?,?,?)
  `).bind(
    `security-${crypto.randomUUID()}`,
    OWNER_ID,
    sessionId || null,
    request.headers.get('cf-connecting-ip') || null,
    request.headers.get('user-agent'),
    JSON.stringify({
      reference,
      phase,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }),
  ).run().catch(() => undefined);
}

async function logSuccess(env: Env, request: Request, username: string, sessionId?: string) {
  await env.DB.prepare(`
    INSERT INTO security_logs(id,employee_id,session_id,event_type,severity,result,ip_address,user_agent,details_json)
    VALUES(?,?,?,'owner_temporary_password_replaced','info','success',?,?,?)
  `).bind(
    `security-${crypto.randomUUID()}`,
    OWNER_ID,
    sessionId || null,
    request.headers.get('cf-connecting-ip') || null,
    request.headers.get('user-agent'),
    JSON.stringify({ username, passwordIterations: WORKER_SAFE_PASSWORD_ITERATIONS, recoveryVersion: 'v2' }),
  ).run().catch(() => undefined);
}

export async function routeOwnerTemporaryPasswordRepair(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/owner/temporary-password/change' || request.method !== 'POST') return null;

  const context = await getSessionContext(request, env);
  if (!context || context.employee.id !== OWNER_ID || !context.roles.some((role) => role.code === 'owner')) {
    return json({ error: 'Owner authentication is required.' }, 401);
  }
  if ((await setting(env, 'owner.force_password_change')) !== 'true') {
    return json({ error: 'A temporary Owner password change is not currently required.' }, 409);
  }

  let body: { newPassword?: string; confirmPassword?: string };
  try { body = await request.clone().json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const password = String(body.newPassword || '');
  const confirm = String(body.confirmPassword || '');
  if (password !== confirm) return json({ error: 'The two passwords do not match.' }, 400);
  const errors = permanentPasswordErrors(password);
  if (errors.length) return json({ error: 'Please choose a different private password.', passwordErrors: errors }, 400);

  let phase = 'load_owner_credential';
  try {
    const current = await env.DB.prepare(`
      SELECT c.username
      FROM employees e LEFT JOIN employee_credentials c ON c.employee_id=e.id
      WHERE e.id=? AND e.employment_status IN ('active','provisional') LIMIT 1
    `).bind(OWNER_ID).first<{ username?: string }>();
    if (!current) return json({ error: 'Owner account could not be verified.' }, 404);

    let username = current.username || OWNER_USERNAME;
    if (!current.username) {
      const collision = await env.DB.prepare(`
        SELECT employee_id FROM employee_credentials
        WHERE lower(username)=lower(?) AND employee_id<>? LIMIT 1
      `).bind(username, OWNER_ID).first<{ employee_id: string }>();
      if (collision) username = 'daenem.owner';
    }

    phase = 'derive_password';
    const salt = randomSaltHex();
    const hash = await derivePasswordHash(env, password, salt, WORKER_SAFE_PASSWORD_ITERATIONS);

    phase = 'save_credential';
    const existing = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE employee_id=? LIMIT 1')
      .bind(OWNER_ID).first<{ employee_id: string }>();
    if (existing) {
      await env.DB.prepare(`
        UPDATE employee_credentials SET username=?,password_hash=?,password_salt=?,password_algorithm='PBKDF2-SHA256',
          password_iterations=?,email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP),
          password_changed_at=CURRENT_TIMESTAMP,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE employee_id=?
      `).bind(username, hash, salt, WORKER_SAFE_PASSWORD_ITERATIONS, OWNER_ID).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO employee_credentials(
          employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,
          email_verified_at,password_changed_at,failed_attempts,locked_until
        ) VALUES(?,?,?,?,'PBKDF2-SHA256',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)
      `).bind(OWNER_ID, username, hash, salt, WORKER_SAFE_PASSWORD_ITERATIONS).run();
    }

    phase = 'complete_owner_recovery';
    await env.DB.prepare("UPDATE employees SET employment_status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(OWNER_ID).run();
    await putSetting(env, 'owner.temporary_password_consumed', 'true', 'boolean');
    await putSetting(env, 'owner.force_password_change', 'false', 'boolean');
    await env.DB.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL')
      .bind(OWNER_ID).run();
    await env.DB.prepare(`
      UPDATE employee_login_access_requests
      SET status='activated',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP)
      WHERE employee_id=? AND status='ready'
    `).bind(OWNER_ID).run().catch(() => undefined);
    await logSuccess(env, request, username, context.sessionId);

    return json({
      ok: true,
      username,
      signedOut: true,
      message: 'Your private Owner password is now active. Sign in again with your new password.',
    }, 200, { 'set-cookie': clearSessionCookie(request) });
  } catch (error) {
    const reference = `OWN-TEMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await logFailure(env, request, reference, phase, error, context.sessionId);
    return json({
      error: 'We could not save your new Owner password. Your temporary sign-in remains available so you can retry.',
      code: 'OWNER_TEMP_CHANGE_FAILED',
      reference,
      phase,
    }, 503);
  }
}
