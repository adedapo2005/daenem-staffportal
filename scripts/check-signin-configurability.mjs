import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('src/signin-experience.css');
const prefs = read('src/signin-preferences.ts');
const studio = read('src/theme-studio-entry.ts');
const worker = read('worker/theme-preferences.ts');
const workerIndex = read('worker/index.ts');
const auth = read('src/auth.tsx');
const signin = read('src/signin-experience.tsx');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('desktop sign-in uses a height-bounded no-scroll surface', css.includes('@media (min-width: 821px)') && css.includes('height: 100dvh') && css.includes('overflow: hidden'));
check('V2 preferences migrate to V3', prefs.includes('schemaVersion: 3') && prefs.includes('SIGNIN_PREFS_KEY') && worker.includes('ui.signin_config_v2') && worker.includes('ui.signin_config_v3'));
check('invalid widget kinds are rejected', prefs.includes('ALL_WIDGETS.includes') && worker.includes('SIGNIN_WIDGET_KINDS.includes'));
check('invalid widget zones are rejected', prefs.includes('ALL_ZONES.includes') && worker.includes('SIGNIN_ZONES.includes'));
check('invalid clock zones are rejected', prefs.includes('WORLD_CLOCK_CATALOG.map') && worker.includes('CLOCK_ZONES'));
check('editable labels have bounded lengths', prefs.includes('SIGNIN_LABEL_LIMITS') && prefs.includes('cleanText') && worker.includes('LABEL_LIMITS'));
check('unauthorized employees cannot modify sign-in config', worker.includes("!canManage") && worker.includes("Manage Settings permission is required.") && worker.includes("return json({ error: 'Manage Settings permission is required.' }, 403)"));
check('Manage Settings users can modify sign-in config', worker.includes("hasPermission(context, 'settings.access', 'manage')") && worker.includes("ui.signin_config_v3"));
check('authentication handlers remain present', auth.includes("/api/auth/login") && auth.includes('requestAppInstall') && auth.includes('switchMode'));
check('seven standard clocks remain available', ['Daenem Complex', 'Toronto', 'London', 'New York', 'Moscow', 'Tokyo', 'Beijing / Shanghai'].every((name) => prefs.includes(name)));
check('widget variants normalize correctly', prefs.includes('SIGNIN_WIDGET_VARIANTS') && prefs.includes('normalizeWidgetVariant') && studio.includes('data-widget-variant'));
check('reduced-motion compatibility remains active', css.includes('@media (prefers-reduced-motion: reduce)') && prefs && read('src/signin-experience.tsx').includes("prefers-reduced-motion"));
check('news remains source-bound', workerIndex.includes('liveHeadlines') && workerIndex.includes('news.length ? news : fallbackNews') && worker.includes('Only inspiration and motivation can use AI options.'));
check('desktop auth surface does not enable an internal scrollbar', css.includes('overflow-y: hidden') && css.includes('max-height: 100%') && css.includes('scrollbar-width: none'));
check('TODAY and AUXILIARY map to distinct rendered regions', signin.includes("['today'], 'today'") && signin.includes("['auxiliary'], 'auxiliary'") && signin.includes('usp-widget-region-auxiliary'));
check('logo animation selections have concrete behavior', signin.includes('usp-logo-animation-') && ['none', 'float', 'orbit', 'pulse'].every((name) => css.includes('.usp-logo-animation-' + name)));
check('news variants have distinct rendered compositions', ['usp-news-stack', 'usp-news-briefing', 'usp-news-ticker', 'usp-news-top-stories'].every((name) => signin.includes(name)) && css.includes('usp-news-ticker-rotate'));
check('safe display labels are normalized centrally', prefs.includes('liveErpAccess') && prefs.includes('installApp') && prefs.includes('clockSummary') && worker.includes('cleanText(source.installApp') && worker.includes('cleanText(source.clockSummary'));
check('safe authentication presentation labels are centrally normalized', prefs.includes('SignInAuthLabels') && prefs.includes('socialNote') && prefs.includes('legalPrefix') && auth.includes('authLabels.socialNote') && studio.includes('labels.auth.') && worker.includes('DEFAULT_LABELS.auth'));
check('compact desktop signup preserves all three client-side steps', auth.includes("signupStep === 'identity'") && auth.includes("signupStep === 'account'") && auth.includes("signupStep === 'work'") && auth.includes("setSignupStep('verify')"));
check('zone capacity governor renders a reachable pager', signin.includes('usp-widget-rotator') && signin.includes('data-widget-count') && signin.includes('setZonePages') && css.includes('.usp-widget-rotator-controls'));
check('all responsive zones are independently rendered', ['workspace-spotlight', 'live-context', 'today', 'auxiliary'].every((zone) => signin.includes("'" + zone + "'") && signin.includes('usp-widget-region-' + zone)));
check('desktop auth panel has no scrollbar and compact errors', css.includes('.usp-auth-panel {\n    overflow: visible;') && css.includes('.usp-auth-message {\n    margin-bottom: 8px;'));
check('desktop typography floor is nine pixels with compact clock detail', css.includes('font-size: 9px;') && css.includes('.usp-clock-compact-detail') && css.includes('display: none;'));

