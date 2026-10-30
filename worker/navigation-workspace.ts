import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import type { EnhancedSessionContext } from './auth-context-v2';

interface Env extends AuthEnv {}

type NavAction =
  | { kind: 'native'; target: string }
  | { kind: 'module'; target: string; view?: string }
  | { kind: 'selector'; target: string }
  | { kind: 'group-erp'; target: string }
  | { kind: 'hr-workflow'; target: string }
  | { kind: 'navigation'; target: 'styles' | 'access' };

export type NavigationItem = {
  key: string;
  group: string;
  label: string;
  shortLabel: string;
  description: string;
  permissionCode?: string;
  minimum?: AccessLevel;
  action: NavAction;
  ownerPriority?: number;
};

const levels: AccessLevel[] = ['none','view','create','edit','approve','manage'];
const styles = [
  { id: 'guided-groups', name: 'Guided Groups', badge: 'Recommended', description: 'Clear collapsible sections with short descriptions for every function.' },
  { id: 'full-workspace', name: 'Full Workspace', badge: 'Detailed', description: 'Keeps every authorized group open so power users can see the complete ERP map.' },
  { id: 'compact-rail', name: 'Compact Rail', badge: 'Space saving', description: 'A slim icon-led rail that gives more room to operational screens.' },
  { id: 'two-column', name: 'Two-Column Explorer', badge: 'Organized', description: 'Shows workspace groups and their functions in a wider two-column navigator.' },
  { id: 'top-navigation', name: 'Top Navigation', badge: 'Horizontal', description: 'Moves ERP groups across the top with focused dropdown workspaces.' },
] as const;
const styleIds = styles.map((style) => style.id);

