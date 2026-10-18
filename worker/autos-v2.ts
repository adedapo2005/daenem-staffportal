import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface AutosEnv extends AuthEnv {}
type Level = 'view' | 'create' | 'edit' | 'approve' | 'manage';
const COMPANY = 'company-autos';
const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const kobo = (naira: unknown) => Math.round(Math.max(0, Number(naira || 0)) * 100);
const hasCompany = (context: SessionContext) => context.companies.some((company) => company.id === COMPANY);
const can = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'autos.access', level, COMPANY);
const canSales = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'sales.access', level, COMPANY);

function nigeriaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function setting(env: AutosEnv, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT setting_value AS value FROM app_settings WHERE setting_key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

async function nextNumber(env: AutosEnv, prefix: string, table: 'auto_leads' | 'auto_workshop_jobs' | 'auto_sales' | 'auto_gate_passes', column: 'lead_no' | 'job_no' | 'sale_no' | 'pass_no') {
  const date = nigeriaDate().replaceAll('-', '');
  const pattern = `${prefix}-${date}-%`;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} LIKE ?`).bind(pattern).first<{ count: number }>();
  return `${prefix}-${date}-${String(Number(row?.count || 0) + 1).padStart(4, '0')}`;
}

async function recalculateVehicle(env: AutosEnv, vehicleId: string) {
  const vehicle = await env.DB.prepare(`SELECT purchase_cost_kobo AS purchaseCostKobo, sale_price_kobo AS salePriceKobo FROM auto_vehicles WHERE id = ? AND company_id = ?`).bind(vehicleId, COMPANY).first<{ purchaseCostKobo: number; salePriceKobo?: number }>();
  if (!vehicle) return;
  const costs = await env.DB.prepare(`SELECT COALESCE(SUM(amount_kobo), 0) AS amount FROM auto_vehicle_costs WHERE vehicle_id = ? AND cost_type != 'purchase'`).bind(vehicleId).first<{ amount: number }>();
  const landed = Number(vehicle.purchaseCostKobo || 0) + Number(costs?.amount || 0);
  const profit = vehicle.salePriceKobo == null ? null : Number(vehicle.salePriceKobo) - landed;
  await env.DB.prepare(`UPDATE auto_vehicles SET landed_cost_kobo = ?, gross_profit_kobo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(landed, profit, vehicleId).run();
}

