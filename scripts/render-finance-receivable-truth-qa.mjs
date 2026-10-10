import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4178';
const folder=path.join(process.cwd(),'qa-artifacts','finance-receivable-truth-qa');
fs.mkdirSync(folder,{recursive:true});
const results=[], failures=[];
const browser=await chromium.launch({headless:true});
try {
  for(const width of [390,1366]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage();
    let paymentPosts=0, receivableReads=0;
    const runtimeErrors=[];
    page.on('pageerror',e=>runtimeErrors.push(e.message));
    await page.route('**/api/**',async route=>{
      const req=route.request(),u=new URL(req.url()),p=u.pathname;
      const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(body)});
      if(p==='/api/auth/me')return send({authenticated:true,context:{
        sessionId:'finance-truth-qa',employee:{id:'qa-fin',displayName:'QA Finance',status:'active',timezone:'Africa/Lagos'},
        companies:[{id:'company-printing',name:'Printing & Technology',code:'PRINT',primary:true}],
        roles:[{id:'qa-role',code:'finance',name:'Finance',companyId:'company-printing'}],
        permissions:{'finance.access':'view','finance.receivables':'edit','finance.reports':'view'},
        companyPermissions:{'company-printing':{'finance.access':'view','finance.receivables':'edit','finance.reports':'view'}}
      }});
      if(p==='/api/finance/summary')return send({month:'2026-10',balances:{},receivables:{openCount:1,openKobo:100000,overdueKobo:0},approvedBudgetKobo:0,netFundingKobo:0,draftJournals:0});
      if(p==='/api/finance/receivables'&&req.method()==='GET'){receivableReads++;return send({receivables:[{id:'qa-debt-1',customerName:'QA Customer',invoiceNo:'QA-001',invoiceDate:'2026-10-10',balanceKobo:100000,paidKobo:0,amountKobo:100000,status:'open'}]})}
      if(p==='/api/finance/receivables/payment'&&req.method()==='POST'){paymentPosts++;return send({error:'Payment must be verified.'},409)}
      if(p==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:false,canManage:false,canAccess:false});
      if(p==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-10T02:00:00Z',businessTimezone:'Africa/Lagos',session:{id:'finance-truth-qa',expiresAt:'2030-10-10T02:00:00Z'},policy:{enabled:true,maxQueueCount:50,allowedOperations:[]},operations:[]});
      if(p==='/api/offline/telemetry')return send({ok:true});
      if(p==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
      if(p.startsWith('/api/'))return send(req.method()==='GET'?{}:{ok:true});
      return route.continue();
    });
    try{
      await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:25000});
      await page.locator('.postauth-module-envelope').first().waitFor({state:'attached',timeout:20000});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'finance'}})));
      await page.locator('.finance-center-launcher').first().waitFor({state:'attached',timeout:20000});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:open-module',{detail:{module:'finance'}})));
      await page.locator('.fin-shell').waitFor({state:'visible',timeout:12000});
      await page.getByRole('button',{name:'Receivables'}).click();
      await page.getByText('QA Customer',{exact:true}).waitFor({timeout:10000});
      assert.equal(await page.getByRole('button',{name:'Receive',exact:true}).count(),0,'unsafe manual Receive button hidden');
      assert.equal(await page.getByText(/Balances update only after verified bank\/provider reconciliation/).count(),1,'truthful instruction visible');
      assert.equal(await page.getByText('Awaiting verified payment',{exact:true}).count(),1,'open balance labelled');
      await page.getByRole('button',{name:'Refresh customer balances'}).click();
      assert.ok(receivableReads>=2,'refresh read occurs');
      assert.equal(paymentPosts,0,'no unverified payment POST');
      assert.deepEqual(runtimeErrors,[],'no browser exceptions');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1),false,'no document horizontal overflow');
      await page.screenshot({path:path.join(folder,'finance-receivables-'+width+'.png'),fullPage:true});
      results.push({width,passed:true,receivableReads,paymentPosts,runtimeErrors});
    }catch(e){failures.push(width+': '+e.message);results.push({width,passed:false,error:e.message,receivableReads,paymentPosts,runtimeErrors})}
    await context.close();
  }
  const deniedContext=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  const deniedPage=await deniedContext.newPage();
  let unauthorizedReceivableReads=0;
  await deniedPage.route('**/api/**',async route=>{
    const req=route.request(),p=new URL(req.url()).pathname;
    const send=(body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(p==='/api/auth/me')return send({authenticated:true,context:{
      sessionId:'qa-no-finance',employee:{id:'qa-staff',displayName:'QA Staff',status:'active'},
      companies:[{id:'company-printing',name:'Printing & Technology',code:'PRINT',primary:true}],
      roles:[{id:'qa-staff-role',code:'staff',name:'Staff',companyId:'company-printing'}],
      permissions:{'dashboard.access':'view'},companyPermissions:{'company-printing':{'dashboard.access':'view'}}
    }});
    if(p==='/api/finance/receivables')unauthorizedReceivableReads++;
    if(p==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:false,canManage:false,canAccess:false});
    if(p==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-10T02:00:00Z',businessTimezone:'Africa/Lagos',session:{id:'qa-no-finance',expiresAt:'2030-10-10T02:00:00Z'},policy:{enabled:true,maxQueueCount:50,allowedOperations:[]},operations:[]});
    if(p.startsWith('/api/'))return send(req.method()==='GET'?{}:{ok:true});
    return route.continue();
  });
  try{
    await deniedPage.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:25000});
    await deniedPage.locator('.postauth-module-envelope').first().waitFor({state:'attached',timeout:20000});
    await deniedPage.evaluate(()=>{
      window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'finance'}}));
      window.dispatchEvent(new CustomEvent('daenem:open-module',{detail:{module:'finance'}}));
    });
    await deniedPage.waitForTimeout(500);
    assert.equal(await deniedPage.locator('.fin-shell').count(),0,'unauthorized staff has no Finance workspace');
    assert.equal(unauthorizedReceivableReads,0,'unauthorized staff makes no receivable API request');
    results.push({role:'unauthorized_staff',passed:true,unauthorizedReceivableReads});
  }catch(e){failures.push('unauthorized_staff: '+e.message);results.push({role:'unauthorized_staff',passed:false,error:e.message,unauthorizedReceivableReads})}
  await deniedContext.close();
}finally{await browser.close()}
fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify({generatedAt:new Date().toISOString(),results,failures},null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,failures}));
if(failures.length)process.exitCode=1;