export const navigationItems: NavigationItem[] = [
  { key:'overview',group:'Home',label:'Group Overview',shortLabel:'Overview',description:'Group-wide workforce and operating summary.',permissionCode:'dashboard.access',action:{kind:'native',target:'Group Overview'},ownerPriority:10 },
  { key:'my-workspace',group:'Home',label:'My Workspace',shortLabel:'My Work',description:'Personal day, leave, payslips, reviews, documents, notices and chat.',action:{kind:'selector',target:'.employee-center-launcher'},ownerPriority:20 },
  { key:'attendance',group:'Home',label:'Attendance & GPS',shortLabel:'Attendance',description:'Clock in/out, attendance records, geofences and approved location evidence.',permissionCode:'attendance.access',action:{kind:'selector',target:'.quick-attendance-button'},ownerPriority:30 },

  { key:'employee-approvals',group:'People & HR',label:'Employee Approvals',shortLabel:'Approvals',description:'Review provisional signups and assign approved employee roles.',permissionCode:'users.access',action:{kind:'native',target:'People & Payroll'},ownerPriority:100 },
  { key:'hr-master',group:'People & HR',label:'Employee HR Master',shortLabel:'HR Master',description:'Employment, grade, manager, emergency, pension and payroll-bank records.',permissionCode:'hr.access',action:{kind:'group-erp',target:'hr'},ownerPriority:110 },
  { key:'leave-management',group:'People & HR',label:'Leave Management',shortLabel:'Leave',description:'Review leave requests, decisions and employee absence history.',permissionCode:'leave.admin',action:{kind:'hr-workflow',target:'leave'},ownerPriority:120 },
  { key:'performance-reviews',group:'People & HR',label:'Performance Reviews',shortLabel:'Performance',description:'Prepare, share and track employee reviews and acknowledgement.',permissionCode:'reviews.admin',action:{kind:'hr-workflow',target:'performance'},ownerPriority:130 },
  { key:'hr-cases',group:'People & HR',label:'HR Cases',shortLabel:'HR Cases',description:'Disciplinary, grievance, commendation, improvement and incident cases.',permissionCode:'hr.cases',action:{kind:'hr-workflow',target:'cases'},ownerPriority:140 },
  { key:'employee-lifecycle',group:'People & HR',label:'Onboarding & Offboarding',shortLabel:'Lifecycle',description:'Practical employee start and exit checklists with task ownership.',permissionCode:'hr.lifecycle',action:{kind:'hr-workflow',target:'lifecycle'},ownerPriority:150 },
  { key:'payroll',group:'People & HR',label:'Payroll Command Center',shortLabel:'Payroll',description:'Compensation, payroll calculation, review, approval and payroll records.',permissionCode:'payroll.access',action:{kind:'module',target:'payroll'},ownerPriority:160 },
  { key:'payroll-payments',group:'People & HR',label:'Payroll Bank Payments',shortLabel:'Bank Payments',description:'Create controlled Nigerian bank payment batches and draft exports.',permissionCode:'payroll.access',minimum:'edit',action:{kind:'group-erp',target:'payments'},ownerPriority:170 },
  { key:'statutory-payroll',group:'People & HR',label:'Statutory Payroll Setup',shortLabel:'Statutory',description:'Reviewed PAYE, pension, NHF, NSITF and ITF configuration.',permissionCode:'payroll.statutory',action:{kind:'hr-workflow',target:'statutory'},ownerPriority:180 },

  { key:'finance',group:'Finance',label:'Finance Center',shortLabel:'Finance',description:'Ledger, journals, receivables, budgets and financial reporting.',permissionCode:'finance.access',action:{kind:'module',target:'finance'},ownerPriority:200 },
  { key:'finance-posting',group:'Finance',label:'Finance Posting & Reconciliation',shortLabel:'Posting',description:'Sales posting automation, exceptions and reconciliation controls.',permissionCode:'finance.entry',action:{kind:'selector',target:'.fa-launcher'},ownerPriority:210 },

  { key:'construction',group:'Operations',label:'Construction & Projects',shortLabel:'Construction',description:'Projects, budgets, materials, workmanship, milestones and progress.',permissionCode:'construction.access',action:{kind:'module',target:'construction'},ownerPriority:300 },
  { key:'printing',group:'Operations',label:'Printing ERP',shortLabel:'Printing',description:'Customers, estimates, orders, profitability and print operations.',permissionCode:'printing.access',action:{kind:'module',target:'printing'},ownerPriority:310 },
  { key:'printing-production',group:'Operations',label:'Printing Production Control',shortLabel:'Print Production',description:'Job tickets, production stages, material usage and quality control.',permissionCode:'printing.access',action:{kind:'module',target:'production'},ownerPriority:320 },
  { key:'bakery',group:'Operations',label:'Bakery ERP',shortLabel:'Bakery',description:'Bakery production, recipes, sales, stock and reconciliation.',permissionCode:'bakery.access',action:{kind:'module',target:'bakery'},ownerPriority:330 },
  { key:'autos',group:'Operations',label:'Autos DMS',shortLabel:'Autos',description:'Vehicle stock, sales, workshop, gate pass and delivery operations.',permissionCode:'autos.access',action:{kind:'module',target:'autos'},ownerPriority:340 },
  { key:'logistics',group:'Operations',label:'Logistics TMS',shortLabel:'Logistics',description:'Fleet, trips, dispatch, delivery, proof and operating expenses.',permissionCode:'logistics.access',action:{kind:'module',target:'logistics'},ownerPriority:350 },
  { key:'properties',group:'Operations',label:'Properties CRM',shortLabel:'Properties',description:'Properties, leads, inspections, leases, rent and transactions.',permissionCode:'properties.access',action:{kind:'module',target:'properties'},ownerPriority:360 },
  { key:'inventory',group:'Operations',label:'Group Inventory',shortLabel:'Inventory',description:'Stock, receipts, issues, transfers, requisitions and alerts.',permissionCode:'inventory.access',action:{kind:'module',target:'inventory'},ownerPriority:370 },
  { key:'facilities',group:'Operations',label:'Facilities & Maintenance',shortLabel:'Facilities',description:'Buildings, utilities, assets, maintenance and service history.',permissionCode:'facilities.access',action:{kind:'native',target:'Facilities'},ownerPriority:380 },

  { key:'forms',group:'Workforce',label:'Forms Center',shortLabel:'Forms',description:'Assignable forms, submissions, evidence and approvals.',permissionCode:'forms.access',action:{kind:'native',target:'Forms Center'},ownerPriority:400 },
  { key:'broadcasts',group:'Workforce',label:'Broadcast Center',shortLabel:'Broadcasts',description:'Notices, emergency alerts and reviewed employee encouragement.',permissionCode:'broadcasts.access',action:{kind:'native',target:'Broadcast Center'},ownerPriority:410 },
  { key:'mobile-tracking',group:'Workforce',label:'Mobile App & GPS',shortLabel:'Mobile & GPS',description:'Android wrapper, device pairing and background tracking policy.',permissionCode:'mobile.tracking_admin',action:{kind:'selector',target:'.mobile-center-launcher'},ownerPriority:420 },
  { key:'ai-guide',group:'Workforce',label:'Daenem AI Guide',shortLabel:'AI Guide',description:'Role-aware help for every authorized portal function.',permissionCode:'ai_guide.access',action:{kind:'native',target:'AI Guide'},ownerPriority:430 },

  { key:'social-engine',group:'Social & Marketing',label:'Social Engine',shortLabel:'Social',description:'Content, approvals, publishing, analytics and commerce.',permissionCode:'social.access',action:{kind:'selector',target:'.social-engine-launcher'},ownerPriority:500 },
  { key:'marketing-command',group:'Social & Marketing',label:'Marketing Command Center',shortLabel:'Marketing',description:'Provider analytics, funnel performance and campaign intelligence.',permissionCode:'social.analytics',action:{kind:'selector',target:'.smc-launcher'},ownerPriority:510 },
  { key:'community-inbox',group:'Social & Marketing',label:'Community Inbox',shortLabel:'Community',description:'Messages, assignment, SLA, escalation and human-reviewed replies.',permissionCode:'social.community',action:{kind:'selector',target:'.sci-launcher'},ownerPriority:520 },
  { key:'social-accounts',group:'Social & Marketing',label:'Social Accounts',shortLabel:'Accounts',description:'Official provider authorization, selection and reconnection.',permissionCode:'social.connections',action:{kind:'selector',target:'.scn-launcher'},ownerPriority:530 },
  { key:'social-controls',group:'Social & Marketing',label:'Social Automation Controls',shortLabel:'Automation',description:'Approval, scheduling and provider automation policies.',permissionCode:'social.automation',action:{kind:'selector',target:'.sa-launcher'},ownerPriority:540 },
  { key:'social-erp-sync',group:'Social & Marketing',label:'Social ERP Sync',shortLabel:'ERP Sync',description:'Catalog, order and Finance synchronization controls.',permissionCode:'social.integrations',action:{kind:'selector',target:'.si-launcher'},ownerPriority:550 },
  { key:'website-admin',group:'Social & Marketing',label:'Website Administration',shortLabel:'Websites',description:'Maintain the selected business website, pages, media, revisions, approval and controlled publishing.',permissionCode:'website.access',action:{kind:'selector',target:'.website-admin-launcher'},ownerPriority:560 },

  { key:'security',group:'Security & Administration',label:'Security Center',shortLabel:'Security',description:'Authentication, device, geofence and denied-access events.',permissionCode:'security.access',action:{kind:'native',target:'Security Center'},ownerPriority:600 },
  { key:'activity-audit',group:'Security & Administration',label:'Activity & Audit Explorer',shortLabel:'Audit',description:'Search employee activity, actions, routes and request references.',permissionCode:'audit.explorer',action:{kind:'group-erp',target:'audit'},ownerPriority:610 },
  { key:'owner-intelligence',group:'Security & Administration',label:'Owner Intelligence',shortLabel:'Owner',description:'Cross-company owner analytics, exceptions and approvals.',permissionCode:'dashboard.access',minimum:'manage',action:{kind:'selector',target:'.owner-intelligence-launcher'},ownerPriority:620 },
  { key:'admin-setup',group:'Security & Administration',label:'Admin Setup',shortLabel:'Setup',description:'Company locations, workforce policies and administrative configuration.',permissionCode:'settings.access',action:{kind:'module',target:'admin'},ownerPriority:630 },
  { key:'access-control',group:'Security & Administration',label:'Advanced Access Control',shortLabel:'Access Control',description:'Detailed role matrix and individual permission overrides.',permissionCode:'roles.access',minimum:'manage',action:{kind:'selector',target:'.access-control-launcher'},ownerPriority:640 },
  { key:'navigation-studio',group:'Security & Administration',label:'Navigation Studio',shortLabel:'Nav Studio',description:'Choose one of five navigation layouts and manage Group policy.',permissionCode:'navigation.studio',action:{kind:'navigation',target:'styles'},ownerPriority:650 },
  { key:'authorized-workspace',group:'Security & Administration',label:'Authorized Workspace',shortLabel:'Workspace Access',description:'Assign exact menus, submenus and access levels to roles or employees.',permissionCode:'navigation.assign',minimum:'manage',action:{kind:'navigation',target:'access'},ownerPriority:660 },
  { key:'api-integrations',group:'Security & Administration',label:'API & Integrations',shortLabel:'Integrations',description:'Review Cloudflare services, existing connections, safe API metadata, webhooks, logs and documentation links.',permissionCode:'integrations.access',action:{kind:'selector',target:'.integration-center-launcher'},ownerPriority:670 },
  { key:'resource-monitoring',group:'Security & Administration',label:'Resource Monitoring',shortLabel:'Monitoring',description:'Worker, D1, R2, KV, Queue, email, AI and session health.',permissionCode:'diagnostics.access',action:{kind:'group-erp',target:'monitoring'},ownerPriority:680 },
  { key:'advanced-toolbox',group:'Security & Administration',label:'Advanced Toolbox',shortLabel:'Toolbox',description:'Database, sessions, payroll readiness and critical-error checks.',permissionCode:'toolbox.access',minimum:'manage',action:{kind:'group-erp',target:'toolbox'},ownerPriority:690 },
];

