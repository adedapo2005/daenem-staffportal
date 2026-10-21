/* Isolated weather-provider outage visual/geometry acceptance, no live credentials. */
const {chromium}=require('playwright');const{createServer}=require('vite');const fs=require('node:fs');const path=require('node:path');
const screens=[[1280,720],[1366,768],[1440,900],[1600,900],[1680,900],[1680,1050],[1920,1080],[2560,1440],[3840,2160]];
(async()=>{
 const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true});const out=path.resolve('.weather-content-qa');fs.mkdirSync(out,{recursive:true});const results=[];
 try{for(const [width,height] of screens){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
 await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Provider unavailable'})}));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>[...document.querySelectorAll('#staff-global-operations article[data-city-id]')].length===6&&[...document.querySelectorAll('#staff-global-operations [data-signin-weather-summary]')].every(e=>e.textContent.includes('temporarily unavailable')),{timeout:15000});
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(450);
 const result=await page.evaluate(()=>{
 const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
 const intersect=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
 const inside=(parent,child)=>child&&parent&&child.x>=parent.x-3&&child.y>=parent.y-3&&child.right<=parent.right+3&&child.bottom<=parent.bottom+3;
 const cards=[...document.querySelectorAll('#staff-global-operations article[data-city-id]')].map(el=>{
  const summary=el.querySelector('[data-signin-weather-summary]');const sc=rect(summary),card=rect(el);
  const range=document.createRange();range.selectNodeContents(summary);const text=rect(range);
  const clock=rect(el.querySelector('.gw-city-clock'));
  const digital=[...el.querySelectorAll('.gw-city-digital > p')].filter(e=>e.getClientRects().length).map(rect);
  return {city:el.dataset.cityId,card,summary:sc,text,clock,textInside:inside(sc,text),inside:inside(card,sc),clockOverlap:intersect(text,clock),digitalOverlap:digital.some(d=>intersect(text,d)),summaryFont:getComputedStyle(summary).fontSize,summaryBackground:getComputedStyle(summary).backgroundImage,summaryText:summary.textContent,metricCount:el.querySelectorAll('.sp-global-weather-details').length};
 });
 return {width:innerWidth,height:innerHeight,documentScroll:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,cards};
 });
 results.push(result);
 const errors=result.cards.filter(c=>!c.inside||!c.textInside||c.clockOverlap||c.digitalOverlap||c.metricCount||c.summaryText!=='Weather temporarily unavailable');
 console.log((errors.length?'FAIL ':'PASS ')+width+'x'+height+' '+JSON.stringify(errors.map(x=>({city:x.city,inside:x.inside,textInside:x.textInside,clockOverlap:x.clockOverlap,digitalOverlap:x.digitalOverlap,metricCount:x.metricCount,card:x.card,summary:x.summary,text:x.text}))));
 if([1280,1680,1920,3840].includes(width)&&height!==1050)await page.screenshot({path:path.join(out,'weather-outage-'+width+'x'+height+'.png'),fullPage:false});
 await page.close();
 }
 }finally{await browser.close();await server.close();}
 fs.writeFileSync(path.join(out,'weather-outage-geometry.json'),JSON.stringify(results,null,2));
 const fails=results.flatMap(r=>r.cards.filter(c=>!c.inside||!c.textInside||c.clockOverlap||c.digitalOverlap||c.metricCount)).length;
 console.log(JSON.stringify({checkedViewports:results.length,failures:fails,output:path.join(out,'weather-outage-geometry.json')}));if(fails)process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
