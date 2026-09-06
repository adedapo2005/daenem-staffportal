import {
  hasPermission,
  logSecurity,
  requestIp,
  requestLocationLabel,
  type AuthEnv,
  type SessionContext,
} from './auth';

interface SpendEnv extends AuthEnv {
  FILES: R2Bucket;
  TIMEZONE?: string;
  APP_VERSION?: string;
}

type SpendAction = 'submit' | 'approve' | 'return' | 'reject';
type AllocationMethod = 'percentage' | 'fixed_amount' | 'equal_split';
type AllocationRow = {
  companyId: string;
  department: string;
  costCenterId: string;
  allocationMethod: AllocationMethod;
  sourceAmountKobo: number;
  allocatedAmountKobo: number;
  roundingAdjustmentKobo: number;
  basis: Record<string, unknown>;
};
type AllocationAmountsResult = { amounts: number[] } | { error: string };
type AllocationRowsResult = AllocationRow[] | { error: string };
type SerializedRequest = Record<string, unknown> & {
  requestNo?: unknown;
  requesterName?: unknown;
  companyName?: unknown;
  events?: Array<Record<string, unknown>>;
};

const json = (body: Record<string, unknown> | unknown[], status = 200, headers?: HeadersInit) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json; charset=utf-8');
  responseHeaders.set('cache-control', 'no-store');
  responseHeaders.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const businessTimezone = (env: SpendEnv) => env.TIMEZONE || 'Africa/Lagos';
