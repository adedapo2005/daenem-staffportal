import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const mainRoot=process.argv[2], evidenceDir=process.argv[3];
assert.ok(mainRoot && evidenceDir,'Pass existing main StaffPortal root and recruitment control directory.');
const require=createRequire(import.meta.url);
const esbuild=require(join(mainRoot,'node_modules','esbuild','lib','main.js'));
const { chromium }=require(join(mainRoot,'node_modules','playwright'));
const writerRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const css=readFileSync(join(writerRoot,'src','jobs-recruitment.css'),'utf8');
const bundle=await esbuild.build({
  entryPoints:['recruitment-browser-entry'],bundle:true,write:false,
  outfile:'recruitment-browser.js',format:'iife',platform:'browser',target:'chrome120',
  jsx:'automatic',nodePaths:[join(mainRoot,'node_modules')],
  logLevel:'silent',
  plugins:[{name:'recruitment-owned-ui-only',setup(build){
    build.onResolve({filter:/^recruitment-browser-entry$/},
      ()=>({path:'recruitment-browser-entry',namespace:'recruitment-virtual'}));
    build.onLoad({filter:/.*/,namespace:'recruitment-virtual'},()=>({
      resolveDir:writerRoot,loader:'tsx',contents:`
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { RecruitmentWorkspace } from './src/jobs-recruitment-workspace';
        const context={
          sessionId:'synthetic-qa-only',
          employee:{id:'qa-person',displayName:'Recruitment Test Operator',
            status:'active',timezone:'America/New_York'},
          companies:[{id:'coA',name:'Test Company',code:'T',primary:true}],
          roles:[],permissions:{'jobs.access':'approve'},
          companyPermissions:{coA:{'jobs.access':'approve'}}
        };
        createRoot(document.getElementById('recruitment-root')).render(
          <RecruitmentWorkspace context={context} onClose={() => {
            window.__qaClosed=true;
          }}/>);
      `
    }));
  }}]
});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js'))?.text;
assert.ok(js&&js.length>100,'esbuild must produce an in-memory browser bundle');
console.log('PASS owned UI esbuild production-like bundle in memory (not a full StaffPortal build)');
const browser=await chromium.launch({headless:true});
let errors=[],denied=false;
const page=await browser.newPage({viewport:{width:1366,height:900},deviceScaleFactor:1});
page.on('pageerror',err=>errors.push(err.message));
await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/')return route.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;}</style><style>'+css+'</style></head><body><div id="recruitment-root"></div></body></html>'
  });
  if(u.pathname==='/api/recruitment/companies')
    return json(200,{companies:[{id:'coA',name:'Test Company',code:'T',
      capabilities:{create:true,edit:true,approve:true}}]});
  if(u.pathname==='/api/recruitment/candidates')
    return json(200,{companyId:'coA',candidates:[{id:'candidateTest',
      companyId:'coA',fullName:'Synthetic Candidate',candidateRef:'QA-001',
      roleTitle:'Analyst',stage:'screening',revision:0,locationId:null}]});
  if(u.pathname==='/api/recruitment/candidates/candidateTest') {
    if(denied)return json(404,{error:'Recruitment record unavailable.'});
    return json(200,{candidate:{id:'candidateTest',companyId:'coA',
      fullName:'Synthetic Candidate',candidateRef:'QA-001',roleTitle:'Analyst',
      stage:'screening',revision:0,email:'private.qa@example.test'},
      interviews:[],offers:[],hrHandoffs:[],
      capabilities:{create:true,edit:true,approve:true}});
  }
  if(u.pathname==='/api/recruitment/interviewers')
    return json(200,{companyId:'coA',candidateId:'candidateTest',
      interviewers:[{id:'interviewerTest',displayName:'Synthetic Interviewer'}]});
  return json(404,{error:'Unavailable in synthetic QA'});
});
try{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://staffportal.invalid/');
  await page.addScriptTag({content:js});
  await page.getByRole('heading',{name:'Recruitment command workspace'}).waitFor();
  await page.locator('.jobs-erp-row').first().waitFor();
  const widths=[390,430,768,1024,1366,1672,1920,2560,3840];
  for(const width of widths){
    await page.setViewportSize({width,height:900});
    await page.locator('.jobs-erp-row').first().click();
    await page.getByText('private.qa@example.test').waitFor();
    const metrics=await page.evaluate(()=>{
      const doc=document.documentElement,panel=document.querySelector('.jobs-erp-panel');
      return {docWidth:doc.scrollWidth,clientWidth:doc.clientWidth,
        panelWidth:panel.scrollWidth,panelClient:panel.clientWidth,
        backdropWidth:document.querySelector('.jobs-erp-backdrop').getBoundingClientRect().width};
    });
    assert.ok(metrics.docWidth<=width+2,
      'Horizontal page overflow at '+width+': '+JSON.stringify(metrics));
    assert.ok(metrics.panelWidth<=metrics.panelClient+2,
      'Panel overflow at '+width+': '+JSON.stringify(metrics));
    assert.ok(await page.getByRole('heading',{name:'Recruitment command workspace'}).isVisible(),
      'Workspace heading not visible at '+width);
    if([390,1366,3840].includes(width))
      await page.screenshot({path:join(evidenceDir,'RECRUITMENT-UI-QA-'+width+'.png'),animations:'disabled'});
    console.log('PASS synthetic browser layout and record '+width+'px');
    if(width<=700){
      await page.getByRole('button',{name:'Back to candidates'}).click();
    }else{
      await page.getByRole('button',{name:'New candidate'}).click();
    }
    await page.locator('.jobs-erp-row').first().waitFor({state:'attached'});
  }
  await page.setViewportSize({width:2560,height:1440});
  await page.reload();
  await page.addScriptTag({content:js});
  await page.locator('.jobs-erp-row').first().click();
  await page.locator('.jobs-erp-record-head').waitFor();
  const qhd=await page.evaluate(()=>{
    const panel=document.querySelector('.jobs-erp-panel');
    const row=document.querySelector('.jobs-erp-row strong');
    return {width:panel.getBoundingClientRect().width,
      height:panel.getBoundingClientRect().height,
      rowSize:parseFloat(getComputedStyle(row).fontSize),
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  assert.ok(qhd.width>=1700&&qhd.height>=1100&&qhd.rowSize>=20&&qhd.overflow<=2,
    'Full-height 2560x1440 readability and overflow: '+JSON.stringify(qhd));
  await page.screenshot({path:join(evidenceDir,'RECRUITMENT-UI-QA-2560x1440.png'),animations:'disabled'});
  console.log('PASS full-height 2560x1440 rendered workspace scaling, typography and overflow');
  await page.setViewportSize({width:3840,height:2160});
  await page.reload();
  await page.addScriptTag({content:js});
  await page.locator('.jobs-erp-row').first().click();
  await page.getByText('private.qa@example.test').waitFor();
  const full4k=await page.evaluate(()=>{
    const panel=document.querySelector('.jobs-erp-panel');
    const row=document.querySelector('.jobs-erp-row strong');
    const heading=document.querySelector('.jobs-erp-header h2');
    const record=document.querySelector('.jobs-erp-record');
    return {width:panel.getBoundingClientRect().width,
      height:panel.getBoundingClientRect().height,
      headingSize:parseFloat(getComputedStyle(heading).fontSize),
      rowSize:parseFloat(getComputedStyle(row).fontSize),
      pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      recordOverflow:record.scrollWidth-record.clientWidth};
  });
  assert.ok(full4k.width>=2600&&full4k.height>=1600,
    'Full-height 4K workspace must use readable desktop area: '+JSON.stringify(full4k));
  assert.ok(full4k.headingSize>=34&&full4k.rowSize>=20,
    'Full-height 4K typography must remain legible: '+JSON.stringify(full4k));
  assert.ok(full4k.pageOverflow<=2&&full4k.recordOverflow<=2,
    'Full-height 4K horizontal overflow: '+JSON.stringify(full4k));
  await page.screenshot({path:join(evidenceDir,'RECRUITMENT-UI-QA-3840x2160.png'),animations:'disabled'});
  console.log('PASS full-height 3840x2160 rendered workspace scaling, typography and overflow');
  assert.ok(await page.getByRole('dialog',{name:'Recruitment command workspace'}).isVisible());
  await page.evaluate(()=>{
    const panel=document.querySelector('.jobs-erp-panel');
    const nodes=Array.from(panel.querySelectorAll(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'))
      .filter(node=>node.getClientRects().length>0);
    nodes[0].focus();
  });
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>{
    const nodes=Array.from(document.querySelectorAll('.jobs-erp-panel button:not(:disabled),.jobs-erp-panel input:not(:disabled),.jobs-erp-panel select:not(:disabled),.jobs-erp-panel textarea:not(:disabled),.jobs-erp-panel a[href]'))
      .filter(node=>node.getClientRects().length>0);
    return document.activeElement===nodes[nodes.length-1];
  }),true,'Shift+Tab must wrap to the final visible dialog control');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>{
    const nodes=Array.from(document.querySelectorAll('.jobs-erp-panel button:not(:disabled),.jobs-erp-panel input:not(:disabled),.jobs-erp-panel select:not(:disabled),.jobs-erp-panel textarea:not(:disabled),.jobs-erp-panel a[href]'))
      .filter(node=>node.getClientRects().length>0);
    return document.activeElement===nodes[0];
  }),true,'Tab must wrap to the first visible dialog control');
  assert.ok(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__qaClosed),true,'Escape must call workspace close');
  console.log('PASS synthetic dialog name, focus wrap, Reduced Motion preference and Escape close');
  await page.setViewportSize({width:390,height:900});
  await page.reload();
  await page.addScriptTag({content:js});
  await page.locator('.jobs-erp-row').first().waitFor();
  denied=true;
  await page.locator('.jobs-erp-row').first().click();
  await page.getByText(/Protected Recruitment content was cleared after an access denial/).waitFor();
  assert.equal(await page.getByText('private.qa@example.test').count(),0);
  assert.equal(await page.locator('.jobs-erp-row').count(),0);
  console.log('PASS synthetic browser permission-denial clears protected record and list');
  assert.deepEqual(errors,[],'No browser JS runtime errors');
  console.log('PASS no browser runtime exceptions');
  console.log('RECRUITMENT BROWSER QA: 9 viewport checks + denial + runtime PASS; mocked APIs only, not authenticated Worker/D1/Owner acceptance.');
}finally{
  await browser.close();
}
