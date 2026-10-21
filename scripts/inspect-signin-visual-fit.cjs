/* Screenshot and geometry acceptance for responsive Sign-In desktop visual balance. */
const {chromium}=require('playwright');
const {createServer}=require('vite');
const fs=require('node:fs'),path=require('node:path');
const screens=[[1280,720],[1366,768],[1680,900],[1920,1080],[3840,2160]];
const cities={ibadan:26,toronto:14,london:8,newyork:17,moscow:5,tokyo:19,beijing:5};
const zones={ibadan:'Africa/Lagos',toronto:'America/Toronto',london:'Europe/London',newyork:'America/New_York',moscow:'Europe/Moscow',tokyo:'Asia/Tokyo',beijing:'Asia/Shanghai'};
const labels={ibadan:'Ibadan',toronto:'Toronto',london:'London',newyork:'New York',moscow:'Moscow',tokyo:'Tokyo',beijing:'Beijing'};
(async()=>{
 const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
 await server.listen(); const b=await chromium.launch({headless:true});let results=[];
 const out=path.resolve('.weather-content-qa');fs.mkdirSync(out,{recursive:true});
 try{for(const [width,height] of screens){
  const page=await b.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',route=>{const u=new URL(route.request().url());let body={};
    if(u.pathname==='/api/auth/me')body={authenticated:false};
    if(u.pathname==='/api/context/signin/weather'){
      const id=u.searchParams.get('city')||'ibadan',n=cities[id]||24;
      body={available:true,provider:'Google Weather',providerStatus:'fresh',fetchedAt:new Date().toISOString(),cacheAgeSeconds:0,unitsSystem:'METRIC',location:labels[id]||'Ibadan',temperature:n,apparentTemperature:n+2,humidity:74,precipitationProbability:9,windSpeed:6,windDirection:157,windGust:11,today:{high:31,low:24},recentHigh:31,recentLow:24,description:'Partly cloudy',isDay:true};
    } if(u.pathname==='/api/context/signin/news')body={state:'partial',latest:[],intelligence:{},sources:[]};
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sp-root')).display==='grid'&&[...document.querySelectorAll('#staff-global-operations [data-signin-weather-summary]')].length===6);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(950);
  const data=await page.evaluate(()=>{
    const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)}};
    const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)>Math.max(a.x,b.x)+2&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)+2;
    const val=e=>({rect:box(e),text:e?.textContent?.trim()?.slice(0,120),style:e?{font:getComputedStyle(e).fontSize,whiteSpace:getComputedStyle(e).whiteSpace,display:getComputedStyle(e).display}:null,scroll:e?.scrollWidth,client:e?.clientWidth});
    const get=sel=>document.querySelector(sel);
    const all=[...document.querySelectorAll('#staff-global-operations article[data-city-id],#staff-local-weather article[data-city-id]')].map(card=>{
      const clock=card.querySelector('.gw-city-clock'),digital=card.querySelector('.gw-city-digital'),time=digital?.querySelector('.gw-city-local-time');
      const ps=[...digital?.querySelectorAll('p')||[]].map(val);
      const date=ps.length>1?ps[1]:null;
      const clockB=box(clock),dateB=date?.rect,timeB=box(time);
      const family=[...card.querySelectorAll('.gw-city-identity,.gw-city-name')].map(val);
      const weather=card.querySelector('[data-signin-weather-summary]');
      const metric=card.querySelector('.sp-global-weather-details');
      return {id:card.dataset.cityId,card:box(card),clock:clockB,digital:box(digital),time:val(time),date,meta:ps,identity:family,weather:box(weather),metrics:box(metric),
        clockDateOverlap:overlap(clockB,dateB),clockTimeOverlap:overlap(clockB,timeB),dateClip:!!date&&(dateB.right>box(card).right+2||dateB.bottom>box(card).bottom+2),dateOverflow:!!date&&date.scroll>date.client+2
      };
    });
    const auth=get('.sp-auth-card.sp-auth-gateway'),brand=get('.sp-auth-logo-v101');
    const logo=brand?.querySelector('.sp-brand-mark-wrap');
    const allControls=[...auth?.querySelectorAll('button,input,a')||[]].filter(e=>e.getClientRects().length);
    return {width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,
    cards:all,auth:box(auth),brand:box(brand),logo:box(logo),brandStyle:brand?{transform:getComputedStyle(brand).transform,height:getComputedStyle(brand).height}:null,
    authControlsOutside:allControls.filter(e=>box(e).bottom>box(auth).bottom+2).map(e=>e.textContent?.trim()||e.getAttribute('aria-label')||e.tagName),
    local:box(get('#staff-local-weather')),global:box(get('#staff-global-operations'))};
  });
  results.push({...data,errors});
  const issues=data.cards.filter(c=>c.clockDateOverlap||c.clockTimeOverlap||c.dateClip||c.dateOverflow);
  console.log('SIZE '+width+'x'+height+' ISSUES '+JSON.stringify(issues.map(c=>({id:c.id,overlap:c.clockDateOverlap||c.clockTimeOverlap,clip:c.dateClip,overflow:c.dateOverflow,time:c.time.text,date:c.date?.text})))+' AUTH_OUT '+JSON.stringify(data.authControlsOutside));
  await page.screenshot({path:path.join(out,'visual-current-'+width+'x'+height+'.png'),fullPage:false});
  await page.close();
 }}finally{await b.close();await server.close();}
 fs.writeFileSync(path.join(out,'visual-current-geometry.json'),JSON.stringify(results,null,2));
 console.log('DONE '+results.length);
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
