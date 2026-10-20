import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

globalThis.crypto ||= webcrypto;

const BASE = 'https://staffportal-staging-qa.example';
const TENANT_A = 'c1a11f0c-84ed-454e-b1a2-197025d85dc1';
const TENANT_B = '6f01e327-b29e-47c1-bd62-cfbf5f1f9a17';
const OID = '77df1b05-6895-4ba6-aeb5-152934a6ad20';
const CLIENT = '09119f91-41b9-4945-877b-41e48b387083';
const ISSUER_A = 'https://login.microsoftonline.com/' + TENANT_A + '/v2.0';

let passed = 0;
function test(label, condition) {
  assert.ok(condition, label);
  passed++;
  console.log('PASS:', label);
}
async function esm(entry, mockAuth = false) {
  const plugin = {
    name: 'mock-auth-contract',
    setup(b) {
      if (!mockAuth) return;
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: 'auth-test-contract', namespace: 'testing' }));
      b.onLoad({ filter: /.*/, namespace: 'testing' }, () => ({
        loader: 'js',
        contents: [
          'export async function getSessionContext(){return globalThis.__testStaffSession || null}',
          'export async function logSecurity(env,request,type,options){globalThis.__testEvents.push({type,options})}',
          'export function sessionCookie(r,token,age){return "daenem_workforce_session="+token+"; HttpOnly; SameSite=Lax"}',
        ].join('\n'),
      }));
    },
  };
  const out = await build({
    entryPoints: [entry], bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022',
    plugins: [plugin], logLevel: 'silent',
  });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].contents).toString('base64'));
}

const rules = await esm('worker/microsoft-organizations.ts');
test('staging organizations requires explicit opt-in',
  rules.isOrganizationsStaging({ APP_STAGE: 'staging', MICROSOFT_AUTH_MODE: 'organizations' }) &&
  !rules.isOrganizationsStaging({ APP_STAGE: 'staging' }) &&
  !rules.isOrganizationsStaging({ APP_STAGE: 'production', MICROSOFT_AUTH_MODE: 'organizations' }) &&
  !rules.isOrganizationsStaging({ APP_STAGE: 'development', MICROSOFT_AUTH_MODE: 'organizations' }));

function identity(tenant = TENANT_A, oid = OID) {
  return { tid: tenant, oid, sub: 'stable-sub-1', ver: '2.0',
    iss: 'https://login.microsoftonline.com/' + tenant + '/v2.0' };
}
const validIdentity = rules.organizationIdentity(identity());
test('stable tenant and user ID recognized',
  validIdentity?.tenantId === TENANT_A && validIdentity?.objectId === OID);
test('consumer identity rejected',
  !rules.organizationIdentity(identity('9188040d-6c67-4c5b-b112-36a304b66dad')));
test('missing or invalid Microsoft object ID rejected',
  !rules.organizationIdentity({ ...identity(), oid: undefined }) &&
  !rules.organizationIdentity(identity(TENANT_A, 'not-a-guid')));
test('token issuer and tenant must agree',
  !rules.organizationIdentity({ ...identity(), iss: 'https://login.microsoftonline.com/' + TENANT_B + '/v2.0' }));
test('app-only and v1 tokens denied',
  !rules.organizationIdentity({ ...identity(), idtyp: 'app' }) &&
  !rules.organizationIdentity({ ...identity(), ver: '1.0' }));
test('signing key issuer must be tenant-bound',
  rules.organizationSigningKeyIssuerMatches('https://login.microsoftonline.com/{tenantid}/v2.0', validIdentity) &&
  rules.organizationSigningKeyIssuerMatches(ISSUER_A, validIdentity) &&
  !rules.organizationSigningKeyIssuerMatches('https://login.microsoftonline.com/' + TENANT_B + '/v2.0', validIdentity) &&
  !rules.organizationSigningKeyIssuerMatches(undefined, validIdentity));

const source = readFileSync('worker/provider-auth.ts', 'utf8');
const ui = readFileSync('src/auth.tsx', 'utf8');
test('legacy Google route remains available',
  source.includes("provider === 'google'") && source.includes('https://accounts.google.com/o/oauth2/v2/auth'));
test('multitenant authorization never uses email or preferred_username',
  source.includes('const linkedId = await linkedMicrosoftEmployee(env.DB, organization)') &&
  source.includes('Never grant access based on Microsoft email'));
