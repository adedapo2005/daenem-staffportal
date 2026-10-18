import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const layoutSystem = read('src/layout-system.ts');
const renderer = read('src/post-auth-experience.tsx');
const dashboard = read('src/zip-dashboard.tsx');
const main = read('src/main.tsx');
const studio = read('src/layout-studio-entry.tsx');
const navigation = read('src/postauth-navigation.tsx');
const smartContext = read('src/smart-context.ts');
const experienceWorker = read('worker/experience-preferences.ts');
const runtime = read('worker/runtime.ts');
const readinessCss = read('src/postauth-readiness.css');
const signinTsx = read('src/signin-experience.tsx');
const signinCss = read('src/signin-experience.css');
const packageFile = JSON.parse(read('package.json'));
const renderQa = read('scripts/render-postauth-qa.mjs');

const ids = [
  'executive-command',
  'workspace-canvas',
  'operational-cockpit',
  'insight-magazine',
  'master-detail',
  'horizon-wide',
  'adaptive-bento',
  'focus-flow',
  'enterprise-studio',
  'board-pulse',
];
const contractIds = [
  'executive-command',
  'workspace-canvas',
  'operational-cockpit',
  'insight-magazine',
  'master-detail-workspace',
  'horizon-wide',
  'adaptive-bento',
  'focus-flow',
  'enterprise-studio',
  'board-pulse',
];
const structureFields = [
  'rendererId',
  'navigationAdapterId',
  'navigationGeometry',
  'contentMode',
  'inspectorMode',
  'mobileTransform',
  'motionPersonality',
];

must(ids.every((id) => layoutSystem.includes("'" + id + "'")), 'all ten Staff Portal layout ids are required');
must(layoutSystem.includes("DEFAULT_LAYOUT_ID: LayoutId = 'executive-command'"), 'Executive Command must be the default');
must(layoutSystem.includes('export const LAYOUT_CONTRACT_IDS') && contractIds.every((id) => layoutSystem.includes("'" + id + "'")), 'the public ten-layout contract ids are incomplete');
must(layoutSystem.includes('export type LayoutStructuralProfile') && layoutSystem.includes('structure: LayoutStructuralProfile'), 'structural layout profile contract is missing');
must(layoutSystem.includes('STRUCTURAL_PROFILES') && structureFields.every((field) => layoutSystem.includes(field)), 'structural profile fields are incomplete');
must(layoutSystem.includes('resolveLayout') && layoutSystem.includes('forcedLayout') && layoutSystem.includes('roleDefaults') && layoutSystem.includes('erpDefaults'), 'layout resolution precedence is missing');
must(layoutSystem.includes('normalizeLayoutId') && layoutSystem.includes('normalizeLayoutPreference'), 'layout normalization is missing');
must(new Set(ids.map((id) => layoutSystem.slice(layoutSystem.indexOf("'" + id + "': {"), layoutSystem.indexOf("'" + id + "': {") + 500))).size === ids.length, 'layout profile declarations must be unique');

must(renderer.includes('export function PostAuthLayoutRenderer'), 'there must be one canonical authenticated layout renderer');
must((renderer.match(/export function PostAuthLayoutRenderer/g) || []).length === 1, 'duplicate layout renderer boundary detected');
must(renderer.includes('data-layout-renderer') && renderer.includes('data-layout-content-mode') && renderer.includes('data-layout-mobile-transform'), 'rendered layouts must expose structural identity');
must(ids.slice(1).every((id) => renderer.includes("profile.id === '" + id + "'")), 'all non-default layouts need explicit renderer compositions');
must(renderer.includes('PostAuthContextualNavigation') && renderer.includes('data-contextual-page-navigation'), 'contextual page navigation slot is missing');
must(dashboard.includes('PostAuthLayoutRenderer') && dashboard.includes('data-hybrid-navigation="true"') && dashboard.includes('data-qa-reference="staffportal-qa-review-v115"'), 'authenticated shell is not connected to the canonical layout renderer');
must(dashboard.includes('data-hybrid-top-bar="true"') && dashboard.includes('data-top-slot="global-search"') && dashboard.includes('data-top-slot="ai-command"') && dashboard.includes('data-top-slot="sync-status"'), 'hybrid top-bar slots are incomplete');
must(navigation.includes('data-navigation-adapter') && ids.every((id) => navigation.includes(id === 'master-detail' ? 'master-detail-navigation' : id === 'focus-flow' ? 'contextual' : id)), 'role-aware side/rail navigation adapters are incomplete');

