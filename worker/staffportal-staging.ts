import runtimeHandler from './runtime';
import { getSessionContext, type AuthEnv } from './auth';

interface Env {
  STAFF_PORTAL_FRONTEND_ORIGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  },
});

function corsOrigin(request:Request,env:Env){
  const origin=request.headers.get('origin');
  const allowed=(env.STAFF_PORTAL_FRONTEND_ORIGIN||'')
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
    'access-control-allow-headers':'Accept, Content-Type, Idempotency-Key',
    'access-control-max-age':'600',
  });
  headers.set('vary','Origin');
  return secure(new Response(null,{status:204,headers}),request,env);
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    if(request.method==='OPTIONS')return preflight(request,env);
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      return secure(json({ok:true,service:'daenem-staffportal-api-staging',stage:'staging'}),request,env);
    }

    // Keep the authenticated app shell behind the canonical session lookup.
    // Never let a direct URL fall through to an unprotected SPA asset.
    if(request.method==='GET'&&(url.pathname==='/workspace'||url.pathname==='/workspace/')){
      const runtimeEnv=env as unknown as AuthEnv;
      const context=await getSessionContext(request,runtimeEnv);
      if(!context)return secure(Response.redirect(new URL('/staff-portal-signin',url),302),request,env);
      if(!env.ASSETS)return secure(json({error:'Not found.'},404),request,env);
      const assetRequest=new Request(new URL('/workspace/index.html',url),{
        method:'GET',
        headers:{accept:'text/html'},
      });
      const asset=await env.ASSETS.fetch(assetRequest);
      return secure(asset,request,env);
    }

    // Keep staging on the same complete, authorization-aware route tree as the
    // current Worker. Wrangler Assets serves the built client after API routing.
    const runtimeEnv=env as unknown as Parameters<typeof runtimeHandler.fetch>[1];
    const response=await runtimeHandler.fetch(request,runtimeEnv,ctx);
    return secure(response,request,env);
  },
};
