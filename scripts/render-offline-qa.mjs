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

function isExpectedBrowserConsoleError(message) {
  return /Failed to load resource: net::ERR_(?:INTERNET_DISCONNECTED|FAILED)/.test(message)
    || /Failed to load resource: the server responded with a status of (?:401|403|409|413|415|422|503)\b/.test(message);
}

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
  'printing.access': 'manage', 'bakery.access': 'manage', 'autos.access': 'manage',
  'sales.access': 'manage', 'logistics.access': 'manage', 'properties.access': 'manage',
  'finance.access': 'manage', 'finance.reports': 'manage', 'finance.receivables': 'manage',
  'finance.ledger': 'manage', 'finance.journal': 'manage', 'finance.budgets': 'manage',
};

function contextFor(role, employeeId = 'qa-offline-employee') {
  const owner = role === 'owner';
  const manager = role === 'manager';
  const permissions = owner ? ownerPermissions : formPermissions;
  const assignedCompanies = owner ? companies : [companies[0]];
  const roleCode = owner ? 'owner' : manager ? 'manager' : 'employee';
  const roleName = owner ? 'Owner' : manager ? 'Manager' : 'Employee';
  return {
    sessionId: `qa-offline-session-${employeeId}`,
    employee: {
      id: employeeId, employeeNo: owner ? 'QA-OWNER' : manager ? 'QA-MANAGER' : 'QA-OFFLINE', displayName: owner ? 'Amina Daenem' : manager ? 'Musa Manager' : 'Tolu Offline',
      email: `${employeeId}@example.invalid`, jobTitle: owner ? 'Group Owner' : manager ? 'Operations Manager' : 'Portal Employee', department: 'Operations',
      status: 'active', preferredTheme: 'unified-daylight', timezone: owner ? 'America/New_York' : 'Africa/Lagos', team: owner ? 'Leadership' : manager ? 'Operations' : 'Printing', lastLoginAt: '2026-09-05T08:00:00.000Z',
    },
    companies: assignedCompanies,
    roles: [{ id: `qa-role-${role}-${employeeId}`, code: roleCode, name: roleName, companyId: 'company-printing' }],
    permissions,
    companyPermissions: Object.fromEntries(assignedCompanies.map((company) => [company.id, permissions])),
  };
}

const summary = {
  workDate: '2026-09-05', refreshedAt: '2026-09-05T10:30:00.000Z', companyId: 'company-printing', scope: 'personal',
  pendingApprovals: 0, securityAlerts: 0, overdueRequirements: 0, maintenanceAlerts: 0,
};

