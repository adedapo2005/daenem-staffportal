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
assert.equal(root.headers.get('x-staffportal-auth-runtime'), 'worker-password-auth-v1', 'root is not served by the Worker authentication runtime');
assert.match(root.headers.get('content-type') || '', new RegExp('text/html', 'i'), 'root must be HTML');
const html = await root.text();
for (const forbidden of [
  '/v180-staging-auth-bridge.js',
  'vinext.navigationRuntime',
  '/_next/static/',
  'Minified React error #418',
]) {
  assert.ok(!html.includes(forbidden), 'staging served forbidden legacy marker: ' + forbidden);
}
assert.match(
  html,
  new RegExp('<script[^>]+type="module"[^>]+src="/assets/', 'i'),
  'root must serve the current Vite build',
);

const moduleScriptMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
assert.ok(moduleScriptMatch?.[1], 'root must identify its deployed module script');
const mainScriptUrl = new URL(moduleScriptMatch[1], rootUrl).toString();
const mainScriptResponse = await read(mainScriptUrl);
assert.equal(mainScriptResponse.status, 200, 'deployed main module status ' + mainScriptResponse.status);
const mainScript = await mainScriptResponse.text();
assert.ok(mainScript.includes('sites-v180'), 'deployed bundle is missing the approved Sites V180 Sign-In marker');
assert.ok(mainScript.includes('523474f7b839919c258da85be6fcf53edd38810d'), 'deployed bundle is missing the approved Sites V180 source identity');
assert.ok(mainScript.includes('qa-review-v115'), 'deployed bundle is missing the approved QA Review V115 post-login marker');
assert.ok(mainScript.includes('09bd2051d118242bce095be012a3a763cc1f8a33'), 'deployed bundle is missing the approved QA Review V115 source identity');
assert.ok(mainScript.includes('/api/auth/login'), 'deployed bundle does not call the Worker login route');
assert.ok(mainScript.includes('/api/auth/me'), 'deployed bundle does not verify the Worker session');
assert.ok(!mainScript.includes('staffportal-qa-review-v115'), 'deployed bundle still contains the rejected QA Review wrapper shell marker');
assert.ok(!mainScript.includes('data-postauth-renderer'), 'deployed bundle still contains the rejected post-auth shell renderer');
for (const forbidden of [
  'Frontend sign-in preview complete',
  'No credentials were sent',
  'no session was created',
]) {
  assert.ok(!mainScript.includes(forbidden), 'deployed bundle contains preview-only behavior: ' + forbidden);
}

const workspace = await read(workspaceUrl);
assert.equal(workspace.status, 303, 'unauthenticated /workspace/ must return 303, got ' + workspace.status);
assert.equal(workspace.headers.get('location'), '/', 'unauthenticated /workspace/ must return to root');

const me = await read(meUrl, { headers: { accept: 'application/json' } });
assert.equal(me.status, 401, 'unauthenticated /api/auth/me must return 401, got ' + me.status);
assert.match(me.headers.get('content-type') || '', new RegExp('application/json', 'i'), '/api/auth/me must return JSON');

const missingLogin = await read(loginUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: '{}',
});
assert.equal(missingLogin.status, 400, 'empty login must return 400, got ' + missingLogin.status);
assert.equal(missingLogin.headers.get('x-staffportal-auth-runtime'), 'worker-password-auth-v1', 'login is not handled by the Worker authentication runtime');
assert.match(missingLogin.headers.get('content-type') || '', new RegExp('application/json', 'i'), 'login contract must return JSON');
const missingLoginBody = await missingLogin.text();
assert.match(missingLoginBody, /username\/email and password are required/i, 'login route did not execute the real credential contract');
assert.doesNotMatch(missingLoginBody, /preview|no credentials|no session/i, 'login route returned preview-only behavior');

console.log(JSON.stringify({
  ok: true,
  surface: 'staffportal-staging',
  checks: [
    'health',
    'current-vite-root',
    'legacy-next-vinext-rejected',
    'staging-auth-bridge-rejected',
    'approved-signin-v180-runtime',
    'approved-postlogin-v115-runtime',
    'real-worker-auth-routes-in-bundle',
    'rejected-postlogin-shell-absent',
    'unauthenticated-workspace-guard',
    'unauthenticated-session-contract',
    'empty-login-contract',
  ],
}, null, 2));
