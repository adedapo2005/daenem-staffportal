import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4174';
const widths = [390, 430, 768, 1024, 1366, 1672, 1920, 2560, 3840];
const evidencePath = path.join(process.cwd(), 'qa-artifacts', 'access-control-revocation-qa');
fs.mkdirSync(evidencePath, { recursive: true });
const results = [], failures = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    if (process.env.QA_WIDTH && Number(process.env.QA_WIDTH) !== width) continue;
    const height = width < 768 ? 844 : width === 3840 ? 2160 : 1080;
    const context = await browser.newContext({
      viewport: { width, height }, reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [], held = [];
    let companyId = 'company-a', authenticated = true, holdAuth = false, authCalls = 0;
    const authResponse = () => ({
      authenticated,
      context: authenticated ? {
        sessionId: 'qa-auth-session-' + companyId,
        employee: { id: 'qa-employee', displayName: 'QA Employee', status: 'active', timezone: 'Africa/Lagos' },
        companies: [{ id: companyId, code: 'QA', name: companyId === 'company-a' ? 'Alpha Test Company' : 'Beta Test Company', primary: true }],
        roles: [{ id: 'qa-manager', code: 'manager', name: 'Manager', companyId }],
        permissions: { 'roles.access': 'manage', 'users.access': 'manage' },
        companyPermissions: { [companyId]: { 'roles.access': 'manage', 'users.access': 'manage' } },
      } : undefined,
    });
    const send = (route, payload) => route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(payload),
    });
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.route('**/api/**', async route => {
      const uri = new URL(route.request().url());
      if (uri.pathname === '/api/auth/me') {
        authCalls++;
        const snapshot = authResponse();
        if (holdAuth) {
          await new Promise(resolve => { held.push(() => resolve()); });
          return send(route, snapshot);
        }
        return send(route, snapshot);
      }
      if (uri.pathname === '/api/access-control/overview') {
        const requestedCompany = uri.searchParams.get('companyId');
        return send(route, {
          company: { id: requestedCompany, name: requestedCompany === 'company-a' ? 'Alpha Test Company' : 'Beta Test Company' },
          roles: [{ id: 'qa-manager', code: 'manager', name: 'Manager', companyId: requestedCompany, description: '' }],
          employees: [], rolePermissions: [], permissions: [], overrides: [],
          permissionLevels: ['none', 'view', 'create', 'edit', 'approve', 'manage'],
          canManageBusinessAssignments: false, canManageGeneralRoles: false,
        });
      }
      if (uri.pathname === '/api/access-control/history') return send(route, { changes: [] });
      if (uri.pathname === '/api/experience/layout') return send(route, { preference: { layoutId: 'focus-flow', density: 'standard', motion: 'reduced' }, canChoose: false });
      if (uri.pathname === '/api/offline/bootstrap') return send(route, { ok: true, operations: [], policy: { enabled: false, allowedOperations: [] } });
      if (uri.pathname === '/api/support/mine') return send(route, { commands: [], assistanceRequests: [] });
      return send(route, route.request().method() === 'GET' ? {} : { ok: true });
    });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.locator('.postauth-module-envelope').first().waitFor({ state: 'attached', timeout: 15000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'access' } })));
      const launcher = page.locator('#access-control-launcher .access-control-launcher');
      // Module Hub opens this workspace by event; its independent floating
      // launcher can be intentionally hidden by the canonical shell.
      await page.locator('#access-control-launcher .access-shell').waitFor({ state: 'visible', timeout: 15000 });
      assert.match(await page.locator('#access-control-launcher').innerText(), /Alpha Test Company/);
      const before = authCalls;
      holdAuth = true;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.locator('#access-control-launcher .access-shell').waitFor({ state: 'detached', timeout: 3000 });
      assert.ok(authCalls > before, 'focus must request fresh server authority, not 15s cache');
      authenticated = false;
      await page.evaluate(() => window.dispatchEvent(new Event('daenem-auth-changed')));
      holdAuth = false;
      for (const release of held.splice(0)) release();
      await page.waitForTimeout(3200);
      assert.equal(await launcher.count(), 0, 'revocation must hide privileged launcher after stale response');
      assert.equal(await page.locator('#access-control-launcher .access-shell').count(), 0, 'revocation must purge visible privileged data');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert.equal(overflow, false, 'page horizontal overflow');
      assert.deepEqual(errors, [], 'browser runtime errors');
      await page.screenshot({ path: path.join(evidencePath, 'revoked-' + width + '.png'), fullPage: false });
      results.push({ width, authCalls, overflow, runtimeErrors: errors.length, revokedHidden: true });
    } catch (error) {
      failures.push(width + ': ' + error.message);
      results.push({ width, failed: error.message, runtimeErrors: errors });
    } finally {
      for (const release of held.splice(0)) release();
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const report = { generatedAt: new Date().toISOString(), source: 'local Vite development client, mocked auth/API', results, failures, productionMutated: false };
fs.writeFileSync(path.join(evidencePath, 'result.json'), JSON.stringify(report, null, 2));
assert.deepEqual(failures, [], failures.join('\n'));
console.log('ACCESS_CONTROL_REVOKE_NINE_WIDTH_QA=' + results.length + '/9 PASS');
