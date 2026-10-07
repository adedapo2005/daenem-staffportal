import { chromium } from 'playwright';

import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4176';
const outDir=path.join(root,'qa-artifacts','leave-attachment-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const failures=[],runtimeErrors=[],results=[];
const assert=(ok,message)=>{if(!ok)failures.push(message)};
const company={id:'company-printing',code:'PRINT',name:'Printing & Technology',primary:true};
const permissions={'dashboard.access':'view','leave.access':'create'};
const context={sessionId:'qa-session',employee:{id:'qa-user',displayName:'QA User',status:'active',jobTitle:'Operations Assistant'},companies:[company],roles:[{id:'qa-role',code:'employee',name:'Employee',companyId:company.id}],permissions,companyPermissions:{[company.id]:permissions}};
const leaveTypes=[{id:'annual',companyId:company.id,code:'annual',name:'Annual Leave',paid:1,defaultDays:20,requiresAttachment:0},{id:'medical',companyId:company.id,code:'medical',name:'Medical Leave',paid:1,defaultDays:0,requiresAttachment:1}];




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
  if(url.pathname==='/api/ess/my-day')return send({date:'2026-10-07',attendance:null,counts:{assignedForms:0,requiredSubmissions:0,unreadNotices:0,activeDocumentRequests:0,reviewsToAcknowledge:0},obligations:[]});
  if(url.pathname==='/api/ess/leave/types'&&method==='GET')return send({types:leaveTypes});
  if(url.pathname==='/api/ess/leave'&&method==='GET')return send({requests:[]});
  if(url.pathname==='/api/ess/leave'&&method==='POST'){state.leavePosts+=1;return send({ok:true,id:'leave-qa',status:'pending',daysRequested:1},201);}


  if(url.pathname==='/api/qa/unused'&&method==='POST'){


   return send({error:'Authoritative payment evidence is required.'},409);
  }
  if(url.pathname==='/api/owner/intelligence')return send({generatedAt:'2026-10-07T09:30:00.000Z',workDate:'2026-10-07',period:{key:'current_day',label:'Today',start:'2026-10-07',end:'2026-10-07',comparisonLabel:'yesterday'},scope:{companyId:company.id,companyName:company.name,companyIds:[company.id]},group:{},finance:{},construction:{},companies:{},alerts:[]});
  if(url.pathname.startsWith('/api/'))return send(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}
async function visibleAudit(page){
 return page.evaluate(()=>{
  const root=document.querySelector('.ess-shell');
  const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
  const fonts=root?[...root.querySelectorAll('*')].filter(visible).map(el=>parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite):[];
  return {missing:!root,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,minFont:fonts.length?Math.min(...fonts):null,under:fonts.filter(x=>x<9),text:root?.textContent||''};
 });
}
const viewports=[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const browser=await chromium.launch({headless:true});
for(const [width,height] of viewports){
 const browserContext=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const page=await browserContext.newPage(),state={leavePosts:0};
 page.on('pageerror',error=>runtimeErrors.push(width+': '+error.message));
 page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))runtimeErrors.push(width+' console: '+message.text())});
 await installRoutes(page,state);
 await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]',{timeout:20000});
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:20000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:'employee'}})));
 await page.waitForSelector('.employee-center-launcher',{state:'attached',timeout:20000});
 await page.locator('.employee-center-launcher').evaluate((button)=>button.click());
 await page.waitForSelector('.ess-shell',{timeout:15000});
 await page.locator('.ess-tabs button').nth(1).click();
 await page.getByLabel('Leave type').selectOption('medical');
 await page.getByLabel('Start date').fill('2026-10-12');
 await page.getByLabel('End date').fill('2026-10-13');
 await page.waitForSelector('.ess-evidence-note',{timeout:10000});
 const submitButton=page.getByRole('button',{name:'Submit leave request',exact:true});
 assert(await submitButton.isDisabled(),width+': required-evidence submit action is enabled');
 const evidenceText=await page.locator('.ess-evidence-note').textContent();
 assert(/Supporting document required/i.test(evidenceText||''),width+': required-evidence notice missing');
 assert(await page.locator('.ess-form input[type="file"]').count()===0,width+': unsupported upload control is exposed');
 await page.locator('.ess-form').evaluate((form)=>form.requestSubmit());
 await page.getByText(/secure document upload is not available in Leave yet/i).waitFor();
 assert(state.leavePosts===0,width+': required-evidence leave reached the backend');

 const audit=await visibleAudit(page);
 assert(!audit.missing,width+': Employee Leave surface missing');
 assert(!audit.overflow,width+': horizontal overflow');
 assert(audit.under.length===0,width+': visible Leave text below 9px');
 assert(/Supporting document required/i.test(audit.text),width+': supporting-document truth missing');
 assert(/secure document upload is connected/i.test(audit.text),width+': secure-upload dependency copy missing');
 await page.screenshot({path:path.join(outDir,'leave-attachment-'+width+'x'+height+'.png'),fullPage:false});
 await page.getByLabel('Leave type').selectOption('annual');
 assert(!(await submitButton.isDisabled()),width+': ordinary leave submit action stayed disabled');
 await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/ess/leave'&&response.request().method()==='POST'),submitButton.click()]);
 assert(state.leavePosts===1,width+': ordinary leave did not submit exactly once');
 results.push({width,height,minFont:audit.minFont,overflow:audit.overflow,requiredEvidencePosts:0,ordinaryLeavePosts:state.leavePosts});
 await browserContext.close();
}
await browser.close();
if(runtimeErrors.length)failures.push(...runtimeErrors.map(value=>'runtime: '+value));
const report={generatedAt:new Date().toISOString(),baseUrl,results,runtimeErrors,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('HR Leave attachment-truth rendered QA: PASS ('+results.length+' viewports, required evidence fail-closed)');