const owner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');
const safeText = (value: unknown, max = 240) => String(value || '').trim().slice(0, max);
const normalised = (value: unknown) => safeText(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const duplicateNameKey = (value: unknown) => normalised(value).replace(/\b(?:limited|ltd|plc|incorporated|inc|llc)\b/g, ' ').replace(/\s+/g, ' ').trim();
const validId = (value: unknown, max = 180) => /^[A-Za-z0-9:_-]+$/.test(safeText(value, max));
const positiveInteger = (value: unknown) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const parseIso = (value: unknown) => {
  const text = safeText(value, 80);
  return Number.isFinite(new Date(text).getTime()) ? text : undefined;
};

function companyInScope(context: SessionContext, companyId: string) {
  return context.companies.some((company) => company.id === companyId);
}

function can(context: SessionContext, code: string, level: 'view' | 'create' | 'edit' | 'approve' | 'manage', companyId?: string) {
  return owner(context) || hasPermission(context, code, level, companyId);
}

function error(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

function requestId(request: Request) {
  return request.headers.get('x-request-id') || request.headers.get('cf-ray') || undefined;
}

function safeMetadata(request: Request, context: SessionContext, details: Record<string, unknown> = {}) {
  const allowed = ['requestNo', 'categoryId', 'supplierId', 'directShared', 'status', 'action', 'reason', 'missingEvidenceReason', 'outcome', 'errorCategory', 'masterKind', 'source', 'duplicateWarning', 'attachmentId', 'mimeType', 'sizeBytes', 'sha256'];
  const metadata: Record<string, unknown> = {
    employeeId: context.employee.id,
    sessionId: context.sessionId,
    requestId: requestId(request),
    ipAddress: requestIp(request),
    networkLocation: requestLocationLabel(request),
    clientTimezone: safeText(details.clientTimezone, 80) || undefined,
    capturedAt: parseIso(details.capturedAt),
    serverReceivedAt: new Date().toISOString(),
    applicationVersion: safeText(details.applicationVersion, 80) || undefined,
    deviceId: safeText(request.headers.get('x-daenem-device-id'), 160) || undefined,
  };
  for (const key of allowed) if (details[key] !== undefined) metadata[key] = details[key];
  return metadata;
}

async function audit(
  env: SpendEnv,
  request: Request,
  context: SessionContext,
  action: string,
  entityType: string,
  entityId: string | undefined,
  companyId: string | undefined,
  details: Record<string, unknown> = {},
  reason?: string,
) {
  const metadata = safeMetadata(request, context, details);
  await env.DB.prepare(`
    INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,reason,source,request_id)
    VALUES(?,?,?,?,?,?,?,?,?,'web',?)
  `).bind(
    uid('audit'), context.employee.id, companyId || null, 'spend', action, entityType, entityId || null,
    JSON.stringify(metadata), reason || null, requestId(request) || null,
  ).run();
}

async function event(
  env: SpendEnv,
  request: Request,
  context: SessionContext,
  expenseRequestId: string,
  companyId: string,
  action: string,
  previousStatus: string | undefined,
  nextStatus: string | undefined,
  reason: string | undefined,
  details: Record<string, unknown> = {},
) {
  await env.DB.prepare(`
    INSERT INTO spend_expense_events(
      id,expense_request_id,actor_employee_id,company_id,action,previous_status,next_status,
      reason,request_id,source,captured_at,metadata_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    uid('spend-event'), expenseRequestId, context.employee.id, companyId, action,
    previousStatus || null, nextStatus || null, reason || null, requestId(request) || null,
    request.url.includes('/api/offline/sync') ? 'offline' : 'web', parseIso(details.capturedAt) || null, JSON.stringify(safeMetadata(request, context, details)),
  ).run();
}

async function deny(env: SpendEnv, request: Request, context: SessionContext, companyId: string | undefined, message: string, action = 'permission_denied') {
  await audit(env, request, context, action, 'spend', undefined, companyId, { outcome: 'rejected', errorCategory: 'permission-denied' });
  await logSecurity(env, request, 'spend_permission_denied', {
    employeeId: context.employee.id,
    companyId,
    sessionId: context.sessionId,
    result: 'rejected',
    details: { action },
  });
  return error(message, 403);
}

function amountKobo(body: Record<string, unknown>) {
  const direct = positiveInteger(body.totalKobo || body.amountKobo);
  if (direct) return direct;
  const naira = Number(body.amountNaira || body.totalNaira || 0);
  return Number.isFinite(naira) && naira > 0 ? Math.round(naira * 100) : 0;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) as Array<Record<string, unknown>>;
}

async function categoryRow(env: SpendEnv, categoryId: string, companyId: string) {
  return env.DB.prepare(`
    SELECT id,company_id AS companyId,name,code,accounting_treatment_id AS accountingTreatmentId,
      employee_request_allowed AS employeeRequestAllowed,evidence_required AS evidenceRequired,
      direct_shared_policy AS directSharedPolicy,default_cost_center_id AS defaultCostCenterId,
      allowed_erp_json AS allowedErpJson,active
    FROM spend_categories
    WHERE id=? AND active=1 AND (company_id IS NULL OR company_id=?)
  `).bind(categoryId, companyId).first<Record<string, unknown>>();
}

async function possibleMasterDuplicate(env: SpendEnv, kind: string, name: string, companyId: string) {
  const table = kind === 'supplier' ? 'spend_suppliers' : kind === 'category' ? 'spend_categories' : 'spend_cost_centers';
  const rows = kind === 'cost_center'
    ? await env.DB.prepare(`SELECT id,name FROM ${table} WHERE active=1 AND company_id=? ORDER BY name LIMIT 200`).bind(companyId).all<Record<string, unknown>>()
    : await env.DB.prepare(`SELECT id,name FROM ${table} WHERE active=1 AND (company_id=? OR company_id IS NULL) ORDER BY name LIMIT 200`).bind(companyId).all<Record<string, unknown>>();
  const candidate = duplicateNameKey(name);
  return (rows.results || []).find((row) => duplicateNameKey(row.name) === candidate);
}

async function costCenterRow(env: SpendEnv, id: string, companyId: string) {
  return env.DB.prepare(`SELECT id,company_id AS companyId,code,name,active FROM spend_cost_centers WHERE id=? AND company_id=? AND active=1`).bind(id, companyId).first<Record<string, unknown>>();
}

async function supplierRow(env: SpendEnv, id: string, companyId: string) {
  return env.DB.prepare(`SELECT id,company_id AS companyId,name,active FROM spend_suppliers WHERE id=? AND active=1 AND (company_id IS NULL OR company_id=?)`).bind(id, companyId).first<Record<string, unknown>>();
}

async function projectRow(env: SpendEnv, id: string, companyId: string) {
  return env.DB.prepare(`SELECT id,company_id AS companyId,name,status FROM construction_projects WHERE id=? AND company_id=? AND status NOT IN ('cancelled')`).bind(id, companyId).first<Record<string, unknown>>();
}

async function evidenceRequirement(env: SpendEnv, categoryId: string, companyId: string, amount: number) {
  const category = await env.DB.prepare(`SELECT evidence_required AS evidenceRequired FROM spend_categories WHERE id=? AND (company_id IS NULL OR company_id=?)`).bind(categoryId, companyId).first<{ evidenceRequired: number }>();
  const policy = await env.DB.prepare(`
    SELECT required,minimum_count AS minimumCount,requires_reason_if_missing AS requiresReason
    FROM spend_evidence_policies
    WHERE active=1 AND (company_id IS NULL OR company_id=?) AND (category_id IS NULL OR category_id=?) AND min_amount_kobo<=?
    ORDER BY category_id IS NULL ASC,min_amount_kobo DESC LIMIT 1
  `).bind(companyId, categoryId, amount).first<{ required: number; minimumCount: number; requiresReason: number }>();
  return {
    required: policy ? policy.required !== 0 : category?.evidenceRequired !== 0,
    minimumCount: policy ? Math.max(0, Number(policy.minimumCount || 1)) : category?.evidenceRequired !== 0 ? 1 : 0,
    requiresReason: policy ? policy.requiresReason !== 0 : true,
  };
}

async function matchingApprovalRules(env: SpendEnv, context: SessionContext, companyId: string, body: Record<string, unknown>, categoryId: string, costCenterId: string, amount: number) {
  const rows = await env.DB.prepare(`
    SELECT id,company_id AS companyId,branch_location_id AS branchLocationId,department,category_id AS categoryId,
      cost_center_id AS costCenterId,project_id AS projectId,requester_role_code AS requesterRoleCode,
      min_amount_kobo AS minAmountKobo,max_amount_kobo AS maxAmountKobo,step_no AS stepNo,
      approver_role_code AS approverRoleCode,required_permission AS requiredPermission
    FROM spend_approval_rules WHERE active=1 AND (company_id IS NULL OR company_id=?)
    ORDER BY step_no ASC,(company_id IS NULL) ASC,(branch_location_id IS NULL) ASC,(department IS NULL) ASC,(category_id IS NULL) ASC,(cost_center_id IS NULL) ASC,(project_id IS NULL) ASC,min_amount_kobo DESC,id ASC
  `).bind(companyId).all<Record<string, unknown>>();
  const roleCodes = context.roles.filter((role) => role.companyId === companyId).map((role) => role.code);
  const department = safeText(body.department || context.employee.department, 160);
  const matches = (row: Record<string, unknown>) => {
    if (row.branchLocationId && row.branchLocationId !== safeText(body.branchLocationId, 160)) return false;
    if (row.department && row.department !== department) return false;
    if (row.categoryId && row.categoryId !== categoryId) return false;
    if (row.costCenterId && row.costCenterId !== costCenterId) return false;
    if (row.projectId && row.projectId !== safeText(body.projectId, 160)) return false;
    if (row.requesterRoleCode && !roleCodes.includes(String(row.requesterRoleCode))) return false;
    if (amount < Number(row.minAmountKobo || 0)) return false;
    if (row.maxAmountKobo != null && amount > Number(row.maxAmountKobo)) return false;
    return true;
  };
  const result = (rows.results || []).filter(matches);
  if (result.length) {
    const selected = new Map<number, Record<string, unknown>>();
    for (const row of result) {
      const step = Number(row.stepNo || 1);
      if (!selected.has(step)) selected.set(step, row);
    }
    return [...selected.entries()].sort(([left], [right]) => left - right).map(([, row]) => row);
  }
  return [{ id: 'spend-approval-default', stepNo: 1, approverRoleCode: 'manager', requiredPermission: 'expense.approve' }];
}

function allocationAmounts(method: AllocationMethod, sourceAmount: number, rows: Array<Record<string, unknown>>): AllocationAmountsResult {
  if (!rows.length) return { error: 'A shared expense needs at least one beneficiary.' };
  const amounts: number[] = [];
  if (method === 'fixed_amount') {
    for (const row of rows) amounts.push(positiveInteger(row.fixedAmountKobo || row.amountKobo));
    if (amounts.some((value) => value <= 0) || amounts.reduce((sum, value) => sum + value, 0) !== sourceAmount) return { error: 'Fixed allocations must reconcile exactly to the source amount.' };
  } else if (method === 'percentage') {
    const percentages = rows.map((row) => Number(row.percentage || 0));
    if (percentages.some((value) => !Number.isFinite(value) || value < 0) || Math.abs(percentages.reduce((sum, value) => sum + value, 0) - 100) > 0.0001) return { error: 'Percentage allocations must total exactly 100%.' };
    let allocated = 0;
    percentages.forEach((percentage, index) => {
      const amount = index === percentages.length - 1 ? sourceAmount - allocated : Math.floor(sourceAmount * percentage / 100);
      amounts.push(amount);
      allocated += amount;
    });
  } else {
    const base = Math.floor(sourceAmount / rows.length);
    let remainder = sourceAmount - base * rows.length;
    rows.forEach(() => {
      const amount = base + (remainder > 0 ? 1 : 0);
      amounts.push(amount);
      remainder -= remainder > 0 ? 1 : 0;
    });
  }
  if (amounts.reduce((sum, value) => sum + value, 0) !== sourceAmount) return { error: 'Allocations do not reconcile to the source amount.' };
  return { amounts };
}

async function allocationRows(env: SpendEnv, context: SessionContext, companyId: string, amount: number, directShared: string, body: Record<string, unknown>): Promise<AllocationRowsResult> {
  const supplied = parseArray(body.allocations);
  if (directShared === 'direct' && !supplied.length) return [{ companyId, department: safeText(body.department || context.employee.department, 160), costCenterId: safeText(body.costCenterId, 160), allocationMethod: 'fixed_amount' as AllocationMethod, sourceAmountKobo: amount, allocatedAmountKobo: amount, roundingAdjustmentKobo: 0, basis: { source: 'direct' } }];
  if (!supplied.length) return { error: 'Select beneficiaries and allocation shares for a shared expense.' };
  const method = safeText(body.allocationMethod || supplied[0].method || 'percentage', 40) as AllocationMethod;
  if (!['percentage', 'fixed_amount', 'equal_split'].includes(method)) return { error: 'Select a supported allocation method.' };
  const destinations = supplied.map((row) => safeText(row.companyId, 160));
  const destinationAllowed = owner(context) || can(context, 'expense.allocations', 'manage');
  const activeCompanies = destinationAllowed
    ? await env.DB.prepare(`SELECT id FROM companies WHERE active=1`).all<{ id: string }>()
    : { results: context.companies.map((company) => ({ id: company.id })) };
  const allowed = new Set((activeCompanies.results || []).map((row) => row.id));
  if (destinations.some((destination) => !allowed.has(destination))) return { error: 'One or more beneficiary companies are outside your authorized scope.' };
  if (new Set(destinations).size !== destinations.length) return { error: 'Each beneficiary company may appear only once.' };
  const calculated = allocationAmounts(method, amount, supplied);
  if ('error' in calculated) return calculated;
  return supplied.map((row, index) => ({
    companyId: destinations[index],
    department: safeText(row.department || body.department, 160),
    costCenterId: safeText(row.costCenterId || body.costCenterId, 160),
    allocationMethod: method,
    sourceAmountKobo: amount,
    allocatedAmountKobo: calculated.amounts[index],
    roundingAdjustmentKobo: method === 'percentage' && index === calculated.amounts.length - 1 ? amount - calculated.amounts.reduce((sum, value) => sum + value, 0) : 0,
    basis: { method, percentage: row.percentage, fixedAmountKobo: row.fixedAmountKobo, source: safeText(row.source || 'employee-selected', 80) },
  }));
}

async function requestById(env: SpendEnv, id: string) {
  return env.DB.prepare(`
    SELECT r.id,r.request_no AS requestNo,r.requester_employee_id AS requesterEmployeeId,
      e.display_name AS requesterName,e.employee_no AS requesterNo,e.department AS requesterDepartment,
      r.company_id AS companyId,c.code AS companyCode,c.name AS companyName,
      r.branch_location_id AS branchLocationId,cl.name AS branchName,r.department,
      r.cost_center_id AS costCenterId,cc.code AS costCenterCode,cc.name AS costCenterName,
      r.category_id AS categoryId,cat.name AS categoryName,cat.code AS categoryCode,
      r.supplier_id AS supplierId,sup.name AS supplierName,r.project_id AS projectId,cp.name AS projectName,
      r.erp_module AS erpModule,r.context_entity_type AS contextEntityType,r.context_entity_id AS contextEntityId,
      r.currency,r.purpose,r.business_reason AS businessReason,r.needed_by AS neededBy,r.total_kobo AS totalKobo,
      r.direct_shared AS directShared,r.payment_method AS paymentMethod,r.bank_reference AS bankReference,
      r.accounting_treatment_id AS accountingTreatmentId,t.code AS accountingTreatmentCode,t.name AS accountingTreatmentName,
      t.profit_effect AS profitEffect,t.is_p_and_l AS isPandl,r.status,r.captured_at AS capturedAt,
      COALESCE(p.recognized_kobo,0) AS recognizedKobo,
      r.submitted_at AS submittedAt,r.approved_at AS approvedAt,r.committed_at AS committedAt,r.paid_at AS paidAt,
      r.posted_at AS postedAt,r.created_at AS createdAt,r.updated_at AS updatedAt
    FROM spend_expense_requests r
    JOIN employees e ON e.id=r.requester_employee_id
    JOIN companies c ON c.id=r.company_id
    LEFT JOIN company_locations cl ON cl.id=r.branch_location_id
    LEFT JOIN spend_cost_centers cc ON cc.id=r.cost_center_id
    LEFT JOIN spend_categories cat ON cat.id=r.category_id
    LEFT JOIN spend_suppliers sup ON sup.id=r.supplier_id
    LEFT JOIN construction_projects cp ON cp.id=r.project_id
    JOIN spend_accounting_treatments t ON t.id=r.accounting_treatment_id
    LEFT JOIN spend_accounting_postings p ON p.expense_request_id=r.id
    WHERE r.id=? LIMIT 1
  `).bind(id).first<Record<string, unknown>>();
}

async function visibleRequest(env: SpendEnv, context: SessionContext, row: Record<string, unknown>) {
  const companyId = String(row.companyId || '');
  if (!companyInScope(context, companyId)) return false;
  if (owner(context) || can(context, 'expense.review', 'view', companyId) || can(context, 'expense.approve', 'view', companyId)) return true;
  return String(row.requesterEmployeeId) === context.employee.id && can(context, 'expense.own', 'view', companyId);
}

function safeOwnerAuditDetails(value: unknown) {
  let parsed: Record<string, unknown> = {};
  try { parsed = parseObject(JSON.parse(String(value || '{}'))); } catch { parsed = {}; }
  const allowed = ['employeeId', 'sessionId', 'deviceId', 'requestId', 'ipAddress', 'networkLocation', 'clientTimezone', 'capturedAt', 'serverReceivedAt', 'applicationVersion', 'outcome', 'errorCategory', 'action', 'status', 'categoryId', 'supplierId', 'directShared', 'missingEvidenceReason', 'attachmentId', 'mimeType', 'sizeBytes', 'sha256'];
  return Object.fromEntries(allowed.filter((key) => parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '').map((key) => [key, parsed[key]]));
}

async function serializeRequest(env: SpendEnv, context: SessionContext, row: Record<string, unknown>, detailed = false): Promise<SerializedRequest> {
  const [lines, allocations, evidence, approvals, events, auditRows] = await Promise.all([
    env.DB.prepare(`SELECT l.id,l.line_no AS lineNo,l.description,l.amount_kobo AS amountKobo,l.direct_shared AS directShared,l.category_id AS categoryId,c.name AS categoryName,t.code AS accountingTreatmentCode FROM spend_expense_lines l JOIN spend_categories c ON c.id=l.category_id JOIN spend_accounting_treatments t ON t.id=l.accounting_treatment_id WHERE l.expense_request_id=? ORDER BY l.line_no`).bind(row.id).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT a.id,a.company_id AS companyId,c.code AS companyCode,c.name AS companyName,a.department,a.cost_center_id AS costCenterId,cc.name AS costCenterName,a.allocation_method AS allocationMethod,a.basis_json AS basisJson,a.source_amount_kobo AS sourceAmountKobo,a.allocated_amount_kobo AS allocatedAmountKobo,a.rounding_adjustment_kobo AS roundingAdjustmentKobo FROM spend_expense_allocations a JOIN companies c ON c.id=a.company_id LEFT JOIN spend_cost_centers cc ON cc.id=a.cost_center_id WHERE a.expense_request_id=? ORDER BY a.company_id`).bind(row.id).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,evidence_type AS evidenceType,original_name AS originalName,mime_type AS mimeType,size_bytes AS sizeBytes,sha256,status,captured_at AS capturedAt,client_timezone AS clientTimezone,uploaded_at AS uploadedAt,verified_at AS verifiedAt FROM spend_expense_evidence WHERE expense_request_id=? AND employee_id=? ORDER BY created_at`).bind(row.id, String(row.requesterEmployeeId)).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT a.id,a.step_no AS stepNo,a.approver_role_code AS approverRoleCode,a.status,a.reason,a.acted_at AS actedAt,e.display_name AS approverName FROM spend_expense_approvals a LEFT JOIN employees e ON e.id=a.approver_employee_id WHERE a.expense_request_id=? ORDER BY a.step_no`).bind(row.id).all<Record<string, unknown>>(),
    detailed ? env.DB.prepare(`SELECT id,action,previous_status AS previousStatus,next_status AS nextStatus,reason,request_id AS requestId,captured_at AS capturedAt,server_received_at AS serverReceivedAt,metadata_json AS metadataJson FROM spend_expense_events WHERE expense_request_id=? ORDER BY server_received_at ASC`).bind(row.id).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    detailed && owner(context) ? env.DB.prepare(`SELECT id,occurred_at AS occurredAt,action,entity_type AS entityType,entity_id AS entityId,reason,source,request_id AS requestId,after_json AS afterJson FROM audit_logs WHERE module='spend' AND entity_id=? ORDER BY occurred_at ASC LIMIT 100`).bind(row.id).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] }),
  ]);
  const parseBasis = allocations.results?.map((allocation) => {
    let basis: Record<string, unknown> = {};
    try { basis = JSON.parse(String(allocation.basisJson || '{}')) as Record<string, unknown>; } catch { basis = {}; }
    const { basisJson: _basisJson, ...rest } = allocation;
    return { ...rest, basis };
  }) || [];
  const status = String(row.status || '');
  const commitmentStates = new Set(['committed', 'purchased', 'paid', 'evidence_verified', 'finance_posted', 'bank_reconciled', 'closed']);
  const paidStates = new Set(['paid', 'evidence_verified', 'finance_posted', 'bank_reconciled', 'closed']);
  return {
    ...row,
    committedKobo: commitmentStates.has(status) ? Number(row.totalKobo || 0) : 0,
    paidKobo: paidStates.has(status) ? Number(row.totalKobo || 0) : 0,
    lines: lines.results || [],
    allocations: parseBasis,
    evidence: evidence.results || [],
    approvals: approvals.results || [],
    ...(detailed ? { events: (events.results || []).map((item) => { const { metadataJson: _metadataJson, ...safe } = item; return safe; }) } : {}),
    ...(detailed && owner(context) ? { auditEvidence: (auditRows.results || []).map((item) => ({ id: item.id, occurredAt: item.occurredAt, action: item.action, entityType: item.entityType, entityId: item.entityId, reason: item.reason, source: item.source, requestId: item.requestId, details: safeOwnerAuditDetails(item.afterJson) })) } : {}),
  };
}