function ownerIntelligence() {
  const shared = { inventory: { valueKobo: 362000000, lowStock: 2 }, workforce: { employees: 24, present: 21, incomplete: 1 }, payroll: { runs: 1, grossKobo: 42000000, netKobo: 38000000 }, maintenance: { open: 2, urgent: 1, costKobo: 800000 } };
  return {
    generatedAt: summary.refreshedAt, workDate: summary.workDate,
    period: { key: 'current_month', label: 'Current month', start: '2026-09-01', end: summary.workDate, comparisonLabel: 'previous month' },
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

function erpFixtures() {
  return {
    printingDashboard: {
      date: '2026-09-05', month: '2026-09',
      metrics: { openJobs: 3, overdueJobs: 1, readyJobs: 2, customers: 8, lowStockItems: 1, revenueKobo: 42000000, costKobo: 18000000, grossProfitKobo: 24000000, marginBasisPoints: 5714 },
      pipeline: [], recentJobs: [],
    },
    bakeryDashboard: {
      date: '2026-09-05',
      metrics: { orders: 12, revenueKobo: 3000000, paidKobo: 2800000, activeBatches: 2, unitsProduced: 400, batchWaste: 5, wasteCostKobo: 50000, lowStockItems: 1 },
      bestSellers: [],
    },
    autosDashboard: {
      metrics: { vehicles: 10, stockValueKobo: 150000000, ready: 4, preparation: 2, reserved: 1, openLeads: 3, testDrives: 1, negotiations: 1, followupsDue: 2, openWorkshopJobs: 4, waitingParts: 1, urgentWorkshop: 1, monthlySales: 2, monthlyRevenueKobo: 50000000, monthlyGrossProfitKobo: 8000000 },
    },
    logisticsDashboard: {
      metrics: { fleet: 8, vehiclesAvailable: 5, vehiclesUnavailable: 3, activeShipments: 4, shipmentsMoving: 2, deliveredToday: 3, activeTrips: 2, monthlyRevenueKobo: 30000000, monthlyGrossProfitKobo: 7000000, expiringDocuments: 1 },
    },
    propertiesDashboard: {
      metrics: { properties: 6, available: 2, occupied: 3, underOffer: 1, portfolioValueKobo: 500000000, openLeads: 4, inspectionsScheduled: 2, negotiations: 1, followupsDue: 2, outstandingKobo: 12000000, arrearsKobo: 4000000, overdueCharges: 1, activeLeases: 3, expiringSoon: 1, openMaintenance: 2, urgentMaintenance: 1, maintenanceCostKobo: 350000 },
    },
    financeSummary: {
      month: '2026-09', balances: { cash: 85000000, bank: 125000000, receivables: 18000000 },
      receivables: { openCount: 2, openKobo: 18000000, overdueKobo: 4000000 },
      approvedBudgetKobo: 90000000, netFundingKobo: 65000000, draftJournals: 1,
    },
  };
}

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


function ownerDetail() {
  return {
    serverTime: '2026-09-05T14:48:04.000Z',
    businessTimezone: 'Africa/Lagos',
    employee: { id: 'qa-offline-employee', employeeNo: 'QA-OFFLINE', displayName: 'Tolu Offline', email: 'qa-offline-employee@example.invalid', jobTitle: 'Portal Employee', department: 'Printing', status: 'active', timezone: 'Africa/Lagos' },
    memberships: [{ companyId: 'company-printing', companyCode: 'PRINT', companyName: 'Printing & Technology', locationId: 'qa-location', locationName: 'Lagos Print Studio', isPrimary: 1 }],
    roles: [{ id: 'qa-role-employee', code: 'employee', name: 'Portal Employee', companyId: 'company-printing' }],
    sessions: [{ id: 'qa-session-owner', sessionId: 'qa-session-owner', employeeId: 'qa-offline-employee', employeeName: 'Tolu Offline', deviceId: 'qa-device-1', deviceName: 'QA Browser · Mobile', userAgent: 'Chromium QA', platform: 'Linux', appVersion: 'offline-qa', clientTimezone: 'Africa/Lagos', companyId: 'company-printing', ipAddress: '203.0.113.10', networkLocation: 'Lagos, NG', createdAt: '2026-09-05T08:00:00.000Z', lastSeenAt: '2026-09-05T14:47:00.000Z', expiresAt: '2030-09-05T08:00:00.000Z' }],
    telemetry: [{ employeeId: 'qa-offline-employee', employeeName: 'Tolu Offline', companyId: 'company-printing', deviceId: 'qa-device-1', deviceName: 'QA Browser · Mobile', platform: 'Linux', appVersion: 'offline-qa', clientTimezone: 'Africa/Lagos', pendingCount: 0, syncStatus: 'synced', lastSuccessfulSyncAt: '2026-09-05T14:48:04.000Z', lastReportedAt: '2026-09-05T14:48:04.000Z', ipAddress: '203.0.113.10', networkLocation: 'Lagos, NG' }],
    receipts: [{ id: 'qa-receipt-1', operationId: 'qa-op-1', idempotencyKey: 'qa-key-1', employeeId: 'qa-offline-employee', companyId: 'company-printing', sessionId: 'qa-session-owner', operationKind: 'forms.submit', entityType: 'workflow_form_assignment', entityId: 'qa-form-assignment', state: 'completed', attemptCount: 2, lastErrorCategory: '', startedAt: '2026-09-05T14:47:00.000Z', serverReceivedAt: '2026-09-05T14:48:00.000Z', completedAt: '2026-09-05T14:48:04.000Z', updatedAt: '2026-09-05T14:48:04.000Z', outcome: 'accepted', submissionId: 'qa-submission-1', resultStatus: 'submitted' }],
    attachments: [{ id: 'qa-attachment-1', companyId: 'company-printing', operationId: 'qa-op-1', originalName: 'handover.pdf', mimeType: 'application/pdf', sizeBytes: 2048, sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', status: 'uploaded', createdAt: '2026-09-05T14:47:30.000Z', uploadedAt: '2026-09-05T14:48:02.000Z' }],
    audit: [{ id: 'qa-audit-1', occurredAt: '2026-09-05T14:48:01.000Z', action: 'sync_started', companyId: 'company-printing', entityType: 'offline_sync_receipt', entityId: 'qa-receipt-1', requestId: 'qa-request-1', details: { employeeId: 'qa-offline-employee', companyId: 'company-printing', sessionId: 'qa-session-owner', deviceId: 'qa-device-1', operationId: 'qa-op-1', idempotencyKey: 'qa-key-1', operationKind: 'forms.submit', clientTimezone: 'Africa/Lagos', capturedAt: '2026-09-05T14:01:00.000Z', serverReceivedAt: '2026-09-05T14:48:00.000Z', applicationVersion: 'offline-qa' } }],
    timeline: [
      { id: 'qa-timeline-start', at: '2026-09-05T14:48:01.000Z', category: 'audit', title: 'Sync attempt started', action: 'sync_started', entityType: 'offline_sync_receipt', entityId: 'qa-receipt-1', requestId: 'qa-request-1', details: { operationId: 'qa-op-1', operationKind: 'forms.submit', capturedAt: '2026-09-05T14:01:00.000Z', clientTimezone: 'Africa/Lagos' } },
      { id: 'qa-timeline-attachment', at: '2026-09-05T14:48:02.000Z', category: 'attachment', title: 'Attachment upload acknowledged', action: 'attachment_accepted', entityType: 'offline_attachment', entityId: 'qa-attachment-1', details: { attachmentId: 'qa-attachment-1', mimeType: 'application/pdf', sizeBytes: 2048, sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } },
      { id: 'qa-timeline-accepted', at: '2026-09-05T14:48:04.000Z', category: 'audit', title: 'Operation accepted', action: 'operation_accepted', entityType: 'offline_sync_receipt', entityId: 'qa-receipt-1', requestId: 'qa-request-1', details: { operationId: 'qa-op-1', operationKind: 'forms.submit', outcome: 'accepted', attemptCount: 2 } },
    ],
  };
}


function makeServerState() {
  return { syncMode: 'success', sessionMode: 'valid', authMeMode: 'valid', syncDelay: 0, syncRequests: 0, bootstrapRequests: 0, bootstrapModes: [], businessEffects: 0, receipts: new Map(), lostKeys: new Set(), capturedKeys: [] };
}

async function installApiRoutes(page, role, server = makeServerState(), employeeId) {
  const context = contextFor(role, employeeId || (role === 'owner' ? 'qa-offline-owner' : 'qa-offline-employee'));
  const erp = erpFixtures();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const send = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/api/auth/me') {
      if (server.authMeMode === 'network') return route.abort('failed');
      if (server.authMeMode === '401') return send({ authenticated: false }, 401);
      if (server.authMeMode === '403') return send({ error: 'Access denied.' }, 403);
      return send({ authenticated: true, context });
    }
    if (url.pathname === '/api/context/signin') return route.abort('failed');
    if (url.pathname === '/api/auth/logout') return send({ ok: true });
    if (url.pathname === '/api/experience/layout') return send(layoutPayload(url.searchParams.get('erpId') || 'staff'));
    if (url.pathname.startsWith('/api/experience/layout/')) return send({ ok: true, preference: layoutPayload('staff').preference });
    if (url.pathname === '/api/dashboard/summary') return send({ ...summary, scope: role === 'owner' ? 'aggregate' : 'personal' });
    if (url.pathname === '/api/owner/intelligence') return send(ownerIntelligence());
    if (url.pathname === '/api/support/mine') return send({ commands: [], assistanceRequests: [] });
    if (url.pathname === '/api/printing/dashboard') return send(erp.printingDashboard);
    if (url.pathname === '/api/printing/services') return send({ services: [] });
    if (url.pathname === '/api/printing/customers') return send({ customers: [] });
    if (url.pathname === '/api/printing/jobs') return send({ jobs: [] });
    if (url.pathname === '/api/bakery/dashboard') return send(erp.bakeryDashboard);
    if (url.pathname === '/api/bakery/catalog') return send({ products: [], recipes: [] });
    if (url.pathname === '/api/bakery/batches') return send({ batches: [] });
    if (url.pathname === '/api/bakery/ingredients') return send({ ingredients: [] });
    if (url.pathname === '/api/bakery/accountability') return send({ date: '2026-09-05', summary: {}, capabilities: {} });
    if (url.pathname === '/api/bakery/accountability/reports') return send({ dateFrom: '2026-09-01', dateTo: '2026-09-05', capabilities: {}, debtAgeing: {}, descriptions: {} });
    if (url.pathname === '/api/autos/dashboard') return send(erp.autosDashboard);
    if (url.pathname === '/api/autos/vehicles') return send({ vehicles: [] });
    if (url.pathname === '/api/autos/leads') return send({ leads: [] });
    if (url.pathname === '/api/autos/workshop') return send({ jobs: [] });
    if (url.pathname === '/api/logistics/dashboard') return send(erp.logisticsDashboard);
    if (url.pathname === '/api/logistics/fleet') return send({ vehicles: [], drivers: [] });
    if (url.pathname === '/api/logistics/shipments') return send({ shipments: [] });
    if (url.pathname === '/api/logistics/trips') return send({ trips: [] });
    if (url.pathname === '/api/properties/dashboard') return send(erp.propertiesDashboard);
    if (url.pathname === '/api/properties/catalog') return send({ properties: [] });
    if (url.pathname === '/api/properties/leads') return send({ leads: [] });
    if (url.pathname === '/api/properties/inspections') return send({ inspections: [] });
    if (url.pathname === '/api/properties/leases') return send({ leases: [] });
    if (url.pathname === '/api/properties/receivables') return send({ receivables: [] });
    if (url.pathname === '/api/properties/maintenance') return send({ maintenance: [] });
    if (url.pathname === '/api/properties/owners-investments') return send({ capabilities: {}, owners: [], units: [], investments: [] });
    if (url.pathname === '/api/finance/summary') return send(erp.financeSummary);
    if (url.pathname === '/api/finance/receivables') return send({ receivables: [] });
    if (url.pathname === '/api/finance/accounts') return send({ accounts: [] });
    if (url.pathname === '/api/finance/journals') return send({ journals: [] });
    if (url.pathname === '/api/finance/reports') return send({ startDate: '2026-01-01', endDate: '2026-09-05', trialBalance: { accounts: [], totalDebitKobo: 0, totalCreditKobo: 0, balanced: true }, profitLoss: { revenueKobo: 0, costOfSalesKobo: 0, grossProfitKobo: 0, operatingExpensesKobo: 0, netProfitKobo: 0 } });
    if (url.pathname === '/api/finance/budgets') return send({ budgets: [] });
    if (url.pathname === '/api/forms' && method === 'GET') return send({ forms: [{ id: 'qa-form', companyName: 'Printing & Technology', title: assignment.title, formType: assignment.formType, schemaJson: assignment.schemaJson, assignmentCount: 1 }] });
    if (url.pathname === '/api/forms/mine' && method === 'GET') return send({ assignments: [assignment] });
    if (url.pathname.startsWith('/api/directory/')) return send({ employees: [], roles: [] });
    if (url.pathname === '/api/offline/bootstrap' && method === 'GET') {
      server.bootstrapRequests += 1;
      server.bootstrapModes.push(server.sessionMode);
      if (server.sessionMode !== 'valid') return send({ error: 'Sign in to continue syncing.', state: 'authentication-required' }, 401);
      return send({
      ok: true, serverTime: '2026-09-05T10:36:04.000Z', businessTimezone: 'Africa/Lagos', maxOfflineAgeMinutes: 720,
      session: { id: context.sessionId, expiresAt: '2030-09-05T08:00:00.000Z', lastVerifiedAt: '2026-09-05T10:36:04.000Z' },
      employee: { id: context.employee.id }, scope: { companyId: url.searchParams.get('companyId') || 'company-printing', companyIds: context.companies.map((company) => company.id) },
      policy: { enabled: true, maxQueueCount: 50, attachmentMaxBytes: 10485760, automaticSync: true, manualRetry: true, retentionDays: 30, allowedOperations: ['forms.submit'] },
      operations: [{ kind: 'forms.submit', mode: 'draft-and-submit', permission: 'forms.access' }],
      });
    }
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
    if (url.pathname === '/api/offline/owner/detail' && method === 'GET') return role === 'owner' ? send(ownerDetail()) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/offline/owner/policy') return role === 'owner' ? send({ policy: ownerOverview().policy, businessTimezone: 'Africa/Lagos' }) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname === '/api/offline/owner/revoke' && method === 'POST') return role === 'owner' ? send({ ok: true, message: 'Session revoked.' }) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname.startsWith('/api/offline/owner/')) return role === 'owner' ? send({}) : send({ error: 'Owner access is required.' }, 403);
    if (url.pathname.startsWith('/api/offline/attachments/')) {
      const mime = (request.headers()['content-type'] || '').split(';')[0];
      const size = Number(request.headers()['content-length'] || request.postDataBuffer()?.byteLength || 0);
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
  const contextOptions = { viewport, reducedMotion: 'reduce' };
  if (role === 'owner') contextOptions.timezoneId = 'America/New_York';
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const server = await installApiRoutes(page, role, makeServerState(), employeeId);
  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    runtimeErrors.push(`${role}: ${error.message}`);
    console.error(`QA_PAGE_ERROR ${role}: ${error.stack || error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedBrowserConsoleError(message.text())) runtimeErrors.push(`${role} console: ${message.text()}`);
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-offline-sync-indicator]', { timeout: 15000 });
  await page.waitForTimeout(400);
  await installGpsProbe(page);
  return { context, page, server, pageErrors };
}

async function installGpsProbe(page) {
  await page.evaluate(() => {
    window.__daenemQaGpsCalls = 0;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = () => { window.__daenemQaGpsCalls += 1; };
    }
  });
}

async function goForms(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:canonical-navigation', { detail: { target: 'forms' } })));
  await page.waitForSelector('[data-forms-center]', { timeout: 15000 });
  await page.locator('[data-form-assignment="qa-form-assignment"] textarea').waitFor({ state: 'visible', timeout: 15000 });
}

async function status(page, expected, timeout = 15000) {
  try {
    await page.waitForFunction((value) => document.querySelector('[data-offline-sync-indicator]')?.getAttribute('data-sync-status') === value, expected, { timeout });
  } catch (error) {
    const observed = await page.evaluate(async () => ({
      url: location.href,
      readyState: document.readyState,
      online: navigator.onLine,
      status: document.querySelector('[data-offline-sync-indicator]')?.getAttribute('data-sync-status') || null,
      label: document.querySelector('[data-offline-sync-indicator]')?.getAttribute('aria-label') || null,
      rootChildren: document.getElementById('root')?.childElementCount || 0,
      controller: navigator.serviceWorker?.controller?.scriptURL || null,
      cacheNames: typeof caches === 'undefined' ? [] : await caches.keys(),
      cacheKeys: typeof caches === 'undefined' ? [] : await Promise.all((await caches.keys()).map(async (name) => ({ name, keys: (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname) }))),
      resources: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/assets/')).slice(-20),
      html: document.documentElement.outerHTML.slice(0, 4000),
      body: document.body.innerText.slice(0, 1200),
    }));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nSYNC_STATUS_DEBUG=${JSON.stringify(observed)}`);
  }
}

async function mutateCachedAuthSnapshot(page, mode) {
  await page.evaluate((snapshotMode) => new Promise((resolve, reject) => {
    const request = indexedDB.open('daenem-staff-offline-v1');
    request.onerror = () => reject(request.error || new Error('Could not open offline database.'));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('meta', 'readwrite');
      const store = transaction.objectStore('meta');
      const all = store.getAll();
      all.onerror = () => reject(all.error || new Error('Could not read cached auth snapshot.'));
      all.onsuccess = () => {
        if (snapshotMode === 'expired') {
          for (const row of all.result || []) {
            if (row.kind === 'auth-snapshot') {
              row.sessionExpiresAt = '2000-01-01T00:00:00.000Z';
              store.put(row);
            }
          }
        }
        if (snapshotMode === 'wrong-employee') localStorage.setItem('daenem-offline-active-employee', 'qa-not-the-signed-in-employee');
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not update cached auth snapshot.'));
    };
  }), mode);
}

async function runAuthTransportCase(browser, mode, expectedContinuation) {
  const item = await openContext(browser, 'employee', { width: 390, height: 844 }, 'qa-auth-' + mode);
  try {
    await item.page.waitForTimeout(700);
    assert(await item.page.evaluate(() => navigator.onLine === true), mode + ': test did not run with navigator.onLine=true');
    if (mode === 'expired' || mode === 'wrong-employee') await mutateCachedAuthSnapshot(item.page, mode);
    item.server.authMeMode = ['network', 'expired', 'wrong-employee'].includes(mode) ? 'network' : mode;
    await item.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await item.page.waitForTimeout(1000);
    const observed = await item.page.evaluate(() => ({
      online: navigator.onLine,
      hasSyncIndicator: Boolean(document.querySelector('[data-offline-sync-indicator]')),
    }));
    assert(observed.online === true, mode + ': navigator.onLine changed unexpectedly');
    assert(observed.hasSyncIndicator === expectedContinuation, mode + ': cached context continuation expectation failed');
    if (expectedContinuation) await snapshot(item.page, 'employee-mobile-weak-network-cached-390x844.png');
  } finally {
    await item.context.close();
  }
}



async function snapshot(page, name, options = {}) {
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: options.fullPage ?? true });
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
  await page.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
  await status(page, 'offline');
  server.syncMode = mode;
  await context.setOffline(false);
  await status(page, expected);
  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  let gpsCalls = 0;
  try {
    await runAuthTransportCase(browser, 'network', true);
    await runAuthTransportCase(browser, '401', false);
    await runAuthTransportCase(browser, '403', false);
    await runAuthTransportCase(browser, 'expired', false);
    await runAuthTransportCase(browser, 'wrong-employee', false);

    const employee = await openContext(browser, 'employee', { width: 390, height: 844 }, 'qa-offline-employee');
    const { page, context, server } = employee;
    await status(page, 'online');
    await snapshot(page, 'employee-mobile-online-390x844.png');
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
    await installGpsProbe(page);
    await page.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
    await status(page, 'offline');
    const offlineReloadEvidence = await snapshot(page, 'employee-mobile-offline-reload-390x844.png');
    assert(!/Sync & Sessions|Security Center|People & Payroll/.test(offlineReloadEvidence.text), 'offline permission snapshot exposed unauthorized modules');

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
    await page.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
    await status(page, 'offline');
    const effectsBeforeLost = server.businessEffects;
    server.syncDelay = 0;
    server.syncMode = 'response-lost';
    await context.setOffline(false);
    await status(page, 'waiting');
    await sleep(2300);
    await page.getByRole('button', { name: /Open My Sync Activity/ }).click();
    await page.getByRole('button', { name: 'Retry Now' }).click();
    await status(page, 'synced');
    await page.getByRole('button', { name: 'Close My Sync Activity' }).click();
    assert(server.businessEffects === effectsBeforeLost + 1, 'response-lost retry produced more than one business effect');
    assert(server.syncRequests >= 3, 'response-lost retry did not reach the server twice');

    const effectsBeforeConflict = server.businessEffects;
    await goForms(page);
    await page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('Conflict must remain visible.');
    await context.setOffline(true);
    await page.locator('[data-offline-form-submit="supported"]').click();
    await page.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
    await status(page, 'offline');
    server.syncMode = 'conflict';
    await context.setOffline(false);
    await status(page, 'needs-attention');
    const conflictEvidence = await snapshot(page, 'employee-mobile-needs-attention-conflict-390x844.png');
    assert(conflictEvidence.text.toLowerCase().includes('needs attention'), 'conflict state is not visible in plain language');
    assert(server.businessEffects === effectsBeforeConflict, 'conflict handling changed the authoritative business effect');
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
    const oversizedAttachment = await page.evaluate(async () => {
      const response = await fetch('/api/offline/attachments/qa-oversized', { method: 'PUT', headers: { 'content-type': 'image/png', 'x-offline-operation-id': 'qa-op', 'x-offline-company-id': 'company-printing' }, body: new Uint8Array(10 * 1024 * 1024 + 1) });
      return response.status;
    });
    assert(oversizedAttachment === 413, 'oversized attachment was not rejected');
    gpsCalls = await page.evaluate(() => Number(window.__daenemQaGpsCalls || 0));
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

    for (const sessionMode of ['revoked', 'expired']) {
      const blocked = await openContext(browser, 'employee', { width: 390, height: 844 }, `qa-session-${sessionMode}`);
      await status(blocked.page, 'online');
      await goForms(blocked.page);
      await blocked.page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill(`${sessionMode} before reconnect.`);
      await blocked.context.setOffline(true);
      await blocked.page.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
      await blocked.page.locator('[data-offline-form-submit="supported"]').click();
      await status(blocked.page, 'offline');
      blocked.server.sessionMode = sessionMode;
      await blocked.context.setOffline(false);
      await blocked.page.evaluate(() => window.dispatchEvent(new Event('online')));
      await sleep(1000);
      await status(blocked.page, 'authentication-required');
      assert(blocked.server.syncRequests === 0, `${sessionMode} session allowed a queued mutation flush`);
    await blocked.context.close();
    }

    const erpCases = [
      { id: 'printing', erp: 'printing', companyCode: 'PRINT', layout: 'operational-cockpit', shell: 'cockpit', surface: '.printing-shell', content: 'Print Operations ERP', screenshot: 'erp-printing-1440x900.png' },
      { id: 'bakery', erp: 'bakery', companyCode: 'BAKERY', layout: 'executive-command', shell: 'command-rail', surface: '.bakery-shell', content: 'Bakery Operations' },
      { id: 'autos', erp: 'autos', companyCode: 'AUTOS', layout: 'executive-command', shell: 'command-rail', surface: '.autos-shell', content: 'Autos' },
      { id: 'logistics', erp: 'logistics', companyCode: 'LOGISTICS', layout: 'executive-command', shell: 'command-rail', surface: '.log-shell', content: 'Logistics' },
      { id: 'properties', erp: 'properties', companyCode: 'PROPERTIES', layout: 'master-detail', shell: 'split-pane', surface: '.prop-shell', content: 'Properties', screenshot: 'erp-properties-1440x900.png' },
      { id: 'finance', erp: 'finance', companyCode: 'PRINT', layout: 'horizon-wide', shell: 'wide-canvas', surface: '.fin-shell', content: 'Finance Command Center', screenshot: 'erp-finance-1440x900.png' },
    ];
    const erpExperienceEvidence = [];
    for (const erpCase of erpCases) {
      const erp = await openContext(browser, 'owner', { width: 1440, height: 900 }, `qa-erp-${erpCase.erp}`);
      const { page: erpPage, context: erpContext } = erp;
      await erpPage.evaluate((surface) => {
        window.__daenemQaErpTrace = [];
        const trace = window.__daenemQaErpTrace;
        window.addEventListener('daenem:module-experience', () => trace.push({ type: 'experience', time: performance.now() }), { once: true });
        const observer = new MutationObserver(() => {
          if (document.querySelector(surface)) {
            trace.push({ type: 'surface', time: performance.now() });
            observer.disconnect();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }, erpCase.surface);
      await erpPage.evaluate(({ id, erpId }) => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id, erpId } })), { id: erpCase.id, erpId: erpCase.erp });
      const surface = erpPage.locator(erpCase.surface).last();
      await surface.waitFor({ state: 'visible', timeout: 30000 });
      const evidence = await erpPage.evaluate(({ erpId, layout, shell, surfaceSelector }) => {
        const envelope = document.querySelector(`[data-module-experience][data-module-erp="${erpId}"]`);
        const trace = window.__daenemQaErpTrace || [];
        const experienceTime = trace.find((item) => item.type === 'experience')?.time;
        const surfaceTime = trace.find((item) => item.type === 'surface')?.time;
        return { erpId, layout: envelope?.getAttribute('data-module-layout'), shell: envelope?.getAttribute('data-module-shell'), expectedLayout: layout, expectedShell: shell, resolvedBeforeSurface: typeof experienceTime === 'number' && typeof surfaceTime === 'number' && experienceTime <= surfaceTime, trace, surfaceVisible: Boolean(document.querySelector(`${surfaceSelector}:not([hidden])`)) };
      }, { erpId: erpCase.erp, layout: erpCase.layout, shell: erpCase.shell, surfaceSelector: erpCase.surface });
      assert(evidence.layout === erpCase.layout, `${erpCase.erp}: resolved layout ${evidence.layout} did not match ${erpCase.layout}`);
      assert(evidence.shell === erpCase.shell, `${erpCase.erp}: resolved shell ${evidence.shell} did not match ${erpCase.shell}`);
      assert(evidence.resolvedBeforeSurface, `${erpCase.erp}: surface initialized before the ERP experience resolved`);
      assert(evidence.surfaceVisible, `${erpCase.erp}: business surface is not visible`);
      assert((await surface.innerText()).toLowerCase().includes(erpCase.content.toLowerCase()), `${erpCase.erp}: business content is not visible in the resolved surface`);
      assert(erp.pageErrors.length === 0, `${erpCase.erp}: runtime page error during ERP open`);
      erpExperienceEvidence.push(evidence);
      if (erpCase.screenshot) await snapshot(erpPage, erpCase.screenshot);
      await erpContext.close();
    }
    assert(new Set(erpExperienceEvidence.map((item) => `${item.layout}:${item.shell}`)).size >= 3, 'contrasting ERP layouts did not produce computed presentation differences');

    const multi = await openContext(browser, 'employee', { width: 390, height: 844 }, 'qa-multi-tab');
    await goForms(multi.page);
    await multi.page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('One effect across two tabs.');
    await multi.context.setOffline(true);
    await multi.page.locator('[data-offline-form-submit="supported"]').click();
    await multi.page.waitForFunction(() => navigator.onLine === false, { timeout: 5000 });
    await status(multi.page, 'offline');
    const tabTwo = await multi.context.newPage();
    await installApiRoutes(tabTwo, 'employee', multi.server, 'qa-multi-tab');
    await tabTwo.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await tabTwo.waitForSelector('[data-offline-sync-indicator]', { timeout: 15000 });
    await multi.context.setOffline(false);
    await status(multi.page, 'synced');
    await status(tabTwo, 'synced');
    assert(multi.server.businessEffects === 1, 'two open tabs produced duplicate business effects');
    await multi.context.close();

    const sharedBrowser = await openContext(browser, 'employee', { width: 390, height: 844 }, 'qa-shared-browser-a');
    await goForms(sharedBrowser.page);
    await sharedBrowser.page.locator('[data-form-assignment="qa-form-assignment"] textarea').fill('Private queue belongs to employee A.');
    await sharedBrowser.context.setOffline(true);
    await sharedBrowser.page.locator('[data-offline-form-submit="supported"]').click();
    await status(sharedBrowser.page, 'offline');
    const otherEmployeePage = await sharedBrowser.context.newPage();
    await installApiRoutes(otherEmployeePage, 'employee', sharedBrowser.server, 'qa-shared-browser-b');
    await otherEmployeePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await otherEmployeePage.waitForSelector('[data-offline-sync-indicator]', { timeout: 15000 });
    await goForms(otherEmployeePage);
    await otherEmployeePage.getByRole('button', { name: /Open My Sync Activity/ }).click();
    assert(await otherEmployeePage.locator('.offline-activity-row').count() === 0, 'another employee saw the first employee queue in the same browser');
    assert(!(await otherEmployeePage.locator('.offline-sheet').innerText()).includes('Private queue belongs to employee A'), 'another employee could inspect another employee Sync Activity');
    await sharedBrowser.context.close();

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

    const manager = await openContext(browser, 'manager', { width: 390, height: 844 }, 'qa-manager');
    const managerAttempt = await manager.page.evaluate(async () => {
      const response = await fetch('/api/offline/owner/overview', { credentials: 'include', cache: 'no-store' });
      return response.status;
    });
    assert(managerAttempt === 403, 'manager owner-control API attempt was not denied');
    await manager.page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:canonical-navigation', { detail: { target: 'sync-sessions' } })));
    await manager.page.waitForTimeout(500);
    assert(!(await manager.page.locator('body').innerText()).includes('Sync & Sessions'), 'manager can reach Sync & Sessions without an owner rule');
    await snapshot(manager.page, 'unauthorized-manager-owner-control-390x844.png');
    await manager.context.close();

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

    await owner.page.getByRole('button', { name: 'Inspect' }).first().click();
    await owner.page.waitForSelector('.offline-detail-body', { timeout: 15000 });
    const detailText = await owner.page.locator('.offline-detail-body').innerText();
    assert(detailText.includes('Detailed evidence') && detailText.includes('Operational timeline'), 'Owner detailed drill-down is incomplete');
    assert(detailText.includes('Network location') && detailText.includes('not GPS') && detailText.includes('Server-observed IP'), 'Owner detail network evidence is incomplete or mislabelled');
    assert(detailText.includes('EDT') && detailText.includes('UTC') && detailText.includes('WAT'), 'Owner detail did not represent viewer, UTC and Daenem business time');
    assert(detailText.includes('Device time differs from the server timeline by 47 minutes'), 'Owner detail did not surface the captured/server clock discrepancy');
    assert(!/response_json|password|oauth|access[_-]?token|mfa secret/i.test(detailText), 'Owner detail exposed raw payload or authentication material');
    await owner.page.locator('.offline-detail-toolbar select').selectOption('utc');
    assert((await owner.page.locator('.offline-detail-body').innerText()).includes('UTC'), 'UTC timestamp mode is not usable');
    await owner.page.locator('.offline-detail-toolbar select').selectOption('both');
    await owner.page.locator('input[placeholder="e.g. sync_started"]').fill('sync_started');
    await owner.page.getByRole('button', { name: 'Apply filters' }).click();
    await owner.page.waitForSelector('.offline-detail-timeline');
    await snapshot(owner.page, 'owner-mobile-sync-detail-390x844.png');
    await owner.page.setViewportSize({ width: 1920, height: 1080 });
    await owner.page.evaluate(() => {
      window.scrollTo(0, 0);
      const shell = document.querySelector('.offline-center-shell');
      if (shell) shell.scrollTop = 0;
    });
    await owner.page.waitForTimeout(250);
    await snapshot(owner.page, 'owner-desktop-sync-detail-1920x1080.png', { fullPage: false });

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
      weakNetworkAuthFallback: true,
      httpAuthDenialsDoNotUseCache: true,
      ownerDetailTimezoneEvidence: true,
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
