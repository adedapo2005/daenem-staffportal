import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4173';
const outDir=path.join(process.cwd(),'qa-artifacts',process.env.QA_SMOKE?'logistics-smoke':'logistics-permission-payment-accepted-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const sizes=process.env.QA_SMOKE?[[390,844]]:[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const failures=[],errors=[],results=[];
function check(value,label){if(!value)failures.push(label)}
const company={id:'company-logistics',code:'LOGISTICS',name:'DAENEM Logistics',primary:true};
const vehicles=[{id:'v-1',fleetNo:'FLT-001',vehicleType:'van',status:'available',odometerKm:1100}];
const shipments=[
 {id:'s-1',shipmentNo:'SHIP-001',cargoDescription:'Office supplies',pickupAddress:'Ibadan',deliveryAddress:'Lagos',status:'in_transit',priority:'normal',quotedKobo:1950000,proofOfDeliveryRequired:1},
 {id:'s-2',shipmentNo:'SHIP-002',cargoDescription:'Warehouse stock',pickupAddress:'Lagos',deliveryAddress:'Abuja',status:'scheduled',priority:'high',quotedKobo:4200000,proofOfDeliveryRequired:1},
];
const trips=[{id:'t-1',tripNo:'TRIP-001',vehicleId:'v-1',fleetNo:'FLT-001',driverEmployeeId:'driver-1',driverName:'Assigned Driver',status:'in_progress',origin:'Ibadan',destination:'Lagos',shipmentCount:1,shipmentIds:['s-1'],revenueKobo:1950000,totalExpenseKobo:150000,grossProfitKobo:1800000}];
function context(mode){
 const granular=mode==='dispatch'
 ?{'logistics.fleet':'manage','logistics.shipments':'manage','logistics.dispatch':'manage','logistics.trip_execution':'manage','logistics.trip_expense':'manage','logistics.pod':'manage'}
 :mode==='driver'
 ?{'logistics.fleet':'none','logistics.shipments':'view','logistics.dispatch':'none','logistics.trip_execution':'create','logistics.trip_expense':'create','logistics.pod':'create'}
 :mode==='fleet'
 ?{'logistics.fleet':'view','logistics.shipments':'none','logistics.dispatch':'none','logistics.trip_execution':'none'}
 :{'logistics.fleet':'none','logistics.shipments':'create','logistics.dispatch':'none','logistics.trip_execution':'none'};
 const employeeId=mode==='driver'?'driver-1':'qa-'+mode;
 return{sessionId:'qa-logistics-'+mode,employee:{id:employeeId,displayName:'QA '+mode,status:'active'},companies:[company],roles:[{id:'qa-role',code:mode==='driver'?'driver':'manager',name:'QA Role',companyId:company.id}],permissions:{'dashboard.access':'view','logistics.access':'manage','logistics.dispatch':'manage',...granular},companyPermissions:{[company.id]:granular}};
}
async function routes(page,mode,state){
 const auth=context(mode);
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(body)});
  if(url.pathname==='/api/auth/me')return respond({authenticated:true,context:auth});
  if(url.pathname==='/api/auth/logout')return respond({ok:true});
  if(url.pathname==='/api/experience/layout')return respond({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:true,canManage:false,canAccess:false});
  if(url.pathname.startsWith('/api/experience/layout/'))return respond({ok:true});
  if(url.pathname==='/api/offline/bootstrap')return respond({ok:true,serverTime:'2026-10-08T03:10:00.000Z',businessTimezone:'Africa/Lagos',maxOfflineAgeMinutes:720,session:{id:auth.sessionId,expiresAt:'2030-10-08T03:10:00.000Z'},policy:{enabled:true,maxQueueCount:50,automaticSync:true,manualRetry:true,allowedOperations:[]},operations:[]});
  if(url.pathname==='/api/offline/telemetry')return respond({ok:true});
  if(url.pathname==='/api/support/mine')return respond({commands:[],assistanceRequests:[]});
  if(url.pathname.startsWith('/api/logistics/')){
   state.requests.push(url.pathname+' '+method);
   if(url.pathname==='/api/logistics/dashboard')return respond({metrics:mode==='dispatch'?{fleet:1,vehiclesAvailable:1,activeShipments:2,shipmentsMoving:1,deliveredToday:0,activeTrips:1,monthlyRevenueKobo:1950000,monthlyGrossProfitKobo:1800000}:mode==='fleet'?{fleet:1,vehiclesAvailable:1,vehiclesUnavailable:0}:{activeShipments:2,shipmentsMoving:1,deliveredToday:0,activeTrips:1}});
   if(url.pathname==='/api/logistics/fleet')return respond({vehicles,drivers:mode==='dispatch'?[{employeeId:'driver-1',displayName:'Assigned Driver',drivingStatus:'cleared'}]:[]});
   if(url.pathname==='/api/logistics/shipments')return respond({shipments:mode==='dispatch'?shipments:shipments.map(s=>{const {quotedKobo,...rest}=s;return rest})});
   if(url.pathname==='/api/logistics/trips')return respond({trips:mode==='dispatch'?trips:trips.map(t=>{const {revenueKobo,totalExpenseKobo,grossProfitKobo,...rest}=t;return rest})});
   return respond({ok:true});
  }
  if(url.pathname.startsWith('/api/'))return respond(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}
