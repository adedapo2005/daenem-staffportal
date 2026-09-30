import { hasPermission, type AuthEnv, type SessionContext } from './auth';
import type { EnhancedSessionContext } from './auth-context-v2';
import {
  DEFAULT_LAYOUT_ID, LAYOUT_IDS, normalizeLayoutId, normalizeLayoutPolicy, normalizeLayoutPreference, resolveLayout,
  type LayoutId, type LayoutPolicy, type LayoutPreference,
} from '../src/layout-system';

interface Env extends AuthEnv {}

type ExperienceSnapshot = {
  preference?: LayoutPreference | null;
  policy?: LayoutPolicy | null;
};

type ExperienceHistoryRecord = {
  id: string;
  scope: 'personal' | 'policy' | 'rollback' | string;
  target?: string;
  before?: ExperienceSnapshot;
  after?: ExperienceSnapshot;
  actorId?: string;
  createdAt: string;
  reason?: string;
  restorable?: boolean;
  layoutId?: LayoutId;
};
const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const uid = () => 'experience-' + crypto.randomUUID();
const setting = async (env: Env, key: string, fallback = '') => {
  const row = await env.DB.prepare('SELECT setting_value value FROM app_settings WHERE setting_key=?').bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
};
const saveSetting = async (env: Env, key: string, value: string, type = 'json') => {
  await env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,value_type,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,value_type=excluded.value_type,updated_at=CURRENT_TIMESTAMP')
    .bind(key, value, type).run();
};
const isOwner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');
const canAccess = (context: EnhancedSessionContext) => isOwner(context)
  || hasPermission(context, 'settings.access', 'view')
  || hasPermission(context, 'navigation.studio', 'view');
const canManage = (context: EnhancedSessionContext) => isOwner(context)
  || hasPermission(context, 'settings.access', 'manage')
  || hasPermission(context, 'navigation.studio', 'manage');
const WEATHER_SETTINGS_KEY = 'experience.weather.organization';
const DEFAULT_WEATHER_SETTINGS = {
  enabled: false,
  defaultUnits: 'IMPERIAL' as const,
  locationPolicy: 'assigned_work_location' as const,
  refreshIntervalSeconds: 300,
};
type WeatherSettings = {
  enabled: boolean;
  defaultUnits: 'IMPERIAL' | 'METRIC';
  locationPolicy: 'assigned_work_location' | 'organization_location' | 'permissioned_location';
  refreshIntervalSeconds: number;
};
async function readJsonSetting<T>(env: Env, key: string, fallback: T): Promise<T> {
  try { return JSON.parse(await setting(env, key, JSON.stringify(fallback))) as T; } catch { return fallback; }
}
function normalizeWeatherSettings(value: unknown): WeatherSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_WEATHER_SETTINGS;
  const raw = value as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    defaultUnits: raw.defaultUnits === 'METRIC' ? 'METRIC' : 'IMPERIAL',
    locationPolicy: ['assigned_work_location', 'organization_location', 'permissioned_location'].includes(String(raw.locationPolicy))
      ? raw.locationPolicy as WeatherSettings['locationPolicy'] : DEFAULT_WEATHER_SETTINGS.locationPolicy,
    refreshIntervalSeconds: Number.isInteger(raw.refreshIntervalSeconds) && Number(raw.refreshIntervalSeconds) >= 300 && Number(raw.refreshIntervalSeconds) <= 86_400
      ? Number(raw.refreshIntervalSeconds) : DEFAULT_WEATHER_SETTINGS.refreshIntervalSeconds,
  };
}
function companyAllowed(context: SessionContext, companyId?: string | null) {
  return !companyId || isOwner(context) || context.companies.some((company) => company.id === companyId);
}
async function readPolicy(env: Env): Promise<LayoutPolicy> {
  const [organizationDefault, forcedLayout, allowPersonalPreference, roleDefaults, erpDefaults] = await Promise.all([
    setting(env, 'experience.layout.organization_default', DEFAULT_LAYOUT_ID),
    setting(env, 'experience.layout.forced', ''),
    setting(env, 'experience.layout.allow_personal', 'true'),
    readJsonSetting<Record<string, LayoutId>>(env, 'experience.layout.role_defaults', {}),
    readJsonSetting<Record<string, LayoutId>>(env, 'experience.layout.erp_defaults', {}),
  ]);
  return normalizeLayoutPolicy({ organizationDefault, forcedLayout: forcedLayout || null, allowPersonalPreference: allowPersonalPreference === 'true', roleDefaults, erpDefaults });
}

