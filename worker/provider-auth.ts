import { logSecurity, sessionCookie, type AuthEnv } from './auth';
import {
  sameOriginFormPost, recentlyVerifiedStaffSession, linkRedirect, accountLinkPage,
} from './microsoft-account-link';
import {
  isOrganizationsStaging, organizationIdentity, organizationSigningKeyIssuerMatches,
  linkedMicrosoftEmployee, linkedMicrosoftIdentityForEmployee, bindMicrosoftEmployeeIdentity,
  organizationsLinkStorageReady,
} from './microsoft-organizations';
import { provisionOAuthApplicant, oauthApplicantPending, type ApplicantResult } from './oauth-provisional-signup';

type Provider = 'google' | 'microsoft';

export interface ProviderAuthEnv extends AuthEnv {
  GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string; GOOGLE_OAUTH_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string; MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_OAUTH_CLIENT_ID?: string; MICROSOFT_OAUTH_CLIENT_SECRET?: string;
  MICROSOFT_TENANT_ID?: string; MICROSOFT_OAUTH_TENANT_ID?: string;
  MICROSOFT_AUTH_MODE?: 'single_tenant' | 'organizations';
  STAFF_PORTAL_OAUTH_ORIGIN?: string; SOCIAL_CACHE?: KVNamespace;
}

type Config = {
  clientId: string; clientSecret?: string; authorizationEndpoint: string;
  tokenEndpoint: string; userInfoEndpoint: string; scope: string;
  issuer: string; jwksEndpoint: string; organizations: boolean;
};
type State = {
  provider: Provider; state: string; verifier: string; nonce: string; expiresAt: number;
  intent?: 'signin' | 'link'; authMode?: 'single' | 'organizations';
  employeeId?: string; sessionId?: string;
};

const encoder = new TextEncoder();
const cookieName = 'daenem_staffportal_oauth_state';
const ttl = 600;

