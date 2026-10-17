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
  'canonical-fonts.ts',
  'display-standards.ts',
  'index.ts',
  ...wrappers.map((file) => path.join('layouts', file)),
];
for (const file of required) must(fs.existsSync(path.join(canonicalRoot, file)), 'canonical source file missing: ' + file);

const types = read('src/canonical-postauth-v1/canonical-types.ts');
const fixture = read('src/canonical-postauth-v1/canonical-fixture.ts');
const specs = read('src/canonical-postauth-v1/layout-specs.ts');
const dashboard = read('src/canonical-postauth-v1/CanonicalDashboard.tsx');
const css = read('src/canonical-postauth-v1/canonical-dashboard.css');
const fonts = read('src/canonical-postauth-v1/canonical-fonts.ts');
const displayStandards = read('src/canonical-postauth-v1/display-standards.ts');
const adapter = read('src/canonical-postauth-v1/staffportal-adapter.tsx');
const index = read('src/canonical-postauth-v1/index.ts');
const layoutSystem = read('src/layout-system.ts');
const dashboardEntry = read('src/zip-dashboard.tsx');
const main = read('src/main.tsx');
const packageJson = JSON.parse(read('package.json'));

const quoted = (value) => `[\"']?${value}[\"']?`;

must(types.includes("StaffPortalLayoutId"), 'canonical layout type is missing');
must(ids.every((id) => types.includes("'" + id + "'")), 'canonical type IDs are incomplete');
must(ids.every((id) => new RegExp(quoted(id)).test(specs)), 'canonical layout specs are incomplete');
must(ids.every((id) => new RegExp(`${quoted('id')}\\s*:\\s*${quoted(id)}`).test(specs)), 'canonical layout spec IDs are incomplete');
must(ids.every((id) => dashboard.includes("'" + id + "'")), 'canonical dashboard layout copy is incomplete');
must(adapter.includes('CANONICAL_LAYOUT_IDS') && adapter.includes('canonicalLayoutId') && adapter.includes('storedLayoutId'), 'canonical adapter does not cover the complete layout selection boundary');
must(ids.every((id) => index.includes(id === 'master-detail-workspace' ? 'MasterDetailWorkspaceLayout' : id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(''))), 'canonical layout exports are incomplete');
must(wrappers.every((file) => fs.existsSync(path.join(canonicalRoot, 'layouts', file))), 'canonical layout wrapper is missing');

