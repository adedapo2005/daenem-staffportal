import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fixture,out,source} from './dispatch-harness.mjs';
const req=createRequire('D:/DAENEM-QA/staffportal-4k-layout-lane-20261101-01/temporary-signout-client-20261102-01/browser-deps/package.json');
const {chromium}=req('playwright');
const baseline='D:/DAENEM-QA/staffportal-final-release-evidence-20261031/protected-print-order-save-20261104-controller/staffportal-working-release-review-20261104/application/client';
const corrected=path.join(source,'dist/client');
const report={state:'RUNNING',syntheticOnly:true,apiMocked:false,hostedCalls:0,artificialJobsPermissionAdded:false,checks:[],api:[],blockedBusinessRequests:[],runtimeErrors:[],external:[],routes:[]};
const write=()=>fs.writeFileSync(path.join(out,'profile-real-worker-browser-results.json'),JSON.stringify(report,null,2));
const check=(name,passed)=>{report.checks.push({name,passed:!!passed});console.log(JSON.stringify({check:name,passed:!!passed}));write()};
let f,browser,server,client=path.resolve(baseline),stage='setup';
try{
 f=await fixture({syntheticJobsPermission:false});
 for(const id of ['company-bakery','company-autos','company-logistics','company-properties']){
  await f.insert('employee_company_memberships',{id:'matrix-owner-member-'+id,employee_id:f.owner.id,company_id:id,active:1,is_primary:0});
  await f.insert('employee_roles',{id:'matrix-owner-role-'+id,employee_id:f.owner.id,company_id:id,role_id:'role-owner'});
 }
 const identity=await f.send(f.owner,'/api/auth/me');
 assert.equal(identity.status,200);
 const account=identity.data.context;
 assert(account.sessionId);
 check('Real password-authenticated synthetic Owner has five existing company assignments',account.companies.length===5&&account.roles.some(r=>r.code==='owner'));
 check('No synthetic jobs.access permission inserted',(await f.db.prepare("SELECT COUNT(*) AS n FROM permissions WHERE id='fixture-jobs-access'").first()).n===0);
 const profile=await f.send(f.owner,'/api/profile/mine',undefined,{'X-Staffportal-Expected-Session':account.sessionId});
 report.profileContract={status:profile.status,code:typeof profile.data?.code==='string'?profile.data.code:null,bindingMatches:profile.data?.binding?.sessionId===account.sessionId&&profile.data?.binding?.employeeId===f.owner.id,
  types:Object.fromEntries(['displayName','firstName','lastName','phone','email','jobTitle','department','status'].map(k=>[k,profile.data?.profile?.[k]===null?'null':typeof profile.data?.profile?.[k]]))};
 write();
 const remote='https://dispatch.example.test';
 server=http.createServer(async(q,r)=>{try{
  const u=new URL(q.url,'http://loopback.invalid');
  if(u.pathname.startsWith('/api/')){
   if(!['GET','HEAD'].includes(q.method)){report.blockedBusinessRequests.push({stage,path:u.pathname,method:q.method});r.writeHead(405,{'content-type':'application/json'});return r.end('{"error":"Read-only module verification"}')}
   const headers=new Headers();for(const[k,v]of Object.entries(q.headers))if(v&&!['host','connection','content-length','origin','referer','accept-encoding'].includes(k))headers.set(k,Array.isArray(v)?v.join(','):v);
   if(q.headers.origin)headers.set('origin',remote);
   const response=await f.mf.dispatchFetch(remote+u.pathname+u.search,{method:q.method,headers});
   report.api.push({stage,path:u.pathname,status:response.status});
   const h={};for(const[k,v]of response.headers)if(!['content-encoding','transfer-encoding','content-length'].includes(k))h[k]=v;
   r.writeHead(response.status,h);return r.end(Buffer.from(await response.arrayBuffer()));
  }
  let file=path.resolve(client,'.'+decodeURIComponent(u.pathname));if(file!==client&&!file.startsWith(client+path.sep)){r.writeHead(403);return r.end()}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(client,'index.html');
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.txt':'text/plain'}[path.extname(file)]||'application/octet-stream';
  r.writeHead(200,{'content-type':mime,'cache-control':'no-store'});fs.createReadStream(file).pipe(r);
 }catch(e){report.runtimeErrors.push({stage,kind:'http-bridge',message:e.message});if(!r.headersSent)r.writeHead(500);r.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'msedge',headless:true});
 async function newContext(){
  const c=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const parts=f.owner.cookie.split('=');await c.addCookies([{name:parts.shift(),value:parts.join('='),url:origin}]);
  await c.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();report.external.push({stage,origin:u.origin,path:u.pathname});return route.abort()});
  return c;
 }
 async function snapshot(p){
  return p.evaluate(()=>{const main=document.querySelector('#main-content')||document.querySelector('main');const visible=e=>!!e.getClientRects().length;
   const headings=Array.from((main||document).querySelectorAll('h1,h2,h3')).filter(visible).map(e=>e.textContent.trim());
   const text=main?.innerText||'';
   return {title:document.title,path:location.pathname,mainPresent:!!main,shellPresent:!!document.querySelector('.p-topbar'),headings,
    entryCompanyGate:!document.querySelector('.p-topbar')&&headings.includes('Select A Company'),
    unavailableHeading:headings.some(x=>/unavailable|access not assigned|not available|not found/i.test(x)),
    loading:/Loading The Current Verified|Loading Your Profile|Checking The Current Account Binding/.test(text),
    profileRendered:!!document.querySelector('.p-profile-cover'),
    knownProfileError:{unverified:text.includes('Your Profile Could Not Be Verified.'),sessionChanged:text.includes('Your Profile Could Not Be Verified. Retry Profile Load.'),responseBindingMismatch:text.includes('Your Profile Response Could Not Be Verified. Retry Profile Load.')},
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
  });
 }
 stage='baseline-profile';let c=await newContext(),p=await c.newPage();
 p.on('pageerror',e=>report.runtimeErrors.push({stage,kind:'pageerror',message:e.message}));
 await p.goto(origin+'/profile');await p.locator('.p-topbar').waitFor({timeout:15000});
 await p.waitForFunction(()=>!!document.querySelector('.p-profile-cover')||Array.from(document.querySelectorAll('#main-content h1,#main-content h2,#main-content h3')).some(e=>e.getClientRects().length&&e.textContent.trim()==='Profile Unavailable'),{},{timeout:20000});
 report.baselineProfile=await snapshot(p);
 check('Unmodified approved frontend reproduces Profile Unavailable',report.baselineProfile.unavailableHeading&&!report.baselineProfile.profileRendered);
 await c.close();
 client=corrected;stage='corrected-profile';c=await newContext();p=await c.newPage();
 p.on('pageerror',e=>report.runtimeErrors.push({stage,kind:'pageerror',message:e.message}));
 await p.goto(origin+'/');await p.locator('.p-topbar').waitFor({timeout:15000});
 report.entry=await snapshot(p);check('Corrected full portal opens without company-selection entry gate',!report.entry.entryCompanyGate&&report.entry.shellPresent);
 await p.goto(origin+'/profile');await p.locator('.p-topbar').waitFor({timeout:15000});
 await p.waitForFunction(()=>!!document.querySelector('.p-profile-cover')||Array.from(document.querySelectorAll('#main-content h1,#main-content h2,#main-content h3')).some(e=>e.getClientRects().length&&e.textContent.trim()==='Profile Unavailable'),{},{timeout:20000});
 report.correctedProfile=await snapshot(p);
 check('Corrected frontend renders the actual Worker Profile response',report.correctedProfile.profileRendered&&!report.correctedProfile.unavailableHeading);
 report.viewports=[];
 for(const viewport of [{width:3840,height:2160},{width:1440,height:900},{width:390,height:844}]){
  stage='viewport-'+viewport.width;await p.setViewportSize(viewport);
  await p.goto(origin+'/');await p.locator('.p-topbar').waitFor({timeout:15000});
  const entry=await snapshot(p);
  const entryPickerCount=await p.locator('.sp-company-selection,.sp-company-picker').count();
  check('Direct entry '+viewport.width+'px has no company gate, picker or default-company URL',entry.shellPresent&&!entry.entryCompanyGate&&entryPickerCount===0&&!entry.path.includes('/company/'));
  await p.goto(origin+'/profile');
  await p.locator('.p-profile-cover').waitFor({state:'visible',timeout:20000});
  const profile=await snapshot(p);
  check('Actual Profile response renders at '+viewport.width+'px',profile.profileRendered&&!profile.unavailableHeading);
  check('Profile has no horizontal page overflow at '+viewport.width+'px',!profile.horizontalOverflow);
  report.viewports.push({viewport,entry,profile,entryPickerCount});write();
 }
 check('No business write request was attempted',report.blockedBusinessRequests.length===0);
 check('No browser runtime error occurred',report.runtimeErrors.length===0);
 check('No external browser request was attempted',report.external.length===0);
 report.workerOutbound=f.outbound;
 report.state=report.checks.every(x=>x.passed)?'PASS_REAL_WORKER_PROFILE_AND_DIRECT_ENTRY':'LOCAL_ACCEPTANCE_REQUIRES_CORRECTION';
 if(!report.checks.every(x=>x.passed))process.exitCode=1;
 await c.close();
}catch(e){report.failure=e.stack;report.state='TEST_EXECUTION_HELD';console.error(e.stack);process.exitCode=1}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await f?.dispose();write();console.log(JSON.stringify({state:report.state,checks:report.checks,viewportCount:report.viewports?.length,profileContract:report.profileContract}));}
