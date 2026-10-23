import { getSessionContext, hasPermission, type AuthEnv, type SessionContext } from './auth';

interface PrintingEnv extends AuthEnv {}

type PrintStatus = 'enquiry' | 'quoted' | 'customer_approved' | 'design' | 'proof' | 'queued' | 'printing' | 'finishing' | 'quality_control' | 'packaging' | 'ready' | 'delivered' | 'completed' | 'on_hold' | 'cancelled';

const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const companyId = 'company-printing';

const forwardTransitions: Record<PrintStatus, PrintStatus[]> = {
  enquiry: ['quoted', 'cancelled', 'on_hold'],
  quoted: ['customer_approved', 'cancelled', 'on_hold'],
  customer_approved: ['design', 'queued', 'cancelled', 'on_hold'],
  design: ['proof', 'queued', 'on_hold'],
  proof: ['queued', 'design', 'on_hold'],
  queued: ['printing', 'on_hold'],
  printing: ['finishing', 'quality_control', 'on_hold'],
  finishing: ['quality_control', 'on_hold'],
  quality_control: ['packaging', 'printing', 'finishing', 'on_hold'],
  packaging: ['ready', 'quality_control', 'on_hold'],
  ready: ['delivered', 'on_hold'],
  delivered: ['completed'],
  completed: [],
  on_hold: ['enquiry', 'quoted', 'customer_approved', 'design', 'proof', 'queued', 'printing', 'finishing', 'quality_control', 'packaging', 'ready', 'cancelled'],
  cancelled: [],
};

function canPrint(context: SessionContext, minimum: 'view' | 'create' | 'edit' | 'approve' | 'manage' = 'view') {
  return hasPermission(context, 'printing.access', minimum, companyId);
}

function canViewPrintFinancials(context: SessionContext) {
  return canPrint(context, 'approve') || hasPermission(context, 'finance.access', 'view', companyId);
}

const printingFinancialFields = new Set([
  'basePriceKobo', 'balanceKobo', 'quotedKobo', 'invoicedKobo', 'materialCostKobo',
  'labourCostKobo', 'finishingCostKobo', 'otherCostKobo', 'grossProfitKobo', 'marginBasisPoints',
  'costKobo', 'unitCostKobo',
]);

function withoutPrintingFinancials<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !printingFinancialFields.has(key))) as T;
}

