import { useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronRight, Grid3X3, LoaderCircle, Search, X } from 'lucide-react';
import { hasWorkforcePermission, permissionLevel, type AccessLevel, type WorkforceContext } from './auth';
import './module-hub.css';

export type ErpId =
  | 'staff'
  | 'printing'
  | 'bakery'
  | 'autos'
  | 'logistics'
  | 'properties'
  | 'finance'
  | 'social'
  | 'controls'
  | 'jobs';

export const CANONICAL_ERP_IDS: ErpId[] = ['staff', 'printing', 'bakery', 'autos', 'logistics', 'properties', 'finance', 'controls', 'jobs', 'social'];

export type HierarchyViewId =
  | 'overview'
  | 'people'
  | 'forms'
  | 'facilities'
  | 'broadcasts'
  | 'security'
  | 'help';

type ModuleGroup = 'My work' | 'Operations' | 'Management' | 'Social';

export type ModuleDefinition = {
  id: string;
  label: string;
  detail: string;
  group: ModuleGroup;
  permissions?: string[];
  minimum?: AccessLevel;
  prefixes?: string[];
  companyCodes?: string[];
  ownerOnly?: boolean;
  strictOwnerOnly?: boolean;
  load: () => Promise<unknown>;
  selector?: string;
  event?: { name: string; detail?: Record<string, string> };
  erpId: ErpId;
  submenuId: string;
  subsubmenuId: string;
  functionalItem: string;
};

export type HierarchyItem = {
  id: string;
  kind: 'view' | 'module' | 'utility';
  label: string;
  detail: string;
  iconKey: string;
  view?: HierarchyViewId;
  moduleId?: string;
  utility?: 'module-hub';
  /** Canonical ERP → submenu → sub-submenu → functional-item path. */
  path?: string;
};

export type ErpSubSubmenu = {
  id: string;
  label: string;
  detail: string;
  items: HierarchyItem[];
};

export type ErpSubmenu = {
  id: string;
  label: string;
  detail: string;
  submenus: ErpSubSubmenu[];
};

export type ErpNavigationGroup = {
  id: ErpId;
  label: string;
  detail: string;
  iconKey: string;
  submenus: ErpSubmenu[];
};

