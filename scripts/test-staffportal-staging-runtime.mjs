import assert from 'node:assert/strict';

const base = process.env.STAFFPORTAL_STAGING_URL || 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev';
const rootUrl = new URL('/', base).toString();
const workspaceUrl = new URL('/workspace/', base).toString();
const meUrl = new URL('/api/auth/me', base).toString();
const loginUrl = new URL('/api/auth/login', base).toString();
const healthUrl = new URL('/health', base).toString();

async function read(url, init = {}) {
  return fetch(url, { redirect: 'manual', cache: 'no-store', ...init });
}

const health = await read(healthUrl);
assert.equal(health.status, 200, 'health status ' + health.status);
const healthBody = await health.json();
assert.equal(healthBody.ok, true, 'health must report ok=true');
assert.equal(healthBody.service, 'daenem-staffportal-api-staging', 'health must identify staging Worker');

const root = await read(rootUrl);
assert.equal(root.status, 200, 'root status ' + root.status);
assert.match(root.headers.get('content-type') || '', /text\\/html/i, 'root must be HTML');
const html = await root.text();
for (const forbidden of [
  '/v180-staging-auth-bridge.js',
  'vinext.navigationRuntime',
  '/_next/static/',
  'Minified React error #418',
]) {
  assert.ok(!html.includes(forbidden), 'staging served forbidden legacy marker: ' + forbidden);
}
assert.match(html, /<script[^>]+type="module"[^>]+src="\\/assets\\//i, 'root must serve the current Vite build');

const workspace = await read(workspaceUrl);
assert.equal(workspace.status, 303, 'unauthenticated /workspace/ must return 303, got ' + workspace.status);
assert.equal(workspace.headers.get('location'), '/', 'unauthenticated /workspace/ must return to root');

const me = await read(meUrl, { headers: { accept: 'application/json' } });
assert.equal(me.status, 401, 'unauthenticated /api/auth/me must return 401, got ' + me.status);
assert.match(me.headers.get('content-type') || '', /application\\/json/i, '/api/auth/me must return JSON');

const missingLogin = await read(loginUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: '{}',
});
assert.equal(missingLogin.status, 400, 'empty login must return 400, got ' + missingLogin.status);
assert.match(missingLogin.headers.get('content-type') || '', /application\\/json/i, 'login contract must return JSON');

console.log(JSON.stringify({
  ok: true,
  surface: 'staffportal-staging',
  checks: [
    'health',
    'current-vite-root',
    'legacy-next-vinext-rejected',
    'staging-auth-bridge-rejected',
    'unauthenticated-workspace-guard',
    'unauthenticated-session-contract',
    'empty-login-contract',
  ],
}, null, 2));
