import { hasPermission, sessionContextFromId, type AuthEnv, type SessionContext } from './auth';

interface OwnerEnv extends AuthEnv { AI: Ai }
type PeriodKey = 'current_month' | 'previous_month' | 'current_quarter' | 'year_to_date' | 'last_12_months';
type PeriodRange = { key: PeriodKey; label: string; start: string; end: string; comparisonStart: string; comparisonEnd: string; comparisonLabel: string };
type CompanyKey = 'printing' | 'bakery' | 'autos' | 'logistics' | 'properties';

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const supportedCompanies: Array<{ id: string; key: CompanyKey; name: string }> = [
  { id: 'company-printing', key: 'printing', name: 'Daenem Printing & Technology' },
  { id: 'company-bakery', key: 'bakery', name: 'Daenem Bakery' },
  { id: 'company-autos', key: 'autos', name: 'Daenem Autos' },
  { id: 'company-logistics', key: 'logistics', name: 'Daenem Logistics' },
  { id: 'company-properties', key: 'properties', name: 'Daenem Homes & Properties' },
];

async function groupAuthority(env: OwnerEnv, context: SessionContext) {
  const row = await env.DB.prepare(`
    SELECT r.code AS code FROM employee_roles er
    JOIN roles r ON r.id=er.role_id
    JOIN employees e ON e.id=er.employee_id
    JOIN employee_company_memberships m ON m.employee_id=er.employee_id AND m.company_id=er.company_id AND m.active=1
    JOIN companies c ON c.id=er.company_id AND c.active=1
    WHERE er.employee_id=? AND r.code IN ('owner','group_admin') AND r.company_id IS NULL
      AND r.active=1 AND e.employment_status='active'
    ORDER BY CASE WHEN r.code='owner' THEN 0 ELSE 1 END LIMIT 1
  `).bind(context.employee.id).first<{code: string}>();
  return row?.code === 'owner' ? 'owner' : row?.code === 'group_admin' ? 'admin' : null;
}
type Domain = 'sales'|'inventory'|'workforce'|'payroll'|'maintenance'|'finance'|'security'|'requirements'|'forms'|'construction';
const domainPermission: Record<Domain,string> = {
  sales:'sales.access',inventory:'inventory.access',workforce:'attendance.access',
  payroll:'payroll.access',maintenance:'facilities.access',finance:'finance.reports',
  security:'security.access',requirements:'forms.access',forms:'forms.access',construction:'construction.access',
};
const denied = () => new Error('Owner intelligence scope is unavailable.');
// Private authorization seal: never serialized into API responses or AI prompts.
const scopedIntelligenceEvidence = new WeakMap<object,string>();

// Owner/Group Admin is an identity gate, NOT a domain or company entitlement.
// Rebuild the current session from authoritative D1 for sensitive reads, because
// a request-time SessionContext may already be stale when a grant is revoked.
async function liveOwnerContext(env: OwnerEnv, original: SessionContext) {
  const live = await sessionContextFromId(env, original.sessionId);
  if (!live || live.employee.id !== original.employee.id || !await groupAuthority(env, live)) throw denied();
  return live;
}

const intelligenceDomainCode=(d:Domain,id:string)=>d==='sales'
  ? (id==='company-bakery'?'bakery.access':id==='company-autos'?'autos.sales_pipeline':id==='company-logistics'?'logistics.access':id==='company-properties'?'properties.rent':'sales.access')
  : domainPermission[d];
const intelligenceDomains=Object.keys(domainPermission) as Domain[];
const grantedDomain=(live:SessionContext,d:Domain,id:string)=>
  live.companies.some(c=>c.id===id)&&hasPermission(live,intelligenceDomainCode(d,id),'view',id);
const exposedGrantSignature=(live:SessionContext,companyIds:string[])=>
  JSON.stringify(companyIds.map(id=>[id,...intelligenceDomains.map(d=>grantedDomain(live,d,id))]));

function isoDate(year: number, monthIndex: number, day = 1) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function lagosDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function periodRange(value: string): PeriodRange {
  const valid: PeriodKey[] = ['current_month','previous_month','current_quarter','year_to_date','last_12_months'];
  const key = valid.includes(value as PeriodKey) ? value as PeriodKey : 'current_month';
  const now = lagosDateParts();
  const monthIndex = now.month - 1;
  if (key === 'previous_month') return { key, label: 'Previous month', start: isoDate(now.year, monthIndex - 1), end: isoDate(now.year, monthIndex), comparisonStart: isoDate(now.year, monthIndex - 2), comparisonEnd: isoDate(now.year, monthIndex - 1), comparisonLabel: 'month before' };
  if (key === 'current_quarter') {
    const quarterStart = Math.floor(monthIndex / 3) * 3;
    return { key, label: 'Current quarter', start: isoDate(now.year, quarterStart), end: isoDate(now.year, quarterStart + 3), comparisonStart: isoDate(now.year, quarterStart - 3), comparisonEnd: isoDate(now.year, quarterStart), comparisonLabel: 'previous quarter' };
  }
  if (key === 'year_to_date') return { key, label: 'Year to date', start: isoDate(now.year, 0), end: isoDate(now.year, monthIndex, now.day + 1), comparisonStart: isoDate(now.year - 1, 0), comparisonEnd: isoDate(now.year - 1, monthIndex, now.day + 1), comparisonLabel: 'same period last year' };
  if (key === 'last_12_months') return { key, label: 'Last 12 months', start: isoDate(now.year, monthIndex - 11), end: isoDate(now.year, monthIndex + 1), comparisonStart: isoDate(now.year, monthIndex - 23), comparisonEnd: isoDate(now.year, monthIndex - 11), comparisonLabel: 'previous 12 months' };
  return { key, label: 'Current month', start: isoDate(now.year, monthIndex), end: isoDate(now.year, monthIndex + 1), comparisonStart: isoDate(now.year, monthIndex - 1), comparisonEnd: isoDate(now.year, monthIndex), comparisonLabel: 'previous month' };
}