const modules: ModuleDefinition[] = [
  { id: 'employee', label: 'My Workspace', detail: 'Profile, requests and employee self-service', group: 'My work', erpId: 'staff', submenuId: 'people', subsubmenuId: 'employee-records', functionalItem: 'Employee records', load: () => import('./employee-entry'), selector: '.employee-center-launcher' },
  { id: 'profile', label: 'My Profile', detail: 'Personal details and profile completion', group: 'My work', erpId: 'staff', submenuId: 'people', subsubmenuId: 'employee-records', functionalItem: 'My profile', load: () => import('./profile-refinement-entry'), selector: '.pr-profile-button' },
  { id: 'attendance', label: 'Attendance & GPS', detail: 'Clock in, clock out and attendance records', group: 'My work', permissions: ['attendance.access'], erpId: 'staff', submenuId: 'time-attendance', subsubmenuId: 'attendance', functionalItem: 'Attendance & GPS', load: () => import('./attendance-entry'), selector: '.quick-attendance-button' },
  { id: 'payroll', label: 'Payroll', detail: 'Payroll preparation, approvals and records', group: 'My work', permissions: ['payroll.access'], erpId: 'staff', submenuId: 'payroll', subsubmenuId: 'payroll-operations', functionalItem: 'Payroll', load: () => import('./payroll-entry'), selector: '.payroll-launcher' },
  { id: 'mobile', label: 'App & GPS', detail: 'Mobile installation and tracking controls', group: 'My work', prefixes: ['mobile.'], erpId: 'staff', submenuId: 'time-attendance', subsubmenuId: 'attendance', functionalItem: 'Mobile and GPS', load: () => import('./mobile-entry'), selector: '.mobile-center-launcher' },
  { id: 'hr-master', label: 'HR Master Records', detail: 'Employment, emergency, pension and payroll-bank records', group: 'Management', permissions: ['hr.access'], erpId: 'staff', submenuId: 'people', subsubmenuId: 'employee-lifecycle', functionalItem: 'HR master records', load: () => import('./group-erp-admin-entry'), event: { name: 'daenem:open-group-erp', detail: { tab: 'hr' } } },
  { id: 'leave-management', label: 'Leave Management', detail: 'Review leave requests, decisions and employee absence history', group: 'Management', permissions: ['leave.admin'], erpId: 'staff', submenuId: 'people', subsubmenuId: 'employee-lifecycle', functionalItem: 'Leave management', load: () => import('./hr-workflows-entry'), event: { name: 'daenem:open-hr-workflows', detail: { tab: 'leave' } } },
  { id: 'performance-reviews', label: 'Performance Reviews', detail: 'Prepare, share and track employee reviews and acknowledgement', group: 'Management', permissions: ['reviews.admin'], erpId: 'staff', submenuId: 'people', subsubmenuId: 'employee-lifecycle', functionalItem: 'Performance reviews', load: () => import('./hr-workflows-entry'), event: { name: 'daenem:open-hr-workflows', detail: { tab: 'performance' } } },
  { id: 'hr-cases', label: 'HR Cases', detail: 'Disciplinary, grievance, commendation and incident cases', group: 'Management', permissions: ['hr.cases'], erpId: 'staff', submenuId: 'people', subsubmenuId: 'employee-lifecycle', functionalItem: 'HR cases', load: () => import('./hr-workflows-entry'), event: { name: 'daenem:open-hr-workflows', detail: { tab: 'cases' } } },
  { id: 'employee-lifecycle', label: 'Onboarding & Offboarding', detail: 'Employee start and exit checklists with task ownership', group: 'Management', permissions: ['hr.lifecycle'], erpId: 'staff', submenuId: 'people', subsubmenuId: 'employee-lifecycle', functionalItem: 'Onboarding and offboarding', load: () => import('./hr-workflows-entry'), event: { name: 'daenem:open-hr-workflows', detail: { tab: 'lifecycle' } } },
  { id: 'statutory-payroll', label: 'Statutory Payroll Setup', detail: 'Reviewed PAYE, pension, NHF, NSITF and ITF configuration', group: 'Management', permissions: ['payroll.statutory'], erpId: 'staff', submenuId: 'payroll', subsubmenuId: 'payroll-operations', functionalItem: 'Statutory payroll setup', load: () => import('./hr-workflows-entry'), event: { name: 'daenem:open-hr-workflows', detail: { tab: 'statutory' } } },
  { id: 'payroll-payments', label: 'Payroll Bank Payments', detail: 'Create controlled bank payment batches and draft exports', group: 'Management', permissions: ['payroll.access'], minimum: 'edit', erpId: 'staff', submenuId: 'payroll', subsubmenuId: 'payroll-operations', functionalItem: 'Payroll bank payments', load: () => import('./group-erp-admin-entry'), event: { name: 'daenem:open-group-erp', detail: { tab: 'payments' } } },

  { id: 'printing', label: 'Printing ERP', detail: 'Create and control quotations, jobs, artwork, production, materials, quality checks, delivery and profit.', group: 'Operations', permissions: ['printing.access'], companyCodes: ['PRINT'], erpId: 'printing', submenuId: 'print-management', subsubmenuId: 'print-jobs', functionalItem: 'Printing jobs', load: () => import('./printing-entry'), selector: '.printing-launcher:not(.production)' },
  { id: 'production', label: 'Production Control', detail: 'Track printing work in progress, actual materials, machine time, waste, quality checks and completion.', group: 'Operations', permissions: ['printing.access'], companyCodes: ['PRINT'], erpId: 'printing', submenuId: 'production-control', subsubmenuId: 'production-jobs', functionalItem: 'Production control', load: () => import('./printing-entry'), selector: '.printing-launcher.production' },
  { id: 'bakery', label: 'Bakery ERP', detail: 'Reconcile ingredients, batches, bread produced, dispatch, sales, returns, remittance and unexplained shortages.', group: 'Operations', permissions: ['bakery.access'], companyCodes: ['BAKERY'], erpId: 'bakery', submenuId: 'bakery-operations', subsubmenuId: 'bakery-production', functionalItem: 'Bakery operations', load: () => import('./bakery-entry-v2'), selector: '.bakery-launcher' },
  { id: 'autos', label: 'Autos ERP', detail: 'Manage vehicle inventory, imports, workshop jobs, mechanics, spare parts, fleet activity and vehicle profit.', group: 'Operations', permissions: ['autos.access'], companyCodes: ['AUTOS'], erpId: 'autos', submenuId: 'vehicle-operations', subsubmenuId: 'vehicle-workspace', functionalItem: 'Vehicle operations', load: () => import('./autos-entry'), selector: '.autos-launcher' },
  { id: 'logistics', label: 'Logistics ERP', detail: 'Manage bookings, dispatch, routes, drivers, fleet, proof of delivery, collections and trip profitability.', group: 'Operations', permissions: ['logistics.access'], companyCodes: ['LOGISTICS'], erpId: 'logistics', submenuId: 'transport-operations', subsubmenuId: 'fleet-dispatch', functionalItem: 'Fleet dispatch', load: () => import('./logistics-entry'), selector: '.logistics-launcher' },
  { id: 'properties', label: 'Homes & Properties ERP', detail: 'Manage owners, properties, units, tenants, rent, service charges, maintenance, profitability and ROI.', group: 'Operations', permissions: ['properties.access'], companyCodes: ['PROPERTIES'], erpId: 'properties', submenuId: 'property-operations', subsubmenuId: 'property-workspace', functionalItem: 'Property operations', load: () => import('./properties-entry'), selector: '.properties-launcher' },
  { id: 'finance', label: 'Finance', detail: 'Ledgers, journals, receivables and reporting', group: 'Operations', prefixes: ['finance.'], erpId: 'finance', submenuId: 'financial-control', subsubmenuId: 'finance-operations', functionalItem: 'Finance operations', load: () => import('./finance-entry'), selector: '.finance-center-launcher' },
  { id: 'expense-requests', label: 'My Expense Requests', detail: 'Create, evidence and track your own controlled spend requests', group: 'My work', permissions: ['expense.requests'], minimum: 'create', erpId: 'finance', submenuId: 'financial-control', subsubmenuId: 'finance-operations', functionalItem: 'My expense requests', load: () => import('./spend-entry'), selector: '.spend-launcher', event: { name: 'daenem:open-spend', detail: { tab: 'requests' } } },
  { id: 'expense-create', label: 'Create Expense Request', detail: 'Capture a classified request with controlled master data and evidence', group: 'My work', permissions: ['expense.requests'], minimum: 'create', erpId: 'finance', submenuId: 'financial-control', subsubmenuId: 'finance-operations', functionalItem: 'Create expense request', load: () => import('./spend-entry'), selector: '.spend-launcher', event: { name: 'daenem:open-spend', detail: { tab: 'create' } } },
  { id: 'expense-approvals', label: 'Expense Approval Queue', detail: 'Review assigned expense requests with maker-checker controls', group: 'Management', permissions: ['expense.approve'], minimum: 'view', erpId: 'finance', submenuId: 'financial-control', subsubmenuId: 'finance-operations', functionalItem: 'Expense approval queue', load: () => import('./spend-entry'), selector: '.spend-launcher', event: { name: 'daenem:open-spend', detail: { tab: 'approvals' } } },
  { id: 'spend-intelligence', label: 'Spend & Profit Intelligence', detail: 'Owner-only spend exposure, treatment and evidence exceptions', group: 'Management', strictOwnerOnly: true, erpId: 'finance', submenuId: 'financial-control', subsubmenuId: 'finance-operations', functionalItem: 'Spend and profit intelligence', load: () => import('./spend-entry'), selector: '.spend-launcher', event: { name: 'daenem:open-spend', detail: { tab: 'intelligence' } } },
  { id: 'spend-admin', label: 'Cost Intelligence Administration', detail: 'Govern categories, suppliers, cost centres and evidence rules', group: 'Management', permissions: ['expense.master'], minimum: 'manage', erpId: 'finance', submenuId: 'financial-control', subsubmenuId: 'finance-operations', functionalItem: 'Cost intelligence administration', load: () => import('./spend-entry'), selector: '.spend-launcher', event: { name: 'daenem:open-spend', detail: { tab: 'admin' } } },

  { id: 'finance-posting', label: 'Finance Posting', detail: 'Sales posting automation, exceptions and reconciliation controls', group: 'Operations', permissions: ['finance.entry'], erpId: 'finance', submenuId: 'financial-control', subsubmenuId: 'finance-operations', functionalItem: 'Finance posting', load: () => import('./finance-automation-entry'), selector: '.fa-launcher' },
  { id: 'inventory', label: 'Inventory', detail: 'Stock, movement and item controls', group: 'Operations', permissions: ['inventory.access'], erpId: 'finance', submenuId: 'supply-control', subsubmenuId: 'inventory', functionalItem: 'Inventory control', load: () => import('./inventory-entry'), selector: '.inventory-launcher' },
  { id: 'construction', label: 'Construction & Projects', detail: 'Projects, sites, budgets and progress', group: 'Operations', permissions: ['construction.access'], erpId: 'finance', submenuId: 'project-control', subsubmenuId: 'construction', functionalItem: 'Construction projects', load: () => import('./construction-entry'), selector: '.construction-launcher' },

  { id: 'sync-sessions', label: 'Sync & Sessions', detail: 'Owner-only offline, sync and session health', group: 'Management', strictOwnerOnly: true, erpId: 'controls', submenuId: 'system-control', subsubmenuId: 'observability', functionalItem: 'Sync & Sessions', load: () => import('./offline-sync-center-entry'), selector: '.offline-sync-center-launcher' },
  { id: 'owner-intelligence', label: 'Owner Intelligence', detail: 'Group-level operational intelligence', group: 'Management', ownerOnly: true, erpId: 'controls', submenuId: 'executive-control', subsubmenuId: 'intelligence', functionalItem: 'Owner intelligence', load: () => import('./owner-intelligence-entry'), selector: '.owner-intelligence-launcher' },
  { id: 'admin', label: 'Admin Setup', detail: 'Settings, security and tracking configuration', group: 'Management', permissions: ['settings.access', 'tracking.access', 'security.access'], erpId: 'controls', submenuId: 'access-control', subsubmenuId: 'administration', functionalItem: 'Administration', load: () => Promise.all([import('./admin-entry'), import('./temporary-password-admin-entry')]), event: { name: 'daenem:open-admin' } },
  { id: 'temporary-passwords', label: 'Temporary Password Recovery', detail: 'Issue or revoke one-time employee recovery passwords', group: 'Management', permissions: ['users.access'], minimum: 'manage', erpId: 'controls', submenuId: 'access-control', subsubmenuId: 'administration', functionalItem: 'Temporary password recovery', load: () => import('./temporary-password-admin-entry'), event: { name: 'daenem:open-temporary-password' } },
  { id: 'access', label: 'Access Control', detail: 'Roles, permissions and employee access', group: 'Management', permissions: ['roles.access', 'users.access'], erpId: 'controls', submenuId: 'access-control', subsubmenuId: 'administration', functionalItem: 'Access control', load: () => import('./access-control-entry'), event: { name: 'daenem:open-access-control' } },
  { id: 'user-support', label: 'User Support Centre', detail: 'Inspect assigned access and sessions, send audited portal refresh commands, and request employee-approved assistance.', group: 'Management', permissions: ['support.access'], erpId: 'controls', submenuId: 'access-control', subsubmenuId: 'support', functionalItem: 'User support', load: () => import('./owner-support-entry'), event: { name: 'daenem:open-user-support' } },
  { id: 'themes', label: 'Theme Studio', detail: 'Full theme gallery and Group appearance policy', group: 'Management', erpId: 'controls', submenuId: 'experience-control', subsubmenuId: 'personalization', functionalItem: 'Theme studio', load: () => Promise.all([import('./theme-studio-entry'), import('./theme-studio-admin-entry')]), selector: '.theme-studio-trigger' },
  { id: 'navigation', label: 'Navigation Studio', detail: 'Personal layout and authorized workspace', group: 'Management', erpId: 'controls', submenuId: 'experience-control', subsubmenuId: 'personalization', functionalItem: 'Navigation studio', load: () => import('./navigation-studio-entry'), event: { name: 'daenem:open-navigation', detail: { tab: 'styles' } } },
  { id: 'layout-studio', label: 'Layout Studio', detail: 'Independent authenticated shell, density and motion profiles', group: 'Management', permissions: ['settings.access', 'navigation.studio'], erpId: 'controls', submenuId: 'experience-control', subsubmenuId: 'personalization', functionalItem: 'Layout studio', load: () => import('./layout-studio-entry'), event: { name: 'daenem:open-layout-studio' } },
  { id: 'monitoring', label: 'Resource Monitoring', detail: 'Service health, sessions and diagnostics', group: 'Management', permissions: ['diagnostics.access'], erpId: 'controls', submenuId: 'system-control', subsubmenuId: 'observability', functionalItem: 'Resource monitoring', load: () => import('./group-erp-admin-entry'), event: { name: 'daenem:open-group-erp', detail: { tab: 'monitoring' } } },
  { id: 'audit', label: 'Activity & Audit', detail: 'Business activity and audit explorer', group: 'Management', permissions: ['audit.explorer'], erpId: 'controls', submenuId: 'system-control', subsubmenuId: 'observability', functionalItem: 'Activity and audit', load: () => import('./group-erp-admin-entry'), event: { name: 'daenem:open-group-erp', detail: { tab: 'audit' } } },
  { id: 'toolbox', label: 'Advanced Toolbox', detail: 'Database, sessions, payroll readiness and critical-error checks', group: 'Management', permissions: ['toolbox.access'], minimum: 'manage', erpId: 'controls', submenuId: 'system-control', subsubmenuId: 'observability', functionalItem: 'Advanced toolbox', load: () => import('./group-erp-admin-entry'), event: { name: 'daenem:open-group-erp', detail: { tab: 'toolbox' } } },
  { id: 'api-integrations', label: 'API & Integrations', detail: 'Cloudflare health, safe connection metadata, API catalogue, webhooks and request logs.', group: 'Management', permissions: ['integrations.access'], erpId: 'controls', submenuId: 'system-control', subsubmenuId: 'api-integrations', functionalItem: 'API integrations', load: () => import('./platform-center-entry'), selector: '.integration-center-launcher' },

  { id: 'jobs-applications', label: 'Job Applications', detail: 'Review and organize authorized candidate applications', group: 'Management', permissions: ['jobs.access'], erpId: 'jobs', submenuId: 'talent-acquisition', subsubmenuId: 'applications', functionalItem: 'Applications', load: () => import('./jobs-entry'), selector: '.jobs-erp-launcher' },
  { id: 'jobs-interviews', label: 'Interview Pipeline', detail: 'Coordinate interview stages and interviewer notes', group: 'Management', permissions: ['jobs.access'], erpId: 'jobs', submenuId: 'talent-acquisition', subsubmenuId: 'interviews', functionalItem: 'Interviews', load: () => import('./jobs-entry'), selector: '.jobs-erp-launcher' },
  { id: 'jobs-hiring', label: 'Hiring Workflow', detail: 'Move approved candidates through hiring workflow', group: 'Management', permissions: ['jobs.access'], erpId: 'jobs', submenuId: 'talent-acquisition', subsubmenuId: 'hiring', functionalItem: 'Hiring', load: () => import('./jobs-entry'), selector: '.jobs-erp-launcher' },

  { id: 'social', label: 'Social Engine', detail: 'Content, publishing and campaign workspace', group: 'Social', prefixes: ['social.'], erpId: 'social', submenuId: 'social-operations', subsubmenuId: 'social-campaigns', functionalItem: 'Social publishing', load: () => import('./social-entry'), selector: '.social-engine-launcher' },
  { id: 'social-controls', label: 'Social Controls', detail: 'Automation settings and approval controls', group: 'Social', prefixes: ['social.automation', 'social.settings'], erpId: 'social', submenuId: 'social-operations', subsubmenuId: 'automation', functionalItem: 'Social automation', load: () => import('./social-automation-entry'), selector: '.sa-launcher' },
  { id: 'social-accounts', label: 'Social Accounts', detail: 'Official provider account connections', group: 'Social', permissions: ['social.connections'], erpId: 'social', submenuId: 'social-operations', subsubmenuId: 'accounts', functionalItem: 'Social accounts', load: () => import('./social-connections-entry'), selector: '.scn-launcher' },
  { id: 'social-sync', label: 'ERP Social Sync', detail: 'ERP and social conversion integrations', group: 'Social', permissions: ['social.integrations'], erpId: 'social', submenuId: 'social-operations', subsubmenuId: 'social-integrations', functionalItem: 'ERP social sync', load: () => import('./social-integrations-entry'), selector: '.si-launcher' },
  { id: 'marketing', label: 'Marketing Command', detail: 'Audience, funnel and campaign intelligence', group: 'Social', prefixes: ['social.analytics', 'social.ai', 'social.community', 'social.ads'], erpId: 'social', submenuId: 'digital-presence', subsubmenuId: 'digital-campaigns', functionalItem: 'Marketing intelligence', load: () => import('./social-marketing-command-entry'), selector: '.smc-launcher' },
  { id: 'community', label: 'Community Inbox', detail: 'Customer messages and response workflow', group: 'Social', permissions: ['social.community'], erpId: 'social', submenuId: 'social-operations', subsubmenuId: 'community', functionalItem: 'Community inbox', load: () => import('./social-community-entry'), selector: '.sci-launcher' },
  { id: 'website-admin', label: 'Website Administration', detail: 'Maintain business website setup, pages, images, revisions and approval-controlled publishing.', group: 'Social', permissions: ['website.access'], erpId: 'social', submenuId: 'digital-presence', subsubmenuId: 'websites', functionalItem: 'Website administration', load: () => import('./platform-center-entry'), selector: '.website-admin-launcher' },
];