const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const isOwner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');
const companyAllowed = (context: SessionContext, companyId: string) => context.companies.some((company) => company.id === companyId);
const hasAnyCompanyPermission = (context: EnhancedSessionContext,code:string,minimum:AccessLevel='view',companyId?:string) => {
  if (!companyId && hasPermission(context,code,minimum)) return true;
  const selected = companyId ? [context.companyPermissions[companyId] || {}] : Object.values(context.companyPermissions);
  return selected.some((permissions) => levels.indexOf(permissions[code] || 'none') >= levels.indexOf(minimum));
};
const canManageStudio = (context: EnhancedSessionContext) => isOwner(context) || hasAnyCompanyPermission(context,'navigation.studio','manage');
const canAssign = (context: EnhancedSessionContext,companyId?:string) => hasAnyCompanyPermission(context,'navigation.assign','manage',companyId) || hasAnyCompanyPermission(context,'roles.access','manage',companyId) || hasAnyCompanyPermission(context,'users.access','manage',companyId);

async function setting(env: Env, key: string, fallback = '') {
  const row = await env.DB.prepare('SELECT setting_value value FROM app_settings WHERE setting_key=?').bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

function settingWrite(env: Env, key: string, value: string, type = 'string') {
  return env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,value_type=excluded.value_type,updated_at=CURRENT_TIMESTAMP`)
    .bind(key,value,type);
}

function requireAudit(env: Env, auditId: string) {
  return env.DB.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM audit_logs WHERE id=?) THEN 1
    ELSE json_extract('required navigation audit row missing','$') END AS audit_required`).bind(auditId);
}

function visibleFor(context: EnhancedSessionContext, item: NavigationItem) {
  if (isOwner(context)) return true;
  if (!item.permissionCode) return true;
  return hasAnyCompanyPermission(context,item.permissionCode,item.minimum || 'view');
}

function parseList(value?: string | null): string[] {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}

function orderItems(items: NavigationItem[], itemOrder: string[], groupOrder: string[]) {
  const groupRank = new Map(groupOrder.map((key,index) => [key,index]));
  const itemRank = new Map(itemOrder.map((key,index) => [key,index]));
  return [...items].sort((a,b) => {
    const group = (groupRank.get(a.group) ?? 999) - (groupRank.get(b.group) ?? 999);
    if (group) return group;
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return (itemRank.get(a.key) ?? a.ownerPriority ?? 9999) - (itemRank.get(b.key) ?? b.ownerPriority ?? 9999);
  });
}

