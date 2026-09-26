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
  if (url.pathname === '/api/admin/storage/mirror-retry' && request.method === 'POST') {
    if (!authorized(context)) return json({ error: 'Storage administration access is not assigned.' }, 403);
    let body: { jobIds?: unknown };
    try { body = await request.json() as { jobIds?: unknown }; }
    catch { return json({ error: 'Invalid storage retry request.' }, 400); }
    if (!Array.isArray(body.jobIds) || body.jobIds.length < 1 || body.jobIds.length > 100 ||
      body.jobIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(id)) ||
      new Set(body.jobIds).size !== body.jobIds.length) {
      return json({ error: 'Choose between 1 and 100 unique mirror jobs to retry.' }, 400);
    }

    const isOwner = context.roles.some((role) => role.code === 'owner');
    const companyIds = [...new Set(context.companies.map((company) => company.id))];
    if (!isOwner && companyIds.length === 0) return json({ error: 'Storage administration access is not assigned.' }, 403);
    const scopeSql = isOwner ? '' : ` AND company_id IN (${companyIds.map(() => '?').join(',')})`;
    const placeholders = body.jobIds.map(() => '?').join(',');
    const eligible = await env.DB.prepare(`SELECT id,company_id AS companyId FROM storage_mirror_jobs
      WHERE provider='microsoft_onedrive' AND status='failed' AND id IN (${placeholders})${scopeSql}`)
      .bind(...body.jobIds, ...(isOwner ? [] : companyIds)).all<{ id: string; companyId: string | null }>();
    const jobs = eligible.results || [];
    if (jobs.length) {
      const statements = jobs.flatMap((job) => [
        env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
          SELECT ?,?,?,'storage','mirror_retry_requested','storage_mirror_job',?,?,'web'
          WHERE EXISTS(SELECT 1 FROM storage_mirror_jobs WHERE id=? AND provider='microsoft_onedrive' AND status='failed')`)
          .bind(`audit-${crypto.randomUUID()}`, context.employee.id, job.companyId, job.id,
            JSON.stringify({ outcome: 'queued_for_retry' }), job.id),
        env.DB.prepare(`UPDATE storage_mirror_jobs SET status='pending',next_attempt_at=CURRENT_TIMESTAMP,
          last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND provider='microsoft_onedrive' AND status='failed'`)
          .bind(job.id),
      ]);
      await env.DB.batch(statements);
    }
    return json({ ok: true, queuedForRetry: jobs.length, unavailableOrOutOfScope: body.jobIds.length - jobs.length });
  }
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
