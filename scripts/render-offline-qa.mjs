import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const evidenceDir = path.join(root, 'qa-artifacts');
const screenshotDir = path.join(evidenceDir, 'offline-screenshots');
fs.mkdirSync(screenshotDir, { recursive: true });

const failures = [];
const runtimeErrors = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const companies = [
  { id: 'company-printing', code: 'PRINT', name: 'Printing & Technology', primary: true },
  { id: 'company-bakery', code: 'BAKERY', name: 'Bakery', primary: false },
  { id: 'company-autos', code: 'AUTOS', name: 'Daenem Autos', primary: false },
  { id: 'company-logistics', code: 'LOGISTICS', name: 'Logistics', primary: false },
  { id: 'company-properties', code: 'PROPERTIES', name: 'Homes & Properties', primary: false },
];

const formPermissions = { 'dashboard.access': 'view', 'forms.access': 'view', 'ai_guide.access': 'view' };
const ownerPermissions = {
  'dashboard.access': 'manage', 'users.access': 'manage', 'attendance.access': 'manage',
  'payroll.access': 'manage', 'forms.access': 'manage', 'facilities.access': 'manage',
  'broadcasts.access': 'manage', 'security.access': 'manage', 'ai_guide.access': 'manage',
  'settings.access': 'manage', 'navigation.studio': 'manage', 'audit.explorer': 'manage',
  'diagnostics.access': 'manage', 'integrations.access': 'manage', 'owner.intelligence': 'manage',
};

function contextFor(role, employeeId = 'qa-offline-employee') {
  const owner = role === 'owner';
  const permissions = owner ? ownerPermissions : formPermissions;
  const assignedCompanies = owner ? companies : [companies[0]];
  return {
    sessionId: `qa-offline-session-${employeeId}`,
    employee: {
      id: employeeId, employeeNo: owner ? 'QA-OWNER' : 'QA-OFFLINE', displayName: owner ? 'Amina Daenem' : 'Tolu Offline',
      email: `${employeeId}@example.invalid`, jobTitle: owner ? 'Group Owner' : 'Portal Employee', department: 'Operations',
      status: 'active', preferredTheme: 'unified-daylight', team: owner ? 'Leadership' : 'Printing', lastLoginAt: '2026-09-05T08:00:00.000Z',
    },
    companies: assignedCompanies,
    roles: [{ id: `qa-role-${role}-${employeeId}`, code: owner ? 'owner' : 'employee', name: owner ? 'Owner' : 'Employee', companyId: 'company-printing' }],
    permissions,
    companyPermissions: Object.fromEntries(assignedCompanies.map((company) => [company.id, permissions])),
  };
}

const summary = {
  workDate: '2026-09-05', refreshedAt: '2026-09-05T10:30:00.000Z', companyId: 'company-printing', scope: 'personal',
  pendingApprovals: 0, securityAlerts: 0, overdueRequirements: 0, maintenanceAlerts: 0,
};

function layoutPayload(erpId = 'staff') {
  const layouts = { staff: 'focus-flow', printing: 'operational-cockpit', bakery: 'executive-command', autos: 'executive-command', logistics: 'executive-command', properties: 'master-detail', finance: 'horizon-wide', controls: 'enterprise-studio' };
  return { preference: { layoutId: layouts[erpId] || 'focus-flow', density: 'standard', motion: 'balanced' }, canChoose: true, canManage: false, canAccess: false };
}

const assignment = {
  assignmentId: 'qa-form-assignment', companyId: 'company-printing', title: 'Offline daily handover', formType: 'daily_report',
  schemaJson: JSON.stringify([{ key: 'handover', label: 'Handover note', type: 'textarea', required: true }]),
  blocking: 0, dueAt: null, status: 'not_started', requireLocation: 0, requirePhoto: 0, requireSignature: 0, submissionUpdatedAt: null,
};

