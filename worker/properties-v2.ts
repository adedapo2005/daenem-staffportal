import { hasPermission, type AuthEnv, type SessionContext } from './auth';
import { routeProperties } from './properties';

interface Env extends AuthEnv {}
const COMPANY = 'company-properties';
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const kobo = (naira: unknown) => Math.round(Math.max(0, Number(naira || 0)) * 100);
const investmentCostFields = ['landCostNaira','constructionCostNaira','renovationCostNaira','documentationCostNaira','agencyCostNaira','legalCostNaira','miscellaneousCostNaira'] as const;
const companyAssigned = (context: SessionContext) => context.companies.some((company) => company.id === COMPANY);
const allowed = (context: SessionContext, permission: string, minimum: 'view'|'create'|'edit'|'approve'|'manage' = 'view') => companyAssigned(context) && hasPermission(context, permission, minimum, COMPANY);
const text = (value: unknown, limit = 300) => String(value || '').trim().slice(0, limit);

async function nextLeaseNo(env: Env) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '');
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM property_leases WHERE lease_no LIKE ?`).bind(`LEASE-${day}-%`).first<{ count: number }>();
  return `LEASE-${day}-${String(Number(row?.count || 0) + 1).padStart(4, '0')}`;
}

function addMonths(date: Date, months: number) {
  const value = new Date(date.getTime());
  value.setUTCMonth(value.getUTCMonth() + months);
  return value;
}

async function ownerInvestmentOverview(env: Env, context: SessionContext) {
  const portfolioView = allowed(context, 'properties.portfolio', 'view');
  const investmentView = allowed(context, 'properties.investment', 'view');
  if (!portfolioView && !investmentView) return json({ error: 'Properties Portfolio or Investment View permission is required.' }, 403);
  const [owners, units, investmentResult] = await Promise.all([
    portfolioView ? env.DB.prepare(`SELECT o.id,o.owner_type AS ownerType,o.name,o.phone,o.email,o.address,o.bank_name AS bankName,o.bank_account_name AS bankAccountName,o.bank_account_no_masked AS bankAccountNoMasked,o.active,
      COUNT(DISTINCT p.id) AS propertyCount,COALESCE(SUM(p.market_value_kobo),0) AS portfolioValueKobo,
      COALESCE((SELECT SUM(rp.amount_kobo) FROM property_rent_payments rp JOIN property_leases l ON l.id=rp.lease_id JOIN properties owned ON owned.id=l.property_id WHERE owned.owner_id=o.id),0) AS totalRentCollectedKobo,
      COALESCE((SELECT SUM(rs.balance_kobo) FROM property_rent_schedule rs JOIN property_leases l ON l.id=rs.lease_id JOIN properties owned ON owned.id=l.property_id WHERE owned.owner_id=o.id AND rs.status NOT IN ('paid','waived','cancelled')),0) AS outstandingRentKobo,
      COALESCE((SELECT SUM(m.actual_cost_kobo) FROM property_maintenance_requests m JOIN properties owned ON owned.id=m.property_id WHERE owned.owner_id=o.id AND m.status IN ('completed','verified')),0) AS maintenanceCostKobo
      FROM property_owners o LEFT JOIN properties p ON p.owner_id=o.id AND p.company_id=? WHERE o.company_id=? GROUP BY o.id ORDER BY o.active DESC,o.name LIMIT 200`).bind(COMPANY, COMPANY).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
    portfolioView ? env.DB.prepare(`SELECT u.id,u.property_id AS propertyId,p.property_code AS propertyCode,p.name AS propertyName,u.unit_code AS unitCode,u.unit_name AS unitName,u.unit_type AS unitType,u.floor_no AS floorNo,u.bedrooms,u.bathrooms,u.rent_amount_kobo AS rentAmountKobo,u.service_charge_kobo AS serviceChargeKobo,u.status FROM property_units u JOIN properties p ON p.id=u.property_id WHERE p.company_id=? ORDER BY p.name,u.unit_code LIMIT 500`).bind(COMPANY).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
    investmentView ? env.DB.prepare(`SELECT i.id,i.property_id AS propertyId,p.property_code AS propertyCode,p.name AS propertyName,o.name AS ownerName,
      i.land_cost_kobo AS landCostKobo,i.construction_cost_kobo AS constructionCostKobo,i.renovation_cost_kobo AS renovationCostKobo,i.documentation_cost_kobo AS documentationCostKobo,i.agency_cost_kobo AS agencyCostKobo,i.legal_cost_kobo AS legalCostKobo,i.miscellaneous_cost_kobo AS miscellaneousCostKobo,
      i.expected_annual_net_income_kobo AS expectedAnnualNetIncomeKobo,i.recovered_amount_kobo AS recoveredAmountKobo,i.notes,i.updated_at AS updatedAt,
      COALESCE((SELECT SUM(rp.amount_kobo) FROM property_rent_payments rp JOIN property_leases l ON l.id=rp.lease_id WHERE l.property_id=p.id AND date(rp.payment_date)>=date('now','-12 months')),0) AS actualCollectedLast12MonthsKobo,
      COALESCE((SELECT SUM(m.actual_cost_kobo) FROM property_maintenance_requests m WHERE m.property_id=p.id AND m.status IN ('completed','verified') AND date(m.reported_at)>=date('now','-12 months')),0) AS maintenanceLast12MonthsKobo
      FROM property_investments i JOIN properties p ON p.id=i.property_id LEFT JOIN property_owners o ON o.id=p.owner_id WHERE i.company_id=? ORDER BY p.name LIMIT 200`).bind(COMPANY).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
  ]);
  const investments = (investmentResult.results || []).map((row) => {
    const costKeys = ['landCostKobo','constructionCostKobo','renovationCostKobo','documentationCostKobo','agencyCostKobo','legalCostKobo','miscellaneousCostKobo'];
    const totalInvestmentKobo = costKeys.reduce((sum, key) => sum + Number(row[key] || 0), 0);
    const expectedAnnualNetIncomeKobo = Number(row.expectedAnnualNetIncomeKobo || 0);
    const recoveredAmountKobo = Number(row.recoveredAmountKobo || 0);
    const roiPercent = totalInvestmentKobo > 0 ? expectedAnnualNetIncomeKobo / totalInvestmentKobo * 100 : 0;
    const paybackYears = expectedAnnualNetIncomeKobo > 0 ? totalInvestmentKobo / expectedAnnualNetIncomeKobo : null;
    const recoveryProgressPercent = totalInvestmentKobo > 0 ? Math.min(100, recoveredAmountKobo / totalInvestmentKobo * 100) : 0;
    const investmentHealthScore = Math.round(Math.min(100, Math.max(0, roiPercent * 5 + recoveryProgressPercent * .5)));
    return { ...row, totalInvestmentKobo, roiPercent, paybackYears, recoveryProgressPercent, investmentHealthScore };
  });
  return json({
    capabilities: { portfolioView, portfolioCreate: allowed(context, 'properties.portfolio', 'create'), investmentView, investmentEdit: allowed(context, 'properties.investment', 'edit') },
    owners: owners.results || [], units: units.results || [], investments,
  });
}

async function createPropertyOwner(request: Request, env: Env, context: SessionContext) {
  if (!allowed(context, 'properties.portfolio', 'create')) return json({ error: 'Properties Portfolio Create permission is required.' }, 403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return json({ error: 'Invalid property owner request.' }, 400); }
  const name = text(body.name, 160), ownerType = ['individual','company','family','estate','government','other'].includes(text(body.ownerType, 30)) ? text(body.ownerType, 30) : 'individual';
  if (!name) return json({ error: 'Owner name is required.' }, 400);
  const id = uid('property-owner');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO property_owners(id,company_id,owner_type,name,phone,email,address,bank_name,bank_account_name,bank_account_no_masked,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, COMPANY, ownerType, name, text(body.phone, 40) || null, text(body.email, 160) || null, text(body.address, 400) || null, text(body.bankName, 100) || null, text(body.bankAccountName, 160) || null, text(body.bankAccountNoMasked, 30) || null, text(body.notes, 800) || null, context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'properties','create_owner','property_owner',?,?,'web')`).bind(uid('audit'), context.employee.id, COMPANY, id, JSON.stringify({ name, ownerType })),
  ]);
  return json({ ok: true, owner: { id, name, ownerType } }, 201);
}

