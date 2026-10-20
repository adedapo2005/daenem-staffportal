import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('src/auth.tsx');
const css = read('src/signin-experience.css');
const experience = read('src/signin-experience.tsx');
const worker = read('worker/index.ts');
const provider = read('worker/weather-provider.ts');

const checks = [
  ['approved Sign-In mount remains the compact-mode measurement fallback', auth.includes("panel?.closest<HTMLElement>('.usp-form-column') || panel?.parentElement")],
  ['password requirements announce live state changes', auth.includes('aria-label={label} aria-live="polite"')],
  ['Create Account no longer creates an internal vertical scrollbar', !/overflow-y\s*:\s*auto/i.test(css)],
  ['password success state is visibly styled', css.includes('.usp-password-status .pass')],
  ['password failure state is visibly styled', css.includes('.usp-password-status .fail')],
  ['Sign-In weather uses the fixed public endpoint', experience.includes("fetch('/api/context/signin/weather'")],
  ['Sign-In weather keeps a bounded local last-known-good cache', experience.includes('SIGNIN_WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000')],
  ['Sign-In weather preserves cached data on refresh failure', experience.includes("if ((error as { name?: string })?.name !== 'AbortError' && !cached)")],
  ['public Sign-In weather route accepts only seven fixed allowlisted cities', worker.includes('PUBLIC_SIGNIN_WEATHER_CITIES') && worker.includes('Object.prototype.hasOwnProperty.call(PUBLIC_SIGNIN_WEATHER_CITIES, city)') && worker.includes("return json({ error: 'Unsupported public weather city.' }, 400)")],
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
