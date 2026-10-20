const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('vite');
const screens=[[390,844],[820,1180],[1025,600],[1280,720],[1366,768],[1920,1080],[3840,2160]];
(async()=>{
 const vite=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
 await vite.listen();
 const port=vite.httpServer.address().port;
 const browser=await chromium.launch({headless:true});
 let passed=0;
 try {
  for(const [width,height] of screens){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(new URL(r.request().url()).pathname==='/api/auth/me'?{authenticated:false}:{})}));
   try {
    await page.goto('http://127.0.0.1:'+port+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('.sp-auth-tabs button').nth(1).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    await page.waitForFunction(()=>document.querySelector('.sp-root') && document.querySelector('#staffportal-auth-mount') && getComputedStyle(document.querySelector('.sp-root')).display==='grid');
    await page.waitForTimeout(750);
    assert.equal(await dialog.getAttribute('aria-modal'),'true');
    const probe=async(label)=>{
      if(width<=1025) await dialog.scrollIntoViewIfNeeded();
      const info=await page.evaluate(()=>{
        const mount=document.querySelector('#staffportal-auth-mount');
        const bounds=e=>e.getBoundingClientRect();
        const r=bounds(mount);
        const controls=[...mount.querySelectorAll('button,input,a[href]')].filter(e=>e.getClientRects().length);
        const off=controls.filter(e=>{const z=bounds(e);return z.x < -2 || z.right > innerWidth+2 || z.y < -2 || z.bottom > innerHeight+2});
        return {rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},off:off.map(e=>e.textContent||e.getAttribute('placeholder')),controlCount:controls.length,scrollWidth:document.documentElement.scrollWidth,mode:document.querySelector('.usp-auth-panel')?.getAttribute('data-auth-mode')};
      });
      assert.ok(info.rect.x>=-2&&info.rect.right<=width+2,'horizontal dialog overflow '+width+' '+label);
      if(width>=1280) assert.ok(info.rect.y>=-2&&info.rect.bottom<=height+2,'vertical dialog overflow '+width+' '+label);
      else assert.ok(info.rect.bottom>0&&info.rect.y<height,'mobile/tablet signup must be reachable '+width+' '+label);
      if(width>=1280) assert.equal(info.off.length,0,'offscreen controls '+width+' '+label+': '+info.off.join(', '));
      else assert.ok(await dialog.locator('.usp-primary-button').first().isVisible(),'mobile/tablet signup actions accessible');
      assert.ok(info.scrollWidth<=width+2,'document horizontal overflow '+width+' '+label);
      return info;
    };
    await probe('identity');
    if([390,1025,1280,1920].includes(width)){
      const next=()=>page.locator('.usp-auth-form .usp-primary-button');
      await page.getByRole('textbox',{name:'First Name'}).fill('Ada');
      await page.getByRole('textbox',{name:'Last Name'}).fill('Okon');
      await next().click();await probe('contact');
      await page.getByRole('textbox',{name:'Personal Email'}).fill('ada@example.org');
      await next().click();await probe('username');
      await page.getByRole('textbox',{name:'Create Username'}).fill('adaokon21');
      await next().click();await probe('password');
    }
    assert.equal(errors.length,0,'browser exceptions: '+errors.join(';'));
    await page.keyboard.press('Escape');
    await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
    passed++;console.log('PASS CREATE_ACCOUNT_ISOLATED '+width+'x'+height);
   }finally{await page.close();}
  }
 }finally{await browser.close();await vite.close();}
 assert.equal(passed,screens.length);
 console.log('CREATE_ACCOUNT_ISOLATED_QA_PASS '+passed+'/'+screens.length);
})().catch(e=>{console.error('CREATE_ACCOUNT_ISOLATED_QA_FAIL',e.stack);process.exitCode=1});