export const moduleDefinitions = modules;

export function getCanonicalModule(moduleId: string) {
  return moduleDefinitions.find((module) => module.id === moduleId);
}

export function getCanonicalErpForModule(moduleId: string): ErpId | null {
  return getCanonicalModule(moduleId)?.erpId || null;
}

type HierarchyTemplate = Omit<ErpNavigationGroup, 'submenus'> & {
  submenus: Array<Omit<ErpSubmenu, 'submenus'> & { submenus: Array<Omit<ErpSubSubmenu, 'items'> & { items?: HierarchyItem[] }> }>;
};

const hierarchyTemplate: HierarchyTemplate[] = [
  {
    id: 'staff',
    label: 'Staff ERP',
    detail: 'People, time, pay and HR workflows',
    iconKey: 'users',
    submenus: [
      { id: 'people', label: 'People & HR', detail: 'Employee records and lifecycle workflows', submenus: [
        { id: 'employee-records', label: 'Employee records', detail: 'Profiles, requests and employee self-service', items: [
          { id: 'staff-overview', kind: 'view', label: 'Group Overview', detail: 'Permitted companies, alerts, tasks and performance', iconKey: 'gauge', view: 'overview' },
          { id: 'staff-people', kind: 'view', label: 'People & Payroll', detail: 'Approved employees, requests and payslip access', iconKey: 'users', view: 'people' },
        ] },
        { id: 'employee-lifecycle', label: 'Employee lifecycle', detail: 'Forms, leave and performance workflows', items: [
          { id: 'staff-forms', kind: 'view', label: 'Forms Center', detail: 'Assigned forms and workflow submissions', iconKey: 'forms', view: 'forms' },
        ] },
      ] },
      { id: 'time-attendance', label: 'Time & Attendance', detail: 'Attendance records and location-aware work', submenus: [
        { id: 'attendance', label: 'Attendance', detail: 'Clocking, GPS and attendance records' },
      ] },
      { id: 'payroll', label: 'Payroll', detail: 'Payroll preparation and approvals', submenus: [
        { id: 'payroll-operations', label: 'Payroll operations', detail: 'Payroll records, approvals and payslips' },
      ] },
    ],
  },
  {
    id: 'jobs',
    label: 'Jobs ERP',
    detail: 'Applications, interviews and hiring',
    iconKey: 'briefcase',
    submenus: [{ id: 'talent-acquisition', label: 'Talent acquisition', detail: 'Candidate and hiring operations', submenus: [
      { id: 'applications', label: 'Applications', detail: 'Candidate applications and review stages' },
      { id: 'interviews', label: 'Interviews', detail: 'Interview coordination and feedback' },
      { id: 'hiring', label: 'Hiring', detail: 'Approved candidate hiring workflow' },
    ] }],
  },
  {
    id: 'printing',
    label: 'Printing & Technology',
    detail: 'Jobs, production, materials and delivery',
    iconKey: 'factory',
    submenus: [
      { id: 'print-management', label: 'Print management', detail: 'Quotations, jobs, artwork and delivery', submenus: [
        { id: 'print-jobs', label: 'Print jobs', detail: 'Quotations, jobs, artwork, costing and profit' },
      ] },
      { id: 'production-control', label: 'Production control', detail: 'Materials, machines, waste and quality', submenus: [
        { id: 'production-jobs', label: 'Production jobs', detail: 'Work in progress and completion controls' },
      ] },
    ],
  },
  {
    id: 'bakery',
    label: 'Bakery ERP',
    detail: 'Recipes, batches, dispatch and accountability',
    iconKey: 'sparkles',
    submenus: [{ id: 'bakery-operations', label: 'Bakery operations', detail: 'Ingredients, batches, dispatch and sales', submenus: [
      { id: 'bakery-production', label: 'Bakery production', detail: 'Batches, remittance and shortage controls' },
    ] }],
  },
  {
    id: 'autos',
    label: 'Auto ERP',
    detail: 'Vehicles, workshop, parts and sales',
    iconKey: 'briefcase',
    submenus: [{ id: 'vehicle-operations', label: 'Vehicle operations', detail: 'Inventory, workshop, fleet and profitability', submenus: [
      { id: 'vehicle-workspace', label: 'Vehicle workspace', detail: 'Vehicle records, workshop jobs and parts' },
    ] }],
  },
  {
    id: 'logistics',
    label: 'Logistics ERP',
    detail: 'Fleet, trips, dispatch and proof of delivery',
    iconKey: 'package',
    submenus: [{ id: 'transport-operations', label: 'Transport operations', detail: 'Bookings, routes, drivers and collections', submenus: [
      { id: 'fleet-dispatch', label: 'Fleet dispatch', detail: 'Trips, proof of delivery and profitability' },
    ] }],
  },
  {
    id: 'properties',
    label: 'Homes & Properties',
    detail: 'Listings, leases, rent and property ROI',
    iconKey: 'home',
    submenus: [{ id: 'property-operations', label: 'Property operations', detail: 'Owners, units, tenants and maintenance', submenus: [
      { id: 'property-workspace', label: 'Property workspace', detail: 'Leases, rent, service charges and ROI' },
    ] }],
  },
  {
    id: 'finance',
    label: 'Finance & Operations',
    detail: 'Money, stock, projects and facilities',
    iconKey: 'money',
    submenus: [
      { id: 'financial-control', label: 'Financial control', detail: 'Ledgers, journals, receivables and reporting', submenus: [
        { id: 'finance-operations', label: 'Finance operations', detail: 'Financial records and reports' },
      ] },
      { id: 'supply-control', label: 'Supply control', detail: 'Stock, movement and item controls', submenus: [
        { id: 'inventory', label: 'Inventory', detail: 'Stock and inventory records' },
      ] },
      { id: 'project-control', label: 'Project control', detail: 'Projects, sites, budgets and progress', submenus: [
        { id: 'construction', label: 'Construction projects', detail: 'Construction records and progress' },
      ] },
      { id: 'facilities', label: 'Facilities', detail: 'Buildings, assets, readings and work orders', submenus: [
        { id: 'maintenance', label: 'Maintenance', detail: 'Facilities and maintenance workflows', items: [
          { id: 'finance-facilities', kind: 'view', label: 'Facilities & Maintenance', detail: 'Buildings, assets, readings and work orders', iconKey: 'wrench', view: 'facilities' },
        ] },
      ] },
    ],
  },
  {
    id: 'social',
    label: 'Social & Web',
    detail: 'Communications, websites and campaigns',
    iconKey: 'sparkles',
    submenus: [
      { id: 'social-operations', label: 'Social operations', detail: 'Publishing, automation, accounts and community', submenus: [
        { id: 'social-campaigns', label: 'Campaigns', detail: 'Social publishing and marketing intelligence' },
        { id: 'automation', label: 'Automation', detail: 'Social automation and approvals' },
        { id: 'accounts', label: 'Accounts', detail: 'Official provider account connections' },
        { id: 'social-integrations', label: 'ERP social sync', detail: 'ERP and social conversion integrations' },
        { id: 'community', label: 'Community', detail: 'Customer messages and response workflow' },
        { id: 'communications', label: 'Communications', detail: 'Announcements and staff communication', items: [
          { id: 'social-broadcasts', kind: 'view', label: 'Broadcast Center', detail: 'Announcements and approved staff communications', iconKey: 'radio', view: 'broadcasts' },
        ] },
      ] },
      { id: 'digital-presence', label: 'Digital presence', detail: 'Websites, pages and campaigns', submenus: [
        { id: 'digital-campaigns', label: 'Campaigns', detail: 'Audience, funnel and campaign intelligence' },
        { id: 'websites', label: 'Websites', detail: 'Business website administration' },
      ] },
    ],
  },
  {
    id: 'controls',
    label: 'Security, Access & Admin',
    detail: 'Protected security, support and administration',
    iconKey: 'shield',
    submenus: [
      { id: 'executive-control', label: 'Executive control', detail: 'Group overview and owner intelligence', submenus: [
        { id: 'intelligence', label: 'Intelligence', detail: 'Group overview and operational intelligence', items: [
        ] },
      ] },
      { id: 'access-control', label: 'Access control', detail: 'Administration, roles and support', submenus: [
        { id: 'administration', label: 'Administration', detail: 'Settings, security, roles and employee access' },
        { id: 'support', label: 'Support', detail: 'Audited employee support and sessions' },
      ] },
      { id: 'experience-control', label: 'Experience control', detail: 'Authorized appearance and navigation', submenus: [
        { id: 'personalization', label: 'Personalization', detail: 'Theme and navigation configuration' },
      ] },
      { id: 'system-control', label: 'System control', detail: 'Monitoring, audit, integrations and help', submenus: [
        { id: 'observability', label: 'Observability', detail: 'Service health and activity audit' },
        { id: 'api-integrations', label: 'Integrations', detail: 'API catalogue, webhooks and connection metadata' },
        { id: 'security', label: 'Security', detail: 'Sign-ins, devices and access events', items: [
          { id: 'controls-security', kind: 'view', label: 'Security Center', detail: 'Sign-ins, devices and access events', iconKey: 'shield', view: 'security' },
        ] },
        { id: 'help', label: 'Help', detail: 'Permission-aware portal guidance', items: [
          { id: 'controls-help', kind: 'view', label: 'AI Guide', detail: 'Permission-aware help for every workspace', iconKey: 'sparkles', view: 'help' },
        ] },
        { id: 'module-directory', label: 'Module directory', detail: 'Search and launch authorized ERP workspaces', items: [
          { id: 'module-hub', kind: 'utility', label: 'Module Hub', detail: 'Search and launch authorized ERP workspaces', iconKey: 'grid', utility: 'module-hub' },
        ] },
      ] },
    ],
  },
];