function numberValue(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function koboFromNaira(value: unknown) {
  return Math.round(Math.max(0, numberValue(value)) * 100);
}

function nigeriaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function nigeriaMonth(value = new Date()) {
  return nigeriaDate(value).slice(0, 7);
}

async function nextNumber(env: PrintingEnv, prefix: string, table: string, column: string) {
  const today = nigeriaDate().replaceAll('-', '');
  const safeTables: Record<string, string> = { print_jobs: 'job_no', customers: 'customer_no' };
  if (safeTables[table] !== column) throw new Error('Unsupported sequence target.');
  const like = `${prefix}-${today}-%`;
  const row = await env.DB.prepare(`SELECT ${column} AS value FROM ${table} WHERE company_id = ? AND ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`).bind(companyId, like).first<{ value?: string }>();
  const last = Number(row?.value?.split('-').at(-1) || 0);
  return `${prefix}-${today}-${String(last + 1).padStart(4, '0')}`;
}

async function dashboard(env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context)) return json({ error: 'Daenem Printing access is not assigned.' }, 403);
  const today = nigeriaDate();
  const month = nigeriaMonth();
  const [jobs, overdue, ready, monthRevenue, monthCost, customers, stockAlerts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM print_jobs WHERE company_id = ? AND production_status NOT IN ('completed','cancelled')`).bind(companyId).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM print_jobs WHERE company_id = ? AND due_at IS NOT NULL AND datetime(due_at) < datetime('now') AND production_status NOT IN ('ready','delivered','completed','cancelled')`).bind(companyId).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM print_jobs WHERE company_id = ? AND production_status = 'ready'`).bind(companyId).first<{ count: number }>(),
    env.DB.prepare(`SELECT COALESCE(SUM(invoiced_kobo),0) AS amount FROM print_jobs WHERE company_id = ? AND substr(created_at,1,7) = ?`).bind(companyId, month).first<{ amount: number }>(),
    env.DB.prepare(`SELECT COALESCE(SUM(material_cost_kobo + labour_cost_kobo + finishing_cost_kobo + other_cost_kobo),0) AS amount FROM print_jobs WHERE company_id = ? AND substr(created_at,1,7) = ?`).bind(companyId, month).first<{ amount: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM customers WHERE company_id = ? AND active = 1`).bind(companyId).first<{ count: number }>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count FROM stock_balances sb
      JOIN inventory_items i ON i.id = sb.item_id AND i.company_id = sb.company_id
      WHERE sb.company_id = ? AND i.active = 1 AND (sb.quantity - sb.reserved_quantity) <= i.reorder_level
    `).bind(companyId).first<{ count: number }>(),
  ]);
  const revenue = Number(monthRevenue?.amount || 0);
  const cost = Number(monthCost?.amount || 0);
  const pipeline = await env.DB.prepare(`
    SELECT production_status AS status, COUNT(*) AS count
    FROM print_jobs WHERE company_id = ? AND production_status NOT IN ('completed','cancelled')
    GROUP BY production_status ORDER BY count DESC
  `).bind(companyId).all<{ status: string; count: number }>();
  const recent = await env.DB.prepare(`
    SELECT pj.id, pj.job_no AS jobNo, pj.title, pj.production_status AS status, pj.priority,
           pj.due_at AS dueAt, pj.quoted_kobo AS quotedKobo, pj.gross_profit_kobo AS grossProfitKobo,
           c.name AS customerName, ps.name AS serviceName
    FROM print_jobs pj
    LEFT JOIN customers c ON c.id = pj.customer_id AND c.company_id = pj.company_id
    LEFT JOIN printing_services ps ON ps.id = pj.service_id AND ps.company_id = pj.company_id
    WHERE pj.company_id = ?
    ORDER BY pj.created_at DESC LIMIT 8
  `).bind(companyId).all<Record<string, unknown>>();
  const canViewFinancials = canViewPrintFinancials(context);
  return json({
    date: today,
    month,
    metrics: {
      openJobs: Number(jobs?.count || 0), overdueJobs: Number(overdue?.count || 0), readyJobs: Number(ready?.count || 0),
      customers: Number(customers?.count || 0), lowStockItems: Number(stockAlerts?.count || 0),
      ...(canViewFinancials ? {
        revenueKobo: revenue, costKobo: cost, grossProfitKobo: revenue - cost,
        marginBasisPoints: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) : 0,
      } : {}),
    },
    pipeline: pipeline.results || [],
    recentJobs: canViewFinancials ? (recent.results || []) : (recent.results || []).map(withoutPrintingFinancials),
  });
}

async function services(env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context)) return json({ error: 'Daenem Printing access is not assigned.' }, 403);
  const result = await env.DB.prepare(`SELECT id, code, name, category, description, pricing_unit AS pricingUnit, base_price_kobo AS basePriceKobo, requires_artwork AS requiresArtwork, requires_proof AS requiresProof FROM printing_services WHERE company_id = ? AND active = 1 ORDER BY category, name`).bind(companyId).all<Record<string, unknown>>();
  const rows = result.results || [];
  return json({ services: canViewPrintFinancials(context) ? rows : rows.map(withoutPrintingFinancials) });
}

async function customers(env: PrintingEnv, context: SessionContext, search: string) {
  if (!canPrint(context)) return json({ error: 'Daenem Printing access is not assigned.' }, 403);
  const pattern = `%${search.trim()}%`;
  const result = await env.DB.prepare(`
    SELECT id, customer_no AS customerNo, name, business_name AS businessName, phone, whatsapp, email, customer_type AS customerType, balance_kobo AS balanceKobo
    FROM customers WHERE company_id = ? AND active = 1 AND (? = '%%' OR name LIKE ? OR business_name LIKE ? OR phone LIKE ? OR email LIKE ?)
    ORDER BY name LIMIT 100
  `).bind(companyId, pattern, pattern, pattern, pattern, pattern).all<Record<string, unknown>>();
  const rows = result.results || [];
  return json({ customers: canViewPrintFinancials(context) ? rows : rows.map(withoutPrintingFinancials) });
}

async function createCustomer(request: Request, env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context, 'create')) return json({ error: 'Create permission is required.' }, 403);
  let body: { name?: string; businessName?: string; phone?: string; whatsapp?: string; email?: string; customerType?: string; address?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid customer request.' }, 400); }
  const name = String(body.name || '').trim();
  if (name.length < 2) return json({ error: 'Customer name is required.' }, 400);
  const id = uid('customer');
  const customerNo = await nextNumber(env, 'CUST', 'customers', 'customer_no');
  await env.DB.prepare(`
    INSERT INTO customers (id, company_id, customer_no, name, business_name, phone, whatsapp, email, address, customer_type, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, companyId, customerNo, name, body.businessName || null, body.phone || null, body.whatsapp || null, body.email || null, body.address || null, body.customerType || 'retail', context.employee.id).run();
  return json({ ok: true, customer: { id, customerNo, name } }, 201);
}