function workDate() {
  const now = lagosDateParts();
  return isoDate(now.year, now.month - 1, now.day);
}

async function salesFor(env: OwnerEnv, companyId: string, range: Pick<PeriodRange, 'start' | 'end'>) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS orders,COALESCE(SUM(total_kobo),0) AS revenueKobo,COALESCE(SUM(amount_paid_kobo),0) AS collectedKobo FROM sales_orders WHERE company_id=? AND order_date>=? AND order_date<? AND status!='cancelled'`).bind(companyId, range.start, range.end).first<Record<string, number>>();
  return { orders: Number(row?.orders || 0), revenueKobo: Number(row?.revenueKobo || 0), collectedKobo: Number(row?.collectedKobo || 0) };
}

async function inventoryFor(env: OwnerEnv, companyId: string) {
  const row = await env.DB.prepare(`SELECT COALESCE(SUM(MAX(0,sb.quantity-sb.reserved_quantity)*i.unit_cost_kobo),0) AS valueKobo,COUNT(DISTINCT CASE WHEN COALESCE(sb.quantity-sb.reserved_quantity,0)<=i.reorder_level THEN i.id END) AS lowStock FROM inventory_items i LEFT JOIN stock_balances sb ON sb.item_id=i.id WHERE i.company_id=? AND i.active=1`).bind(companyId).first<Record<string, number>>();
  return { valueKobo: Number(row?.valueKobo || 0), lowStock: Number(row?.lowStock || 0) };
}

async function workforceFor(env: OwnerEnv, companyId: string, date: string) {
  const row = await env.DB.prepare(`SELECT COUNT(DISTINCT m.employee_id) AS employees,COUNT(DISTINCT CASE WHEN a.status='present' THEN a.employee_id END) AS present,COUNT(DISTINCT CASE WHEN a.status='incomplete' THEN a.employee_id END) AS incomplete FROM employee_company_memberships m LEFT JOIN attendance_days a ON a.employee_id=m.employee_id AND a.company_id=m.company_id AND a.work_date=? WHERE m.company_id=? AND m.active=1`).bind(date, companyId).first<Record<string, number>>();
  return { employees: Number(row?.employees || 0), present: Number(row?.present || 0), incomplete: Number(row?.incomplete || 0) };
}

async function payrollFor(env: OwnerEnv, companyId: string, range: Pick<PeriodRange, 'start' | 'end'>) {
  const row = await env.DB.prepare(`SELECT COALESCE(SUM(gross_total_kobo),0) AS grossKobo,COALESCE(SUM(net_total_kobo),0) AS netKobo,COUNT(*) AS runs FROM payroll_runs WHERE company_id=? AND period_end>=? AND period_end<? AND status NOT IN ('cancelled')`).bind(companyId, range.start, range.end).first<Record<string, number>>();
  return { runs: Number(row?.runs || 0), grossKobo: Number(row?.grossKobo || 0), netKobo: Number(row?.netKobo || 0) };
}

async function sharedCompany(env: OwnerEnv, companyId: string, range: PeriodRange, date: string, allow: (d:Domain,id:string)=>boolean) {
  const [inventory, workforce, payroll, maintenance] = await Promise.all([
    allow('inventory',companyId) ? inventoryFor(env, companyId) : Promise.resolve(null),
    allow('workforce',companyId) ? workforceFor(env, companyId, date) : Promise.resolve(null),
    allow('payroll',companyId) ? payrollFor(env, companyId, range) : Promise.resolve(null),
    allow('maintenance',companyId) ? env.DB.prepare(`SELECT COUNT(*) AS open,COALESCE(SUM(CASE WHEN priority IN ('high','critical') THEN 1 ELSE 0 END),0) AS urgent,COALESCE(SUM(actual_cost_kobo),0) AS costKobo FROM maintenance_work_orders WHERE company_id=? AND status NOT IN ('verified','cancelled')`).bind(companyId).first<Record<string, number>>() : Promise.resolve(null),
  ]);
  return { ...(inventory && {inventory}), ...(workforce && {workforce}), ...(payroll && {payroll}), ...(maintenance && {maintenance:{open:Number(maintenance.open||0),urgent:Number(maintenance.urgent||0),costKobo:Number(maintenance.costKobo||0)}}) };
}

async function constructionFor(env: OwnerEnv, companyIds: string[]) {
  if (!companyIds.length) return { activeProjects: 0, budgetKobo: 0, spentKobo: 0, remainingKobo: 0, overdueMilestones: 0 };
  const placeholders = companyIds.map(() => '?').join(',');
  const [projects, spend, milestones] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) activeProjects,COALESCE(SUM(budget_kobo),0) budgetKobo FROM construction_projects WHERE company_id IN (${placeholders}) AND status IN ('planning','active','on_hold')`).bind(...companyIds),
    env.DB.prepare(`SELECT COALESCE(SUM(amount),0) spentKobo FROM (SELECT ce.amount_kobo amount,cp.company_id companyId FROM construction_expenses ce JOIN construction_projects cp ON cp.id=ce.project_id WHERE ce.approval_status IN ('approved','paid') UNION ALL SELECT cm.total_cost_kobo amount,cp.company_id companyId FROM construction_material_entries cm JOIN construction_projects cp ON cp.id=cm.project_id) x WHERE companyId IN (${placeholders})`).bind(...companyIds),
    env.DB.prepare(`SELECT COUNT(*) overdueMilestones FROM construction_milestones cm JOIN construction_projects cp ON cp.id=cm.project_id WHERE cp.company_id IN (${placeholders}) AND cm.status NOT IN ('completed','cancelled') AND cm.due_date IS NOT NULL AND date(cm.due_date)<date('now')`).bind(...companyIds),
  ]);
  const project = (projects.results?.[0] || {}) as Record<string, number>;
  const spent = (spend.results?.[0] || {}) as Record<string, number>;
  const overdue = (milestones.results?.[0] || {}) as Record<string, number>;
  const budgetKobo = Number(project.budgetKobo || 0), spentKobo = Number(spent.spentKobo || 0);
  return { activeProjects: Number(project.activeProjects || 0), budgetKobo, spentKobo, remainingKobo: budgetKobo - spentKobo, overdueMilestones: Number(overdue.overdueMilestones || 0) };
}

