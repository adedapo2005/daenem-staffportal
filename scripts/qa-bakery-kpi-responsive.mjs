import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const entry=path.join(root,'scripts','_kpi_qa_'+randomUUID().replaceAll('-','')+'.tsx');
const out=path.join(os.tmpdir(),'daenem-bakery-kpi-qa');
await fs.mkdir(out,{recursive:true});
const data=Array.from({length:14},(_,i)=>({day:'2026-10-'+String(i+11).padStart(2,'0'),goodLoaves:i<7?300:350,productionLossLoaves:i<7?12:8,completedBatches:i<7?2:3}));
const sales=Array.from({length:14},(_,i)=>({day:data[i].day,orders:i<7?20:25,orderValueKobo:i<7?1500003:1800001,recordedOrderPaymentsKobo:0}));
const fixture={periodStart:data[0].day,periodEnd:data[13].day,timeZone:'Africa/Lagos',production:data,orders:sales,source:'synthetic test fixture; never display as live data'};
const source=`import React from 'react';
import{createRoot}from'react-dom/client';
import{BakeryKpiStrip}from'../src/bakery-kpi-strip';
const data=${JSON.stringify(fixture)};
const productionOnly=new URLSearchParams(window.location.search).get('role')==='production';
createRoot(document.getElementById('root')).render(<BakeryKpiStrip history={productionOnly?{...data,orders:null}:data}/>);
`;
if(await fs.stat(entry).catch(()=>null))throw Error('Fixture path already exists');
await fs.writeFile(entry,source);
try{
 await esbuild.build({entryPoints:[entry],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outdir:out,entryNames:'bundle',logLevel:'silent'});
}finally{await fs.unlink(entry)}
const css='<style>body{font:16px Inter,Arial,sans-serif;color:#1b2b33;background:#f5f8f7;margin:0;padding:24px}#root{max-width:1440px;margin:auto}*{box-sizing:border-box}</style>';
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<link rel="stylesheet" href="bundle.css"></head><body><main id="root"></main><script src="bundle.js"></script></body></html>`);
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--no-sandbox']});
let failures=0;
try{
 for(const [name,width,height,role] of [['phone',390,844,'sales'],['tablet',820,1180,'sales'],['desktop',1440,900,'sales'],['4k',3840,2160,'sales'],['phone-production',390,844,'production'],['desktop-production',1440,900,'production']]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(out,'index.html')).href+'?role='+role,{waitUntil:'load'});
  await page.waitForSelector('.bakery-kpi-card');
  const check=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.bakery-kpi-card')];
   const rects=cards.map(c=>c.getBoundingClientRect());
   const overlaps=rects.some((a,i)=>rects.some((b,j)=>i<j&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2));
   return {count:cards.length,scroll:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth,overlaps,
    cardColumns:new Set(rects.map(r=>Math.round(r.x))).size,clipped:cards.some(c=>c.getBoundingClientRect().width<160),commercialVisible:cards.some(c=>c.textContent?.includes('Recorded Order Value')),koboCentsVisible:document.body.textContent?.includes('₦126,000.07')};
  });
  const expected=role==='sales'?6:4;const pass=check.count===expected&&check.scroll<=width+2&&!check.overlaps&&!check.clipped&&(role==='sales'?(check.commercialVisible&&check.koboCentsVisible):!check.commercialVisible);
  const shot=path.join(out,'bakery-kpi-'+name+'.png');
  await page.screenshot({path:shot,fullPage:true});
  console.log((pass?'PASS ':'FAIL ')+name+' '+width+'x'+height+' '+JSON.stringify(check)+' screenshot='+shot);
  if(!pass)failures++;
  await page.close();
 }
}finally{await browser.close()}
if(failures)process.exitCode=1;