function historyRecord(row: Record<string, unknown>): ExperienceHistoryRecord | null {
  if (typeof row.id !== 'string') return null;
  const after = row.after && typeof row.after === 'object' ? row.after as ExperienceSnapshot : undefined;
  const before = row.before && typeof row.before === 'object' ? row.before as ExperienceSnapshot : undefined;
  const inferredLayout = after?.preference?.layoutId || after?.policy?.forcedLayout || after?.policy?.organizationDefault || (typeof row.layoutId === 'string' ? row.layoutId : undefined);
  return {
    id: row.id,
    scope: typeof row.scope === 'string' ? row.scope : 'legacy',
    target: typeof row.target === 'string' ? row.target : typeof row.employeeId === 'string' ? row.employeeId : undefined,
    before,
    after,
    actorId: typeof row.actorId === 'string' ? row.actorId : undefined,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    reason: typeof row.reason === 'string' ? row.reason : undefined,
    restorable: row.restorable === true && Boolean(before && after),
    layoutId: inferredLayout ? normalizeLayoutId(inferredLayout) : undefined,
  };
}

function publicHistory(rows: Array<Record<string, unknown>>): ExperienceHistoryRecord[] {
  return rows.map(historyRecord).filter((row): row is ExperienceHistoryRecord => Boolean(row)).slice(-20).reverse();
}

function personalSnapshot(value: Partial<LayoutPreference> | null): ExperienceSnapshot {
  return { preference: value ? normalizeLayoutPreference(value) : null };
}

async function applyPolicy(env: Env, policy: LayoutPolicy) {
  const next = normalizeLayoutPolicy(policy);
  await saveSetting(env, 'experience.layout.organization_default', next.organizationDefault);
  await saveSetting(env, 'experience.layout.forced', next.forcedLayout || '');
  await saveSetting(env, 'experience.layout.allow_personal', String(next.allowPersonalPreference), 'boolean');
  await saveSetting(env, 'experience.layout.role_defaults', JSON.stringify(next.roleDefaults));
  await saveSetting(env, 'experience.layout.erp_defaults', JSON.stringify(next.erpDefaults));
  return next;
}