async function financeFor(env: OwnerEnv, companyIds: string[], range: PeriodRange) {
  if (!companyIds.length) return { operatingExpenseKobo: 0, outstandingReceivablesKobo: 0, overdueReceivables: 0, postedJournals: 0 };
  const placeholders = companyIds.map(() => '?').join(',');
  const [expenses, receivables, journals] = await env.DB.batch([
    env.DB.prepare(`SELECT COALESCE(SUM(amount_kobo),0) operatingExpenseKobo FROM expenses WHERE company_id IN (${placeholders}) AND expense_date>=? AND expense_date<? AND status IN ('approved','paid')`).bind(...companyIds, range.start, range.end),
    env.DB.prepare(`SELECT COALESCE(SUM(balance_kobo),0) outstandingReceivablesKobo,COUNT(CASE WHEN status='overdue' OR (due_date IS NOT NULL AND date(due_date)<date('now') AND balance_kobo>0) THEN 1 END) overdueReceivables FROM finance_receivables WHERE company_id IN (${placeholders}) AND status NOT IN ('paid','written_off','cancelled')`).bind(...companyIds),
    env.DB.prepare(`SELECT COUNT(*) postedJournals FROM journal_entries WHERE company_id IN (${placeholders}) AND entry_date>=? AND entry_date<? AND status='posted'`).bind(...companyIds, range.start, range.end),
  ]);
  const expense = (expenses.results?.[0] || {}) as Record<string, number>;
  const receivable = (receivables.results?.[0] || {}) as Record<string, number>;
  const journal = (journals.results?.[0] || {}) as Record<string, number>;
  return { operatingExpenseKobo: Number(expense.operatingExpenseKobo || 0), outstandingReceivablesKobo: Number(receivable.outstandingReceivablesKobo || 0), overdueReceivables: Number(receivable.overdueReceivables || 0), postedJournals: Number(journal.postedJournals || 0) };
}