const structuralProfiles = ids.map((id) => {
  const match = specs.match(new RegExp(quoted(id) + "\\s*:[\\s\\S]*?" + quoted('zones') + "\\s*:\\s*\\[[\\s\\S]*?\\]", 'm'));
  return match?.[0] || '';
});
must(new Set(structuralProfiles).size === ids.length, 'canonical layout profiles are not structurally unique');
must(dashboard.includes('CANONICAL_LAYOUT_SPECS[layoutId]'), 'canonical dashboard does not use the supplied layout spec boundary');
must(dashboard.includes('mobileOrder.indexOf(zone)'), 'canonical dashboard does not consume the supplied mobile order');
must(
  (dashboard.includes('liveSlots?.hero') && dashboard.includes('liveSlots?.[zone]')) ||
    (dashboard.includes("hasOwnProperty.call(liveSlots,'hero')") && dashboard.includes('hasOwnProperty.call(liveSlots,zone)')),
  'live adapter slots do not preserve the canonical zone boundary',
);
must(dashboard.includes('navigation') && dashboard.includes('onAskAi') && dashboard.includes('onQuickCreate'), 'canonical chrome integration seams are missing');
must(/onAskAi\s*&&\s*<button[^>]+csp-ai/.test(dashboard), 'AI command is not hidden when the authenticated context lacks AI permission');
must(dashboard.includes('formatPersonName') && dashboard.includes('initialsFromPersonName'), 'canonical dashboard does not use display-name helpers');
must(displayStandards.includes('export function formatPersonName') && displayStandards.includes('export function formatUiLabel') && displayStandards.includes('export function initialsFromPersonName'), 'display standards exports are incomplete');
must(index.includes("export * from './display-standards';"), 'canonical index does not export display standards');
must(fonts.includes("@fontsource-variable/inter/wght.css") && fonts.includes("@fontsource-variable/manrope/wght.css"), 'canonical font entry is incomplete');
must(main.includes("import './canonical-postauth-v1/canonical-fonts';"), 'main does not import canonical fonts directly');
must(packageJson.dependencies?.['@fontsource-variable/inter'] === '5.3.0' && packageJson.dependencies?.['@fontsource-variable/manrope'] === '5.3.0', 'canonical font package versions are not pinned to 5.3.0');
must(fixture.includes('VISUAL QA ONLY') && fixture.includes('Never use this fixture as production business truth'), 'fixture warning is missing');
must(adapter.includes('import.meta.env.DEV && import.meta.env.VITE_CANONICAL_QA_FIXTURE === \'true\''), 'fixture mode is not development-only');
must(adapter.includes('liveFixture(') && adapter.includes('liveSlots'), 'real Staff Portal adapter is missing');
must(adapter.includes("valueFor(context, 'employees'") && adapter.includes("valueFor(context, 'pendingApprovals'"), 'adapter does not map authorized live summary data');
must(adapter.includes("'Not Available'") && adapter.includes("'Permission Required'"), 'adapter does not provide truthful no-data states');
must(adapter.includes("value === 'master-detail' ? 'master-detail-workspace'"), 'stored master-detail ID is not adapted to the canonical visual ID');
must(adapter.includes("value === 'master-detail-workspace' ? 'master-detail'"), 'canonical master-detail ID is not adapted back to stored compatibility ID');
must(/zone === 'studio-toolbox'[\s\S]*?canUseLayoutStudio\s*&&/.test(adapter), 'Layout Studio control is not hidden from unauthorized authenticated contexts');
must(!adapter.includes('concept-references') && !dashboard.includes('concept-references'), 'concept reference images are being used by runtime code');
must(css.includes('--csp-cobalt:#2f5be7') && css.includes('--csp-green') === false, 'canonical palette tokens are not authoritative');
must(css.includes('@media (min-width:3200px)') && css.includes('@media (max-width:767px)'), 'canonical responsive breakpoints are incomplete');
must(css.includes('--csp-font:"Inter Variable","Inter","Segoe UI",Arial,sans-serif;') && css.includes('--csp-heading:"Manrope Variable","Manrope","Segoe UI",Arial,sans-serif;'), 'canonical font stacks are not deterministic');
must(/button:focus-visible[^{]*\{[^}]*outline:/s.test(css), 'canonical focus-visible protection is missing');
must(css.includes('overflow-wrap:anywhere') && css.includes('overflow-wrap:normal'), 'canonical overflow protection is missing');
must(css.includes('@media (max-width:767px){.csp-root input,.csp-root textarea,.csp-root select{font-size:16px}'), 'mobile interactive text protection is missing');
const authoredSub9 = [
  ...css.matchAll(/font-size\s*:\s*([\d.]+)px/g),
  ...css.matchAll(/font\s*:\s*(?:normal\s+|italic\s+)?\d+\s+([\d.]+)px/g),
].filter((match) => Number(match[1]) < 9);
must(authoredSub9.length === 0, 'canonical authored UI contains sub-9px text declarations: ' + authoredSub9.map((match) => match[0]).join(', '));
must(main.indexOf("import './canonical-postauth-v1/canonical-dashboard.css';") > main.indexOf("import './postauth-readiness.css';"), 'canonical CSS is not loaded after legacy authenticated CSS');
must(dashboardEntry.includes('return <main className={`dashboard-page') && !dashboardEntry.includes('return <CanonicalStaffPortalAdapter'), 'approved premium post-auth shell is not the sole authenticated boundary');
must(dashboardEntry.indexOf('return <CanonicalStaffPortalAdapter') < dashboardEntry.indexOf('return <main className={'), 'legacy dashboard return is not unreachable behind the canonical boundary');
must(layoutSystem.includes("'master-detail': 'master-detail-workspace'"), 'accepted stored master-detail compatibility mapping is missing');

const recordInteractionStart = dashboard.indexOf('function MasterRecords');
const recordInteractionEnd = dashboard.indexOf('function WorkspaceTasks');
const recordInteractionSource = recordInteractionStart >= 0 && recordInteractionEnd > recordInteractionStart
  ? dashboard.slice(recordInteractionStart, recordInteractionEnd)
  : '';
must(recordInteractionSource.includes('Records You Can Access'), 'record interaction list heading is not plain-language');
must(recordInteractionSource.includes('No Records Available'), 'record interaction empty state is not plain-language');
must(recordInteractionSource.includes('Available To You'), 'record interaction availability language is missing');
must(recordInteractionSource.includes('Record Details'), 'record interaction detail language is missing');
must(recordInteractionSource.includes('aria-label="Record Filters"'), 'record interaction filter accessibility label is not plain-language');
must(recordInteractionSource.includes('aria-label="Search Records"'), 'record interaction search accessibility label is not plain-language');
must(recordInteractionSource.includes('aria-label="Records You Can Access"'), 'record interaction list accessibility label is not plain-language');
must(recordInteractionSource.includes('data-record-dedicated-page'), 'dedicated record page primitive is missing');
must(recordInteractionSource.includes('aria-label="Record Breadcrumbs"'), 'dedicated record breadcrumbs are missing');
must(recordInteractionSource.includes('Back To Records'), 'dedicated record return control is missing');
must(dashboard.includes("url.searchParams.set('record', recordRouteKey(record,index))"), 'dedicated record URL routing is missing');
must(dashboard.includes("window.addEventListener('popstate', syncRecordRoute)"), 'dedicated record browser history synchronization is missing');
must(dashboard.includes("window.history.pushState(state,'',url)"), 'dedicated record pushState navigation is missing');
must(recordInteractionSource.includes('value={listState.query}'), 'record list search state is not controlled/preservable');
must(recordInteractionSource.includes("listState.view==='priority'"), 'record list filter state is not controlled/preservable');
must(recordInteractionSource.includes('sort:nextSort[listState.sort]'), 'record list sort state is not controlled/preservable');
must(recordInteractionSource.includes('scrollTop:event.currentTarget.scrollTop'), 'record list scroll state is not captured');
must(dashboard.includes('recordListState={recordListState}'), 'record list state is not preserved above dedicated record routing');
must(recordInteractionSource.includes('aria-label="Close Quick Inspection"'), 'Quick Inspection explicit close control is missing');
must(recordInteractionSource.includes('Open Quick Inspection'), 'Quick Inspection reopen control is missing');
must(recordInteractionSource.includes("event.key==='Escape'"), 'Quick Inspection Escape handling is missing');
must(recordInteractionSource.includes('quickInspectionToggleRef.current?.focus()') && recordInteractionSource.includes('quickInspectionCloseRef.current?.focus()'), 'Quick Inspection focus return/entry handling is missing');
for (const technicalCopy of ['Operational Context', 'Data Scope', 'working context', 'Authorized Record Filters', 'Search Authorized Records', 'aria-label="Authorized Records"']) {
  must(!recordInteractionSource.includes(technicalCopy), 'record interaction contains technical user-facing copy: ' + technicalCopy);
}

console.log('CANONICAL_POSTAUTH_SOURCE=PASS');
console.log('CANONICAL_LAYOUT_IDS=' + ids.length);
console.log('CANONICAL_LAYOUT_STRUCTURAL_PROFILES=PASS');
console.log('CANONICAL_FIXTURE_IS_DEV_ONLY=PASS');
console.log('CANONICAL_REAL_DATA_ADAPTER=PASS');
console.log('CANONICAL_CSS_PRIORITY=PASS');
console.log('CANONICAL_OVERVIEW_BOUNDARY=PASS');