async function current(env: Env, context: EnhancedSessionContext, erpId?: string | null) {
  const [policy, personal] = await Promise.all([
    readPolicy(env),
    readJsonSetting<Partial<LayoutPreference> | null>(env, 'experience.layout.personal.' + context.employee.id, null),
  ]);
  const preference = resolveLayout(policy, personal, context.roles.map((role) => role.code), erpId);
  const manage = canManage(context);
  const access = canAccess(context);
  const canChoose = access && (manage || policy.allowPersonalPreference) && (!policy.forcedLayout || manage);
  const response: Record<string, unknown> = {
    preference,
    canManage: manage,
    canAccess: access,
    canChoose,
    ability: { canPreview: access, canChoose },
  };
  if (manage) {
    const history = await readJsonSetting<Array<Record<string, unknown>>>(env, 'experience.layout.history', []);
    response.policy = policy;
    response.history = publicHistory(history);
  }
  return response;
}
async function audit(env: Env, context: EnhancedSessionContext, action: string, after: unknown) {
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,?,?,?,?,?)')
    .bind(uid(), context.employee.id, 'experience', action, 'layout', context.employee.id, JSON.stringify(after), 'web').run();
}
async function saveHistory(env: Env, entry: Record<string, unknown>) {
  const history = await readJsonSetting<Array<Record<string, unknown>>>(env, 'experience.layout.history', []);
  history.push(entry);
  await saveSetting(env, 'experience.layout.history', JSON.stringify(history.slice(-30)));
}
async function savePersonal(request: Request, env: Env, context: EnhancedSessionContext) {
  let body: Partial<LayoutPreference>;
  try { body = await request.json() as Partial<LayoutPreference>; } catch { return json({ error: 'Invalid experience preference.' }, 400); }
  if (!canAccess(context)) return json({ error: 'Experience access is not assigned.' }, 403);
  if (await setting(env, 'experience.layout.forced', '') && !canManage(context)) return json({ error: 'The active experience policy is controlled by an administrator.' }, 409);
  if (!canManage(context) && await setting(env, 'experience.layout.allow_personal', 'true') !== 'true') return json({ error: 'Personal experience choice is disabled by policy.' }, 403);
  const before = await readJsonSetting<Partial<LayoutPreference> | null>(env, 'experience.layout.personal.' + context.employee.id, null);
  const next = normalizeLayoutPreference(body);
  const now = new Date().toISOString();
  await saveSetting(env, 'experience.layout.personal.' + context.employee.id, JSON.stringify(next));
  await saveHistory(env, {
    id: uid(), scope: 'personal', target: context.employee.id, actorId: context.employee.id, createdAt: now,
    before: personalSnapshot(before), after: personalSnapshot(next), reason: 'personal preference change', restorable: true, layoutId: next.layoutId,
  });
  await audit(env, context, 'save_personal', next);
  return json({ ok: true, preference: next });
}
async function savePolicy(request: Request, env: Env, context: EnhancedSessionContext) {
  if (!canManage(context)) return json({ error: 'Experience policy permission is required.' }, 403);
  let body: Partial<LayoutPolicy>;
  try { body = await request.json() as Partial<LayoutPolicy>; } catch { return json({ error: 'Invalid experience policy.' }, 400); }
  const before = await readPolicy(env);
  const next = await applyPolicy(env, normalizeLayoutPolicy(body));
  const now = new Date().toISOString();
  await saveHistory(env, {
    id: uid(), scope: 'policy', target: 'organization', actorId: context.employee.id, createdAt: now,
    before: { policy: before }, after: { policy: next }, reason: 'organization experience policy change', restorable: true,
    layoutId: next.forcedLayout || next.organizationDefault,
  });
  await audit(env, context, 'save_policy', next);
  return json({ ok: true, policy: next });
}
async function rollback(request: Request, env: Env, context: EnhancedSessionContext) {
  let body: { historyId?: string };
  try { body = await request.json() as { historyId?: string }; } catch { return json({ error: 'Invalid rollback request.' }, 400); }
  const history = await readJsonSetting<Array<Record<string, unknown>>>(env, 'experience.layout.history', []);
  const raw = history.find((item) => item.id === body.historyId);
  const entry = raw ? historyRecord(raw) : null;
  if (!entry) return json({ error: 'Experience version not found.' }, 404);
  if (!entry.restorable || !entry.before || !entry.after) return json({ error: 'This legacy experience record is read-only because its scope is incomplete.' }, 409);

  if (entry.scope === 'personal') {
    const target = entry.target;
    if (!target || (target !== context.employee.id && !canManage(context))) return json({ error: 'Personal history belongs to another employee.' }, 403);
    const beforePreference = entry.before.preference || null;
    await saveSetting(env, 'experience.layout.personal.' + target, beforePreference ? JSON.stringify(normalizeLayoutPreference(beforePreference)) : '');
    const now = new Date().toISOString();
    await saveHistory(env, {
      id: uid(), scope: 'rollback', target, actorId: context.employee.id, createdAt: now,
      before: { preference: entry.after.preference || null }, after: { preference: beforePreference },
      reason: 'personal preference rollback', restorable: false, layoutId: beforePreference?.layoutId,
    });
    await audit(env, context, 'rollback_personal', { historyId: entry.id, target, before: beforePreference });
    return json({ ok: true, preference: beforePreference ? normalizeLayoutPreference(beforePreference) : resolveLayout(await readPolicy(env), null, context.roles.map((role) => role.code)) });
  }

  if (entry.scope !== 'policy' || !canManage(context) || !entry.before.policy) return json({ error: 'This experience record cannot be restored under the current scope.' }, 409);
  const beforePolicy = normalizeLayoutPolicy(entry.before.policy);
  const afterPolicy = await readPolicy(env);
  await applyPolicy(env, beforePolicy);
  const now = new Date().toISOString();
  await saveHistory(env, {
    id: uid(), scope: 'rollback', target: 'organization', actorId: context.employee.id, createdAt: now,
    before: { policy: afterPolicy }, after: { policy: beforePolicy },
    reason: 'organization policy rollback', restorable: false, layoutId: beforePolicy.forcedLayout || beforePolicy.organizationDefault,
  });
  await audit(env, context, 'rollback_policy', { historyId: entry.id, target: 'organization', policy: beforePolicy });
  return json({ ok: true, policy: beforePolicy });
}