async function listRequests(request: Request, env: SpendEnv, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = safeText(url.searchParams.get('companyId'), 160);
  const scopedCompanyIds = owner(context)
    ? ((await env.DB.prepare(`SELECT id FROM companies WHERE active=1`).all<{ id: string }>()).results || []).map((row) => row.id)
    : context.companies.map((company) => company.id);
  if (companyId && !scopedCompanyIds.includes(companyId)) return error('Company access is not assigned.', 403);
  const reviewCompanyIds = owner(context)
    ? scopedCompanyIds
    : context.companies.filter((company) => can(context, 'expense.review', 'view', company.id)).map((company) => company.id);
  const bindings: unknown[] = [];
  const conditions: string[] = [];
  if (companyId) {
    conditions.push('r.company_id=?');
    bindings.push(companyId);
    if (!reviewCompanyIds.includes(companyId)) {
      conditions.push('r.requester_employee_id=?');
      bindings.push(context.employee.id);
    }
  } else if (scopedCompanyIds.length) {
    conditions.push(`r.company_id IN (${scopedCompanyIds.map(() => '?').join(',')})`);
    bindings.push(...scopedCompanyIds);
    if (reviewCompanyIds.length && !owner(context)) {
      conditions.push(`(r.company_id IN (${reviewCompanyIds.map(() => '?').join(',')}) OR r.requester_employee_id=?)`);
      bindings.push(...reviewCompanyIds, context.employee.id);
    } else if (!owner(context)) {
      conditions.push('r.requester_employee_id=?');
      bindings.push(context.employee.id);
    }
  } else return json({ serverTime: new Date().toISOString(), businessTimezone: businessTimezone(env), requests: [] });
  const rows = await env.DB.prepare(`
    SELECT r.id,r.request_no AS requestNo,r.requester_employee_id AS requesterEmployeeId,e.display_name AS requesterName,
      r.company_id AS companyId,c.code AS companyCode,c.name AS companyName,r.category_id AS categoryId,cat.name AS categoryName,
      r.supplier_id AS supplierId,sup.name AS supplierName,r.total_kobo AS totalKobo,r.currency,r.direct_shared AS directShared,
      r.status,r.created_at AS createdAt,r.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM spend_expense_evidence ev WHERE ev.expense_request_id=r.id) AS evidenceCount,
      (SELECT COUNT(*) FROM spend_expense_approvals ap WHERE ap.expense_request_id=r.id AND ap.status='pending') AS pendingApprovalCount
    FROM spend_expense_requests r
    JOIN employees e ON e.id=r.requester_employee_id JOIN companies c ON c.id=r.company_id
    LEFT JOIN spend_categories cat ON cat.id=r.category_id LEFT JOIN spend_suppliers sup ON sup.id=r.supplier_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.updated_at DESC LIMIT 100
  `).bind(...bindings).all<Record<string, unknown>>();
  return json({ serverTime: new Date().toISOString(), businessTimezone: businessTimezone(env), requests: rows.results || [] });
}

