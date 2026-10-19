import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const admin = read('worker/admin.ts');
const staging = read('worker/staffportal-staging.ts');
const runtime = read('worker/runtime.ts');
const scoped = read('worker/scoped-settings.ts');
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check('canonical keys are defined', [
  'security.password_recovery_methods',
  'communications.whatsapp_enabled',
  'communications.ai_enabled',
  'communications.ai_daily_limit',
  'communications.provider_daily_limit',
].every((key) => scoped.includes(key)));
check('delegated company permission is recognized', admin.includes("communications.hr.manage") && admin.includes('canManageScopedCompany'));
check('authorized company projection is filtered', admin.includes('canViewScopedSettings') && admin.includes('allowedCompanies(context)'));
check('global policy derives canSetGlobal from current DB-backed group administration', admin.includes('canSetGlobal:await isGroupAdministrator(env,context)') && admin.includes('async function isGroupAdministrator(env: AdminEnv, context: SessionContext)'));
check('group administrator requires a current group-level role', /r\.code\s*=\s*'group_admin'\s+AND\s+r\.company_id\s+IS\s+NULL\s+AND\s+r\.active\s*=\s*1/.test(admin) && admin.includes('JOIN employee_roles') === false && admin.includes('FROM employee_roles er') && admin.includes('JOIN employee_company_memberships m'));
check('global policy writes revalidate group authority', admin.includes("body.scope==='global'&&!canManage(context)") && admin.includes('if(!(await isGroupAdministrator(env,context)))'));
check('selected company writes reject out-of-scope IDs', admin.includes('companyIds.length!==requestedCompanyIds.length') && admin.includes('Company-scoped communications administration access'));
check('delegated scope metadata is returned', admin.includes('canManageCompanyIds:companies.filter'));
check('staging delegates admin routing to canonical authenticated runtime', staging.includes("import runtimeHandler from './runtime'") && staging.includes('runtimeHandler.fetch(request,runtimeEnv,ctx)') && runtime.includes("url.pathname.startsWith('/api/admin/')") && runtime.includes('routeAdmin(request, env, context)'));
check('production runtime exposes the admin route', runtime.includes("url.pathname.startsWith('/api/admin/')") && runtime.includes('routeAdmin(request, env, context)'));
check('Farms remain excluded from the projection', admin.includes('/farm/i.test'));
check('no provider release is enabled by scoped settings', scoped.includes('communications.provider_daily_limit'));

console.log(JSON.stringify({
  total: checks.length,
  passed: checks.filter((item) => item.pass).length,
  checks,
}, null, 2));
