// Isolated screenshot/render QA ONLY. Uses synthetic conversion examples, never live Bakery figures.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const entry=path.join(root,'scripts','_bakery_units_fixture_'+randomUUID().replaceAll('-','')+'.tsx');
const out=path.join(os.tmpdir(),'daenem-bakery-unit-visual-qa');
await fs.mkdir(out,{recursive:true});
const fixture={
 rules:[
  {id:'rule1',inventoryItemId:'flour',ingredientName:'Flour',fromUnit:'bag',inventoryUnit:'kg',factor:50,versionNo:1,status:'approved',proposedBy:'employee2',reason:'Supplier specification'},
  {id:'rule2',inventoryItemId:'yeast',ingredientName:'Yeast',fromUnit:'carton',inventoryUnit:'g',factor:12000,versionNo:1,status:'approved',proposedBy:'employee2',reason:'Supplier specification'},
  {id:'rule3',inventoryItemId:'flour',ingredientName:'Flour',fromUnit:'bag',inventoryUnit:'kg',factor:25,versionNo:2,status:'proposed',proposedBy:'employee3',reason:'Supplier labelled revised pack 25 kg'}
 ],
 canPropose:true,canReview:true
};
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{BakeryMaterialUnitControls}from'../src/bakery-material-units';
const fixture=${JSON.stringify(fixture)};
createRoot(document.getElementById('root')).render(<BakeryMaterialUnitControls ingredients={[{id:'flour',name:'Flour',unit:'kg'},{id:'yeast',name:'Yeast',unit:'g'}]} unitState={fixture} actorId="reviewer" onReload={async()=>{}}/>);
`;
await fs.writeFile(entry,source);
try{await esbuild.build({entryPoints:[entry],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outdir:out,entryNames:'bundle',logLevel:'silent',plugins:[{name:'isolated-auth-fixture',setup(build){build.onResolve({filter:/^\.\/auth$/},()=>({path:'auth-fixture',namespace:'qa'}));build.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export const api=async()=>{throw Error("Not an authenticated request")};',loader:'js'}))}}]})}finally{await fs.unlink(entry)}
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font:16px Inter,Arial,sans-serif;margin:0;padding:20px;background:#f4f7f6;color:#1b2b33}#root{max-width:1480px;margin:auto}</style><link rel="stylesheet" href="bundle.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>`);
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--no-sandbox']});
let failed=0;
try{
 for(const [name,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,900],['4k',3840,2160]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(out,'index.html')).href);
  await page.waitForSelector('.bakery-unit-panel');
  const evidence=await page.evaluate(()=>{
   const container=document.querySelector('.bakery-unit-panel'),inputs=[...container.querySelectorAll('input,select')],buttons=[...container.querySelectorAll('button')];
   const overflow=document.documentElement.scrollWidth>document.documentElement.clientWidth+2;
   const clipped=inputs.some(el=>{const r=el.getBoundingClientRect();return r.width<170||r.right>innerWidth+2||r.left<0});
   const invisible=buttons.some(el=>el.getBoundingClientRect().width<40);
   return{overflow,clipped,invisible,inputs:inputs.length,buttons:buttons.length,title:container.querySelector('h3')?.textContent};
  });
  const ok=!evidence.overflow&&!evidence.clipped&&!evidence.invisible&&evidence.inputs>=4&&evidence.title==='Purchasing & Production Units';
  const screenshot=path.join(out,'material-units-'+name+'.png');
  await page.screenshot({path:screenshot,fullPage:true});
  console.log((ok?'PASS ':'FAIL ')+name+' '+width+'x'+height+' '+JSON.stringify(evidence)+' '+screenshot);
  if(!ok)failed++;
  await page.close();
 }
}finally{await browser.close()}
if(failed)process.exitCode=1;