async function listJobs(request: Request, env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context)) return json({ error: 'Daenem Printing access is not assigned.' }, 403);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const search = `%${(url.searchParams.get('q') || '').trim()}%`;
  const result = await env.DB.prepare(`
    SELECT pj.id, pj.job_no AS jobNo, pj.title, pj.description, pj.production_status AS status,
           pj.artwork_status AS artworkStatus, pj.proof_status AS proofStatus, pj.priority,
           pj.quantity, pj.unit, pj.size_spec AS sizeSpec, pj.finishing_spec AS finishingSpec,
           pj.due_at AS dueAt, pj.quoted_kobo AS quotedKobo, pj.invoiced_kobo AS invoicedKobo,
           pj.material_cost_kobo AS materialCostKobo, pj.labour_cost_kobo AS labourCostKobo,
           pj.finishing_cost_kobo AS finishingCostKobo, pj.other_cost_kobo AS otherCostKobo,
           pj.gross_profit_kobo AS grossProfitKobo, pj.margin_basis_points AS marginBasisPoints,
           c.id AS customerId, c.name AS customerName, c.business_name AS customerBusiness,
           ps.id AS serviceId, ps.name AS serviceName,
           designer.display_name AS designerName, operator.display_name AS operatorName,
           pj.created_at AS createdAt, pj.updated_at AS updatedAt
    FROM print_jobs pj
    LEFT JOIN customers c ON c.id = pj.customer_id AND c.company_id = pj.company_id
    LEFT JOIN printing_services ps ON ps.id = pj.service_id AND ps.company_id = pj.company_id
    LEFT JOIN employee_company_memberships designer_membership ON designer_membership.employee_id = pj.assigned_designer_id AND designer_membership.company_id = pj.company_id AND designer_membership.active = 1
    LEFT JOIN employees designer ON designer.id = designer_membership.employee_id
    LEFT JOIN employee_company_memberships operator_membership ON operator_membership.employee_id = pj.assigned_operator_id AND operator_membership.company_id = pj.company_id AND operator_membership.active = 1
    LEFT JOIN employees operator ON operator.id = operator_membership.employee_id
    WHERE pj.company_id = ?
      AND (? = '' OR pj.production_status = ?)
      AND (? = '%%' OR pj.job_no LIKE ? OR pj.title LIKE ? OR c.name LIKE ? OR c.business_name LIKE ?)
    ORDER BY CASE pj.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
             COALESCE(pj.due_at, '9999-12-31'), pj.created_at DESC
    LIMIT 200
  `).bind(companyId, status, status, search, search, search, search, search).all<Record<string, unknown>>();
  const rows = result.results || [];
  return json({ jobs: canViewPrintFinancials(context) ? rows : rows.map(withoutPrintingFinancials) });
}