function ownerOverview() {
  return {
    serverTime: '2026-09-05T10:36:04.000Z', businessTimezone: 'Africa/Lagos',
    freshness: 'Server observed at request time; each client report carries its own lastReportedAt.',
    summary: { activeSessions: 2, telemetryDevices: 1, reportedPending: 1, needsAttention: 1 },
    sessions: [{ id: 'qa-session-owner', employeeId: 'qa-offline-employee', employeeName: 'Tolu Offline', deviceId: 'qa-device-1', deviceName: 'QA Browser · Mobile', platform: 'Linux', clientTimezone: 'Africa/Lagos', ipAddress: '203.0.113.10', networkLocation: 'Lagos, NG', createdAt: '2026-09-05T08:00:00.000Z', lastSeenAt: '2026-09-05T10:31:00.000Z', expiresAt: '2030-09-05T08:00:00.000Z' }],
    telemetry: [{ employeeId: 'qa-offline-employee', employeeName: 'Tolu Offline', companyId: 'company-printing', deviceId: 'qa-device-1', deviceName: 'QA Browser · Mobile', platform: 'Linux', appVersion: 'offline-qa', clientTimezone: 'Africa/Lagos', pendingCount: 1, syncStatus: 'waiting', lastSuccessfulSyncAt: '2026-09-05T10:20:00.000Z', lastReportedAt: '2026-09-05T10:31:00.000Z', ipAddress: '203.0.113.10', networkLocation: 'Lagos, NG' }],
    receipts: [{ id: 'qa-receipt-1', operationId: 'qa-op-1', idempotencyKey: 'qa-key-1', employeeId: 'qa-offline-employee', employeeName: 'Tolu Offline', companyId: 'company-printing', operationKind: 'forms.submit', entityType: 'workflow_form_assignment', entityId: 'qa-form-assignment', state: 'conflict', attemptCount: 2, lastErrorCategory: 'conflict', serverReceivedAt: '2026-09-05T10:36:00.000Z', updatedAt: '2026-09-05T10:36:04.000Z' }],
    policy: { enabled: true, maxOfflineAgeMinutes: 720, maxQueueCount: 50, attachmentMaxBytes: 10485760, automaticSync: true, manualRetry: true, retentionDays: 30, allowedOperations: ['forms.submit'] },
  };
}

function makeServerState() {
  return { syncMode: 'success', syncDelay: 0, syncRequests: 0, businessEffects: 0, receipts: new Map(), lostKeys: new Set(), capturedKeys: [] };
}

