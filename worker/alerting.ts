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
const alertRecipientTypes = new Set(['user', 'role', 'department', 'business', 'site', 'all_authorized']);
const alertChannels = new Set(['in_app', 'screen_popup', 'email', 'whatsapp', 'web_push']);

function validAlertRuleAudience(recipients: unknown, channels: unknown) {
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 100 ||
      !Array.isArray(channels) || channels.length < 1 || channels.length > alertChannels.size) return false;
  const recipientKeys = new Set<string>();
  for (const value of recipients) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const selector = value as AlertRecipientSelector;
    if (typeof selector.type !== 'string' || !alertRecipientTypes.has(selector.type)) return false;
    if (selector.type === 'all_authorized') {
      if (selector.id !== undefined && selector.id !== '') return false;
    } else if (typeof selector.id !== 'string' || !selector.id.trim() || selector.id.length > 160) return false;
    const key = `${selector.type}:${selector.id || ''}`;
    if (recipientKeys.has(key)) return false;
    recipientKeys.add(key);
  }
  const uniqueChannels = new Set<string>();
  for (const channel of channels) {
    if (typeof channel !== 'string' || !alertChannels.has(channel) || uniqueChannels.has(channel)) return false;
    uniqueChannels.add(channel);
  }
  return true;
}

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

