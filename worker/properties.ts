import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface PropertiesEnv extends AuthEnv {}
type Level = 'view' | 'create' | 'edit' | 'approve' | 'manage';
const COMPANY = 'company-properties';
const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const kobo = (naira: unknown) => Math.round(Math.max(0, Number(naira || 0)) * 100);
const hasCompany = (context: SessionContext) => context.companies.some((company) => company.id === COMPANY);
const can = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'properties.access', level, COMPANY);
const canSales = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'sales.access', level, COMPANY);
const canFinance = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'finance.access', level, COMPANY);
const canFacilities = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'facilities.access', level, COMPANY);

function nigeriaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function nextNo(env: PropertiesEnv, prefix: string, table: 'property_listings' | 'property_leads' | 'property_inspections' | 'property_leases' | 'property_rent_payments' | 'property_maintenance_requests', column: 'listing_no' | 'lead_no' | 'inspection_no' | 'lease_no' | 'receipt_no' | 'request_no') {
  const day = nigeriaDate().replaceAll('-', '');
  const pattern = `${prefix}-${day}-%`;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} LIKE ?`).bind(pattern).first<{ count: number }>();
  return `${prefix}-${day}-${String(Number(row?.count || 0) + 1).padStart(4, '0')}`;
}

async function setting(env: PropertiesEnv, key: string, fallback: string) {
  const row = await env.DB.prepare(`SELECT setting_value AS value FROM app_settings WHERE setting_key=?`).bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

async function refreshOverdue(env: PropertiesEnv) {
  if ((await setting(env, 'properties.auto_mark_overdue_schedule', 'true')) !== 'true') return;
  await env.DB.prepare(`UPDATE property_rent_schedule SET status='overdue',updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND status IN ('pending','part_paid') AND date(due_date)<date(?) AND balance_kobo>0`).bind(COMPANY, nigeriaDate()).run();
}

async function dashboard(env: PropertiesEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Daenem Homes & Properties access is not assigned.' }, 403);
  await refreshOverdue(env);
  const inventory = await env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,SUM(CASE WHEN status='occupied' THEN 1 ELSE 0 END) AS occupied,SUM(CASE WHEN status IN ('reserved','under_offer') THEN 1 ELSE 0 END) AS underOffer,COALESCE(SUM(CASE WHEN status NOT IN ('sold','archived','inactive') THEN market_value_kobo ELSE 0 END),0) AS portfolioValueKobo FROM properties WHERE company_id=?`).bind(COMPANY).first<Record<string, number>>();
  const leads = await env.DB.prepare(`SELECT COUNT(*) AS openLeads,SUM(CASE WHEN status='inspection_scheduled' THEN 1 ELSE 0 END) AS inspections,SUM(CASE WHEN status IN ('negotiation','offer','deposit') THEN 1 ELSE 0 END) AS negotiations,SUM(CASE WHEN next_follow_up_at IS NOT NULL AND datetime(next_follow_up_at)<=datetime('now') AND status NOT IN ('won','lost') THEN 1 ELSE 0 END) AS followupsDue FROM property_leads WHERE company_id=? AND status NOT IN ('won','lost')`).bind(COMPANY).first<Record<string, number>>();
  const rent = await env.DB.prepare(`SELECT COALESCE(SUM(balance_kobo),0) AS outstandingKobo,COALESCE(SUM(CASE WHEN status='overdue' THEN balance_kobo ELSE 0 END),0) AS arrearsKobo,COUNT(CASE WHEN status='overdue' THEN 1 END) AS overdueCharges FROM property_rent_schedule WHERE company_id=? AND status NOT IN ('paid','waived','cancelled')`).bind(COMPANY).first<Record<string, number>>();
  const leases = await env.DB.prepare(`SELECT COUNT(*) AS activeLeases,SUM(CASE WHEN date(end_date)<=date('now','+60 days') AND status='active' THEN 1 ELSE 0 END) AS expiringSoon FROM property_leases WHERE company_id=? AND status IN ('active','expiring')`).bind(COMPANY).first<Record<string, number>>();
  const maintenance = await env.DB.prepare(`SELECT COUNT(*) AS openMaintenance,SUM(CASE WHEN priority IN ('urgent','emergency') THEN 1 ELSE 0 END) AS urgentMaintenance,COALESCE(SUM(actual_cost_kobo),0) AS maintenanceCostKobo FROM property_maintenance_requests WHERE company_id=? AND status NOT IN ('verified','cancelled')`).bind(COMPANY).first<Record<string, number>>();
  return json({ metrics: { properties: Number(inventory?.total || 0), available: Number(inventory?.available || 0), occupied: Number(inventory?.occupied || 0), underOffer: Number(inventory?.underOffer || 0), portfolioValueKobo: Number(inventory?.portfolioValueKobo || 0), openLeads: Number(leads?.openLeads || 0), inspectionsScheduled: Number(leads?.inspections || 0), negotiations: Number(leads?.negotiations || 0), followupsDue: Number(leads?.followupsDue || 0), outstandingKobo: Number(rent?.outstandingKobo || 0), arrearsKobo: Number(rent?.arrearsKobo || 0), overdueCharges: Number(rent?.overdueCharges || 0), activeLeases: Number(leases?.activeLeases || 0), expiringSoon: Number(leases?.expiringSoon || 0), openMaintenance: Number(maintenance?.openMaintenance || 0), urgentMaintenance: Number(maintenance?.urgentMaintenance || 0), maintenanceCostKobo: Number(maintenance?.maintenanceCostKobo || 0) } });
}

