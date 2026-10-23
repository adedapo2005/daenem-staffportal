const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const target=process.env.DAENEM_STAFFPORTAL_PREPRODUCTION_URL||'https://daenem-staffportal-api-staging.adedapo2005.workers.dev/';
const sizes=[[1024,768],[1280,720],[1366,768]],out='qa/owner-studio/live-evidence';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  const errors=[];
  await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
  for(const delay of [1600,5000]){
   await page.waitForTimeout(delay);
   const info=await page.evaluate(()=>{
    const root=document.documentElement,body=document.body;
    const offenders=[...body.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return c.display!=='none'&&c.visibility!=='hidden'&&r.bottom>innerHeight+30&&r.height>innerHeight*.7}).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id||null,cls:typeof el.className==='string'?el.className.slice(0,92):'',top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),position:getComputedStyle(el).position}}).sort((a,b)=>b.bottom-a.bottom).slice(0,12);
    return{scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight,bodyHeight:body.scrollHeight,offenders};
   });
   console.log(JSON.stringify({size:width+'x'+height,delay,...info,errors}));
   await page.screenshot({path:path.join(out,'viewport-'+width+'-'+delay+'.png'),fullPage:false});
  }
  await page.close();
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
