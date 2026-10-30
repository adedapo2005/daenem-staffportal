// REVIEW-ONLY StaffPortal owner media publication control; NOT mounted into deployed runtime.
// Server must obtain SessionContext using canonical getSessionContext; never from request headers.
import { hasPermission, type SessionContext } from './auth';

const REQUIRED_PERMISSION='staffportal.media.publish';
const MAX_IMAGE_BYTES=12_000_000;
const ASSET_KEY=/^[A-Za-z0-9_.-]{1,120}$/;
const PRIVATE_PIN=/^staffportal\/approved-v180\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.(webp|png|jpg|jpeg)$/;
const noStore={'cache-control':'no-store','content-type':'application/json; charset=utf-8',
  'x-content-type-options':'nosniff'};
const response=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:noStore});
type D1DB = {
  prepare(sql:string): {
    bind(...values:unknown[]):{first<T>():Promise<T|null>;run():Promise<{success:boolean;meta?:{changes:number}}>};
  };
};
interface PrivateObject {size:number;httpMetadata?:{contentType?:string};arrayBuffer():Promise<ArrayBuffer>}
interface PublicationEnv {
  DB:D1DB;
  FILES?:{get(key:string):Promise<PrivateObject|null>};
  STAFF_PORTAL_FRONTEND_ORIGIN?:string;
}
type PublicationRow={
  asset_key:string;qa_status:string;display_enabled:number;publication_version:number;
  image_r2_key:string;image_sha256:string;image_bytes:number;image_mime:string;
};
function explicitlyGranted(c:SessionContext|null):boolean{
  return !!c && c.employee?.status==='active' && typeof c.sessionId==='string' && c.sessionId.length>0 &&
    // Owner/Admin roles do not bypass explicit per-module permissions.
    hasPermission(c,REQUIRED_PERMISSION,'manage');
}
async function boundedJsonText(request:Request,maxBytes=1200):Promise<string|null>{
  const size=Number(request.headers.get('content-length'));
  if(Number.isFinite(size)&&size>maxBytes)return null;
  if(!request.body)return '';
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];
  let length=0;
  try{
    while(true){
      const part=await reader.read();
      if(part.done)break;
      length+=part.value.byteLength;
      if(length>maxBytes){await reader.cancel().catch(()=>undefined);return null;}
      chunks.push(part.value);
    }
  }finally{reader.releaseLock();}
  const buf=new Uint8Array(length);
  let offset=0;
  for(const b of chunks){buf.set(b,offset);offset+=b.byteLength;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch{return null;}
}
function secureOrigin(request:Request,env:PublicationEnv):boolean{
  const from=request.headers.get('origin');
  if(!from)return false; // Browser mutation must present its origin.
  const allowed=(env.STAFF_PORTAL_FRONTEND_ORIGIN||'')
    .split(',').map(x=>x.trim()).filter(Boolean);
  return from===new URL(request.url).origin||allowed.includes(from);
}
function validPin(r:PublicationRow):boolean {
  const match=PRIVATE_PIN.exec(r.image_r2_key||'');
  if(!match||typeof r.image_sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.image_sha256))return false;
  if(match[1]!==r.image_sha256.slice(0,2)||match[2]!==r.image_sha256)return false;
  const mime=match[3]==='webp'?'image/webp':match[3]==='png'?'image/png':'image/jpeg';
  return mime===r.image_mime && Number.isSafeInteger(r.image_bytes) &&
    r.image_bytes>0 && r.image_bytes<=MAX_IMAGE_BYTES;
}
async function verifyPrivateFile(env:PublicationEnv,r:PublicationRow):Promise<boolean>{
  if(!validPin(r)||!env.FILES)return false;
  const o=await env.FILES.get(r.image_r2_key);
  if(!o || o.size!==r.image_bytes || o.httpMetadata?.contentType!==r.image_mime)return false;
  const bytes=new Uint8Array(await o.arrayBuffer());
  if(bytes.byteLength!==r.image_bytes)return false;
  const sha=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const digest=Array.from(sha,b=>b.toString(16).padStart(2,'0')).join('');
  return digest===r.image_sha256;
}
export async function routeV180OwnerPublication(
  request:Request,env:PublicationEnv,context:SessionContext,
  // Revalidate with canonical getSessionContext immediately before D1 mutation,
  // so a permission or session revocation during an R2 await wins.
  revalidate:()=>Promise<SessionContext|null>,
):Promise<Response|null>{
  const url=new URL(request.url);
  const namespace='/api/owner-studio/media/';
  const prefix=namespace+'publication/';
  if(!url.pathname.startsWith(namespace))return null;
  // Own the full publication namespace: URL normalization or malformed paths
  // must not fall through to the SPA or an unrelated private API handler.
  if(!url.pathname.startsWith(prefix))return response(404,{error:'Not found.'});
  const rawKey=url.pathname.slice(prefix.length);
  if(!ASSET_KEY.test(rawKey)||url.search)return response(404,{error:'Not found.'});
  if(request.method!=='POST')return response(405,{error:'Method not allowed.'});
  if(!explicitlyGranted(context))return response(403,{error:'Publication permission required.'});
  if(!secureOrigin(request,env))return response(403,{error:'Origin not permitted.'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')){
    return response(415,{error:'JSON required.'});
  }
  const raw=await boundedJsonText(request);
  if(raw===null)return response(413,{error:'Invalid publication request.'});
  let body:unknown;
  try{body=JSON.parse(raw)}catch{return response(400,{error:'Invalid publication request.'})}
  if(!body||typeof body!=='object'||Array.isArray(body))return response(400,{error:'Invalid publication request.'});
  const input=body as Record<string,unknown>;
  const fields=Object.keys(input).sort().join(',');
  if(fields!=='action,expectedVersion,reason')return response(400,{error:'Unexpected publication fields.'});
  const action=input.action;
  const version=input.expectedVersion;
  const reason=input.reason;
  if(action!=='revoke'&&action!=='restore')return response(400,{error:'Unknown publication action.'});
  if(!Number.isSafeInteger(version)||typeof version!=='number'||version<1||version>1_000_000_000){
    return response(400,{error:'Invalid publication version.'});
  }
  if(typeof reason!=='string'||reason.trim().length<12||reason.length>400||/[\u0000-\u001f\u007f-\u009f]/u.test(reason)){
    return response(400,{error:'A valid reason is required.'});
  }
  try{
    const r=await env.DB.prepare(
      'SELECT asset_key,qa_status,display_enabled,publication_version,image_r2_key,image_sha256,image_bytes,image_mime FROM staffportal_v180_media_publication WHERE asset_key=? LIMIT 1'
    ).bind(rawKey).first<PublicationRow>();
    if(!r)return response(404,{error:'Not found.'});
    if(r.publication_version!==version)return response(409,{error:'Publication changed. Refresh the record.'});
    if(action==='revoke'){
      if(!['approved','approved_v179'].includes(r.qa_status)||r.display_enabled!==1)
        return response(409,{error:'Publication changed. Refresh the record.'});
    }else{
      if(r.qa_status!=='revoked'||r.display_enabled!==0)
        return response(409,{error:'Publication changed. Refresh the record.'});
      // A reapproval must never bring a missing or tampered R2 asset public.
      if(!await verifyPrivateFile(env,r))return response(503,{error:'Approved media unavailable.'});
    }
    const latest=await revalidate();
    if(!explicitlyGranted(latest)||latest!.employee.id!==context.employee.id||
       latest!.sessionId!==context.sessionId)return response(403,{error:'Publication permission required.'});
    const nextStatus=action==='revoke'?'revoked':'approved';
    const nextEnabled=action==='revoke'?0:1;
    const updated=await env.DB.prepare(
      `UPDATE staffportal_v180_media_publication
        SET qa_status=?, display_enabled=?, publication_version=publication_version+1,
            changed_by=?, change_reason=?,updated_at=CURRENT_TIMESTAMP
        WHERE asset_key=? AND publication_version=? AND qa_status=? AND display_enabled=?`
    ).bind(nextStatus,nextEnabled,latest!.employee.id,reason.trim(),
      rawKey,version,r.qa_status,r.display_enabled).run();
    if(!updated.success || updated.meta?.changes!==1)
      return response(409,{error:'Publication changed. Refresh the record.'});
    return response(200,{ok:true,assetKey:rawKey,action,
      publicationVersion:version+1,enabled:nextEnabled===1});
  }catch{return response(503,{error:'Publication temporarily unavailable.'})}
}