async function listProperties(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Properties access is required.' }, 403);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const query = `%${(url.searchParams.get('q') || '').trim()}%`;
  const rows = await env.DB.prepare(`SELECT p.id,p.property_code AS propertyCode,p.name,p.property_type AS propertyType,p.ownership_type AS ownershipType,p.address,p.city,p.state,p.land_size AS landSize,p.land_size_unit AS landSizeUnit,p.bedrooms,p.bathrooms,p.title_document_type AS titleDocumentType,p.market_value_kobo AS marketValueKobo,p.asking_price_kobo AS askingPriceKobo,p.rent_amount_kobo AS rentAmountKobo,p.rent_frequency AS rentFrequency,p.service_charge_kobo AS serviceChargeKobo,p.status,p.description,o.name AS ownerName,(SELECT COUNT(*) FROM property_units u WHERE u.property_id=p.id) AS unitCount,(SELECT COUNT(*) FROM property_units u WHERE u.property_id=p.id AND u.status='occupied') AS occupiedUnits FROM properties p LEFT JOIN property_owners o ON o.id=p.owner_id WHERE p.company_id=? AND (?='' OR p.status=?) AND (?='%%' OR p.property_code LIKE ? OR p.name LIKE ? OR p.address LIKE ? OR p.city LIKE ?) ORDER BY p.updated_at DESC LIMIT 300`).bind(COMPANY, status, status, query, query, query, query, query).all<Record<string, unknown>>();
  return json({ properties: rows.results || [] });
}