async function dashboard(env: AutosEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Daenem Autos access is not assigned.' }, 403);
  const stock = await env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(landed_cost_kobo),0) AS stockValueKobo, SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready, SUM(CASE WHEN status IN ('repair','inspection','detailing') THEN 1 ELSE 0 END) AS preparation, SUM(CASE WHEN status='reserved' THEN 1 ELSE 0 END) AS reserved FROM auto_vehicles WHERE company_id=? AND status NOT IN ('sold','delivered','retired')`).bind(COMPANY).first<Record<string, number>>();
  const leads = await env.DB.prepare(`SELECT COUNT(*) AS openLeads, SUM(CASE WHEN status='test_drive' THEN 1 ELSE 0 END) AS testDrive, SUM(CASE WHEN status='negotiation' THEN 1 ELSE 0 END) AS negotiation, SUM(CASE WHEN next_follow_up_at IS NOT NULL AND datetime(next_follow_up_at)<=datetime('now') AND status NOT IN ('won','lost') THEN 1 ELSE 0 END) AS followupDue FROM auto_leads WHERE company_id=? AND status NOT IN ('won','lost')`).bind(COMPANY).first<Record<string, number>>();
  const workshop = await env.DB.prepare(`SELECT COUNT(*) AS openJobs, SUM(CASE WHEN status='waiting_parts' THEN 1 ELSE 0 END) AS waitingParts, SUM(CASE WHEN priority='urgent' THEN 1 ELSE 0 END) AS urgent FROM auto_workshop_jobs WHERE company_id=? AND status NOT IN ('completed','delivered','cancelled')`).bind(COMPANY).first<Record<string, number>>();
  const sales = await env.DB.prepare(`SELECT COUNT(*) AS salesCount, COALESCE(SUM(s.sale_price_kobo),0) AS revenueKobo, COALESCE(SUM(av.gross_profit_kobo),0) AS grossProfitKobo FROM auto_sales s JOIN auto_vehicles av ON av.id=s.vehicle_id AND av.company_id=s.company_id WHERE s.company_id=? AND substr(s.sale_date,1,7)=substr(?,1,7) AND s.sale_status!='cancelled'`).bind(COMPANY, nigeriaDate()).first<Record<string, number>>();
  return json({ metrics: { vehicles: Number(stock?.total || 0), stockValueKobo: Number(stock?.stockValueKobo || 0), ready: Number(stock?.ready || 0), preparation: Number(stock?.preparation || 0), reserved: Number(stock?.reserved || 0), openLeads: Number(leads?.openLeads || 0), testDrives: Number(leads?.testDrive || 0), negotiations: Number(leads?.negotiation || 0), followupsDue: Number(leads?.followupDue || 0), openWorkshopJobs: Number(workshop?.openJobs || 0), waitingParts: Number(workshop?.waitingParts || 0), urgentWorkshop: Number(workshop?.urgent || 0), monthlySales: Number(sales?.salesCount || 0), monthlyRevenueKobo: Number(sales?.revenueKobo || 0), monthlyGrossProfitKobo: Number(sales?.grossProfitKobo || 0) } });
}

async function listVehicles(request: Request, env: AutosEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Daenem Autos access is not assigned.' }, 403);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const query = `%${(url.searchParams.get('q') || '').trim()}%`;
  const rows = await env.DB.prepare(`SELECT av.id,av.stock_no AS stockNo,av.vin,av.chassis_no AS chassisNo,av.year,av.make,av.model,av.trim,av.mileage_km AS mileageKm,av.source_type AS sourceType,av.source_name AS sourceName,av.purchase_cost_kobo AS purchaseCostKobo,av.asking_price_kobo AS askingPriceKobo,av.minimum_price_kobo AS minimumPriceKobo,av.landed_cost_kobo AS landedCostKobo,av.sale_price_kobo AS salePriceKobo,av.gross_profit_kobo AS grossProfitKobo,av.status,av.condition_grade AS conditionGrade,av.updated_at AS updatedAt FROM auto_vehicles av WHERE av.company_id=? AND (?='' OR av.status=?) AND (?='%%' OR av.stock_no LIKE ? OR av.vin LIKE ? OR av.make LIKE ? OR av.model LIKE ?) ORDER BY av.updated_at DESC LIMIT 300`).bind(COMPANY, status, status, query, query, query, query, query).all<Record<string, unknown>>();
  return json({ vehicles: rows.results || [] });
}

async function createVehicle(request: Request, env: AutosEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Autos permission is required.' }, 403);
  let body: { stockNo?: string; vin?: string; chassisNo?: string; year?: number; make?: string; model?: string; trim?: string; sourceType?: string; sourceName?: string; purchaseCostNaira?: number; askingPriceNaira?: number; minimumPriceNaira?: number; mileageKm?: number; conditionGrade?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid vehicle request.' }, 400); }
  const stockNo = String(body.stockNo || '').trim().toUpperCase();
  const make = String(body.make || '').trim();
  const model = String(body.model || '').trim();
  if (!stockNo || !make || !model) return json({ error: 'Stock number, make and model are required.' }, 400);
  const id = uid('auto-vehicle');
  const purchaseCost = kobo(body.purchaseCostNaira);
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO auto_vehicles(id,company_id,location_id,stock_no,vin,chassis_no,year,make,model,trim,mileage_km,source_type,source_name,purchase_date,purchase_cost_kobo,asking_price_kobo,minimum_price_kobo,landed_cost_kobo,condition_grade,acquired_by) VALUES(?,?,'location-autos-hq',?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?)`).bind(id, COMPANY, stockNo, body.vin || null, body.chassisNo || null, body.year ?? null, make, model, body.trim || null, body.mileageKm ?? null, body.sourceType || 'import', body.sourceName || null, nigeriaDate(), purchaseCost, kobo(body.askingPriceNaira), body.minimumPriceNaira == null ? null : kobo(body.minimumPriceNaira), purchaseCost, body.conditionGrade || null, context.employee.id),
      env.DB.prepare(`INSERT INTO auto_vehicle_costs(id,vehicle_id,company_id,cost_type,description,amount_kobo,cost_date,approved_by,approved_at,recorded_by) VALUES(?,?,?,'purchase','Vehicle acquisition cost',?,?,?,?,?)`).bind(uid('vehicle-cost'), id, COMPANY, purchaseCost, nigeriaDate(), context.employee.id, new Date().toISOString(), context.employee.id),
    ]);
  } catch { return json({ error: 'Vehicle stock number, VIN or chassis number may already exist.' }, 409); }
  return json({ ok: true, vehicle: { id, stockNo, status: 'acquired' } }, 201);
}

