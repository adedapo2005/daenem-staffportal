// REVIEW ONLY: drop-in replacement for Backend A Owner Studio media publication API.
// Preserves existing GET/PUT URLs while replacing role bypass with explicit grants.
import {getSessionContext,hasPermission,type AuthEnv,type SessionContext} from './auth';
import {routeV180OwnerPublication} from './v180-owner-publication-review';
interface SecureEnv extends AuthEnv{
 FILES?:{get(key:string):Promise<{
   size:number;httpMetadata?:{contentType?:string};arrayBuffer():Promise<ArrayBuffer>
 }|null>};
 STAFF_PORTAL_FRONTEND_ORIGIN?:string;
}
const grant='staffportal.media.publish';
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff'}});
async function boundedBody(request:Request):Promise<string|null>{
 const declared=Number(request.headers.get('content-length')||0);
 if(declared>1200)return null;
 if(!request.body)return '';
 const reader=request.body.getReader();let length=0;const chunks:Uint8Array[]=[];
 try{
  while(true){
   const chunk=await reader.read();
   if(chunk.done)break;
   length+=chunk.value.byteLength;
   if(length>1200){await reader.cancel().catch(()=>undefined);return null}
   chunks.push(chunk.value);
  }
 }finally{reader.releaseLock()}
 const all=new Uint8Array(length);let offset=0;
 for(const c of chunks){all.set(c,offset);offset+=c.byteLength}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(all)}catch{return null}
}
function authorized(c:SessionContext|null):boolean{
 return !!c&&c.employee.status==='active'&&!!c.sessionId&&
   hasPermission(c,grant,'manage');
}
export async function routeOwnerStudioV180Media(
 request:Request,env:SecureEnv
):Promise<Response|null>{
 const pathname=new URL(request.url).pathname;
 const parent='/api/owner/studio/media';
 if(pathname!==parent&&!pathname.startsWith(parent+'/'))return null;
 const url=new URL(request.url);
 const isList=pathname===parent;
 const match=/^\/api\/owner\/studio\/media\/([A-Za-z0-9_.-]{1,120})$/.exec(pathname);
 if(url.search||(!isList&&!match))return reply(404,{error:'Not found.'});
 if((isList&&request.method!=='GET')||(!isList&&request.method!=='PUT'))
  return reply(405,{error:'Method not allowed.'});
 let initial:SessionContext|null;
 try{initial=await getSessionContext(request,env)}catch{return reply(401,{error:'Authentication required.'})}
 if(!initial)return reply(401,{error:'Authentication required.'});
 if(!authorized(initial))return reply(403,{error:'Publication permission required.'});
 if(isList){
  try{
   const results=await env.DB.prepare(
    `SELECT asset_key,id,category,purpose,qa_status,display_enabled,sort_order,
     zoom,focal_x,focal_y,master_width,master_height,publication_version
     FROM staffportal_v180_media_publication ORDER BY sort_order,asset_key LIMIT 100`
   ).all<Record<string,unknown>>();
   const latest=await getSessionContext(request,env);
   if(!authorized(latest)||latest!.employee.id!==initial.employee.id||
       latest!.sessionId!==initial.sessionId)return reply(403,{error:'Publication permission required.'});
   return reply(200,{assets:results.results||[]});
  }catch{return reply(503,{error:'Publication list temporarily unavailable.'})}
 }
 // Explicitly reject simple-form and cross-origin mutation before reading body.
 const origin=request.headers.get('origin');
 const allowedOrigins=(env.STAFF_PORTAL_FRONTEND_ORIGIN||'')
   .split(',').map(x=>x.trim()).filter(Boolean);
 if(!origin||(origin!==url.origin&&!allowedOrigins.includes(origin)))
  return reply(403,{error:'Origin not permitted.'});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))
  return reply(415,{error:'JSON required.'});
 const text=await boundedBody(request);
 if(text===null)return reply(413,{error:'Invalid publication request.'});
 let body:unknown;
 try{body=JSON.parse(text)}catch{return reply(400,{error:'Invalid publication request.'})}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'Invalid publication request.'});
 const input=body as Record<string,unknown>;
 if(Object.keys(input).sort().join(',')!=='displayEnabled,expectedVersion,qaStatus,reason')
  return reply(400,{error:'Unexpected publication fields.'});
 const action=input.qaStatus==='revoked'&&input.displayEnabled===false?'revoke':
   input.qaStatus==='approved'&&input.displayEnabled===true?'restore':null;
 if(!action)return reply(400,{error:'Invalid publication transition.'});
 const updatedRequest=new Request(
  url.origin+'/api/owner-studio/media/publication/'+match![1],{
   method:'POST',
   headers:{origin, 'content-type':'application/json'},
   body:JSON.stringify({action,expectedVersion:input.expectedVersion,reason:input.reason}),
 });
 const result=await routeV180OwnerPublication(
  updatedRequest,env as Parameters<typeof routeV180OwnerPublication>[1],
  initial,async()=>getSessionContext(request,env));
 if(result===null)return reply(503,{error:'Publication unavailable.'});
 if(result.status!==200)return result;
 const response=await result.json() as {assetKey:string;publicationVersion:number;enabled:boolean};
 return reply(200,{ok:true,assetKey:response.assetKey,
  qaStatus:action==='revoke'?'revoked':'approved',
  displayEnabled:response.enabled,publicationVersion:response.publicationVersion});
}