async function effective(env: Env, context: EnhancedSessionContext) {
  const [defaultStyle,forcedStyle,allowChoice,pref] = await Promise.all([
    setting(env,'navigation.default_style','guided-groups'),
    setting(env,'navigation.forced_style',''),
    setting(env,'navigation.allow_employee_choice','true'),
    env.DB.prepare(`SELECT style_id styleId,group_order_json groupOrderJson,item_order_json itemOrderJson,pinned_items_json pinnedItemsJson
      FROM employee_navigation_preferences WHERE employee_id=?`).bind(context.employee.id).first<Record<string, string>>(),
  ]);
  const preferred = styleIds.includes(String(pref?.styleId) as typeof styleIds[number]) ? String(pref?.styleId) : defaultStyle;
  const effectiveStyle = forcedStyle || preferred || 'guided-groups';
  const itemOrder = parseList(pref?.itemOrderJson);
  const groupOrder = parseList(pref?.groupOrderJson);
  const pinnedItems = parseList(pref?.pinnedItemsJson);
  const items = orderItems(navigationItems.filter((item) => visibleFor(context,item)),itemOrder,groupOrder);
  return json({
    styles,
    policy:{ defaultStyle, forcedStyle:forcedStyle || undefined, allowEmployeeChoice:allowChoice === 'true' },
    preference:{ preferredStyle:preferred, effectiveStyle, itemOrder, groupOrder, pinnedItems },
    canManagePolicy:canManageStudio(context),
    canAssign:canAssign(context),
    owner:isOwner(context),
    items,
  });
}


// Fail closed within the same D1 batch as each preference or Group policy
// mutation and its audit record, instead of trusting a cached SessionContext.
const navigationLiveActorSql = `EXISTS (
 SELECT 1 FROM auth_sessions current_session
 JOIN employees actor ON actor.id=current_session.employee_id
 WHERE current_session.id=? AND current_session.employee_id=?
   AND current_session.revoked_at IS NULL
   AND datetime(current_session.expires_at)>datetime('now')
   AND actor.employment_status IN ('active','provisional')
   AND EXISTS (
     SELECT 1 FROM employee_company_memberships membership
     JOIN companies company ON company.id=membership.company_id AND company.active=1
     WHERE membership.employee_id=actor.id AND membership.active=1
   )
)`;

const navigationLiveGroupOwnerSql = `EXISTS (
 SELECT 1 FROM employee_roles assigned
 JOIN employees owner_actor ON owner_actor.id=assigned.employee_id
    AND owner_actor.employment_status='active'
  JOIN roles role ON role.id=assigned.role_id AND role.code='owner' AND role.active=1
   AND (role.company_id IS NULL OR role.company_id=assigned.company_id)
 JOIN employee_company_memberships membership
   ON membership.employee_id=assigned.employee_id
   AND membership.company_id=assigned.company_id AND membership.active=1
 JOIN companies company ON company.id=membership.company_id AND company.active=1
 WHERE assigned.employee_id=?
)`;

function navigationPreferenceAtWriteGuard(
 env:Env, context:EnhancedSessionContext, targetEmployeeId:string,
 existing:Record<string,string>|null, styleRequested:boolean,
) {
 const before=existing
  ? JSON.stringify([existing.styleId ?? null,existing.groupOrderJson ?? null,
      existing.itemOrderJson ?? null,existing.pinnedItemsJson ?? null])
  : 'null';
 return env.DB.prepare(`SELECT CASE WHEN ${navigationLiveActorSql}
     AND ?=?
     AND COALESCE((
       SELECT json_array(style_id,group_order_json,item_order_json,pinned_items_json)
       FROM employee_navigation_preferences WHERE employee_id=?
     ),'null')=?
     AND (
       ?=0 OR ${navigationLiveGroupOwnerSql} OR (
         COALESCE((SELECT setting_value FROM app_settings
           WHERE setting_key='navigation.forced_style'),'')=''
         AND COALESCE((SELECT setting_value FROM app_settings
           WHERE setting_key='navigation.allow_employee_choice'),'true')='true'
       )
     )
   THEN 1 ELSE json_extract('stale or unauthorized navigation preference','$')
   END AS write_guard`).bind(
   context.sessionId,context.employee.id,
   targetEmployeeId,context.employee.id,targetEmployeeId,before,
   styleRequested?1:0,context.employee.id,
 );
}

function navigationGroupPolicyAtWriteGuard(
 env:Env,context:EnhancedSessionContext,
 currentDefault:string,currentForced:string,currentAllowChoice:string,
) {
 const before=JSON.stringify([currentDefault,currentForced,currentAllowChoice]);
 return env.DB.prepare(`SELECT CASE WHEN ${navigationLiveActorSql}
     AND ${navigationLiveGroupOwnerSql}
     AND json_array(
       COALESCE((SELECT setting_value FROM app_settings
         WHERE setting_key='navigation.default_style'),'guided-groups'),
       COALESCE((SELECT setting_value FROM app_settings
         WHERE setting_key='navigation.forced_style'),''),
       COALESCE((SELECT setting_value FROM app_settings
         WHERE setting_key='navigation.allow_employee_choice'),'true')
     )=?
   THEN 1 ELSE json_extract('stale or unauthorized navigation policy','$')
   END AS write_guard`).bind(context.sessionId,context.employee.id,
     context.employee.id,before);
}

