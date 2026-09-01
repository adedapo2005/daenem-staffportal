import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface BroadcastEnv extends AuthEnv { AI: Ai }

type AudienceType = 'employee' | 'selected_employees' | 'role' | 'department' | 'company' | 'group';
type Audience = { type: AudienceType; employeeIds?: string[]; roleId?: string; department?: string; companyId?: string };
type BroadcastRow = {
  id: string; companyId?: string; title: string; message: string; severity: string;
  audienceType: AudienceType; audienceJson?: string; pushNotification: number;
  acknowledgementRequired: number; status: string; scheduledFor?: string; expiresAt?: string;
};

const audienceTypes: AudienceType[] = ['employee', 'selected_employees', 'role', 'department', 'company', 'group'];
const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const can = (context: SessionContext, level: 'view' | 'create' | 'edit' | 'approve' | 'manage' = 'view') =>
  hasPermission(context, 'broadcasts.access', level);

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

async function settingNumber(env: BroadcastEnv, key: string, fallback: number) {
  const row = await env.DB.prepare('SELECT setting_value AS value FROM app_settings WHERE setting_key=?')
    .bind(key).first<{ value: string }>();
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function canUseCompany(context: SessionContext, companyId?: string) {
  return !companyId || can(context, 'manage') || context.companies.some((company) => company.id === companyId);
}

async function validateAudience(env: BroadcastEnv, context: SessionContext, audience?: Audience) {
  if (!audience || !audienceTypes.includes(audience.type)) return 'A valid audience is required.';
  if (!canUseCompany(context, audience.companyId)) return 'You cannot target a company outside your assignment.';
  if (audience.type === 'company' && !audience.companyId) return 'Select a company for this audience.';
  if ((audience.type === 'employee' || audience.type === 'selected_employees') &&
      ![...new Set(audience.employeeIds || [])].filter(Boolean).length) return 'Select at least one employee.';
  if (audience.type === 'department' && (!audience.companyId || !String(audience.department || '').trim())) {
    return 'Select a company and department.';
  }
  if (audience.type === 'role') {
    if (!audience.companyId || !audience.roleId) return 'Select a company and role.';
    const role = await env.DB.prepare(`SELECT id FROM roles WHERE id=? AND active=1 AND (company_id IS NULL OR company_id=?)`)
      .bind(audience.roleId, audience.companyId).first<{ id: string }>();
    if (!role) return 'The selected role is not active for this company.';
  }
  return null;
}

async function resolveRecipients(env: BroadcastEnv, audience: Audience) {
  if (audience.type === 'group') {
    return (await env.DB.prepare(`SELECT id AS employeeId FROM employees WHERE employment_status='active'`)
      .all<{ employeeId: string }>()).results || [];
  }
  if (audience.type === 'employee' || audience.type === 'selected_employees') {
    const ids = [...new Set((audience.employeeIds || []).filter(Boolean))];
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    if (audience.companyId) {
      return (await env.DB.prepare(`
        SELECT DISTINCT e.id AS employeeId FROM employees e
        JOIN employee_company_memberships m ON m.employee_id=e.id AND m.active=1
        WHERE e.employment_status='active' AND m.company_id=? AND e.id IN (${placeholders})
      `).bind(audience.companyId, ...ids).all<{ employeeId: string }>()).results || [];
    }
    return (await env.DB.prepare(`SELECT id AS employeeId FROM employees WHERE employment_status='active' AND id IN (${placeholders})`)
      .bind(...ids).all<{ employeeId: string }>()).results || [];
  }
  if (audience.type === 'company' && audience.companyId) {
    return (await env.DB.prepare(`
      SELECT DISTINCT m.employee_id AS employeeId FROM employee_company_memberships m
      JOIN employees e ON e.id=m.employee_id
      WHERE m.company_id=? AND m.active=1 AND e.employment_status='active'
    `).bind(audience.companyId).all<{ employeeId: string }>()).results || [];
  }
  if (audience.type === 'role' && audience.roleId && audience.companyId) {
    return (await env.DB.prepare(`
      SELECT DISTINCT er.employee_id AS employeeId FROM employee_roles er
      JOIN employees e ON e.id=er.employee_id JOIN roles r ON r.id=er.role_id AND r.active=1
      WHERE er.role_id=? AND er.company_id=? AND e.employment_status='active'
    `).bind(audience.roleId, audience.companyId).all<{ employeeId: string }>()).results || [];
  }
  if (audience.type === 'department' && audience.department && audience.companyId) {
    return (await env.DB.prepare(`
      SELECT DISTINCT e.id AS employeeId FROM employees e
      JOIN employee_company_memberships m ON m.employee_id=e.id AND m.active=1
      WHERE m.company_id=? AND e.employment_status='active' AND lower(e.department)=lower(?)
    `).bind(audience.companyId, audience.department).all<{ employeeId: string }>()).results || [];
  }
  return [];
}

async function runBatches(env: BroadcastEnv, statements: D1PreparedStatement[], size = 60) {
  for (let index = 0; index < statements.length; index += size) await env.DB.batch(statements.slice(index, index + size));
}

function parseAudience(broadcast: BroadcastRow): Audience {
  try {
    const parsed = JSON.parse(broadcast.audienceJson || '{}') as Audience;
    return { ...parsed, type: parsed.type || broadcast.audienceType };
  } catch { return { type: broadcast.audienceType, companyId: broadcast.companyId }; }
}

async function deliverBroadcast(env: BroadcastEnv, broadcastId: string, actorEmployeeId: string | null, source: 'web' | 'scheduler') {
  const broadcast = await env.DB.prepare(`
    SELECT id,company_id AS companyId,title,message,severity,audience_type AS audienceType,
      audience_json AS audienceJson,push_notification AS pushNotification,
      acknowledgement_required AS acknowledgementRequired,status,scheduled_for AS scheduledFor,expires_at AS expiresAt
    FROM workforce_broadcasts WHERE id=?
  `).bind(broadcastId).first<BroadcastRow>();
  if (!broadcast) return { error: 'Broadcast not found.', status: 404 } as const;
  if (broadcast.status !== 'approved') return { error: 'Broadcast must be approved before publishing.', status: 409 } as const;
  const now = Date.now();
  const scheduled = parseDate(broadcast.scheduledFor);
  const expires = parseDate(broadcast.expiresAt);
  if (source === 'web' && scheduled && scheduled.getTime() > now) {
    return { error: 'This broadcast is scheduled for later and will publish automatically.', status: 409 } as const;
  }
  if (expires && expires.getTime() <= now) {
    await env.DB.prepare(`UPDATE workforce_broadcasts SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'`)
      .bind(broadcast.id).run();
    return { error: 'This broadcast expired before publication.', status: 409 } as const;
  }
  const recipients = await resolveRecipients(env, parseAudience(broadcast));
  if (!recipients.length) return { error: 'No active employees match this broadcast audience.', status: 409 } as const;

  const statements: D1PreparedStatement[] = [];
  for (const recipient of recipients) {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO workforce_broadcast_recipients(id,broadcast_id,employee_id,company_id,delivered_at)
      VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(`broadcast-recipient-${broadcast.id}-${recipient.employeeId}`, broadcast.id, recipient.employeeId, broadcast.companyId || null));
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO notification_outbox
        (id,employee_id,company_id,source_type,source_id,channel,title,message,priority,status)
      VALUES(?,?,?,?,?,'in_app',?,?,?,'queued')
    `).bind(
      `notification-${broadcast.id}-${recipient.employeeId}-in-app`, recipient.employeeId, broadcast.companyId || null,
      'broadcast', broadcast.id, broadcast.title, broadcast.message,
      broadcast.severity === 'emergency' ? 'urgent' : broadcast.severity === 'urgent' ? 'high' : 'normal',
    ));
    if (broadcast.pushNotification) {
      statements.push(env.DB.prepare(`
        INSERT OR IGNORE INTO notification_outbox
          (id,employee_id,company_id,source_type,source_id,channel,title,message,priority,status)
        VALUES(?,?,?,?,?,'web_push',?,?,?,'queued')
      `).bind(
        `notification-${broadcast.id}-${recipient.employeeId}-web-push`, recipient.employeeId, broadcast.companyId || null,
        'broadcast', broadcast.id, broadcast.title, broadcast.message,
        broadcast.severity === 'emergency' ? 'urgent' : broadcast.severity === 'urgent' ? 'high' : 'normal',
      ));
    }
  }
  await runBatches(env, statements);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE workforce_broadcasts SET status='published',published_at=COALESCE(published_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='approved'
    `).bind(broadcast.id),
    env.DB.prepare(`
      INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
      VALUES(?,?,?,'broadcasts','publish','workforce_broadcast',?,?,?)
    `).bind(uid('audit'), actorEmployeeId, broadcast.companyId || null, broadcast.id, JSON.stringify({
      recipientCount: recipients.length, pushRequested: Boolean(broadcast.pushNotification),
      acknowledgementRequired: Boolean(broadcast.acknowledgementRequired), scheduled: Boolean(broadcast.scheduledFor),
    }), source),
  ]);
  return { ok: true, status: 'published', recipientCount: recipients.length, pushQueued: Boolean(broadcast.pushNotification) } as const;
}