function json(body: Record<string, unknown>, status = 200) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  return new Response(JSON.stringify(body), { status, headers });
}
function uid(prefix: string) { return prefix + '-' + crypto.randomUUID(); }
function randomBytes(size = 32) { const value = new Uint8Array(size); crypto.getRandomValues(value); return value; }
function b64(value: Uint8Array) {
  let raw = ''; for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), (char) => char.charCodeAt(0));
}
function token(size = 32) { return b64(randomBytes(size)); }
async function sha(value: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function shaHex(value: string) { return [...await sha(value)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function pepper(env: ProviderAuthEnv) {
  if (env.APP_STAGE === 'production' && !env.AUTH_PEPPER) return undefined;
  return env.AUTH_PEPPER || 'bootstrap-stage-only-change-before-production';
}
async function hmacKey(env: ProviderAuthEnv) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  return crypto.subtle.importKey('raw', encoder.encode(secret + ':staffportal-oauth-state'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signState(env: ProviderAuthEnv, value: State) {
  const payload = b64(encoder.encode(JSON.stringify(value)));
  const sig = b64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), encoder.encode(payload))));
  return payload + '.' + sig;
}
async function verifyState(env: ProviderAuthEnv, value: string) {
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  if (!await crypto.subtle.verify('HMAC', await hmacKey(env), unb64(signature), encoder.encode(payload))) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(unb64(payload))) as State;
    return state.provider && state.state && state.verifier && state.expiresAt >= Date.now() ? state : null;
  } catch { return null; }
}
function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
function stateCookie(request: Request, value: string, maxAge = ttl) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}
function config(env: ProviderAuthEnv, provider: Provider): Config | null {
  if (provider === 'google') {
    const clientId = env.GOOGLE_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET;
    return clientId && clientSecret ? {
      clientId, clientSecret, authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile',
      issuer: 'https://accounts.google.com', jwksEndpoint: 'https://www.googleapis.com/oauth2/v3/certs',
      organizations: false,
    } : null;
  }
  const clientId = env.MICROSOFT_CLIENT_ID || env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = env.MICROSOFT_CLIENT_SECRET || env.MICROSOFT_OAUTH_CLIENT_SECRET;
  // Organizations staging uses authorization code + PKCE as a public client when
  // no confidential-client secret is configured. Production remains fail-closed.
  const organizations = isOrganizationsStaging(env);
  if (!clientId || (!clientSecret && !organizations)) return null;
  const tenant = organizations
    ? 'organizations' : (env.MICROSOFT_TENANT_ID || env.MICROSOFT_OAUTH_TENANT_ID);
  if (!tenant || (!organizations && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(tenant))) return null;
  return {
    clientId, clientSecret,
    authorizationEndpoint: 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token',
    userInfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
    scope: organizations ? 'openid profile email' : 'openid profile email User.Read',
    issuer: organizations
      ? 'https://login.microsoftonline.com/{tenantid}/v2.0'
      : 'https://login.microsoftonline.com/' + tenant + '/v2.0',
    jwksEndpoint: 'https://login.microsoftonline.com/' + tenant + '/discovery/v2.0/keys',
    organizations,
  };
}
function callbackUrl(request: Request, provider: Provider, env: ProviderAuthEnv) {
  const origin = (env.STAFF_PORTAL_OAUTH_ORIGIN || new URL(request.url).origin).replace(/\/+$/, '');
  return origin + '/api/auth/oauth/' + provider + '/callback';
}
function label(provider: Provider) { return provider === 'google' ? 'Google' : 'Microsoft'; }
function providerFromPath(path: string, suffix: 'start' | 'callback'): Provider | null {
  const match = path.match(new RegExp('^/api/auth/oauth/(google|microsoft)/' + suffix + '$'));
  return match?.[1] === 'google' || match?.[1] === 'microsoft' ? match[1] : null;
}
function failure(request: Request, provider: Provider, code: string) {
  const url = new URL('/', request.url);
  url.searchParams.set('auth_error', code); url.searchParams.set('auth_provider', provider);
  return Response.redirect(url.toString(), 302);
}
function applicantRedirect(request: Request, provider: Provider, result: ApplicantResult | 'email_required') {
  const target = new URL('/api/auth/oauth/registration-status', request.url);
  target.searchParams.set('provider', provider);
  target.searchParams.set('result', result);
  return new Response(null, { status: 303, headers: {
    location: target.toString(), 'cache-control': 'no-store',
    'set-cookie': stateCookie(request, '', 0),
  } });
}
function applicantStatusPage(request: Request) {
  const query = new URL(request.url).searchParams;
  const provider = query.get('provider') === 'microsoft' ? 'Microsoft' : 'Google';
  const outcome = query.get('result');
  const pending = outcome === 'pending';
  const heading = pending ? 'Account Request Received'
    : outcome === 'disabled' ? 'Account Registration Is Unavailable'
    : outcome === 'rate_limited' ? 'Too Many Registration Attempts'
    : outcome === 'email_required' ? 'Email Address Required'
    : 'Account Registration Could Not Be Completed';
  const message = pending
    ? 'Your ' + provider + ' identity was verified and your StaffPortal application is pending management approval. No employee access has been granted yet.'
    : outcome === 'email_required'
    ? 'Your identity provider did not supply a usable email address. Complete Create Account with your email address instead.'
    : outcome === 'disabled'
    ? 'Employee self-registration is disabled. Contact your administrator.'
    : outcome === 'rate_limited'
    ? 'Registration attempts are temporarily limited. Please try again later.'
    : 'The registration request could not be saved. Please try Create Account again or contact your administrator.';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow">' +
    '<title>' + heading + ' | DAENEM StaffPortal</title>' +
    '<style>body{margin:0;background:#f4faf5;color:#183b2b;font:16px system-ui,Segoe UI,Arial,sans-serif;min-height:100vh;display:grid;place-items:center}' +
    'main{max-width:520px;background:#fff;border:1px solid #cfe5d7;border-radius:16px;padding:36px;margin:20px;box-shadow:0 12px 40px #193d2312}' +
    'h1{font-size:27px;line-height:1.2}p{line-height:1.7}a{display:inline-block;background:#087f50;color:white;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:700;margin-top:14px}' +
    '</style></head><body><main><h1>' + heading + '</h1><p>' + message +
    '</p><a href="/">Return To StaffPortal</a></main></body></html>';
  return new Response(html, { headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  } });
}
async function providerJson(response: Response) {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error('Provider request failed.');
  return body;
}

