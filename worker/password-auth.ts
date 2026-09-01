import { sessionCookie, type AuthEnv } from './auth';

interface EmailBinding {
  send(message: {
    from: { email: string; name?: string };
    to: string[];
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId?: string; message_id?: string }>;
}

export interface PasswordAuthEnv extends AuthEnv {
  EMAIL?: EmailBinding;
  WORKFORCE_EMAIL_FROM?: string;
}

type LocationInput = { latitude?: number; longitude?: number; accuracy?: number };

const encoder = new TextEncoder();
const OWNER_LOGIN_EMAIL = 'adedapo2005@gmail.com';

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  h.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: h });
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 32) {
  const raw = randomBytes(bytes);
  let value = '';
  for (const byte of raw) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

function pepper(env: PasswordAuthEnv) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}

async function setting(env: PasswordAuthEnv, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?')
    .bind(key).first<{ setting_value: string }>();
  return row?.setting_value ?? fallback;
}

function normalizePhone(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `+234${digits.slice(1)}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return raw;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function validUsername(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/.test(value);
}

function maskEmail(value: string) {
  const [name, domain] = value.split('@');
  if (!domain) return 'email on file';
  return `${name.slice(0, 2)}***@${domain}`;
}

function requestIp(request: Request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
}

function requestLocationLabel(request: Request) {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  return cf?.city ? `${cf.city}${cf.region ? `, ${cf.region}` : ''}${cf.country ? `, ${cf.country}` : ''}` : undefined;
}

async function logSecurity(
  env: PasswordAuthEnv,
  request: Request,
  eventType: string,
  options: {
    employeeId?: string;
    companyId?: string;
    sessionId?: string;
    severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
    result?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    riskScore?: number;
    details?: Record<string, unknown>;
  } = {},
) {
  await env.DB.prepare(`
    INSERT INTO security_logs (
      id, employee_id, company_id, session_id, event_type, severity, result,
      ip_address, user_agent, latitude, longitude, accuracy_m, location_label,
      risk_score, details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uid('security'), options.employeeId || null, options.companyId || null, options.sessionId || null,
    eventType, options.severity || 'info', options.result || 'recorded', requestIp(request) || null,
    request.headers.get('user-agent'), options.latitude ?? null, options.longitude ?? null,
    options.accuracy ?? null, requestLocationLabel(request) || null, options.riskScore ?? null,
    options.details ? JSON.stringify(options.details) : null,
  ).run().catch(() => undefined);
}

