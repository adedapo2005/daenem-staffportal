/* Real Chrome regression: this test is local-only, API responses are mocked,
 * no employee credentials, no public writes, no production deployment. */
const { chromium }=require('playwright');
const { createServer }=require('vite');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const OUT=path.resolve('qa-artifacts/signin-weather-content-20261024');
const sizes=[[3840,2160],[1920,1080],[1366,768],[1280,720],[1024,768],[820,1180],[390,844]];
const locs={ibadan:'Ibadan, Oyo State',toronto:'Toronto, Canada',london:'London, United Kingdom',newyork:'New York, United States',moscow:'Moscow, Russia',tokyo:'Tokyo, Japan',beijing:'Beijing, China'};
const content={spotlight:{id:'daenem-editorial-day-24',title:'Make Every Handover Clear',body:'Record what changed, what is pending, and who owns the next action.',category:'Daily Practice'},inspiration:{id:'daenem-editorial-block-96',message:'Consistency gives good ideas the chance to become dependable results.',attribution:'DAENEM StaffPortal',category:'Employee Inspiration'},provider:'curated',providerConnected:false,contentMode:'scheduled_curated',intervalStartedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+6*3600000).toISOString()};
const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
(async()=>{fs.mkdirSync(OUT,{recursive:true});
 const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const results=[];
 try {
 for(const [w,h] of sizes) {
  const page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'});const exceptions=[];
  page.on('pageerror',e=>exceptions.push(e.message));
  await page.route('**/api/**',route=>{
   const u=new URL(route.request().url());let body={};
   if(u.pathname==='/api/auth/me')body={authenticated:false};
   else if(u.pathname==='/api/auth/password-policy')body={minimumLength:6,maximumLength:128,requiresUppercase:true,requiresLowercase:true,requiresNumber:true,requiresSymbol:true};
   else if(u.pathname==='/api/staff-content')body=content;
   else if(u.pathname==='/api/context/signin/widget-settings')body={widgets:{news:{autoScroll:false},intelligence:{},spotlight:{},inspiration:{}},contentAutomation:{intervalMinutes:10}};
   else if(u.pathname==='/api/context/signin/news')body={state:'partial',latest:[],intelligence:Object.fromEntries(['Security','Economy','Politics','Agriculture','Energy','Infrastructure'].map(d=>[d,[]])),sources:[],updated_at:new Date().toISOString()};
   else if(u.pathname==='/api/context/signin/weather'){
     const city=u.searchParams.get('city')||'ibadan';
     body={available:true,provider:city==='tokyo'||city==='beijing'?'Open-Meteo fallback':'Google Weather',providerStatus:'fresh',fetchedAt:new Date().toISOString(),observedAt:new Date().toISOString(),cacheAgeSeconds:0,unitsSystem:'METRIC',location:locs[city],temperature:city==='tokyo'?23:city==='beijing'?16:26,apparentTemperature:25,humidity:62,isDay:true,precipitationProbability:10,windSpeed:4,windDirection:125,windGust:8,today:{high:28,low:15},description:'Partly cloudy'};
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  try {
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:40000});
   await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor();
   await page.waitForFunction(()=>['tokyo','beijing'].every(id=>document.querySelector('[data-city-id="'+id+'"]')?.dataset.weatherDaylight),null,{timeout:14000});
   await page.waitForFunction(()=>document.querySelector('[data-widget="spotlight"]')?.dataset.contentConnection==='online',{timeout:14000});
   const clock=await page.evaluate(()=>{
     const card=document.querySelector('#staff-local-weather [data-city-id="ibadan"]');
     const c=card.querySelector('.gw-city-clock'),p=[...card.querySelectorAll('.gw-city-digital > p')];
     const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom}};
     return {clock:rect(c),lines:p.map(e=>({text:e.textContent.trim(),rect:rect(e)})),className:card.className};
   });
   if(w<2560) assert.match(clock.lines[1].text,/^[A-Z][a-z]{2},\s+[A-Z][a-z]{2}\s+\d{1,2}/,'weekday and calendar date stay together');
   assert.ok(clock.clock.right<=clock.lines[0].rect.x+2,'clock and digital time occupy separate columns');
   for(const city of ['tokyo','beijing']){
     const card=page.locator('[data-city-id="'+city+'"]');
     assert.equal(await card.locator('[data-signin-weather-summary]').count(),1,'one live weather summary for '+city);
     assert.ok(!(await card.innerText()).includes('Weather temporarily unavailable'),'valid city forecast renders for '+city);
   }
   for(const type of ['spotlight','inspiration']){
     const card=page.locator('[data-widget="'+type+'"]');
     assert.equal(await card.getAttribute('data-content-connection'),'online','backend-connected '+type);
     assert.equal(await card.getAttribute('data-content-mode'),'scheduled_curated','truthful curated schedule '+type);
     assert.match(await card.locator('.gw-state-badge').innerText(),/connected/i,'visible service state '+type);
   }
   await page.locator('#staffportal-auth-mount .sp-auth-tabs button').nth(1).click();
   await page.locator('#staffportal-auth-mount.sp-auth-mode-create').waitFor();
   const geometry=await page.locator('#staffportal-auth-mount .usp-auth-form .usp-primary-button').first().evaluate(btn=>{
     const arrow=btn.querySelector('svg');
     const text=[...btn.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
     if(!arrow||!text)return {error:'missing text or arrow'};
     const range=document.createRange();range.selectNodeContents(text);
     const b=btn.getBoundingClientRect(),t=range.getBoundingClientRect(),a=arrow.getBoundingClientRect();
     const cs=getComputedStyle(btn);
     return {gap:+(a.left-t.right).toFixed(1),offset:+((t.left+a.right)/2-(b.left+b.right)/2).toFixed(1),
       arrowInside:a.right<=b.right&&a.left>=b.left,textInside:t.left>=b.left&&t.right<=b.right,
       flex:cs.display,width:b.width,text:text.textContent.trim()};
   });
   assert.equal(geometry.error,undefined,'Continue button text and arrow exist');
   assert.ok(geometry.gap>=3&&geometry.gap<=16,'Continue arrow immediately follows text: '+JSON.stringify(geometry));
   assert.ok(Math.abs(geometry.offset)<=8,'Continue label and arrow centered as one group: '+JSON.stringify(geometry));
   assert.ok(geometry.arrowInside&&geometry.textInside,'Continue group stays inside button');
   assert.equal(exceptions.length,0,'no client JS exceptions');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'no horizontal overflow');
   if([3840,1366,390].includes(w)){
     await page.locator('#staffportal-auth-mount').screenshot({path:path.join(OUT,'create-'+w+'.jpg'),type:'jpeg',quality:72});
     await page.locator('#staff-local-weather').screenshot({path:path.join(OUT,'ibadan-'+w+'.jpg'),type:'jpeg',quality:72});
     await page.locator('[data-widget="spotlight"]').screenshot({path:path.join(OUT,'spotlight-'+w+'.jpg'),type:'jpeg',quality:72});
   }
   console.log('PASS '+w+'x'+h+' city data, content state, Ibadan date, Continue group '+JSON.stringify({geometry,ibadan:clock.lines.map(x=>x.text)}));
   results.push({viewport:w+'x'+h,ok:true,clock,geometry,errors:exceptions});
  } catch(e){console.error('FAIL '+w+'x'+h+' '+e.message);results.push({viewport:w+'x'+h,ok:false,error:String(e),errors:exceptions});}
  finally{await page.close()}
 }
 } finally {await browser.close();await server.close();}
 fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({results},null,2));
 const passed=results.filter(r=>r.ok).length;
 console.log('TARGETED_VISUAL_SUMMARY '+passed+'/'+results.length);
 if(passed!==results.length)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});