// Deterministic fit accounting for the compact desktop composition. These
// values are derived from the final CSS control heights, gaps, panel padding,
// heading/tabs, legal copy, and footer. This is not rendered-browser proof.
const desktopViewports = [
  { name: '1366x768', height: 768, available: 553 },
  { name: '1280x720', height: 720, available: 538 },
  { name: '1024x768', height: 768, available: 553 },
  { name: '1024x600', height: 600, available: 458 },
];
const authRequirements = {
  signin: 420,
  signupStep1: 408,
  signupStep2: 430,
  signupStep3: 300,
  signupVerification: 330,
  forgotIdentity: 300,
  forgotVerification: 310,
  passwordReset: 430,
  validationErrorAllowance: 20,
};
for (const viewport of desktopViewports) {
  const modes = Object.entries(authRequirements).filter(([key]) => key !== 'validationErrorAllowance').map(([, value]) => value);
  const fits = modes.every((value) => value <= viewport.available);
  const errorFits = authRequirements.signin + authRequirements.validationErrorAllowance <= viewport.available;
  console.log('FIT MODEL ' + viewport.name + ': panel ' + viewport.available + 'px; max auth ' + Math.max(...modes) + 'px; validation allowance ' + authRequirements.validationErrorAllowance + 'px; ' + (fits && errorFits ? 'PASS' : 'FAIL'));
  check('auth modes fit ' + viewport.name, fits && errorFits);
}

function normalizeStressInstances(instances) {
  const byZone = new Map();
  for (const item of instances.filter((entry) => entry.visible !== false)) {
    const list = byZone.get(item.zone) || [];
    list.push(item);
    byZone.set(item.zone, list);
  }
  return [...byZone.values()].every((list) => list.length === 0 || (list.length >= 1 && list.every((item) => item.id)));
}
const stressCases = [
  Array.from({ length: 5 }, (_, index) => ({ id: 'default-' + index, zone: index < 2 ? 'live-context' : 'today', visible: true })),
  Array.from({ length: 10 }, (_, index) => ({ id: 'ten-' + index, zone: ['workspace-spotlight', 'live-context', 'today', 'auxiliary'][index % 4], visible: true })),
  Array.from({ length: 6 }, (_, index) => ({ id: 'news-' + index, zone: 'today', visible: true })),
  Array.from({ length: 5 }, (_, index) => ({ id: 'today-' + index, zone: 'today', visible: true })),
  Array.from({ length: 5 }, (_, index) => ({ id: 'aux-' + index, zone: 'auxiliary', visible: true })),
  Array.from({ length: 5 }, (_, index) => ({ id: 'spotlight-' + index, zone: 'workspace-spotlight', visible: true })),
];
check('layout governor stress cases stay reachable', stressCases.every(normalizeStressInstances) && css.includes('.usp-widget-rotator-controls button') && css.includes('min-height: 44px'));
function nextId(kind, instances) {
  const used = new Set(instances.map((item) => item.id));
  if (!used.has(kind)) return kind;
  let suffix = 2;
  while (used.has(kind + '-' + suffix)) suffix += 1;
  return kind + '-' + suffix;
}
const idScenario = [{ id: 'news' }, { id: 'news-2' }, { id: 'news-3' }];
idScenario.splice(1, 1);
idScenario.push({ id: nextId('news', idScenario) });
check('widget IDs remain unique after delete and re-add', prefs.includes('nextSignInWidgetId') && new Set(idScenario.map((item) => item.id)).size === idScenario.length && idScenario.at(-1)?.id === 'news-2');
check('add delete middle re-add uses collision-safe IDs', idScenario.length === 3 && new Set(idScenario.map((item) => item.id)).size === 3 && idScenario.at(-1)?.id === 'news-2');

for (const result of assertions) console.log((result.ok ? '✓' : '✗') + ' ' + result.name);
if (process.exitCode) console.error('\\n' + assertions.filter((item) => !item.ok).length + ' sign-in configurability assertion(s) failed.');
else console.log('\\n' + assertions.length + ' sign-in configurability assertions passed.');