async function passwordHash(env: PasswordAuthEnv, password: string, salt: string, iterations: number) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  const material = await crypto.subtle.importKey(
    'raw', encoder.encode(`${password}\u0000${secret}`), { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, material, 256,
  );
  return bytesToHex(new Uint8Array(result));
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function validatePassword(env: PasswordAuthEnv, password: string, identity?: string) {
  const min = Number(await setting(env, 'security.password_min_length', '10')) || 10;
  const max = Number(await setting(env, 'security.password_max_length', '128')) || 128;
  const errors: string[] = [];
  if (password.length < min) errors.push(`Use at least ${min} characters.`);
  if (password.length > max) errors.push(`Use no more than ${max} characters.`);
  if (!/[a-z]/.test(password)) errors.push('Add a lowercase letter.');
  if (!/[A-Z]/.test(password)) errors.push('Add an uppercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Add a number.');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Add a symbol.');
  if (identity && identity.length >= 4 && password.toLowerCase().includes(identity.toLowerCase())) {
    errors.push('Do not include your username or email name in the password.');
  }
  return errors;
}

async function codeHash(env: PasswordAuthEnv, purpose: string, challengeId: string, code: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return sha256(`${purpose}:${challengeId}:${code}:${secret}`);
}

async function sessionHash(env: PasswordAuthEnv, token: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return sha256(`${token}:${secret}`);
}

async function resetTokenHash(env: PasswordAuthEnv, token: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return sha256(`password-reset:${token}:${secret}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

async function sendCode(
  env: PasswordAuthEnv,
  options: { to: string; name: string; code: string; purpose: 'signup' | 'reset' },
) {
  if (!env.EMAIL || typeof env.EMAIL.send !== 'function') {
    if (env.APP_STAGE === 'bootstrap') return { delivered: false, bootstrapCode: options.code };
    throw new Error('Secure email delivery is not configured.');
  }

  const from = env.WORKFORCE_EMAIL_FROM || 'portal@daenem.com';
  const signup = options.purpose === 'signup';
  const subject = signup ? 'Verify your Daenem Workforce account' : 'Verify your Daenem password reset';
  const intro = signup
    ? 'Use this one-time code to verify your email and finish creating your employee login.'
    : 'Use this one-time code to verify your identity before the password reset page is unlocked.';
  const safeName = escapeHtml(options.name);
  const sent = await env.EMAIL.send({
    from: { email: from, name: 'Daenem Workforce Hub' },
    to: [options.to],
    subject,
    text: `Hello ${options.name}, ${intro} Code: ${options.code}. It expires in 10 minutes. Do not share this code.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17233b"><h2>Daenem Workforce Hub</h2><p>Hello ${safeName},</p><p>${intro}</p><p style="font-size:30px;font-weight:800;letter-spacing:7px">${options.code}</p><p>This code expires in 10 minutes. Do not share it with anyone.</p><hr style="border:0;border-top:1px solid #e4e8ef"><p style="font-size:12px;color:#667085">Daenem Group · Secure Employee Access</p></div>`,
  });
  return { delivered: true, messageId: sent?.messageId || sent?.message_id || undefined };
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function evaluateLocation(env: PasswordAuthEnv, employeeId: string, input: LocationInput) {
  const policy = await env.DB.prepare(`
    SELECT m.company_id AS companyId, cl.latitude, cl.longitude,
           COALESCE(ap.geofence_radius_m, cl.geofence_radius_m, 150) AS radiusM,
           COALESCE(ap.require_login_location, 0) AS requireLoginLocation
    FROM employee_company_memberships m
    LEFT JOIN company_locations cl ON cl.id = m.location_id
    LEFT JOIN attendance_policies ap
      ON ap.company_id = m.company_id AND ap.active = 1
      AND (ap.location_id IS NULL OR ap.location_id = m.location_id)
    WHERE m.employee_id = ? AND m.active = 1
    ORDER BY m.is_primary DESC, ap.location_id IS NOT NULL DESC
    LIMIT 1
  `).bind(employeeId).first<{ companyId: string; latitude?: number; longitude?: number; radiusM: number; requireLoginLocation: number }>();

  const mode = await setting(env, 'security.login_location_mode', 'record');
  const enforced = mode === 'enforce' || Boolean(policy?.requireLoginLocation);
  const hasLocation = Number.isFinite(input.latitude) && Number.isFinite(input.longitude);
  if (enforced && !hasLocation) {
    return { ok: false as const, code: 'LOCATION_REQUIRED', message: 'Location is required to sign in for this employee.' };
  }

  if (hasLocation && Number.isFinite(policy?.latitude) && Number.isFinite(policy?.longitude)) {
    const distance = distanceMeters(input.latitude!, input.longitude!, policy!.latitude!, policy!.longitude!);
    const radius = Number(policy?.radiusM || 150);
    const inside = distance <= radius + Math.max(Number(input.accuracy || 0), 0);
    if (enforced && !inside) {
      return { ok: false as const, code: 'OUTSIDE_LOGIN_GEOFENCE', message: 'Sign-in is not allowed from the current location.', companyId: policy?.companyId, distance: Math.round(distance), radius };
    }
    return { ok: true as const, result: inside ? 'inside' : 'outside', companyId: policy?.companyId, distance: Math.round(distance), radius };
  }

  return { ok: true as const, result: enforced ? 'unknown' : 'not_required', companyId: policy?.companyId };
}

async function signupStart(request: Request, env: PasswordAuthEnv) {
  if ((await setting(env, 'portal.allow_self_signup', 'true')) !== 'true') {
    return json({ error: 'Employee self-signup is currently disabled.' }, 403);
  }

  let body: {
    displayName?: string; email?: string; phone?: string; username?: string; password?: string;
    companyCode?: string; jobTitle?: string; department?: string; requestedRole?: string;
    latitude?: number; longitude?: number;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const displayName = String(body.displayName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = normalizePhone(String(body.phone || ''));
  const username = normalizeUsername(String(body.username || ''));
  const password = String(body.password || '');
  const companyCode = String(body.companyCode || '').trim().toUpperCase();

  if (displayName.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 8 || !companyCode) {
    return json({ error: 'Full name, valid email, phone number and company are required.' }, 400);
  }
  if (!validUsername(username)) {
    return json({ error: 'Username must be 4–32 characters and may use letters, numbers, dots, underscores and hyphens.' }, 400);
  }
  const passwordErrors = await validatePassword(env, password, username || email.split('@')[0]);
  if (passwordErrors.length) return json({ error: 'Password does not meet the security requirements.', passwordErrors }, 400);

  const company = await env.DB.prepare('SELECT id, name FROM companies WHERE code = ? AND active = 1')
    .bind(companyCode).first<{ id: string; name: string }>();
  if (!company) return json({ error: 'Select a valid Daenem company.' }, 400);

  const usernameUsed = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE LOWER(username) = LOWER(?) LIMIT 1')
    .bind(username).first<{ employee_id: string }>();
  if (usernameUsed) return json({ error: 'That username is already in use. Choose another username.' }, 409);

  const existing = await env.DB.prepare(`
    SELECT id, email, phone, employment_status AS status FROM employees
    WHERE LOWER(email) = LOWER(?) OR phone = ? LIMIT 1
  `).bind(email, phone).first<{ id: string; email?: string; phone?: string; status: string }>();
  if (existing) {
    if (String(existing.email || '').toLowerCase() !== email) {
      return json({ error: 'That phone number is already associated with another employee account.' }, 409);
    }
    const credential = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE employee_id = ? LIMIT 1')
      .bind(existing.id).first<{ employee_id: string }>();
    if (credential) return json({ error: 'An employee login already exists for this email. Use Sign in or Forgot password.' }, 409);
  }

  const pendingUsername = await env.DB.prepare(`
    SELECT id FROM signup_verifications
    WHERE LOWER(username) = LOWER(?) AND consumed_at IS NULL AND datetime(expires_at) > datetime('now') LIMIT 1
  `).bind(username).first<{ id: string }>();
  if (pendingUsername) return json({ error: 'That username is currently reserved by another signup. Choose another username or try again later.' }, 409);

  await env.DB.prepare(`DELETE FROM signup_verifications WHERE LOWER(email) = LOWER(?) AND consumed_at IS NULL`).bind(email).run();

  const iterations = Number(await setting(env, 'security.password_pbkdf2_iterations', '310000')) || 310000;
  const salt = bytesToHex(randomBytes(16));
  const derived = await passwordHash(env, password, salt, iterations);
  const challengeId = uid('signup-verify');
  const code = randomCode();
  const digest = await codeHash(env, 'signup', challengeId, code);
  const minutes = Number(await setting(env, 'security.signup_code_minutes', '10')) || 10;
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();

  await env.DB.prepare(`
    INSERT INTO signup_verifications (
      id, existing_employee_id, display_name, email, phone, username, company_id,
      job_title, department, requested_role_text, password_hash, password_salt,
      password_iterations, code_hash, submitted_ip, submitted_user_agent,
      submitted_latitude, submitted_longitude, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    challengeId, existing?.id || null, displayName, email, phone, username, company.id,
    body.jobTitle || null, body.department || null, body.requestedRole || null,
    derived, salt, iterations, digest, requestIp(request) || null,
    request.headers.get('user-agent'), body.latitude ?? null, body.longitude ?? null, expiresAt,
  ).run();

  try {
    const delivery = await sendCode(env, { to: email, name: displayName, code, purpose: 'signup' });
    await logSecurity(env, request, 'signup_verification_sent', {
      employeeId: existing?.id, companyId: company.id, result: delivery.delivered ? 'delivered' : 'bootstrap',
      latitude: body.latitude, longitude: body.longitude,
      details: { username, destination: maskEmail(email), provider: delivery.delivered ? 'cloudflare_email' : 'bootstrap' },
    });
    return json({
      ok: true,
      challengeId,
      destination: maskEmail(email),
      expiresAt,
      delivered: delivery.delivered,
      ...(delivery.bootstrapCode ? { bootstrapCode: delivery.bootstrapCode } : {}),
      message: `We sent a one-time verification code to ${maskEmail(email)}. Verify it to finish creating your login.`,
    });
  } catch (error) {
    await env.DB.prepare('DELETE FROM signup_verifications WHERE id = ?').bind(challengeId).run();
    return json({ error: 'We could not send the signup verification code. Please try again.' }, 503);
  }
}

async function signupVerify(request: Request, env: PasswordAuthEnv) {
  let body: { challengeId?: string; code?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const challengeId = String(body.challengeId || '');
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  if (!challengeId || code.length !== 6) return json({ error: 'Enter the 6-digit verification code.' }, 400);

  const row = await env.DB.prepare(`
    SELECT sv.*, e.employment_status AS existingStatus
    FROM signup_verifications sv
    LEFT JOIN employees e ON e.id = sv.existing_employee_id
    WHERE sv.id = ? LIMIT 1
  `).bind(challengeId).first<Record<string, unknown>>();
  if (!row || row.consumed_at || new Date(String(row.expires_at)).getTime() <= Date.now()) {
    return json({ error: 'This signup verification code is invalid or has expired. Start signup again.' }, 401);
  }
  if (Number(row.attempts) >= Number(row.max_attempts)) return json({ error: 'Too many verification attempts. Start signup again.' }, 429);

  const supplied = await codeHash(env, 'signup', challengeId, code);
  if (!constantTimeEqual(supplied, String(row.code_hash))) {
    await env.DB.prepare('UPDATE signup_verifications SET attempts = attempts + 1 WHERE id = ?').bind(challengeId).run();
    return json({ error: 'The verification code is incorrect.' }, 401);
  }

  const verifiedAt = new Date().toISOString();
  let employeeId = row.existing_employee_id ? String(row.existing_employee_id) : '';
  let accountStatus = row.existingStatus ? String(row.existingStatus) : 'provisional';

  try {
    if (employeeId) {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO employee_credentials (
            employee_id, username, password_hash, password_salt, password_algorithm,
            password_iterations, email_verified_at, password_changed_at
          ) VALUES (?, ?, ?, ?, 'PBKDF2-SHA256', ?, ?, ?)
        `).bind(employeeId, row.username, row.password_hash, row.password_salt, row.password_iterations, verifiedAt, verifiedAt),
        env.DB.prepare('UPDATE signup_verifications SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(challengeId),
      ]);
    } else {
      employeeId = uid('employee');
      const requestId = uid('signup');
      const membershipId = uid('membership');
      const roleId = uid('employee-role');
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO employees (id, display_name, legal_name, email, phone, job_title, department, employment_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'provisional')
        `).bind(employeeId, row.display_name, row.display_name, row.email, row.phone, row.job_title || null, row.department || null),
        env.DB.prepare(`
          INSERT INTO employee_credentials (
            employee_id, username, password_hash, password_salt, password_algorithm,
            password_iterations, email_verified_at, password_changed_at
          ) VALUES (?, ?, ?, ?, 'PBKDF2-SHA256', ?, ?, ?)
        `).bind(employeeId, row.username, row.password_hash, row.password_salt, row.password_iterations, verifiedAt, verifiedAt),
        env.DB.prepare(`
          INSERT INTO employee_company_memberships (id, employee_id, company_id, is_primary, active)
          VALUES (?, ?, ?, 1, 1)
        `).bind(membershipId, employeeId, row.company_id),
        env.DB.prepare(`
          INSERT INTO employee_roles (id, employee_id, company_id, role_id)
          VALUES (?, ?, ?, 'role-provisional')
        `).bind(roleId, employeeId, row.company_id),
        env.DB.prepare(`
          INSERT INTO signup_requests (
            id, employee_id, requested_company_id, requested_job_title, requested_department,
            requested_role_text, submitted_ip, submitted_user_agent, submitted_latitude, submitted_longitude
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          requestId, employeeId, row.company_id, row.job_title || null, row.department || null,
          row.requested_role_text || null, row.submitted_ip || null, row.submitted_user_agent || null,
          row.submitted_latitude || null, row.submitted_longitude || null,
        ),
        env.DB.prepare('UPDATE signup_verifications SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(challengeId),
      ]);
      accountStatus = 'provisional';
    }
  } catch {
    return json({ error: 'The account could not be completed because the username, email or phone is already in use.' }, 409);
  }

  await logSecurity(env, request, 'signup_verified', {
    employeeId, companyId: String(row.company_id), result: 'verified', details: { username: String(row.username), accountStatus },
  });

  return json({
    ok: true,
    username: String(row.username),
    status: accountStatus,
    message: accountStatus === 'active'
      ? 'Your identity is verified and your password login is ready. You can sign in now.'
      : 'Your email is verified and your password login is ready. Your employee role remains provisional until management approval.',
  });
}

