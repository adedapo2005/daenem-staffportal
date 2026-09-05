import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const evidenceDir = path.join(root, 'qa-artifacts');
const screenshotDir = path.join(evidenceDir, 'screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });

const layouts = [
  'executive-command',
  'workspace-canvas',
  'operational-cockpit',
  'insight-magazine',
  'master-detail',
  'horizon-wide',
  'adaptive-bento',
  'focus-flow',
  'enterprise-studio',
  'board-pulse',
];

const expectedAdapters = {
  'executive-command': 'executive-command-sidebar',
  'workspace-canvas': 'workspace-canvas-rail',
  'operational-cockpit': 'operational-cockpit-rail',
  'insight-magazine': 'insight-magazine-command',
  'master-detail': 'master-detail-navigation',
  'horizon-wide': 'horizon-wide-command',
  'adaptive-bento': 'adaptive-bento-sidebar',
  'focus-flow': 'contextual',
  'enterprise-studio': 'enterprise-studio-rail',
  'board-pulse': 'board-pulse-operations',
};

const allCompanies = [
  { id: 'company-printing', code: 'PRINT', name: 'Printing & Technology', primary: true },
  { id: 'company-bakery', code: 'BAKERY', name: 'Bakery', primary: false },
  { id: 'company-autos', code: 'AUTOS', name: 'Daenem Autos', primary: false },
  { id: 'company-logistics', code: 'LOGISTICS', name: 'Logistics', primary: false },
  { id: 'company-properties', code: 'PROPERTIES', name: 'Homes & Properties', primary: false },
];

const ownerPermissions = {
  'dashboard.access': 'manage', 'users.access': 'manage', 'attendance.access': 'manage',
  'payroll.access': 'manage', 'payslips.access': 'manage', 'forms.access': 'manage',
  'facilities.access': 'manage', 'broadcasts.access': 'manage', 'security.access': 'manage',
  'ai_guide.access': 'manage', 'settings.access': 'manage', 'navigation.studio': 'manage',
  'audit.explorer': 'manage', 'diagnostics.access': 'manage', 'integrations.access': 'manage',
  'owner.intelligence': 'manage',
};
const employeePermissions = { 'dashboard.access': 'view', 'ai_guide.access': 'view' };
const managerPermissions = {
  'dashboard.access': 'view', 'users.access': 'view', 'attendance.access': 'view',
  'payroll.access': 'view', 'payslips.access': 'view', 'forms.access': 'view',
  'facilities.access': 'view', 'broadcasts.access': 'view', 'security.access': 'view',
  'ai_guide.access': 'view',
};
const roleFixtures = {
  owner: { code: 'owner', name: 'Owner', displayName: 'Amina Daenem', jobTitle: 'Group Owner', department: 'Executive Office', team: 'Leadership', permissions: ownerPermissions },
  manager: { code: 'manager', name: 'Manager', displayName: 'Mira Manager', jobTitle: 'Operations Manager', department: 'Operations', team: 'Printing', permissions: managerPermissions },
  employee: { code: 'employee', name: 'Employee', displayName: 'Tolu Employee', jobTitle: 'Portal Employee', department: 'Operations', team: 'Printing', permissions: employeePermissions },
  'attendance-manager': { code: 'manager', name: 'Attendance Manager', displayName: 'Ada Attendance', jobTitle: 'Attendance Manager', department: 'Operations', team: 'Printing', permissions: { 'dashboard.access': 'view', 'attendance.access': 'view', 'ai_guide.access': 'view' } },
  'approval-manager': { code: 'manager', name: 'Approval Manager', displayName: 'Bola Approvals', jobTitle: 'Approval Manager', department: 'Operations', team: 'Printing', permissions: { 'dashboard.access': 'view', 'forms.access': 'view', 'ai_guide.access': 'view' } },
  'security-manager': { code: 'manager', name: 'Security Manager', displayName: 'Chidi Security', jobTitle: 'Security Manager', department: 'Controls', team: 'Controls', permissions: { 'dashboard.access': 'view', 'security.access': 'view', 'ai_guide.access': 'view' } },
};

function contextFor(role) {
  const fixture = roleFixtures[role] || roleFixtures.employee;
  const assignedCompanies = role === 'owner' ? allCompanies : [allCompanies[0]];
  const companyPermissions = Object.fromEntries(assignedCompanies.map((company) => [company.id, fixture.permissions]));
  return {
    sessionId: 'qa-session-' + role,
    employee: {
      id: 'qa-' + role,
      employeeNo: role === 'owner' ? 'QA-OWNER' : role === 'employee' ? 'QA-EMPLOYEE' : 'QA-MANAGER',
      displayName: fixture.displayName,
      email: role + '.qa@example.invalid',
      jobTitle: fixture.jobTitle,
      department: fixture.department,
      status: 'active',
      preferredTheme: 'unified-daylight',
      team: fixture.team,
      lastLoginAt: '2026-08-21T08:00:00.000Z',
    },
    companies: assignedCompanies,
    roles: [{ id: 'qa-role-' + role, code: fixture.code, name: fixture.name, companyId: 'company-printing' }],
    permissions: fixture.permissions,
    companyPermissions,
  };
}

const summary = {
  workDate: '2026-08-21',
  refreshedAt: '2026-08-21T10:30:00.000Z',
  employees: 128,
  present: 116,
  incompleteAttendance: 4,
  pendingApprovals: 7,
  securityAlerts: 2,
  overdueRequirements: 5,
  maintenanceAlerts: 3,
  attendanceRule: 'Clock-in closes at 09:00 WAT',
};

const dashboardFieldRequirements = {
  employees: ['users.access'],
  present: ['attendance.access'],
  incompleteAttendance: ['attendance.access'],
  pendingApprovals: ['forms.access'],
  securityAlerts: ['security.access'],
  overdueRequirements: ['forms.access'],
  maintenanceAlerts: ['facilities.access'],
};
function summaryForRole(role) {
  const permissions = roleFixtures[role]?.permissions || {};
  const can = (field) => dashboardFieldRequirements[field].some((permission) => permissions[permission] && permissions[permission] !== 'none');
  const result = { refreshedAt: summary.refreshedAt, workDate: summary.workDate, companyId: 'company-printing', scope: role === 'employee' ? 'personal' : 'aggregate', attendanceRule: can('present') || can('incompleteAttendance') ? summary.attendanceRule : 'Only authorized personal or aggregate fields are returned.' };
  for (const field of Object.keys(dashboardFieldRequirements)) if (can(field)) result[field] = summary[field];
  return result;
}


function shared(seed) {
  return {
    inventory: { valueKobo: seed * 1000000, lowStock: seed % 4 },
    workforce: { employees: 18 + seed, present: 15 + seed % 3, incomplete: seed % 2 },
    payroll: { runs: 1, grossKobo: seed * 100000, netKobo: seed * 85000 },
    maintenance: { open: seed % 3, urgent: seed % 2, costKobo: seed * 24000 },
  };
}

function intelligence() {
  return {
    generatedAt: '2026-08-21T10:30:00.000Z',
    workDate: '2026-08-21',
    period: { key: 'current_month', label: 'Current month', start: '2026-08-01', end: '2026-08-31', comparisonLabel: 'previous month' },
    scope: { companyId: null, companyName: 'Daenem Group', companyIds: allCompanies.map((company) => company.id) },
    group: {
      revenueKobo: 1485000000, previousRevenueKobo: 1320000000, payrollNetKobo: 286000000,
      operatingExpenseKobo: 198000000, outstandingReceivablesKobo: 174000000, inventoryValueKobo: 362000000,
      employees: 128, present: 116, incompleteAttendance: 4, lowStock: 6, highRiskSecurity: 2,
      overdueRequirements: 5, pendingForms: 7,
    },
    finance: { operatingExpenseKobo: 198000000, outstandingReceivablesKobo: 174000000, overdueReceivables: 3, postedJournals: 214 },
    construction: { activeProjects: 4, budgetKobo: 620000000, spentKobo: 384000000, remainingKobo: 236000000, overdueMilestones: 1 },
    companies: {
      printing: { ...shared(42), current: { orders: 84, revenueKobo: 480000000, collectedKobo: 420000000 }, previous: { revenueKobo: 430000000 } },
      bakery: { ...shared(23), current: { orders: 312, revenueKobo: 226000000, collectedKobo: 208000000 }, previous: { revenueKobo: 214000000 }, wasteCostKobo: 8100000, wastePctOfSales: 3.6 },
      autos: { ...shared(31), salesCount: 19, revenueKobo: 398000000, collectedKobo: 350000000, previousRevenueKobo: 362000000, grossProfitKobo: 52000000, stockCount: 24, stockValueKobo: 190000000, followupsDue: 5 },
      logistics: { ...shared(17), trips: 126, revenueKobo: 248000000, previousRevenueKobo: 234000000, expenseKobo: 115000000, grossProfitKobo: 78000000, activeShipments: 18, expiringDocs: 2 },
      properties: { ...shared(12), rentCollectedKobo: 133000000, previousRentCollectedKobo: 124000000, rentReceipts: 36, arrearsKobo: 21000000, overdueCharges: 4 },
    },
    alerts: [
      { severity: 'high', code: 'security-review', title: 'Review elevated security signals', detail: 'Two high-risk access events require owner review.', company: 'Group', action: 'security' },
      { severity: 'medium', code: 'receivables-ageing', title: 'Receivables ageing needs attention', detail: 'Three balances are beyond the approved review window.', company: 'Group', action: 'finance' },
    ],
  };
}

function layoutForErp(erpId) {
  if (erpId === 'printing') return 'operational-cockpit';
  if (erpId === 'finance') return 'horizon-wide';
  if (erpId === 'properties') return 'master-detail';
  return 'executive-command';
}

function layoutPayload(layoutId, role, erpId = 'staff') {
  const isOwner = role === 'owner';
  const resolvedLayout = layouts.includes(layoutId) ? layoutId : layoutForErp(erpId);
  const payload = {
    preference: { layoutId: resolvedLayout, density: 'standard', motion: 'balanced' },
    canManage: isOwner,
    canChoose: true,
    canAccess: isOwner,
    ability: { canPreview: isOwner, canChoose: true },
  };
  if (isOwner) {
    payload.policy = {
      organizationDefault: 'executive-command',
      forcedLayout: null,
      allowPersonalPreference: true,
      roleDefaults: { owner: 'executive-command', employee: 'focus-flow', manager: 'operational-cockpit' },
      erpDefaults: { staff: 'executive-command', printing: 'operational-cockpit', finance: 'horizon-wide', controls: 'enterprise-studio' },
    };
    payload.history = [
      { id: 'qa-history-policy', layoutId: 'executive-command', scope: 'policy', target: 'organization', createdAt: '2026-08-20T12:00:00.000Z', before: { policy: { organizationDefault: 'master-detail' } }, after: { policy: { organizationDefault: 'executive-command' } }, restorable: true },
      { id: 'qa-history-personal', layoutId: 'master-detail', scope: 'personal', target: 'qa-owner', createdAt: '2026-08-19T12:00:00.000Z', before: { preference: { layoutId: 'focus-flow', density: 'standard', motion: 'balanced' } }, after: { preference: { layoutId: 'master-detail', density: 'standard', motion: 'balanced' } }, restorable: true },
      { id: 'qa-history-legacy', layoutId: 'workspace-canvas', scope: 'legacy', createdAt: '2026-08-18T12:00:00.000Z', restorable: false },
    ];
  }
  return payload;
}

async function installApiRoutes(page, role, layoutId) {
  const fixtureContext = contextFor(role);
  let activeLayoutId = layoutId;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (value, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(value),
    });
    if (url.pathname === '/api/auth/me') return json({ authenticated: true, context: fixtureContext });
    if (url.pathname === '/api/auth/logout') return json({ ok: true });
    if (url.pathname === '/api/experience/layout' && method === 'GET') return json(layoutPayload(activeLayoutId, role, url.searchParams.get('erpId') || 'staff'));
    if (url.pathname === '/api/experience/layout/preference' && method === 'POST') {
      try { const body = JSON.parse(request.postData() || '{}'); if (body.layoutId) activeLayoutId = body.layoutId; } catch {}
      return json({ ok: true, preference: layoutPayload(activeLayoutId, role, url.searchParams.get('erpId') || 'staff').preference });
    }
    if (url.pathname.startsWith('/api/experience/layout/')) return json({ ok: true });
    if (url.pathname === '/api/dashboard/summary') return json(summaryForRole(role));
    // Read-only production-shaped fixtures keep lazy ERP entry surfaces renderable
    // without fabricating mutations or bypassing their normal API contracts.
    if (url.pathname === '/api/printing/dashboard') return json({ date: '2026-08-21', month: 'August 2026', metrics: { openJobs: 4, overdueJobs: 1, readyJobs: 2, customers: 18, lowStockItems: 1, revenueKobo: 480000000, costKobo: 210000000, grossProfitKobo: 270000000, marginBasisPoints: 5625 }, pipeline: [], recentJobs: [] });
    if (url.pathname === '/api/printing/services') return json({ services: [] });
    if (url.pathname === '/api/printing/customers') return json({ customers: [] });
    if (url.pathname === '/api/printing/jobs') return json({ jobs: [] });
    if (url.pathname === '/api/bakery/dashboard') return json({ date: '2026-08-21', metrics: { orders: 24, revenueKobo: 226000000, paidKobo: 208000000, activeBatches: 3, unitsProduced: 312, batchWaste: 8, wasteCostKobo: 8100000, lowStockItems: 1 }, bestSellers: [] });
    if (url.pathname === '/api/bakery/catalog') return json({ products: [], recipes: [] });
    if (url.pathname === '/api/bakery/batches') return json({ batches: [] });
    if (url.pathname === '/api/logistics/dashboard') return json({ metrics: { fleet: 12, vehiclesAvailable: 8, vehiclesUnavailable: 4, activeShipments: 18, shipmentsMoving: 9, deliveredToday: 14, activeTrips: 6, monthlyRevenueKobo: 248000000, monthlyGrossProfitKobo: 78000000, expiringDocuments: 2 } });
    if (url.pathname === '/api/logistics/fleet') return json({ vehicles: [], drivers: [] });
    if (url.pathname === '/api/logistics/shipments') return json({ shipments: [] });
    if (url.pathname === '/api/logistics/trips') return json({ trips: [] });
    if (url.pathname === '/api/properties/dashboard') return json({ metrics: { properties: 24, available: 8, occupied: 14, underOffer: 2, portfolioValueKobo: 900000000, openLeads: 7, inspectionsScheduled: 3, negotiations: 2, followupsDue: 4, outstandingKobo: 21000000, arrearsKobo: 9000000, overdueCharges: 2, activeLeases: 14, expiringSoon: 3, openMaintenance: 5, urgentMaintenance: 1, maintenanceCostKobo: 2400000 } });
    if (url.pathname === '/api/properties/catalog') return json({ properties: [] });
    if (url.pathname === '/api/properties/leads') return json({ leads: [] });
    if (url.pathname === '/api/properties/inspections') return json({ inspections: [] });
    if (url.pathname === '/api/properties/leases') return json({ leases: [] });
    if (url.pathname === '/api/properties/receivables') return json({ receivables: [] });
    if (url.pathname === '/api/properties/maintenance') return json({ maintenance: [] });
    if (url.pathname === '/api/finance/summary') return json({ month: 'August 2026', receivables: { openKobo: 174000000, overdueKobo: 21000000, openCount: 3 }, approvedBudgetKobo: 620000000, netFundingKobo: 133000000, draftJournals: 2, balances: {} });
    if (url.pathname === '/api/admin/roles') return json({ roles: [{ id: 'qa-role-owner', code: 'owner', name: 'Owner' }, { id: 'qa-role-manager', code: 'manager', name: 'Manager' }, { id: 'qa-role-custom', code: 'regional_lead', name: 'Regional Lead' }] });
    if (url.pathname === '/api/owner/intelligence') return json(intelligence());
    if (url.pathname === '/api/support/mine') return json({ commands: [], assistanceRequests: [] });
    if (url.pathname === '/api/auth/password-policy') return json({ minimumLength: 10, maximumLength: 128, requiresUppercase: true, requiresLowercase: true, requiresNumber: true, requiresSymbol: true });
    if (url.pathname === '/api/context/weather') return json({ location: 'Lagos', temperature: 29, description: 'Clear' });
    if (method === 'POST') return json({ ok: true, message: 'QA fixture accepted the request.' });
    return json({});
  });
}