async function addVehicleCost(request: Request, env: AutosEnv, context: SessionContext) {
  if (!can(context, 'edit')) return json({ error: 'Edit Autos permission is required.' }, 403);
  let body: { vehicleId?: string; costType?: string; description?: string; amountNaira?: number; vendorName?: string; reference?: string; costDate?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid cost request.' }, 400); }
  const types = ['auction_fee','inland_transport','shipping','port_charge','customs','clearing','mechanical','bodywork','parts','detailing','registration','storage','insurance','commission','fuel','other'];
  if (!body.vehicleId || !types.includes(String(body.costType)) || !String(body.description || '').trim()) return json({ error: 'Vehicle, cost type and description are required.' }, 400);
  const vehicle = await env.DB.prepare(`SELECT id FROM auto_vehicles WHERE id=? AND company_id=?`).bind(body.vehicleId, COMPANY).first();
  if (!vehicle) return json({ error: 'Vehicle not found.' }, 404);
  const amount = kobo(body.amountNaira);
  const threshold = Number(await setting(env, 'autos.require_cost_approval_threshold_kobo', '50000000'));
  const approved = amount < threshold || hasPermission(context, 'autos.access', 'approve', COMPANY);
  const id = uid('vehicle-cost');
  await env.DB.prepare(`INSERT INTO auto_vehicle_costs(id,vehicle_id,company_id,cost_type,description,amount_kobo,vendor_name,reference,cost_date,approved_by,approved_at,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, body.vehicleId, COMPANY, body.costType, body.description, amount, body.vendorName || null, body.reference || null, body.costDate || nigeriaDate(), approved ? context.employee.id : null, approved ? new Date().toISOString() : null, context.employee.id).run();
  await recalculateVehicle(env, body.vehicleId);
  return json({ ok: true, cost: { id, approved, approvalRequired: !approved } });
}

async function updateVehicleStatus(request: Request, env: AutosEnv, context: SessionContext) {
  if (!can(context, 'edit')) return json({ error: 'Edit Autos permission is required.' }, 403);
  let body: { vehicleId?: string; status?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid vehicle update.' }, 400); }
  const statuses = ['acquired','in_transit','clearing','inspection','repair','detailing','ready','reserved','sold','delivered','hold','retired'];
  if (!body.vehicleId || !statuses.includes(String(body.status))) return json({ error: 'Vehicle and valid status are required.' }, 400);
  const result = await env.DB.prepare(`UPDATE auto_vehicles SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND NOT EXISTS (SELECT 1 FROM auto_sales s WHERE s.vehicle_id=auto_vehicles.id AND s.company_id=auto_vehicles.company_id AND s.sale_status!='cancelled')`).bind(body.status, body.vehicleId, COMPANY).run();
  return result.meta.changes ? json({ ok: true, status: body.status }) : json({ error: 'Vehicle is not available for a status update.' }, 409);
}

async function listLeads(env: AutosEnv, context: SessionContext) {
  if (!can(context) && !canSales(context)) return json({ error: 'Autos sales access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT l.id,l.lead_no AS leadNo,l.customer_name AS customerName,l.phone,l.email,l.interested_make AS interestedMake,l.interested_model AS interestedModel,l.budget_kobo AS budgetKobo,l.status,l.next_follow_up_at AS nextFollowUpAt,l.last_contact_at AS lastContactAt,l.vehicle_id AS vehicleId,av.stock_no AS stockNo,av.year,av.make,av.model,e.display_name AS assignedTo FROM auto_leads l LEFT JOIN auto_vehicles av ON av.id=l.vehicle_id AND av.company_id=l.company_id LEFT JOIN employees e ON e.id=l.assigned_to WHERE l.company_id=? ORDER BY CASE WHEN l.status IN ('won','lost') THEN 1 ELSE 0 END,l.next_follow_up_at,l.updated_at DESC LIMIT 300`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ leads: rows.results || [] });
}

