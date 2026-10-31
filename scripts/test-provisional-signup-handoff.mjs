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
function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
}
async function within(promise,label){
  let timeout;
  try{
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error(label)),1000);}),
    ]);
  }finally{clearTimeout(timeout);}
}
let count=0;
async function check(name,fn){await fn();count++;console.log('PASS '+name)}
function submit(form){const fn=listeners.get('submit');assert.ok(fn,'handler registered');fn({target:form});}
try{
  await check('V180 locked form selectors match the narrowly targeted OTP handoff',async()=>{
    assert.match(lockedSignIn,/signupStep === 'verify' && <form className="usp-auth-form"/);
    assert.match(lockedSignIn,/className="usp-auth-destination"/);
    assert.match(lockedSignIn,/autoComplete="one-time-code"/);
    assert.match(appEntry,/observeProvisionalSignupHandoff/);
    assert.match(appEntry,/auth\.setContext\(context\)/);
    assert.match(appEntry,/window\.history\.replaceState\(window\.history\.state, '', '\/profile'\)/);
    assert.match(appEntry,/window\.dispatchEvent\(new Event\('daenem-auth-changed'\)\)/);
    assert.doesNotMatch(appEntry,/location[.]assign[(][^)]*\/workspace\//,
      'signup handoff must satisfy the unchanged deployment navigation guard');
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
    const verifiedContext=context();
    const dispose=observeProvisionalSignupHandoff(value=>{
      opened++;assert.strictEqual(value,verifiedContext);
    },{
      probe:async()=>++calls===1?null:verifiedContext,
      attempts:4,intervalMs:0,
    });
    submit(new FakeForm());
    submit(new FakeForm());
    await tick();
    assert.equal(opened,1);
    assert.equal(calls,2);
    dispose();
  });
  await check('Corrected OTP retry gets a fresh budget while the old final probe is in flight',async()=>{
    const oldFinalStarted=deferred(),oldFinalResult=deferred();
    const retryStarted=deferred(),retryResult=deferred(),workspaceOpened=deferred();
    let calls=0,opened=0;
    const expected=context();
    const dispose=observeProvisionalSignupHandoff(value=>{
      opened++;assert.equal(value,expected);workspaceOpened.resolve();
    },{
      attempts:2,intervalMs:0,
      probe:async()=>{
        calls++;
        if(calls===1)return null;
        if(calls===2){oldFinalStarted.resolve();return oldFinalResult.promise;}
        retryStarted.resolve();return retryResult.promise;
      },
    });
    try{
      submit(new FakeForm());
      await within(oldFinalStarted.promise,'original final probe did not start');
      submit(new FakeForm());
      oldFinalResult.resolve(null);
      await within(retryStarted.promise,'corrected OTP retry lost its fresh probe budget');
      retryResult.resolve(expected);
      await within(workspaceOpened.promise,'successful corrected OTP did not open workspace');
      assert.equal(calls,3);assert.equal(opened,1);
    }finally{dispose();oldFinalResult.resolve(null);retryResult.resolve(null);}
  });
  await check('Duplicate submit burst keeps one probe in flight and one terminal handoff',async()=>{
    const probeStarted=deferred(),probeResult=deferred(),workspaceOpened=deferred();
    let calls=0,opened=0,inFlight=0,maxInFlight=0;
    const dispose=observeProvisionalSignupHandoff(()=>{
      opened++;workspaceOpened.resolve();
    },{
      attempts:2,intervalMs:0,
      probe:async()=>{
        calls++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
        probeStarted.resolve();
        try{return await probeResult.promise;}finally{inFlight--;}
      },
    });
    try{
      submit(new FakeForm());
      await within(probeStarted.promise,'probe did not start');
      for(let i=0;i<20;i++)submit(new FakeForm());
      await tick(0);
      assert.equal(calls,1);assert.equal(maxInFlight,1);
      probeResult.resolve(context());
      await within(workspaceOpened.promise,'workspace did not open');
      await tick(0);
      for(let i=0;i<20;i++)submit(new FakeForm());
      await tick(0);
      assert.equal(calls,1);assert.equal(opened,1);assert.equal(maxInFlight,1);
    }finally{dispose();probeResult.resolve(null);}
  });
  await check('Cleanup ignores a late successful in-flight probe',async()=>{
    const probeStarted=deferred(),probeResult=deferred();
    let calls=0,opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      attempts:2,intervalMs:0,
      probe:async()=>{calls++;probeStarted.resolve();return probeResult.promise;},
    });
    try{
      submit(new FakeForm());
      await within(probeStarted.promise,'probe did not start');
      dispose();probeResult.resolve(context());
      await tick(0);
      assert.equal(calls,1);assert.equal(opened,0);
      assert.equal(listeners.has('submit'),false);
    }finally{dispose();probeResult.resolve(null);}
  });
  await check('Provisional applicant without Profile Edit cannot navigate',async()=>{
    let opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      probe:async()=>context({profile:'view'}),attempts:2,intervalMs:0,
    });
    submit(new FakeForm());await tick();assert.equal(opened,0);dispose();
  });
  await check('Effective approval-level Profile Access preserves existing Edit-capable handoff',async()=>{
    let opened=0;
    const dispose=observeProvisionalSignupHandoff(()=>opened++,{
      probe:async()=>context({profile:'approve'}),attempts:2,intervalMs:0,
    });
    submit(new FakeForm());await tick();assert.equal(opened,1);dispose();
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