async function weatherSettings(request: Request, env: Env, context: EnhancedSessionContext) {
  if (!canManage(context)) return json({ error: 'Experience policy permission is required.' }, 403);
  if (request.method === 'GET') {
    const stored = await readJsonSetting<unknown>(env, WEATHER_SETTINGS_KEY, DEFAULT_WEATHER_SETTINGS);
    return json({ provider: 'Google Weather', settings: normalizeWeatherSettings(stored), productionEnabled: false });
  }
  if (request.method !== 'POST') return json({ error: 'Use GET or POST for weather settings.' }, 405);
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid weather settings.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid weather settings.' }, 400);
  const values = body as Record<string, unknown>;
  const settings = normalizeWeatherSettings(values);
  if (typeof values.enabled !== 'boolean' || !['IMPERIAL', 'METRIC'].includes(String(values.defaultUnits)) ||
      !['assigned_work_location', 'organization_location', 'permissioned_location'].includes(String(values.locationPolicy)) ||
      !Number.isInteger(values.refreshIntervalSeconds) || Number(values.refreshIntervalSeconds) < 300 || Number(values.refreshIntervalSeconds) > 86_400) {
    return json({ error: 'Choose a valid weather setting and a refresh interval from 5 minutes to 24 hours.' }, 400);
  }
  const before = normalizeWeatherSettings(await readJsonSetting<unknown>(env, WEATHER_SETTINGS_KEY, DEFAULT_WEATHER_SETTINGS));
  const serialized = JSON.stringify(settings);
  const [saved, audited] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
      VALUES(?,?,'json',?,CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,value_type='json',updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
      .bind(WEATHER_SETTINGS_KEY, serialized, context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,before_json,after_json,source)
      SELECT ?,?,'experience','save_weather_settings','weather_settings',?,?,?,'web' WHERE changes()=1`)
      .bind(uid(), context.employee.id, WEATHER_SETTINGS_KEY, JSON.stringify(before), serialized),
  ]);
  if (Number(saved.meta?.changes || 0) !== 1 || Number(audited.meta?.changes || 0) !== 1) {
    return json({ error: 'Weather settings could not be saved with audit evidence.' }, 409);
  }
  return json({ ok: true, provider: 'Google Weather', settings, productionEnabled: false });
}

export async function routeExperiencePreferences(request: Request, env: Env, context: EnhancedSessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  if (!companyAllowed(context, companyId)) return json({ error: 'Company access is not assigned.' }, 403);
  if (url.pathname === '/api/experience/weather' && ['GET', 'POST'].includes(request.method)) return weatherSettings(request, env, context);
  if (url.pathname === '/api/experience/layout' && request.method === 'GET') return json(await current(env, context, url.searchParams.get('erpId')));
  if (url.pathname === '/api/experience/layout/preference' && request.method === 'POST') return savePersonal(request, env, context);
  if (url.pathname === '/api/experience/layout/policy' && request.method === 'POST') return savePolicy(request, env, context);
  if (url.pathname === '/api/experience/layout/rollback' && request.method === 'POST') return rollback(request, env, context);
  return null;
}
