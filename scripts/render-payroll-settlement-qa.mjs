import { chromium } from 'playwright';

import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4176';
const outDir=path.join(root,'qa-artifacts','payroll-settlement-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const failures=[],runtimeErrors=[],results=[];
const assert=(ok,message)=>{if(!ok)failures.push(message)};
const company={id:'company-printing',code:'PRINT',name:'Printing & Technology',primary:true};
const permissions={'dashboard.access':'view','payroll.access':'approve'};
const context={sessionId:'qa-session',employee:{id:'qa-user',displayName:'QA User',status:'active'},companies:[company],roles:[{id:'qa-role',code:'manager',name:'Manager',companyId:company.id}],permissions,companyPermissions:{[company.id]:permissions}};
const sampleRun={id:'qa',status:'processing'};
const runId='run-processing';
const runLabel='PAY-QA';
const periodStart='2026-10-01';
const periodEnd='2026-10-31';
async function installRoutes(page,state){
 await page.route('**/api/**',async route=>{
  const request=route.request();
  const url=new URL(request.url());
  const method=request.method();
  const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(value)});
  if(url.pathname==='/api/auth/me')return send({authenticated:true,context});
  if(url.pathname==='/api/auth/logout')return send({ok:true});
  if(url.pathname==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:true,canManage:false,canAccess:false});
  if(url.pathname.startsWith('/api/experience/layout/'))return send({ok:true});
  if(url.pathname==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-07T09:30:00.000Z',businessTimezone:'Africa/Lagos',maxOfflineAgeMinutes:720,session:{id:context.sessionId,expiresAt:'2030-10-07T09:30:00.000Z',lastVerifiedAt:'2026-10-07T09:30:00.000Z'},policy:{enabled:true,maxQueueCount:50,attachmentMaxBytes:10485760,automaticSync:true,manualRetry:true,retentionDays:30,allowedOperations:[]},operations:[]});
  if(url.pathname==='/api/offline/telemetry')return send({ok:true,serverReceivedAt:'2026-10-07T09:30:00.000Z'});
  if(url.pathname==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
  if(url.pathname==='/api/payroll/compensation'&&method==='GET')return send({employees:[]});
  if(url.pathname==='/api/payroll/runs'&&method==='GET')return send({runs:[{id:runId,runNo:runLabel,periodStart,periodEnd,payDate:periodEnd,status:'processing',totalGrossKobo:0,totalDeductionsKobo:0,totalNetKobo:0,createdAt:'2026-10-07T09:00:00.000Z'}]});
  if(url.pathname==='/api/payroll/run'&&method==='GET')return send({run:{id:runId,run_no:runLabel,period_start:periodStart,period_end:periodEnd,status:'processing',total_gross_kobo:0,total_deductions_kobo:0,total_net_kobo:0},items:[]});
  if(url.pathname==='/api/payroll/runs/status'&&method==='POST'){
   let body={};try{body=JSON.parse(request.postData()||'{}')}catch{}
   if(body.toStatus==='paid')state.paidAttempts+=1;
   return send({error:'Authoritative payment evidence is required.'},409);
  }
  if(url.pathname==='/api/owner/intelligence')return send({generatedAt:'2026-10-07T09:30:00.000Z',workDate:'2026-10-07',period:{key:'current_day',label:'Today',start:'2026-10-07',end:'2026-10-07',comparisonLabel:'yesterday'},scope:{companyId:company.id,companyName:company.name,companyIds:[company.id]},group:{},finance:{},construction:{},companies:{},alerts:[]});
  if(url.pathname.startsWith('/api/'))return send(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}
async function visibleAudit(page){
 return page.evaluate(()=>{
  const root=document.querySelector('.payroll-detail');
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const fonts=root?[...root.querySelectorAll('*')].filter(visible).map(el=>parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite):[];
  return {missing:!root,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,minFont:fonts.length?Math.min(...fonts):null,under:fonts.filter(x=>x<9),text:root?.textContent||''};
 });
}
const viewports=[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const browser=await chromium.launch({headless:true});
for(const [width,height] of viewports){
 const browserContext=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const page=await browserContext.newPage(),state={paidAttempts:0};
 page.on('pageerror',error=>runtimeErrors.push(width+': '+error.message));
 page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))runtimeErrors.push(width+' console: '+message.text())});
 await installRoutes(page,state);
 await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]',{timeout:20000});
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:20000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:'payroll'}})));
 await page.waitForSelector('.payroll-shell',{timeout:15000});
 await page.getByText(runLabel,{exact:true}).click();
 await page.waitForSelector('.payroll-detail',{timeout:15000});
 await page.getByText('Payment confirmation pending',{exact:true}).waitFor();
 const paidButtonCount=await page.getByRole('button',{name:/Record as Paid/i}).count();
 assert(paidButtonCount===0,width+': paid action is visible');
 assert(state.paidAttempts===0,width+': browser attempted a paid transition');
 const audit=await visibleAudit(page);
 assert(!audit.missing,width+': Payroll detail missing');
 assert(!audit.overflow,width+': horizontal overflow');
 assert(audit.under.length===0,width+': visible Payroll detail text below 9px');
 assert(/bank or provider acknowledgement/i.test(audit.text),width+': acknowledgement copy missing');
 assert(/reconciliation evidence/i.test(audit.text),width+': reconciliation copy missing');
 await page.screenshot({path:path.join(outDir,'payroll-settlement-'+width+'x'+height+'.png'),fullPage:false});
 results.push({width,height,minFont:audit.minFont,overflow:audit.overflow,paidAttempts:state.paidAttempts});
 await browserContext.close();
}
await browser.close();
if(runtimeErrors.length)failures.push(...runtimeErrors.map(value=>'runtime: '+value));
const report={generatedAt:new Date().toISOString(),baseUrl,results,runtimeErrors,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Payroll settlement-truth rendered QA: PASS ('+results.length+' viewports, zero paid-transition attempts)');