async function createJob(request: Request, env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context, 'create')) return json({ error: 'Create Printing Job permission is required.' }, 403);
  let body: {
    customerId?: string; serviceId?: string; title?: string; description?: string; quantity?: number; unit?: string;
    sizeSpec?: string; colorSpec?: string; finishingSpec?: string; priority?: string; dueAt?: string;
    quotedNaira?: number; designerId?: string; operatorId?: string; locationId?: string;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid print job request.' }, 400); }
  let currentContext = context;
  const revalidate = async () => {
    const current = await getSessionContext(request, env);
    if (!current || current.sessionId !== context.sessionId || current.employee.id !== context.employee.id) return json({ error: 'Authentication required.' }, 401);
    if (!canPrint(current, 'create')) return json({ error: 'Create Printing Job permission is required.' }, 403);
    if (koboFromNaira(body.quotedNaira) > 0 && !canViewPrintFinancials(current)) return json({ error: 'Printing approval or Finance view permission is required to set quoted value.' }, 403);
    currentContext = current;
    return null;
  };
  let denied = await revalidate();
  if (denied) return denied;
  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'Print job title is required.' }, 400);
  if (body.customerId) {
    const customer = await env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND company_id = ? AND active = 1`).bind(body.customerId, companyId).first();
    denied = await revalidate();
    if (denied) return denied;
    if (!customer) return json({ error: 'Selected Printing customer was not found.' }, 400);
  }
  if (body.serviceId) {
    const service = await env.DB.prepare(`SELECT id FROM printing_services WHERE id = ? AND company_id = ? AND active = 1`).bind(body.serviceId, companyId).first();
    denied = await revalidate();
    if (denied) return denied;
    if (!service) return json({ error: 'Selected Printing service was not found.' }, 400);
  }
  if (koboFromNaira(body.quotedNaira) > 0 && !canViewPrintFinancials(context)) {
    return json({ error: 'Printing approval or Finance view permission is required to set quoted value.' }, 403);
  }
  const locationId = String(body.locationId || 'location-printing-hq');
  const location = await env.DB.prepare(`SELECT id FROM company_locations WHERE id = ? AND company_id = ? AND active = 1`).bind(locationId, companyId).first();
  denied = await revalidate();
  if (denied) return denied;
  if (!location) return json({ error: 'Selected Printing location was not found.' }, 400);
  for (const [employeeId, label] of [[body.designerId, 'designer'], [body.operatorId, 'operator']] as const) {
    if (!employeeId) continue;
    const employee = await env.DB.prepare(`
      SELECT e.id FROM employees e
      JOIN employee_company_memberships m ON m.employee_id = e.id
      WHERE e.id = ? AND m.company_id = ? AND m.active = 1 AND e.employment_status = 'active'
      LIMIT 1
    `).bind(employeeId, companyId).first();
    denied = await revalidate();
    if (denied) return denied;
    if (!employee) return json({ error: `Selected Printing ${label} is not an active company employee.` }, 400);
  }
  const jobNo = await nextNumber(env, 'DP', 'print_jobs', 'job_no');
  denied = await revalidate();
  if (denied) return denied;
  const id = uid('print-job');
  const quotedKobo = koboFromNaira(body.quotedNaira);
  const requestId = (request.headers.get('x-request-id') || request.headers.get('cf-ray') || crypto.randomUUID()).slice(0, 128);
  // Repeat reference eligibility inside the transaction: preflight reads can
  // become stale before the job, initial event and required audit are committed.
  await env.DB.batch([
    env.DB.prepare(`SELECT json_extract(CASE WHEN
      EXISTS(SELECT 1 FROM company_locations WHERE id = ? AND company_id = ? AND active = 1)
      AND (? IS NULL OR EXISTS(SELECT 1 FROM customers WHERE id = ? AND company_id = ? AND active = 1))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM printing_services WHERE id = ? AND company_id = ? AND active = 1))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM employees e JOIN employee_company_memberships m ON m.employee_id = e.id WHERE e.id = ? AND m.company_id = ? AND m.active = 1 AND e.employment_status = 'active'))
      AND (? IS NULL OR EXISTS(SELECT 1 FROM employees e JOIN employee_company_memberships m ON m.employee_id = e.id WHERE e.id = ? AND m.company_id = ? AND m.active = 1 AND e.employment_status = 'active'))
      THEN '{}' ELSE '{' END, '$')`).bind(locationId, companyId,
      body.customerId || null, body.customerId || null, companyId,
      body.serviceId || null, body.serviceId || null, companyId,
      body.designerId || null, body.designerId || null, companyId,
      body.operatorId || null, body.operatorId || null, companyId),
    env.DB.prepare(`
      INSERT INTO print_jobs (
        id, company_id, location_id, customer_id, service_id, job_no, title, description,
        quantity, unit, size_spec, color_spec, finishing_spec, priority, due_at,
        quoted_kobo, assigned_designer_id, assigned_operator_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, companyId, locationId, body.customerId || null, body.serviceId || null, jobNo, title, body.description || null, Math.max(1, numberValue(body.quantity, 1)), body.unit || 'job', body.sizeSpec || null, body.colorSpec || null, body.finishingSpec || null, body.priority || 'normal', body.dueAt || null, quotedKobo, body.designerId || null, body.operatorId || null, context.employee.id),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
    env.DB.prepare(`INSERT INTO print_job_status_events (id, print_job_id, from_status, to_status, changed_by, note) VALUES (?, ?, NULL, 'enquiry', ?, 'Print job created')`).bind(uid('print-event'), id, context.employee.id),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
    env.DB.prepare(`INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source, request_id) VALUES (?, ?, ?, 'printing', 'create_job', 'print_job', ?, ?, 'web', ?)`).bind(uid('audit'), context.employee.id, companyId, id, JSON.stringify({ jobNo, title, quotedKobo }), requestId),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
  ]);
  denied = await revalidate();
  if (denied) return denied;
  return json({ ok: true, job: { id, jobNo, title, status: 'enquiry', ...(canViewPrintFinancials(context) && canViewPrintFinancials(currentContext) ? { quotedKobo } : {}) } }, 201);
}