export async function collectOwnerIntelligence(env: OwnerEnv, context: SessionContext, periodValue = 'current_month', companyId = '') {
  const period = periodRange(periodValue), comparison = { start: period.comparisonStart, end: period.comparisonEnd }, date = workDate();
  const live=await liveOwnerContext(env,context);
  const allow=(d:Domain,id:string)=>grantedDomain(live,d,id);



  const available=supportedCompanies.filter(c=>intelligenceDomains.some(d=>allow(d,c.id)));
  const selected=companyId?available.find(c=>c.id===companyId):undefined;
  if(companyId && !selected)throw denied();
  const scope=selected?[selected]:available, scopeIds=scope.map(c=>c.id);
  if(!scopeIds.length)throw denied();
  const permittedAtStart=exposedGrantSignature(live,scopeIds);
  const authorized=(d:Domain)=>scopeIds.filter(id=>allow(d,id));
  const can=(d:Domain,id:string)=>scopeIds.includes(id)&&allow(d,id);
  const shared=Object.fromEntries(await Promise.all(scope.map(async c=>[c.id,await sharedCompany(env,c.id,period,date,allow)] as const)));
  const scopePlaceholders=authorized('security').map(()=>'?').join(',');
  const visibleSales=(id:string)=>can('sales',id);
  const emptySales={orders:0,revenueKobo:0,collectedKobo:0};
  const securityIds=authorized('security');
  const requirementIds=authorized('requirements');
  const formIds=authorized('forms');
  const securityQuery = securityIds.length ? env.DB.prepare(`SELECT COUNT(*) AS highRisk FROM security_logs WHERE reviewed_at IS NULL AND severity IN ('high','critical') AND company_id IN (${scopePlaceholders})`).bind(...securityIds).first<{ highRisk: number }>() : Promise.resolve({ highRisk: 0 });
  const requirementQuery=requirementIds.length ? env.DB.prepare(`SELECT COUNT(*) AS count FROM requirement_completions WHERE company_id IN (${requirementIds.map(()=>'?').join(',')}) AND status='overdue'`).bind(...requirementIds).first<{count:number}>() : Promise.resolve({count:0});
  const formQuery=formIds.length ? env.DB.prepare(`SELECT COUNT(*) AS count FROM form_submissions WHERE company_id IN (${formIds.map(()=>'?').join(',')}) AND status IN ('not_started','in_progress')`).bind(...formIds).first<{count:number}>() : Promise.resolve({count:0});
  const [printingSales, printingPrevious, bakerySales, bakeryPrevious, bakeryWaste, autos, autosPrevious, logistics, logisticsPrevious, propertiesRent, propertiesPrevious, propertiesArrears, security, overdueRequirements, pendingForms, construction, finance] = await Promise.all([
    visibleSales('company-printing') ? salesFor(env, 'company-printing', period) : Promise.resolve(emptySales), visibleSales('company-printing') ? salesFor(env, 'company-printing', comparison) : Promise.resolve(emptySales),
    visibleSales('company-bakery') ? salesFor(env, 'company-bakery', period) : Promise.resolve(emptySales), visibleSales('company-bakery') ? salesFor(env, 'company-bakery', comparison) : Promise.resolve(emptySales),
    visibleSales('company-bakery') ? env.DB.prepare(`SELECT COALESCE(SUM(estimated_cost_kobo),0) AS wasteCostKobo,COALESCE(SUM(quantity),0) AS wasteQty FROM bakery_waste_records WHERE company_id='company-bakery' AND recorded_at>=? AND recorded_at<?`).bind(period.start, period.end).first<Record<string, number>>() : Promise.resolve({ wasteCostKobo: 0, wasteQty: 0 }),
    can('sales','company-autos') ? env.DB.prepare(`SELECT COUNT(*) AS salesCount,COALESCE(SUM(s.sale_price_kobo),0) AS revenueKobo,COALESCE(SUM(s.amount_paid_kobo),0) AS collectedKobo,COALESCE(SUM(av.gross_profit_kobo),0) AS grossProfitKobo,(SELECT COUNT(*) FROM auto_vehicles WHERE company_id='company-autos' AND status NOT IN ('sold','delivered','retired')) AS stockCount,(SELECT COALESCE(SUM(landed_cost_kobo),0) FROM auto_vehicles WHERE company_id='company-autos' AND status NOT IN ('sold','delivered','retired')) AS stockValueKobo,(SELECT COUNT(*) FROM auto_leads WHERE company_id='company-autos' AND status NOT IN ('won','lost') AND next_follow_up_at IS NOT NULL AND datetime(next_follow_up_at)<=datetime('now')) AS followupsDue FROM auto_sales s JOIN auto_vehicles av ON av.id=s.vehicle_id WHERE s.company_id='company-autos' AND s.sale_date>=? AND s.sale_date<? AND s.sale_status!='cancelled'`).bind(period.start, period.end).first<Record<string, number>>() : Promise.resolve({} as Record<string, number>),
    can('sales','company-autos') ? env.DB.prepare(`SELECT COALESCE(SUM(sale_price_kobo),0) AS revenueKobo FROM auto_sales WHERE company_id='company-autos' AND sale_date>=? AND sale_date<? AND sale_status!='cancelled'`).bind(comparison.start, comparison.end).first<Record<string, number>>() : Promise.resolve({ revenueKobo: 0 }),
    can('sales','company-logistics') ? env.DB.prepare(`SELECT COUNT(*) AS trips,COALESCE(SUM(revenue_kobo),0) AS revenueKobo,COALESCE(SUM(total_expense_kobo),0) AS expenseKobo,COALESCE(SUM(gross_profit_kobo),0) AS grossProfitKobo,(SELECT COUNT(*) FROM logistics_shipments WHERE company_id='company-logistics' AND status IN ('picked_up','in_transit','out_for_delivery')) AS activeShipments,(SELECT COUNT(*) FROM logistics_vehicle_documents d JOIN logistics_vehicles v ON v.id=d.vehicle_id WHERE v.company_id='company-logistics' AND d.expires_at IS NOT NULL AND date(d.expires_at)<=date('now','+30 days') AND d.status!='superseded') AS expiringDocs FROM logistics_trips WHERE company_id='company-logistics' AND COALESCE(departed_at,planned_departure_at,created_at)>=? AND COALESCE(departed_at,planned_departure_at,created_at)<? AND status!='cancelled'`).bind(period.start, period.end).first<Record<string, number>>() : Promise.resolve({} as Record<string, number>),
    can('sales','company-logistics') ? env.DB.prepare(`SELECT COALESCE(SUM(revenue_kobo),0) AS revenueKobo FROM logistics_trips WHERE company_id='company-logistics' AND COALESCE(departed_at,planned_departure_at,created_at)>=? AND COALESCE(departed_at,planned_departure_at,created_at)<? AND status!='cancelled'`).bind(comparison.start, comparison.end).first<Record<string, number>>() : Promise.resolve({ revenueKobo: 0 }),
    can('sales','company-properties') ? env.DB.prepare(`SELECT COALESCE(SUM(amount_kobo),0) AS collectedKobo,COUNT(*) AS receipts FROM property_rent_payments WHERE company_id='company-properties' AND payment_date>=? AND payment_date<?`).bind(period.start, period.end).first<Record<string, number>>() : Promise.resolve({ collectedKobo: 0, receipts: 0 }),
    can('sales','company-properties') ? env.DB.prepare(`SELECT COALESCE(SUM(amount_kobo),0) AS collectedKobo FROM property_rent_payments WHERE company_id='company-properties' AND payment_date>=? AND payment_date<?`).bind(comparison.start, comparison.end).first<Record<string, number>>() : Promise.resolve({ collectedKobo: 0 }),
    can('sales','company-properties') ? env.DB.prepare(`SELECT COALESCE(SUM(balance_kobo),0) AS arrearsKobo,COUNT(*) AS overdueCharges FROM property_rent_schedule WHERE company_id='company-properties' AND status='overdue'`).first<Record<string, number>>() : Promise.resolve({ arrearsKobo: 0, overdueCharges: 0 }),
    securityQuery, requirementQuery, formQuery,
    authorized('construction').length ? constructionFor(env, authorized('construction')) : Promise.resolve(null),
    authorized('finance').length ? financeFor(env, authorized('finance'), period) : Promise.resolve(null),
  ]);

  const companyRevenue = new Map<string, number>([['company-printing', printingSales.revenueKobo], ['company-bakery', bakerySales.revenueKobo], ['company-autos', Number(autos?.revenueKobo || 0)], ['company-logistics', Number(logistics?.revenueKobo || 0)], ['company-properties', Number(propertiesRent?.collectedKobo || 0)]]);
  const companyPrevious = new Map<string, number>([['company-printing', printingPrevious.revenueKobo], ['company-bakery', bakeryPrevious.revenueKobo], ['company-autos', Number(autosPrevious?.revenueKobo || 0)], ['company-logistics', Number(logisticsPrevious?.revenueKobo || 0)], ['company-properties', Number(propertiesPrevious?.collectedKobo || 0)]]);
  const sumShared = (pick: (row: Record<string, { [key: string]: number }>) => number) => scopeIds.reduce((sum, id) => sum + pick((shared[id] || {}) as Record<string, { [key: string]: number }>), 0);
  const groupRevenueKobo = scopeIds.reduce((sum, id) => sum + (can('sales',id)?Number(companyRevenue.get(id)||0):0), 0);
  const previousRevenueKobo = scopeIds.reduce((sum, id) => sum + (can('sales',id)?Number(companyPrevious.get(id)||0):0), 0);
  const groupPayrollNetKobo = sumShared((row) => Number(row.payroll?.netKobo || 0));
  const groupInventoryValueKobo = sumShared((row) => Number(row.inventory?.valueKobo || 0));
  const groupEmployees = sumShared((row) => Number(row.workforce?.employees || 0));
  const groupPresent = sumShared((row) => Number(row.workforce?.present || 0));
  const groupIncompleteAttendance = sumShared((row) => Number(row.workforce?.incomplete || 0));
  const groupLowStock = sumShared((row) => Number(row.inventory?.lowStock || 0));

  const alerts: Array<{ severity: 'info' | 'medium' | 'high'; code: string; title: string; detail: string; company?: string; action?: string }> = [];
  if (authorized('workforce').length && groupIncompleteAttendance > 0) alerts.push({ severity: 'medium', code: 'attendance_incomplete', title: 'Incomplete attendance', detail: `${groupIncompleteAttendance} employee attendance record(s) are incomplete today.`, action: 'attendance' });
  if (securityIds.length && Number(security?.highRisk || 0) > 0) alerts.push({ severity: 'high', code: 'security_high_risk', title: 'Security events need review', detail: `${Number(security?.highRisk || 0)} high/critical security event(s) remain unreviewed.`, action: 'security' });
  if (authorized('inventory').length && groupLowStock > 0) alerts.push({ severity: 'medium', code: 'stock_low', title: 'Low stock', detail: `${groupLowStock} inventory item(s) are at/below reorder level.`, action: 'inventory' });
  if (can('sales','company-properties') && Number(propertiesArrears?.arrearsKobo || 0) > 0) alerts.push({ severity: 'high', code: 'property_arrears', title: 'Property rent arrears', detail: `${Number(propertiesArrears?.overdueCharges || 0)} overdue property charge(s) require collection follow-up.`, company: 'Daenem Homes & Properties', action: 'properties' });
  if (can('sales','company-autos') && Number(autos?.followupsDue || 0) > 0) alerts.push({ severity: 'medium', code: 'autos_followup', title: 'Autos leads need follow-up', detail: `${Number(autos?.followupsDue || 0)} vehicle lead follow-up(s) are due.`, company: 'Daenem Autos', action: 'autos' });
  if (can('sales','company-logistics') && Number(logistics?.expiringDocs || 0) > 0) alerts.push({ severity: 'high', code: 'logistics_documents', title: 'Fleet documents expiring', detail: `${Number(logistics?.expiringDocs || 0)} fleet document(s) expire within 30 days.`, company: 'Daenem Logistics', action: 'logistics' });
  const bakeryWastePct = bakerySales.revenueKobo > 0 ? Number(bakeryWaste?.wasteCostKobo || 0) / bakerySales.revenueKobo * 100 : 0;
  if (can('sales','company-bakery') && bakeryWastePct >= 5) alerts.push({ severity: 'high', code: 'bakery_waste', title: 'Bakery waste is elevated', detail: `Recorded waste cost is ${bakeryWastePct.toFixed(1)}% of Bakery sales for this period.`, company: 'Daenem Bakery', action: 'bakery' });
  if (construction && construction.overdueMilestones > 0) alerts.push({ severity: 'high', code: 'construction_overdue', title: 'Construction milestones overdue', detail: `${construction.overdueMilestones} project milestone(s) are overdue.`, action: 'construction' });
  if (finance && finance.overdueReceivables > 0) alerts.push({ severity: 'high', code: 'receivables_overdue', title: 'Receivables need collection', detail: `${finance.overdueReceivables} receivable(s) are overdue or past their due date.`, action: 'finance' });

  // A revocation during any asynchronous D1 read must suppress the entire
  // response, not disclose data from a stale permission snapshot.
  const stillCurrent=await liveOwnerContext(env,context);
  if(permittedAtStart!==exposedGrantSignature(stillCurrent,scopeIds))throw denied();

  const result = {
    generatedAt: new Date().toISOString(), workDate: date, month: period.label, previousMonth: period.comparisonLabel, period,
    scope: { companyId: selected?.id || null, companyName: selected?.name || 'Daenem Group', companyIds: scopeIds },
    group: {
      ...(authorized('sales').length?{revenueKobo:groupRevenueKobo,previousRevenueKobo}:{}),
      ...(authorized('payroll').length?{payrollNetKobo:groupPayrollNetKobo}:{}),
      ...(finance?{operatingExpenseKobo:finance.operatingExpenseKobo,outstandingReceivablesKobo:finance.outstandingReceivablesKobo}:{}),
      ...(authorized('inventory').length?{inventoryValueKobo:groupInventoryValueKobo,lowStock:groupLowStock}:{}),
      ...(authorized('workforce').length?{employees:groupEmployees,present:groupPresent,incompleteAttendance:groupIncompleteAttendance}:{}),
      ...(securityIds.length?{highRiskSecurity:Number(security?.highRisk||0)}:{}),
      ...(requirementIds.length?{overdueRequirements:Number(overdueRequirements?.count||0)}:{}),
      ...(formIds.length?{pendingForms:Number(pendingForms?.count||0)}:{}),
    },
    ...(finance?{finance}:{}),...(construction?{construction}:{}),
    companies: {
      ...(scope.some(c=>c.id==='company-printing')?{printing:{...(visibleSales('company-printing')?{current:printingSales,previous:printingPrevious}:{}),...shared['company-printing']}}:{}),
      ...(scope.some(c=>c.id==='company-bakery')?{bakery:{...(visibleSales('company-bakery')?{current:bakerySales,previous:bakeryPrevious,wasteCostKobo:Number(bakeryWaste?.wasteCostKobo||0),wasteQty:Number(bakeryWaste?.wasteQty||0),wastePctOfSales:bakeryWastePct}:{}),...shared['company-bakery']}}:{}),
      ...(scope.some(c=>c.id==='company-autos')?{autos:{...(can('sales','company-autos')?{salesCount:Number(autos?.salesCount||0),revenueKobo:Number(autos?.revenueKobo||0),collectedKobo:Number(autos?.collectedKobo||0),previousRevenueKobo:Number(autosPrevious?.revenueKobo||0),grossProfitKobo:Number(autos?.grossProfitKobo||0),stockCount:Number(autos?.stockCount||0),stockValueKobo:Number(autos?.stockValueKobo||0),followupsDue:Number(autos?.followupsDue||0)}:{}),...shared['company-autos']}}:{}),
      ...(scope.some(c=>c.id==='company-logistics')?{logistics:{...(can('sales','company-logistics')?{trips:Number(logistics?.trips||0),revenueKobo:Number(logistics?.revenueKobo||0),previousRevenueKobo:Number(logisticsPrevious?.revenueKobo||0),expenseKobo:Number(logistics?.expenseKobo||0),grossProfitKobo:Number(logistics?.grossProfitKobo||0),activeShipments:Number(logistics?.activeShipments||0),expiringDocs:Number(logistics?.expiringDocs||0)}:{}),...shared['company-logistics']}}:{}),
      ...(scope.some(c=>c.id==='company-properties')?{properties:{...(can('sales','company-properties')?{rentCollectedKobo:Number(propertiesRent?.collectedKobo||0),previousRentCollectedKobo:Number(propertiesPrevious?.collectedKobo||0),rentReceipts:Number(propertiesRent?.receipts||0),arrearsKobo:Number(propertiesArrears?.arrearsKobo||0),overdueCharges:Number(propertiesArrears?.overdueCharges||0)}:{}),...shared['company-properties']}}:{}),
    }, alerts,
  };
  scopedIntelligenceEvidence.set(result,permittedAtStart);
  return result;
}