async function createProperty(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Properties permission is required.' }, 403);
  let body: { propertyCode?: string; name?: string; propertyType?: string; ownershipType?: string; address?: string; city?: string; state?: string; latitude?: number; longitude?: number; landSize?: number; landSizeUnit?: string; bedrooms?: number; bathrooms?: number; titleDocumentType?: string; titleReference?: string; marketValueNaira?: number; askingPriceNaira?: number; rentAmountNaira?: number; rentFrequency?: string; serviceChargeNaira?: number; description?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid property request.' }, 400); }
  const propertyCode = String(body.propertyCode || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  const propertyType = String(body.propertyType || 'other');
  const types = ['land','apartment','house','duplex','office','shop','warehouse','estate','shortlet','mixed_use','other'];
  if (!propertyCode || !name || !String(body.address || '').trim() || !types.includes(propertyType)) return json({ error: 'Property code, name, type and address are required.' }, 400);
  const id = uid('property');
  try {
    await env.DB.prepare(`INSERT INTO properties(id,company_id,property_code,name,property_type,ownership_type,address,city,state,latitude,longitude,land_size,land_size_unit,bedrooms,bathrooms,title_document_type,title_reference,market_value_kobo,asking_price_kobo,rent_amount_kobo,rent_frequency,service_charge_kobo,status,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'available',?,?)`).bind(id, COMPANY, propertyCode, name, propertyType, body.ownershipType || 'managed', body.address, body.city || null, body.state || 'Oyo', body.latitude ?? null, body.longitude ?? null, body.landSize ?? null, body.landSizeUnit || null, body.bedrooms ?? null, body.bathrooms ?? null, body.titleDocumentType || null, body.titleReference || null, body.marketValueNaira == null ? null : kobo(body.marketValueNaira), body.askingPriceNaira == null ? null : kobo(body.askingPriceNaira), body.rentAmountNaira == null ? null : kobo(body.rentAmountNaira), body.rentFrequency || null, kobo(body.serviceChargeNaira), body.description || null, context.employee.id).run();
  } catch { return json({ error: 'Property code already exists.' }, 409); }
  return json({ ok: true, property: { id, propertyCode, status: 'available' } }, 201);
}

async function listings(env: PropertiesEnv, context: SessionContext) {
  if (!can(context) && !canSales(context)) return json({ error: 'Property listing access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT l.id,l.listing_no AS listingNo,l.listing_type AS listingType,l.headline,l.asking_price_kobo AS askingPriceKobo,l.commission_type AS commissionType,l.commission_value AS commissionValue,l.status,l.available_from AS availableFrom,l.expires_at AS expiresAt,p.id AS propertyId,p.property_code AS propertyCode,p.name AS propertyName,p.address,p.city,p.state FROM property_listings l JOIN properties p ON p.id=l.property_id WHERE l.company_id=? ORDER BY l.updated_at DESC LIMIT 300`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ listings: rows.results || [] });
}

async function createListing(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!canSales(context, 'create') && !can(context, 'edit')) return json({ error: 'Create Sales/Properties permission is required.' }, 403);
  let body: { propertyId?: string; unitId?: string; listingType?: string; headline?: string; publicDescription?: string; askingPriceNaira?: number; commissionType?: string; commissionValue?: number; availableFrom?: string; expiresAt?: string; publish?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'Invalid listing request.' }, 400); }
  if (!body.propertyId || !String(body.headline || '').trim() || !['sale','rent','lease','shortlet'].includes(String(body.listingType))) return json({ error: 'Property, listing type and headline are required.' }, 400);
  const property = await env.DB.prepare(`SELECT id FROM properties WHERE id=? AND company_id=?`).bind(body.propertyId, COMPANY).first();
  if (!property) return json({ error: 'Property not found.' }, 404);
  const id = uid('listing');
  const listingNo = await nextNo(env, 'LIST', 'property_listings', 'listing_no');
  const status = body.publish ? 'published' : 'draft';
  await env.DB.prepare(`INSERT INTO property_listings(id,company_id,property_id,unit_id,listing_no,listing_type,headline,public_description,asking_price_kobo,commission_type,commission_value,status,available_from,expires_at,published_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, COMPANY, body.propertyId, body.unitId || null, listingNo, body.listingType, body.headline, body.publicDescription || null, kobo(body.askingPriceNaira), body.commissionType || 'percentage', Number(body.commissionValue || 0), status, body.availableFrom || null, body.expiresAt || null, body.publish ? new Date().toISOString() : null, context.employee.id).run();
  return json({ ok: true, listing: { id, listingNo, status } }, 201);
}

async function leads(env: PropertiesEnv, context: SessionContext) {
  if (!can(context) && !canSales(context)) return json({ error: 'Property lead access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT l.id,l.lead_no AS leadNo,l.name,l.phone,l.email,l.interest_type AS interestType,l.budget_min_kobo AS budgetMinKobo,l.budget_max_kobo AS budgetMaxKobo,l.preferred_area AS preferredArea,l.status,l.next_follow_up_at AS nextFollowUpAt,l.last_contact_at AS lastContactAt,l.property_id AS propertyId,p.property_code AS propertyCode,p.name AS propertyName,l.listing_id AS listingId,e.display_name AS assignedAgent,l.created_at AS createdAt FROM property_leads l LEFT JOIN properties p ON p.id=l.property_id LEFT JOIN employees e ON e.id=l.assigned_agent_id WHERE l.company_id=? ORDER BY CASE WHEN l.status IN ('won','lost') THEN 1 ELSE 0 END,l.next_follow_up_at,l.updated_at DESC LIMIT 300`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ leads: rows.results || [] });
}