async function createExpense(request: Request, env: SpendEnv, context: SessionContext, body: Record<string, unknown>, submit: boolean) {
  const companyId = safeText(body.companyId, 160);
  if (!companyId || !companyInScope(context, companyId)) return deny(env, request, context, companyId, 'Company access is not assigned.');
  if (!can(context, 'expense.requests', 'create', companyId)) return deny(env, request, context, companyId, 'Expense request creation is not assigned.');
  const categoryId = safeText(body.categoryId, 180);
  const category = await categoryRow(env, categoryId, companyId);
  if (!category || Number(category.employeeRequestAllowed) === 0) return error('Select an active controlled expense category.', 422, { errorCategory: 'master-data' });
  if (String(category.accountingTreatmentId) === 'spend-treatment-payroll') return error('Payroll is sourced from the canonical payroll ledger and cannot be duplicated as an expense request.', 422, { errorCategory: 'accounting' });
  const erpModule = safeText(body.erpModule, 60);
  let allowedErp: string[] = [];
  try { const parsed = JSON.parse(String(category.allowedErpJson || '[]')); if (Array.isArray(parsed)) allowedErp = parsed.map(String); } catch { allowedErp = []; }
  if (erpModule && allowedErp.length && !allowedErp.includes(erpModule)) return error('This category is not enabled for the selected ERP context.', 422, { errorCategory: 'master-data' });
  const costCenterId = safeText(body.costCenterId || category.defaultCostCenterId, 180);
  const costCenter = costCenterId ? await costCenterRow(env, costCenterId, companyId) : null;
  if (!costCenter) return error('Select an active controlled cost center.', 422, { errorCategory: 'master-data' });
  const supplierId = safeText(body.supplierId, 180);
  if (supplierId && !(await supplierRow(env, supplierId, companyId))) return error('Select an active controlled supplier.', 422, { errorCategory: 'master-data' });
  const projectId = safeText(body.projectId, 180);
  if (projectId && !(await projectRow(env, projectId, companyId))) return error('Select an active project in the selected company.', 422, { errorCategory: 'master-data' });
  const amount = amountKobo(body);
  if (!amount || amount > 10_000_000_000) return error('Enter a valid amount.', 422, { errorCategory: 'validation' });
  const purpose = safeText(body.purpose, 240);
  const businessReason = safeText(body.businessReason || body.reason, 1000);
  if (purpose.length < 3 || businessReason.length < 3) return error('Purpose and business reason are required.', 422, { errorCategory: 'validation' });
  const rawLines = parseArray(body.lines);
  const directShared = safeText(body.directShared || (parseArray(body.allocations).length ? 'shared' : category.directSharedPolicy === 'shared' ? 'shared' : 'direct'), 20);
  if (!['direct', 'shared', 'mixed'].includes(directShared)) return error('Select Direct, Shared or Mixed expense treatment.', 422, { errorCategory: 'validation' });
  if (category.directSharedPolicy !== 'either' && category.directSharedPolicy !== directShared && !(directShared === 'mixed' && category.directSharedPolicy === 'shared')) return error('This category does not allow that direct/shared treatment.', 422, { errorCategory: 'policy' });
  const lines = rawLines.length ? rawLines : [{ description: purpose, amountKobo: amount, categoryId, directShared: directShared === 'direct' ? 'direct' : 'shared' }];
  const lineAmounts = lines.map((line) => positiveInteger(line.amountKobo || (Number(line.amountNaira || 0) * 100)));
  if (lineAmounts.some((lineAmount) => !lineAmount) || lineAmounts.reduce((sum, lineAmount) => sum + lineAmount, 0) !== amount) return error('Expense lines must reconcile exactly to the request total.', 422, { errorCategory: 'allocation' });
  for (const line of lines) {
    const lineCategoryId = safeText(line.categoryId || categoryId, 180);
    const lineCategory = await categoryRow(env, lineCategoryId, companyId);
    if (!lineCategory || Number(lineCategory.employeeRequestAllowed) === 0) return error('Every expense line must use an active controlled category.', 422, { errorCategory: 'master-data' });
    if (String(lineCategory.accountingTreatmentId) === 'spend-treatment-payroll') return error('Payroll cannot be entered as a second expense ledger.', 422, { errorCategory: 'accounting' });
    if (String(lineCategory.accountingTreatmentId) !== String(category.accountingTreatmentId)) return error('All lines in a request must use the same accounting treatment.', 422, { errorCategory: 'accounting' });
    if (!['direct', 'shared'].includes(safeText(line.directShared || (directShared === 'direct' ? 'direct' : 'shared'), 20))) return error('Every expense line needs a valid direct/shared designation.', 422, { errorCategory: 'validation' });
  }
  const allocationsResult = await allocationRows(env, context, companyId, amount, directShared, { ...body, costCenterId });
  if (!Array.isArray(allocationsResult)) return error(allocationsResult.error, 422, { errorCategory: 'allocation' });
  const allocationTotal = allocationsResult.reduce((sum, row) => sum + row.allocatedAmountKobo, 0);
  if (allocationTotal !== amount) return error('Allocations must total exactly the source amount.', 422, { errorCategory: 'allocation' });
  if (directShared !== 'direct' && allocationsResult.length < 2) return error('A shared expense must name at least two beneficiary companies.', 422, { errorCategory: 'allocation' });
  const suppliedId = safeText(body.requestId, 180);
  const id = suppliedId && validId(suppliedId) ? suppliedId : uid('expense');
  const existing = await requestById(env, id);
  const evidenceRule = await evidenceRequirement(env, categoryId, companyId, amount);
  const evidenceRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM spend_expense_evidence WHERE expense_request_id=? AND status IN ('uploaded','verified')`).bind(id).first<{ count: number }>();
  const evidenceCount = Math.max(0, Number(evidenceRow?.count || 0));
  if (submit && evidenceRule.required && evidenceCount < evidenceRule.minimumCount && !safeText(body.missingEvidenceReason, 300)) return error('Attach the required evidence or explain why it is unavailable.', 422, { errorCategory: 'evidence' });
  if (existing && (String(existing.requesterEmployeeId) !== context.employee.id || String(existing.companyId) !== companyId)) {
    await audit(env, request, context, 'expense_request_rejected', 'expense_request', id, companyId, { outcome: 'identity-mismatch', errorCategory: 'idempotency-mismatch' });
    return error('This request identifier belongs to another employee or company.', 409, { errorCategory: 'idempotency-mismatch' });
  }
  const requestNo = existing?.requestNo ? String(existing.requestNo) : `EXP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const status = submit ? 'submitted' : (existing?.status === 'submitted' || existing?.status === 'approved' ? String(existing.status) : 'draft');
  const capturedAt = parseIso(body.capturedAt) || new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (existing) {
    if (!['draft', 'returned'].includes(String(existing.status)) && status !== String(existing.status)) return error('This request can no longer be edited.', 409, { errorCategory: 'state' });
    statements.push(env.DB.prepare(`UPDATE spend_expense_requests SET branch_location_id=?,department=?,cost_center_id=?,category_id=?,supplier_id=?,project_id=?,erp_module=?,context_entity_type=?,context_entity_id=?,purpose=?,business_reason=?,needed_by=?,total_kobo=?,direct_shared=?,payment_method=?,bank_reference=?,accounting_treatment_id=?,status=?,captured_at=?,submitted_at=CASE WHEN ?='submitted' THEN COALESCE(submitted_at,CURRENT_TIMESTAMP) ELSE submitted_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
      safeText(body.branchLocationId, 180) || null, safeText(body.department || context.employee.department, 160) || null, costCenterId,
      categoryId, supplierId || null, projectId || null, safeText(body.erpModule, 60) || null, safeText(body.contextEntityType, 80) || null,
      safeText(body.contextEntityId, 180) || null, purpose, businessReason, parseIso(body.neededBy) || null, amount, directShared,
      safeText(body.paymentMethod, 80) || null, safeText(body.bankReference, 180) || null, String(category.accountingTreatmentId), status, capturedAt, status, id,
    ));
    statements.push(env.DB.prepare('DELETE FROM spend_expense_lines WHERE expense_request_id=?').bind(id));
    statements.push(env.DB.prepare('DELETE FROM spend_expense_allocations WHERE expense_request_id=?').bind(id));
    if (status === 'submitted') statements.push(env.DB.prepare('DELETE FROM spend_expense_approvals WHERE expense_request_id=?').bind(id));
  } else {
    statements.push(env.DB.prepare(`INSERT INTO spend_expense_requests(id,request_no,requester_employee_id,company_id,branch_location_id,department,cost_center_id,category_id,supplier_id,project_id,erp_module,context_entity_type,context_entity_id,purpose,business_reason,needed_by,total_kobo,direct_shared,payment_method,bank_reference,accounting_treatment_id,status,captured_at,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='submitted' THEN CURRENT_TIMESTAMP ELSE NULL END)`).bind(
      id, requestNo, context.employee.id, companyId, safeText(body.branchLocationId, 180) || null, safeText(body.department || context.employee.department, 160) || null,
      costCenterId, categoryId, supplierId || null, projectId || null, safeText(body.erpModule, 60) || null, safeText(body.contextEntityType, 80) || null,
      safeText(body.contextEntityId, 180) || null, purpose, businessReason, parseIso(body.neededBy) || null, amount, directShared,
      safeText(body.paymentMethod, 80) || null, safeText(body.bankReference, 180) || null, String(category.accountingTreatmentId), status, capturedAt, status,
    ));
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineCategoryId = safeText(line.categoryId || categoryId, 180);
    const lineCategory = await categoryRow(env, lineCategoryId, companyId);
    statements.push(env.DB.prepare(`INSERT INTO spend_expense_lines(id,expense_request_id,line_no,description,amount_kobo,category_id,direct_shared,accounting_treatment_id) VALUES(?,?,?,?,?,?,?,?)`).bind(
      uid('expense-line'), id, index + 1, safeText(line.description || purpose, 500), lineAmounts[index], lineCategoryId,
      safeText(line.directShared || (directShared === 'direct' ? 'direct' : 'shared'), 20), String(lineCategory?.accountingTreatmentId || category.accountingTreatmentId),
    ));
  }
  for (const allocation of allocationsResult) {
    const cc = allocation.costCenterId
      ? await costCenterRow(env, allocation.costCenterId, allocation.companyId)
      : await env.DB.prepare(`SELECT id,company_id AS companyId,code,name,active FROM spend_cost_centers WHERE company_id=? AND active=1 ORDER BY CASE WHEN code='GENERAL' THEN 0 ELSE 1 END,name LIMIT 1`).bind(allocation.companyId).first<Record<string, unknown>>();
    if (!cc) return error('Every beneficiary needs an active cost center.', 422, { errorCategory: 'master-data' });
    statements.push(env.DB.prepare(`INSERT INTO spend_expense_allocations(id,expense_request_id,company_id,department,cost_center_id,allocation_method,basis_json,source_amount_kobo,allocated_amount_kobo,rounding_adjustment_kobo) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
      uid('expense-allocation'), id, allocation.companyId, allocation.department || null, cc.id, allocation.allocationMethod,
      JSON.stringify(allocation.basis), allocation.sourceAmountKobo, allocation.allocatedAmountKobo, allocation.roundingAdjustmentKobo,
    ));
  }
  if (status === 'submitted') {
    const rules = await matchingApprovalRules(env, context, companyId, body, categoryId, costCenterId, amount);
    for (const rule of rules) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO spend_expense_approvals(id,expense_request_id,rule_id,step_no,approver_role_code,status) VALUES(?,?,?,?,?,'pending')`).bind(uid('expense-approval'), id, rule.id || null, Number(rule.stepNo || 1), safeText(rule.approverRoleCode, 80) || 'manager'));
  }
  await env.DB.batch(statements);
  const next = await requestById(env, id);
  if (!next) return error('The expense request could not be saved.', 500);
  const missingEvidenceReason = safeText(body.missingEvidenceReason, 300) || undefined;
  await event(env, request, context, id, companyId, existing ? 'request_updated' : 'request_created', existing?.status ? String(existing.status) : undefined, status, missingEvidenceReason, { requestNo, status, categoryId, directShared, capturedAt, clientTimezone: body.clientTimezone, missingEvidenceReason });
  await audit(env, request, context, submit ? 'expense_request_submitted' : existing ? 'expense_request_updated' : 'expense_request_draft_saved', 'expense_request', id, companyId, { requestNo, status, categoryId, directShared, capturedAt, clientTimezone: body.clientTimezone, missingEvidenceReason });
  return json({ ok: true, request: await serializeRequest(env, context, next, false), deduplicated: Boolean(existing && safeText(request.headers.get('idempotency-key'), 200)) }, existing ? 200 : 201);
}

async function actionExpense(request: Request, env: SpendEnv, context: SessionContext, id: string) {
  let body: Record<string, unknown>;
  try { body = parseObject(await request.json()); } catch { return error('Invalid expense action.', 400); }
  const action = safeText(body.action, 40) as SpendAction;
  if (!['submit', 'approve', 'return', 'reject'].includes(action)) return error('This expense action is not supported in Batch 1.', 400);
  const current = await requestById(env, id);
  if (!current || !(await visibleRequest(env, context, current))) return error('Expense request not found.', 404);
  const companyId = String(current.companyId);
  const requesterId = String(current.requesterEmployeeId);
  if (action === 'submit') {
    if (requesterId !== context.employee.id && !can(context, 'expense.review', 'edit', companyId)) return deny(env, request, context, companyId, 'You cannot submit this request.');
    if (!can(context, 'expense.requests', 'create', companyId)) return deny(env, request, context, companyId, 'Expense request creation is not assigned.');
    if (!['draft', 'returned'].includes(String(current.status))) return error('Only a draft or returned request can be submitted.', 409);
    const rule = await evidenceRequirement(env, String(current.categoryId), companyId, Number(current.totalKobo));
    const evidence = await env.DB.prepare(`SELECT COUNT(*) AS count FROM spend_expense_evidence WHERE expense_request_id=?`).bind(id).first<{ count: number }>();
    if (rule.required && Number(evidence?.count || 0) < rule.minimumCount && !safeText(body.missingEvidenceReason, 300)) return error('Attach required evidence or provide a missing-evidence reason.', 422, { errorCategory: 'evidence' });
    await env.DB.batch([
      env.DB.prepare(`UPDATE spend_expense_requests SET status='submitted',submitted_at=COALESCE(submitted_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
      env.DB.prepare('DELETE FROM spend_expense_approvals WHERE expense_request_id=?').bind(id),
    ]);
    const rules = await matchingApprovalRules(env, context, companyId, current, String(current.categoryId), String(current.costCenterId), Number(current.totalKobo));
    await env.DB.batch(rules.map((ruleRow) => env.DB.prepare(`INSERT OR IGNORE INTO spend_expense_approvals(id,expense_request_id,rule_id,step_no,approver_role_code,status) VALUES(?,?,?,?,?,'pending')`).bind(uid('expense-approval'), id, ruleRow.id || null, Number(ruleRow.stepNo || 1), safeText(ruleRow.approverRoleCode, 80) || 'manager')));
    await event(env, request, context, id, companyId, 'request_submitted', String(current.status), 'submitted', safeText(body.missingEvidenceReason, 300) || undefined, { capturedAt: body.capturedAt, clientTimezone: body.clientTimezone });
    return json({ ok: true, request: await serializeRequest(env, context, (await requestById(env, id))!, true) });
  }
  if (action === 'approve') {
    if (!can(context, 'expense.approve', 'approve', companyId)) return deny(env, request, context, companyId, 'Approval permission is required.');
    if (requesterId === context.employee.id) return error('Maker-checker policy prevents approving your own request.', 403, { errorCategory: 'maker-checker' });
    if (!['submitted', 'reviewed'].includes(String(current.status))) return error('This request is not awaiting approval.', 409);
    const pending = await env.DB.prepare(`SELECT id,step_no AS stepNo,approver_role_code AS approverRoleCode FROM spend_expense_approvals WHERE expense_request_id=? AND status='pending' ORDER BY step_no LIMIT 1`).bind(id).first<{ id: string; stepNo: number; approverRoleCode: string }>();
    if (!pending) return error('This request has no pending approval step.', 409, { errorCategory: 'approval-state' });
    const assignedRole = context.roles.some((role) => role.code === String(pending.approverRoleCode) && (!role.companyId || role.companyId === companyId));
    if (!owner(context) && !assignedRole) return deny(env, request, context, companyId, 'This approval step is assigned to another role.', 'approval_role_denied');
    const pendingCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM spend_expense_approvals WHERE expense_request_id=? AND status='pending'`).bind(id).first<{ count: number }>();
    const nextStatus = Number(pendingCount?.count || 0) <= 1 ? 'approved' : 'reviewed';
    await env.DB.batch([
      env.DB.prepare(`UPDATE spend_expense_approvals SET status='approved',approver_employee_id=?,acted_at=CURRENT_TIMESTAMP WHERE id=?`).bind(context.employee.id, pending.id),
      env.DB.prepare(`UPDATE spend_expense_requests SET status=?,approved_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nextStatus, nextStatus, id),
    ]);
    await event(env, request, context, id, companyId, 'request_approved', String(current.status), nextStatus, undefined, { action: 'approve', stepNo: pending.stepNo });
    await audit(env, request, context, 'expense_request_approved', 'expense_request', id, companyId, { outcome: nextStatus, action: 'approve', stepNo: pending.stepNo });
    return json({ ok: true, request: await serializeRequest(env, context, (await requestById(env, id))!, true) });
  }
  if (!can(context, 'expense.approve', 'approve', companyId)) return deny(env, request, context, companyId, 'Only an assigned reviewer can return or reject this request.');
  const reason = safeText(body.reason, 1000);
  if (reason.length < 3) return error('A reason is required for return or rejection.', 422);
  const nextStatus = action === 'return' ? 'returned' : 'rejected';
  await env.DB.batch([
    env.DB.prepare(`UPDATE spend_expense_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nextStatus, id),
    env.DB.prepare(`UPDATE spend_expense_approvals SET status=?,approver_employee_id=?,reason=?,acted_at=CURRENT_TIMESTAMP WHERE expense_request_id=? AND status='pending'`).bind(nextStatus === 'returned' ? 'returned' : 'rejected', context.employee.id, reason, id),
  ]);
  await event(env, request, context, id, companyId, nextStatus === 'returned' ? 'request_returned' : 'request_rejected', String(current.status), nextStatus, reason, { action });
  await audit(env, request, context, nextStatus === 'returned' ? 'expense_request_returned' : 'expense_request_rejected', 'expense_request', id, companyId, { outcome: nextStatus, action, reason });
  return json({ ok: true, request: await serializeRequest(env, context, (await requestById(env, id))!, true) });
}

async function postExpense(request: Request, env: SpendEnv, context: SessionContext, id: string) {
  const current = await requestById(env, id);
  if (!current || !(await visibleRequest(env, context, current))) return error('Expense request not found.', 404);
  const companyId = String(current.companyId);
  if (!can(context, 'expense.post', 'manage', companyId)) return deny(env, request, context, companyId, 'Finance posting permission is required.');
  if (String(current.requesterEmployeeId) === context.employee.id) return error('Maker-checker policy prevents posting your own request.', 403, { errorCategory: 'maker-checker' });
  if (String(current.status) !== 'approved') return error('Only an approved request can be posted in Batch 1.', 409);
  const existing = await env.DB.prepare(`SELECT id,journal_entry_id AS journalEntryId,recognized_kobo AS recognizedKobo FROM spend_accounting_postings WHERE expense_request_id=?`).bind(id).first<Record<string, unknown>>();
  if (existing) return json({ ok: true, posted: true, deduplicated: true, journalEntryId: existing.journalEntryId, recognizedKobo: existing.recognizedKobo });
  const treatment = await env.DB.prepare(`SELECT id,code,profit_effect AS profitEffect,is_p_and_l AS isPandl FROM spend_accounting_treatments WHERE id=?`).bind(current.accountingTreatmentId).first<Record<string, unknown>>();
  if (!treatment) return error('The accounting treatment is unavailable.', 503);
  const accountCode = treatment.profitEffect === 'cogs' ? '5000' : treatment.profitEffect === 'operating' ? '6000' : '1300';
  const accounts = await env.DB.prepare(`SELECT id,code FROM finance_accounts WHERE company_id=? AND code IN (?, '2000') AND active=1`).bind(companyId, accountCode).all<{ id: string; code: string }>();
  const debit = accounts.results?.find((row) => row.code === accountCode);
  const payable = accounts.results?.find((row) => row.code === '2000');
  if (!debit || !payable) return error('The company chart of accounts is not ready for this posting.', 503, { errorCategory: 'finance-setup' });
  const entryId = uid('journal');
  const entryNo = `EXP-${String(current.requestNo).replace(/[^A-Za-z0-9-]/g, '').slice(-32)}`;
  const recognized = Number(treatment.isPandl) === 1 ? Number(current.totalKobo) : 0;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO journal_entries(id,company_id,entry_no,entry_date,description,source_module,source_type,source_id,reference,status,currency,prepared_by,approved_by,approved_at,posted_at) VALUES(?,?,?,?,?,'spend','expense_request',?,?, 'posted','NGN',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(entryId, companyId, entryNo, new Date().toISOString().slice(0, 10), `Expense request ${current.requestNo}`, current.requestNo, current.id, context.employee.id, context.employee.id),
    env.DB.prepare(`INSERT INTO journal_lines(id,journal_entry_id,account_id,description,debit_kobo,cost_center,metadata_json) VALUES(?,?,?,?,?,?,?)`).bind(uid('journal-line'), entryId, debit.id, String(current.accountingTreatmentName), Number(current.totalKobo), String(current.costCenterCode || ''), JSON.stringify({ source: 'spend', expenseRequestId: id, treatment: treatment.code })),
    env.DB.prepare(`INSERT INTO journal_lines(id,journal_entry_id,account_id,description,credit_kobo,metadata_json) VALUES(?,?,?,?,?,?)`).bind(uid('journal-line'), entryId, payable.id, `Payable for ${current.requestNo}`, Number(current.totalKobo), JSON.stringify({ source: 'spend', expenseRequestId: id })),
    env.DB.prepare(`INSERT INTO spend_accounting_postings(id,expense_request_id,journal_entry_id,company_id,accounting_treatment_id,amount_kobo,recognized_kobo,posting_date,posted_by,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uid('spend-posting'), id, entryId, companyId, current.accountingTreatmentId, Number(current.totalKobo), recognized, new Date().toISOString().slice(0, 10), context.employee.id, requestId(request) || null),
    env.DB.prepare(`UPDATE spend_expense_requests SET status='finance_posted',posted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
  ]);
  await event(env, request, context, id, companyId, 'finance_posted', 'approved', 'finance_posted', undefined, { action: 'finance_post' });
  await audit(env, request, context, 'expense_finance_posted', 'expense_request', id, companyId, { outcome: 'posted', action: 'finance_post' });
  return json({ ok: true, posted: true, journalEntryId: entryId, recognizedKobo: recognized }, 201);
}

async function approvals(request: Request, env: SpendEnv, context: SessionContext) {
  const companyId = safeText(new URL(request.url).searchParams.get('companyId'), 160);
  if (companyId && !companyInScope(context, companyId)) return error('Company access is not assigned.', 403);
  const allowed = context.companies.filter((company) => (!companyId || company.id === companyId) && can(context, 'expense.approve', 'view', company.id));
  if (!allowed.length && !owner(context)) return error('Expense approval access is not assigned.', 403);
  const ids = owner(context) ? (await env.DB.prepare(`SELECT id FROM companies WHERE active=1`).all<{ id: string }>()).results?.map((row) => row.id) || [] : allowed.map((company) => company.id);
  if (!ids.length) return json({ approvals: [] });
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT a.id AS approvalId,a.step_no AS stepNo,a.approver_role_code AS approverRoleCode,a.status AS approvalStatus,
      r.id,r.request_no AS requestNo,r.requester_employee_id AS requesterEmployeeId,e.display_name AS requesterName,
      r.company_id AS companyId,c.name AS companyName,r.total_kobo AS totalKobo,r.currency,r.category_id AS categoryId,cat.name AS categoryName,
      r.supplier_id AS supplierId,sup.name AS supplierName,r.business_reason AS businessReason,r.direct_shared AS directShared,r.status,
      (SELECT COUNT(*) FROM spend_expense_evidence ev WHERE ev.expense_request_id=r.id) AS evidenceCount
    FROM spend_expense_approvals a JOIN spend_expense_requests r ON r.id=a.expense_request_id
    JOIN employees e ON e.id=r.requester_employee_id JOIN companies c ON c.id=r.company_id
    LEFT JOIN spend_categories cat ON cat.id=r.category_id LEFT JOIN spend_suppliers sup ON sup.id=r.supplier_id
    WHERE a.status='pending' AND r.company_id IN (${placeholders}) ORDER BY r.updated_at DESC LIMIT 100
  `).bind(...ids).all<Record<string, unknown>>();
  return json({ serverTime: new Date().toISOString(), approvals: rows.results || [] });
}

async function bootstrap(request: Request, env: SpendEnv, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = safeText(url.searchParams.get('companyId'), 160) || context.companies.find((company) => company.primary)?.id || context.companies[0]?.id || '';
  if (!companyId || !companyInScope(context, companyId)) return error('Company access is not assigned.', 403);
  if (!can(context, 'expense.requests', 'create', companyId) && !can(context, 'expense.own', 'view', companyId)) return error('Expense access is not assigned.', 403);
  const [categories, costCenters, suppliers, templates, projects] = await Promise.all([
    env.DB.prepare(`SELECT id,code,name,accounting_treatment_id AS accountingTreatmentId,employee_request_allowed AS employeeRequestAllowed,evidence_required AS evidenceRequired,direct_shared_policy AS directSharedPolicy,default_cost_center_id AS defaultCostCenterId,allowed_erp_json AS allowedErpJson FROM spend_categories WHERE active=1 AND employee_request_allowed=1 AND (company_id IS NULL OR company_id=?) ORDER BY name`).bind(companyId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,code,name FROM spend_cost_centers WHERE company_id=? AND active=1 ORDER BY name`).bind(companyId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,name,phone,email FROM spend_suppliers WHERE active=1 AND (company_id IS NULL OR company_id=?) ORDER BY name LIMIT 200`).bind(companyId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT t.id,t.name,t.method,t.default_treatment_id AS defaultTreatmentId,i.company_id AS beneficiaryCompanyId,i.percentage,i.fixed_amount_kobo AS fixedAmountKobo,i.cost_center_id AS costCenterId FROM spend_allocation_templates t LEFT JOIN spend_allocation_template_items i ON i.template_id=t.id WHERE t.active=1 AND (t.company_id IS NULL OR t.company_id=?) ORDER BY t.name,i.sort_order`).bind(companyId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,project_no AS projectNo,name,status FROM construction_projects WHERE company_id=? AND status NOT IN ('cancelled') ORDER BY name LIMIT 100`).bind(companyId).all<Record<string, unknown>>(),
  ]);
  const permittedCompanyIds = new Set(context.companies.map((item) => item.id));
  const templateGroups = new Map<string, Record<string, unknown>[]>();
  for (const row of templates.results || []) {
    const key = String(row.id || '');
    const group = templateGroups.get(key) || [];
    group.push(row);
    templateGroups.set(key, group);
  }
  const safeTemplates = [...templateGroups.values()]
    .filter((group) => group.every((row) => !row.beneficiaryCompanyId || permittedCompanyIds.has(String(row.beneficiaryCompanyId))))
    .flat();
  const company = context.companies.find((item) => item.id === companyId);
  return json({
    serverTime: new Date().toISOString(), businessTimezone: businessTimezone(env), company,
    version: new Date().toISOString(), lastVerifiedAt: new Date().toISOString(),
    permissions: { create: can(context, 'expense.requests', 'create', companyId), approve: can(context, 'expense.approve', 'approve', companyId), post: can(context, 'expense.post', 'manage', companyId), master: can(context, 'expense.master', 'manage', companyId), allocations: can(context, 'expense.allocations', 'manage', companyId) },
    masterData: { categories: categories.results || [], costCenters: costCenters.results || [], suppliers: suppliers.results || [], allocationTemplates: safeTemplates, projects: projects.results || [] },
    offline: { supportedKinds: ['expense.draft.save', 'expense.request.submit', 'expense.evidence.upload'], revalidateBeforeSubmit: true },
  });
}

async function ownerOverview(request: Request, env: SpendEnv, context: SessionContext) {
  if (!owner(context)) return error('Owner access is required.', 403);
  const [metrics, treatments] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','voided','reversed') THEN total_kobo ELSE 0 END),0) AS requestedKobo,
        COALESCE(SUM(CASE WHEN status IN ('approved','committed','purchased','paid','evidence_verified','finance_posted','bank_reconciled','closed') THEN total_kobo ELSE 0 END),0) AS approvedKobo,
        COALESCE(SUM(CASE WHEN status IN ('committed','purchased','paid','evidence_verified','finance_posted','bank_reconciled','closed') THEN total_kobo ELSE 0 END),0) AS committedKobo,
        COALESCE(SUM(CASE WHEN status IN ('paid','evidence_verified','finance_posted','bank_reconciled','closed') THEN total_kobo ELSE 0 END),0) AS paidKobo,
        COALESCE(SUM(CASE WHEN direct_shared IN ('shared','mixed') THEN total_kobo ELSE 0 END),0) AS sharedKobo,
        COALESCE(SUM(CASE WHEN status='returned' THEN total_kobo ELSE 0 END),0) AS returnedKobo,
        COUNT(CASE WHEN status='submitted' THEN 1 END) AS pendingApprovals,
        COUNT(CASE WHEN status='returned' THEN 1 END) AS returnedRequests,
        COUNT(*) AS requestCount
      FROM spend_expense_requests
    `).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT t.profit_effect AS profitEffect,COALESCE(SUM(p.amount_kobo),0) AS amountKobo,COALESCE(SUM(p.recognized_kobo),0) AS recognizedKobo FROM spend_accounting_postings p JOIN spend_accounting_treatments t ON t.id=p.accounting_treatment_id GROUP BY t.profit_effect`).all<Record<string, unknown>>(),
  ]);
  const byTreatment = Object.fromEntries((treatments.results || []).map((row) => [String(row.profitEffect), { amountKobo: Number(row.amountKobo || 0), recognizedKobo: Number(row.recognizedKobo || 0) }]));
  const missingEvidence = await env.DB.prepare(`SELECT COUNT(*) AS count FROM spend_expense_requests r LEFT JOIN spend_expense_evidence e ON e.expense_request_id=r.id WHERE r.status NOT IN ('draft','rejected','cancelled','voided') GROUP BY r.id HAVING COUNT(e.id)=0`).all<{ count: number }>();
  return json({
    serverTime: new Date().toISOString(), businessTimezone: businessTimezone(env),
    metrics: {
      requestedKobo: Number(metrics?.requestedKobo || 0), approvedKobo: Number(metrics?.approvedKobo || 0), committedKobo: Number(metrics?.committedKobo || 0), paidKobo: Number(metrics?.paidKobo || 0), postedOperatingExpenseKobo: Number(byTreatment.operating?.recognizedKobo || 0), postedCogsKobo: Number(byTreatment.cogs?.recognizedKobo || 0), sharedExpenseKobo: Number(metrics?.sharedKobo || 0), unallocatedSharedExpenseKobo: 0, missingEvidence: missingEvidence.results?.length || 0, pendingApprovals: Number(metrics?.pendingApprovals || 0), returnedRequests: Number(metrics?.returnedRequests || 0), nonPnlPostedKobo: Number(byTreatment.non_pnl?.amountKobo || 0), requestCount: Number(metrics?.requestCount || 0),
    },
    profitability: { available: false, reason: 'Revenue, canonical COGS and canonical payroll are not yet complete enough in the existing Finance sources for a truthful group profit figure.' },
    sourceTruth: { groupRequestCountedOnce: true, approvedIsExposureNotActualExpense: true, actualProfitUsesPostedPAndLOnly: true },
  });
}

