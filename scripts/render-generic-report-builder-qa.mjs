import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const widths = [390, 430, 768, 1024, 1366, 1672, 1920, 2560, 3840];
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    if (process.env.QA_WIDTH && Number(process.env.QA_WIDTH) !== width) continue;
    const ctx = await browser.newContext({
      viewport: { width, height: width === 3840 ? 2160 : width < 768 ? 844 : 1080 },
      reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    const errors = [], reportingRequests = [];
    page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('request', request => {
      if (/\/api\/(reports?([/?]|$)|reporting([/?]|$)|datasets?([/?]|$))/i.test(new URL(request.url()).pathname)) reportingRequests.push(request.url());
    });
    const respond = (route, payload) => route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'cache-control': 'no-store' }, body: JSON.stringify(payload) });
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/auth/me') return respond(route, { authenticated: true, context: {
        sessionId: 'qa-report-shell-session', employee: { id: 'qa-employee', displayName: 'QA Employee', status: 'active', timezone: 'Africa/Lagos' },
        companies: [{ id: 'company-a', code: 'QA', name: 'Test Company', primary: true }],
        roles: [{ id: 'qa-employee-role', code: 'employee', name: 'Employee', companyId: 'company-a' }],
        permissions: { 'dashboard.access': 'view', 'ai_guide.access': 'view' },
        companyPermissions: { 'company-a': { 'dashboard.access': 'view', 'ai_guide.access': 'view' } },
      } });
      if (url.pathname === '/api/experience/layout') return respond(route, { preference: { layoutId: 'focus-flow', density: 'standard', motion: 'reduced' }, canChoose: false });
      if (url.pathname === '/api/offline/bootstrap') return respond(route, { ok: true, operations: [], policy: { enabled: false, allowedOperations: [] } });
      if (url.pathname === '/api/support/mine') return respond(route, { commands: [], assistanceRequests: [] });
      if (url.pathname === '/api/ai/guide/catalog') return respond(route, { employee: 'qa-employee', company: { id: 'company-a', code: 'QA', name: 'Test Company' }, companies: [{ id: 'company-a', code: 'QA', name: 'Test Company' }], roles: ['employee'], functions: [], progress: [], suggestions: [], guidance: { required: '', optional: '' }, accessControlAvailable: false });
      if (url.pathname === '/api/ai/guide/history') return respond(route, { history: [] });
      return respond(route, route.request().method() === 'GET' ? {} : { ok: true });
    });
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.getByText('Knowledge Hub', { exact: true }).first().waitFor({ state: 'visible', timeout: 16000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:canonical-navigation', { detail: { target: 'help' } })));
      const launcher = page.getByRole('button', { name: 'Open Generic Report Builder' });
      await launcher.waitFor({ state: 'visible', timeout: 20000 });
      await launcher.click();
      const dialog = page.getByRole('dialog', { name: 'Generic Report Builder' });
      await dialog.waitFor({ state: 'visible', timeout: 10000 });
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      assert.equal(await dialog.getByText('No authorized datasets connected').count(), 1);
      assert.equal(await dialog.getByText('Backend required').count(), 1);
      assert.equal(await dialog.getByRole('button', { name: 'Preview' }).isDisabled(), true);
      assert.equal(await dialog.getByRole('button', { name: 'Save report' }).isDisabled(), true);
      assert.equal(await dialog.getByRole('tab').count(), 10);
      const sharing = dialog.getByRole('tab', { name: /Sharing/ });
      await sharing.click();
      assert.match(await dialog.getByRole('tabpanel').innerText(), /Private only/);
      const columns = dialog.getByRole('tab', { name: /Columns/ });
      await columns.click();
      assert.equal(await dialog.getByRole('button', { name: 'Move up' }).isDisabled(), true);
      assert.equal(await dialog.getByRole('button', { name: 'Move down' }).isDisabled(), true);
      const visuals = dialog.getByRole('tab', { name: /Visualization/ });
      await visuals.click();
      await dialog.getByRole('button', { name: 'Bar chart' }).click();
      assert.equal(await dialog.getByRole('button', { name: 'Bar chart' }).getAttribute('aria-pressed'), 'true');
      await visuals.focus();
      await page.keyboard.press('Home');
      assert.equal(await dialog.getByRole('tab', { name: /Data Source/ }).getAttribute('aria-selected'), 'true');
      await page.keyboard.press('ArrowRight');
      assert.equal(await dialog.getByRole('tab', { name: /Columns/ }).getAttribute('aria-selected'), 'true');
      assert.equal(await dialog.getByRole('tab', { name: /Columns/ }).evaluate(el => document.activeElement === el), true);
      // Background focus must not escape the open modal, including scripted focus changes.
      await launcher.evaluate(element => element.focus());
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, 'open report dialog must recapture background focus');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, 'modal must not create viewport horizontal overflow');
      assert.deepEqual(reportingRequests, [], 'unregistered report endpoints must never be contacted');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await launcher.evaluate(el => document.activeElement === el), true, 'Escape must restore launcher focus');
      assert.deepEqual(errors, [], 'no runtime errors');
      results.push({ width, pass: true, reportingRequests: 0, overflow: false, errors: 0 });
      console.log('GENERIC_REPORT_BUILDER_WIDTH=' + width + ' PASS');
    } catch (error) {
      const state = await page.evaluate(() => { const el = document.querySelector('.grb-workspace-action'); const style = el ? getComputedStyle(el) : null; return { launcherCount: document.querySelectorAll('.grb-workspace-action').length, title: document.title, launcherOuter: el?.outerHTML, display: style?.display, visibility: style?.visibility, opacity: style?.opacity, bounds: el?.getBoundingClientRect().toJSON(), bodyEnd: document.body?.innerText?.slice(-350) }; }).catch(() => ({}));
      results.push({ width, pass: false, reason: String(error), state, errors });
      console.error('GENERIC_REPORT_BUILDER_WIDTH=' + width + ' FAIL ' + String(error) + ' STATE=' + JSON.stringify(state) + ' RUNTIME=' + JSON.stringify(errors));
    } finally {
      await ctx.close();
    }
  }
} finally { await browser.close(); }
const failures = results.filter(result => !result.pass);
console.log('GENERIC_REPORT_BUILDER_NINE_WIDTH_QA=' + (results.length - failures.length) + '/' + results.length + (failures.length ? ' FAIL' : ' PASS'));
if (failures.length || !results.length) process.exitCode = 1;
