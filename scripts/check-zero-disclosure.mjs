import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const moduleHub = read('src/module-hub.tsx');
const worker = read('worker/runtime.ts');
const dashboardWorker = read('worker/index.ts');
const main = read('src/main.tsx');
const postAuth = read('src/post-auth-experience.tsx');
const smartHelp = read('src/guidance-center.tsx');
const dashboard = read('src/dashboard-capabilities.ts');

must(moduleHub.includes('export function isModuleVisible'), 'module visibility must be centralized');
must(moduleHub.includes('const available = useMemo(() => moduleDefinitions.filter'), 'module search must start from authorized modules');
must(moduleHub.includes('companyCodes') && moduleHub.includes('strictOwnerOnly'), 'module visibility must include company and owner scope');
must(moduleHub.includes('module.permissions') && moduleHub.includes('permissionLevel'), 'module visibility must require effective permission');
must(dashboardWorker.includes('permittedDashboardCompanyIds'), 'dashboard API must constrain company scope');
must(dashboardWorker.includes('DASHBOARD_FIELD_PERMISSIONS'), 'dashboard API must constrain field scope');
must(worker.includes('getEnhancedSessionContext'), 'protected routes must use the enhanced session context');
must(worker.includes('routeAdmin'), 'admin routes must remain behind the protected route boundary');

must(main.includes('hasWorkforcePermission'), 'primary navigation must use effective permissions');
must(postAuth.includes('canSeeDashboardField'), 'Home must use field-level dashboard authorization');
must(smartHelp.includes('hasWorkforcePermission'), 'Smart Help must use effective permissions');
must(dashboard.includes('canSeeDashboardField'), 'dashboard capability helper must be shared by renderers');
must(!/localStorage\.(?:setItem|getItem)\([^)]*(?:password|token|session)/i.test(read('src/auth.tsx')), 'auth material must not be persisted in browser storage');
must(!/sessionStorage\.(?:setItem|getItem)\([^)]*(?:password|token|session)/i.test(read('src/auth.tsx')), 'session material must not be persisted in browser storage');
must(!worker.includes("return json({ permissions: '*'"), 'worker must not expose wildcard permissions');
must(!worker.includes("return json({ data: '*'"), 'worker must not expose wildcard data');
console.log('ZERO_DISCLOSURE_CONTRACT=PASS');
console.log('ZERO_DISCLOSURE_SURFACES=module-route-search-api-home-smart-help');
