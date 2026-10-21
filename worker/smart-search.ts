import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface Env extends AuthEnv {}
type Suggestion = { type: string; command: string; label: string; group: string; description?: string; entityId?: string; companyId?: string };
type SourceStatus = { name: string; status: 'checked' | 'unavailable' };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});
const commands = [
  ['dashboard', 'Group Overview', 'Dashboard', 'Group KPIs, approvals and current activity'],
  ['hr', 'HR & People', 'People', 'Employee master records, HR and workforce administration'],
  ['payroll', 'Payroll Command Center', 'Payroll', 'Compensation, payroll runs, review and approvals'],
  ['payroll-payments', 'Payroll Bank Payments', 'Payroll', 'Create Nigerian-bank payment drafts'],
  ['construction', 'Construction & Projects', 'Operations', 'Projects, budgets, materials, workmanship, milestones and progress'],
  ['printing', 'Printing ERP', 'Operations', 'Printing orders, estimates and production'],
  ['bakery', 'Bakery ERP', 'Operations', 'Bakery production, recipes, inventory and sales'],
  ['autos', 'Autos DMS', 'Operations', 'Vehicle sales, inventory and workshop operations'],
  ['logistics', 'Logistics TMS', 'Operations', 'Fleet, trips, dispatch and delivery'],
  ['properties', 'Properties CRM', 'Operations', 'Properties, leads and transactions'],
  ['inventory', 'Inventory', 'Operations', 'Stock, receipts, issues and transfers'],
  ['finance', 'Finance', 'Finance', 'Ledger, budgets, receivables and financial reports'],
  ['attendance', 'Attendance & GPS', 'Workforce', 'Attendance records, clock-in and clock-out'],
  ['authorized-workspace', 'Authorized Workspace', 'Administration', 'Roles, permissions and employee access'],
  ['audit', 'Activity & Audit Explorer', 'Security', 'Employee actions, metadata and audit trail'],
  ['monitoring', 'Resource Monitoring', 'System', 'Worker, D1, R2, KV, Queue, email and AI health'],
  ['toolbox', 'Advanced Toolbox', 'System', 'Operational diagnostics and admin utilities'],
  ['forms', 'Forms Center', 'Workforce', 'Assigned forms and submissions'],
  ['broadcasts', 'Broadcast Center', 'Communication', 'Employee notices and broadcasts'],
  ['facilities', 'Facilities', 'Operations', 'Assets, maintenance and facilities'],
  ['social', 'Social & Marketing', 'Marketing', 'Publishing, community, campaigns and social commerce'],
  ['security', 'Security Center', 'Security', 'Authentication, devices and security events'],
  ['ai', 'Daenem AI Guide', 'Intelligence', 'Role-aware help and operational guidance'],
] as const;
const modulePermissions: Record<string, string | undefined> = {
  hr: 'hr.access', payroll: 'payroll.access', 'payroll-payments': 'payroll.access',
  construction: 'construction.access', printing: 'printing.access', bakery: 'bakery.access',
  autos: 'autos.access', logistics: 'logistics.access', properties: 'properties.access',
  inventory: 'inventory.access', finance: 'finance.access', attendance: 'attendance.access',
  'authorized-workspace': 'users.access', audit: 'audit.explorer', monitoring: 'monitoring.access',
  toolbox: 'toolbox.access', forms: 'forms.access', broadcasts: 'broadcasts.access',
  facilities: 'facilities.access', social: 'social.community', security: 'security.access',
  ai: 'ai_guide.access',
};
function moduleVisible(context: SessionContext, command: string) {
  if (command === 'dashboard') return context.companies.length > 0;
  // An Owner role in one company does not grant access in another.
  // The authenticated companyPermissions matrix includes explicit revocations.
  const permission = modulePermissions[command];
  return Boolean(permission && context.companies.some((company) =>
    hasPermission(context, permission, 'view', company.id)));
}
function scopedCompanyIds(context: SessionContext, permission: string) {
  // Never use the union of roles to bypass per-company grants or explicit "none".
  return [...new Set(context.companies.filter((company) =>
    hasPermission(context, permission, 'view', company.id)).map((company) => company.id))];
}
const placeholders = (ids: readonly string[], column = 'company_id') =>
  ids.length ? `${column} IN (${ids.map(() => '?').join(',')})` : '1=0';
