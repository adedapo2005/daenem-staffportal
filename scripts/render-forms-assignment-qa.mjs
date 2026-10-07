import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4176';
const outDir=path.join(root,'qa-artifacts','forms-assignment-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const failures=[],runtimeErrors=[],unexpectedRequests=[],results=[];
const assert=(ok,message)=>{if(!ok)failures.push(message)};

const companies=[
 {id:'company-printing',code:'PRINT',name:'Printing & Technology',primary:true},
 {id:'company-hidden',code:'HIDDEN',name:'Hidden Company'}
];
const printPermissions={
 'dashboard.access':'view',
 'forms.access':'manage'
};
const context={
 sessionId:'qa-communications-session',
 employee:{id:'qa-support-employee',employeeNo:'QA-SUPPORT',displayName:'Tolu Support',email:'support@example.invalid',jobTitle:'Customer Support',department:'Operations',status:'active',preferredTheme:'unified-daylight',timezone:'Africa/Lagos',team:'Customer Support',lastLoginAt:'2026-10-06T14:00:00.000Z'},
 companies,
 roles:[{id:'qa-role-forms',code:'manager',name:'Manager',companyId:'company-printing'}],
 permissions:printPermissions,
 companyPermissions:{'company-printing':printPermissions,'company-hidden':{'dashboard.access':'view'}}
};

const forms=[{id:'form-safety',companyName:'Printing & Technology',title:'Daily Safety Check',formType:'inspection',schemaJson:'[]',assignmentCount:0}];
const employees=[
 {id:'employee-a',displayName:'Ada Employee',jobTitle:'Operator',department:'Production',companyName:'Printing & Technology'},
 {id:'employee-b',displayName:'Bola Employee',jobTitle:'Supervisor',department:'Production',companyName:'Printing & Technology'},
 {id:'employee-c',displayName:'Chidi Employee',jobTitle:'Coordinator',department:'Operations',companyName:'Printing & Technology'}
];

async function installRoutes(page,captures){
 await page.route('**/api/**',async route=>{
  const request=route.request();
  const url=new URL(request.url());
  const method=request.method();
  const send=(value,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(value)});
  if(url.pathname==='/api/auth/me')return send({authenticated:true,context});
  if(url.pathname==='/api/auth/logout')return send({ok:true});
  if(url.pathname==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:true,canManage:false,canAccess:false});
  if(url.pathname.startsWith('/api/experience/layout/'))return send({ok:true});
  if(url.pathname==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-06T14:00:00.000Z',businessTimezone:'Africa/Lagos',maxOfflineAgeMinutes:720,session:{id:context.sessionId,expiresAt:'2030-10-06T14:00:00.000Z',lastVerifiedAt:'2026-10-06T14:00:00.000Z'},policy:{enabled:true,maxQueueCount:50,attachmentMaxBytes:10485760,automaticSync:true,manualRetry:true,retentionDays:30,allowedOperations:[]},operations:[]});
  if(url.pathname==='/api/offline/telemetry')return send({ok:true,serverReceivedAt:'2026-10-06T14:00:00.000Z'});
  if(url.pathname==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
  if(url.pathname==='/api/forms'&&method==='GET'){
   const companyId=url.searchParams.get('companyId')||'';
   if(companyId==='company-hidden')unexpectedRequests.push(method+' '+url.pathname+'?companyId='+companyId);
   return send({forms});
  }
  if(url.pathname==='/api/forms/mine'&&method==='GET')return send({assignments:[]});
  if(url.pathname==='/api/directory/employees'&&method==='GET'){
   const companyId=url.searchParams.get('companyId')||'';
   if(companyId==='company-hidden')unexpectedRequests.push(method+' '+url.pathname+'?companyId='+companyId);
   return send({employees});
  }
  if(url.pathname==='/api/directory/roles'&&method==='GET')return send({roles:[]});
  if(url.pathname==='/api/forms/assign'&&method==='POST'){
   let body={};
   try{body=JSON.parse(request.postData()||'{}')}catch{body={parseError:true}}
   captures.push(body);
   return send({ok:true});
  }
  if(url.pathname==='/api/owner/intelligence')return send({generatedAt:'2026-10-06T14:00:00.000Z',workDate:'2026-10-06',period:{key:'current_day',label:'Today',start:'2026-10-06',end:'2026-10-06',comparisonLabel:'yesterday'},scope:{companyId:'company-printing',companyName:'Printing & Technology',companyIds:['company-printing']},group:{},finance:{},construction:{},companies:{},alerts:[]});
  if(url.pathname.startsWith('/api/'))return send(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}

async function waitForShell(page){
 await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]',{timeout:20000});
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:20000});
}
async function launchForms(page){
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:'forms'}})));
 await page.waitForSelector('[data-forms-center="true"]',{timeout:15000});
}
async function visibleAudit(page){
 return page.evaluate(()=>{
  const visible=el=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
  };
  const root=document.querySelector('[data-forms-center="true"]');
  const fonts=root?[...root.querySelectorAll('*')]
   .filter(visible)
   .map(el=>({text:(el.textContent||'').trim().slice(0,60),size:parseFloat(getComputedStyle(el).fontSize)}))
   .filter(x=>Number.isFinite(x.size)):[];
  const under=fonts.filter(x=>x.size<9);
  return {
   missing:!root,
   overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
   minFont:fonts.length?Math.min(...fonts.map(x=>x.size)):null,
   under,
   bodyText:root?.textContent||''
  };
 });
}