async function list(request: Request, env: BroadcastEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Broadcast Center access is not assigned.' }, 403);
  const status = new URL(request.url).searchParams.get('status') || '';
  const companyIds = context.companies.map((company) => company.id);
  const scope = can(context, 'manage') ? { sql: '', values: [] as string[] } : companyIds.length
    ? { sql: ` AND (wb.company_id IS NULL OR wb.company_id IN (${companyIds.map(() => '?').join(',')}))`, values: companyIds }
    : { sql: ' AND wb.company_id IS NULL', values: [] as string[] };
  const rows = await env.DB.prepare(`
    SELECT wb.id,wb.company_id AS companyId,c.name AS companyName,wb.broadcast_type AS broadcastType,
      wb.title,wb.message,wb.severity,wb.audience_type AS audienceType,wb.audience_json AS audienceJson,
      wb.push_notification AS pushNotification,wb.acknowledgement_required AS acknowledgementRequired,
      wb.ai_generated AS aiGenerated,wb.status,wb.scheduled_for AS scheduledFor,wb.expires_at AS expiresAt,
      wb.published_at AS publishedAt,wb.created_at AS createdAt,e.display_name AS createdBy,
      (SELECT COUNT(*) FROM workforce_broadcast_recipients br WHERE br.broadcast_id=wb.id) AS recipientCount,
      (SELECT COUNT(*) FROM workforce_broadcast_recipients br WHERE br.broadcast_id=wb.id AND br.read_at IS NOT NULL) AS readCount,
      (SELECT COUNT(*) FROM workforce_broadcast_recipients br WHERE br.broadcast_id=wb.id AND br.acknowledged_at IS NOT NULL) AS acknowledgedCount
    FROM workforce_broadcasts wb LEFT JOIN companies c ON c.id=wb.company_id LEFT JOIN employees e ON e.id=wb.created_by
    WHERE (?='' OR wb.status=?)${scope.sql} ORDER BY wb.created_at DESC LIMIT 200
  `).bind(status, status, ...scope.values).all<Record<string, unknown>>();
  return json({ broadcasts: rows.results || [] });
}

