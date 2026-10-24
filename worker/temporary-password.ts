import { clearSessionCookie, getSessionContext, hasPermission, type SessionContext } from './auth';
import type { PasswordAuthEnv } from './password-auth';
import {
  WORKER_SAFE_PASSWORD_ITERATIONS,
  derivePasswordHash,
  generateTemporaryPassword,
  permanentPasswordErrors,
  randomSaltHex,
} from './credential-security';

interface Env extends PasswordAuthEnv {}

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function json(body: Record<string, unknown> | unknown[], status = 200, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  h.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: h });
}

async function setting(env: Env, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?')
    .bind(key).first<{ setting_value: string }>();
  return row?.setting_value ?? fallback;
}

async function audit(
  env: Env,
  actorEmployeeId: string | null,
  action: string,
  employeeId: string,
  details: Record<string, unknown>,
) {
  await env.DB.prepare(`
    INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
    VALUES(?,?,'users',?,'employee',?,?,'web')
  `).bind(uid('audit'), actorEmployeeId, action, employeeId, JSON.stringify(details)).run().catch(() => undefined);
}

async function security(
  env: Env,
  request: Request,
  employeeId: string,
  eventType: string,
  result: string,
  details: Record<string, unknown>,
  sessionId?: string,
) {
  await env.DB.prepare(`
    INSERT INTO security_logs(id,employee_id,session_id,event_type,severity,result,ip_address,user_agent,details_json)
    VALUES(?,?,?,?,'high',?,?,?,?)
  `).bind(
    uid('security'),
    employeeId,
    sessionId || null,
    eventType,
    result,
    request.headers.get('cf-connecting-ip') || null,
    request.headers.get('user-agent'),
    JSON.stringify(details),
  ).run().catch(() => undefined);
}

type PendingTemp = {
  id: string;
  employeeId: string;
  username: string;
  issuedAt: string;
  expiresAt: string;
  firstUsedAt?: string;
  deliveryMethod: string;
  deliveryStatus: string;
};

async function latestPending(env: Env, employeeId: string) {
  return env.DB.prepare(`
    SELECT id,employee_id AS employeeId,credential_username AS username,issued_at AS issuedAt,
           expires_at AS expiresAt,first_used_at AS firstUsedAt,delivery_method AS deliveryMethod,
           delivery_status AS deliveryStatus
    FROM employee_temporary_passwords
    WHERE employee_id=? AND replaced_at IS NULL AND revoked_at IS NULL
    ORDER BY issued_at DESC LIMIT 1
  `).bind(employeeId).first<PendingTemp>();
}

function expired(row: PendingTemp) {
  return new Date(row.expiresAt).getTime() <= Date.now();
}

function normalizeUsernameBase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 28) || 'employee';
}

async function chooseUsername(env: Env, employeeId: string, displayName: string, email?: string) {
  const current = await env.DB.prepare('SELECT username FROM employee_credentials WHERE employee_id=? LIMIT 1')
    .bind(employeeId).first<{ username: string }>();
  if (current?.username) return current.username;
  const pending = await env.DB.prepare(`
    SELECT preferred_username AS username FROM employee_login_access_requests
    WHERE employee_id=? AND status='ready' ORDER BY requested_at DESC LIMIT 1
  `).bind(employeeId).first<{ username?: string }>();
  const base = normalizeUsernameBase(pending?.username || email?.split('@')[0] || displayName);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 27)}${attempt}`;
    const collision = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE lower(username)=lower(?) AND employee_id<>? LIMIT 1')
      .bind(candidate, employeeId).first<{ employee_id: string }>();
    if (!collision) return candidate;
  }
  return `employee.${crypto.randomUUID().slice(0, 8)}`;
}

type DerivedCredential = { salt: string; hash: string; iterations: number };

// Slow PBKDF2 derivation, kept separate from the write so callers can re-authorize in between.
async function deriveCredential(env: Env, password: string): Promise<DerivedCredential> {
  const configured = Number(await setting(env, 'security.worker_safe_pbkdf2_iterations', String(WORKER_SAFE_PASSWORD_ITERATIONS)));
  const iterations = Number.isFinite(configured) && configured >= 1000 ? Math.min(configured, 20000) : WORKER_SAFE_PASSWORD_ITERATIONS;
  const salt = randomSaltHex();
  return { salt, hash: await derivePasswordHash(env, password, salt, iterations), iterations };
}

async function saveCredential(env: Env, employeeId: string, username: string, password: string, derived?: DerivedCredential) {
  const { salt, hash, iterations } = derived || await deriveCredential(env, password);
  const existing = await env.DB.prepare('SELECT employee_id FROM employee_credentials WHERE employee_id=? LIMIT 1')
    .bind(employeeId).first<{ employee_id: string }>();
  if (existing) {
    await env.DB.prepare(`
      UPDATE employee_credentials SET username=?,password_hash=?,password_salt=?,password_algorithm='PBKDF2-SHA256',
        password_iterations=?,password_changed_at=CURRENT_TIMESTAMP,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE employee_id=?
    `).bind(username, hash, salt, iterations, employeeId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO employee_credentials(
        employee_id,username,password_hash,password_salt,password_algorithm,password_iterations,
        email_verified_at,password_changed_at,failed_attempts,locked_until
      ) VALUES(?,?,?,?,'PBKDF2-SHA256',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)
    `).bind(employeeId, username, hash, salt, iterations).run();
  }
  return { iterations };
}