async function ownerDetail(request: Request, env: SpendEnv, context: SessionContext) {
  if (!owner(context)) return error('Owner access is required.', 403);
  const params = new URL(request.url).searchParams;
  const employeeId = safeText(params.get('employeeId'), 180);
  const companyId = safeText(params.get('companyId'), 180);
  const status = safeText(params.get('status'), 60);
  const categoryId = safeText(params.get('categoryId'), 180);
  const supplierId = safeText(params.get('supplierId'), 180);
  const erpModule = safeText(params.get('erpModule'), 60);
  const directShared = safeText(params.get('directShared'), 20);
  const eventAction = safeText(params.get('eventAction'), 80);
  const from = parseIso(params.get('from'));
  const to = parseIso(params.get('to'));
  const rows = await env.DB.prepare(`
    SELECT r.id,r.request_no AS requestNo,r.requester_employee_id AS requesterEmployeeId,e.display_name AS requesterName,e.employee_no AS requesterNo,e.department AS requesterDepartment,
      r.company_id AS companyId,c.code AS companyCode,c.name AS companyName,r.branch_location_id AS branchLocationId,cl.name AS branchName,r.department,
      r.cost_center_id AS costCenterId,cc.code AS costCenterCode,cc.name AS costCenterName,r.category_id AS categoryId,cat.name AS categoryName,
      r.supplier_id AS supplierId,sup.name AS supplierName,r.project_id AS projectId,cp.name AS projectName,r.erp_module AS erpModule,r.context_entity_type AS contextEntityType,r.context_entity_id AS contextEntityId,
      r.total_kobo AS totalKobo,r.currency,r.direct_shared AS directShared,r.accounting_treatment_id AS accountingTreatmentId,t.code AS accountingTreatmentCode,t.name AS accountingTreatmentName,t.profit_effect AS profitEffect,
      COALESCE(p.recognized_kobo,0) AS recognizedKobo,
      r.purpose,r.business_reason AS businessReason,r.status,r.captured_at AS capturedAt,r.submitted_at AS submittedAt,r.created_at AS createdAt,r.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM spend_expense_evidence ev WHERE ev.expense_request_id=r.id) AS evidenceCount,
      (SELECT COUNT(*) FROM spend_expense_approvals ap WHERE ap.expense_request_id=r.id AND ap.status='pending') AS pendingApprovalCount
    FROM spend_expense_requests r JOIN employees e ON e.id=r.requester_employee_id JOIN companies c ON c.id=r.company_id
      LEFT JOIN company_locations cl ON cl.id=r.branch_location_id LEFT JOIN spend_cost_centers cc ON cc.id=r.cost_center_id LEFT JOIN spend_categories cat ON cat.id=r.category_id
      LEFT JOIN spend_suppliers sup ON sup.id=r.supplier_id LEFT JOIN construction_projects cp ON cp.id=r.project_id JOIN spend_accounting_treatments t ON t.id=r.accounting_treatment_id LEFT JOIN spend_accounting_postings p ON p.expense_request_id=r.id
    WHERE (?='' OR r.requester_employee_id=?) AND (?='' OR r.company_id=?) AND (?='' OR r.status=?) AND (?='' OR r.category_id=?) AND (?='' OR r.supplier_id=?) AND (?='' OR r.erp_module=?) AND (?='' OR r.direct_shared=?)
      AND (? IS NULL OR r.created_at>=?) AND (? IS NULL OR r.created_at<=?) ORDER BY r.updated_at DESC LIMIT 100
  `).bind(employeeId, employeeId, companyId, companyId, status, status, categoryId, categoryId, supplierId, supplierId, erpModule, erpModule, directShared, directShared, from || null, from || null, to || null, to || null).all<Record<string, unknown>>();
  const selected = rows.results || [];
  const requests = await Promise.all(selected.map((row) => serializeRequest(env, context, row, true)));
  const filteredRequests = eventAction ? requests.filter((row) => Array.isArray(row.events) && (row.events as Array<Record<string, unknown>>).some((item) => String(item.action || '') === eventAction)) : requests;
  const events = filteredRequests.flatMap((row) => (row.events || []).map((item) => ({ ...item, requestNo: row.requestNo, employeeName: row.requesterName, companyName: row.companyName })));
  return json({ serverTime: new Date().toISOString(), businessTimezone: businessTimezone(env), filters: { employeeId, companyId, status, categoryId, supplierId, erpModule, directShared, eventAction, from, to }, requests: filteredRequests, events });
}

