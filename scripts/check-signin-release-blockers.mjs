import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('src/auth.tsx');
const css = read('src/signin-experience.css');
const experience = read('src/signin-experience.tsx');
const worker = read('worker/index.ts');
const deployedEntry = read('worker/entry.ts');
const provider = read('worker/weather-provider.ts');


// Keep overflow-y:auto limited to approved editorial copy and the focused
// password-recovery dialog, whose content can exceed a short mobile viewport.
// Exact selectors ensure this exception cannot grant scrolling to Sign-In or
// Create Account when the shared stylesheet is extended.
const approvedScrollSelectors = new Set([
  '.sp-root #staff-primary-information .sp-connected-news',
  '#root .sp-root.sp-day #staff-primary-information [data-widget="news"] .gw-news-story-copy',
  '#root .sp-root.sp-day #staff-primary-information [data-widget="intelligence"] .gw-intel-focus',
  '.sp-root #staffportal-auth-mount.sp-auth-mode-forgot',
]);
function hasUnexpectedVerticalScroll(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const occurrences = value => (value.match(/overflow-y\s*:\s*auto/gi) || []).length;
  let allowed = 0;
  for (const [, selectors, declarations] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const count = occurrences(declarations);
    if (count && selectors.split(',').some(selector => !approvedScrollSelectors.has(selector.trim()))) return true;
    allowed += count;
  }
  // Fail closed for nested declarations not covered by an approved leaf rule.
  return allowed !== occurrences(clean);
}

const checks = [
  ['scrollbar guard allows only approved content and recovery surfaces', [...approvedScrollSelectors].every(selector => !hasUnexpectedVerticalScroll(`@media (max-width: 800px) { ${selector} { overflow-y:auto!important; } }`))],
  ['scrollbar guard still rejects authentication and mixed-selector scrollers', [
    '#staffportal-auth-mount.sp-auth-mode-create { overflow-y:auto!important; }',
    '.sp-auth-card { overflow-y: auto !important; }',
    '@media (max-width: 800px) { .usp-form-column { overflow-y:auto; } }',
    '.sp-auth-card { overflow-y:auto; & input { color:red; } }',
    '.sp-auth-card { overflow-y:auto; @media (max-width:800px) { color:red; } }',
    [...approvedScrollSelectors][0] + ', #staffportal-auth-mount { overflow-y:auto; }',
  ].every(hasUnexpectedVerticalScroll)],

  ['approved Sign-In mount remains the compact-mode measurement fallback', auth.includes("panel?.closest<HTMLElement>('.usp-form-column') || panel?.parentElement")],
  ['password requirements announce live state changes', auth.includes('aria-label={label} aria-live="polite"')],
  ['Forgot Password raises its isolated rail above overlapping dashboard cards and restores it on exit', auth.includes("closest<HTMLElement>('.sp-lower-right-rail')") && auth.includes("rail.style.zIndex = '1200'") && auth.includes('rail.style.zIndex = previousZIndex')],
  ['Create Account no longer creates an internal vertical scrollbar', !hasUnexpectedVerticalScroll(css)],
  ['bounded scrolling is limited to the Forgot Password dialog', !hasUnexpectedVerticalScroll('.sp-root #staffportal-auth-mount.sp-auth-mode-forgot { overflow-y:auto!important; }') && hasUnexpectedVerticalScroll('#staffportal-auth-mount.sp-auth-mode-create { overflow-y:auto!important; }') && css.includes('.sp-root #staffportal-auth-mount.sp-auth-mode-forgot {')],
  ['Forgot Password requires an identity and explicit company selection before sending', auth.includes("setRecoveryCompanyCode(current=>current&&companies.some(company=>company.code===current)?current:'');") && auth.includes('disabled={busy||!recoveryIdentity.trim()||!recoveryCompanyCode||!recoveryMethods.includes(recoveryMethod)}')],
  ['password success state is visibly styled', css.includes('.usp-password-status .pass')],
  ['password failure state is visibly styled', css.includes('.usp-password-status .fail')],
  ['Sign-In weather uses the fixed public endpoint', experience.includes("fetch('/api/context/signin/weather'")],
  ['Sign-In weather keeps a bounded local last-known-good cache', experience.includes('SIGNIN_WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000')],
  ['Sign-In weather preserves cached data on refresh failure', experience.includes("if ((error as { name?: string })?.name !== 'AbortError' && !cached)")],
  ['public Sign-In weather route accepts only seven fixed allowlisted cities', worker.includes('PUBLIC_SIGNIN_WEATHER_CITIES') && worker.includes('Object.prototype.hasOwnProperty.call(PUBLIC_SIGNIN_WEATHER_CITIES, city)') && worker.includes("return json({ error: 'Unsupported public weather city.' }, 400)")],
  ['public Sign-In weather degrades unavailable provider regions through the fixed-city fallback', worker.includes("const primary = await weatherResponse(env, lat, lon, 'METRIC', label)") && worker.includes("return await fixedCityWeatherFallback(lat, lon, label) || primary") && worker.includes('https://api.open-meteo.com/v1/forecast')],
  ['Sign-In CSP permits only the explicitly used Google Fonts stylesheet and font origins', worker.includes("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com") && worker.includes("font-src 'self' data: https://fonts.gstatic.com") && deployedEntry.includes("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com") && deployedEntry.includes("font-src 'self' data: https://fonts.gstatic.com") && !worker.includes("script-src 'self' 'unsafe-inline'") && !deployedEntry.includes("script-src 'self' 'unsafe-inline'")],
  ['public Sign-In weather route is before authentication', worker.indexOf("url.pathname === '/api/context/signin/weather'") < worker.indexOf('const authResponse = await routeAuth')],
  ['arbitrary-coordinate weather route remains authenticated', worker.indexOf("url.pathname === '/api/context/weather'") > worker.indexOf('const authResponse = await routeAuth')],
  ['server weather has a 24-hour last-known-good cache', provider.includes('STALE_CACHE_TTL_SECONDS = 86_400')],
  ['server weather returns truthful cached fallback data', provider.includes("return stale ? cachedWeather(stale) : { data: null, providerStatus: status }")],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'}: ${label}`);
if (failed.length) {
  console.error(`Sign-In release blocker contract failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Sign-In release blocker contract passed: ${checks.length}/${checks.length}.`);

