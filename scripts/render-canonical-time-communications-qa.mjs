import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root=process.cwd();
const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4174';
const outDir=path.join(root,'qa-artifacts','canonical-time-communications-screenshots');
fs.mkdirSync(outDir,{recursive:true});
const failures=[],runtimeErrors=[],unauthorizedRequests=[],results=[];
const assert=(ok,message)=>{if(!ok)failures.push(message)};

const companies=[
 {id:'company-printing',code:'PRINT',name:'Printing & Technology',primary:true},
 {id:'company-hidden',code:'HIDDEN',name:'Hidden Company'}
];
const printPermissions={
 'dashboard.access':'view',
 'communications.support.inbox.view':'view',
 'communications.support.inbox.assign':'edit'
};
const context={
 sessionId:'qa-communications-session',
 employee:{id:'qa-support-employee',employeeNo:'QA-SUPPORT',displayName:'Tolu Support',email:'support@example.invalid',jobTitle:'Customer Support',department:'Operations',status:'active',preferredTheme:'unified-daylight',timezone:'America/New_York',team:'Customer Support',lastLoginAt:'2026-10-06T14:00:00.000Z'},
 companies,
 roles:[{id:'qa-role-support',code:'employee',name:'Employee',companyId:'company-printing'}],
 permissions:{'dashboard.access':'view'},
 companyPermissions:{'company-printing':printPermissions,'company-hidden':{'dashboard.access':'view'}}
};

const conversations=Array.from({length:36},(_,i)=>({
 id:'conversation-'+String(i+1).padStart(2,'0'),
 companyId:'company-printing',
 senderId:'sender-'+(i+1),
 routingMode:'company_dedicated',
 senderDisplayName:'Printing & Technology',
 customerWaId:'QA-WA-'+String(i+1).padStart(3,'0'),
 customerDisplayName:'Customer '+String(i+1).padStart(2,'0'),
 status:i%3===0?'pending':'open',
 assignedEmployeeId:i%4===0?'qa-support-employee':null,
 unreadCount:i%5===0?2:0,
 lastMessageAt:new Date(Date.UTC(2026,9,6,14,0-i)).toISOString(),
 lastMessage:'Customer message '+(i+1)+' about an order update.'
}));

function threadFor(id){
 const conversation=conversations.find(item=>item.id===id)||conversations[0];
 return {
  conversation:{...conversation,connectionId:'qa-connection'},
  messages:[
   {id:id+'-m1',direction:'inbound',messageType:'text',body:'Hello, please can I get an update on my order?',status:'received',providerTimestamp:'2026-10-06T13:40:00.000Z',createdAt:'2026-10-06T13:40:00.000Z'},
   {id:id+'-m2',direction:'outbound',messageType:'text',body:'We are checking the order and will update you shortly.',status:'draft',replyMode:'freeform',staffEmployeeId:'qa-support-employee',createdAt:'2026-10-06T13:42:00.000Z'}
  ],
  notes:[],
  approvedTemplates:[],
  replyPolicy:{serviceWindowState:'open',lastCustomerMessageAt:'2026-10-06T13:40:00.000Z',serviceWindowExpiresAt:'2026-10-07T13:40:00.000Z',composerState:'send_ready',templateRequired:false,liveSend:false}
 };
}

async function installRoutes(page){
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
  if(url.pathname==='/api/communications/inbox'&&method==='GET'){
   const companyId=url.searchParams.get('companyId')||'';
   if(companyId!=='company-printing'){unauthorizedRequests.push(method+' '+url.pathname+'?companyId='+companyId);return send({error:'Not available'},403)}
   const status=url.searchParams.get('status')||'open';
   const q=(url.searchParams.get('q')||'').toLowerCase();
   let rows=conversations.filter(item=>status==='all'||item.status===status);
   if(q)rows=rows.filter(item=>(item.customerDisplayName+' '+item.customerWaId+' '+item.lastMessage).toLowerCase().includes(q));
   return send({conversations:rows});
  }
  const threadMatch=url.pathname.match(/^\/api\/communications\/inbox\/([^/]+)$/);
  if(threadMatch&&method==='GET'){
   if(url.searchParams.get('companyId')!=='company-printing'){
    unauthorizedRequests.push(method+' '+url.pathname+'?companyId='+(url.searchParams.get('companyId')||''));
    return send({error:'Not available'},403);
   }
   return send(threadFor(decodeURIComponent(threadMatch[1])));
  }
  if(url.pathname.startsWith('/api/communications/inbox/')&&method==='POST')return send({ok:true});
  if(url.pathname==='/api/owner/intelligence')return send({generatedAt:'2026-10-06T14:00:00.000Z',workDate:'2026-10-06',period:{key:'current_day',label:'Today',start:'2026-10-06',end:'2026-10-06',comparisonLabel:'yesterday'},scope:{companyId:'company-printing',companyName:'Printing & Technology',companyIds:['company-printing']},group:{},finance:{},construction:{},companies:{},alerts:[]});
  if(url.pathname.startsWith('/api/'))return send(method==='GET'?{}:{ok:true});
  return route.continue();
 });
}