async function login(request: Request, env: PasswordAuthEnv) {
  let body: {
    identifier?: string; password?: string; deviceFingerprint?: string; deviceName?: string; platform?: string;
    latitude?: number; longitude?: number; accuracy?: number;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const identifier = String(body.identifier || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!identifier || !password) return json({ error: 'Username/email and password are required.' }, 400);

  const row = await env.DB.prepare(`
    SELECT c.employee_id AS employeeId, c.username, c.password_hash AS passwordHash,
           c.password_salt AS passwordSalt, c.password_iterations AS passwordIterations,
           c.failed_attempts AS failedAttempts, c.locked_until AS lockedUntil,
           e.email, e.display_name AS displayName, e.employment_status AS status
    FROM employee_credentials c
    JOIN employees e ON e.id = c.employee_id
    WHERE LOWER(c.username) = LOWER(?) OR LOWER(e.email) = LOWER(?)
    LIMIT 1
  `).bind(identifier, identifier).first<{
    employeeId: string; username: string; passwordHash: string; passwordSalt: string; passwordIterations: number;
    failedAttempts: number; lockedUntil?: string; email?: string; displayName: string; status: string;
  }>();

  const genericError = 'The username/email or password is incorrect.';
  if (!row || !['active', 'provisional'].includes(row.status)) {
    await logSecurity(env, request, 'password_signin_failed', { severity: 'low', result: 'denied', details: { reason: 'unknown_or_inactive' } });
    return json({ error: genericError }, 401);
  }

  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
    await logSecurity(env, request, 'password_signin_locked', { employeeId: row.employeeId, severity: 'medium', result: 'denied' });
    return json({ error: 'This login is temporarily locked after repeated failed attempts. Try again later or use Forgot password.' }, 423);
  }

  const derived = await passwordHash(env, password, row.passwordSalt, Number(row.passwordIterations));
  if (!constantTimeEqual(derived, row.passwordHash)) {
    const limit = Number(await setting(env, 'security.password_lock_attempts', '5')) || 5;
    const lockMinutes = Number(await setting(env, 'security.password_lock_minutes', '15')) || 15;
    const failed = Number(row.failedAttempts || 0) + 1;
    const lockedUntil = failed >= limit ? new Date(Date.now() + lockMinutes * 60_000).toISOString() : null;
    await env.DB.prepare(`
      UPDATE employee_credentials SET failed_attempts = ?, locked_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = ?
    `).bind(failed >= limit ? 0 : failed, lockedUntil, row.employeeId).run();
    await logSecurity(env, request, 'password_signin_failed', {
      employeeId: row.employeeId, severity: lockedUntil ? 'high' : 'medium', result: 'denied',
      riskScore: lockedUntil ? 65 : 30, details: { failedAttempt: failed, locked: Boolean(lockedUntil) },
    });
    return json({ error: genericError }, 401);
  }

  // The Group Owner is a remote administrative role. Employee attendance geofences do not apply
  // after the Owner password has been verified. Password, lockout, session and audit controls remain active.
  const ownerLogin = String(row.email || '').trim().toLowerCase() === OWNER_LOGIN_EMAIL;
  const location = ownerLogin
    ? { ok: true as const, result: 'owner_remote_exempt', companyId: undefined }
    : await evaluateLocation(env, row.employeeId, body);
  if (!location.ok) {
    await logSecurity(env, request, 'signin_location_denied', {
      employeeId: row.employeeId, companyId: 'companyId' in location ? location.companyId : undefined,
      severity: location.code === 'OUTSIDE_LOGIN_GEOFENCE' ? 'high' : 'medium', result: 'denied',
      latitude: body.latitude, longitude: body.longitude, accuracy: body.accuracy,
      riskScore: location.code === 'OUTSIDE_LOGIN_GEOFENCE' ? 70 : 35,
      details: { code: location.code },
    });
    return json({ error: location.message, code: location.code }, 403);
  }

  const token = randomToken();
  const tokenHash = await sessionHash(env, token);
  const sessionId = uid('session');
  const hours = Number(await setting(env, 'security.session_hours', '12')) || 12;
  const expiresAt = new Date(Date.now() + hours * 60 * 60_000).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO auth_sessions (
        id, employee_id, token_hash, device_id, device_name, user_agent, ip_address,
        login_latitude, login_longitude, login_accuracy_m, login_location_label,
        login_geofence_result, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId, row.employeeId, tokenHash, body.deviceFingerprint || null, body.deviceName || null,
      request.headers.get('user-agent'), requestIp(request) || null, body.latitude ?? null,
      body.longitude ?? null, body.accuracy ?? null, requestLocationLabel(request) || null,
      location.result, expiresAt,
    ),
    env.DB.prepare(`
      UPDATE employee_credentials SET failed_attempts = 0, locked_until = NULL,
        last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?
    `).bind(row.employeeId),
  ]);

  if (body.deviceFingerprint) {
    await env.DB.prepare(`
      INSERT INTO employee_devices (id, employee_id, device_fingerprint, device_name, platform, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, device_fingerprint) DO UPDATE SET
        device_name = excluded.device_name, platform = excluded.platform,
        user_agent = excluded.user_agent, last_seen_at = CURRENT_TIMESTAMP
    `).bind(uid('device'), row.employeeId, body.deviceFingerprint, body.deviceName || null, body.platform || null, request.headers.get('user-agent')).run();
  }

  await logSecurity(env, request, 'password_signin_success', {
    employeeId: row.employeeId, companyId: location.companyId, sessionId, result: 'success',
    latitude: body.latitude, longitude: body.longitude, accuracy: body.accuracy,
    details: { username: row.username, deviceFingerprint: body.deviceFingerprint || null },
  });

  const cookie = sessionCookie(request, token, hours * 3600);
  return json({ ok: true, message: 'Sign-in successful.' }, 200, { 'set-cookie': cookie });
}

