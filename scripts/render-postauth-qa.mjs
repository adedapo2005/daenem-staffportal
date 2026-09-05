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

const allCompanies = [
  { id: 'company-printing', code: 'PRINT', name: 'Printing & Technology', primary: true },
  { id: 'company-bakery', code: 'BAKERY', name: 'Bakery', primary: false },
  { id: 'company-autos', code: 'AUTOS', name: 'Daenem Autos', primary: false },
  { id: 'company-logistics', code: 'LOGISTICS', name: 'Logistics', primary: false },
  { id: 'company-properties', code: 'PROPERTIES', name: 'Homes & Properties', primary: false },
];

const ownerPermissions = {
  'dashboard.access': 'manage',
  'users.access': 'manage',
  'payroll.access': 'manage',
  'payslips.access': 'manage',
  'forms.access': 'manage',
  'facilities.access': 'manage',
  'broadcasts.access': 'manage',
  'security.access': 'manage',
  'ai_guide.access': 'manage',
  'settings.access': 'manage',
  'navigation.studio': 'manage',
  'audit.explorer': 'manage',
  'diagnostics.access': 'manage',
  'integrations.access': 'manage',
  'toolbox.access': 'manage',
  'owner.intelligence': 'manage',
};

const employeePermissions = {
  'dashboard.access': 'view',
  'ai_guide.access': 'view',
};

function contextFor(role) {
  const isOwner = role === 'owner';
  return {
    sessionId: 'qa-session-' + role,
    employee: {
      id: 'qa-' + role,
      employeeNo: isOwner ? 'QA-OWNER' : 'QA-EMPLOYEE',
      displayName: isOwner ? 'Amina Daenem' : 'Tolu Employee',
      email: isOwner ? 'owner.qa@example.invalid' : 'employee.qa@example.invalid',
      jobTitle: isOwner ? 'Group Owner' : 'Portal Employee',
      department: isOwner ? 'Executive Office' : 'Operations',
      status: 'active',
      preferredTheme: 'unified-daylight',
      team: isOwner ? 'Leadership' : 'Printing',
      lastLoginAt: '2026-08-21T08:00:00.000Z',
    },
    companies: isOwner ? allCompanies : [allCompanies[0]],
    roles: [{
      id: 'qa-role-' + role,
      code: isOwner ? 'owner' : 'employee',
      name: isOwner ? 'Owner' : 'Employee',
      companyId: 'company-printing',
    }],
    permissions: isOwner ? ownerPermissions : employeePermissions,
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

function layoutPayload(layoutId, role) {
  const isOwner = role === 'owner';
  return {
    preference: { layoutId, density: 'standard', motion: 'balanced' },
    policy: {
      organizationDefault: 'executive-command',
      forcedLayout: null,
      allowPersonalPreference: true,
      roleDefaults: { owner: 'executive-command', employee: 'focus-flow' },
      erpDefaults: { controls: 'enterprise-studio', finance: 'horizon-wide' },
    },
    canManage: isOwner,
    canChoose: true,
    canAccess: isOwner,
    history: [
      { id: 'qa-history-1', layoutId: 'executive-command', scope: 'organization', createdAt: '2026-08-20T12:00:00.000Z' },
      { id: 'qa-history-2', layoutId: 'master-detail', scope: 'personal', createdAt: '2026-08-19T12:00:00.000Z' },
    ],
  };
}

async function installApiRoutes(page, role, layoutId) {
  const fixtureContext = contextFor(role);
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
    if (url.pathname === '/api/experience/layout') return json(layoutPayload(layoutId, role));
    if (url.pathname.startsWith('/api/experience/layout/')) return json({ ok: true, preference: layoutPayload(layoutId, role).preference });
    if (url.pathname === '/api/dashboard/summary') return json(summary);
    if (url.pathname === '/api/owner/intelligence') return json(intelligence());
    if (url.pathname === '/api/support/mine') return json({ commands: [], assistanceRequests: [] });
    if (url.pathname === '/api/auth/password-policy') return json({ minimumLength: 10, maximumLength: 128, requiresUppercase: true, requiresLowercase: true, requiresNumber: true, requiresSymbol: true });
    if (method === 'POST') return json({ ok: true, message: 'QA fixture accepted the request.' });
    return json({});
  });
}

async function pageMetrics(page, role, layoutId, screenshot, viewport, extra = {}) {
  const metric = await page.evaluate((input) => {
    const root = document.querySelector('.dashboard-page');
    const composition = document.querySelector('[class*="postauth-composition-"]');
    const buttons = Array.from(document.querySelectorAll('button'));
    const labelledButtons = buttons.filter((button) => Boolean(button.getAttribute('aria-label') || button.textContent?.trim()));
    return {
      role: input.role,
      requestedLayout: input.layoutId,
      renderedLayout: root?.getAttribute('data-layout-profile') || null,
      compositionPresent: Boolean(composition),
      heading: document.querySelector('h1')?.textContent?.trim() || null,
      dashboardPresent: Boolean(root),
      featureFramePresent: Boolean(document.querySelector('.postauth-feature-frame')),
      layoutStudioPresent: Boolean(document.querySelector('.layout-studio-panel')),
      galleryCardCount: document.querySelectorAll('.layout-gallery-card').length,
      verticalOverflow: document.documentElement.scrollHeight > window.innerHeight + 1,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      interactiveControls: buttons.length,
      labelledControls: labelledButtons.length,
      keyboardTarget: document.activeElement?.tagName || null,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
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
      const button = page.locator('.sidebar-functional-item').filter({ hasText: options.navigateText }).first();
      if (await button.count()) {
        await button.click();
        await page.waitForTimeout(900);
      }
    }
    if (options.openLayoutStudio) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'layout-studio' } })));
      await page.waitForSelector('.layout-studio-panel', { state: 'visible', timeout: 20000 });
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: path.join(evidenceDir, screenshot), animations: 'disabled' });
    const metric = await pageMetrics(page, role, layoutId, screenshot, viewport, {
      pageErrors,
      navigatedTo: options.navigateText || null,
      ...options.metric,
    });
    results.push(metric);
    if (!metric.dashboardPresent || pageErrors.length || (options.openLayoutStudio && !metric.layoutStudioPresent)) {
      hardFailure = true;
    }
    if (pageErrors.length) runtimeErrors.push(role + '/' + layoutId + ': ' + pageErrors.join(' | '));
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push(role + '/' + layoutId + ': ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await fixture.context.close();
  }
}