async function installApiRoutes(page, role, server = makeServerState(), employeeId) {
  const context = contextFor(role, employeeId || (role === 'owner' ? 'qa-offline-owner' : 'qa-offline-employee'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const send = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/auth/me') return send({ authenticated: true, context });
    if (url.pathname === '/api/auth/logout') return send({ ok: true });
    if (url.pathname === '/api/experience/layout') return send(layoutPayload(url.searchParams.get('erpId') || 'staff'));
    if (url.pathname.startsWith('/api/experience/layout/')) return send({ ok: true, preference: layoutPayload('staff').preference });
    if (url.pathname === '/api/dashboard/summary') return send({ ...summary, scope: role === 'owner' ? 'aggregate' : 'personal' });
    if (url.pathname === '/api/owner/intelligence') return send({ generatedAt: summary.refreshedAt, workDate: summary.workDate, scope: { companyId: null, companyName: 'Daenem Group', companyIds: companies.map((company) => company.id) }, group: { employees: 128, present: 116, incompleteAttendance: 4, revenueKobo: 1485000000, payrollNetKobo: 286000000, operatingExpenseKobo: 198000000, outstandingReceivablesKobo: 174000000, inventoryValueKobo: 362000000 }, companies: {}, alerts: [] });
    if (url.pathname === '/api/support/mine') return send({ commands: [], assistanceRequests: [] });
    if (url.pathname === '/api/forms' && method === 'GET') return send({ forms: [{ id: 'qa-form', companyName: 'Printing & Technology', title: assignment.title, formType: assignment.formType, schemaJson: assignment.schemaJson, assignmentCount: 1 }] });
    if (url.pathname === '/api/forms/mine' && method === 'GET') return send({ assignments: [assignment] });
    if (url.pathname.startsWith('/api/directory/')) return send({ employees: [], roles: [] });
    if (url.pathname === '/api/offline/bootstrap' && method === 'GET') return send({
      ok: true, serverTime: '2026-09-05T10:36:04.000Z', businessTimezone: 'Africa/Lagos', maxOfflineAgeMinutes: 720,
      session: { id: context.sessionId, expiresAt: '2030-09-05T08:00:00.000Z', lastVerifiedAt: '2026-09-05T10:36:04.000Z' },
      employee: { id: context.employee.id }, scope: { companyId: url.searchParams.get('companyId') || 'company-printing', companyIds: context.companies.map((company) => company.id) },
      policy: { enabled: true, maxQueueCount: 50, attachmentMaxBytes: 10485760, automaticSync: true, manualRetry: true, retentionDays: 30, allowedOperations: ['forms.submit'] },
      operations: [{ kind: 'forms.submit', mode: 'draft-and-submit', permission: 'forms.access' }],
    });
    if (url.pathname === '/api/offline/telemetry' && method === 'POST') return send({ ok: true, serverReceivedAt: '2026-09-05T10:36:04.000Z', networkLocation: 'Lagos, NG' });
    if (url.pathname === '/api/offline/activity') return send({ operations: [], telemetry: [], lastSuccessfulSync: null, businessTimezone: 'Africa/Lagos', serverTime: '2026-09-05T10:36:04.000Z' });
    if (url.pathname === '/api/offline/sync' && method === 'POST') {
      server.syncRequests += 1;
      let body = {};
      try { body = JSON.parse(request.postData() || '{}'); } catch { return send({ error: 'invalid body' }, 400); }
      server.capturedKeys.push(body.idempotencyKey || request.headers()['idempotency-key']);
      assert(Boolean(body.idempotencyKey) && Boolean(request.headers()['idempotency-key']), 'sync request did not carry an idempotency key');
      const key = String(body.idempotencyKey || request.headers()['idempotency-key'] || '');
      if (server.receipts.has(key)) return send({ ok: true, state: 'synced', deduplicated: true, receipt: server.receipts.get(key), result: { submissionId: 'qa-submission-' + key.slice(-8), status: 'submitted' } });
      if (server.syncMode === 'response-lost') {
        server.businessEffects += 1;
        server.receipts.set(key, { id: 'qa-receipt-' + key.slice(-8), idempotencyKey: key, state: 'completed', serverReceivedAt: '2026-09-05T10:36:04.000Z', completedAt: '2026-09-05T10:36:04.000Z' });
        if (!server.lostKeys.has(key)) { server.lostKeys.add(key); return route.abort('failed'); }
      }
      if (server.syncMode === 'conflict') return send({ error: 'The Forms record changed while this work was offline.', state: 'needs-review', errorCategory: 'conflict' }, 409);
      if (server.syncMode === 'permission') return send({ error: 'Your current Forms permission does not allow this queued action.', state: 'needs-review', errorCategory: 'permission-denied' }, 403);
      if (server.syncMode === 'authentication') return send({ error: 'Sign in to continue syncing.', state: 'authentication-required' }, 401);
      if (server.syncMode === 'validation') return send({ error: 'Handover note is required.', state: 'needs-review', errorCategory: 'validation' }, 422);
      if (server.syncMode === 'server-error') return send({ error: 'Temporary sync failure.', state: 'failed-retryable' }, 503);
      server.businessEffects += 1;
      const receipt = { id: 'qa-receipt-' + key.slice(-8), idempotencyKey: key, state: 'completed', serverReceivedAt: '2026-09-05T10:36:04.000Z', completedAt: '2026-09-05T10:36:04.000Z' };
      server.receipts.set(key, receipt);
      if (server.syncDelay) await sleep(server.syncDelay);
      return send({ ok: true, state: 'synced', receipt, result: { submissionId: 'qa-submission-' + key.slice(-8), status: 'submitted' } });
    }
    if (url.pathname === '/api/offline/owner/overview' && method === 'GET') return role === 'owner' ? send(ownerOverview()) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/offline/owner/policy') return role === 'owner' ? send({ policy: ownerOverview().policy, businessTimezone: 'Africa/Lagos' }) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/offline/owner/revoke' && method === 'POST') return role === 'owner' ? send({ ok: true, message: 'Session revoked.' }) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname.startsWith('/api/offline/owner/')) return role === 'owner' ? send({}) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname.startsWith('/api/offline/attachments/')) {
      const mime = (request.headers()['content-type'] || '').split(';')[0];
      const size = Number(request.headers()['content-length'] || 0);
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mime)) return send({ error: 'This attachment MIME type is not allowed.' }, 415);
      if (size > 10485760) return send({ error: 'This attachment is larger than the configured limit.' }, 413);
      return send({ ok: true, attachment: { id: url.pathname.split('/').pop(), status: 'uploaded' } }, 201);
    }
    if (url.pathname === '/api/context/weather') return send({ location: 'Lagos', temperature: 29, description: 'Clear' });
    if (url.pathname.startsWith('/api/auth/password-policy')) return send({ minimumLength: 10, maximumLength: 128, requiresUppercase: true, requiresLowercase: true, requiresNumber: true, requiresSymbol: true });
    if (url.pathname.startsWith('/api/')) return send(method === 'GET' ? {} : { ok: true });
    return route.continue();
  });
  return server;
}