async function createLead(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!canSales(context, 'create') && !can(context, 'create')) return json({ error: 'Create Sales/Properties permission is required.' }, 403);
  let body: { listingId?: string; propertyId?: string; source?: string; name?: string; phone?: string; email?: string; interestType?: string; budgetMinNaira?: number; budgetMaxNaira?: number; preferredArea?: string; nextFollowUpAt?: string; notes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid property lead.' }, 400); }
  if (!String(body.name || '').trim()) return json({ error: 'Prospect name is required.' }, 400);
  const interestType = ['buy','rent','lease','shortlet','sell','property_management','other'].includes(String(body.interestType)) ? String(body.interestType) : 'buy';
  const id = uid('property-lead');
  const leadNo = await nextNo(env, 'PROP-LEAD', 'property_leads', 'lead_no');
  await env.DB.prepare(`INSERT INTO property_leads(id,company_id,listing_id,property_id,lead_no,source,name,phone,email,interest_type,budget_min_kobo,budget_max_kobo,preferred_area,assigned_agent_id,next_follow_up_at,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, COMPANY, body.listingId || null, body.propertyId || null, leadNo, body.source || null, body.name, body.phone || null, body.email || null, interestType, body.budgetMinNaira == null ? null : kobo(body.budgetMinNaira), body.budgetMaxNaira == null ? null : kobo(body.budgetMaxNaira), body.preferredArea || null, context.employee.id, body.nextFollowUpAt || null, body.notes || null, context.employee.id).run();
  return json({ ok: true, lead: { id, leadNo, status: 'new' } }, 201);
}

async function leadActivity(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!can(context, 'create') && !canSales(context, 'create')) return json({ error: 'Property sales activity permission is required.' }, 403);
  let body: { leadId?: string; activityType?: string; note?: string; amountNaira?: number; nextFollowUpAt?: string; latitude?: number; longitude?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid lead activity.' }, 400); }
  const activity = String(body.activityType || '');
  const types = ['call','whatsapp','email','visit','inspection','offer','negotiation','deposit','follow_up','note','won','lost'];
  if (!body.leadId || !types.includes(activity)) return json({ error: 'Lead and activity type are required.' }, 400);
  const status = activity === 'inspection' ? 'inspected' : activity === 'offer' ? 'offer' : activity === 'negotiation' ? 'negotiation' : activity === 'deposit' ? 'deposit' : activity === 'won' ? 'won' : activity === 'lost' ? 'lost' : 'contacted';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO property_lead_activities(id,lead_id,activity_type,note,amount_kobo,next_follow_up_at,latitude,longitude,recorded_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uid('property-activity'), body.leadId, activity, body.note || null, body.amountNaira == null ? null : kobo(body.amountNaira), body.nextFollowUpAt || null, body.latitude ?? null, body.longitude ?? null, context.employee.id),
    env.DB.prepare(`UPDATE property_leads SET status=?,last_contact_at=CURRENT_TIMESTAMP,next_follow_up_at=COALESCE(?,next_follow_up_at),updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(status, body.nextFollowUpAt || null, body.leadId, COMPANY),
  ]);
  return json({ ok: true, status });
}

async function inspections(env: PropertiesEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Properties access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT i.id,i.inspection_no AS inspectionNo,i.lead_id AS leadId,i.property_id AS propertyId,p.property_code AS propertyCode,p.name AS propertyName,i.scheduled_at AS scheduledAt,i.completed_at AS completedAt,i.visitor_name AS visitorName,i.visitor_phone AS visitorPhone,i.agent_employee_id AS agentEmployeeId,e.display_name AS agentName,i.meeting_point AS meetingPoint,i.result,i.notes,i.latitude,i.longitude FROM property_inspections i JOIN properties p ON p.id=i.property_id JOIN employees e ON e.id=i.agent_employee_id WHERE i.company_id=? ORDER BY i.scheduled_at DESC LIMIT 250`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ inspections: rows.results || [] });
}

async function createInspection(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Properties permission is required.' }, 403);
  let body: { leadId?: string; propertyId?: string; scheduledAt?: string; visitorName?: string; visitorPhone?: string; meetingPoint?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid inspection request.' }, 400); }
  if (!body.propertyId || !body.scheduledAt || !String(body.visitorName || '').trim()) return json({ error: 'Property, inspection time and visitor name are required.' }, 400);
  const id = uid('inspection');
  const inspectionNo = await nextNo(env, 'INSP', 'property_inspections', 'inspection_no');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO property_inspections(id,company_id,lead_id,property_id,inspection_no,scheduled_at,visitor_name,visitor_phone,agent_employee_id,meeting_point,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, COMPANY, body.leadId || null, body.propertyId, inspectionNo, body.scheduledAt, body.visitorName, body.visitorPhone || null, context.employee.id, body.meetingPoint || null, context.employee.id),
    ...(body.leadId ? [env.DB.prepare(`UPDATE property_leads SET status='inspection_scheduled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(body.leadId, COMPANY)] : []),
  ]);
  return json({ ok: true, inspection: { id, inspectionNo } }, 201);
}