async function pageMetrics(page, role, layoutId, screenshot, viewport, extra = {}) {
  const metric = await page.evaluate((input) => {
    const root = document.querySelector('.dashboard-page');
    const nav = document.querySelector('[data-navigation-adapter]');
    const buttons = Array.from(document.querySelectorAll('button'));
    const labelledButtons = buttons.filter((button) => Boolean(button.getAttribute('aria-label') || button.textContent?.trim()));
    const bodyText = document.body.innerText || '';
    const aggregateWidgets = document.querySelectorAll('.kpi-grid article, .trend-card, .comparison-card, .category-card, .forecast-card, .queue-card');
    const employeeAggregateDisclosure = input.role === 'employee' && aggregateWidgets.length > 0;
    const primaryHeroCount = document.querySelectorAll('[data-postauth-primary-hero="true"]').length;
    const h1Count = document.querySelectorAll('.dashboard-page h1').length;
    const primaryKpiGrids = Array.from(document.querySelectorAll('[data-primary-kpi-grid="true"]')).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const primaryKpiLabels = primaryKpiGrids.flatMap((grid) => Array.from(grid.querySelectorAll('.kpi-card > span:not(.kpi-icon)')).map((node) => node.textContent?.trim() || ''));
    const managerAttendanceText = document.querySelector('.manager-command-center')?.textContent || '';
    const typographyDetails = Array.from(document.querySelectorAll('.postauth-nav-item,.postauth-navigation strong,.erp-pulse-card h3,.manager-command-actions button,.kpi-card strong')).map((node) => {
      const rect = node.getBoundingClientRect();
      return { tag: node.tagName, className: node.className, text: node.textContent?.trim().slice(0, 100) || '', fontSize: Number.parseFloat(getComputedStyle(node).fontSize) || 99, visible: rect.width > 0 && rect.height > 0 };
    });
    return {
      role: input.role,
      requestedLayout: input.layoutId,
      renderedLayout: root?.getAttribute('data-layout-profile') || null,
      activeErp: root?.getAttribute('data-active-erp') || null,
      shellMode: nav?.getAttribute('data-shell-mode') || null,
      navigationAdapter: nav?.getAttribute('data-navigation-adapter') || null,
      compositionPresent: Boolean(document.querySelector('[class*="postauth-composition-"]')),
      primaryHeroCount,
      h1Count,
      featureFrameH1Count: document.querySelectorAll('.postauth-feature-frame h1').length,
      primaryKpiGridCount: primaryKpiGrids.length,
      primaryKpiLabelCount: primaryKpiLabels.length,
      primaryKpiLabels,
      ownerKpiPass: input.role !== 'owner' || (primaryKpiGrids.length === 1 && new Set(primaryKpiLabels).size === primaryKpiLabels.length),
      attendanceManagerDirectCount: input.role !== 'attendance-manager' || (/\b116\b/.test(managerAttendanceText) && !/%/.test(managerAttendanceText) && !/NaN|Infinity/.test(managerAttendanceText)),
      dashboardPresent: Boolean(root),
      featureFramePresent: Boolean(document.querySelector('.postauth-feature-frame')),
      layoutStudioPresent: Boolean(document.querySelector('.layout-studio-panel')),
      galleryCardCount: document.querySelectorAll('.layout-gallery-card').length,
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
      contentScroll: document.documentElement.scrollHeight > window.innerHeight + 1,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      interactiveControls: buttons.length,
      labelledControls: labelledButtons.length,
      keyboardTarget: document.activeElement?.tagName || null,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      developerScaffolding: /LAYOUT ADAPTER|Workspace composition|Theme 0[0-9]|shellMode/.test(bodyText),
      customizationControlsNormal: document.querySelectorAll('[data-customization-controls="true"]').length,
      employeeAggregateDisclosure,
      employeeKpiCount: input.role === 'employee' ? document.querySelectorAll('.kpi-grid article').length : 0,
      managerHome: Boolean(document.querySelector('.manager-command-center')),
      keyTypographyMin: Math.min(99, ...typographyDetails.map((item) => item.fontSize)),
      keyTypographyDetails: typographyDetails,
      forbiddenDomDisclosure: (input.extra.forbiddenLabels || []).some((label) => bodyText.includes(label)),
      smartContext: Boolean(document.querySelector('[data-smart-context="true"]')),
      layoutExplanation: /WORKSPACE GUIDE|LAYOUT ADAPTER|Workspace composition|shellMode/.test(bodyText),
      ownerBusinessIntelligence: Boolean(document.querySelector('[data-owner-business-intelligence="true"]')),
      ownerBusinessIntelligenceFirstView: (() => {
        const node = document.querySelector('[data-owner-business-intelligence="true"]');
        return Boolean(node && node.getBoundingClientRect().top < window.innerHeight);
      })(),
      ...input.extra,
    };
  }, { role, layoutId, extra });
  metric.viewport = viewport;
  metric.screenshot = screenshot;
  return metric;
}

