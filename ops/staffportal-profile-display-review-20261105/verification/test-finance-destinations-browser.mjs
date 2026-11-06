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
const spendOnly=process.argv.includes('--spend-only'),profileOnly=process.argv.includes('--profile-only');
const report={state:'RUNNING',syntheticOnly:true,apiMocked:false,hostedCalls:0,artificialJobsPermissionAdded:false,checks:[],api:[],blockedBusinessRequests:[],runtimeErrors:[],external:[],routes:[]};
const write=()=>fs.writeFileSync(path.join(out,profileOnly?'finance-profile-view-correction-results.json':spendOnly?'finance-destinations-spend-correction-results.json':'finance-destinations-browser-results.json'),JSON.stringify(report,null,2));
const check=(name,passed)=>{report.checks.push({name,passed:!!passed});console.log(JSON.stringify({check:name,passed:!!passed}));write()};
let f,browser,server,client=path.resolve(corrected),stage='setup';
try{
 f=await fixture({syntheticJobsPermission:false});
 for(const [code,level]of Object.entries({'profile.access':'view','finance.receivables':'view','finance.budgets':'view','finance.reports':'view','expense.approve':'view','expense.master':'manage','finance.coa':'none'}))
  await f.override(f.basic.id,f.ca,code,level);
 await f.insert('budgets',{id:'restore-budget-a',company_id:f.ca,name:'Synthetic Budget A',status:'draft',currency:'NGN',created_by:f.basic.id});
 await f.insert('budgets',{id:'restore-budget-b',company_id:f.cb,name:'Synthetic Foreign Budget B',status:'draft',currency:'NGN',created_by:f.manager.id});
 const identity=await f.send(f.basic,'/api/auth/me');
 assert.equal(identity.status,200);
 report.actualAuthority={companyIds:identity.data.context.companies.map(c=>c.id),permissions:identity.data.context.companyPermissions[f.ca]};
 check('Ordinary synthetic employee has only the existing granted company permissions',identity.data.context.companies.length===1&&identity.data.context.companyPermissions[f.ca]['finance.coa']==='none');
 check('No synthetic jobs.access permission inserted',(await f.db.prepare("SELECT COUNT(*) AS n FROM permissions WHERE id='fixture-jobs-access'").first()).n===0);
 const forbidden=await f.send(f.basic,'/api/finance/receivables?companyId='+encodeURIComponent(f.cb));
 check('Actual Worker refuses the foreign-company receivables read',forbidden.status===403);
 write();
 const remote='https://dispatch.example.test';
 server=http.createServer(async(q,r)=>{try{
  const u=new URL(q.url,'http://loopback.invalid'),requestStage=stage;
  if(u.pathname.startsWith('/api/')){
   if(!['GET','HEAD'].includes(q.method)){report.blockedBusinessRequests.push({stage,path:u.pathname,method:q.method});r.writeHead(405,{'content-type':'application/json'});return r.end('{"error":"Read-only module verification"}')}
   const headers=new Headers();for(const[k,v]of Object.entries(q.headers))if(v&&!['host','connection','content-length','origin','referer','accept-encoding'].includes(k))headers.set(k,Array.isArray(v)?v.join(','):v);
   if(q.headers.origin)headers.set('origin',remote);
   const response=await f.mf.dispatchFetch(remote+u.pathname+u.search,{method:q.method,headers});
   report.api.push({stage:requestStage,path:u.pathname,companyId:u.searchParams.get('companyId'),status:response.status});
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
 async function newContext(actor){
  const c=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const parts=actor.cookie.split('=');await c.addCookies([{name:parts.shift(),value:parts.join('='),url:origin}]);
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
 stage='entry';let c=await newContext(f.basic),p=await c.newPage();
 p.on('pageerror',e=>report.runtimeErrors.push({stage,kind:'pageerror',message:e.message}));
 await p.goto(origin+'/');await p.locator('.p-topbar').waitFor({timeout:15000});
 report.entry=await snapshot(p);
 check('Updated portal still opens directly without a company gate, picker or default URL',
  report.entry.shellPresent&&!report.entry.entryCompanyGate&&!report.entry.path.includes('/company/')&&await p.locator('.sp-company-selection,.sp-company-picker').count()===0);
 const cases=[
  {id:'receivables',tab:'Receivables',selector:'.fin-shell',read:'/api/finance/receivables'},
  {id:'budgets',tab:'Budgets',selector:'.fin-shell',read:'/api/finance/budgets'},
  {id:'financial-reports',tab:'Reports',selector:'.fin-shell',read:'/api/finance/reports'},
  {id:'expense-approvals',tab:'Approval queue',selector:'.spend-shell',read:'/api/spend/approvals'},
  {id:'cost-admin',tab:'Administration',selector:'.spend-shell',read:'/api/spend/admin/master'},
 ].filter(item=>!profileOnly&&(!spendOnly||item.selector==='.spend-shell'));
 report.routeCases=[];
 for(const viewport of [{width:1440,height:900},{width:3840,height:2160},{width:390,height:844}]){
  await p.setViewportSize(viewport);
  for(const item of cases){
   stage=item.id+'-'+viewport.width;const before=report.api.length;
   await p.goto(origin+'/'+item.id+'/company/'+encodeURIComponent(f.ca));
   await p.locator('[data-finance-destination="'+item.id+'"] '+item.selector).waitFor({state:'visible',timeout:20000});
   await p.waitForLoadState('networkidle',{timeout:6000}).catch(()=>{});
   if(item.id==='financial-reports')await p.locator('.fin-panel h3').filter({hasText:'Balanced'}).waitFor({state:'visible',timeout:15000});
   if(item.id==='budgets')await p.getByText('Synthetic Budget A',{exact:true}).waitFor({state:'visible',timeout:15000});
   const current=await snapshot(p),api=report.api.slice(before).filter(x=>/^\/api\/(?:finance|spend)\//.test(x.path));
   const node=p.locator('[data-finance-destination="'+item.id+'"]');
   const activeTabs=await node.locator('.fin-tabs button.active,.spend-tabs button.active').allTextContents();
   const visibleTabs=await node.locator('.fin-tabs button,.spend-tabs button').allTextContents();
   const layout=await node.locator(item.selector).evaluate(e=>{const rect=e.getBoundingClientRect(),backdrop=e.parentElement,style=getComputedStyle(backdrop);return{shellWidth:rect.width,windowWidth:innerWidth,backdropPosition:style.position,backdropFilter:style.backdropFilter,declaredModal:e.getAttribute('aria-modal')}});
   const row={...item,viewport,current,api,activeTabs,visibleTabs,layout};
   report.routeCases.push(row);write();
   check(stage+' opens its exact existing workflow',activeTabs.length===1&&activeTabs[0].trim()===item.tab&&visibleTabs.length===1);
   check(stage+' reads the actual scoped Worker service',api.some(x=>x.path===item.read&&x.status===200&&x.companyId===f.ca)&&api.every(x=>x.status===200&&x.companyId===f.ca));
   check(stage+' stays inside the approved shell without a modal/glass backdrop',layout.backdropPosition==='static'&&layout.backdropFilter==='none'&&layout.declaredModal!=='true'&&current.shellPresent);
   check(stage+' avoids page overflow and foreign synthetic records',!current.horizontalOverflow&&await p.getByText('Synthetic Foreign Budget B',{exact:true}).count()===0);
   if(item.id==='budgets')check(stage+' does not request unauthorized Chart of Accounts',!api.some(x=>x.path==='/api/finance/accounts'));
   if(item.id==='cost-admin'||item.id==='expense-approvals')check(stage+' does not request unrelated own-expense bootstrap',!api.some(x=>x.path==='/api/spend/bootstrap'));
   if(item.id==='cost-admin'||item.id==='expense-approvals')check(stage+' does not expose Group Spend Intelligence',!visibleTabs.some(t=>/spend.*profit/i.test(t))&&!api.some(x=>x.path.startsWith('/api/spend/owner/')));
  }
 }
 for(const item of cases){
  stage='foreign-'+item.id;const before=report.api.length;
  await p.goto(origin+'/'+item.id+'/company/'+encodeURIComponent(f.cb));
  await p.getByRole('heading',{name:/Assigned Company Workspace Unavailable|Workspace Access Not Assigned/}).waitFor({state:'visible',timeout:15000});
  const api=report.api.slice(before).filter(x=>/^\/api\/(?:finance|spend)\//.test(x.path));
  check('Unassigned company '+item.id+' does not mount or request private finance data',api.length===0&&await p.locator('.fin-shell,.spend-shell').count()===0);
 }
 if(!spendOnly&&!profileOnly){
 stage='revoked-receivables';await f.override(f.basic.id,f.ca,'finance.receivables','none');const before=report.api.length;
 await p.goto(origin+'/receivables/company/'+encodeURIComponent(f.ca));
 await p.getByRole('heading',{name:'Workspace Access Not Assigned',exact:true}).waitFor({state:'visible',timeout:15000});
 check('A fresh explicit denial removes the restored destination',!report.api.slice(before).some(x=>x.path==='/api/finance/receivables')&&await p.locator('.fin-shell').count()===0);
 }
 stage='profile-continuity';await p.goto(origin+'/profile');await p.locator('.p-profile-cover').waitFor({state:'visible',timeout:20000});
 check('Profile null-display correction remains functional',true);
 const edits=p.locator('#main-content button').filter({hasText:/^Edit (personal details|details)$/i});
 report.profileEditControls=await edits.evaluateAll(buttons=>buttons.map(button=>({label:button.textContent.trim(),disabled:button.disabled})));
 report.profileView=await snapshot(p);
 check('View-only Profile does not enable editing',await edits.count()>0&&await edits.evaluateAll(buttons=>buttons.every(button=>button.disabled)));
 check('No business write was attempted',report.blockedBusinessRequests.length===0);
 check('No browser runtime error occurred',report.runtimeErrors.length===0);
 check('No external browser request was attempted',report.external.length===0);
 report.workerOutbound=f.outbound;
 report.state=report.checks.every(x=>x.passed)?'PASS_SCOPED_FINANCE_DESTINATIONS':'LOCAL_ACCEPTANCE_REQUIRES_CORRECTION';
 if(!report.checks.every(x=>x.passed))process.exitCode=1;
 await c.close();
}catch(e){report.failure=e.stack;report.state='TEST_EXECUTION_HELD';console.error(e.stack);process.exitCode=1}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await f?.dispose();write();console.log(JSON.stringify({state:report.state,checks:report.checks,routeCases:report.routeCases?.length,blocked:report.blockedBusinessRequests,runtimeErrors:report.runtimeErrors}));}
