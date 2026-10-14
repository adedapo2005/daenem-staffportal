import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Changed-source negative: a newly authorized actor cannot briefly see a
// previously signed-in actor's Finance summary while the new fetch is pending.
const origin = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const widths = [390, 430, 768, 1024, 1366, 1672, 1920, 2560, 3840];
const results = [];
const browser = await chromium.launch({headless: true});
try {
  for (const width of widths) {
    if (process.env.QA_WIDTH && Number(process.env.QA_WIDTH) !== width) continue;
    const context = await browser.newContext({
      viewport: {width, height: width === 3840 ? 2160 : width < 768 ? 900 : 1080},
      reducedMotion: 'reduce', serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const errors = [], unexpectedRequests = [];
    let releaseSecond, markSecond;
    const secondWaiting = new Promise(resolve => { markSecond = resolve; });
    const secondRelease = new Promise(resolve => { releaseSecond = resolve; });
    let summaryReads = 0;
    page.on('pageerror', error => errors.push(String(error)));
    await page.route(origin + '/__qa_finance_summary_authority', route => route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><html><body><div id="qa-root"></div></body></html>'
    }));
    await page.route('**/api/**', async route => {
      const uri = new URL(route.request().url());
      if (uri.pathname === '/api/finance/summary') {
        summaryReads++;
        if (summaryReads === 2) { markSecond(); await secondRelease; }
        return route.fulfill({status: 200, contentType: 'application/json',
          body: JSON.stringify({companyId:'company-a', month:'2026-10', balances:{}, draftJournals:0,
            receivables: {openCount:1, openKobo:summaryReads === 1 ? 12345 : 98765, overdueKobo:0},
            approvedBudgetKobo:0, netFundingKobo:0})});
      }
      unexpectedRequests.push(uri.pathname);
      return route.abort();
    });
    try {
      await page.goto(origin + '/__qa_finance_summary_authority', {waitUntil:'domcontentloaded'});
      await page.evaluate(async () => {
        window.__vite_plugin_react_preamble_installed__ = true;
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        const source = await (await fetch('/src/finance-center.tsx')).text();
        const reactUrl = '/node_modules/.vite/deps/react.js';
        const React = await import(reactUrl);
        const ReactDOM = await import(reactUrl.replace('/react.js','/react-dom_client.js'));
        const createElement = React.createElement || React.default?.createElement;
        const createRoot = ReactDOM.createRoot || ReactDOM.default?.createRoot;
        const { FinanceCenter } = await import('/src/finance-center.tsx');
        const root = createRoot(document.getElementById('qa-root'));
        const person = id => ({
          sessionId:'session-' + id,
          employee:{id:'employee-' + id,displayName:'QA ' + id,status:'active'},
          companies:[{id:'company-a',name:'Company A',code:'A',primary:true}],
          roles:[{id:'finance-role',code:'finance',name:'Finance'}],
          permissions:{'finance.access':'view','finance.reports':'view'},
          companyPermissions:{'company-a':{'finance.access':'view','finance.reports':'view'}}
        });
        window.__qaFinance = { render: id => root.render(
          createElement(FinanceCenter, {context:person(id), onClose:()=>{}})
        ) };
        window.__qaFinance.render('A');
      });
      await page.getByText(/123[.]45/).first().waitFor({timeout:18000});
      await page.evaluate(() => window.__qaFinance.render('B'));
      await Promise.race([secondWaiting, new Promise((_,reject) => setTimeout(()=>reject(new Error('Second request absent')),12000))]);
      assert.equal(await page.getByText(/123[.]45/).count(), 0,
        'old employee Finance value must not render while new actor request is pending');
      releaseSecond();
      await page.getByText(/987[.]65/).first().waitFor({timeout:18000});
      assert.equal(await page.getByText(/123[.]45/).count(),0);
      assert.ok(summaryReads >= 2, 'both actor requests should be exercised');
      assert.deepEqual(unexpectedRequests,[], 'no unexpected API/provider requests');
      assert.deepEqual(errors,[], 'no browser runtime errors');
      results.push({width, pass:true});
    } catch (error) {
      releaseSecond();
      results.push({width, pass:false, error:String(error), errors, unexpectedRequests, summaryReads});
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({result:'FINANCE_SUMMARY_AUTHORITY',passed:results.filter(x=>x.pass).length,total:results.length,results}));
if (!results.length || results.some(x=>!x.pass)) process.exitCode = 1;