const safeText = (value: unknown, max = 160) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
const queryText = (value: unknown) => safeText(value, 80).trim();
// Remove SQL LIKE wildcards, not merely escape quote characters; all SQL uses bound values.
const queryLike = (value: string) => `%${value.replace(/[%_\\]/g, '')}%`;
function suggestion(kind: string, command: string, label: unknown, group: string,
  entityId: unknown, description = '', companyId?: unknown): Suggestion {
  return { type: kind, command, label: safeText(label) || 'Untitled record', group,
    entityId: safeText(entityId, 128), description: safeText(description, 240),
    ...(companyId ? { companyId: safeText(companyId, 128) } : {}) };
}
export async function routeSmartSearch(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/search/suggest' || request.method !== 'GET') return null;
  const raw = url.searchParams.get('q') || '';
  if (raw.length > 80) return json({ error: 'Search must be 80 characters or fewer.' }, 400);
  const q = queryText(raw).toLowerCase();
  if (!q) return json({ suggestions: [], sources: [], partial: false });
  if (!q.replace(/[%_\\]/g, '').trim()) return json({ suggestions: [], sources: [], partial: false });

  const suggestions: Suggestion[] = [];
  const recordBatches: Suggestion[][] = [];
  const sources: SourceStatus[] = [];
  const like = queryLike(q);
  const lookup = async (name: string, authorized: boolean, load: () => Promise<Suggestion[]>) => {
    if (!authorized) return;
    try {
      recordBatches.push(await load());
      sources.push({ name, status: 'checked' });
    } catch {
      // Do not equate an unavailable provider or missing table with 'no records'.
      // Do not disclose internal SQL errors, identifiers or underlying schema details.
      sources.push({ name, status: 'unavailable' });
    }
  };

  if (q.length >= 2) {
    const peopleCompanies = [...new Set([
      ...scopedCompanyIds(context, 'users.access'), ...scopedCompanyIds(context, 'hr.access'),
    ])];
    await lookup('People', peopleCompanies.length > 0, async () => {
      const rows = await env.DB.prepare(`SELECT DISTINCT e.id,e.display_name AS displayName,
        e.employee_no AS employeeNo,e.job_title AS jobTitle,e.department
        FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id AND m.active=1
        WHERE ${placeholders(peopleCompanies, 'm.company_id')}
        AND (e.display_name LIKE ? OR e.email LIKE ? OR e.employee_no LIKE ? OR e.job_title LIKE ? OR e.department LIKE ?)
        ORDER BY e.display_name LIMIT 7`)
        .bind(...peopleCompanies, like, like, like, like, like).all<Record<string, unknown>>();
      return (rows.results || []).map((row) => suggestion('employee', 'hr', row.displayName, 'People', row.id,
        [row.employeeNo, row.jobTitle, row.department].filter(Boolean).join(' / ')));
    });

    const payrollCompanies = scopedCompanyIds(context, 'payroll.access');
    await lookup('Payroll', payrollCompanies.length > 0, async () => {
      // payroll_runs has no run_no column in the published D1 migration chain.
      // Search real run identifiers, periods and statuses, without disclosing pay items.
      const rows = await env.DB.prepare(`SELECT id,company_id AS companyId,period_start AS periodStart,
        period_end AS periodEnd,status FROM payroll_runs
        WHERE ${placeholders(payrollCompanies)} AND
          (id LIKE ? OR period_start LIKE ? OR period_end LIKE ? OR status LIKE ?)
        ORDER BY created_at DESC LIMIT 4`)
        .bind(...payrollCompanies, like, like, like, like).all<Record<string, unknown>>();
      return (rows.results || []).map((row) => suggestion('payroll', 'payroll',
        ['Payroll period', row.periodStart, row.periodEnd].filter(Boolean).join(' - '),
        'Payroll', row.id, row.status ? `Status: ${row.status}` : '', row.companyId));
    });

    const constructionCompanies = scopedCompanyIds(context, 'construction.access');
    await lookup('Construction', constructionCompanies.length > 0, async () => {
      const rows = await env.DB.prepare(`SELECT id,company_id AS companyId,project_no AS projectNo,name,status,
        location_name AS locationName FROM construction_projects
        WHERE ${placeholders(constructionCompanies)} AND
        (name LIKE ? OR project_no LIKE ? OR location_name LIKE ?)
        ORDER BY updated_at DESC LIMIT 5`)
        .bind(...constructionCompanies, like, like, like).all<Record<string, unknown>>();
      return (rows.results || []).map((row) => suggestion('construction', 'construction', row.name, 'Construction', row.id,
        [row.projectNo, row.locationName || row.status].filter(Boolean).join(' / '), row.companyId));
    });

    const ownCompanies = [...new Set(context.companies.map((company) => company.id))];
    // Every employee may search only their own requests in active company memberships.
    await lookup('My leave requests', ownCompanies.length > 0, async () => {
      const rows = await env.DB.prepare(`SELECT id,status,start_date AS startDate,end_date AS endDate
        FROM leave_requests WHERE employee_id=? AND ${placeholders(ownCompanies)}
        AND (id LIKE ? OR status LIKE ? OR start_date LIKE ? OR end_date LIKE ?)
        ORDER BY created_at DESC LIMIT 5`)
        .bind(context.employee.id, ...ownCompanies, like, like, like, like).all<Record<string, unknown>>();
      return (rows.results || []).map((row) => suggestion('leave-request', 'leave', row.id, 'My leave requests', row.id,
        [row.startDate, row.endDate, row.status].filter(Boolean).join(' / ')));
    });
    await lookup('My document requests', ownCompanies.length > 0, async () => {
      const rows = await env.DB.prepare(`SELECT id,document_type AS documentType,status
        FROM employee_document_requests WHERE employee_id=? AND ${placeholders(ownCompanies)}
        AND (id LIKE ? OR document_type LIKE ? OR status LIKE ?)
        ORDER BY created_at DESC LIMIT 5`)
        .bind(context.employee.id, ...ownCompanies, like, like, like).all<Record<string, unknown>>();
      return (rows.results || []).map((row) => suggestion('document-request', 'self-service',
        row.documentType, 'My document requests', row.id, row.status ? `Status: ${row.status}` : ''));
    });

    // The user can search only submissions that they created for companies
    // where Forms viewing is still authorized. Response answers are never returned.
    const formCompanies = scopedCompanyIds(context, 'forms.access');
    await lookup('My form submissions', formCompanies.length > 0, async () => {
      const rows = await env.DB.prepare(`SELECT s.id,wf.title AS formTitle,s.status
        FROM workflow_form_submissions s
        JOIN workflow_forms wf ON wf.id=s.form_id AND wf.active=1
        JOIN workflow_form_assignments a ON a.id=s.assignment_id AND a.active=1
        WHERE s.employee_id=? AND ${placeholders(formCompanies, 's.company_id')}
        AND (wf.company_id IS NULL OR wf.company_id=s.company_id)
        AND (wf.title LIKE ? OR s.id LIKE ? OR s.status LIKE ?)
        ORDER BY s.updated_at DESC LIMIT 4`)
        .bind(context.employee.id, ...formCompanies, like, like, like).all<Record<string, unknown>>();
      return (rows.results || []).map((row) => suggestion('form-submission', 'forms',
        row.formTitle, 'My form submissions', row.id,
        row.status ? `Status: ${row.status}` : ''));
    });

    // Employee notifications belong to the recipient, including personal
    // group notices; company notices must match an active session membership.
    await lookup('My notifications', true, async () => {
      const scope = ownCompanies.length > 0
        ? `(n.company_id IS NULL OR ${placeholders(ownCompanies, 'n.company_id')})`
        : 'n.company_id IS NULL';
      const rows = await env.DB.prepare(`SELECT n.id,n.title,n.category,n.severity
        FROM employee_notifications n WHERE n.employee_id=? AND ${scope}
        AND (n.expires_at IS NULL OR datetime(n.expires_at)>datetime('now'))
        AND (n.title LIKE ? OR n.category LIKE ?)
        ORDER BY n.created_at DESC LIMIT 4`)
        .bind(context.employee.id, ...ownCompanies, like, like).all<Record<string, unknown>>();
      return (rows.results || []).map((row) => suggestion('notification', 'notifications',
        row.title, 'My notifications', row.id,
        [row.category, row.severity].filter(Boolean).join(' / ')));
    });
  }

  // Fairly interleave authorized record sources. Without this, seven People hits,
  // four Payroll hits and five Construction hits consume the entire 16-item
  // budget, hiding the employee's Forms, Leave and Notifications matches.
  // Preserve each source's database ranking, and keep modules after records.
  let depth = 0;
  while (suggestions.length < 16 && recordBatches.some((batch) => batch.length > depth)) {
    for (const batch of recordBatches) {
      if (batch[depth]) suggestions.push(batch[depth]);
      if (suggestions.length === 16) break;
    }
    depth++;
  }

  // Modules are still searchable, but real records are ranked before module destinations.
  for (const [command, label, group, description] of commands) {
    if (moduleVisible(context, command) &&
      `${label} ${group} ${description}`.toLowerCase().includes(q)) {
      suggestions.push({ type: 'module', command, label, group, description });
    }
  }
  return json({
    suggestions: suggestions.slice(0, 16),
    sources,
    partial: sources.some((source) => source.status === 'unavailable'),
  });
}