async function addMaterial(request: Request, env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context, 'create')) return json({ error: 'Create Printing data permission is required.' }, 403);
  let body: { jobId?: string; itemId?: string; actualQuantity?: number; wasteQuantity?: number; unitCostNaira?: number; note?: string; locationId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid material usage request.' }, 400); }
  const actual = Math.max(0, numberValue(body.actualQuantity));
  const waste = Math.max(0, numberValue(body.wasteQuantity));
  if (!body.jobId || !body.itemId || actual + waste <= 0) return json({ error: 'Job, stock item and quantity used/wasted are required.' }, 400);
  if (koboFromNaira(body.unitCostNaira) > 0 && !canViewPrintFinancials(context)) {
    return json({ error: 'Printing approval or Finance view permission is required to override material cost.' }, 403);
  }
  // Each awaited preflight can outlast the original authority. Recheck before
  // disclosing job/stock state and immediately before the mutation batch.
  const revalidate = async () => {
    const current = await getSessionContext(request, env);
    if (!current || current.sessionId !== context.sessionId || current.employee.id !== context.employee.id) return json({ error: 'Authentication required.' }, 401);
    if (!canPrint(current, 'create')) return json({ error: 'Create Printing data permission is required.' }, 403);
    if (koboFromNaira(body.unitCostNaira) > 0 && !canViewPrintFinancials(current)) return json({ error: 'Printing approval or Finance view permission is required to override material cost.' }, 403);
    return null;
  };
  const [job, item] = await Promise.all([
    env.DB.prepare(`SELECT id, production_status AS status FROM print_jobs WHERE id = ? AND company_id = ?`).bind(body.jobId, companyId).first<{ id: string; status: string }>(),
    env.DB.prepare(`SELECT id, name, unit_cost_kobo AS unitCostKobo FROM inventory_items WHERE id = ? AND company_id = ? AND active = 1`).bind(body.itemId, companyId).first<{ id: string; name: string; unitCostKobo: number }>(),
  ]);
  const jobDenial = await revalidate();
  if (jobDenial) return jobDenial;
  if (!job || !item) return json({ error: 'Print job or Printing inventory item was not found.' }, 404);
  if (['completed','cancelled'].includes(job.status)) return json({ error: 'Materials cannot be added to a completed or cancelled job.' }, 409);
  const locationId = String(body.locationId || 'location-printing-hq');
  const location = await env.DB.prepare(`SELECT id FROM company_locations WHERE id = ? AND company_id = ? AND active = 1`).bind(locationId, companyId).first();
  const locationDenial = await revalidate();
  if (locationDenial) return locationDenial;
  if (!location) return json({ error: 'Selected Printing stock location was not found.' }, 400);
  const balance = await env.DB.prepare(`SELECT id, quantity, reserved_quantity AS reservedQuantity FROM stock_balances WHERE company_id = ? AND location_id = ? AND item_id = ?`).bind(companyId, locationId, body.itemId).first<{ id: string; quantity: number; reservedQuantity: number }>();
  const stockDenial = await revalidate();
  if (stockDenial) return stockDenial;
  const required = actual + waste;
  if (!balance || Number(balance.quantity) - Number(balance.reservedQuantity || 0) < required) {
    return json({ error: `Insufficient stock for ${item.name}. Available quantity is ${Math.max(0, Number(balance?.quantity || 0) - Number(balance?.reservedQuantity || 0))}.` }, 409);
  }
  const unitCostKobo = body.unitCostNaira == null ? Number(item.unitCostKobo || 0) : koboFromNaira(body.unitCostNaira);
  const requestId = (request.headers.get('x-request-id') || request.headers.get('cf-ray') || crypto.randomUUID()).slice(0, 128);
  // Every write must affect one row, including required audit and cost summary.
  // A silently skipped write aborts the same batch and restores consumed stock.
  try {
    await env.DB.batch([
    env.DB.prepare(`UPDATE stock_balances SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ? AND location_id = ? AND item_id = ? AND quantity - COALESCE(reserved_quantity, 0) >= ? AND EXISTS (SELECT 1 FROM print_jobs WHERE id = ? AND company_id = ? AND production_status NOT IN ('completed','cancelled'))`).bind(required, balance.id, companyId, locationId, body.itemId, required, body.jobId, companyId),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
    env.DB.prepare(`INSERT INTO print_job_materials (id, print_job_id, item_id, actual_quantity, waste_quantity, unit_cost_kobo, issued_from_location_id, issued_by, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uid('print-material'), body.jobId, body.itemId, actual, waste, unitCostKobo, locationId, context.employee.id, body.note || null),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
    env.DB.prepare(`INSERT INTO stock_movements (id, company_id, item_id, movement_type, quantity, unit_cost_kobo, from_location_id, reference_type, reference_id, reason, created_by) VALUES (?, ?, ?, 'issue', ?, ?, ?, 'print_job', ?, ?, ?)`).bind(uid('stock-movement'), companyId, body.itemId, required, unitCostKobo, locationId, body.jobId, body.note || 'Print job material usage', context.employee.id),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
    env.DB.prepare(`INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source, request_id) VALUES (?, ?, ?, 'printing', 'record_material_usage', 'print_job', ?, ?, 'web', ?)`).bind(uid('audit'), context.employee.id, companyId, body.jobId, JSON.stringify({ itemId: body.itemId, actual, waste, unitCostKobo }), requestId),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
    env.DB.prepare(`WITH cost AS (SELECT COALESCE(ROUND(SUM((actual_quantity + waste_quantity) * unit_cost_kobo)), 0) AS amount FROM print_job_materials WHERE print_job_id = ?)
      UPDATE print_jobs SET
        material_cost_kobo = (SELECT amount FROM cost),
        gross_profit_kobo = COALESCE(NULLIF(invoiced_kobo, 0), quoted_kobo, 0) - (SELECT amount FROM cost) - COALESCE(labour_cost_kobo, 0) - COALESCE(finishing_cost_kobo, 0) - COALESCE(other_cost_kobo, 0),
        margin_basis_points = CASE WHEN COALESCE(NULLIF(invoiced_kobo, 0), quoted_kobo, 0) > 0 THEN ROUND((COALESCE(NULLIF(invoiced_kobo, 0), quoted_kobo, 0) - (SELECT amount FROM cost) - COALESCE(labour_cost_kobo, 0) - COALESCE(finishing_cost_kobo, 0) - COALESCE(other_cost_kobo, 0)) * 10000.0 / COALESCE(NULLIF(invoiced_kobo, 0), quoted_kobo, 0)) ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?`).bind(body.jobId, body.jobId, companyId),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes() = 1 THEN '{}' ELSE '{' END, '$')`),
    ]);
  } catch (error) {
    const current = await env.DB.prepare(`SELECT quantity - COALESCE(reserved_quantity, 0) AS available FROM stock_balances WHERE id = ? AND company_id = ? AND location_id = ? AND item_id = ?`).bind(balance.id, companyId, locationId, body.itemId).first<{ available: number }>();
    const openJob = await env.DB.prepare(`SELECT id FROM print_jobs WHERE id = ? AND company_id = ? AND production_status NOT IN ('completed','cancelled')`).bind(body.jobId, companyId).first();
    const failureDenial = await revalidate();
    if (failureDenial) return failureDenial;
    if (!openJob || !current || Number(current.available) < required) return json({ error: 'Printing stock or job status changed. Refresh and try again.' }, 409);
    throw error;
  }
  return json({ ok: true, message: 'Material usage recorded and Printing stock reduced automatically.' });
}