async function forgotPassword(request: Request, env: PasswordAuthEnv) {
  let body: { identifier?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const identifier = String(body.identifier || '').trim().toLowerCase();
  if (!identifier) return json({ error: 'Enter your username or email address.' }, 400);
  if ((!env.EMAIL || typeof env.EMAIL.send !== 'function') && env.APP_STAGE !== 'bootstrap') {
    return json({ error: 'Password recovery email is temporarily unavailable. Please contact the system administrator.' }, 503);
  }

  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM security_logs
    WHERE ip_address = ? AND event_type = 'password_reset_requested'
      AND datetime(occurred_at) >= datetime('now','-15 minutes')
  `).bind(requestIp(request) || '').first<{ count: number }>();
  if (Number(recent?.count || 0) >= 5) return json({ error: 'Too many recovery requests. Wait 15 minutes and try again.' }, 429);

  const challengeId = uid('password-reset');
  const employee = await env.DB.prepare(`
    SELECT e.id, e.email, e.display_name AS displayName
    FROM employee_credentials c JOIN employees e ON e.id = c.employee_id
    WHERE (LOWER(c.username) = LOWER(?) OR LOWER(e.email) = LOWER(?))
      AND e.employment_status IN ('active','provisional')
    LIMIT 1
  `).bind(identifier, identifier).first<{ id: string; email?: string; displayName: string }>();

  if (employee?.email) {
    const code = randomCode();
    const digest = await codeHash(env, 'password-reset', challengeId, code);
    const minutes = Number(await setting(env, 'security.password_reset_code_minutes', '10')) || 10;
    const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
    await env.DB.prepare(`
      INSERT INTO password_reset_challenges (
        id, employee_id, code_hash, requested_ip, requested_user_agent, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(challengeId, employee.id, digest, requestIp(request) || null, request.headers.get('user-agent'), expiresAt).run();

    try {
      const delivery = await sendCode(env, { to: employee.email, name: employee.displayName, code, purpose: 'reset' });
      await logSecurity(env, request, 'password_reset_requested', {
        employeeId: employee.id, result: delivery.delivered ? 'delivered' : 'bootstrap', details: { destination: maskEmail(employee.email) },
      });
      return json({
        ok: true, challengeId, destination: 'your email on file',
        ...(delivery.bootstrapCode ? { bootstrapCode: delivery.bootstrapCode } : {}),
        message: 'If the account details match an employee login, a password reset verification code has been sent to the email on file.',
      });
    } catch {
      await env.DB.prepare('DELETE FROM password_reset_challenges WHERE id = ?').bind(challengeId).run();
    }
  }

  await logSecurity(env, request, 'password_reset_requested', { result: 'generic', details: { accountMatched: Boolean(employee) } });
  return json({
    ok: true, challengeId, destination: 'your email on file',
    message: 'If the account details match an employee login, a password reset verification code has been sent to the email on file.',
  });
}

async function verifyReset(request: Request, env: PasswordAuthEnv) {
  let body: { challengeId?: string; code?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const challengeId = String(body.challengeId || '');
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  if (!challengeId || code.length !== 6) return json({ error: 'Enter the 6-digit verification code.' }, 400);

  const row = await env.DB.prepare(`
    SELECT * FROM password_reset_challenges WHERE id = ? LIMIT 1
  `).bind(challengeId).first<Record<string, unknown>>();
  if (!row || row.consumed_at || new Date(String(row.expires_at)).getTime() <= Date.now()) {
    return json({ error: 'This password reset verification is invalid or has expired.' }, 401);
  }
  if (Number(row.attempts) >= Number(row.max_attempts)) return json({ error: 'Too many verification attempts. Start password recovery again.' }, 429);

  const supplied = await codeHash(env, 'password-reset', challengeId, code);
  if (!constantTimeEqual(supplied, String(row.code_hash))) {
    await env.DB.prepare('UPDATE password_reset_challenges SET attempts = attempts + 1 WHERE id = ?').bind(challengeId).run();
    await logSecurity(env, request, 'password_reset_code_failed', { employeeId: String(row.employee_id), severity: 'medium', result: 'denied' });
    return json({ error: 'The verification code is incorrect.' }, 401);
  }

  const resetToken = randomToken();
  const tokenHash = await resetTokenHash(env, resetToken);
  const minutes = Number(await setting(env, 'security.password_reset_token_minutes', '10')) || 10;
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  await env.DB.prepare(`
    UPDATE password_reset_challenges SET verified_at = CURRENT_TIMESTAMP,
      reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?
  `).bind(tokenHash, expiresAt, challengeId).run();

  await logSecurity(env, request, 'password_reset_identity_verified', {
    employeeId: String(row.employee_id), result: 'verified',
  });
  return json({ ok: true, resetToken, expiresAt, message: 'Identity verified. You can now create a new password.' });
}

async function resetPassword(request: Request, env: PasswordAuthEnv) {
  let body: { resetToken?: string; newPassword?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const resetToken = String(body.resetToken || '');
  const newPassword = String(body.newPassword || '');
  if (!resetToken || !newPassword) return json({ error: 'Reset authorization and a new password are required.' }, 400);

  const tokenHash = await resetTokenHash(env, resetToken);
  const row = await env.DB.prepare(`
    SELECT pr.id, pr.employee_id AS employeeId, c.username,
           c.password_hash AS currentHash, c.password_salt AS currentSalt,
           c.password_iterations AS currentIterations
    FROM password_reset_challenges pr
    JOIN employee_credentials c ON c.employee_id = pr.employee_id
    WHERE pr.reset_token_hash = ? AND pr.verified_at IS NOT NULL AND pr.consumed_at IS NULL
      AND datetime(pr.reset_token_expires_at) > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first<{
    id: string; employeeId: string; username: string; currentHash: string; currentSalt: string; currentIterations: number;
  }>();
  if (!row) return json({ error: 'This password reset authorization is invalid or has expired. Start again.' }, 401);

  const errors = await validatePassword(env, newPassword, row.username);
  if (errors.length) return json({ error: 'New password does not meet the security requirements.', passwordErrors: errors }, 400);

  const sameHash = await passwordHash(env, newPassword, row.currentSalt, Number(row.currentIterations));
  if (constantTimeEqual(sameHash, row.currentHash)) return json({ error: 'Choose a new password that is different from your current password.' }, 400);

  const iterations = Number(await setting(env, 'security.password_pbkdf2_iterations', '310000')) || 310000;
  const salt = bytesToHex(randomBytes(16));
  const derived = await passwordHash(env, newPassword, salt, iterations);
  const changedAt = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE employee_credentials SET password_hash = ?, password_salt = ?, password_algorithm = 'PBKDF2-SHA256',
        password_iterations = ?, password_changed_at = ?, failed_attempts = 0, locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE employee_id = ?
    `).bind(derived, salt, iterations, changedAt, row.employeeId),
    env.DB.prepare(`UPDATE password_reset_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(row.id),
    env.DB.prepare(`UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ? AND revoked_at IS NULL`).bind(row.employeeId),
  ]);

  await logSecurity(env, request, 'password_reset_completed', { employeeId: row.employeeId, severity: 'info', result: 'success' });
  return json({ ok: true, message: 'Your password has been reset. For security, existing sessions were signed out. Sign in with your new password.' });
}

export async function routePasswordAuth(request: Request, env: PasswordAuthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/auth/login' && request.method === 'POST') return login(request, env);
  if (url.pathname === '/api/auth/signup/start' && request.method === 'POST') return signupStart(request, env);
  if (url.pathname === '/api/auth/signup/verify' && request.method === 'POST') return signupVerify(request, env);
  if (url.pathname === '/api/auth/password/forgot' && request.method === 'POST') return forgotPassword(request, env);
  if (url.pathname === '/api/auth/password/verify-reset' && request.method === 'POST') return verifyReset(request, env);
  if (url.pathname === '/api/auth/password/reset' && request.method === 'POST') return resetPassword(request, env);

  // Legacy OTP login is intentionally retired. OTP is now reserved for signup verification
  // and forgot-password identity verification, as required by the Workforce access policy.
  if (
    (url.pathname === '/api/auth/request' || url.pathname === '/api/auth/verify' || url.pathname === '/api/auth/signup') &&
    request.method === 'POST'
  ) {
    return json({
      error: 'This authentication flow has been retired. Use username/email and password to sign in. One-time codes are used only for signup verification and password recovery.',
    }, 410);
  }
  return null;
}