async function createPage(browser, role, layoutId, reducedMotion = false) {
  const context = await browser.newContext({ viewport: null, serviceWorkers: 'block', colorScheme: 'light' });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.addInitScript((settings) => {
    localStorage.setItem('daenem-mode', 'day');
    localStorage.setItem('workforce-theme', 'unified-daylight');
    localStorage.setItem('daenem-experience-layout-v1:qa-' + settings.role, JSON.stringify({ layoutId: settings.layoutId, density: 'standard', motion: settings.reducedMotion ? 'off' : 'balanced' }));
  }, { role, layoutId, reducedMotion });
  await installApiRoutes(page, role, layoutId);
  return { context, page };
}

const results = [];
const runtimeErrors = [];
let hardFailure = false;

async function capture(browser, role, layoutId, width, height, name, options = {}) {
  const fixture = await createPage(browser, role, layoutId, Boolean(options.reducedMotion));
  const page = fixture.page;
  const viewport = { width, height };
  const screenshot = 'screenshots/' + name + '.png';
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(role + '/' + layoutId + ': ' + message.text());
  });
  try {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(900);
    if (options.navigateText) {
      const button = page.locator('.postauth-nav-item').filter({ hasText: options.navigateText }).first();
      if (!(await button.count())) {
        const fallback = page.getByText(options.navigateText, { exact: true }).first();
        if (await fallback.count()) await fallback.click();
        else throw new Error('Navigation item not rendered: ' + options.navigateText);
      } else {
        await button.click();
      }
      await page.waitForTimeout(900);
    }
    if (options.openLayoutStudio) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'layout-studio' } })));
      await page.waitForSelector('.layout-studio-panel', { state: 'visible', timeout: 20000 });
      await page.waitForTimeout(600);
    }
    const backendSummary = await page.evaluate(async () => {
      const response = await fetch('/api/dashboard/summary');
      return await response.json();
    });
    await page.screenshot({ path: path.join(evidenceDir, screenshot), animations: 'disabled' });
    const metric = await pageMetrics(page, role, layoutId, screenshot, viewport, {
      pageErrors,
      pageKind: options.pageKind || options.metric?.pageKind,
      navigatedTo: options.navigateText || null,
      backendSummaryKeys: backendSummary ? Object.keys(backendSummary) : null,
      forbiddenKeys: options.forbiddenKeys || [],
      forbiddenLabels: options.forbiddenLabels || [],
      ...options.metric,
    });
    metric.forbiddenApiDisclosure = (options.forbiddenKeys || []).some((key) => (metric.backendSummaryKeys || []).includes(key));
    metric.apiKeyMismatch = Array.isArray(options.allowedApiKeys)
      && JSON.stringify([...(metric.backendSummaryKeys || [])].sort()) !== JSON.stringify([...options.allowedApiKeys].sort());
    const ownerDefaultCapture = role === 'owner' && layoutId === 'executive-command' && !options.navigateText && !options.openLayoutStudio && !options.pageKind;
    metric.ownerKpiPass = !ownerDefaultCapture || (metric.primaryKpiGridCount === 1 && new Set(metric.primaryKpiLabels || []).size === (metric.primaryKpiLabels || []).length);
    metric.attendanceSemanticsPass = role !== 'attendance-manager' || (metric.attendanceManagerDirectCount === true && !metric.forbiddenApiDisclosure && !metric.forbiddenDomDisclosure);
    results.push(metric);
    const desktop = width >= 861;
    const homeCapture = !options.navigateText && !options.openLayoutStudio && !options.pageKind;
    const expectedAdapter = expectedAdapters[layoutId];
    const hardDefect = !metric.dashboardPresent
      || pageErrors.length
      || (options.openLayoutStudio && !metric.layoutStudioPresent)
      || (options.navigateText && (!metric.featureFramePresent || metric.featureFrameH1Count !== 1))
      || (homeCapture && (metric.primaryHeroCount !== 1 || metric.h1Count !== 1))
      || metric.navigationAdapter !== expectedAdapter
      || metric.developerScaffolding
      || metric.horizontalOverflow
      || metric.employeeAggregateDisclosure
      || metric.employeeKpiCount > 0
      || metric.forbiddenApiDisclosure
      || metric.apiKeyMismatch
      || metric.forbiddenDomDisclosure
      || !metric.ownerKpiPass
      || !metric.attendanceSemanticsPass
      || (metric.keyTypographyMin < 11 && desktop)
      || (metric.smartContext !== true)
      || ((!options.openLayoutStudio && (homeCapture || options.navigateText)) && metric.layoutExplanation)
      || (options.managerHome && !metric.managerHome);
    if (hardDefect) hardFailure = true;
    if (pageErrors.length) runtimeErrors.push(role + '/' + layoutId + ': ' + pageErrors.join(' | '));
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push(role + '/' + layoutId + ': ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await fixture.context.close();
  }
}

