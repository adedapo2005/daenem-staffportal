import type { AuthEnv, SessionContext } from './auth';

interface StorageMirrorEnv extends AuthEnv {}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function authorized(context: SessionContext) {
  return context.roles.some((role) => role.code === 'owner' || role.code === 'group_admin');
}

export async function routeStorageMirror(request: Request, env: StorageMirrorEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/admin/storage/mirror-health' || request.method !== 'GET') return null;
  if (!authorized(context)) return json({ error: 'Storage administration access is not assigned.' }, 403);

  const isOwner = context.roles.some((role) => role.code === 'owner');
  const companyIds = [...new Set(context.companies.map((company) => company.id))];
  const scoped = !isOwner && companyIds.length > 0;
  const scopeSql = scoped ? ` AND company_id IN (${companyIds.map(() => '?').join(',')})` : (!isOwner ? ' AND 1=0' : '');
  const rows = await env.DB.prepare(`
    SELECT status,COUNT(*) AS count,MAX(CASE WHEN status='mirrored' THEN synced_at END) AS last_success_at
    FROM storage_mirror_jobs
    WHERE provider='microsoft_onedrive'${scopeSql}
    GROUP BY status
  `).bind(...(scoped ? companyIds : [])).all<{ status: string; count: number; last_success_at: string | null }>();

  const counts: Record<string, number> = {
    pending: 0, syncing: 0, mirrored: 0, retrying: 0, failed: 0, disabled: 0, providerRequired: 0,
  };
  let lastSuccessfulSync: string | null = null;
  for (const row of rows.results || []) {
    const key = row.status === 'provider_required' ? 'providerRequired' : row.status;
    if (key in counts) counts[key] = Number(row.count) || 0;
    if (row.last_success_at && (!lastSuccessfulSync || row.last_success_at > lastSuccessfulSync)) lastSuccessfulSync = row.last_success_at;
  }
  const queued = counts.pending + counts.syncing + counts.retrying;
  return json({
    provider: 'Microsoft OneDrive',
    primaryStorage: 'Cloudflare R2',
    providerStatus: 'provider_required',
    syncHealth: counts.failed ? 'attention_required' : queued ? 'backup_pending' : counts.mirrored ? 'healthy' : 'no_uploads',
    counts,
    pendingCount: queued,
    failedCount: counts.failed,
    lastSuccessfulSync,
    liveAuthorizationEnabled: false,
  });
}
