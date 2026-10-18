import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static contract for the staging Worker entry. Since the full-route delegate
// design, worker/staffportal-staging.ts adds CORS/security headers and the
// workspace/public-asset guards, then hands every request to the canonical
// runtime route tree (worker/runtime.ts). Auth and route protection are
// asserted where they now live.
const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const staging = read('worker/staffportal-staging.ts');
const runtime = read('worker/runtime.ts');
const wrangler = read('wrangler.staffportal-staging.jsonc');

const optionsAt = staging.indexOf("request.method==='OPTIONS'");
const delegateAt = staging.search(/runtimeHandler\.fetch\(request,\s*runtimeEnv,\s*ctx\)/);
const workspaceAt = staging.search(/routeWorkspaceShell\(request,/);
const originMatch = wrangler.match(/"STAFF_PORTAL_FRONTEND_ORIGIN"\s*:\s*"([^"]*)"/);
const configuredOrigins = originMatch ? originMatch[1].split(',').map((value) => value.trim()).filter(Boolean) : [];

const checks = [
  ['staging entry is the configured Worker main', /"main"\s*:\s*"\.\/worker\/staffportal-staging\.ts"/.test(wrangler)],
  ['staging delegates the full route tree to the runtime', /import\s+runtimeHandler\s+from\s+'\.\/runtime'/.test(staging) && delegateAt !== -1],
  ['password sign-in is routed by the runtime', /import\s*\{\s*routePasswordAuth\s*\}\s*from\s*'\.\/password-auth'/.test(runtime) && /routePasswordAuth\(request,\s*env\)/.test(runtime)],
  ['session and public auth routes fall through to the app handler', /return\s+appHandler\.fetch\(request,\s*env,\s*ctx\)/.test(runtime)],
  ['preflight is handled before any routing', optionsAt !== -1 && /return preflight\(request,\s*env\)/.test(staging) && optionsAt < delegateAt],
  ['workspace shell guard runs before runtime fallthrough', workspaceAt !== -1 && workspaceAt < delegateAt],
  ['unlisted origins are refused at preflight', staging.includes("'Origin not allowed.'") && /,\s*403\)/.test(staging)],
  ['CORS credentials are enabled', staging.includes("'access-control-allow-credentials','true'")],
  ['CORS origin is exact and not wildcarded', staging.includes('allowed.includes(origin)') && !staging.includes("'access-control-allow-origin','*'")],
  ['allowlist comes only from configuration', staging.includes("(env.STAFF_PORTAL_FRONTEND_ORIGIN||'')") && staging.includes(".split(',')") && staging.includes('.trim()') && staging.includes('.filter(Boolean)')],
  ['configured allowlist has no wildcard entries', configuredOrigins.length > 0 && configuredOrigins.every((origin) => /^https:\/\/[^*\s/]+$/.test(origin))],
  ['configured allowlist has no duplicate origins', new Set(configuredOrigins).size === configuredOrigins.length],
  ['cross-origin session cookies are SameSite=None', staging.includes('SameSite=None')],
  ['admin routes require an authenticated session', runtime.includes("url.pathname.startsWith('/api/admin/')") && /const context = await getSessionContext\(request, env\);\s*if \(!context\) return secure\(json\(\{ error: 'Authentication required\.' \}, 401\)\);/.test(runtime)],
  ['communications routes use the enhanced session context', /if \(url\.pathname\.startsWith\('\/api\/communications\/'\)\) \{\s*const enhanced = await getEnhancedSessionContext\(request, env\);\s*if \(!enhanced\) return secure/.test(runtime)],
];
for (const [name, pass] of checks) assert.ok(pass, name);
console.log(JSON.stringify({ total: checks.length, passed: checks.length, checks: checks.map(([name]) => ({ name, pass: true })) }, null, 2));