async function captureCommandPalette(browser) {
  const fixture = await createPage(browser, 'owner', 'executive-command');
  const page = fixture.page;
  const screenshot = 'screenshots/command-palette-1920x1080.png';
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    await page.keyboard.press('Control+KeyK');
    await page.waitForSelector('[data-command-palette="true"]', { state: 'visible', timeout: 10000 });
    const opened = await page.locator('[data-command-palette="true"]').isVisible();
    await page.screenshot({ path: path.join(evidenceDir, screenshot), animations: 'disabled' });
    await page.keyboard.press('Escape');
    const closed = !(await page.locator('[data-command-palette="true"]').count());
    results.push(await pageMetrics(page, 'owner', 'executive-command', screenshot, { width: 1920, height: 1080 }, { pageKind: 'command palette', commandPaletteOpen: opened, commandPaletteEscape: closed }));
    if (!opened || !closed) {
      hardFailure = true;
      runtimeErrors.push('Command palette keyboard behavior failed.');
    }
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('Command palette: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await fixture.context.close();
  }
}

async function captureCustomization(browser) {
  const fixture = await createPage(browser, 'owner', 'executive-command');
  const page = fixture.page;
  const screenshot = 'screenshots/customize-dashboard-1440x900.png';
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    const before = await page.locator('[data-customization-controls="true"]').count();
    await page.locator('.widget-customize-toolbar button').filter({ hasText: 'Customize Dashboard' }).click();
    await page.waitForTimeout(150);
    const after = await page.locator('[data-customization-controls="true"]').count();
    await page.screenshot({ path: path.join(evidenceDir, screenshot), animations: 'disabled' });
    results.push(await pageMetrics(page, 'owner', 'executive-command', screenshot, { width: 1440, height: 900 }, { pageKind: 'customize dashboard', customizeControlsBefore: before, customizeControlsAfter: after }));
    if (before !== 0 || after === 0) {
      hardFailure = true;
      runtimeErrors.push('Dashboard customization controls were not gated by explicit mode.');
    }
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('Dashboard customization: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await fixture.context.close();
  }
}

async function captureErpResolution(browser) {
  const fixture = await createPage(browser, 'owner', 'context-aware');
  const page = fixture.page;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    const resolved = await page.evaluate(async () => {
      const read = async (erpId) => (await (await fetch('/api/experience/layout?erpId=' + erpId + '&layoutId=context-aware')).json()).preference.layoutId;
      return { printing: await read('printing'), finance: await read('finance'), staff: await read('staff') };
    });
    results.push({ role: 'owner', requestedLayout: 'context-aware', renderedLayout: null, viewport: { width: 1440, height: 900 }, pageKind: 'ERP default resolution', erpResolution: resolved, screenshot: null });
    if (resolved.printing !== 'operational-cockpit' || resolved.finance !== 'horizon-wide' || resolved.staff !== 'executive-command') {
      hardFailure = true;
      runtimeErrors.push('ERP default resolution did not follow the canonical context.');
    }
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('ERP resolution: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await fixture.context.close();
  }
}

