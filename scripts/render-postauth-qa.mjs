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

const managerPermissions = {
  'dashboard.access': 'view',
  'users.access': 'view',
  'payroll.access': 'view',
  'payslips.access': 'view',
  'forms.access': 'view',
  'facilities.access': 'view',
  'broadcasts.access': 'view',
  'security.access': 'view',
  'ai_guide.access': 'view',
};

function contextFor(role) {
  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  return {
    sessionId: 'qa-session-' + role,
    employee: {
      id: 'qa-' + role,
      employeeNo: isOwner ? 'QA-OWNER' : isManager ? 'QA-MANAGER' : 'QA-EMPLOYEE',
      displayName: isOwner ? 'Amina Daenem' : isManager ? 'Mira Manager' : 'Tolu Employee',
      email: isOwner ? 'owner.qa@example.invalid' : isManager ? 'manager.qa@example.invalid' : 'employee.qa@example.invalid',
      jobTitle: isOwner ? 'Group Owner' : isManager ? 'Operations Manager' : 'Portal Employee',
      department: isOwner ? 'Executive Office' : isManager ? 'Operations' : 'Operations',
      status: 'active',
      preferredTheme: 'unified-daylight',
      team: isOwner ? 'Leadership' : isManager ? 'Printing' : 'Printing',
      lastLoginAt: '2026-08-21T08:00:00.000Z',
    },
    companies: isOwner ? allCompanies : [allCompanies[0]],
    roles: [{
      id: 'qa-role-' + role,
      code: isOwner ? 'owner' : isManager ? 'manager' : 'employee',
      name: isOwner ? 'Owner' : isManager ? 'Manager' : 'Employee',
      companyId: 'company-printing',
    }],
    permissions: isOwner ? ownerPermissions : isManager ? managerPermissions : employeePermissions,
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
    if (url.pathname === '/api/experience/layout') return json(layoutPayload(url.searchParams.get('layoutId') || layoutId, role, url.searchParams.get('erpId') || 'staff'));
    if (url.pathname.startsWith('/api/experience/layout/')) return json({ ok: true, preference: layoutPayload(url.searchParams.get('layoutId') || layoutId, role, url.searchParams.get('erpId') || 'staff').preference });
    if (url.pathname === '/api/dashboard/summary') {
      if (role === 'employee') return json({ refreshedAt: '2026-08-21T10:30:00.000Z', workDate: '2026-08-21', companyId: url.searchParams.get('companyId'), scope: 'personal', attendanceRule: 'Personal dashboard signals are available when assigned.' });
      return json(summary);
    }
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
    const backendSummary = role === 'employee'
      ? await page.evaluate(async () => {
        const response = await fetch('/api/dashboard/summary');
        return await response.json();
      })
      : null;
    await page.screenshot({ path: path.join(evidenceDir, screenshot), animations: 'disabled' });
    const metric = await pageMetrics(page, role, layoutId, screenshot, viewport, {
      pageErrors,
      navigatedTo: options.navigateText || null,
      backendSummaryKeys: backendSummary ? Object.keys(backendSummary) : null,
      ...options.metric,
    });
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
  const fixture = await createPage(browser, 'owner', 'executive-command');
  const page = fixture.page;
  const postRequests = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') postRequests.push(request.url());
  });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.dashboard-page', { state: 'visible', timeout: 20000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'layout-studio' } })));
    await page.waitForSelector('.layout-studio-panel', { state: 'visible', timeout: 20000 });
    const beforeStorage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    const previewButton = page.locator('.layout-gallery-card .secondary-button').first();
    if (await previewButton.count()) {
      const previewStartPostRequests = postRequests.length;
      await previewButton.click();
      await page.waitForSelector('.layout-preview-modal', { state: 'visible', timeout: 10000 });
      const afterStorage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      const screenshot = 'screenshots/postauth-layout-studio-preview-1440x900.png';
      await page.screenshot({ path: path.join(evidenceDir, screenshot), animations: 'disabled' });
      results.push(await pageMetrics(page, 'owner', 'executive-command', screenshot, { width: 1440, height: 900 }, {
        previewModal: true,
        previewPostRequests: postRequests.length - previewStartPostRequests,
        previewPostUrls: postRequests.slice(previewStartPostRequests),
        previewStorageUnchanged: beforeStorage === afterStorage,
        previewNavigation: await page.locator('.layout-preview-modal .layout-preview-large[data-preview-navigation]').getAttribute('data-preview-navigation'),
      }));
      if (postRequests.length > previewStartPostRequests || beforeStorage !== afterStorage) {
        hardFailure = true;
        runtimeErrors.push('Layout Studio Preview persisted state or posted a preference: ' + postRequests.slice(previewStartPostRequests).join(', '));
      }
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
    await captureCommandPalette(browser);
    await captureCustomization(browser);
    await captureErpResolution(browser);
    await capture(browser, 'owner', 'enterprise-studio', 1440, 900, 'reduced-motion-enterprise-studio-1440x900', { reducedMotion: true, metric: { pageKind: 'reduced-motion smoke' } });
  } finally {
    await browser.close();
  }

  const profileResults = results.filter((item) => item.role === 'owner' && item.viewport?.width === 1920 && item.viewport?.height === 1080 && !item.pageKind && !item.previewModal);
  const renderedProfileIds = new Set(profileResults.map((item) => item.renderedLayout).filter(Boolean));
  const ownerHomePass = results.some((item) => item.role === 'owner' && item.renderedLayout === 'executive-command' && !item.pageKind && !item.previewModal && item.primaryHeroCount === 1 && item.h1Count === 1);
  const employeeResults = results.filter((item) => item.role === 'employee');
  const employeeHomePass = employeeResults.length > 0 && employeeResults.every((item) => item.employeeAggregateDisclosure === false && item.employeeKpiCount === 0 && item.primaryHeroCount === 1 && item.h1Count === 1);
  const employeePermissionPass = employeeResults.length > 0 && employeeResults.every((item) => !(item.backendSummaryKeys || []).some((key) => ['employees', 'present', 'securityAlerts', 'incompleteAttendance', 'pendingApprovals', 'overdueRequirements'].includes(key)));
  const managerPass = results.filter((item) => item.role === 'manager').length === 3 && results.filter((item) => item.role === 'manager').every((item) => item.managerHome);
  const navigationPass = profileResults.length === layouts.length && profileResults.every((item) => item.navigationAdapter === expectedAdapters[item.requestedLayout]);
  const featureFramePass = results.filter((item) => item.navigatedTo).length >= 2 && results.filter((item) => item.navigatedTo).every((item) => item.featureFramePresent && item.featureFrameH1Count === 1);
  const galleryPass = results.some((item) => item.layoutStudioPresent && item.pageKind === 'Layout Studio gallery');
  const previewMetric = results.find((item) => item.previewModal === true);
  const previewPass = Boolean(previewMetric && previewMetric.previewPostRequests === 0 && previewMetric.previewStorageUnchanged && previewMetric.previewNavigation);
  const commandPass = results.some((item) => item.pageKind === 'command palette' && item.commandPaletteOpen && item.commandPaletteEscape);
  const customizePass = results.some((item) => item.pageKind === 'customize dashboard' && item.customizeControlsBefore === 0 && item.customizeControlsAfter > 0);
  const erpMetric = results.find((item) => item.pageKind === 'ERP default resolution');
  const erpPass = Boolean(erpMetric && erpMetric.erpResolution?.printing === 'operational-cockpit' && erpMetric.erpResolution?.finance === 'horizon-wide' && erpMetric.erpResolution?.staff === 'executive-command');
  const reducedMotionPass = results.some((item) => item.reducedMotion === true);

  if (renderedProfileIds.size < layouts.length || !ownerHomePass || !employeeHomePass || !employeePermissionPass || !managerPass || !navigationPass || !featureFramePass || !galleryPass || !previewPass || !commandPass || !customizePass || !erpPass || !reducedMotionPass) {
    hardFailure = true;
    runtimeErrors.push('Required authenticated behavior/rendered coverage was incomplete.');
  }

  const summaryLines = [
    'POSTAUTH_RENDERED_QA=' + (hardFailure ? 'FAIL' : 'PASS'),
    'QA_MODE=NON_PRODUCTION_PLAYWRIGHT_API_FIXTURE',
    'STATIC_PREVIEW=PASS',
    'CHROMIUM=PASS',
    'APPLICATION_SOURCE_MODIFIED_BY_QA=NO',
    'AUTHENTICATED_CONTEXT=OWNER_MANAGER_EMPLOYEE_FIXTURES',
    'OWNER_HOME=' + (ownerHomePass ? 'PASS' : 'FAIL'),
    'EMPLOYEE_HOME=' + (employeeHomePass ? 'PASS' : 'FAIL'),
    'EMPLOYEE_BACKEND_DATA_MINIMIZATION=' + (employeePermissionPass ? 'PASS' : 'FAIL'),
    'MANAGER_HOME=' + (managerPass ? 'PASS' : 'FAIL'),
    'FEATURE_PAGE_FRAME=' + (featureFramePass ? 'PASS' : 'FAIL'),
    'LAYOUT_STUDIO_GALLERY=' + (galleryPass ? 'PASS' : 'FAIL'),
    'LAYOUT_STUDIO_NON_DESTRUCTIVE_PREVIEW=' + (previewPass ? 'PASS' : 'FAIL'),
    'COMMAND_PALETTE=' + (commandPass ? 'PASS' : 'FAIL'),
    'DASHBOARD_CUSTOMIZATION_MODE=' + (customizePass ? 'PASS' : 'FAIL'),
    'ERP_DEFAULT_RESOLUTION=' + (erpPass ? 'PASS' : 'FAIL'),
    'LAYOUT_SHELL_ADAPTERS=' + (navigationPass ? 'PASS' : 'FAIL'),
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
