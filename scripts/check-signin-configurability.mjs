import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('src/signin-experience.css');
const prefs = read('src/signin-preferences.ts');
const studio = read('src/theme-studio-entry.ts');
const worker = read('worker/theme-preferences.ts');
const workerIndex = read('worker/index.ts');
const weatherProvider = read('worker/weather-provider.ts');
const passwordAuth = read('worker/password-auth.ts');
const authRefinement = read('worker/auth-refinement.ts');
const auth = read('src/auth.tsx');
const signin = read('src/signin-experience.tsx');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('desktop sign-in uses a height-bounded no-scroll surface', css.includes('@media (min-width: 821px)') && css.includes('height: 100dvh') && css.includes('overflow: hidden'));
check('V2 preferences migrate to V3', prefs.includes('schemaVersion: 3') && prefs.includes('SIGNIN_PREFS_KEY') && worker.includes('ui.signin_config_v2') && worker.includes('ui.signin_config_v3'));
check('sign-in defaults to daylight and legacy auto normalizes to day', prefs.includes("themeMode: 'day'") && prefs.includes("candidate.themeMode === 'night' ? 'night' : 'day'") && worker.includes("themeMode: 'day'") && worker.includes("String(candidate.themeMode) === 'night' ? 'night' : 'day'") && !prefs.includes("const ALL_THEME_MODES: SignInThemeMode[] = ['day', 'night', 'auto']"));
check('sign-in admin exposes only manual day and night modes', studio.includes("optionMarkup(['day', 'night']") && studio.includes('Daylight — default') && studio.includes('Night — manual') && !studio.includes("optionMarkup(['auto', 'day', 'night']") && !studio.includes('data-signin-field="darkStart"') && !studio.includes('data-signin-field="darkEnd"'));
check('sign-in mode application never schedules automatic night', signin.includes("preferences.themeMode === 'night' ? 'night' : 'day'") && !signin.includes('isWithinDarkWindow') && !signin.includes('setInterval(apply'));
check('SignInExperience owns public sign-in mode', signin.includes("applyThemeToDocument(themeId, selectedMode)") && auth.includes('document.title') && !auth.includes('applyThemeToDocument(theme.id, modePreference)') && !auth.includes('readModePreference'));
check('manual night remains supported without changing dashboard theme machinery', prefs.includes("['day', 'night']") && signin.includes("'night'") && studio.includes("'night'") && worker.includes("'night'"));
check('invalid widget kinds are rejected', prefs.includes('ALL_WIDGETS.includes') && worker.includes('SIGNIN_WIDGET_KINDS.includes'));
check('invalid widget zones are rejected', prefs.includes('ALL_ZONES.includes') && worker.includes('SIGNIN_ZONES.includes'));
check('invalid clock zones are rejected', prefs.includes('WORLD_CLOCK_CATALOG.map') && worker.includes('CLOCK_ZONES'));
check('editable labels have bounded lengths', prefs.includes('SIGNIN_LABEL_LIMITS') && prefs.includes('cleanText') && worker.includes('LABEL_LIMITS'));
check('unauthorized employees cannot modify sign-in config', worker.includes("!canManage") && worker.includes("Manage Settings permission is required.") && worker.includes("return json({ error: 'Manage Settings permission is required.' }, 403)"));
check('Manage Settings users can modify sign-in config', worker.includes("hasPermission(context, 'settings.access', 'manage')") && worker.includes("ui.signin_config_v3"));
check('authentication handlers remain present', auth.includes("/api/auth/login") && auth.includes('requestAppInstall') && auth.includes('switchMode'));
check('temporary password lockout remains protected', passwordAuth.includes("return json({ error: genericError }, 401)") && passwordAuth.includes("}, 423)"));
check('password recovery clears lock and revokes sessions', passwordAuth.includes('failed_attempts = 0, locked_until = NULL') && passwordAuth.includes('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ?'));
check('lockout UX provides a prominent recovery action', auth.includes('authLabels.lockoutTitle') && auth.includes('authLabels.lockoutSummary') && auth.includes('authLabels.lockoutRecovery') && auth.includes('message.action'));
check('password policy is shared with the public auth UI', authRefinement.includes("/api/auth/password-policy") && auth.includes("/api/auth/password-policy") && authRefinement.includes('async function passwordErrors') && authRefinement.includes('security.password_min_length'));
check('password policy requires the same composition rules', passwordAuth.includes("if (password.length < min)") && passwordAuth.includes("if (!/[a-z]/.test(password))") && passwordAuth.includes("if (!/[A-Z]/.test(password))") && passwordAuth.includes("if (!/[0-9]/.test(password))") && passwordAuth.includes("if (!/[^A-Za-z0-9]/.test(password))") && auth.includes('passwordMinimumLength.replace') && auth.includes('passwordPolicySatisfied'));
check('password requirements show neutral failure and success states', auth.includes("className={!password ? 'neutral' : check.ok ? 'pass' : 'fail'}") && auth.includes('usp-password-requirements') && css.includes('.usp-password-status span.fail'));
check('confirm password has accessible match feedback', auth.includes('ConfirmPasswordStatus') && auth.includes('labels.passwordsMatch') && auth.includes('labels.passwordsDoNotMatch'));
check('identifier validation is client-only and neutral when empty', auth.includes('function identifierState') && auth.includes('usp-identifier-status') && auth.includes("if (!identifier) return 'empty'") && !auth.includes('/api/auth/lookup') && !auth.includes('/api/auth/exists'));
check('login credential persistence is not implemented', !/localStorage\.[^(]+\([^)]*(?:identity|password|username|email)/i.test(auth) && !/sessionStorage\.[^(]+\([^)]*(?:identity|password|username|email)/i.test(auth) && auth.includes("setPassword('')"));
check('browser autofill is discouraged without credential hacks', auth.includes('autoComplete="off"') && !auth.includes('autoComplete="current-password"') && auth.includes('autoComplete="new-password"') && !auth.includes('Math.random()'));
check('login session preference is distinct from credential storage', auth.includes('checked={remember}') && auth.includes('deviceIdentity()') && !auth.includes('localStorage.setItem(\'remember\'') && !auth.includes('localStorage.setItem(\'password\'') );
check('measured auth state includes the active authentication mode', auth.includes('data-auth-mode=') && auth.includes('panel.scrollHeight > column.clientHeight') && signin.includes('authPanel?.scrollHeight') && signin.includes('authAvailable'));
check('short UI defaults use title case', prefs.includes("signInTitle: 'Employee Sign-In'") && prefs.includes("createAccountTitle: 'Create Account'") && prefs.includes("forgotPassword: 'Forgot Password'") && prefs.includes("termsAndConditions: 'Terms And Conditions'") && prefs.includes("passwordRequirements: 'Password Requirements'") && prefs.includes("passwordsMatch: 'Passwords Match'"));
check('seven standard clocks remain available', ['Daenem Complex', 'Toronto', 'London', 'New York', 'Moscow', 'Tokyo', 'Beijing / Shanghai'].every((name) => prefs.includes(name)));
check('widget variants normalize correctly', prefs.includes('SIGNIN_WIDGET_VARIANTS') && prefs.includes('normalizeWidgetVariant') && studio.includes('data-widget-variant'));
check('reduced-motion compatibility remains active', css.includes('@media (prefers-reduced-motion: reduce)') && css.includes('animation-duration: .001ms'));
check('news remains source-bound', workerIndex.includes('liveHeadlines') && workerIndex.includes('news.length ? news : fallbackNews') && worker.includes('Only inspiration and motivation can use AI options.'));
check('desktop auth surface does not enable an internal scrollbar', css.includes('overflow-y: hidden') && css.includes('max-height: 100%') && css.includes('scrollbar-width: none'));
check('TODAY and AUXILIARY map to distinct rendered regions', signin.includes("['today'], 'today'") && signin.includes("['auxiliary'], 'auxiliary'") && signin.includes('usp-widget-region-auxiliary'));
check('logo animation selections have concrete behavior', signin.includes('usp-logo-animation-') && ['none', 'float', 'orbit', 'pulse'].every((name) => css.includes('.usp-logo-animation-' + name)));
check('news variants have distinct rendered compositions', ['usp-news-stack', 'usp-news-briefing', 'usp-news-ticker', 'usp-news-top-stories'].every((name) => signin.includes(name)) && css.includes('usp-news-ticker-rotate'));
check('safe display labels are normalized centrally', prefs.includes('liveErpAccess') && prefs.includes('installApp') && prefs.includes('clockSummary') && worker.includes('cleanText(source.installApp') && worker.includes('cleanText(source.clockSummary'));
check('safe authentication presentation labels are centrally normalized', prefs.includes('SignInAuthLabels') && prefs.includes('socialNote') && prefs.includes('legalPrefix') && auth.includes('authLabels.socialNote') && studio.includes('labels.auth.') && worker.includes('DEFAULT_LABELS.auth'));
check('weather location badge is sourced from V3 preferences', signin.includes('{presentation.weatherLocation}') && !signin.includes('<b>IBADAN</b>'));
check('signup verification copy uses auth labels', auth.includes('authLabels.verificationSentTo') && auth.includes('authLabels.privateBootstrapCode') && auth.includes('authLabels.bootstrapNote'));
check('recovery verification copy uses auth labels', auth.includes('authLabels.verificationCodeSent') && auth.includes('label={authLabels.verificationCode}') && auth.includes('authLabels.recoveryIdentityNote'));
check('password reset identity/support copy uses auth labels', auth.includes('authLabels.identityVerified') && auth.includes('authLabels.resetAccessNote'));
check('compact desktop signup preserves all three client-side steps', auth.includes("signupStep === 'identity'") && auth.includes("signupStep === 'account'") && auth.includes("signupStep === 'work'") && auth.includes("setSignupStep('verify')"));
check('zone capacity governor renders a reachable pager', signin.includes('usp-widget-rotator') && signin.includes('data-widget-count') && signin.includes('Previous') && signin.includes('Next') && css.includes('.usp-widget-rotator-controls'));
check('automatic widget rotation pauses safely and preserves manual controls', signin.includes('WIDGET_ROTATION_INTERVAL_MS') && signin.includes('data-widget-auto-rotation') && signin.includes('document.visibilityState') && signin.includes('onMouseEnter') && signin.includes('onFocusCapture') && signin.includes('setPage((current) => (current + 1) % pageCount)') && signin.includes("Previous ' + title") && signin.includes("Next ' + title"));
check('adaptive clock fit measures actual rendered geometry', signin.includes('ClockFitMetrics') && signin.includes('ResizeObserver') && signin.includes('dock.clientHeight') && signin.includes('dock.scrollHeight') && signin.includes('grid.clientHeight') && signin.includes('grid.scrollHeight') && signin.includes('card.clientHeight') && signin.includes('card.scrollHeight') && signin.includes('copy.clientHeight') && signin.includes('copy.scrollHeight') && signin.includes('requiredDockHeight') && signin.includes('copyWithinCards') && signin.includes('requiredContentWithinCards') && signin.includes('setClockCapacityOverride') && signin.includes('data-clock-fit') && css.includes('height: auto;') && css.includes('overflow: clip;'));
check('outer fit coordinates auth, workspace, live rail, dock, and brand', signin.includes('authDockGap') && signin.includes('availableDockGap') && signin.includes('requiredDockHeight') && signin.includes('workspaceAuthCollision') && signin.includes('brandAuthCollision') && signin.includes('brandRect') && signin.includes('SAFE_LAYOUT_GAP') && signin.includes('spatialRecoveryNeeded') && signin.includes('data-spatial-fit') && signin.includes('data-brand-auth-collision'));
check('tight spatial recovery converges without shrinking primary controls', signin.includes('spatialRecovery') && signin.includes('data-spatial-recovery') && signin.includes('availableDockGap < SAFE_LAYOUT_GAP') && css.includes('[data-spatial-recovery="true"]') && css.includes('min-height: 44px;'));
check('capacity retries the highest safe candidate after measured layout changes', signin.includes('capacityViewportKeyRef') && signin.includes('capacityKey') && signin.includes('setClockCapacityOverride(baseClockCapacity)') && signin.includes('spatialRecovery') && signin.includes('viewport.height') && signin.includes('viewport.width'));
check('the legacy global 719px layout cliff is removed', !css.includes('@media (min-width: 821px) and (max-height: 719px)') && !css.includes('grid-template-rows: 48px minmax(0, 1fr) 70px') && !css.includes('height: calc(100% - 17px)'));
check('wide short desktops retain readable clock typography', css.includes('.usp-clock-location strong { font-size: 12px') && css.includes('.usp-clock-copy > b { font-size: 14px') && css.includes('font-size: 10px;') && css.includes('usp-clock-compact-detail'));


const outerGovernorStart = signin.indexOf('const authDockFit');
const outerGovernorEnd = signin.indexOf('const observer = new ResizeObserver(measure)', outerGovernorStart);
const outerGovernor = outerGovernorStart >= 0 && outerGovernorEnd > outerGovernorStart
  ? signin.slice(outerGovernorStart, outerGovernorEnd)
  : '';
check('outer spatial recovery never changes clock capacity', outerGovernor.includes('setSpatialRecovery') && !outerGovernor.includes('setClockCapacityOverride') && signin.includes('const innerClockFit'));
check('12px safe gap is explicit and exposed', signin.includes('const SAFE_LAYOUT_GAP = 12;') && signin.includes('data-safe-layout-gap={SAFE_LAYOUT_GAP}') && signin.includes('availableDockGap < SAFE_LAYOUT_GAP'));
check('outer recovery height is measured without a second governor', signin.includes('--usp-clock-recovery-height') && signin.includes('dockRect.height - Math.max(0, SAFE_LAYOUT_GAP - availableDockGapValue)') && signin.includes('spatialRecovery'));
const innerFitStart = signin.indexOf('if (!next.fits)');
const innerCapacityWrite = signin.indexOf('setClockCapacityOverride', innerFitStart);
check('inner rendered fit exclusively controls clock capacity', innerFitStart >= 0 && innerCapacityWrite > innerFitStart && !outerGovernor.includes('setClockCapacityOverride') && signin.includes('data-clock-capacity-source="inner-fit"'));
check('adaptive clock paging keeps all seven locations reachable', signin.includes('CLOCK_CAPACITY_STEPS') && signin.includes('clockPageCount') && signin.includes('Previous locations') && signin.includes('Next locations') && signin.includes('locations.slice'));
check('all responsive zones are independently rendered', ['workspace-spotlight', 'live-context', 'today', 'auxiliary'].every((zone) => signin.includes("'" + zone + "'") && signin.includes('usp-widget-region-' + zone)));
check('zone capacity is responsive instead of count-only paging', signin.includes('zoneCapacities') && signin.includes('viewport.height < 720') && signin.includes('instances.length > capacity'));
check('desktop auth panel has no scrollbar and compact errors', [...css.matchAll(/\.usp-auth-panel\s*\{([\s\S]*?)\}/g)].some((match) => /overflow:\s*visible;/.test(match[1])) && css.includes('.usp-auth-message {') && css.includes('margin-bottom: 8px;'));
check('desktop typography floor is nine pixels with compact clock detail', css.includes('font-size: 9px;') && css.includes('.usp-clock-compact-detail') && css.includes('display: none;') && !/font-size:\s*[0-8](?:\.[0-9]+)?px/.test(css));
check('desktop capacity reserves TODAY for the clock dock', signin.includes("viewport.height < 960") && signin.includes("today: 2") && signin.includes("today: 3"));
check('compact desktop auth styling applies through 959px', css.includes('@media (min-width: 821px) and (max-height: 959px)') && css.includes('min-height: 44px;') && css.includes('.usp-panel-footer'));
check('compact desktop keeps legal and footer visible', !css.includes('@media (min-width: 821px) and (max-height: 959px) {\n  .usp-legal-copy { display: none') && !css.includes('@media (min-width: 821px) and (max-height: 959px) {\n  .usp-panel-footer { display: none'));
check('legacy legal defaults migrate without changing custom labels', prefs.includes('LEGACY_LEGAL_PREFIXES') && prefs.includes('normalizeLegalPrefix') && worker.includes('LEGACY_LEGAL_PREFIXES') && worker.includes('normalizeLegalPrefix') && prefs.includes('By continuing to login, you agree to Daenem Group'));

const ACTIVE_SIGNIN_BACKGROUND_IDS = ["unified-daylight","global-executive-atrium","future-technology-campus","daylight-glass-skyline","premium-connected-workspace","bright-executive-global-atrium","daylight-technology-campus"];
const SIGNIN_BACKGROUND_CATALOGUE_START = prefs.indexOf('export const SIGNIN_BACKGROUND_OPTIONS');
const SIGNIN_BACKGROUND_CATALOGUE_END = prefs.indexOf('\n];', SIGNIN_BACKGROUND_CATALOGUE_START);
const SIGNIN_BACKGROUND_CATALOGUE = prefs.slice(SIGNIN_BACKGROUND_CATALOGUE_START, SIGNIN_BACKGROUND_CATALOGUE_END + 3);
const CLIENT_SIGNIN_BACKGROUND_IDS = [...SIGNIN_BACKGROUND_CATALOGUE.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
const WORKER_SIGNIN_BACKGROUND_MATCH = worker.match(/const SIGNIN_BACKGROUND_IDS = \[([\s\S]*?)\] as const;/);
const WORKER_SIGNIN_BACKGROUND_IDS = WORKER_SIGNIN_BACKGROUND_MATCH
  ? [...WORKER_SIGNIN_BACKGROUND_MATCH[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  : [];
const BACKGROUND_INTEGRITY = read('scripts/check-signin-background-assets.mjs');
const ACTIVE_SIGNIN_ASSET_PATHS = ["reference-images/signin/daenem-unified-daylight-4k.webp","reference-images/signin/global-executive-atrium.webp","reference-images/signin/future-technology-campus.webp","reference-images/signin/daylight-glass-skyline.webp","reference-images/signin/premium-connected-workspace.webp","reference-images/signin/bright-executive-global-atrium.webp","reference-images/signin/daylight-technology-campus.webp","reference-images/signin/global-executive-atrium-thumb.webp","reference-images/signin/future-technology-campus-thumb.webp","reference-images/signin/daylight-glass-skyline-thumb.webp","reference-images/signin/premium-connected-workspace-thumb.webp","reference-images/signin/bright-executive-global-atrium-thumb.webp","reference-images/signin/daylight-technology-campus-thumb.webp"];

check('curated sign-in background picker contains exactly seven active options', JSON.stringify(CLIENT_SIGNIN_BACKGROUND_IDS) === JSON.stringify(ACTIVE_SIGNIN_BACKGROUND_IDS) && JSON.stringify(WORKER_SIGNIN_BACKGROUND_IDS) === JSON.stringify(ACTIVE_SIGNIN_BACKGROUND_IDS) && prefs.includes('previewSrc?: string') && studio.includes('signin-background-grid') && studio.includes('data-signin-background') && studio.includes('previewSrc || option.src') && studio.includes('Restore Default Background'));
check('retired International Operations background is not selectable', !SIGNIN_BACKGROUND_CATALOGUE.includes('international-operations-atrium') && !worker.includes("'international-operations-atrium'"));
check('retired saved background normalizes to unified-daylight', prefs.includes("const backgroundId = ALL_BACKGROUND_IDS.includes(String(candidate.backgroundId)) ? String(candidate.backgroundId) : DEFAULT_SIGNIN_PREFERENCES.backgroundId") && prefs.includes("backgroundId: 'unified-daylight'") && (!ACTIVE_SIGNIN_BACKGROUND_IDS.includes('international-operations-atrium') ? 'unified-daylight' : 'international-operations-atrium') === 'unified-daylight');
check('active sign-in asset paths are protected by source and live integrity gates', ACTIVE_SIGNIN_ASSET_PATHS.every((assetPath) => (SIGNIN_BACKGROUND_CATALOGUE + BACKGROUND_INTEGRITY).includes(assetPath)) && BACKGROUND_INTEGRITY.includes('RIFF') && BACKGROUND_INTEGRITY.includes('WEBP') && BACKGROUND_INTEGRITY.includes('chunk exceeds physical file'));

check('active background is applied without pointer movement', signin.includes('SIGNIN_BACKGROUND_OPTIONS.find') && signin.includes('--usp-hero-image') && css.includes('var(--usp-hero-image') && !signin.includes('pointermove') && !signin.includes('mousemove'));
check('background blend tokens remain metadata driven', prefs.includes('surface:') && prefs.includes('accent:') && prefs.includes('glow:') && signin.includes('--usp-bg-surface') && css.includes('--usp-widget-surface'));
check('background pointer parallax is removed', !signin.includes('addEventListener(\'pointermove\'') && !signin.includes('--usp-parallax-x') && !signin.includes('--usp-parallax-y') && !css.includes('--usp-parallax-x') && !css.includes('--usp-parallax-y'));
check('live layout governor measures actual columns without polling', signin.includes('ResizeObserver') && signin.includes('authPanel?.scrollHeight') && signin.includes('liveStack.scrollHeight') && signin.includes('dockRect') && signin.includes('visualViewport') && !signin.includes('setInterval(measure'));
check('layout governor exposes measured fit diagnostics', signin.includes('data-auth-required-height') && signin.includes('data-auth-available-height') && signin.includes('data-live-required-height') && signin.includes('data-live-available-height'));
check('comfortable default capacity shows all five widgets', signin.includes("today: 3") && signin.includes("'live-context': 2") && signin.includes("? { 'workspace-spotlight': 1"));
check('900px class reduces TODAY capacity without hiding widgets', signin.includes("density === 'compact'") && signin.includes('today: 2') && signin.includes('instances.length > capacity'));
check('weather requests Google current conditions in the requested or configured unit', weatherProvider.includes('weather.googleapis.com/v1/currentConditions:lookup') && weatherProvider.includes('const selectedUnitsSystem = unitsSystem || configuration.defaultUnits') && weatherProvider.includes("url.searchParams.set('unitsSystem', selectedUnitsSystem)"));
check('weather payload normalizes the Google response and missing fields', workerIndex.includes('temperature: number(weatherData.temperature)') && workerIndex.includes('apparentTemperature: number(weatherData.feelsLikeTemperature)') && workerIndex.includes("typeof condition === 'string' ? condition : 'Current conditions'"));
check('weather retains cached data on refresh failure', signin.includes("reading.state === 'unavailable' && previous?.state === 'ready'") && signin.includes('setInterval(refreshWeather, 300_000)'));
check('weather administration exposes safe detail and animation controls', studio.includes("['showFeelsLike','Feels like']") && studio.includes("['showSunriseSunset','Sunrise / sunset']") && studio.includes('globalOperations.weatherStyle') && studio.includes('globalOperations.weatherAnimation') && prefs.includes('weatherAnimation'));
check('seven clock cards have independent weather readings and paging', signin.includes('weather={weather[location.zone]}') && signin.includes('visibleLocations') && signin.includes('Previous locations') && signin.includes('clockCapacity'));
check('clock typography stays readable on desktop', css.includes('.usp-clock-location strong { font-size: 12px; }') && css.includes('.usp-clock-copy > b { font-size: 14px; }') && css.includes('.usp-clock-weather > small,') && !/font-size:\s*[0-8](?:\.[0-9]+)?px/.test(css));
check('weather reduced motion is static and pointer independent', css.includes('.usp-weather-animation-none') && css.includes('usp-weather-animation-') && signin.includes('CloudSnow') && signin.includes('Moon') && !signin.includes('pointermove') && !signin.includes('mousemove'));
const weatherFixtures = [
  { temperature: { degrees: 28 }, feelsLikeTemperature: { degrees: 31 }, relativeHumidity: 74, weatherCondition: { description: { text: 'Partly cloudy' } } },
  { temperature: { degrees: 28 } },
  { weatherCondition: { description: { text: 'Unknown condition' } } },
];
check('Google weather contract fixtures cover complete and partial responses', weatherFixtures[0].temperature.degrees === 28 && weatherFixtures[1].feelsLikeTemperature === undefined && weatherFixtures[2].weatherCondition.description.text === 'Unknown condition' && workerIndex.includes('weatherData.currentConditionsHistory') && weatherProvider.includes("providerStatus: 'fresh'") && weatherProvider.includes("providerStatus: 'cached'"));

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
const comfortableCapacity = { 'workspace-spotlight': 1, 'live-context': 2, today: 3, auxiliary: 2 };
const tightCapacity = { 'workspace-spotlight': 1, 'live-context': 1, today: 1, auxiliary: 1 };
const defaultCounts = { 'workspace-spotlight': 0, 'live-context': 2, today: 3, auxiliary: 0 };
check('default large desktop shows live weather and status together', defaultCounts['live-context'] <= comfortableCapacity['live-context']);
check('default large desktop shows inspiration motivation and news together', defaultCounts.today <= comfortableCapacity.today);
check('default large desktop does not page', Object.keys(defaultCounts).every((zone) => defaultCounts[zone] <= comfortableCapacity[zone]));
check('ten-widget configuration pages only capacity overflow', stressCases[1].every((item) => item.visible) && Object.keys(tightCapacity).every((zone) => tightCapacity[zone] >= 1) && stressCases[1].length === 10);
check('tight 1024x600 uses safe one-per-zone capacity', signin.includes("viewport.height < 720") && Object.values(tightCapacity).every((capacity) => capacity === 1) && css.includes('height: 100dvh') && css.includes('overflow: hidden'));
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

check('login protects missing production pepper', passwordAuth.includes("AUTH_PEPPER is not configured for production") && passwordAuth.includes("AUTH_SERVICE_UNAVAILABLE") && passwordAuth.includes("}, 503)"));
check('owner high-iteration credential requests recovery', passwordAuth.includes('OWNER_SAFE_LOGIN_ITERATIONS') && passwordAuth.includes('OWNER_RECOVERY_REQUIRED') && passwordAuth.includes("password_signin_recovery_required"));
check('login runtime failures return controlled phase diagnostics', ['credential_lookup', 'password_derivation', 'location_policy', 'session_creation', 'device_registration'].every((phase) => passwordAuth.includes(phase)) && passwordAuth.includes('password_auth_exception') && passwordAuth.includes('requestReference'));
check('owner recovery rewrites with worker-safe iterations', passwordAuth.includes('ownerRecovery ? OWNER_SAFE_LOGIN_ITERATIONS : configuredIterations') && passwordAuth.includes('failed_attempts = 0, locked_until = NULL') && passwordAuth.includes('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE employee_id = ?'));
check('owner recovery response has a prominent forgot-password action', auth.includes('OWNER_RECOVERY_REQUIRED') && auth.includes('Owner Access Requires Secure Password Recovery.') && auth.includes('authLabels.forgotPassword'));
check('device registration is explicit best effort', passwordAuth.includes("recordAuthFailure(env, request, 'device_registration', error)") && passwordAuth.includes('password_signin_success'));
check('wrong password remains a semantic 401', passwordAuth.includes('constantTimeEqual(derived, row.passwordHash)') && passwordAuth.includes('return json({ error: genericError }, 401)'));
check('locked account remains a semantic 423', passwordAuth.includes('password_signin_locked') && passwordAuth.includes('}, 423)'));
check('session creation failures remain controlled', passwordAuth.includes("controlledAuthFailure(env, request, 'session_creation', error)"));
check('owner bypass persists a schema-safe geofence result', passwordAuth.includes("location = ownerLogin") && passwordAuth.includes("result: 'not_required'") && !passwordAuth.includes("owner_remote_exempt"));
const ownerVerificationIndex = passwordAuth.indexOf("if (!constantTimeEqual(derived, row.passwordHash))");
const ownerBypassIndex = passwordAuth.indexOf("location = ownerLogin");
check('owner geofence bypass occurs only after password verification', ownerVerificationIndex >= 0 && ownerBypassIndex > ownerVerificationIndex && passwordAuth.includes("await evaluateLocation(env, row.employeeId, body)"));
check('auth session geofence results remain schema-valid', ["'not_required'", "'inside'", "'outside'", "'unknown'"].every((value) => passwordAuth.includes(value)) && !passwordAuth.includes("owner_remote_exempt"));
const diagnosticSection = passwordAuth.slice(passwordAuth.indexOf('async function recordAuthFailure'), passwordAuth.indexOf('async function controlledAuthFailure'));
check('runtime diagnostics exclude credential secrets', !diagnosticSection.includes('passwordHash') && !diagnosticSection.includes('passwordSalt') && !diagnosticSection.includes('password:') && !diagnosticSection.includes('AUTH_PEPPER'));

for (const result of assertions) console.log((result.ok ? '✓' : '✗') + ' ' + result.name);
if (process.exitCode) console.error('\\n' + assertions.filter((item) => !item.ok).length + ' sign-in configurability assertion(s) failed.');
else console.log('\\n' + assertions.length + ' sign-in configurability assertions passed.');
