import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4176';
const output = path.join(process.cwd(), 'qa-artifacts', 'group-erp-payments-company-qa');
fs.mkdirSync(output, { recursive: true });
const results = [], failures = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of (process.env.QA_ONE_CASE ? [390] : [390, 1366])) for (const response of (process.env.QA_ONE_CASE ? ['success'] : ['success', 'denied'])) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    let membership = 'both', authReads = 0, heldRequest, postCount = 0, activityWrites = 0;
    let releaseDone = false;
    const companies = [
      { id: 'company-a', name: 'Alpha Operations', code: 'ALPHA', primary: true },
      { id: 'company-b', name: 'Beta Operations', code: 'BETA', primary: false },
    ];
    const seenPayrollCompanies = [];
    await page.route('**/api/**', async route => {
      const req = route.request(), target = new URL(req.url()), p = target.pathname, method = req.method();
      const send = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(data) });
      if (p === '/api/auth/me') {
        authReads++;
        return send({ authenticated: true, context: {
          sessionId: 'qa-unchanged-payroll-session',
          employee: { id: 'qa-payroll-employee', displayName: 'QA Payroll Employee', status: 'active', timezone: 'Africa/Lagos' },
          companies: membership === 'both' ? companies : [companies[1]],
          roles: [{ id: 'qa-role', code: 'manager', name: 'Manager', companyId: 'company-a' }],
          permissions: { 'payroll.access': 'edit' },
          companyPermissions: { 'company-a': { 'payroll.access': 'edit' }, 'company-b': { 'payroll.access': 'view' } },
        } });
      }
      if (p === '/api/experience/layout') return send({ preference: { layoutId: 'focus-flow', density: 'standard', motion: 'reduced' }, canChoose: false, canManage: false, canAccess: false });
      if (p === '/api/offline/bootstrap') return send({ ok: true, serverTime: '2026-10-09T14:00:00Z', businessTimezone: 'Africa/Lagos', session: { id: 'qa-unchanged-payroll-session', expiresAt: '2030-10-09T14:00:00Z' }, policy: { enabled: true, maxQueueCount: 50, allowedOperations: [] }, operations: [] });
      if (p === '/api/offline/telemetry') return send({ ok: true });
      if (p === '/api/support/mine') return send({ commands: [], assistanceRequests: [] });
      if (p === '/api/payroll/runs') {
        const c = target.searchParams.get('companyId');
        seenPayrollCompanies.push(c);
        return send({ runs: [{ id: c === 'company-a' ? 'run-a' : 'run-b', runNo: c === 'company-a' ? 'RUN-A' : 'RUN-B', periodStart: '2026-10-01', periodEnd: '2026-10-31', payDate: '2026-10-31', status: 'approved', totalNetKobo: 250000 }] });
      }
      if (p === '/api/payroll/banks') return send({ banks: [{ bankKey: 'KUDA', name: 'Kuda', category: 'bank', paymentAdapter: 'manual', directApiAvailable: 0 }] });
      if (p === '/api/payroll/payment-batches' && method === 'GET') return send({ batches: [] });
      if (p === '/api/payroll/payment-batches' && method === 'POST') { postCount++; heldRequest = route; return; }
      if (p === '/api/activity/record') {
        try { if (JSON.parse(req.postData() || '{}').action === 'bank_payment_draft_created') activityWrites++; } catch {}
        return send({ ok: true });
      }
      if (p.startsWith('/api/')) return send(method === 'GET' ? {} : { ok: true });
      return route.continue();
    });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.locator('.postauth-module-envelope').first().waitFor({ state: 'attached', timeout: 20000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'payroll-payments' } })));
      await page.locator('#group-erp-admin-root').waitFor({ state: 'attached', timeout: 20000 });
      for (let i = 0; i < 15; i++) {
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:open-group-erp', { detail: { tab: 'payments' } })));
        if (await page.locator('.gea-shell').count()) break;
        await page.waitForTimeout(200);
      }
      await page.locator('.gea-shell').waitFor({ timeout: 12000 });
      const selector = page.getByLabel('Payroll Company');
      await page.getByLabel('Approved payroll').selectOption('run-a', { timeout: 12000 });
      await page.getByRole('button', { name: 'Create Payment Draft' }).click();
      for (let i = 0; i < 100 && !heldRequest; i++) await page.waitForTimeout(25);
      assert.equal(postCount, 1, 'exactly one held payment draft request');
      assert.ok(heldRequest, 'mock payment POST intercepted');
      membership = 'company-b-only';
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(() => {
        const s = document.querySelector('select[aria-label="Payroll Company"]');
        return s && s.options.length === 1 && s.value === 'company-b';
      }, { timeout: 12000 });
      assert.ok(authReads >= 2, 'fresh authority read within auth cache TTL');
      const readsAfterSwitch = seenPayrollCompanies.filter(c => c === 'company-a').length;
      assert.equal(await page.getByRole('button', { name: 'Create Payment Draft' }).isDisabled(), true, 'company B viewer cannot draft');
      const status = response === 'success' ? 200 : 403;
      await heldRequest.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response === 'success' ? { message: 'Created draft', batch: { batchNo: 'MEMBERSHIP-A-PRIVATE' } } : { error: 'MEMBERSHIP-A-DENIED' }) });
      releaseDone = true;
      await page.waitForTimeout(400);
      const shown = await page.locator('.gea-shell').innerText();
      assert.ok(!shown.includes('MEMBERSHIP-A-PRIVATE') && !shown.includes('MEMBERSHIP-A-DENIED') && !shown.includes('Created draft'), 'stale payment response not rendered');
      assert.equal(activityWrites, 0, 'no obsolete client activity write');
      assert.equal(seenPayrollCompanies.filter(c => c === 'company-a').length, readsAfterSwitch, 'no old company reload after late response');
      assert.deepEqual(runtimeErrors, [], 'no browser runtime errors');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, 'no horizontal overflow');
      await page.screenshot({ path: path.join(output, 'payroll-membership-race-' + width + '-' + response + '.png'), fullPage: false });
      results.push({ width, response, passed: true, authReads, postCount, activityWrites, oldCompanyReloadAfterResponse: 0, runtimeErrors: runtimeErrors.length });
    } catch (error) {
      const selectedCompany = await page.getByLabel('Payroll Company').inputValue().catch(() => 'missing');
      const runOptions = await page.getByLabel('Approved payroll').locator('option').allTextContents().catch(() => []);
      failures.push(width + ' ' + response + ': ' + error.message + ' DIAG=' + JSON.stringify({ selectedCompany, runOptions, seenPayrollCompanies, authReads }));
    } finally {
      if (heldRequest && !releaseDone) try { await heldRequest.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"mock abort"}' }); } catch {}
      await context.close();
    }
  }
} finally { await browser.close(); }
const evidence = { generatedAt: new Date().toISOString(), source: 'StaffPortal current non-production built client + isolated mock API', unchangedSessionRolePermissions: true, results, failures, productionMutated: false };
fs.writeFileSync(path.join(output, 'result-membership-race.json'), JSON.stringify(evidence, null, 2));
assert.deepEqual(failures, [], failures.join('\n'));
console.log('Payroll membership-only race QA PASS ' + results.length + '/4');