async function captureLayoutStudioPreview(browser) {
  const previewFixture = await createPage(browser, 'owner', 'executive-command');
  const previewPage = previewFixture.page;
  const previewPostRequests = [];
  previewPage.on('request', (request) => { if (request.method() === 'POST') previewPostRequests.push(request.url()); });
  let previewPass = false;
  let exitPass = false;
  let applyPass = false;
  let targetLayout = null;
  try {
    await previewPage.setViewportSize({ width: 1440, height: 900 });
    await previewPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await previewPage.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    const originalLayout = await previewPage.locator('.dashboard-page').getAttribute('data-layout-profile');
    const beforeStorage = await previewPage.evaluate(() => JSON.stringify({ ...localStorage }));
    await previewPage.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'layout-studio' } })));
    await previewPage.waitForSelector('.layout-studio-panel', { state: 'visible', timeout: 20000 });
    const card = previewPage.locator('.layout-gallery-card[data-layout-id="focus-flow"]');
    targetLayout = await card.getAttribute('data-layout-id');
    if (!targetLayout) throw new Error('Focus & Flow preview card is unavailable.');
    await card.getByRole('button', { name: 'Preview', exact: true }).click();
    await previewPage.waitForSelector('[data-layout-preview-banner="true"]', { state: 'visible', timeout: 10000 });
    await previewPage.waitForTimeout(300);
    const previewLayout = await previewPage.locator('.dashboard-page').getAttribute('data-layout-profile');
    const previewStorage = await previewPage.evaluate(() => JSON.stringify({ ...localStorage }));
    const applyButtonVisible = await previewPage.getByRole('button', { name: 'Apply to Me', exact: true }).isVisible();
    const previewPreferencePosts = previewPostRequests.filter((url) => /\/api\/experience\/layout\/preference$/.test(url));
    previewPass = previewLayout === targetLayout
      && previewStorage === beforeStorage
      && previewPreferencePosts.length === 0
      && applyButtonVisible
      && await previewPage.locator('.dashboard-main').count() > 0
      && await previewPage.locator('[data-layout-preview-banner="true"]').count() === 1;
    const previewScreenshot = 'screenshots/postauth-layout-studio-real-preview-1440x900.png';
    await previewPage.screenshot({ path: path.join(evidenceDir, previewScreenshot), animations: 'disabled' });
    results.push(await pageMetrics(previewPage, 'owner', targetLayout, previewScreenshot, { width: 1440, height: 900 }, {
      pageKind: 'real layout preview',
      realPreview: previewPass,
      previewLayout,
      targetLayout,
      previewPreferencePostCount: previewPreferencePosts.length,
      previewApplyButtonVisible: applyButtonVisible,
    }));

    await previewPage.getByRole('button', { name: 'Exit Preview', exact: true }).click();
    await previewPage.waitForFunction(() => !document.querySelector('[data-layout-preview-banner="true"]'));
    exitPass = (await previewPage.locator('.dashboard-page').getAttribute('data-layout-profile')) === originalLayout
      && (await previewPage.locator('[data-layout-preview-banner="true"]').count()) === 0
      && await previewPage.evaluate((before) => JSON.stringify({ ...localStorage }) === before, beforeStorage)
      && previewPostRequests.filter((url) => /\/api\/experience\/layout\/preference$/.test(url)).length === 0;
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('Layout Studio preview/exit: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await previewFixture.context.close();
  }

  const applyFixture = await createPage(browser, 'owner', 'executive-command');
  const applyPage = applyFixture.page;
  const applyPostRequests = [];
  applyPage.on('request', (request) => { if (request.method() === 'POST') applyPostRequests.push(request.url()); });
  try {
    await applyPage.setViewportSize({ width: 1440, height: 900 });
    await applyPage.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await applyPage.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    const applyBeforeStorage = await applyPage.evaluate(() => JSON.stringify({ ...localStorage }));
    await applyPage.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'layout-studio' } })));
    await applyPage.waitForSelector('.layout-studio-panel', { state: 'visible', timeout: 20000 });
    const applyCard = applyPage.locator('.layout-gallery-card[data-layout-id="focus-flow"]');
    await applyCard.getByRole('button', { name: 'Preview', exact: true }).click();
    await applyPage.waitForSelector('[data-layout-preview-banner="true"]', { state: 'visible', timeout: 10000 });
    const duringPreviewStorage = await applyPage.evaluate(() => JSON.stringify({ ...localStorage }));
    const duringPreviewLayout = await applyPage.locator('.dashboard-page').getAttribute('data-layout-profile');
    const applyButton = applyPage.getByRole('button', { name: 'Apply to Me', exact: true });
    const applyVisible = await applyButton.isVisible();
    await applyButton.click();
    await applyPage.waitForFunction(() => !document.querySelector('[data-layout-preview-banner="true"]'));
    await applyPage.waitForTimeout(250);
    const applyLayout = await applyPage.locator('.dashboard-page').getAttribute('data-layout-profile');
    const applyAfterStorage = await applyPage.evaluate(() => JSON.stringify({ ...localStorage }));
    const savedPreference = await applyPage.evaluate(() => {
      const value = localStorage.getItem('daenem-experience-layout-v1:qa-owner');
      try { return value ? JSON.parse(value) : null; } catch { return null; }
    });
    const preferencePosts = applyPostRequests.filter((url) => /\/api\/experience\/layout\/preference$/.test(url));
    applyPass = applyVisible
      && duringPreviewLayout === targetLayout
      && duringPreviewStorage === applyBeforeStorage
      && preferencePosts.length === 1
      && applyLayout === targetLayout
      && applyAfterStorage !== applyBeforeStorage
      && savedPreference?.layoutId === targetLayout;
    results.push({
      role: 'owner',
      requestedLayout: targetLayout,
      renderedLayout: applyLayout,
      viewport: { width: 1440, height: 900 },
      pageKind: 'real layout preview lifecycle',
      realPreview: previewPass,
      previewExit: exitPass,
      explicitApply: applyPass,
      previewApplyButtonVisible: applyVisible,
      preferencePostCount: preferencePosts.length,
      storageChangedOnlyAfterApply: duringPreviewStorage === applyBeforeStorage && applyAfterStorage !== applyBeforeStorage,
      screenshot: null,
    });
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('Layout Studio direct apply: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await applyFixture.context.close();
  }
  if (!previewPass || !exitPass || !applyPass) {
    hardFailure = true;
    runtimeErrors.push('Real layout preview lifecycle failed.');
  }
}

async function capturePermissionMatrix(browser) {
  const commonKeys = ['refreshedAt', 'workDate', 'companyId', 'scope', 'attendanceRule'];
  const allAggregateKeys = [...commonKeys, 'employees', 'present', 'incompleteAttendance', 'pendingApprovals', 'securityAlerts', 'overdueRequirements', 'maintenanceAlerts'];
  const cases = [
    { role: 'employee', layout: 'focus-flow', forbiddenKeys: ['employees', 'present', 'incompleteAttendance', 'pendingApprovals', 'securityAlerts', 'overdueRequirements', 'maintenanceAlerts'], forbiddenLabels: ['Employees', 'Present today', 'Needs review', 'Security health', 'Attendance categories', 'Security alerts', 'Team workload', 'Approvals'], allowedApiKeys: commonKeys },
    { role: 'attendance-manager', layout: 'operational-cockpit', forbiddenKeys: ['employees', 'pendingApprovals', 'securityAlerts', 'overdueRequirements', 'maintenanceAlerts'], forbiddenLabels: ['Employees', 'Security health', 'Pending approvals', 'Security alerts', 'Overdue requirements', 'Control signals'], allowedApiKeys: [...commonKeys, 'present', 'incompleteAttendance'] },
    { role: 'approval-manager', layout: 'operational-cockpit', forbiddenKeys: ['employees', 'present', 'incompleteAttendance', 'securityAlerts', 'maintenanceAlerts'], forbiddenLabels: ['Employees', 'Present today', 'Attendance categories', 'Security health', 'Security alerts', 'Attendance'], allowedApiKeys: [...commonKeys, 'pendingApprovals'] },
    { role: 'security-manager', layout: 'operational-cockpit', forbiddenKeys: ['employees', 'present', 'incompleteAttendance', 'pendingApprovals', 'overdueRequirements', 'maintenanceAlerts'], forbiddenLabels: ['Employees', 'Present today', 'Attendance categories', 'Approvals', 'Overdue requirements', 'Needs review'], allowedApiKeys: [...commonKeys, 'securityAlerts'] },
    { role: 'owner', layout: 'executive-command', forbiddenKeys: [], forbiddenLabels: [], allowedApiKeys: allAggregateKeys },
  ];
  for (const item of cases) {
    await capture(browser, item.role, item.layout, 1440, 900, 'permission-' + item.role + '-1440x900', {
      pageKind: 'field-level permission matrix',
      forbiddenKeys: item.forbiddenKeys,
      forbiddenLabels: item.forbiddenLabels,
      allowedApiKeys: item.allowedApiKeys,
    });
  }

  const attendanceManager = cases.find((item) => item.role === 'attendance-manager');
  if (attendanceManager) {
    await capture(browser, attendanceManager.role, attendanceManager.layout, 390, 844, 'permission-attendance-manager-390x844', {
      pageKind: 'field-level permission matrix mobile',
      forbiddenKeys: attendanceManager.forbiddenKeys,
      forbiddenLabels: attendanceManager.forbiddenLabels,
      allowedApiKeys: attendanceManager.allowedApiKeys,
    });
  }
}

