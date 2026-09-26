import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface AlertingEnv extends AuthEnv {}

type Severity = 'low' | 'medium' | 'high' | 'critical';
type PlatformEventInput = {
  companyId?: string | null;
  module: string;
  eventType: string;
  sourceType: string;
  sourceId?: string | null;
  severityHint?: Severity;
  title: string;
  summary?: string;
  relatedPath?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};
type AlertRecipientSelector = { type?: string; id?: string };

const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const owner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');
const canView = (context: SessionContext) => owner(context) || hasPermission(context, 'alerting.access', 'view');
const canManage = (context: SessionContext) => owner(context) || hasPermission(context, 'alerting.access', 'manage');
const canRules = (context: SessionContext) => owner(context) || hasPermission(context, 'alerting.rules', 'manage');
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeSeverity(value: unknown): Severity {
  return ['low', 'medium', 'high', 'critical'].includes(String(value)) ? value as Severity : 'medium';
}

async function resolveRecipients(env: AlertingEnv, rule: Record<string, unknown> | null, companyId: string | null) {
  let selectors: AlertRecipientSelector[] = [];
  let channels: string[] = ['in_app'];
  try {
    const parsed = JSON.parse(String(rule?.recipientsJson || '[]'));
    if (Array.isArray(parsed)) selectors = parsed.filter((item): item is AlertRecipientSelector => !!item && typeof item === 'object');
  } catch { /* Invalid configuration fails closed below. */ }
  try {
    const parsed = JSON.parse(String(rule?.channelsJson || '["in_app"]'));
    if (Array.isArray(parsed)) channels = parsed.filter((item): item is string => typeof item === 'string' && ['in_app', 'screen_popup', 'email', 'whatsapp', 'web_push'].includes(item));
  } catch { channels = []; }
  if (!rule) selectors = [{ type: 'all_authorized' }];
  const employees = new Set<string>();
  for (const selector of selectors) {
    const scopeCompany = typeof rule?.companyId === 'string' ? rule.companyId : companyId;
    if (selector.type === 'user' && selector.id) {
      const row = await env.DB.prepare(`SELECT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id
        WHERE e.id=? AND e.employment_status='active' AND m.active=1 AND (? IS NULL OR m.company_id=?)
        AND EXISTS (SELECT 1 FROM employee_roles er JOIN role_permissions rp ON rp.role_id=er.role_id
          JOIN permissions p ON p.id=rp.permission_id WHERE er.employee_id=e.id AND er.company_id=m.company_id
          AND p.code='alerting.access' AND rp.access_level<>'none')`)
        .bind(selector.id, scopeCompany, scopeCompany).first<{ id: string }>();
      if (row) employees.add(row.id);
    } else if (selector.type === 'role' && selector.id) {
      const rows = await env.DB.prepare(`SELECT DISTINCT e.id FROM employees e
        JOIN employee_company_memberships m ON m.employee_id=e.id AND m.active=1
        JOIN employee_roles er ON er.employee_id=e.id AND er.company_id=m.company_id
        JOIN roles r ON r.id=er.role_id AND r.active=1
        WHERE e.employment_status='active' AND r.code=? AND (? IS NULL OR m.company_id=?)
        AND EXISTS (SELECT 1 FROM employee_roles ar JOIN role_permissions rp ON rp.role_id=ar.role_id
          JOIN permissions p ON p.id=rp.permission_id WHERE ar.employee_id=e.id AND ar.company_id=m.company_id
          AND p.code='alerting.access' AND rp.access_level<>'none')`)
        .bind(selector.id, scopeCompany, scopeCompany).all<{ id: string }>();
      for (const row of rows.results || []) employees.add(row.id);
    } else if (selector.type === 'department' && selector.id) {
      const rows = await env.DB.prepare(`SELECT DISTINCT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id
        WHERE e.employment_status='active' AND m.active=1 AND e.department=? AND (? IS NULL OR m.company_id=?)
        AND EXISTS (SELECT 1 FROM employee_roles ar JOIN role_permissions rp ON rp.role_id=ar.role_id
          JOIN permissions p ON p.id=rp.permission_id WHERE ar.employee_id=e.id AND ar.company_id=m.company_id
          AND p.code='alerting.access' AND rp.access_level<>'none')`)
        .bind(selector.id, scopeCompany, scopeCompany).all<{ id: string }>();
      for (const row of rows.results || []) employees.add(row.id);
    } else if (selector.type === 'business' || selector.type === 'site' || selector.type === 'all_authorized') {
      const targetCompany = selector.type === 'business' && selector.id ? selector.id : scopeCompany;
      if (companyId && targetCompany !== companyId) continue;
      const locationClause = selector.type === 'site' && selector.id ? ' AND m.location_id=?' : '';
      const rows = await env.DB.prepare(`SELECT DISTINCT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id
        WHERE e.employment_status='active' AND m.active=1 AND (? IS NULL OR m.company_id=?)${locationClause}
        AND EXISTS (SELECT 1 FROM employee_roles ar JOIN role_permissions rp ON rp.role_id=ar.role_id
          JOIN permissions p ON p.id=rp.permission_id WHERE ar.employee_id=e.id AND ar.company_id=m.company_id
          AND p.code='alerting.access' AND rp.access_level<>'none')`)
        .bind(targetCompany, targetCompany, ...(locationClause ? [selector.id as string] : [])).all<{ id: string }>();
      for (const row of rows.results || []) employees.add(row.id);
    }
  }
  return { employeeIds: [...employees], channels: [...new Set(channels)] };
}

