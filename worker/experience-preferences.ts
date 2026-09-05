import { hasPermission, type AuthEnv, type SessionContext } from './auth';
import type { EnhancedSessionContext } from './auth-context-v2';
import {
  DEFAULT_LAYOUT_ID, LAYOUT_IDS, normalizeLayoutId, normalizeLayoutPolicy, normalizeLayoutPreference,
  type LayoutId, type LayoutPolicy, type LayoutPreference,
} from '../src/layout-system';

interface Env extends AuthEnv {}

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
const canManage = (context: EnhancedSessionContext) => isOwner(context)
  || hasPermission(context, 'settings.access', 'manage')
  || hasPermission(context, 'navigation.studio', 'manage');
async function readJsonSetting<T>(env: Env, key: string, fallback: T): Promise<T> {
  try { return JSON.parse(await setting(env, key, JSON.stringify(fallback))) as T; } catch { return fallback; }
}
function companyAllowed(context: SessionContext, companyId?: string | null) {
  return !companyId || isOwner(context) || context.companies.some((company) => company.id === companyId);
}
async function current(env: Env, context: EnhancedSessionContext, erpId?: string | null) {
  const [organizationDefault, forcedLayout, allowPersonalPreference, roleDefaults, erpDefaults, history, personal] = await Promise.all([
    setting(env, 'experience.layout.organization_default', DEFAULT_LAYOUT_ID),
    setting(env, 'experience.layout.forced', ''),
    setting(env, 'experience.layout.allow_personal', 'true'),
    readJsonSetting<Record<string, LayoutId>>(env, 'experience.layout.role_defaults', {}),
    readJsonSetting<Record<string, LayoutId>>(env, 'experience.layout.erp_defaults', {}),
    readJsonSetting<Array<Record<string, unknown>>>(env, 'experience.layout.history', []),
    readJsonSetting<Partial<LayoutPreference> | null>(env, 'experience.layout.personal.' + context.employee.id, null),
  ]);
  const policy = normalizeLayoutPolicy({ organizationDefault, forcedLayout: forcedLayout || null, allowPersonalPreference: allowPersonalPreference === 'true', roleDefaults, erpDefaults });
  const roleLayout = context.roles.map((role) => policy.roleDefaults[role.code]).find(Boolean);
  const erpLayout = erpId ? policy.erpDefaults[erpId] : undefined;
  const layoutId = policy.forcedLayout
    || (policy.allowPersonalPreference && personal?.layoutId ? normalizeLayoutId(personal.layoutId) : null)
    || roleLayout || erpLayout || policy.organizationDefault;
  const source = policy.allowPersonalPreference && personal?.layoutId ? personal : { layoutId };
  const preference = normalizeLayoutPreference(source, layoutId);
  const historyRows = history.filter((row) => typeof row.id === 'string' && LAYOUT_IDS.includes(String(row.layoutId) as LayoutId))
    .slice(-20).reverse().map((row) => ({
      id: String(row.id), layoutId: normalizeLayoutId(row.layoutId),
      scope: String(row.scope || 'personal'), createdAt: String(row.createdAt || ''),
    }));
  return { preference, policy, canManage: canManage(context), canChoose: canManage(context) || policy.allowPersonalPreference, history: historyRows };
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
  if (!canManage(context) && await setting(env, 'experience.layout.allow_personal', 'true') !== 'true') return json({ error: 'Personal experience choice is disabled by policy.' }, 403);
  const next = normalizeLayoutPreference(body);
  await saveSetting(env, 'experience.layout.personal.' + context.employee.id, JSON.stringify(next));
  await saveHistory(env, { id: uid(), layoutId: next.layoutId, scope: 'personal', createdAt: new Date().toISOString(), employeeId: context.employee.id });
  await audit(env, context, 'save_personal', next);
  return json({ ok: true, preference: next });
}
async function savePolicy(request: Request, env: Env, context: EnhancedSessionContext) {
  if (!canManage(context)) return json({ error: 'Experience policy permission is required.' }, 403);
  let body: Partial<LayoutPolicy>;
  try { body = await request.json() as Partial<LayoutPolicy>; } catch { return json({ error: 'Invalid experience policy.' }, 400); }
  const next = normalizeLayoutPolicy(body);
  await saveSetting(env, 'experience.layout.organization_default', next.organizationDefault);
  await saveSetting(env, 'experience.layout.forced', next.forcedLayout || '');
  await saveSetting(env, 'experience.layout.allow_personal', String(next.allowPersonalPreference), 'boolean');
  await saveSetting(env, 'experience.layout.role_defaults', JSON.stringify(next.roleDefaults));
  await saveSetting(env, 'experience.layout.erp_defaults', JSON.stringify(next.erpDefaults));
  await saveHistory(env, { id: uid(), layoutId: next.forcedLayout || next.organizationDefault, scope: 'policy', createdAt: new Date().toISOString(), actorId: context.employee.id });
  await audit(env, context, 'save_policy', next);
  return json({ ok: true, policy: next });
}
async function rollback(request: Request, env: Env, context: EnhancedSessionContext) {
  if (!canManage(context)) return json({ error: 'Experience policy permission is required.' }, 403);
  let body: { historyId?: string };
  try { body = await request.json() as { historyId?: string }; } catch { return json({ error: 'Invalid rollback request.' }, 400); }
  const history = await readJsonSetting<Array<Record<string, unknown>>>(env, 'experience.layout.history', []);
  const entry = history.find((item) => item.id === body.historyId);
  if (!entry) return json({ error: 'Experience version not found.' }, 404);
  const next = normalizeLayoutId(entry.layoutId);
  await saveSetting(env, 'experience.layout.forced', next);
  await saveHistory(env, { id: uid(), layoutId: next, scope: 'rollback', createdAt: new Date().toISOString(), actorId: context.employee.id });
  await audit(env, context, 'rollback', { historyId: body.historyId, layoutId: next });
  return json({ ok: true, layoutId: next });
}

export async function routeExperiencePreferences(request: Request, env: Env, context: EnhancedSessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  if (!companyAllowed(context, companyId)) return json({ error: 'Company access is not assigned.' }, 403);
  if (url.pathname === '/api/experience/layout' && request.method === 'GET') return json(await current(env, context, url.searchParams.get('erpId')));
  if (url.pathname === '/api/experience/layout/preference' && request.method === 'POST') return savePersonal(request, env, context);
  if (url.pathname === '/api/experience/layout/policy' && request.method === 'POST') return savePolicy(request, env, context);
  if (url.pathname === '/api/experience/layout/rollback' && request.method === 'POST') return rollback(request, env, context);
  return null;
}
