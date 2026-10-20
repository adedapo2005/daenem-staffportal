/* Real-browser unified StaffPortal recovery acceptance:
 * no company dropdown, canonical backend-owned company lookup,
 * email / WhatsApp option handling, approved 6-char server policy, and
 * unlinked provider identity restricted to new-user onboarding.
 * All API requests are intercepted: no employee records are created.
 */
const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');
const {chromium}=require('playwright');
const {createServer}=require('vite');

const viewports=[[390,844],[430,932],[820,1180],[1366,768],[1920,1080],[3840,2160]];
async function main(){
 const server=await createServer({
  configFile:'vite.signin-browser-qa.config.ts',
  server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error',
 });
 await server.listen();
 const port=server.httpServer.address().port;
 const origin='http://127.0.0.1:'+port;
 const browser=await chromium.launch({headless:true});
 mkdirSync('qa-artifacts/staffportal-unified-auth',{recursive:true});
 let passed=0;
 try{
  for(const [width,height] of viewports){
   const page=await browser.newPage({
    viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',
   });
   const errors=[],sent=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',async(route)=>{
    const r=route.request();
    const path=new URL(r.url()).pathname;
    if(r.method()==='POST' && path.includes('/password/')){
     try{sent.push({path,body:r.postDataJSON()})}
     catch{sent.push({path,body:null})}
    }
    let payload={};
    if(path==='/api/auth/me')payload={authenticated:false};
    if(path==='/api/auth/password-policy')payload={
      minimumLength:6,maximumLength:128,requiresUppercase:true,requiresLowercase:true,
      requiresNumber:true,requiresSymbol:true,
    };
    if(path==='/api/auth/password/forgot'||path==='/api/auth/password/forgot-whatsapp')
      payload={challengeId:'qa-challenge',message:'If eligible, check your verification channel.'};
    if(path==='/api/auth/password/verify-reset'||path==='/api/auth/password/verify-reset-whatsapp')
      payload={resetToken:'qa-reset-authorized',message:'Identity verified.'};
    if(path==='/api/auth/password/reset')
      payload={ok:true,message:'Password updated. All previous sessions revoked.'};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
   });
   try{
    await page.goto(origin+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('.sp-forgot').waitFor({state:'visible',timeout:15000});
    await page.locator('.sp-forgot').click();
    await page.locator('.usp-recovery-methods').waitFor();
    const dialog=page.getByRole('dialog');
    await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.getAttribute('aria-modal'),'true','recovery must be accessible dialog');
    const containment=await page.evaluate(()=>{
      const mount=document.querySelector('#staffportal-auth-mount');
      const host=mount.getBoundingClientRect();
      const items=[...document.querySelectorAll('.usp-recovery-methods button')];
      return {
        hostX:host.left,hostRight:host.right,hostWidth:host.width,
        buttons:items.map(button=>{
          const r=button.getBoundingClientRect();
          const elements=[...button.querySelectorAll('b,small')];
          return {
            width:r.width,overflow:button.scrollWidth-button.clientWidth,
            labelOutside:elements.some(item=>{
              const child=item.getBoundingClientRect();
              return child.left<r.left-2||child.right>r.right+2;
            }),
            smallFonts:elements.filter(x=>x.tagName==='SMALL')
              .map(x=>parseFloat(getComputedStyle(x).fontSize)),
          };
        }),
      };
    });
    assert.ok(containment.hostWidth>=Math.min(330,width-25),'narrow recovery dialog');
    assert.ok(containment.hostX>=-2&&containment.hostRight<=width+2,'dialog outside viewport');
    assert.ok(containment.buttons.length===2,'recovery options missing');
    for(const button of containment.buttons){
      assert.ok(button.width>=140,'narrow recovery option');
      assert.ok(button.overflow<=2,'recovery method has clipped content');
      assert.ok(!button.labelOutside,'recovery method text exceeds button bounds');
      assert.ok(button.smallFonts.every(n=>n>=12),'recovery guidance is unreadably small');
    }
    await page.screenshot({
      path:'qa-artifacts/staffportal-unified-auth/recovery-'+width+'x'+height+'.png',
      fullPage:false,
    });
    assert.equal(await page.locator('.usp-recovery-company').count(),0,
      'company selector must be absent');
    assert.equal(await page.locator('.usp-recovery-methods button').count(),2,
      'email and WhatsApp methods must remain selectable');
    await page.locator('.usp-auth-form input[aria-label]').first().fill('ada@example.org');
    await page.locator('.usp-auth-form .usp-primary-button').click();
    await page.locator('.usp-auth-form input[autocomplete="one-time-code"]').waitFor();
    assert.ok(sent.some(x=>x.path==='/api/auth/password/forgot'&&
      x.body.identifier==='ada@example.org'&&!('companyCode' in x.body)),
      'email recovery request must not disclose or guess company');
    await page.locator('.usp-auth-form input[autocomplete="one-time-code"]').fill('123456');
    await page.locator('.usp-auth-form .usp-primary-button').click();
    const passwords=page.locator('.usp-auth-form input[autocomplete="new-password"]');
    await passwords.first().waitFor({state:'visible',timeout:15000});
    assert.equal(await passwords.count(),2,'password reset must offer two fields');
    await passwords.nth(0).fill('Aa1!bc');
    await passwords.nth(1).fill('Aa1!bc');
    const reset=page.locator('.usp-auth-form .usp-primary-button');
    assert.ok(await reset.isEnabled(),'six-character password should obey server policy');
    await reset.click();
    await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
    assert.ok(sent.some(x=>x.path==='/api/auth/password/reset'&&
      x.body.newPassword==='Aa1!bc'),'reset must call real backend API contract');
    await page.locator('.sp-forgot').click();
    await page.locator('.usp-recovery-methods').waitFor();
    await page.locator('.usp-recovery-methods button').nth(1).click();
    await page.locator('.usp-auth-form input[aria-label]').first().fill('ada@example.org');
    await page.locator('.usp-auth-form .usp-primary-button').click();
    await page.locator('.usp-auth-form input[autocomplete="one-time-code"]').waitFor();
    assert.ok(sent.some(x=>x.path==='/api/auth/password/forgot-whatsapp'&&
      x.body.identifier==='ada@example.org'&&!('companyCode' in x.body)),
      'WhatsApp recovery must not disclose or guess company');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=2,'recovery controls overflow screen: '+overflow);
    assert.equal(errors.length,0,'unexpected browser errors');
    console.log('PASS company-free recovery '+width+'x'+height);
    passed++;

    await page.goto(origin+'/qa/signin/index.html?auth_error=employee_not_authorized',
      {waitUntil:'domcontentloaded'});
    const start=page.getByRole('button',{name:/Create or complete your account/i});
    await start.waitFor({state:'visible'});
    await start.click();
    await page.getByRole('dialog').waitFor();
    await page.screenshot({
      path:'qa-artifacts/staffportal-unified-auth/new-user-'+width+'x'+height+'.png',
      fullPage:false,
    });
    assert.equal(errors.length,0,'new identity acceptance has JavaScript errors');
    console.log('PASS unlinked provider provisional onboarding '+width+'x'+height);
    passed++;
   }finally{await page.close();}
  }
 }finally{await browser.close();await server.close();}
 assert.equal(passed,viewports.length*2);
 console.log('UNIFIED_AUTH_BROWSER_QA_PASS '+passed+'/'+(viewports.length*2));
}
main().catch(e=>{console.error('UNIFIED_AUTH_BROWSER_QA_FAILED',e.stack||e);process.exitCode=1;});
