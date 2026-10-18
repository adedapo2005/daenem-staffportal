import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../worker/runtime.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
const specialized = runtime.slice(runtime.indexOf('const specialized ='), runtime.indexOf('if (specialized)'));
const authBoundary = runtime.indexOf("if (!context) return secure(json({ error: 'Authentication required.' }, 401));");
const profileDispatch = runtime.indexOf('routeProfileManagement(request, env, context)');
const adminDispatch = runtime.indexOf('routeAdmin(request, env, context)');
const printingProductionDispatch = runtime.indexOf('routePrintingProduction(request, env, context)');
const printingDispatch = runtime.indexOf('routePrinting(request, env, context)');

assert.match(runtime, /import \{ routeProfileManagement \} from '\.\/profile-management';/);
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
assert.ok(specialized.includes("url.pathname.startsWith('/api/printing/')"), 'Printing requests must enter the shared authenticated runtime');
assert.ok(printingProductionDispatch > authBoundary && printingDispatch > printingProductionDispatch, 'Printing production and general routes must dispatch after authentication, production routes first');

console.log('PASS: shared authenticated profile/onboarding and Printing route composition');