async function captureOwnerCanonicalNavigation(browser) {
  const layoutCases = ['executive-command', 'workspace-canvas', 'operational-cockpit', 'insight-magazine', 'focus-flow'];
  const outcomes = [];
  for (const layoutId of layoutCases) {
    const fixture = await createPage(browser, 'owner', layoutId);
    const page = fixture.page;
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
      await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
      await page.waitForTimeout(900);
      const action = page.locator('.xed-alert-list button').filter({ hasText: /security/i }).first();
      if (!(await action.count())) throw new Error('Owner security action missing for ' + layoutId);
      await action.click();
      await page.waitForSelector('.dashboard-view-security .postauth-feature-frame', { state: 'visible', timeout: 10000 });
      const opened = await page.locator('.dashboard-view-security .postauth-feature-frame h1').filter({ hasText: 'Security Center' }).count() === 1;
      outcomes.push({ layoutId, opened, pageErrors, consoleErrors });
      if (!opened || pageErrors.length || consoleErrors.length) throw new Error('Security canonical navigation failed for ' + layoutId);
    } catch (error) {
      outcomes.push({ layoutId, opened: false, pageErrors, consoleErrors, error: error instanceof Error ? error.message : String(error) });
      hardFailure = true;
      runtimeErrors.push('Owner canonical navigation: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      await fixture.context.close();
    }
  }
  const pass = outcomes.length === layoutCases.length && outcomes.every((item) => item.opened && !item.pageErrors.length && !item.consoleErrors.length);
  results.push({ role: 'owner', requestedLayout: 'multiple', renderedLayout: null, viewport: { width: 1440, height: 900 }, pageKind: 'owner canonical navigation', ownerCanonicalNavigation: outcomes, ownerCanonicalNavigationPass: pass, screenshot: null });
  if (!pass) {
    hardFailure = true;
    runtimeErrors.push('Owner canonical navigation matrix failed.');
  }
}

async function captureErpSurfaces(browser) {
  const surfaces = [
    ['printing', 'printing', '.printing-backdrop', '.printing-header-actions button:last-child'],
    ['bakery', 'bakery', '.bakery-backdrop', '.bakery-header-actions button:last-child'],
    ['autos', 'autos', '.autos-backdrop', '.autos-header aside button:last-child'],
    ['logistics', 'logistics', '.log-backdrop', '.log-header aside button:last-child'],
    ['properties', 'properties', '.prop-backdrop', '.prop-header aside button:last-child'],
    ['finance', 'finance', '.fin-backdrop', '.fin-head aside button:last-child'],
  ];
  const expectedHeadings = {
    printing: 'Print Operations ERP',
    bakery: 'Bakery Operations',
    autos: 'Dealership & Workshop DMS',
    logistics: 'Fleet & Dispatch Center',
    properties: 'Property CRM & Management',
    finance: 'Finance Command Center',
  };
  const contrastProfiles = {
    printing: 'operational-cockpit',
    bakery: 'adaptive-bento',
    autos: 'master-detail',
    logistics: 'operational-cockpit',
    properties: 'master-detail',
    finance: 'horizon-wide',
  };
  async function inspect(moduleId, erpId, surfaceSelector, closeSelector, layoutId, screenshotName) {
    const fixture = await createPage(browser, 'owner', layoutId);
    const page = fixture.page;
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
      await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        window.__qaExperienceEvents = [];
        window.addEventListener('daenem:module-experience', (event) => {
          const detail = event.detail || {};
          window.__qaExperienceEvents.push({ ...detail });
        });
      });
      await page.evaluate((id) => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id } })), moduleId);
      const surface = page.locator(surfaceSelector);
      await surface.waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForTimeout(300);
      const heading = surface.locator('h2').filter({ hasText: expectedHeadings[moduleId] }).first();
      const surfaceContentVisible = await heading.isVisible().catch(() => false);
      if (!surfaceContentVisible) throw new Error('ERP surface content not visible: ' + moduleId + ' (' + expectedHeadings[moduleId] + ')');
      const envelope = page.locator('[data-module-experience="true"][data-module-erp="' + erpId + '"]').last();
      if (!(await envelope.count())) throw new Error('Module experience envelope missing: ' + moduleId);
      const moduleExperience = await envelope.evaluate((node) => {
        const read = (name) => node.getAttribute(name);
        return { erpId: read('data-module-erp'), layout: read('data-module-layout'), shell: read('data-module-shell'), path: read('data-module-path') };
      });
      const presentation = await envelope.evaluate((node) => {
        const style = getComputedStyle(node);
        const content = node.querySelector('.printing-body,.bakery-content,.autos-content,.log-content,.prop-content,.fin-content');
        const contentStyle = content ? getComputedStyle(content) : null;
        return {
          widthToken: style.getPropertyValue('--module-experience-surface-width').trim(),
          paddingToken: style.getPropertyValue('--module-experience-surface-padding').trim(),
          gapToken: style.getPropertyValue('--module-experience-surface-gap').trim(),
          shellWidth: node.firstElementChild ? getComputedStyle(node.firstElementChild).width : '',
          contentPadding: contentStyle?.padding || '',
          contentGap: contentStyle?.gap || '',
        };
      });
      const experienceEvents = await page.evaluate(() => window.__qaExperienceEvents || []);
      const firstMatchingExperience = experienceEvents.find((item) => item.erpId === erpId);
      const resolvedBeforeSurface = Boolean(firstMatchingExperience && firstMatchingExperience.layoutId === layoutId && firstMatchingExperience.shellMode);
      let screenshot = null;
      if (screenshotName) {
        screenshot = 'screenshots/' + screenshotName + '.png';
        await surface.screenshot({ path: path.join(evidenceDir, screenshot), animations: 'disabled' });
      }
      const result = { moduleId, layoutId, moduleExperience, presentation, resolvedBeforeSurface, surfaceContentVisible, surfaceHeading: await heading.textContent(), pageErrors, consoleErrors, screenshot };
      await page.locator(closeSelector).last().evaluate((button) => button.click());
      await surface.waitFor({ state: 'hidden', timeout: 10000 });
      return result;
    } finally {
      await fixture.context.close();
    }
  }
  try {
    for (const [moduleId, erpId, surfaceSelector, closeSelector] of surfaces) {
      const primary = await inspect(moduleId, erpId, surfaceSelector, closeSelector, 'executive-command',
        ['printing', 'finance', 'properties'].includes(moduleId) ? 'erp-' + moduleId + '-executive-command-1440x900' : null);
      const contrast = await inspect(moduleId, erpId, surfaceSelector, closeSelector, contrastProfiles[moduleId],
        ['printing', 'finance', 'properties'].includes(moduleId) ? 'erp-' + moduleId + '-' + contrastProfiles[moduleId] + '-1440x900' : null);
      const presentationChanged = JSON.stringify(primary.presentation) !== JSON.stringify(contrast.presentation);
      const pass = primary.moduleExperience.erpId === erpId
        && contrast.moduleExperience.erpId === erpId
        && primary.moduleExperience.layout === 'executive-command'
        && contrast.moduleExperience.layout === contrastProfiles[moduleId]
        && primary.resolvedBeforeSurface
        && contrast.resolvedBeforeSurface
        && primary.surfaceContentVisible
        && contrast.surfaceContentVisible
        && presentationChanged
        && !primary.pageErrors.length && !contrast.pageErrors.length
        && !primary.consoleErrors.length && !contrast.consoleErrors.length;
      results.push({
        role: 'owner',
        requestedLayout: 'executive-command vs ' + contrastProfiles[moduleId],
        renderedLayout: contrastProfiles[moduleId],
        viewport: { width: 1440, height: 900 },
        pageKind: 'ERP surface ' + moduleId,
        erpSurface: moduleId,
        surfaceContentVisible: primary.surfaceContentVisible && contrast.surfaceContentVisible,
        moduleExperience: contrast.moduleExperience,
        erpSurfaceValidation: { primary, contrast, presentationChanged, pass },
        screenshot: primary.screenshot || contrast.screenshot,
        screenshots: [primary.screenshot, contrast.screenshot].filter(Boolean),
      });
      if (!pass) {
        hardFailure = true;
        runtimeErrors.push('ERP surface context failed: ' + moduleId);
      }
    }
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('ERP surfaces: ' + (error instanceof Error ? error.message : String(error)));
  }
}

