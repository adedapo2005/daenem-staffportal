import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import { RECOVERY_SETTING_KEY, SCOPED_SETTING_DEFINITIONS, decodeScopedValue, encodeScopedValue, resolveScopedSetting, type ScopedSettingKey } from './scoped-settings';

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
  'communications.kill_switch': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'communications.whatsapp_enabled': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'communications.ai_enabled': { type: 'boolean', validate: (value) => typeof value === 'boolean' },
  'communications.ai_daily_limit': { type: 'number', validate: (value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 10000 },
  'communications.provider_daily_limit': { type: 'number', validate: (value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100000 },
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

function isGroupAdmin(context:SessionContext){
  return context.roles.some(role=>['owner','group_admin'].includes(role.code));
}

function hasDelegatedCommunicationsAccess(context:SessionContext,companyId:string,minimum:AccessLevel='view'){
  return hasPermission(context,'communications.hr.manage',minimum,companyId);
}

function canViewScopedSettings(context:SessionContext){
  return canView(context)||context.companies.some(company=>hasDelegatedCommunicationsAccess(context,company.id,'view'));
}

function canManageScopedCompany(context:SessionContext,companyId:string){
  return canManage(context)||hasDelegatedCommunicationsAccess(context,companyId,'manage');
}

function allowedCompanies(context:SessionContext){
  return context.companies.filter(company=>
    !/farm/i.test(`${company.id} ${company.code} ${company.name}`)&&
    (canView(context)||hasDelegatedCommunicationsAccess(context,company.id,'view')),
  );
}

async function getScopedSettings(request:Request,env:AdminEnv,context:SessionContext){
  if(!canViewScopedSettings(context))return json({error:'Scoped communications administration access is not assigned.'},403);
  const requested=String(new URL(request.url).searchParams.get('settingKey')||RECOVERY_SETTING_KEY) as ScopedSettingKey;
  const definition=SCOPED_SETTING_DEFINITIONS[requested];
  if(!definition)return json({error:'Unsupported scoped setting.'},400);
  const companies=allowedCompanies(context);
  const global=await resolveScopedSetting(env,requested,null,encodeScopedValue(definition.fallback,definition.type));
  const rows=await env.DB.prepare(`
    SELECT scope_id AS companyId,setting_value AS value,value_type AS type
    FROM admin_scoped_settings
    WHERE setting_key=? AND scope_type='company'
  `).bind(requested).all<{companyId:string;value:string;type:'string'|'boolean'|'number'}>();
  const overrides=new Map((rows.results||[]).map(row=>[row.companyId,decodeScopedValue(row.value,row.type)]));
  const globalValue=decodeScopedValue(global.value,global.type);
  return json({
    settingKey:requested,
    valueType:definition.type,
    global:{value:globalValue,source:'global'},
    companies:companies.map(company=>({
      id:company.id,code:company.code,name:company.name,
      value:overrides.has(company.id)?overrides.get(company.id):globalValue,
      source:overrides.has(company.id)?'company':'inherited',
    })),
    canSetGlobal:isGroupAdmin(context),
    canManage:canManage(context)||companies.some(company=>hasDelegatedCommunicationsAccess(context,company.id,'manage')),
    canManageCompanyIds:companies.filter(company=>canManageScopedCompany(context,company.id)).map(company=>company.id),
  });
}

async function saveScopedSettings(request:Request,env:AdminEnv,context:SessionContext){
  let body:{settingKey?:string;value?:unknown;scope?:'global'|'companies';companyIds?:string[];inherit?:boolean};
  try{body=await request.json()}catch{return json({error:'Invalid scoped settings request.'},400)}
  const requestedCompanyIds=[...new Set((body.companyIds||[]).map(String).filter(Boolean))];
  if(body.scope!=='global'&&body.scope!=='companies')return json({error:'A valid scoped settings target is required.'},400);
  if(body.scope==='global'&&!canManage(context))return json({error:'Global policy administration access is required.'},403);
  const settingKey=String(body.settingKey||'') as ScopedSettingKey;
  const definition=SCOPED_SETTING_DEFINITIONS[settingKey];
  if(!definition||!definition.validate(body.value))return json({error:'Invalid scoped setting value.'},400);
  const encoded=encodeScopedValue(body.value,definition.type);
  if(body.scope==='global'){
    if(!isGroupAdmin(context))return json({error:'Group Owner or Group Admin access is required for global policy.'},403);
    await env.DB.prepare(`
      INSERT INTO admin_scoped_settings(id,setting_key,scope_type,scope_id,setting_value,value_type,updated_by,updated_at)
      VALUES(?,?,'global','__global__',?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key,scope_type,scope_id) DO UPDATE SET
        setting_value=excluded.setting_value,value_type=excluded.value_type,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
    `).bind(uid('scoped-setting'),settingKey,encoded,definition.type,context.employee.id).run();
  }else{
    const allowed=new Set(allowedCompanies(context).map(company=>company.id));
    const companyIds=requestedCompanyIds.filter(id=>allowed.has(id));
    if(!companyIds.length)return json({error:'Select at least one authorized company.'},400);
    if(companyIds.length!==requestedCompanyIds.length)return json({error:'One or more selected companies are not in your authorized scope.'},403);
    if(!canManage(context)&&companyIds.some(companyId=>!canManageScopedCompany(context,companyId)))return json({error:'Company-scoped communications administration access is not assigned.'},403);
    if(body.inherit){
      const marks=companyIds.map(()=>'?').join(',');
      await env.DB.prepare(`DELETE FROM admin_scoped_settings WHERE setting_key=? AND scope_type='company' AND scope_id IN (${marks})`)
        .bind(settingKey,...companyIds).run();
    }else{
      await env.DB.batch(companyIds.map(companyId=>env.DB.prepare(`
        INSERT INTO admin_scoped_settings(id,setting_key,scope_type,scope_id,setting_value,value_type,updated_by,updated_at)
        VALUES(?,?,'company',?,?,?, ?,CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key,scope_type,scope_id) DO UPDATE SET
          setting_value=excluded.setting_value,value_type=excluded.value_type,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
      `).bind(uid('scoped-setting'),settingKey,companyId,encoded,definition.type,context.employee.id)));
    }
  }
  await env.DB.prepare(`
    INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
    VALUES(?,?,'settings','update_scoped_setting','admin_scoped_setting',?,?, 'web')
  `).bind(uid('audit'),context.employee.id,settingKey,JSON.stringify(body)).run();
  const nextUrl=new URL(request.url);nextUrl.searchParams.set('settingKey',settingKey);
  return getScopedSettings(new Request(nextUrl.toString(),{method:'GET'}),env,context);
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
  if (url.pathname === '/api/admin/scoped-settings' && request.method === 'GET') return getScopedSettings(request, env, context);
  if (url.pathname === '/api/admin/scoped-settings' && request.method === 'POST') return saveScopedSettings(request, env, context);
  if (url.pathname === '/api/admin/locations' && request.method === 'GET') return listLocations(env, context);
  if (url.pathname === '/api/admin/locations/configure' && request.method === 'POST') return configureLocation(request, env, context);
  return null;
}