function jwtPart(value: string) {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(new TextDecoder().decode(unb64(parts[0]))) as Record<string, unknown>,
      payload: JSON.parse(new TextDecoder().decode(unb64(parts[1]))) as Record<string, unknown>,
      signingInput: parts[0] + '.' + parts[1],
      signature: unb64(parts[2]),
    };
  } catch { return null; }
}
async function verifyIdentityToken(tokenValue: string, current: Config, nonce: string) {
  const parsed = jwtPart(tokenValue);
  if (!parsed || parsed.header.alg !== 'RS256' || typeof parsed.header.kid !== 'string') return null;
  // Organizations tokens must contain an immutable, signed user/tenant identity.
  const org = current.organizations ? organizationIdentity(parsed.payload) : null;
  if (current.organizations && !org) return null;
  const response = await fetch(current.jwksEndpoint, {
    headers: { accept: 'application/json' }, cf: { cacheTtl: 900, cacheEverything: true },
  });
  if (!response.ok) return null;
  const jwks = await response.json().catch(() => ({})) as {
    keys?: Array<JsonWebKey & { kid?: string; issuer?: string; use?: string; kty?: string }>;
  };
  const key = (jwks.keys || []).find((candidate) => candidate.kid === parsed.header.kid &&
    candidate.kty === 'RSA' && (!candidate.use || candidate.use === 'sig'));
  if (!key) return null;
  // Tenant-independent JWKS can include keys restricted to a different issuer.
  if (current.organizations && (!org ||
      !organizationSigningKeyIssuerMatches(key.issuer, org))) return null;
  const cryptoKey = await crypto.subtle.importKey('jwk', key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey,
    parsed.signature, encoder.encode(parsed.signingInput));
  if (!valid) return null;
  const payload = parsed.payload;
  const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || '')];
  const now = Math.floor(Date.now() / 1000);
  const issuer = current.organizations ? org!.issuer : current.issuer;
  if (payload.iss !== issuer || !audiences.includes(current.clientId) ||
      payload.nonce !== nonce || Number(payload.exp || 0) <= now ||
      (payload.nbf != null && Number(payload.nbf) > now + 60) ||
      (payload.iat != null && Number(payload.iat) > now + 60)) return null;
  return payload;
}
async function start(
  request: Request, env: ProviderAuthEnv, provider: Provider,
  intent: 'signin' | 'link' = 'signin',
) {
  const current = config(env, provider);
  if (!current) return failure(request, provider, 'oauth_not_configured');
  if (!env.SOCIAL_CACHE) return failure(request, provider, 'oauth_state_storage_unavailable');
  if (current.organizations && !await organizationsLinkStorageReady(env.DB)) {
    return failure(request, provider, 'microsoft_links_unavailable');
  }
  let employeeId: string | undefined;
  let sessionId: string | undefined;
  if (intent === 'link') {
    if (provider !== 'microsoft' || !current.organizations) {
      return failure(request, provider, 'oauth_not_configured');
    }
    if (!sameOriginFormPost(request)) return new Response('Forbidden', { status: 403 });
    const staff = await recentlyVerifiedStaffSession(request, env);
    if (!staff) return linkRedirect(request, 'microsoft_link_expired');
    employeeId = staff.employee.id;
    sessionId = staff.sessionId;
  }
  const state: State = {
    provider, state: token(24), verifier: token(48), nonce: token(24),
    expiresAt: Date.now() + ttl * 1000,
    intent, authMode: current.organizations ? 'organizations' : 'single',
    employeeId, sessionId,
  };
  await env.SOCIAL_CACHE.put('staffportal-oauth-state:' + state.state,
    JSON.stringify(state), { expirationTtl: ttl });
  const target = new URL(current.authorizationEndpoint);
  target.searchParams.set('client_id', current.clientId);
  target.searchParams.set('redirect_uri', callbackUrl(request, provider, env));
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('scope', current.scope);
  target.searchParams.set('state', state.state);
  target.searchParams.set('nonce', state.nonce);
  target.searchParams.set('code_challenge', b64(await sha(state.verifier)));
  target.searchParams.set('code_challenge_method', 'S256');
  if (provider === 'google') target.searchParams.set('access_type', 'online');
  if (intent === 'link') target.searchParams.set('prompt', 'select_account');
  return new Response(null, { status: 302, headers: {
    location: target.toString(), 'cache-control': 'no-store',
    'set-cookie': stateCookie(request, await signState(env, state)),
  } });
}
async function createSession(request: Request, env: ProviderAuthEnv, employeeId: string, provider: Provider) {
  const secret = pepper(env);
  if (!secret) throw new Error('AUTH_PEPPER is not configured for production.');
  const sessionToken = token(32);
  const sessionHash = await shaHex(sessionToken + ':' + secret);
  const sessionId = uid('session');
  const setting = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?')
    .bind('security.session_hours').first<{ setting_value: string }>();
  const hours = Math.max(1, Number(setting?.setting_value || 12) || 12);
  const expiresAt = new Date(Date.now() + hours * 60 * 60_000).toISOString();
  await env.DB.prepare(`
    INSERT INTO auth_sessions (
      id, employee_id, token_hash, device_id, device_name, user_agent, ip_address,
      login_geofence_result, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(sessionId, employeeId, sessionHash, null, 'OAuth · ' + label(provider),
    request.headers.get('user-agent'), request.headers.get('cf-connecting-ip') || null, 'not_required', expiresAt).run();
  await logSecurity(env, request, 'signin_success', { employeeId, sessionId, result: 'success',
    details: { provider: label(provider), authentication: 'oauth' } });
  return { token: sessionToken, maxAge: hours * 3600 };
}
async function callback(request: Request, env: ProviderAuthEnv, provider: Provider) {
  const query = new URL(request.url).searchParams;
  if (query.get('error')) return failure(request, provider, 'provider_denied');
  const code = query.get('code'); const incomingState = query.get('state'); const signedState = readCookie(request, cookieName);
  if (!code || !incomingState || !signedState || !env.SOCIAL_CACHE) return failure(request, provider, 'invalid_oauth_response');
  let state: State | null = null;
  let cookieState: State | null = null;
  try {
    cookieState = await verifyState(env, signedState);
    const stored = await env.SOCIAL_CACHE.get('staffportal-oauth-state:' + incomingState);
    await env.SOCIAL_CACHE.delete('staffportal-oauth-state:' + incomingState);
    state = stored ? JSON.parse(stored) as State : null;
  } catch { return failure(request, provider, 'invalid_oauth_state'); }
  if (!state || !cookieState || state.provider !== provider || state.state !== incomingState ||
      cookieState.state !== state.state || cookieState.verifier !== state.verifier ||
      cookieState.nonce !== state.nonce || state.intent !== cookieState.intent ||
      state.authMode !== cookieState.authMode ||
      state.employeeId !== cookieState.employeeId || state.sessionId !== cookieState.sessionId) {
    return failure(request, provider, 'invalid_oauth_state');
  }
  const current = config(env, provider);
  if (!current) return failure(request, provider, 'oauth_not_configured');
  if ((state.authMode || 'single') !== (current.organizations ? 'organizations' : 'single')) {
    return failure(request, provider, 'invalid_oauth_state');
  }
  try {
    const tokenRequest = new URLSearchParams({
      client_id: current.clientId, code, grant_type: 'authorization_code',
      redirect_uri: callbackUrl(request, provider, env), code_verifier: state.verifier,
    });
    if (current.clientSecret) tokenRequest.set('client_secret', current.clientSecret);
    const tokenResponse = await fetch(current.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenRequest,
    });
    const tokens = await providerJson(tokenResponse);
    const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
    const identityToken = typeof tokens.id_token === 'string' ? tokens.id_token : '';
    if (!accessToken || !identityToken) return failure(request, provider, 'provider_token_missing');
    const identity = await verifyIdentityToken(identityToken, current, state.nonce);
    if (!identity || typeof identity.sub !== 'string') return failure(request, provider, 'invalid_provider_identity');
    let employeeId: string;
    if (provider === 'microsoft' && current.organizations) {
      const organization = organizationIdentity(identity);
      if (!organization) return failure(request, provider, 'invalid_provider_identity');
      if (state.intent === 'link') {
        const staff = await recentlyVerifiedStaffSession(
          request, env, state.employeeId, state.sessionId,
        );
        if (!staff) return linkRedirect(request, 'microsoft_link_expired');
        const companyId = staff.companies[0]?.id;
        if (!companyId) return linkRedirect(request, 'microsoft_link_expired');
        // The identity association and mandatory audit are in a SINGLE D1
        // batch transaction. Audit failure rolls back the association.
        const outcome = await bindMicrosoftEmployeeIdentity(
          env.DB, staff.employee.id, organization, staff.sessionId, companyId, request,
        );
        if (outcome === 'conflict') return linkRedirect(request, 'microsoft_link_conflict');
        return linkRedirect(request, 'linked', true);
      }
      // Never grant access based on Microsoft email, UPN or preferred_username.
      const linkedId = await linkedMicrosoftEmployee(env.DB, organization);
      if (!linkedId) {
        // A Microsoft UPN/email is not authority to link an existing employee.
        // New identities may request provisional onboarding only; no session
        // or permissions are issued before management approves the request.
        const email = String(identity.email || identity.preferred_username || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return applicantRedirect(request, provider, 'email_required');
        }
        const outcome = await provisionOAuthApplicant(env, {
          provider, email, name: String(identity.name || email.split('@')[0]),
          firstName: String(identity.given_name || ''),
          lastName: String(identity.family_name || ''),
          microsoftTenantId: organization.tenantId,
          microsoftObjectId: organization.objectId,
        }, request);
        return outcome === 'existing'
          ? failure(request, provider, 'microsoft_link_required')
          : applicantRedirect(request, provider, outcome);
      }
      employeeId = linkedId;
    } else {
      if (state.intent === 'link') return failure(request, provider, 'invalid_oauth_state');
      const profile = await providerJson(await fetch(current.userInfoEndpoint, {
        headers: { authorization: 'Bearer ' + accessToken },
      }));
      if (typeof profile.sub === 'string' && profile.sub !== identity.sub) {
        return failure(request, provider, 'invalid_provider_identity');
      }
      const email = String(identity.email || identity.preferred_username || profile.email || '')
        .trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return failure(request, provider, 'provider_email_missing');
      }
      if (provider === 'google' && identity.email_verified !== true) {
        return failure(request, provider, 'provider_email_unverified');
      }
      const employee = await env.DB.prepare(
        'SELECT id, employment_status AS status FROM employees WHERE LOWER(email) = ? LIMIT 1'
      ).bind(email).first<{ id: string; status: string }>();
      if (!employee) {
        if (provider !== 'google') return failure(request, provider, 'employee_not_authorized');
        const outcome = await provisionOAuthApplicant(env, {
          provider, email, name: String(identity.name || profile.name || email.split('@')[0]),
          firstName: String(identity.given_name || profile.given_name || ''),
          lastName: String(identity.family_name || profile.family_name || ''),
        }, request);
        return outcome === 'existing'
          ? failure(request, provider, 'employee_not_authorized')
          : applicantRedirect(request, provider, outcome);
      }
      if (!['active', 'provisional'].includes(employee.status)) {
        return failure(request, provider, 'employee_not_authorized');
      }
      employeeId = employee.id;
    }
    // Newly registered social applicants are never silently signed in while
    // approval is pending, even if their provider identity is valid.
    if (await oauthApplicantPending(env.DB, employeeId)) {
      return applicantRedirect(request, provider, 'pending');
    }
    const session = await createSession(request, env, employeeId, provider);
    const headers = new Headers({ location: new URL('/workspace/', request.url).toString(), 'cache-control': 'no-store' });
    headers.append('set-cookie', sessionCookie(request, session.token, session.maxAge));
    headers.append('set-cookie', stateCookie(request, '', 0));
    return new Response(null, { status: 302, headers });
  } catch {
    return failure(request, provider, 'provider_exchange_failed');
  }
}
export async function routeProviderAuth(request: Request, env: ProviderAuthEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/auth/oauth/registration-status' && request.method === 'GET') {
    return applicantStatusPage(request);
  }
  if (url.pathname === '/api/auth/oauth/microsoft/link' && request.method === 'GET') {
    return accountLinkPage(request, env);
  }
  if (url.pathname === '/api/auth/oauth/microsoft/link/start' && request.method === 'POST') {
    return isOrganizationsStaging(env) ? start(request, env, 'microsoft', 'link')
      : new Response('Not found', { status: 404 });
  }
  const startProvider = request.method === 'GET' ? providerFromPath(url.pathname, 'start') : null;
  if (startProvider) return start(request, env, startProvider);
  const callbackProvider = request.method === 'GET' ? providerFromPath(url.pathname, 'callback') : null;
  if (callbackProvider) return callback(request, env, callbackProvider);
  return null;
}