async function createLead(request: Request, env: AutosEnv, context: SessionContext) {
  if (!canSales(context, 'create') && !can(context, 'create')) return json({ error: 'Create Sales or Autos permission is required.' }, 403);
  let body: { vehicleId?: string; source?: string; customerName?: string; phone?: string; email?: string; interestedMake?: string; interestedModel?: string; budgetNaira?: number; nextFollowUpAt?: string; notes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid lead request.' }, 400); }
  if (!String(body.customerName || '').trim()) return json({ error: 'Customer/prospect name is required.' }, 400);
  if (body.vehicleId) {
    const vehicle = await env.DB.prepare(`SELECT id FROM auto_vehicles WHERE id=? AND company_id=?`).bind(body.vehicleId, COMPANY).first();
    if (!vehicle) return json({ error: 'Vehicle not found.' }, 404);
  }
  const id = uid('auto-lead');
  const leadNo = await nextNumber(env, 'LEAD', 'auto_leads', 'lead_no');
  await env.DB.prepare(`INSERT INTO auto_leads(id,company_id,vehicle_id,lead_no,source,customer_name,phone,email,interested_make,interested_model,budget_kobo,assigned_to,next_follow_up_at,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, COMPANY, body.vehicleId || null, leadNo, body.source || null, body.customerName, body.phone || null, body.email || null, body.interestedMake || null, body.interestedModel || null, body.budgetNaira == null ? null : kobo(body.budgetNaira), context.employee.id, body.nextFollowUpAt || null, body.notes || null, context.employee.id).run();
  return json({ ok: true, lead: { id, leadNo, status: 'new' } }, 201);
}

async function addLeadActivity(request: Request, env: AutosEnv, context: SessionContext) {
  if (!canSales(context, 'create') && !can(context, 'create')) return json({ error: 'Sales activity permission is required.' }, 403);
  let body: { leadId?: string; activityType?: string; note?: string; amountNaira?: number; nextFollowUpAt?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid lead activity.' }, 400); }
  const activity = String(body.activityType || '');
  const types = ['call','whatsapp','email','visit','test_drive','quote','negotiation','deposit','note','follow_up','lost','won'];
  if (!body.leadId || !types.includes(activity)) return json({ error: 'Lead and activity type are required.' }, 400);
  const lead = await env.DB.prepare(`SELECT id FROM auto_leads WHERE id=? AND company_id=?`).bind(body.leadId, COMPANY).first();
  if (!lead) return json({ error: 'Lead not found.' }, 404);
  const status = activity === 'test_drive' ? 'test_drive' : ['quote','negotiation'].includes(activity) ? 'negotiation' : activity === 'deposit' ? 'deposit' : activity === 'won' ? 'won' : activity === 'lost' ? 'lost' : 'contacted';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO auto_lead_activities(id,lead_id,activity_type,note,amount_kobo,next_follow_up_at,recorded_by) VALUES(?,?,?,?,?,?,?)`).bind(uid('lead-activity'), body.leadId, activity, body.note || null, body.amountNaira == null ? null : kobo(body.amountNaira), body.nextFollowUpAt || null, context.employee.id),
    env.DB.prepare(`UPDATE auto_leads SET status=?,last_contact_at=CURRENT_TIMESTAMP,next_follow_up_at=COALESCE(?,next_follow_up_at),updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(status, body.nextFollowUpAt || null, body.leadId, COMPANY),
  ]);
  return json({ ok: true, status });
}

async function listWorkshop(env: AutosEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Autos access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT w.id,w.job_no AS jobNo,w.job_type AS jobType,w.vehicle_id AS vehicleId,av.stock_no AS stockNo,av.year,av.make,av.model,w.complaint,w.diagnosis,w.estimate_kobo AS estimateKobo,w.actual_cost_kobo AS actualCostKobo,w.status,w.priority,advisor.display_name AS advisorName,tech.display_name AS technicianName FROM auto_workshop_jobs w JOIN auto_vehicles av ON av.id=w.vehicle_id AND av.company_id=w.company_id LEFT JOIN employees advisor ON advisor.id=w.advisor_id LEFT JOIN employees tech ON tech.id=w.technician_id WHERE w.company_id=? ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,w.updated_at DESC LIMIT 300`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ jobs: rows.results || [] });
}

