import type { AuthEnv, SessionContext } from './auth';

interface StorageMirrorEnv extends AuthEnv {}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** Revalidate the session and administration authority for each resource company.
 * Cached session roles and other company memberships never grant Storage access. */
function storageAdminGrantSql(companyColumn?: string): string {
  const companyConstraint = companyColumn ? `AND m.company_id=${companyColumn}` : '';
  const denialScope = `(p.module IN ('settings','storage','storage_mirror','onedrive')
    OR p.code IN ('storage.access','storage.manage','storage_mirror.manage','onedrive.manage'))`;
  return `EXISTS (
    SELECT 1 FROM auth_sessions s
    JOIN employees e ON e.id=s.employee_id
    JOIN employee_company_memberships m ON m.employee_id=e.id AND m.active=1
    JOIN companies c ON c.id=m.company_id AND c.active=1
    JOIN employee_roles er ON er.employee_id=e.id AND er.company_id=m.company_id
    JOIN roles r ON r.id=er.role_id AND r.active=1
    WHERE s.id=? AND s.employee_id=? AND s.revoked_at IS NULL
      AND datetime(s.expires_at)>datetime('now')
      AND e.employment_status IN ('active','provisional')
      AND r.code IN ('owner','group_admin')
      AND (r.company_id IS NULL OR r.company_id=m.company_id)
      ${companyConstraint}
      AND NOT EXISTS (
        SELECT 1 FROM employee_permission_overrides o
        JOIN permissions p ON p.id=o.permission_id
        WHERE o.employee_id=e.id AND o.company_id=m.company_id
          AND o.access_level='none'
          AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
          AND ${denialScope}
      )
      AND NOT EXISTS (
        SELECT 1 FROM employee_permission_overrides_v2 o
        JOIN permissions p ON p.id=o.permission_id
        WHERE o.employee_id=e.id AND (o.company_id=m.company_id OR o.company_id IS NULL)
          AND o.access_level='none'
          AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
          AND ${denialScope}
      )
  )`;
}
async function hasStorageAdminGrant(env: StorageMirrorEnv, context: SessionContext, companyId?: string): Promise<boolean> {
  if (!context.sessionId || !context.employee?.id) return false;
  try {
    const row = await env.DB.prepare(`SELECT 1 AS allowed WHERE ${storageAdminGrantSql(companyId ? '?' : undefined)}`)
      .bind(context.sessionId, context.employee.id, ...(companyId ? [companyId] : []))
      .first<{ allowed: number }>();
    return Boolean(row?.allowed);
  } catch {
    // Missing authorization state must fail closed.
    return false;
  }
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
  if (!await hasStorageAdminGrant(env, context)) return json({ error: 'Storage administration access is not assigned.' }, 403);
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
    const companyId = url.searchParams.get('companyId');
    if (companyId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(companyId)) return json({ error: 'Choose a valid company.' }, 400);
    if (!await hasStorageAdminGrant(env, context, companyId || undefined)) {
      return json({ error: 'Storage administration access is not assigned.' }, 403);
    }
    const status = url.searchParams.get('status') || '';
    const allowedStatuses = ['pending', 'syncing', 'mirrored', 'retrying', 'failed', 'disabled', 'provider_required'];
    if (status && !allowedStatuses.includes(status)) return json({ error: 'Choose a valid mirror status.' }, 400);
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return json({ error: 'Choose between 1 and 100 mirror jobs.' }, 400);
    const selectedSql = companyId ? ' AND company_id=?' : '';
    const statusSql = status ? ' AND status=?' : '';
    const rows = await env.DB.prepare(`
      SELECT id,source_module AS sourceModule,status,attempt_count AS attemptCount,
        last_error_code AS lastErrorCode,next_attempt_at AS nextAttemptAt,
        created_at AS createdAt,updated_at AS updatedAt,
        synced_at AS syncedAt
      FROM storage_mirror_jobs
      WHERE provider='microsoft_onedrive' AND company_id IS NOT NULL
        AND ${storageAdminGrantSql('storage_mirror_jobs.company_id')}${selectedSql}${statusSql}
      ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'retrying' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
        updated_at DESC,id ASC
      LIMIT ?
    `).bind(context.sessionId, context.employee.id, ...(companyId ? [companyId] : []),
      ...(status ? [status] : []), limit).all<Record<string, unknown>>();
    return json({ jobs: (rows.results || []).map((row) => ({ ...row, lastErrorCode: publicMirrorErrorCode(row.lastErrorCode) })),
      limit, status: status || null });
  }
  if (url.pathname === '/api/admin/storage/mirror-retry' && request.method === 'POST') {
    let body: { jobIds?: unknown; companyId?: unknown };
    try { body = await request.json() as { jobIds?: unknown; companyId?: unknown }; }
    catch { return json({ error: 'Invalid storage retry request.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid storage retry request.' }, 400);
    if (body.companyId !== undefined && (typeof body.companyId !== 'string' ||
      !/^[A-Za-z0-9:_-]{1,160}$/.test(body.companyId))) return json({ error: 'Choose a valid company.' }, 400);
    const companyId = body.companyId as string | undefined;
    if (!await hasStorageAdminGrant(env, context, companyId)) {
      return json({ error: 'Storage administration access is not assigned.' }, 403);
    }
    if (!Array.isArray(body.jobIds) || body.jobIds.length < 1 || body.jobIds.length > 100 ||
      body.jobIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(id)) ||
      new Set(body.jobIds).size !== body.jobIds.length) {
      return json({ error: 'Choose between 1 and 100 unique mirror jobs to retry.' }, 400);
    }
    const requestId = requestCorrelationId(request);
    // D1.batch is transactional: authorization, failed->pending CAS and audit
    // commit together. A prior list/read is never an authorization substitute.
    const statements = body.jobIds.flatMap((jobId) => [
      env.DB.prepare(`UPDATE storage_mirror_jobs SET status='pending',next_attempt_at=CURRENT_TIMESTAMP,
        last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND provider='microsoft_onedrive' AND status='failed'
          AND company_id IS NOT NULL
          AND ${storageAdminGrantSql('storage_mirror_jobs.company_id')}
          ${companyId ? 'AND company_id=?' : ''}`)
        .bind(jobId, context.sessionId, context.employee.id, ...(companyId ? [companyId] : [])),
      env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id)
        SELECT ?,?,j.company_id,'storage','mirror_retry_requested','storage_mirror_job',j.id,?,'web',?
        FROM storage_mirror_jobs j
        WHERE j.id=? AND j.provider='microsoft_onedrive' AND j.status='pending' AND changes()=1`)
        .bind(`audit-${crypto.randomUUID()}`, context.employee.id,
          JSON.stringify({ outcome: 'queued_for_retry' }), requestId, jobId),
    ]);
    const results = await env.DB.batch(statements);
    let queuedForRetry = 0;
    for (let index = 0; index < results.length; index += 2) {
      if (Number(results[index]?.meta?.changes) === 1) queuedForRetry += 1;
    }
    return json({ ok: true, queuedForRetry, unavailableOrOutOfScope: body.jobIds.length - queuedForRetry });
  }
  if (url.pathname !== '/api/admin/storage/mirror-health' || request.method !== 'GET') return null;
  const companyId = url.searchParams.get('companyId');
  if (companyId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(companyId)) return json({ error: 'Choose a valid company.' }, 400);
  if (!await hasStorageAdminGrant(env, context, companyId || undefined)) {
    return json({ error: 'Storage administration access is not assigned.' }, 403);
  }
  const scopedSql = companyId ? ' AND company_id=?' : '';
  const rows = await env.DB.prepare(`
    SELECT status,COUNT(*) AS count,MAX(CASE WHEN status='mirrored' THEN synced_at END) AS last_success_at
    FROM storage_mirror_jobs
    WHERE provider='microsoft_onedrive' AND company_id IS NOT NULL
      AND ${storageAdminGrantSql('storage_mirror_jobs.company_id')}${scopedSql}
    GROUP BY status
  `).bind(context.sessionId, context.employee.id, ...(companyId ? [companyId] : []))
    .all<{ status: string; count: number; last_success_at: string | null }>();
  const counts: Record<string, number> = {
    pending: 0, syncing: 0, mirrored: 0, retrying: 0, failed: 0, disabled: 0, providerRequired: 0,
  };
  let lastSuccessfulSync: string | null = null;
  for (const row of rows.results || []) {
    const key = row.status === 'provider_required' ? 'providerRequired' : row.status;
    if (key in counts) counts[key] = Number(row.count) || 0;
    if (row.last_success_at && (!lastSuccessfulSync || row.last_success_at > lastSuccessfulSync)) lastSuccessfulSync = row.last_success_at;
  }
  const queued = counts.pending + counts.syncing + counts.retrying + counts.providerRequired;
  return json({
    provider: 'Microsoft OneDrive',
    primaryStorage: 'Cloudflare R2',
    providerStatus: 'provider_required',
    syncHealth: counts.failed ? 'attention_required' : queued ? 'backup_pending' : counts.mirrored ? 'attention_required' : 'no_uploads',
    counts, pendingCount: queued, failedCount: counts.failed, lastSuccessfulSync,
    liveAuthorizationEnabled: false,
  });
}