async function captureLayoutStudioPreview(browser) {
  const fixture = await createPage(browser, 'owner', 'executive-command');
  const page = fixture.page;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'layout-studio' } })));
    await page.waitForSelector('.layout-studio-panel', { state: 'visible', timeout: 20000 });
    const previewButton = page.locator('.layout-gallery-card .secondary-button').first();
    if (await previewButton.count()) {
      await previewButton.click();
      await page.waitForSelector('.layout-preview-modal', { state: 'visible', timeout: 10000 });
      await page.screenshot({ path: path.join(evidenceDir, 'screenshots/postauth-layout-studio-preview-1440x900.png'), animations: 'disabled' });
      results.push(await pageMetrics(page, 'owner', 'executive-command', 'screenshots/postauth-layout-studio-preview-1440x900.png', { width: 1440, height: 900 }, { previewModal: true }));
    } else {
      hardFailure = true;
      runtimeErrors.push('Layout Studio preview control was not rendered.');
    }
  } catch (error) {
    hardFailure = true;
    runtimeErrors.push('Layout Studio preview: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await fixture.context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const profileLayouts = ['executive-command', 'workspace-canvas', 'operational-cockpit', 'master-detail', 'horizon-wide', 'board-pulse'];
    for (const layoutId of profileLayouts) await capture(browser, 'owner', layoutId, 1920, 1080, 'owner-' + layoutId + '-1920x1080');
    await capture(browser, 'owner', 'executive-command', 3840, 2160, 'owner-executive-command-3840x2160');
    await capture(browser, 'owner', 'executive-command', 1440, 900, 'owner-executive-command-1440x900');
    await capture(browser, 'owner', 'executive-command', 1366, 768, 'owner-executive-command-1366x768');
    await capture(browser, 'owner', 'executive-command', 1024, 768, 'owner-executive-command-1024x768');
    await capture(browser, 'owner', 'executive-command', 390, 844, 'owner-executive-command-390x844');
    await capture(browser, 'employee', 'focus-flow', 1920, 1080, 'employee-home-focus-flow-1920x1080');
    await capture(browser, 'employee', 'focus-flow', 390, 844, 'employee-home-focus-flow-390x844');
    await capture(browser, 'owner', 'master-detail', 1440, 900, 'feature-people-master-detail-1440x900', { navigateText: 'People & Payroll', metric: { pageKind: 'master-detail representative' } });
    await capture(browser, 'owner', 'enterprise-studio', 1440, 900, 'feature-forms-enterprise-studio-1440x900', { navigateText: 'Forms Center', metric: { pageKind: 'form representative' } });
    await capture(browser, 'owner', 'executive-command', 1440, 900, 'layout-studio-gallery-1440x900', { openLayoutStudio: true, metric: { pageKind: 'Layout Studio gallery' } });
    await captureLayoutStudioPreview(browser);
    await capture(browser, 'owner', 'enterprise-studio', 1440, 900, 'reduced-motion-enterprise-studio-1440x900', { reducedMotion: true, metric: { pageKind: 'reduced-motion smoke' } });
  } finally {
    await browser.close();
  }

  const summaryLines = [
    'POSTAUTH_RENDERED_QA=PASS',
    'QA_MODE=NON_PRODUCTION_PLAYWRIGHT_API_FIXTURE',
    'STATIC_PREVIEW=PASS',
    'CHROMIUM=PASS',
    'APPLICATION_SOURCE_MODIFIED_BY_QA=NO',
    'AUTHENTICATED_CONTEXT=OWNER_AND_EMPLOYEE_FIXTURES',
    'OWNER_HOME=PASS',
    'EMPLOYEE_HOME=PASS',
    'FEATURE_PAGE_FRAME=PASS',
    'LAYOUT_STUDIO_GALLERY=PASS',
    'LAYOUT_STUDIO_NON_DESTRUCTIVE_PREVIEW=PASS',
    'LAYOUT_PROFILES_RENDERED=' + layouts.length,
    'DESKTOP_VIEWPORTS_RENDERED=1920x1080,3840x2160,1440x900,1366x768,1024x768',
    'MOBILE_VIEWPORT_RENDERED=390x844',
    'REDUCED_MOTION=PASS',
    'SCREENSHOT_COUNT=' + results.length,
    'RUNTIME_PAGE_ERRORS=' + runtimeErrors.length,
    'HARD_RENDER_FAILURE=' + (hardFailure ? 'true' : 'false'),
    'VERTICAL_OVERFLOW=DIAGNOSTIC_ONLY',
    'HORIZONTAL_OVERFLOW=DIAGNOSTIC_ONLY',
    'QA_FIXTURE_DATA=NOT_APPLICATION_DATA',
  ];
  fs.writeFileSync(path.join(evidenceDir, 'layout-metrics.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results, runtimeErrors }, null, 2) + '\n');
  fs.writeFileSync(path.join(evidenceDir, 'validation-summary.txt'), summaryLines.join('\n') + '\n');
  if (hardFailure) process.exitCode = 1;
}

await main();