async function savePreference(request: Request, env: Env, context: EnhancedSessionContext) {
  let body:{ styleId?:string; employeeId?:string; groupOrder?:string[]; itemOrder?:string[]; pinnedItems?:string[] };
  try { body = await request.json(); } catch { return json({error:'Invalid navigation preference.'},400); }
  const targetEmployeeId = String(body.employeeId || context.employee.id);
  if (targetEmployeeId !== context.employee.id) return json({error:'Personal navigation preferences can only be changed by the signed-in employee.'},403);
  const forced = await setting(env,'navigation.forced_style','');
  const allowChoice = await setting(env,'navigation.allow_employee_choice','true');
  if (body.styleId && !styleIds.includes(body.styleId as typeof styleIds[number])) return json({error:'Select an available navigation style.'},400);
  if (body.styleId && forced && !isOwner(context)) return json({error:'The Owner has selected a Group-wide navigation style.',forcedStyle:forced},409);
  if (body.styleId && allowChoice !== 'true' && !isOwner(context)) return json({error:'Personal navigation style choice is disabled by Group policy.'},403);
  const validKeys = new Set(navigationItems.map((item) => item.key));
  const validGroups = new Set(navigationItems.map((item) => item.group));
  const groupOrder = (body.groupOrder || []).filter((value,index,array) => validGroups.has(value) && array.indexOf(value) === index);
  const itemOrder = (body.itemOrder || []).filter((value,index,array) => validKeys.has(value) && array.indexOf(value) === index);
  const pinnedItems = (body.pinnedItems || []).filter((value,index,array) => validKeys.has(value) && array.indexOf(value) === index);
  const existing = await env.DB.prepare('SELECT style_id styleId,group_order_json groupOrderJson,item_order_json itemOrderJson,pinned_items_json pinnedItemsJson FROM employee_navigation_preferences WHERE employee_id=?').bind(targetEmployeeId).first<Record<string,string>>();
  const auditId=uid('audit');
  const livePreferenceGuard=navigationPreferenceAtWriteGuard(
    env,context,targetEmployeeId,existing,Boolean(body.styleId));
  try { await env.DB.batch([
    livePreferenceGuard,
    env.DB.prepare(`INSERT INTO employee_navigation_preferences(employee_id,style_id,group_order_json,item_order_json,pinned_items_json,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(employee_id) DO UPDATE SET style_id=excluded.style_id,group_order_json=excluded.group_order_json,item_order_json=excluded.item_order_json,pinned_items_json=excluded.pinned_items_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(targetEmployeeId,body.styleId || existing?.styleId || 'guided-groups',JSON.stringify(body.groupOrder ?? parseList(existing?.groupOrderJson)),JSON.stringify(body.itemOrder ?? parseList(existing?.itemOrderJson)),JSON.stringify(body.pinnedItems ?? parseList(existing?.pinnedItemsJson)),context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
      VALUES(?,?,'navigation','save_preference','employee',?,?,'web')`).bind(auditId,context.employee.id,targetEmployeeId,JSON.stringify({styleId:body.styleId||existing?.styleId||'guided-groups',groupOrder,itemOrder,pinnedItems})),
    requireAudit(env,auditId),
  ]); } catch { return json({error:'Navigation preference was not saved or audited.'},409); }
  return json({ok:true,employeeId:targetEmployeeId,forcedStyle:forced || undefined});
}

