import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4173';
const widths=[390,430,768,1024,1366,1672,1920,2560,3840];
const failures=[],results=[];
const browser=await chromium.launch({headless:true});
try {
  for(const width of widths){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage(), posts=[],runtimeErrors=[];
    page.on('pageerror',e=>runtimeErrors.push(e.message));
    await page.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),p=url.pathname;
      const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(body)});
      if(p==='/api/auth/me')return send({authenticated:true,context:{
        sessionId:'frontend-finance-qa',employee:{id:'qa-fin',displayName:'QA Finance',status:'active'},
        companies:[{id:'company-printing',name:'Printing & Technology',code:'PRINT',primary:true}],
        roles:[{id:'qa-role',code:'finance',name:'Finance',companyId:'company-printing'}],
        permissions:{'finance.access':'view','finance.receivables':'edit','finance.reports':'view'},
        companyPermissions:{'company-printing':{'finance.access':'view','finance.receivables':'edit','finance.reports':'view'}}
      }});
      if(p==='/api/finance/receivables'&&req.method()==='POST'){
        posts.push({key:req.headers()['idempotency-key'],body:req.postData()});
        if(posts.length===1)return route.abort('failed');
        if(posts.length===2)return send({ok:true,id:'qa-original-receivable',status:'open'},200);
        if(posts.length===4)return send({error:'Conflicting request identity'},409);
        if(posts.length===5)return send({error:'Unavailable'},503);
        if(posts.length===6)return send({error:'Rejected by validation'},400);
        if(posts.length===7)return send({error:'Session denied'},401);
        if(posts.length===8)return send({error:'Permission denied'},403);
        if(posts.length===10)return send({ok:false,error:'Unconfirmed successful transport'},200);
        return send({ok:true,id:'qa-created-receivable',status:'open'},201);
      }
      if(p==='/api/finance/receivables'&&req.method()==='GET')return send({receivables:[]});
      if(p==='/api/finance/summary')return send({month:'2026-10',balances:{},receivables:{openCount:0,openKobo:0,overdueKobo:0},approvedBudgetKobo:0,netFundingKobo:0,draftJournals:0});
      if(p==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:false,canManage:false,canAccess:false});
      if(p==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-12T12:00:00Z',businessTimezone:'Africa/Lagos',session:{id:'frontend-finance-qa',expiresAt:'2030-10-12T12:00:00Z'},policy:{enabled:true,maxQueueCount:50,allowedOperations:[]},operations:[]});
      if(p==='/api/offline/telemetry')return send({ok:true});
      if(p==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
      if(p.startsWith('/api/'))return send(req.method()==='GET'?{}:{ok:true});
      return route.continue();
    });
    try {
      await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:25000});
      await page.locator('.postauth-module-envelope').first().waitFor({state:'attached',timeout:20000});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'finance'}})));
      await page.locator('.finance-center-launcher').first().waitFor({state:'attached',timeout:20000});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:open-module',{detail:{module:'finance'}})));
      await page.locator('.fin-shell').waitFor({state:'visible',timeout:12000});
      await page.getByRole('button',{name:'Receivables'}).click();
      const form=page.locator('.fin-form').first(),submit=form.getByRole('button',{name:'Record receivable'});
      await form.getByLabel('Customer').fill('QA Customer');
      await form.getByLabel('Invoice no.').fill('QA-001');
      await form.getByLabel(/Amount/).fill('125.50');
      await submit.click();
      await page.locator('.fin-message').getByText(/Receivable result not confirmed/).waitFor({timeout:12000});
      assert.equal(posts.length,1,'one failed transport attempt');
      assert.ok(posts[0].key&&posts[0].key.length>20,'client must supply secure logical key');
      // A transport-unknown operation must survive React tab unmount AND closing/reopening Finance.
      await page.getByRole('button',{name:'Overview'}).click();
      await page.getByRole('button',{name:'Receivables'}).click();
      await form.getByLabel('Customer').fill('QA Customer');
      await form.getByLabel('Invoice no.').fill('QA-001');
      await form.getByLabel(/Amount/).fill('125.50');
      assert.equal(posts.length,1,'tab remount must not silently submit a fresh key');
      await page.locator('.fin-head aside button').last().click();
      await page.locator('.fin-shell').waitFor({state:'detached'});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:open-module',{detail:{module:'finance'}})));
      await page.locator('.fin-shell').waitFor({state:'visible'});
      await page.getByRole('button',{name:'Receivables'}).click();
      await form.getByLabel('Customer').fill('QA Customer');
      await form.getByLabel('Invoice no.').fill('QA-001');
      await form.getByLabel(/Amount/).fill('125.50');
      assert.equal(posts.length,1,'dialog reopen must not silently submit a fresh key');
      await form.getByLabel(/Amount/).fill('130.50');
      await submit.click();
      await page.locator('.fin-message').getByText(/previous receivable attempt is unresolved/).waitFor({timeout:12000});
      assert.equal(posts.length,1,'changed payload must not be sent using pending key');
      await form.getByLabel(/Amount/).fill('125.50');
      await submit.click();
      await page.locator('.fin-message').getByText('Customer receivable recorded.').waitFor({timeout:12000});
      assert.equal(posts.length,2,'retry occurred');
      assert.equal(posts[1].key,posts[0].key,'retry must reuse the original logical key');
      assert.equal(posts[1].body,posts[0].body,'retry must preserve exact original body');
      await form.getByLabel('Customer').fill('Different QA Customer');
      await form.getByLabel('Invoice no.').fill('QA-002');
      await form.getByLabel(/Amount/).fill('50.00');
      await submit.click();
      await page.locator('.fin-message').getByText('Customer receivable recorded.').waitFor({timeout:12000});
      assert.equal(posts.length,3,'distinct user intent creates another request');
      assert.notEqual(posts[2].key,posts[1].key,'distinct operation must get a new key');
      // An UNKNOWN prior result must never lose its key after later 409/503/400/401/403.
      await form.getByLabel('Customer').fill('Denied QA Customer');
      await form.getByLabel('Invoice no.').fill('QA-003');
      await form.getByLabel(/Amount/).fill('60.00');
      const denied=[
        {status:409,message:/conflicts with an earlier attempt/},
        {status:503,message:/result not confirmed/},
        {status:400,message:/status could not be confirmed/},
        {status:401,message:/status could not be confirmed/},
        {status:403,message:/status could not be confirmed/}
      ];
      for(const [i,item] of denied.entries()){
        await submit.click();
        await page.locator('.fin-message').getByText(item.message).waitFor({timeout:12000});
        assert.equal(posts.length,i+4,`HTTP ${item.status} must send exactly one request`);
        assert.equal(posts.at(-1).key,posts[3].key,`HTTP ${item.status} retains the original key`);
        assert.equal(posts.at(-1).body,posts[3].body,`HTTP ${item.status} retains the original body`);
      }
      await form.getByLabel(/Amount/).fill('70.00');
      await submit.click();
      await page.locator('.fin-message').getByText(/previous receivable attempt is unresolved/).waitFor({timeout:12000});
      assert.equal(posts.length,8,'changed request after denial must not issue another POST');
      await form.getByLabel(/Amount/).fill('60.00');
      await submit.click();
      await page.locator('.fin-message').getByText('Customer receivable recorded.').waitFor({timeout:12000});
      assert.equal(posts.length,9,'same-key recovery after denials succeeds');
      assert.equal(posts[8].key,posts[3].key,'recovery retains original key');
      assert.equal(posts[8].body,posts[3].body,'recovery retains original payload');
      // A 2xx transport response with no authoritative receivable ID is NOT creation proof.
      await form.getByLabel('Customer').fill('Unconfirmed QA Customer');
      await form.getByLabel('Invoice no.').fill('QA-004');
      await form.getByLabel(/Amount/).fill('70.00');
      await submit.click();
      await page.locator('.fin-message').getByText(/Receivable result not confirmed/).waitFor({timeout:12000});
      assert.equal(posts.length,10,'nonconfirming 2xx must not be accepted as successful creation');
      await submit.click();
      await page.locator('.fin-message').getByText('Customer receivable recorded.').waitFor({timeout:12000});
      assert.equal(posts.length,11,'same logical operation can recover after malformed success payload');
      assert.equal(posts[10].key,posts[9].key,'nonconfirming 2xx retains the original key');
      assert.equal(posts[10].body,posts[9].body,'nonconfirming 2xx retains the original payload');
      assert.deepEqual(runtimeErrors,[],'no browser runtime errors');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1),false,'no horizontal overflow');
      results.push({width,passed:true,posts:posts.length});
    } catch(e){
      failures.push(width+': '+e.message); results.push({width,passed:false,error:e.message,posts:posts.length,runtimeErrors});
    }
    await context.close();
  }
} finally { await browser.close(); }
console.log('FINANCE_RECEIVABLE_IDEMPOTENCY_CHANGED_SOURCE='+results.filter(r=>r.passed).length+'/'+widths.length+' PASS');
console.log(JSON.stringify({results,failures}));
if(failures.length) process.exitCode=1;
