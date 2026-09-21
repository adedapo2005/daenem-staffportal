import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const staging = read('worker/staffportal-staging.ts');
const wrangler = read('wrangler.staffportal-staging.jsonc');
const checks = [
  ['password authentication routes are delegated', staging.includes("import { routePasswordAuth }") && staging.includes('routePasswordAuth(request,env)')],
  ['session and public auth routes are delegated', staging.includes("import { getSessionContext, routeAuth }") && staging.includes('routeAuth(request,env)')],
  ['preflight is handled before authenticated routes', staging.includes("request.method==='OPTIONS'") && staging.includes('return preflight(request,env)')],
  ['CORS credentials are enabled', staging.includes("'access-control-allow-credentials','true'")],
  ['CORS origin is exact and not wildcarded', staging.includes('origin===allowed') && !staging.includes("'access-control-allow-origin','*'")],
  ['retained Sites origin is explicit', staging.includes('https://daenem-staffportal-premium-lab.daenem-group-9873.chatgpt.site')],
  ['cross-origin session cookies are SameSite=None', staging.includes("SameSite=None")],
  ['staging origin is configurable without source edits', staging.includes('STAFF_PORTAL_FRONTEND_ORIGIN') && wrangler.includes('STAFF_PORTAL_FRONTEND_ORIGIN')],
  ['admin route remains protected', staging.includes("url.pathname.startsWith('/api/admin/')") && staging.includes('Authentication required.')],
  ['communications route remains protected', staging.includes("url.pathname.startsWith('/api/communications/')") && staging.includes('getEnhancedSessionContext')],
];
for (const [name, pass] of checks) assert.ok(pass, name);
console.log(JSON.stringify({ total: checks.length, passed: checks.length, checks: checks.map(([name]) => ({ name, pass: true })) }, null, 2));