async function waitForShell(page){
 await page.waitForSelector('[data-offline-sync-indicator], [data-canonical-runtime]',{timeout:20000});
 await page.waitForSelector('[data-module-envelope]',{state:'attached',timeout:20000});
}
async function launchInbox(page){
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'whatsapp-inbox'}})));
 await page.waitForSelector('.wa-shell',{timeout:15000});
}
async function visibleAudit(page){
 return page.evaluate(()=>{
  const visible=el=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
  };
  const fonts=[...document.querySelectorAll('.wa-shell *')]
   .filter(visible)
   .map(el=>({text:(el.textContent||'').trim().slice(0,60),size:parseFloat(getComputedStyle(el).fontSize)}))
   .filter(x=>Number.isFinite(x.size));
  const under=fonts.filter(x=>x.size<9);
  return {
   overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
   minFont:fonts.length?Math.min(...fonts.map(x=>x.size)):null,
   under,
   bodyText:document.querySelector('.wa-shell')?.textContent||'',
   companyOptions:[...document.querySelectorAll('.wa-company option')].map(el=>el.textContent||'')
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
 const page=await ctx.newPage();
 page.on('pageerror',error=>runtimeErrors.push(width+': '+error.message));
 page.on('console',message=>{
  if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))runtimeErrors.push(width+' console: '+message.text());
 });
 await installRoutes(page);
 await page.goto(baseUrl+'/?waInbox=1&waCompany=PRINT',{waitUntil:'domcontentloaded'});
 await waitForShell(page);
 await page.waitForSelector('.wa-shell',{timeout:15000});
 const mobile=width<=760;
 if(mobile){
  assert(await page.locator('.wa-conversation-list').isVisible(),width+': mobile did not open list-first');
  assert(!(await page.locator('.wa-thread-header').isVisible().catch(()=>false)),width+': mobile opened a thread before selection');
 }
 await page.locator('.wa-search input').fill('Customer');
 await page.getByRole('button',{name:'Pending',exact:true}).click();
 await page.waitForTimeout(350);
 const list=page.locator('.wa-list-scroll');
 await list.evaluate(el=>{el.scrollTop=360});
 const scrollBefore=await list.evaluate(el=>el.scrollTop);
 const rows=page.locator('[data-conversation-id]');
 const rowCount=await rows.count();
 assert(rowCount>=8,width+': pending/search list did not contain enough test records');
 const target=rows.nth(Math.min(6,rowCount-1));
 const targetId=await target.getAttribute('data-conversation-id');
 await target.click();
 await page.waitForSelector('.wa-thread-header');
 const urlAfterSelect=new URL(page.url());
 assert(urlAfterSelect.searchParams.get('waInbox')==='1',width+': inbox route marker missing');
 assert(urlAfterSelect.searchParams.get('waCompany')==='PRINT',width+': company deep-link missing');
 assert(urlAfterSelect.searchParams.get('waConversation')===targetId,width+': conversation deep-link missing');
 await page.goBack({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(450);
 assert(await page.locator('.wa-search input').inputValue()==='Customer',width+': search not restored after Back');
 assert(await page.getByRole('button',{name:'Pending',exact:true}).getAttribute('class')==='active',width+': filter not restored after Back');
 const scrollAfter=await list.evaluate(el=>el.scrollTop);
 assert(Math.abs(scrollAfter-scrollBefore)<=4,width+': list scroll not restored after Back ('+scrollBefore+' -> '+scrollAfter+')');
 if(mobile){
  assert(await page.locator('.wa-conversation-list').isVisible(),width+': mobile list not visible after Back');
  assert(!(await page.locator('.wa-thread-header').isVisible().catch(()=>false)),width+': mobile thread remained visible after Back');
 }
 await page.goForward({waitUntil:'domcontentloaded'});
 await page.waitForSelector('.wa-thread-header');
 await page.waitForTimeout(250);
 assert(new URL(page.url()).searchParams.get('waConversation')===targetId,width+': Forward did not restore conversation route');
 const copied=page.url();
 await page.reload({waitUntil:'domcontentloaded'});
 await waitForShell(page);
 await page.waitForSelector('.wa-shell .wa-thread-header',{timeout:15000});
 assert(new URL(page.url()).searchParams.get('waConversation')===targetId,width+': direct-link reload lost conversation id');
 assert((await page.locator('.wa-thread-identity strong').first().textContent()||'').includes('Customer'),width+': direct-link reload did not restore conversation');
 const audit=await visibleAudit(page);
 const clipped=await page.evaluate(()=>{
  const shell=document.querySelector('.wa-shell')?.getBoundingClientRect();
  if(!shell)return ['Missing inbox shell'];
  return [...document.querySelectorAll('.wa-filters button,.wa-thread-actions button,.wa-send-button,.wa-message .wa-bubble,.wa-composer-tools,.wa-readiness-check,.wa-live-send')]
   .filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})
   .map(el=>({label:(el.textContent||el.getAttribute('aria-label')||el.className||'').trim().slice(0,32),rect:el.getBoundingClientRect()}))
   .filter(item=>item.rect.left<shell.left-1||item.rect.right>shell.right+1)
   .map(item=>item.label);
 });
 assert(clipped.length===0,width+': clipped mobile controls/message bubble: '+clipped.join(', '));
 assert(!audit.overflow,width+': horizontal overflow');
 assert(audit.under.length===0,width+': visible text below 9px: '+JSON.stringify(audit.under.slice(0,4)));
 const inboundRenderedTime=(await page.locator('.wa-message.inbound time').first().textContent())?.trim()||'';
 assert(/9:40 AM/.test(inboundRenderedTime),width+': configured New York employee timezone not honoured for the 13:40 UTC message: '+inboundRenderedTime);
 const listRenderedTime=(await page.locator('.wa-conversation-row time').first().textContent())?.trim()||'';
 assert(/AM$/.test(listRenderedTime),width+': conversation preview not rendered in the viewer\'s 12-hour timezone: '+listRenderedTime);
 assert(!audit.companyOptions.some(value=>/Hidden Company/i.test(value)),width+': unauthorized company rendered in inbox selector');
 assert(!/Meta System User|release-gated|provider release gate|webhook/i.test(audit.bodyText),width+': technical/provider implementation wording visible');
 await page.screenshot({path:path.join(outDir,'communications-inbox-'+width+'x'+height+'.png'),fullPage:false});
 results.push({width,height,mobile,targetId,scrollBefore,scrollAfter,minFont:audit.minFont,overflow:audit.overflow,url:copied,employeeZone:'America/New_York',deviceZone:'Africa/Lagos',inboundRenderedTime,listRenderedTime});
 await ctx.close();
}

const denyContext=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Africa/Lagos',reducedMotion:'reduce'});
const denyPage=await denyContext.newPage();
await installRoutes(denyPage);
await denyPage.goto(baseUrl+'/?waInbox=1&waCompany=HIDDEN&waConversation=conversation-01',{waitUntil:'domcontentloaded'});
await waitForShell(denyPage);
await denyPage.waitForTimeout(1200);
assert(await denyPage.locator('.wa-shell').count()===0,'Unauthorized company deep link opened the WhatsApp Inbox');
assert(unauthorizedRequests.length===0,'Unauthorized communications requests were attempted: '+unauthorizedRequests.join(', '));
await denyContext.close();
await browser.close();
const report={generatedAt:new Date().toISOString(),baseUrl,results,runtimeErrors,unauthorizedRequests,failures};
fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2));
if(runtimeErrors.length)failures.push(...runtimeErrors.map(value=>'runtime: '+value));
if(failures.length){
 console.error(failures.join('\n'));
 process.exit(1);
}
console.log('Canonical StaffPortal time in Communications rendered QA: PASS ('+results.length+' viewports, employee timezone over device timezone, Zero Disclosure deny PASS)');
