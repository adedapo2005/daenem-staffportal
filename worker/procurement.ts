import {
  hasPermission,
  requestIp,
  requestLocationLabel,
  type AuthEnv,
  type SessionContext,
} from './auth';

interface ProcurementEnv extends AuthEnv {
  TIMEZONE?: string;
}

type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

type CommitmentTransitionStatus = 'ordered' | 'partially_received' | 'received' | 'cancelled';

type TransitionBody = {
  toStatus?: unknown;
  reason?: unknown;
  idempotencyKey?: unknown;
  capturedAt?: unknown;
  clientTimezone?: unknown;
};

type PurchaseOrderRow = {
  id: string;
  companyId: string;
  spendExpenseRequestId?: string;
  status: PurchaseOrderStatus;
  amountKobo: number;
  sourceReference: string;
  lastStatusEventId?: string;
};

type StatusEventRow = {
  id: string;
  purchaseOrderId: string;
  companyId: string;
  spendExpenseRequestId: string;
  fromStatus: PurchaseOrderStatus;
  toStatus: CommitmentTransitionStatus;
  amountKobo: number;
  actorEmployeeId: string;
  sessionId: string;
  reason: string;
  sourceReference: string;
  requestId: string;
  idempotencyKey: string;
  deviceId?: string;
  ipAddress?: string;
  networkLocation?: string;
  clientTimezone: string;
  capturedAt: string;
  serverReceivedAt: string;
};

