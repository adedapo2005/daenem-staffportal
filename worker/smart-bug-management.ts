import type { SessionContext } from './auth';

interface Env { DB: D1Database }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

function groupRole(context: SessionContext) {
  return context.roles.some((role) => role.code === 'owner' || role.code === 'group_admin');
}

function scope(context: SessionContext) {
  const isOwner = context.roles.some((role) => role.code === 'owner');
  const companyIds = [...new Set(context.companies.map((company) => company.id))];
  return { isOwner, companyIds };
}

export async function routeSmartBugManagement(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['/api/admin/smart-bugs/overview', '/api/admin/smart-bugs/incidents'].includes(url.pathname)) return null;
  if (!groupRole(context)) return json({ error: 'Smart Bug Management access is not assigned.' }, 403);

  const { isOwner, companyIds } = scope(context);
  if (!isOwner && companyIds.length === 0) return json(url.pathname.endsWith('/overview')
    ? { incidents: 0, active: 0, bySeverity: { P0: 0, P1: 0, P2: 0, P3: 0 }, byStatus: {}, mode: 'observe_only', autoRemediationEnabled: false }
    : { incidents: [], limit: 50 });
  const scopeSql = isOwner ? '' : ` AND company_id IN (${companyIds.map(() => '?').join(',')})`;
  const binds = isOwner ? [] : companyIds;

  if (url.pathname.endsWith('/overview')) {
    const rows = await env.DB.prepare(`
      SELECT status,severity,COUNT(*) AS count
      FROM smart_bug_incidents
      WHERE 1=1${scopeSql}
      GROUP BY status,severity
    `).bind(...binds).all<{ status: string; severity: string; count: number }>();
    const bySeverity: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    const byStatus: Record<string, number> = {};
    let incidents = 0;
    let active = 0;
    for (const row of rows.results || []) {
      const count = Number(row.count) || 0;
      incidents += count;
      if (row.severity in bySeverity) bySeverity[row.severity] += count;
      byStatus[row.status] = (byStatus[row.status] || 0) + count;
      if (!['RESOLVED', 'FALSE_POSITIVE', 'SUPPRESSED_BY_POLICY'].includes(row.status)) active += count;
    }
    const control = await env.DB.prepare(`SELECT observe_only AS observeOnly,auto_remediation_enabled AS autoRemediationEnabled
      FROM smart_bug_control WHERE id=1`).first<{ observeOnly: number; autoRemediationEnabled: number }>();
    return json({ incidents, active, bySeverity, byStatus,
      mode: control?.observeOnly === 0 ? 'non_production_auto_heal' : 'observe_only',
      autoRemediationEnabled: control?.autoRemediationEnabled === 1 });
  }

  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return json({ error: 'Choose between 1 and 100 incidents.' }, 400);
  const status = url.searchParams.get('status') || '';
  const allowedStatuses = ['DETECTED','CORRELATING','DIAGNOSED','REMEDIATION_READY','AUTO_REMEDIATING','AWAITING_APPROVAL','VALIDATING','RESOLVED','MONITORING','RETRYING','ROLLED_BACK','ESCALATED','FAILED_REMEDIATION','FALSE_POSITIVE','SUPPRESSED_BY_POLICY'];
  if (status && !allowedStatuses.includes(status)) return json({ error: 'Choose a valid incident status.' }, 400);
  const severity = url.searchParams.get('severity') || '';
  if (severity && !['P0','P1','P2','P3'].includes(severity)) return json({ error: 'Choose a valid incident severity.' }, 400);
  const module = url.searchParams.get('module') || '';
  const fingerprint = url.searchParams.get('fingerprint') || '';
  const companyId = url.searchParams.get('companyId') || '';
  const recurrence = url.searchParams.get('recurrence') || '';
  if (module.length > 80 || fingerprint.length > 128 || companyId.length > 100 ||
      (recurrence && !['recurring','first_occurrence'].includes(recurrence))) {
    return json({ error: 'Choose valid bounded incident filters.' }, 400);
  }
  if (companyId && !isOwner && !companyIds.includes(companyId)) return json({ incidents: [], limit, status: status || null });
  const filters = [
    ...(status ? [[' AND status=?', status] as const] : []),
    ...(severity ? [[' AND severity=?', severity] as const] : []),
    ...(module ? [[' AND module=?', module] as const] : []),
    ...(fingerprint ? [[' AND fingerprint LIKE ?', `%${fingerprint}%`] as const] : []),
    ...(companyId ? [[' AND company_id=?', companyId] as const] : []),
  ];
  const filterSql = `${filters.map(([sql]) => sql).join('')}${recurrence === 'recurring' ? ' AND recurrence_of IS NOT NULL' : recurrence === 'first_occurrence' ? ' AND recurrence_of IS NULL' : ''}`;
  const incidents = await env.DB.prepare(`
    SELECT id,fingerprint,severity,status,title,sanitized_summary,company_id AS companyId,
      module,service,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,
      occurrence_count AS occurrenceCount,confidence,recurrence_of AS recurrenceOf,
      created_at AS createdAt,updated_at AS updatedAt
    FROM smart_bug_incidents
    WHERE 1=1${scopeSql}${filterSql}
    ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      last_seen_at DESC,id ASC
    LIMIT ?
  `).bind(...binds, ...filters.map(([, value]) => value), limit).all<Record<string, unknown>>();
  return json({ incidents: incidents.results || [], limit, status: status || null });
}