async function openLogistics(page){
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:30000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:'logistics'}})));

 await page.locator('.log-shell').waitFor({timeout:30000});
 await page.getByRole('heading',{name:'Fleet & Dispatch Center'}).waitFor();
}
async function audit(page){
 return page.evaluate(()=>{
  const root=document.querySelector('.log-shell');
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const fonts=root?[...root.querySelectorAll('*')].filter(visible).map(el=>parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite):[];
  const navigation=root?.querySelector('.log-tabs'),bounds=navigation?.getBoundingClientRect();
  const tabsClipped=[...(navigation?.querySelectorAll('button')||[])].some(button=>{const r=button.getBoundingClientRect();return bounds&&(r.left<bounds.left-1||r.right>bounds.right+1)});
  return{overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,minFont:fonts.length?Math.min(...fonts):null,under:fonts.filter(x=>x<9),tabOverflow:navigation?navigation.scrollWidth>navigation.clientWidth+1:false,tabsClipped};
 });
}
const browser=await chromium.launch({headless:true});
try{
 for(const [width,height] of sizes){
  const detail={width,height};
  for(const mode of (process.env.QA_SMOKE?['dispatch']:['dispatch','driver','fleet','shipment'])){
   const state={requests:[]};
   const browserContext=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',timezoneId:'Africa/Lagos'});
   const page=await browserContext.newPage();
   page.on('pageerror',e=>errors.push(width+' '+mode+' page: '+e.message));
   page.on('console',m=>{if(m.type()==='error')errors.push(width+' '+mode+' console: '+m.text())});
   try{
    await routes(page,mode,state);
    await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
    await openLogistics(page);
    const data=await audit(page);
    detail[mode]={...data,requests:state.requests};
    check(!data.overflow,width+' '+mode+' horizontal overflow');
    check(!data.tabOverflow&&!data.tabsClipped,width+' '+mode+' clipped navigation');
    check(data.under.length===0,width+' '+mode+' text below 9px');
    const paths=state.requests.join('|');
    const has=(verb)=>paths.includes(verb);
    check(!has('/api/logistics/shipments GET')||mode==='dispatch'||mode==='driver',width+' '+mode+' unsafe shipment read');
    check(!has('/api/logistics/fleet GET')||mode==='dispatch'||mode==='fleet',width+' '+mode+' unauthorized fleet read');
    check(!has('/api/logistics/trips GET')||mode==='dispatch'||mode==='driver',width+' '+mode+' unauthorized trip read');
    if(mode==='dispatch'){
     check(await page.getByText('Recorded Trip Value',{exact:true}).count()===1,width+' dispatcher financial summary missing');
     check(await page.getByText('Recorded Trip Margin',{exact:true}).count()>=1,width+' dispatcher margin missing');
     await page.screenshot({path:path.join(outDir,'logistics-dispatch-'+width+'x'+height+'.png'),fullPage:false});
    }else{
     check(await page.getByText('Recorded Trip Value',{exact:true}).count()===0,width+' '+mode+' money exposure');
     check(await page.getByText('Recorded Trip Margin',{exact:true}).count()===0,width+' '+mode+' margin exposure');
     check(!paths.includes('/api/logistics/trips GET')||mode==='driver',width+' '+mode+' trip read');
     if(mode==='driver'){
      await page.getByRole('button',{name:/Trips/i}).click();
      await page.locator('.trip-list button').first().click();
      const restricted=await page.locator('.trip-list').getByText('Recorded margin').count();
      check(restricted===0,width+' driver saw margin');
      check(await page.getByRole('heading',{name:'Dispatch Trip'}).count()===0,width+' driver can dispatch');
      await page.getByRole('heading',{name:'Proof of Delivery'}).waitFor();
      const podChoices=await page.locator('.log-form.mini select').first().locator('option').allTextContents();
      check(podChoices.some(x=>x.includes('SHIP-001'))&&!podChoices.some(x=>x.includes('SHIP-002')),width+' driver POD includes unrelated trip');
      await page.screenshot({path:path.join(outDir,'logistics-driver-'+width+'x'+height+'.png'),fullPage:false});
     }
     if(mode==='fleet'){
      check(await page.getByRole('button',{name:'Shipments',exact:true}).count()===0,width+' fleet-only shipment tab');
      check(await page.getByRole('button',{name:'Trips',exact:true}).count()===0,width+' fleet-only trips tab');
     }
     if(mode==='shipment'){
      check(!paths.includes('/api/logistics/shipments GET'),width+' non-driver unsafe backend projection requested');
      await page.getByRole('button',{name:'Shipments',exact:true}).click();
      await page.getByText('Shipment records need a permission-safe view before they can be shown here.').waitFor();
     }
    }
   }catch(error){failures.push(width+' '+mode+' '+String(error))}
   finally{await browserContext.close()}
  }
  results.push(detail);
 }
}finally{await browser.close()}
if(errors.length)failures.push(...errors.map(x=>'runtime: '+x));
const report={generatedAt:new Date().toISOString(),baseUrl,results,errors,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(failures.length){console.error(failures.slice(0,60).join('\n'));process.exit(1)}
console.log('Logistics payment and permission browser QA: PASS ('+results.length+' widths, four permission profiles)');