test('self-service flow preserves original StaffPortal password and WhatsApp sign-in',
  ui.includes("window.location.assign('/api/auth/oauth/microsoft/link')") &&
  ui.includes('startWhatsAppSignIn()'));

const { routeProviderAuth } = await esm('worker/provider-auth.ts', true);
const pair = await webcrypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const encoder = new TextEncoder();
const asUrl = data => Buffer.from(data).toString('base64url');
async function makeJwt(payload) {
  const header = asUrl(JSON.stringify({ alg: 'RS256', kid: 'test-key-1', typ: 'JWT' }));
  const body = asUrl(JSON.stringify(payload));
  const signingInput = header + '.' + body;
  const sig = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, encoder.encode(signingInput));
  return signingInput + '.' + asUrl(new Uint8Array(sig));
}

function dbMock() {
  const employee = new Map();
  const links = new Map();
  const identities = new Map();
  let logins = 0;
  let linkTablePresent = true;
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ');
      return {
        async first() {
          // Cloudflare D1 permits unbound prepared SELECT.first().
          if (q.includes("FROM sqlite_master WHERE type='table'")) {
            return linkTablePresent ? { name: 'staffportal_external_identity_links' } : null;
          }
          return null;
        },
        bind(...args) {
          return {
            async first() {
              if (q.includes("FROM sqlite_master WHERE type='table'")) {
                return linkTablePresent ? { name: 'staffportal_external_identity_links' } : null;
              }
              if (q.includes("FROM auth_sessions WHERE id=?")) return { id: args[0] };
              if (q.includes('FROM staffportal_external_identity_links WHERE provider=')) {
                const l = employee.get(args[0]);
                return l ? {tenantId:l.tenantId,objectId:l.objectId,revokedAt:l.revokedAt||null}:null;
              }
              if (q.includes('FROM staffportal_external_identity_links l')) {
                const l = identities.get(args[0] + '/' + args[1]);
                return l && !l.revokedAt ? {employeeId:l.employeeId,status:l.status}:null;
              }
              if (q.includes('FROM app_settings WHERE setting_key')) return { setting_value: '12' };
              return null;
            },
            async run() {
              if (q.includes('INSERT OR IGNORE INTO staffportal_external_identity_links')) {
                const [,tid,oid,employeeId] = args;
                if (!employee.has(employeeId) && !identities.has(tid+'/'+oid)) {
                  const l={tenantId:tid,objectId:oid,employeeId,status:'active',revokedAt:null};
                  employee.set(employeeId,l);identities.set(tid+'/'+oid,l);
                }
              }
              if (q.includes('INSERT INTO auth_sessions')) logins++;
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { db, employee, identities, loginCount:()=>logins,
    setLinksAvailable(ready) { linkTablePresent = Boolean(ready); },
  };
}

function harness({ mode='organizations', stage='staging', keyIssuer='https://login.microsoftonline.com/{tenantid}/v2.0' } = {}) {
  const cached = new Map();
  const store = dbMock();
  const env = {
    APP_STAGE: stage, MICROSOFT_AUTH_MODE: mode, MICROSOFT_CLIENT_ID: CLIENT,
    MICROSOFT_CLIENT_SECRET: 'test-value-not-a-real-secret', MICROSOFT_TENANT_ID: TENANT_A,
    AUTH_PEPPER: 'test-only-signing-pepper', DB: store.db,
    SOCIAL_CACHE: {
      async get(k) { return cached.get(k) ?? null; },
      async put(k, v) { cached.set(k,v); },
      async delete(k) { cached.delete(k); },
    },
  };
  const oldFetch = globalThis.fetch;
  function intercept(tokenValue, issuer=keyIssuer) {
    globalThis.fetch = async function(url) {
      const addr = String(url);
      if (addr.endsWith('/token')) return new Response(JSON.stringify({access_token:'mock',id_token:tokenValue}),{
        status:200,headers:{'content-type':'application/json'},
      });
      if (addr.includes('/discovery/v2.0/keys')) return new Response(JSON.stringify({
        keys: [{ ...jwk,kid:'test-key-1',use:'sig',issuer }],
      }),{status:200,headers:{'content-type':'application/json'}});
      throw Error('Unexpected network access: '+addr);
    };
  }
  const restore = ()=>{globalThis.fetch=oldFetch;};
  const request = (path, init={}) => new Request(BASE+path,init);
  return { env,store,request,intercept,restore };
}

async function loginAttempt(options={}) {
  const h=harness(options);
  globalThis.__testStaffSession=null;
  globalThis.__testEvents=[];
  const start=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/start'),h.env);
  assert.equal(start.status,302);
  const authorize=new URL(start.headers.get('location'));
  const state=authorize.searchParams.get('state');
  const nonce=authorize.searchParams.get('nonce');
  const cookie=start.headers.get('set-cookie').split(';')[0];
  const payload={...identity(),iss:ISSUER_A,aud:CLIENT,nonce,iat:Math.floor(Date.now()/1000)-60,
    exp:Math.floor(Date.now()/1000)+600,email:'approved.staff@daenem.com',preferred_username:'approved.staff@daenem.com'};
  const jwt=await makeJwt({...payload,...(options.payload||{})});
  h.intercept(jwt,options.keyIssuer);
  try{
    const result=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/callback?state='+encodeURIComponent(state)+'&code=test-code',
      {headers:{cookie}}),h.env);
    return {result,h,authorize};
  }finally{h.restore();}
}

let x=await loginAttempt();
test('organizations authorize uses organization-only authority and least-privilege scopes',
  x.authorize.pathname.startsWith('/organizations/') &&
  x.authorize.searchParams.get('scope')==='openid profile email' &&
  x.authorize.searchParams.get('code_challenge_method')==='S256' &&
  !!x.authorize.searchParams.get('nonce') &&
  !!x.authorize.searchParams.get('state'));
test('forged matching employee email never authorizes unlinked external identity',
  new URL(x.result.headers.get('location')).searchParams.get('auth_error')==='microsoft_link_required' &&
  x.h.store.loginCount()===0);
x=await loginAttempt({payload:{tid:TENANT_B}});
test('mismatched tenant/issuer is rejected',
  new URL(x.result.headers.get('location')).searchParams.get('auth_error')==='invalid_provider_identity');
x=await loginAttempt({keyIssuer:'https://login.microsoftonline.com/'+TENANT_B+'/v2.0'});
test('signing key from wrong tenant is rejected',
  new URL(x.result.headers.get('location')).searchParams.get('auth_error')==='invalid_provider_identity');
x=await loginAttempt({payload:{aud:'different-app'}});
test('wrong application audience is rejected',
  new URL(x.result.headers.get('location')).searchParams.get('auth_error')==='invalid_provider_identity');
x=await loginAttempt({payload:{nonce:'wrong-nonce'}});
test('wrong nonce is rejected',
  new URL(x.result.headers.get('location')).searchParams.get('auth_error')==='invalid_provider_identity');
x=await loginAttempt({payload:{email:'another@malicious.example',preferred_username:'another@malicious.example'}});
test('different email makes no difference to linked-ID authorization',
  new URL(x.result.headers.get('location')).searchParams.get('auth_error')==='microsoft_link_required');

for(const stage of ['production','development']){
 const h=harness({stage});
 const response=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/start'),h.env);
 const u=new URL(response.headers.get('location'));
 test(stage+' environment ignores organizations flag and preserves single tenant',
   u.pathname.startsWith('/'+TENANT_A+'/oauth2/v2.0/authorize'));
}
{
 const h=harness({mode:'single_tenant'});
 const response=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/start'),h.env);
 test('staging without flag stays single tenant',
   new URL(response.headers.get('location')).pathname.startsWith('/'+TENANT_A+'/'));
 const off=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/link'),h.env);
 test('self-link page is unavailable when flag disabled',off.status===404);
}
{
 const h=harness();
 const denied=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/link/start',{
   method:'POST',headers:{origin:'https://attacker.invalid','content-type':'application/x-www-form-urlencoded'},
 }),h.env);
 test('link POST rejects cross-site origin',denied.status===403);
 const anonymous=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/link'),h.env);
 test('anonymous user cannot see account linking page',anonymous.status===302 &&
   new URL(anonymous.headers.get('location')).searchParams.get('auth_error')==='microsoft_link_requires_signin');
}

