import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../worker/runtime.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
const specialized = runtime.slice(runtime.indexOf('const specialized ='), runtime.indexOf('if (specialized)'));
const authBoundary = runtime.indexOf("if (!context) return secure(json({ error: 'Authentication required.' }, 401));");
const profileDispatch = runtime.indexOf('routeProfileManagement(request, env, context)');
const adminDispatch = runtime.indexOf('routeAdmin(request, env, context)');
const temporaryPasswordAdminDispatch = runtime.indexOf('routeTemporaryPasswordAdmin(request, env, context)');
const printingProductionDispatch = runtime.indexOf('routePrintingProduction(request, env, context)');
const printingDispatch = runtime.indexOf('routePrinting(request, env, context)');

assert.match(runtime, /import \{ routeProfileManagement \} from '\.\/profile-management';/);
assert.match(runtime, /import \{[^}]*routeTemporaryPasswordAdmin[^}]*\} from '\.\/temporary-password';/);
assert.match(entry, /routeProfileManagement\(request,env,context\)/);
assert.ok(specialized.includes("url.pathname.startsWith('/api/admin/')"), 'admin onboarding requests must enter the shared authenticated runtime');
assert.ok(specialized.includes("url.pathname.startsWith('/api/profile/')"), 'profile self-service requests must enter the shared authenticated runtime');
assert.ok(authBoundary >= 0 && profileDispatch > authBoundary, 'admin onboarding/profile dispatch must occur after session authentication');
for (const path of [
  '/api/admin/profile-completion',
  '/api/admin/profile-completion/remind',
  '/api/admin/login-access/create',
  '/api/admin/employees/create',
]) {
  assert.ok(runtime.includes(`url.pathname === '${path}'`), `shared runtime must delegate ${path}`);
}
assert.ok(profileDispatch < adminDispatch, 'profile-management routes must be offered before the general Admin handler');
assert.ok(temporaryPasswordAdminDispatch > authBoundary, 'temporary-password administration must remain behind session authentication');
assert.ok(temporaryPasswordAdminDispatch < adminDispatch, 'temporary-password administration must dispatch before the general Admin handler');
assert.match(runtime, /url\.pathname\.startsWith\('\/api\/admin\/login-access\/temporary-password'\)[\s\S]*?url\.pathname !== '\/api\/admin\/login-access\/temporary-password' \|\| request\.method !== 'GET' \|\|[\s\S]*?!context\.roles\.some\(\(role\) => role\.code === 'owner'\)[\s\S]*?return secure\(json\(\{ error: 'Route not found\.' \}, 404\)\);[\s\S]*?routeTemporaryPasswordAdmin\(request, env, context\)/, 'only the authenticated group Owner may reach the read-only temporary-password list; writes and other roles must fail closed');
const temporaryGuard = runtime.match(/if \((url\.pathname !== '\/api\/admin\/login-access\/temporary-password' \|\| request\.method !== 'GET' \|\|\s*!context\.roles\.some\(\(role\) => role\.code === 'owner'\))\) \{/);
assert.ok(temporaryGuard, 'temporary-password guard must be explicit before dispatch');
const blockedTemporaryRoute = new Function('url', 'request', 'context', `return ${temporaryGuard[1]};`);
const listPath = { pathname: '/api/admin/login-access/temporary-password' };
const owner = { roles: [{ code: 'owner' }] };
const manager = { roles: [{ code: 'manager' }] };
assert.equal(blockedTemporaryRoute(listPath, { method: 'GET' }, owner), false, 'Owner may read the temporary-password list');
assert.equal(blockedTemporaryRoute(listPath, { method: 'GET' }, manager), true, 'delegated manager may not read the group-wide list');
assert.equal(blockedTemporaryRoute(listPath, { method: 'POST' }, owner), true, 'Owner issue remains unavailable until its writes are atomic');
assert.equal(blockedTemporaryRoute({ pathname: `${listPath.pathname}/revoke` }, { method: 'POST' }, owner), true, 'Owner revoke remains unavailable until target-company authority is repaired');
assert.ok(specialized.includes("url.pathname.startsWith('/api/printing/')"), 'Printing requests must enter the shared authenticated runtime');
assert.ok(printingProductionDispatch > authBoundary && printingDispatch > printingProductionDispatch, 'Printing production and general routes must dispatch after authentication, production routes first');

console.log('PASS: shared authenticated profile/onboarding and Printing route composition');