async function savePolicy(request: Request, env: Env, context: EnhancedSessionContext) {
  if (!isOwner(context)) return json({error:'Only the Group Owner can change Group-wide navigation policy.'},403);
  let body:{ defaultStyle?:string; forcedStyle?:string | null; allowEmployeeChoice?:boolean };
  try { body = await request.json(); } catch { return json({error:'Invalid navigation policy.'},400); }
  if (body.defaultStyle !== undefined && !styleIds.includes(body.defaultStyle as typeof styleIds[number])) return json({error:'Select an available default style.'},400);
  if (body.forcedStyle && !styleIds.includes(body.forcedStyle as typeof styleIds[number])) return json({error:'Select an available forced style.'},400);
  const [currentDefault,currentForced,currentAllowChoice]=await Promise.all([
    setting(env,'navigation.default_style','guided-groups'),
    setting(env,'navigation.forced_style',''),
    setting(env,'navigation.allow_employee_choice','true'),
  ]);
  const policy={
    defaultStyle:body.defaultStyle ?? currentDefault,
    forcedStyle:(body.forcedStyle === undefined ? currentForced : body.forcedStyle) || undefined,
    allowEmployeeChoice:body.allowEmployeeChoice ?? currentAllowChoice === 'true',
  };
  const writes=[];
  if (body.defaultStyle !== undefined) writes.push(settingWrite(env,'navigation.default_style',body.defaultStyle));
  if (body.forcedStyle !== undefined) writes.push(settingWrite(env,'navigation.forced_style',body.forcedStyle || ''));
  if (body.allowEmployeeChoice !== undefined) writes.push(settingWrite(env,'navigation.allow_employee_choice',String(body.allowEmployeeChoice),'boolean'));
  const auditId=uid('audit');
  writes.unshift(navigationGroupPolicyAtWriteGuard(
    env,context,currentDefault,currentForced,currentAllowChoice));
  writes.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
    VALUES(?,?,'navigation','update_group_policy','policy','group',?,'web')`).bind(auditId,context.employee.id,JSON.stringify(policy)));
  writes.push(requireAudit(env,auditId));
  try { await env.DB.batch(writes); } catch { return json({error:'Navigation policy was not saved or audited.'},409); }
  return json({ok:true,policy});
}

async function accessOverview(request: Request, env: Env, context: EnhancedSessionContext) {
  const companyId = String(new URL(request.url).searchParams.get('companyId') || '');
  if (!companyId) return json({error:'Company ID is required.'},400);
  if (!companyId || !companyAllowed(context,companyId)) return json({error:'Company access is not assigned.'},403);
  if (!canAssign(context,companyId)) return json({error:'Authorized Workspace management permission is required for this company.'},403);
  const permissionCodes = [...new Set(navigationItems.map((item) => item.permissionCode).filter(Boolean))] as string[];
  const placeholders = permissionCodes.map(() => '?').join(',');
  const [company,employees,roles,permissions,rolePermissions,overrides,changes] = await Promise.all([
    env.DB.prepare('SELECT id,code,name FROM companies WHERE id=? AND active=1').bind(companyId).first<Record<string,unknown>>(),
    env.DB.prepare(`SELECT e.id,e.employee_no employeeNo,e.display_name displayName,e.email,e.job_title jobTitle,e.department,
      GROUP_CONCAT(DISTINCT r.id) roleIds,GROUP_CONCAT(DISTINCT r.code) roleCodes,GROUP_CONCAT(DISTINCT r.name) roleNames
      FROM employee_company_memberships m JOIN employees e ON e.id=m.employee_id
      LEFT JOIN employee_roles er ON er.employee_id=e.id AND er.company_id=m.company_id
      LEFT JOIN roles r ON r.id=er.role_id
      WHERE m.company_id=? AND m.active=1 GROUP BY e.id ORDER BY e.display_name`).bind(companyId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,code,name,description,is_system isSystem FROM roles WHERE active=1 AND (company_id=? OR company_id IS NULL) ORDER BY is_system DESC,name`).bind(companyId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,code,module,description,sensitive FROM permissions WHERE code IN (${placeholders})`).bind(...permissionCodes).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT rp.role_id roleId,p.code permissionCode,rp.access_level accessLevel FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id JOIN roles r ON r.id=rp.role_id WHERE r.active=1 AND (r.company_id=? OR r.company_id IS NULL) AND p.code IN (${placeholders})`).bind(companyId,...permissionCodes).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT o.employee_id employeeId,p.code permissionCode,o.access_level accessLevel,o.reason,o.expires_at expiresAt FROM employee_permission_overrides_v2 o JOIN permissions p ON p.id=o.permission_id WHERE o.company_id=? AND p.code IN (${placeholders}) AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))`).bind(companyId,...permissionCodes).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT n.created_at createdAt,n.target_type targetType,n.target_id targetId,n.item_key itemKey,n.permission_code permissionCode,n.old_access_level oldAccessLevel,n.new_access_level newAccessLevel,n.reason,e.display_name actorName FROM navigation_access_changes n JOIN employees e ON e.id=n.changed_by WHERE n.company_id=? ORDER BY n.created_at DESC LIMIT 100`).bind(companyId).all<Record<string,unknown>>(),
  ]);
  if (!company) return json({error:'Company not found.'},404);
  return json({
    company,
    items:navigationItems.filter((item) => item.permissionCode),
    permissionLevels:levels,
    permissions:permissions.results || [],
    employees:(employees.results || []).map((row) => ({...row,roleIds:row.roleIds?String(row.roleIds).split(','):[],roleCodes:row.roleCodes?String(row.roleCodes).split(','):[],roleNames:row.roleNames?String(row.roleNames).split(','):[]})),
    roles:roles.results || [],
    rolePermissions:rolePermissions.results || [],
    employeeOverrides:overrides.results || [],
    changes:changes.results || [],
    ownerProtected:true,
  });
}


// Release-owner review: evaluate live session, membership and effective company
// permission INSIDE the same D1 batch that changes access grants and audit.
const navigationAssignmentLevelSql = (column:string) => `CASE ${column}
  WHEN 'view' THEN 1 WHEN 'create' THEN 2 WHEN 'edit' THEN 3
  WHEN 'approve' THEN 4 WHEN 'manage' THEN 5 ELSE 0 END`;

