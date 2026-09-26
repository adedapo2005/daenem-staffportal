import {
  hasPermission,
  logSecurity,
  requestIp,
  requestLocationLabel,
  type AuthEnv,
  type SessionContext,
} from './auth';
import { routeOwnerSupport } from './owner-support';
import { submitForm } from './forms';
import { handleOfflineSpendOperation } from './spend';

interface OfflineEnv extends AuthEnv {
  FILES: R2Bucket;
  TIMEZONE?: string;
  APP_VERSION?: string;
}

type Policy = {
  enabled: boolean;
  maxOfflineAgeMinutes: number;
  maxQueueCount: number;
  attachmentMaxBytes: number;
  automaticSync: boolean;
  manualRetry: boolean;
  retentionDays: number;
  allowedOperations: string[];
};

type PolicyRow = {
  enabled: number;
  maxOfflineAgeMinutes: number;
  maxQueueCount: number;
  attachmentMaxBytes: number;
  automaticSync: number;
  manualRetry: number;
  retentionDays: number;
  allowedOperationsJson: string;
};

const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

const uid = (prefix: string) => prefix + '-' + crypto.randomUUID();
const businessTimezone = (env: OfflineEnv) => env.TIMEZONE || 'Africa/Lagos';
const owner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const defaultAllowedOperations = ['forms.submit', 'expense.draft.save', 'expense.request.submit'];
const operationKinds = new Set(defaultAllowedOperations);

function companyInScope(context: SessionContext, companyId: string) {
  return context.companies.some((company) => company.id === companyId);
}

function requestId(request: Request) {
  return request.headers.get('x-request-id') || request.headers.get('cf-ray') || undefined;
}

function safeText(value: unknown, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy.buffer;
}

function validId(value: unknown, max = 160) {
  const text = safeText(value, max);
  return Boolean(text) && /^[A-Za-z0-9:_-]+$/.test(text);
}

function parseIso(value: unknown) {
  const text = safeText(value, 80);
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? text : undefined;
}

function parseFinite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function readPolicy(env: OfflineEnv): Promise<Policy> {
  const row = await env.DB.prepare(`
    SELECT enabled,max_offline_age_minutes AS maxOfflineAgeMinutes,
      max_queue_count AS maxQueueCount,attachment_max_bytes AS attachmentMaxBytes,
      automatic_sync AS automaticSync,manual_retry AS manualRetry,
      retention_days AS retentionDays,allowed_operations_json AS allowedOperationsJson
    FROM offline_policy WHERE id='global'
  `).first<PolicyRow>();
  let allowedOperations: string[] = [...defaultAllowedOperations];
  try {
    const parsed = JSON.parse(row?.allowedOperationsJson || JSON.stringify(defaultAllowedOperations));
    if (Array.isArray(parsed)) allowedOperations = parsed.map(String).filter((item) => operationKinds.has(item));
  } catch {
    allowedOperations = [...defaultAllowedOperations];
  }
  return {
    enabled: row?.enabled !== 0,
    maxOfflineAgeMinutes: Math.max(5, Number(row?.maxOfflineAgeMinutes || 720)),
    maxQueueCount: Math.max(1, Number(row?.maxQueueCount || 50)),
    attachmentMaxBytes: Math.max(1024, Number(row?.attachmentMaxBytes || 10 * 1024 * 1024)),
    automaticSync: row?.automaticSync !== 0,
    manualRetry: row?.manualRetry !== 0,
    retentionDays: Math.max(1, Number(row?.retentionDays || 30)),
    allowedOperations,
  };
}

async function writeAudit(
  env: OfflineEnv,
  request: Request,
  context: SessionContext,
  action: string,
  entityType: string,
  entityId: string | undefined,
  details: Record<string, unknown>,
  companyId?: string,
  reason?: string,
) {
  const safeDetails = {
    employeeId: context.employee.id,
    companyId: companyId || safeText(details.companyId, 120) || undefined,
    sessionId: context.sessionId,
    deviceId: safeText(details.deviceId, 160) || undefined,
    operationId: safeText(details.operationId, 160) || undefined,
    idempotencyKey: safeText(details.idempotencyKey, 200) || undefined,
    operationKind: safeText(details.operationKind, 80) || undefined,
    outcome: safeText(details.outcome, 80) || undefined,
    errorCategory: safeText(details.errorCategory, 80) || undefined,
    attemptCount: typeof details.attemptCount === 'number' ? details.attemptCount : undefined,
    attachmentId: safeText(details.attachmentId, 160) || undefined,
    mimeType: safeText(details.mimeType, 80) || undefined,
    sizeBytes: typeof details.sizeBytes === 'number' ? details.sizeBytes : undefined,
    sha256: safeText(details.sha256, 80) || undefined,
    requestId: requestId(request),
    ipAddress: requestIp(request) || undefined,
    networkLocation: requestLocationLabel(request) || undefined,
    clientTimezone: safeText(details.clientTimezone, 80) || undefined,
    capturedAt: parseIso(details.capturedAt),
    serverReceivedAt: new Date().toISOString(),
    applicationVersion: safeText(details.applicationVersion || env.APP_VERSION, 80) || undefined,
  };
  await env.DB.prepare(`
    INSERT INTO audit_logs(
      id,actor_employee_id,company_id,module,action,entity_type,entity_id,
      after_json,reason,source,request_id
    ) VALUES(?,?,?,'offline_sync',?,?,?,?,?,'offline',?)
  `).bind(
    uid('audit'),
    context.employee.id,
    companyId || null,
    action,
    entityType,
    entityId || null,
    JSON.stringify(safeDetails),
    reason || null,
    requestId(request) || null,
  ).run();
}

async function sessionRecord(env: OfflineEnv, context: SessionContext) {
  return env.DB.prepare(`
    SELECT id,expires_at AS expiresAt,last_seen_at AS lastSeenAt,revoked_at AS revokedAt
    FROM auth_sessions WHERE id=? AND employee_id=?
  `).bind(context.sessionId, context.employee.id).first<{ id: string; expiresAt: string; lastSeenAt: string; revokedAt?: string }>();
}

function sessionRemainingMinutes(session: { expiresAt: string } | undefined) {
  if (!session) return 0;
  return Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 60_000));
}

async function bootstrap(request: Request, env: OfflineEnv, context: SessionContext) {
  const requestedCompany = safeText(new URL(request.url).searchParams.get('companyId'), 120);
  const companyId = requestedCompany || context.companies.find((company) => company.primary)?.id || context.companies[0]?.id || '';
  if (requestedCompany && !companyInScope(context, requestedCompany)) return json({ error: 'Company access is not assigned.' }, 403);
  const session = await sessionRecord(env, context);
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    await writeAudit(env, request, context, 'authentication_required', 'session', context.sessionId, { outcome: 'rejected' }, companyId);
    return json({ error: 'Sign in to continue syncing.', state: 'authentication-required' }, 401);
  }
  const policy = await readPolicy(env);
  const effectiveAge = Math.min(policy.maxOfflineAgeMinutes, sessionRemainingMinutes(session));
  const canSubmitForms = Boolean(companyId) && policy.enabled && policy.allowedOperations.includes('forms.submit') && hasPermission(context, 'forms.access', 'view', companyId);
  const canSubmitExpenses = Boolean(companyId) && policy.enabled
    && policy.allowedOperations.some((item) => item.startsWith('expense.'))
    && hasPermission(context, 'expense.requests', 'create', companyId);
  const allowedOperations = policy.allowedOperations.filter((item) => {
    if (item === 'forms.submit') return hasPermission(context, 'forms.access', 'view', companyId);
    if (item.startsWith('expense.')) return hasPermission(context, 'expense.requests', 'create', companyId);
    return false;
  });
  return json({
    ok: true,
    serverTime: new Date().toISOString(),
    businessTimezone: businessTimezone(env),
    maxOfflineAgeMinutes: effectiveAge,
    session: { id: session.id, expiresAt: session.expiresAt, lastVerifiedAt: new Date().toISOString() },
    employee: { id: context.employee.id },
    scope: { companyId, companyIds: context.companies.map((company) => company.id) },
    policy: {
      enabled: policy.enabled,
      maxQueueCount: policy.maxQueueCount,
      attachmentMaxBytes: policy.attachmentMaxBytes,
      automaticSync: policy.automaticSync,
      manualRetry: policy.manualRetry,
      retentionDays: policy.retentionDays,
      allowedOperations,
    },
    operations: [
      ...(canSubmitForms ? [{ kind: 'forms.submit', mode: 'draft-and-submit', permission: 'forms.access' }] : []),
      ...(canSubmitExpenses && policy.allowedOperations.includes('expense.draft.save')
        ? [{ kind: 'expense.draft.save', mode: 'draft-and-submit', permission: 'expense.requests' }]
        : []),
      ...(canSubmitExpenses && policy.allowedOperations.includes('expense.request.submit')
        ? [{ kind: 'expense.request.submit', mode: 'draft-and-submit', permission: 'expense.requests' }]
        : []),
    ],
  });
}
async function receiptByKey(env: OfflineEnv, idempotencyKey: string) {
  return env.DB.prepare(`
    SELECT id,operation_id AS operationId,idempotency_key AS idempotencyKey,
      employee_id AS employeeId,company_id AS companyId,session_id AS sessionId,
      operation_kind AS operationKind,entity_type AS entityType,entity_id AS entityId,
      state,attempt_count AS attemptCount,last_error_category AS lastErrorCategory,
      result_json AS resultJson,server_received_at AS serverReceivedAt,
      started_at AS startedAt,completed_at AS completedAt
    FROM offline_sync_receipts WHERE idempotency_key=?
  `).bind(idempotencyKey).first<Record<string, unknown>>();
}

