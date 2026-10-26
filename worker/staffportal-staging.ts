import runtimeHandler from './runtime';
import { routeWorkspaceShell } from './workspace-route';
import type { AuthEnv } from './auth';
import { routeCloudflareV180Media, type PreprodMediaEnv } from './v180-cloudflare-public-media';
import { routeOwnerStudioV180Media } from './v180-media-publication-admin';
import type { StagingQaEnv } from './staging-qa-seeder';

interface Env extends AuthEnv, Omit<PreprodMediaEnv, 'DB'> {
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
  headers.set('x-staffportal-auth-runtime','worker-password-auth-v1');
  if(!(new URL(request.url).pathname==='/api/assets'&&response.status===200))headers.set('cache-control','no-store');
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
    'access-control-allow-methods':'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers':'Accept, Content-Type, Idempotency-Key',
    'access-control-max-age':'600',
  });
  headers.set('vary','Origin');
  return secure(new Response(null,{status:204,headers}),request,env);
}

async function routeLegacySceneryAsset(request:Request,env:Env):Promise<Response|null>{
  if(!env.ASSETS || (request.method!=='GET' && request.method!=='HEAD'))return null;
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/assets/scenery/') || !url.pathname.endsWith('.jpg'))return null;
  // The approved V115 source keeps its original .jpg references, while the
  // deployed runtime contains the verified responsive WebP derivatives.
  const stem=url.pathname.slice(0,-4);
  const assetUrl=new URL(`${stem}-1280.webp`,url);
  const response=await env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
  return response.status===200?response:null;
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    if(new URL(request.url).pathname==='/api/staging/qa-fixture'){
      const { routeStagingQaSeeder }=await import('./staging-qa-seeder');
      const qaResponse=await routeStagingQaSeeder(request,env as unknown as StagingQaEnv);
      if(qaResponse)return qaResponse;
    }
    if(request.method==='OPTIONS')return preflight(request,env);
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      return secure(json({ok:true,service:'daenem-staffportal-api-staging',stage:'staging'}),request,env);
    }

    const ownerMediaResponse=await routeOwnerStudioV180Media(request,env);
    if(ownerMediaResponse)return secure(ownerMediaResponse,request,env);

    const publicAssetsResponse=await routeCloudflareV180Media(request,env);
    if(publicAssetsResponse)return secure(publicAssetsResponse,request,env);

    const legacySceneryResponse=await routeLegacySceneryAsset(request,env);
    if(legacySceneryResponse)return secure(legacySceneryResponse,request,env);

    // Reuse the canonical session, company-hint and exact-asset guard. Never
    // let a direct URL fall through to an unprotected SPA asset.
    if(env.ASSETS){
      const workspaceResponse=await routeWorkspaceShell(request,env as unknown as Parameters<typeof routeWorkspaceShell>[1]);
      if(workspaceResponse)return secure(workspaceResponse,request,env);
    }

    // Keep staging on the same complete, authorization-aware route tree as the
    // current Worker. Wrangler Assets serves the built client after API routing.
    const runtimeEnv=env as unknown as Parameters<typeof runtimeHandler.fetch>[1];
    const response=await runtimeHandler.fetch(request,runtimeEnv,ctx);
    return secure(response,request,env);
  },
};