async function createPropertyUnit(request: Request, env: Env, context: SessionContext) {
  if (!allowed(context, 'properties.portfolio', 'create')) return json({ error: 'Properties Portfolio Create permission is required.' }, 403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return json({ error: 'Invalid property unit request.' }, 400); }
  const propertyId = text(body.propertyId, 120), unitCode = text(body.unitCode, 80);
  if (!propertyId || !unitCode) return json({ error: 'Property and unit number/code are required.' }, 400);
  const property = await env.DB.prepare('SELECT id FROM properties WHERE id=? AND company_id=?').bind(propertyId, COMPANY).first();
  if (!property) return json({ error: 'Selected property was not found in Daenem Homes & Properties.' }, 404);
  const id = uid('property-unit');
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO property_units(id,property_id,unit_code,unit_name,unit_type,floor_no,bedrooms,bathrooms,rent_amount_kobo,service_charge_kobo,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, propertyId, unitCode, text(body.unitName, 120) || null, text(body.unitType, 80) || null, text(body.floorNo, 40) || null, body.bedrooms == null ? null : Math.max(0, Number(body.bedrooms)), body.bathrooms == null ? null : Math.max(0, Number(body.bathrooms)), kobo(body.rentAmountNaira), kobo(body.serviceChargeNaira), 'available', text(body.notes, 500) || null),
      env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'properties','create_unit','property_unit',?,?,'web')`).bind(uid('audit'), context.employee.id, COMPANY, id, JSON.stringify({ propertyId, unitCode })),
    ]);
  } catch { return json({ error: 'This property already has that unit number/code.' }, 409); }
  return json({ ok: true, unit: { id, propertyId, unitCode, status: 'available' } }, 201);
}

async function savePropertyInvestment(request: Request, env: Env, context: SessionContext) {
  if (!allowed(context, 'properties.investment', 'edit')) return json({ error: 'Properties Investment Edit permission is required.' }, 403);
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return json({ error: 'Invalid property investment request.' }, 400); }
  const propertyId = text(body.propertyId, 120);
  if (!propertyId) return json({ error: 'Select the property being analysed.' }, 400);
  const property = await env.DB.prepare('SELECT id FROM properties WHERE id=? AND company_id=?').bind(propertyId, COMPANY).first();
  if (!property) return json({ error: 'Selected property was not found in Daenem Homes & Properties.' }, 404);
  const costs = investmentCostFields.map((field) => kobo(body[field]));
  const id = uid('property-investment');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO property_investments(id,company_id,property_id,land_cost_kobo,construction_cost_kobo,renovation_cost_kobo,documentation_cost_kobo,agency_cost_kobo,legal_cost_kobo,miscellaneous_cost_kobo,expected_annual_net_income_kobo,recovered_amount_kobo,notes,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(company_id,property_id) DO UPDATE SET land_cost_kobo=excluded.land_cost_kobo,construction_cost_kobo=excluded.construction_cost_kobo,renovation_cost_kobo=excluded.renovation_cost_kobo,documentation_cost_kobo=excluded.documentation_cost_kobo,agency_cost_kobo=excluded.agency_cost_kobo,legal_cost_kobo=excluded.legal_cost_kobo,miscellaneous_cost_kobo=excluded.miscellaneous_cost_kobo,expected_annual_net_income_kobo=excluded.expected_annual_net_income_kobo,recovered_amount_kobo=excluded.recovered_amount_kobo,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id, COMPANY, propertyId, ...costs, kobo(body.expectedAnnualNetIncomeNaira), kobo(body.recoveredAmountNaira), text(body.notes, 1000) || null, context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'properties','save_investment_analysis','property',?,?,'web')`).bind(uid('audit'), context.employee.id, COMPANY, propertyId, JSON.stringify({ propertyId, totalInvestmentKobo: costs.reduce((sum, value) => sum + value, 0) })),
  ]);
  return json({ ok: true, propertyId });
}

