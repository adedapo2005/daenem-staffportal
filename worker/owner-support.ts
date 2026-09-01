import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';

interface Env extends AuthEnv {}
type CommandAction = 'refresh_permissions' | 'clear_portal_cache' | 'reset_layout' | 'reset_theme' | 'force_reload' | 'rebuild_workspace';
const commandActions: CommandAction[] = ['refresh_permissions','clear_portal_cache','reset_layout','reset_theme','force_reload','rebuild_workspace'];
const levels: AccessLevel[] = ['none','view','create','edit','approve','manage'];
const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const isOwner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');

function assignedCompany(context: SessionContext, companyId: string) {
  return isOwner(context) || context.companies.some((company) => company.id === companyId);
}

function canView(context: SessionContext, companyId: string) {
  return assignedCompany(context, companyId) && (isOwner(context) || hasPermission(context, 'support.access', 'view', companyId));
}

function canManage(context: SessionContext, companyId: string) {
  return assignedCompany(context, companyId) && (isOwner(context) || hasPermission(context, 'support.manage', 'manage', companyId));
}

async function targetInCompany(env: Env, employeeId: string, companyId: string) {
  return env.DB.prepare(`SELECT e.id,e.display_name AS displayName FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id WHERE e.id=? AND m.company_id=? AND m.active=1 LIMIT 1`).bind(employeeId, companyId).first<{ id: string; displayName: string }>();
}

