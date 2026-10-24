/* Manual Chrome QA for the approved StaffPortal Sign-In, staging-free.
 * Run from repository root with an installed Playwright runtime. */
const { chromium } = require('playwright');
const { createServer } = require('vite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const SCREENS = ({'4k':[[3840,2160]],'1':[[1920,1080]],'compact':[[1366,768]],'short':[[1280,720]],'mobile':[[390,844]],'tablet':[[1024,768],[820,1180]]}[process.env.QA_SINGLE]) || [[3840,2160],[1920,1080],[1366,768],[1280,720],[1024,768],[820,1180],[390,844]];
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
        if(pathname==='/api/auth/login' && route.request().method()==='POST') {
          return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'The username/email or password is incorrect.'})});
        }
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
          const providers=[...root.querySelectorAll('.sp-auth-provider-list .sp-social-button')].map(el=>({text:(el.textContent||'').trim(),rect:rect(el),font:getComputedStyle(el.querySelector('.sp-social-label')||el).fontSize}));
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
        const brandClearance=await page.evaluate(()=>{
          const root=document.querySelector('#staffportal-auth-mount');
          const top=el=>el.getBoundingClientRect().top;
          const bottom=el=>el.getBoundingClientRect().bottom;
          const chip=root.querySelector('.sp-secure-chip');
          const logo=root.querySelector('.sp-auth-logo-v101');
          const eyebrow=root.querySelector('.sp-auth-copy .sp-eyebrow');
          const mark=root.querySelector('.sp-auth-logo-v101 .sp-brand-mark-wrap');
          return {chipGap:+(top(eyebrow)-bottom(chip)).toFixed(1),logoGap:+(top(eyebrow)-bottom(logo)).toFixed(1),markInside:+(top(mark)-top(root)).toFixed(1),chipX:+chip.getBoundingClientRect().x.toFixed(1),logoX:+logo.getBoundingClientRect().x.toFixed(1)};
        });
        console.log('BRAND_CLEARANCE '+width+' '+JSON.stringify(brandClearance));
        if(width>=2100) {
          assert.ok(brandClearance.chipGap>=8,'4K secure badge must not overlap portal heading');
          assert.ok(brandClearance.logoGap>=4,'4K brand must not overlap portal heading');
          assert.ok(brandClearance.chipX>brandClearance.logoX+40,'4K badge must align beside logo');
        } else if(width>=1680) {
          assert.ok(brandClearance.chipGap>=8,'standard desktop secure badge must clear portal heading');
          assert.ok(brandClearance.logoGap>=6,'standard desktop logo must clear portal heading');
          assert.ok(brandClearance.markInside>=2,'standard desktop logo mark must not clip past top of auth card');
          assert.ok(brandClearance.chipX>brandClearance.logoX+75,'standard desktop badge must sit beside logo');
        } else if(width>=1280) {
          assert.ok(brandClearance.markInside>=0,'compact desktop logo mark must not clip at card edge');
          assert.ok(brandClearance.chipGap>=0,'compact desktop badge must clear heading');
        } else {
          assert.ok(brandClearance.chipGap>=4,'tablet/mobile secure badge must clear portal heading');
          assert.ok(brandClearance.logoGap>=4,'tablet/mobile logo must clear portal heading');
          assert.ok(brandClearance.chipX>brandClearance.logoX+45,'tablet/mobile badge must sit beside logo');
        }
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
        if(width>=1280 && width<1680) {
          const providerFit=await page.locator('#staffportal-auth-mount .sp-social-button').evaluateAll(elements=>elements.map(el=>{
            const label=el.querySelector('.sp-social-label'),icon=el.querySelector('.sp-social-icon');
            const b=el.getBoundingClientRect(),l=label.getBoundingClientRect(),i=icon.getBoundingClientRect(),st=getComputedStyle(el);
            const range=document.createRange();range.selectNodeContents(label);
            return {name:label.textContent,display:st.display,flexDirection:st.flexDirection,grid:st.gridTemplateColumns,
              buttonWidth:+b.width.toFixed(1),labelWidth:+l.width.toFixed(1),realTextWidth:+range.getBoundingClientRect().width.toFixed(1),
              labelRight:+l.right.toFixed(1),buttonRight:+b.right.toFixed(1),iconRight:+i.right.toFixed(1),iconBottom:+i.bottom.toFixed(1),labelTop:+l.top.toFixed(1)};
          }));
          console.log('PROVIDER_FIT '+width+' '+JSON.stringify(providerFit));
          for(const provider of providerFit) {
            assert.ok(provider.labelRight<=provider.buttonRight-1,'provider label fully fits inside '+provider.name);
            assert.ok(provider.iconBottom<=provider.labelTop+1,'provider mark stacks cleanly above '+provider.name);
          }
        }
        if (width>=2100) {
          assert.ok(parseFloat(metrics.email.font)>=18,'4K email field is comfortably readable');
          assert.ok(parseFloat(metrics.panelLayout.labelFont)>=16,'4K field label is comfortably readable');
          assert.ok(parseFloat(metrics.providers[0].font)>=16,'4K social buttons are comfortably readable');
        } else if (width>=1680) {
          assert.ok(parseFloat(metrics.email.font)>=14,'full desktop email text must reach 14px');
          assert.ok(parseFloat(metrics.panelLayout.labelFont)>=13,'full desktop label must reach 13px');
          assert.ok(parseFloat(metrics.providers[0].font)>=12,'full desktop provider text must reach 12px');
        } else if (width>=1280) {
          assert.ok(parseFloat(metrics.email.font)>=12.5,'compact desktop email text must reach 12.5px');
          assert.ok(parseFloat(metrics.panelLayout.labelFont)>=12,'compact desktop label must reach 12px');
          assert.ok(parseFloat(metrics.providers[0].font)>=10.5,'compact desktop provider text must reach 10.5px');
        } else {
          assert.ok(parseFloat(metrics.email.font)>=13.5,'tablet/mobile email text must reach 13.5px');
          assert.ok(parseFloat(metrics.panelLayout.labelFont)>=12.5,'tablet/mobile label must reach 12.5px');
          assert.ok(parseFloat(metrics.providers[0].font)>=13,'tablet/mobile social labels must reach 13px');
        }
        if(width>=1280 && width<1680) {
          const geometry=await page.locator('#staffportal-auth-mount').evaluate(el=>({
            scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
            children:[...el.querySelectorAll('.sp-auth-topline,.sp-auth-copy,.sp-auth-tabs,.sp-auth-form,.sp-auth-divider,.sp-auth-provider-list,.sp-install-card-v101,.sp-auth-policy')].map(c=>{
              const r=c.getBoundingClientRect(), s=getComputedStyle(c);
              return {name:c.className,top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height),display:s.display};
            })
          }));
          console.log('COMPACT_GEOMETRY '+width+' '+JSON.stringify(geometry));
        }
        assert.ok(metrics.rootScrollHeight<=metrics.rootClientHeight+3,'auth has no internal scroll or clipping');
        assert.ok(metrics.body.scrollWidth<=width+2,'no page horizontal overflow');
        assert.ok(metrics.root.x>=-2 && metrics.root.right<=width+2,'auth container inside viewport');
        if(width>=1024 && width!==1024){
          if(metrics.body.scrollHeight>height+2) warnings.push(width+'x'+height+' desktop page scroll: '+metrics.body.scrollHeight);
        }
        if(metrics.rootScrollHeight>metrics.rootClientHeight+3) warnings.push(width+'x'+height+' auth internal overflow: '+metrics.rootScrollHeight+'/'+metrics.rootClientHeight);
        await page.screenshot({path:path.join(OUT,'signin-'+width+'x'+height+'.jpg'),type:'jpeg',quality:62,fullPage:true});
        // Retain the newer Pre-Production empty-input guards without letting
        // their message create an overflowing overlay in narrow desktop rails.
        await page.locator('#staffportal-auth-mount .sp-primary-button').click();
        const emptyAlert=page.locator('#staffportal-auth-mount .sp-inline-auth-error[role="alert"]');
        await emptyAlert.waitFor({timeout:10000});
        assert.match(await emptyAlert.innerText(),/enter email and password/i,'empty-password validation displayed clearly');
        if(width>=1280) assert.ok(await page.locator('#staffportal-auth-mount').evaluate(el=>el.scrollHeight<=el.clientHeight+3),'empty submission must not clip auth');
        assert.equal(await page.locator('#staffportal-auth-mount .sp-auth-notice').count(),0,'empty submission uses compact accessible status');
        await page.locator('#staffportal-auth-mount .sp-social-button').filter({hasText:'WhatsApp'}).click();
        assert.match(await emptyAlert.innerText(),/enter credentials for whatsapp/i,'new WhatsApp prerequisite is accessible without overflow');
        if(width>=1280) assert.ok(await page.locator('#staffportal-auth-mount').evaluate(el=>el.scrollHeight<=el.clientHeight+3),'WhatsApp prerequisite must not clip auth');
        await email.fill('tester@example.org');
        await password.fill('TestPassword123!');
        await page.locator('.sp-show-password').click();
        assert.equal(await password.getAttribute('type'),'text','show password toggle');
        await page.locator('.sp-show-password').click();
        assert.equal(await password.getAttribute('type'),'password','hide password toggle');
        await page.locator('#staffportal-auth-mount .sp-remember input').check();
        assert.ok(await page.locator('#staffportal-auth-mount .sp-remember input').isChecked(),'remember toggled');
        assert.equal(await page.locator('#staffportal-auth-mount .sp-forgot').count(),1,'direct Forgot Password remains');
        await page.locator('#staffportal-auth-mount .sp-primary-button').click();
        const inlineError=page.locator('#staffportal-auth-mount .sp-inline-auth-error[role="alert"]');
        await inlineError.waitFor({timeout:10000});
        if(width===1366) await page.screenshot({path:path.join(OUT,'inline-login-error-1366x768.jpg'),type:'jpeg',quality:68,fullPage:true});
        assert.match(await inlineError.innerText(),/sign-in failed.*recover below/i,'generic inline recovery alert is announced');
        assert.equal(await password.inputValue(),'','failed login clears password, avoiding accidental repeated submit');
        assert.equal(await page.locator('#staffportal-auth-mount .sp-auth-notice.is-error').count(),0,'failed login does not insert a large overlay');
        const errorLayout=await page.locator('#staffportal-auth-mount').evaluate(el=>({
          clientHeight:el.clientHeight,scrollHeight:el.scrollHeight
        }));
        console.log('ERROR_LAYOUT '+width+' '+JSON.stringify(errorLayout));
        if(width>=1280) assert.ok(errorLayout.scrollHeight<=errorLayout.clientHeight+3,'inline error must fit without desktop internal scrolling');
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
        if(width===390) {
          await page.evaluate(()=>window.scrollTo(0,1650));
          const dock=page.locator('[data-mobile-auth-dock="true"]');
          await dock.waitFor({timeout:10000});
          await page.screenshot({path:path.join(OUT,'mobile-sticky-dock-390x844.jpg'),type:'jpeg',quality:68,fullPage:false});
          assert.equal(await dock.locator('button').count(),2,'mobile offers both auth modes');
          await dock.getByRole('button',{name:'Sign In'}).click();
          await page.locator('#staffportal-auth-mount.sp-auth-mode-signin').waitFor({timeout:10000});
          await page.waitForTimeout(250);
          assert.equal(await dock.count(),0,'mobile dock hides when auth panel is visible');
          await page.evaluate(()=>window.scrollTo(0,1650));
          await dock.waitFor({timeout:10000});
          await dock.getByRole('button',{name:'Create Account'}).click();
          await page.locator('#staffportal-auth-mount.sp-auth-mode-create').waitFor({timeout:10000});
          await page.waitForTimeout(250);
          assert.equal(await dock.count(),0,'Create Account returns to visible auth panel');
          console.log('PASS mobile sticky Sign In and Create Account navigation');
        } else {
          assert.equal(await page.locator('[data-mobile-auth-dock="true"]').count(),0,'dock never covers desktop/tablet');
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