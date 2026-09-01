import { clearSessionCookie, getSessionContext, sessionCookie } from './auth';
import type { PasswordAuthEnv } from './password-auth';

interface Env extends PasswordAuthEnv {}

const encoder = new TextEncoder();
const OWNER_EMAIL = 'adedapo2005@gmail.com';
const OWNER_USERNAME = 'owner';
// SHA-256 of the independently delivered, high-entropy temporary Owner password.
// The plaintext temporary password is never stored in source, GitHub, D1, or logs.
const TEMP_PASSWORD_SHA256 = 'f28aeb9f1d1d324b3e819bc657f6213c85fe217999cbe5623ed7ce7bf372182b';

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set('content-type', 'application/json; charset=utf-8');
  result.set('cache-control', 'no-store');
  result.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: result });
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomToken(bytes = 32) {
  const raw = randomBytes(bytes);
  let value = '';
  for (const byte of raw) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function pepper(env: Env) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}

async function sessionHash(env: Env, token: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER missing');
  return sha256(`${token}:${secret}`);
}

async function passwordHash(env: Env, password: string, salt: string, iterations: number) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER missing');
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(`${password}\u0000${secret}`), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, material, 256,
  );
  return hex(new Uint8Array(result));
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

async function owner(env: Env) {
  return env.DB.prepare(`
    SELECT e.id AS employeeId,e.email,e.display_name AS displayName,e.employment_status AS status,
           c.username AS currentUsername,
           EXISTS(SELECT 1 FROM employee_roles er WHERE er.employee_id=e.id AND er.role_id='role-owner') AS isOwner
    FROM employees e
    LEFT JOIN employee_credentials c ON c.employee_id=e.id
    WHERE lower(e.email)=lower(?)
    LIMIT 1
  `).bind(OWNER_EMAIL).first<{
    employeeId: string;
    email: string;
    displayName: string;
    status: string;
    currentUsername?: string;
    isOwner: number;
  }>();
}

async function securityLog(
  env: Env,
  request: Request,
  employeeId: string,
  eventType: string,
  result: string,
  details: Record<string, unknown> = {},
  sessionId?: string,
) {
  await env.DB.prepare(`
    INSERT INTO security_logs(id,employee_id,session_id,event_type,severity,result,ip_address,user_agent,details_json)
    VALUES(?,?,?,?,'high',?,?,?,?)
  `).bind(
    `security-${crypto.randomUUID()}`,
    employeeId,
    sessionId || null,
    eventType,
    result,
    request.headers.get('cf-connecting-ip') || null,
    request.headers.get('user-agent'),
    JSON.stringify(details),
  ).run().catch(() => undefined);
}

function validPermanentPassword(password: string) {
  const errors: string[] = [];
  if (password.length < 6) errors.push('Use at least 6 characters.');
  if (password.length > 128) errors.push('Use no more than 128 characters.');
  if (new Set(['123456', 'password', 'qwerty', 'abcdef', 'welcome', 'daenem']).has(password.toLowerCase())) {
    errors.push('Choose a less common password.');
  }
  return errors;
}