export type ErpHierarchyAudit = {
  valid: boolean;
  errors: string[];
  moduleCount: number;
  erpCount: number;
};

export function validateErpCatalog(
  definitions: ModuleDefinition[] = moduleDefinitions,
  template: HierarchyTemplate[] = hierarchyTemplate,
): string[] {
  const errors: string[] = [];
  const erpIds = new Set(template.map((group) => group.id));
  const moduleIds = new Set<string>();
  const functionalItems = new Set<string>();
  const modulePaths = new Set<string>();

  for (const module of definitions) {
    if (moduleIds.has(module.id)) errors.push(`Duplicate module id: ${module.id}`);
    moduleIds.add(module.id);
    if (!erpIds.has(module.erpId)) errors.push(`Module ${module.id} references unknown ERP: ${module.erpId}`);

    const group = template.find((item) => item.id === module.erpId);
    const submenu = group?.submenus.find((item) => item.id === module.submenuId);
    const subsubmenu = submenu?.submenus.find((item) => item.id === module.subsubmenuId);
    if (!group || !submenu || !subsubmenu) {
      errors.push(`Module ${module.id} has an invalid ERP path: ${module.erpId} / ${module.submenuId} / ${module.subsubmenuId}`);
    }

    if (functionalItems.has(module.functionalItem)) {
      errors.push(`Duplicate functional item across ERP catalog: ${module.functionalItem}`);
    }
    functionalItems.add(module.functionalItem);

    const path = [module.erpId, module.submenuId, module.subsubmenuId, module.functionalItem].join('/');
    if (modulePaths.has(path)) errors.push(`Duplicate module path: ${path}`);
    modulePaths.add(path);
  }

  const itemIds = new Map<string, string>();
  const structurePaths = new Set<string>();
  for (const group of template) {
    for (const submenu of group.submenus) {
      for (const subsubmenu of submenu.submenus) {
        const structurePath = [group.id, submenu.id, subsubmenu.id].join('/');
        if (structurePaths.has(structurePath)) errors.push(`Duplicate hierarchy path: ${structurePath}`);
        structurePaths.add(structurePath);
        for (const item of subsubmenu.items || []) {
          const previous = itemIds.get(item.id);
          if (previous) errors.push(`Duplicate hierarchy item id: ${item.id} (${previous} and ${structurePath})`);
          itemIds.set(item.id, structurePath);
          if (item.kind === 'view' && !item.view) errors.push(`View item ${item.id} is missing a view target`);
          if (item.kind === 'utility' && !item.utility) errors.push(`Utility item ${item.id} is missing a utility target`);
        }
      }
    }
  }

  return errors;
}