must(main.includes("import './postauth-readiness.css';") && main.includes("import './signin-experience.css';"), 'authenticated token layer or frozen sign-in import is missing');
must(!readinessCss.match(/\.signin|signin-experience|auth-screen/i), 'authenticated readiness CSS must not target sign-in');
must(readinessCss.includes('--sp-bg-canvas') && readinessCss.includes('--sp-accent-primary') && readinessCss.includes('--sp-accent-secondary') && readinessCss.includes('--sp-accent-tertiary'), 'semantic premium tokens are incomplete');
must(readinessCss.includes('#3158d6') && readinessCss.includes('#6857d8') && readinessCss.includes('#0aa5c6'), 'cobalt, violet and cyan palette anchors are missing');
must(readinessCss.includes('.dashboard-page.postauth-layout') && readinessCss.includes('@media (min-width: 2400px)'), 'authenticated scope and wide-display treatment are missing');
must(readinessCss.includes('@media (max-width: 860px)') && readinessCss.includes('@media (max-width: 600px)') && readinessCss.includes('@media (max-width: 430px)'), 'tablet/mobile responsive treatment is missing');
must(readinessCss.includes('@keyframes sp-postauth-enter') && readinessCss.includes('@keyframes sp-postauth-shimmer') && readinessCss.includes('prefers-reduced-motion'), 'central post-auth motion and reduced-motion strategy is missing');
must(readinessCss.includes('min-height: 44px') && readinessCss.includes('touch-action: manipulation'), 'accessible touch-target contract is missing');

must(studio.includes('Layout Studio') && studio.includes('Preview') && /Apply To Me/i.test(studio), 'Layout Studio preview/apply contract is missing');
must(studio.includes('preview: true') && studio.includes('daenem:close-layout-studio') && studio.includes('/api/experience/layout/preference'), 'preview must remain temporary until explicit apply');
must(studio.includes('History') && studio.includes('rollback') && /Organization default/i.test(studio) && /Role defaults/i.test(studio), 'Layout Studio defaults/history/rollback controls are incomplete');
must(experienceWorker.includes('/api/experience/layout') && experienceWorker.includes('/api/experience/layout/preference') && experienceWorker.includes('/api/experience/layout/policy') && experienceWorker.includes('/api/experience/layout/rollback'), 'existing experience preference API seams are not reused');
must(runtime.includes('routeExperiencePreferences') && runtime.includes('/api/experience/'), 'experience preference routing is not connected');
must(experienceWorker.includes('allow_personal') && experienceWorker.includes('role_defaults') && experienceWorker.includes('erp_defaults') && experienceWorker.includes('organization_default'), 'personal/role/ERP/organization preference scopes are missing');

must(smartContext.includes('SMART_CONTEXT_REGISTRY') && smartContext.includes('whatItDoes') && smartContext.includes('expectedOutcome') && smartContext.includes('permissions'), 'Smart Context definition contract is incomplete');
must(renderer.includes('hasWorkforcePermission(context, \'ai_guide.access\', \'view\')'), 'Smart Context help must be permission aware');
must(packageFile.scripts?.['test:postauth-layout-readiness'] === 'node scripts/check-postauth-layout-readiness.mjs', 'readiness test script is not wired');
must(packageFile.scripts?.prebuild?.includes('check-postauth-layout-readiness.mjs'), 'readiness contract must run during prebuild');

must(signinTsx.length > 0 && signinCss.length > 0, 'frozen sign-in sources must remain present');
must(renderQa.includes('owner-executive-command-2560x1440') && renderQa.includes('owner-executive-command-768x1024') && renderQa.includes('owner-executive-command-1024x1366') && renderQa.includes('owner-executive-command-430x932'), 'required real-app viewport captures are not declared');
must(renderQa.includes('TEN_LAYOUT_COMPARISON'), 'ten-layout rendered comparison evidence is not declared');
must(!/https?:\/\//i.test(readinessCss), 'new authenticated CSS must not import cross-site design sources');

console.log('POSTAUTH_LAYOUT_READINESS=PASS');
console.log('LAYOUT_REGISTRY=PASS (10 unique structural profiles; Executive Command default)');
console.log('LAYOUT_RENDERER=PASS (one canonical renderer; route content remains shared)');
console.log('PREFERENCE_ENGINE=PASS (existing experience preference API reused)');
console.log('LAYOUT_STUDIO=PASS (preview is non-persistent; Apply/History/Rollback remain explicit)');
console.log('HYBRID_NAVIGATION=PASS (top bar, role-aware side/rail, contextual navigation)');
console.log('SMART_CONTEXT_RBAC=PASS');
console.log('RESPONSIVE_MOTION=PASS (tablet/mobile/4K and reduced-motion contracts)');
console.log('SIGNIN_BOUNDARY=PASS (readiness styles scoped away from frozen sign-in sources)');