async function writeAudit(env: Env, context: SessionContext, companyId: string, action: string, targetId: string, after: Record<string, unknown>, reason?: string) {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,reason,source) VALUES(?,?,?,'user_support',?,'employee',?,?,?,'web')`).bind(uid('audit'), context.employee.id, companyId, action, targetId, JSON.stringify(after), reason || null),
    env.DB.prepare(`INSERT INTO security_logs(id,employee_id,company_id,session_id,event_type,severity,result,details_json) VALUES(?,?,?,?,?,'info','recorded',?)`).bind(uid('security'), context.employee.id, companyId, context.sessionId, `support_${action}`, JSON.stringify({ targetEmployeeId: targetId, ...after, reason: reason || null })),
  ]);
}

async function adminOverview(request: Request, env: Env, context: SessionContext) {
  const companyId = new URL(request.url).searchParams.get('companyId') || context.companies[0]?.id || '';
  if (!companyId || !canView(context, companyId)) return json({ error: 'User Support access is not assigned for this business.' }, 403);
  const company = await env.DB.prepare(`SELECT id,code,name FROM companies WHERE id=? AND active=1`).bind(companyId).first<Record<string, unknown>>();
  if (!company) return json({ error: 'Business not found.' }, 404);
  const employees = await env.DB.prepare(`
    SELECT e.id,e.employee_no AS employeeNo,e.display_name AS displayName,e.email,e.phone,e.job_title AS jobTitle,e.department,e.employment_status AS status,
      COUNT(DISTINCT CASE WHEN s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now') THEN s.id END) AS activeSessions,
      MAX(s.last_seen_at) AS lastSeenAt,
      MAX(CASE WHEN ps.status IN ('awaiting_consent','approved','active') AND datetime(ps.expires_at)>datetime('now') THEN ps.status END) AS supportStatus
    FROM employee_company_memberships m
    JOIN employees e ON e.id=m.employee_id
    LEFT JOIN auth_sessions s ON s.employee_id=e.id
    LEFT JOIN portal_support_sessions ps ON ps.employee_id=e.id AND ps.company_id=m.company_id
    WHERE m.company_id=? AND m.active=1
    GROUP BY e.id ORDER BY e.display_name
  `).bind(companyId).all<Record<string, unknown>>();
  const pendingCommands = await env.DB.prepare(`SELECT COUNT(*) AS count FROM portal_user_commands WHERE company_id=? AND status='pending' AND datetime(expires_at)>datetime('now')`).bind(companyId).first<{ count: number }>();
  return json({ company, employees: employees.results || [], pendingCommands: Number(pendingCommands?.count || 0), consentRequired: true });
}

async function effectivePermissions(env: Env, employeeId: string, companyId: string) {
  const roleRows = await env.DB.prepare(`SELECT p.code,rp.access_level AS accessLevel FROM employee_roles er JOIN role_permissions rp ON rp.role_id=er.role_id JOIN permissions p ON p.id=rp.permission_id WHERE er.employee_id=? AND er.company_id=?`).bind(employeeId, companyId).all<{ code: string; accessLevel: AccessLevel }>();
  const result: Record<string, AccessLevel> = {};
  for (const row of roleRows.results || []) {
    const current = result[row.code] || 'none';
    if (levels.indexOf(row.accessLevel) > levels.indexOf(current)) result[row.code] = row.accessLevel;
  }
  const overrides = await env.DB.prepare(`SELECT p.code,o.access_level AS accessLevel FROM employee_permission_overrides_v2 o JOIN permissions p ON p.id=o.permission_id WHERE o.employee_id=? AND o.company_id=? AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))`).bind(employeeId, companyId).all<{ code: string; accessLevel: AccessLevel }>();
  for (const row of overrides.results || []) result[row.code] = row.accessLevel;
  return result;
}

async function adminDetail(request: Request, env: Env, context: SessionContext) {
  const url = new URL(request.url), companyId = url.searchParams.get('companyId') || '', employeeId = url.searchParams.get('employeeId') || '';
  if (!companyId || !employeeId || !canView(context, companyId)) return json({ error: 'User Support access is not assigned for this business.' }, 403);
  const employee = await targetInCompany(env, employeeId, companyId);
  if (!employee) return json({ error: 'Employee is not assigned to this business.' }, 404);
  const [profile, memberships, roles, sessions, security, commands, support, permissions] = await Promise.all([
    env.DB.prepare(`SELECT id,employee_no AS employeeNo,display_name AS displayName,email,phone,job_title AS jobTitle,department,employment_status AS status,preferred_theme AS preferredTheme FROM employees WHERE id=?`).bind(employeeId).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT c.id,c.code,c.name,m.is_primary AS isPrimary,m.active,cl.name AS locationName FROM employee_company_memberships m JOIN companies c ON c.id=m.company_id LEFT JOIN company_locations cl ON cl.id=m.location_id WHERE m.employee_id=? ORDER BY m.is_primary DESC,c.name`).bind(employeeId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT r.id,r.name,r.code,er.company_id AS companyId FROM employee_roles er JOIN roles r ON r.id=er.role_id WHERE er.employee_id=? AND r.active=1 ORDER BY r.name`).bind(employeeId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,device_id AS deviceId,device_name AS deviceName,user_agent AS userAgent,ip_address AS ipAddress,created_at AS createdAt,last_seen_at AS lastSeenAt,expires_at AS expiresAt,revoked_at AS revokedAt FROM auth_sessions WHERE employee_id=? ORDER BY last_seen_at DESC LIMIT 20`).bind(employeeId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,occurred_at AS occurredAt,event_type AS eventType,severity,result,device_name AS deviceName,location_label AS locationLabel,details_json AS detailsJson FROM security_logs WHERE employee_id=? AND (company_id=? OR company_id IS NULL) ORDER BY occurred_at DESC LIMIT 25`).bind(employeeId, companyId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,action,reason,status,requested_at AS requestedAt,expires_at AS expiresAt,acknowledged_at AS acknowledgedAt,result_note AS resultNote FROM portal_user_commands WHERE employee_id=? AND company_id=? ORDER BY requested_at DESC LIMIT 25`).bind(employeeId, companyId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT ps.id,ps.purpose,ps.access_mode AS accessMode,ps.status,ps.requested_at AS requestedAt,ps.expires_at AS expiresAt,ps.consented_at AS consentedAt,ps.started_at AS startedAt,ps.ended_at AS endedAt,e.display_name AS requestedByName FROM portal_support_sessions ps JOIN employees e ON e.id=ps.requested_by WHERE ps.employee_id=? AND ps.company_id=? ORDER BY ps.requested_at DESC LIMIT 15`).bind(employeeId, companyId).all<Record<string, unknown>>(),
    effectivePermissions(env, employeeId, companyId),
  ]);
  return json({ employee: profile, memberships: memberships.results || [], roles: roles.results || [], sessions: sessions.results || [], security: security.results || [], commands: commands.results || [], supportSessions: support.results || [], effectivePermissions: permissions });
}

async function sendCommand(request: Request, env: Env, context: SessionContext) {
  let body: { companyId?: string; employeeId?: string; sessionId?: string; action?: string; reason?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid support command.' }, 400); }
  const companyId = String(body.companyId || ''), employeeId = String(body.employeeId || ''), action = String(body.action || ''), reason = String(body.reason || '').trim();
  if (!companyId || !employeeId || !action || reason.length < 5) return json({ error: 'Business, employee, action and a clear reason are required.' }, 400);
  if (!canManage(context, companyId)) return json({ error: 'Manage User Support permission is required for this business.' }, 403);
  const employee = await targetInCompany(env, employeeId, companyId);
  if (!employee) return json({ error: 'Employee is not assigned to this business.' }, 404);
  if (action === 'revoke_session') {
    if (!body.sessionId) return json({ error: 'Choose the session to revoke.' }, 400);
    const result = await env.DB.prepare(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND employee_id=? AND revoked_at IS NULL`).bind(body.sessionId, employeeId).run();
    if (!result.meta.changes) return json({ error: 'The selected session is already closed or was not found.' }, 404);
    await writeAudit(env, context, companyId, action, employeeId, { sessionId: body.sessionId }, reason);
    return json({ ok: true, message: `${employee.displayName}'s selected session was revoked.` });
  }
  if (action === 'revoke_all_sessions') {
    await env.DB.prepare(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL`).bind(employeeId).run();
    await writeAudit(env, context, companyId, action, employeeId, {}, reason);
    return json({ ok: true, message: `${employee.displayName} was signed out of all Staff Portal sessions.` });
  }
  if (!commandActions.includes(action as CommandAction)) return json({ error: 'Choose a valid Staff Portal support action.' }, 400);
  const id = uid('user-command');
  await env.DB.prepare(`INSERT INTO portal_user_commands(id,employee_id,company_id,action,reason,requested_by) VALUES(?,?,?,?,?,?)`).bind(id, employeeId, companyId, action, reason, context.employee.id).run();
  await writeAudit(env, context, companyId, 'send_command', employeeId, { commandId: id, action }, reason);
  return json({ ok: true, id, message: `${employee.displayName} will receive the command when the Staff Portal is active.` }, 201);
}

async function requestAssistance(request: Request, env: Env, context: SessionContext) {
  let body: { companyId?: string; employeeId?: string; purpose?: string; accessMode?: 'read_only' | 'guided' };
  try { body = await request.json(); } catch { return json({ error: 'Invalid assistance request.' }, 400); }
  const companyId = String(body.companyId || ''), employeeId = String(body.employeeId || ''), purpose = String(body.purpose || '').trim(), accessMode = body.accessMode === 'guided' ? 'guided' : 'read_only';
  if (!companyId || !employeeId || purpose.length < 8) return json({ error: 'Employee and a clear support purpose are required.' }, 400);
  if (!canManage(context, companyId)) return json({ error: 'Manage User Support permission is required for this business.' }, 403);
  const employee = await targetInCompany(env, employeeId, companyId);
  if (!employee) return json({ error: 'Employee is not assigned to this business.' }, 404);
  await env.DB.prepare(`UPDATE portal_support_sessions SET status='expired' WHERE employee_id=? AND status='awaiting_consent' AND datetime(expires_at)<=datetime('now')`).bind(employeeId).run();
  const existing = await env.DB.prepare(`SELECT id FROM portal_support_sessions WHERE employee_id=? AND company_id=? AND status IN ('awaiting_consent','approved','active') AND datetime(expires_at)>datetime('now') LIMIT 1`).bind(employeeId, companyId).first();
  if (existing) return json({ error: 'An active or pending support request already exists for this employee.' }, 409);
  const id = uid('support-session');
  await env.DB.prepare(`INSERT INTO portal_support_sessions(id,employee_id,company_id,requested_by,purpose,access_mode) VALUES(?,?,?,?,?,?)`).bind(id, employeeId, companyId, context.employee.id, purpose, accessMode).run();
  await writeAudit(env, context, companyId, 'request_assistance', employeeId, { supportSessionId: id, accessMode, consentRequired: true }, purpose);
  return json({ ok: true, id, message: `Consent request sent to ${employee.displayName}. It expires in 30 minutes.` }, 201);
}

async function endAssistance(request: Request, env: Env, context: SessionContext) {
  let body: { companyId?: string; supportSessionId?: string; reason?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid end-session request.' }, 400); }
  const companyId = String(body.companyId || ''), id = String(body.supportSessionId || ''), reason = String(body.reason || 'Support session ended by administrator').trim();
  if (!canManage(context, companyId)) return json({ error: 'Manage User Support permission is required.' }, 403);
  const row = await env.DB.prepare(`SELECT employee_id AS employeeId FROM portal_support_sessions WHERE id=? AND company_id=?`).bind(id, companyId).first<{ employeeId: string }>();
  if (!row) return json({ error: 'Support session not found.' }, 404);
  await env.DB.prepare(`UPDATE portal_support_sessions SET status='ended',ended_at=CURRENT_TIMESTAMP,ended_by=?,end_reason=? WHERE id=? AND status NOT IN ('ended','declined','expired')`).bind(context.employee.id, reason, id).run();
  await writeAudit(env, context, companyId, 'end_assistance', row.employeeId, { supportSessionId: id }, reason);
  return json({ ok: true, message: 'Support session ended.' });
}

async function mine(env: Env, context: SessionContext) {
  const [commands, assistance] = await Promise.all([
    env.DB.prepare(`SELECT id,action,reason,requested_at AS requestedAt,expires_at AS expiresAt FROM portal_user_commands WHERE employee_id=? AND status='pending' AND datetime(expires_at)>datetime('now') ORDER BY requested_at LIMIT 5`).bind(context.employee.id).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT ps.id,ps.purpose,ps.access_mode AS accessMode,ps.requested_at AS requestedAt,ps.expires_at AS expiresAt,e.display_name AS requestedByName,c.name AS companyName FROM portal_support_sessions ps JOIN employees e ON e.id=ps.requested_by JOIN companies c ON c.id=ps.company_id WHERE ps.employee_id=? AND ps.status='awaiting_consent' AND datetime(ps.expires_at)>datetime('now') ORDER BY ps.requested_at LIMIT 3`).bind(context.employee.id).all<Record<string, unknown>>(),
  ]);
  return json({ commands: commands.results || [], assistanceRequests: assistance.results || [] });
}

