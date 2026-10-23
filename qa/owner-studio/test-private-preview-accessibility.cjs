const {chromium}=require('playwright');
const {createServer}=require('vite');
(async()=>{
 const server=await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0,strictPort:false},logLevel:'error'});
 await server.listen();
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});
 const origin='http://127.0.0.1:'+server.httpServer.address().port;
 const errors=[],unsafeRequests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())&&r.url().includes('/api/'))unsafeRequests.push(r.method()+' '+r.url());});
 await page.route('**/api/**',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"Private QA"}'}));
 try{
  await page.goto(origin+'/qa/owner-studio/index.html',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('[data-builder-enter]').click();
  await page.locator('[data-builder-starter]').click();
  await page.locator('[data-builder-live-preview]').click();
  const username=page.locator('[data-builder-live-root] .sp-auth-form input').first();
  await username.waitFor({timeout:15000});
  if(!(await username.evaluate(el=>el.readOnly)))throw Error('PRIVATE PREVIEW DEFECT: username accepts credential entry');
  await username.focus();
  await page.keyboard.type('test-credential-must-not-appear');
  if(await username.inputValue())throw Error('PRIVATE PREVIEW DEFECT: credential text is accepted');
  await page.locator('[data-builder-live-root] .sp-auth-tabs [role="tab"]').nth(1).click();
  const createFields=page.locator('[data-builder-live-root] .usp-field input:not([type="checkbox"])');
  await createFields.first().waitFor();
  if(await createFields.evaluateAll(els=>els.some(el=>!el.readOnly)))throw Error('PRIVATE PREVIEW DEFECT: Create Account inputs are writable');
  await page.locator('[data-builder-live-root] .sp-signup-close').click();
  const trigger=page.locator('[data-builder-live-fullsize]');
  await trigger.click();
  const dialog=page.locator('.owner-builder-live.is-fullsize');
  await dialog.waitFor();
  if(await dialog.getAttribute('role')!=='dialog'||await dialog.getAttribute('aria-modal')!=='true')
   throw Error('KEYBOARD DEFECT: full-size review has no modal dialog semantics');
  if(!(await dialog.evaluate(el=>el.contains(document.activeElement))))
   throw Error('KEYBOARD DEFECT: focus never entered full-size modal');
  if(!(await page.evaluate(()=>[...document.body.children].filter(el=>!el.classList?.contains('owner-builder-live')).every(el=>el.inert))))
   throw Error('KEYBOARD DEFECT: full-size mode leaves background interaction exposed');
  for(let n=0;n<35;n++){
   await page.keyboard.press('Tab');
   if(!(await dialog.evaluate(el=>el.contains(document.activeElement))))throw Error('KEYBOARD DEFECT: Tab escaped full-size modal at '+n);
  }
  await trigger.focus();
  await page.keyboard.press('Shift+Tab');
  if(!(await dialog.evaluate(el=>el.contains(document.activeElement))))
    throw Error('KEYBOARD DEFECT: Shift+Tab escaped full-size modal');
  await page.keyboard.press('Escape');
  await page.locator('[data-builder-device]').selectOption('1024');
  await page.waitForFunction(()=>document.querySelector('.owner-concept-runtime')?.style.width==='1024px');
  await trigger.click();
  await page.locator('.owner-builder-live.is-fullsize').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-builder-live-root]')?.style.zoom&&document.querySelector('.owner-concept-runtime')?.style.width==='1024px');
  const desktopFit=await page.evaluate(()=>{
    const stage=document.querySelector('.owner-builder-live-stage');
    const canvas=document.querySelector('.owner-concept-runtime');
    return{stageHeight:stage?.clientHeight,scrollHeight:stage?.scrollHeight,zoom:document.querySelector('[data-builder-live-root]')?.style.zoom,canvasRight:canvas?.getBoundingClientRect().right};
  });
  if(!desktopFit.stageHeight||desktopFit.scrollHeight>desktopFit.stageHeight+6)
    throw Error('DESKTOP PREVIEW DEFECT: 1024px design is cropped by the preview toolbar '+JSON.stringify(desktopFit));
  await page.screenshot({path:'qa/owner-studio/private-preview-accessibility-1024.png',fullPage:false});
  await page.keyboard.press('Escape');
  await page.locator('[data-builder-device]').selectOption('390');
  await page.waitForFunction(()=>document.querySelector('.owner-concept-runtime')?.style.width==='390px');
  await trigger.click();
  await page.setViewportSize({width:390,height:844});
  const layout=await page.evaluate(()=>{const r=document.querySelector('.owner-concept-runtime')?.getBoundingClientRect();return{width:r?.width,right:r?.right,viewport:innerWidth}});
  if(!layout.width||layout.right>layout.viewport+2)throw Error('MOBILE VISUAL DEFECT: native 390px preview is horizontally cropped '+JSON.stringify(layout));
  await page.screenshot({path:'qa/owner-studio/private-preview-accessibility-mobile.png',fullPage:false});
  await page.keyboard.press('Escape');
  if(await page.locator('.owner-builder-live.is-fullsize').count())throw Error('KEYBOARD DEFECT: Escape did not exit full-size modal');
  if(!(await page.locator('[data-builder-live-fullsize]').evaluate(el=>el===document.activeElement)))throw Error('KEYBOARD DEFECT: Escape did not restore focus');
  if(await page.evaluate(()=>[...document.body.children].some(el=>el.inert)))throw Error('KEYBOARD DEFECT: background stays inert after exit');
  await trigger.click();
  await page.locator('.owner-builder-live.is-fullsize').waitFor();
  await page.locator('[data-builder-live-close]').click();
  if(await page.locator('[data-builder-live-panel]').isVisible())throw Error('Private preview did not close');
  if(await page.evaluate(()=>[...document.body.children].some(el=>el.inert)))throw Error('Close Preview left the application inaccessible');
  if(!(await page.locator('[data-builder-live-preview]').evaluate(el=>el===document.activeElement)))
    throw Error('Closing a full-size preview failed to restore focus to the launch control');
  if(unsafeRequests.length)throw Error('Authentication/API writes attempted '+unsafeRequests.join(','));
  if(errors.length)throw Error('Page errors '+errors.join(','));
  console.log('PASS: read-only credential fields, Create Account, 1024px full-size fit, 390px mobile, modal isolation, Tab/Shift+Tab trapping, Escape/direct close focus restoration, zero API writes and no page errors');
 }finally{await page.close();await browser.close();await server.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
