const {chromium}=require('playwright');
const target=process.env.DAENEM_STAFFPORTAL_PREPRODUCTION_URL||'https://daenem-staffportal-api-staging.adedapo2005.workers.dev/';
const sizes=[[390,844],[768,1024],[1024,768],[1280,720],[1366,768],[1920,1080],[2560,1440],[3840,2160]];
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'});
  await page.route('**/*', route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error.message).slice(0,160)));
  const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
  console.log('HTTP',response?.status(),'URL',page.url());
  await page.waitForTimeout(3000);
  const hasRoot=await page.locator('.sp-root').count();
  console.log('APPROOT',hasRoot,'TITLE',await page.title());
  if(!hasRoot){console.log('BODY', (await page.locator('body').innerText()).slice(0,700));process.exitCode=3;return;}
  let failures=0;
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});
   await page.waitForTimeout(250);
   const report=await page.evaluate(([w,h])=>{
    const body=document.documentElement;
    const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)};};
    const cards=[...document.querySelectorAll('#staff-global-operations [data-city-id]')].filter(el=>el.querySelector('.gw-city-clock')).map(el=>({id:el.dataset.cityId||'unknown',rect:el.getBoundingClientRect()}));
    const overlaps=[];
    for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
      const a=cards[i].rect,b=cards[j].rect;
      const iw=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
      const ih=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      if(iw*ih>Math.min(a.width*a.height,b.width*b.height)*.015)overlaps.push(cards[i].id+' / '+cards[j].id);
    }
    return {w,h,scrollWidth:body.scrollWidth,scrollHeight:body.scrollHeight,global:rect('#staff-global-operations'),weather:rect('#staff-local-weather'),auth:rect('#staffportal-auth-mount'),clockCardCount:cards.length,clockCardOverlaps:overlaps};
   },[width,height]);
   const wide=report.scrollWidth>width+3;
   // 1024px is a compact desktop gate. Tablet/mobile vertical scrolling is permitted.
   const vertical=width>=1024&&report.scrollHeight>height+5;
   const overlap=report.clockCardOverlaps.length>0;
   console.log(JSON.stringify({size:width+'x'+height,horizontalOverflow:wide,compactDesktopOverflow:vertical,globalClockOverlap:overlap,...report}));
   if(wide||vertical||overlap)failures++;
  }
  console.log('JS ERRORS',errors.length,errors.slice(0,5));
  console.log('LAYOUT FAILING SIZES',failures,'/',sizes.length);
  if(failures)process.exitCode=2;
 }finally{await browser.close();}
})().catch(e=>{console.error('ERROR',e.message);process.exitCode=1});