async function intelligence(request: Request, env: OwnerEnv, context: SessionContext) {
  // Access is checked in collectOwnerIntelligence against the current DB role and scoped grants.
  const url = new URL(request.url);
  try { return json(await collectOwnerIntelligence(env, context, String(url.searchParams.get('period') || 'current_month'), String(url.searchParams.get('companyId') || ''))); }
  catch (error) { if(error instanceof Error && error.message==='Owner intelligence scope is unavailable.') return json({error:error.message},403); return json({error:'Unable to build Owner intelligence.'},400); }
}

// The final AI activity write must be conditional on the *same* authorization
// source rows that were checked after the provider returned. A request-time
// permission snapshot cannot authorize an INSERT after session/grant revocation.
// This compact, deterministic D1 fingerprint is intentionally stricter than a
// permission snapshot: ANY intervening change fails closed and requires retry.
const ownerAiAuthorityFenceSql = `
 SELECT json_object(
   -- Do not fingerprint the bare clock second: legitimate D1 scheduling can
   -- cross that second even with unchanged rights. Expiring override validity
   -- is fingerprinted individually below, while sessions are checked at write.
   'session',(SELECT json_array(s.employee_id,s.expires_at,s.revoked_at)
     FROM auth_sessions s WHERE s.id=?),
   'employee',(SELECT json_array(e.employment_status) FROM employees e WHERE e.id=?),
   'memberships',(SELECT json_group_array(json(t.j)) FROM (
     SELECT json_array(m.id,m.company_id,m.active,m.is_primary,c.active) AS j
     FROM employee_company_memberships m LEFT JOIN companies c ON c.id=m.company_id
     WHERE m.employee_id=? ORDER BY m.id
   ) t),
   'assignedRoles',(SELECT json_group_array(json(t.j)) FROM (
     SELECT json_array(er.id,er.company_id,er.role_id,r.company_id,r.code,r.active) AS j
     FROM employee_roles er JOIN roles r ON r.id=er.role_id
     WHERE er.employee_id=? ORDER BY er.id
   ) t),
   'rolePermissions',(SELECT json_group_array(json(t.j)) FROM (
     SELECT json_array(er.id,er.company_id,r.id,r.active,r.company_id,r.code,
                       rp.id,rp.access_level,p.code) AS j
     FROM employee_roles er JOIN roles r ON r.id=er.role_id
     LEFT JOIN role_permissions rp ON rp.role_id=er.role_id
     LEFT JOIN permissions p ON p.id=rp.permission_id
     WHERE er.employee_id=? ORDER BY er.id,rp.id
   ) t),
   'legacyOverrides',(SELECT json_group_array(json(t.j)) FROM (
     SELECT json_array(o.id,p.code,o.access_level,o.expires_at,
       CASE WHEN o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now')
       THEN 1 ELSE 0 END) AS j
     FROM employee_permission_overrides o JOIN permissions p ON p.id=o.permission_id
     WHERE o.employee_id=? ORDER BY o.id
   ) t),
   'scopedOverrides',(SELECT json_group_array(json(t.j)) FROM (
     SELECT json_array(o.id,o.company_id,p.code,o.access_level,o.expires_at,
       CASE WHEN o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now')
       THEN 1 ELSE 0 END) AS j
     FROM employee_permission_overrides_v2 o JOIN permissions p ON p.id=o.permission_id
     WHERE o.employee_id=? ORDER BY o.id
   ) t)
 ) AS fingerprint
`;
const ownerAiAuthorityFenceArgs=(ctx:SessionContext)=>[
  ctx.sessionId,ctx.employee.id,ctx.employee.id,ctx.employee.id,
  ctx.employee.id,ctx.employee.id,ctx.employee.id
];

