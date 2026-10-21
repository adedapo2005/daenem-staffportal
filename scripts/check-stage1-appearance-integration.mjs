import { existsSync, readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../src/qa-review-v115-runtime.tsx', import.meta.url), 'utf8');
const appearance = readFileSync(new URL('../src/stage1-appearance-studio.tsx', import.meta.url), 'utf8');
const paletteCss = readFileSync(new URL('../src/staffportal-stage1-palette.css', import.meta.url), 'utf8');
const contrast = readFileSync(new URL('../src/stage1-a11y-contrast.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/theme-preferences.ts', import.meta.url), 'utf8');
const ledger = readFileSync(new URL('../delivery/STAFFPORTAL-STAGE1-REQUESTED-VS-COMPLETED-2026-10-20.md', import.meta.url), 'utf8');
const retainedPortal = readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx', import.meta.url), 'utf8');
const zipDashboard = readFileSync(new URL('../src/zip-dashboard.tsx', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('runtime mounts the dedicated Appearance studio', runtime.includes('<Stage1AppearanceStudio enabled={stage1Enabled} />'));
check('runtime exposes a semantic post-login palette attribute', runtime.includes('data-postlogin-palette={stage1Enabled ? postLoginPalette : "previous"}'));
check('runtime keeps the reversible Stage 1 switch', runtime.includes('data-stage1-palette={stage1Enabled ? "bright" : "previous"}'));
check('approved palette falls back to Ocean Sapphire Azure Prestige', runtime.includes('POSTLOGIN_DEFAULT_PALETTE'));
check('runtime propagates semantic palette roles to portaled authenticated surfaces', runtime.includes("html.dataset.staffportalPostlogin = 'true'") && runtime.includes('html.style.setProperty(name, value)'));
check('only the authoritative contrast file is imported', runtime.includes("import './stage1-a11y-contrast.css'") && !runtime.includes('stage1-accessibility.css'));
check('duplicate contrast source was removed', !existsSync(new URL('../src/stage1-accessibility.css', import.meta.url)));
check('palette CSS is fully scoped to authenticated Stage 1', paletteCss.includes('[data-approved-postlogin="qa-review-v115"][data-stage1-palette="bright"]'));
check('palette CSS uses semantic roles', ['--stage1-anchor','--stage1-primary','--stage1-accent','--stage1-highlight','--stage1-tint','--stage1-canvas'].every((role) => paletteCss.includes(role)));
check('palette CSS derives a richer luxury support spectrum from approved roles', ['--stage1-support-cyan','--stage1-support-violet','--stage1-support-coral','--stage1-support-gold','--stage1-gradient-spectrum'].every((role) => paletteCss.includes(role)));
check('canonical dashboard richness inherits Stage 1 semantic palette roles', paletteCss.includes('--csp-cobalt: var(--stage1-primary)') && paletteCss.includes('--csp-cyan: var(--stage1-support-cyan)') && paletteCss.includes('--csp-violet: var(--stage1-support-violet)') && paletteCss.includes('--csp-coral: var(--stage1-support-coral)') && paletteCss.includes('--csp-gold: var(--stage1-support-gold)'));
check('palette CSS makes Ocean Sapphire navigation authoritative without glass', paletteCss.includes('background: var(--stage1-anchor) !important') && paletteCss.includes('backdrop-filter: none !important') && !paletteCss.includes('blur('));
check('mobile navigation preserves one-line readable labels', paletteCss.includes('white-space: nowrap !important') && paletteCss.includes('overflow-wrap: normal !important'));
check('Appearance distinguishes preview from persistence', appearance.includes("source: 'preview'") && appearance.includes('Apply to my workspace') && appearance.includes('Cancel preview'));
check('Appearance provides governed Group controls', appearance.includes('Set selected as Group default') && appearance.includes('Force selected for Group') && appearance.includes('Restore approved default'));
check('Appearance is explicitly post-login only', appearance.includes('They do not change Sign-In or another portal'));
check('reviewer-facing runtime uses Pre-Production terminology', retainedPortal.includes('PRE-PRODUCTION REVIEW') && retainedPortal.includes('Pre-Production review controls') && !retainedPortal.includes('DEVELOPMENT PREVIEW ONLY') && !retainedPortal.includes('Development preview controls'));
check('alternate dashboard surface uses Pre-Production terminology', zipDashboard.includes('PRE-PRODUCTION REVIEW') && !zipDashboard.includes('DEVELOPMENT PREVIEW ONLY'));
check('backend uses separate post-login policy and preference routes', worker.includes("'/api/theme/postlogin/policy'") && worker.includes("'/api/theme/postlogin/preference'"));
check('backend preserves explicit group authority and audit', worker.includes('canManageGroupTheme(context)') && worker.includes('update_postlogin_palette_policy'));
check('requested-versus-completed ledger prevents false completion claims', ledger.includes('A successful build, a generated preview, or the presence of a component never changes an item to **Live verified**.'));
check('ledger keeps broader reference work visible', ledger.includes('Purpose-built pages and reference features') && ledger.includes('Loading indicators and skeletons') && ledger.includes('Security views: sign-in/device/session/access events'));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Stage 1 appearance integration assertion(s) failed.`);
else console.log(`\n${assertions.length} Stage 1 appearance integration assertions passed.`);
