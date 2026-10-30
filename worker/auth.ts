export interface AuthEnv {
  DB: D1Database;
  APP_NAME: string;
  APP_STAGE: string;
  AUTH_PEPPER?: string;
  AUTH_DELIVERY_URL?: string;
  AUTH_DELIVERY_TOKEN?: string;
}

export type AccessLevel = 'none' | 'view' | 'create' | 'edit' | 'approve' | 'manage';

export interface SessionContext {
  sessionId: string;
  employee: {
    id: string;
    employeeNo?: string;
    displayName: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    department?: string;
    status: string;
    preferredTheme?: string;
    timezone?: string;
  };
  companies: Array<{ id: string; code: string; name: string; locationId?: string; primary: boolean }>;
  roles: Array<{ id: string; code: string; name: string; companyId: string }>;
  permissions: Record<string, AccessLevel>;
  companyPermissions: Record<string, Record<string, AccessLevel>>;
}

const SESSION_COOKIE = 'daenem_workforce_session';
const encoder = new TextEncoder();
const levels: AccessLevel[] = ['none', 'view', 'create', 'edit', 'approve', 'manage'];

export function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

function responseJson(body: Record<string, unknown> | unknown[], status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  h.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: h });
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bytesToBase64Url(buffer);
}

function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `+234${digits.slice(1)}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return raw;
}

function maskDestination(value: string, channel: string) {
  if (channel === 'email') {
    const [name, domain] = value.split('@');
    if (!domain) return 'email on file';
    return `${name.slice(0, 2)}***@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `***${digits.slice(-4)}` : 'phone on file';
}

export function requestIp(request: Request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
}

export function requestLocationLabel(request: Request) {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  return cf?.city ? `${cf.city}${cf.region ? `, ${cf.region}` : ''}${cf.country ? `, ${cf.country}` : ''}` : undefined;
}

function parseCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

async function appSetting(env: AuthEnv, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').bind(key).first<{ setting_value: string }>();
  return row?.setting_value ?? fallback;
}

function pepper(env: AuthEnv) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}

async function hashCode(env: AuthEnv, challengeId: string, code: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return sha256(`${challengeId}:${code}:${secret}`);
}

async function hashSession(env: AuthEnv, token: string) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return sha256(`${token}:${secret}`);
}

export async function logSecurity(
  env: AuthEnv,
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
  ).run();
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (n: number) => n * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loginLocationPolicy(env: AuthEnv, employeeId: string) {
  return env.DB.prepare(`
    SELECT
      m.company_id AS companyId,
      m.location_id AS locationId,
      cl.latitude, cl.longitude,
      COALESCE(ap.geofence_radius_m, cl.geofence_radius_m, 150) AS radiusM,
      COALESCE(ap.require_login_location, 0) AS requireLoginLocation
    FROM employee_company_memberships m
    LEFT JOIN company_locations cl ON cl.id = m.location_id
    LEFT JOIN attendance_policies ap
      ON ap.company_id = m.company_id
      AND ap.active = 1
      AND (ap.location_id IS NULL OR ap.location_id = m.location_id)
    WHERE m.employee_id = ? AND m.active = 1
    ORDER BY m.is_primary DESC, ap.location_id IS NOT NULL DESC
    LIMIT 1
  `).bind(employeeId).first<{
    companyId: string;
    locationId?: string;
    latitude?: number;
    longitude?: number;
    radiusM: number;
    requireLoginLocation: number;
  }>();
}