async function createWorkshopJob(request: Request, env: AutosEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Autos permission is required.' }, 403);
  let body: { vehicleId?: string; jobType?: string; complaint?: string; diagnosis?: string; estimateNaira?: number; priority?: string; promisedAt?: string; odometerKm?: number; notes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid workshop request.' }, 400); }
  if (!body.vehicleId) return json({ error: 'Vehicle is required.' }, 400);
  const vehicle = await env.DB.prepare(`SELECT id FROM auto_vehicles WHERE id=? AND company_id=?`).bind(body.vehicleId, COMPANY).first();
  if (!vehicle) return json({ error: 'Vehicle not found.' }, 404);
  const id = uid('workshop-job');
  const jobNo = await nextNumber(env, 'WS', 'auto_workshop_jobs', 'job_no');
  const estimate = kobo(body.estimateNaira);
  const threshold = Number(await setting(env, 'autos.require_cost_approval_threshold_kobo', '50000000'));
  const needsApproval = estimate >= threshold && !hasPermission(context, 'autos.access', 'approve', COMPANY);
  const status = needsApproval ? 'awaiting_approval' : 'requested';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO auto_workshop_jobs(id,company_id,location_id,vehicle_id,job_no,job_type,complaint,diagnosis,estimate_kobo,status,priority,promised_at,odometer_km,notes,created_by) VALUES(?,?,'location-autos-hq',?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, COMPANY, body.vehicleId, jobNo, body.jobType || 'internal', body.complaint || null, body.diagnosis || null, estimate, status, body.priority || 'normal', body.promisedAt || null, body.odometerKm ?? null, body.notes || null, context.employee.id),
    env.DB.prepare(`UPDATE auto_vehicles SET status=CASE WHEN status IN ('acquired','inspection','ready','detailing') THEN 'repair' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(body.vehicleId, COMPANY),
  ]);
  return json({ ok: true, job: { id, jobNo, status, approvalRequired: needsApproval } }, 201);
}

async function updateWorkshop(request: Request, env: AutosEnv, context: SessionContext) {
  if (!can(context, 'edit')) return json({ error: 'Edit Autos permission is required.' }, 403);
  let body: { jobId?: string; status?: string; diagnosis?: string; actualCostNaira?: number; notes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid workshop update.' }, 400); }
  const statuses = ['requested','inspection','estimate','awaiting_approval','approved','in_progress','waiting_parts','quality_check','ready','delivered','completed','cancelled'];
  if (!body.jobId || !statuses.includes(String(body.status))) return json({ error: 'Workshop job and valid status are required.' }, 400);
  const job = await env.DB.prepare(`SELECT id,vehicle_id AS vehicleId,status FROM auto_workshop_jobs WHERE id=? AND company_id=?`).bind(body.jobId, COMPANY).first<{ id: string; vehicleId: string; status: string }>();
  if (!job) return json({ error: 'Workshop job not found.' }, 404);
  if (['approved','completed','cancelled'].includes(String(body.status)) && body.status !== job.status && !hasPermission(context, 'autos.access', 'approve', COMPANY)) return json({ error: 'Approve Autos permission is required for this status.' }, 403);
  await env.DB.prepare(`UPDATE auto_workshop_jobs SET status=?,diagnosis=COALESCE(?,diagnosis),actual_cost_kobo=COALESCE(?,actual_cost_kobo),notes=COALESCE(?,notes),approved_by=CASE WHEN ?='approved' THEN ? ELSE approved_by END,approved_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,started_at=CASE WHEN ?='in_progress' THEN COALESCE(started_at,CURRENT_TIMESTAMP) ELSE started_at END,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(body.status, body.diagnosis || null, body.actualCostNaira == null ? null : kobo(body.actualCostNaira), body.notes || null, body.status, context.employee.id, body.status, body.status, body.status, body.jobId, COMPANY).run();
  if (body.actualCostNaira != null) {
    await env.DB.prepare(`INSERT INTO auto_vehicle_costs(id,vehicle_id,company_id,cost_type,description,amount_kobo,cost_date,approved_by,approved_at,recorded_by) VALUES(?,?,?,'mechanical','Workshop job cost',?,?,?,?,?)`).bind(uid('vehicle-cost'), job.vehicleId, COMPANY, kobo(body.actualCostNaira), nigeriaDate(), context.employee.id, new Date().toISOString(), context.employee.id).run();
    await recalculateVehicle(env, job.vehicleId);
  }
  if (body.status === 'completed') await env.DB.prepare(`UPDATE auto_vehicles SET status='detailing',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='repair'`).bind(job.vehicleId, COMPANY).run();
  return json({ ok: true, status: body.status });
}

async function sellVehicle(request: Request, env: AutosEnv, context: SessionContext) {
  if (!canSales(context, 'edit') && !can(context, 'approve')) return json({ error: 'Edit Sales or Approve Autos permission is required.' }, 403);
  let body: { vehicleId?: string; leadId?: string; customerId?: string; salePriceNaira?: number; depositNaira?: number; amountPaidNaira?: number; paymentTerms?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid vehicle sale.' }, 400); }
  if (!body.vehicleId || Number(body.salePriceNaira) <= 0) return json({ error: 'Vehicle and sale price are required.' }, 400);
  const vehicle = await env.DB.prepare(`SELECT id,status,minimum_price_kobo AS minimumPriceKobo,landed_cost_kobo AS landedCostKobo FROM auto_vehicles WHERE id=? AND company_id=?`).bind(body.vehicleId, COMPANY).first<{ id: string; status: string; minimumPriceKobo?: number; landedCostKobo: number }>();
  if (!vehicle || vehicle.status !== 'ready') return json({ error: 'Vehicle is not available for sale.' }, 409);
  if (body.leadId) {
    const lead = await env.DB.prepare(`SELECT id FROM auto_leads WHERE id=? AND company_id=?`).bind(body.leadId, COMPANY).first();
    if (!lead) return json({ error: 'Sale reference not found.' }, 404);
  }
  if (body.customerId) {
    const customer = await env.DB.prepare(`SELECT id FROM customers WHERE id=? AND company_id=?`).bind(body.customerId, COMPANY).first();
    if (!customer) return json({ error: 'Sale reference not found.' }, 404);
  }
  const salePrice = kobo(body.salePriceNaira);
  if (vehicle.minimumPriceKobo && salePrice < vehicle.minimumPriceKobo && !hasPermission(context, 'autos.access', 'approve', COMPANY)) return json({ error: 'Sale price is below the configured minimum and requires approval.' }, 403);
  // Sale requests record a commercial commitment only. Client-entered deposit
  // or amountPaid values are not authoritative payment evidence.
  const paid = 0;
  const balance = salePrice;
  const paymentStatus = 'unpaid';
  const saleStatus = 'reserved';
  const id = uid('auto-sale');
  // A count-derived number races when separate vehicles are sold concurrently.
  // Bind the immutable reference to this sale identity; the database uniqueness
  // constraint remains the final collision barrier.
  const saleNo = `AUTO-SALE-${nigeriaDate().replaceAll('-', '')}-${id.slice('auto-sale-'.length)}`;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE auto_vehicles SET sale_price_kobo=?,gross_profit_kobo=?-landed_cost_kobo,status='reserved',customer_id=?,sold_by=?,sold_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='ready' AND NOT EXISTS (SELECT 1 FROM auto_sales s WHERE s.vehicle_id=auto_vehicles.id AND s.company_id=auto_vehicles.company_id AND s.sale_status!='cancelled')`).bind(salePrice, salePrice, body.customerId || null, context.employee.id, body.vehicleId, COMPANY),
    env.DB.prepare(`INSERT INTO auto_sales(id,company_id,vehicle_id,lead_id,customer_id,sale_no,sale_price_kobo,deposit_kobo,amount_paid_kobo,balance_kobo,payment_status,sale_status,payment_terms,sold_by,approved_by,approved_at,sale_date) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1`).bind(id, COMPANY, body.vehicleId, body.leadId || null, body.customerId || null, saleNo, salePrice, 0, paid, balance, paymentStatus, saleStatus, body.paymentTerms || null, context.employee.id, context.employee.id, new Date().toISOString(), nigeriaDate()),
  ];
  if (body.leadId) statements.push(env.DB.prepare(`UPDATE auto_leads SET status='won',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND changes()=1`).bind(body.leadId, COMPANY));
  const [reservation, sale] = await env.DB.batch(statements);
  if (Number(reservation.meta?.changes || 0) !== 1 || Number(sale.meta?.changes || 0) !== 1) {
    return json({ error: 'Vehicle is not available for sale.' }, 409);
  }
  return json({ ok: true, sale: { id, saleNo, salePriceKobo: salePrice, amountPaidKobo: paid, balanceKobo: balance, paymentStatus, saleStatus, grossProfitKobo: salePrice - Number(vehicle.landedCostKobo || 0) } }, 201);
}

async function recordMovement(request: Request, env: AutosEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Autos permission is required.' }, 403);
  let body: { vehicleId?: string; movementType?: string; fromLocation?: string; toLocation?: string; reason?: string; driverEmployeeId?: string; mileageKm?: number; latitude?: number; longitude?: number; returned?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'Invalid vehicle movement.' }, 400); }
  const movementType = String(body.movementType || '');
  const types = ['yard_in','yard_out','workshop','wash','test_drive','fuel','inspection','delivery','transfer','other'];
  if (!body.vehicleId || !types.includes(movementType) || !String(body.reason || '').trim()) return json({ error: 'Vehicle, movement type and reason are required.' }, 400);
  const vehicle = await env.DB.prepare(`SELECT id FROM auto_vehicles WHERE id=? AND company_id=?`).bind(body.vehicleId, COMPANY).first();
  if (!vehicle) return json({ error: 'Vehicle not found.' }, 404);
  if (body.driverEmployeeId) {
    const driver = await env.DB.prepare(`SELECT 1 AS ok FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1`).bind(body.driverEmployeeId, COMPANY).first();
    if (!driver) return json({ error: 'Driver not found.' }, 404);
  }
  const requiresPass = (await setting(env, 'autos.require_gate_pass_for_vehicle_exit', 'true')) === 'true' && ['yard_out','test_drive','delivery','transfer','workshop'].includes(movementType);
  let gatePassNo: string | null = null;
  if (requiresPass) {
    if (!hasPermission(context, 'autos.access', 'approve', COMPANY)) return json({ error: 'This movement requires a Manager-approved gate pass.' }, 403);
    gatePassNo = await nextNumber(env, 'GATE', 'auto_gate_passes', 'pass_no');
    const passType = movementType === 'delivery' ? 'customer_delivery' : movementType === 'yard_out' ? 'other' : movementType;
    await env.DB.prepare(`INSERT INTO auto_gate_passes(id,company_id,vehicle_id,pass_no,pass_type,purpose,released_to,driver_employee_id,approved_by,status) VALUES(?,?,?,?,?,?,?,?,?,'open')`).bind(uid('gate-pass'), COMPANY, body.vehicleId, gatePassNo, passType, body.reason, body.driverEmployeeId || context.employee.displayName, body.driverEmployeeId || null, context.employee.id).run();
  }
  const id = uid('vehicle-movement');
  await env.DB.prepare(`INSERT INTO auto_vehicle_movements(id,vehicle_id,company_id,movement_type,from_location,to_location,reason,driver_employee_id,authorized_by,mileage_km,keys_released,gate_pass_no,latitude,longitude,departed_at,returned_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?)`).bind(id, body.vehicleId, COMPANY, movementType, body.fromLocation || null, body.toLocation || null, body.reason, body.driverEmployeeId || null, context.employee.id, body.mileageKm ?? null, requiresPass ? 1 : 0, gatePassNo, body.latitude ?? null, body.longitude ?? null, body.returned ? new Date().toISOString() : null, context.employee.id).run();
  return json({ ok: true, movement: { id, gatePassNo } });
}

export async function routeAutosV2(request: Request, env: AutosEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/autos/dashboard' && request.method === 'GET') return dashboard(env, context);
  if (url.pathname === '/api/autos/vehicles' && request.method === 'GET') return listVehicles(request, env, context);
  if (url.pathname === '/api/autos/vehicles' && request.method === 'POST') return createVehicle(request, env, context);
  if (url.pathname === '/api/autos/vehicles/cost' && request.method === 'POST') return addVehicleCost(request, env, context);
  if (url.pathname === '/api/autos/vehicles/status' && request.method === 'POST') return updateVehicleStatus(request, env, context);
  if (url.pathname === '/api/autos/leads' && request.method === 'GET') return listLeads(env, context);
  if (url.pathname === '/api/autos/leads' && request.method === 'POST') return createLead(request, env, context);
  if (url.pathname === '/api/autos/leads/activity' && request.method === 'POST') return addLeadActivity(request, env, context);
  if (url.pathname === '/api/autos/workshop' && request.method === 'GET') return listWorkshop(env, context);
  if (url.pathname === '/api/autos/workshop' && request.method === 'POST') return createWorkshopJob(request, env, context);
  if (url.pathname === '/api/autos/workshop/update' && request.method === 'POST') return updateWorkshop(request, env, context);
  if (url.pathname === '/api/autos/sales' && request.method === 'POST') return sellVehicle(request, env, context);
  if (url.pathname === '/api/autos/movements' && request.method === 'POST') return recordMovement(request, env, context);
  return null;
}
