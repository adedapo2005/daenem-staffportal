import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4178';
const width=Number(process.env.QA_WIDTH||390);const resultFile=width===390?'result.json':`result-${width}.json`;
const out=path.join(process.cwd(),'qa-artifacts','finance-company-boundaries-qa');
fs.mkdirSync(out,{recursive:true});
const companies=[{id:'company-a',name:'Printing',code:'PRINT',primary:true},{id:'company-b',name:'Logistics',code:'LOG',primary:false}];
const grants={
 'company-a':{'finance.access':'view','finance.receivables':'edit','finance.reports':'view','finance.journal':'create'},
 'company-b':{'finance.access':'view','finance.reports':'view','finance.ledger':'view','finance.coa':'view','finance.budgets':'view'}
};
let authCompanies=companies,authGrants=grants;
let aSummaryCount=0,bSummaryCount=0,bQueuedResolve,releaseB,aThirdQueuedResolve,releaseAThird;
const bQueued=new Promise(resolve=>{bQueuedResolve=resolve});
const aThirdQueued=new Promise(resolve=>{aThirdQueuedResolve=resolve});
const apiReads=[],errors=[],cases=[];
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
const page=await ctx.newPage();
page.on('pageerror',error=>errors.push(error.stack||error.message));
const send=(route,body)=>route.fulfill({status:200,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(body)});
const report=(netFundingKobo,companyId)=>({companyId,month:'2026-10',balances:{},receivables:{openCount:0,openKobo:0,overdueKobo:0},approvedBudgetKobo:0,netFundingKobo,draftJournals:0});
await page.route('**/api/**',async route=>{
 const req=route.request(),p=new URL(req.url()).pathname,companyId=new URL(req.url()).searchParams.get('companyId');
 if(p==='/api/auth/me')return send(route,{authenticated:true,context:{sessionId:'finance-company-qa',employee:{id:'qa-user',displayName:'QA Finance',status:'active',timezone:'Africa/Lagos'},companies:authCompanies,roles:[{id:'qa-role',code:'staff',name:'Staff',companyId:authCompanies[0]?.id||''}],companyPermissions:authGrants,permissions:{'finance.access':'view','finance.receivables':'edit','finance.reports':'view','finance.journal':'create','finance.ledger':'view','finance.coa':'view','finance.budgets':'view'}}});
 if(p==='/api/finance/summary'){
  apiReads.push({path:p,companyId});
  if(companyId==='company-a'){
   aSummaryCount++;
   if(aSummaryCount===3){aThirdQueuedResolve();await new Promise(resolve=>{releaseAThird=resolve});return send(route,report(777700,companyId))}
   return send(route,report(aSummaryCount===1?111100:aSummaryCount===2?222200:333300,companyId));
  }
  bSummaryCount++;if(bSummaryCount>1)return send(route,report(555500,companyId));bQueuedResolve();
  await new Promise(resolve=>{releaseB=resolve});
  return send(route,report(999900,companyId));
 }
 if(p.startsWith('/api/finance/')){apiReads.push({path:p,companyId});if(p==='/api/finance/receivables')return send(route,{receivables:[]});if(p==='/api/finance/accounts')return send(route,{accounts:[]});if(p==='/api/finance/journals')return send(route,{journals:[]});if(p==='/api/finance/budgets')return send(route,{budgets:[]});return send(route,{})}
 if(p==='/api/support/mine')return send(route,{commands:[],assistanceRequests:[]});
 if(p==='/api/experience/layout')return send(route,{preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:false,canManage:false,canAccess:false});
 if(p==='/api/offline/bootstrap')return send(route,{ok:true,serverTime:'2026-10-10T02:00:00Z',businessTimezone:'Africa/Lagos',session:{id:'finance-company-qa',expiresAt:'2030-10-10T02:00:00Z'},policy:{enabled:true,maxQueueCount:50,allowedOperations:[]},operations:[]});
 if(p.startsWith('/api/'))return send(route,req.method()==='GET'?{}:{ok:true});
 return route.continue();
});
async function funding(text){await page.waitForFunction(value=>[...document.querySelectorAll('.fin-kpis article')].some(article=>article.textContent?.includes('Net Funding')&&article.textContent?.includes(value)),text,{timeout:10000})}
function checkTab(name,expected){return page.getByRole('button',{name,exact:true}).count().then(count=>assert.equal(count,expected,name+' tab visibility'))}
try{
 await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:25000});
 await page.locator('.postauth-module-envelope').first().waitFor({state:'attached',timeout:20000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'finance'}})));
 await page.locator('.finance-center-launcher').first().waitFor({state:'attached',timeout:20000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:open-module',{detail:{module:'finance'}})));
 await page.locator('.fin-shell').waitFor({state:'visible',timeout:12000});
 await funding('1,111');
 await checkTab('Receivables',1);await checkTab('Ledger & Journal',0);await checkTab('Budgets',0);
 await page.getByRole('button',{name:'Receivables',exact:true}).click();
 await page.getByRole('button',{name:'Record receivable'}).waitFor({state:'visible'});
 cases.push('Company A only: scoped receivables create visible, B ledger/budgets hidden');
 await page.locator('.fin-head select').selectOption('company-b');
 await bQueued;
 await checkTab('Receivables',0);await checkTab('Ledger & Journal',1);await checkTab('Budgets',1);
 assert.equal(await page.getByRole('button',{name:'Record receivable'}).count(),0,'Company A create action cleared from B');
 assert.equal(await page.locator('.fin-kpis').filter({hasText:'1,111'}).count(),0,'Company A summary cleared on company switch');
 assert.equal(apiReads.filter(r=>r.path==='/api/finance/receivables'&&r.companyId==='company-b').length,0,'no unauthorized B receivables read');
 await page.getByRole('button',{name:'Ledger & Journal'}).click();
 await page.getByText('Recent entries',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Create draft journal'}).count(),0,'Company A journal-create privilege absent in B');
 cases.push('Company B only: no A receivable exposure, no A journal-create permission');
 await page.locator('.fin-head select').selectOption('company-a');
 await funding('2,222');
 releaseB();
 await page.waitForTimeout(150);
 await funding('2,222');
 assert.equal(await page.locator('.fin-kpis').filter({hasText:'9,999'}).count(),0,'late B result ignored');
 cases.push('A-B-A: late Company B summary cannot replace Company A');
 await page.locator('.fin-head aside button').first().click();
 await aThirdQueued;
 await page.locator('.fin-head aside button').first().click();
 await funding('3,333');
 releaseAThird();
 await page.waitForTimeout(150);
 await funding('3,333');
 assert.equal(await page.locator('.fin-kpis').filter({hasText:'7,777'}).count(),0,'older same-company response ignored');
 cases.push('Concurrent same-company summary requests: latest accepted response wins');
 authCompanies=[{...companies[1],primary:true}];authGrants={'company-b':grants['company-b']};
 await page.waitForTimeout(16000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(()=>{const shell=document.querySelector('.fin-shell');if(!shell)return true;const select=shell.querySelector('.fin-head select');return Boolean(select&&[...select.options].every(option=>option.value!=='company-a'))},null,{timeout:10000});
 assert.equal(await page.locator('.fin-shell').getByText('3,333').count(),0,'revoked A summary removed');
 cases.push('Authentication refresh: revoked Company A removed from company selector and summary');
 // Owner authority must not depend on a company-specific Finance grant.
 const ownerContext=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 try{
  const ownerPage=await ownerContext.newPage(),ownerReads=[];
  ownerPage.on('pageerror',error=>errors.push(error.stack||error.message));
  await ownerPage.route('**/api/**',async route=>{
   const u=new URL(route.request().url()),p=u.pathname,requestedCompany=u.searchParams.get('companyId');
   if(p==='/api/auth/me')return send(route,{authenticated:true,context:{sessionId:'finance-owner-qa',employee:{id:'qa-owner',displayName:'QA Owner',status:'active',timezone:'Africa/Lagos'},companies,roles:[{id:'owner-role',code:'owner',name:'Owner',companyId:'company-a'}],permissions:{},companyPermissions:{}}});
   if(p==='/api/finance/summary'){ownerReads.push(requestedCompany);return send(route,report(requestedCompany==='company-a'?666600:888800,requestedCompany))}
   if(p==='/api/finance/receivables')return send(route,{receivables:[]});
   if(p==='/api/finance/accounts')return send(route,{accounts:[]});
   if(p==='/api/finance/journals')return send(route,{journals:[]});
   if(p==='/api/finance/budgets')return send(route,{budgets:[]});
   if(p==='/api/experience/layout')return send(route,{preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:false,canManage:false,canAccess:false});
   if(p==='/api/offline/bootstrap')return send(route,{ok:true,serverTime:'2026-10-10T02:00:00Z',businessTimezone:'Africa/Lagos',session:{id:'finance-owner-qa',expiresAt:'2030-10-10T02:00:00Z'},policy:{enabled:true,maxQueueCount:50,allowedOperations:[]},operations:[]});
   if(p==='/api/support/mine')return send(route,{commands:[],assistanceRequests:[]});
   if(p.startsWith('/api/'))return send(route,{});
   return route.continue();
  });
  await ownerPage.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:25000});
  await ownerPage.locator('.postauth-module-envelope').first().waitFor({state:'attached',timeout:20000});
  await ownerPage.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'finance'}})));
  await ownerPage.locator('.finance-center-launcher').first().waitFor({state:'attached',timeout:20000});
  await ownerPage.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:open-module',{detail:{module:'finance'}})));
  await ownerPage.locator('.fin-shell').waitFor({state:'visible',timeout:12000});
  for(const tabName of ['Receivables','Ledger & Journal','Reports','Budgets'])assert.equal(await ownerPage.getByRole('button',{name:tabName,exact:true}).count(),1,'Owner Finance tab '+tabName);
  await ownerPage.waitForFunction(()=>document.querySelector('.fin-kpis')?.textContent?.includes('6,666'),null,{timeout:10000});
  await ownerPage.locator('.fin-head select').selectOption('company-b');
  await ownerPage.waitForFunction(()=>document.querySelector('.fin-kpis')?.textContent?.includes('8,888'),null,{timeout:10000});
  assert.ok(ownerReads.includes('company-a')&&ownerReads.includes('company-b'),'Owner has Finance report data for both assigned companies');
  cases.push('Owner without explicit per-company Finance grants can view authorized A/B Finance tabs and reports');
  await ownerPage.screenshot({path:path.join(out,`finance-owner-company-boundaries-${width}.png`),fullPage:true});
 }finally{await ownerContext.close()}
 await page.screenshot({path:path.join(out,`finance-company-boundaries-${width}.png`),fullPage:true});
 assert.deepEqual(errors,[],'zero browser runtime errors');
 fs.writeFileSync(path.join(out,resultFile),JSON.stringify({generatedAt:new Date().toISOString(),passed:cases.length,cases,errors,apiReads},null,2));
 console.log(JSON.stringify({passed:cases.length,cases,errors}));
}catch(error){
 if(releaseB)releaseB();if(releaseAThird)releaseAThird();
 fs.writeFileSync(path.join(out,resultFile),JSON.stringify({generatedAt:new Date().toISOString(),passed:cases.length,cases,errors,failure:error.message,apiReads},null,2));
 console.error('FAILED:',error.stack||error);process.exitCode=1;
}finally{await ctx.close();await browser.close()}