function navigationAssignmentAtWriteGuard(
  env:Env,context:EnhancedSessionContext,
  companyId:string,targetType:'employee'|'role',
  targetId:string,permissionId:string,itemKey:string,
  oldLevel:AccessLevel,expectedRevision:number,
) {
  const liveActorSql = `EXISTS(
    SELECT 1 FROM auth_sessions session
    JOIN employees actor ON actor.id=session.employee_id
    JOIN companies business ON business.id=? AND business.active=1
    JOIN employee_company_memberships member ON member.employee_id=actor.id
      AND member.company_id=business.id AND member.active=1
    WHERE session.id=? AND session.employee_id=?
      AND session.revoked_at IS NULL AND datetime(session.expires_at)>datetime('now')
      AND actor.employment_status='active'
      AND EXISTS(
        SELECT 1 FROM permissions permission
        WHERE permission.code IN ('navigation.assign','roles.access','users.access')
          -- Group-wide NONE takes away a permission even when a scoped/role
          -- grant is still present in a cached request context.
          AND NOT EXISTS(
            SELECT 1 FROM employee_permission_overrides_v2 group_deny
            WHERE group_deny.employee_id=actor.id
              AND group_deny.company_id IS NULL
              AND group_deny.permission_id=permission.id
              AND group_deny.access_level='none'
              AND (group_deny.expires_at IS NULL OR datetime(group_deny.expires_at)>datetime('now'))
          )
          AND COALESCE(
            (SELECT ${navigationAssignmentLevelSql('override.access_level')}
             FROM employee_permission_overrides_v2 override
             WHERE override.employee_id=actor.id
               AND override.company_id=business.id
               AND override.permission_id=permission.id
               AND (override.expires_at IS NULL OR datetime(override.expires_at)>datetime('now'))
             LIMIT 1),
            (SELECT ${navigationAssignmentLevelSql('group_override.access_level')}
             FROM employee_permission_overrides_v2 group_override
             WHERE group_override.employee_id=actor.id
               AND group_override.company_id IS NULL
               AND group_override.permission_id=permission.id
               AND (group_override.expires_at IS NULL OR datetime(group_override.expires_at)>datetime('now'))
             LIMIT 1),
            (SELECT ${navigationAssignmentLevelSql('legacy.access_level')}
             FROM employee_permission_overrides legacy
             WHERE legacy.employee_id=actor.id
               AND legacy.permission_id=permission.id
               AND (legacy.expires_at IS NULL OR datetime(legacy.expires_at)>datetime('now'))
             -- Auth treats legacy overrides as Group-wide; explicit revocation wins.
             ORDER BY CASE WHEN legacy.access_level='none' THEN 0 ELSE 1 END,
                      legacy.created_at DESC
             LIMIT 1),
            (SELECT MAX(${navigationAssignmentLevelSql('grant.access_level')})
             FROM employee_roles assigned
             JOIN roles role ON role.id=assigned.role_id AND role.active=1
               AND (role.company_id IS NULL OR role.company_id=assigned.company_id)
             JOIN role_permissions grant ON grant.role_id=role.id
               AND grant.permission_id=permission.id
             WHERE assigned.employee_id=actor.id AND assigned.company_id=business.id),
            0
          )>=5
      )
  )`;
  const actorParams = [companyId,context.sessionId,context.employee.id];
  const targetSql = targetType === 'role' ? `EXISTS(
    SELECT 1 FROM roles target
    WHERE target.id=? AND target.active=1 AND target.code<>'owner'
      AND (target.company_id=? OR (
        target.company_id IS NULL AND EXISTS(
          SELECT 1 FROM employee_roles assigned
          JOIN roles role ON role.id=assigned.role_id
          WHERE assigned.employee_id=? AND assigned.company_id=?
            AND role.code='owner' AND role.company_id IS NULL AND role.active=1
        )
      ))
  )` : `EXISTS(
    SELECT 1 FROM employees target
    JOIN employee_company_memberships member ON member.employee_id=target.id
      AND member.company_id=? AND member.active=1
    WHERE target.id=? AND target.employment_status IN ('active','provisional')
      AND NOT EXISTS(
        SELECT 1 FROM employee_roles assigned
        JOIN roles role ON role.id=assigned.role_id
        WHERE assigned.employee_id=target.id AND assigned.company_id=member.company_id
          AND role.code='owner' AND role.active=1
      )
  )`;
  const targetParams = targetType === 'role'
    ? [targetId,companyId,context.employee.id,companyId] : [companyId,targetId];
  const levelSql = targetType === 'role'
    ? `SELECT access_level FROM role_permissions WHERE role_id=? AND permission_id=?`
    : `SELECT access_level FROM employee_permission_overrides_v2
         WHERE employee_id=? AND company_id=? AND permission_id=?`;
  const levelParams = targetType === 'role'
    ? [targetId,permissionId] : [targetId,companyId,permissionId];
  // An Owner-only grant must still have live Owner authority at the atomic
  // write boundary, even if the request's cached roles showed Owner earlier.
  const ownerOnlyItem = ['access-control','navigation-studio','authorized-workspace'].includes(itemKey);
  const check = `SELECT CASE WHEN ${liveActorSql} AND ${targetSql}
    AND (?=0 OR ${navigationLiveGroupOwnerSql})
    AND (SELECT COUNT(*) FROM navigation_access_changes
      WHERE company_id=? AND target_type=? AND target_id=? AND item_key=?)=?
    AND COALESCE((${levelSql}),'none')=?
    THEN 1 ELSE json_extract('stale navigation assignment or missing authority','$') END AS integrity_guard`;
  return env.DB.prepare(check).bind(
    ...actorParams,...targetParams,
    ownerOnlyItem?1:0,context.employee.id,
    companyId,targetType,targetId,itemKey,expectedRevision,
    ...levelParams,oldLevel,
  );
}

