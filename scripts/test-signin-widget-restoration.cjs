/* Exercise the real Sign-In markup and runtime; all public data is isolated.
 * No employee session, provider send, database write or deployment. */
const { chromium } = require('playwright');
const { createServer } = require('vite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const domains = ['Security','Economy','Politics','Agriculture','Energy','Infrastructure'];
const cities = { ibadan:['Ibadan','Thunderstorms',false,'storm'], toronto:['Toronto','Clear',false,'clear'], london:['London','Light rain',false,'light_rain'], newyork:['New York','Partly cloudy',false,'partly'], moscow:['Moscow','Snow showers',false,'snow'], tokyo:['Tokyo','Overcast',true,'overcast'], beijing:['Beijing','Fog',true,'fog'] };
const item = (id, source='QA Daily', title='Nigerian businesses expand local training programmes') => ({ id, title, source, link:`https://example.org/${id}`, published:new Date(Date.now()-60_000).toISOString(), summary:'Local teams are sharing practical updates and reviewing the next steps together.', categories:'Nigeria' });
const feed = () => ({ state:'partial', latest:[item('one'),item('two','QA Report','Nigeria reviews infrastructure delivery and regional transport links'),item('three','QA Wire','Agriculture and energy teams publish their latest operational updates')], intelligence:Object.fromEntries(domains.map((domain,index)=>[domain,[item(domain,'QA Intelligence',`${domain} reporting update for Nigeria`),item(domain+'2','QA Review',`${domain} second attributed report`)]])), sources:[{name:'QA Daily'},{name:'QA Report'},{name:'QA Wire'}] });
const output = path.resolve('.targeted-signin-qa');
async function run() {
  fs.mkdirSync(output,{recursive:true});
  const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
  await server.listen();
  const url='http://127.0.0.1:'+server.httpServer.address().port+'/qa/signin/index.html';
  const browser=await chromium.launch({headless:true});
  let checks=0;
  const check=(value,message)=>{assert.ok(value,message);checks++;};
  try {
    const page=await browser.newPage({viewport:{width:1363,height:936},reducedMotion:'no-preference'});
    await page.clock.install();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const calls={};let version=1, weatherDescription=null, newsFailed=false, settingsOverride={};
    await page.route('**/api/**',async route=>{
      const browserNow=await page.evaluate(()=>Date.now());
      const u=new URL(route.request().url()); calls[u.pathname]=(calls[u.pathname]||0)+1;
      let body={};let status=200;
      if(u.pathname==='/api/auth/me')body={authenticated:false};
      if(u.pathname==='/api/context/signin/news'){body=feed();if(newsFailed)status=503;}
      if(u.pathname==='/api/context/signin/widget-settings')body={widgets:{news:{scrollBehavior:'vertical_continuous',autoScroll:true,rotationSeconds:60,wireEnabled:true,tickerSpeed:'standard',tickerDirection:'left',tickerPauseOnHover:true,showSummary:true,...settingsOverride},intelligence:{cycleSeconds:30},spotlight:{cycleSeconds:30},inspiration:{cycleSeconds:30}},contentAutomation:{intervalMinutes:10}};
      if(u.pathname==='/api/staff-content')body={spotlight:{id:'spotlight-'+version,title:'Service-backed daily spotlight '+version,body:'Clear information and coordinated decisions help every operation keep moving.',category:'Daily Practice'},inspiration:{id:'inspiration-'+version,message:'Service-backed employee inspiration '+version,attribution:'DAENEM Staff Team',category:'Professional Growth'},provider:'curated',providerConnected:false,intervalStartedAt:new Date(browserNow).toISOString(),expiresAt:new Date(browserNow+10*60_000).toISOString()};
      if(u.pathname==='/api/context/signin/weather'){
        const city=u.searchParams.get('city')||'ibadan', data=cities[city];
        body={available:true,provider:'Google Weather',providerStatus:city==='toronto'?'cached':'fresh',fetchedAt:new Date(browserNow).toISOString(),cacheAgeSeconds:0,unitsSystem:'METRIC',location:data[0],temperature:26,apparentTemperature:28,humidity:95,precipitationProbability:70,windSpeed:5,windDirection:157,windGust:8,today:{high:33,low:24},description:weatherDescription??data[1],isDay:data[2]};
      }
      return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('.gw-news-ticker').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.sp-live-weather-visual').length===7&&document.querySelector('[data-widget="spotlight"]')?.dataset.contentId==='spotlight-1');
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(()=>[...document.querySelectorAll('#staff-primary-information > article .gw-primary-photo img')].every(img=>img.complete&&img.naturalWidth>0),null,{timeout:15000});
    const geometry=await page.evaluate(()=>{
      const bounds=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
      const cards=[...document.querySelectorAll('#staff-primary-information > article')].map(card=>({widget:card.dataset.widget,rect:bounds(card),image:card.querySelector('.gw-primary-photo img')?.getAttribute('src'),overlay:getComputedStyle(card.querySelector('.gw-primary-scrim')).backgroundImage}));
      const ticker=document.querySelector('.gw-news-ticker'), raw=document.querySelector('.sp-connected-news');
      const clocks=[...document.querySelectorAll('#staff-global-operations .gw-city-clock > svg')].map(e=>bounds(e));
      const layers=[...document.querySelectorAll('article[data-city-id] .gw-city-atmosphere')].map(e=>({rect:bounds(e),position:getComputedStyle(e).position,events:getComputedStyle(e).pointerEvents}));
      const cityImages=[...document.querySelectorAll('article[data-city-id] .gw-city-image-layer img')].map(img=>({city:img.closest('article').dataset.cityId,src:img.getAttribute('src'),width:img.naturalWidth,rect:bounds(img),ancestors:[img,img.parentElement,img.parentElement.parentElement].map(e=>({tag:e.tagName,cls:e.className,rect:bounds(e),display:getComputedStyle(e).display,opacity:getComputedStyle(e).opacity,visibility:getComputedStyle(e).visibility}))}));
      return{cards,clocks,layers,cityImages,ticker:bounds(ticker),news:bounds(raw),auth:bounds(document.querySelector('#staffportal-auth-mount'))};
    });
    await page.screenshot({path:path.join(output,'widget-restoration.png'),fullPage:true});
    fs.writeFileSync(path.join(output,'widget-geometry.json'),JSON.stringify(geometry,null,2));
    check(geometry.cards.map(card=>card.widget).join(',')==='news,intelligence,spotlight,inspiration','the four approved cards and order');
    check(JSON.stringify(geometry.cards.map(card=>card.image))===JSON.stringify(['/assets/left-widgets/news/04-day.webp','/assets/left-widgets/intelligence/05-day.webp','/assets/left-widgets/spotlight/01-day.webp','/assets/left-widgets/inspiration/02-day.webp']),'all four original photos remain');
    check(geometry.clocks.length===6&&geometry.clocks.every(clock=>clock.width>=83.9),'global dials restored to at least 84px');
    check(geometry.layers.length===7&&geometry.layers.every(layer=>layer.position==='absolute'&&layer.rect.width>150&&layer.rect.height>70&&layer.events==='none'),'weather atmosphere covers every card without intercepting input');
    check(geometry.news.bottom<=geometry.ticker.y+1,'news content reserves space above ticker');
    check(await page.locator('.gw-news-ticker .gw-marquee a').count()===6,'ticker includes three sources twice');
    check(await page.locator('.gw-intel-domain-index > [data-active="true"]').count()===6,'all reporting intelligence domains active');
    check((await page.locator('.gw-intel-domain-index small').allTextContents()).every(count=>count==='2'),'six real domain counts');
    check(await page.locator('[data-widget="intelligence"] .animate-pulse').count()===0,'intelligence loading dot removed');
    check((await page.locator('[data-widget="spotlight"] .gw-state-badge').textContent()).includes('Curated'),'curated content truth preserved');
    check((await page.locator('[data-widget="inspiration"] .gw-inspiration-quote').textContent()).includes('inspiration 1'),'inspiration comes from content service');
    const visuals=await page.evaluate(()=>[...document.querySelectorAll('article[data-city-id]')].map(card=>({id:card.dataset.cityId,code:card.dataset.weatherCode,day:card.querySelector('.sp-live-weather-visual')?.dataset.daylight,animation:card.querySelector('.sp-live-weather-visual svg').getAnimations({subtree:true}).some(animation=>animation.playState==='running'&&Number(animation.effect.getTiming().duration)>0),playback:card.querySelector('.sp-live-weather-visual svg').getAnimations({subtree:true}).find(animation=>animation.playState==='running')?.currentTime})));
    for(const visual of visuals){check(visual.code===cities[visual.id][3],visual.id+' correct weather condition');check(visual.animation,visual.id+' has actual animated artwork');}
    check(visuals.find(v=>v.id==='toronto').day==='night','cached Google daylight flag selects the moon');
    const transform=await page.locator('.gw-marquee').evaluate(e=>getComputedStyle(e).transform);
    await page.waitForTimeout(350);
    check(await page.locator('.gw-marquee').evaluate(e=>getComputedStyle(e).transform)!==transform,'Live Wire actually moves');
    const playback=await page.evaluate(()=>[...document.querySelectorAll('article[data-city-id]')].map(card=>({id:card.dataset.cityId,time:card.querySelector('.sp-live-weather-visual svg').getAnimations({subtree:true}).find(animation=>animation.playState==='running')?.currentTime})));
    check(playback.every(sample=>sample.time>visuals.find(v=>v.id===sample.id).playback),'all seven weather animations advance in time');
    await page.getByRole('button',{name:'Pause Live Wire ticker',exact:true}).click();
    await page.mouse.move(900,40);
    check(await page.locator('.gw-marquee').evaluate(e=>getComputedStyle(e).animationPlayState)==='paused','explicit pause works');
    await page.getByRole('button',{name:'Resume Live Wire ticker',exact:true}).click();
    await page.getByRole('button',{name:'Pause Live Wire ticker',exact:true}).press('Tab');
    await page.mouse.move(900,40);
    check(await page.locator('.gw-marquee').evaluate(e=>getComputedStyle(e).animationPlayState)==='running','resume returns to scrolling');
    await page.locator('.gw-news-ticker').hover();
    check(await page.locator('.gw-marquee').evaluate(e=>getComputedStyle(e).animationPlayState)==='paused','hover pause works');
    await page.mouse.move(900,40);
    await page.locator('.sp-hero').click({position:{x:20,y:20}});
    const initialStory=await page.locator('.gw-news-feature-title').textContent();
    await page.clock.fastForward(61_000);
    check(await page.locator('.gw-news-feature-title').textContent()!==initialStory,'lead headlines rotate');
    check(!(await page.locator('.gw-intel-domain-kicker').textContent()).startsWith('Security'),'intelligence cycles through domains');
    const beforeFocus={...calls};
    await page.evaluate(()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event('focus'));});
    check(JSON.stringify(calls)===JSON.stringify(beforeFocus),'focus does not repeatedly refetch content');
    version=2;
    await page.clock.fastForward(10*60_000);
    await page.waitForFunction(()=>document.querySelector('[data-widget="spotlight"]')?.dataset.contentId==='spotlight-2');
    check((await page.locator('.gw-inspiration-quote').textContent()).includes('inspiration 2'),'both staff widgets refresh from existing service');
    await page.emulateMedia({reducedMotion:'reduce'});
    check(await page.locator('.gw-marquee').evaluate(e=>getComputedStyle(e).animationName)==='none','reduced motion stops ticker');
    check(await page.locator('article[data-city-id][data-motion-resolved="off"]').count()===7,'reduced motion stops all seven weather visuals');
    const reducedStory=await page.locator('.gw-news-feature-title').textContent();
    await page.clock.fastForward(61_000);
    check(await page.locator('.gw-news-feature-title').textContent()===reducedStory,'reduced motion stops automatic story replacement');
    await page.emulateMedia({reducedMotion:'no-preference'});
    check(await page.locator('article[data-city-id][data-motion-resolved="subtle"]').count()===7,'motion resumes when preference returns');
    await page.locator('.gw-news-ticker-viewport').focus();
    await page.clock.fastForward(15*60_000);
    await page.waitForFunction(()=>document.activeElement?.className!=='gw-news-ticker-viewport');
    await page.mouse.move(900,40);
    check(await page.locator('.gw-marquee').evaluate(e=>getComputedStyle(e).animationPlayState)==='running','a replaced focused ticker does not stay stuck paused');
    weatherDescription='Unclear';
    await page.clock.fastForward(5*60_000);
    await page.waitForFunction(()=>document.querySelectorAll('article[data-city-id][data-weather-code="unknown"]').length===7);
    check(await page.locator('article[data-city-id][data-motion-resolved="off"]').count()===7,'unknown conditions do not invent sunshine or motion');
    newsFailed=true;
    await page.clock.fastForward(15*60_000);
    await page.waitForFunction(()=>document.querySelector('[data-widget="news"]')?.dataset.feedState==='saved');
    check(await page.locator('.gw-news-ticker').count()===1&&await page.locator('.gw-news-feature-title').count()===1,'failed refresh keeps usable news and ticker');
    check(errors.length===0,'no page errors: '+errors.join(';'));
    fs.writeFileSync(path.join(output,'widget-restoration.json'),JSON.stringify({checks,geometry,visuals,calls,errors},null,2));
    await page.close();
    console.log(`PASS ${checks} Sign-In widget/clock/animation behaviour checks`);
  } finally { await browser.close(); await server.close(); }
}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
