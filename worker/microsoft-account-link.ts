import { getSessionContext, type AuthEnv, type SessionContext } from './auth';
import { isOrganizationsStaging, linkedMicrosoftIdentityForEmployee } from './microsoft-organizations';

interface LinkEnv extends AuthEnv {
  MICROSOFT_AUTH_MODE?: string;
}

const oauthCookieName = 'daenem_staffportal_oauth_state';

export function sameOriginFormPost(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin &&
    (request.headers.get('content-type') || '').toLowerCase().startsWith('application/x-www-form-urlencoded');
}

export async function recentlyVerifiedStaffSession(
  request: Request, env: LinkEnv, employeeId?: string, sessionId?: string,
): Promise<SessionContext | null> {
  const context = await getSessionContext(request, env);
  if (!context || !['active', 'provisional'].includes(context.employee.status) ||
      (employeeId && context.employee.id !== employeeId) ||
      (sessionId && context.sessionId !== sessionId)) return null;
  // Linking an external identity requires a recently authenticated StaffPortal
  // session. A long-standing unattended session is not sufficient.
  const session = await env.DB.prepare(
    "SELECT id FROM auth_sessions WHERE id=? AND employee_id=? " +
    "AND revoked_at IS NULL AND datetime(expires_at)>datetime('now') " +
    "AND datetime(created_at)>=datetime('now','-15 minutes') LIMIT 1",
  ).bind(context.sessionId, context.employee.id).first<{ id: string }>();
  return session ? context : null;
}

export function linkRedirect(request: Request, status: string, success = false) {
  const target = new URL('/api/auth/oauth/microsoft/link', request.url);
  target.searchParams.set(success ? 'result' : 'error', status);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const headers = new Headers({ location: target.toString(), 'cache-control': 'no-store' });
  headers.append('set-cookie', oauthCookieName + '=; Path=/; HttpOnly' +
    secure + '; SameSite=Lax; Max-Age=0');
  return new Response(null, { status: 302, headers });
}

export async function accountLinkPage(request: Request, env: LinkEnv) {
  if (!isOrganizationsStaging(env)) return new Response('Not found', { status: 404 });
  const context = await getSessionContext(request, env);
  if (!context || !['active', 'provisional'].includes(context.employee.status)) {
    const target = new URL('/', request.url);
    target.searchParams.set('auth_error', 'microsoft_link_requires_signin');
    target.searchParams.set('auth_provider', 'microsoft');
    return Response.redirect(target.toString(), 302);
  }
  const link = await linkedMicrosoftIdentityForEmployee(env.DB, context.employee.id);
  const result = new URL(request.url).searchParams.get('result');
  const error = new URL(request.url).searchParams.get('error');
  const linked = Boolean(link && !link.revokedAt);
  const line = linked
    ? 'Your Microsoft work account is already connected to your StaffPortal employee account.'
    : result === 'linked'
      ? 'Your Microsoft work account is now securely connected.'
      : error === 'microsoft_link_conflict'
        ? 'This Microsoft identity is connected elsewhere, or your account has a different connection. Contact your administrator.'
        : error === 'microsoft_link_expired'
          ? 'Your recent StaffPortal sign-in expired. Sign out and sign in again before connecting.'
          : error
            ? 'Microsoft linking could not be completed. Try again or contact your administrator.'
            : 'Connect an existing Microsoft work or school account. No DAENEM Entra guest invitation is required.';
  const form = linked ? ''
    : '<form action="/api/auth/oauth/microsoft/link/start" method="post">' +
      '<button type="submit">Connect Microsoft work account</button></form>';
  // A dedicated small linking view avoids changing protected post-login pages.
  // All dynamic copy is from a fixed allowlist; no user-controlled HTML.
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Connect Microsoft | DAENEM StaffPortal</title>' +
    '<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;' +
    'background:#edf6f0;color:#183e2d;font:500 16px/1.5 system-ui,sans-serif;padding:20px;' +
    'box-sizing:border-box}main{width:min(440px,100%);border:1px solid #b4d6c3;' +
    'background:#fff;border-radius:20px;padding:30px;box-shadow:0 18px 55px #103b2518}' +
    'h1{font-size:24px;line-height:1.2;margin:0 0 12px;color:#12523a}' +
    'p{margin:0 0 18px}button{width:100%;background:#08764e;color:white;border:0;' +
    'border-radius:12px;padding:14px;font:700 15px system-ui;cursor:pointer}' +
    'button:focus-visible,a:focus-visible{outline:3px solid #e9af45;outline-offset:3px}' +
    'a{color:#126949;font-weight:700;display:inline-block;margin-top:18px}' +
    'small{display:block;margin-top:18px;color:#486458}</style></head><body><main>' +
    '<h1>Connect Microsoft</h1><p>' + line + '</p>' + form +
    '<a href="/workspace/">Return to StaffPortal</a>' +
    '<small>Only your authorized StaffPortal employee account can be connected. Company roles and permissions never change.</small>' +
    '</main></body></html>';
  return new Response(html, { status: 200, headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  } });
}
