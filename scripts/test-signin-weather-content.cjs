/* Exercises the real Sign-In component with isolated, city-specific API data.
 * No employee login, provider send, D1 mutation or deployment occurs here. */
const { chromium } = require('playwright');
const { createServer } = require('vite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const baseline = process.argv.includes('--baseline');
const screens = process.argv.includes('--states-only') ? [] : baseline ? [[1363,936],[1366,768],[1280,720],[1025,600],[1920,1080]] : [[390,844],[820,1180],[1024,768],[1025,600],[1280,720],[1363,936],[1366,768],[1920,1080],[3840,2160]];
const cities = {ibadan:'Ibadan',toronto:'Toronto',london:'London',newyork:'New York',moscow:'Moscow',tokyo:'Tokyo',beijing:'Beijing'};
const temperatures = {ibadan:26,toronto:12,london:9,newyork:18,moscow:3,tokyo:22,beijing:6};
const fixture = (city, change=0) => ({available:true,provider:'Google Weather',providerStatus:'fresh',fetchedAt:new Date().toISOString(),cacheAgeSeconds:0,unitsSystem:'METRIC',location:cities[city],temperature:temperatures[city]+change,apparentTemperature:28+change,humidity:95,precipitationProbability:10,windSpeed:5,windDirection:157,windGust:8,today:{high:33,low:24},description:city==='london'?'Mostly cloudy':'Clear'});
const seed = fixture('ibadan',-20);
async function run(){
 const server = await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
 await server.listen();
 const site='http://127.0.0.1:'+server.httpServer.address().port;
 const browser=await chromium.launch({headless:true});
 const results=[];
 const output=path.resolve('.weather-content-qa');fs.mkdirSync(output,{recursive:true});
 try{
  for(const [width,height] of screens){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
   if(!baseline && width===1363)await page.clock.install();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let change=0;const calls={};
   await page.addInitScript(payload=>localStorage.setItem('daenem:staffportal:signin-weather:ibadan:v1',JSON.stringify({savedAt:Date.now(),payload})),seed);
   await page.route('**/api/**',async route=>{
    const u=new URL(route.request().url());let body={};
    if(u.pathname==='/api/auth/me')body={authenticated:false};
    if(u.pathname==='/api/context/signin/news')body={state:'partial',latest:[{id:'qa-news',title:'Nigerian businesses expand local training programmes',source:'QA attributed source',categories:'Nigeria',link:'https://example.org/news',published:new Date().toISOString(),summary:''}],intelligence:Object.fromEntries(['Security','Economy','Politics','Agriculture','Energy','Infrastructure'].map(domain=>[domain,[]])),sources:[{name:'QA attributed source'}]};
    if(u.pathname==='/api/context/signin/weather'){
     const city=u.searchParams.get('city')||'ibadan';calls[city]=(calls[city]||0)+1;body=fixture(city,change);
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   let error;
   try{
    await page.goto(site+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sp-root')).display==='grid');
    if(!baseline)await page.waitForFunction(expected=>Object.entries(expected).every(([city,t])=>document.querySelector(`[data-signin-weather-summary="${city}"]`)?.textContent.includes(t+'°C')),temperatures,{timeout:10000});
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>[...document.querySelectorAll('article[data-city-id] .gw-city-image-layer img')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:15000});
    await page.waitForTimeout(750);
    const data=await page.evaluate(()=>{
     const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
     const contains=(outer,inner)=>inner.x>=outer.x-1&&inner.right<=outer.right+1&&inner.y>=outer.y-1&&inner.bottom<=outer.bottom+1;
     const cards=[...document.querySelectorAll('article[data-city-id]')].map(card=>{
      const summary=card.querySelector('[data-signin-weather-summary]')||card.querySelector('.gw-city-instrument')?.nextElementSibling;
      const c=box(card),s=summary?box(summary):null;
      return{city:card.dataset.cityId,clock:box(card.querySelector('.gw-city-clock')),card:c,summary:s,text:summary?.textContent,inside:s&&contains(c,s),digital:[...card.querySelectorAll('.gw-city-digital > p')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent,box:box(e),inside:contains(c,box(e))}))};
     });
     const weather=document.querySelector('#staff-local-weather'),w=box(weather);
     const detail=document.querySelector('.sp-weather-v145-intelligence'),d=box(detail);
     const fields=[...document.querySelectorAll('.sp-live-weather-metric dt,.sp-live-weather-metric dd,.sp-live-weather-range,.sp-weather-v145-footer > span')].map(e=>({text:e.textContent,box:box(e),inside:contains(w,box(e))&&(e.closest('.sp-weather-v145-footer')?true:contains(d,box(e))),font:parseFloat(getComputedStyle(e).fontSize)}));
     const overlaps=fields.flatMap((a,i)=>fields.slice(i+1).filter(b=>Math.min(a.box.right,b.box.right)-Math.max(a.box.x,b.box.x)>1&&Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.y,b.box.y)>1).map(b=>[a.text,b.text]));
     const auth=document.querySelector('#staffportal-auth-mount');
     const layout=document.querySelector('.sp-reference-layout');
     return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,cards,weather:w,detail:d,fields,overlaps,metrics:document.querySelectorAll('[data-weather-metric]').length,layout:box(layout),rows:getComputedStyle(layout).gridTemplateRows,auth:box(auth),authOverflow:auth.scrollHeight>auth.clientHeight+3,news:document.querySelector('[data-widget="news"]').textContent};
    });
    results.push(data);
    if(!baseline){
     assert.equal(data.metrics,6,'six Ibadan details');
     assert.equal(data.cards.length,7,'seven city cards');
     for(const card of data.cards){if(card.city!=='ibadan')assert.ok(card.clock.width>=83.9,'approved minimum global clock width: '+card.city);assert.ok(card.inside,card.city+' weather clipped '+JSON.stringify(card));for(const row of card.digital)assert.ok(row.inside,card.city+' clock metadata clipped '+JSON.stringify(row));}
     for(const field of data.fields)assert.ok(field.inside,'detail clipped '+JSON.stringify(field));
     assert.equal(data.overlaps.length,0,'weather readings overlap '+JSON.stringify(data.overlaps));
     assert.ok(data.scrollWidth<=width+2,'horizontal overflow');
     if(width>=1280)assert.ok(data.scrollHeight<=height+2,'desktop vertical overflow');
     // Auth has its own interaction/layout suite. Record its geometry here;
     // scrollHeight alone also reports inherited decorative overflow.
     assert.ok(data.news.includes('QA attributed source'),'attributed Nigeria headline');
     assert.equal(errors.length,0,'page errors '+errors.join(';'));
     assert.equal(await page.locator('[data-weather-metric="temperature"] dd').textContent(),'26°C','cached value must be replaced by live value');
     if(width===1363){
      const before={...calls};
      await page.evaluate(()=>{
       window.__weatherImageMoves=0;
       for(const layer of document.querySelectorAll('article[data-city-id] .gw-city-image-layer'))new MutationObserver(records=>{window.__weatherImageMoves+=records.filter(r=>r.type==='childList').length;}).observe(layer,{childList:true,subtree:true});
      });
      await page.evaluate(()=>{for(let i=0;i<10;i++){window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));}});
      await page.waitForTimeout(100);
      assert.deepEqual(calls,before,'focus/online requests throttled');
      change=1;
      await page.clock.fastForward(5*60*1000+1);
      await page.waitForFunction(()=>document.querySelector('[data-weather-metric="temperature"] dd')?.textContent==='27°C');
      assert.ok(Object.keys(cities).every(c=>calls[c]===before[c]+1),'one refresh per city');
      assert.equal(await page.evaluate(()=>window.__weatherImageMoves),0,'clock ticks must not detach and reload the city photographs');
      data.refreshPassed=true;
     }
    }
   }catch(e){error=String(e.stack||e);results.push({width,height,error,errors,calls});}
   if(error)console.log('FAIL '+width+'x'+height+' '+error.split('\n')[0]);else console.log((baseline?'BASELINE ':'PASS ')+width+'x'+height);
   if(!baseline&&[1363,1920,3840].includes(width))await page.screenshot({path:path.join(output,width+'x'+height+'.png'),fullPage:true});
   await page.close();
  }
  if(!baseline)for(const mode of ['saved','server-cache']){
   const page=await browser.newPage({viewport:{width:1363,height:936},reducedMotion:'reduce'});
   const payloads=Object.fromEntries(Object.keys(cities).map(city=>[city,{...fixture(city),providerStatus:'cached',fetchedAt:new Date(Date.now()-60*60*1000).toISOString(),cacheAgeSeconds:3600,description:'Light rain with thunderstorms'}]));
   if(mode==='saved')await page.addInitScript(data=>{for(const [city,payload] of Object.entries(data))localStorage.setItem('daenem:staffportal:signin-weather:'+city+':v1',JSON.stringify({savedAt:Date.now(),payload}));},payloads);
   await page.route('**/api/**',route=>{
    const u=new URL(route.request().url());
    const body=u.pathname==='/api/context/signin/weather'?payloads[u.searchParams.get('city')||'ibadan']:{};
    return route.fulfill({status:mode==='saved'?503:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   try{
    await page.goto(site+'/qa/signin/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelectorAll('.sp-live-weather-saved').length===7&&getComputedStyle(document.querySelector('.sp-root')).display==='grid'&&getComputedStyle(document.querySelector('[data-signin-weather-summary]')).display==='flex');
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(750);
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('article[data-city-id]')].flatMap(card=>{
     const c=card.getBoundingClientRect(),summary=card.querySelector('[data-signin-weather-summary]').getBoundingClientRect();
     const clock=card.querySelector('.gw-city-clock').getBoundingClientRect();
     const digital=[...card.querySelectorAll('.gw-city-digital > p')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
     const outside=[summary,clock,...digital].some(r=>r.x<c.x-1||r.right>c.right+1||r.y<c.y-1||r.bottom>c.bottom+1);
     const overlap=[clock,...digital].some(r=>Math.min(r.right,summary.right)-Math.max(r.x,summary.x)>1&&r.bottom>summary.y+1);
     const bounds=r=>({x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right});
     return outside||overlap?[{city:card.dataset.cityId,outside,overlap,card:bounds(c),summary:bounds(summary),clock:bounds(clock),digital:digital.map(bounds)}]:[];
    }));
    assert.deepEqual(overflow,[],'saved long conditions remain inside cards without overlap');
    assert.ok((await page.locator('.sp-weather-v145-footer').textContent()).includes('1 hr ago'));
    console.log('PASS '+mode+' visible age and long-condition layout');
   }catch(e){results.push({test:mode,error:String(e)});console.log('FAIL '+mode+' '+e.message);}
   await page.screenshot({path:path.join(output,mode+'.png'),fullPage:true});
   await page.close();
  }
  if(!baseline){
   const page=await browser.newPage({viewport:{width:1363,height:936},reducedMotion:'reduce'});
   await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'}));
   try{
    await page.goto(site+'/qa/signin/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-signin-weather-summary]')].length===7&&[...document.querySelectorAll('[data-signin-weather-summary]')].every(e=>e.textContent.includes('temporarily unavailable')));
    assert.equal(await page.locator('#staff-local-weather').getByText('Connecting to weather providers…').count(),0);
    assert.ok((await page.locator('[data-widget="news"]').textContent()).includes('temporarily unavailable'));
    assert.ok((await page.locator('[data-widget="intelligence"]').textContent()).includes('temporarily unavailable'));
    console.log('PASS unavailable weather/news and no permanent loading states');
   }catch(e){results.push({test:'unavailable',error:String(e)});console.log('FAIL unavailable '+e.message);}
   await page.close();
  }
 }finally{await browser.close();await server.close();}
 fs.writeFileSync(path.join(output,baseline?'baseline.json':'results.json'),JSON.stringify(results,null,2));
 const failures=results.filter(x=>x.error);
 console.log(JSON.stringify({baseline,viewports:screens.length,failures:failures.length,report:path.join(output,baseline?'baseline.json':'results.json')}));
 if(failures.length)process.exitCode=1;
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