async function transitionJob(request: Request, env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context, 'edit')) return json({ error: 'Edit Printing Job permission is required.' }, 403);
  let body: { jobId?: string; toStatus?: PrintStatus; note?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid job status request.' }, 400); }
  if (!body.jobId || !body.toStatus) return json({ error: 'Job and destination status are required.' }, 400);
  const job = await env.DB.prepare(`SELECT id, production_status AS status, assigned_operator_id AS operatorId, service_id AS serviceId FROM print_jobs WHERE id = ? AND company_id = ?`).bind(body.jobId, companyId).first<{ id: string; status: PrintStatus; operatorId?: string; serviceId?: string }>();
  if (!job) return json({ error: 'Print job not found.' }, 404);
  const allowed = forwardTransitions[job.status] || [];
  if (!allowed.includes(body.toStatus)) return json({ error: `A print job cannot move directly from ${job.status} to ${body.toStatus}.` }, 409);
  if (['customer_approved', 'completed', 'cancelled'].includes(body.toStatus) && !canPrint(context, 'approve')) {
    return json({ error: 'Printing approval permission is required for this commercial or terminal status.' }, 403);
  }

  if (body.toStatus === 'queued') {
    const service = job.serviceId ? await env.DB.prepare(`SELECT requires_artwork AS requiresArtwork, requires_proof AS requiresProof FROM printing_services WHERE id = ? AND company_id = ?`).bind(job.serviceId, companyId).first<{ requiresArtwork: number; requiresProof: number }>() : null;
    const detail = await env.DB.prepare(`SELECT artwork_status AS artworkStatus, proof_status AS proofStatus FROM print_jobs WHERE id = ?`).bind(job.id).first<{ artworkStatus: string; proofStatus: string }>();
    if (service?.requiresArtwork && detail?.artworkStatus !== 'approved') return json({ error: 'Artwork must be approved before this job can enter the production queue.' }, 409);
    if (service?.requiresProof && detail?.proofStatus !== 'approved') return json({ error: 'Customer proof approval is required before this job can enter the production queue.' }, 409);
  }

  if (['quality_control','packaging','ready','delivered','completed'].includes(body.toStatus)) {
    const material = await env.DB.prepare(`SELECT COUNT(*) AS count FROM print_job_materials WHERE print_job_id = ?`).bind(job.id).first<{ count: number }>();
    if (job.operatorId && Number(material?.count || 0) === 0) {
      return json({ error: 'Material usage is required before an operator-assigned job can advance to quality control or completion.' }, 409);
    }
  }
  if (body.toStatus === 'packaging') {
    const qc = await env.DB.prepare(`SELECT result FROM print_quality_checks WHERE print_job_id = ? ORDER BY checked_at DESC LIMIT 1`).bind(job.id).first<{ result: string }>();
    if (qc?.result !== 'pass') return json({ error: 'A passed quality-control check is required before packaging.' }, 409);
  }

  const updates: string[] = ['production_status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const bindings: unknown[] = [body.toStatus];
  if (body.toStatus === 'printing') updates.push(`started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`);
  if (body.toStatus === 'ready') updates.push(`ready_at = CURRENT_TIMESTAMP`);
  if (body.toStatus === 'completed') updates.push(`completed_at = CURRENT_TIMESTAMP`);
  bindings.push(body.jobId);
  await env.DB.batch([
    env.DB.prepare(`UPDATE print_jobs SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings),
    env.DB.prepare(`INSERT INTO print_job_status_events (id, print_job_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid('print-event'), body.jobId, job.status, body.toStatus, context.employee.id, body.note || null),
    env.DB.prepare(`INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, before_json, after_json, source) VALUES (?, ?, ?, 'printing', 'status_change', 'print_job', ?, ?, ?, 'web')`).bind(uid('audit'), context.employee.id, companyId, body.jobId, JSON.stringify({ status: job.status }), JSON.stringify({ status: body.toStatus, note: body.note || null })),
  ]);
  return json({ ok: true, status: body.toStatus });
}

async function qualityCheck(request: Request, env: PrintingEnv, context: SessionContext) {
  if (!canPrint(context, 'edit')) return json({ error: 'Edit Printing Job permission is required.' }, 403);
  let body: { jobId?: string; result?: 'pass' | 'rework' | 'reject'; note?: string; checklist?: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ error: 'Invalid quality check request.' }, 400); }
  if (!body.jobId || !['pass','rework','reject'].includes(String(body.result))) return json({ error: 'Job and QC result are required.' }, 400);
  const job = await env.DB.prepare(`SELECT id, production_status AS status FROM print_jobs WHERE id = ? AND company_id = ?`).bind(body.jobId, companyId).first<{ id: string; status: string }>();
  if (!job) return json({ error: 'Print job not found.' }, 404);
  if (!['quality_control','finishing','printing'].includes(job.status)) return json({ error: 'Quality control can only be recorded for a job in production/QC stages.' }, 409);
  await env.DB.prepare(`INSERT INTO print_quality_checks (id, print_job_id, checked_by, result, checklist_json, note) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid('print-qc'), body.jobId, context.employee.id, body.result, body.checklist ? JSON.stringify(body.checklist) : null, body.note || null).run();
  return json({ ok: true, result: body.result });
}

export async function routePrinting(request: Request, env: PrintingEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/printing/dashboard' && request.method === 'GET') return dashboard(env, context);
  if (url.pathname === '/api/printing/services' && request.method === 'GET') return services(env, context);
  if (url.pathname === '/api/printing/customers' && request.method === 'GET') return customers(env, context, url.searchParams.get('q') || '');
  if (url.pathname === '/api/printing/customers' && request.method === 'POST') return createCustomer(request, env, context);
  if (url.pathname === '/api/printing/jobs' && request.method === 'GET') return listJobs(request, env, context);
  if (url.pathname === '/api/printing/jobs' && request.method === 'POST') {
    try { return await createJob(request, env, context); } catch {
      return json({ error: 'The Printing job could not be saved. Refresh and try again.' }, 503);
    }
  }
  if (url.pathname === '/api/printing/jobs/status' && request.method === 'POST') return transitionJob(request, env, context);
  if (url.pathname === '/api/printing/jobs/materials' && request.method === 'POST') {
    try { return await addMaterial(request, env, context); } catch {
      return json({ error: 'The Printing material usage could not be saved. Refresh and try again.' }, 503);
    }
  }
  if (url.pathname === '/api/printing/jobs/qc' && request.method === 'POST') return qualityCheck(request, env, context);
  return null;
}
