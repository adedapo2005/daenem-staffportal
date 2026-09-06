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
    if (url.pathname === '/api/offline/bootstrap') return send({ ok: true, serverTime: '2026-09-05T14:48:18.000Z', businessTimezone: 'Africa/Lagos', maxOfflineAgeMinutes: 720, session: { id: context.sessionId, expiresAt: '2030-09-05T08:00:00.000Z', lastVerifiedAt: '2026-09-05T14:48:18.000Z' }, policy: { enabled: true, maxQueueCount: 50, attachmentMaxBytes: 10485760, automaticSync: true, manualRetry: true, retentionDays: 30, allowedOperations: ['expense.draft.save', 'expense.request.submit', 'expense.evidence.upload'] }, operations: [{ kind: 'expense.draft.save', mode: 'draft-only', permission: 'expense.requests' }, { kind: 'expense.request.submit', mode: 'draft-and-submit', permission: 'expense.requests' }] });
    if (url.pathname === '/api/offline/telemetry') return send({ ok: true, serverReceivedAt: '2026-09-05T14:48:18.000Z', networkLocation: 'Ibadan, NG' });
    if (url.pathname === '/api/offline/sync' && method === 'POST') {
      server.syncRequests += 1;
      let body = {};
      try { body = JSON.parse(request.postData() || '{}'); } catch { return send({ error: 'Invalid sync body' }, 400); }
      const key = String(body.idempotencyKey || request.headers()['idempotency-key'] || '');
      if (server.receipts.has(key)) return send({ ok: true, state: 'synced', receipt: server.receipts.get(key), result: { requestId: body.entityId, status: 'submitted' }, deduplicated: true });
      server.effects += 1;
      const receipt = { id: `receipt-${key.slice(-8)}`, operationId: body.operationId, idempotencyKey: key, state: 'completed', serverReceivedAt: '2026-09-05T14:48:18.000Z', completedAt: '2026-09-05T14:48:18.000Z' };
      server.receipts.set(key, receipt);
      return send({ ok: true, state: 'synced', receipt, result: { requestId: body.entityId, status: 'submitted' } });
    }
    if (url.pathname === '/api/spend/bootstrap') return send(spendBootstrap(url.searchParams.get('companyId') || 'company-printing'));
    if (url.pathname === '/api/spend/requests' && method === 'GET') return send({ requests: role === 'employee' ? [{ ...requestRow, status: 'submitted', requesterName: context.employee.displayName }] : [] });
    if (url.pathname === '/api/spend/requests' && method === 'POST') return send({ ok: true, request: { ...requestRow, id: 'queued-expense' } }, 201);
    if (url.pathname.startsWith('/api/spend/requests/') && method === 'GET') return send({ request: { ...requestRow, requesterName: context.employee.displayName } });
    if (url.pathname === '/api/spend/owner/overview') return role === 'owner' ? send(ownerOverview()) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/spend/owner/detail') return role === 'owner' ? send(ownerDetail()) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/spend/admin/master') return role === 'owner' ? send({ categories: [], costCenters: [], suppliers: [], treatments: [], allocationTemplates: [], approvalRules: [], evidencePolicies: [], proposals: [] }) : send({ error: 'Master-data access is required.' }, 403);
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
  page.on('pageerror', (error) => { runtimeErrors.push(`${role}: ${error.message}`); });
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) runtimeErrors.push(`${role} console: ${message.text()}`); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-offline-sync-indicator]', { timeout: 15000 });
  await page.waitForTimeout(500);
  const moduleId = role === 'owner' ? 'spend-intelligence' : role === 'manager' ? 'expense-approvals' : 'expense-requests';
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id } })), moduleId);
  await page.waitForSelector('.spend-shell', { timeout: 15000 });
  return { browserContext, page, server, context };
}

async function inspect(page, filename, expectedText) {
  await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: true });
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
  const browser = await chromium.launch({ headless: true });
  try {
    const owner = await openSpend(browser, 'owner', { width: 1920, height: 1080 }, 'intelligence');
    await owner.page.getByText('Spend & Profit Intelligence', { exact: true }).waitFor();
    await inspect(owner.page, 'spend-owner-overview-1920x1080.png', 'Actual profit unavailable');
    await owner.page.getByRole('button', { name: /EXP-2026-0001/ }).click();
    await owner.page.getByRole('complementary', { name: 'Expense operational detail' }).waitFor();
    const ownerDetailEvidence = await inspect(owner.page, 'spend-owner-detail-1920x1080.png', 'Operational timeline');
    assert(ownerDetailEvidence.text.includes('Africa/Lagos') && ownerDetailEvidence.text.includes('UTC'), 'Owner detail does not show business and canonical time context');
    assert(ownerDetailEvidence.text.includes('network location') && !ownerDetailEvidence.text.match(/IP.*GPS|GPS.*IP/i), 'Owner detail network/GPS distinction missing');
    await owner.browserContext.close();

    const largeOwner = await openSpend(browser, 'owner', { width: 2560, height: 1440 }, 'intelligence');
    await largeOwner.page.getByRole('button', { name: /EXP-2026-0001/ }).click();
    await largeOwner.page.getByRole('complementary', { name: 'Expense operational detail' }).waitFor();
    await inspect(largeOwner.page, 'spend-owner-detail-2560x1440.png', 'Time display');
    await largeOwner.browserContext.close();

    const mobileOwner = await openSpend(browser, 'owner', { width: 390, height: 844 }, 'intelligence');
    await mobileOwner.page.getByRole('button', { name: /EXP-2026-0001/ }).click();
    await mobileOwner.page.getByRole('complementary', { name: 'Expense operational detail' }).waitFor();
    await inspect(mobileOwner.page, 'spend-owner-mobile-detail-390x844.png', 'Operational timeline');
    await mobileOwner.browserContext.close();

    const employee = await openSpend(browser, 'employee', { width: 390, height: 844 }, 'requests');
    await employee.page.getByText('My Expense Requests', { exact: true }).waitFor();
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
    await employee.page.waitForFunction(() => document.querySelector('[data-spend-sync-status]')?.textContent?.toLowerCase().includes('waiting') || document.querySelector('[data-spend-sync-status]')?.textContent?.toLowerCase().includes('offline'), { timeout: 15000 });
    const queued = await inspect(employee.page, 'spend-employee-mobile-offline-waiting-390x844.png', 'Offline');
    assert(/waiting/i.test(queued.text), 'Offline expense screenshot does not show a waiting-to-sync state');
    await employee.browserContext.setOffline(false);
    await employee.page.waitForFunction(() => document.querySelector('[data-sync-status]')?.getAttribute('data-sync-status') === 'synced', null, { timeout: 15000 });
    await inspect(employee.page, 'spend-employee-mobile-synced-390x844.png', 'All work synced');
    assert(employee.server.effects === 1 && employee.server.syncRequests >= 1, 'Offline expense reconnect did not produce one authoritative sync effect');
    await employee.browserContext.close();

    const tablet = await openSpend(browser, 'employee', { width: 1024, height: 768 }, 'requests');
    await inspect(tablet.page, 'spend-employee-tablet-1024x768.png', 'My Expense Requests');
    await tablet.browserContext.close();

    const manager = await openSpend(browser, 'manager', { width: 390, height: 844 }, 'intelligence');
    const managerText = (await inspect(manager.page, 'spend-manager-owner-absent-390x844.png', 'Approval queue')).text;
    assert(!managerText.includes('Spend & Profit Intelligence') && !managerText.includes('OWNER-ONLY COMMAND CENTER'), 'Manager can reach Owner Spend intelligence UI');
    await manager.browserContext.close();
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
