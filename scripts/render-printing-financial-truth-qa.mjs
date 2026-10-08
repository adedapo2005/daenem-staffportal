import { chromium } from 'playwright';
const QA_WIDTHS=[390,430,768,1024,1366,1672,1920,2560,3840];
import fs from 'node:fs';
import path from 'node:path';
const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.join(process.cwd(),'qa-artifacts','printing-financial-truth-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const sizes=[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const failures=[],runtimeErrors=[],results=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
const company={id:'company-printing'};
company.code='PRINT'; company.name='Printing & Technology'; company.primary=true;
const job={id:'job-1',jobNo:'DP-QA-0001',title:'QA Banner',status:'printing'};
job.priority='normal';
const dash={date:'2026-10-07',month:'2026-10',metrics:{openJobs:3,overdueJobs:0,readyJobs:1,customers:4,lowStockItems:0},pipeline:[{status:'printing',count:2}],recentJobs:[job]};
const customers=[{id:'c1',name:'QA Customer',businessName:'QA Business'}];
const services=[{id:'s1',code:'BANNER',name:'Banner',category:'Large Format',pricingUnit:'job',requiresArtwork:1,requiresProof:1}];
function makeContext(financial){
 const level=financial?'approve':'edit';
 const permissions={'dashboard.access':'view','printing.access':level,'finance.access':financial?'view':'none'};
 return {sessionId:financial?'qa-fin':'qa-ops',employee:{id:financial?'qa-fin':'qa-ops',displayName:'QA User',status:'active'},companies:[company],roles:[{id:'qa-role',code:'manager',name:'Manager',companyId:company.id}],permissions,companyPermissions:{[company.id]:permissions}};
}
async function installRoutes(page,financial){
 const context=makeContext(financial);
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(value)});
  if(url.pathname==='/api/auth/me')return send({authenticated:true,context});
  if(url.pathname==='/api/auth/logout')return send({ok:true});
  if(url.pathname==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:true,canManage:false,canAccess:false});
  if(url.pathname.startsWith('/api/experience/layout/'))return send({ok:true});
  if(url.pathname==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-07T22:10:00.000Z',businessTimezone:'Africa/Lagos',maxOfflineAgeMinutes:720,session:{id:context.sessionId,expiresAt:'2030-10-07T22:10:00.000Z'},policy:{enabled:true,maxQueueCount:50,automaticSync:true,manualRetry:true,allowedOperations:[]},operations:[]});
  if(url.pathname==='/api/offline/telemetry')return send({ok:true});
  if(url.pathname==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
  if(url.pathname==='/api/printing/dashboard')return send(dash);
  if(url.pathname==='/api/printing/services')return send({services});
  if(url.pathname==='/api/printing/customers')return send({customers});
  if(url.pathname==='/api/printing/jobs'&&method==='GET')return send({jobs:[job]});
  if(url.pathname==='/api/owner/intelligence')return send({generatedAt:'2026-10-07T22:10:00.000Z',workDate:'2026-10-07',period:{key:'current_day',label:'Today',start:'2026-10-07',end:'2026-10-07'},scope:{companyId:company.id,companyName:company.name,companyIds:[company.id]},group:{},finance:{},construction:{},companies:{},alerts:[]});
  if(url.pathname.startsWith('/api/'))return send(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}
async function waitForShell(page){
 await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]',{timeout:20000});
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:20000});
}
async function launchPrinting(page){
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:'printing'}})));
 await page.waitForSelector('.printing-shell',{timeout:20000});
}
async function audit(page){
 return page.evaluate(()=>{
  const root=document.querySelector('.printing-shell');
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const fonts=root?[...root.querySelectorAll('*')].filter(visible).map(el=>parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite):[];
  return {missing:!root,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,minFont:fonts.length?Math.min(...fonts):null,under:fonts.filter(x=>x<9)};
 });
}
const browser=await chromium.launch({headless:true});
for(const [width,height] of sizes){
 const fin=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const finPage=await fin.newPage();
 finPage.on('pageerror',e=>runtimeErrors.push(width+' finance: '+e.message));
 finPage.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))runtimeErrors.push(width+' finance console: '+m.text())});
 await installRoutes(finPage,true);
 await finPage.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await waitForShell(finPage);
 await launchPrinting(finPage);
 await finPage.getByText('Month invoiced',{exact:true}).waitFor();
 await finPage.getByText('These figures are based on recorded invoices and costs. They do not confirm customer payment, bank settlement or reconciliation.',{exact:true}).waitFor();
 check(await finPage.getByText('Month revenue',{exact:true}).count()===0,width+': legacy revenue wording rendered');
 const finAudit=await audit(finPage);
 check(!finAudit.missing,width+': Printing shell missing');
 check(!finAudit.overflow,width+': finance view page overflow');
 check(finAudit.under.length===0,width+': finance view text below 9px');
 await finPage.getByRole('button',{name:/Print Jobs/i}).click();
 check(await finPage.getByRole('columnheader',{name:'Quoted / Invoiced Margin'}).count()===1,width+': margin basis header missing');
 await finPage.screenshot({path:path.join(outDir,'printing-financial-truth-'+width+'x'+height+'.png'),fullPage:false});
 await fin.close();
 const ops=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const opsPage=await ops.newPage();
 opsPage.on('pageerror',e=>runtimeErrors.push(width+' operations: '+e.message));
 opsPage.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))runtimeErrors.push(width+' operations console: '+m.text())});
 await installRoutes(opsPage,false);
 await opsPage.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await waitForShell(opsPage);
 await launchPrinting(opsPage);
 check(await opsPage.getByText('Month invoiced',{exact:true}).count()===0,width+': invoiced metric should be hidden');
 check(await opsPage.getByText('COMMERCIAL VIEW',{exact:true}).count()===0,width+': commercial panel should be hidden');
 await opsPage.getByRole('button',{name:/Print Jobs/i}).click();
 check(await opsPage.getByRole('columnheader',{name:'Quote'}).count()===0,width+': quote column should be hidden');
 check(await opsPage.getByRole('columnheader',{name:'Quoted / Invoiced Margin'}).count()===0,width+': margin column should be hidden');
 await opsPage.getByRole('button',{name:'Customers',exact:true}).click();
 check(await opsPage.locator('.customer-card > b').count()===0,width+': customer balance should be hidden');
 await opsPage.getByRole('button',{name:/New Print Job/i}).click();
 check(await opsPage.getByText('Quoted amount (₦)',{exact:true}).count()===0,width+': quote input should be hidden');
 const opsAudit=await audit(opsPage);
 check(!opsAudit.overflow,width+': operations view page overflow');
 check(opsAudit.under.length===0,width+': operations view text below 9px');
 results.push({width,height,financialMinFont:finAudit.minFont,operationsMinFont:opsAudit.minFont,financialOverflow:finAudit.overflow,operationsOverflow:opsAudit.overflow});
 await ops.close();
}
await browser.close();
if(runtimeErrors.length)failures.push(...runtimeErrors.map(x=>'runtime: '+x));
const report={generatedAt:new Date().toISOString(),baseUrl,results,runtimeErrors,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Printing financial truth rendered QA: PASS ('+results.length+' viewports)');