const transitionTargets: Record<PurchaseOrderStatus, ReadonlySet<CommitmentTransitionStatus>> = {
  draft: new Set(),
  submitted: new Set(),
  approved: new Set(['ordered', 'cancelled']),
  ordered: new Set(['partially_received', 'received', 'cancelled']),
  partially_received: new Set(['received', 'cancelled']),
  received: new Set(),
  cancelled: new Set(),
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const safeText = (value: unknown, max = 240) => String(value || '').trim().slice(0, max);
const owner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');
const member = (context: SessionContext, companyId: string) => context.companies.some((company) => company.id === companyId);
const validId = (value: string) => /^[A-Za-z0-9:_-]{1,180}$/.test(value);

function parseCapturedAt(value: unknown) {
  const raw = safeText(value, 80);
  const time = new Date(raw);
  return raw && Number.isFinite(time.getTime()) ? time.toISOString() : undefined;
}

function requestCorrelationId(request: Request) {
  return safeText(request.headers.get('x-request-id') || request.headers.get('cf-ray'), 180) || uid('procurement-request');
}

function decodePathId(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return validId(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function sameIdempotentTransition(existing: StatusEventRow, purchaseOrder: PurchaseOrderRow, toStatus: CommitmentTransitionStatus) {
  return existing.purchaseOrderId === purchaseOrder.id
    && existing.companyId === purchaseOrder.companyId
    && existing.spendExpenseRequestId === purchaseOrder.spendExpenseRequestId
    && existing.toStatus === toStatus
    && Number(existing.amountKobo) === Number(purchaseOrder.amountKobo);
}

function transitionResponse(event: StatusEventRow, status: PurchaseOrderStatus, deduplicated: boolean) {
  return {
    ok: true,
    deduplicated,
    purchaseOrder: {
      id: event.purchaseOrderId,
      companyId: event.companyId,
      spendExpenseRequestId: event.spendExpenseRequestId,
      status,
      amountKobo: Number(event.amountKobo),
      sourceReference: event.sourceReference,
    },
    event: {
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      amountKobo: Number(event.amountKobo),
      actorEmployeeId: event.actorEmployeeId,
      sessionId: event.sessionId,
      reason: event.reason,
      sourceReference: event.sourceReference,
      requestId: event.requestId,
      idempotencyKey: event.idempotencyKey,
      deviceId: event.deviceId || null,
      ipAddress: event.ipAddress || null,
      networkLocation: event.networkLocation || null,
      clientTimezone: event.clientTimezone,
      capturedAt: event.capturedAt,
      serverReceivedAt: event.serverReceivedAt,
      auditState: 'verified',
    },
  };
}

async function findSessionEvidence(env: ProcurementEnv, context: SessionContext) {
  return env.DB.prepare(`
    SELECT device_id AS deviceId, ip_address AS ipAddress
    FROM auth_sessions
    WHERE id=? AND employee_id=? AND revoked_at IS NULL
    LIMIT 1
  `).bind(context.sessionId, context.employee.id).first<{ deviceId?: string; ipAddress?: string }>();
}

async function findPurchaseOrder(env: ProcurementEnv, id: string) {
  return env.DB.prepare(`
    SELECT id,
           company_id AS companyId,
           spend_expense_request_id AS spendExpenseRequestId,
           status,
           total_kobo AS amountKobo,
           po_no AS sourceReference,
           last_status_event_id AS lastStatusEventId
    FROM purchase_orders
    WHERE id=?
    LIMIT 1
  `).bind(id).first<PurchaseOrderRow>();
}

async function findEventByIdempotencyKey(env: ProcurementEnv, key: string) {
  return env.DB.prepare(`
    SELECT id,
           purchase_order_id AS purchaseOrderId,
           company_id AS companyId,
           spend_expense_request_id AS spendExpenseRequestId,
           from_status AS fromStatus,
           to_status AS toStatus,
           amount_kobo AS amountKobo,
           actor_employee_id AS actorEmployeeId,
           session_id AS sessionId,
           reason,
           source_reference AS sourceReference,
           request_id AS requestId,
           idempotency_key AS idempotencyKey,
           device_id AS deviceId,
           ip_address AS ipAddress,
           network_location AS networkLocation,
           client_timezone AS clientTimezone,
           captured_at AS capturedAt,
           server_received_at AS serverReceivedAt
    FROM purchase_order_status_events
    WHERE idempotency_key=?
    LIMIT 1
  `).bind(key).first<StatusEventRow>();
}

async function findSavedTransition(env: ProcurementEnv, eventId: string) {
  return env.DB.prepare(`
    SELECT e.id,
           e.purchase_order_id AS purchaseOrderId,
           e.company_id AS companyId,
           e.spend_expense_request_id AS spendExpenseRequestId,
           e.from_status AS fromStatus,
           e.to_status AS toStatus,
           e.amount_kobo AS amountKobo,
           e.actor_employee_id AS actorEmployeeId,
           e.session_id AS sessionId,
           e.reason,
           e.source_reference AS sourceReference,
           e.request_id AS requestId,
           e.idempotency_key AS idempotencyKey,
           e.device_id AS deviceId,
           e.ip_address AS ipAddress,
           e.network_location AS networkLocation,
           e.client_timezone AS clientTimezone,
           e.captured_at AS capturedAt,
           e.server_received_at AS serverReceivedAt,
           po.status AS purchaseOrderStatus,
           po.last_status_event_id AS lastStatusEventId
    FROM purchase_order_status_events e
    JOIN purchase_orders po ON po.id=e.purchase_order_id
    WHERE e.id=?
    LIMIT 1
  `).bind(eventId).first<StatusEventRow & { purchaseOrderStatus: PurchaseOrderStatus; lastStatusEventId?: string }>();
}

export async function routeProcurement(request: Request, env: ProcurementEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const routePrefix = '/api/procurement/purchase-orders/';
  const match = url.pathname.startsWith(routePrefix)
    ? url.pathname.slice(routePrefix.length).match(/^([^/]+)\/transition$/)
    : null;
  if (!match) return null;
  if (request.method !== 'POST') return json({ error: 'Only POST is supported for Purchase Order transitions.' }, 405);

  const purchaseOrderId = decodePathId(match[1]);
  if (!purchaseOrderId) return json({ error: 'Purchase Order identifier is invalid.' }, 400);

  let body: TransitionBody;
  try {
    body = await request.json() as TransitionBody;
  } catch {
    return json({ error: 'Invalid Purchase Order transition request.' }, 400);
  }

  const target = safeText(body.toStatus, 40) as CommitmentTransitionStatus;
  if (!transitionTargets.approved.has(target) && !transitionTargets.ordered.has(target) && !transitionTargets.partially_received.has(target)) {
    return json({ error: 'Purchase Order transition target is invalid.' }, 400);
  }
  const reason = safeText(body.reason, 1000);
  const idempotencyKey = safeText(body.idempotencyKey, 180);
  const capturedAt = parseCapturedAt(body.capturedAt);
  const clientTimezone = safeText(body.clientTimezone, 80);
  if (!reason || reason.length < 3 || !idempotencyKey || !capturedAt || !clientTimezone) {
    return json({ error: 'toStatus, reason, idempotencyKey, capturedAt and clientTimezone are required.' }, 400);
  }

  const purchaseOrder = await findPurchaseOrder(env, purchaseOrderId);
  if (!purchaseOrder) return json({ error: 'Purchase Order not found.' }, 404);
  if (!member(context, purchaseOrder.companyId)) return json({ error: 'Purchase Order not found.' }, 404);
  if (!owner(context) && !hasPermission(context, 'procurement.access', 'approve', purchaseOrder.companyId)) {
    return json({ error: 'Procurement approval permission is required.' }, 403);
  }
  if (!purchaseOrder.spendExpenseRequestId) {
    return json({ error: 'This transition boundary only supports Spend-linked Purchase Orders.' }, 409);
  }

  // Idempotency is checked before the current-state matrix so a response-loss
  // retry can safely return the original result after the PO has advanced.
  const existing = await findEventByIdempotencyKey(env, idempotencyKey);
  if (existing) {
    if (!sameIdempotentTransition(existing, purchaseOrder, target)) {
      return json({ error: 'This idempotency key is already bound to a different Purchase Order transition.', errorCategory: 'idempotency-conflict' }, 409);
    }
    return json(transitionResponse(existing, purchaseOrder.status, true));
  }

  if (!transitionTargets[purchaseOrder.status]?.has(target)) {
    return json({ error: `Purchase Order cannot transition from ${purchaseOrder.status} to ${target}.`, errorCategory: 'invalid-transition' }, 409);
  }

  const sessionEvidence = await findSessionEvidence(env, context);
  const deviceId = safeText(request.headers.get('x-daenem-device-id'), 160) || safeText(sessionEvidence?.deviceId, 160) || null;
  const ipAddress = requestIp(request) || safeText(sessionEvidence?.ipAddress, 160) || null;
  const networkLocation = requestLocationLabel(request) || null;
  const correlationId = requestCorrelationId(request);
  const serverReceivedAt = new Date().toISOString();
  const eventId = uid('po-status-event');
  const metadata = {
    source: 'staffportal.procurement.transition',
    actorEmployeeId: context.employee.id,
    sessionId: context.sessionId,
    requestId: correlationId,
    deviceId,
    ipAddress,
    networkLocation,
    clientTimezone,
    capturedAt,
    serverReceivedAt,
    fromStatus: purchaseOrder.status,
    toStatus: target,
    amountKobo: Number(purchaseOrder.amountKobo),
  };

  try {
    // The INSERT derives company, Spend request, from-status, amount and PO
    // number from the canonical row. The event trigger independently checks
    // the same relationship before the following status update runs.
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO purchase_order_status_events(
          id,purchase_order_id,company_id,spend_expense_request_id,from_status,to_status,
          amount_kobo,actor_employee_id,session_id,reason,source_reference,request_id,
          idempotency_key,device_id,ip_address,network_location,client_timezone,
          captured_at,server_received_at,metadata_json
        )
        SELECT ?,po.id,po.company_id,po.spend_expense_request_id,po.status,?,
               po.total_kobo,?,?,?,po.po_no,?,?,?,?,?,?,?,?,?
        FROM purchase_orders po
        WHERE po.id=?
          AND po.status=?
          AND po.spend_expense_request_id IS NOT NULL
      `).bind(
        eventId,
        target,
        context.employee.id,
        context.sessionId,
        reason,
        correlationId,
        idempotencyKey,
        deviceId,
        ipAddress,
        networkLocation,
        clientTimezone,
        capturedAt,
        serverReceivedAt,
        JSON.stringify(metadata),
        purchaseOrderId,
        purchaseOrder.status,
      ),
      env.DB.prepare(`
        UPDATE purchase_orders
        SET status=?, last_status_event_id=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
          AND status=?
          AND spend_expense_request_id=?
          AND total_kobo=?
      `).bind(
        target,
        eventId,
        purchaseOrderId,
        purchaseOrder.status,
        purchaseOrder.spendExpenseRequestId,
        Number(purchaseOrder.amountKobo),
      ),
      env.DB.prepare(`
        INSERT INTO audit_logs(
          id,actor_employee_id,company_id,module,action,entity_type,entity_id,
          before_json,after_json,reason,source,request_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        uid('audit'),
        context.employee.id,
        purchaseOrder.companyId,
        'procurement',
        'purchase_order_transition',
        'purchase_order',
        purchaseOrderId,
        JSON.stringify({ status: purchaseOrder.status, amountKobo: Number(purchaseOrder.amountKobo), sourceReference: purchaseOrder.sourceReference }),
        JSON.stringify({ status: target, amountKobo: Number(purchaseOrder.amountKobo), sourceReference: purchaseOrder.sourceReference, eventId }),
        reason,
        'web',
        correlationId,
      ),
    ]);
  } catch {
    const retry = await findEventByIdempotencyKey(env, idempotencyKey);
    if (retry && sameIdempotentTransition(retry, purchaseOrder, target)) {
      const savedRetry = await findSavedTransition(env, retry.id);
      if (savedRetry) return json(transitionResponse(savedRetry, savedRetry.purchaseOrderStatus, true));
    }
    return json({ error: 'Purchase Order transition was rejected by the canonical audit boundary.', errorCategory: 'transition-rejected' }, 409);
  }

  const saved = await findSavedTransition(env, eventId);
  if (!saved || saved.purchaseOrderStatus !== target || saved.lastStatusEventId !== eventId) {
    return json({ error: 'Purchase Order transition could not be confirmed.', errorCategory: 'transition-conflict' }, 409);
  }
  return json(transitionResponse(saved, saved.purchaseOrderStatus, false), 201);
}
