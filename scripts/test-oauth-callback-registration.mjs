import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../worker/provider-auth.ts',import.meta.url),'utf8');
const compiled = ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const applications=[];
const loaded={exports:{}};
new Function('module','exports','require',compiled)(loaded,loaded.exports,(name)=>{
  if(name==='./auth')return{
    logSecurity:async()=>{throw new Error('A pending applicant must not create a session');},
    sessionCookie:()=>{throw new Error('A pending applicant must not create a session');},
  };
  if(name==='./microsoft-account-link')return{
    sameOriginFormPost:()=>false,recentlyVerifiedStaffSession:async()=>null,
    linkRedirect:()=>{throw new Error('Link route not tested');},
    accountLinkPage:()=>{throw new Error('Link page not tested');},
  };
  if(name==='./microsoft-organizations')return{
    isOrganizationsStaging:(env)=>env.APP_STAGE==='staging'&&env.MICROSOFT_AUTH_MODE==='organizations',
    organizationIdentity:(p)=>p.tid&&p.oid?{
      tenantId:String(p.tid),objectId:String(p.oid),
      issuer:'https://login.microsoftonline.com/'+p.tid+'/v2.0',
    }:null,
    organizationSigningKeyIssuerMatches:()=>true,
    linkedMicrosoftEmployee:async()=>null,
    organizationsLinkStorageReady:async()=>true,
    linkedMicrosoftIdentityForEmployee:async()=>null,
    bindMicrosoftEmployeeIdentity:()=>{throw new Error('Cannot auto-link existing employee');},
  };
  if(name==='./oauth-provisional-signup')return{
    provisionOAuthApplicant:async (_env,applicant)=>{
      applications.push(applicant);return 'pending';
    },
    oauthApplicantPending:async()=>true,
  };
  throw new Error('Unexpected dependency '+name);
});
const {routeProviderAuth}=loaded.exports;
const keyPair=await crypto.subtle.generateKey({
  name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256',
},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keyPair.publicKey);
jwk.kid='synthetic-public-key';jwk.use='sig';
const b64=(input)=>Buffer.from(input).toString('base64url');
async function jwt(payload){
  const header=b64(JSON.stringify({alg:'RS256',kid:jwk.kid,typ:'JWT'}));
  const body=b64(JSON.stringify(payload));
  const input=header+'.'+body;
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(input));
  return input+'.'+b64(sig);
}
const cache=new Map();
const env={
  APP_STAGE:'staging',AUTH_PEPPER:'synthetic-strong-pepper',
  GOOGLE_CLIENT_ID:'google-test-client',GOOGLE_CLIENT_SECRET:'google-test-secret',
  MICROSOFT_CLIENT_ID:'microsoft-test-client',MICROSOFT_AUTH_MODE:'organizations',
  SOCIAL_CACHE:{
    async get(key){return cache.get(key)||null;},
    async put(key,value){cache.set(key,value);},
    async delete(key){cache.delete(key);},
  },
  DB:{ prepare(sql){return{bind(){return this;},async first(){return null;}};} },
};
const oldFetch=globalThis.fetch;
let context=null;
globalThis.fetch=async(url,opts)=>{
  const target=String(url);
  if(target.endsWith('/certs')||target.endsWith('/keys')){
    return Response.json({keys:[jwk]});
  }
  if(target.endsWith('/token')){
    assert.ok(opts.body.toString().includes('code_verifier='));
    return Response.json({access_token:'synthetic-token',id_token:await jwt(context.payload)});
  }
  if(target.includes('/userinfo')){
    return Response.json({sub:context.payload.sub,email:context.payload.email});
  }
  throw new Error('Unexpected OAuth mock request '+target);
};
try{
  let passed=0;
  async function oauth(provider,payload){
    const origin='https://staffportal.test';
    const start=await routeProviderAuth(new Request(origin+'/api/auth/oauth/'+provider+'/start'),env);
    assert.equal(start.status,302);
    const authorization=new URL(start.headers.get('location'));
    assert.ok(authorization.searchParams.get('state'));
    const nonce=authorization.searchParams.get('nonce');
    const audience=authorization.searchParams.get('client_id');
    const issuer=provider==='google'?'https://accounts.google.com':
      'https://login.microsoftonline.com/tenant-synthetic/v2.0';
    context={payload:{sub:'synthetic-subject',aud:audience,iss:issuer,nonce,
      exp:Math.floor(Date.now()/1000)+300,iat:Math.floor(Date.now()/1000)-10,...payload}};
    const callback=new URL(origin+'/api/auth/oauth/'+provider+'/callback');
    callback.searchParams.set('code','synthetic-code');
    callback.searchParams.set('state',authorization.searchParams.get('state'));
    const cookie=start.headers.get('set-cookie').split(';')[0];
    const response=await routeProviderAuth(new Request(callback,{headers:{cookie}}),env);
    return response;
  }
  let result=await oauth('google',{email:'new-google@example.test',
    email_verified:true,name:'New Google'});
  assert.equal(result.status,303);
  assert.match(result.headers.get('location'),/registration-status.*result=pending/);
  assert.equal(applications.length,1);
  assert.equal(applications[0].provider,'google');
  assert.equal(applications[0].email,'new-google@example.test');
  console.log('PASS: signed Google callback registers applicant without session');passed++;

  const status=await routeProviderAuth(new Request(
    'https://staffportal.test/api/auth/oauth/registration-status?result=pending&provider=google'
  ),env);
  assert.equal(status.status,200);
  assert.match(await status.text(),/management approval/);
  console.log('PASS: pending registration confirmation is accessible without Sign-In changes');passed++;

  result=await oauth('microsoft',{tid:'tenant-synthetic',oid:'object-synthetic',
    preferred_username:'new-microsoft@example.test',name:'New Microsoft'});
  assert.equal(result.status,303);
  assert.match(result.headers.get('location'),/registration-status.*result=pending/);
  assert.equal(applications.length,2);
  assert.equal(applications[1].microsoftTenantId,'tenant-synthetic');
  assert.equal(applications[1].microsoftObjectId,'object-synthetic');
  console.log('PASS: signed Microsoft callback registers immutable tenant-object identity');passed++;

  result=await oauth('google',{email:'unverified@example.test',email_verified:false});
  assert.equal(result.status,302);
  assert.match(result.headers.get('location'),/provider_email_unverified/);
  assert.equal(applications.length,2);
  console.log('PASS: Google unverified email cannot register');passed++;

  result=await oauth('microsoft',{tid:'tenant-synthetic',oid:'object-2',
    preferred_username:'not-an-email'});
  assert.equal(result.status,303);
  assert.match(result.headers.get('location'),/email_required/);
  assert.equal(applications.length,2);
  console.log('PASS: Microsoft unusable email cannot register');passed++;

  console.log(JSON.stringify({ok:true,tests:passed}));
}finally{globalThis.fetch=oldFetch;}