async function generateDailyWord(request: Request, env: BroadcastEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Broadcast permission is required.' }, 403);
  let body: { companyId?: string; tone?: string; focus?: string };
  try { body = await request.json(); } catch { body = {}; }
  if (!canUseCompany(context, body.companyId)) return json({ error: 'You cannot target a company outside your assignment.' }, 403);
  const company = body.companyId ? await env.DB.prepare('SELECT name FROM companies WHERE id=?').bind(body.companyId).first<{ name: string }>() : null;
  const target = company?.name || 'all Daenem Group employees';
  const prompt = `Write one short professional daily encouragement for ${target} in Nigeria. Tone: ${body.tone || 'warm, disciplined and positive'}. Focus: ${body.focus || 'excellent work, accountability, teamwork and customer service'}. Keep it 45-80 words. Do not use clichés about suffering. Do not claim any specific event happened. Output only the message.`;
  const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'system', content: 'You write concise internal workplace communications for Daenem Group in Nigeria. Keep messages professional, respectful and practical.' }, { role: 'user', content: prompt }], max_tokens: 180,
  }) as { response?: string };
  const message = String(result.response || '').trim();
  if (!message) return json({ error: 'AI did not return a Daily Word draft.' }, 502);
  const id = uid('broadcast');
  const expiresAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO workforce_broadcasts(id,company_id,broadcast_type,title,message,severity,audience_type,audience_json,
        push_notification,acknowledgement_required,ai_generated,status,expires_at,created_by)
      VALUES(?,?,'daily_word','Daily Word',?,'information',?,?,0,0,1,'pending_approval',?,?)
    `).bind(id, body.companyId || null, message, body.companyId ? 'company' : 'group', JSON.stringify(body.companyId ? { type: 'company', companyId: body.companyId } : { type: 'group' }), expiresAt, context.employee.id),
    env.DB.prepare(`INSERT INTO ai_activity_logs(id,employee_id,company_id,feature,prompt_category,input_redacted,output_redacted) VALUES(?,?,?,'broadcast','daily_word',?,?)`)
      .bind(uid('ai'), context.employee.id, body.companyId || null, prompt.slice(0, 500), message.slice(0, 1000)),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'broadcasts','ai_daily_word_draft','workforce_broadcast',?,?,'ai')`)
      .bind(uid('audit'), context.employee.id, body.companyId || null, id, JSON.stringify({ status: 'pending_approval', aiGenerated: true })),
  ]);
  return json({ draft: { id, title: 'Daily Word', message, status: 'pending_approval', expiresAt, approvalRequired: true } });
}

