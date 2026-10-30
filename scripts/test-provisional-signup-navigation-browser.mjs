import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const vite=await createServer({
  configFile:'vite.signin-browser-qa.config.ts',
  server:{host:'127.0.0.1',port:0,strictPort:false},
  logLevel:'error',
});
await vite.listen();
const port=vite.httpServer.address().port;
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const assistedByWhatsApp of [false,true]){
    const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[],traffic=[];
    let verified=false;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',async route=>{
      const request=route.request();
      const url=new URL(request.url());
      const pathname=url.pathname;
      let body={};
      try{body=request.postDataJSON()||{};}catch{}
      traffic.push({path:pathname,method:request.method()});
      let status=200,payload={};
      if(pathname==='/api/auth/password-policy')payload={
        minimumLength:8,maximumLength:128,
        requiresUppercase:true,requiresLowercase:true,requiresNumber:true,requiresSymbol:true,
      };
      else if(pathname==='/api/auth/me')payload=verified
        ? {authenticated:true,context:{
          sessionId:'synthetic-session',employee:{
            id:'synthetic-provisional',displayName:'Ada Okon',status:'provisional',email:'ada@example.test',
          },
          companies:[{id:'company-print',code:'PRINT',name:'Printing',primary:true}],
          roles:[{id:'role-provisional',code:'provisional',name:'Provisional',companyId:'company-print'}],
          permissions:{'profile.access':'edit'},
          companyPermissions:{'company-print':{'profile.access':'edit'}},
        }}
        : {authenticated:false};
      else if(pathname==='/api/auth/signup/start')payload={
        challengeId:'synthetic-signup',destination:'ad***@example.test',message:'Email verification code sent',
      };
      else if(pathname==='/api/auth/signup/whatsapp/start')payload={
        challengeId:'synthetic-whatsapp',destination:'+23480****0000',message:'WhatsApp verification sent',
      };
      else if(pathname==='/api/auth/signup/whatsapp/verify')payload={
        ok:true,phoneVerified:true,next:'email_verification_required',
      };
      else if(pathname==='/api/auth/signup/verify'){
        if(body.code!=='123456'){
          status=401;payload={error:'Incorrect email verification code'};
        }else{
          verified=true;
          payload={
            ok:true,authenticated:true,status:'provisional',next:'/workspace/',
            message:'Your identity is verified. Complete your profile in the provisional workspace while management reviews your application.',
          };
        }
      }
      await route.fulfill({
        status,contentType:'application/json',body:JSON.stringify(payload),
        headers:{'cache-control':'no-store'},
      });
    });
    try{
      await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded',timeout:30000});
      const tabs=page.locator('.sp-auth-tabs button');
      await tabs.nth(1).waitFor({timeout:20000});
      await tabs.nth(1).click();
      if(assistedByWhatsApp){
        await page.locator('.usp-social-whatsapp').click();
        assert.equal(await page.locator('.usp-social-whatsapp').getAttribute('aria-pressed'),'true');
      }
      await page.getByRole('textbox',{name:'First Name'}).fill('Ada');
      await page.getByRole('textbox',{name:'Last Name'}).fill('Okon');
      const next=()=>page.locator('.usp-auth-form .usp-primary-button');
      await next().click();
      await page.getByRole('textbox',{name:'Personal Email'}).fill('ada@example.test');
      await page.getByRole('textbox',{name:/phone|whatsapp/i}).fill('08012345678');
      await next().click();
      await page.getByRole('textbox',{name:'Create Username'}).fill('adaokon21');
      await next().click();
      const passwords=page.locator('input[autocomplete="new-password"]');
      await passwords.nth(0).fill('StrongPass123!');
      await passwords.nth(1).fill('StrongPass123!');
      await next().click();
      await next().click();
      await page.locator('.usp-auth-destination').waitFor({timeout:10000});
      if(assistedByWhatsApp){
        await page.getByRole('button',{name:/Send WhatsApp code/i}).click();
        await page.getByRole('textbox',{name:'WhatsApp code'}).fill('123456');
        await page.getByRole('button',{name:/Verify WhatsApp/}).click();
        await page.getByText('WhatsApp contact verified',{exact:true}).waitFor();
      }
      const emailCode=page.locator('.usp-auth-form input[autocomplete="one-time-code"]').last();
      await emailCode.fill('000000');
      await page.locator('.usp-auth-form button[type="submit"]').last().click();
      await page.waitForTimeout(1350);
      assert.equal(verified,false);
      assert.equal(new URL(page.url()).pathname,'/','incorrect OTP cannot navigate');
      await emailCode.fill('123456');
      await page.locator('.usp-auth-form button[type="submit"]').last().click();
      await page.waitForURL(url=>url.pathname==='/workspace/',{timeout:15000});
      assert.equal(verified,true);
      assert.equal(traffic.filter(t=>t.path==='/api/auth/signup/verify').length,2);
      assert.equal(errors.length,0,'browser page errors '+errors.join('; '));
      console.log('PASS: '+(assistedByWhatsApp?'WhatsApp-assisted':'Local')+
        ' completed email OTP redirects to authenticated provisional workspace, invalid OTP denied');
    }finally{
      await context.close();
    }
  }
}finally{
  await browser?.close();
  await vite.close();
}