async function proposal(request: Request, env: SpendEnv, context: SessionContext) {
  let body: Record<string, unknown>;
  try { body = parseObject(await request.json()); } catch { return error('Invalid master-data proposal.', 400); }
  const kind = safeText(body.kind, 40);
  const companyId = safeText(body.companyId, 180);
  const proposedName = safeText(body.proposedName || body.name, 180);
  if (!['supplier', 'category', 'cost_center'].includes(kind) || !proposedName || !companyId || !companyInScope(context, companyId)) return error('A valid company and proposed master value are required.', 422);
  if (!can(context, 'expense.requests', 'create', companyId)) return deny(env, request, context, companyId, 'Expense request access is required to propose a master value.');
  const duplicate = await possibleMasterDuplicate(env, kind, proposedName, companyId);
  const id = uid('spend-proposal');
  await env.DB.prepare(`INSERT INTO spend_master_proposals(id,submitted_by,company_id,kind,proposed_name,normalized_name,details_json,status) VALUES(?,?,?,?,?,?,?,'proposed')`).bind(id, context.employee.id, companyId, kind, proposedName, normalised(proposedName), JSON.stringify({ erpModule: safeText(body.erpModule, 60), duplicateId: duplicate?.id || null })).run();
  await audit(env, request, context, 'master_value_proposed', 'spend_master_proposal', id, companyId, { masterKind: kind, duplicateWarning: Boolean(duplicate), outcome: 'proposed' });
  return json({ ok: true, proposalId: id, status: 'proposed', duplicateWarning: Boolean(duplicate), possibleMatch: duplicate ? { id: duplicate.id, name: duplicate.name } : null }, 201);
}

