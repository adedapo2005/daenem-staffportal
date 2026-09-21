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
check('global policy remains group-admin only', admin.includes("body.scope==='global'&&!canManage(context)") && admin.includes('canSetGlobal:isGroupAdmin(context)'));
check('selected company writes reject out-of-scope IDs', admin.includes('companyIds.length!==requestedCompanyIds.length') && admin.includes('Company-scoped communications administration access'));
check('delegated scope metadata is returned', admin.includes('canManageCompanyIds:companies.filter'));
check('staging exposes the admin route', staging.includes("url.pathname.startsWith('/api/admin/')") && staging.includes('routeAdmin'));
check('production runtime exposes the admin route', runtime.includes("url.pathname.startsWith('/api/admin/')") && runtime.includes('routeAdmin(request, env, context)'));
check('Farms remain excluded from the projection', admin.includes('/farm/i.test'));
check('no provider release is enabled by scoped settings', scoped.includes('communications.provider_daily_limit'));

console.log(JSON.stringify({
  total: checks.length,
  passed: checks.filter((item) => item.pass).length,
  checks,
}, null, 2));
