const { chromium } = require('playwright');
const { createServer } = require('vite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const useLocal = process.env.QA_LOCAL === '1';
const widths = process.env.QA_SCREENS ? process.env.QA_SCREENS.split(',').map(Number) : [3840,1920,1366,1280,1024,820,390];
const heights = {3840:2160,1920:1080,1366:768,1280:720,1024:768,820:1180,390:844};
const out = path.resolve('qa-artifacts/ibadan-clock-precision-' + (useLocal ? 'local' : 'live') + (process.env.QA_MOCK_TIME ? '-day' : ''));
const box = e => {
  const r=e.getBoundingClientRect();
  return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),
    right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1),cy:+((r.y+r.bottom)/2).toFixed(1)};
};
(async () => {
  fs.mkdirSync(out,{recursive:true});
  let server;
  if(useLocal) {
    server=await createServer({configFile:'vite.signin-browser-qa.config.ts',
      server:{host:'127.0.0.1',port:0},logLevel:'error'});
    await server.listen();
  }
  const base=useLocal ? 'http://127.0.0.1:' + server.httpServer.address().port + '/qa/signin/index.html'
    : 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev/';
  const browser=await chromium.launch({headless:true,
    executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const rows=[];
  try {
    for(const w of widths) {
      const h=heights[w] || 768;
      const page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      if(process.env.QA_MOCK_TIME) await page.clock.install({time:new Date(process.env.QA_MOCK_TIME)});
      if(useLocal) await page.route('**/api/**',route=>{
        const u=new URL(route.request().url());
        let data={};
        if(u.pathname==='/api/auth/me')data={authenticated:false};
        if(u.pathname==='/api/context/signin/weather')data={available:true,provider:'Google Weather',
          providerStatus:'fresh',fetchedAt:new Date().toISOString(),cacheAgeSeconds:0,
          unitsSystem:'METRIC',location:'Ibadan',temperature:27,apparentTemperature:28,
          humidity:61,today:{high:29,low:22},description:'Partly cloudy',isDay:false};
        if(u.pathname==='/api/staff-content')data={spotlight:{id:'owner-note',title:'Daily Note',body:'Do the next thing clearly.',category:'Guidance'},
          inspiration:{id:'owner-quote',message:'Be dependable',category:'Guidance',attribution:'Staff Team'},
          provider:'curated',providerConnected:false,expiresAt:new Date(Date.now()+600000).toISOString()};
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      });
      try {
        await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForFunction(()=>{
          const el=document.querySelector('#staff-local-weather [data-city-id="ibadan"] .gw-city-local-time');
          return el && el.textContent && el.textContent.includes(':') && !el.textContent.includes('1:00:00 AM');
        },null,{timeout:20000});
        await page.evaluate(()=>document.fonts.ready);
        await page.waitForTimeout(300);
        const data=await page.evaluate(()=>{
          const box = e => {const r=e.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),
            w:+r.width.toFixed(1),h:+r.height.toFixed(1),right:+r.right.toFixed(1),
            bottom:+r.bottom.toFixed(1),cy:+((r.y+r.bottom)/2).toFixed(1)};};
          const card=document.querySelector('#staff-local-weather [data-city-id="ibadan"]');
          const dial=card.querySelector('.gw-city-clock');
          const svg=dial.querySelector('svg');
          const inst=card.querySelector('.gw-city-instrument');
          const digital=card.querySelector('.gw-city-digital');
          const ps=[...card.querySelectorAll('.gw-city-digital > p')];
          const rangeRect=e=>{
            const range=document.createRange();
            range.selectNodeContents(e);
            return box(range);
          };
          const lines=ps.map(e=>({text:e.textContent.trim(),element:box(e),glyphs:rangeRect(e),
            font:getComputedStyle(e).fontSize,align:getComputedStyle(e).textAlign}));
          const fullStack = Math.abs(lines[3].glyphs.x-lines[0].glyphs.x)<=3;
          const textBounds=lines.slice(0,fullStack?4:3).map(x=>x.glyphs).filter(x=>x.w>0);
          const centerY=(Math.min(...textBounds.map(x=>x.y))+Math.max(...textBounds.map(x=>x.bottom)))/2;
          const rDial=box(svg),rInst=box(inst);
          const transforms=[...svg.querySelectorAll('g[transform^="rotate("]')].slice(-3).map(e=>e.getAttribute('transform'));
          const dateGaps=[0,1].map(i=>+(lines[i+1].glyphs.y-lines[i].glyphs.bottom).toFixed(1));
          return {viewport:[innerWidth,innerHeight],card:box(card),instrument:rInst,dial:rDial,
            timezoneInTextStack:fullStack,dateGaps,
            dialGroup:box(dial),digital:box(digital),display:getComputedStyle(digital).display,
            grid:getComputedStyle(inst).gridTemplateColumns,gridRows:getComputedStyle(inst).gridTemplateRows,
            lines,clockToTextCenterDelta:+(rDial.cy-centerY).toFixed(1),transforms,
            documentScrollWidth:document.documentElement.scrollWidth};
        });
        if(useLocal) {
          assert.equal(data.display,'flex','digital labels must form a single readable flex column');
          assert.ok(Math.abs(data.clockToTextCenterDelta)<=4,'analog and digital groups must be centered together: '+w+' '+data.clockToTextCenterDelta);
          assert.ok(data.dateGaps.every(gap=>gap>=0 && gap<=12),'compact date lines must not overlap or stretch: '+w+' '+JSON.stringify(data.dateGaps));
          assert.ok(data.lines[0].glyphs.x>=data.dial.right+3,'digital time must not overlap clock: '+w);
          assert.ok(data.lines.every(line=>line.glyphs.right<=data.card.right+2 && line.glyphs.bottom<=data.card.bottom+2),'clock labels remain within card: '+w);
          assert.ok(data.documentScrollWidth<=w+2,'page must not overflow horizontally: '+w);
          const match=data.lines[0].text.match(/^(\d+):(\d+):(\d+)\s*(AM|PM)$/);
          assert.ok(match,'digital clock has time with seconds: '+w);
          const hour=Number(match[1])%12,minute=Number(match[2]),second=Number(match[3]);
          const angles=data.transforms.map(t=>Number((t||'').match(/rotate\(([\d.]+)/)?.[1]));
          assert.ok(Math.abs(angles[0]-(hour*30+minute*.5))<1 && Math.abs(angles[1]-(minute*6+second*.1))<1 && Math.abs(angles[2]-(second*6))<1,'analog hands match digital time: '+w);
          assert.equal(errors.length,0,'no runtime JS exceptions: '+w);
        }
        await page.locator('#staff-local-weather').screenshot({path:path.join(out,'ibadan-'+w+'.png'),timeout:30000});
        console.log('GEOMETRY '+w+' '+JSON.stringify({delta:data.clockToTextCenterDelta,gaps:data.dateGaps,timezoneInStack:data.timezoneInTextStack,
          dial:data.dial,dates:data.lines.map(x=>({text:x.text,glyphs:x.glyphs})),grid:data.grid,gridRows:data.gridRows,
          transforms:data.transforms,errors}));
        rows.push({ok:true,...data,errors});
      } catch(e) {
        console.log('ERROR '+w+' '+e.message);
        rows.push({viewport:[w,h],ok:false,error:String(e),errors});
      } finally {await page.close();}
    }
  } finally {await browser.close();if(server)await server.close();}
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));
  console.log('REPORT '+path.join(out,'results.json')+' '+rows.filter(x=>x.ok).length+'/'+rows.length);
  if(rows.some(x=>!x.ok))process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});