async function evaluateLoginLocation(
  env: AuthEnv,
  employeeId: string,
  latitude?: number,
  longitude?: number,
  accuracy?: number,
) {
  const policy = await loginLocationPolicy(env, employeeId);
  const globalMode = await appSetting(env, 'security.login_location_mode', 'record');
  const enforced = globalMode === 'enforce' || Boolean(policy?.requireLoginLocation);

  if (enforced && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    return { ok: false, code: 'LOCATION_REQUIRED', message: 'Location is required to sign in for this employee.' } as const;
  }

  if (
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Number.isFinite(policy?.latitude) && Number.isFinite(policy?.longitude)
  ) {
    const distance = distanceMeters(latitude!, longitude!, policy!.latitude!, policy!.longitude!);
    const radius = Number(policy?.radiusM || 150);
    const inside = distance <= radius + Math.max(Number(accuracy || 0), 0);
    if (enforced && !inside) {
      return {
        ok: false,
        code: 'OUTSIDE_LOGIN_GEOFENCE',
        message: 'Sign-in is not allowed from the current location.',
        companyId: policy?.companyId,
        distance: Math.round(distance),
        radius,
      } as const;
    }
    return { ok: true, result: inside ? 'inside' : 'outside', companyId: policy?.companyId, distance: Math.round(distance), radius } as const;
  }

  return { ok: true, result: enforced ? 'unknown' : 'not_required', companyId: policy?.companyId } as const;
}

