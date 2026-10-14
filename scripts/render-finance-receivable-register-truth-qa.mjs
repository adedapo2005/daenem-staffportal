import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Changed-source Finance register acceptance: an unavailable/late register
// cannot look empty or authorize another unknown-outcome receivable attempt.
const origin = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const widths = [390, 430, 768, 1024, 1366, 1672, 1920, 2560, 3840];
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width === 3840 ? 2160 : width < 768 ? 900 : 1080 },
      reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    let reads = 0, posts = 0, releaseFirst;
    const firstHold = new Promise(resolve => { releaseFirst = resolve; });
    const row = {
      id: 'qa-entry-a', customerName: 'QA VERIFIED CUSTOMER',
      invoiceNo: 'QA-INVOICE', invoiceDate: '2026-10-13', dueDate: '2026-10-20',
      amountKobo: 12345, paidKobo: 0, balanceKobo: 12345, status: 'open',
    };
    page.on('pageerror', error => errors.push(String(error)));
    await page.route(origin + '/__qa_finance_register_truth', route => route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><html><body><div id="qa-root"></div></body></html>',
    }));
    await page.route('**/api/**', async route => {
      const req = route.request(), uri = new URL(req.url());
      if (uri.pathname === '/api/finance/summary' && req.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          companyId: 'qa-company-a', month: '2026-10', balances: {},
          receivables: { openCount: 1, openKobo: 12345, overdueKobo: 0 },
          approvedBudgetKobo: 0, netFundingKobo: 0, draftJournals: 0,
        }) });
      }
      if (uri.pathname === '/api/finance/receivables' && req.method() === 'GET') {
        const number = ++reads;
        if (number === 1) {
          await firstHold;
          return route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ receivables: null }) }).catch(() => {});
        }
        if (number === 3) {
          return route.fulfill({ status: 200, contentType: 'application/json',
            body: JSON.stringify({ receivables: [{ ...row, balanceKobo: Number.MAX_SAFE_INTEGER + 1 }] }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ receivables: [row] }) });
      }
      if (uri.pathname === '/api/finance/receivables' && req.method() === 'POST') {
        posts++;
        assert.ok(req.headers()['idempotency-key'], 'new operation must have an explicit request identity');
        return route.fulfill({ status: 201, contentType: 'application/json',
          body: JSON.stringify({ ok: true, id: 'qa-new-receivable' }) });
      }
      unexpected.push(req.method() + ' ' + uri.pathname);
      return route.abort();
    });
    try {
      await page.goto(origin + '/__qa_finance_register_truth', { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        window.__vite_plugin_react_preamble_installed__ = true;
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        const React = await import('/node_modules/.vite/deps/react.js');
        const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { FinanceCenter } = await import('/src/finance-center.tsx');
        const createRoot = ReactDOM.createRoot || ReactDOM.default?.createRoot;
        const createElement = React.createElement || React.default?.createElement;
        const authContext = {
          sessionId: 'qa-session-a', employee: { id: 'qa-employee-a', status: 'active' },
          companies: [{ id: 'qa-company-a', name: 'Company A', code: 'A', primary: true }],
          roles: [{ id: 'qa-role', code: 'finance', name: 'Finance' }],
          permissions: { 'finance.access': 'view', 'finance.reports': 'view', 'finance.receivables': 'create' },
          companyPermissions: { 'qa-company-a': {
            'finance.access': 'view', 'finance.reports': 'view', 'finance.receivables': 'create',
          } },
        };
        createRoot(document.getElementById('qa-root')).render(
          createElement(FinanceCenter, { context: authContext, onClose: () => {} }),
        );
      });
      await page.getByRole('button', { name: 'Receivables' }).click();
      const refresh = page.getByRole('button', { name: 'Refresh customer balances' });
      await page.getByText('Receivables register verification is pending').waitFor({ timeout: 18000 });
      assert.equal(await page.getByText('QA VERIFIED CUSTOMER').count(), 0);
      await refresh.click();
      await page.getByText('QA VERIFIED CUSTOMER').waitFor({ timeout: 18000 });
      releaseFirst();
      await page.waitForTimeout(90);
      assert.equal(await page.getByText('QA VERIFIED CUSTOMER').count(), 1,
        'older malformed response must not overwrite newer authorized register');
      await refresh.click();
      await page.getByText('Receivables register unavailable or unverified').waitFor({ timeout: 18000 });
      assert.equal(await page.getByText('QA VERIFIED CUSTOMER').count(), 0,
        'invalid numerical data must not leave stale customer balances visible');
      const inputs = page.locator('.fin-form input');
      await inputs.nth(0).fill('QA NEW CUSTOMER');
      await inputs.nth(4).fill('12.34');
      await page.getByRole('button', { name: 'Record receivable' }).click();
      await page.getByText('Authorized receivables register verification is required').waitFor({ timeout: 18000 });
      assert.equal(posts, 0, 'no create POST when authorized register is unverified');
      await refresh.click();
      await page.getByText('QA VERIFIED CUSTOMER').waitFor({ timeout: 18000 });
      await page.getByRole('button', { name: 'Record receivable' }).click();
      await page.getByText('Customer receivable recorded.').waitFor({ timeout: 18000 });
      assert.equal(posts, 1, 'a separate legitimate authorized intent may proceed after register recovery');
      assert.deepEqual(unexpected, [], 'no provider or unrelated mutation calls');
      assert.deepEqual(errors, [], 'no browser exceptions');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false, 'no horizontal overflow');
      results.push({ width, pass: true, reads, posts });
    } catch (error) {
      releaseFirst();
      results.push({ width, pass: false, error: String(error), reads, posts, errors, unexpected });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ test: 'FINANCE_RECEIVABLE_REGISTER_FAIL_CLOSED',
  passed: results.filter(x => x.pass).length, total: results.length, results }));
if (results.length !== widths.length || results.some(x => !x.pass)) process.exitCode = 1;
