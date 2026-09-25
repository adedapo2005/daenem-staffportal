import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const staging = read('worker/staffportal-staging.ts');
const wrangler = read('wrangler.staffportal-staging.jsonc');
const checks = [
  ['password authentication routes are delegated', /import\s*\{\s*routePasswordAuth\b/.test(staging) && /routePasswordAuth\(request,\s*env\)/.test(staging)],
  ['session and public auth routes are delegated', /import\s*\{\s*getSessionContext\s*,\s*routeAuth\b/.test(staging) && /routeAuth\(request,\s*env\)/.test(staging)],
  ['preflight is handled before authenticated routes', staging.includes("request.method==='OPTIONS'") && /return preflight\(request,\s*env\)/.test(staging)],
  ['CORS credentials are enabled', staging.includes("'access-control-allow-credentials','true'")],
  ['CORS origin is exact and not wildcarded', staging.includes('allowed.includes(origin)') && !staging.includes("'access-control-allow-origin','*'")],
  ['retained Sites origin is explicit', staging.includes('https://daenem-staffportal-premium-lab.daenem-group-9873.chatgpt.site')],
  ['owner-only QA mirror origin is explicitly configured', wrangler.includes('https://daenem-staffportal-qa-review.daenem-group-9873.chatgpt.site')],
  ['configured origins are parsed as exact allowlist entries', staging.includes("env.STAFF_PORTAL_FRONTEND_ORIGIN||DEFAULT_FRONTEND_ORIGIN") && staging.includes(".split(',')") && staging.includes('.trim()') && staging.includes('allowed.includes(origin)')],
  ['unrelated origins cannot match configured allowlist entries', staging.includes(".split(',')") && staging.includes('.trim()') && staging.includes('allowed.includes(origin)')],
  ['cross-origin session cookies are SameSite=None', staging.includes("SameSite=None")],
  ['staging origin is configurable without source edits', staging.includes('STAFF_PORTAL_FRONTEND_ORIGIN') && wrangler.includes('STAFF_PORTAL_FRONTEND_ORIGIN')],
  ['admin route remains protected', staging.includes("url.pathname.startsWith('/api/admin/')") && staging.includes('Authentication required.')],
  ['communications route remains protected', staging.includes("url.pathname.startsWith('/api/communications/')") && staging.includes('getEnhancedSessionContext')],
];
for (const [name, pass] of checks) assert.ok(pass, name);
console.log(JSON.stringify({ total: checks.length, passed: checks.length, checks: checks.map(([name]) => ({ name, pass: true })) }, null, 2));