export const ERP_HIERARCHY_AUDIT: ErpHierarchyAudit = {
  valid: validateErpCatalog().length === 0,
  errors: validateErpCatalog(),
  moduleCount: moduleDefinitions.length,
  erpCount: hierarchyTemplate.length,
};

if (ERP_HIERARCHY_AUDIT.errors.length) {
  console.error('Invalid Daenem ERP hierarchy', ERP_HIERARCHY_AUDIT.errors);
}

export function getErpNavigation(visibleModules: ModuleDefinition[], visibleViews: HierarchyViewId[] = []): ErpNavigationGroup[] {
  const visibleIds = new Set(visibleModules.map((module) => module.id));
  return hierarchyTemplate.map((group) => {
    const submenus = group.submenus.map((submenu) => {
      const subsubmenus = submenu.submenus.map((subsubmenu) => {
        const moduleItems = visibleModules
          .filter((module) => module.erpId === group.id && module.submenuId === submenu.id && module.subsubmenuId === subsubmenu.id)
          .map((module) => ({
            id: module.id,
            kind: 'module' as const,
            label: module.functionalItem,
            detail: module.detail,
            iconKey: module.id,
            moduleId: module.id,
            path: `${group.label} / ${submenu.label} / ${subsubmenu.label} / ${module.functionalItem}`,
          }));
        const viewItems = (subsubmenu.items || [])
          .filter((item) => item.view && visibleViews.includes(item.view))
          .map((item) => ({ ...item, path: `${group.label} / ${submenu.label} / ${subsubmenu.label} / ${item.label}` }));
        const utilityItems = (subsubmenu.items || [])
          .filter((item) => item.kind === 'utility')
          .map((item) => ({ ...item, path: `${group.label} / ${submenu.label} / ${subsubmenu.label} / ${item.label}` }));
        return { ...subsubmenu, items: [...moduleItems, ...viewItems, ...utilityItems].filter((item) => item.moduleId ? visibleIds.has(item.moduleId) : true) };
      }).filter((subsubmenu) => subsubmenu.items.length);
      return { ...submenu, submenus: subsubmenus };
    }).filter((submenu) => submenu.submenus.length);
    return { ...group, submenus };
  }).filter((group) => group.submenus.length);
}

