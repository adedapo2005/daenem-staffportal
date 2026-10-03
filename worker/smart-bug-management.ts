import { hasPermission, type SessionContext } from './auth';

interface Env { DB: D1Database; APP_STAGE?: string }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

function canCompany(context: SessionContext, permission: string, level: 'view' | 'edit', companyId: string) {
  if (hasPermission(context, permission, level, companyId)) return true;
  return hasPermission(context, permission, level) &&
    hasPermission(context, 'smart_bug.cross_company', 'view');
}

function authorizedCompanies(context: SessionContext, permission: string, level: 'view' | 'edit') {
  return [...new Set(context.companies.map((company) => company.id))]
    .filter((companyId) => canCompany(context, permission, level, companyId));
}

export async function routeSmartBugManagement(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const incidentDetail = url.pathname.match(/^\/api\/admin\/smart-bugs\/incidents\/([A-Za-z0-9:_-]{1,160})$/);
  const storageMirrorIntegrity = url.pathname === '/api/admin/smart-bugs/integrity/storage-mirror';
  const reconciliationImportIntegrity = url.pathname === '/api/admin/smart-bugs/integrity/reconciliation-imports';
  const runIntegrityScan = url.pathname === '/api/admin/smart-bugs/detect/integrity' && request.method === 'POST';
  if ((!runIntegrityScan && request.method !== 'GET') || (!['/api/admin/smart-bugs/overview', '/api/admin/smart-bugs/incidents'].includes(url.pathname) && !incidentDetail && !storageMirrorIntegrity && !reconciliationImportIntegrity && !runIntegrityScan)) return null;
  const permission = runIntegrityScan ? 'smart_bug.detectors' :
    storageMirrorIntegrity || reconciliationImportIntegrity ? 'smart_bug.integrity' : 'smart_bug.incidents';
  const level = runIntegrityScan ? 'edit' : 'view';
  const companyIds = authorizedCompanies(context, permission, level);
  const hasCrossCompany = hasPermission(context, permission, level) &&
    hasPermission(context, 'smart_bug.cross_company', 'view');
  if (!hasCrossCompany && companyIds.length === 0) return json({ error: 'Smart Bug Management is unavailable.' }, 404);
  const scopeSql = hasCrossCompany ? '' : ` AND company_id IN (${companyIds.map(() => '?').join(',')})`;
  const binds = hasCrossCompany ? [] : companyIds;

  if (runIntegrityScan) {
    const companyRows = hasCrossCompany
      ? await env.DB.prepare('SELECT id FROM companies ORDER BY id').all<{ id: string }>()
      : { results: companyIds.map((id) => ({ id })) };
    const scanCompanies = (companyRows.results || []).map((row) => row.id);
    const environmentScope = env.APP_STAGE === 'production' ? 'production' : 'non-production';
    const findings: Array<{ companyId: string; detector: string; count: number }> = [];
    for (const companyId of scanCompanies) {
      const [mirror, reconciliation] = await Promise.all([
        env.DB.prepare(`SELECT
          (SELECT COUNT(*) FROM storage_mirror_jobs WHERE provider='microsoft_onedrive' AND status='mirrored'
            AND (provider_item_id IS NULL OR trim(provider_item_id)='' OR synced_at IS NULL) AND company_id=?) +
          (SELECT COUNT(*) FROM storage_mirror_jobs WHERE provider='microsoft_onedrive' AND status='failed'
            AND (last_error_code IS NULL OR trim(last_error_code)='') AND company_id=?) AS count`)
          .bind(companyId, companyId).first<{ count: number }>(),
        env.DB.prepare(`SELECT COUNT(*) AS count FROM financial_reconciliation_imports i
          WHERE i.company_id=? AND i.row_count != (SELECT COUNT(*) FROM financial_reconciliation_import_rows r WHERE r.import_id=i.id)`)
          .bind(companyId).first<{ count: number }>(),
      ]);
      for (const [detector, value] of [
        ['storage_mirror_integrity', mirror?.count],
        ['reconciliation_import_row_count', reconciliation?.count],
      ] as const) {
        const count = Number(value) || 0;
        if (count > 0) findings.push({ companyId, detector, count });
      }
    }

    const correlationId = crypto.randomUUID();
    for (const finding of findings) {
      const fingerprintBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${environmentScope}|${finding.companyId}|${finding.detector}`));
      const fingerprint = [...new Uint8Array(fingerprintBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const incidentId = `smart-bug-${fingerprint.slice(0, 48)}`;
      const title = finding.detector === 'storage_mirror_integrity' ? 'Storage mirror integrity needs review' : 'Reconciliation import integrity needs review';
      const summary = `${finding.count} integrity condition${finding.count === 1 ? '' : 's'} require authorized review. No records were changed.`;
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO smart_bug_incidents
          (id,fingerprint,severity,status,title,sanitized_summary,environment_scope,company_id,module,service,
           first_seen_at,last_seen_at,occurrence_count,safety_class)
          VALUES(?,?,'P2','DETECTED',?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1,'MANUAL_ONLY')
          ON CONFLICT(id) DO UPDATE SET status=CASE WHEN smart_bug_incidents.status='RESOLVED'
              THEN 'DETECTED' ELSE smart_bug_incidents.status END,
            last_seen_at=CURRENT_TIMESTAMP,occurrence_count=smart_bug_incidents.occurrence_count+1,
            sanitized_summary=excluded.sanitized_summary,updated_at=CURRENT_TIMESTAMP`)
          .bind(incidentId, fingerprint, title, summary, environmentScope, finding.companyId,
            finding.detector === 'storage_mirror_integrity' ? 'storage' : 'financial_gateway', finding.detector),
        env.DB.prepare(`INSERT INTO smart_bug_evidence
          (id,incident_id,evidence_type,source_module,safe_summary,reference_json,correlation_id)
          VALUES(?,?,'integrity_scan',?,?,?,?)`)
          .bind(`smart-bug-evidence-${crypto.randomUUID()}`, incidentId,
            finding.detector === 'storage_mirror_integrity' ? 'storage' : 'financial_gateway', summary,
            JSON.stringify({ detector: finding.detector, findingCount: finding.count }), `${correlationId}:${finding.detector}:${finding.companyId}`),
        env.DB.prepare(`INSERT INTO smart_bug_audit
          (id,incident_id,actor_type,actor_id,company_id,action,reason,input_refs_json,result,correlation_id)
          VALUES(?,?,'employee',?,?,'run_read_only_integrity_scan','Authorized manual detector run','[]',?,?)`)
          .bind(`smart-bug-audit-${crypto.randomUUID()}`, incidentId, context.employee.id, finding.companyId,
            JSON.stringify({ detector: finding.detector, findingCount: finding.count, recordsChanged: false }),
            `${correlationId}:${finding.detector}:${finding.companyId}`),
      ]);
    }
    return json({ ok: true, readOnly: true, scannedCompanies: scanCompanies.length, incidentsRecorded: findings.length,
      findings: findings.map(({ companyId, detector, count }) => ({ companyId, detector, count })) });
  }

  if (storageMirrorIntegrity) {
    // A row marked mirrored without provider identity or a successful sync time
    // contradicts the durable mirror contract. Keep this sentinel read-only and
    // aggregate-only; file names, keys and provider identifiers stay private.
    const finding = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM storage_mirror_jobs
      WHERE provider='microsoft_onedrive' AND status='mirrored'
        AND (provider_item_id IS NULL OR trim(provider_item_id)='' OR synced_at IS NULL)
        ${scopeSql}
    `).bind(...binds).first<{ count: number }>();
    // Failed jobs must retain a sanitized error code so an authorized operator
    // can distinguish and investigate failures. Never expose raw errors or
    // file-identifying metadata from this aggregate sentinel.
    const failedWithoutCode = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM storage_mirror_jobs
      WHERE provider='microsoft_onedrive' AND status='failed'
        AND (last_error_code IS NULL OR trim(last_error_code)='')
        ${scopeSql}
    `).bind(...binds).first<{ count: number }>();
    const successEvidenceFindings = Number(finding?.count || 0);
    const failedWithoutCodeFindings = Number(failedWithoutCode?.count || 0);
    const findingCount = successEvidenceFindings + failedWithoutCodeFindings;
    return json({
      detector: 'storage_mirror_integrity',
      readOnly: true,
      findingCount,
      findings: {
        mirroredWithoutSuccessEvidence: successEvidenceFindings,
        failedWithoutErrorCode: failedWithoutCodeFindings,
      },
      state: findingCount > 0 ? 'finding' : 'clear',
    });
  }

  if (reconciliationImportIntegrity) {
    // Staged imports are evidence only. A declared row count that disagrees
    // with persisted rows signals incomplete evidence; this detector reports
    // aggregate counts only and never repairs or exposes import contents.
    const finding = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM financial_reconciliation_imports i
      WHERE i.row_count != (
        SELECT COUNT(*) FROM financial_reconciliation_import_rows r WHERE r.import_id=i.id
      )${scopeSql}
    `).bind(...binds).first<{ count: number }>();
    const findingCount = Number(finding?.count || 0);
    return json({
      detector: 'reconciliation_import_row_count',
      readOnly: true,
      findingCount,
      findings: { importsWithRowCountMismatch: findingCount },
      state: findingCount > 0 ? 'finding' : 'clear',
    });
  }

  if (incidentDetail) {
    const incident = await env.DB.prepare(`
      SELECT id,fingerprint,severity,status,title,sanitized_summary AS sanitizedSummary,
        company_id AS companyId,module,service,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,
        occurrence_count AS occurrenceCount,confidence,runbook_id AS runbookId,
        safety_class AS safetyClass,recurrence_of AS recurrenceOf,
        resolved_at AS resolvedAt,
        created_at AS createdAt,updated_at AS updatedAt
      FROM smart_bug_incidents WHERE id=?${scopeSql}
    `).bind(incidentDetail[1], ...binds).first<Record<string, unknown>>();
    if (!incident) return json({ error: 'Incident not found.' }, 404);
    const canViewDiagnostics = canCompany(context, 'smart_bug.diagnostics', 'view', String(incident.companyId || ''));
    const evidence = canViewDiagnostics ? await env.DB.prepare(`
      SELECT evidence_type AS evidenceType,source_module AS sourceModule,
        safe_summary AS summary,created_at AS createdAt
      FROM smart_bug_evidence WHERE incident_id=? ORDER BY created_at ASC,id ASC LIMIT 100
    `).bind(incidentDetail[1]).all<Record<string, unknown>>() : { results: [] };
    return json({ incident, evidence: evidence.results || [] });
  }

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
      mode: control?.observeOnly === 0 && control?.autoRemediationEnabled === 1
        ? 'non_production_auto_heal'
        : 'observe_only',
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
  if (companyId && !hasCrossCompany && !companyIds.includes(companyId)) return json({ incidents: [], limit, status: status || null });
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