async function deliverCode(env: AuthEnv, channel: string, destination: string, code: string, name: string) {
  if (!env.AUTH_DELIVERY_URL) return false;
  const response = await fetch(env.AUTH_DELIVERY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.AUTH_DELIVERY_TOKEN ? { authorization: `Bearer ${env.AUTH_DELIVERY_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      channel,
      to: destination,
      subject: 'Your Daenem Workforce Hub sign-in code',
      text: `Hello ${name}, your Daenem Workforce Hub security code is ${code}. It expires shortly. Do not share this code.`,
      app: 'Daenem Workforce Hub',
    }),
  });
  return response.ok;
}

async function findEmployee(env: AuthEnv, identity: string) {
  const email = identity.trim().toLowerCase();
  const phone = normalizePhone(identity);
  return env.DB.prepare(`
    SELECT id, employee_no AS employeeNo, display_name AS displayName, email, phone,
           job_title AS jobTitle, department, employment_status AS status, preferred_theme AS preferredTheme
    FROM employees
    WHERE LOWER(email) = ? OR phone = ?
    LIMIT 1
  `).bind(email, phone).first<{
    id: string;
    employeeNo?: string;
    displayName: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    department?: string;
    status: string;
    preferredTheme?: string;
  }>();
}

// Keep legacy OTP entry points aligned with the current session policy.
// Pending applicants retain the administrator-defined provisional workspace.
export async function signupSessionBlocked(env: AuthEnv, employeeId: string): Promise<boolean> {
  const latest = await env.DB.prepare(
    "SELECT status FROM signup_requests WHERE employee_id=? ORDER BY created_at DESC,id DESC LIMIT 1"
  ).bind(employeeId).first<{ status: string }>();
  return Boolean(latest && ['rejected', 'cancelled', 'expired'].includes(latest.status));
}

async function requestSignIn(request: Request, env: AuthEnv) {
  let body: { identity?: string; channel?: 'email' | 'sms'; latitude?: number; longitude?: number; accuracy?: number };
  try { body = await request.json(); } catch { return responseJson({ error: 'Invalid request body.' }, 400); }

  const identity = String(body.identity || '').trim();
  const channel = body.channel === 'sms' ? 'sms' : 'email';
  if (!identity) return responseJson({ error: 'Work email or phone number is required.' }, 400);

  const employee = await findEmployee(env, identity);
  if (!employee || !['active', 'provisional'].includes(employee.status)) {
    await logSecurity(env, request, 'signin_unknown_identity', { severity: 'low', result: 'denied' });
    return responseJson({ error: 'No active or provisional employee account matches those details.' }, 404);
  }
  if (await signupSessionBlocked(env, employee.id)) {
    return responseJson({ error: 'Your application is not eligible for sign-in.' }, 403);
  }

  const location = await evaluateLoginLocation(env, employee.id, body.latitude, body.longitude, body.accuracy);
  if (!location.ok) {
    await logSecurity(env, request, 'signin_location_denied', {
      employeeId: employee.id,
      companyId: 'companyId' in location ? location.companyId : undefined,
      severity: location.code === 'OUTSIDE_LOGIN_GEOFENCE' ? 'high' : 'medium',
      result: 'denied', latitude: body.latitude, longitude: body.longitude, accuracy: body.accuracy,
      riskScore: location.code === 'OUTSIDE_LOGIN_GEOFENCE' ? 70 : 35,
      details: { code: location.code, ...('distance' in location ? { distanceM: location.distance, radiusM: location.radius } : {}) },
    });
    return responseJson({ error: location.message, code: location.code }, 403);
  }

  const destination = channel === 'sms' ? employee.phone : employee.email;
  if (!destination) return responseJson({ error: `This employee does not have a verified ${channel === 'sms' ? 'phone number' : 'email address'} on file.` }, 400);

  const challengeId = uid('challenge');
  const code = randomCode();
  const codeHash = await hashCode(env, challengeId, code);
  const maxAttempts = Number(await appSetting(env, 'security.max_auth_attempts', '6')) || 6;
  const minutes = Number(await appSetting(env, 'security.auth_code_minutes', '10')) || 10;
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();

  await env.DB.prepare(`
    INSERT INTO auth_challenges (
      id, employee_id, channel, destination_masked, code_hash, max_attempts,
      requested_ip, requested_user_agent, requested_latitude, requested_longitude,
      requested_accuracy_m, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    challengeId, employee.id, channel, maskDestination(destination, channel), codeHash, maxAttempts,
    requestIp(request) || null, request.headers.get('user-agent'), body.latitude ?? null,
    body.longitude ?? null, body.accuracy ?? null, expiresAt,
  ).run();

  let delivered = false;
  try { delivered = await deliverCode(env, channel, destination, code, employee.displayName); } catch { delivered = false; }

  await logSecurity(env, request, 'signin_code_requested', {
    employeeId: employee.id, companyId: location.companyId, result: delivered ? 'delivered' : 'created',
    latitude: body.latitude, longitude: body.longitude, accuracy: body.accuracy,
    details: { channel, geofenceResult: location.result, deliveryConfigured: Boolean(env.AUTH_DELIVERY_URL), delivered },
  });

  if (env.APP_STAGE === 'production' && !delivered) {
    return responseJson({ error: 'The sign-in code delivery service is not configured. Contact the system administrator.' }, 503);
  }

  return responseJson({
    ok: true,
    challengeId,
    expiresAt,
    destination: maskDestination(destination, channel),
    delivered,
    ...(env.APP_STAGE !== 'production' ? { bootstrapCode: code } : {}),
  });
}

async function verifySignIn(request: Request, env: AuthEnv) {
  let body: { challengeId?: string; code?: string; deviceFingerprint?: string; deviceName?: string; platform?: string };
  try { body = await request.json(); } catch { return responseJson({ error: 'Invalid request body.' }, 400); }

  const challengeId = String(body.challengeId || '');
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  if (!challengeId || code.length !== 6) return responseJson({ error: 'Challenge ID and 6-digit code are required.' }, 400);

  const row = await env.DB.prepare(`
    SELECT c.*, e.display_name AS displayName, e.employment_status AS employeeStatus
    FROM auth_challenges c JOIN employees e ON e.id = c.employee_id
    WHERE c.id = ? LIMIT 1
  `).bind(challengeId).first<Record<string, unknown>>();

  if (!row || row.consumed_at || new Date(String(row.expires_at)).getTime() <= Date.now()) {
    return responseJson({ error: 'This security code is invalid or has expired.' }, 401);
  }
  if (Number(row.attempts) >= Number(row.max_attempts)) return responseJson({ error: 'Too many attempts. Request a new security code.' }, 429);

  const supplied = await hashCode(env, challengeId, code);
  if (supplied !== row.code_hash) {
    await env.DB.prepare('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?').bind(challengeId).run();
    await logSecurity(env, request, 'signin_code_failed', {
      employeeId: String(row.employee_id), severity: 'medium', result: 'denied', riskScore: 35,
      details: { challengeId },
    });
    return responseJson({ error: 'The security code is incorrect.' }, 401);
  }

  if (!['active', 'provisional'].includes(String(row.employeeStatus))) {
    return responseJson({ error: 'This employee account is not allowed to sign in.' }, 403);
  }
  // Management status can change after this OTP was issued.
  if (await signupSessionBlocked(env, String(row.employee_id))) {
    return responseJson({ error: 'Your application is not eligible for sign-in.' }, 403);
  }

  const token = randomToken();
  const tokenHash = await hashSession(env, token);
  const sessionId = uid('session');
  const hours = Number(await appSetting(env, 'security.session_hours', '12')) || 12;
  const expiresAt = new Date(Date.now() + hours * 60 * 60_000).toISOString();

  await env.DB.batch([
    env.DB.prepare('UPDATE auth_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(challengeId),
    env.DB.prepare(`
      INSERT INTO auth_sessions (
        id, employee_id, token_hash, device_id, device_name, user_agent, ip_address,
        login_latitude, login_longitude, login_accuracy_m, login_location_label,
        login_geofence_result, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId, row.employee_id, tokenHash, body.deviceFingerprint || null, body.deviceName || null,
      request.headers.get('user-agent'), requestIp(request) || null, row.requested_latitude || null,
      row.requested_longitude || null, row.requested_accuracy_m || null, requestLocationLabel(request) || null,
      row.requested_latitude != null ? 'inside' : 'not_required', expiresAt,
    ),
  ]);

  if (body.deviceFingerprint) {
    const deviceId = uid('device');
    await env.DB.prepare(`
      INSERT INTO employee_devices (id, employee_id, device_fingerprint, device_name, platform, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, device_fingerprint) DO UPDATE SET
        device_name = excluded.device_name,
        platform = excluded.platform,
        user_agent = excluded.user_agent,
        last_seen_at = CURRENT_TIMESTAMP
    `).bind(deviceId, row.employee_id, body.deviceFingerprint, body.deviceName || null, body.platform || null, request.headers.get('user-agent')).run();
  }

  await logSecurity(env, request, 'signin_success', {
    employeeId: String(row.employee_id), sessionId, result: 'success',
    latitude: row.requested_latitude as number | undefined,
    longitude: row.requested_longitude as number | undefined,
    accuracy: row.requested_accuracy_m as number | undefined,
    details: { deviceFingerprint: body.deviceFingerprint || null },
  });

  const cookie = sessionCookie(request, token, hours * 3600);
  const context = await sessionContextFromId(env, sessionId);
  return responseJson({ ok: true, context }, 200, { 'set-cookie': cookie });
}

export async function sessionContextFromId(env: AuthEnv, sessionId: string): Promise<SessionContext | null> {
  const base = await env.DB.prepare(`
    SELECT s.id AS sessionId, e.id, e.employee_no AS employeeNo, e.display_name AS displayName,
           e.email, e.phone, e.job_title AS jobTitle, e.department,
           e.employment_status AS status, COALESCE(ep.theme, e.preferred_theme) AS preferredTheme, ep.timezone AS timezone
    FROM auth_sessions s
    JOIN employees e ON e.id = s.employee_id
    LEFT JOIN employee_preferences ep ON ep.employee_id = e.id
    WHERE s.id = ? AND s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
      AND e.employment_status IN ('active','provisional')
    LIMIT 1
  `).bind(sessionId).first<Record<string, unknown>>();
  if (!base) return null;

  const employeeId = String(base.id);
  const provisional = String(base.status) === 'provisional';
  // Existing sessions immediately lose access after an application is rejected,
  // cancelled or expired, irrespective of authentication provider.
  if (await signupSessionBlocked(env, employeeId)) return null;
  const companiesResult = await env.DB.prepare(`
    SELECT c.id, c.code, c.name, m.location_id AS locationId, m.is_primary AS isPrimary
    FROM employee_company_memberships m JOIN companies c ON c.id = m.company_id
    WHERE m.employee_id = ? AND m.active = 1 AND c.active = 1
    ORDER BY m.is_primary DESC, c.name
  `).bind(employeeId).all<Record<string, unknown>>();

  const rolesResult = await env.DB.prepare(`
    SELECT r.id, r.code, r.name, er.company_id AS companyId
    FROM employee_roles er JOIN roles r ON r.id = er.role_id
    WHERE er.employee_id = ? AND r.active = 1
      AND (? <> 'provisional' OR er.role_id = 'role-provisional')
      AND (r.company_id IS NULL OR r.company_id = er.company_id)
      AND (r.code <> 'owner' OR r.company_id IS NULL)
      -- A group-level role remains assigned *through* er.company_id. Even
      -- with r.company_id NULL, it cannot survive revocation of that exact
      -- assigned company's membership. This matches Group authority checks.
      AND EXISTS (
        SELECT 1 FROM employee_company_memberships m
        JOIN companies c ON c.id = m.company_id
        WHERE m.employee_id = er.employee_id AND m.company_id = er.company_id
          AND m.active = 1 AND c.active = 1
      )
    ORDER BY r.is_system DESC, r.name
  `).bind(employeeId, String(base.status)).all<Record<string, unknown>>();

  if (provisional && !(rolesResult.results || []).some(role => role.id === 'role-provisional')) {
    return null;
  }

  const permissionRows = await env.DB.prepare(`
    SELECT er.company_id AS companyId, p.code, rp.access_level AS accessLevel
    FROM employee_roles er
    JOIN roles r ON r.id = er.role_id AND r.active = 1
    JOIN role_permissions rp ON rp.role_id = er.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE er.employee_id = ?
      AND (? <> 'provisional' OR er.role_id = 'role-provisional')
      AND (r.company_id IS NULL OR r.company_id = er.company_id)
  `).bind(employeeId, String(base.status)).all<{ companyId?: string; code: string; accessLevel: AccessLevel }>();

  const legacyOverrides = await env.DB.prepare(`
    SELECT p.code, o.access_level AS accessLevel
    FROM employee_permission_overrides o
    JOIN permissions p ON p.id = o.permission_id
    WHERE o.employee_id = ? AND (o.expires_at IS NULL OR datetime(o.expires_at) > datetime('now'))
  `).bind(employeeId).all<{ code: string; accessLevel: AccessLevel }>();

  const scopedOverrides = await env.DB.prepare(`
    SELECT o.company_id AS companyId, p.code, o.access_level AS accessLevel
    FROM employee_permission_overrides_v2 o
    JOIN permissions p ON p.id = o.permission_id
    WHERE o.employee_id = ? AND (o.expires_at IS NULL OR datetime(o.expires_at) > datetime('now'))
  `).bind(employeeId).all<{ companyId?: string; code: string; accessLevel: AccessLevel }>();

  const companyIds = (companiesResult.results || []).map((row) => String(row.id));
  const companyPermissions: Record<string, Record<string, AccessLevel>> = Object.fromEntries(
    companyIds.map((companyId) => [companyId, {}]),
  );

  for (const row of permissionRows.results || []) {
    const targets = row.companyId ? [String(row.companyId)] : companyIds;
    for (const companyId of targets) {
      if (!companyPermissions[companyId]) continue;
      const current = companyPermissions[companyId][row.code] || 'none';
      if (levels.indexOf(row.accessLevel) > levels.indexOf(current)) {
        companyPermissions[companyId][row.code] = row.accessLevel;
      }
    }
  }

  // Legacy overrides were group-wide. Preserve them while applying them to every
  // assigned business so the client never has to infer cross-business access.
  for (const row of legacyOverrides.results || []) {
    // Individual overrides may revoke provisional permissions but must never
    // elevate them beyond the administrator-defined Provisional role.
    if (provisional && row.accessLevel !== 'none') continue;
    for (const companyId of companyIds) companyPermissions[companyId][row.code] = row.accessLevel;
  }

  // Scoped overrides are applied last. An explicit "none" therefore wins for
  // the selected business even when another role grants the same permission.
  for (const row of scopedOverrides.results || []) {
    if (provisional && row.accessLevel !== 'none') continue;
    const targets = row.companyId ? [String(row.companyId)] : companyIds;
    for (const companyId of targets) {
      if (companyPermissions[companyId]) companyPermissions[companyId][row.code] = row.accessLevel;
    }
  }

  // Provisional workspace access exists for employee profile setup; if an
  // administrator removes Profile Edit, an existing session loses access.
  if (provisional && !companyIds.some(companyId =>
    levels.indexOf(companyPermissions[companyId]?.['profile.access'] || 'none') >= levels.indexOf('edit')
  )) return null;

  const permissions: Record<string, AccessLevel> = {};
  for (const companyAccess of Object.values(companyPermissions)) {
    for (const [code, accessLevel] of Object.entries(companyAccess)) {
      const current = permissions[code] || 'none';
      if (levels.indexOf(accessLevel) > levels.indexOf(current)) permissions[code] = accessLevel;
    }
  }

  return {
    sessionId: String(base.sessionId),
    employee: {
      id: employeeId,
      employeeNo: base.employeeNo ? String(base.employeeNo) : undefined,
      displayName: String(base.displayName),
      email: base.email ? String(base.email) : undefined,
      phone: base.phone ? String(base.phone) : undefined,
      jobTitle: base.jobTitle ? String(base.jobTitle) : undefined,
      department: base.department ? String(base.department) : undefined,
      status: String(base.status),
      preferredTheme: base.preferredTheme ? String(base.preferredTheme) : undefined,
      timezone: base.timezone ? String(base.timezone) : undefined,
    },
    companies: (companiesResult.results || []).map((row) => ({
      id: String(row.id), code: String(row.code), name: String(row.name),
      locationId: row.locationId ? String(row.locationId) : undefined,
      primary: Boolean(row.isPrimary),
    })),
    roles: (rolesResult.results || []).map((row) => ({
      id: String(row.id), code: String(row.code), name: String(row.name), companyId: String(row.companyId),
    })),
    permissions,
    companyPermissions,
  };
}

export async function getSessionContext(request: Request, env: AuthEnv): Promise<SessionContext | null> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashSession(env, token);
  const session = await env.DB.prepare(`
    SELECT id FROM auth_sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first<{ id: string }>();
  if (!session) return null;
  await env.DB.prepare('UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(session.id).run();
  return sessionContextFromId(env, session.id);
}

export function hasPermission(context: SessionContext, code: string, minimum: AccessLevel = 'view', companyId?: string | null) {
  const granted = companyId
    ? context.companyPermissions[companyId]?.[code] || 'none'
    : context.permissions[code] || 'none';
  return levels.indexOf(granted) >= levels.indexOf(minimum);
}

async function signup(request: Request, env: AuthEnv) {
  const allowed = await appSetting(env, 'portal.allow_self_signup', 'true');
  if (allowed !== 'true') return responseJson({ error: 'Employee self-signup is currently disabled.' }, 403);

  let body: {
    displayName?: string; email?: string; phone?: string; companyCode?: string;
    jobTitle?: string; department?: string; requestedRole?: string;
    latitude?: number; longitude?: number;
  };
  try { body = await request.json(); } catch { return responseJson({ error: 'Invalid request body.' }, 400); }

  const displayName = String(body.displayName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = normalizePhone(String(body.phone || ''));
  const companyCode = String(body.companyCode || '').trim().toUpperCase();
  if (displayName.length < 3 || !email.includes('@') || phone.length < 8 || !companyCode) {
    return responseJson({ error: 'Full name, valid email, phone number and company are required.' }, 400);
  }

  const company = await env.DB.prepare('SELECT id, name FROM companies WHERE code = ? AND active = 1').bind(companyCode).first<{ id: string; name: string }>();
  if (!company) return responseJson({ error: 'Select a valid Daenem company.' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM employees WHERE LOWER(email) = ? OR phone = ? LIMIT 1').bind(email, phone).first<{ id: string }>();
  if (existing) return responseJson({ error: 'An employee account already exists with this email or phone number.' }, 409);

  const employeeId = uid('employee');
  const requestId = uid('signup');
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO employees (id, display_name, legal_name, email, phone, job_title, department, employment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'provisional')
    `).bind(employeeId, displayName, displayName, email, phone, body.jobTitle || null, body.department || null),
    env.DB.prepare(`
      INSERT INTO employee_company_memberships (id, employee_id, company_id, is_primary, active)
      VALUES (?, ?, ?, 1, 1)
    `).bind(uid('membership'), employeeId, company.id),
    env.DB.prepare(`
      INSERT INTO employee_roles (id, employee_id, company_id, role_id)
      VALUES (?, ?, ?, 'role-provisional')
    `).bind(uid('employee-role'), employeeId, company.id),
    env.DB.prepare(`
      INSERT INTO signup_requests (
        id, employee_id, requested_company_id, requested_job_title, requested_department,
        requested_role_text, submitted_ip, submitted_user_agent, submitted_latitude, submitted_longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      requestId, employeeId, company.id, body.jobTitle || null, body.department || null,
      body.requestedRole || null, requestIp(request) || null, request.headers.get('user-agent'),
      body.latitude ?? null, body.longitude ?? null,
    ),
  ]);

  await logSecurity(env, request, 'employee_self_signup', {
    employeeId, companyId: company.id, result: 'pending_approval',
    latitude: body.latitude, longitude: body.longitude,
    details: { company: company.name, requestedRole: body.requestedRole || null },
  });

  return responseJson({
    ok: true,
    requestId,
    status: 'pending',
    message: 'Your provisional employee account was created. Management must approve your role and work permissions.',
  }, 201);
}

async function publicCompanies(env: AuthEnv) {
  const result = await env.DB.prepare('SELECT code, name FROM companies WHERE active = 1 ORDER BY name').all<{ code: string; name: string }>();
  return responseJson({ companies: result.results || [] });
}

async function pendingSignups(request: Request, env: AuthEnv, context: SessionContext) {
  const requestedCompanyId = new URL(request.url).searchParams.get('companyId');
  const allowedCompanyIds = context.companies
    .filter((company) => hasPermission(context, 'users.access', 'view', company.id))
    .map((company) => company.id);
  if (!allowedCompanyIds.length) return responseJson({ error: 'You do not have permission to view employee approvals.' }, 403);
  if (requestedCompanyId && !allowedCompanyIds.includes(requestedCompanyId)) {
    return responseJson({ error: 'Employee approvals are not assigned for this business.' }, 403);
  }
  const companyIds = requestedCompanyId ? [requestedCompanyId] : allowedCompanyIds;
  const placeholders = companyIds.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT sr.id, sr.status, sr.created_at AS createdAt, sr.requested_job_title AS requestedJobTitle,
           sr.requested_department AS requestedDepartment, sr.requested_role_text AS requestedRole,
           e.id AS employeeId, e.display_name AS displayName, e.email, e.phone,
           c.id AS companyId, c.code AS companyCode, c.name AS companyName
    FROM signup_requests sr
    JOIN employees e ON e.id = sr.employee_id
    JOIN companies c ON c.id = sr.requested_company_id
    WHERE sr.status = 'pending' AND sr.requested_company_id IN (${placeholders})
    ORDER BY sr.created_at DESC
  `).bind(...companyIds).all<Record<string, unknown>>();
  return responseJson({ requests: result.results || [] });
}

async function approveSignup(request: Request, env: AuthEnv, context: SessionContext) {
  let body: { requestId?: string; roleId?: string; notes?: string };
  try { body = await request.json(); } catch { return responseJson({ error: 'Invalid request body.' }, 400); }
  if (!body.requestId || !body.roleId) return responseJson({ error: 'Request and role are required.' }, 400);

  const signupRequest = await env.DB.prepare(`
    SELECT sr.id, sr.employee_id AS employeeId, sr.requested_company_id AS companyId,
           sr.requested_job_title AS jobTitle, sr.requested_department AS department,
           r.id AS roleId
    FROM signup_requests sr
    JOIN roles r ON r.id = ? AND r.active = 1
    WHERE sr.id = ? AND sr.status = 'pending'
      AND (r.company_id IS NULL OR r.company_id = sr.requested_company_id)
    LIMIT 1
  `).bind(body.roleId, body.requestId).first<Record<string, unknown>>();
  if (!signupRequest) return responseJson({ error: 'Pending request or compatible role was not found.' }, 404);

  const employeeId = String(signupRequest.employeeId);
  const companyId = String(signupRequest.companyId);
  if (!context.companies.some((company) => company.id === companyId) || !hasPermission(context, 'users.access', 'manage', companyId)) {
    return responseJson({ error: 'Manage Users permission is required for this business.' }, 403);
  }
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE signup_requests SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
        review_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(context.employee.id, body.notes || null, body.requestId),
    env.DB.prepare(`
      UPDATE employees SET employment_status = 'active', job_title = COALESCE(?, job_title),
        department = COALESCE(?, department), updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(signupRequest.jobTitle || null, signupRequest.department || null, employeeId),
    env.DB.prepare(`DELETE FROM employee_roles WHERE employee_id = ? AND company_id = ? AND role_id = 'role-provisional'`).bind(employeeId, companyId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO employee_roles (id, employee_id, company_id, role_id, assigned_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(uid('employee-role'), employeeId, companyId, body.roleId, context.employee.id),
  ]);

  await env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source)
    VALUES (?, ?, ?, 'users', 'approve_signup', 'employee', ?, ?, 'web')
  `).bind(uid('audit'), context.employee.id, companyId, employeeId, JSON.stringify({ roleId: body.roleId, requestId: body.requestId })).run();

  await logSecurity(env, request, 'employee_signup_approved', {
    employeeId: context.employee.id, companyId, result: 'approved', details: { approvedEmployeeId: employeeId, roleId: body.roleId },
  });
  return responseJson({ ok: true, employeeId, status: 'active' });
}

async function logout(request: Request, env: AuthEnv, context: SessionContext | null) {
  if (context) {
    const cleanup = await Promise.allSettled([
      env.DB.prepare('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').bind(context.sessionId).run(),
      logSecurity(env, request, 'signout', { employeeId: context.employee.id, sessionId: context.sessionId, result: 'success' }),
    ]);
    const failed = cleanup.filter((result) => result.status === 'rejected').length;
    if (failed) console.error(JSON.stringify({ message: 'signout cleanup incomplete', sessionId: context.sessionId, failed }));
  }
  return responseJson({ ok: true }, 200, { 'set-cookie': clearSessionCookie(request) });
}

export async function routeAuth(request: Request, env: AuthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/auth/companies' && request.method === 'GET') return publicCompanies(env);
  if (url.pathname === '/api/auth/signup' && request.method === 'POST') return signup(request, env);
  if (url.pathname === '/api/auth/request' && request.method === 'POST') return requestSignIn(request, env);
  if (url.pathname === '/api/auth/verify' && request.method === 'POST') return verifySignIn(request, env);

  const context = await getSessionContext(request, env);
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    return context ? responseJson({ authenticated: true, context }) : responseJson({ authenticated: false }, 401);
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logout(request, env, context);

  if (url.pathname === '/api/admin/signup-requests' && request.method === 'GET') {
    if (!context) return responseJson({ error: 'Authentication required.' }, 401);
    return pendingSignups(request, env, context);
  }
  if (url.pathname === '/api/admin/signup-requests/approve' && request.method === 'POST') {
    if (!context) return responseJson({ error: 'Authentication required.' }, 401);
    return approveSignup(request, env, context);
  }

  return null;
}
