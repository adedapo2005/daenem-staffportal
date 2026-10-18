import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const runtime = read('src/qa-review-v115-runtime.tsx');
const widgets = read('src/postlogin-live-widgets-v116.tsx');
const styles = read('src/postlogin-live-widgets-v116.css');
const feeds = read('worker/postlogin-context.ts');
const worker = read('worker/index.ts');
const clientEntry = read('src/main.tsx');
const serviceWorker = read('public/sw.js');
const credentials = read('worker/meta-credentials.ts');
const stagingConfig = read('wrangler.staffportal-staging.jsonc');

const fail = (message) => { console.error(`post-auth integration contract: ${message}`); process.exitCode = 1; };

const clientCache = clientEntry.match(/SERVICE_WORKER_CACHE = '([^']+)'/)?.[1];
const workerCache = serviceWorker.match(/CACHE = '([^']+)'/)?.[1];
if (!clientCache || clientCache !== workerCache || !clientCache.includes('v16-postauth-live-integrations')) fail('client and service-worker cache releases are not synchronized');

if (!credentials.includes("google_weather_api_key:'GOOGLE_WEATHER_API_KEY'")) fail('Cloudflare Google Weather credential mapping is missing');
if (!stagingConfig.includes('"WEATHER_PROVIDER_ENABLED": "true"')) fail('staging weather provider flag is not enabled');

if (!runtime.includes('LivePostLoginEnhancementsV116')) fail('runtime enhancement mount is missing');
if (!runtime.includes('v116-release-manifest') || !runtime.includes('Completed work included')) fail('official Release Details dialog is missing the staging manifest');
if (runtime.includes('StaffPortal staging deployment details')) fail('redundant floating staging details shell remains');
if (!styles.includes('.v116-release-manifest')) fail('Release Details manifest styling is missing');
if (!runtime.includes('09bd2051d118242bce095be012a3a763cc1f8a33')) fail('approved V115 source provenance changed');
if (!worker.includes("url.pathname === '/api/context/postlogin'")) fail('authenticated post-login context route is missing');
if (worker.indexOf("url.pathname === '/api/context/postlogin'") < worker.indexOf('getSessionContext(request, env)')) fail('post-login context route is not behind authentication');
if ((feeds.match(/\{ id: '/g) || []).length < 20) fail('fewer than 20 governed feed definitions are configured');
if (!widgets.includes('/api/context/weather?')) fail('weather widget is not integrated with the configured provider route');
if (!styles.includes('.home-weather > .tech-weather:not(.v116-weather)')) fail('legacy weather placeholder is not replaced in place');
if (!widgets.includes('dataset.constructionView') || !widgets.includes('Show full Construction detail') || !widgets.includes('Use simplified Construction view')) fail('reversible simplified Construction view is missing');
if (!styles.includes('#main-content[data-construction-view="simple"] .c16-triple')) fail('simplified Construction view does not reduce secondary dashboard density');
if (/AI[- ]generated/i.test([runtime, widgets, styles, feeds].join('\n'))) fail('employee-facing AI-generated label detected');
if (/source-snapshots\/.+\.(tsx|css)/.test(process.env.CHANGED_FILES || '')) fail('approved source snapshot must remain untouched');

if (!process.exitCode) console.log('Post-auth live integration contract passed.');