async function createRecipientDeliveries(env: AlertingEnv, alertId: string, employeeIds: string[], channels: string[]) {
  for (const employeeId of employeeIds) {
    const recipientId = uid('alert-recipient');
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_alert_recipients(id,alert_id,employee_id,recipient_reason)
      VALUES(?,?,?,'matched_alert_rule')`).bind(recipientId, alertId, employeeId).run();
    const recipient = await env.DB.prepare('SELECT id FROM platform_alert_recipients WHERE alert_id=? AND employee_id=?')
      .bind(alertId, employeeId).first<{ id: string }>();
    if (!recipient) continue;
    for (const channel of channels) {
      await env.DB.prepare(`INSERT OR IGNORE INTO platform_alert_deliveries(id,alert_id,recipient_id,channel,status)
        VALUES(?,?,?,?,'queued')`).bind(uid('alert-delivery'), alertId, recipient.id, channel).run();
    }
  }
}

function companyScope(context: SessionContext) {
  if (canManage(context)) return { sql: '', values: [] as string[] };
  const ids = context.companies.map((company) => company.id);
  if (!ids.length) return { sql: ' AND 1=0', values: [] as string[] };
  return { sql: ` AND a.company_id IN (${ids.map(() => '?').join(',')})`, values: ids };
}

async function audit(env: AlertingEnv, context: SessionContext, action: string, entityId: string, companyId: string | null, detail: unknown) {
  await env.DB.prepare(`
    INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
    VALUES(?,?,?,'alerting',?,'platform_alert',?,?,'web')
  `).bind(uid('audit'), context.employee.id, companyId, action, entityId, JSON.stringify(detail || {})).run();
}

export async function publishPlatformEvent(env: AlertingEnv, input: PlatformEventInput) {
  const occurredAt = input.occurredAt || new Date().toISOString();
  const eventId = uid('alert-event');
  const rule = await env.DB.prepare(`
    SELECT id,company_id companyId,severity,acknowledgement_required acknowledgementRequired,dedup_window_minutes dedupWindowMinutes,
      recipients_json recipientsJson,channels_json channelsJson
    FROM platform_alert_rules
    WHERE active=1 AND event_type=? AND (module IS NULL OR module=?)
      AND (company_id IS NULL OR company_id=?)
    ORDER BY CASE WHEN company_id=? THEN 0 ELSE 1 END, CASE WHEN module=? THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `).bind(input.eventType, input.module, input.companyId || null, input.companyId || null, input.module).first<Record<string, unknown>>();
  const recipientPlan = await resolveRecipients(env, rule || null, input.companyId || null);
  if (!recipientPlan.employeeIds.length) return null;
  const severity = safeSeverity(rule?.severity || input.severityHint);
  const fingerprint = await digest([
    input.companyId || 'group', input.module, input.eventType, input.sourceType,
    input.sourceId || '', input.title.trim().toLowerCase(),
  ].join('|'));
  const dedupWindowMinutes = Math.max(1, Number(rule?.dedupWindowMinutes || 30));

  await env.DB.prepare(`
    INSERT INTO platform_alert_events
      (id,company_id,module,event_type,source_type,source_id,severity_hint,title,summary,related_path,payload_json,occurred_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    eventId, input.companyId || null, input.module, input.eventType, input.sourceType, input.sourceId || null,
    input.severityHint || null, input.title, input.summary || null, input.relatedPath || null,
    JSON.stringify(input.payload || {}), occurredAt,
  ).run();

  const existing = await env.DB.prepare(`
    SELECT id,alert_no alertNo,occurrence_count occurrenceCount
    FROM platform_alerts
    WHERE fingerprint=? AND (company_id IS ? OR company_id=?)
      AND status IN ('open','acknowledged','actioned','reopened')
      AND datetime(last_seen_at) >= datetime('now', ?)
    ORDER BY last_seen_at DESC LIMIT 1
  `).bind(fingerprint, input.companyId || null, input.companyId || null, `-${dedupWindowMinutes} minutes`).first<Record<string, unknown>>();

  if (existing) {
    await env.DB.prepare(`
      UPDATE platform_alerts SET occurrence_count=occurrence_count+1,last_seen_at=?,severity=?,
        summary=COALESCE(?,summary),related_path=COALESCE(?,related_path),updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(occurredAt, severity, input.summary || null, input.relatedPath || null, existing.id).run();
    await createRecipientDeliveries(env, String(existing.id), recipientPlan.employeeIds, recipientPlan.channels);
    return { alertId: String(existing.id), alertNo: String(existing.alertNo), deduplicated: true };
  }
  const alertId = uid('alert');
  const alertNo = `ALT-${new Date().getUTCFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  await env.DB.prepare(`
    INSERT INTO platform_alerts
      (id,alert_no,event_id,rule_id,company_id,module,event_type,fingerprint,severity,title,summary,related_path,
       acknowledgement_required,status,occurrence_count,first_seen_at,last_seen_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'open',1,?,?)
  `).bind(
    alertId, alertNo, eventId, rule?.id || null, input.companyId || null, input.module, input.eventType,
    fingerprint, severity, input.title, input.summary || null, input.relatedPath || null,
    Number(rule?.acknowledgementRequired || 0), occurredAt, occurredAt,
  ).run();
  await createRecipientDeliveries(env, alertId, recipientPlan.employeeIds, recipientPlan.channels);
  return { alertId, alertNo, deduplicated: false };
}

async function listAttention(env: AlertingEnv, context: SessionContext) {
  if (!canView(context)) return json({ error: 'Alert access is not assigned.' }, 403);
  const scope = companyScope(context);
  const recipientClause = canManage(context) ? '' : `
    AND EXISTS (
      SELECT 1 FROM platform_alert_recipients ar
      WHERE ar.alert_id=a.id AND ar.employee_id=?
    )`;
  const recipientValues = canManage(context) ? [] : [context.employee.id];
  const rows = await env.DB.prepare(`
    SELECT a.id,a.alert_no alertNo,a.company_id companyId,a.module,a.event_type eventType,a.severity,
      a.title,a.summary,a.related_path relatedPath,a.acknowledgement_required acknowledgementRequired,
      a.status,a.occurrence_count occurrenceCount,a.first_seen_at firstSeenAt,a.last_seen_at lastSeenAt,
      a.acknowledged_at acknowledgedAt,a.actioned_at actionedAt,
      ar.delivered_at deliveredAt,ar.viewed_at viewedAt,
      ar.acknowledged_at recipientAcknowledgedAt,ar.actioned_at recipientActionedAt,
      COALESCE(ds.deliveryCount,0) deliveryCount,COALESCE(ds.deliveredCount,0) deliveredCount,
      COALESCE(ds.failedCount,0) failedCount,ds.lastDeliveryUpdateAt
    FROM platform_alerts a
    LEFT JOIN platform_alert_recipients ar ON ar.alert_id=a.id AND ar.employee_id=?
    LEFT JOIN (
      SELECT recipient_id,COUNT(*) deliveryCount,
        SUM(CASE WHEN status IN ('delivered','viewed') THEN 1 ELSE 0 END) deliveredCount,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failedCount,
        MAX(COALESCE(delivered_at,sent_at,updated_at)) lastDeliveryUpdateAt
      FROM platform_alert_deliveries
      WHERE recipient_id IN (SELECT id FROM platform_alert_recipients WHERE employee_id=?)
      GROUP BY recipient_id
    ) ds ON ds.recipient_id=ar.id
    WHERE a.status IN ('open','acknowledged','reopened')${scope.sql}${recipientClause}
    ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      a.last_seen_at DESC
    LIMIT 200
  `).bind(context.employee.id, context.employee.id, ...scope.values, ...recipientValues).all<Record<string, unknown>>();
  return json({ alerts: rows.results || [] });
}

async function listHistory(request: Request, env: AlertingEnv, context: SessionContext) {
  if (!canView(context)) return json({ error: 'Alert access is not assigned.' }, 403);
  const status = new URL(request.url).searchParams.get('status') || '';
  const scope = companyScope(context);
  const recipientClause = canManage(context) ? '' : `
    AND EXISTS (SELECT 1 FROM platform_alert_recipients ar WHERE ar.alert_id=a.id AND ar.employee_id=?)`;
  const recipientValues = canManage(context) ? [] : [context.employee.id];
  const rows = await env.DB.prepare(`
    SELECT a.id,a.alert_no alertNo,a.module,a.event_type eventType,a.severity,a.title,a.summary,a.status,
      a.occurrence_count occurrenceCount,a.first_seen_at firstSeenAt,a.last_seen_at lastSeenAt,
      a.acknowledged_at acknowledgedAt,a.actioned_at actionedAt,a.resolved_at resolvedAt,a.resolution_summary resolutionSummary
    FROM platform_alerts a
    WHERE (?='' OR a.status=?)${scope.sql}${recipientClause}
    ORDER BY a.last_seen_at DESC LIMIT 300
  `).bind(status, status, ...scope.values, ...recipientValues).all<Record<string, unknown>>();
  return json({ alerts: rows.results || [] });
}
async function receipt(request: Request, env: AlertingEnv, context: SessionContext, action: 'acknowledge' | 'action') {
  if (!canView(context)) return json({ error: 'Alert access is not assigned.' }, 403);
  let body: { alertId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid alert request.' }, 400); }
  const alertId = String(body.alertId || '');
  if (!alertId) return json({ error: 'Alert is required.' }, 400);

  const alert = await env.DB.prepare(`
    SELECT id,company_id companyId,status FROM platform_alerts WHERE id=?
  `).bind(alertId).first<{ id: string; companyId?: string; status: string }>();
  if (!alert) return json({ error: 'Alert not found.' }, 404);
  if (alert.status === 'resolved') return json({ error: 'Resolved alerts cannot be updated.' }, 409);

  if (!canManage(context)) {
    const assigned = await env.DB.prepare('SELECT id FROM platform_alert_recipients WHERE alert_id=? AND employee_id=?')
      .bind(alertId, context.employee.id).first<{ id: string }>();
    if (!assigned) return json({ error: 'Alert not found.' }, 404);
  }

  const now = new Date().toISOString();
  let writes: D1Result[];
  if (action === 'acknowledge') {
    writes = await env.DB.batch([
      env.DB.prepare(`UPDATE platform_alerts SET status=CASE WHEN status IN ('open','reopened') THEN 'acknowledged' ELSE status END,
        acknowledged_at=COALESCE(acknowledged_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'resolved'`).bind(now, alertId),
      env.DB.prepare(`UPDATE platform_alert_recipients SET viewed_at=COALESCE(viewed_at,?),acknowledged_at=COALESCE(acknowledged_at,?)
        WHERE alert_id=? AND employee_id=? AND EXISTS(SELECT 1 FROM platform_alerts WHERE id=? AND status<>'resolved')`).bind(now, now, alertId, context.employee.id, alertId),
    ]);
  } else {
    writes = await env.DB.batch([
      env.DB.prepare(`UPDATE platform_alerts SET status='actioned',actioned_at=COALESCE(actioned_at,?),
        acknowledged_at=COALESCE(acknowledged_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'resolved'`).bind(now, now, alertId),
      env.DB.prepare(`UPDATE platform_alert_recipients SET viewed_at=COALESCE(viewed_at,?),acknowledged_at=COALESCE(acknowledged_at,?),
        actioned_at=COALESCE(actioned_at,?) WHERE alert_id=? AND employee_id=?
        AND EXISTS(SELECT 1 FROM platform_alerts WHERE id=? AND status<>'resolved')`).bind(now, now, now, alertId, context.employee.id, alertId),
    ]);
  }
  if (Number(writes[0]?.meta?.changes || 0) !== 1) return json({ error: 'Resolved alerts cannot be updated.' }, 409);
  const resultingStatus = action === 'action' ? 'actioned' : ['open', 'reopened'].includes(alert.status) ? 'acknowledged' : alert.status;
  await audit(env, context, action, alertId, alert.companyId || null, { previousStatus: alert.status });
  return json({ ok: true, alertId, status: resultingStatus });
}
async function listRules(env: AlertingEnv, context: SessionContext) {
  if (!canRules(context)) return json({ error: 'Alert rule management is not assigned.' }, 403);
  const rows = await env.DB.prepare(`
    SELECT id,company_id companyId,name,module,event_type eventType,severity,conditions_json conditionsJson,
      recipients_json recipientsJson,channels_json channelsJson,acknowledgement_required acknowledgementRequired,
      quiet_hours_override quietHoursOverride,dedup_window_minutes dedupWindowMinutes,
      escalation_json escalationJson,active,created_at createdAt,updated_at updatedAt
    FROM platform_alert_rules ORDER BY active DESC,name ASC
  `).all<Record<string, unknown>>();
  return json({ rules: rows.results || [] });
}

async function saveRule(request: Request, env: AlertingEnv, context: SessionContext) {
  if (!canRules(context)) return json({ error: 'Alert rule management is not assigned.' }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid alert rule request.' }, 400); }
  const name = String(body.name || '').trim();
  const eventType = String(body.eventType || '').trim();
  if (!name || !eventType) return json({ error: 'Rule name and event are required.' }, 400);
  const companyId = body.companyId ? String(body.companyId) : null;
  if (companyId && !owner(context) && !context.companies.some((company) => company.id === companyId)) {
    return json({ error: 'Company access is not assigned.' }, 403);
  }
  if (body.id !== undefined && (typeof body.id !== 'string' || !body.id.trim())) {
    return json({ error: 'Invalid alert rule identifier.' }, 400);
  }
  const requestedId = typeof body.id === 'string' ? body.id : null;
  if (requestedId) {
    const existing = await env.DB.prepare('SELECT company_id companyId FROM platform_alert_rules WHERE id=?')
      .bind(requestedId).first<{ companyId: string | null }>();
    if (!existing) return json({ error: 'Alert rule not found.' }, 404);
    if (!owner(context) && (!existing.companyId || !context.companies.some((company) => company.id === existing.companyId))) {
      return json({ error: 'Alert rule access is not assigned.' }, 403);
    }
    if (!owner(context) && existing.companyId !== companyId) {
      return json({ error: 'Company access is not assigned.' }, 403);
    }
  }
  const id = requestedId || uid('alert-rule');
  const severity = safeSeverity(body.severity);
  await env.DB.prepare(`
    INSERT INTO platform_alert_rules
      (id,company_id,name,module,event_type,severity,conditions_json,recipients_json,channels_json,
       acknowledgement_required,quiet_hours_override,dedup_window_minutes,escalation_json,active,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET company_id=excluded.company_id,name=excluded.name,module=excluded.module,
      event_type=excluded.event_type,severity=excluded.severity,conditions_json=excluded.conditions_json,
      recipients_json=excluded.recipients_json,channels_json=excluded.channels_json,
      acknowledgement_required=excluded.acknowledgement_required,quiet_hours_override=excluded.quiet_hours_override,
      dedup_window_minutes=excluded.dedup_window_minutes,escalation_json=excluded.escalation_json,
      active=excluded.active,updated_at=CURRENT_TIMESTAMP
  `).bind(
    id, companyId, name, body.module ? String(body.module) : null, eventType, severity,
    JSON.stringify(body.conditions || {}), JSON.stringify(body.recipients || []),
    JSON.stringify(body.channels || ['in_app']), body.acknowledgementRequired ? 1 : 0,
    body.quietHoursOverride ? 1 : 0, Math.max(1, Number(body.dedupWindowMinutes || 30)),
    JSON.stringify(body.escalation || {}), body.active === false ? 0 : 1, context.employee.id,
  ).run();
  await audit(env, context, 'save_rule', id, companyId, { name, eventType, severity });
  return json({ ok: true, id }, body.id ? 200 : 201);
}

export async function routeAlerting(request: Request, env: AlertingEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/alerting/attention' && request.method === 'GET') return listAttention(env, context);
  if (url.pathname === '/api/alerting/history' && request.method === 'GET') return listHistory(request, env, context);
  if (url.pathname === '/api/alerting/acknowledge' && request.method === 'POST') return receipt(request, env, context, 'acknowledge');
  if (url.pathname === '/api/alerting/action' && request.method === 'POST') return receipt(request, env, context, 'action');
  if (url.pathname === '/api/alerting/rules' && request.method === 'GET') return listRules(env, context);
  if (url.pathname === '/api/alerting/rules' && request.method === 'POST') return saveRule(request, env, context);
  return null;
}
