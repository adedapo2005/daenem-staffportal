import { getSessionContext, hasPermission, type AuthEnv, type SessionContext } from './auth';

const OWNER_ROUTE = '/api/owner/studio/staff-content';
const PUBLIC_ROUTE = '/api/staff-content';
const GRANT = 'staffportal.content.publish';
const MAX_BODY_BYTES = 16_000;
const response = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const unavailable = () => response(503, { error: 'Staff content is temporarily unavailable.' });

interface ContentEnv extends AuthEnv { STAFF_PORTAL_FRONTEND_ORIGIN?: string }
type ContentRow = {
  status: string; publication_version: number;
  spotlight_id: string; spotlight_title: string; spotlight_body: string; spotlight_category: string;
  inspiration_id: string; inspiration_message: string; inspiration_attribution: string; inspiration_category: string;
  provider: string; provider_connected: number; interval_started_at: string; expires_at: string;
};

function activeGrant(context: SessionContext | null): context is SessionContext {
  return !!context && context.employee.status === 'active' && !!context.sessionId && hasPermission(context, GRANT, 'manage');
}
function approvedOrigin(request: Request, env: ContentEnv): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  return origin === new URL(request.url).origin || (env.STAFF_PORTAL_FRONTEND_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean).includes(origin);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value);
}
function timestamp(value: unknown): value is string {
  return text(value, 64) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  if (!request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function keysOnly(input: Record<string, unknown>, fields: string[]): boolean {
  return Object.keys(input).sort().join(',') === [...fields].sort().join(',');
}
function isCurrent(row: ContentRow): boolean {
  const now = Date.now(); const start = Date.parse(row.interval_started_at); const end = Date.parse(row.expires_at);
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now && end > start;
}
function publicPayload(row: ContentRow): Record<string, unknown> | null {
  if (row.status !== 'approved' || !isCurrent(row) || typeof row.provider !== 'string' || !row.provider ||
      (row.provider_connected !== 0 && row.provider_connected !== 1)) return null;
  const values = [row.spotlight_id, row.spotlight_title, row.spotlight_body, row.spotlight_category,
    row.inspiration_id, row.inspiration_message, row.inspiration_attribution, row.inspiration_category];
  const limits = [128, 300, 8_000, 120, 128, 4_000, 300, 120];
  if (!values.every((value, i) => text(value, limits[i]))) return null;
  return {
    spotlight: { id: row.spotlight_id, title: row.spotlight_title, body: row.spotlight_body, category: row.spotlight_category },
    inspiration: { id: row.inspiration_id, message: row.inspiration_message, attribution: row.inspiration_attribution, category: row.inspiration_category },
    provider: row.provider, providerConnected: row.provider_connected === 1,
    intervalStartedAt: row.interval_started_at, expiresAt: row.expires_at,
  };
}
const SELECT_CURRENT = `SELECT status,publication_version,spotlight_id,spotlight_title,spotlight_body,spotlight_category,
 inspiration_id,inspiration_message,inspiration_attribution,inspiration_category,provider,provider_connected,
 interval_started_at,expires_at FROM staffportal_staff_content_publication WHERE slot='current' LIMIT 1`;

async function ownerStudio(request: Request, env: ContentEnv, path: string): Promise<Response> {
  if (path !== OWNER_ROUTE && path !== `${OWNER_ROUTE}/publish`) return response(404, { error: 'Not found.' });
  if (new URL(request.url).search) return response(404, { error: 'Not found.' });
  const isPublish = path.endsWith('/publish');
  if ((!isPublish && request.method !== 'GET' && request.method !== 'PUT') || (isPublish && request.method !== 'POST'))
    return response(405, { error: 'Method not allowed.' });
  let initial: SessionContext | null;
  try { initial = await getSessionContext(request, env); } catch { return response(401, { error: 'Authentication required.' }); }
  if (!initial) return response(401, { error: 'Authentication required.' });
  if (!activeGrant(initial)) return response(403, { error: 'Publication permission required.' });
  if (request.method !== 'GET' && !approvedOrigin(request, env)) return response(403, { error: 'Origin not permitted.' });
  try {
    if (request.method === 'GET') {
      const row = await env.DB.prepare(SELECT_CURRENT).first<Record<string, unknown>>();
      const latest = await getSessionContext(request, env);
      if (!activeGrant(latest) || latest.employee.id !== initial.employee.id || latest.sessionId !== initial.sessionId)
        return response(403, { error: 'Publication permission required.' });
      return response(200, { publication: row || null });
    }
    const input = await readJson(request);
    if (!input) return response(400, { error: 'Invalid publication request.' });
    if (isPublish) {
      if (!keysOnly(input, ['action', 'expectedVersion', 'reason']) ||
          (input.action !== 'publish' && input.action !== 'revoke') || !Number.isSafeInteger(input.expectedVersion) ||
          typeof input.expectedVersion !== 'number' || input.expectedVersion < 1 ||
          !text(input.reason, 400) || input.reason.trim().length < 12)
        return response(400, { error: 'Invalid publication transition.' });
      const current = await env.DB.prepare(SELECT_CURRENT).first<ContentRow>();
      if (!current || current.publication_version !== input.expectedVersion) return response(409, { error: 'Publication changed. Refresh the record.' });
      if (input.action === 'publish' && !publicPayload({ ...current, status: 'approved' }))
        return response(409, { error: 'Content is incomplete or outside its approved schedule.' });
      const latest = await getSessionContext(request, env);
      if (!activeGrant(latest) || latest.employee.id !== initial.employee.id || latest.sessionId !== initial.sessionId)
        return response(403, { error: 'Publication permission required.' });
      const status = input.action === 'publish' ? 'approved' : 'revoked';
      const changed = await env.DB.prepare(`UPDATE staffportal_staff_content_publication SET status=?,publication_version=publication_version+1,
        changed_by=?,change_reason=?,updated_at=CURRENT_TIMESTAMP WHERE slot='current' AND publication_version=?`)
        .bind(status, latest.employee.id, input.reason.trim(), input.expectedVersion).run();
      if (!changed.success || changed.meta?.changes !== 1) return response(409, { error: 'Publication changed. Refresh the record.' });
      return response(200, { ok: true, status, publicationVersion: Number(input.expectedVersion) + 1 });
    }
    const fields = ['expectedVersion','spotlightId','spotlightTitle','spotlightBody','spotlightCategory','inspirationId','inspirationMessage','inspirationAttribution','inspirationCategory','intervalStartedAt','expiresAt','reason'];
    if (!keysOnly(input, fields) || !Number.isSafeInteger(input.expectedVersion) || typeof input.expectedVersion !== 'number' || input.expectedVersion < 0 ||
        !text(input.spotlightId,128) || !text(input.spotlightTitle,300) || !text(input.spotlightBody,8000) || !text(input.spotlightCategory,120) ||
        !text(input.inspirationId,128) || !text(input.inspirationMessage,4000) || !text(input.inspirationAttribution,300) || !text(input.inspirationCategory,120) ||
        !timestamp(input.intervalStartedAt) || !timestamp(input.expiresAt) || Date.parse(input.expiresAt) <= Date.parse(input.intervalStartedAt) ||
        !text(input.reason,400) || input.reason.trim().length < 12)
      return response(400, { error: 'Invalid publication draft.' });
    const latest = await getSessionContext(request, env);
    if (!activeGrant(latest) || latest.employee.id !== initial.employee.id || latest.sessionId !== initial.sessionId)
      return response(403, { error: 'Publication permission required.' });
    const updated = await env.DB.prepare(`INSERT INTO staffportal_staff_content_publication(
      slot,status,publication_version,spotlight_id,spotlight_title,spotlight_body,spotlight_category,
      inspiration_id,inspiration_message,inspiration_attribution,inspiration_category,provider,provider_connected,
      interval_started_at,expires_at,created_by,changed_by,change_reason)
      VALUES('current','draft',1,?,?,?,?,?,?,?,?,'owner-authored',0,?,?,?,?,?)
      ON CONFLICT(slot) DO UPDATE SET status='draft',publication_version=publication_version+1,
      spotlight_id=excluded.spotlight_id,spotlight_title=excluded.spotlight_title,spotlight_body=excluded.spotlight_body,
      spotlight_category=excluded.spotlight_category,inspiration_id=excluded.inspiration_id,
      inspiration_message=excluded.inspiration_message,inspiration_attribution=excluded.inspiration_attribution,
      inspiration_category=excluded.inspiration_category,provider='owner-authored',provider_connected=0,
      interval_started_at=excluded.interval_started_at,expires_at=excluded.expires_at,
      changed_by=excluded.changed_by,change_reason=excluded.change_reason,updated_at=CURRENT_TIMESTAMP
      WHERE staffportal_staff_content_publication.publication_version=?`)
      .bind(input.spotlightId,input.spotlightTitle,input.spotlightBody,input.spotlightCategory,input.inspirationId,input.inspirationMessage,
        input.inspirationAttribution,input.inspirationCategory,input.intervalStartedAt,input.expiresAt,latest.employee.id,latest.employee.id,
        input.reason.trim(),input.expectedVersion).run();
    if (!updated.success || updated.meta?.changes !== 1) return response(409, { error: 'Publication changed. Refresh the record.' });
    return response(200, { ok: true, status: 'draft', publicationVersion: Number(input.expectedVersion) + 1 });
  } catch { return unavailable(); }
}

export async function routeV180PublicStaffContent(request: Request, env: ContentEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_ROUTE && !url.pathname.startsWith(`${OWNER_ROUTE}/` ) && url.pathname !== OWNER_ROUTE) return null;
  if (url.pathname === OWNER_ROUTE || url.pathname.startsWith(`${OWNER_ROUTE}/`)) return ownerStudio(request, env, url.pathname);
  if (request.method !== 'GET' || url.search) return response(request.method === 'GET' ? 404 : 405, { error: 'Not found.' });
  try {
    const row = await env.DB.prepare(SELECT_CURRENT).first<ContentRow>();
    if (!row) return unavailable();
    const payload = publicPayload(row);
    if (!payload) return unavailable();
    return new Response(JSON.stringify(payload), { status: 200, headers: {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    }});
  } catch { return unavailable(); }
}
