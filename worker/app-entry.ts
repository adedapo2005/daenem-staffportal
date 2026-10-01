import coreHandler from './entry';
import { getSessionContext, type AuthEnv } from './auth';
import { routeBroadcasts } from './broadcasts';
import { routeForms } from './forms';
import { routeFacilities } from './facilities';
import { routeIncidents } from './incidents';

interface Env extends AuthEnv {
  FILES: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  TIMEZONE: string;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function secure(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('permissions-policy', 'camera=(self), geolocation=(self), microphone=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/broadcasts') || url.pathname.startsWith('/api/forms') || url.pathname.startsWith('/api/facilities') || url.pathname.startsWith('/api/incidents')) {
      const context = await getSessionContext(request, env);
      if (!context) return secure(json({ error: 'Authentication required.' }, 401));
      if (url.pathname.startsWith('/api/broadcasts')) {
        const response = await routeBroadcasts(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/forms')) {
        const response = await routeForms(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/facilities')) {
        const response = await routeFacilities(request, env, context);
        if (response) return secure(response);
      }
      if (url.pathname.startsWith('/api/incidents')) {
        const response = await routeIncidents(request, env, context);
        if (response) return secure(response);
      }
      return secure(json({ error: 'API route not found.' }, 404));
    }
    return coreHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
