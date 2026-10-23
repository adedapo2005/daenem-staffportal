/* Manual Chrome QA for the approved StaffPortal Sign-In, staging-free.
 * Run from repository root with an installed Playwright runtime. */
const { chromium } = require('playwright');
const { createServer } = require('vite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const SCREENS = (process.env.QA_SINGLE === '4k' ? [[3840,2160]] : process.env.QA_SINGLE === '1' ? [[1920,1080]] : null) || [[3840,2160],[1920,1080],[1366,768],[1280,720],[1024,768],[820,1180],[390,844]];
const OUT = path.resolve('qa-artifacts/premium-signin-acceptance-20261023');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [];
const warnings = [];
const box = (el) => {
  const b = el.getBoundingClientRect();
  return {x: +b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),right:+b.right.toFixed(1),bottom:+b.bottom.toFixed(1)};
};
(async () => {
  fs.mkdirSync(OUT,{recursive:true});
  const server = await createServer({configFile:'vite.signin-browser-qa.config.ts',server:{host:'127.0.0.1',port:0},logLevel:'error'});
  await server.listen();
  const base = 'http://127.0.0.1:'+server.httpServer.address().port;
  const browser = await chromium.launch({headless:true,executablePath:CHROME,args:['--disable-gpu','--no-first-run']});
  try {
    for (const [width,height] of SCREENS) {
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce'});
      const exceptions=[];
      page.on('pageerror',e=>exceptions.push(e.message));
      await page.route('**/api/**', route => {
        const pathname=new URL(route.request().url()).pathname;
        let body = {};
        if(pathname==='/api/auth/me') body={authenticated:false};
        if(pathname==='/api/auth/password-policy') body={minimumLength:6,maximumLength:128,requiresUppercase:true,requiresLowercase:true,requiresNumber:true,requiresSymbol:true};
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      });
      try {
        await page.goto(base+'/qa/signin/index.html',{waitUntil:'domcontentloaded',timeout:45000});
        const auth=page.locator('#staffportal-auth-mount.sp-auth-mode-signin');
        await auth.waitFor({timeout:30000});
        await page.waitForTimeout(1000);
        const email=page.locator('#staffportal-auth-mount .sp-auth-form input[autocomplete="username"]');
        const password=page.locator('#staffportal-auth-mount .sp-auth-form input[autocomplete="current-password"]');
        assert.equal(await email.count(),1,'Email field present');
        assert.equal(await password.count(),1,'Password field present');
        assert.equal(await email.getAttribute('placeholder'),'Email or username');
        assert.equal(await password.getAttribute('placeholder'),'Enter password');
        await email.focus();
        const metrics=await page.evaluate(() => {
          const rect=el=>{let b=el.getBoundingClientRect();return{x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:+b.height.toFixed(1),right:+b.right.toFixed(1),bottom:+b.bottom.toFixed(1)}};
          const root=document.querySelector('#staffportal-auth-mount'), email=root.querySelector('input[autocomplete="username"]');
          const pass=root.querySelector('input[autocomplete="current-password"]');
          const shell=email.closest('.sp-credential-shell');
          const sc=getComputedStyle(shell),ec=getComputedStyle(email);
          const places={};for(const key of ['#staff-primary-information','#staff-global-operations','#staff-local-weather','.sp-hero','#staffportal-auth-mount']){
            const el=document.querySelector(key); places[key]=el?rect(el):null;
          }
          const providers=[...root.querySelectorAll('.sp-auth-provider-list .sp-social-button')].map(el=>({text:(el.textContent||'').trim(),rect:rect(el),font:getComputedStyle(el).fontSize}));
          const mainInputStyle=el=>{const st=getComputedStyle(el);return{font:st.fontSize,color:st.color,placeholder:el.placeholder}};
          return {
            viewport:{w:innerWidth,h:innerHeight},body:{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},
            root:rect(root),rootClientHeight:root.clientHeight,rootScrollHeight:root.scrollHeight,places,
            email:mainInputStyle(email),password:mainInputStyle(pass),
            focus:{shellOutlineWidth:sc.outlineWidth,shellOutlineStyle:sc.outlineStyle,shellBoxShadow:sc.boxShadow,inputOutlineWidth:ec.outlineWidth,inputOutlineStyle:ec.outlineStyle,inputBoxShadow:ec.boxShadow,inputBorderWidth:ec.borderLeftWidth},
            providers,newsWidgets:document.querySelectorAll('#staff-primary-information .gw-intelligence-widget').length,
            clocks:document.querySelectorAll('#staff-global-operations article[data-city-id]').length,
            panelLayout:{display:getComputedStyle(root).display,alignContent:getComputedStyle(root).alignContent,justifyContent:getComputedStyle(root).justifyContent,gridTemplateRows:getComputedStyle(root).gridTemplateRows,padding:getComputedStyle(root).padding,headingFont:getComputedStyle(root.querySelector('.sp-auth-copy h2')).fontSize,tabFont:getComputedStyle(root.querySelector('.sp-auth-tabs button')).fontSize,labelFont:getComputedStyle(root.querySelector('.sp-field-label')).fontSize,buttonFont:getComputedStyle(root.querySelector('.sp-primary-button')).fontSize,children:[...root.children].map(el=>({className:el.className,box:rect(el)}))}
          };
        });
        const diag=await page.evaluate(()=>({rootClasses:document.querySelector('.sp-root')?.className,cardClasses:document.querySelector('#staffportal-auth-mount')?.className,authCard:document.querySelector('.sp-auth-card')?.className,matched:!!document.querySelector('#root .sp-root .sp-auth-card.sp-auth-gateway .sp-credential-shell input:focus-visible')}));
        console.log('FOCUS_DEBUG '+width+' '+JSON.stringify({focus:metrics.focus,diag}));
        if(process.env.QA_SINGLE === '1') {
          const devtools=await page.context().newCDPSession(page);
          await devtools.send('DOM.enable');await devtools.send('CSS.enable');
          const doc=await devtools.send('DOM.getDocument',{depth:1});
          const node=await devtools.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#staffportal-auth-mount .sp-auth-form input[autocomplete="username"]'});
          const style=await devtools.send('CSS.getMatchedStylesForNode',{nodeId:node.nodeId});
          const rules=(style.matchedCSSRules||[]).flatMap(item=>{
            const props=item.rule?.style?.cssProperties||[];
            const outlines=props.filter(p=>p.name.startsWith('outline'));
            return outlines.length?[{selector:item.rule?.selectorList?.text||'',origin:item.rule?.origin,layer:item.rule?.layers,props:outlines.map(x=>({name:x.name,value:x.value,important:x.important}))}]:[];
          });
          console.log('MATCHED_OUTLINE_RULES '+JSON.stringify(rules).slice(-12000));
          await devtools.detach();
        }
        await page.screenshot({path:path.join(OUT,'focused-'+width+'x'+height+'.jpg'),type:'jpeg',quality:58,fullPage:true});
        assert.equal(metrics.focus.inputOutlineStyle,'none','input paints no inner outline');
        assert.equal(metrics.focus.inputBorderWidth,'0px','input has no inner border');
        assert.equal(metrics.focus.inputBoxShadow,'none','input has no shadow');
        assert.equal(metrics.focus.shellOutlineWidth,'2px','single outer focus ring');
        assert.equal(metrics.providers.length,3,'Microsoft Google WhatsApp remain');
        if (width>=2100) {
          assert.ok(parseFloat(metrics.email.font)>=18,'4K email field is comfortably readable');
          assert.ok(parseFloat(metrics.panelLayout.labelFont)>=16,'4K field label is comfortably readable');
          assert.ok(parseFloat(metrics.providers[0].font)>=16,'4K social buttons are comfortably readable');
        }
        assert.ok(metrics.rootScrollHeight<=metrics.rootClientHeight+3,'auth has no internal scroll or clipping');
        assert.ok(metrics.body.scrollWidth<=width+2,'no page horizontal overflow');
        assert.ok(metrics.root.x>=-2 && metrics.root.right<=width+2,'auth container inside viewport');
        if(width>=1024 && width!==1024){
          if(metrics.body.scrollHeight>height+2) warnings.push(width+'x'+height+' desktop page scroll: '+metrics.body.scrollHeight);
        }
        if(metrics.rootScrollHeight>metrics.rootClientHeight+3) warnings.push(width+'x'+height+' auth internal overflow: '+metrics.rootScrollHeight+'/'+metrics.rootClientHeight);
        await page.screenshot({path:path.join(OUT,'signin-'+width+'x'+height+'.jpg'),type:'jpeg',quality:62,fullPage:true});
        await email.fill('tester@example.org');
        await password.fill('TestPassword123!');
        await page.locator('.sp-show-password').click();
        assert.equal(await password.getAttribute('type'),'text','show password toggle');
        await page.locator('.sp-show-password').click();
        assert.equal(await password.getAttribute('type'),'password','hide password toggle');
        await page.locator('#staffportal-auth-mount .sp-remember input').check();
        assert.ok(await page.locator('#staffportal-auth-mount .sp-remember input').isChecked(),'remember toggled');
        await page.locator('#staffportal-auth-mount .sp-forgot').click();
        await page.locator('#staffportal-auth-mount.sp-auth-mode-forgot').waitFor({timeout:10000});
        const forgotText=await page.locator('#staffportal-auth-mount').innerText();
        assert.ok(/password|recover|account/i.test(forgotText),'forgot screen has content');
        await page.screenshot({path:path.join(OUT,'forgot-'+width+'x'+height+'.jpg'),type:'jpeg',quality:62,fullPage:true});
        const back = page.locator('#staffportal-auth-mount .usp-back-link').first();
        if(await back.count()) await back.click();
        else {
          const candidate=page.getByRole('button',{name:/back to sign.?in/i}).first();
          if(await candidate.count()) await candidate.click();
        }
        await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor({timeout:10000});
        await page.locator('#staffportal-auth-mount .sp-auth-tabs button').nth(1).click();
        await page.locator('#staffportal-auth-mount.sp-auth-mode-create').waitFor({timeout:10000});
        const name=page.getByRole('textbox',{name:/first name/i}).first();
        await name.fill('Ada');
        const firstStyles=await name.evaluate(el=>({color:getComputedStyle(el).color,font:getComputedStyle(el).fontSize,value:el.value}));
        assert.equal(firstStyles.value,'Ada','Create Account typed text visible');
        await page.screenshot({path:path.join(OUT,'create-'+width+'x'+height+'.jpg'),type:'jpeg',quality:62,fullPage:true});
        if([3840,1920,390].includes(width)) {
          const next=()=>page.locator('#staffportal-auth-mount .usp-auth-form .usp-primary-button').first();
          await page.getByRole('textbox',{name:/last name/i}).fill('Okon');
          await next().click();
          await page.locator('#staffportal-auth-mount .usp-auth-panel[data-auth-mode="signup-contact"]').waitFor();
          await page.locator('#staffportal-auth-mount input[autocomplete="email"]').fill('ada@example.org');
          await next().click();
          await page.locator('#staffportal-auth-mount .usp-auth-panel[data-auth-mode="signup-username"]').waitFor();
          await page.locator('#staffportal-auth-mount input[autocomplete="username"]').fill('adaokon26');
          await next().click();
          await page.locator('#staffportal-auth-mount .usp-auth-panel[data-auth-mode="signup-account"]').waitFor();
          const passwords=page.locator('#staffportal-auth-mount input[autocomplete="new-password"]');
          assert.equal(await passwords.count(),2,'signup password and confirmation fields');
          await passwords.nth(0).fill('SecureTest#123');
          await passwords.nth(1).fill('SecureTest#123');
          assert.ok(await next().isEnabled(),'password requirements satisfied');
          await passwords.nth(1).focus();
          const passwordFocus=await passwords.nth(1).evaluate(el=>({
            inputColor:getComputedStyle(el).color,
            inputOutlineStyle:getComputedStyle(el).outlineStyle,
            shellOutlineStyle:getComputedStyle(el.closest('.usp-password-field')).outlineStyle,
            shellOutlineWidth:getComputedStyle(el.closest('.usp-password-field')).outlineWidth
          }));
          assert.equal(passwordFocus.inputColor,'rgb(245, 250, 255)','signup password text remains legible');
          assert.equal(passwordFocus.inputOutlineStyle,'none','signup password has no inner focus ring');
          assert.equal(passwordFocus.shellOutlineStyle,'solid','signup wrapper owns the focus ring');
          const accountMetrics=await page.locator('#staffportal-auth-mount').evaluate(el=>({clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,fields:[...el.querySelectorAll('input')].map(x=>({type:x.type,color:getComputedStyle(x).color,font:getComputedStyle(x).fontSize}))}));
          if(width>=1920) assert.ok(accountMetrics.scrollHeight<=accountMetrics.clientHeight+3,'signup password stage must not clip on desktop');
          await page.screenshot({path:path.join(OUT,'create-password-'+width+'x'+height+'.jpg'),type:'jpeg',quality:62,fullPage:true});
          await next().click();
          await page.locator('#staffportal-auth-mount .usp-auth-panel[data-auth-mode="signup-work"]').waitFor();
          await page.screenshot({path:path.join(OUT,'create-work-'+width+'x'+height+'.jpg'),type:'jpeg',quality:62,fullPage:true});
          console.log('PASS create-wizard '+width+'x'+height+' staged password fields accessible');
        }
        results.push({viewport:width+'x'+height,ok:true,metrics,createFirstName:firstStyles,exceptions});
        assert.equal(exceptions.length,0,'javascript exceptions');
        console.log('PASS '+width+'x'+height+' auth='+metrics.root.w+'x'+metrics.root.h+' providers='+metrics.providers.length+' scroll='+metrics.body.scrollWidth+'x'+metrics.body.scrollHeight+' focus='+metrics.focus.shellOutlineWidth);
      } catch(error) {
        results.push({viewport:width+'x'+height,ok:false,error:String(error),stack:String(error.stack||'').slice(0,1000),exceptions});
        console.error('FAIL '+width+'x'+height+': '+error.message);
      } finally {await page.close();}
    }
  }finally{await browser.close();await server.close();}
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({results,warnings},null,2));
  console.log('REPORT '+path.join(OUT,'report.json'));
  console.log('SUMMARY '+results.filter(x=>x.ok).length+'/'+results.length+' passed, warnings='+warnings.length);
  if(results.some(x=>!x.ok))process.exitCode=1;
})().catch(e=>{console.error('QA_FATAL',e.stack||e);process.exitCode=2;});