/* Read-only geometry audit for Sign-In panel. Fake API data; no credentials. */
const {chromium}=require('playwright');
const {createServer}=require('vite');
const fs=require('node:fs'),path=require('node:path');
const screens=[[1280,720],[1366,768],[1680,900],[1680,1050],[1920,1080],[2560,1440],[3840,2160]];
async function main(){
 const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true});
 let results=[];const out=path.resolve('.weather-content-qa');fs.mkdirSync(out,{recursive:true});
 try{
 for(const [width,height] of screens){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());let body={};if(u.pathname==='/api/auth/me')body={authenticated:false};
 if(u.pathname==='/api/context/signin/weather')body={available:true,provider:'Google Weather',providerStatus:'fresh',fetchedAt:new Date().toISOString(),unitsSystem:'METRIC',temperature:25,apparentTemperature:26,humidity:74,precipitationProbability:10,windSpeed:5,windDirection:157,windGust:8,today:{high:28,low:20},description:'Clear'};
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor({timeout:15000});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sp-root')).display==='grid',{timeout:20000});
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);
 const data=await page.evaluate(()=>{
 const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1)};};
 const target=document.querySelector('#staffportal-auth-mount');
 const card=target.closest('.sp-auth-card')||target;
 const rail=target.closest('.sp-lower-right-rail');
 const sels=['.sp-auth-topline','.sp-auth-logo-v101','.sp-auth-copy','.sp-auth-tabs','.sp-auth-form','.sp-auth-fields','.sp-auth-provider-list','.sp-social-grid','.sp-social-button','.sp-auth-divider','.sp-auth-policy','.sp-primary-button','.sp-auth-actions','.sp-auth-button','.sp-auth-remember','.sp-auth-footer','.usp-auth-panel'];
 const named=sels.map(s=>({sel:s,rect:rect(card.querySelector(s)),height:card.querySelector(s)?.scrollHeight??null})).filter(e=>e.rect);
 const controls=[...card.querySelectorAll('button,input,a')].filter(e=>{let r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'}).map(e=>({el:e.tagName,cls:String(e.className||'').slice(0,85),label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,42)||e.getAttribute('placeholder')||'',rect:rect(e)}));
 const cardRect=rect(card),visibleBottom=cardRect.bottom-3;
 return {w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,card:cardRect,cardScroll:card.scrollHeight,cardClient:card.clientHeight,rail:rect(rail),mount:rect(target),mountScroll:target.scrollHeight,mountClient:target.clientHeight,named,controls,cut:controls.filter(e=>e.rect.bottom>visibleBottom+1||e.rect.right>cardRect.right+1),root:rect(document.querySelector('.sp-root')),global:rect(document.querySelector('#staff-global-operations'))};
 });
 results.push(data);
 const required=['Microsoft','Google','WhatsApp','Terms & Conditions','Privacy Policy'];
 const missing=required.filter(label=>!data.controls.some(c=>c.label===label));
 if(data.cut.length||missing.length||data.cardScroll>data.cardClient+2||data.scrollW>width+2) throw new Error('Sign-In full-fit regression '+width+'x'+height+' '+JSON.stringify({cut:data.cut.map(c=>c.label),missing,scroll:data.cardScroll+'/'+data.cardClient,scrollW:data.scrollW}));
 console.log('PASS AUTH FULL FIT '+width+'x'+height+' '+data.controls.length+' controls');
 if([1645,1680,1920,3840].includes(width))await page.screenshot({path:path.join(out,'auth-fit-'+width+'x'+height+'.png'),fullPage:true});
 await page.close();
 }
 }finally{await browser.close();await server.close();}
 fs.writeFileSync(path.join(out,'auth-fit-geometry.json'),JSON.stringify(results,null,2));
 console.log('REPORT '+path.join(out,'auth-fit-geometry.json'));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