// A current StaffPortal login can pair the existing employee with their own
// immutable Microsoft identity, without creating a DAENEM Entra guest user.
{
  const h=harness();
  globalThis.__testStaffSession={
    sessionId:'existing-staff-session-1',
    employee:{id:'employee-1',status:'active'},
  };
  globalThis.__testEvents=[];
  const info=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/link'),h.env);
  test('existing employee can view bounded linking page',
    info.status===200 && (await info.text()).includes('Connect Microsoft work account'));

  const start=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/link/start',{
    method:'POST',
    headers:{origin:BASE,'content-type':'application/x-www-form-urlencoded',
      cookie:'daenem_workforce_session=existing'},
    body:'',
  }),h.env);
  const authorization=new URL(start.headers.get('location'));
  test('link flow requires explicit Microsoft account selection',
    start.status===302 && authorization.searchParams.get('prompt')==='select_account');
  const state=authorization.searchParams.get('state');
  const nonce=authorization.searchParams.get('nonce');
  const cookie=start.headers.get('set-cookie').split(';')[0]+'; daenem_workforce_session=existing';
  const jwt=await makeJwt({
    ...identity(TENANT_B),aud:CLIENT,nonce,iat:Math.floor(Date.now()/1000)-30,
    exp:Math.floor(Date.now()/1000)+450,email:'untrusted@whatever.example',
  });
  h.intercept(jwt);
  let result;
  try {
    result=await routeProviderAuth(
      h.request('/api/auth/oauth/microsoft/callback?state='+encodeURIComponent(state)+'&code=link-one',{
        headers:{cookie},
      }),h.env);
  }finally{h.restore();}
  const saved=h.store.employee.get('employee-1');
  test('verified Microsoft tenant and object ID link to existing StaffPortal employee only',
    saved?.tenantId===TENANT_B && saved?.objectId===OID &&
    result.status===302 && new URL(result.headers.get('location')).searchParams.get('result')==='linked');
  test('linking never manufactures new StaffPortal authentication sessions',
    h.store.loginCount()===0 && globalThis.__testEvents.some(x=>x.type==='microsoft_identity_linked'));

  const again=await rules.bindMicrosoftEmployeeIdentity(h.store.db,'employee-1',
    rules.organizationIdentity(identity(TENANT_A)));
  test('an existing employee link cannot be silently moved to another tenant',again==='conflict');

  globalThis.__testStaffSession=null;
  const linkedResponse=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/start'),h.env);
  const linkedAuthorize=new URL(linkedResponse.headers.get('location'));
  const linkedState=linkedAuthorize.searchParams.get('state');
  const token2=await makeJwt({
    ...identity(TENANT_B),aud:CLIENT,nonce:linkedAuthorize.searchParams.get('nonce'),
    iat:Math.floor(Date.now()/1000)-20,exp:Math.floor(Date.now()/1000)+300,
    email:'spoofed.employee@other.example',
  });
  h.intercept(token2);
  try{
    const callback=await routeProviderAuth(h.request(
      '/api/auth/oauth/microsoft/callback?state='+encodeURIComponent(linkedState)+'&code=sign-in',{
      headers:{cookie:linkedResponse.headers.get('set-cookie').split(';')[0]},
    }),h.env);
    test('linked external identity creates session for its existing StaffPortal employee',
      callback.status===302 && new URL(callback.headers.get('location')).pathname==='/workspace/' &&
      h.store.loginCount()===1);
  }finally{h.restore();}

  const forbidden=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/link/start',{
    method:'POST',headers:{origin:BASE,'content-type':'application/x-www-form-urlencoded'},
    body:'',
  }),h.env);
  test('linking without an existing StaffPortal session cannot start',new URL(forbidden.headers.get('location')).searchParams.get('error')==='microsoft_link_expired');

  saved.status='inactive';
  test('inactive linked employee cannot sign in',await rules.linkedMicrosoftEmployee(h.store.db,
    rules.organizationIdentity(identity(TENANT_B)))===null);
}

{
  const h=harness();
  h.store.setLinksAvailable(false);
  const start=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/start'),h.env);
  const location=new URL(start.headers.get('location'));
  test('missing staging migration fails closed before external Microsoft redirect',
    start.status===302 && location.hostname===new URL(BASE).hostname &&
    location.searchParams.get('auth_error')==='microsoft_links_unavailable');
  globalThis.__testStaffSession={
    sessionId:'staff-ready-1',employee:{id:'employee-1',status:'active'},
  };
  const link=await routeProviderAuth(h.request('/api/auth/oauth/microsoft/link'),h.env);
  test('account linking page returns safe service unavailable before migration',
    link.status===503 && !(await link.text()).includes('Connect Microsoft work account'));
  globalThis.__testStaffSession=null;
}
console.log('Microsoft organizations contract passed: '+passed+' checks');
