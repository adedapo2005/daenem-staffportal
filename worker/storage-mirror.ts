import type { AuthEnv, SessionContext } from './auth';

interface StorageMirrorEnv extends AuthEnv {}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function authorized(context: SessionContext) {
  return context.roles.some((role) => role.code === 'owner' || role.code === 'group_admin');
}

function requestCorrelationId(request: Request) {
  // Do not persist arbitrary caller-provided headers in audit correlation fields.
  for (const candidate of [request.headers.get('x-request-id'), request.headers.get('cf-ray')]) {
    if (candidate && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate) ||
      /^[0-9a-f]{32}$/i.test(candidate) || /^[0-9a-f]{8,20}-[A-Z]{3}$/i.test(candidate))) return candidate;
  }
  return crypto.randomUUID();
}

// Only fixed machine codes are safe to expose from provider/job errors.
const PUBLIC_ERROR_CODES = new Set([
  'PROVIDER_REQUIRED', 'AUTH_REQUIRED', 'AUTH_EXPIRED', 'SOURCE_MISSING',
  'SOURCE_CHANGED', 'DESTINATION_UNAVAILABLE', 'UPLOAD_REJECTED',
  'SYNC_TIMEOUT', 'RATE_LIMITED', 'CHECKSUM_MISMATCH', 'RETRY_EXHAUSTED',
]);
function publicMirrorErrorCode(value: unknown): string | null {
  if (value == null || value === '') return null;
  return typeof value === 'string' && PUBLIC_ERROR_CODES.has(value) ? value : 'BACKUP_ERROR';
}

async function routeOneDriveConfig(request: Request, env: StorageMirrorEnv, context: SessionContext) {
  if (!authorized(context)) return json({ error: 'Storage administration access is not assigned.' }, 403);
  if (request.method === 'GET') {
    const row = await env.DB.prepare(`SELECT updated_at AS updatedAt FROM storage_mirror_oauth_config
      WHERE id='microsoft_onedrive'`).first<{ updatedAt: string }>();
    return json({ provider: 'Microsoft OneDrive', configured: false, applicationConfigurationPresent: Boolean(row),
      updatedAt: row?.updatedAt || null, authorizationEnabled: false, liveTransferEnabled: false,
      setupStatus: 'owner_action_required' });
  }
  return json({
    error: 'OneDrive setup requires the official Microsoft OAuth flow; credential entry is unavailable.',
    ownerActionRequired: true,
  }, request.method === 'PUT' ? 409 : 405);
}

export async function routeStorageMirror(request: Request, env: StorageMirrorEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/admin/storage/onedrive/config') return routeOneDriveConfig(request, env, context);
  if (url.pathname === '/api/admin/storage/mirror-jobs' && request.method === 'GET') {
    if (!authorized(context)) return json({ error: 'Storage administration access is not assigned.' }, 403);
    const status = url.searchParams.get('status') || '';
    const allowedStatuses = ['pending', 'syncing', 'mirrored', 'retrying', 'failed', 'disabled', 'provider_required'];
    if (status && !allowedStatuses.includes(status)) return json({ error: 'Choose a valid mirror status.' }, 400);
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return json({ error: 'Choose between 1 and 100 mirror jobs.' }, 400);

    const isOwner = context.roles.some((role) => role.code === 'owner');
    const companyIds = [...new Set(context.companies.map((company) => company.id))];
    if (!isOwner && companyIds.length === 0) return json({ jobs: [] });
    const scopeSql = isOwner ? '' : ` AND company_id IN (${companyIds.map(() => '?').join(',')})`;
    const statusSql = status ? ' AND status=?' : '';
    const rows = await env.DB.prepare(`
      SELECT id,source_module AS sourceModule,status,attempt_count AS attemptCount,
        last_error_code AS lastErrorCode,next_attempt_at AS nextAttemptAt,
        created_at AS createdAt,updated_at AS updatedAt,
        synced_at AS syncedAt
      FROM storage_mirror_jobs
      WHERE provider='microsoft_onedrive'${scopeSql}${statusSql}
      ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'retrying' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
        updated_at DESC,id ASC
      LIMIT ?
    `).bind(...(isOwner ? [] : companyIds), ...(status ? [status] : []), limit)
      .all<Record<string, unknown>>();
    return json({ jobs: (rows.results || []).map((row) => ({ ...row, lastErrorCode: publicMirrorErrorCode(row.lastErrorCode) })), limit, status: status || null });
  }
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
    let queuedForRetry = 0;
    if (jobs.length) {
      const requestId = requestCorrelationId(request);
      const statements = jobs.flatMap((job) => [
        env.DB.prepare(`UPDATE storage_mirror_jobs SET status='pending',next_attempt_at=CURRENT_TIMESTAMP,
          last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND provider='microsoft_onedrive' AND status='failed'`)
          .bind(job.id),
        env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id)
          SELECT ?,?,?,'storage','mirror_retry_requested','storage_mirror_job',?,?,'web',?
          WHERE changes()=1 AND EXISTS(SELECT 1 FROM storage_mirror_jobs WHERE id=? AND provider='microsoft_onedrive' AND status='pending')`)
          .bind(`audit-${crypto.randomUUID()}`, context.employee.id, job.companyId, job.id,
            JSON.stringify({ outcome: 'queued_for_retry' }), requestId, job.id),
      ]);
      const results = await env.DB.batch(statements);
      // Each job contributes a compare-and-set update followed by its conditional audit.
      // Count only updates that actually transitioned failed -> pending so a
      // concurrent retry cannot inflate the admin's success summary.
      for (let index = 0; index < results.length; index += 2) {
        if (Number(results[index]?.meta?.changes) > 0) queuedForRetry += 1;
      }
    }
    return json({ ok: true, queuedForRetry, unavailableOrOutOfScope: body.jobIds.length - queuedForRetry });
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
  // Uploads accepted while OneDrive is unconfigured still need a secondary
  // copy. Keep them visible in the pending total so the Admin health summary
  // cannot imply that storage is healthy merely because no worker can sync yet.
  const queued = counts.pending + counts.syncing + counts.retrying + counts.providerRequired;
  return json({
    provider: 'Microsoft OneDrive',
    primaryStorage: 'Cloudflare R2',
    providerStatus: 'provider_required',
    syncHealth: counts.failed ? 'attention_required' : queued ? 'backup_pending' : counts.mirrored ? 'attention_required' : 'no_uploads',
    counts,
    pendingCount: queued,
    failedCount: counts.failed,
    lastSuccessfulSync,
    liveAuthorizationEnabled: false,
  });
}
