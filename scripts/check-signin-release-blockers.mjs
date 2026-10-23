import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('src/auth.tsx');
const css = read('src/signin-experience.css');
const experience = read('src/signin-experience.tsx');
const worker = read('worker/index.ts');
const deployedEntry = read('worker/entry.ts');
const provider = read('worker/weather-provider.ts');
const authRefinement = read('worker/auth-refinement.ts');
const passwordAuth = read('worker/password-auth.ts');
const whatsappRecovery = read('worker/whatsapp-recovery.ts');
const weatherCodes = read('worker/weather-condition-code.ts');
const weatherCodeTest = read('scripts/test-open-meteo-weather-codes.cjs');


// Keep overflow-y:auto limited to approved editorial copy and the guided
// password-recovery screen, whose content can exceed a short mobile viewport.
// Exact selectors keep Sign-In and Create Account free of internal scrollbars.
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
  ['Forgot Password remains an in-flow guided screen rather than a modal dialog', auth.includes('const approvedForgotPanel =') && auth.includes('className="sp-auth-runtime sp-auth-recovery"') && !auth.includes("role={mode === 'forgot'")],
  ['Create Account no longer creates an internal vertical scrollbar', !hasUnexpectedVerticalScroll(css)],
  ['Create Account remains an in-flow accessible region without a modal focus trap', auth.includes('role="region" aria-labelledby=') && !auth.includes("role={mode === 'signup' ? 'dialog'") && !auth.includes('aria-modal={mode ===') && !auth.includes('Keep focus within the dialog')],
  ['authentication modes preserve the shared auth, weather, rail and hero geometry', !css.includes('.sp-lower-right-rail:has(#staffportal-auth-mount.sp-auth-mode-forgot)') && !css.includes('.sp-lower-right-rail:has(#staffportal-auth-mount.sp-auth-mode-create)') && !css.includes('.sp-root:has(#staffportal-auth-mount.sp-auth-mode-forgot) .sp-hero-content') && !css.includes('.sp-root:has(#staffportal-auth-mount.sp-auth-mode-create) .sp-hero-content') && !css.includes('inset:50% auto auto 50%') && !css.includes('inset:12px 10px auto 10px')],
  ['bounded scrolling is limited to the guided Forgot Password screen', !hasUnexpectedVerticalScroll('.sp-root #staffportal-auth-mount.sp-auth-mode-forgot { overflow-y:auto!important; }') && hasUnexpectedVerticalScroll('#staffportal-auth-mount.sp-auth-mode-create { overflow-y:auto!important; }') && css.includes('#staffportal-auth-mount.sp-auth-mode-forgot {')],
  ['Sign-In and recovery do not require company selection', auth.includes('JSON.stringify({ identifier: recoveryIdentity })') && !auth.includes('recoveryCompanyCode') && !auth.includes('companyCode:') && !auth.includes('Select company')],
  ['signup company assignment is resolved server-side rather than from the request', !authRefinement.includes('companyCode?:string') && !authRefinement.includes('b.companyCode')],
  ['owner activation recovery follows the account primary-company email policy', passwordAuth.includes('export async function recoveryPolicyForEmployee') && authRefinement.includes('recoveryPolicyForEmployee(env,employee.id)') && authRefinement.includes("methods.includes('email')")],
  ['verified WhatsApp recovery is a server-selected fallback with no company input', passwordAuth.includes("methods.includes('whatsapp')") && authRefinement.includes("methods.includes('whatsapp')") && whatsappRecovery.includes('employee_verified_contacts') && whatsappRecovery.includes('ORDER BY m.is_primary DESC,co.id ASC') && !whatsappRecovery.includes('companyCode')],
  ['owner activation recovery shares the 15-minute per-IP request throttle', authRefinement.includes("event_type IN ('password_reset_requested','login_access_activation_requested','whatsapp_password_reset_requested')") && authRefinement.includes("datetime(occurred_at)>=datetime('now','-15 minutes')") && authRefinement.includes('Too many recovery requests. Wait 15 minutes and try again.')],
  ['recovery company is resolved from the account primary active membership', passwordAuth.includes('ORDER BY m.is_primary DESC,co.id ASC') && authRefinement.includes('ORDER BY m.is_primary DESC,co.id ASC') && authRefinement.includes('.bind(identifier,identifier)')],
  ['owner recovery fails closed without a production pepper and records attempts before email delivery', authRefinement.includes("if(!pepper(env))return json({error:'Password recovery is temporarily unavailable. Please contact the system administrator.'},503);") && authRefinement.includes("await security(env,request,'login_access_activation_requested',employee.id,{destination:maskEmail(employee.email)});") && authRefinement.includes('const delivery=await sendCode')],
  ['password success state is visibly styled', css.includes('.usp-password-status .pass')],
  ['password failure state is visibly styled', css.includes('.usp-password-status .fail')],
  ['Sign-In weather uses the fixed public endpoint', experience.includes("fetch('/api/context/signin/weather'")],
  ['Sign-In weather keeps a bounded local last-known-good cache', experience.includes('SIGNIN_WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000')],
  ['Sign-In weather preserves cached data on refresh failure', experience.includes("if ((error as { name?: string })?.name !== 'AbortError' && !cached)")],
  ['weather condition summaries avoid duplicate metrics and Saved labels', experience.includes('normalizeWeatherCondition(candidate.description)') && experience.includes('sp-live-weather-condition') && experience.includes('sp-live-weather-freshness') && !experience.includes('sp-live-weather-saved') && experience.includes('observedAt:')],
  ['Open-Meteo weather codes have exact labels, unknown fallbacks, and executable coverage', weatherCodes.includes("2: 'Partly cloudy'") && weatherCodes.includes("3: 'Overcast'") && weatherCodes.includes("48: 'Freezing fog'") && weatherCodes.includes("99: 'Severe thunderstorms with hail'") && weatherCodes.includes("'Condition unavailable'") && weatherCodeTest.includes('for (const [code, label] of expected)') && worker.includes('description: openMeteoDescription(code)')],
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