const viewports=[
 [390,844],[430,932],[768,1024],[1024,1366],[1366,1024],
 [1672,941],[1920,1080],[2560,1440],[3840,2160]
];

const browser=await chromium.launch({headless:true});
for(const [width,height] of viewports){
 const ctx=await browser.newContext({viewport:{width,height},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
 const page=await ctx.newPage(),captures=[];
 page.on('pageerror',error=>runtimeErrors.push(width+': '+error.message));
 page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))runtimeErrors.push(width+' console: '+message.text())});
 await installRoutes(page,captures);
 await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await waitForShell(page);
 await launchForms(page);
 const panel=page.getByRole('heading',{name:'Assign selected form'}).locator('xpath=ancestor::article[1]');
 await panel.locator('select').first().selectOption('form-safety');
 const a=panel.locator('input[type="checkbox"][value="employee-a"]');
 const b=panel.locator('input[type="checkbox"][value="employee-b"]');
 assert(await a.count()===1,width+': employee-a checkbox missing');
 assert(await b.count()===1,width+': employee-b checkbox missing');
 await a.check();
 await b.check();
 assert(await a.isChecked()&&await b.isChecked(),width+': multi-recipient selection did not hold');
 await panel.getByRole('button',{name:'Assign',exact:true}).click();
 await page.waitForTimeout(250);
 const multi=captures.at(-1);
 assert(Array.isArray(multi?.employeeIds)&&multi.employeeIds.length===2&&multi.employeeIds.includes('employee-a')&&multi.employeeIds.includes('employee-b'),width+': multi payload '+JSON.stringify(multi?.employeeIds));
 await a.uncheck();
 assert(!(await a.isChecked())&&await b.isChecked(),width+': employee-a did not unselect cleanly');
 await panel.getByRole('button',{name:'Assign',exact:true}).click();
 await page.waitForTimeout(250);
 const deselected=captures.at(-1);
 assert(Array.isArray(deselected?.employeeIds)&&deselected.employeeIds.length===1&&deselected.employeeIds[0]==='employee-b',width+': unselect payload '+JSON.stringify(deselected?.employeeIds));
 await a.check();
 await panel.getByRole('button',{name:'Assign',exact:true}).click();
 await page.waitForTimeout(250);
 const reselected=captures.at(-1);
 assert(Array.isArray(reselected?.employeeIds)&&reselected.employeeIds.length===2&&reselected.employeeIds.filter(id=>id==='employee-a').length===1&&reselected.employeeIds.includes('employee-b'),width+': reselect payload '+JSON.stringify(reselected?.employeeIds));
 const audit=await visibleAudit(page);
 assert(!audit.missing,width+': Forms Center missing');
 assert(!audit.overflow,width+': horizontal overflow');
 assert(audit.under.length===0,width+': visible text below 9px: '+JSON.stringify(audit.under.slice(0,4)));
 assert(!/Hidden Company/.test(audit.bodyText),width+': unauthorized company rendered in Forms Center');
 assert(/Form assigned successfully\./.test(audit.bodyText),width+': assignment success state missing');
 await page.screenshot({path:path.join(outDir,'forms-assignment-'+width+'x'+height+'.png'),fullPage:false});
 results.push({width,height,multi:multi?.employeeIds,deselected:deselected?.employeeIds,reselected:reselected?.employeeIds,minFont:audit.minFont,overflow:audit.overflow});
 await ctx.close();
}

assert(unexpectedRequests.length===0,'Unexpected cross-company Forms requests: '+unexpectedRequests.join(', '));
await browser.close();
if(runtimeErrors.length)failures.push(...runtimeErrors.map(value=>'runtime: '+value));
const report={generatedAt:new Date().toISOString(),baseUrl,results,runtimeErrors,unexpectedRequests,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(failures.length){
 console.error(failures.join('\n'));
 process.exit(1);
}
console.log('Forms employee assignment rendered QA: PASS ('+results.length+' viewports, select/unselect/reselect payloads PASS)');
