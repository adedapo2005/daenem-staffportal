import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/provisional-signup-handoff.ts',import.meta.url),'utf8');
const lockedSignIn = readFileSync(new URL('../src/auth.tsx',import.meta.url),'utf8');
const appEntry = readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const transpiled = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const loaded={exports:{}};
new Function('module','exports','require',transpiled)(loaded,loaded.exports,()=>{throw Error('unexpected runtime dependency');});
const {observeProvisionalSignupHandoff}=loaded.exports;
const savedDocument=globalThis.document;
const savedHTMLFormElement=globalThis.HTMLFormElement;
const savedFetch=globalThis.fetch;
const listeners=new Map();
globalThis.document={
  addEventListener(name,callback,capture){assert.equal(name,'submit');assert.equal(capture,true);listeners.set(name,callback);},
  removeEventListener(name,callback,capture){assert.equal(capture,true);if(listeners.get(name)===callback)listeners.delete(name);},
};
class FakeForm{
  constructor({signup=true,code=true}={}){this.signup=signup;this.code=code;}
  classList={contains:name=>name==='usp-auth-form'};
  querySelector(selector){
    if(selector==='.usp-auth-destination')return this.signup?{}:null;
    if(selector==='input[autocomplete="one-time-code"]')return this.code?{}:null;
    return null;
  }
}
globalThis.HTMLFormElement=FakeForm;
const context=({status='provisional',role='provisional',profile='edit'}={})=>({
  sessionId:'session-synthetic',
  employee:{id:'employee-synthetic',status,displayName:'New Employee'},
  companies:[{id:'company-print',code:'PRINT',name:'Printing',primary:true}],
  roles:[{id:'role-provisional',code:role,name:'Provisional',companyId:'company-print'}],
  permissions:{'profile.access':profile},
});
const tick=(ms=30)=>new Promise(resolve=>setTimeout(resolve,ms));
let count=0;
async function check(name,fn){await fn();count++;console.log('PASS '+name)}
function submit(form){const fn=listeners.get('submit');assert.ok(fn,'handler registered');fn({target:form});}
try{
  await check('V180 locked form selectors match the narrowly targeted OTP handoff',async()=>{
    assert.match(lockedSignIn,/signupStep === 'verify' && <form className="usp-auth-form"/);
    assert.match(lockedSignIn,/className="usp-auth-destination"/);
    assert.match(lockedSignIn,/autoComplete="one-time-code"/);
    assert.match(appEntry,/observeProvisionalSignupHandoff/);
    assert.match(appEntry,/window.location.assign\('\/workspace\/'\)/);
  });
  await check('Ordinary Sign-In and non-OTP forms never trigger a session probe',async()=>{
    let calls=0;
    const dispose=observeProvisionalSignupHandoff(()=>{throw Error('unexpected navigation');},{
      probe:async()=>{calls++;return context();},attempts:2,intervalMs:0,
    });
    submit(new FakeForm({signup:false}));
    submit(new FakeForm({code:false}));
    await tick();
    assert.equal(calls,0);
    dispose();assert.equal(listeners.has('submit'),false);
  });
  await check('Failed email verification cannot navigate without a real session',async()=>{
    let opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      probe:async()=>null,attempts:2,intervalMs:0,
    });
    submit(new FakeForm());await tick();
    assert.equal(opened,0);
    dispose();
  });
  await check('Verified provisional applicant opens workspace exactly once',async()=>{
    let calls=0,opened=0;
    const dispose=observeProvisionalSignupHandoff(value=>{
      opened++;assert.equal(value.employee.status,'provisional');
    },{
      probe:async()=>++calls===1?null:context(),
      attempts:4,intervalMs:0,
    });
    submit(new FakeForm());
    submit(new FakeForm());
    await tick();
    assert.equal(opened,1);
    assert.equal(calls,2);
    dispose();
  });
  await check('Provisional applicant without Profile Edit cannot navigate',async()=>{
    let opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      probe:async()=>context({profile:'view'}),attempts:2,intervalMs:0,
    });
    submit(new FakeForm());await tick();assert.equal(opened,0);dispose();
  });
  await check('Extra role cannot masquerade as provisional workspace grant',async()=>{
    let opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      probe:async()=>context({role:'manager'}),attempts:2,intervalMs:0,
    });
    submit(new FakeForm());await tick();assert.equal(opened,0);dispose();
  });
  await check('Existing active session does not trigger an unsolicited redirect',async()=>{
    let opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      probe:async()=>context({status:'active'}),attempts:2,intervalMs:0,
    });
    submit(new FakeForm());await tick();assert.equal(opened,0);dispose();
  });
  await check('Canonical probe uses secure same-origin credentialed no-store request',async()=>{
    const observed=[];let opened=0;
    globalThis.fetch=async(url,options)=>{
      observed.push({url,options});
      return Response.json({authenticated:true,context:context()});
    };
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{attempts:2,intervalMs:0});
    submit(new FakeForm());await tick();
    assert.equal(opened,1);
    assert.equal(observed[0].url,'/api/auth/me');
    assert.equal(observed[0].options.credentials,'include');
    assert.equal(observed[0].options.cache,'no-store');
    assert.equal(observed[0].options.method,'GET');
    dispose();
  });
  await check('Cleanup prevents any additional probes or navigation',async()=>{
    let calls=0,opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      probe:async()=>{calls++;return context();},attempts:5,intervalMs:20,
    });
    submit(new FakeForm());dispose();await tick(60);
    assert.equal(calls,0);assert.equal(opened,0);assert.equal(listeners.has('submit'),false);
  });
  console.log(JSON.stringify({ok:true,passed:count}));
}finally{
  globalThis.document=savedDocument;
  globalThis.HTMLFormElement=savedHTMLFormElement;
  globalThis.fetch=savedFetch;
}
