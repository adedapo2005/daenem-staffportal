import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Changed-source browser regression: stale company-A finance read failures
// must never surface inside a company-B authorized workspace.
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const widths = [390, 430, 768, 1024, 1366, 1672, 1920, 2560, 3840];
const results = [];
const browser = await chromium.launch({headless: true});
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: {width, height: 900}, reducedMotion: 'reduce', serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    let releaseOld;
    let oldStarted;
    const oldPending = new Promise(resolve => { releaseOld = resolve; });
    const oldSeen = new Promise(resolve => { oldStarted = resolve; });
    let aReceivableReads = 0;
    let bReceivableReads = 0;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', async route => {
      const req = route.request();
      const uri = new URL(req.url());
      const path = uri.pathname;
      const send = (data, status = 200) => route.fulfill({
        status, contentType: 'application/json',
        headers: {'cache-control': 'no-store'}, body: JSON.stringify(data)
      });
      if (path === '/api/auth/me') return send({authenticated: true, context: {
        sessionId: 'synthetic-session', employee: {id: 'synthetic-employee', displayName: 'Finance QA', status: 'active'},
        companies: [
          {id: 'company-a', name: 'Company A', code: 'A', primary: true},
          {id: 'company-b', name: 'Company B', code: 'B'}
        ],
        roles: [{id: 'qa-finance-role', code: 'finance', name: 'Finance'}],
        permissions: {'finance.access': 'view', 'finance.receivables': 'edit', 'finance.reports': 'view'},
        companyPermissions: {
          'company-a': {'finance.access': 'view', 'finance.receivables': 'edit', 'finance.reports': 'view'},
          'company-b': {'finance.access': 'view', 'finance.receivables': 'edit', 'finance.reports': 'view'}
        }
      }});
      if (path === '/api/finance/summary') return send({
        month: '2026-10', balances: {}, receivables: {openCount: 0, openKobo: 0, overdueKobo: 0},
        approvedBudgetKobo: 0, netFundingKobo: 0, draftJournals: 0
      });
      if (path === '/api/finance/receivables' && req.method() === 'GET') {
        const company = uri.searchParams.get('companyId');
        requests.push(company);
        if (company === 'company-a') {
          aReceivableReads++;
          if (aReceivableReads === 1) {
            oldStarted();
            await oldPending;
            return send({error: 'STALE_COMPANY_A_ERROR_MUST_NOT_RENDER'}, 503);
          }
          return send({receivables: [{id:'a-only',customerName:'A_ONLY_RECORD',invoiceDate:'2026-10-13',amountKobo:100,paidKobo:0,balanceKobo:100,status:'open'}]});
        }
        if (company === 'company-b') {
          bReceivableReads++;
          if (bReceivableReads > 1) return send({error: 'CURRENT_COMPANY_B_ERROR_VISIBLE'}, 503);
          return send({receivables: [{id:'b-only',customerName:'B_ONLY_RECORD',invoiceDate:'2026-10-13',amountKobo:205,paidKobo:0,balanceKobo:205,status:'open'}]});
        }
        return send({error:'Unexpected company'},403);
      }
      if (path === '/api/experience/layout') return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:false,canManage:false,canAccess:false});
      if (path === '/api/offline/bootstrap') return send({ok:true,serverTime:'2026-10-13T12:00:00Z',businessTimezone:'Africa/Lagos',session:{id:'synthetic-session',expiresAt:'2030-10-12T12:00:00Z'},policy:{enabled:true,maxQueueCount:50,allowedOperations:[]},operations:[]});
      if (path === '/api/offline/telemetry') return send({ok:true});
      if (path === '/api/support/mine') return send({commands:[],assistanceRequests:[]});
      if (path.startsWith('/api/')) return send(req.method() === 'GET' ? {} : {ok:true});
      return route.continue();
    });
    try {
      await page.goto(baseUrl, {waitUntil: 'domcontentloaded', timeout:25000});
      await page.locator('.postauth-module-envelope').first().waitFor({state:'attached', timeout:20000});
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'finance'}})));
      await page.locator('.finance-center-launcher').first().waitFor({state:'attached',timeout:20000});
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('daenem:open-module',{detail:{module:'finance'}})));
      await page.locator('.fin-shell').waitFor({state:'visible',timeout:12000});
      await page.getByRole('button',{name:'Receivables'}).click();
      await Promise.race([oldSeen, new Promise((_, reject) => setTimeout(() => reject(new Error('Initial company-A receivables request not observed')), 12000))]);
      await page.locator('.fin-head select').selectOption('company-b');
      await page.getByText('B_ONLY_RECORD').waitFor({timeout:12000});
      releaseOld();
      await page.waitForTimeout(350);
      assert.equal(await page.locator('.fin-message').getByText('STALE_COMPANY_A_ERROR_MUST_NOT_RENDER').count(), 0, 'stale A read failure must not leak into B');
      assert.equal(await page.getByText('A_ONLY_RECORD').count(),0,'A-only financial data must not appear in B');
      assert.ok(requests.includes('company-a') && requests.includes('company-b'),'both company scopes exercised');
      await page.getByRole('button',{name:'Refresh customer balances'}).click();
      await page.getByText('Receivables register could not be verified for this company. Do not treat the empty view as a cleared operation.').waitFor({timeout:12000});
      assert.equal(await page.getByText('CURRENT_COMPANY_B_ERROR_VISIBLE').count(),0,'untrusted backend error detail must not be rendered');
      assert.equal(await page.getByText('STALE_COMPANY_A_ERROR_MUST_NOT_RENDER').count(),0,'A error must remain absent after B failure');
      await page.locator('.fin-head select').selectOption('company-a');
      await page.getByText('A_ONLY_RECORD').waitFor({timeout:12000});
      assert.equal(await page.getByText('CURRENT_COMPANY_B_ERROR_VISIBLE').count(),0,'B error must clear when switching back to A');
      assert.deepEqual(errors,[],'no runtime exceptions');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1),false,'no horizontal overflow');
      results.push({width, pass:true, requests:requests.length});
    } catch (error) {
      releaseOld();
      results.push({width, pass:false, error:error.message, errors, requests});
    } finally {
      await context.close();
    }
  }
} finally {await browser.close();}
console.log(JSON.stringify({result:'FINANCE_COMPANY_FEEDBACK_QA',passed:results.filter(r=>r.pass).length,total:widths.length,results}));
if (results.some(r=>!r.pass)) process.exitCode=1;