function validPlatformEvent(input: PlatformEventInput) {
  const boundedText = (value: unknown, max: number, required = false) =>
    typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim())) && !/[\u0000-\u001f\u007f]/.test(value);
  if (!input || typeof input !== 'object' ||
      !/^[a-z][a-z0-9_.-]{0,79}$/.test(input.module) ||
      !/^[a-z][a-z0-9_.-]{0,119}$/.test(input.eventType) ||
      !/^[a-z][a-z0-9_.-]{0,79}$/.test(input.sourceType) ||
      (input.companyId !== undefined && input.companyId !== null && !/^[A-Za-z0-9:_-]{1,160}$/.test(input.companyId)) ||
      (input.sourceId !== undefined && input.sourceId !== null && !boundedText(input.sourceId, 160)) ||
      !boundedText(input.title, 160, true) ||
      (input.summary !== undefined && input.summary !== null && !boundedText(input.summary, 2000)) ||
      (input.relatedPath !== undefined && input.relatedPath !== null &&
        (!boundedText(input.relatedPath, 500) || !input.relatedPath.startsWith('/') ||
          input.relatedPath.startsWith('//') || input.relatedPath.includes('\\') ||
          /[?#]/.test(input.relatedPath) || input.relatedPath.split('/').some((part) => part === '..'))) ||
      (input.severityHint !== undefined && !['low', 'medium', 'high', 'critical'].includes(input.severityHint)) ||
      (input.occurredAt !== undefined && (!boundedText(input.occurredAt, 40) || !Number.isFinite(Date.parse(input.occurredAt)))) ||
      (input.payload !== undefined && (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)))) return false;
  try { return JSON.stringify(input.payload || {}).length <= 16_384; }
  catch { return false; }
}

async function resolveRecipients(env: AlertingEnv, rule: Record<string, unknown> | null, companyId: string | null) {
  let selectors: AlertRecipientSelector[] = [{ type: 'all_authorized' }];
  let channels: string[] = ['in_app'];
  if (rule) {
    let parsedSelectors: unknown;
    let parsedChannels: unknown;
    try { parsedSelectors = JSON.parse(String(rule.recipientsJson || '')); }
    catch { return { employeeIds: [], recipientReasons: new Map<string, string>(), channels: [] }; }
    try { parsedChannels = JSON.parse(String(rule.channelsJson || '')); }
    catch { return { employeeIds: [], recipientReasons: new Map<string, string>(), channels: [] }; }
    // Never deliver to a silently filtered subset of a corrupted saved rule.
    if (!validAlertRuleAudience(parsedSelectors, parsedChannels)) {
      return { employeeIds: [], recipientReasons: new Map<string, string>(), channels: [] };
    }
    selectors = parsedSelectors as AlertRecipientSelector[];
    channels = parsedChannels as string[];
  }
  const employees = new Map<string, string>();
  const addRecipients = (ids: string[], selector: AlertRecipientSelector, scopeCompany: string | null) => {
    const reason = JSON.stringify({ selector: selector.type, scope: selector.type === 'site' ? selector.id : scopeCompany });
    for (const id of ids) if (!employees.has(id)) employees.set(id, reason);
  };
  for (const selector of selectors) {
    const scopeCompany = typeof rule?.companyId === 'string' ? rule.companyId : companyId;
    if (selector.type === 'user' && selector.id) {
      const row = await env.DB.prepare(`SELECT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id
        WHERE e.id=? AND e.employment_status='active' AND m.active=1 AND (? IS NULL OR m.company_id=?)
        AND EXISTS (SELECT 1 FROM employee_roles er JOIN role_permissions rp ON rp.role_id=er.role_id
          JOIN permissions p ON p.id=rp.permission_id WHERE er.employee_id=e.id AND er.company_id=m.company_id
          AND p.code='alerting.access' AND rp.access_level<>'none')`)
        .bind(selector.id, scopeCompany, scopeCompany).first<{ id: string }>();
      if (row) addRecipients([row.id], selector, scopeCompany);
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
      addRecipients((rows.results || []).map((row) => row.id), selector, scopeCompany);
    } else if (selector.type === 'department' && selector.id) {
      const rows = await env.DB.prepare(`SELECT DISTINCT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id
        WHERE e.employment_status='active' AND m.active=1 AND e.department=? AND (? IS NULL OR m.company_id=?)
        AND EXISTS (SELECT 1 FROM employee_roles ar JOIN role_permissions rp ON rp.role_id=ar.role_id
          JOIN permissions p ON p.id=rp.permission_id WHERE ar.employee_id=e.id AND ar.company_id=m.company_id
          AND p.code='alerting.access' AND rp.access_level<>'none')`)
        .bind(selector.id, scopeCompany, scopeCompany).all<{ id: string }>();
      addRecipients((rows.results || []).map((row) => row.id), selector, scopeCompany);
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
      addRecipients((rows.results || []).map((row) => row.id), selector, scopeCompany);
    }
  }
  return { employeeIds: [...employees.keys()], recipientReasons: employees, channels: [...new Set(channels)] };
}

async function createRecipientDeliveries(env: AlertingEnv, alertId: string, employeeIds: string[], channels: string[], recipientReasons: Map<string, string>) {
  const alert = await env.DB.prepare('SELECT company_id companyId,title,summary,severity FROM platform_alerts WHERE id=?')
    .bind(alertId).first<{ companyId: string | null; title: string; summary: string | null; severity: Severity }>();
  if (!alert) return;
  for (const employeeId of employeeIds) {
    const recipientId = uid('alert-recipient');
    await env.DB.prepare(`INSERT OR IGNORE INTO platform_alert_recipients(id,alert_id,employee_id,recipient_reason)
      VALUES(?,?,?,?)`).bind(recipientId, alertId, employeeId, recipientReasons.get(employeeId) || '{"selector":"matched_rule"}').run();
    const recipient = await env.DB.prepare('SELECT id FROM platform_alert_recipients WHERE alert_id=? AND employee_id=?')
      .bind(alertId, employeeId).first<{ id: string }>();
    if (!recipient) continue;
    for (const channel of channels) {
      const deliveryId = uid('alert-delivery');
      // Only channels with an attached dispatch path enter the shared outbox.
      // External providers stay visibly gated until their Owner-approved
      // adapter and activation settings are available.
      const initialStatus = channel === 'in_app' || channel === 'screen_popup' || channel === 'web_push'
        ? 'queued' : 'provider_required';
      const statements = [env.DB.prepare(`INSERT OR IGNORE INTO platform_alert_deliveries(id,alert_id,recipient_id,channel,status)
        VALUES(?,?,?,?,?)`).bind(deliveryId, alertId, recipient.id, channel, initialStatus)];
      // Reuse only channels already supported by the shared outbox. External
      // providers remain provider-required until their activation gates open.
      if (channel === 'in_app' || channel === 'web_push' || channel === 'screen_popup') {
        // The shared notification feed accepts in_app/web_push, while the
        // alert delivery remains canonically screen_popup for the UI to render
        // as an immediate popup. Keep both records in the same atomic batch.
        const outboxChannel = channel === 'screen_popup' ? 'in_app' : channel;
        const outboxPriority = alert.severity === 'critical' ? 'urgent' : alert.severity === 'high' ? 'high' : alert.severity;
        statements.push(env.DB.prepare(`INSERT OR IGNORE INTO notification_outbox
          (id,employee_id,company_id,source_type,source_id,channel,title,message,priority,status)
          SELECT id,?,?, 'platform_alert',?,?,?,?,?,'queued'
          FROM platform_alert_deliveries
          WHERE alert_id=? AND recipient_id=? AND channel=? AND status='queued' LIMIT 1`)
          .bind(employeeId, alert.companyId, alertId, outboxChannel, alert.title,
            alert.summary || alert.title, outboxPriority, alertId, recipient.id, channel));
      }
      await env.DB.batch(statements);
    }
  }
}

function companyScope(context: SessionContext) {
  // Alert management authority does not imply cross-company visibility.
  // Only the Owner role has group-wide scope; everyone else stays within
  // their canonical company memberships, including delegated managers.
  if (owner(context)) return { sql: '', values: [] as string[] };
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
  // Publishers are internal, but still cross a trust boundary: malformed event
  // data must fail closed before it can become alert, outbox, or audit content.
  if (!validPlatformEvent(input)) return null;
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

  // An Event is durable even when current authorization resolves no recipients.
  // In that case it remains an event only: do not create an Alert or delivery.
  const recipientPlan = await resolveRecipients(env, rule || null, input.companyId || null);
  if (!recipientPlan.employeeIds.length) return null;

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
    await createRecipientDeliveries(env, String(existing.id), recipientPlan.employeeIds, recipientPlan.channels, recipientPlan.recipientReasons);
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
  await createRecipientDeliveries(env, alertId, recipientPlan.employeeIds, recipientPlan.channels, recipientPlan.recipientReasons);
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

async function listDeliveries(request: Request, env: AlertingEnv, context: SessionContext) {
  if (!canManage(context)) return json({ error: 'Alert delivery administration access is not assigned.' }, 403);
  const alertId = new URL(request.url).searchParams.get('alertId')?.trim() || '';
  if (!alertId || alertId.length > 160) return json({ error: 'A valid alert is required.' }, 400);
  const scope = companyScope(context);
  const rows = await env.DB.prepare(`
    SELECT d.id,d.channel,d.status,d.attempts,d.provider_message_id providerMessageId,
      CASE WHEN d.last_error IS NOT NULL THEN 1 ELSE 0 END hasError,
      d.sent_at sentAt,d.delivered_at deliveredAt,d.viewed_at viewedAt,
      d.created_at createdAt,d.updated_at updatedAt,ar.employee_id employeeId,
      a.id alertId,a.company_id companyId
    FROM platform_alert_deliveries d
    JOIN platform_alert_recipients ar ON ar.id=d.recipient_id AND ar.alert_id=d.alert_id
    JOIN platform_alerts a ON a.id=d.alert_id
    WHERE d.alert_id=?${scope.sql}
    ORDER BY ar.employee_id,d.channel
    LIMIT 300
  `).bind(alertId, ...scope.values).all<Record<string, unknown>>();
  return json({ alertId, deliveries: rows.results || [] });
}

async function receipt(request: Request, env: AlertingEnv, context: SessionContext, action: 'acknowledge' | 'action') {
  if (!canView(context)) return json({ error: 'Alert access is not assigned.' }, 403);
  let body: { alertId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid alert request.' }, 400); }
  const alertId = String(body.alertId || '');
  if (!alertId) return json({ error: 'Alert is required.' }, 400);

  const alert = await env.DB.prepare(`
    SELECT id,company_id companyId,status FROM platform_alerts WHERE id=?
  `).bind(alertId).first<{ id: string; companyId: string | null; status: string }>();
  if (!alert) return json({ error: 'Alert not found.' }, 404);
  // Alert management permission does not grant group-wide receipt authority.
  // Keep mutations within the same company scope used by the read models.
  if (!owner(context) && (!alert.companyId || !context.companies.some((company) => company.id === alert.companyId))) {
    return json({ error: 'Alert not found.' }, 404);
  }
  if (alert.status === 'resolved') return json({ error: 'Resolved alerts cannot be updated.' }, 409);

  const assigned = await env.DB.prepare('SELECT id FROM platform_alert_recipients WHERE alert_id=? AND employee_id=?')
    .bind(alertId, context.employee.id).first<{ id: string }>();
  if (!assigned) return json({ error: 'Alert not found.' }, 404);

  const now = new Date().toISOString();
  let writes: D1Result[];
  if (action === 'acknowledge') {
    writes = await env.DB.batch([
      env.DB.prepare(`UPDATE platform_alerts SET status=CASE WHEN status IN ('open','reopened') THEN 'acknowledged' ELSE status END,
        acknowledged_at=COALESCE(acknowledged_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'resolved'`).bind(now, alertId),
      env.DB.prepare(`UPDATE platform_alert_recipients SET viewed_at=COALESCE(viewed_at,?),acknowledged_at=COALESCE(acknowledged_at,?)
        WHERE alert_id=? AND employee_id=? AND EXISTS(SELECT 1 FROM platform_alerts WHERE id=? AND status<>'resolved')`).bind(now, now, alertId, context.employee.id, alertId),
      env.DB.prepare(`UPDATE platform_alert_deliveries SET status='viewed',delivered_at=COALESCE(delivered_at,?),
        viewed_at=COALESCE(viewed_at,?),updated_at=CURRENT_TIMESTAMP
        WHERE alert_id=? AND channel='in_app' AND recipient_id IN
          (SELECT id FROM platform_alert_recipients WHERE alert_id=? AND employee_id=?)
          AND status IN ('queued','sent','delivered','viewed')
          AND EXISTS(SELECT 1 FROM platform_alerts WHERE id=? AND status<>'resolved')`)
        .bind(now, now, alertId, alertId, context.employee.id, alertId),
    ]);
  } else {
    writes = await env.DB.batch([
      env.DB.prepare(`UPDATE platform_alerts SET status='actioned',actioned_at=COALESCE(actioned_at,?),
        acknowledged_at=COALESCE(acknowledged_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'resolved'`).bind(now, now, alertId),
      env.DB.prepare(`UPDATE platform_alert_recipients SET viewed_at=COALESCE(viewed_at,?),acknowledged_at=COALESCE(acknowledged_at,?),
        actioned_at=COALESCE(actioned_at,?) WHERE alert_id=? AND employee_id=?
        AND EXISTS(SELECT 1 FROM platform_alerts WHERE id=? AND status<>'resolved')`).bind(now, now, now, alertId, context.employee.id, alertId),
      env.DB.prepare(`UPDATE platform_alert_deliveries SET status='viewed',delivered_at=COALESCE(delivered_at,?),
        viewed_at=COALESCE(viewed_at,?),updated_at=CURRENT_TIMESTAMP
        WHERE alert_id=? AND channel='in_app' AND recipient_id IN
          (SELECT id FROM platform_alert_recipients WHERE alert_id=? AND employee_id=?)
          AND status IN ('queued','sent','delivered','viewed')
          AND EXISTS(SELECT 1 FROM platform_alerts WHERE id=? AND status<>'resolved')`)
        .bind(now, now, alertId, alertId, context.employee.id, alertId),
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
  const module = body.module == null ? null : String(body.module).trim();
  const severity = body.severity === undefined ? 'medium' : body.severity;
  const dedupWindowMinutes = body.dedupWindowMinutes === undefined ? 30 : body.dedupWindowMinutes;
  const conditions = body.conditions === undefined ? {} : body.conditions;
  const escalation = body.escalation === undefined ? {} : body.escalation;
  const boundedObject = (value: unknown, maxLength: number) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    try { return JSON.stringify(value).length <= maxLength; } catch { return false; }
  };
  if (!name || name.length > 120 || !eventType || eventType.length > 120 ||
      (module !== null && (!module || module.length > 80)) ||
      !['low', 'medium', 'high', 'critical'].includes(String(severity)) ||
      typeof dedupWindowMinutes !== 'number' || !Number.isInteger(dedupWindowMinutes) || dedupWindowMinutes < 1 || dedupWindowMinutes > 10080 ||
      !boundedObject(conditions, 8192) || !boundedObject(escalation, 8192) ||
      (body.acknowledgementRequired !== undefined && typeof body.acknowledgementRequired !== 'boolean') ||
      (body.quietHoursOverride !== undefined && typeof body.quietHoursOverride !== 'boolean') ||
      (body.active !== undefined && typeof body.active !== 'boolean')) {
    return json({ error: 'Alert rule fields must be valid and bounded.' }, 400);
  }
  const recipients = body.recipients === undefined ? [{ type: 'all_authorized' }] : body.recipients;
  const channels = body.channels === undefined ? ['in_app'] : body.channels;
  if (!validAlertRuleAudience(recipients, channels)) {
    return json({ error: 'Choose valid, unique alert recipients and delivery channels.' }, 400);
  }
  const companyId = body.companyId ? String(body.companyId) : null;
  if (companyId && !owner(context) && !context.companies.some((company) => company.id === companyId)) {
    return json({ error: 'Company access is not assigned.' }, 403);
  }
  if (!owner(context) && Array.isArray(recipients) && recipients.some((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const selector = value as AlertRecipientSelector;
    if (selector.type !== 'business') return false;
    return !selector.id || (companyId ? selector.id !== companyId :
      !context.companies.some((company) => company.id === selector.id));
  })) {
    return json({ error: 'Business recipient access is not assigned.' }, 403);
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
    id, companyId, name, module, eventType, severity,
    JSON.stringify(body.conditions || {}), JSON.stringify(recipients),
    JSON.stringify(channels), body.acknowledgementRequired ? 1 : 0,
    body.quietHoursOverride ? 1 : 0, dedupWindowMinutes,
    JSON.stringify(escalation), body.active === false ? 0 : 1, context.employee.id,
  ).run();
  await audit(env, context, 'save_rule', id, companyId, { name, eventType, severity });
  return json({ ok: true, id }, body.id ? 200 : 201);
}

export async function routeAlerting(request: Request, env: AlertingEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/alerting/attention' && request.method === 'GET') return listAttention(env, context);
  if (url.pathname === '/api/alerting/history' && request.method === 'GET') return listHistory(request, env, context);
  if (url.pathname === '/api/alerting/deliveries' && request.method === 'GET') return listDeliveries(request, env, context);
  if (url.pathname === '/api/alerting/acknowledge' && request.method === 'POST') return receipt(request, env, context, 'acknowledge');
  if (url.pathname === '/api/alerting/action' && request.method === 'POST') return receipt(request, env, context, 'action');
  if (url.pathname === '/api/alerting/rules' && request.method === 'GET') return listRules(env, context);
  if (url.pathname === '/api/alerting/rules' && request.method === 'POST') return saveRule(request, env, context);
  return null;
}
