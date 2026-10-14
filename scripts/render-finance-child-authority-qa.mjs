import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

// Actual changed-source React negative: same company, different employee/session.
// Child data must unmount immediately, before the replacement API read completes.
const source = readFileSync(new URL('../src/finance-center.tsx', import.meta.url), 'utf8');
for (const child of ['Receivables','Ledger','Reports','Budgets']) {
  assert.ok(source.includes('<'+child+' key={authorityEpochRef.current.epoch}'),
    child+' must remount at the current authorization boundary');
}
const widths = [390,430,768,1024,1366,1672,1920,2560,3840];
const origin = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({headless:true});
const results = [];
try {
  for (const width of widths) {
    if (process.env.QA_WIDTH && Number(process.env.QA_WIDTH)!==width) continue;
    const context = await browser.newContext({
      viewport:{width,height:width===3840?2160:900},
      reducedMotion:'reduce',serviceWorkers:'block'
    });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    let reads = 0, releaseB, startB;
    const bStarted = new Promise(resolve => {startB=resolve});
    const bHold = new Promise(resolve => {releaseB=resolve});
    page.on('pageerror',error => errors.push(String(error)));
    await page.route(origin+'/__qa_finance_child_authority', route => route.fulfill({
      status:200,contentType:'text/html',
      body:'<!doctype html><html><body><div id="qa-root"></div></body></html>'
    }));
    await page.route('**/api/**',async route => {
      const req=route.request(),u=new URL(req.url());
      const send=body=>route.fulfill({status:200,contentType:'application/json',
        headers:{'cache-control':'no-store'},body:JSON.stringify(body)});
      if (u.pathname==='/api/finance/summary') return send({
        month:'2026-10',balances:{},draftJournals:0,
        receivables:{openCount:0,openKobo:0,overdueKobo:0},
        approvedBudgetKobo:0,netFundingKobo:0
      });
      if (u.pathname==='/api/finance/receivables'&&req.method()==='GET') {
        reads++;
        if (reads===2) {startB(); await bHold;}
        const name=reads===1?'ACTOR_A_ONLY':reads===2?'ACTOR_B_ONLY':'ACTOR_C_ONLY';
        return send({receivables:[{id:'row-'+reads,customerName:name,invoiceDate:'2026-10-13',
          amountKobo:125,paidKobo:0,balanceKobo:125,status:'open'}]});
      }
      unexpected.push(req.method()+' '+u.pathname);
      return route.abort();
    });
    try {
      await page.goto(origin+'/__qa_finance_child_authority',{waitUntil:'domcontentloaded'});
      await page.evaluate(async()=>{
        window.__vite_plugin_react_preamble_installed__=true;
        window.$RefreshReg$=()=>{};
        window.$RefreshSig$=()=>type=>type;
        const React=await import('/node_modules/.vite/deps/react.js');
        const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');
        const createRoot=ReactDOM.createRoot||ReactDOM.default?.createRoot;
        const createElement=React.createElement||React.default?.createElement;
        const {FinanceCenter}=await import('/src/finance-center.tsx');
        const root=createRoot(document.getElementById('qa-root'));
        const makeContext=(id,authorized=true)=>({
          sessionId:'synthetic-session-'+id,
          employee:{id:'synthetic-employee-'+id,displayName:'Synthetic '+id,status:'active'},
          companies:[{id:'company-a',name:'Company A',code:'A',primary:true}],
          roles:[{id:'finance-role',code:'finance',name:'Finance'}],
          permissions:{'finance.access':'view','finance.receivables':authorized?'edit':'none',
            'finance.reports':'view'},
          companyPermissions:{'company-a':{'finance.access':'view',
            'finance.receivables':authorized?'edit':'none','finance.reports':'view'}}
        });
        window.__qaFinance={
          render:(id,authorized=true)=>root.render(createElement(FinanceCenter,
            {context:makeContext(id,authorized),onClose:()=>{}}))
        };
        window.__qaFinance.render('A');
      });
      await page.getByRole('button',{name:'Receivables'}).click();
      await page.getByText('ACTOR_A_ONLY').waitFor({timeout:16000});
      await page.evaluate(()=>window.__qaFinance.render('B'));
      await Promise.race([bStarted,new Promise((_,reject)=>
        setTimeout(()=>reject(new Error('replacement GET absent')),12000))]);
      assert.equal(await page.getByText('ACTOR_A_ONLY').count(),0,
        'A receivable must disappear before B response arrives');
      releaseB();
      await page.getByText('ACTOR_B_ONLY').waitFor({timeout:16000});
      assert.equal(await page.getByText('ACTOR_A_ONLY').count(),0);
      await page.evaluate(()=>window.__qaFinance.render('B',false));
      await page.getByRole('button',{name:'Receivables'}).waitFor({state:'detached',timeout:12000});
      assert.equal(await page.getByText('ACTOR_B_ONLY').count(),0,
        'revoked access must immediately clear receivable data');
      await page.evaluate(()=>window.__qaFinance.render('C'));
      await page.getByRole('button',{name:'Receivables'}).click();
      await page.getByText('ACTOR_C_ONLY').waitFor({timeout:16000});
      assert.equal(await page.getByText('ACTOR_B_ONLY').count(),0);
      assert.equal(unexpected.length,0,'no mutation/provider/unexpected request');
      assert.deepEqual(errors,[],'no browser runtime errors');
      assert.equal(await page.evaluate(()=>
        document.documentElement.scrollWidth>document.documentElement.clientWidth+1),
        false,'no horizontal overflow');
      results.push({width,pass:true,reads});
      console.log('FINANCE_CHILD_AUTHORITY_WIDTH='+width+' PASS');
    } catch(error) {
      releaseB();
      results.push({width,pass:false,error:String(error),reads,unexpected,errors});
      console.error('FINANCE_CHILD_AUTHORITY_WIDTH='+width+' FAIL '+String(error));
    } finally {await context.close();}
  }
} finally {await browser.close();}
console.log(JSON.stringify({result:'FINANCE_CHILD_AUTHORITY_QA',
  passed:results.filter(x=>x.pass).length,total:results.length,results}));
if (!results.length||results.some(x=>!x.pass)) process.exitCode=1;
