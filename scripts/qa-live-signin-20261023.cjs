const {chromium}=require('playwright');
const fs=require('fs'); const path=require('path');
const site='https://daenem-staffportal-api-staging.adedapo2005.workers.dev/';
const out=path.resolve('qa-artifacts/live-staging-browser-20261023');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-gpu']});
 const report=[];
 for(const [w,h] of [[3840,2160],[1920,1080],[1366,768],[390,844]]){
  const page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  try{
   const response=await page.goto(site,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(2200);
   const basic=await page.evaluate(()=>{
    const root=document.querySelector('#staffportal-auth-mount');
    const e=root?.querySelector('input[autocomplete="username"]');
    const p=root?.querySelector('input[autocomplete="current-password"]');
    const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    const cs=el=>el?getComputedStyle(el):null;
    return {vw:innerWidth,vh:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,auth:rect(root),email:rect(e),emailFont:cs(e)?.fontSize,passwordFont:cs(p)?.fontSize,labels:[...root?.querySelectorAll('.sp-field-label')||[]].map(x=>({text:x.textContent,font:cs(x).fontSize})),providers:[...root?.querySelectorAll('.sp-social-button')||[]].map(x=>({text:x.textContent?.trim(),rect:rect(x),font:cs(x).fontSize})),widgets:document.querySelectorAll('#staff-primary-information .gw-intelligence-widget').length,clocks:document.querySelectorAll('#staff-global-operations article[data-city-id]').length};
   });
   await page.screenshot({path:path.join(out,'live-signin-'+w+'x'+h+'.jpg'),type:'jpeg',quality:57,fullPage:true});
   const email=page.locator('#staffportal-auth-mount input[autocomplete="username"]');
   if(await email.count()){
    await email.focus();
    basic.focus=await email.evaluate(el=>{let input=getComputedStyle(el),shell=getComputedStyle(el.closest('.sp-credential-shell'));return {inputOutlineStyle:input.outlineStyle,inputOutlineWidth:input.outlineWidth,shellOutlineStyle:shell.outlineStyle,shellOutlineWidth:shell.outlineWidth}});
    await page.screenshot({path:path.join(out,'live-focus-'+w+'x'+h+'.jpg'),type:'jpeg',quality:57,fullPage:true});
    await email.fill('tester@example.org');
    const pwd=page.locator('#staffportal-auth-mount input[autocomplete="current-password"]');
    await pwd.fill('LocalDummy1!');
    basic.enteredValue=await email.inputValue();
    basic.passwordMode=await pwd.getAttribute('type');
    await page.locator('.sp-show-password').click();
    basic.showType=await pwd.getAttribute('type');
    await page.locator('.sp-show-password').click();
    await page.locator('#staffportal-auth-mount .sp-auth-tabs button').nth(1).click();
    await page.waitForTimeout(400);
    basic.create=await page.locator('#staffportal-auth-mount').innerText();
    await page.screenshot({path:path.join(out,'live-create-'+w+'x'+h+'.jpg'),type:'jpeg',quality:55,fullPage:true});
   }
   basic.http=response.status();basic.errors=errors;
   report.push({viewport:w+'x'+h,ok:true,...basic});
   console.log('LIVE '+w+'x'+h+' HTTP '+basic.http+' font '+basic.emailFont+' auth '+JSON.stringify(basic.auth)+' focus '+JSON.stringify(basic.focus)+' errors '+errors.length);
  }catch(e){report.push({viewport:w+'x'+h,ok:false,error:String(e),errors});console.log('FAIL '+w+'x'+h+' '+String(e));}
  await page.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('SAVED '+out);
})().catch(e=>{console.error(e);process.exitCode=1});
