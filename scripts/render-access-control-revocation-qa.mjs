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
    const assignmentRace = width === 390 || width === 3840;
    let releaseEmployeeA = null, releaseEmployeeB = null, assignmentMutationCount = 0;
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
          employees: assignmentRace ? [
            { id: 'employee-a', displayName: 'Employee A', status: 'active', roleIds: [], roleNames: [] },
            { id: 'employee-b', displayName: 'Employee B', status: 'active', roleIds: [], roleNames: [] },
          ] : [], rolePermissions: [], permissions: [], overrides: [],
          permissionLevels: ['none', 'view', 'create', 'edit', 'approve', 'manage'],
          canManageBusinessAssignments: assignmentRace, canManageGeneralRoles: false,
        });
      }
      if (uri.pathname === '/api/access-control/business-assignments' && assignmentRace) {
        const requestedEmployee = uri.searchParams.get('employeeId');
        if (requestedEmployee === 'employee-a') await new Promise(resolve => { releaseEmployeeA = resolve; });
        if (requestedEmployee === 'employee-b') await new Promise(resolve => { releaseEmployeeB = resolve; });
        return send(route, {
          employee: { id: requestedEmployee, displayName: requestedEmployee === 'employee-a' ? 'Employee A' : 'Employee B' },
          companies: [
            { id: 'company-a', code: 'A', name: 'Alpha Test Company' },
            { id: 'company-b', code: 'B', name: 'Beta Test Company' },
          ],
          roles: [], assignments: [{
            companyId: requestedEmployee === 'employee-a' ? 'company-a' : 'company-b',
            isPrimary: 1, active: 1,
            roleNames: [requestedEmployee === 'employee-a' ? 'ONLY EMPLOYEE A ROLE' : 'ONLY EMPLOYEE B ROLE'],
          }],
        });
      }
      if (uri.pathname === '/api/access-control/business-assignment' && assignmentRace) {
        assignmentMutationCount++;
        return send(route, { message: 'Synthetic assignment response' });
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
      await page.evaluate(() => {
        const origin = document.createElement('button');
        origin.id = 'qa-access-focus-origin';
        origin.textContent = 'Return focus after Access Control';
        origin.style.position = 'fixed';
        origin.style.left = '0';
        origin.style.top = '0';
        document.body.appendChild(origin);
        origin.focus();
        window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id: 'access' } }));
      });
      const launcher = page.locator('#access-control-launcher .access-control-launcher');
      // Module Hub opens this workspace by event; its independent floating
      // launcher can be intentionally hidden by the canonical shell.
      await page.locator('#access-control-launcher .access-shell').waitFor({ state: 'visible', timeout: 15000 });
      assert.match(await page.locator('#access-control-launcher').innerText(), /Alpha Test Company/);
      const dialog = page.getByRole('dialog', { name: 'Roles, Permissions & View-Only Control' });
      assert.equal(await page.locator('#access-control-launcher .access-shell').getAttribute('role'), 'dialog', 'live page must mount the changed dialog source');
      assert.equal(await dialog.count(), 1, 'privileged workspace must expose a named accessible dialog');
      assert.equal(await dialog.getAttribute('aria-modal'), 'true', 'privileged workspace must declare modal scope');
      assert.equal(await page.getByRole('button', { name: 'Refresh access controls' }).count(), 1, 'refresh must have a readable accessible name');
      const closeButton = page.getByRole('button', { name: 'Close Access Control' });
      assert.equal(await closeButton.count(), 1, 'close must have a readable accessible name');
      assert.equal(await page.locator('#qa-access-focus-origin').evaluate(element => element.inert), true, 'background focus origin must be inert while modal is open');
      assert.equal(await page.locator('.postauth-module-envelope').first().evaluate(element => Boolean(element.closest('[inert]'))), true, 'main application must be inert while modal is open');
      if (width === 390 || width === 3840) {
        const focusable = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
        assert.equal(await closeButton.evaluate(element => document.activeElement === element), true, 'modal must set initial keyboard focus');
        // A body-level portal can appear after the modal opens; synchronous focus
        // must stay inside and MutationObserver must inert it before the next paint.
        const synchronousFocusContained = await page.evaluate(() => {
          const late = document.createElement('button');
          late.id = 'qa-access-late-portal';
          late.textContent = 'Synthetic background action';
          document.body.appendChild(late);
          late.focus();
          return Boolean(document.querySelector('#access-control-launcher [role="dialog"]')?.contains(document.activeElement));
        });
        assert.equal(synchronousFocusContained, true, 'programmatic focus must not escape to a newly inserted external portal');
        await page.waitForFunction(() => document.getElementById('qa-access-late-portal')?.inert === true, null, { timeout: 3000 });
        assert.equal(await closeButton.evaluate(element => document.activeElement === element), true, 'late background portal must not steal modal focus');
        await dialog.evaluate((shell, selector) => {
          const controls = [...shell.querySelectorAll(selector)].filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
          controls.at(-1).focus();
        }, focusable);
        await page.keyboard.press('Tab');
        assert.equal(await dialog.evaluate((shell, selector) => {
          const controls = [...shell.querySelectorAll(selector)].filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
          return document.activeElement === controls[0];
        }, focusable), true, 'Tab from final modal control must wrap to first');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await dialog.evaluate((shell, selector) => {
          const controls = [...shell.querySelectorAll(selector)].filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
          return document.activeElement === controls.at(-1);
        }, focusable), true, 'Shift+Tab from first modal control must wrap to last');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached', timeout: 3000 });
        assert.equal(await page.locator('#qa-access-focus-origin').evaluate(element => document.activeElement === element && !element.inert), true, 'close must restore previous focus and remove background inertness');
        assert.equal(await page.locator('.postauth-module-envelope').first().evaluate(element => !element.closest('[inert]')), true, 'close must restore application interactivity');
        assert.equal(await page.locator('#qa-access-late-portal').evaluate(element => !element.inert), true, 'close must restore late portal interactivity');
        await page.locator('#qa-access-late-portal').evaluate(element => element.remove());
        // Reopen the existing authorized Access Control entry directly: the Module Hub
        // can still be completing its earlier lazy launch after the dialog is visible.
        await page.evaluate(() => window.dispatchEvent(new Event('daenem:open-access-control')));
        await dialog.waitFor({ state: 'visible', timeout: 3000 });
      }
      if (assignmentRace) {
        const employeeARequest = page.waitForRequest(request => request.url().includes('/api/access-control/business-assignments?') && request.url().includes('employeeId=employee-a'));
        await dialog.getByRole('button', { name: 'Business Assignments' }).click();
        await employeeARequest;
        const employeeBRequest = page.waitForRequest(request => request.url().includes('/api/access-control/business-assignments?') && request.url().includes('employeeId=employee-b'));
        await dialog.locator('.employee-list').getByRole('button', { name: /Employee B/ }).click();
        await employeeBRequest;
        await dialog.getByText('Loading business assignments…').waitFor({ state: 'visible', timeout: 3000 });
        assert.equal(await dialog.getByRole('button', { name: 'Assign Business & Role' }).isDisabled(), true, 'employee switch must disable mutation until new scoped assignments arrive');
        assert.equal(assignmentMutationCount, 0, 'pending Employee B read must not send an assignment mutation');
        for (let attempt = 0; attempt < 50 && !releaseEmployeeB; attempt++) await page.waitForTimeout(10);
        assert.ok(releaseEmployeeB, 'Employee B assignment response must be held during the mutation guard check');
        const employeeBResponse = page.waitForResponse(response => response.url().includes('/api/access-control/business-assignments?') && response.url().includes('employeeId=employee-b'));
        releaseEmployeeB();
        releaseEmployeeB = null;
        await employeeBResponse;
        await dialog.locator('.assignment-list').getByText('ONLY EMPLOYEE B ROLE').waitFor({ state: 'visible', timeout: 3000 });
        await dialog.locator('.business-assignment-form select').first().selectOption('company-b');
        await page.waitForFunction(() => [...document.querySelectorAll('.assignment-buttons button')].some(button => button.textContent?.includes('Remove Business Access') && !button.disabled), null, { timeout: 3000 }).catch(async error => {
          const state = await dialog.evaluate(shell => ({
            selectedEmployee: shell.querySelector('.employee-list button.active')?.textContent,
            assignmentStatus: shell.querySelector('.assignment-status')?.textContent,
            buttons: [...shell.querySelectorAll('.assignment-buttons button')].map(button => ({ text: button.textContent, disabled: button.disabled })),
            assignedBusiness: shell.querySelector('.assignment-list')?.textContent,
            reasonLength: shell.querySelector('.assignment-reason input')?.value?.length,
          }));
          throw new Error('valid Employee B mutation controls not ready: ' + JSON.stringify(state) + '; ' + error.message);
        });
        assert.equal(assignmentMutationCount, 0, 'successful Employee B read must not trigger any assignment mutation');
        for (let attempt = 0; attempt < 50 && !releaseEmployeeA; attempt++) await page.waitForTimeout(10);
        assert.ok(releaseEmployeeA, 'old Employee A request must be held until Employee B is rendered');
        const employeeAResponse = page.waitForResponse(response => response.url().includes('/api/access-control/business-assignments?') && response.url().includes('employeeId=employee-a'));
        releaseEmployeeA();
        releaseEmployeeA = null;
        await employeeAResponse;
        await page.waitForTimeout(100);
        assert.equal(await dialog.locator('.assignment-list').getByText('ONLY EMPLOYEE A ROLE').count(), 0, 'late Employee A assignment must not display for selected Employee B');
        assert.equal(await dialog.locator('.assignment-list').getByText('ONLY EMPLOYEE B ROLE').count(), 1, 'selected Employee B assignment must remain visible');
      }
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
      if (releaseEmployeeA) { releaseEmployeeA(); releaseEmployeeA = null; }
      if (releaseEmployeeB) { releaseEmployeeB(); releaseEmployeeB = null; }
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
