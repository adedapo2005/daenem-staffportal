import { readFileSync } from 'node:fs';
import { ownerCompanyScopes } from '../src/owner-company-scope.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('worker/auth.ts');
const api = read('worker/index.ts');
const clientAuth = read('src/auth.tsx');
const approvedPostLogin = read('src/qa-review-v115-runtime.tsx');
const approvedPortalModel = read('source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model.ts');
const moduleHub = read('src/module-hub.tsx');
const packageJson = JSON.parse(read('package.json'));
const businessWorkers = {
  printing: read('worker/printing.ts'),
  printingProduction: read('worker/printing-production.ts'),
  bakery: read('worker/bakery.ts'),
  autos: `${read('worker/autos-v2.ts')}\n${read('worker/autos-v3.ts')}`,
  logistics: `${read('worker/logistics.ts')}\n${read('worker/logistics-v2.ts')}`,
  inventory: read('worker/inventory.ts'),
  finance: read('worker/finance.ts'),
  procurement: read('worker/procurement.ts'),
  properties: `${read('worker/properties.ts')}\n${read('worker/properties-v2.ts')}`,
};

const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('release version and approved shell identity are synchronized', /^7\.0\.0-alpha\.\d+$/.test(packageJson.version) && approvedPostLogin.includes('data-approved-postlogin="qa-review-v115"') && approvedPostLogin.includes("version: '115'") && approvedPostLogin.includes('09bd2051d118242bce095be012a3a763cc1f8a33'));
check('session returns company permission maps', auth.includes('companyPermissions,') && auth.includes('employee_permission_overrides_v2'));
check('general roles apply across assigned businesses', auth.includes('const targets = row.companyId ? [String(row.companyId)] : companyIds'));
check('explicit business overrides apply last', auth.indexOf('for (const row of scopedOverrides.results || [])') > auth.indexOf('for (const row of permissionRows.results || [])'));
check('server permission helper accepts a company', auth.includes("companyId?: string | null") && auth.includes('context.companyPermissions[companyId]'));
check('client permission helper accepts a company', clientAuth.includes('hasWorkforcePermission') && clientAuth.includes('context.companyPermissions?.[companyId]'));
check('background tabs reuse cached identity', clientAuth.includes("document.visibilityState === 'hidden'") && clientAuth.includes('authMeCache.value'));
check('approved Portal receives only an authenticated Worker context', approvedPostLogin.includes('WorkforceContext') && approvedPostLogin.includes('sessionForProfile'));
check('Owner runtime presents a Group workspace only when multiple authorized company scopes exist', approvedPostLogin.includes('ownerCompanyScopes(context)') && approvedPostLogin.includes("ownerCompanies.length > 1 ? 'group' : ownerCompanies[0] || 'group'"));
check('Owner assignments are limited to company scopes from the authenticated context', approvedPostLogin.includes('companies: profile === \'Owner\' ? ownerCompanies : company === \'group\' ? [] : [company]') && !approvedPostLogin.includes("companies: profile === 'Owner' ? assignment.companies"));
const fixtureCompanies = [
  { id: 'company-printing', code: 'PRINT', name: 'Daenem Printing & Technology', primary: true },
  { id: 'company-autos', code: 'AUTOS', name: 'Daenem Autos', primary: false },
  { id: 'company-bakery', code: 'BAKERY', name: 'Daenem Bakery', primary: false },
  { id: 'company-properties', code: 'PROPERTIES', name: 'Daenem Homes & Properties', primary: false },
  { id: 'company-logistics', code: 'LOGISTICS', name: 'Daenem Logistics', primary: false },
];
const fixtureGrants = Object.fromEntries(['printing.access','bakery.access','autos.access','logistics.access','properties.access'].map((key) => [key, 'manage']));
const ownerContext = (roleRows, grantCompanyIds = fixtureCompanies.map((company) => company.id), companyRows = fixtureCompanies) => ({
  sessionId: 'synthetic-owner-scope',
  employee: { id: 'synthetic-owner', displayName: 'Synthetic Owner', status: 'active' },
  companies: companyRows,
  roles: roleRows,
  permissions: {},
  companyPermissions: Object.fromEntries(grantCompanyIds.map((id) => [id, { ...fixtureGrants }])),

});
const ownerRoles = (companyIds) => companyIds.map((companyId) => ({ id: 'owner-' + companyId, code: 'owner', name: 'Owner / Super Admin', companyId }));
check('five-company Owner receives all five memberships together', JSON.stringify(ownerCompanyScopes(ownerContext(ownerRoles(fixtureCompanies.map((company) => company.id))))) === JSON.stringify(['printing','autos','bakery','properties','logistics']));
check('single-company Owner never receives other company navigation', JSON.stringify(ownerCompanyScopes(ownerContext(ownerRoles(['company-printing'])))) === JSON.stringify(['printing']));
check('company membership without a non-none company permission fails closed', ownerCompanyScopes(ownerContext(ownerRoles(fixtureCompanies.map((company) => company.id)), [] )).length === 0);
const invalidGrantContext = ownerContext(ownerRoles(['company-printing']), ['company-printing']);
for (const key of Object.keys(invalidGrantContext.companyPermissions['company-printing'])) invalidGrantContext.companyPermissions['company-printing'][key] = 'unexpected';
check('unknown permission levels do not create Owner company navigation', ownerCompanyScopes(invalidGrantContext).length === 0);
check('permission maps for other companies do not create navigation without matching Owner memberships', JSON.stringify(ownerCompanyScopes(ownerContext(ownerRoles(['company-printing']), fixtureCompanies.map((company) => company.id)))) === JSON.stringify(['printing']));
check('Manager company roles are not promoted into Owner-wide company navigation', ownerCompanyScopes(ownerContext(fixtureCompanies.map((company) => ({ id: 'manager-' + company.id, code: 'manager', name: 'Manager', companyId: company.id })))) .length === 0);
check('unknown company identities fail closed rather than becoming Group scope', ownerCompanyScopes(ownerContext(ownerRoles(['unknown-company']), ['unknown-company'], [{ id: 'unknown-company', code: 'OTHER', name: 'Other Business', primary: true }])).length === 0);
check('unknown company cannot grant non-Owner group scope', approvedPostLogin.includes("company === 'group' ? [] : [company]") && !approvedPostLogin.includes("profile === 'Owner' || company === 'group'"));
check('workspace routes are not redirected away from My Work', approvedPostLogin.includes("window.location.pathname === '/' || window.location.pathname === '/workspace/'") && !approvedPostLogin.includes("startsWith('/workspace')"));
check('approved sidebar and records are permission projected', approvedPortalModel.includes('effectiveLevel') && approvedPortalModel.includes('canView') && approvedPortalModel.includes('authorizedRecords'));
check('employee approvals are constrained by business', auth.includes('requested_company_id IN (${placeholders})'));
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
check('Inventory APIs enforce per-company permission scope', businessWorkers.inventory.includes("hasPermission(context, 'inventory.access', minimum, companyId)"));
const unscopedFinancePermission = /can\(context,\s*'finance\.[^']+'(?:,\s*'(?:view|create|edit|approve|manage)')?\)/;
check('Finance APIs enforce per-company permission scope', businessWorkers.finance.includes('hasPermission(c,p,l,companyId)') && !unscopedFinancePermission.test(businessWorkers.finance));
check('Finance state transitions fail closed outside company scope', businessWorkers.finance.includes("!can(context,'finance.journal','approve',String(entry.companyId))") && businessWorkers.finance.includes("!can(context,'finance.receivables','edit',row.companyId)"));
check('Procurement transitions conceal records outside permission scope', businessWorkers.procurement.includes("!purchaseOrder || !member(context, purchaseOrder.companyId) || (!owner(context) && !hasPermission(context, 'procurement.access', 'approve', purchaseOrder.companyId))") && !businessWorkers.procurement.includes("Procurement approval permission is required."));
check('Procurement idempotency evidence is company scoped', businessWorkers.procurement.includes('WHERE idempotency_key=? AND company_id=?') && businessWorkers.procurement.includes('findEventByIdempotencyKey(env, idempotencyKey, purchaseOrder.companyId)'));
check('Properties APIs enforce Properties-company access', businessWorkers.properties.includes("'properties.access', level, COMPANY") && businessWorkers.properties.includes("'properties.access', 'approve', COMPANY"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} company-access contract assertion(s) failed.`);
else console.log(`\n${assertions.length} company-access contract assertions passed.`);