function receiptBody(row: Record<string, unknown>, deduplicated = false) {
  let result: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(row.resultJson || '{}'));
    if (parsed && typeof parsed === 'object') result = parsed as Record<string, unknown>;
  } catch {
    result = {};
  }
  return {
    id: row.id,
    operationId: row.operationId,
    idempotencyKey: row.idempotencyKey,
    state: row.state === 'completed' ? 'synced' : row.state === 'conflict' ? 'needs-review' : row.state,
    serverReceivedAt: row.serverReceivedAt,
    completedAt: row.completedAt,
    submissionId: result.submissionId,
    requestId: result.requestId,
    status: result.status,
    deduplicated,
  };
}

async function updateReceipt(
  env: OfflineEnv,
  id: string,
  state: string,
  result: Record<string, unknown>,
  errorCategory?: string,
  entityId?: string,
) {
  await env.DB.prepare(`
    UPDATE offline_sync_receipts
    SET state=?,entity_id=COALESCE(?,entity_id),last_error_category=?,
      result_json=?,completed_at=CASE WHEN ? IN ('completed','rejected','conflict') THEN CURRENT_TIMESTAMP ELSE completed_at END,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(state, entityId || null, errorCategory || null, JSON.stringify(result), state, id).run();
}

async function operationAlreadyApplied(env: OfflineEnv, employeeId: string, idempotencyKey: string) {
  return env.DB.prepare(`
    SELECT id,status FROM workflow_form_submissions
    WHERE employee_id=? AND offline_idempotency_key=?
  `).bind(employeeId, idempotencyKey).first<{ id: string; status: string }>();
}

async function reconcileProcessingReceipt(
  env: OfflineEnv,
  request: Request,
  context: SessionContext,
  receipt: Record<string, unknown>,
) {
  const isExpense = String(receipt.operationKind || '').startsWith('expense.');
  const applied = isExpense
    ? await env.DB.prepare('SELECT id,status FROM spend_expense_requests WHERE id=? AND requester_employee_id=? AND company_id=?')
      .bind(String(receipt.entityId || ''), context.employee.id, String(receipt.companyId || ''))
      .first<{ id: string; status: string }>()
    : await operationAlreadyApplied(env, context.employee.id, String(receipt.idempotencyKey));
  if (!applied) return null;
  const result: Record<string, unknown> = isExpense
    ? { ok: true, requestId: applied.id, status: applied.status, deduplicated: true }
    : { ok: true, submissionId: applied.id, status: applied.status, deduplicated: true };
  await updateReceipt(env, String(receipt.id), 'completed', result, undefined, applied.id);
  await writeAudit(env, request, context, 'operation_deduplicated', 'offline_sync_receipt', String(receipt.id), {
    operationId: receipt.operationId,
    idempotencyKey: receipt.idempotencyKey,
    operationKind: receipt.operationKind,
    outcome: 'completed-after-response-loss',
  }, String(receipt.companyId || ''));
  const next = await receiptByKey(env, String(receipt.idempotencyKey));
  return json({ ok: true, state: 'synced', receipt: next ? receiptBody(next, true) : result, result });
}
async function sync(request: Request, env: OfflineEnv, context: SessionContext) {
  let body: {
    operationId?: string;
    idempotencyKey?: string;
    kind?: string;
    employeeId?: string;
    companyId?: string;
    entityType?: string;
    entityId?: string;
    capturedAt?: string;
    clientTimezone?: string;
    payload?: Record<string, unknown>;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid offline operation.' }, 400); }
  const operationId = safeText(body.operationId, 160);
  const idempotencyKey = safeText(body.idempotencyKey || request.headers.get('idempotency-key'), 200);
  const kind = safeText(body.kind, 80);
  const employeeId = safeText(body.employeeId, 120);
  const companyId = safeText(body.companyId, 120);
  const capturedAt = parseIso(body.capturedAt);
  if (!validId(operationId) || !validId(idempotencyKey, 200) || !employeeId || !companyId || !capturedAt) {
    await writeAudit(env, request, context, 'operation_rejected', 'offline_operation', operationId || undefined, { operationId, idempotencyKey, operationKind: kind, outcome: 'invalid-metadata', clientTimezone: body.clientTimezone, capturedAt }, companyId || undefined);
    return json({ error: 'The offline operation metadata is invalid.', state: 'needs-review', errorCategory: 'validation' }, 400);
  }
  const existingForKey = await receiptByKey(env, idempotencyKey);
  if (existingForKey && (
    String(existingForKey.employeeId) !== context.employee.id
    || String(existingForKey.companyId) !== companyId
    || String(existingForKey.operationId) !== operationId
    || String(existingForKey.operationKind) !== kind
    || String(existingForKey.idempotencyKey) !== idempotencyKey
  )) {
    const mismatchDimensions = [
      String(existingForKey.employeeId) !== context.employee.id ? 'employee' : '',
      String(existingForKey.companyId) !== companyId ? 'company' : '',
      String(existingForKey.operationId) !== operationId ? 'operation' : '',
      String(existingForKey.operationKind) !== kind ? 'operation-kind' : '',
      String(existingForKey.idempotencyKey) !== idempotencyKey ? 'idempotency-key' : '',
    ].filter(Boolean).join(',');
    const auditCompanyId = companyInScope(context, companyId) ? companyId : undefined;
    await writeAudit(env, request, context, 'operation_rejected', 'offline_sync_receipt', String(existingForKey.id), {
      operationId,
      idempotencyKey,
      operationKind: kind,
      outcome: 'idempotency-scope-mismatch',
      errorCategory: 'idempotency-mismatch',
      mismatchDimensions,
      clientTimezone: body.clientTimezone,
      capturedAt,
    }, auditCompanyId);
    await logSecurity(env, request, 'offline_idempotency_scope_mismatch', {
      employeeId: context.employee.id,
      companyId: auditCompanyId,
      sessionId: context.sessionId,
      result: 'rejected',
      details: { operationId, operationKind: kind, mismatchDimensions },
    });
    return json({ error: 'This idempotency key is already assigned to a different employee, company or operation.', state: 'needs-review', errorCategory: 'idempotency-mismatch' }, 409);
  }
  if (employeeId !== context.employee.id || !companyInScope(context, companyId)) {
    await writeAudit(env, request, context, 'permission_denied', 'offline_operation', operationId, { operationId, idempotencyKey, operationKind: kind, outcome: 'identity-or-scope-mismatch', clientTimezone: body.clientTimezone, capturedAt }, companyId);
    await logSecurity(env, request, 'offline_permission_denied', { employeeId: context.employee.id, companyId, sessionId: context.sessionId, result: 'rejected', details: { operationId, operationKind: kind } });
    return json({ error: 'This queued work is not assigned to the current employee scope.', state: 'needs-review', errorCategory: 'permission-denied' }, 403);
  }
  const policy = await readPolicy(env);
  const session = await sessionRecord(env, context);
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    await writeAudit(env, request, context, 'authentication_required', 'offline_operation', operationId, { operationId, idempotencyKey, operationKind: kind, outcome: 'session-invalid', clientTimezone: body.clientTimezone, capturedAt }, companyId);
    return json({ error: 'Sign in to continue syncing.', state: 'authentication-required', errorCategory: 'authentication-required' }, 401);
  }
  if (!policy.enabled || !policy.allowedOperations.includes(kind)) {
    await writeAudit(env, request, context, 'operation_rejected', 'offline_operation', operationId, { operationId, idempotencyKey, operationKind: kind, outcome: 'policy-disallowed', clientTimezone: body.clientTimezone, capturedAt }, companyId);
    return json({ error: 'This offline action is not enabled by the current policy.', state: 'needs-review', errorCategory: 'policy' }, 403);
  }
  const requiredPermission = kind.startsWith('expense.') ? 'expense.requests' : 'forms.access';
  const requiredLevel: 'view' | 'create' = kind.startsWith('expense.') ? 'create' : 'view';
  if (!hasPermission(context, requiredPermission, requiredLevel, companyId)) {
    await writeAudit(env, request, context, 'permission_denied', 'offline_operation', operationId, { operationId, idempotencyKey, operationKind: kind, outcome: 'current-permission-denied', clientTimezone: body.clientTimezone, capturedAt }, companyId);
    await logSecurity(env, request, 'offline_permission_denied', { employeeId: context.employee.id, companyId, sessionId: context.sessionId, result: 'rejected', details: { operationId, operationKind: kind } });
    const error = kind.startsWith('expense.')
      ? 'Your current expense request permission does not allow this queued action.'
      : 'Your current Forms permission does not allow this queued action.';
    return json({ error, state: 'needs-review', errorCategory: 'permission-denied' }, 403);
  }
  if (Date.now() - new Date(capturedAt).getTime() > Math.min(policy.maxOfflineAgeMinutes, sessionRemainingMinutes(session)) * 60_000) {
    await writeAudit(env, request, context, 'operation_rejected', 'offline_operation', operationId, { operationId, idempotencyKey, operationKind: kind, outcome: 'offline-age-exceeded', clientTimezone: body.clientTimezone, capturedAt }, companyId);
    return json({ error: 'This work is outside the permitted offline continuation window.', state: 'needs-review', errorCategory: 'offline-age' }, 409);
  }
  const existing = existingForKey || await receiptByKey(env, idempotencyKey);
  if (existing) {
    const mismatches = [
      String(existing.employeeId) !== context.employee.id ? 'employee' : '',
      String(existing.companyId) !== companyId ? 'company' : '',
      String(existing.operationId) !== operationId ? 'operation' : '',
      String(existing.operationKind) !== kind ? 'operation-kind' : '',
      String(existing.idempotencyKey) !== idempotencyKey ? 'idempotency-key' : '',
    ].filter(Boolean);
    if (mismatches.length) {
      await writeAudit(env, request, context, 'operation_rejected', 'offline_sync_receipt', String(existing.id), {
        operationId,
        idempotencyKey,
        operationKind: kind,
        outcome: 'idempotency-scope-mismatch',
        errorCategory: 'idempotency-mismatch',
        mismatchDimensions: mismatches.join(','),
        clientTimezone: body.clientTimezone,
        capturedAt,
      }, companyId);
      await logSecurity(env, request, 'offline_idempotency_scope_mismatch', {
        employeeId: context.employee.id,
        companyId,
        sessionId: context.sessionId,
        result: 'rejected',
        details: { operationId, operationKind: kind, mismatchDimensions: mismatches.join(',') },
      });
      return json({ error: 'This idempotency key is already assigned to a different employee, company or operation.', state: 'needs-review', errorCategory: 'idempotency-mismatch' }, 409);
    }
    if (existing.state === 'completed') return json({ ok: true, state: 'synced', receipt: receiptBody(existing, true), result: JSON.parse(String(existing.resultJson || '{}')) });
    if (existing.state === 'rejected' || existing.state === 'conflict') return json({ ok: false, state: 'needs-review', receipt: receiptBody(existing, true), error: JSON.parse(String(existing.resultJson || '{}')).error || 'This operation needs review.' }, 409);
    if (existing.state === 'processing') {
      const reconciled = await reconcileProcessingReceipt(env, request, context, existing);
      if (reconciled) return reconciled;
      if (new Date(String(existing.startedAt || '')).getTime() > Date.now() - 10 * 60_000) {
        return json({ error: 'The server is still checking this operation. Please review it before retrying.', state: 'needs-review', errorCategory: 'processing-uncertain' }, 409);
      }
      await updateReceipt(env, String(existing.id), 'conflict', { error: 'The server could not prove whether this operation completed. Review the Forms record before retrying.' }, 'processing-uncertain');
      return json({ error: 'The server could not prove whether this operation completed. Review the Forms record before retrying.', state: 'needs-review', errorCategory: 'processing-uncertain' }, 409);
    }
    if (existing.state === 'failed_retryable') {
      await env.DB.prepare(`UPDATE offline_sync_receipts SET state='processing',attempt_count=attempt_count+1,started_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='failed_retryable'`).bind(existing.id).run();
    }
  } else {
    const id = uid('sync-receipt');
    await env.DB.prepare(`
      INSERT INTO offline_sync_receipts(
        id,operation_id,idempotency_key,employee_id,company_id,session_id,
        operation_kind,entity_type,entity_id,state,attempt_count
      ) VALUES(?,?,?,?,?,?,?, ?,?,'processing',1)
      ON CONFLICT(idempotency_key) DO NOTHING
    `).bind(id, operationId, idempotencyKey, context.employee.id, companyId, context.sessionId, kind, safeText(body.entityType, 120) || (kind.startsWith('expense.') ? 'spend_expense_request' : 'workflow_form_assignment'), safeText(body.entityId, 160) || safeText(body.payload?.assignmentId, 160) || safeText(body.payload?.requestId, 160) || null).run();
  }
  if (!kind.startsWith('expense.') && kind !== 'forms.submit') {
    await writeAudit(env, request, context, 'operation_rejected', 'offline_operation', operationId, {
      operationId,
      idempotencyKey,
      operationKind: kind,
      outcome: 'unsupported-operation-kind',
      errorCategory: 'validation',
      clientTimezone: body.clientTimezone,
      capturedAt,
    }, companyId);
    return json({ error: 'This offline operation kind is not supported.', state: 'needs-review', errorCategory: 'validation' }, 400);
  }
  const receipt = await receiptByKey(env, idempotencyKey);
  if (!receipt) return json({ error: 'The sync receipt could not be created safely.', state: 'failed-retryable', errorCategory: 'receipt' }, 503);
  await writeAudit(env, request, context, 'sync_started', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, attemptCount: Number(receipt.attemptCount || 1), clientTimezone: body.clientTimezone, capturedAt }, companyId);
  const payload = body.payload || {};
  if (kind.startsWith('expense.')) {
    try {
      const response = await handleOfflineSpendOperation(request, env, context, kind, payload);
      if (!response) {
        await updateReceipt(env, String(receipt.id), 'rejected', { error: 'This offline expense operation is not supported.' }, 'validation');
        return json({ error: 'This offline expense operation is not supported.', state: 'needs-review', errorCategory: 'validation' }, 400);
      }
      const responseBody = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
      if (response.ok) {
        const requestRecord = responseBody.request && typeof responseBody.request === 'object'
          ? responseBody.request as Record<string, unknown>
          : undefined;
        const requestIdValue = safeText(requestRecord?.id || responseBody.requestId || payload.requestId || body.entityId, 160);
        const status = safeText(requestRecord?.status || responseBody.status, 80)
          || (kind === 'expense.draft.save' ? 'draft' : 'submitted');
        const deduplicated = responseBody.deduplicated === true;
        const result = { ok: true, requestId: requestIdValue, status, deduplicated };
        await updateReceipt(env, String(receipt.id), 'completed', result, undefined, requestIdValue || undefined);
        await writeAudit(env, request, context, deduplicated ? 'operation_deduplicated' : 'operation_accepted', 'offline_sync_receipt', String(receipt.id), {
          operationId,
          idempotencyKey,
          operationKind: kind,
          outcome: deduplicated ? 'deduplicated' : 'accepted',
          attemptCount: Number(receipt.attemptCount || 1),
          clientTimezone: body.clientTimezone,
          capturedAt,
        }, companyId);
        const completed = await receiptByKey(env, idempotencyKey);
        return json({ ok: true, state: 'synced', receipt: completed ? receiptBody(completed, deduplicated) : result, result });
      }
      const error = safeText(responseBody.error, 240) || 'The server rejected this queued expense operation.';
      if (response.status === 409) {
        await updateReceipt(env, String(receipt.id), 'conflict', { error }, 'conflict');
        await writeAudit(env, request, context, 'operation_conflict', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'conflict', errorCategory: 'conflict', clientTimezone: body.clientTimezone, capturedAt }, companyId);
        return json({ error, state: 'needs-review', errorCategory: 'conflict' }, 409);
      }
      if (response.status === 403) {
        await updateReceipt(env, String(receipt.id), 'rejected', { error }, 'permission-denied');
        await writeAudit(env, request, context, 'permission_denied', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'rejected', errorCategory: 'permission-denied', clientTimezone: body.clientTimezone, capturedAt }, companyId);
        return json({ error, state: 'needs-review', errorCategory: 'permission-denied' }, 403);
      }
      if (response.status >= 400 && response.status < 500) {
        await updateReceipt(env, String(receipt.id), 'rejected', { error }, 'validation');
        await writeAudit(env, request, context, 'operation_rejected', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'rejected', errorCategory: 'validation', clientTimezone: body.clientTimezone, capturedAt }, companyId);
        return json({ error, state: 'needs-review', errorCategory: 'validation' }, response.status);
      }
      await updateReceipt(env, String(receipt.id), 'failed_retryable', { error }, 'server-retryable');
      await writeAudit(env, request, context, 'operation_rejected', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'retryable', errorCategory: 'server-retryable', clientTimezone: body.clientTimezone, capturedAt }, companyId);
      return json({ error, state: 'failed-retryable', errorCategory: 'server-retryable' }, 503);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The server could not process this queued expense operation.';
      await updateReceipt(env, String(receipt.id), 'failed_retryable', { error: message.slice(0, 240) }, 'server-retryable');
      return json({ error: 'The server could not process this queued expense operation yet.', state: 'failed-retryable', errorCategory: 'server-retryable' }, 503);
    }
  }
  const formRequest = new Request(new URL('/api/forms/submit', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      assignmentId: safeText(payload.assignmentId || body.entityId, 160),
      responses: payload.responses && typeof payload.responses === 'object' ? payload.responses : {},
      baseUpdatedAt: safeText(payload.baseUpdatedAt, 80) || undefined,
      latitude: parseFinite(payload.latitude),
      longitude: parseFinite(payload.longitude),
      accuracy: parseFinite(payload.accuracy),
    }),
  });
  try {
    const response = await submitForm(formRequest, env, context);
    const responseBody = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
    if (response.ok) {
      const result = { ok: true, submissionId: safeText(responseBody.submissionId, 160), status: safeText(responseBody.status, 80) || 'submitted' };
      await updateReceipt(env, String(receipt.id), 'completed', result, undefined, result.submissionId);
      await writeAudit(env, request, context, responseBody.deduplicated ? 'operation_deduplicated' : 'operation_accepted', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: responseBody.deduplicated ? 'deduplicated' : 'accepted', attemptCount: Number(receipt.attemptCount || 1), clientTimezone: body.clientTimezone, capturedAt }, companyId);
      const completed = await receiptByKey(env, idempotencyKey);
      return json({ ok: true, state: 'synced', receipt: completed ? receiptBody(completed, Boolean(responseBody.deduplicated)) : result, result });
    }
    const error = safeText(responseBody.error, 240) || 'The server rejected this queued operation.';
    if (response.status === 409) {
      await updateReceipt(env, String(receipt.id), 'conflict', { error }, 'conflict');
      await writeAudit(env, request, context, 'operation_conflict', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'conflict', errorCategory: 'conflict', clientTimezone: body.clientTimezone, capturedAt }, companyId);
      return json({ error, state: 'needs-review', errorCategory: 'conflict' }, 409);
    }
    if (response.status === 403) {
      await updateReceipt(env, String(receipt.id), 'rejected', { error }, 'permission-denied');
      await writeAudit(env, request, context, 'permission_denied', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'rejected', errorCategory: 'permission-denied', clientTimezone: body.clientTimezone, capturedAt }, companyId);
      return json({ error, state: 'needs-review', errorCategory: 'permission-denied' }, 403);
    }
    if (response.status >= 400 && response.status < 500) {
      await updateReceipt(env, String(receipt.id), 'rejected', { error }, 'validation');
      await writeAudit(env, request, context, 'operation_rejected', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'rejected', errorCategory: 'validation', clientTimezone: body.clientTimezone, capturedAt }, companyId);
      return json({ error, state: 'needs-review', errorCategory: 'validation' }, response.status);
    }
    await updateReceipt(env, String(receipt.id), 'failed_retryable', { error }, 'server-retryable');
    await writeAudit(env, request, context, 'operation_rejected', 'offline_sync_receipt', String(receipt.id), { operationId, idempotencyKey, operationKind: kind, outcome: 'retryable', errorCategory: 'server-retryable', clientTimezone: body.clientTimezone, capturedAt }, companyId);
    return json({ error, state: 'failed-retryable', errorCategory: 'server-retryable' }, 503);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The server could not process this queued operation.';
    await updateReceipt(env, String(receipt.id), 'failed_retryable', { error: message.slice(0, 240) }, 'server-retryable');
    return json({ error: 'The server could not process this queued operation yet.', state: 'failed-retryable', errorCategory: 'server-retryable' }, 503);
  }
}

async function activity(request: Request, env: OfflineEnv, context: SessionContext) {
  const companyId = safeText(new URL(request.url).searchParams.get('companyId'), 120);
  if (companyId && !companyInScope(context, companyId)) return json({ error: 'Company access is not assigned.' }, 403);
  const formsVisible = companyId
    ? hasPermission(context, 'forms.access', 'view', companyId)
      || hasPermission(context, 'expense.own', 'view', companyId)
      || hasPermission(context, 'expense.requests', 'create', companyId)
    : context.companies.some((company) => hasPermission(context, 'forms.access', 'view', company.id)
      || hasPermission(context, 'expense.own', 'view', company.id)
      || hasPermission(context, 'expense.requests', 'create', company.id));
  if (!formsVisible) return json({ error: 'Forms or expense access is not assigned.' }, 403);
  const rows = await env.DB.prepare(`
    SELECT id,operation_id AS operationId,operation_kind AS operationKind,
      entity_type AS entityType,entity_id AS entityId,state,attempt_count AS attemptCount,
      last_error_category AS lastErrorCategory,result_json AS resultJson,
      server_received_at AS serverReceivedAt,completed_at AS completedAt,updated_at AS updatedAt
    FROM offline_sync_receipts
    WHERE employee_id=? AND (?='' OR company_id=?)
    ORDER BY updated_at DESC LIMIT 50
  `).bind(context.employee.id, companyId, companyId).all<Record<string, unknown>>();
  const telemetry = await env.DB.prepare(`
    SELECT device_id AS deviceId,last_successful_sync_at AS lastSuccessfulSyncAt,
      last_failed_sync_at AS lastFailedSyncAt,pending_count AS pendingCount,
      sync_status AS syncStatus,last_reported_at AS lastReportedAt
    FROM offline_client_telemetry WHERE employee_id=? AND (?='' OR company_id=?)
    ORDER BY last_reported_at DESC LIMIT 10
  `).bind(context.employee.id, companyId, companyId).all<Record<string, unknown>>();
  const operations = (rows.results || []).map((row) => {
    let result: Record<string, unknown> = {};
    try { result = JSON.parse(String(row.resultJson || '{}')) as Record<string, unknown>; } catch { result = {}; }
    return {
      id: row.id,
      operationId: row.operationId,
      operationKind: row.operationKind,
      entityType: row.entityType,
      entityId: row.entityId,
      state: row.state,
      attemptCount: row.attemptCount,
      lastErrorCategory: row.lastErrorCategory,
      error: safeText(result.error, 240) || undefined,
      submissionId: safeText(result.submissionId, 160) || undefined,
      serverReceivedAt: row.serverReceivedAt,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
    };
  });
  return json({
    serverTime: new Date().toISOString(),
    businessTimezone: businessTimezone(env),
    operations,
    telemetry: telemetry.results || [],
    lastSuccessfulSync: telemetry.results?.find((row) => row.lastSuccessfulSyncAt)?.lastSuccessfulSyncAt || null,
  });
}

async function telemetry(request: Request, env: OfflineEnv, context: SessionContext) {
  let body: {
    companyId?: string;
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    appVersion?: string;
    clientTimezone?: string;
    pendingCount?: number;
    syncStatus?: string;
    lastSuccessfulSyncAt?: string;
    lastFailedSyncAt?: string;
    lastErrorCategory?: string;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid sync telemetry.' }, 400); }
  const companyId = safeText(body.companyId, 120);
  const deviceId = safeText(body.deviceId, 160);
  const syncStatus = safeText(body.syncStatus, 40);
  const allowedStatus = new Set(['online','offline','waiting','syncing','synced','needs_attention','authentication_required']);
  if (!companyId || !companyInScope(context, companyId) || !validId(deviceId) || !allowedStatus.has(syncStatus)) return json({ error: 'Telemetry scope or status is invalid.' }, 400);
  const pendingCount = Math.max(0, Math.min(500, Math.floor(Number(body.pendingCount || 0))));
  const lastSuccessfulSyncAt = parseIso(body.lastSuccessfulSyncAt);
  const lastFailedSyncAt = parseIso(body.lastFailedSyncAt);
  await env.DB.prepare(`
    INSERT INTO offline_client_telemetry(
      id,employee_id,company_id,session_id,device_id,device_name,platform,
      app_version,client_timezone,pending_count,sync_status,
      last_successful_sync_at,last_failed_sync_at,last_error_category,
      last_reported_at,ip_address,network_location
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?)
    ON CONFLICT(employee_id,company_id,device_id) DO UPDATE SET
      session_id=excluded.session_id,device_name=excluded.device_name,platform=excluded.platform,
      app_version=excluded.app_version,client_timezone=excluded.client_timezone,
      pending_count=excluded.pending_count,sync_status=excluded.sync_status,
      last_successful_sync_at=excluded.last_successful_sync_at,last_failed_sync_at=excluded.last_failed_sync_at,
      last_error_category=excluded.last_error_category,last_reported_at=CURRENT_TIMESTAMP,
      ip_address=excluded.ip_address,network_location=excluded.network_location,updated_at=CURRENT_TIMESTAMP
  `).bind(
    uid('telemetry'),
    context.employee.id,
    companyId,
    context.sessionId,
    deviceId,
    safeText(body.deviceName, 160) || null,
    safeText(body.platform, 80) || null,
    safeText(body.appVersion, 80) || null,
    safeText(body.clientTimezone, 80) || null,
    pendingCount,
    syncStatus,
    lastSuccessfulSyncAt || null,
    lastFailedSyncAt || null,
    safeText(body.lastErrorCategory, 80) || null,
    requestIp(request) || null,
    requestLocationLabel(request) || null,
  ).run();
  return json({ ok: true, serverReceivedAt: new Date().toISOString(), networkLocation: requestLocationLabel(request) || null });
}

async function ownerOverview(request: Request, env: OfflineEnv, context: SessionContext) {
  if (!owner(context)) return json({ error: 'Owner access is required.' }, 403);
  const [sessions, telemetryRows, receipts, policy] = await Promise.all([
    env.DB.prepare(`
      SELECT s.id,s.employee_id AS employeeId,e.display_name AS employeeName,
        s.device_id AS deviceId,s.device_name AS deviceName,s.user_agent AS userAgent,
        s.ip_address AS ipAddress,s.created_at AS createdAt,s.last_seen_at AS lastSeenAt,
        s.expires_at AS expiresAt,s.revoked_at AS revokedAt,
        t.company_id AS companyId,t.app_version AS appVersion,t.platform,
        t.client_timezone AS clientTimezone,t.pending_count AS pendingCount,
        t.sync_status AS syncStatus,t.last_successful_sync_at AS lastSuccessfulSyncAt,
        t.last_failed_sync_at AS lastFailedSyncAt,t.last_reported_at AS lastReportedAt,
        t.network_location AS networkLocation,t.ip_address AS lastReportedIp
      FROM auth_sessions s JOIN employees e ON e.id=s.employee_id
      LEFT JOIN offline_client_telemetry t ON t.session_id=s.id
      ORDER BY s.last_seen_at DESC LIMIT 100
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT t.employee_id AS employeeId,e.display_name AS employeeName,t.company_id AS companyId,
        t.device_id AS deviceId,t.device_name AS deviceName,t.platform,t.app_version AS appVersion,
        t.client_timezone AS clientTimezone,t.pending_count AS pendingCount,t.sync_status AS syncStatus,
        t.last_successful_sync_at AS lastSuccessfulSyncAt,t.last_failed_sync_at AS lastFailedSyncAt,
        t.last_error_category AS lastErrorCategory,t.last_reported_at AS lastReportedAt,
        t.ip_address AS ipAddress,t.network_location AS networkLocation
      FROM offline_client_telemetry t JOIN employees e ON e.id=t.employee_id
      ORDER BY t.last_reported_at DESC LIMIT 100
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT r.id,r.operation_id AS operationId,r.idempotency_key AS idempotencyKey,
        r.employee_id AS employeeId,e.display_name AS employeeName,r.company_id AS companyId,
        r.operation_kind AS operationKind,r.entity_type AS entityType,r.entity_id AS entityId,
        r.state,r.attempt_count AS attemptCount,r.last_error_category AS lastErrorCategory,
        r.server_received_at AS serverReceivedAt,r.completed_at AS completedAt,r.updated_at AS updatedAt,
        r.result_json AS resultJson
      FROM offline_sync_receipts r JOIN employees e ON e.id=r.employee_id
      ORDER BY r.updated_at DESC LIMIT 100
    `).all<Record<string, unknown>>(),
    readPolicy(env),
  ]);
  const activeSessions = (sessions.results || []).filter((row) => !row.revokedAt && new Date(String(row.expiresAt)).getTime() > Date.now()).length;
  const pending = (telemetryRows.results || []).reduce((sum, row) => sum + Number(row.pendingCount || 0), 0);
  const needsAttention = (receipts.results || []).filter((row) => ['conflict','rejected'].includes(String(row.state))).length;
  return json({
    serverTime: new Date().toISOString(),
    businessTimezone: businessTimezone(env),
    freshness: 'Server observed at request time; each client report carries its own lastReportedAt.',
    summary: { activeSessions, telemetryDevices: telemetryRows.results?.length || 0, reportedPending: pending, needsAttention },
    sessions: sessions.results || [],
    telemetry: telemetryRows.results || [],
    receipts: (receipts.results || []).map((row) => {
      const copy = { ...row };
      delete copy.resultJson;
      return copy;
    }),
    policy,
  });
}


const ownerDetailAllowedKeys = new Set([
  'employeeId', 'companyId', 'sessionId', 'deviceId', 'operationId', 'idempotencyKey',
  'operationKind', 'outcome', 'errorCategory', 'attemptCount', 'attachmentId',
  'mimeType', 'sizeBytes', 'sha256', 'requestId', 'clientTimezone', 'capturedAt',
  'serverReceivedAt', 'applicationVersion', 'mismatchDimensions', 'ipAddress',
  'networkLocation',
]);

function ownerDetailObject(value: unknown) {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function canonicalOwnerTime(value: unknown) {
  const text = safeText(value, 80);
  if (!text) return undefined;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) return text;
  return text.replace(' ', 'T') + 'Z';
}

function safeOwnerDetails(value: unknown) {
  const parsed = ownerDetailObject(value);
  return Object.fromEntries(Object.entries(parsed)
    .filter(([key, item]) => ownerDetailAllowedKeys.has(key) && item !== undefined && item !== null && item !== '')
    .map(([key, item]) => {
      if (typeof item === 'number' && Number.isFinite(item)) return [key, item];
      return [key, safeText(item, 240)];
    }));
}

function safeOwnerReceipt(row: Record<string, unknown>) {
  const result = ownerDetailObject(row.resultJson);
  const state = safeText(row.state, 40);
  return {
    id: safeText(row.id, 160),
    operationId: safeText(row.operationId, 160),
    idempotencyKey: safeText(row.idempotencyKey, 200),
    employeeId: safeText(row.employeeId, 120),
    companyId: safeText(row.companyId, 120) || undefined,
    sessionId: safeText(row.sessionId, 160) || undefined,
    operationKind: safeText(row.operationKind, 80),
    entityType: safeText(row.entityType, 80),
    entityId: safeText(row.entityId, 160) || undefined,
    state,
    attemptCount: Number(row.attemptCount || 0),
    lastErrorCategory: safeText(row.lastErrorCategory, 80) || undefined,
    startedAt: canonicalOwnerTime(row.startedAt),
    serverReceivedAt: canonicalOwnerTime(row.serverReceivedAt),
    completedAt: canonicalOwnerTime(row.completedAt),
    updatedAt: canonicalOwnerTime(row.updatedAt),
    outcome: safeText(result.outcome, 80) || (state === 'completed' ? 'accepted' : state === 'conflict' ? 'conflict' : state === 'rejected' ? 'rejected' : undefined),
    submissionId: safeText(result.submissionId, 160) || undefined,
    resultStatus: safeText(result.status, 80) || undefined,
  };
}

function ownerTimelineTitle(action: string) {
  return ({
    offline_work_queued: 'Work queued offline',
    sync_started: 'Sync attempt started',
    operation_accepted: 'Operation accepted',
    operation_deduplicated: 'Operation deduplicated safely',
    operation_rejected: 'Operation rejected',
    permission_denied: 'Permission denied',
    authentication_required: 'Authentication required',
    operation_conflict: 'Conflict needs review',
    attachment_accepted: 'Attachment upload acknowledged',
    sync_completed: 'Sync completed',
    session_revoked: 'Session revoked',
  } as Record<string, string>)[action] || action.replaceAll('_', ' ');
}

async function ownerDetail(request: Request, env: OfflineEnv, context: SessionContext) {
  if (!owner(context)) return json({ error: 'Owner access is required.' }, 403);
  const url = new URL(request.url);
  const employeeId = safeText(url.searchParams.get('employeeId'), 120);
  const deviceId = safeText(url.searchParams.get('deviceId'), 160);
  const sessionId = safeText(url.searchParams.get('sessionId'), 160);
  const state = safeText(url.searchParams.get('state'), 80);
  const eventType = safeText(url.searchParams.get('eventType'), 100);
  const companyId = safeText(url.searchParams.get('companyId'), 120);
  const from = parseIso(url.searchParams.get('from')) || '';
  const to = parseIso(url.searchParams.get('to')) || '';
  if (!employeeId) return json({ error: 'Employee is required.' }, 400);

  const [
    employeeResult,
    memberships,
    roles,
    sessions,
    telemetryRows,
    receipts,
    attachments,
    auditRows,
  ] = await Promise.all([
    env.DB.prepare(
      "SELECT e.id,e.employee_no AS employeeNo,e.display_name AS displayName,e.email,e.job_title AS jobTitle,e.department,e.employment_status AS status,ep.timezone AS timezone FROM employees e LEFT JOIN employee_preferences ep ON ep.employee_id=e.id WHERE e.id=?",
    ).bind(employeeId).first<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT m.company_id AS companyId,c.code AS companyCode,c.name AS companyName,m.location_id AS locationId,l.name AS locationName,m.is_primary AS isPrimary FROM employee_company_memberships m JOIN companies c ON c.id=m.company_id LEFT JOIN company_locations l ON l.id=m.location_id WHERE m.employee_id=? AND m.active=1 ORDER BY m.is_primary DESC,c.name",
    ).bind(employeeId).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT r.id,r.code,r.name,er.company_id AS companyId FROM employee_roles er JOIN roles r ON r.id=er.role_id WHERE er.employee_id=? AND r.active=1 ORDER BY r.is_system DESC,r.name",
    ).bind(employeeId).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT s.id,s.id AS sessionId,s.employee_id AS employeeId,s.device_id AS deviceId,s.device_name AS deviceName,s.user_agent AS userAgent,s.ip_address AS ipAddress,s.created_at AS createdAt,s.last_seen_at AS lastSeenAt,s.expires_at AS expiresAt,s.revoked_at AS revokedAt,t.company_id AS companyId,t.app_version AS appVersion,t.platform,t.client_timezone AS clientTimezone,t.pending_count AS pendingCount,t.sync_status AS syncStatus,t.last_successful_sync_at AS lastSuccessfulSyncAt,t.last_failed_sync_at AS lastFailedSyncAt,t.last_reported_at AS lastReportedAt,t.network_location AS networkLocation,t.ip_address AS lastReportedIp FROM auth_sessions s LEFT JOIN offline_client_telemetry t ON t.session_id=s.id WHERE s.employee_id=? AND (?='' OR s.device_id=?) AND (?='' OR s.id=?) AND (?='' OR t.company_id=?) ORDER BY s.last_seen_at DESC LIMIT 100",
    ).bind(employeeId, deviceId, deviceId, sessionId, sessionId, companyId, companyId).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT t.employee_id AS employeeId,e.display_name AS employeeName,t.company_id AS companyId,t.device_id AS deviceId,t.device_name AS deviceName,t.platform,t.app_version AS appVersion,t.client_timezone AS clientTimezone,t.pending_count AS pendingCount,t.sync_status AS syncStatus,t.last_successful_sync_at AS lastSuccessfulSyncAt,t.last_failed_sync_at AS lastFailedSyncAt,t.last_error_category AS lastErrorCategory,t.last_reported_at AS lastReportedAt,t.ip_address AS ipAddress,t.network_location AS networkLocation FROM offline_client_telemetry t JOIN employees e ON e.id=t.employee_id WHERE t.employee_id=? AND (?='' OR t.device_id=?) AND (?='' OR t.company_id=?) ORDER BY t.last_reported_at DESC LIMIT 100",
    ).bind(employeeId, deviceId, deviceId, companyId, companyId).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT r.id,r.operation_id AS operationId,r.idempotency_key AS idempotencyKey,r.employee_id AS employeeId,r.company_id AS companyId,r.session_id AS sessionId,r.operation_kind AS operationKind,r.entity_type AS entityType,r.entity_id AS entityId,r.state,r.attempt_count AS attemptCount,r.last_error_category AS lastErrorCategory,r.result_json AS resultJson,r.server_received_at AS serverReceivedAt,r.started_at AS startedAt,r.completed_at AS completedAt,r.updated_at AS updatedAt FROM offline_sync_receipts r WHERE r.employee_id=? AND (?='' OR r.company_id=?) AND (?='' OR r.session_id=?) AND (?='' OR r.state=?) AND (?='' OR datetime(r.updated_at)>=datetime(?)) AND (?='' OR datetime(r.updated_at)<=datetime(?)) ORDER BY r.updated_at DESC LIMIT 100",
    ).bind(employeeId, companyId, companyId, sessionId, sessionId, state, state, from, from, to, to).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT id,company_id AS companyId,operation_id AS operationId,original_name AS originalName,mime_type AS mimeType,size_bytes AS sizeBytes,sha256,status,created_at AS createdAt,uploaded_at AS uploadedAt,reconciled_at AS reconciledAt FROM offline_attachments WHERE employee_id=? AND (?='' OR company_id=?) AND (?='' OR status=?) ORDER BY created_at DESC LIMIT 100",
    ).bind(employeeId, companyId, companyId, state, state).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT id,occurred_at AS occurredAt,action,company_id AS companyId,entity_type AS entityType,entity_id AS entityId,reason,source,request_id AS requestId,after_json AS afterJson FROM audit_logs WHERE actor_employee_id=? AND module='offline_sync' AND (?='' OR company_id=?) AND (?='' OR action=?) AND (?='' OR datetime(occurred_at)>=datetime(?)) AND (?='' OR datetime(occurred_at)<=datetime(?)) ORDER BY occurred_at DESC LIMIT 250",
    ).bind(employeeId, companyId, companyId, eventType, eventType, from, from, to, to).all<Record<string, unknown>>(),
  ]);

  if (!employeeResult) return json({ error: 'Employee not found.' }, 404);

  const safeSessions = (sessions.results || []).map((row) => ({
    ...row,
    id: safeText(row.id, 160),
    sessionId: safeText(row.sessionId, 160),
    employeeId: safeText(row.employeeId, 120),
    deviceId: safeText(row.deviceId, 160) || undefined,
    companyId: safeText(row.companyId, 120) || undefined,
    createdAt: canonicalOwnerTime(row.createdAt),
    lastSeenAt: canonicalOwnerTime(row.lastSeenAt),
    expiresAt: canonicalOwnerTime(row.expiresAt),
    revokedAt: canonicalOwnerTime(row.revokedAt),
  }));
  const safeTelemetry = (telemetryRows.results || []).map((row) => ({
    ...row,
    lastReportedAt: canonicalOwnerTime(row.lastReportedAt),
    lastSuccessfulSyncAt: canonicalOwnerTime(row.lastSuccessfulSyncAt),
    lastFailedSyncAt: canonicalOwnerTime(row.lastFailedSyncAt),
  }));
  const safeReceipts = (receipts.results || []).map(safeOwnerReceipt);
  const safeAttachments = (attachments.results || []).map((row) => ({
    id: safeText(row.id, 160),
    companyId: safeText(row.companyId, 120) || undefined,
    operationId: safeText(row.operationId, 160),
    originalName: safeText(row.originalName, 240),
    mimeType: safeText(row.mimeType, 80),
    sizeBytes: Number(row.sizeBytes || 0),
    sha256: safeText(row.sha256, 80),
    status: safeText(row.status, 40),
    createdAt: canonicalOwnerTime(row.createdAt),
    uploadedAt: canonicalOwnerTime(row.uploadedAt),
    reconciledAt: canonicalOwnerTime(row.reconciledAt),
  }));
  const safeAudit = (auditRows.results || []).map((row) => ({
    id: safeText(row.id, 160),
    occurredAt: canonicalOwnerTime(row.occurredAt) || new Date(0).toISOString(),
    action: safeText(row.action, 100),
    companyId: safeText(row.companyId, 120) || undefined,
    entityType: safeText(row.entityType, 100),
    entityId: safeText(row.entityId, 160) || undefined,
    reason: safeText(row.reason, 240) || undefined,
    source: safeText(row.source, 80) || undefined,
    requestId: safeText(row.requestId, 160) || undefined,
    details: safeOwnerDetails(row.afterJson),
  })).filter((row) => (!deviceId || row.details?.deviceId === deviceId) && (!sessionId || row.details?.sessionId === sessionId));

  const timeline: Array<Record<string, unknown>> = safeAudit.map((row) => ({
    id: 'audit-' + row.id,
    at: row.occurredAt,
    category: 'audit',
    title: ownerTimelineTitle(row.action),
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    requestId: row.requestId,
    details: row.details,
  }));
  for (const receipt of safeReceipts) {
    if (receipt.startedAt) timeline.push({ id: 'receipt-' + receipt.id + '-started', at: receipt.startedAt, category: 'receipt', title: 'Sync attempt recorded', action: 'sync_attempt_started', entityType: receipt.entityType, entityId: receipt.entityId, details: { operationId: receipt.operationId, operationKind: receipt.operationKind, attemptCount: receipt.attemptCount, sessionId: receipt.sessionId, companyId: receipt.companyId } });
    if (receipt.serverReceivedAt) timeline.push({ id: 'receipt-' + receipt.id + '-received', at: receipt.serverReceivedAt, category: 'receipt', title: 'Server received operation', action: 'server_received', entityType: receipt.entityType, entityId: receipt.entityId, details: { operationId: receipt.operationId, operationKind: receipt.operationKind, idempotencyKey: receipt.idempotencyKey, sessionId: receipt.sessionId, companyId: receipt.companyId } });
    if (receipt.completedAt) timeline.push({ id: 'receipt-' + receipt.id + '-completed', at: receipt.completedAt, category: 'receipt', title: receipt.state === 'completed' ? 'Submission accepted' : receipt.state === 'conflict' ? 'Conflict recorded' : receipt.state === 'rejected' ? 'Submission rejected' : 'Sync outcome recorded', action: receipt.state === 'completed' ? 'operation_accepted' : receipt.state, entityType: receipt.entityType, entityId: receipt.entityId, details: { operationId: receipt.operationId, operationKind: receipt.operationKind, outcome: receipt.outcome, errorCategory: receipt.lastErrorCategory, attemptCount: receipt.attemptCount } });
  }
  for (const attachment of safeAttachments) {
    if (attachment.uploadedAt) timeline.push({ id: 'attachment-' + attachment.id + '-uploaded', at: attachment.uploadedAt, category: 'attachment', title: 'Attachment upload acknowledged', action: 'attachment_accepted', entityType: 'offline_attachment', entityId: attachment.id, details: { attachmentId: attachment.id, operationId: attachment.operationId, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, sha256: attachment.sha256, outcome: attachment.status } });
  }
  timeline.sort((left, right) => new Date(String(left.at)).getTime() - new Date(String(right.at)).getTime());

  const employee = {
    id: safeText(employeeResult.id, 120),
    employeeNo: safeText(employeeResult.employeeNo, 80) || undefined,
    displayName: safeText(employeeResult.displayName, 160),
    email: safeText(employeeResult.email, 240) || undefined,
    jobTitle: safeText(employeeResult.jobTitle, 160) || undefined,
    department: safeText(employeeResult.department, 160) || undefined,
    status: safeText(employeeResult.status, 40),
    timezone: safeText(employeeResult.timezone, 80) || undefined,
  };
  return json({
    serverTime: new Date().toISOString(),
    businessTimezone: businessTimezone(env),
    employee,
    memberships: memberships.results || [],
    roles: roles.results || [],
    sessions: safeSessions,
    telemetry: safeTelemetry,
    receipts: safeReceipts,
    attachments: safeAttachments,
    audit: safeAudit,
    timeline,
  });
}

async function ownerPolicy(request: Request, env: OfflineEnv, context: SessionContext) {
  if (!owner(context)) return json({ error: 'Owner access is required.' }, 403);
  if (request.method === 'GET') return json({ policy: await readPolicy(env), businessTimezone: businessTimezone(env) });
  let body: Partial<Policy>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid offline policy.' }, 400); }
  const maxOfflineAgeMinutes = Math.max(5, Math.min(43_200, Math.floor(Number(body.maxOfflineAgeMinutes || 720))));
  const maxQueueCount = Math.max(1, Math.min(500, Math.floor(Number(body.maxQueueCount || 50))));
  const attachmentMaxBytes = Math.max(1024, Math.min(52_428_800, Math.floor(Number(body.attachmentMaxBytes || 10 * 1024 * 1024))));
  const retentionDays = Math.max(1, Math.min(365, Math.floor(Number(body.retentionDays || 30))));
  const allowedOperations = Array.isArray(body.allowedOperations) ? body.allowedOperations.map(String).filter((item) => operationKinds.has(item)) : [...defaultAllowedOperations];
  await env.DB.prepare(`
    UPDATE offline_policy SET enabled=?,max_offline_age_minutes=?,max_queue_count=?,
      attachment_max_bytes=?,automatic_sync=?,manual_retry=?,retention_days=?,
      allowed_operations_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='global'
  `).bind(
    body.enabled === false ? 0 : 1,
    maxOfflineAgeMinutes,
    maxQueueCount,
    attachmentMaxBytes,
    body.automaticSync === false ? 0 : 1,
    body.manualRetry === false ? 0 : 1,
    retentionDays,
    JSON.stringify(allowedOperations.length ? allowedOperations : defaultAllowedOperations),
    context.employee.id,
  ).run();
  await writeAudit(env, request, context, 'offline_policy_updated', 'offline_policy', 'global', {
    outcome: 'updated',
    operationKind: allowedOperations.join(','),
  }, undefined, 'Owner updated offline platform policy');
  return json({ ok: true, policy: await readPolicy(env), businessTimezone: businessTimezone(env) });
}

async function ownerRevoke(request: Request, env: OfflineEnv, context: SessionContext) {
  if (!owner(context)) return json({ error: 'Owner access is required.' }, 403);
  let body: { companyId?: string; employeeId?: string; sessionId?: string; action?: string; reason?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid session action.' }, 400); }
  if (!['revoke_session', 'revoke_all_sessions'].includes(String(body.action || ''))) {
    return json({ error: 'Only controlled session revocation is available from Sync & Sessions.' }, 400);
  }
  const delegated = new Request(new URL('/api/support/admin/command', request.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return routeOwnerSupport(delegated, env, context);
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120) || 'offline-attachment';
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', asArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, '0')).join('');
}

async function uploadAttachment(request: Request, env: OfflineEnv, context: SessionContext, attachmentId: string) {
  if (!env.FILES) return json({ error: 'Secure file storage is not configured.' }, 503);
  const operationId = safeText(request.headers.get('x-offline-operation-id'), 160);
  const companyId = safeText(request.headers.get('x-offline-company-id'), 120);
  const name = safeFileName(safeText(request.headers.get('x-offline-file-name'), 160));
  const claimedSha = safeText(request.headers.get('x-offline-sha256'), 80).toLowerCase();
  const mimeType = safeText(request.headers.get('content-type'), 80).split(';')[0].toLowerCase();
  if (!validId(attachmentId) || !validId(operationId) || !companyId || !companyInScope(context, companyId)) return json({ error: 'Attachment scope is invalid.' }, 400);
  if (!allowedMimeTypes.has(mimeType)) return json({ error: 'This attachment MIME type is not allowed.' }, 415);
  const policy = await readPolicy(env);
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > policy.attachmentMaxBytes) return json({ error: 'This attachment is larger than the configured limit.' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > policy.attachmentMaxBytes) return json({ error: 'This attachment is larger than the configured limit.' }, 413);
  const digest = await sha256(bytes);
  if (claimedSha && (!/^[a-f0-9]{64}$/.test(claimedSha) || claimedSha !== digest)) return json({ error: 'This attachment failed its integrity check.' }, 400);
  const existing = await env.DB.prepare(`SELECT id,r2_key AS r2Key,sha256,mime_type AS mimeType,size_bytes AS sizeBytes,status,company_id AS companyId FROM offline_attachments WHERE id=? AND employee_id=?`).bind(attachmentId, context.employee.id).first<Record<string, unknown>>();
  if(existing&&existing.companyId!==companyId)return json({error:'Attachment scope conflicts with its existing record.'},409);
  if (existing && existing.sha256 === digest && existing.mimeType === mimeType && Number(existing.sizeBytes) === bytes.byteLength) {
    await env.DB.prepare(`INSERT OR IGNORE INTO storage_mirror_jobs(
      id,provider,source_module,source_id,company_id,r2_key,original_name,mime_type,size_bytes,sha256,idempotency_key,status
    ) SELECT ?, 'microsoft_onedrive','offline',id,company_id,r2_key,original_name,mime_type,size_bytes,sha256,?,'provider_required'
      FROM offline_attachments WHERE id=? AND employee_id=? AND company_id=? AND sha256=?`)
      .bind('storage-mirror-offline-' + attachmentId + '-' + digest,
        'microsoft_onedrive:offline:' + attachmentId + ':' + digest,
        attachmentId,context.employee.id,companyId,digest).run();
    const mirror = await env.DB.prepare(`SELECT status FROM storage_mirror_jobs WHERE provider='microsoft_onedrive' AND source_module='offline' AND source_id=? AND sha256=? LIMIT 1`).bind(attachmentId,digest).first<{status:string}>();
    return json({ ok: true, attachment: { id: existing.id, status: existing.status, backupStatus: mirror?.status||'provider_required', sha256: existing.sha256, sizeBytes: existing.sizeBytes }, deduplicated: true });
  }
  const key = 'offline/' + context.employee.id + '/' + operationId + '/' + attachmentId + '-' + digest;
  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' },
    customMetadata: { employeeId: context.employee.id, companyId, operationId, sha256: digest },
  });
  try {
    await env.DB.batch([env.DB.prepare(`
      INSERT INTO offline_attachments(id,employee_id,company_id,operation_id,r2_key,original_name,mime_type,size_bytes,sha256)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET r2_key=excluded.r2_key,original_name=excluded.original_name,
        mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,sha256=excluded.sha256,
        company_id=excluded.company_id,operation_id=excluded.operation_id,
        status='uploaded',uploaded_at=CURRENT_TIMESTAMP
    `).bind(attachmentId, context.employee.id, companyId, operationId, key, name, mimeType, bytes.byteLength, digest), env.DB.prepare(`
      INSERT OR IGNORE INTO storage_mirror_jobs(
        id,provider,source_module,source_id,company_id,r2_key,original_name,mime_type,
        size_bytes,sha256,idempotency_key,status
      ) SELECT ?, 'microsoft_onedrive','offline',id,company_id,r2_key,original_name,mime_type,
        size_bytes,sha256,?,'provider_required'
        FROM offline_attachments WHERE id=? AND employee_id=? AND sha256=?
    `).bind('storage-mirror-offline-' + attachmentId + '-' + digest,
      'microsoft_onedrive:offline:' + attachmentId + ':' + digest,
      attachmentId, context.employee.id, digest)]);
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  await writeAudit(env, request, context, 'attachment_accepted', 'offline_attachment', attachmentId, {
    outcome: 'uploaded',
    attachmentId,
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256: digest,
    operationId,
  }, companyId);
  return json({ ok: true, attachment: { id: attachmentId, operationId, originalName: name, mimeType, sizeBytes: bytes.byteLength, sha256: digest, status: 'uploaded', backupStatus:'provider_required' } }, 201);
}

export async function routeOffline(request: Request, env: OfflineEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/offline/bootstrap' && request.method === 'GET') return bootstrap(request, env, context);
  if (url.pathname === '/api/offline/sync' && request.method === 'POST') return sync(request, env, context);
  if (url.pathname === '/api/offline/activity' && request.method === 'GET') return activity(request, env, context);
  if (url.pathname === '/api/offline/telemetry' && request.method === 'POST') return telemetry(request, env, context);
  if (url.pathname === '/api/offline/owner/overview' && request.method === 'GET') return ownerOverview(request, env, context);
  if (url.pathname === '/api/offline/owner/detail' && request.method === 'GET') return ownerDetail(request, env, context);
  if (url.pathname === '/api/offline/owner/policy' && (request.method === 'GET' || request.method === 'POST')) return ownerPolicy(request, env, context);
  if (url.pathname === '/api/offline/owner/revoke' && request.method === 'POST') return ownerRevoke(request, env, context);
  const attachmentPrefix = '/api/offline/attachments/';
  if (url.pathname.startsWith(attachmentPrefix) && request.method === 'PUT') return uploadAttachment(request, env, context, url.pathname.slice(attachmentPrefix.length));
  return null;
}