function owner(context: WorkforceContext) {
  return context.roles.some((role) => ['owner', 'group_admin'].includes(role.code));
}

export function isModuleVisible(context: WorkforceContext, module: ModuleDefinition, companyId: string | null, companyCode: string) {
  if (module.companyCodes?.length) {
    if (companyId && !module.companyCodes.includes(companyCode)) return false;
    if (!companyId && !context.companies.some((company) => module.companyCodes?.includes(company.code))) return false;
  }
  if (module.strictOwnerOnly && !context.roles.some((role) => role.code === 'owner')) return false;
  if (owner(context)) return true;
  if (module.ownerOnly) return false;
  if (!module.permissions?.length && !module.prefixes?.length) return true;
  const scopeIds = companyId
    ? [companyId]
    : module.companyCodes?.length
      ? context.companies.filter((company) => module.companyCodes?.includes(company.code)).map((company) => company.id)
      : [null];
  if (module.permissions?.some((permission) => scopeIds.some((scopeId) => hasWorkforcePermission(context, permission, module.minimum || 'view', scopeId)))) return true;
  return module.prefixes?.some((prefix) => scopeIds.some((scopeId) => {
    const permissions = scopeId ? context.companyPermissions?.[scopeId] || {} : context.permissions;
    return Object.keys(permissions).some((permission) => permission.startsWith(prefix) && permissionLevel(context, permission, scopeId) !== 'none');
  })) || false;
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function clickWhenReady(selector: string) {
  // Lazy ERP entries can finish their authenticated context handshake after the
  // import resolves; keep the bounded readiness window generous enough for a
  // cold chunk without turning module launch into an unbounded wait.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (button) { button.click(); return true; }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  }
  return false;
}

export type PostAuthModuleExperience = { moduleId?: string; canonicalPath?: string; layoutId: string; shellMode: string; density: string; motion: string; erpId: ErpId; };
type ModuleExperienceResolver = (erpId: ErpId, companyId: string | null, companyCode: string) => Promise<PostAuthModuleExperience>;

export function ModuleHub({ context, companyId, companyCode, showLauncher = false, experience, resolveExperience }: { context: WorkforceContext; companyId: string | null; companyCode: string; showLauncher?: boolean; experience?: PostAuthModuleExperience; resolveExperience?: ModuleExperienceResolver }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const available = useMemo(() => moduleDefinitions.filter((module) => isModuleVisible(context, module, companyId, companyCode)), [companyCode, companyId, context]);
  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized ? available.filter((module) => `${module.label} ${module.detail} ${module.functionalItem}`.toLowerCase().includes(normalized)) : available;
    return getErpNavigation(filtered)
      .flatMap((group) => group.submenus.flatMap((submenu) => submenu.submenus.map((subsubmenu) => ({
        label: `${group.label} / ${submenu.label} / ${subsubmenu.label}`,
        items: subsubmenu.items.filter((item) => item.kind === 'module'),
      }))))
      .filter((group) => group.items.length);
  }, [available, query]);

  useEffect(() => {
    const launchRequested = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const module = available.find((item) => item.id === id);
      if (module) void launch(module);
    };
    const openRequested = () => setOpen(true);
    window.addEventListener('daenem:launch-module', launchRequested as EventListener);
    window.addEventListener('daenem:open-module-hub', openRequested);
    return () => {
      window.removeEventListener('daenem:launch-module', launchRequested as EventListener);
      window.removeEventListener('daenem:open-module-hub', openRequested);
    };
  }, [available, loading, experience, resolveExperience]);

  async function launch(module: ModuleDefinition) {
    if (loading) return;
    setLoading(module.id);
    setMessage('');
    try {
      const resolved = resolveExperience
        ? await resolveExperience(module.erpId, companyId, companyCode)
        : experience?.erpId === module.erpId
          ? experience
          : { layoutId: 'executive-command', shellMode: 'command-rail', density: 'standard', motion: 'balanced', erpId: module.erpId };
      const moduleExperience: PostAuthModuleExperience = {
        ...resolved,
        moduleId: module.id,
        erpId: module.erpId,
        canonicalPath: module.erpId + '/' + module.submenuId + '/' + module.subsubmenuId + '/' + module.functionalItem,
      };
      const publishExperience = () => {
        (window as Window & { __DAENEM_MODULE_EXPERIENCE__?: typeof moduleExperience }).__DAENEM_MODULE_EXPERIENCE__ = moduleExperience;
        window.dispatchEvent(new CustomEvent('daenem:module-experience', { detail: moduleExperience }));
      };
      // Resolved ERP context is published before the lazy entry initializes;
      // the first visible surface cannot use stale context.
      publishExperience();
      await module.load();
      await nextFrame();
      await nextFrame();
      publishExperience();
      window.dispatchEvent(new CustomEvent('daenem:active-company-changed', { detail: { companyId, companyCode } }));
      const opened = module.selector ? await clickWhenReady(module.selector) : true;
      if (!opened) throw new Error(`${module.label} did not finish opening. Please try once more.`);
      if (module.event) window.dispatchEvent(new CustomEvent(module.event.name, { detail: { ...module.event.detail, companyId: companyId || '', companyCode, experience: moduleExperience } }));
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${module.label} could not be opened.`);
    } finally {
      setLoading('');
    }
  }

  return <div className="postauth-module-envelope" data-module-envelope="true" data-module-layout={experience?.layoutId || 'executive-command'} data-module-erp={experience?.erpId || 'staff'}>
    {showLauncher && <button className="module-hub-launcher" onClick={() => setOpen(true)} aria-label="Open module hub"><Grid3X3 size={18} /><span>Modules</span></button>}
    {open && <div className="module-hub-backdrop" onClick={() => !loading && setOpen(false)}>
      <section className="module-hub-panel" role="dialog" aria-modal="true" aria-labelledby="module-hub-title" onClick={(event) => event.stopPropagation()}>
        <header><div><span className="eyebrow">ON-DEMAND WORKSPACES</span><h2 id="module-hub-title">Module Hub</h2><p>Only the workspace you open is loaded, keeping the portal fast and memory-efficient.</p></div><button onClick={() => setOpen(false)} disabled={Boolean(loading)} aria-label="Close module hub"><X size={20} /></button></header>
        <label className="module-hub-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your modules…" autoFocus /></label>
        {message && <div className="module-hub-message">{message}</div>}
        <main>{groups.length ? groups.map((group) => <section key={group.label}><div className="module-hub-group-title"><span>{group.label}</span><small>{group.items.length}</small></div><div className="module-hub-grid">{group.items.map((item) => {
          const module = available.find((candidate) => candidate.id === item.moduleId);
          if (!module) return null;
          return <button key={module.id} onClick={() => { void launch(module); }} disabled={Boolean(loading)}><span className="module-hub-icon">{loading === module.id ? <LoaderCircle className="spin" size={18} /> : <Boxes size={18} />}</span><span><strong>{module.label}</strong><small>{module.detail}</small></span><ChevronRight size={17} /></button>;
        })}</div></section>) : <div className="module-hub-empty">No module matches your search.</div>}</main>
      </section>
    </div>}
  </div>;
}
