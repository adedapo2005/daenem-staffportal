const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createServer}=require('vite');
const sizes=[[390,844],[430,932],[768,1024],[1024,768],[1280,720],[1366,768],[1920,1080],[2560,1440],[3840,2160]];
const selected=process.env.STUDIO_QA_WIDTHS?process.env.STUDIO_QA_WIDTHS.split(',').map(Number):null;
const tested=sizes.filter(([width])=>!selected||selected.includes(width));
if(!tested.length)throw Error('No matching viewport widths selected.');
(async()=>{
 const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
 await server.listen();
 const browser=await chromium.launch({headless:true});
 const root='http://127.0.0.1:'+server.httpServer.address().port;
 const output=path.join('qa','owner-studio','visual-acceptance');
 fs.mkdirSync(output,{recursive:true});
 const all=[];
 try {
  for(const [width,height] of tested){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   const issues=[];
   page.on('pageerror',e=>issues.push(e.message));
   page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))issues.push('Unexpected request '+r.method()+' '+r.url())});
   await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"QA isolated"}'}));
   await page.route('**/staff-portal-signin?*',r=>r.fulfill({status:302,headers:{location:'/qa/signin/index.html?studioReview=signin-v180'},body:''}));
   await page.goto(root+'/qa/owner-studio/index.html',{waitUntil:'domcontentloaded'});
   await page.locator('[data-builder-enter]').click();
   await page.locator('[data-builder-starter]').click();
   const device=String(width);
   if(await page.locator('[data-builder-device] option[value="'+device+'"]').count())await page.locator('[data-builder-device]').selectOption(device);
   await page.locator('[data-builder-live-preview]').click();
   await page.locator('[data-builder-live-root] .sp-auth-form input').first().waitFor({timeout:20000});
   const measured=await page.evaluate(()=>{
    const rect=sel=>{let e=document.querySelector(sel);if(!e)return null;let r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollHeight:e.scrollHeight,scrollWidth:e.scrollWidth}};
    const el=document.querySelector('.owner-concept-auth');
    const authRect=el?.getBoundingClientRect();
    const clippedControls=[...document.querySelectorAll('.owner-concept-auth button,.owner-concept-auth input,.owner-concept-auth a')].filter(e=>{
      const r=e.getBoundingClientRect();return authRect&&r.width>0&&(r.right>authRect.right+2||r.left<authRect.left-2);
    }).map(e=>e.getAttribute('aria-label')||e.textContent?.trim().slice(0,36)||e.tagName);
    return{conceptWidth:parseFloat(getComputedStyle(document.querySelector('.owner-concept-runtime')).width),clippedControls,documentWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,nav:rect('.owner-pro-nav'),editor:rect('.owner-builder'),stage:rect('.owner-builder-live-stage'),layout:rect('.owner-concept-runtime'),auth:rect('.owner-concept-auth'),form:rect('.sp-auth-form'),lastProvider:rect('.sp-social-grid'),banner:rect('.owner-concept-banner'),font:getComputedStyle(document.querySelector('.owner-builder-toolbar')).fontSize,authScroll:el?.scrollHeight};
   });
   if(Math.abs(measured.conceptWidth-width)>2)issues.push('Wrong design viewport '+measured.conceptWidth+' expected '+width);
   if(measured.clippedControls.length)issues.push('Auth controls clipped: '+measured.clippedControls.join(', '));
   if(width>=1024 && measured.auth?.bottom>measured.layout?.bottom+5)issues.push('Desktop authentication extends below viewport: '+Math.round(measured.auth.bottom-measured.layout.bottom)+'px');
   await page.screenshot({path:path.join(output,'editor-'+width+'.png'),fullPage:true});
   if(width===3840){
    const nameInputWidth=await page.locator('[data-builder-name]').evaluate(e=>e.getBoundingClientRect().width);
    if(nameInputWidth<380)issues.push('4K Design Name field too narrow: '+nameInputWidth+'px');
    await page.locator('.owner-builder-toolbar').screenshot({path:path.join(output,'toolbar-3840.png')});
    await page.locator('.owner-pro-nav').screenshot({path:path.join(output,'navigation-3840.png')});
   }
   await page.locator('.owner-builder-live').screenshot({path:path.join(output,'preview-'+width+'.png')});
   await page.locator('[data-builder-live-fullsize]').click();
   await page.locator('.owner-builder-live.is-fullsize').waitFor();
   if(await page.locator('[data-builder-live-fullsize]').getAttribute('aria-pressed')!=='true')issues.push('Full-size control was not pressed');
   const full=await page.evaluate(()=>{
    const el=document.querySelector('.owner-concept-runtime');
    const stage=document.querySelector('.owner-builder-live-stage');
    const a=document.querySelector('.owner-concept-auth');
    const r=el.getBoundingClientRect(),s=stage.getBoundingClientRect(),v=a.getBoundingClientRect();
    return {width:r.width,right:r.right,stageWidth:s.width,authBottom:v.bottom,canvasBottom:r.bottom};
   });
   if(full.width>width+2||full.right>width+2)issues.push('Full-size preview overflows horizontally');
   if(width>=1024&&full.authBottom>full.canvasBottom+5)issues.push('Full-size desktop form exceeds design viewport');
   await page.screenshot({path:path.join(output,'fullsize-'+width+'.png')});
   if(width===390||width===1366){
    await page.locator('[data-builder-live-root] .sp-auth-tabs button').nth(1).click();
    await page.locator('[data-builder-live-root] .usp-auth-panel').waitFor({timeout:5000});
    await page.screenshot({path:path.join(output,'signup-'+width+'.png')});
   }
   await page.locator('[data-builder-live-fullsize]').click();
   if(await page.locator('.owner-builder-live.is-fullsize').count())issues.push('Full-size preview did not revert');
   all.push({width,height,...measured,issues});
   console.log(JSON.stringify({width,documentOverflow:measured.documentWidth>width,layout:measured.layout,auth:measured.auth,form:measured.form,issues}));
   await page.close();
  }
  fs.writeFileSync(path.join(output,'metrics.json'),JSON.stringify(all,null,2));
  if(all.some(m=>m.issues.length))throw Error('Visual acceptance audit failures: '+JSON.stringify(all.filter(m=>m.issues.length).map(m=>({width:m.width,issues:m.issues}))));
 }finally{await browser.close();await server.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
