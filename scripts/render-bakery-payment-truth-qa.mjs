import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.join(process.cwd(),'qa-artifacts','bakery-payment-truth-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const sizes=[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const failures=[],runtimeErrors=[],results=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg)};
const company={id:'company-bakery',code:'BAKERY',name:'DAENEM Bakery',primary:true};
const product={id:'bp-1',inventoryItemId:'item-1',code:'BRD-01',barcode:'10001',name:'Family Loaf',category:'bread',salesUnit:'piece',sellingPriceKobo:200000,availableQty:25};
const dashboard={date:'2026-10-08',metrics:{orders:4,revenueKobo:800000,paidKobo:200000,activeBatches:1,unitsProduced:30,batchWaste:1,wasteCostKobo:5000,lowStockItems:0},bestSellers:[{id:'bp-1',name:'Family Loaf',quantity:4,revenueKobo:800000}]};

function makeContext(withSales){
 const permissions={'dashboard.access':'view','bakery.access':'edit','sales.access':withSales?'create':'none'};
 return {sessionId:withSales?'qa-bakery-sales':'qa-bakery-ops',employee:{id:withSales?'qa-sales':'qa-ops',displayName:'QA User',status:'active'},companies:[company],roles:[{id:'qa-role',code:'manager',name:'Manager',companyId:company.id}],permissions,companyPermissions:{[company.id]:permissions}};
}

async function installRoutes(page,withSales,posted){
 const context=makeContext(withSales);
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(value)});
  if(url.pathname==='/api/auth/me')return send({authenticated:true,context});
  if(url.pathname==='/api/auth/logout')return send({ok:true});
  if(url.pathname==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:true,canManage:false,canAccess:false});
  if(url.pathname.startsWith('/api/experience/layout/'))return send({ok:true});
  if(url.pathname==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-08T02:30:00.000Z',businessTimezone:'Africa/Lagos',maxOfflineAgeMinutes:720,session:{id:context.sessionId,expiresAt:'2030-10-08T02:30:00.000Z'},policy:{enabled:true,maxQueueCount:50,automaticSync:true,manualRetry:true,allowedOperations:[]},operations:[]});
  if(url.pathname==='/api/offline/telemetry')return send({ok:true});
  if(url.pathname==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
  if(url.pathname==='/api/bakery/dashboard')return send(dashboard);
  if(url.pathname==='/api/bakery/catalog')return send({products:[product],recipes:[]});
  if(url.pathname==='/api/bakery/batches')return send({batches:[]});
  if(url.pathname==='/api/bakery/ingredients')return send({ingredients:[]});
  if(url.pathname==='/api/bakery/pos/sale'&&method==='POST'){
    posted.push(JSON.parse(request.postData()||'{}'));
    return send({ok:true,sale:{orderNo:'BAK-SALE-QA',totalKobo:200000,amountPaidKobo:0,paymentStatus:'unpaid',status:'approved',fulfillmentStatus:'pending'}},201);
  }
  if(url.pathname==='/api/owner/intelligence')return send({generatedAt:'2026-10-08T02:30:00.000Z',workDate:'2026-10-08',period:{key:'current_day',label:'Today',start:'2026-10-08',end:'2026-10-08'},scope:{companyId:company.id,companyName:company.name,companyIds:[company.id]},group:{},finance:{},construction:{},companies:{},alerts:[]});
  if(url.pathname.startsWith('/api/'))return send(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}

async function waitForShell(page){
 await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]',{timeout:20000});
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:20000});
}
async function launchBakery(page){
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:'bakery'}})));
 await page.waitForSelector('.bakery-shell',{timeout:20000});
}
async function audit(page){
 return page.evaluate(()=>{
  const root=document.querySelector('.bakery-shell');
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const fonts=root?[...root.querySelectorAll('*')].filter(visible).map(el=>parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite):[];
  return {missing:!root,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,minFont:fonts.length?Math.min(...fonts):null,under:fonts.filter(x=>x<9)};
 });
}

const browser=await chromium.launch({headless:true});
for(const [width,height] of sizes){
 const posted=[];
 const sales=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const page=await sales.newPage();
 page.on('pageerror',e=>runtimeErrors.push(width+' sales: '+e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))runtimeErrors.push(width+' sales console: '+m.text())});
 await installRoutes(page,true,posted);
 await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await waitForShell(page);
 await launchBakery(page);
 await page.getByText("Today's order value",{exact:true}).waitFor();
 await page.getByText('Order values below come from recorded Bakery orders. They do not confirm bank/POS settlement or reconciliation.',{exact:true}).waitFor();
 await page.getByRole('button',{name:/POS & Orders/i}).click();
 await page.getByRole('button',{name:/Family Loaf/i}).click();
 await page.getByLabel('Payment').selectOption('bank_transfer');
 await page.getByText('This payment stays outstanding until StaffPortal receives verified payment confirmation. Credit does not mean Paid.',{exact:true}).waitFor();
 check(await page.getByText('Transfer/POS reference',{exact:true}).count()===0,width+': reference input should not imply payment confirmation');
 check(await page.getByText('Cash received ₦',{exact:true}).count()===0,width+': cash amount field should be hidden for bank transfer');
 await page.getByRole('button',{name:'Create order',exact:true}).click();
 await page.waitForTimeout(50);
 check(posted.length===1,width+': expected one Bakery order POST');
 if(posted[0]){
  check(posted[0].paymentMethod==='bank_transfer',width+': bank transfer method not preserved');
  check(posted[0].amountPaidNaira===0,width+': non-cash order submitted a paid amount');
  check(posted[0].fulfillNow===false,width+': non-cash order was auto-fulfilled');
  check(!('reference' in posted[0]),width+': unverified payment reference was submitted');
 }
 const salesAudit=await audit(page);
 check(!salesAudit.missing,width+': Bakery shell missing');
 check(!salesAudit.overflow,width+': sales view overflow');
 check(salesAudit.under.length===0,width+': sales view text below 9px');
 await page.screenshot({path:path.join(outDir,'bakery-payment-truth-'+width+'x'+height+'.png'),fullPage:false});
 await sales.close();

 const ops=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const opsPage=await ops.newPage();
 opsPage.on('pageerror',e=>runtimeErrors.push(width+' ops: '+e.message));
 opsPage.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))runtimeErrors.push(width+' ops console: '+m.text())});
 await installRoutes(opsPage,false,[]);
 await opsPage.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await waitForShell(opsPage);
 await launchBakery(opsPage);
 check(await opsPage.getByText("Today's order value",{exact:true}).count()===0,width+': order value should be hidden without sales authority');
 check(await opsPage.getByText('Order values below come from recorded Bakery orders. They do not confirm bank/POS settlement or reconciliation.',{exact:true}).count()===0,width+': commercial notice should be hidden without sales authority');
 check(await opsPage.getByRole('button',{name:/POS & Orders/i}).count()===0,width+': POS tab should be hidden without sales authority');
 const opsAudit=await audit(opsPage);
 check(!opsAudit.overflow,width+': operations view overflow');
 check(opsAudit.under.length===0,width+': operations view text below 9px');
 results.push({width,height,salesMinFont:salesAudit.minFont,operationsMinFont:opsAudit.minFont,salesOverflow:salesAudit.overflow,operationsOverflow:opsAudit.overflow,nonCashPost:posted[0]||null});
 await ops.close();
}
await browser.close();
if(runtimeErrors.length)failures.push(...runtimeErrors.map(x=>'runtime: '+x));
const report={generatedAt:new Date().toISOString(),baseUrl,results,runtimeErrors,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Bakery payment truth rendered QA: PASS ('+results.length+' viewports)');
