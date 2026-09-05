import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const system = read('src/layout-system.ts');
const home = read('src/post-auth-experience.tsx');
const studio = read('src/layout-studio-entry.tsx');
const shell = read('src/main.tsx') + read('src/zip-dashboard.tsx');
const hub = read('src/module-hub.tsx');
const runtime = read('worker/runtime.ts');
const worker = read('worker/experience-preferences.ts');
const css = read('src/postauth-layout.css') + read('src/layout-studio.css');
const docs = read('docs/ERP-CONSOLIDATION-MAP.md');
const packageFile = JSON.parse(read('package.json'));

const ids = ['executive-command', 'workspace-canvas', 'operational-cockpit', 'insight-magazine', 'master-detail', 'horizon-wide', 'adaptive-bento', 'focus-flow', 'enterprise-studio', 'board-pulse'];
must(ids.every((id) => system.includes("'" + id + "'")), 'all ten layout profiles must be declared');
must(system.includes("DEFAULT_LAYOUT_ID: LayoutId = 'executive-command'"), 'Executive Command must be the default');
must(system.includes('resolveLayout') && system.includes('forcedLayout') && system.includes('roleDefaults') && system.includes('erpDefaults'), 'layout precedence is missing');
must(system.includes('normalizeLayoutId') && system.includes('normalizeDensity') && system.includes('normalizeMotion'), 'layout normalization is missing');
must(system.includes('navigationMode') && system.includes('featurePageStrategy') && system.includes('recordPageStrategy') && system.includes('responsiveRules'), 'layout profile strategy fields are missing');
must(home.includes('PostAuthHomeBanner') && home.includes('OWNER COMMAND CENTER') && home.includes('MANAGER HOME') && home.includes('EMPLOYEE HOME'), 'role-aware home regions are missing');
must(home.includes('PostAuthFeatureFrame') && home.includes('canonicalPath'), 'shared feature-page frame is missing');
must(home.includes('PostAuthOverviewComposition') && ids.every((id) => home.includes('postauth-composition-' + id) || home.includes('postauth-composition-' + id)), 'all ten profiles need explicit dashboard composition adapters');
must(studio.includes('Layout Studio') && studio.includes('Preview') && studio.includes('Apply to me'), 'Layout Studio gallery is missing');
must(studio.includes('layout-preview') && studio.includes('/api/experience/layout/preference'), 'non-destructive preview/apply behavior is missing');
must(studio.includes('rollback') && studio.includes('History'), 'layout rollback/history is missing');
must(shell.includes('layoutProfile') && shell.includes('data-layout-profile') && shell.includes('postauth-layout.css'), 'authenticated shell is not connected to layout engine');
must(hub.includes("id: 'layout-studio'") && hub.includes('Layout Studio'), 'Layout Studio is not in canonical Module Hub');
must(runtime.includes('routeExperiencePreferences') && runtime.includes('/api/experience/'), 'experience API is not routed');
must(worker.includes('allow_personal') && worker.includes('role_defaults') && worker.includes('erp_defaults') && worker.includes('audit_logs'), 'experience persistence/precedence is missing');
must(css.includes('prefers-reduced-motion') && css.includes('postauth-layout-'), 'responsive/motion styles are missing');
must(ids.every((id) => css.includes('postauth-composition-' + id)), 'each layout profile needs a distinct composition style');
must(packageFile.scripts?.prebuild?.includes('check-postauth-layout.mjs'), 'post-auth contract is not wired into prebuild');
must(docs.includes('Autos Workshop') && docs.includes('canonical') && docs.includes('Layout Studio'), 'consolidation map is incomplete');
console.log('Post-auth layout foundation contract: PASS (10 composition adapters)');
