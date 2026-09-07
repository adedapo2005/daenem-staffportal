import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const canonicalRoot = path.join(root, 'src', 'canonical-postauth-v1');
const ids = [
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
const wrappers = [
  'ExecutiveCommandLayout.tsx',
  'WorkspaceCanvasLayout.tsx',
  'OperationalCockpitLayout.tsx',
  'InsightMagazineLayout.tsx',
  'MasterDetailWorkspaceLayout.tsx',
  'HorizonWideLayout.tsx',
  'AdaptiveBentoLayout.tsx',
  'FocusFlowLayout.tsx',
  'EnterpriseStudioLayout.tsx',
  'BoardPulseLayout.tsx',
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const required = [
  'canonical-types.ts',
  'canonical-fixture.ts',
  'layout-specs.ts',
  'CanonicalDashboard.tsx',
  'canonical-dashboard.css',
  'index.ts',
  ...wrappers.map((file) => path.join('layouts', file)),
];
for (const file of required) must(fs.existsSync(path.join(canonicalRoot, file)), 'canonical source file missing: ' + file);

const types = read('src/canonical-postauth-v1/canonical-types.ts');
const fixture = read('src/canonical-postauth-v1/canonical-fixture.ts');
const specs = read('src/canonical-postauth-v1/layout-specs.ts');
const dashboard = read('src/canonical-postauth-v1/CanonicalDashboard.tsx');
const css = read('src/canonical-postauth-v1/canonical-dashboard.css');
const adapter = read('src/canonical-postauth-v1/staffportal-adapter.tsx');
const index = read('src/canonical-postauth-v1/index.ts');
const layoutSystem = read('src/layout-system.ts');
const dashboardEntry = read('src/zip-dashboard.tsx');
const main = read('src/main.tsx');

must(types.includes("StaffPortalLayoutId"), 'canonical layout type is missing');
must(ids.every((id) => types.includes("'" + id + "'")), 'canonical type IDs are incomplete');
must(ids.every((id) => specs.includes("'" + id + "'")), 'canonical layout specs are incomplete');
must(ids.every((id) => specs.includes("id: '" + id + "'")), 'canonical layout spec IDs are incomplete');
must(ids.every((id) => dashboard.includes("'" + id + "'")), 'canonical dashboard layout copy is incomplete');
must(adapter.includes('CANONICAL_LAYOUT_IDS') && adapter.includes('canonicalLayoutId') && adapter.includes('storedLayoutId'), 'canonical adapter does not cover the complete layout selection boundary');
must(ids.every((id) => index.includes(id === 'master-detail-workspace' ? 'MasterDetailWorkspaceLayout' : id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(''))), 'canonical layout exports are incomplete');
must(wrappers.every((file) => fs.existsSync(path.join(canonicalRoot, 'layouts', file))), 'canonical layout wrapper is missing');

const structuralProfiles = ids.map((id) => {
  const match = specs.match(new RegExp("'" + id + "':[\\s\\S]*?zones: \\[[\\s\\S]*?\\]", 'm'));
  return match?.[0] || '';
});
must(new Set(structuralProfiles).size === ids.length, 'canonical layout profiles are not structurally unique');
must(dashboard.includes('CANONICAL_LAYOUT_SPECS[layoutId]'), 'canonical dashboard does not use the supplied layout spec boundary');
must(dashboard.includes('liveSlots?.hero') && dashboard.includes('liveSlots?.[zone]'), 'live adapter slots do not preserve the canonical zone boundary');
must(dashboard.includes('navigation') && dashboard.includes('onAskAi') && dashboard.includes('onQuickCreate'), 'canonical chrome integration seams are missing');
must(fixture.includes('VISUAL QA ONLY') && fixture.includes('Never use this fixture as production business truth'), 'fixture warning is missing');
must(adapter.includes('import.meta.env.DEV && import.meta.env.VITE_CANONICAL_QA_FIXTURE === \'true\''), 'fixture mode is not development-only');
must(adapter.includes('liveFixture(') && adapter.includes('liveSlots'), 'real Staff Portal adapter is missing');
must(adapter.includes("valueFor(context, 'employees'") && adapter.includes("valueFor(context, 'pendingApprovals'"), 'adapter does not map authorized live summary data');
must(adapter.includes("'Not Available'") && adapter.includes("'Permission Required'"), 'adapter does not provide truthful no-data states');
must(adapter.includes("value === 'master-detail' ? 'master-detail-workspace'"), 'stored master-detail ID is not adapted to the canonical visual ID');
must(adapter.includes("value === 'master-detail-workspace' ? 'master-detail'"), 'canonical master-detail ID is not adapted back to stored compatibility ID');
must(!adapter.includes('concept-references') && !dashboard.includes('concept-references'), 'concept reference images are being used by runtime code');
must(css.includes('--csp-cobalt:#2f5be7') && css.includes('--csp-green') === false, 'canonical palette tokens are not authoritative');
must(css.includes('@media (min-width:3200px)') && css.includes('@media (max-width:767px)'), 'canonical responsive breakpoints are incomplete');
must(main.indexOf("import './canonical-postauth-v1/canonical-dashboard.css';") > main.indexOf("import './postauth-readiness.css';"), 'canonical CSS is not loaded after legacy authenticated CSS');
must(dashboardEntry.includes("if (activeView === 'overview')") && dashboardEntry.includes('CanonicalStaffPortalAdapter'), 'canonical dashboard adapter is not the overview boundary');
must(dashboardEntry.indexOf("if (activeView === 'overview')") < dashboardEntry.indexOf('return <main className={'), 'legacy dashboard return precedes canonical overview boundary');
must(layoutSystem.includes("'master-detail': 'master-detail-workspace'"), 'accepted stored master-detail compatibility mapping is missing');

console.log('CANONICAL_POSTAUTH_SOURCE=PASS');
console.log('CANONICAL_LAYOUT_IDS=' + ids.length);
console.log('CANONICAL_LAYOUT_STRUCTURAL_PROFILES=PASS');
console.log('CANONICAL_FIXTURE_IS_DEV_ONLY=PASS');
console.log('CANONICAL_REAL_DATA_ADAPTER=PASS');
console.log('CANONICAL_CSS_PRIORITY=PASS');
console.log('CANONICAL_OVERVIEW_BOUNDARY=PASS');
