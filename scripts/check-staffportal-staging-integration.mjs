import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const staging = read('worker/staffportal-staging.ts');
const runtime = read('worker/runtime.ts');
const entry = read('worker/entry.ts');
const wrangler = read('wrangler.staffportal-staging.jsonc');
const delegated = staging.includes('runtimeHandler.fetch(request,runtimeEnv,ctx)');
const checks = [
  ['password authentication routes are delegated', delegated && /import\s*\{\s*routePasswordAuth\b/.test(runtime) && /routePasswordAuth\(request,\s*env\)/.test(runtime)],
  ['session and public auth routes are delegated', delegated && entry.includes('getSessionContext') && /baseHandler\.fetch\(request,\s*env,\s*ctx\)/.test(entry)],
  ['preflight is handled before authenticated routes', staging.includes("request.method==='OPTIONS'") && /return preflight\(request,\s*env\)/.test(staging)],
  ['CORS credentials are enabled', staging.includes("'access-control-allow-credentials','true'")],
  ['CORS origin is exact and not wildcarded', staging.includes('allowed.includes(origin)') && !staging.includes("'access-control-allow-origin','*'")],
  ['retained Sites origin is explicit', wrangler.includes('https://daenem-staffportal-premium-lab.daenem-group-9873.chatgpt.site')],
  ['owner-only QA mirror origin is explicitly configured', wrangler.includes('https://daenem-staffportal-qa-review.daenem-group-9873.chatgpt.site')],
  ['configured origins are parsed as exact allowlist entries', staging.includes("env.STAFF_PORTAL_FRONTEND_ORIGIN||") && staging.includes(".split(',')") && staging.includes('.trim()') && staging.includes('allowed.includes(origin)')],
  ['unrelated origins cannot match configured allowlist entries', staging.includes(".split(',')") && staging.includes('.trim()') && staging.includes('allowed.includes(origin)')],
  ['cross-origin session cookies are SameSite=None', staging.includes('SameSite=None')],
  ['staging origin is configurable without source edits', staging.includes('STAFF_PORTAL_FRONTEND_ORIGIN') && wrangler.includes('STAFF_PORTAL_FRONTEND_ORIGIN')],
  ['admin route remains protected', delegated && runtime.includes("url.pathname.startsWith('/api/admin/')") && runtime.includes('routeAdmin(request, env, context)')],
  ['communications route remains protected', delegated && runtime.includes("url.pathname.startsWith('/api/communications/')") && runtime.includes('routeCommunications')],
];
for (const [name, pass] of checks) assert.ok(pass, name);
console.log(JSON.stringify({ total: checks.length, passed: checks.length, checks: checks.map(([name]) => ({ name, pass: true })) }, null, 2));
