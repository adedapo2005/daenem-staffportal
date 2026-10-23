')[0]);else console.log((baseline?'BASELINE ':'PASS ')+width+'x'+height);
   if(!baseline&&[1363,1920,3840].includes(width))await page.screenshot({timeout:30000,path:path.join(output,width+'x'+height+'.png'),fullPage:true});
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
    await page.waitForFunction(()=>document.querySelectorAll('.sp-live-weather-condition').length===7&&document.querySelectorAll('.sp-live-weather-freshness').length===7&&getComputedStyle(document.querySelector('.sp-root')).display==='grid'&&getComputedStyle(document.querySelector('[data-signin-weather-summary]')).display==='flex');
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(750);
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('article[data-city-id]')].flatMap(card=>{
     const c=card.getBoundingClientRect(),summary=card.querySelector('[data-signin-weather-summary]').getBoundingClientRect();
     const clock=card.querySelector('.gw-city-clock').getBoundingClientRect();
     const digital=[...card.querySelectorAll('.gw-city-digital > p')].filter(e=>e.getClientRects().length).map(e=>{const range=document.createRange();range.selectNodeContents(e);return range.getBoundingClientRect()});
     const outside=[summary,clock,...digital].some(r=>r.x<c.x-1||r.right>c.right+1||r.y<c.y-1||r.bottom>c.bottom+1);
     const overlap=[clock,...digital].some(r=>Math.min(r.right,summary.right)-Math.max(r.x,summary.x)>1&&r.bottom>summary.y+1);
     const bounds=r=>({x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right});
     return outside||overlap?[{city:card.dataset.cityId,outside,overlap,card:bounds(c),summary:bounds(summary),clock:bounds(clock),digital:digital.map(bounds)}]:[];
    }));
    assert.deepEqual(overflow,[],'saved long conditions remain inside cards without overlap');
    assert.ok((await page.locator('.sp-weather-v145-footer').textContent()).includes('1 hr ago'));
    assert.equal(await page.locator('.sp-live-weather-saved').count(),0,'cached state is not repeated as a fake weather condition');
    const summaries=await page.locator('[data-signin-weather-summary]').allTextContents();
    assert.ok(summaries.every(text=>!text.includes('Saved')&&text.includes('Cached')&&text.includes('Light rain with thunderstorms')),'cached condition and freshness are clearly labeled');
    console.log('PASS '+mode+' cached age, canonical condition and long-condition layout');
   }catch(e){results.push({test:mode,error:String(e)});console.log('FAIL '+mode+' '+e.message);}
   await page.screenshot({timeout:30000,path:path.join(output,mode+'.png'),fullPage:true});
   await page.close();
  }
  if(!baseline){
   const page=await browser.newPage({viewport:{width:1363,height:936},reducedMotion:'reduce'});
   await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Unavailable"}'}));
   try{
    await page.goto(site+'/qa/signin/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-signin-weather-summary]')].length===7&&[...document.querySelectorAll('[data-signin-weather-summary]')].every(e=>e.textContent.includes('temporarily unavailable')));
    assert.equal(await page.locator('#staff-local-weather').getByText('Connecting to weather providersâ€¦').count(),0);
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
\n