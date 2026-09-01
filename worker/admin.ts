import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface AdminEnv extends AuthEnv {}

type AppSettingRow = { settingKey: string; settingValue: string; valueType: string };

type LocationRow = {
  id: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  name: string;
  addressLine?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  radiusM?: number;
  requireLoginLocation?: number;
  requireClockGeofence?: number;
  requireClockInPhoto?: number;
  requireClockOutPhoto?: number;
  allowOfflineAttendance?: number;
};

const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function canView(context: SessionContext) {
  return hasPermission(context, 'settings.access', 'view') || hasPermission(context, 'tracking.access', 'view') || hasPermission(context, 'security.access', 'view');
}

function canManage(context: SessionContext) {
  return hasPermission(context, 'settings.access', 'manage') || hasPermission(context, 'tracking.access', 'manage');
}

function decodeSetting(value: string, type: string): unknown {
  if (type === 'boolean') return value === 'true';
  if (type === 'number') return Number(value);
  if (type === 'json') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function encodeSetting(value: unknown, type: string) {
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') return String(Number(value));
  if (type === 'json') return JSON.stringify(value ?? null);
  return String(value ?? '');
}

const themeIds = ['lagos-sunrise','print-neon-grid','digital-indigo','auto-showroom-night','urban-property-skyline','cargo-flow','executive-boardroom','job-market-pulse','global-operations-mesh','minimal-tech-white'];
const themeAliases: Record<string, string> = { executive: 'executive-boardroom', 'executive-night': 'executive-boardroom', horizon: 'lagos-sunrise', midnight: 'auto-showroom-night', clean: 'minimal-tech-white', glass: 'digital-indigo', emerald: 'cargo-flow', azure: 'global-operations-mesh', sandstone: 'executive-boardroom', carbon: 'auto-showroom-night', focus: 'minimal-tech-white', contrast: 'minimal-tech-white', 'high-contrast-dark': 'auto-showroom-night', 'system-adaptive': 'global-operations-mesh' };
const normalizeTheme = (value: unknown) => themeAliases[String(value ?? '')] || String(value ?? '');
const validTheme = (value: unknown, allowBlank = false) => allowBlank && String(value ?? '') === '' || themeIds.includes(normalizeTheme(value));

const allowedSettings: Record<string, { type: 'string' | 'number' | 'boolean'; validate: (value: unknown) => boolean }> = {
  'security.login_location_mode': { type: 'string', validate: (value) => ['off', 'record', 'enforce'].includes(String(value)) },
  'ui.admin_can_force_theme': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'ui.allow_employee_theme_choice': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'ui.forced_theme': { type: 'string', validate: (value) => validTheme(value, true) },
  'ui.default_theme': { type: 'string', validate: (value) => validTheme(value) },
  'notifications.daily_word_requires_approval': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'notifications.incomplete_attendance_reminder': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'notifications.role_data_reminders': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'notifications.escalate_overdue_to_manager': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'ai.smart_exception_detection': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
};

async function getSettings(env: AdminEnv, context: SessionContext) {
  if (!canView(context)) return json({ error: 'Admin setup access is not assigned.' }, 403);
  const keys = Object.keys(allowedSettings);
  const placeholders = keys.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT setting_key AS settingKey, setting_value AS settingValue, value_type AS valueType
    FROM app_settings WHERE setting_key IN (${placeholders}) ORDER BY setting_key
  `).bind(...keys).all<AppSettingRow>();
  const settings: Record<string, unknown> = {};
  for (const row of result.results || []) {
    const decoded = decodeSetting(row.settingValue, row.valueType);
    settings[row.settingKey] = row.settingKey === 'ui.forced_theme' || row.settingKey === 'ui.default_theme' ? normalizeTheme(decoded) : decoded;
  }
  return json({ settings });
}

async function updateSettings(request: Request, env: AdminEnv, context: SessionContext) {
  if (!canManage(context)) return json({ error: 'Manage Settings or Tracking permission is required.' }, 403);
  let body: { settings?: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ error: 'Invalid settings request.' }, 400); }
  const entries = Object.entries(body.settings || {});
  if (!entries.length) return json({ error: 'No settings were supplied.' }, 400);
  const statements: D1PreparedStatement[] = [];
  const changed: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    const rule = allowedSettings[key];
    if (!rule || !rule.validate(value)) return json({ error: `Invalid value for ${key}.` }, 400);
    changed[key] = key === 'ui.forced_theme' || key === 'ui.default_theme' ? normalizeTheme(value) : value;
    statements.push(env.DB.prepare(`
      INSERT INTO app_settings (setting_key, setting_value, value_type, updated_by, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        value_type = excluded.value_type,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, encodeSetting(changed[key], rule.type), rule.type, context.employee.id));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_employee_id, module, action, entity_type, entity_id, after_json, source)
    VALUES (?, ?, 'settings', 'update', 'app_settings', 'global', ?, 'web')
  `).bind(uid('audit'), context.employee.id, JSON.stringify(changed)));
  await env.DB.batch(statements);
  return json({ ok: true, settings: changed });
}

async function listLocations(env: AdminEnv, context: SessionContext) {
  if (!canView(context)) return json({ error: 'Location administration access is not assigned.' }, 403);
  const result = await env.DB.prepare(`
    SELECT cl.id, cl.company_id AS companyId, c.code AS companyCode, c.name AS companyName,
           cl.name, cl.address_line AS addressLine, cl.city, cl.state,
           cl.latitude, cl.longitude, COALESCE(ap.geofence_radius_m, cl.geofence_radius_m, 150) AS radiusM,
           COALESCE(ap.require_login_location, 0) AS requireLoginLocation,
           COALESCE(ap.require_clock_geofence, 1) AS requireClockGeofence,
           COALESCE(ap.require_clock_in_photo, 1) AS requireClockInPhoto,
           COALESCE(ap.require_clock_out_photo, 0) AS requireClockOutPhoto,
           COALESCE(ap.allow_offline_attendance, 1) AS allowOfflineAttendance
    FROM company_locations cl
    JOIN companies c ON c.id = cl.company_id
    LEFT JOIN attendance_policies ap ON ap.company_id = cl.company_id AND ap.location_id = cl.id AND ap.active = 1
    WHERE cl.active = 1 AND c.active = 1
    ORDER BY c.name, cl.name
  `).all<LocationRow>();
  return json({ locations: (result.results || []).map((row) => ({
    ...row,
    configured: Number.isFinite(row.latitude) && Number.isFinite(row.longitude),
    requireLoginLocation: Boolean(row.requireLoginLocation),
    requireClockGeofence: Boolean(row.requireClockGeofence),
    requireClockInPhoto: Boolean(row.requireClockInPhoto),
    requireClockOutPhoto: Boolean(row.requireClockOutPhoto),
    allowOfflineAttendance: Boolean(row.allowOfflineAttendance),
  })) });
}

async function configureLocation(request: Request, env: AdminEnv, context: SessionContext) {
  if (!canManage(context)) return json({ error: 'Manage Settings or Tracking permission is required.' }, 403);
  let body: {
    locationId?: string;
    latitude?: number;
    longitude?: number;
    radiusM?: number;
    requireLoginLocation?: boolean;
    requireClockGeofence?: boolean;
    requireClockInPhoto?: boolean;
    requireClockOutPhoto?: boolean;
    allowOfflineAttendance?: boolean;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid location request.' }, 400); }
  const locationId = String(body.locationId || '');
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const radiusM = Math.round(Number(body.radiusM || 150));
  if (!locationId || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return json({ error: 'Location, latitude and longitude are required.' }, 400);
  }
  if (radiusM < 25 || radiusM > 5000) return json({ error: 'Geofence radius must be between 25m and 5,000m.' }, 400);

  const location = await env.DB.prepare(`
    SELECT cl.id, cl.company_id AS companyId, c.name AS companyName, cl.name
    FROM company_locations cl JOIN companies c ON c.id = cl.company_id
    WHERE cl.id = ? AND cl.active = 1 LIMIT 1
  `).bind(locationId).first<{ id: string; companyId: string; companyName: string; name: string }>();
  if (!location) return json({ error: 'Work location not found.' }, 404);

  const policy = await env.DB.prepare(`
    SELECT id FROM attendance_policies WHERE company_id = ? AND location_id = ? AND active = 1 LIMIT 1
  `).bind(location.companyId, locationId).first<{ id: string }>();
  const policyId = policy?.id || uid('attendance-policy');
  const requireLogin = body.requireLoginLocation ? 1 : 0;
  const requireGeofence = body.requireClockGeofence === false ? 0 : 1;
  const clockInPhoto = body.requireClockInPhoto === false ? 0 : 1;
  const clockOutPhoto = body.requireClockOutPhoto ? 1 : 0;
  const offline = body.allowOfflineAttendance === false ? 0 : 1;

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`
      UPDATE company_locations SET latitude = ?, longitude = ?, geofence_radius_m = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(latitude, longitude, radiusM, locationId),
  ];
  if (policy) {
    statements.push(env.DB.prepare(`
      UPDATE attendance_policies SET require_login_location = ?, require_clock_geofence = ?,
        require_clock_in_photo = ?, require_clock_out_photo = ?, allow_offline_attendance = ?,
        geofence_radius_m = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(requireLogin, requireGeofence, clockInPhoto, clockOutPhoto, offline, radiusM, policyId));
  } else {
    statements.push(env.DB.prepare(`
      INSERT INTO attendance_policies (
        id, company_id, location_id, name, require_login_location, require_clock_geofence,
        require_clock_in_photo, require_clock_out_photo, allow_offline_attendance,
        allow_manager_override, geofence_radius_m, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)
    `).bind(policyId, location.companyId, locationId, `${location.name} Attendance`, requireLogin, requireGeofence, clockInPhoto, clockOutPhoto, offline, radiusM));
  }
  const after = { latitude, longitude, radiusM, requireLoginLocation: Boolean(requireLogin), requireClockGeofence: Boolean(requireGeofence), requireClockInPhoto: Boolean(clockInPhoto), requireClockOutPhoto: Boolean(clockOutPhoto), allowOfflineAttendance: Boolean(offline) };
  statements.push(env.DB.prepare(`
    INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source)
    VALUES (?, ?, ?, 'tracking', 'configure_geofence', 'company_location', ?, ?, 'web')
  `).bind(uid('audit'), context.employee.id, location.companyId, locationId, JSON.stringify(after)));
  statements.push(env.DB.prepare(`
    INSERT INTO security_logs (id, employee_id, company_id, session_id, event_type, severity, result, details_json)
    VALUES (?, ?, ?, ?, 'geofence_configuration_changed', 'medium', 'success', ?)
  `).bind(uid('security'), context.employee.id, location.companyId, context.sessionId, JSON.stringify(after)));
  await env.DB.batch(statements);
  return json({ ok: true, location: { id: locationId, companyId: location.companyId, companyName: location.companyName, name: location.name, ...after } });
}

export async function routeAdmin(request: Request, env: AdminEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/admin/settings' && request.method === 'GET') return getSettings(env, context);
  if (url.pathname === '/api/admin/settings' && request.method === 'POST') return updateSettings(request, env, context);
  if (url.pathname === '/api/admin/locations' && request.method === 'GET') return listLocations(env, context);
  if (url.pathname === '/api/admin/locations/configure' && request.method === 'POST') return configureLocation(request, env, context);
  return null;
}
