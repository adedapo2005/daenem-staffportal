import { chromium } from 'playwright';
import fs from 'node:fs';
const sizes=[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const b=await chromium.launch({headless:true});
const results=[];
for(const [w,h] of sizes){
 const p=await b.newPage({viewport:{width:w,height:h},reducedMotion:'reduce',colorScheme:'light'});
 const errors=[]; p.on('pageerror',e=>errors.push(String(e))); p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});
 await p.goto('http://127.0.0.1:4180/__canonical_baseline?layout=master-detail-workspace',{waitUntil:'domcontentloaded'});
 await p.locator('[data-canonical-staffportal-dashboard]').waitFor({state:'visible',timeout:20000});
 const mobile=w<=767;
 const rows=p.locator('.csp-record-list-scroll>button');
 if(await rows.count()>1){ await rows.nth(1).click(); await p.waitForTimeout(80); }
 const m=await p.evaluate(()=>{const q=s=>document.querySelector(s); const box=s=>{const e=q(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};return {title:q('.csp-record-identity h2')?.textContent||'',listDisplay:q('[data-zone-shell=master-list]')?getComputedStyle(q('[data-zone-shell=master-list]')).display:null,detailDisplay:q('[data-zone-shell=master-detail]')?getComputedStyle(q('[data-zone-shell=master-detail]')).display:null,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,list:box('.csp-record-list'),detail:box('.csp-record-workspace'),detailScroll:q('.csp-record-workspace')?{client:q('.csp-record-workspace').clientHeight,scroll:q('.csp-record-workspace').scrollHeight}:null,under9:[...document.querySelectorAll('.csp-layout-master-detail-workspace *')].filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<9).length};});
 const file=`qa-artifacts/canonical-postauth-v1/record-qa-${w}x${h}.png`; await p.screenshot({path:file,fullPage:false});
 results.push({viewport:`${w}x${h}`,mobile,...m,errors}); await p.close();
}
await b.close();fs.writeFileSync('qa-artifacts/canonical-postauth-v1/record-interaction-targeted-qa.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