async function sendTemporaryPasswordEmail(env: Env, employee: { email?: string; displayName: string }, username: string, password: string, expiresAt: string) {
  if (!employee.email || !env.EMAIL || typeof env.EMAIL.send !== 'function') return false;
  const from = env.WORKFORCE_EMAIL_FROM || 'portal@daenem.com';
  const expiry = new Date(expiresAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
  await env.EMAIL.send({
    from,
    to: employee.email,
    subject: 'Your temporary Daenem Staff Portal password',
    text: `Hello ${employee.displayName},\n\nManagement issued a temporary password for your Daenem Staff Portal account.\n\nUsername: ${username}\nTemporary password: ${password}\nExpires: ${expiry} WAT\n\nSign in at staffportal.daenem.com. You will be required to create a private password immediately. The temporary password stops working after you replace it.\n\nIf you did not request help accessing your account, contact your manager or system administrator.`,
    html: `<p>Hello ${employee.displayName},</p><p>Management issued a temporary password for your Daenem Staff Portal account.</p><p><strong>Username:</strong> ${username}<br><strong>Temporary password:</strong> ${password}<br><strong>Expires:</strong> ${expiry} WAT</p><p>Sign in at <strong>staffportal.daenem.com</strong>. You will be required to create a private password immediately. The temporary password stops working after you replace it.</p><p>If you did not request help accessing your account, contact your manager or system administrator.</p>`,
  });
  return true;
}

const MANAGE_EMPLOYEES_PERMISSION = 'users.access';
const NEUTRAL_TARGET_ERROR = 'Employee account not found or is not active.';

// Session roles only contain an active, group-level Owner role (see sessionContextFromId in ./auth).
function isGroupOwner(context: SessionContext) {
  return context.roles.some((role) => role.code === 'owner');
}

// Companies where the actor currently holds Manage Employees. A grant in one company never
// authorizes temporary-password administration for employees who only belong to another company.
function managedCompanyIds(context: SessionContext) {
  return context.companies
    .filter((company) => hasPermission(context, MANAGE_EMPLOYEES_PERMISSION, 'manage', company.id))
    .map((company) => company.id);
}

function canAdministerTemporaryPasswords(context: SessionContext) {
  return isGroupOwner(context) || managedCompanyIds(context).length > 0;
}

// Owner accounts may only be reset, revoked or listed by a group Owner.
const OWNER_TARGET_SQL = `EXISTS(
  SELECT 1 FROM employee_roles oer LEFT JOIN roles orole ON orole.id=oer.role_id
  WHERE oer.employee_id=e.id AND (oer.role_id='role-owner' OR orole.code='owner')
)`;

// Delegated scope (deny-wins). An employee has ONE group-wide credential and one set of sessions, so a
// reset or revoke affects every company they work in. A delegate may therefore act only when the
// target has at least one active membership in an active company AND every such membership is in a
// company where the actor holds Manage Employees, and the target is not an Owner. Managing only some
// of a multi-company employee's companies is not enough; the group Owner (or a delegate who manages
// all of them) must act. Expects employees aliased as `e`.
function delegatedScopeSql(companyIds: string[]) {
  return `AND NOT ${OWNER_TARGET_SQL}
    AND EXISTS(
      SELECT 1 FROM employee_company_memberships sm JOIN companies sc ON sc.id=sm.company_id
      WHERE sm.employee_id=e.id AND sm.active=1 AND sc.active=1
    )
    AND NOT EXISTS(
      SELECT 1 FROM employee_company_memberships um JOIN companies uc ON uc.id=um.company_id
      WHERE um.employee_id=e.id AND um.active=1 AND uc.active=1
        AND um.company_id NOT IN (${companyIds.map(() => '?').join(',')})
    )`;
}

type TargetEmployee = { id: string; displayName: string; email?: string; status: string };

async function authorizedTarget(env: Env, context: SessionContext, employeeId: string, requireActiveEmployee: boolean) {
  if (!employeeId) return null;
  const owner = isGroupOwner(context);
  const companyIds = owner ? [] : managedCompanyIds(context);
  if (!owner && !companyIds.length) return null;
  const row = await env.DB.prepare(`
    SELECT e.id,e.display_name AS displayName,e.email,e.employment_status AS status
    FROM employees e
    WHERE e.id=?
      ${requireActiveEmployee ? "AND e.employment_status IN ('active','provisional')" : ''}
      ${owner ? '' : delegatedScopeSql(companyIds)}
    LIMIT 1
  `).bind(employeeId, ...companyIds).first<TargetEmployee>();
  return row || null;
}

// Neutral failure: an out-of-scope, Owner or unknown target is indistinguishable to the caller.
// The denial is recorded against the actor without credentials, tokens or employee details.
async function deniedTarget(env: Env, request: Request, context: SessionContext, action: 'issue' | 'revoke', employeeId: string) {
  await security(env, request, context.employee.id, 'temporary_password_admin_denied', 'denied', {
    action,
    targetEmployeeId: employeeId ? employeeId.slice(0, 120) : null,
  }, context.sessionId);
  return json({ error: NEUTRAL_TARGET_ERROR }, 404);
}

async function listIssued(env: Env, context: SessionContext) {
  if (!canAdministerTemporaryPasswords(context)) return json({ error: 'Manage Employees permission is required.' }, 403);
  const owner = isGroupOwner(context);
  const companyIds = owner ? [] : managedCompanyIds(context);
  const rows = await env.DB.prepare(`
    SELECT t.id,t.employee_id AS employeeId,e.display_name AS displayName,e.email,t.credential_username AS username,
           t.delivery_method AS deliveryMethod,t.delivery_status AS deliveryStatus,t.issued_at AS issuedAt,
           t.expires_at AS expiresAt,t.first_used_at AS firstUsedAt,t.replaced_at AS replacedAt,t.revoked_at AS revokedAt
    FROM employee_temporary_passwords t
    JOIN employees e ON e.id=t.employee_id
    WHERE t.replaced_at IS NULL AND t.revoked_at IS NULL
      ${owner ? '' : delegatedScopeSql(companyIds)}
    ORDER BY t.issued_at DESC LIMIT 250
  `).bind(...companyIds).all<Record<string, unknown>>();
  return json({ temporaryPasswords: rows.results || [] });
}

async function issue(request: Request, env: Env, context: SessionContext) {
  if (!canAdministerTemporaryPasswords(context)) return json({ error: 'Manage Employees permission is required.' }, 403);
  let body: { employeeId?: string; sendEmail?: boolean; reason?: string; expiresHours?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid temporary password request.' }, 400); }
  const employeeId = String(body.employeeId || '');
  // Authorize against the target's current company membership and Owner status before any
  // credential, session or temporary-access write.
  const employee = await authorizedTarget(env, context, employeeId, true);
  if (!employee) return deniedTarget(env, request, context, 'issue', employeeId);

  const username = await chooseUsername(env, employee.id, employee.displayName, employee.email);
  const password = generateTemporaryPassword(16);
  const defaultHours = Number(await setting(env, 'security.temporary_password_hours', '24')) || 24;
  const requestedHours = Number(body.expiresHours || defaultHours);
  const hours = Math.max(1, Math.min(72, Number.isFinite(requestedHours) ? requestedHours : defaultHours));
  const expiresAt = new Date(Date.now() + hours * 60 * 60_000).toISOString();
  const id = uid('temp-password');
  let phase = 'derive_credential';

  try {
    // Derive first (slow), then re-authorize from fresh grants immediately before the first write, so a
    // permission or membership withdrawn during derivation stops the reset with no credential,
    // session or temporary-access change.
    const derived = await deriveCredential(env, password);
    phase = 'reauthorize';
    const current = await getSessionContext(request, env);
    if (!current || current.employee.id !== context.employee.id || !canAdministerTemporaryPasswords(current)
      || !(await authorizedTarget(env, current, employee.id, true))) {
      return deniedTarget(env, request, context, 'issue', employee.id);
    }
    phase = 'write_credential';
    const saved = await saveCredential(env, employee.id, username, password, derived);
    phase = 'revoke_sessions';
    await env.DB.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL')
      .bind(employee.id).run();
    phase = 'record_temporary_access';
    await env.DB.prepare(`
      UPDATE employee_temporary_passwords SET revoked_at=CURRENT_TIMESTAMP,revoked_by=?
      WHERE employee_id=? AND replaced_at IS NULL AND revoked_at IS NULL
    `).bind(context.employee.id, employee.id).run();
    await env.DB.prepare(`
      INSERT INTO employee_temporary_passwords(
        id,employee_id,issued_by,credential_username,delivery_method,delivery_status,issued_reason,expires_at,metadata_json
      ) VALUES(?,?,?,?,?,'generated',?,?,?)
    `).bind(
      id,
      employee.id,
      context.employee.id,
      username,
      body.sendEmail ? 'email' : 'manual',
      String(body.reason || 'Password recovery assistance').slice(0, 300),
      expiresAt,
      JSON.stringify({ iterations: saved.iterations }),
    ).run();

    let delivered = false;
    if (body.sendEmail) {
      phase = 'email_delivery';
      try {
        delivered = await sendTemporaryPasswordEmail(env, employee, username, password, expiresAt);
        await env.DB.prepare(`UPDATE employee_temporary_passwords SET delivery_status=? WHERE id=?`)
          .bind(delivered ? 'sent' : 'failed', id).run();
      } catch {
        await env.DB.prepare(`UPDATE employee_temporary_passwords SET delivery_status='failed' WHERE id=?`).bind(id).run().catch(() => undefined);
      }
    }

    await audit(env, context.employee.id, 'issue_temporary_password', employee.id, {
      temporaryPasswordId: id,
      username,
      expiresAt,
      deliveryMethod: body.sendEmail ? 'email' : 'manual',
      delivered,
    });
    await security(env, request, employee.id, 'temporary_password_issued', 'success', {
      temporaryPasswordId: id,
      issuedBy: context.employee.id,
      expiresAt,
      deliveryMethod: body.sendEmail ? 'email' : 'manual',
      delivered,
    });

    return json({
      ok: true,
      temporaryPasswordId: id,
      employeeId: employee.id,
      displayName: employee.displayName,
      username,
      temporaryPassword: password,
      expiresAt,
      delivered,
      deliveryMethod: body.sendEmail ? 'email' : 'manual',
      message: delivered
        ? `Temporary password created and emailed to ${employee.displayName}. It is shown here only for this response.`
        : `Temporary password created for ${employee.displayName}. Copy it now; it will not be shown again.`,
    });
  } catch (error) {
    const reference = `TEMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await security(env, request, employee.id, 'temporary_password_issue_failed', 'failed', {
      reference,
      phase,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      issuedBy: context.employee.id,
    });
    return json({ error: 'Temporary password could not be created.', code: 'TEMP_PASSWORD_ISSUE_FAILED', reference }, 503);
  }
}

async function revoke(request: Request, env: Env, context: SessionContext) {
  if (!canAdministerTemporaryPasswords(context)) return json({ error: 'Manage Employees permission is required.' }, 403);
  let body: { employeeId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid revoke request.' }, 400); }
  const requestedEmployeeId = String(body.employeeId || '');
  if (!requestedEmployeeId) return json({ error: 'Employee is required.' }, 400);
  // Revocation also signs the employee out of every session, so it carries the same company and
  // Owner protections as issuance. Inactive employees remain revocable by an authorized manager.
  const target = await authorizedTarget(env, context, requestedEmployeeId, false);
  if (!target) return deniedTarget(env, request, context, 'revoke', requestedEmployeeId);
  const employeeId = target.id;
  await env.DB.prepare(`
    UPDATE employee_temporary_passwords SET revoked_at=CURRENT_TIMESTAMP,revoked_by=?
    WHERE employee_id=? AND replaced_at IS NULL AND revoked_at IS NULL
  `).bind(context.employee.id, employeeId).run();
  await env.DB.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL')
    .bind(employeeId).run();
  await audit(env, context.employee.id, 'revoke_temporary_password', employeeId, {});
  await security(env, request, employeeId, 'temporary_password_revoked', 'success', { revokedBy: context.employee.id });
  return json({ ok: true, message: 'Temporary password access revoked.' });
}

async function selfStatus(request: Request, env: Env) {
  const context = await getSessionContext(request, env);
  if (!context) return json({ authenticated: false, required: false }, 401);
  const pending = await latestPending(env, context.employee.id);
  if (!pending) return json({ authenticated: true, required: false });
  const isExpired = expired(pending);
  if (!isExpired && !pending.firstUsedAt) {
    await env.DB.prepare('UPDATE employee_temporary_passwords SET first_used_at=CURRENT_TIMESTAMP WHERE id=? AND first_used_at IS NULL')
      .bind(pending.id).run().catch(() => undefined);
  }
  return json({
    authenticated: true,
    required: true,
    expired: isExpired,
    username: pending.username,
    expiresAt: pending.expiresAt,
    displayName: context.employee.displayName,
    message: isExpired
      ? 'Your temporary password has expired. Ask an Owner/Admin to issue a new one.'
      : 'You signed in with a temporary password. Create your private password before using the portal.',
  });
}

async function selfChange(request: Request, env: Env) {
  const context = await getSessionContext(request, env);
  if (!context) return json({ error: 'Authentication is required.' }, 401);
  const pending = await latestPending(env, context.employee.id);
  if (!pending) return json({ error: 'A temporary password change is not currently required.' }, 409);
  if (expired(pending)) return json({ error: 'This temporary password has expired. Ask an Owner/Admin to issue another one.' }, 401);

  let body: { newPassword?: string; confirmPassword?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid password request.' }, 400); }
  const password = String(body.newPassword || '');
  const confirm = String(body.confirmPassword || '');
  if (password !== confirm) return json({ error: 'The two passwords do not match.' }, 400);
  const errors = permanentPasswordErrors(password);
  if (errors.length) return json({ error: 'Please choose a different private password.', passwordErrors: errors }, 400);

  let phase = 'derive_credential';
  try {
    await saveCredential(env, context.employee.id, pending.username, password);
    phase = 'complete_temporary_access';
    await env.DB.prepare(`
      UPDATE employee_temporary_passwords SET replaced_at=CURRENT_TIMESTAMP
      WHERE employee_id=? AND replaced_at IS NULL AND revoked_at IS NULL
    `).bind(context.employee.id).run();
    await env.DB.prepare('UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE employee_id=? AND revoked_at IS NULL')
      .bind(context.employee.id).run();
    await audit(env, context.employee.id, 'replace_temporary_password', context.employee.id, { temporaryPasswordId: pending.id });
    await security(env, request, context.employee.id, 'temporary_password_replaced', 'success', { temporaryPasswordId: pending.id }, context.sessionId);
    return json({
      ok: true,
      signedOut: true,
      username: pending.username,
      message: 'Your private password is active. Sign in again with your new password.',
    }, 200, { 'set-cookie': clearSessionCookie(request) });
  } catch (error) {
    const reference = `TEMP-CHANGE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await security(env, request, context.employee.id, 'temporary_password_change_failed', 'failed', {
      reference,
      phase,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      temporaryPasswordId: pending.id,
    }, context.sessionId);
    return json({ error: 'We could not save your private password. Your temporary access remains available so you can retry.', code: 'TEMP_PASSWORD_CHANGE_FAILED', reference }, 503);
  }
}

export async function temporaryPasswordLoginState(env: Env, employeeId: string) {
  const pending = await latestPending(env, employeeId);
  if (!pending) return { required: false, expired: false };
  return { required: true, expired: expired(pending), expiresAt: pending.expiresAt, id: pending.id };
}

export async function routeTemporaryPasswordAdmin(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/admin/login-access/temporary-password' && request.method === 'GET') return listIssued(env, context);
  if (url.pathname === '/api/admin/login-access/temporary-password' && request.method === 'POST') return issue(request, env, context);
  if (url.pathname === '/api/admin/login-access/temporary-password/revoke' && request.method === 'POST') return revoke(request, env, context);
  return null;
}

export async function routeTemporaryPasswordSelf(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/account/temporary-password/status' && request.method === 'GET') return selfStatus(request, env);
  if (url.pathname === '/api/account/temporary-password/change' && request.method === 'POST') return selfChange(request, env);
  return null;
}

export async function guardTemporaryPasswordChange(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  if ([
    '/api/auth/me',
    '/api/auth/logout',
    '/api/account/temporary-password/status',
    '/api/account/temporary-password/change',
    '/api/owner/temporary-password/status',
    '/api/owner/temporary-password/change',
  ].includes(url.pathname)) return null;
  const context = await getSessionContext(request, env);
  if (!context) return null;
  const pending = await latestPending(env, context.employee.id);
  if (!pending) return null;
  if (expired(pending)) {
    return json({ error: 'Your temporary password has expired. Ask an Owner/Admin to issue a new one.', code: 'TEMP_PASSWORD_EXPIRED' }, 423);
  }
  return json({ error: 'Create your private password before using the portal.', code: 'TEMP_PASSWORD_CHANGE_REQUIRED' }, 428);
}
