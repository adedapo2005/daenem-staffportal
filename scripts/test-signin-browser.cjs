/* Real-browser Sign-In / Create Account layout and interaction gate.
 * Uses original AuthScreen source and isolated API mocks. Never authenticates
 * real employees, changes Cloudflare or touches staging/production D1.
 */
const {chromium}=require('playwright');
const {createServer}=require('vite');
const assert=require('node:assert/strict');

const screens=[[390,844],[820,1180],[1025,600],[1280,720],[1366,768],[1920,1080],[3840,2160]];
const desktop=new Set([1280,1366,1920,3840]);
const approvedZones=['#staff-primary-information','.sp-hero',
  '#staff-global-operations','#staff-local-weather','#staffportal-auth-mount'];

async function main(){
 const server=await createServer({
   configFile:'vite.signin-browser-qa.config.ts',
   server:{host:'127.0.0.1',port:0,strictPort:false},
   logLevel:'error',
 });
 await server.listen();
 const address=server.httpServer.address();
 const site='http://127.0.0.1:'+address.port;
 const browser=await chromium.launch({headless:true});
 let passed=0;
 try{
  for(const [width,height] of screens){
   const page=await browser.newPage({
     viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',
   });
   const exceptions=[];
   page.on('pageerror',e=>exceptions.push(e.message));
   await page.route('**/api/**',route=>{
     const u=new URL(route.request().url()).pathname;
     let body={};
     if(u==='/api/auth/me')body={authenticated:false};
     if(u==='/api/auth/signup/start')body={challengeId:'test-challenge',
       destination:'tester@example.org',message:'Verification code sent'};
     if(u==='/api/auth/signup/verify')body={username:'testemployee',
       message:'Account verified successfully'};
     if(u==='/api/context/signin/weather')body={
       available:true,provider:'Google Weather',providerStatus:'fresh',
       fetchedAt:'2026-10-19T00:00:00Z',cacheAgeSeconds:0,unitsSystem:'METRIC',
       location:'Ibadan',temperature:31,apparentTemperature:33,humidity:74,
       precipitationProbability:10,windSpeed:6,description:'Mostly sunny'};
     return route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify(body)});
   });
   try{
    await page.goto(site+'/qa/signin/index.html',{
      waitUntil:'domcontentloaded',timeout:30000,
    });
    await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
    // Approved markup renders dynamically; wait for styled, settled geometry
    // rather than asserting against transitional unstyled DOM.
    await page.waitForFunction(()=>{
      const root=document.querySelector('.sp-root');
      const auth=document.querySelector('#staffportal-auth-mount');
      return root&&auth&&root.getBoundingClientRect().width<=innerWidth+2 &&
        getComputedStyle(root).display==='grid';
    },{timeout:15000});
    await page.waitForTimeout(750);
    const layout=await page.evaluate(zones=>{
      const rect=e=>{const r=e.getBoundingClientRect();
        return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const summary={vw:innerWidth,vh:innerHeight,
        scrollWidth:document.documentElement.scrollWidth,
        scrollHeight:document.documentElement.scrollHeight,
        sections:zones.map(s=>{const e=document.querySelector(s);
          if(!e)return{selector:s,missing:true};
          const css=getComputedStyle(e);
          return{selector:s,box:rect(e),overflow:css.overflowY,
            clientHeight:e.clientHeight,scrollHeight:e.scrollHeight};
        }),
        widgetCount:document.querySelectorAll('#staff-primary-information > .gw-intelligence-widget').length,
        clockCount:document.querySelectorAll('#staff-global-operations article[data-city-id]').length,
        clientControls:[...document.querySelectorAll('#staffportal-auth-mount input, #staffportal-auth-mount button')]
          .filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0})
          .map(e=>({name:(e.textContent||e.getAttribute('placeholder')||'').trim().slice(0,32),box:rect(e)})),
      };
      return summary;
    },approvedZones);
    const bySel=new Map(layout.sections.map(s=>[s.selector,s]));
    assert.equal(layout.widgetCount,4,'all four approved widgets visible');
    assert.equal(layout.clockCount,6,'all six world clocks exist');
    assert.ok(layout.scrollWidth<=width+2,'horizontal overflow');
    for(const section of layout.sections){
      assert.ok(!section.missing,'missing '+section.selector);
      assert.ok(section.box.x>=-2&&section.box.right<=width+2,
        section.selector+' outside horizontal viewport');
      assert.ok(section.box.height>60,'collapsed '+section.selector);
    }
    const auth=bySel.get('#staffportal-auth-mount');
    assert.ok(auth.scrollHeight<=auth.clientHeight+3,
      'Sign-In content scrolls or clips internally');
    for(const c of layout.clientControls) {
      assert.ok(c.box.x>=-2&&c.box.right<=width+2,
        'hidden/clipped auth control '+c.name);
    }
    // Contained desktop: login is a separate zone, not visually overlaying
    // the hero, world-clock tiles, weather or information rail.
    const disjoint=(a,b)=>{
      const p=bySel.get(a).box,q=bySel.get(b).box;
      return Math.max(0,Math.min(p.right,q.right)-Math.max(p.x,q.x)) *
        Math.max(0,Math.min(p.bottom,q.bottom)-Math.max(p.y,q.y)) <= 4;
    };
    for(const zone of approvedZones.filter(s=>s!=='#staffportal-auth-mount'))
      assert.ok(disjoint('#staffportal-auth-mount',zone),
        'Sign-In overlaps '+zone);
    if(desktop.has(width)) assert.ok(layout.scrollHeight<=height+2,
      'desktop requires vertical page scroll');
    await page.locator('#staffportal-auth-mount input').first().focus();
    const focused=await page.evaluate(()=>
      !!document.activeElement?.closest('#staffportal-auth-mount'));
    assert.ok(focused,'Sign-In focus not keyboard accessible');
    console.log('PASS sign-in '+width+'x'+height+
      ' authH='+Math.round(auth.box.height)+' bodyH='+layout.scrollHeight);
    passed++;

    await page.locator('.sp-auth-tabs button').nth(1).click();
    const dialog=page.getByRole('dialog');
    await dialog.waitFor({state:'visible',timeout:10000});
    assert.equal(await dialog.getAttribute('aria-modal'),'true');
    const modal=await page.evaluate(()=>{
      const e=document.querySelector('#staffportal-auth-mount');
      const r=e.getBoundingClientRect();
      return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,
        width:r.width,scrollH:e.scrollHeight,clientH:e.clientHeight,
        activeInside:!!document.activeElement?.closest('#staffportal-auth-mount')};
    });
    assert.ok(modal.x>=-2&&modal.right<=width+2,'signup dialog outside viewport');
    assert.ok(modal.activeInside,'signup focus outside dialog');
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>!!document.activeElement?.closest('#staffportal-auth-mount')),
      'signup keyboard focus escaped dialog');
    if([390,1025,1280,1920].includes(width)){
      const submit=()=>page.locator('.usp-auth-form .usp-primary-button');
      await submit().click();
      assert.ok((await page.locator('.usp-auth-message').allTextContents())
        .some(x=>x.includes('Enter your first and last name')),'missing required error');
      await page.getByRole('textbox',{name:'First Name'}).fill('Ada');
      await page.getByRole('textbox',{name:'Last Name'}).fill('Okon');
      await submit().click();
      await page.getByRole('textbox',{name:'Personal Email'}).fill('invalid');
      await submit().click();
      assert.ok((await page.locator('.usp-auth-message').allTextContents())
        .some(x=>x.includes('valid personal email')),'missing invalid email error');
      await page.getByRole('textbox',{name:'Personal Email'}).fill('ada@example.org');
      await submit().click();
      await page.getByRole('textbox',{name:'Create Username'}).fill('adaokon21');
      await submit().click();
      const passwords=page.locator('.usp-auth-form input[autocomplete="new-password"]');
      assert.equal(await passwords.count(),2);
      await passwords.nth(0).fill('StrongPass123!');
      await passwords.nth(1).fill('StrongPass123!');
      await submit().click();
      await submit().click();
      await page.getByRole('textbox',{name:/Verification Code/i}).waitFor();
      await page.getByRole('textbox',{name:/Verification Code/i}).fill('123456');
      await submit().click();
      await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
    }else{
      await page.keyboard.press('Escape');
      await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
    }
    await page.locator('.sp-auth-tabs button').nth(1).click();
    await page.locator('.sp-signup-close').click();
    await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
    assert.equal(exceptions.length,0,'browser exceptions: '+exceptions.join('; '));
    console.log('PASS create-account '+width+'x'+height);
    passed++;
   }finally{await page.close();}
  }
 }finally{await browser.close();await server.close();}
 assert.equal(passed,screens.length*2);
 console.log('SIGNIN_BROWSER_QA_PASS '+passed+'/'+screens.length*2);
}
main().catch(e=>{console.error('SIGNIN_BROWSER_QA_FAIL',e.stack||e);process.exitCode=1;});