async function completeInspection(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Properties inspection permission is required.' }, 403);
  let body: { inspectionId?: string; result?: string; notes?: string; latitude?: number; longitude?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid inspection result.' }, 400); }
  const result = String(body.result || '');
  if (!body.inspectionId || !['interested','negotiating','not_interested','reschedule','no_show','unknown'].includes(result)) return json({ error: 'Inspection and valid result are required.' }, 400);
  const row = await env.DB.prepare(`SELECT id,lead_id AS leadId,agent_employee_id AS agentId FROM property_inspections WHERE id=? AND company_id=?`).bind(body.inspectionId, COMPANY).first<{ id: string; leadId?: string; agentId: string }>();
  if (!row) return json({ error: 'Inspection not found.' }, 404);
  if (row.agentId !== context.employee.id && !can(context, 'edit')) return json({ error: 'Only the assigned agent or manager can complete this inspection.' }, 403);
  if ((await setting(env, 'properties.require_inspection_gps', 'true')) === 'true' && (body.latitude == null || body.longitude == null)) return json({ error: 'GPS location is required to complete this inspection.' }, 400);
  const statements: D1PreparedStatement[] = [env.DB.prepare(`UPDATE property_inspections SET started_at=COALESCE(started_at,CURRENT_TIMESTAMP),completed_at=CURRENT_TIMESTAMP,result=?,notes=?,latitude=?,longitude=? WHERE id=?`).bind(result, body.notes || null, body.latitude ?? null, body.longitude ?? null, body.inspectionId)];
  if (row.leadId) statements.push(env.DB.prepare(`UPDATE property_leads SET status=?,last_contact_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(result === 'negotiating' ? 'negotiation' : result === 'interested' ? 'inspected' : result === 'reschedule' ? 'inspection_scheduled' : 'contacted', row.leadId));
  await env.DB.batch(statements);
  return json({ ok: true, result });
}

async function leases(env: PropertiesEnv, context: SessionContext) {
  if (!can(context) && !canFinance(context)) return json({ error: 'Lease access is required.' }, 403);
  await refreshOverdue(env);
  const rows = await env.DB.prepare(`SELECT l.id,l.lease_no AS leaseNo,l.property_id AS propertyId,p.property_code AS propertyCode,p.name AS propertyName,l.unit_id AS unitId,u.unit_code AS unitCode,l.tenant_id AS tenantId,t.name AS tenantName,t.phone AS tenantPhone,l.start_date AS startDate,l.end_date AS endDate,l.rent_amount_kobo AS rentAmountKobo,l.rent_frequency AS rentFrequency,l.service_charge_kobo AS serviceChargeKobo,l.security_deposit_kobo AS securityDepositKobo,l.status,COALESCE((SELECT SUM(balance_kobo) FROM property_rent_schedule rs WHERE rs.lease_id=l.id AND rs.status NOT IN ('paid','waived','cancelled')),0) AS outstandingKobo,COALESCE((SELECT SUM(balance_kobo) FROM property_rent_schedule rs WHERE rs.lease_id=l.id AND rs.status='overdue'),0) AS arrearsKobo FROM property_leases l JOIN properties p ON p.id=l.property_id LEFT JOIN property_units u ON u.id=l.unit_id JOIN property_tenants t ON t.id=l.tenant_id WHERE l.company_id=? ORDER BY l.end_date,l.updated_at DESC LIMIT 300`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ leases: rows.results || [] });
}

function addMonths(date: Date, months: number) {
  const value = new Date(date.getTime());
  value.setUTCMonth(value.getUTCMonth() + months);
  return value;
}

async function createLease(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!can(context, 'approve') && !canFinance(context, 'edit')) return json({ error: 'Approve Properties or Edit Finance permission is required.' }, 403);
  let body: { propertyId?: string; unitId?: string; tenantName?: string; tenantPhone?: string; tenantEmail?: string; leaseType?: string; startDate?: string; endDate?: string; rentAmountNaira?: number; rentFrequency?: string; serviceChargeNaira?: number; securityDepositNaira?: number; cautionFeeNaira?: number; managementFeeNaira?: number; notes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid lease request.' }, 400); }
  if (!body.propertyId || !String(body.tenantName || '').trim() || !body.startDate || !body.endDate || Number(body.rentAmountNaira) <= 0) return json({ error: 'Property, tenant, lease dates and rent are required.' }, 400);
  const property = await env.DB.prepare(`SELECT id FROM properties WHERE id=? AND company_id=?`).bind(body.propertyId, COMPANY).first();
  if (!property) return json({ error: 'Property not found.' }, 404);
  const tenantId = uid('tenant');
  const leaseId = uid('lease');
  const leaseNo = await nextNo(env, 'LEASE', 'property_leases', 'lease_no');
  const frequency = ['monthly','quarterly','biannual','annual','custom'].includes(String(body.rentFrequency)) ? String(body.rentFrequency) : 'annual';
  const rent = kobo(body.rentAmountNaira);
  const start = new Date(`${body.startDate}T00:00:00Z`);
  const end = new Date(`${body.endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return json({ error: 'Lease end date must be after start date.' }, 400);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO property_tenants(id,company_id,name,phone,email,created_by) VALUES(?,?,?,?,?,?)`).bind(tenantId, COMPANY, body.tenantName, body.tenantPhone || null, body.tenantEmail || null, context.employee.id),
    env.DB.prepare(`INSERT INTO property_leases(id,company_id,property_id,unit_id,tenant_id,lease_no,lease_type,start_date,end_date,rent_amount_kobo,rent_frequency,service_charge_kobo,security_deposit_kobo,caution_fee_kobo,management_fee_kobo,status,notes,approved_by,approved_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?)`).bind(leaseId, COMPANY, body.propertyId, body.unitId || null, tenantId, leaseNo, body.leaseType || 'residential', body.startDate, body.endDate, rent, frequency, kobo(body.serviceChargeNaira), kobo(body.securityDepositNaira), kobo(body.cautionFeeNaira), kobo(body.managementFeeNaira), body.notes || null, context.employee.id, new Date().toISOString(), context.employee.id),
    env.DB.prepare(`UPDATE properties SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.propertyId),
  ];
  if (body.unitId) statements.push(env.DB.prepare(`UPDATE property_units SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.unitId));
  const monthStep = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : frequency === 'biannual' ? 6 : 12;
  let due = new Date(start.getTime());
  let guard = 0;
  while (due < end && guard++ < 120) {
    const periodEnd = addMonths(due, monthStep);
    const effectiveEnd = periodEnd > end ? end : periodEnd;
    const dueDate = due.toISOString().slice(0, 10);
    statements.push(env.DB.prepare(`INSERT INTO property_rent_schedule(id,lease_id,company_id,due_date,period_start,period_end,charge_type,description,amount_due_kobo,balance_kobo,status) VALUES(?,?,?,?,?,?,'rent','Rent',?,?,'pending')`).bind(uid('rent-schedule'), leaseId, COMPANY, dueDate, due.toISOString().slice(0, 10), effectiveEnd.toISOString().slice(0, 10), rent, rent));
    due = periodEnd;
  }
  const upfront = [
    { type: 'service_charge', label: 'Service charge', amount: kobo(body.serviceChargeNaira) },
    { type: 'security_deposit', label: 'Security deposit', amount: kobo(body.securityDepositNaira) },
    { type: 'caution_fee', label: 'Caution fee', amount: kobo(body.cautionFeeNaira) },
    { type: 'management_fee', label: 'Management fee', amount: kobo(body.managementFeeNaira) },
  ];
  for (const charge of upfront) if (charge.amount > 0) statements.push(env.DB.prepare(`INSERT INTO property_rent_schedule(id,lease_id,company_id,due_date,period_start,period_end,charge_type,description,amount_due_kobo,balance_kobo,status) VALUES(?,?,?,?,?,?,?, ?,?,?,'pending')`).bind(uid('rent-schedule'), leaseId, COMPANY, body.startDate, body.startDate, body.startDate, charge.type, charge.label, charge.amount, charge.amount));
  await env.DB.batch(statements);
  return json({ ok: true, lease: { id: leaseId, leaseNo, tenantId, status: 'active' } }, 201);
}

async function receivables(env: PropertiesEnv, context: SessionContext) {
  if (!canFinance(context) && !can(context, 'view')) return json({ error: 'Property receivables access is required.' }, 403);
  await refreshOverdue(env);
  const rows = await env.DB.prepare(`SELECT rs.id,rs.lease_id AS leaseId,l.lease_no AS leaseNo,t.name AS tenantName,p.name AS propertyName,rs.due_date AS dueDate,rs.period_start AS periodStart,rs.period_end AS periodEnd,rs.charge_type AS chargeType,rs.description,rs.amount_due_kobo AS amountDueKobo,rs.amount_paid_kobo AS amountPaidKobo,rs.balance_kobo AS balanceKobo,rs.status FROM property_rent_schedule rs JOIN property_leases l ON l.id=rs.lease_id JOIN property_tenants t ON t.id=l.tenant_id JOIN properties p ON p.id=l.property_id WHERE rs.company_id=? AND rs.status NOT IN ('paid','waived','cancelled') ORDER BY CASE WHEN rs.status='overdue' THEN 0 ELSE 1 END,rs.due_date LIMIT 500`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ receivables: rows.results || [] });
}

async function rentPayment(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!canFinance(context, 'create') && !can(context, 'approve')) return json({ error: 'Create Finance or Approve Properties permission is required.' }, 403);
  let body: { scheduleId?: string; amountNaira?: number; paymentMethod?: string; reference?: string; paymentDate?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid rent payment.' }, 400); }
  if (!body.scheduleId || Number(body.amountNaira) <= 0) return json({ error: 'Receivable and positive payment amount are required.' }, 400);
  const schedule = await env.DB.prepare(`SELECT rs.id,rs.lease_id AS leaseId,rs.balance_kobo AS balanceKobo,l.tenant_id AS tenantId FROM property_rent_schedule rs JOIN property_leases l ON l.id=rs.lease_id WHERE rs.id=? AND rs.company_id=? AND rs.status NOT IN ('paid','waived','cancelled')`).bind(body.scheduleId, COMPANY).first<{ id: string; leaseId: string; balanceKobo: number; tenantId: string }>();
  if (!schedule) return json({ error: 'Open rent/service charge receivable not found.' }, 404);
  const amount = Math.min(kobo(body.amountNaira), Number(schedule.balanceKobo));
  const balance = Number(schedule.balanceKobo) - amount;
  const receiptNo = await nextNo(env, 'RENT', 'property_rent_payments', 'receipt_no');
  const method = ['cash','pos_terminal','bank_transfer','cheque','wallet','other'].includes(String(body.paymentMethod)) ? String(body.paymentMethod) : 'bank_transfer';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO property_rent_payments(id,company_id,lease_id,schedule_id,tenant_id,receipt_no,payment_method,amount_kobo,reference,payment_date,received_by,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid('rent-payment'), COMPANY, schedule.leaseId, schedule.id, schedule.tenantId, receiptNo, method, amount, body.reference || null, body.paymentDate || nigeriaDate(), context.employee.id, context.employee.id, new Date().toISOString()),
    env.DB.prepare(`UPDATE property_rent_schedule SET amount_paid_kobo=amount_paid_kobo+?,balance_kobo=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(amount, balance, balance === 0 ? 'paid' : 'part_paid', schedule.id),
  ]);
  return json({ ok: true, receipt: { receiptNo, amountKobo: amount, balanceKobo: balance } });
}

async function maintenance(env: PropertiesEnv, context: SessionContext) {
  if (!can(context) && !canFacilities(context)) return json({ error: 'Property maintenance access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT m.id,m.request_no AS requestNo,m.property_id AS propertyId,p.property_code AS propertyCode,p.name AS propertyName,m.unit_id AS unitId,u.unit_code AS unitCode,m.category,m.title,m.description,m.priority,m.status,m.assigned_employee_id AS assignedEmployeeId,e.display_name AS assignedEmployee,m.vendor_name AS vendorName,m.estimate_kobo AS estimateKobo,m.actual_cost_kobo AS actualCostKobo,m.reported_at AS reportedAt,m.completed_at AS completedAt FROM property_maintenance_requests m JOIN properties p ON p.id=m.property_id LEFT JOIN property_units u ON u.id=m.unit_id LEFT JOIN employees e ON e.id=m.assigned_employee_id WHERE m.company_id=? ORDER BY CASE m.priority WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,m.reported_at DESC LIMIT 300`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ maintenance: rows.results || [] });
}

async function createMaintenance(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!canFacilities(context, 'create') && !can(context, 'create')) return json({ error: 'Create Facilities/Properties permission is required.' }, 403);
  let body: { propertyId?: string; unitId?: string; category?: string; title?: string; description?: string; priority?: string; assignedEmployeeId?: string; vendorName?: string; estimateNaira?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid maintenance request.' }, 400); }
  if (!body.propertyId || !String(body.title || '').trim() || !String(body.category || '').trim()) return json({ error: 'Property, category and title are required.' }, 400);
  const id = uid('property-maintenance');
  const requestNo = await nextNo(env, 'PM', 'property_maintenance_requests', 'request_no');
  const priority = ['low','normal','high','urgent','emergency'].includes(String(body.priority)) ? String(body.priority) : 'normal';
  await env.DB.prepare(`INSERT INTO property_maintenance_requests(id,company_id,property_id,unit_id,request_no,category,title,description,priority,status,assigned_employee_id,vendor_name,estimate_kobo,created_by) VALUES(?,?,?,?,?,?,?,?,?,'reported',?,?,?,?)`).bind(id, COMPANY, body.propertyId, body.unitId || null, requestNo, body.category, body.title, body.description || null, priority, body.assignedEmployeeId || null, body.vendorName || null, body.estimateNaira == null ? null : kobo(body.estimateNaira), context.employee.id).run();
  return json({ ok: true, request: { id, requestNo, status: 'reported' } }, 201);
}

async function updateMaintenance(request: Request, env: PropertiesEnv, context: SessionContext) {
  if (!canFacilities(context, 'edit') && !can(context, 'edit')) return json({ error: 'Edit Facilities/Properties permission is required.' }, 403);
  let body: { requestId?: string; status?: string; actualCostNaira?: number; vendorName?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid maintenance update.' }, 400); }
  const statuses = ['reported','triaged','awaiting_approval','approved','in_progress','waiting_parts','completed','verified','cancelled'];
  if (!body.requestId || !statuses.includes(String(body.status))) return json({ error: 'Maintenance request and valid status are required.' }, 400);
  if (body.status === 'verified' && !canFacilities(context, 'approve') && !can(context, 'approve')) return json({ error: 'Approval permission is required to verify maintenance.' }, 403);
  const result = await env.DB.prepare(`UPDATE property_maintenance_requests SET status=?,actual_cost_kobo=COALESCE(?,actual_cost_kobo),vendor_name=COALESCE(?,vendor_name),completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,verified_at=CASE WHEN ?='verified' THEN CURRENT_TIMESTAMP ELSE verified_at END WHERE id=? AND company_id=?`).bind(body.status, body.actualCostNaira == null ? null : kobo(body.actualCostNaira), body.vendorName || null, body.status, body.status, body.requestId, COMPANY).run();
  return result.meta.changes ? json({ ok: true, status: body.status }) : json({ error: 'Maintenance request not found.' }, 404);
}

export async function routeProperties(request: Request, env: PropertiesEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/properties/dashboard' && request.method === 'GET') return dashboard(env, context);
  if (url.pathname === '/api/properties/catalog' && request.method === 'GET') return listProperties(request, env, context);
  if (url.pathname === '/api/properties/catalog' && request.method === 'POST') return createProperty(request, env, context);
  if (url.pathname === '/api/properties/listings' && request.method === 'GET') return listings(env, context);
  if (url.pathname === '/api/properties/listings' && request.method === 'POST') return createListing(request, env, context);
  if (url.pathname === '/api/properties/leads' && request.method === 'GET') return leads(env, context);
  if (url.pathname === '/api/properties/leads' && request.method === 'POST') return createLead(request, env, context);
  if (url.pathname === '/api/properties/leads/activity' && request.method === 'POST') return leadActivity(request, env, context);
  if (url.pathname === '/api/properties/inspections' && request.method === 'GET') return inspections(env, context);
  if (url.pathname === '/api/properties/inspections' && request.method === 'POST') return createInspection(request, env, context);
  if (url.pathname === '/api/properties/inspections/complete' && request.method === 'POST') return completeInspection(request, env, context);
  if (url.pathname === '/api/properties/leases' && request.method === 'GET') return leases(env, context);
  if (url.pathname === '/api/properties/leases' && request.method === 'POST') return createLease(request, env, context);
  if (url.pathname === '/api/properties/receivables' && request.method === 'GET') return receivables(env, context);
  if (url.pathname === '/api/properties/rent-payment' && request.method === 'POST') return rentPayment(request, env, context);
  if (url.pathname === '/api/properties/maintenance' && request.method === 'GET') return maintenance(env, context);
  if (url.pathname === '/api/properties/maintenance' && request.method === 'POST') return createMaintenance(request, env, context);
  if (url.pathname === '/api/properties/maintenance/update' && request.method === 'POST') return updateMaintenance(request, env, context);
  return null;
}
