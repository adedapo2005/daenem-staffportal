import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4184';
const artifactDir = 'qa-artifacts/onedrive-admin-qa';
await mkdir(artifactDir, { recursive: true });
const widths = process.env.QA_WIDTH ? [Number(process.env.QA_WIDTH)] : [390, 1366, 3840];
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];

try {
  for (const width of widths) {
    for (const scenario of ['owner', 'regular']) {
      const context = await browser.newContext({
        viewport: { width, height: width < 500 ? 844 : 1024 },
        reducedMotion: 'reduce', serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('dialog', (dialog) => { void dialog.accept(); });
      let revoked = false;
      let retryRequests = 0;
      let storageRequests = 0;
      let forbiddenStorageRequests = 0;
      let jobStatus = 'failed';
      const employeeContext = () => ({
        sessionId: 'qa-storage-session', employee: {
          id: 'qa-storage-user', displayName: 'QA Storage User', status: 'active',
          preferredTheme: 'unified-daylight', timezone: 'Africa/Lagos',
        },
        companies: [{ id: 'company-a', code: 'A', name: 'Company A', primary: true }],
        roles: revoked ? [] : [{
          id: scenario === 'owner' ? 'owner-role' : 'staff-role',
          code: scenario === 'owner' ? 'owner' : 'employee',
          name: scenario === 'owner' ? 'Owner' : 'Employee', companyId: 'company-a',
        }],
        permissions: { 'dashboard.access': 'view', 'settings.access': 'manage' },
        companyPermissions: { 'company-a': { 'dashboard.access': 'view', 'settings.access': 'manage' } },
      });
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const send = (data, status = 200) => route.fulfill({
          status, contentType: 'application/json',
          headers: { 'cache-control': 'no-store' },
          body: JSON.stringify(data),
        });
        if (pathname === '/api/auth/me') return send({ authenticated: true, context: employeeContext() });
        if (pathname.startsWith('/api/admin/storage/')) {
          storageRequests += 1;
          if (revoked || scenario !== 'owner') forbiddenStorageRequests += 1;
          if (revoked || scenario !== 'owner') return send({ error: 'Forbidden' }, 403);
          if (pathname === '/api/admin/storage/onedrive/config') return send({
            provider: 'Microsoft OneDrive', configured: false,
            applicationConfigurationPresent: false, authorizationEnabled: false,
            liveTransferEnabled: false, setupStatus: 'owner_action_required', updatedAt: null,
          });
          if (pathname === '/api/admin/storage/mirror-health') return send({
            provider: 'Microsoft OneDrive', primaryStorage: 'Cloudflare R2',
            providerStatus: 'provider_required', syncHealth: 'attention_required',
            pendingCount: 4, failedCount: jobStatus === 'failed' ? 2 : 1,
            lastSuccessfulSync: null, liveAuthorizationEnabled: false,
            counts: { mirrored: 0, pending: 2, failed: jobStatus === 'failed' ? 2 : 1, retrying: 0 },
          });
          if (pathname === '/api/admin/storage/mirror-jobs') return send({ jobs: [{
            id: 'qa-job-one', sourceModule: 'hr', status: jobStatus, attemptCount: 2,
            lastErrorCode: jobStatus === 'failed' ? 'RETRY_EXHAUSTED' : null,
            nextAttemptAt: null, createdAt: '2026-10-08T12:00:00.000Z',
            updatedAt: '2026-10-08T12:05:00.000Z', syncedAt: null,
          }] });
          if (pathname === '/api/admin/storage/mirror-retry') {
            retryRequests += 1;
            assert.deepEqual(request.postDataJSON(), { jobIds: ['qa-job-one'] });
            jobStatus = 'pending';
            return send({ ok: true, queuedForRetry: 1, unavailableOrOutOfScope: 0 });
          }
          return send({ error: 'Not Found' }, 404);
        }
        if (pathname === '/api/admin/locations') return send({ locations: [] });
        if (pathname === '/api/admin/settings') return send({ settings: {} });
        if (pathname === '/api/admin/scoped-settings') return send({
          settingKey: 'security.password_recovery_methods',
          global: { value: 'email', source: 'global' },
          companies: [], canSetGlobal: scenario === 'owner',
        });
        if (pathname === '/api/experience/layout') return send({
          preference: { layoutId: 'focus-flow', density: 'standard', motion: 'reduced' },
          canChoose: false, canManage: false, canAccess: false,
        });
        if (pathname === '/api/support/mine') return send({ commands: [], assistanceRequests: [] });
        if (pathname === '/api/offline/bootstrap') return send({
          ok: true, serverTime: '2026-10-08T14:00:00.000Z',
          businessTimezone: 'Africa/Lagos',
          session: { id: 'qa-storage-session', expiresAt: '2030-10-08T14:00:00.000Z' },
          policy: { enabled: true, maxQueueCount: 50, allowedOperations: [] },
          operations: [],
        });
        return send(request.method() === 'GET' ? {} : { ok: true });
      });
      let detail = '';
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.locator('#root').waitFor({ state: 'attached', timeout: 20000 });
        await page.waitForTimeout(2200);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', {
          detail: { id: 'admin' },
        })));
        await page.getByRole('heading', { name: 'Workforce Setup Center' }).waitFor({
          state: 'visible', timeout: 20000,
        });
        const heading = page.getByRole('heading', { name: 'Cloud Storage & Backup' });
        if (scenario === 'owner') {
          await heading.waitFor({ state: 'visible', timeout: 12000 });
          await page.locator('.onedrive-admin-counts').getByText('4 Backup Pending', { exact: true }).waitFor({ state: 'visible', timeout: 12000 });
          assert.equal(await page.getByText('Provider Required', { exact: true }).count() > 0, true,
            'Unconfigured Microsoft provider was falsely shown healthy');
          assert.equal(await page.getByRole('button', { name: 'Retry Failed Job' }).count(), 1);
          assert.equal(await page.locator('.onedrive-admin-counts').getByText('0 Mirrored', { exact: true }).count(), 1);
          await page.getByRole('button', { name: 'Retry Failed Job' }).click();
          await page.getByText('Retry request queued.', { exact: false }).waitFor({
            state: 'visible', timeout: 12000,
          });
          assert.equal(retryRequests, 1, 'One failed job should create exactly one retry request');
          assert.equal(await page.getByRole('button', { name: 'Retry Failed Job' }).count(), 0,
            'Already queued job still exposes retry button');
          await page.screenshot({ path: artifactDir + '/owner-' + width + '.png', fullPage: true });
          revoked = true;
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
          await page.getByText('Storage administration data is unavailable.', { exact: false }).waitFor({
            state: 'visible', timeout: 12000,
          });
          assert.equal(await page.locator('.onedrive-admin-job').count(), 0, 'Revoked mirror job remained rendered');
          assert.equal(await page.locator('.onedrive-admin-counts').count(), 0, 'Revoked mirror counts remained rendered');
          assert.equal(forbiddenStorageRequests, 0, 'Storage metadata requested after revocation');
        } else {
          assert.equal(await heading.count(), 0, 'Non-owner rendered OneDrive Admin section');
          assert.equal(storageRequests, 0, 'Non-owner requested protected OneDrive API');
          await page.screenshot({ path: artifactDir + '/regular-denied-' + width + '.png', fullPage: true });
        }
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          panelOverflow: [...document.querySelectorAll('.admin-setup-shell')].map((el) => el.scrollWidth - el.clientWidth),
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        }));
        assert.ok(layout.overflow <= 1, 'Horizontal page overflow');
        assert.ok(layout.panelOverflow.every((value) => value <= 1), 'Admin panel horizontal overflow');
        assert.equal(layout.reducedMotion, true);
        assert.deepEqual(errors, []);
        detail = 'PASS';
        results.push({ scenario, width, result: 'PASS', storageRequests, retryRequests, forbiddenStorageRequests, layout });
      } catch (error) {
        detail = error.stack || String(error);
        const bodyText = await page.locator('body').innerText().catch(() => 'Unavailable');
        await page.screenshot({ path: artifactDir + '/failed-' + scenario + '-' + width + '.png', fullPage: true }).catch(() => undefined);
        failures.push({ scenario, width, error: detail, browserErrors: errors, bodyText: bodyText.slice(0, 1200) });
        results.push({ scenario, width, result: 'FAIL', storageRequests, retryRequests, forbiddenStorageRequests });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(artifactDir + '/result.json', JSON.stringify({ results, failures }, null, 2));
console.log(JSON.stringify({ passes: results.filter((item) => item.result === 'PASS').length, total: results.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
