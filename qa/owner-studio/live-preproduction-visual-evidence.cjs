const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const target=process.env.DAENEM_STAFFPORTAL_PREPRODUCTION_URL||'https://daenem-staffportal-api-staging.adedapo2005.workers.dev/';
const output=path.join('qa','owner-studio','live-evidence');
const sizes=[[390,844],[768,1024],[1024,768],[1280,720],[1366,768],[1920,1080],[3840,2160]];
(async()=>{
 const browser=await chromium.launch({headless:true});
 fs.mkdirSync(output,{recursive:true});
 try {
  const checks=[];
  for(const [width,height] of sizes){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   const errors=[], blocked=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    const m=route.request().method();
    if(m==='GET'||m==='HEAD')return route.continue();
    blocked.push(m+':'+route.request().url());
    return route.abort();
   });
   let http=null;
   try{
    const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
    http=response?.status()??null;
    await page.waitForTimeout(1500);
    const metrics=await page.evaluate(()=>{
      const rect=sel=>{const el=document.querySelector(sel);if(!el)return null;const r=el.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),bottom:Math.round(r.bottom),right:Math.round(r.right)}};
      const root=document.documentElement;
      return{title:document.title,width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight,root:rect('.sp-root'),global:rect('#staff-global-operations'),weather:rect('#staff-local-weather'),auth:rect('#staffportal-auth-mount'),signInTab:rect('.sp-auth-tabs'),firstCity:rect('#staff-global-operations [data-city-id]')};
    });
    const result={size:width+'x'+height,http,url:page.url(),metrics,errors,blockedNonGet:blocked};
    checks.push(result);
    await page.screenshot({path:path.join(output,'public-'+width+'.png'),fullPage:true});
    console.log(JSON.stringify({size:result.size,http,scroll:metrics.scrollHeight,wide:metrics.scrollWidth>width,desktopOverflow:width>=1024&&metrics.scrollHeight>height+5,errors,blockedNonGet:blocked.length}));
   }catch(e){checks.push({size:width+'x'+height,http,error:String(e)});console.error(width+' ERROR '+e.message)}
   finally{await page.close()}
  }
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify({target,checks},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