async function temporaryLogin(request: Request, env: Env) {
  if (env.APP_STAGE !== 'production') return null;
  let body: {
    identifier?: string;
    password?: string;
    deviceFingerprint?: string;
    deviceName?: string;
    platform?: string;
  };
  try { body = await request.clone().json(); } catch { return null; }

  const identifier = String(body.identifier || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (![OWNER_USERNAME, OWNER_EMAIL].includes(identifier) || !password) return null;

  const row = await owner(env);
  if (!row || !row.isOwner || !['active', 'provisional'].includes(row.status)) return null;
  if ((await setting(env, 'owner.temporary_password_consumed')) === 'true') return null;

  const supplied = await sha256(password);
  if (!constantTimeEqual(supplied, TEMP_PASSWORD_SHA256)) return null;

  const token = randomToken();
  const tokenDigest = await sessionHash(env, token);
  const sessionId = `session-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();

  await env.DB.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL')
    .bind(row.employeeId).run().catch(() => undefined);
  await env.DB.prepare(`
    INSERT INTO auth_sessions(
      id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,
      login_geofence_result,expires_at
    ) VALUES(?,?,?,?,?,?,?,'not_required',?)
  `).bind(
    sessionId,
    row.employeeId,
    tokenDigest,
    body.deviceFingerprint || null,
    body.deviceName || null,
    request.headers.get('user-agent'),
    request.headers.get('cf-connecting-ip') || null,
    expiresAt,
  ).run();

  await putSetting(env, 'owner.force_password_change', 'true', 'boolean');
  await securityLog(env, request, row.employeeId, 'owner_temporary_password_accepted', 'forced_change_required', {
    username: OWNER_USERNAME,
    sessionExpiresAt: expiresAt,
  }, sessionId);

  const cookie = sessionCookie(request, token, 3600);
  return json({
    ok: true,
    forcePasswordChange: true,
    username: OWNER_USERNAME,
    message: 'Temporary Owner password accepted. You must create your private password before continuing.',
  }, 200, { 'set-cookie': cookie });
}

async function temporaryStatus(request: Request, env: Env) {
  const context = await getSessionContext(request, env);
  if (!context) return json({ authenticated: false, required: false }, 401);
  if (context.employee.id !== 'employee-owner-bootstrap') return json({ authenticated: true, required: false });
  const required = (await setting(env, 'owner.force_password_change')) === 'true';
  return json({
    authenticated: true,
    required,
    owner: true,
    displayName: context.employee.displayName,
    message: required
      ? 'You signed in with a temporary Owner password. Create your private password before using the portal.'
      : 'Owner password is current.',
  });
}

async function temporaryPasswordChange(request: Request, env: Env) {
  if (env.APP_STAGE !== 'production') return null;
  const context = await getSessionContext(request, env);
  if (!context || context.employee.id !== 'employee-owner-bootstrap') {
    return json({ error: 'Owner authentication is required.' }, 401);
  }
  if ((await setting(env, 'owner.force_password_change')) !== 'true') {
    return json({ error: 'A temporary Owner password change is not currently required.' }, 409);
  }

  let body: { newPassword?: string; confirmPassword?: string };
  try { body = await request.clone().json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');
  if (newPassword !== confirmPassword) return json({ error: 'The two passwords do not match.' }, 400);

  const errors = validPermanentPassword(newPassword);
  const newPasswordDigest = await sha256(newPassword);
  if (constantTimeEqual(newPasswordDigest, TEMP_PASSWORD_SHA256)) {
    errors.push('Choose a new private password instead of the temporary password.');
  }
  if (errors.length) return json({ error: 'Please choose a different private password.', passwordErrors: errors }, 400);

  const row = await owner(env);
  if (!row || !row.isOwner) return json({ error: 'Owner account verification failed.' }, 403);

  try {
    // Emergency access uses a Workers-safe work factor. The iteration count is
    // stored with the credential so it can be upgraded transparently later.
    const iterations = 120000;
    const salt = hex(randomBytes(16));
    const derived = await passwordHash(env, newPassword, salt, iterations);
    let username = row.currentUsername || OWNER_USERNAME;
    if (!row.currentUsername) {
      const collision = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE lower(username)=lower(?) AND employee_id<>? LIMIT 1')
        .bind(username, row.employeeId).first<{ employee_id: string }>();
      if (collision) username = 'daenem.owner';
    }

    await env.DB.prepare(`
      INSERT INTO employee_credentials(
        employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,
        email_verified_at,password_changed_at,failed_attempts,locked_until
      ) VALUES(?,?,?,?,'PBKDF2-SHA256',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)
      ON CONFLICT(employee_id) DO UPDATE SET
        username=excluded.username,
        password_hash=excluded.password_hash,
        password_salt=excluded.password_salt,
        password_algorithm=excluded.password_algorithm,
        password_iterations=excluded.password_iterations,
        email_verified_at=COALESCE(employee_credentials.email_verified_at,CURRENT_TIMESTAMP),
        password_changed_at=CURRENT_TIMESTAMP,
        failed_attempts=0,
        locked_until=NULL,
        updated_at=CURRENT_TIMESTAMP
    `).bind(row.employeeId, username, derived, salt, iterations).run();

    await env.DB.prepare("UPDATE employees SET employment_status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(row.employeeId).run();
    await putSetting(env, 'owner.temporary_password_consumed', 'true', 'boolean');
    await putSetting(env, 'owner.force_password_change', 'false', 'boolean');
    await env.DB.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL')
      .bind(row.employeeId).run();
    await env.DB.prepare(`
      UPDATE employee_login_access_requests
      SET status='activated',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP)
      WHERE employee_id=? AND status='ready'
    `).bind(row.employeeId).run().catch(() => undefined);
    await securityLog(env, request, row.employeeId, 'owner_temporary_password_replaced', 'success', { username });

    return json({
      ok: true,
      username,
      signedOut: true,
      message: 'Your private Owner password is now active. Sign in again with your new password.',
    }, 200, { 'set-cookie': clearSessionCookie(request) });
  } catch (error) {
    const reference = `OWN-TEMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await securityLog(env, request, row.employeeId, 'owner_temporary_password_change_failed', 'failed', {
      reference,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    });
    return json({
      error: 'We could not save your new Owner password. Your temporary sign-in remains available so you can retry.',
      code: 'OWNER_TEMP_CHANGE_FAILED',
      reference,
    }, 503);
  }
}

export async function routeOwnerTemporaryAccess(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/auth/login' && request.method === 'POST') return temporaryLogin(request, env);
  if (url.pathname === '/api/owner/temporary-password/status' && request.method === 'GET') return temporaryStatus(request, env);
  if (url.pathname === '/api/owner/temporary-password/change' && request.method === 'POST') return temporaryPasswordChange(request, env);
  return null;
}

export async function guardOwnerForcedPasswordChange(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  if ([
    '/api/auth/me',
    '/api/auth/logout',
    '/api/owner/temporary-password/status',
    '/api/owner/temporary-password/change',
  ].includes(url.pathname)) return null;
  if ((await setting(env, 'owner.force_password_change')) !== 'true') return null;
  const context = await getSessionContext(request, env);
  if (!context || context.employee.id !== 'employee-owner-bootstrap') return null;
  return json({
    error: 'Change your temporary Owner password before using the portal.',
    code: 'OWNER_PASSWORD_CHANGE_REQUIRED',
  }, 428);
}
