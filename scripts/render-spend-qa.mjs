import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const artifactDir = path.join(root, 'qa-artifacts');
const screenshotDir = path.join(artifactDir, 'spend-screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });

const failures = [];
const runtimeErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const companies = [
  { id: 'company-printing', code: 'PRINT', name: 'Printing & Technology', primary: true },
  { id: 'company-bakery', code: 'BAKERY', name: 'Bakery' },
  { id: 'company-autos', code: 'AUTOS', name: 'Daenem Autos' },
  { id: 'company-logistics', code: 'LOGISTICS', name: 'Logistics' },
  { id: 'company-properties', code: 'PROPERTIES', name: 'Homes & Properties' },
  { id: 'company-finance', code: 'FINANCE', name: 'Finance' },
];

const employeePermissions = {
  'dashboard.access': 'view', 'forms.access': 'view', 'ai_guide.access': 'view',
  'expense.requests': 'create', 'expense.own': 'view',
};
const managerPermissions = {
  ...employeePermissions, 'expense.requests': 'view', 'expense.review': 'view', 'expense.approve': 'approve',
};
const ownerPermissions = {
  'dashboard.access': 'manage', 'forms.access': 'manage', 'ai_guide.access': 'manage',
  'expense.requests': 'manage', 'expense.own': 'manage', 'expense.review': 'manage',
  'expense.approve': 'manage', 'expense.post': 'manage', 'expense.master': 'manage',
  'expense.allocations': 'manage', 'expense.intelligence': 'manage', 'owner.intelligence': 'manage',
};

function contextFor(role) {
  const owner = role === 'owner';
  const manager = role === 'manager';
  const permissions = owner ? ownerPermissions : manager ? managerPermissions : employeePermissions;
  const assignedCompanies = owner ? companies : [companies[0]];
  const employeeId = owner ? 'qa-spend-owner' : manager ? 'qa-spend-manager' : 'qa-spend-employee';
  return {
    sessionId: `qa-spend-session-${role}`,
    employee: {
      id: employeeId, employeeNo: owner ? 'QA-OWNER' : manager ? 'QA-MANAGER' : 'QA-EMPLOYEE',
      displayName: owner ? 'Amina Daenem' : manager ? 'Musa Manager' : 'Tolu Employee',
      email: `${employeeId}@example.invalid`, jobTitle: owner ? 'Group Owner' : manager ? 'Department Manager' : 'Portal Employee',
      department: 'Operations', status: 'active', preferredTheme: 'unified-daylight',
      timezone: owner ? 'America/Los_Angeles' : 'Africa/Lagos', team: 'Daenem Group', lastLoginAt: '2026-09-05T08:00:00.000Z',
    },
    companies: assignedCompanies,
    roles: [{ id: `qa-role-${role}`, code: owner ? 'owner' : manager ? 'manager' : 'employee', name: owner ? 'Owner' : manager ? 'Manager' : 'Employee', companyId: owner ? undefined : 'company-printing' }],
    permissions,
    companyPermissions: Object.fromEntries(assignedCompanies.map((company) => [company.id, permissions])),
  };
}

function spendBootstrap(companyId) {
  const company = companies.find((item) => item.id === companyId) || companies[0];
  return {
    company, businessTimezone: 'Africa/Lagos',
    masterData: {
      categories: [
        { id: 'spend-category-office-supplies', name: 'Office supplies', code: 'OFFICE_SUPPLIES', accountingTreatmentId: 'spend-treatment-opex', directSharedPolicy: 'either', evidenceRequired: 1, source: 'system' },
        { id: 'spend-category-fuel-utilities', name: 'Fuel and utilities', code: 'FUEL_UTILITIES', accountingTreatmentId: 'spend-treatment-opex', directSharedPolicy: 'either', evidenceRequired: 1, source: 'system' },
        { id: 'spend-category-construction-projects', name: 'Construction projects', code: 'CONSTRUCTION', accountingTreatmentId: 'spend-treatment-capex', directSharedPolicy: 'either', evidenceRequired: 1, source: 'system' },
      ],
      costCenters: [{ id: `spend-cc-${company.code}-general`, name: 'General', code: 'GENERAL', source: 'system' }, { id: `spend-cc-${company.code}-finance`, name: 'Finance', code: 'FINANCE', source: 'system' }],
      suppliers: [{ id: 'spend-supplier-a', name: 'Supplier A', source: 'admin' }],
      allocationTemplates: [{ id: 'spend-template-generator', name: 'Daenem Complex Generator Fuel', method: 'percentage', active: 1, source: 'admin' }],
      projects: [{ id: 'construction-project-daenem-complex', name: 'Daenem Complex', status: 'active' }],
    },
    permissions: {},
  };
}

const requestRow = {
  id: 'spend-request-qa-001', requestNo: 'EXP-2026-0001', requesterEmployeeId: 'qa-spend-employee', requesterName: 'Tolu Employee', requesterNo: 'QA-EMPLOYEE',
  requesterDepartment: 'Operations', department: 'Operations', branchName: 'Ibadan Operations', companyId: 'company-printing', companyName: 'Printing & Technology',
  categoryId: 'spend-category-fuel-utilities', categoryName: 'Fuel and utilities', supplierName: 'Supplier A', costCenterName: 'General', erpModule: 'finance',
  contextEntityType: 'project', contextEntityId: 'construction-project-daenem-complex', accountingTreatmentName: 'Operating Expense', profitEffect: 'operating',
  totalKobo: 100000000, allocatedAmountKobo: 100000000, directShared: 'shared', status: 'submitted', capturedAt: '2026-09-05T14:19:00.000Z',
  createdAt: '2026-09-05T14:19:30.000Z', updatedAt: '2026-09-05T14:48:18.000Z', evidenceCount: 1,
  allocations: [
    { id: 'alloc-print', companyName: 'Printing & Technology', allocatedAmountKobo: 40000000, costCenterName: 'General' },
    { id: 'alloc-bakery', companyName: 'Bakery', allocatedAmountKobo: 35000000, costCenterName: 'General' },
    { id: 'alloc-logistics', companyName: 'Logistics', allocatedAmountKobo: 15000000, costCenterName: 'General' },
    { id: 'alloc-properties', companyName: 'Homes & Properties', allocatedAmountKobo: 10000000, costCenterName: 'General' },
  ],
  evidence: [{ id: 'evidence-qa-001', originalName: 'generator-invoice.pdf', evidenceType: 'invoice', mimeType: 'application/pdf', sizeBytes: 2048, sha256: 'a'.repeat(64), status: 'uploaded' }],
  auditEvidence: [{ id: 'audit-evidence-qa-001', action: 'evidence_accepted', details: { ipAddress: '203.0.113.10', networkLocation: 'Ibadan, NG', deviceId: 'qa-device-01', sessionId: 'qa-spend-session-owner' }, requestId: 'corr-evidence' }],
  approvals: [{ id: 'approval-qa-001', stepNo: 1, approverRoleCode: 'manager', status: 'pending' }],
  events: [
    { id: 'event-qa-created', action: 'request_created', serverReceivedAt: '2026-09-05T14:19:30.000Z', capturedAt: '2026-09-05T14:19:00.000Z', requestId: 'corr-created' },
    { id: 'event-qa-submitted', action: 'request_submitted', serverReceivedAt: '2026-09-05T14:20:00.000Z', capturedAt: '2026-09-05T14:19:45.000Z', requestId: 'corr-submit' },
    { id: 'event-qa-approved', action: 'request_approved', serverReceivedAt: '2026-09-05T14:48:18.000Z', requestId: 'corr-approve' },
  ],
};

function ownerOverview() {
  return {
    serverTime: '2026-09-05T14:48:18.000Z', businessTimezone: 'Africa/Lagos',
    metrics: {
      requestedKobo: 100000000, approvedKobo: 100000000, committedKobo: 0, paidKobo: 0,
      postedOperatingExpenseKobo: 0, postedCogsKobo: 0, nonPnlPostedKobo: 0, sharedExpenseKobo: 100000000,
      unallocatedSharedExpenseKobo: 0, missingEvidence: 0, pendingApprovals: 1,
    },
    profitability: { available: false, reason: 'Revenue, canonical COGS and canonical payroll sources are not complete enough for a truthful group profit figure.' },
  };
}

function ownerDetail() {
  return {
    serverTime: '2026-09-05T14:48:18.000Z', businessTimezone: 'Africa/Lagos',
    filters: {}, requests: [requestRow],
  };
}

function ownerIntelligence() {
  const shared = { inventory: { valueKobo: 362000000, lowStock: 2 }, workforce: { employees: 24, present: 21, incomplete: 1 }, payroll: { runs: 1, grossKobo: 42000000, netKobo: 38000000 }, maintenance: { open: 2, urgent: 1, costKobo: 800000 } };
  return {
    generatedAt: '2026-09-05T14:48:18.000Z', workDate: '2026-09-05',
    period: { key: 'current_month', label: 'Current month', start: '2026-09-01', end: '2026-09-05', comparisonLabel: 'previous month' },
    scope: { companyId: null, companyName: 'Daenem Group', companyIds: companies.map((company) => company.id) },
    group: { revenueKobo: 1485000000, previousRevenueKobo: 1320000000, payrollNetKobo: 286000000, operatingExpenseKobo: 198000000, outstandingReceivablesKobo: 174000000, inventoryValueKobo: 362000000, employees: 128, present: 116, incompleteAttendance: 4, lowStock: 6, highRiskSecurity: 0, overdueRequirements: 2, pendingForms: 1 },
    finance: { operatingExpenseKobo: 198000000, outstandingReceivablesKobo: 174000000, overdueReceivables: 3, postedJournals: 14 },
    construction: { activeProjects: 1, budgetKobo: 90000000, spentKobo: 32000000, remainingKobo: 58000000, overdueMilestones: 0 },
    companies: {
      printing: { ...shared, current: { orders: 42, revenueKobo: 420000000, collectedKobo: 318000000 }, previous: { revenueKobo: 390000000 } },
      bakery: { ...shared, current: { orders: 1280, revenueKobo: 310000000, collectedKobo: 298000000 }, previous: { revenueKobo: 286000000 }, wasteCostKobo: 1200000, wastePctOfSales: 1.8 },
      autos: { ...shared, salesCount: 7, revenueKobo: 520000000, collectedKobo: 450000000, previousRevenueKobo: 470000000, grossProfitKobo: 72000000, stockCount: 18, stockValueKobo: 240000000, followupsDue: 4 },
      logistics: { ...shared, trips: 64, revenueKobo: 180000000, previousRevenueKobo: 165000000, expenseKobo: 110000000, grossProfitKobo: 70000000, activeShipments: 12, expiringDocs: 1 },
      properties: { ...shared, rentCollectedKobo: 95000000, previousRentCollectedKobo: 88000000, rentReceipts: 31, arrearsKobo: 17000000, overdueCharges: 2 },
    },
    alerts: [],
  };
}

function makeServerState() { return { syncRequests: 0, effects: 0, receipts: new Map() }; }

async function installApiRoutes(page, role, server) {
  const context = contextFor(role);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const send = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(value) });
    if (url.pathname === '/api/auth/me') return send({ authenticated: true, context });
    if (url.pathname === '/api/auth/logout') return send({ ok: true });
    if (url.pathname === '/api/experience/layout') return send({ preference: { layoutId: 'focus-flow', density: 'standard', motion: 'balanced' }, canChoose: true, canManage: false, canAccess: false });
    if (url.pathname.startsWith('/api/experience/layout/')) return send({ ok: true });
    if (url.pathname === '/api/offline/bootstrap') return send({ ok: true, serverTime: '2026-09-05T14:48:18.000Z', businessTimezone: 'Africa/Lagos', maxOfflineAgeMinutes: 720, session: { id: context.sessionId, expiresAt: '2030-09-05T08:00:00.000Z', lastVerifiedAt: '2026-09-05T14:48:18.000Z' }, policy: { enabled: true, maxQueueCount: 50, attachmentMaxBytes: 10485760, automaticSync: true, manualRetry: true, retentionDays: 30, allowedOperations: ['expense.draft.save', 'expense.request.submit'], evidenceSequence: ['draft_ack', 'evidence_ack_hash', 'final_submit'] }, operations: [{ kind: 'expense.draft.save', mode: 'draft-only', permission: 'expense.requests' }, { kind: 'expense.request.submit', mode: 'draft-and-submit', permission: 'expense.requests' }] });
    if (url.pathname === '/api/offline/telemetry') return send({ ok: true, serverReceivedAt: '2026-09-05T14:48:18.000Z', networkLocation: 'Ibadan, NG' });
    if (url.pathname === '/api/support/mine') return send({ commands: [], assistanceRequests: [] });
    if (url.pathname === '/api/offline/sync' && method === 'POST') {
      server.syncRequests += 1;
      let body = {};
      try { body = JSON.parse(request.postData() || '{}'); } catch { return send({ error: 'Invalid sync body' }, 400); }
      const key = String(body.idempotencyKey || request.headers()['idempotency-key'] || '');
      if (server.receipts.has(key)) return send({ ok: true, state: 'synced', receipt: server.receipts.get(key), result: { requestId: body.entityId, status: 'submitted' }, deduplicated: true });
      if (body.kind === 'expense.request.submit') server.effects += 1;
      const receipt = { id: `receipt-${key.slice(-8)}`, operationId: body.operationId, idempotencyKey: key, state: 'completed', serverReceivedAt: '2026-09-05T14:48:18.000Z', completedAt: '2026-09-05T14:48:18.000Z' };
      server.receipts.set(key, receipt);
      return send({ ok: true, state: 'synced', receipt, result: { requestId: body.entityId, status: 'submitted' } });
    }
    if (url.pathname === '/api/spend/bootstrap') return send(spendBootstrap(url.searchParams.get('companyId') || 'company-printing'));
    if (url.pathname === '/api/spend/requests' && method === 'GET') return send({ requests: role === 'employee' ? [{ ...requestRow, status: 'submitted', requesterName: context.employee.displayName }] : [] });
    if (url.pathname === '/api/spend/requests' && method === 'POST') return send({ ok: true, request: { ...requestRow, id: 'queued-expense' } }, 201);
    if (url.pathname.startsWith('/api/spend/requests/') && method === 'GET') return send({ request: { ...requestRow, requesterName: context.employee.displayName } });
    if (url.pathname === '/api/owner/intelligence') return send(ownerIntelligence());
    if (url.pathname === '/api/spend/owner/overview') return role === 'owner' ? send(ownerOverview()) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/spend/owner/detail') return role === 'owner' ? send(ownerDetail()) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/spend/admin/master') return role === 'owner' ? send({
      categories: [{ id: 'spend-category-office-supplies', companyId: 'company-printing', name: 'Office supplies', code: 'OFFICE_SUPPLIES', directSharedPolicy: 'either', source: 'system', active: 1 }],
      costCenters: [{ id: 'spend-cc-PRINT-general', companyId: 'company-printing', code: 'GENERAL', name: 'General operations', source: 'system', active: 1 }],
      suppliers: [{ id: 'spend-supplier-a', companyId: 'company-printing', name: 'Supplier A', source: 'admin', active: 1 }],
      treatments: [{ id: 'spend-treatment-opex', name: 'Operating Expense', profitEffect: 'operating', isPandl: 1, active: 1, source: 'system' }, { id: 'spend-treatment-capex', name: 'Capital Expenditure', profitEffect: 'non_pnl', isPandl: 0, active: 1, source: 'system' }],
      allocationTemplates: [{ id: 'spend-template-generator', companyId: null, name: 'Daenem Complex Generator Fuel', method: 'percentage', active: 1, source: 'system' }],
      approvalRules: [{ id: 'spend-approval-default', companyId: null, approverRoleCode: 'manager', stepNo: 1, requiredPermission: 'expense.approve', minAmountKobo: 0, active: 1 }],
      evidencePolicies: [{ id: 'spend-evidence-default', companyId: null, evidenceType: 'receipt', required: 1, minimumCount: 1, active: 1 }],
      proposals: [{ id: 'proposal-qa-001', kind: 'supplier', proposedName: 'North depot supplier', status: 'proposed' }],
    }) : send({ error: 'Master-data access is required.' }, 403);
    if (url.pathname === '/api/spend/master/proposals') return send({ ok: true, status: 'proposed' }, 201);
    if (url.pathname === '/api/spend/evidence/' || url.pathname.startsWith('/api/spend/evidence/')) return send({ ok: true, status: 'uploaded' }, 201);
    if (url.pathname.startsWith('/api/')) return send(method === 'GET' ? {} : { ok: true });
    return route.continue();
  });
  return context;
}

