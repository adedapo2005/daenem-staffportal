import { getSessionContext, type AuthEnv } from './auth';

export interface WorkspaceRouteEnv extends AuthEnv {
  ASSETS: Fetcher;
}

const protectedWorkspacePaths = new Set(['/workspace', '/workspace/']);

/**
 * Serve only the built workspace entry point, and only after the canonical
 * session lookup has accepted the request. Unauthenticated navigations return
 * to the public v180 root instead of the legacy SPA fallback.
 */
export async function routeWorkspaceShell(request: Request, env: WorkspaceRouteEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!protectedWorkspacePaths.has(url.pathname)) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
    });
  }

  const session = await getSessionContext(request, env);
  if (!session) {
    return new Response(null, {
      status: 303,
      headers: {
        location: '/',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const requestedCompanyId = url.searchParams.get('companyId');
  if (requestedCompanyId && !session.companies.some((company) => company.id === requestedCompanyId)) {
    return new Response(null, {
      status: 303,
      headers: {
        location: '/',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const assetUrl = new URL('/workspace/index.html', request.url);
  const assetRequest = new Request(assetUrl, request);
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