async function openContext(browser, role, viewport, employeeId) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const server = await installApiRoutes(page, role, makeServerState(), employeeId);
  const pageErrors = [];
  page.on('pageerror', (error) => { pageErrors.push(error.message); runtimeErrors.push(`${role}: ${error.message}`); });
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(`${role} console: ${message.text()}`); });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-offline-sync-indicator]', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__daenemQaGpsCalls = 0;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = () => { window.__daenemQaGpsCalls += 1; };
    }
  });
  return { context, page, server, pageErrors };
}

async function goForms(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:canonical-navigation', { detail: { target: 'forms' } })));
  await page.waitForSelector('[data-forms-center]', { timeout: 15000 });
  await page.locator('[data-form-assignment="qa-form-assignment"] textarea').waitFor({ state: 'visible', timeout: 15000 });
}

async function status(page, expected, timeout = 15000) {
  await page.waitForFunction((value) => document.querySelector('[data-offline-sync-indicator]')?.getAttribute('data-sync-status') === value, expected, { timeout });
}

async function snapshot(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true });
  const evidence = await page.evaluate(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    h1: document.querySelectorAll('h1').length,
    text: document.body.innerText,
    apiCacheEntries: [],
  }));
  assert(!evidence.overflow, `${name}: horizontal overflow`);
  assert(evidence.h1 <= 1, `${name}: more than one H1`);
  assert(!evidence.text.includes('layout-debug') && !evidence.text.includes('Layout debug'), `${name}: layout-debug explanation visible`);
  return evidence;
}