async function openSpend(browser, role, viewport, tab) {
  const browserContext = await browser.newContext({ viewport, timezoneId: role === 'owner' ? 'America/Los_Angeles' : 'Africa/Lagos', reducedMotion: 'reduce' });
  const page = await browserContext.newPage();
  const server = makeServerState();
  const context = await installApiRoutes(page, role, server);
  page.on('pageerror', (error) => { runtimeErrors.push(`${role}: ${error.message}`); console.error(`QA_PAGE_ERROR ${role}: ${error.stack || error.message}`); });
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) { runtimeErrors.push(`${role} console: ${message.text()}`); console.error(`QA_CONSOLE_ERROR ${role}: ${message.text()}`); } });
  page.on('dialog', (dialog) => { runtimeErrors.push(`${role}: unexpected browser dialog ${dialog.type()}`); console.error(`QA_BROWSER_DIALOG ${role}: ${dialog.type()}`); void dialog.dismiss(); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]', { timeout: 15000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      href: location.href,
      bodyText: document.body.innerText.slice(0, 6000),
      rootHtml: document.getElementById('root')?.innerHTML.slice(0, 2000) || '',
      rootChildren: document.getElementById('root')?.childElementCount || 0,
      canonical: Boolean(document.querySelector('.csp-shell')),
      authLoading: Boolean(document.querySelector('.auth-loading')),
      offlineIndicator: Boolean(document.querySelector('[data-offline-sync-indicator]')),
    }));
    console.error(`QA_FULL_APP_DIAGNOSTIC ${JSON.stringify(diagnostic)}`);
    throw error;
  }
  await page.waitForTimeout(500);
  const moduleId = role === 'owner' ? 'spend-intelligence' : role === 'manager' ? 'expense-approvals' : 'expense-requests';
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id } })), moduleId);
  try {
    await page.waitForSelector('.spend-shell', { timeout: 15000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      bodyText: document.body.innerText.slice(0, 6000),
      spendLauncher: Boolean(document.querySelector('.spend-launcher')),
      spendRoot: Boolean(document.querySelector('#spend-launcher')),
      moduleEnvelope: Boolean(document.querySelector('[data-module-envelope]')),
      moduleHub: Boolean(document.querySelector('.module-hub-panel')),
    }));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\\nQA_OPEN_DIAGNOSTIC ${JSON.stringify(diagnostic)}`);
  }
  if (tab) {
    await page.evaluate((requestedTab) => window.dispatchEvent(new CustomEvent('daenem:open-spend', { detail: { tab: requestedTab } })), tab);
    await page.waitForTimeout(250);
    const tabLabels = { requests: 'My requests', create: 'Create request', approvals: 'Approval queue', intelligence: 'Spend & profit', admin: 'Administration' };
    if (tab !== 'requests' && tabLabels[tab]) await page.getByRole('button', { name: tabLabels[tab], exact: true }).click();
  }
  return { browserContext, page, server, context };
}

async function inspect(page, filename, expectedText) {
  await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: false });
  const evidence = await page.evaluate(async () => {
    const apiCachePaths = [];
    if ('caches' in globalThis) {
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) if (new URL(request.url).pathname.startsWith('/api/')) apiCachePaths.push(new URL(request.url).pathname);
      }
    }
    return {
      width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1,
      h1: document.querySelectorAll('h1').length, text: document.body.innerText, apiCachePaths,
    };
  });
  assert(!evidence.overflow, `${filename}: horizontal overflow`);
  assert(evidence.h1 <= 1, `${filename}: multiple H1 elements`);
  assert(evidence.apiCachePaths.length === 0, `${filename}: authenticated API response found in Cache Storage: ${evidence.apiCachePaths.join(', ')}`);
  assert(!/(password|oauth|access[_-]?token|mfa secret|raw form payload|storage key)/i.test(evidence.text), `${filename}: sensitive/developer content visible`);
  if (expectedText) assert(evidence.text.includes(expectedText), `${filename}: missing ${expectedText}`);
  return evidence;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  try {
    const owner = await openSpend(browser, 'owner', { width: 1920, height: 1080 }, 'intelligence');
    await owner.page.getByText('Spend, Cost & Profit Intelligence', { exact: true }).waitFor();
    await inspect(owner.page, 'spend-owner-overview-1920x1080.png', 'Actual profit unavailable');
    await owner.page.getByRole('button', { name: /EXP-2026-0001/ }).click();
    await owner.page.getByRole('complementary', { name: 'Expense operational detail' }).waitFor();
    await owner.page.locator('.spend-owner-inspector').scrollIntoViewIfNeeded();
    const ownerDetailEvidence = await inspect(owner.page, 'spend-owner-detail-1920x1080.png', 'Operational timeline');
    assert(ownerDetailEvidence.text.includes('Africa/Lagos') && ownerDetailEvidence.text.includes('UTC'), 'Owner detail does not show business and canonical time context');
    assert(ownerDetailEvidence.text.toLowerCase().includes('network location') && !ownerDetailEvidence.text.match(/IP.*GPS|GPS.*IP/i), 'Owner detail network/GPS distinction missing');
    await owner.browserContext.close();

    const largeOwner = await openSpend(browser, 'owner', { width: 2560, height: 1440 }, 'intelligence');
    await largeOwner.page.getByRole('button', { name: /EXP-2026-0001/ }).click();
    await largeOwner.page.getByRole('complementary', { name: 'Expense operational detail' }).waitFor();
    await largeOwner.page.locator('.spend-owner-inspector').scrollIntoViewIfNeeded();
    await inspect(largeOwner.page, 'spend-owner-detail-2560x1440.png', 'Time display');
    await largeOwner.browserContext.close();

    const mobileOwner = await openSpend(browser, 'owner', { width: 390, height: 844 }, 'intelligence');
    await mobileOwner.page.getByRole('button', { name: /EXP-2026-0001/ }).click();
    await mobileOwner.page.getByRole('complementary', { name: 'Expense operational detail' }).waitFor();
    await mobileOwner.page.locator('.spend-owner-inspector').scrollIntoViewIfNeeded();
    await inspect(mobileOwner.page, 'spend-owner-mobile-detail-390x844.png', 'Operational timeline');
    await mobileOwner.browserContext.close();

    const employee = await openSpend(browser, 'employee', { width: 390, height: 844 }, 'requests');
    await employee.page.locator('.spend-view > .spend-view-heading h2').filter({ hasText: 'My Expense Requests' }).waitFor();
    const ownEvidence = await inspect(employee.page, 'spend-employee-mobile-my-requests-390x844.png', 'My Expense Requests');
    assert(!ownEvidence.text.includes('Operational timeline') && !ownEvidence.text.includes('IP address'), 'Employee surface exposed Owner detail fields');
    await employee.page.getByRole('button', { name: 'New request' }).click();
    await employee.page.getByText('Create expense request', { exact: true }).waitFor();
    await inspect(employee.page, 'spend-employee-mobile-create-390x844.png', 'What is this expense for?');
    await employee.page.getByLabel('What is this expense for? *').fill('Generator fuel for Daenem Complex');
    await employee.page.getByLabel('Amount (NGN) *').fill('100000');
    await employee.page.getByLabel('Business reason *').fill('Keep the headquarters power system operating.');
    await employee.page.getByRole('button', { name: 'Continue' }).click();
    await employee.page.getByText('Controlled classification').waitFor();
    assert(await employee.page.getByRole('button', { name: /Not listed\? Request new option/ }).count() === 2, 'Controlled master-data proposal safeguards are missing');
    await employee.page.getByRole('button', { name: 'Continue' }).click();
    await employee.page.getByText('Evidence and beneficiaries').waitFor();
    await inspect(employee.page, 'spend-employee-mobile-evidence-390x844.png', 'Choose photo, camera image or PDF');
    await employee.page.getByLabel('Why is evidence unavailable? *').fill('Supplier invoice will be attached after reconnect.');
    await employee.page.getByRole('button', { name: 'Review request' }).click();
    await employee.browserContext.setOffline(true);
    await employee.page.waitForFunction(() => navigator.onLine === false);
    await employee.page.getByRole('button', { name: 'Submit request' }).click();
    try {
      await employee.page.waitForFunction(() => document.querySelector('[data-spend-sync-status]')?.textContent?.toLowerCase().includes('waiting') || document.querySelector('[data-spend-sync-status]')?.textContent?.toLowerCase().includes('offline'), { timeout: 15000 });
    } catch (error) {
      console.error(`QA_SPEND_OFFLINE_DIAGNOSTIC ${JSON.stringify({ online: await employee.page.evaluate(() => navigator.onLine), status: await employee.page.locator('[data-spend-sync-status]').getAttribute('data-spend-sync-status'), label: await employee.page.locator('[data-spend-sync-status]').innerText(), message: await employee.page.locator('body').innerText().then((value) => value.slice(-600)) })}`);
      throw error;
    }
    const queued = await inspect(employee.page, 'spend-employee-mobile-offline-waiting-390x844.png', 'Offline');
    assert(/waiting/i.test(queued.text), 'Offline expense screenshot does not show a waiting-to-sync state');
    await employee.browserContext.setOffline(false);
    await employee.page.evaluate(() => window.dispatchEvent(new Event('online')));
    try {
      await employee.page.waitForFunction(() => document.querySelector('[data-spend-sync-status]')?.getAttribute('data-spend-sync-status') === 'synced', null, { timeout: 15000 });
    } catch (error) {
      const offlineOperations = await employee.page.evaluate(() => new Promise((resolve) => {
        const request = indexedDB.open('daenem-staff-offline-v1');
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('operations')) { resolve([]); return; }
          const read = db.transaction('operations', 'readonly').objectStore('operations').getAll();
          read.onerror = () => resolve([]);
          read.onsuccess = () => resolve(read.result.map((item) => ({ id: item.id, kind: item.kind, state: item.state, entityId: item.entityId, attachmentRefs: item.attachmentRefs })));
        };
      }));
      console.error(`QA_SPEND_SYNC_DIAGNOSTIC ${JSON.stringify({ online: await employee.page.evaluate(() => navigator.onLine), status: await employee.page.locator('[data-spend-sync-status]').getAttribute('data-spend-sync-status'), label: await employee.page.locator('[data-spend-sync-status]').innerText(), syncRequests: employee.server.syncRequests, effects: employee.server.effects, offlineOperations })}`);
      throw error;
    }
    await inspect(employee.page, 'spend-employee-mobile-synced-390x844.png', 'All work synced');
    assert(employee.server.effects === 1 && employee.server.syncRequests >= 1, 'Offline expense reconnect did not produce one authoritative sync effect');
    await employee.browserContext.close();

    const desktopEmployee = await openSpend(browser, 'employee', { width: 1440, height: 900 }, 'requests');
    await desktopEmployee.page.locator('.spend-view > .spend-view-heading h2').filter({ hasText: 'My Expense Requests' }).waitFor();
    await inspect(desktopEmployee.page, 'spend-employee-desktop-1440x900.png', 'My Expense Requests');
    await desktopEmployee.browserContext.close();

    const tablet = await openSpend(browser, 'employee', { width: 1024, height: 768 }, 'requests');
    await inspect(tablet.page, 'spend-employee-tablet-1024x768.png', 'My Expense Requests');
    await tablet.browserContext.close();

    const manager = await openSpend(browser, 'manager', { width: 390, height: 844 }, 'approvals');
    const managerText = (await inspect(manager.page, 'spend-approver-mobile-390x844.png', 'Approval queue')).text;
    assert(managerText.includes('Approval queue') && !managerText.includes('OWNER-ONLY COMMAND CENTER'), 'Manager can reach Owner Spend intelligence UI');
    await manager.browserContext.close();

    const admin = await openSpend(browser, 'owner', { width: 390, height: 844 }, 'admin');
    await admin.page.getByRole('button', { name: 'Administration', exact: true }).click();
    await admin.page.locator('.spend-view > .spend-view-heading h2').filter({ hasText: 'Cost Intelligence Administration' }).waitFor();
    const adminEvidence = await inspect(admin.page, 'spend-admin-mobile-390x844.png', 'Cost Intelligence Administration');
    assert(adminEvidence.text.includes('Edit') && adminEvidence.text.includes('Deactivate') && adminEvidence.text.includes('PROPOSALS'), 'Admin controlled-data actions are not visible in the rendered UI');
    const rejectButton = admin.page.getByRole('button', { name: 'Reject', exact: true });
    await rejectButton.click();
    const rejectionDialog = admin.page.getByRole('dialog', { name: 'Reject master-data proposal' });
    await rejectionDialog.waitFor();
    const rejectionTextarea = rejectionDialog.locator('textarea');
    const rejectionClose = rejectionDialog.getByRole('button', { name: 'Close dialog' });
    const rejectionSubmit = rejectionDialog.getByRole('button', { name: 'Reject proposal', exact: true });
    assert(await rejectionTextarea.evaluate((element) => element === document.activeElement), 'Controlled rejection modal did not focus its textarea');
    await inspect(admin.page, 'spend-focused-dialog-reject-390x844.png', 'Reject master-data proposal');
    await rejectionSubmit.focus();
    await admin.page.keyboard.press('Tab');
    assert(await rejectionClose.evaluate((element) => element === document.activeElement), 'Focused rejection dialog did not trap forward Tab at the final control');
    await admin.page.keyboard.press('Shift+Tab');
    assert(await rejectionSubmit.evaluate((element) => element === document.activeElement), 'Focused rejection dialog did not trap reverse Tab at the first control');
    await admin.page.locator('.spend-dialog-backdrop').click({ position: { x: 2, y: 2 } });
    assert(await rejectionDialog.isVisible(), 'High-risk rejection dialog closed from a backdrop click');
    await admin.page.keyboard.press('Escape');
    await rejectionDialog.waitFor({ state: 'detached' });
    await admin.page.waitForTimeout(50);
    assert(await rejectButton.evaluate((element) => element === document.activeElement), 'Focused rejection dialog did not return focus to the trigger after Escape');
    await admin.browserContext.close();
  } finally {
    await browser.close();
  }
  if (runtimeErrors.length) failures.push(`Runtime/browser errors: ${runtimeErrors.join(' | ')}`);
  if (failures.length) {
    console.error(JSON.stringify({ failures, runtimeErrors }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ screenshots: fs.readdirSync(screenshotDir).sort(), runtimeErrors, rendered: 'SPEND_FOUNDATION_RENDERED_QA=PASS' }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