async function create(request: Request, env: BroadcastEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Broadcast permission is required.' }, 403);
  let body: { broadcastType?: string; title?: string; message?: string; severity?: string; audience?: Audience; pushNotification?: boolean; acknowledgementRequired?: boolean; scheduledFor?: string; expiresAt?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid broadcast request.' }, 400); }
  const title = String(body.title || '').trim();
  const message = String(body.message || '').trim();
  if (!title || !message) return json({ error: 'Title and message are required.' }, 400);
  const audienceError = await validateAudience(env, context, body.audience);
  if (audienceError) return json({ error: audienceError }, 400);

  let type = String(body.broadcastType || 'notice');
  let severity = String(body.severity || 'information');
  if (!['notice', 'daily_word', 'important', 'urgent', 'emergency'].includes(type) || !['information', 'important', 'urgent', 'emergency'].includes(severity)) {
    return json({ error: 'Invalid broadcast type or severity.' }, 400);
  }
  const emergency = type === 'emergency' || severity === 'emergency';
  if (emergency) { type = 'emergency'; severity = 'emergency'; }
  const now = new Date();
  const scheduled = parseDate(body.scheduledFor);
  if (body.scheduledFor && !scheduled) return json({ error: 'Scheduled time is invalid.' }, 400);
  if (scheduled && scheduled.getTime() <= now.getTime()) return json({ error: 'Scheduled time must be in the future.' }, 400);
  const defaultExpiryDays = await settingNumber(env, 'broadcast.default_expiry_days', 30);
  const expiryBase = scheduled?.getTime() || now.getTime();
  const expires = body.expiresAt ? parseDate(body.expiresAt) : new Date(expiryBase + defaultExpiryDays * 86_400_000);
  if (!expires) return json({ error: 'Expiry time is invalid.' }, 400);
  if (expires.getTime() <= expiryBase) return json({ error: 'Expiry must be later than the scheduled time.' }, 400);

  const id = uid('broadcast');
  const approvalRequired = type === 'daily_word' || emergency || !can(context, 'approve');
  const status = approvalRequired ? 'pending_approval' : 'approved';
  const pushNotification = emergency || Boolean(body.pushNotification);
  const acknowledgementRequired = emergency || Boolean(body.acknowledgementRequired);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO workforce_broadcasts(id,company_id,broadcast_type,title,message,severity,audience_type,audience_json,
        push_notification,acknowledgement_required,ai_generated,status,scheduled_for,expires_at,created_by,approved_by,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)
    `).bind(id, body.audience?.companyId || null, type, title, message, severity, body.audience?.type, JSON.stringify(body.audience), pushNotification ? 1 : 0, acknowledgementRequired ? 1 : 0, status, scheduled?.toISOString() || null, expires.toISOString(), context.employee.id, status === 'approved' ? context.employee.id : null, status === 'approved' ? now.toISOString() : null),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'broadcasts','create','workforce_broadcast',?,?,'web')`)
      .bind(uid('audit'), context.employee.id, body.audience?.companyId || null, id, JSON.stringify({ status, audience: body.audience, scheduledFor: scheduled?.toISOString() || null, expiresAt: expires.toISOString(), emergencyDefaultsApplied: emergency })),
  ]);
  return json({ ok: true, broadcast: { id, status, scheduledFor: scheduled?.toISOString() || null, expiresAt: expires.toISOString(), approvalRequired } }, 201);
}