async function createLease(request: Request, env: Env, context: SessionContext) {
  const hasCompany = context.companies.some((company) => company.id === COMPANY);
  const allowed = hasCompany && (hasPermission(context, 'properties.access', 'approve', COMPANY) || hasPermission(context, 'finance.access', 'edit', COMPANY));
  if (!allowed) return json({ error: 'Approve Properties or Edit Finance permission is required.' }, 403);

  let body: {
    propertyId?: string; unitId?: string; tenantName?: string; tenantPhone?: string; tenantEmail?: string;
    leaseType?: string; startDate?: string; endDate?: string; rentAmountNaira?: number; rentFrequency?: string;
    serviceChargeNaira?: number; securityDepositNaira?: number; cautionFeeNaira?: number; managementFeeNaira?: number; notes?: string;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid lease request.' }, 400); }
  if (!body.propertyId || !String(body.tenantName || '').trim() || !body.startDate || !body.endDate || Number(body.rentAmountNaira) <= 0) {
    return json({ error: 'Property, tenant, lease dates and rent are required.' }, 400);
  }

  const property = await env.DB.prepare(`SELECT id FROM properties WHERE id=? AND company_id=?`).bind(body.propertyId, COMPANY).first();
  if (!property) return json({ error: 'Property not found.' }, 404);
  if (body.unitId) {
    const unit = await env.DB.prepare(`SELECT id,status FROM property_units WHERE id=? AND property_id=?`).bind(body.unitId, body.propertyId).first<{ id: string; status: string }>();
    if (!unit || !['available','reserved'].includes(unit.status)) return json({ error: 'Selected property unit is not available.' }, 409);
  }

  const start = new Date(`${body.startDate}T00:00:00Z`);
  const end = new Date(`${body.endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return json({ error: 'Lease end date must be after start date.' }, 400);

  const frequency = ['monthly','quarterly','biannual','annual','custom'].includes(String(body.rentFrequency)) ? String(body.rentFrequency) : 'annual';
  const monthStep = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : frequency === 'biannual' ? 6 : 12;
  const tenantId = uid('tenant');
  const leaseId = uid('lease');
  const leaseNo = await nextLeaseNo(env);
  const rent = kobo(body.rentAmountNaira);
  const serviceCharge = kobo(body.serviceChargeNaira);
  const securityDeposit = kobo(body.securityDepositNaira);
  const cautionFee = kobo(body.cautionFeeNaira);
  const managementFee = kobo(body.managementFeeNaira);

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO property_tenants(id,company_id,name,phone,email,created_by) VALUES(?,?,?,?,?,?)`).bind(tenantId, COMPANY, body.tenantName, body.tenantPhone || null, body.tenantEmail || null, context.employee.id),
    env.DB.prepare(`INSERT INTO property_leases(id,company_id,property_id,unit_id,tenant_id,lease_no,lease_type,start_date,end_date,rent_amount_kobo,rent_frequency,service_charge_kobo,security_deposit_kobo,caution_fee_kobo,management_fee_kobo,status,notes,approved_by,approved_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`).bind(
      leaseId, COMPANY, body.propertyId, body.unitId || null, tenantId, leaseNo, body.leaseType || 'residential', body.startDate, body.endDate,
      rent, frequency, serviceCharge, securityDeposit, cautionFee, managementFee,
      body.notes || null, context.employee.id, new Date().toISOString(), context.employee.id,
    ),
    env.DB.prepare(`UPDATE properties SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.propertyId),
  ];
  if (body.unitId) statements.push(env.DB.prepare(`UPDATE property_units SET status='occupied',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.unitId));

  let due = new Date(start.getTime());
  let guard = 0;
  while (due < end && guard++ < 120) {
    const periodEnd = addMonths(due, monthStep);
    const effectiveEnd = periodEnd > end ? end : periodEnd;
    statements.push(env.DB.prepare(`INSERT INTO property_rent_schedule(id,lease_id,company_id,due_date,period_start,period_end,charge_type,description,amount_due_kobo,balance_kobo,status) VALUES(?,?,?,?,?,?,'rent','Rent',?,?,'pending')`).bind(
      uid('rent-schedule'), leaseId, COMPANY, due.toISOString().slice(0, 10), due.toISOString().slice(0, 10), effectiveEnd.toISOString().slice(0, 10), rent, rent,
    ));
    due = periodEnd;
  }

  const upfront = [
    { type: 'service_charge', label: 'Service charge', amount: serviceCharge },
    { type: 'security_deposit', label: 'Security deposit', amount: securityDeposit },
    { type: 'caution_fee', label: 'Caution fee', amount: cautionFee },
    { type: 'management_fee', label: 'Management fee', amount: managementFee },
  ];
  for (const charge of upfront) {
    if (charge.amount <= 0) continue;
    statements.push(env.DB.prepare(`INSERT INTO property_rent_schedule(id,lease_id,company_id,due_date,period_start,period_end,charge_type,description,amount_due_kobo,balance_kobo,status) VALUES(?,?,?,?,?,?,?,?,?,?,'pending')`).bind(
      uid('rent-schedule'), leaseId, COMPANY, body.startDate, body.startDate, body.startDate, charge.type, charge.label, charge.amount, charge.amount,
    ));
  }

  statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'properties','create_lease','property_lease',?,?,'web')`).bind(
    uid('audit'), context.employee.id, COMPANY, leaseId, JSON.stringify({ leaseNo, propertyId: body.propertyId, tenantId, startDate: body.startDate, endDate: body.endDate, rentKobo: rent, frequency }),
  ));

  await env.DB.batch(statements);
  return json({ ok: true, lease: { id: leaseId, leaseNo, tenantId, status: 'active' } }, 201);
}

export async function routePropertiesV2(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/properties/owners-investments' && request.method === 'GET') return ownerInvestmentOverview(env, context);
  if (url.pathname === '/api/properties/owners' && request.method === 'POST') return createPropertyOwner(request, env, context);
  if (url.pathname === '/api/properties/units' && request.method === 'POST') return createPropertyUnit(request, env, context);
  if (url.pathname === '/api/properties/investments' && request.method === 'POST') return savePropertyInvestment(request, env, context);
  if (url.pathname === '/api/properties/leases' && request.method === 'POST') return createLease(request, env, context);
  return routeProperties(request, env, context);
}
