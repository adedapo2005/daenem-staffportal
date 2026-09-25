import { getSessionContext, routeAuth } from './auth.js';
import { getEnhancedSessionContext } from './auth-context-v2.js';
import { routePasswordAuth, type PasswordAuthEnv } from './password-auth.js';
import { routeAdmin } from './admin.js';
import { routeCommunications } from './communications-service.js';
import { routeCommunicationsWebhook, type CommunicationsWebhookEnv } from './communications-webhook.js';

interface Env extends CommunicationsWebhookEnv, PasswordAuthEnv {
  AI?: Ai;
  SOCIAL_AI_MODEL?: string;
  STAFF_PORTAL_FRONTEND_ORIGIN?: string;
}

const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  },
});

const DEFAULT_FRONTEND_ORIGIN='https://daenem-staffportal-premium-lab.daenem-group-9873.chatgpt.site';

function corsOrigin(request:Request,env:Env){
  const origin=request.headers.get('origin');
  const allowed=(env.STAFF_PORTAL_FRONTEND_ORIGIN||DEFAULT_FRONTEND_ORIGIN)
    .split(',')
    .map(value=>value.trim())
    .filter(Boolean);
  return origin&&allowed.includes(origin)?origin:null;
}

function secure(response:Response,request:Request,env:Env){
  const headers=new Headers(response.headers);
  headers.set('referrer-policy','no-referrer');
  headers.set('x-frame-options','DENY');
  headers.set('x-content-type-options','nosniff');
  headers.set('cache-control','no-store');
  const origin=corsOrigin(request,env);
  if(origin){
    headers.set('access-control-allow-origin',origin);
    headers.set('access-control-allow-credentials','true');
    headers.append('vary','Origin');
    const cookie=headers.get('set-cookie');
    if(cookie)headers.set('set-cookie',cookie.replace(/;\s*SameSite=Lax/ig,'; SameSite=None'));
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function preflight(request:Request,env:Env){
  const origin=corsOrigin(request,env);
  if(!origin)return secure(json({error:'Origin not allowed.'},403),request,env);
  const headers=new Headers({
    'access-control-allow-origin':origin,
    'access-control-allow-credentials':'true',
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'Accept, Content-Type',
    'access-control-max-age':'600',
  });
  headers.set('vary','Origin');
  return secure(new Response(null,{status:204,headers}),request,env);
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(request.method==='OPTIONS')return preflight(request,env);
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      return secure(json({ok:true,service:'daenem-staffportal-api-staging',stage:'staging'}),request,env);
    }

    const passwordAuthResponse=await routePasswordAuth(request,env);
    if(passwordAuthResponse)return secure(passwordAuthResponse,request,env);

    const authResponse=await routeAuth(request,env);
    if(authResponse)return secure(authResponse,request,env);

    if(url.pathname==='/api/communications/webhooks/whatsapp'){
      const response=await routeCommunicationsWebhook(request,env);
      return secure(response||json({error:'Webhook route not found.'},404),request,env);
    }

    if(url.pathname.startsWith('/api/admin/')){
      const context=await getSessionContext(request,env);
      if(!context)return secure(json({error:'Authentication required.'},401),request,env);
      const response=await routeAdmin(request,env,context);
      return secure(response||json({error:'Admin route not found.'},404),request,env);
    }

    if(url.pathname.startsWith('/api/communications/')){
      const context=await getEnhancedSessionContext(request,env);
      if(!context)return secure(json({error:'Authentication required.'},401),request,env);
      const response=await routeCommunications(request,env,context);
      return secure(response||json({error:'Communications route not found.'},404),request,env);
    }

    return secure(json({error:'Not found.'},404),request,env);
  },
};
