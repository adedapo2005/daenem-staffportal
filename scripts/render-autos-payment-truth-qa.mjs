import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.join(process.cwd(),'qa-artifacts','autos-payment-truth-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const sizes=[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const failures=[],runtimeErrors=[],results=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
const company={id:'company-autos',code:'AUTOS',name:'DAENEM Autos',primary:true};
const readyVehicle={id:'vehicle-ready',stockNo:'QA-001',vin:'VIN-QA-001',year:2024,make:'Toyota',model:'Corolla',status:'ready',purchaseCostKobo:850000000,askingPriceKobo:1200000000,landedCostKobo:900000000};
const reservedVehicle={id:'vehicle-reserved',stockNo:'QA-002',vin:'VIN-QA-002',year:2023,make:'Lexus',model:'RX 350',status:'reserved',purchaseCostKobo:1600000000,askingPriceKobo:2100000000,landedCostKobo:1750000000};
const lead={id:'lead-1',leadNo:'AUTO-LEAD-QA',customerName:'QA Customer',status:'negotiation',vehicleId:readyVehicle.id,stockNo:readyVehicle.stockNo,year:readyVehicle.year,make:readyVehicle.make,model:readyVehicle.model,budgetKobo:1200000000};
const job={id:'workshop-1',jobNo:'AUTO-JOB-QA',jobType:'internal',vehicleId:readyVehicle.id,stockNo:readyVehicle.stockNo,year:readyVehicle.year,make:readyVehicle.make,model:readyVehicle.model,estimateKobo:5000000,actualCostKobo:0,status:'inspection',priority:'normal'};

function makeContext(withSales){
 const permissions={'dashboard.access':'view','autos.access':withSales?'edit':'view','sales.access':withSales?'edit':'none'};
 return {sessionId:withSales?'qa-autos-sales':'qa-autos-ops',employee:{id:withSales?'qa-sales':'qa-ops',displayName:'QA User',status:'active'},companies:[company],roles:[{id:'qa-role',code:'manager',name:'Manager',companyId:company.id}],permissions,companyPermissions:{[company.id]:permissions}};
}

async function installRoutes(page,withSales,state){
 const context=makeContext(withSales);
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(value)});
  if(url.pathname==='/api/auth/me')return send({authenticated:true,context});
  if(url.pathname==='/api/auth/logout')return send({ok:true});
  if(url.pathname==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:true,canManage:false,canAccess:false});
  if(url.pathname.startsWith('/api/experience/layout/'))return send({ok:true});
  if(url.pathname==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-08T03:10:00.000Z',businessTimezone:'Africa/Lagos',maxOfflineAgeMinutes:720,session:{id:context.sessionId,expiresAt:'2030-10-08T03:10:00.000Z'},policy:{enabled:true,maxQueueCount:50,automaticSync:true,manualRetry:true,allowedOperations:[]},operations:[]});
  if(url.pathname==='/api/offline/telemetry')return send({ok:true});
  if(url.pathname==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
  if(url.pathname==='/api/autos/dashboard')return send({metrics:withSales?{vehicles:2,stockValueKobo:2650000000,ready:1,preparation:0,reserved:1,openLeads:1,followupsDue:0,openWorkshopJobs:1,waitingParts:0,monthlySales:3,monthlyRevenueKobo:3300000000}:{vehicles:2,stockValueKobo:2650000000,ready:1,preparation:0,reserved:1,openWorkshopJobs:1,waitingParts:0}});
  if(url.pathname==='/api/autos/vehicles'&&method==='GET')return send({vehicles:[readyVehicle,reservedVehicle]});
  if(url.pathname==='/api/autos/leads'&&method==='GET'){state.leadRequests++;return send({leads:withSales?[lead]:[]});}
  if(url.pathname==='/api/autos/workshop'&&method==='GET')return send({jobs:[job]});
  if(url.pathname==='/api/autos/sales'&&method==='POST'){
    state.salesPosts.push(JSON.parse(request.postData()||'{}'));
    return send({ok:true,sale:{id:'sale-qa',saleNo:'AUTO-QA-001',salePriceKobo:1200000000,amountPaidKobo:0,balanceKobo:1200000000,paymentStatus:'unpaid',saleStatus:'reserved',grossProfitKobo:300000000}},201);
  }
  if(url.pathname==='/api/autos/leads/activity'&&method==='POST')return send({ok:true});
  if(url.pathname.startsWith('/api/'))return send(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}
async function waitForShell(page){
 await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]',{timeout:20000});
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:20000});
}
async function launchAutos(page){
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:'autos'}})));
 await page.waitForSelector('.autos-shell',{timeout:20000});
}
async function audit(page){
 return page.evaluate(()=>{
  const root=document.querySelector('.autos-shell');
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const fonts=root?[...root.querySelectorAll('*')].filter(visible).map(el=>parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite):[];
  return {missing:!root,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,minFont:fonts.length?Math.min(...fonts):null,under:fonts.filter(x=>x<9)};
 });
}
const browser=await chromium.launch({headless:true});
for(const [width,height] of sizes){
 const salesState={leadRequests:0,salesPosts:[]};
 const sales=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const page=await sales.newPage();
 page.on('pageerror',e=>runtimeErrors.push(width+' sales: '+e.message));
 page.on('console',m=>{if(m.type()==='error')runtimeErrors.push(width+' sales console: '+m.text())});
 await installRoutes(page,true,salesState);
 await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await waitForShell(page);
 await launchAutos(page);
 await page.getByText('Sales Record Truth',{exact:true}).waitFor();
 await page.getByText('Recorded sales',{exact:true}).waitFor();
 await page.getByRole('button',{name:/Vehicle Stock/i}).click();
 await page.locator('.vehicle-list button').filter({hasText:'QA-001'}).click();
 const salesAudit=await audit(page);
 check(!salesAudit.missing,width+': Autos shell missing');
 check(!salesAudit.overflow,width+': authorized view overflow');
 check(salesAudit.under.length===0,width+': authorized view text below 9px');
 await page.screenshot({path:path.join(outDir,'autos-payment-truth-'+width+'x'+height+'.png'),fullPage:false});
 await sales.close();
 const opsState={leadRequests:0,salesPosts:[]};
 const ops=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const opsPage=await ops.newPage();
 opsPage.on('pageerror',e=>runtimeErrors.push(width+' operations: '+e.message));
 opsPage.on('console',m=>{if(m.type()==='error')runtimeErrors.push(width+' operations console: '+m.text())});
 await installRoutes(opsPage,false,opsState);
 await opsPage.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await waitForShell(opsPage);
 await launchAutos(opsPage);
 check(opsState.leadRequests===0,width+': operations-only view requested restricted lead data');
 check(await opsPage.getByText('Sales Record Truth',{exact:true}).count()===0,width+': restricted sales truth panel should be hidden');
 check(await opsPage.getByText('Recorded sales',{exact:true}).count()===0,width+': restricted sales count should be hidden');
 check(await opsPage.getByText('Recorded sale value',{exact:true}).count()===0,width+': restricted sale value should be hidden');
 check(await opsPage.getByText('Sales Pipeline',{exact:true}).count()===0,width+': restricted pipeline should be hidden');
 check(await opsPage.getByRole('button',{name:/Leads & Sales/i}).count()===0,width+': restricted Leads tab should be hidden');
 const opsAudit=await audit(opsPage);
 check(!opsAudit.missing,width+': operations Autos shell missing');
 check(!opsAudit.overflow,width+': operations view overflow');
 check(opsAudit.under.length===0,width+': operations view text below 9px');
 results.push({width,height,authorizedMinFont:salesAudit.minFont,operationsMinFont:opsAudit.minFont,authorizedOverflow:salesAudit.overflow,operationsOverflow:opsAudit.overflow,operationsLeadRequests:opsState.leadRequests});
 await ops.close();
}
await browser.close();
if(runtimeErrors.length)failures.push(...runtimeErrors.map(x=>'runtime: '+x));
const report={generatedAt:new Date().toISOString(),baseUrl,results,runtimeErrors,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Autos payment truth rendered QA: PASS ('+results.length+' viewports)');
