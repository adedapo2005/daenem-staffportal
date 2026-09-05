import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('worker/auth.ts');
const api = read('worker/index.ts');
const clientAuth = read('src/auth.tsx');
const main = read('src/main.tsx');
const moduleHub = read('src/module-hub.tsx');
const packageJson = JSON.parse(read('package.json'));
const businessWorkers = {
  printing: read('worker/printing.ts'),
  printingProduction: read('worker/printing-production.ts'),
  bakery: read('worker/bakery.ts'),
  autos: `${read('worker/autos-v2.ts')}\n${read('worker/autos-v3.ts')}`,
  logistics: `${read('worker/logistics.ts')}\n${read('worker/logistics-v2.ts')}`,
  properties: `${read('worker/properties.ts')}\n${read('worker/properties-v2.ts')}`,
};

const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('release version is synchronized', /^7\.0\.0-alpha\.\d+$/.test(packageJson.version) && main.includes(`version: '${packageJson.version}'`));
check('session returns company permission maps', auth.includes('companyPermissions,') && auth.includes('employee_permission_overrides_v2'));
check('general roles apply across assigned businesses', auth.includes('const targets = row.companyId ? [String(row.companyId)] : companyIds'));
check('explicit business overrides apply last', auth.indexOf('for (const row of scopedOverrides.results || [])') > auth.indexOf('for (const row of permissionRows.results || [])'));
check('server permission helper accepts a company', auth.includes("companyId?: string | null") && auth.includes('context.companyPermissions[companyId]'));
check('client permission helper accepts a company', clientAuth.includes('hasWorkforcePermission') && clientAuth.includes('context.companyPermissions?.[companyId]'));
check('background tabs reuse cached identity', clientAuth.includes("document.visibilityState === 'hidden'") && clientAuth.includes('authMeCache.value'));
check('sidebar is filtered for the selected business', main.includes("can(context, item.permission, 'view', company.id)") && main.includes('visibleNav'));
check('permission-only navigation redirects safely', main.includes('visibleNav.some((item) => item.id === view)') && main.includes("setView(visibleNav[0]?.id || 'help')"));
check('employee approvals are requested by business', main.includes('/api/admin/signup-requests${query}') && auth.includes('requested_company_id IN (${placeholders})'));
check('approval writes recheck business permission', auth.includes("hasPermission(context, 'users.access', 'manage', companyId)"));
check('dashboard group queries stay within authorized businesses', (api.includes('dashboardCompanyIds') && api.includes('company_id IN (${companyPlaceholders})')) || (api.includes('permittedDashboardCompanyIds') && ['employeeCompanyIds', 'attendanceCompanyIds', 'incompleteCompanyIds', 'approvalCompanyIds', 'securityCompanyIds', 'overdueCompanyIds', 'facilitiesCompanyIds'].every((name) => api.includes('sqlList(' + name + ')'))));
check('security events stay within authorized businesses', api.includes('allowedCompanyIds = permittedCompanyIds(context, \'security.access\')') && api.includes('WHERE sl.company_id IN (${sqlList(companyIds)})'));
check('role choices stay within authorized businesses', api.includes("return json({ error: 'Role administration is not assigned for this business.' }, 403)") && api.includes('company_id IN (${sqlList(companyIds)})'));
check('business modules are tied to company codes', ['PRINT','BAKERY','AUTOS','LOGISTICS','PROPERTIES'].every((code) => moduleHub.includes(`companyCodes: ['${code}']`)));
const moduleDefinitions = moduleHub
  .slice(moduleHub.indexOf('const modules:'), moduleHub.indexOf('function owner'))
  .split('\n')
  .filter((line) => line.includes('{ id:'));
check('every module has a plain-language detail', moduleDefinitions.length > 0 && moduleDefinitions.every((line) => line.includes('detail:')));
check('Printing APIs enforce Printing-company access', businessWorkers.printing.includes("minimum, companyId") && businessWorkers.printingProduction.includes("minimum,companyId"));
check('Bakery APIs enforce Bakery-company access', businessWorkers.bakery.includes("'bakery.access',l,bakeryCompany"));
check('Autos APIs enforce Autos-company access', businessWorkers.autos.includes("'autos.access', level, COMPANY") && businessWorkers.autos.includes("minimum,COMPANY"));
check('Logistics APIs enforce Logistics-company access', businessWorkers.logistics.includes("'logistics.access', level, COMPANY") && businessWorkers.logistics.includes("level,COMPANY"));
check('Properties APIs enforce Properties-company access', businessWorkers.properties.includes("'properties.access', level, COMPANY") && businessWorkers.properties.includes("'properties.access', 'approve', COMPANY"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} company-access contract assertion(s) failed.`);
else console.log(`\n${assertions.length} company-access contract assertions passed.`);
