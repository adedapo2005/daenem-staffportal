import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:4176';
const out=path.join(process.cwd(),'qa-artifacts','finance-posting-company-qa');
fs.mkdirSync(out,{recursive:true});
const results=[],failures=[];
const companies=[
 {id:'company-a',name:'Alpha Operations',primary:true},
 {id:'company-b',name:'Beta Operations',primary:false},
];
const access=(entry='view',ledger='none',journal='none')=>({'finance.entry':entry,'finance.ledger':ledger,'finance.journal':journal});
const fixture=(scenario)=>{
 const x={owner:scenario==='owner',mode:'initial',statusReads:[],posts:[],held:null};
 x.authority=()=>{
  const rights=scenario==='scoped'?{'company-a':access('view','view','create'),'company-b':access('view')}:
   scenario==='denied'?{'company-a':access('view'),'company-b':access('view')}:
   scenario==='owner'?{'company-a':access(),'company-b':access()}:
   scenario==='race'?{'company-a':access('view','view','create'),'company-b':access('view','view')}:
   x.mode==='revoked'?{'company-b':access('view','view')}:
   {'company-a':access('view','view','create'),'company-b':access('view','view')};
  const granted=Object.keys(rights);
  return {authenticated:true,context:{
   sessionId:'qa-finance-posting-session',
   employee:{id:'qa-employee',displayName:'QA Employee',status:'active',timezone:'Africa/Lagos'},
   companies:companies.filter(c=>granted.some(id=>id===c.id)),
   roles:[{id:'qa-role',code:x.owner?'owner':'manager',name:x.owner?'Owner':'Manager'}],
   permissions:{'finance.entry':'manage','finance.ledger':'manage','finance.reports':'view','finance.journal':'manage'},
   companyPermissions:rights,
  }};
 };
 return x;
};
function posting(companyId){
 const isA=companyId==='company-a';
 return {company:{id:companyId,name:isA?'Alpha Operations':'Beta Operations'},
  pending:{count:isA?11:22,amountKobo:isA?110000:220000},
  posted:{count:1,amountKobo:12000,costKobo:3000},failed:{count:0},
  recent:[{id:'qa-post-'+companyId,salesOrderId:'qa-sale-'+companyId,
   customerName:isA?'QA Alpha Private Customer':'QA Beta Private Customer',
   orderNo:isA?'QA-ALPHA':'QA-BETA',status:'posted',
   postedAmountKobo:12000,costAmountKobo:3000,postedAt:'2026-10-10T11:00:00Z'}],
  scheduler:{salesReconciliation:'hourly',socialPublishing:'every_5_minutes',idempotent:true}};
}
async function setup(page,x){
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify(body)});
  if(p==='/api/auth/me')return send(x.authority());
  if(p==='/api/finance/automation/status'){
   const companyId=u.searchParams.get('companyId');
   x.statusReads.push(companyId);
   if(x.mode==='hold-alpha'&&companyId==='company-a'){
    x.mode='alpha-held';
    return new Promise(resolve=>{x.held={resolve,route};});
   }
   return send(posting(companyId));
  }
  if(p==='/api/finance/automation/reconcile'){
   x.posts.push(JSON.parse(req.postData()||'{}'));
   return send({result:{scanned:0,posted:0,skipped:0,failed:0,errors:[]}});
  }
  if(p==='/api/experience/layout')return send({preference:{layoutId:'focus-flow',density:'standard',motion:'reduced'},canChoose:false,canManage:false,canAccess:false});
  if(p==='/api/offline/bootstrap')return send({ok:true,serverTime:'2026-10-10T11:00:00Z',businessTimezone:'Africa/Lagos',maxOfflineAgeMinutes:720,session:{id:'qa-finance-posting-session',expiresAt:'2030-10-10T11:00:00Z'},policy:{enabled:false,maxQueueCount:0,allowedOperations:[]},operations:[]});
  if(p==='/api/support/mine')return send({commands:[],assistanceRequests:[]});
  return send(req.method()==='GET'?{}:{ok:true});
 });
}
async function launch(page){
 await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:25000});
 await page.locator('.postauth-module-envelope').first().waitFor({state:'attached',timeout:25000});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:'finance-posting'}})));
}
async function open(page){
 await launch(page);
 // The canonical module hub clicks the intentionally hidden legacy launcher.
 // Acceptance is the visible Finance Posting workspace, not the hidden button.
 await page.locator('.fa-shell').waitFor({state:'visible',timeout:12000});
}
const browser=await chromium.launch({headless:true});
for(const width of [390,1366])for(const scenario of ['scoped','denied','race','revocation','owner']){
 const x=fixture(scenario);
 const context=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Africa/Lagos'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await setup(page,x);
 try{
  if(scenario==='denied'){
   await launch(page);await page.waitForTimeout(650);
   assert.equal(await page.locator('.fa-launcher').count(),0,'aggregate-only grants must not expose Finance Posting');
   assert.equal(x.statusReads.length,0,'aggregate-only grants must not request private Finance status');
  }else{
   await open(page);
   const selector=page.getByLabel('Finance posting company');
   await selector.waitFor();
   await page.getByText('QA Alpha Private Customer',{exact:true}).waitFor();
   if(scenario==='scoped'){
    assert.deepEqual(await selector.locator('option').allTextContents(),['Alpha Operations'],'unpermitted B company hidden');
    assert.equal(await page.getByRole('button',{name:'Run Reconciliation Now'}).count(),1,'company A scoped journal creation allowed');
    await page.getByRole('button',{name:'Run Reconciliation Now'}).click();
    assert.equal(x.posts.length,1,'exactly one mocked run');
    assert.equal(x.posts[0].companyId,'company-a','only company A may be reconciled');
   }
   if(scenario==='race'){
    x.mode='hold-alpha';
    await page.locator('.fa-shell header button').first().click();
    for(let i=0;i<80&&!x.held;i++)await page.waitForTimeout(25);
    assert.ok(x.held,'held Company A refresh request started');
    await selector.selectOption('company-b');
    await page.getByText('QA Beta Private Customer',{exact:true}).waitFor();
    await x.held.route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(posting('company-a'))});
    x.held.resolve();
    await page.waitForTimeout(250);
    assert.equal(await page.getByText('QA Alpha Private Customer',{exact:true}).count(),0,'late A cannot overwrite B');
    assert.equal(await page.getByText('QA Beta Private Customer',{exact:true}).count(),1,'B remains displayed');
    assert.equal(await page.getByRole('button',{name:'Run Reconciliation Now'}).count(),0,'Company B without journal permission has no run action');
   }
   if(scenario==='revocation'){
    x.mode='revoked';
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByText('QA Beta Private Customer',{exact:true}).waitFor({timeout:15000});
    assert.deepEqual(await selector.locator('option').allTextContents(),['Beta Operations'],'revoked A hidden in company selector');
    assert.equal(await page.getByText('QA Alpha Private Customer',{exact:true}).count(),0,'revoked A record purged');
    assert.equal(await page.getByRole('button',{name:'Run Reconciliation Now'}).count(),0,'revoked A journal action purged');
   }
   if(scenario==='owner'){
    assert.deepEqual(await selector.locator('option').allTextContents(),['Alpha Operations','Beta Operations'],'Owner retains assigned group-company choices');
    await selector.selectOption('company-b');
    await page.getByText('QA Beta Private Customer',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Run Reconciliation Now'}).count(),1,'Owner internal action visible subject to backend controls');
   }
  }
  assert.deepEqual(errors,[],'no browser errors');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  assert.equal(overflow,false,'no page horizontal overflow');
  if(scenario!=='denied')await page.screenshot({path:path.join(out,scenario+'-'+width+'.png'),fullPage:false});
  results.push({width,scenario,statusReads:x.statusReads,postCount:x.posts.length,overflow,pageErrors:errors.length,passed:true});
 }catch(e){
  failures.push(width+' '+scenario+': '+e.message);
 }finally{
  if(x.held)try{await x.held.route.fulfill({status:409,contentType:'application/json',body:'{"error":"QA closing"}'});x.held.resolve()}catch{}
  await context.close();
 }
}
await browser.close();
const report={generatedAt:new Date().toISOString(),source:'non-production mocked APIs',results,failures,productionMutated:false};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));
assert.deepEqual(failures,[],failures.join('\n'));
console.log('Finance Posting company boundary browser QA PASS '+results.length+'/10');
