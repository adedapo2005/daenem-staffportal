import assert from 'node:assert/strict';

const root = (process.env.STAFFPORTAL_STAGING_URL ||
  'https://daenem-staffportal-api-staging.adedapo2005.workers.dev').replace(/\/+$/, '');

const providers = [
  {
    id: 'google',
    hostname: 'accounts.google.com',
    authorizePath: '/o/oauth2/v2/auth',
  },
  {
    id: 'microsoft',
    hostname: 'login.microsoftonline.com',
    authorizePath: '/organizations/oauth2/v2.0/authorize',
  },
];

for (const provider of providers) {
  const response = await fetch(`${root}/api/auth/oauth/${provider.id}/start`, {
    redirect: 'manual',
    headers: { accept: 'text/html' },
  });

  assert.equal(
    response.status,
    302,
    `${provider.id} OAuth start must return 302, got ${response.status}`,
  );

  const location = response.headers.get('location');
  assert.ok(location, `${provider.id} OAuth start must return a Location header`);

  const target = new URL(location, root);
  assert.equal(
    target.hostname,
    provider.hostname,
    `${provider.id} OAuth start redirected to ${target.hostname || 'an empty hostname'}`,
  );
  assert.equal(
    target.pathname,
    provider.authorizePath,
    `${provider.id} OAuth start used the wrong authorization endpoint`,
  );
  assert.ok(target.searchParams.get('client_id'), `${provider.id} OAuth redirect is missing client_id`);
  assert.ok(target.searchParams.get('state'), `${provider.id} OAuth redirect is missing state`);
  assert.ok(target.searchParams.get('nonce'), `${provider.id} OAuth redirect is missing nonce`);
  assert.equal(target.searchParams.get('response_type'), 'code');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');

  const callback = new URL(target.searchParams.get('redirect_uri') || '');
  assert.equal(callback.origin, new URL(root).origin);
  assert.equal(callback.pathname, `/api/auth/oauth/${provider.id}/callback`);

  const stateCookie = response.headers.get('set-cookie') || '';
  assert.match(stateCookie, /daenem_staffportal_oauth_state=/);
  assert.match(stateCookie, /HttpOnly/i);
  assert.match(stateCookie, /SameSite=Lax/i);
}

console.log(JSON.stringify({
  ok: true,
  surface: 'staffportal-staging-social-auth',
  providers: providers.map(({ id, hostname }) => ({ id, redirectHost: hostname })),
}, null, 2));