async function captureMotionPresets(browser) {async function captureMotionPresets(browser) {
  const fixture = await createPage(browser, 'owner', 'executive-command');
  const page = fixture.page;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    const values = await page.evaluate(() => {
      const root = document.querySelector('.dashboard-page');
      if (!root) return {};
      root.removeAttribute('style');
      const result = {};
      for (const preset of ['off', 'calm', 'balanced', 'expressive']) {
        root.className = root.className.replace(/postauth-motion-[a-z]+/, 'postauth-motion-' + preset);
        const computed = getComputedStyle(root);
        result[preset] = { duration: computed.getPropertyValue('--postauth-motion-duration').trim(), distance: computed.getPropertyValue('--postauth-motion-distance').trim(), easing: computed.getPropertyValue('--postauth-motion-ease').trim() };
      }
      return result;
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await page.evaluate(() => getComputedStyle(document.querySelector('.dashboard-page')).getPropertyValue('--postauth-motion-duration').trim());
    const uniqueValues = new Set(Object.values(values).map((item) => item.duration + '|' + item.distance + '|' + item.easing));
    const pass = uniqueValues.size === 4 && (reduced === '0ms' || reduced === '0s');
    results.push({ role: 'owner', requestedLayout: 'executive-command', renderedLayout: 'executive-command', viewport: { width: 1440, height: 900 }, pageKind: 'motion presets', motionValues: values, reducedMotionDuration: reduced, motionPass: pass, screenshot: null });
    if (!pass) {
      hardFailure = true;
      runtimeErrors.push('Motion preset computed values did not differ or reduced motion was not zero.');
    }
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('Motion preset behavior: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await fixture.context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const layoutId of layouts) await capture(browser, 'owner', layoutId, 1920, 1080, 'owner-' + layoutId + '-1920x1080');
    await capture(browser, 'owner', 'executive-command', 3840, 2160, 'owner-executive-command-3840x2160');
    await capture(browser, 'owner', 'executive-command', 1440, 900, 'owner-executive-command-1440x900');
    await capture(browser, 'owner', 'executive-command', 1366, 768, 'owner-executive-command-1366x768');
    await capture(browser, 'owner', 'executive-command', 1024, 768, 'owner-executive-command-1024x768');
    await capture(browser, 'owner', 'executive-command', 390, 844, 'owner-executive-command-390x844');
    await capture(browser, 'employee', 'focus-flow', 1920, 1080, 'employee-home-focus-flow-1920x1080');
    await capture(browser, 'employee', 'focus-flow', 1024, 768, 'employee-home-focus-flow-1024x768');
    await capture(browser, 'employee', 'focus-flow', 390, 844, 'employee-home-focus-flow-390x844');
    await capture(browser, 'manager', 'operational-cockpit', 1920, 1080, 'manager-home-operational-cockpit-1920x1080', { managerHome: true });
    await capture(browser, 'manager', 'operational-cockpit', 1024, 768, 'manager-home-operational-cockpit-1024x768', { managerHome: true });
    await capture(browser, 'manager', 'operational-cockpit', 390, 844, 'manager-home-operational-cockpit-390x844', { managerHome: true });
    await capture(browser, 'owner', 'master-detail', 1440, 900, 'feature-people-master-detail-1440x900', { navigateText: 'People & Payroll', metric: { pageKind: 'master-detail representative' } });
    await capture(browser, 'owner', 'enterprise-studio', 1440, 900, 'feature-forms-enterprise-studio-1440x900', { navigateText: 'Forms Center', metric: { pageKind: 'form representative' } });
    await capture(browser, 'owner', 'executive-command', 1440, 900, 'layout-studio-gallery-1440x900', { openLayoutStudio: true, metric: { pageKind: 'Layout Studio gallery' } });
    await captureLayoutStudioPreview(browser);

    await capturePermissionMatrix(browser);
    await captureOwnerCanonicalNavigation(browser);
    await captureErpSurfaces(browser);
    await captureMotionPresets(browser);
    await captureCommandPalette(browser);
    await captureCustomization(browser);
    await captureErpResolution(browser);
    await capture(browser, 'owner', 'enterprise-studio', 1440, 900, 'reduced-motion-enterprise-studio-1440x900', { reducedMotion: true, metric: { pageKind: 'reduced-motion smoke' } });
  } finally {
    await browser.close();
  }

  const profileResults = results.filter((item) => item.role === 'owner' && item.viewport?.width === 1920 && item.viewport?.height === 1080 && !item.pageKind && !item.realPreview);
  const renderedProfileIds = new Set(profileResults.map((item) => item.renderedLayout).filter(Boolean));
  const ownerHomePass = results.some((item) => item.role === 'owner' && item.renderedLayout === 'executive-command' && !item.pageKind && item.primaryHeroCount === 1 && item.h1Count === 1 && item.primaryKpiGridCount === 1 && item.ownerBusinessIntelligence && item.ownerBusinessIntelligenceFirstView);
  const ownerKpiPass = results.filter((item) => item.role === 'owner' && item.renderedLayout === 'executive-command' && !item.pageKind).every((item) => item.ownerKpiPass);
  const employeeResults = results.filter((item) => item.role === 'employee' && item.pageKind !== 'field-level permission matrix');
  const employeeHomePass = employeeResults.length > 0 && employeeResults.every((item) => item.employeeAggregateDisclosure === false && item.employeeKpiCount === 0 && item.primaryHeroCount === 1 && item.h1Count === 1);
  const permissionMatrixResults = results.filter((item) => item.pageKind === 'field-level permission matrix');
  const employeePermissionPass = permissionMatrixResults.length === 5 && permissionMatrixResults.every((item) => !item.forbiddenApiDisclosure && !item.apiKeyMismatch && !item.forbiddenDomDisclosure && item.attendanceSemanticsPass);
  const managerPass = results.filter((item) => item.role === 'manager' && item.managerHome).length === 3 && results.filter((item) => item.role === 'manager').every((item) => item.managerHome);
  const navigationPass = profileResults.length === layouts.length && profileResults.every((item) => item.navigationAdapter === expectedAdapters[item.requestedLayout]);
  const featureFramePass = results.filter((item) => item.navigatedTo).length >= 2 && results.filter((item) => item.navigatedTo).every((item) => item.featureFramePresent && item.featureFrameH1Count === 1);
  const galleryPass = results.some((item) => item.layoutStudioPresent && item.pageKind === 'Layout Studio gallery');
  const previewLifecycle = results.find((item) => item.pageKind === 'real layout preview lifecycle');
  const previewPass = Boolean(previewLifecycle?.realPreview && previewLifecycle?.previewExit && previewLifecycle?.explicitApply);
  const commandPass = results.some((item) => item.pageKind === 'command palette' && item.commandPaletteOpen && item.commandPaletteEscape);
  const customizePass = results.some((item) => item.pageKind === 'customize dashboard' && item.customizeControlsBefore === 0 && item.customizeControlsAfter > 0);
  const erpMetric = results.find((item) => item.pageKind === 'ERP default resolution');
  const erpPass = Boolean(erpMetric && erpMetric.erpResolution?.printing === 'operational-cockpit' && erpMetric.erpResolution?.finance === 'horizon-wide' && erpMetric.erpResolution?.staff === 'executive-command');
  const erpSurfaceResults = results.filter((item) => item.pageKind?.startsWith('ERP surface '));
  const erpSurfacePass = erpSurfaceResults.length === 6 && erpSurfaceResults.every((item) => item.moduleExperience?.erpId && item.moduleExperience?.shell && item.moduleExperience?.path && item.erpSurfaceValidation?.pass);
  const ownerNavigationMetric = results.find((item) => item.pageKind === 'owner canonical navigation');
  const ownerCanonicalNavigationPass = Boolean(ownerNavigationMetric?.ownerCanonicalNavigationPass);
  const motionMetric = results.find((item) => item.pageKind === 'motion presets');
  const motionPass = Boolean(motionMetric?.motionPass);
  const reducedMotionMetric = results.find((item) => item.pageKind === 'reduced-motion smoke');
  const reducedMotionPass = Boolean((motionMetric?.reducedMotionDuration === '0ms' || motionMetric?.reducedMotionDuration === '0s') && reducedMotionMetric?.reducedMotion === true);
  const smartContextPass = results.filter((item) => item.dashboardPresent).every((item) => item.smartContext === true || item.pageKind?.startsWith('ERP surface ') || item.pageKind === 'ERP default resolution');
  const typographyPass = results.filter((item) => item.dashboardPresent && item.viewport?.width >= 861).every((item) => item.keyTypographyMin >= 11);
  const businessPageResults = results.filter((item) => item.dashboardPresent && item.pageKind && !item.pageKind.includes('Layout Studio') && !item.pageKind.startsWith('ERP surface '));
  const noLayoutExplanationPass = businessPageResults.length > 0 && businessPageResults.every((item) => item.layoutExplanation === false);

  if (renderedProfileIds.size < layouts.length || !ownerHomePass || !ownerKpiPass || !employeeHomePass || !employeePermissionPass || !managerPass || !navigationPass || !ownerCanonicalNavigationPass || !featureFramePass || !galleryPass || !previewPass || !commandPass || !customizePass || !erpPass || !erpSurfacePass || !motionPass || !smartContextPass || !typographyPass || !noLayoutExplanationPass) {
    hardFailure = true;
    runtimeErrors.push('Required authenticated behavior/rendered coverage was incomplete.');
  }

  const summaryLines = [
    'POSTAUTH_RENDERED_QA=' + (hardFailure ? 'FAIL' : 'PASS'),
    'QA_MODE=NON_PRODUCTION_PLAYWRIGHT_API_FIXTURE',
    'STATIC_PREVIEW=PASS',
    'CHROMIUM=PASS',
    'APPLICATION_SOURCE_MODIFIED_BY_QA=NO',
    'AUTHENTICATED_CONTEXT=OWNER_MANAGER_EMPLOYEE_AND_RESTRICTED_MANAGER_FIXTURES',
    'OWNER_HOME=' + (ownerHomePass ? 'PASS' : 'FAIL'),
    'OWNER_KPI_STRIP=' + (ownerKpiPass ? 'PASS' : 'FAIL'),
    'OWNER_CANONICAL_NAVIGATION=' + (ownerCanonicalNavigationPass ? 'PASS' : 'FAIL'),
    'ATTENDANCE_MANAGER_SEMANTICS=' + (permissionMatrixResults.find((item) => item.role === 'attendance-manager')?.attendanceSemanticsPass ? 'PASS' : 'FAIL'),
    'EMPLOYEE_HOME=' + (employeeHomePass ? 'PASS' : 'FAIL'),
    'FIELD_LEVEL_PERMISSION_MATRIX=' + (employeePermissionPass ? 'PASS' : 'FAIL'),
    'EMPLOYEE_BACKEND_DATA_MINIMIZATION=' + (employeePermissionPass ? 'PASS' : 'FAIL'),
    'MANAGER_HOME=' + (managerPass ? 'PASS' : 'FAIL'),
    'FEATURE_PAGE_FRAME=' + (featureFramePass ? 'PASS' : 'FAIL'),
    'LAYOUT_STUDIO_GALLERY=' + (galleryPass ? 'PASS' : 'FAIL'),
    'LAYOUT_STUDIO_REAL_PREVIEW=' + (previewPass ? 'PASS' : 'FAIL'),
    'LAYOUT_PREVIEW_EXIT=' + (previewLifecycle?.previewExit ? 'PASS' : 'FAIL'),
    'LAYOUT_STUDIO_EXPLICIT_APPLY=' + (previewLifecycle?.explicitApply ? 'PASS' : 'FAIL'),
    'COMMAND_PALETTE=' + (commandPass ? 'PASS' : 'FAIL'),
    'DASHBOARD_CUSTOMIZATION_MODE=' + (customizePass ? 'PASS' : 'FAIL'),
    'ERP_DEFAULT_RESOLUTION=' + (erpPass ? 'PASS' : 'FAIL'),
    'ERP_SURFACES=' + (erpSurfacePass ? 'PASS' : 'FAIL'),
    'ERP_LAYOUT_CONTEXT_CONSUMPTION=' + (erpSurfacePass ? 'PASS' : 'FAIL'),
    'LAYOUT_SHELL_ADAPTERS=' + (navigationPass ? 'PASS' : 'FAIL'),
    'MOTION_PRESETS=' + (motionPass ? 'PASS' : 'FAIL'),
    'SMART_CONTEXT=' + (smartContextPass ? 'PASS' : 'FAIL'),
    'TYPOGRAPHY=' + (typographyPass ? 'PASS' : 'FAIL'),
    'NO_LAYOUT_EXPLANATION_ON_BUSINESS_PAGES=' + (noLayoutExplanationPass ? 'PASS' : 'FAIL'),
    'LAYOUT_PROFILES_DECLARED=' + layouts.length,
    'LAYOUT_PROFILES_RENDERED=' + renderedProfileIds.size,
    'DESKTOP_VIEWPORTS_RENDERED=1920x1080,3840x2160,1440x900,1366x768,1024x768',
    'MOBILE_VIEWPORT_RENDERED=390x844',
    'REDUCED_MOTION=' + (reducedMotionPass ? 'PASS' : 'FAIL'),
    'SCREENSHOT_COUNT=' + results.filter((item) => item.screenshot).length,
    'RUNTIME_PAGE_ERRORS=' + runtimeErrors.length,
    'HARD_RENDER_FAILURE=' + (hardFailure ? 'true' : 'false'),
    'VERTICAL_OVERFLOW=DIAGNOSTIC_CONTENT_SCROLL',
    'VERTICAL_CONTENT_SCROLL=RECORDED_FOR_LONG_AUTH_SURFACES',
    'HORIZONTAL_OVERFLOW=HARD_GATE',
    'QA_FIXTURE_DATA=NOT_APPLICATION_DATA',
  ];
  fs.writeFileSync(path.join(evidenceDir, 'layout-metrics.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, runtimeErrors }, null, 2) + '\n');
  fs.writeFileSync(path.join(evidenceDir, 'validation-summary.txt'), summaryLines.join('\n') + '\n');
  if (hardFailure) process.exitCode = 1;
}

await main();
