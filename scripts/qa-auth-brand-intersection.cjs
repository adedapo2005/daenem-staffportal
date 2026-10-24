const { chromium }=require('playwright'),{createServer}=require('vite');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const out=path.resolve('qa-artifacts/premium-signin-acceptance-20261023');
 fs.mkdirSync(out,{recursive:true});
 const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0},logLevel:'error'});
 await server.listen();
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {
  for(const [w,h] of [[3840,2160],[1920,1080],[1366,768]]){
   const page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'});
   await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authenticated:false})}));
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa/signin/index.html',{waitUntil:'domcontentloaded'});
   await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
   await page.waitForTimeout(700);
   const values=await page.evaluate(()=>{
    const root=document.querySelector('#staffportal-auth-mount');
    const rect=e=>{if(!e)return null;let r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),bottom:+r.bottom.toFixed(1)}};
    const selectors=['.sp-auth-topline','.sp-auth-logo-v101','.sp-auth-logo-v101 .sp-hero-brand','.sp-auth-logo-v101 .sp-brand-mark-wrap','.sp-secure-chip','.sp-auth-copy','.sp-auth-copy .sp-eyebrow','.sp-auth-copy h2','.sp-auth-copy p:last-child','.sp-auth-tabs'];
    const all=selectors.map(sel=>{const e=root.querySelector(sel),cs=e?getComputedStyle(e):null;return {sel,rect:rect(e),fontSize:cs?.fontSize,lineHeight:cs?.lineHeight,position:cs?.position,transform:cs?.transform,overflow:cs?.overflow,margin:cs?.margin,padding:cs?.padding}});
    const eyebrow=root.querySelector('.sp-auth-copy .sp-eyebrow');
    const eyebrowY=eyebrow?.getBoundingClientRect().top??Infinity;
    const descendants=[...root.querySelectorAll('.sp-auth-logo-v101 *')].map(e=>({tag:e.tagName,cl:typeof e.className==='string'?e.className.slice(0,95):'',txt:(e.textContent||'').trim().slice(0,38),rect:rect(e)})).filter(x=>x.rect?.bottom>eyebrowY-2).slice(0,14);
    return {all,eyebrowY,overlappingBrandDescendants:descendants};
   });
   console.log('BRAND_GEOMETRY '+w+'x'+h+' '+JSON.stringify(values));
   await page.locator('#staffportal-auth-mount').screenshot({path:path.join(out,'auth-brand-crop-'+w+'.jpg'),type:'jpeg',quality:78,timeout:30000});
   await page.close();
  }
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
