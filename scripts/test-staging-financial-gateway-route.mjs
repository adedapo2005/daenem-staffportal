import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../worker/runtime.ts', import.meta.url), 'utf8');
const staging = await readFile(new URL('../worker/staffportal-staging.ts', import.meta.url), 'utf8');

const specializedStart = runtime.indexOf('const specialized =');
const specializedEnd = runtime.indexOf('if (specialized) {', specializedStart);
const specialized = runtime.slice(specializedStart, specializedEnd);
const authIndex = runtime.indexOf('const context = await getSessionContext(request, env);', specializedEnd);
const routeIndex = runtime.indexOf("if (url.pathname.startsWith('/api/financial-gateway/'))", authIndex);
const dispatchIndex = runtime.indexOf('await routeFinancialGateway(request, env, context)', routeIndex);

assert.match(runtime, /import \{ routeFinancialGateway \} from '\.\/financial-gateway';/);
assert.match(specialized, /url\.pathname\.startsWith\('\/api\/financial-gateway\/'\)/,
  'Financial Gateway must enter the canonical authenticated route tree');
assert(authIndex >= specializedEnd && routeIndex > authIndex && dispatchIndex > routeIndex,
  'the canonical session lookup must precede Financial Gateway dispatch');
assert.match(staging, /access-control-allow-headers':'Accept, Content-Type, Idempotency-Key'/,
  'staging preflight must allow the approved idempotency request header');
console.log('Staging Financial Gateway authenticated route: 4 assertions PASS');