async function approve(request: Request, env: BroadcastEnv, context: SessionContext) {
  if (!can(context, 'approve')) return json({ error: 'Approve Broadcast permission is required.' }, 403);
  let body: { broadcastId?: string; decision?: 'approve' | 'reject'; note?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid approval request.' }, 400); }
  if (!body.broadcastId || !['approve', 'reject'].includes(String(body.decision))) return json({ error: 'Broadcast and decision are required.' }, 400);
  const current = await env.DB.prepare(`SELECT id,status,company_id AS companyId,expires_at AS expiresAt FROM workforce_broadcasts WHERE id=?`)
    .bind(body.broadcastId).first<{ id: string; status: string; companyId?: string; expiresAt?: string }>();
  if (!current) return json({ error: 'Broadcast not found.' }, 404);
  if (!canUseCompany(context, current.companyId)) return json({ error: 'This broadcast is outside your company assignment.' }, 403);
  if (!['draft', 'pending_approval'].includes(current.status)) return json({ error: 'This broadcast is not awaiting approval.' }, 409);
  if (body.decision === 'approve' && current.expiresAt && new Date(current.expiresAt).getTime() <= Date.now()) return json({ error: 'This broadcast has already expired.' }, 409);
  const status = body.decision === 'approve' ? 'approved' : 'rejected';
  await env.DB.batch([
    env.DB.prepare(`UPDATE workforce_broadcasts SET status=?,approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status, context.employee.id, current.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source) VALUES(?,?,?,'broadcasts','approval','workforce_broadcast',?,?,?,'web')`)
      .bind(uid('audit'), context.employee.id, current.companyId || null, current.id, JSON.stringify({ status: current.status }), JSON.stringify({ status, note: body.note || null })),
  ]);
  return json({ ok: true, status });
}

async function publish(request: Request, env: BroadcastEnv, context: SessionContext) {
  if (!can(context, 'approve')) return json({ error: 'Approve Broadcast permission is required to publish.' }, 403);
  let body: { broadcastId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid publish request.' }, 400); }
  const scope = await env.DB.prepare('SELECT company_id AS companyId FROM workforce_broadcasts WHERE id=?').bind(body.broadcastId || '').first<{ companyId?: string }>();
  if (!scope) return json({ error: 'Broadcast not found.' }, 404);
  if (!canUseCompany(context, scope.companyId)) return json({ error: 'This broadcast is outside your company assignment.' }, 403);
  const result = await deliverBroadcast(env, body.broadcastId || '', context.employee.id, 'web');
  if ('error' in result) return json({ error: result.error }, typeof result.status === 'number' ? result.status : 409);
  return json({ ...result, note: result.pushQueued ? 'Push notifications were queued; delivery requires an enrolled browser or Android push endpoint.' : 'Published in-app without push.' });
}

async function mine(env: BroadcastEnv, context: SessionContext) {
  const rows = await env.DB.prepare(`
    SELECT wb.id,wb.broadcast_type AS broadcastType,wb.title,wb.message,wb.severity,
      wb.acknowledgement_required AS acknowledgementRequired,wb.published_at AS publishedAt,
      wb.expires_at AS expiresAt,br.read_at AS readAt,br.acknowledged_at AS acknowledgedAt
    FROM workforce_broadcast_recipients br JOIN workforce_broadcasts wb ON wb.id=br.broadcast_id
    WHERE br.employee_id=? AND wb.status='published' AND (wb.expires_at IS NULL OR datetime(wb.expires_at)>datetime('now'))
    ORDER BY wb.published_at DESC LIMIT 100
  `).bind(context.employee.id).all<Record<string, unknown>>();
  return json({ broadcasts: rows.results || [], cachedAt: new Date().toISOString() });
}

async function markRead(request: Request, env: BroadcastEnv, context: SessionContext) {
  let body: { broadcastId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid read receipt request.' }, 400); }
  if (!body.broadcastId) return json({ error: 'Broadcast is required.' }, 400);
  const result = await env.DB.prepare(`UPDATE workforce_broadcast_recipients SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE broadcast_id=? AND employee_id=?`)
    .bind(body.broadcastId, context.employee.id).run();
  if (!result.meta.changes) return json({ error: 'Broadcast is not assigned to this employee.' }, 404);
  return json({ ok: true });
}

async function acknowledge(request: Request, env: BroadcastEnv, context: SessionContext) {
  let body: { broadcastId?: string; note?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid acknowledgement request.' }, 400); }
  if (!body.broadcastId) return json({ error: 'Broadcast is required.' }, 400);
  const result = await env.DB.prepare(`
    UPDATE workforce_broadcast_recipients SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP),
      acknowledged_at=CURRENT_TIMESTAMP,acknowledgement_note=? WHERE broadcast_id=? AND employee_id=?
  `).bind(body.note || null, body.broadcastId, context.employee.id).run();
  if (!result.meta.changes) return json({ error: 'Broadcast is not assigned to this employee.' }, 404);
  return json({ ok: true });
}

export async function dispatchDueBroadcasts(env: BroadcastEnv) {
  const due = await env.DB.prepare(`
    SELECT id FROM workforce_broadcasts WHERE status='approved' AND scheduled_for IS NOT NULL
      AND datetime(scheduled_for)<=datetime('now') AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))
    ORDER BY scheduled_for LIMIT 50
  `).all<{ id: string }>();
  let published = 0;
  let failed = 0;
  for (const broadcast of due.results || []) {
    const result = await deliverBroadcast(env, broadcast.id, null, 'scheduler');
    if ('error' in result) failed += 1; else published += 1;
  }
  await env.DB.prepare(`UPDATE workforce_broadcasts SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE status='approved' AND expires_at IS NOT NULL AND datetime(expires_at)<=datetime('now')`).run();
  return { due: due.results?.length || 0, published, failed };
}

export async function routeBroadcasts(request: Request, env: BroadcastEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/broadcasts' && request.method === 'GET') return list(request, env, context);
  if (url.pathname === '/api/broadcasts' && request.method === 'POST') return create(request, env, context);
  if (url.pathname === '/api/broadcasts/ai-daily-word' && request.method === 'POST') return generateDailyWord(request, env, context);
  if (url.pathname === '/api/broadcasts/approve' && request.method === 'POST') return approve(request, env, context);
  if (url.pathname === '/api/broadcasts/publish' && request.method === 'POST') return publish(request, env, context);
  if (url.pathname === '/api/broadcasts/mine' && request.method === 'GET') return mine(env, context);
  if (url.pathname === '/api/broadcasts/read' && request.method === 'POST') return markRead(request, env, context);
  if (url.pathname === '/api/broadcasts/acknowledge' && request.method === 'POST') return acknowledge(request, env, context);
  return null;
}
