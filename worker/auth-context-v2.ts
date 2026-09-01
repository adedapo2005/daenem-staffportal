import { getSessionContext, type AccessLevel, type AuthEnv, type SessionContext } from './auth';

const levels: AccessLevel[] = ['none','view','create','edit','approve','manage'];
export interface EnhancedSessionContext extends SessionContext {
  companyPermissions: Record<string, Record<string, AccessLevel>>;
}

function stronger(a: AccessLevel = 'none', b: AccessLevel = 'none') {
  return levels.indexOf(b) > levels.indexOf(a) ? b : a;
}

export async function getEnhancedSessionContext(request: Request, env: AuthEnv): Promise<EnhancedSessionContext | null> {
  const base = await getSessionContext(request, env);
  if (!base) return null;
  const employeeId = base.employee.id;
  const roleRows = await env.DB.prepare(`
    SELECT er.company_id AS companyId,p.code,rp.access_level AS accessLevel
    FROM employee_roles er
    JOIN role_permissions rp ON rp.role_id=er.role_id
    JOIN permissions p ON p.id=rp.permission_id
    JOIN roles r ON r.id=er.role_id
    WHERE er.employee_id=? AND r.active=1
  `).bind(employeeId).all<{companyId:string;code:string;accessLevel:AccessLevel}>();

  const companyPermissions: Record<string, Record<string, AccessLevel>> = {};
  for (const company of base.companies) companyPermissions[company.id] = {};
  for (const row of roleRows.results || []) {
    if (!companyPermissions[row.companyId]) companyPermissions[row.companyId] = {};
    companyPermissions[row.companyId][row.code] = stronger(companyPermissions[row.companyId][row.code], row.accessLevel);
  }

  const overrides = await env.DB.prepare(`
    SELECT o.company_id AS companyId,p.code,o.access_level AS accessLevel
    FROM employee_permission_overrides_v2 o
    JOIN permissions p ON p.id=o.permission_id
    WHERE o.employee_id=? AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
  `).bind(employeeId).all<{companyId?:string;code:string;accessLevel:AccessLevel}>();

  for (const row of overrides.results || []) {
    if (row.companyId) {
      if (!companyPermissions[row.companyId]) companyPermissions[row.companyId] = {};
      companyPermissions[row.companyId][row.code] = row.accessLevel;
    } else {
      for (const companyId of Object.keys(companyPermissions)) companyPermissions[companyId][row.code] = row.accessLevel;
    }
  }

  return { ...base, companyPermissions };
}

export function scopeContext(context: EnhancedSessionContext, companyId: string): SessionContext {
  return { ...context, permissions: { ...(context.companyPermissions[companyId] || {}) } };
}

export function hasCompanyPermission(context: EnhancedSessionContext, companyId: string, code: string, minimum: AccessLevel = 'view') {
  const granted = context.companyPermissions[companyId]?.[code] || 'none';
  return levels.indexOf(granted) >= levels.indexOf(minimum);
}
