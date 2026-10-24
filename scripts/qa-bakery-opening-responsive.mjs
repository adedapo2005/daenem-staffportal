// Isolated responsive UI acceptance with synthetic figures; never live customer or Inventory records.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const entry=path.join(root,'scripts','_bakery_opening_fixture_'+randomUUID().replaceAll('-','')+'.tsx');
const out=path.join(os.tmpdir(),'daenem-bakery-opening-visual-qa');
await fs.mkdir(out,{recursive:true});
const fixture={canPropose:true,canReview:true,openings:[
 {id:'opening-1',locationId:'HQ',inventoryItemId:'flour',itemName:'Flour',locationName:'Bakery HQ',
  baseUnit:'kg',quantityMicro:50000000,valueMicroKobo:2500000000000,status:'proposed',
  reason:'Stock count and supplier invoice reviewed',evidenceReference:'STOCK-COUNT-FLOUR-001',proposedBy:'store-keeper',createdAt:'2026-10-24T17:00:00Z'},
 {id:'opening-2',locationId:'HQ',inventoryItemId:'yeast',itemName:'Yeast',locationName:'Bakery HQ',
  baseUnit:'g',quantityMicro:5000000,valueMicroKobo:12340000000,status:'approved',reviewedBy:'supervisor',
  reason:'Physical count verified',evidenceReference:'STOCK-COUNT-YEAST-002',proposedBy:'store-keeper',createdAt:'2026-10-23T13:00:00Z'}
]};
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{BakeryOpeningValuationPanel}from'../src/bakery-opening-valuation';
createRoot(document.getElementById('root')).render(<BakeryOpeningValuationPanel actorId="reviewer" items={[{id:'flour',name:'Flour',unit:'kg'},{id:'yeast',name:'Yeast',unit:'g'}]} locations={[{id:'HQ',name:'Bakery HQ'},{id:'BRANCH',name:'Market Branch'}]} onCompleted={async()=>{}}/>);`;
await fs.writeFile(entry,source);
try{
 await esbuild.build({entryPoints:[entry],bundle:true,platform:'browser',format:'iife',jsx:'automatic',
 outdir:out,entryNames:'bundle',logLevel:'silent',
 plugins:[{name:'mock-private-API-only',setup(build){
  build.onResolve({filter:/^\.\/auth$/},()=>({path:'auth-fixture',namespace:'qa'}));
  build.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:
    'export const api=async(path)=>{if(path==="/api/inventory/bakery/openings")return '+JSON.stringify(fixture)+';throw Error("Read-only fixture: no financial writes")};',loader:'js'}))
 }}]});
}finally{await fs.unlink(entry)}
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}body{font:16px Inter,Arial,sans-serif;margin:0;padding:20px;background:#f4f7f6;color:#1b2b33}#root{max-width:1480px;margin:auto}</style>
<link rel="stylesheet" href="bundle.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--no-sandbox']});
let failed=0;
try{
 for(const [name,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,900],['4k',3840,2160]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(out,'index.html')).href);
  await page.locator('.inventory-opening-panel summary').click();
  await page.waitForSelector('.inventory-opening-row');
  const result=await page.evaluate(()=>{
   const controls=[...document.querySelectorAll('.inventory-opening-content input,.inventory-opening-content select,.inventory-opening-content button')];
   const overflow=document.documentElement.scrollWidth>document.documentElement.clientWidth+2;
   const clipped=controls.some(el=>{const x=el.getBoundingClientRect();return x.width<(el.tagName==='BUTTON'?40:150)||x.right>innerWidth+2||x.left<0});
   const controlsVisible=controls.length>=8;
   const approve=[...document.querySelectorAll('button')].some(el=>el.textContent.includes('Approve Verified Opening'));
   return{overflow,clipped,controls:controls.length,controlsVisible,approve,title:document.querySelector('summary strong')?.textContent};
  });
  const ok=!result.overflow&&!result.clipped&&result.controlsVisible&&result.approve&&result.title.includes('Verified Opening');
  const screenshot=path.join(out,'opening-'+name+'.png');
  await page.screenshot({path:screenshot,fullPage:true});
  console.log((ok?'PASS ':'FAIL ')+name+' '+width+'x'+height+' '+JSON.stringify(result)+' '+screenshot);
  if(!ok)failed++;
  await page.close();
 }
}finally{await browser.close()}
if(failed)process.exitCode=1;
