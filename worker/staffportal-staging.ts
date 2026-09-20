import { getEnhancedSessionContext } from './auth-context-v2.js';
import { routeCommunications } from './communications-service.js';
import { routeCommunicationsWebhook, type CommunicationsWebhookEnv } from './communications-webhook.js';

interface Env extends CommunicationsWebhookEnv {
  AI?: Ai;
  SOCIAL_AI_MODEL?: string;
}

const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  },
});

function secure(response:Response){
  const headers=new Headers(response.headers);
  headers.set('referrer-policy','no-referrer');
  headers.set('x-frame-options','DENY');
  headers.set('x-content-type-options','nosniff');
  headers.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      return secure(json({ok:true,service:'daenem-staffportal-api-staging',stage:'staging'}));
    }

    if(url.pathname==='/api/communications/webhooks/whatsapp'){
      const response=await routeCommunicationsWebhook(request,env);
      return secure(response||json({error:'Webhook route not found.'},404));
    }

    if(url.pathname.startsWith('/api/communications/')){
      const context=await getEnhancedSessionContext(request,env);
      if(!context)return secure(json({error:'Authentication required.'},401));
      const response=await routeCommunications(request,env,context);
      return secure(response||json({error:'Communications route not found.'},404));
    }

    return secure(json({error:'Not found.'},404));
  },
};