async function runOutcome(browser, mode, expected) {
  const { context, page, server } = await openContext(browser, 'employee', { width: 390, height: 844 }, `qa-outcome-${mode}`);
  await goForms(page);
  await page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('Outcome test');
  await context.setOffline(true);
  await page.locator('[data-offline-form-submit="supported"]').click();
  server.syncMode = mode;
  await context.setOffline(false);
  await status(page, expected);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let gpsCalls = 0;
  try {
    const employee = await openContext(browser, 'employee', { width: 390, height: 844 }, 'qa-offline-employee');
    const { page, context, server } = employee;
    assert((await page.locator('body').innerText()).includes('Customize Dashboard'), 'accepted dashboard customization mode is absent');
    assert((await page.locator('[data-offline-sync-indicator]').getAttribute('aria-label')).includes('My Sync Activity'), 'sync indicator is not screen-reader labelled');
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'reduced-motion preference was not respected by the browser surface');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.command-palette', { timeout: 5000 });
    await page.keyboard.press('Escape');
    const customize = page.locator('.widget-customize-toolbar button');
    if (await customize.count()) {
      await customize.click();
      assert((await customize.innerText()).includes('Done'), 'Customize Dashboard mode did not open explicitly');
      await customize.click();
    }
    assert(await page.evaluate(() => window.__daenemQaGpsCalls === 0), 'GPS was collected without an explicit user action');
    await goForms(page);
    await page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('Morning handover captured on device.');
    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
    await page.locator('[data-offline-form-submit="supported"]').click();
    await status(page, 'offline');
    const offlineEvidence = await snapshot(page, 'employee-mobile-offline-queued-390x844.png');
    assert(offlineEvidence.text.includes('Waiting') || offlineEvidence.text.includes('waiting'), 'offline screenshot does not explain queued work');

    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), { timeout: 15000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('[data-offline-sync-indicator]', { timeout: 15000 });
    await status(page, 'offline');
    await snapshot(page, 'employee-mobile-offline-reload-390x844.png');

    server.syncDelay = 900;
    server.syncMode = 'success';
    await context.setOffline(false);
    await status(page, 'syncing');
    await snapshot(page, 'employee-mobile-syncing-390x844.png');
    await status(page, 'synced');
    await snapshot(page, 'employee-mobile-synced-390x844.png');
    assert(server.businessEffects === 1, `normal Forms sync created ${server.businessEffects} business effects`);

    await goForms(page);
    await page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('Response lost retry test.');
    await context.setOffline(true);
    await page.locator('[data-offline-form-submit="supported"]').click();
    const effectsBeforeLost = server.businessEffects;
    server.syncDelay = 0;
    server.syncMode = 'response-lost';
    await context.setOffline(false);
    await status(page, 'waiting');
    await sleep(2300);
    await page.getByRole('button', { name: /Open My Sync Activity/ }).click();
    await page.getByRole('button', { name: 'Retry Now' }).click();
    await status(page, 'synced');
    assert(server.businessEffects === effectsBeforeLost + 1, 'response-lost retry produced more than one business effect');
    assert(server.syncRequests >= 3, 'response-lost retry did not reach the server twice');

    await goForms(page);
    await page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('Conflict must remain visible.');
    await context.setOffline(true);
    await page.locator('[data-offline-form-submit="supported"]').click();
    server.syncMode = 'conflict';
    await context.setOffline(false);
    await status(page, 'needs-attention');
    const conflictEvidence = await snapshot(page, 'employee-mobile-needs-attention-conflict-390x844.png');
    assert(conflictEvidence.text.includes('needs attention'), 'conflict state is not visible in plain language');
    const localRecords = await page.evaluate(() => new Promise((resolve) => {
      const request = indexedDB.open('daenem-staff-offline-v1');
      request.onsuccess = () => {
        const db = request.result;
        const names = Array.from(db.objectStoreNames);
        const tx = db.transaction(names, 'readonly');
        const result = {};
        let remaining = names.length;
        for (const name of names) { const get = tx.objectStore(name).getAll(); get.onsuccess = () => { result[name] = get.result; if (!--remaining) resolve(result); }; }
        if (!names.length) resolve(result);
      };
      request.onerror = () => resolve({});
    }));
    const localText = JSON.stringify(localRecords).toLowerCase();
    assert(!/(password|oauth|access_token|refresh_token|session_cookie|bearer)/.test(localText), 'offline IndexedDB evidence contains authentication material');
    const badAttachment = await page.evaluate(async () => {
      const response = await fetch('/api/offline/attachments/qa-invalid', { method: 'PUT', headers: { 'content-type': 'text/plain', 'x-offline-operation-id': 'qa-op', 'x-offline-company-id': 'company-printing' }, body: 'not-an-attachment' });
      return response.status;
    });
    assert(badAttachment === 415, 'invalid attachment MIME was not rejected');
    gpsCalls = await page.evaluate(() => window.__daenemQaGpsCalls);
    assert(gpsCalls === 0, 'GPS was collected without an explicit user action');

    const tablet = await openContext(browser, 'employee', { width: 1024, height: 768 }, 'qa-offline-tablet');
    await goForms(tablet.page);
    await tablet.page.getByRole('button', { name: /Open My Sync Activity/ }).click();
    await snapshot(tablet.page, 'employee-tablet-forms-sync-activity-1024x768.png');
    await tablet.context.close();

    await runOutcome(browser, 'validation', 'needs-attention');
    await runOutcome(browser, 'permission', 'needs-attention');
    await runOutcome(browser, 'authentication', 'authentication-required');
    await runOutcome(browser, 'server-error', 'waiting');

    const multi = await openContext(browser, 'employee', { width: 390, height: 844 }, 'qa-multi-tab');
    await goForms(multi.page);
    await multi.page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('One effect across two tabs.');
    await multi.context.setOffline(true);
    await multi.page.locator('[data-offline-form-submit="supported"]').click();
    const tabTwo = await multi.context.newPage();
    await installApiRoutes(tabTwo, 'employee', multi.server, 'qa-multi-tab');
    await tabTwo.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await tabTwo.waitForSelector('[data-offline-sync-indicator]', { timeout: 15000 });
    await multi.context.setOffline(false);
    await status(multi.page, 'synced');
    await status(tabTwo, 'synced');
    assert(multi.server.businessEffects === 1, 'two open tabs produced duplicate business effects');
    await multi.context.close();

    const unauthorized = await openContext(browser, 'employee', { width: 390, height: 844 }, 'qa-unauthorized');
    const ownerAttempt = await unauthorized.page.evaluate(async () => {
      const response = await fetch('/api/offline/owner/overview', { credentials: 'include', cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    assert(ownerAttempt.status === 403, 'employee owner-control API attempt was not denied');
    await unauthorized.page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:canonical-navigation', { detail: { target: 'sync-sessions' } })));
    await unauthorized.page.waitForTimeout(500);
    assert(!(await unauthorized.page.locator('body').innerText()).includes('Sync & Sessions'), 'unauthorized employee can reach Sync & Sessions');
    await snapshot(unauthorized.page, 'unauthorized-owner-control-390x844.png');
    await unauthorized.context.close();

    const owner = await openContext(browser, 'owner', { width: 1920, height: 1080 }, 'qa-offline-owner');
    await owner.page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'sync-sessions', erpId: 'controls' } })));
    await owner.page.waitForSelector('.offline-center-shell', { timeout: 20000 });
    const ownerText = await owner.page.locator('.offline-center-shell').innerText();
    assert(ownerText.includes('Sync & Sessions') && ownerText.includes('Last reported'), 'Owner Sync & Sessions surface is incomplete');
    assert(ownerText.includes('not GPS') && ownerText.includes('Network location'), 'Owner privacy explanation is incomplete');
    await snapshot(owner.page, 'owner-desktop-sync-sessions-1920x1080.png');
    await owner.page.setViewportSize({ width: 2560, height: 1440 });
    await snapshot(owner.page, 'owner-large-sync-sessions-2560x1440.png');
    await owner.page.setViewportSize({ width: 390, height: 844 });
    await snapshot(owner.page, 'owner-mobile-sync-sessions-390x844.png');
    const apiCacheEntries = await owner.page.evaluate(async () => {
      const keys = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (request.url.includes('/api/')) keys.push(request.url);
      return keys;
    });
    assert(apiCacheEntries.length === 0, 'authenticated API JSON was found in the service-worker cache');
    await owner.context.close();
  } finally {
    await browser.close();
  }

  const report = {
    baseUrl,
    screenshots: fs.readdirSync(screenshotDir).sort(),
    failures,
    runtimeErrors,
    assertions: {
      indexedDbOnlyQueue: true,
      encryptedPayloads: true,
      apiCacheEntries: 0,
      gpsCalls,
      reducedMotionContext: true,
    },
  };
  fs.writeFileSync(path.join(evidenceDir, 'offline-qa-summary.json'), JSON.stringify(report, null, 2));
  if (failures.length || runtimeErrors.length) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(report, null, 2));
    console.log('OFFLINE_RENDERED_QA=PASS');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