async function acknowledge(request: Request, env: Env, context: SessionContext) {
  let body: { commandId?: string; ok?: boolean; resultNote?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid acknowledgement.' }, 400); }
  const result = await env.DB.prepare(`UPDATE portal_user_commands SET status=?,acknowledged_at=CURRENT_TIMESTAMP,result_note=? WHERE id=? AND employee_id=? AND status='pending'`).bind(body.ok === false ? 'failed' : 'acknowledged', String(body.resultNote || '').slice(0, 500) || null, body.commandId || '', context.employee.id).run();
  return result.meta.changes ? json({ ok: true }) : json({ error: 'Pending command not found.' }, 404);
}

async function respondToAssistance(request: Request, env: Env, context: SessionContext) {
  let body: { supportSessionId?: string; decision?: 'approve' | 'decline' };
  try { body = await request.json(); } catch { return json({ error: 'Invalid support response.' }, 400); }
  const decision = body.decision === 'approve' ? 'approved' : body.decision === 'decline' ? 'declined' : '';
  if (!decision) return json({ error: 'Choose Approve or Decline.' }, 400);
  const row = await env.DB.prepare(`SELECT id,company_id AS companyId,requested_by AS requestedBy FROM portal_support_sessions WHERE id=? AND employee_id=? AND status='awaiting_consent' AND datetime(expires_at)>datetime('now')`).bind(body.supportSessionId || '', context.employee.id).first<{ id: string; companyId: string; requestedBy: string }>();
  if (!row) return json({ error: 'The support request expired or was already answered.' }, 404);
  await env.DB.batch([
    env.DB.prepare(`UPDATE portal_support_sessions SET status=?,consented_at=CURRENT_TIMESTAMP,started_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?`).bind(decision, decision, row.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'user_support','employee_consent','support_session',?,?,'web')`).bind(uid('audit'), context.employee.id, row.companyId, row.id, JSON.stringify({ decision })),
  ]);
  return json({ ok: true, decision, message: decision === 'approved' ? 'Support access approved for this time-limited request.' : 'Support request declined.' });
}

export async function routeOwnerSupport(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === '/api/support/admin/overview' && request.method === 'GET') return adminOverview(request, env, context);
  if (path === '/api/support/admin/detail' && request.method === 'GET') return adminDetail(request, env, context);
  if (path === '/api/support/admin/command' && request.method === 'POST') return sendCommand(request, env, context);
  if (path === '/api/support/admin/assistance' && request.method === 'POST') return requestAssistance(request, env, context);
  if (path === '/api/support/admin/assistance/end' && request.method === 'POST') return endAssistance(request, env, context);
  if (path === '/api/support/mine' && request.method === 'GET') return mine(env, context);
  if (path === '/api/support/command/ack' && request.method === 'POST') return acknowledge(request, env, context);
  if (path === '/api/support/assistance/respond' && request.method === 'POST') return respondToAssistance(request, env, context);
  return null;
}