async function adminMaster(request: Request, env: SpendEnv, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = safeText(url.searchParams.get('companyId'), 180);
  const allowedCompanies = owner(context) ? (await env.DB.prepare(`SELECT id FROM companies WHERE active=1`).all<{ id: string }>()).results?.map((row) => row.id) || [] : context.companies.filter((company) => can(context, 'expense.master', 'manage', company.id)).map((company) => company.id);
  if (companyId && !allowedCompanies.includes(companyId)) return error('Master-data access is not assigned for this company.', 403);
  if (!allowedCompanies.length) return error('Master-data management permission is required.', 403);
  if (request.method === 'GET') {
    const ids = companyId ? [companyId] : allowedCompanies;
    const placeholders = ids.map(() => '?').join(',');
    const [categories, costCenters, suppliers, treatments, templates, rules, policies, proposals] = await Promise.all([
      env.DB.prepare(`SELECT id,company_id AS companyId,code,name,accounting_treatment_id AS accountingTreatmentId,employee_request_allowed AS employeeRequestAllowed,evidence_required AS evidenceRequired,direct_shared_policy AS directSharedPolicy,active,source FROM spend_categories WHERE active=1 AND (company_id IS NULL OR company_id IN (${placeholders})) ORDER BY name`).bind(...ids).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT id,company_id AS companyId,code,name,active,source FROM spend_cost_centers WHERE company_id IN (${placeholders}) ORDER BY companyId,name`).bind(...ids).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT id,company_id AS companyId,name,phone,email,active,source FROM spend_suppliers WHERE active=1 AND (company_id IS NULL OR company_id IN (${placeholders})) ORDER BY name`).bind(...ids).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT id,code,name,profit_effect AS profitEffect,is_p_and_l AS isPandl,active,source FROM spend_accounting_treatments ORDER BY name`).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT id,company_id AS companyId,name,method,active FROM spend_allocation_templates WHERE active=1 AND (company_id IS NULL OR company_id IN (${placeholders})) ORDER BY name`).bind(...ids).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT id,company_id AS companyId,department,min_amount_kobo AS minAmountKobo,max_amount_kobo AS maxAmountKobo,step_no AS stepNo,approver_role_code AS approverRoleCode,active FROM spend_approval_rules WHERE active=1 AND (company_id IS NULL OR company_id IN (${placeholders})) ORDER BY stepNo`).bind(...ids).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT id,company_id AS companyId,category_id AS categoryId,min_amount_kobo AS minAmountKobo,evidence_type AS evidenceType,required,minimum_count AS minimumCount,requires_reason_if_missing AS requiresReason,active FROM spend_evidence_policies WHERE active=1 AND (company_id IS NULL OR company_id IN (${placeholders}))`).bind(...ids).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT p.id,p.company_id AS companyId,p.kind,p.proposed_name AS proposedName,p.status,p.review_reason AS reviewReason,p.created_at AS createdAt,e.display_name AS submittedByName FROM spend_master_proposals p JOIN employees e ON e.id=p.submitted_by WHERE p.company_id IN (${placeholders}) ORDER BY p.created_at DESC LIMIT 100`).bind(...ids).all<Record<string, unknown>>(),
    ]);
    return json({ serverTime: new Date().toISOString(), businessTimezone: businessTimezone(env), categories: categories.results || [], costCenters: costCenters.results || [], suppliers: suppliers.results || [], treatments: treatments.results || [], allocationTemplates: templates.results || [], approvalRules: rules.results || [], evidencePolicies: policies.results || [], proposals: proposals.results || [] });
  }
  let body: Record<string, unknown>;
  try { body = parseObject(await request.json()); } catch { return error('Invalid master-data action.', 400); }
  const kind = safeText(body.kind, 40);
  const action = safeText(body.action, 40);
  const targetCompanyId = safeText(body.companyId, 180);
  if (targetCompanyId && !allowedCompanies.includes(targetCompanyId)) return error('Master-data access is not assigned for this company.', 403);
  if (!['category', 'supplier', 'cost_center', 'template', 'approval_rule', 'evidence_policy'].includes(kind)) return error('This master-data type is not available in Batch 1.', 400);
  if (!['create', 'activate', 'deactivate', 'merge'].includes(action)) return error('This master-data action is not available in Batch 1.', 400);
  const table = kind === 'category' ? 'spend_categories' : kind === 'supplier' ? 'spend_suppliers' : kind === 'cost_center' ? 'spend_cost_centers' : kind === 'template' ? 'spend_allocation_templates' : kind === 'approval_rule' ? 'spend_approval_rules' : 'spend_evidence_policies';
  if (action === 'create') {
    const name = safeText(body.name, 180);
    if ((['category', 'supplier', 'cost_center', 'template'].includes(kind) && !name) || (!targetCompanyId && !['approval_rule', 'evidence_policy'].includes(kind))) return error('Company and required master fields are required.', 422);
    const duplicate = ['category', 'supplier', 'cost_center'].includes(kind)
      ? await possibleMasterDuplicate(env, kind, name, targetCompanyId)
      : kind === 'template'
        ? await env.DB.prepare(`SELECT id,name FROM ${table} WHERE active=1 AND normalized_name=? AND (company_id=? OR company_id IS NULL) LIMIT 1`).bind(normalised(name), targetCompanyId).first<Record<string, unknown>>()
        : null;
    if (duplicate) return error('A similar active master value already exists. Review or merge it instead of creating a duplicate.', 409, { duplicateWarning: true, existing: { id: duplicate.id, name: duplicate.name } });
    const templateItems = kind === 'template' ? parseArray(body.items) : [];
    if (kind === 'template') {
      if (templateItems.length < 2) return error('An allocation template needs at least two controlled beneficiary companies.', 422, { errorCategory: 'allocation' });
      const beneficiaryIds = templateItems.map((item) => safeText(item.companyId, 180));
      if (beneficiaryIds.some((beneficiaryId) => !beneficiaryId || !companyInScope(context, beneficiaryId)) || new Set(beneficiaryIds).size !== beneficiaryIds.length) return error('Every template participant must be a distinct authorized company.', 403, { errorCategory: 'allocation' });
      const templateMethod = ['percentage','fixed_amount','equal_split'].includes(String(body.method)) ? String(body.method) : 'equal_split';
      if (templateMethod === 'percentage') {
        const total = templateItems.reduce((sum, item) => sum + Number(item.percentage || 0), 0);
        if (!Number.isFinite(total) || Math.abs(total - 100) > 0.0001 || templateItems.some((item) => !Number.isFinite(Number(item.percentage)) || Number(item.percentage) <= 0)) return error('Percentage template participants must total exactly 100%.', 422, { errorCategory: 'allocation' });
      }
      if (templateMethod === 'fixed_amount' && templateItems.some((item) => positiveInteger(item.fixedAmountKobo) <= 0)) return error('Fixed-amount template participants must have positive controlled amounts.', 422, { errorCategory: 'allocation' });
      for (const item of templateItems) {
        const beneficiaryId = safeText(item.companyId, 180);
        const itemCostCenterId = safeText(item.costCenterId, 180);
        if (itemCostCenterId && !(await costCenterRow(env, itemCostCenterId, beneficiaryId))) return error('Every template participant cost center must be active in that company.', 422, { errorCategory: 'master-data' });
      }
    }
    const id = uid(`spend-${kind}`);
    if (kind === 'category') {
      const treatment = safeText(body.accountingTreatmentId || 'spend-treatment-opex', 180);
      await env.DB.prepare(`INSERT INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,employee_request_allowed,evidence_required,direct_shared_policy,allowed_erp_json,source,created_by) VALUES(?,?,?,?,?,?,1,?,?,?, 'admin',?)`).bind(id, targetCompanyId, safeText(body.code || normalised(name).replaceAll(' ', '_').toUpperCase(), 50), name, normalised(name), treatment, body.evidenceRequired === false ? 0 : 1, ['direct','shared'].includes(String(body.directSharedPolicy)) ? body.directSharedPolicy : 'either', JSON.stringify(Array.isArray(body.allowedErp) ? body.allowedErp.map(String).slice(0, 10) : []), context.employee.id).run();
    } else if (kind === 'supplier') {
      await env.DB.prepare(`INSERT INTO spend_suppliers(id,company_id,name,normalized_name,phone,email,source,created_by) VALUES(?,?,?,?,?,?, 'admin',?)`).bind(id, targetCompanyId, name, normalised(name), safeText(body.phone, 60) || null, safeText(body.email, 160) || null, context.employee.id).run();
    } else if (kind === 'cost_center') {
      await env.DB.prepare(`INSERT INTO spend_cost_centers(id,company_id,code,name,source) VALUES(?,?,?,?, 'admin')`).bind(id, targetCompanyId, safeText(body.code || normalised(name).replaceAll(' ', '_').toUpperCase(), 50), name).run();
    } else if (kind === 'template') {
      await env.DB.prepare(`INSERT INTO spend_allocation_templates(id,company_id,name,normalized_name,method,default_treatment_id,active,created_by) VALUES(?,?,?,?,?,?,1,?)`).bind(id, targetCompanyId, name, normalised(name), ['percentage','fixed_amount','equal_split'].includes(String(body.method)) ? body.method : 'equal_split', safeText(body.defaultTreatmentId, 180) || null, context.employee.id).run();
      const items = templateItems;
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const beneficiaryCompanyId = safeText(item.companyId, 180);
        if (!beneficiaryCompanyId || !companyInScope(context, beneficiaryCompanyId)) return error('Every allocation template participant must be in your authorized company scope.', 403);
        const beneficiaryCostCenter = safeText(item.costCenterId, 180);
        if (beneficiaryCostCenter && !(await costCenterRow(env, beneficiaryCostCenter, beneficiaryCompanyId))) return error('Every allocation template participant needs an active cost center.', 422);
        await env.DB.prepare(`INSERT INTO spend_allocation_template_items(id,template_id,company_id,department,cost_center_id,percentage,fixed_amount_kobo,basis,sort_order) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uid('spend-template-item'), id, beneficiaryCompanyId, safeText(item.department, 160) || null, beneficiaryCostCenter || null, Number.isFinite(Number(item.percentage)) ? Number(item.percentage) : null, positiveInteger(item.fixedAmountKobo) || null, safeText(item.basis || 'admin-approved-template', 160), index).run();
      }
    } else if (kind === 'approval_rule') {
      const minAmount = Math.max(0, Math.floor(Number(body.minAmountKobo || 0)));
      const maxAmount = body.maxAmountKobo === undefined || body.maxAmountKobo === '' ? null : Math.max(0, Math.floor(Number(body.maxAmountKobo)));
      const stepNo = Math.max(1, Math.floor(Number(body.stepNo || 1)));
      const approverRoleCode = safeText(body.approverRoleCode || 'manager', 80);
      if (!approverRoleCode || (maxAmount !== null && maxAmount < minAmount)) return error('Approval threshold values are invalid.', 422);
      await env.DB.prepare(`INSERT INTO spend_approval_rules(id,company_id,department,category_id,cost_center_id,project_id,requester_role_code,min_amount_kobo,max_amount_kobo,step_no,approver_role_code,required_permission,active,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?)`).bind(id, targetCompanyId || null, safeText(body.department, 160) || null, safeText(body.categoryId, 180) || null, safeText(body.costCenterId, 180) || null, safeText(body.projectId, 180) || null, safeText(body.requesterRoleCode, 80) || null, minAmount, maxAmount, stepNo, approverRoleCode, safeText(body.requiredPermission || 'expense.approve', 100), context.employee.id).run();
    } else {
      const minAmount = Math.max(0, Math.floor(Number(body.minAmountKobo || 0)));
      const evidenceType = ['receipt','invoice','quote','delivery_note','payment_evidence','other'].includes(String(body.evidenceType)) ? String(body.evidenceType) : 'receipt';
      const minimumCount = Math.max(0, Math.floor(Number(body.minimumCount || 1)));
      await env.DB.prepare(`INSERT INTO spend_evidence_policies(id,company_id,category_id,min_amount_kobo,evidence_type,required,minimum_count,requires_reason_if_missing,active,created_by) VALUES(?,?,?,?,?,?,?,?,1,?)`).bind(id, targetCompanyId || null, safeText(body.categoryId, 180) || null, minAmount, evidenceType, body.required === false ? 0 : 1, minimumCount, body.requiresReasonIfMissing === false ? 0 : 1, context.employee.id).run();
    }
    await audit(env, request, context, 'master_value_created', kind, id, targetCompanyId, { masterKind: kind, outcome: 'created' });
    return json({ ok: true, id, status: 'active' }, 201);
  }
  const id = safeText(body.id, 180);
  if (!validId(id)) return error('A valid master value is required.', 422);
  if (action === 'deactivate' || action === 'activate') {
    await env.DB.prepare(`UPDATE ${table} SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (company_id=? OR company_id IS NULL)`).bind(action === 'activate' ? 1 : 0, id, targetCompanyId || allowedCompanies[0]).run();
    await audit(env, request, context, action === 'activate' ? 'master_value_activated' : 'master_value_deactivated', kind, id, targetCompanyId || undefined, { masterKind: kind, outcome: action });
    return json({ ok: true, id, status: action === 'activate' ? 'active' : 'inactive' });
  }
  const replacementId = safeText(body.replacementId, 180);
  if (!replacementId || replacementId === id) return error('Choose a different active replacement value.', 422);
  if (kind === 'category') await env.DB.prepare(`UPDATE spend_categories SET superseded_by=?,active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(replacementId, id).run();
  else if (kind === 'supplier') await env.DB.prepare(`UPDATE spend_suppliers SET superseded_by=?,active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(replacementId, id).run();
  else return error('Allocation templates and cost centers use deactivate/activate rather than merge in Batch 1.', 400);
  await audit(env, request, context, 'master_value_merged', kind, id, targetCompanyId || undefined, { masterKind: kind, outcome: 'merged' });
  return json({ ok: true, id, replacementId, status: 'merged' });
}

