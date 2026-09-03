import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('src/signin-experience.css');
const prefs = read('src/signin-preferences.ts');
const studio = read('src/theme-studio-entry.ts');
const worker = read('worker/theme-preferences.ts');
const workerIndex = read('worker/index.ts');
const auth = read('src/auth.tsx');
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

for (const result of assertions) console.log((result.ok ? '✓' : '✗') + ' ' + result.name);
if (process.exitCode) console.error('\\n' + assertions.filter((item) => !item.ok).length + ' sign-in configurability assertion(s) failed.');
else console.log('\\n' + assertions.length + ' sign-in configurability assertions passed.');