async function aiBrief(request: Request, env: OwnerEnv, context: SessionContext) {
  // Aggregate AI permission is not enough: every company in the requested
  // brief must have an explicit current company-scoped AI entitlement.
  let body: { question?: string; mode?: 'brief' | 'question'; period?: PeriodKey; companyId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  let data: Awaited<ReturnType<typeof collectOwnerIntelligence>>;
  try { data = await collectOwnerIntelligence(env, context, body.period, String(body.companyId || '')); }
  catch (error) { if(error instanceof Error && error.message==='Owner intelligence scope is unavailable.') return json({error:error.message},403); return json({error:'Unable to build Owner intelligence.'},400); }
  let currentAi:SessionContext;
  try { currentAi=await liveOwnerContext(env,context); } catch { return json({error:'Owner intelligence scope is unavailable.'},403); }
  if(!data.scope.companyIds.length || data.scope.companyIds.some(id=>!hasPermission(currentAi,'ai_guide.access','view',id)))
    return json({error:'Owner AI access is required.'},403);
  if(scopedIntelligenceEvidence.get(data)!==exposedGrantSignature(currentAi,data.scope.companyIds))
    return json({error:'Owner intelligence scope is unavailable.'},403);
  const question = String(body.question || '').trim();
  const prompt = question || 'Prepare my concise Daenem Group owner brief for today. Tell me what matters most, which company needs attention, and what I should review next.';
  const system = [
    'You are Daenem Group Intelligence, embedded in Daenem Workforce Hub. Respect the filtered scope and omit unauthorized categories.',
    'Use ONLY the supplied ERP intelligence JSON. Never invent transactions, employees, balances, causes or actions that are not supported by the data.',
    'Amounts are stored in Nigerian kobo; convert to naira when presenting money.',
    'Prioritize exceptions, profitability, cash collection, inventory, payroll, attendance, security, construction and operational follow-ups.',
    'Distinguish recorded fact from inference. If explaining a likely reason, explicitly call it an inference.',
    'Do not make disciplinary or employment decisions. Flag issues for human review.',
    'Do not claim to execute payroll, payments, notices or approvals from this read-only intelligence endpoint.',
    'Use clear, concise Nigerian business English appropriate for a Group owner managing remotely.',
  ].join('\n');
  const answer = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'system', content: system }, { role: 'user', content: `ERP intelligence:\n${JSON.stringify(data)}\n\nOwner request:\n${prompt}` }], max_tokens: 1000 }) as { response?: string };
  const text = String(answer.response || 'No AI brief was generated.');
  // Snapshot every canonical D1 input to effective company/Group authorization
  // BEFORE re-validating the post-AI session. Any subsequent role, membership,
  // override, session or company-state change invalidates the write atomically.
  const fenceRow=await env.DB.prepare(ownerAiAuthorityFenceSql)
    .bind(...ownerAiAuthorityFenceArgs(context)).first<{fingerprint:string}>();
  const aiFence=String(fenceRow?.fingerprint||'');
  if(!aiFence)return json({error:'Owner intelligence scope is unavailable.'},403);
  // A role or AI grant revoked while the provider was responding must not
  // yield a successful brief or activity event from this stale request.
  let afterAi:SessionContext;
  try { afterAi=await liveOwnerContext(env,context); } catch { return json({error:'Owner intelligence scope is unavailable.'},403); }
  if(data.scope.companyIds.some(id=>!hasPermission(afterAi,'ai_guide.access','view',id)) || scopedIntelligenceEvidence.get(data)!==exposedGrantSignature(afterAi,data.scope.companyIds))
    return json({error:'Owner intelligence scope is unavailable.'},403);
  const audit=await env.DB.prepare(`
    INSERT INTO ai_activity_logs(
      id,employee_id,company_id,feature,prompt_category,
      input_redacted,output_redacted,approval_required
    )
    SELECT ?,?,?,'owner_intelligence',?,?,?,0
    FROM (${ownerAiAuthorityFenceSql}) currentState
    WHERE currentState.fingerprint=?
      AND EXISTS (
        SELECT 1 FROM auth_sessions s JOIN employees e ON e.id=s.employee_id
        WHERE s.id=? AND s.employee_id=?
          AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime('now')
          AND e.employment_status IN ('active','provisional')
      )
  `).bind(
    uid('ai'),context.employee.id,body.companyId||null,
    body.mode||(question?'question':'brief'),prompt.slice(0,700),text.slice(0,1800),
    ...ownerAiAuthorityFenceArgs(context),aiFence,context.sessionId,context.employee.id
  ).run();
  if(Number(audit.meta?.changes||0)!==1)
    return json({error:'Owner intelligence scope is unavailable.'},403);
  return json({ answer: text, generatedAt: data.generatedAt, alerts: data.alerts });
}

export async function routeOwnerIntelligence(request: Request, env: OwnerEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/owner/intelligence' && request.method === 'GET') return intelligence(request, env, context);
  if (url.pathname === '/api/owner/ai' && request.method === 'POST') return aiBrief(request, env, context);
  return null;
}