async function adminProposalAction(request: Request, env: SpendEnv, context: SessionContext, id: string) {
  if (!validId(id)) return error('Invalid proposal.', 400);
  let body: Record<string, unknown>;
  try { body = parseObject(await request.json()); } catch { return error('Invalid proposal action.', 400); }
  const proposalRow = await env.DB.prepare(`SELECT id,company_id AS companyId,kind,proposed_name AS proposedName,normalized_name AS normalizedName,status,details_json AS detailsJson FROM spend_master_proposals WHERE id=?`).bind(id).first<Record<string, unknown>>();
  if (!proposalRow) return error('Proposal not found.', 404);
  const companyId = String(proposalRow.companyId);
  if (!can(context, 'expense.master', 'manage', companyId)) return deny(env, request, context, companyId, 'Master-data management permission is required.');
  if (String(proposalRow.status) !== 'proposed') return error('This proposal has already been resolved and cannot be changed.', 409, { errorCategory: 'master-state' });
  const action = safeText(body.action, 30);
  if (!['approve', 'reject', 'merge'].includes(action)) return error('Select approve, reject or merge.', 422);
  const reason = safeText(body.reason, 500);
  if (action !== 'approve' && reason.length < 3) return error('A reason is required.', 422);
  let status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'merged';
  if (action === 'approve') {
    const duplicate = await possibleMasterDuplicate(env, String(proposalRow.kind), String(proposalRow.proposedName), companyId);
    if (duplicate) return error('A similar active master value already exists. Merge or reject this proposal instead of creating a duplicate.', 409, { duplicateWarning: true, existing: { id: duplicate.id, name: duplicate.name } });
    const idNew = uid(`spend-${proposalRow.kind}`);
    if (proposalRow.kind === 'supplier') {
      await env.DB.prepare(`INSERT OR IGNORE INTO spend_suppliers(id,company_id,name,normalized_name,source,created_by) VALUES(?,?,?,?,'admin',?)`).bind(idNew, companyId, proposalRow.proposedName, proposalRow.normalizedName, context.employee.id).run();
    } else if (proposalRow.kind === 'category') {
      await env.DB.prepare(`INSERT OR IGNORE INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,source,created_by) VALUES(?,?,?,?,?,'spend-treatment-opex','admin',?)`).bind(idNew, companyId, normalised(proposalRow.proposedName).replaceAll(' ', '_').toUpperCase().slice(0, 50), proposalRow.proposedName, proposalRow.normalizedName, context.employee.id).run();
    } else {
      await env.DB.prepare(`INSERT OR IGNORE INTO spend_cost_centers(id,company_id,code,name,source) VALUES(?,?,?,?,'admin')`).bind(idNew, companyId, normalised(proposalRow.proposedName).replaceAll(' ', '_').toUpperCase().slice(0, 50), proposalRow.proposedName).run();
    }
    await env.DB.prepare(`UPDATE spend_master_proposals SET status='approved',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(context.employee.id, reason || null, id).run();
    await audit(env, request, context, 'master_value_approved', 'spend_master_proposal', id, companyId, { masterKind: proposalRow.kind, outcome: 'approved' });
    return json({ ok: true, status, masterId: idNew });
  }
  if (action === 'merge') {
    const replacementId = safeText(body.replacementId, 180);
    if (!replacementId) return error('A replacement master value is required.', 422);
    await env.DB.prepare(`UPDATE spend_master_proposals SET status='merged',merged_into_id=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(replacementId, context.employee.id, reason, id).run();
  } else await env.DB.prepare(`UPDATE spend_master_proposals SET status='rejected',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(context.employee.id, reason, id).run();
  await audit(env, request, context, `master_value_${status}`, 'spend_master_proposal', id, companyId, { masterKind: proposalRow.kind, outcome: status, reason });
  return json({ ok: true, status });
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120) || 'expense-evidence';
}

async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function uploadEvidence(request: Request, env: SpendEnv, context: SessionContext, evidenceId: string) {
  if (!env.FILES) return error('Secure evidence storage is not configured.', 503);
  const requestEntityId = safeText(request.headers.get('x-expense-request-id'), 180);
  const current = await requestById(env, requestEntityId);
  if (!current || !(await visibleRequest(env, context, current))) return error('Expense request not found.', 404);
  const companyId = String(current.companyId);
  if (String(current.requesterEmployeeId) !== context.employee.id && !can(context, 'expense.review', 'edit', companyId)) return deny(env, request, context, companyId, 'You cannot attach evidence to this request.');
  const mimeType = safeText(request.headers.get('content-type'), 80).split(';')[0].toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType)) return error('Only JPEG, PNG, WEBP and PDF evidence is allowed.', 415);
  if (!validId(evidenceId)) return error('Evidence identifier is invalid.', 400);
  const policy = await env.DB.prepare(`SELECT attachment_max_bytes AS maxBytes FROM offline_policy WHERE id='global'`).first<{ maxBytes: number }>();
  const maxBytes = Math.min(Number(policy?.maxBytes || 10 * 1024 * 1024), 52_428_800);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > maxBytes) return error('Evidence is larger than the configured limit.', 413);
  const digest = await sha256(bytes);
  const claimed = safeText(request.headers.get('x-evidence-sha256'), 80).toLowerCase();
  if (claimed && claimed !== digest) return error('Evidence integrity verification failed.', 400);
  const existingById = await env.DB.prepare(`SELECT id,expense_request_id AS expenseRequestId,employee_id AS employeeId,company_id AS companyId,r2_key AS r2Key,sha256,mime_type AS mimeType,size_bytes AS sizeBytes,status FROM spend_expense_evidence WHERE id=?`).bind(evidenceId).first<Record<string, unknown>>();
  if (existingById && (String(existingById.expenseRequestId) !== requestEntityId || String(existingById.companyId) !== companyId || String(existingById.employeeId) !== String(current.requesterEmployeeId))) return error('This evidence identifier is already bound to another expense scope.', 409, { errorCategory: 'idempotency-mismatch' });
  const existing = existingById;
  if (existing && existing.sha256 === digest && existing.mimeType === mimeType && Number(existing.sizeBytes) === bytes.byteLength) return json({ ok: true, evidence: { id: evidenceId, status: existing.status, sha256: digest, sizeBytes: bytes.byteLength }, deduplicated: true });
  if (existing) return error('This evidence identifier is already bound to different content. Preserve the original evidence and use a new identifier.', 409, { errorCategory: 'idempotency-mismatch' });
  const key = `spend/${companyId}/${requestEntityId}/${evidenceId}-${digest}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' }, customMetadata: { employeeId: context.employee.id, companyId, expenseRequestId: requestEntityId, sha256: digest } });
  try {
    await env.DB.prepare(`
      INSERT INTO spend_expense_evidence(id,expense_request_id,employee_id,company_id,evidence_type,original_name,mime_type,size_bytes,sha256,r2_key,status,captured_at,client_timezone,uploaded_at)
      VALUES(?,?,?,?,?,?,?,?,?,?, 'uploaded',?,?,CURRENT_TIMESTAMP)
    `).bind(evidenceId, requestEntityId, String(current.requesterEmployeeId), companyId, ['receipt','invoice','quote','delivery_note','payment_evidence','other'].includes(safeText(request.headers.get('x-evidence-type'), 40)) ? safeText(request.headers.get('x-evidence-type'), 40) : 'receipt', safeFileName(safeText(request.headers.get('x-evidence-name'), 160)), mimeType, bytes.byteLength, digest, key, parseIso(request.headers.get('x-evidence-captured-at')) || null, safeText(request.headers.get('x-evidence-timezone'), 80) || null).run();
  } catch (cause) {
    await env.FILES.delete(key);
    const winner = await env.DB.prepare(`SELECT id,status,sha256,mime_type AS mimeType,size_bytes AS sizeBytes FROM spend_expense_evidence WHERE id=?`).bind(evidenceId).first<Record<string, unknown>>();
    if (winner && winner.sha256 === digest && winner.mimeType === mimeType && Number(winner.sizeBytes) === bytes.byteLength) return json({ ok: true, evidence: { id: evidenceId, status: winner.status, sha256: digest, sizeBytes: bytes.byteLength }, deduplicated: true });
    if (winner) return error('This evidence identifier is already bound to different content. Preserve the original evidence and use a new identifier.', 409, { errorCategory: 'idempotency-mismatch' });
    throw cause;
  }
  await audit(env, request, context, 'expense_evidence_uploaded', 'expense_evidence', evidenceId, companyId, { outcome: 'uploaded', mimeType, sizeBytes: bytes.byteLength, sha256: digest, capturedAt: request.headers.get('x-evidence-captured-at'), clientTimezone: request.headers.get('x-evidence-timezone') });
  return json({ ok: true, evidence: { id: evidenceId, expenseRequestId: requestEntityId, mimeType, sizeBytes: bytes.byteLength, sha256: digest, status: 'uploaded' } }, 201);
}

export async function handleOfflineSpendOperation(request: Request, env: SpendEnv, context: SessionContext, kind: string, payload: Record<string, unknown>) {
  if (!['expense.draft.save', 'expense.request.submit', 'expense.evidence.upload'].includes(kind)) return null;
  if (kind === 'expense.evidence.upload') return json({ ok: true, state: 'synced', result: { queuedEvidence: true } });
  return createExpense(request, env, context, payload, kind === 'expense.request.submit');
}

export async function routeSpend(request: Request, env: SpendEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/spend/bootstrap' && request.method === 'GET') return bootstrap(request, env, context);
  if (url.pathname === '/api/spend/requests' && request.method === 'GET') return listRequests(request, env, context);
  if (url.pathname === '/api/spend/requests' && request.method === 'POST') {
    let body: Record<string, unknown>;
    try { body = parseObject(await request.json()); } catch { return error('Invalid expense request.', 400); }
    return createExpense(request, env, context, body, body.submit === true || body.status === 'submitted');
  }
  const requestMatch = url.pathname.match(/^\/api\/spend\/requests\/([^/]+)$/);
  if (requestMatch && request.method === 'GET') {
    const row = await requestById(env, requestMatch[1]);
    if (!row || !(await visibleRequest(env, context, row))) return error('Expense request not found.', 404);
    return json({ serverTime: new Date().toISOString(), businessTimezone: businessTimezone(env), request: await serializeRequest(env, context, row, true) });
  }
  const actionMatch = url.pathname.match(/^\/api\/spend\/requests\/([^/]+)\/action$/);
  if (actionMatch && request.method === 'POST') return actionExpense(request, env, context, actionMatch[1]);
  const postMatch = url.pathname.match(/^\/api\/spend\/requests\/([^/]+)\/post$/);
  if (postMatch && request.method === 'POST') return postExpense(request, env, context, postMatch[1]);
  if (url.pathname === '/api/spend/approvals' && request.method === 'GET') return approvals(request, env, context);
  if (url.pathname === '/api/spend/master/proposals' && request.method === 'POST') return proposal(request, env, context);
  if (url.pathname === '/api/spend/admin/master' && (request.method === 'GET' || request.method === 'POST')) return adminMaster(request, env, context);
  const proposalMatch = url.pathname.match(/^\/api\/spend\/admin\/proposals\/([^/]+)$/);
  if (proposalMatch && request.method === 'POST') return adminProposalAction(request, env, context, proposalMatch[1]);
  if (url.pathname === '/api/spend/owner/overview' && request.method === 'GET') return ownerOverview(request, env, context);
  if (url.pathname === '/api/spend/owner/detail' && request.method === 'GET') return ownerDetail(request, env, context);
  if (url.pathname === '/api/spend/erp-context' && request.method === 'GET') {
    if (!hasPermission(context, 'expense.requests', 'view') && !owner(context)) return error('Expense access is not assigned.', 403);
    return json({
      engine: 'shared-spend',
      erps: ['printing', 'bakery', 'autos', 'logistics', 'properties', 'finance'],
      contexts: [
        { id: 'printing', label: 'Printing & Technology', categories: ['paper', 'media', 'ink', 'plates', 'finishing', 'machine parts', 'delivery', 'subcontracting'] },
        { id: 'bakery', label: 'Bakery', categories: ['ingredients', 'packaging', 'fuel', 'transport', 'equipment', 'utilities'] },
        { id: 'autos', label: 'Autos', categories: ['vehicle acquisition', 'import', 'shipping', 'clearing', 'transport', 'inspection', 'licensing', 'advertising', 'commission', 'professional services'] },
        { id: 'logistics', label: 'Logistics', categories: ['fuel', 'toll', 'driver allowance', 'loading', 'parking', 'insurance', 'maintenance', 'tyres', 'permits'] },
        { id: 'properties', label: 'Homes & Properties', categories: ['maintenance', 'security', 'utilities', 'cleaning', 'legal', 'agency', 'contractor', 'tax'] },
        { id: 'finance', label: 'Finance / Group', categories: ['shared services', 'professional services', 'group administration'] },
      ],
      constructionContext: 'DAENEM COMPLEX · IBADAN · OYO STATE',
      autos: { workshopRetained: true, truth: 'Autos continues to include vehicle sales, preparation and existing Workshop functionality.' },
    });
  }
  const evidenceMatch = url.pathname.match(/^\/api\/spend\/evidence\/([^/]+)$/);
  if (evidenceMatch && request.method === 'PUT') return uploadEvidence(request, env, context, evidenceMatch[1]);
  return null;
}
