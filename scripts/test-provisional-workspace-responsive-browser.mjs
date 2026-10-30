import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const vite=await createServer({
  configFile:'vite.signin-browser-qa.config.ts',
  server:{host:'127.0.0.1',port:0,strictPort:false},
  logLevel:'error',
});
await vite.listen();
const port=vite.httpServer.address().port;
// Keep visual evidence outside the source worktree.
const evidence=resolve(process.env.DAENEM_AUTH_QA_EVIDENCE_DIR ||
  '../staffportal-provisional-workspace-visual-20261029');
mkdirSync(evidence,{recursive:true});
let browser;
const viewports=[
  {name:'Mobile-390',width:390,height:844},
  {name:'Compact-1024',width:1024,height:768},
  {name:'Desktop-1920',width:1920,height:1080},
  {name:'Desktop-4K-3840',width:3840,height:2160},
];
const provisionalContext={
  sessionId:'synthetic-session',
  employee:{id:'new-employee',displayName:'Ada Okon',status:'provisional',email:'ada@example.test'},
  companies:[{id:'company-print',name:'Printing',code:'PRINT',primary:true}],
  roles:[{id:'role-provisional',code:'provisional',name:'Provisional',companyId:'company-print'}],
  permissions:{'profile.access':'edit'},
  companyPermissions:{'company-print':{'profile.access':'edit'}},
};
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const vp of viewports){
    const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},serviceWorkers:'block'});
    const page=await context.newPage();
    const pageErrors=[];
    let meCalls=0;
    page.on('pageerror',e=>pageErrors.push(e.message));
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url());
      let data={};
      if(url.pathname==='/api/auth/me'){
        meCalls++;data={authenticated:true,context:provisionalContext};
      }else if(url.pathname==='/api/profile/mine'){
        data={profile:{
          id:'new-employee',displayName:'Ada Okon',firstName:'Ada',lastName:'Okon',
          email:'ada@example.test',phone:'',jobTitle:null,department:null,
          status:'provisional',completionPercent:60,
        },workplace:{locationName:'Printing Office'}};
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    try{
      await page.goto('http://127.0.0.1:'+port+'/workspace/',{waitUntil:'domcontentloaded',timeout:30000});
      await page.getByRole('heading',{name:'Your Profile Setup'}).waitFor({timeout:18000});
      const sizing=await page.evaluate(()=>({
        viewport:document.documentElement.clientWidth,
        scrollWidth:document.documentElement.scrollWidth,
        mainVisible:!!document.querySelector('.dsp-provisional-main'),
      }));
      assert.equal(sizing.mainVisible,true);
      assert.ok(sizing.scrollWidth<=sizing.viewport+2,
        vp.name+' horizontal overflow '+JSON.stringify(sizing));
      assert.equal(await page.getByRole('textbox',{name:'First Name'}).inputValue(),'Ada');
      assert.equal(await page.getByRole('textbox',{name:'Verified Email Address'}).inputValue(),'ada@example.test');
      assert.equal(await page.getByRole('textbox',{name:'Verified Email Address'}).getAttribute('readonly'),'');
      assert.equal(await page.getByRole('button',{name:'Save Profile'}).isEnabled(),true);
      assert.ok((await page.locator('body').innerText()).includes('Pending Management Approval'));
      await page.screenshot({path:resolve(evidence,vp.name+'.png'),fullPage:vp.width<=1024});
      const before=meCalls;
      await page.getByRole('button',{name:'Check Approval Status'}).click();
      await page.waitForTimeout(450);
      assert.ok(meCalls>before,'Approval refresh must refetch session, bypassing stale cache');
      assert.equal(pageErrors.length,0,vp.name+' '+pageErrors.join('; '));
      console.log('PASS '+vp.name+' render + profile field + no horizontal overflow + refresh');
    }finally{
      await context.close();
    }
  }
  console.log('PASS synthetic responsive provisional workspace: '+viewports.length+'/'+viewports.length);
}finally{
  await browser?.close();
  await vite.close();
}