async function assign(request: Request, env: Env, context: EnhancedSessionContext) {
  let body:{ companyId?:string; targetType?:'employee'|'role'; targetId?:string; itemKey?:string; accessLevel?:AccessLevel; reason?:string; expiresAt?:string | null; clear?:boolean; expectedRevision?:number };
  try { body = await request.json(); } catch { return json({error:'Invalid workspace assignment.'},400); }
  const companyId = String(body.companyId || ''), targetType = body.targetType, targetId = String(body.targetId || ''), level = body.accessLevel as AccessLevel;
  const item = navigationItems.find((candidate) => candidate.key === body.itemKey && candidate.permissionCode);
  if (!companyId || !companyAllowed(context,companyId) || !['employee','role'].includes(String(targetType)) || !targetId || !item || !levels.includes(level) || (body.clear !== undefined && typeof body.clear !== 'boolean')) return json({error:'Company, target, workspace item and access level are required.'},400);
  if (!canAssign(context,companyId)) return json({error:'Authorized Workspace management permission is required for this company.'},403);
  if (body.expectedRevision !== undefined && (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)) return json({error:'Expected revision must be a non-negative integer.'},400);
  const reason = String(body.reason || '').trim();
  if (reason.length < 3) return json({error:'Provide a short reason for this access assignment.'},400);
  if (!isOwner(context) && ['access-control','navigation-studio','authorized-workspace'].includes(item.key)) return json({error:'Only the Owner can assign administration access.'},403);
  const permission = await env.DB.prepare('SELECT id,code FROM permissions WHERE code=?').bind(item.permissionCode).first<{id:string;code:string}>();
  if (!permission) return json({error:`The ${item.label} permission is not configured.`},409);
  let oldLevel: AccessLevel = 'none';
  const writes=[];
  const revisionRow = await env.DB.prepare(
    'SELECT COUNT(*) AS revision FROM navigation_access_changes WHERE company_id=? AND target_type=? AND target_id=? AND item_key=?'
  ).bind(companyId,targetType,targetId,item.key).first<{revision:number}>();
  const revision = Number(revisionRow?.revision || 0);
  if (body.expectedRevision !== undefined && body.expectedRevision !== revision)
    return json({error:'The assignment was changed. Refresh before submitting again.'},409);
  const changeId=uid('nav-change'),auditId=uid('audit');
  if (targetType === 'role') {
    const role = await env.DB.prepare(`SELECT id,code,company_id companyId FROM roles WHERE id=? AND active=1 AND (company_id=? OR company_id IS NULL)`).bind(targetId,companyId).first<{id:string;code:string;companyId?:string|null}>();
    if (!role) return json({error:'Role not found for this company.'},404);
    if (role.code === 'owner') return json({error:'Owner / Super Admin navigation and permissions are protected.'},403);
    if (!role.companyId && !isOwner(context)) return json({error:'Only the Owner can change a Group-wide role. Use an employee override or a company-specific role.'},403);
    const current = await env.DB.prepare('SELECT access_level accessLevel FROM role_permissions WHERE role_id=? AND permission_id=?').bind(targetId,permission.id).first<{accessLevel:AccessLevel}>();
    oldLevel = current?.accessLevel || 'none';
    writes.push(env.DB.prepare('DELETE FROM role_permissions WHERE role_id=? AND permission_id=?').bind(targetId,permission.id));
    if (level !== 'none') writes.push(env.DB.prepare('INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)').bind(uid('role-permission'),targetId,permission.id,level));
  } else {
    const employee = await env.DB.prepare(`SELECT e.id,MAX(CASE WHEN r.code='owner' THEN 1 ELSE 0 END) isOwner FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id LEFT JOIN employee_roles er ON er.employee_id=e.id AND er.company_id=m.company_id LEFT JOIN roles r ON r.id=er.role_id WHERE e.id=? AND m.company_id=? AND m.active=1 GROUP BY e.id`).bind(targetId,companyId).first<{id:string;isOwner:number}>();
    if (!employee) return json({error:'Employee not found for this company.'},404);
    if (employee.isOwner) return json({error:'Owner / Super Admin navigation and permissions are protected.'},403);
    const current = await env.DB.prepare('SELECT access_level accessLevel FROM employee_permission_overrides_v2 WHERE employee_id=? AND company_id=? AND permission_id=?').bind(targetId,companyId,permission.id).first<{accessLevel:AccessLevel}>();
    oldLevel = current?.accessLevel || 'none';
    writes.push(
      env.DB.prepare('DELETE FROM employee_permission_overrides_v2 WHERE employee_id=? AND company_id=? AND permission_id=?').bind(targetId,companyId,permission.id),
      env.DB.prepare('DELETE FROM employee_permission_overrides WHERE employee_id=? AND company_id=? AND permission_id=?').bind(targetId,companyId,permission.id),
    );
    if(!body.clear) writes.push(
      env.DB.prepare(`INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by,expires_at)
        VALUES(?,?,?,?,?,?,?,?)`).bind(uid('permission-override'),targetId,companyId,permission.id,level,reason,context.employee.id,body.expiresAt || null),
      env.DB.prepare(`INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level,reason,granted_by,expires_at)
        VALUES(?,?,?,?,?,?,?,?)`).bind(uid('permission-compat'),targetId,companyId,permission.id,level,reason,context.employee.id,body.expiresAt || null),
    );
  }
  writes.push(
    env.DB.prepare(`INSERT INTO navigation_access_changes(id,company_id,target_type,target_id,item_key,permission_code,old_access_level,new_access_level,reason,changed_by)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(changeId,companyId,targetType,targetId,item.key,permission.code,oldLevel,body.clear?'none':level,reason,context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source)
      VALUES(?,?,?,'navigation','workspace_assignment',?,?,?,?,'web')`).bind(auditId,context.employee.id,companyId,targetType,targetId,JSON.stringify({itemKey:item.key,permissionCode:permission.code,accessLevel:oldLevel}),JSON.stringify({itemKey:item.key,permissionCode:permission.code,accessLevel:level,reason})),
    requireAudit(env,auditId),
  );
  // A D1 batch is a single transaction. The first SELECT denies stale,
  // revoked or unauthorized writes before any grant/audit mutation.
  writes.unshift(navigationAssignmentAtWriteGuard(
    env,context,companyId,targetType as 'employee'|'role',targetId,
    permission.id,item.key,oldLevel,revision,
  ));
  try { await env.DB.batch(writes); } catch { return json({error:'Workspace assignment was stale, denied or not audited. Reload and try again.'},409); }
  return json({ok:true,targetType,targetId,itemKey:item.key,permissionCode:permission.code,oldAccessLevel:oldLevel,accessLevel:body.clear?null:level,cleared:Boolean(body.clear),revision:revision+1});
}

export async function routeNavigationWorkspace(request: Request, env: Env, context: EnhancedSessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/navigation/effective' && request.method === 'GET') return effective(env,context);
  if (url.pathname === '/api/navigation/preference' && request.method === 'POST') return savePreference(request,env,context);
  if (url.pathname === '/api/navigation/policy' && request.method === 'POST') return savePolicy(request,env,context);
  if (url.pathname === '/api/navigation/access' && request.method === 'GET') return accessOverview(request,env,context);
  if (url.pathname === '/api/navigation/assign' && request.method === 'POST') return assign(request,env,context);
  return null;
}
