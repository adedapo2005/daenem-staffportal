// QA-only integration candidate. Authoritative data: Cloudflare staging D1 + private R2.
// No Sites, external media fetch, client-supplied grants, or public bucket URLs.
const IMAGE_ROOT = '/api/assets/images/';
const R2_ROOT = 'staffportal/approved-v180/sha256/';
const IMAGE_LIMIT = 12_000_000;
const MAX_INFLIGHT_IMAGE_IO = 3;
const MAX_WAITING_IMAGE_IO = 64;
let activeImageIO = 0;
const imageWaiters:Array<()=>void> = [];
// One Worker isolate must not read/hash many full-resolution photos at once.
// Waiting is bounded; overload fails closed rather than exhausting memory.
async function withImageBudget<T>(work:()=>Promise<T>):Promise<T|null> {
  if(activeImageIO >= MAX_INFLIGHT_IMAGE_IO){
    if(imageWaiters.length >= MAX_WAITING_IMAGE_IO)return null;
    await new Promise<void>(resolve=>imageWaiters.push(resolve));
  }else activeImageIO++;
  try{return await work();}
  finally{
    const next=imageWaiters.shift();
    if(next)next();else activeImageIO--;
  }
}
const PUBLIC_LIMIT = 100;
const FILE_RE = /^staffportal\/approved-v180\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.(webp|png|jpg|jpeg)$/;
const ASSET_RE = /^[A-Za-z0-9_.-]{1,120}$/;
type Status = 'approved'|'approved_v179'|'pending_review'|'draft_review'|'revoked';
export type MediaRow = {
  id:string; asset_key:string; category:string; purpose:string;
  qa_status:Status; display_enabled:number; has_default_image:number;
  sort_order:number; zoom:number|null; focal_x:number|null; focal_y:number|null;
  master_width:number|null; master_height:number|null;
  image_r2_key:string; image_sha256:string; image_bytes:number; image_mime:string;
  publication_version:number;
};
type D1Reader = {
  prepare(sql:string): {
    all<T>():Promise<{results:T[]}>;
    bind(...values:unknown[]):{first<T>():Promise<T|null>};
  };
};
type R2Meta = {size:number;httpMetadata?:{contentType?:string}};
type R2Body = R2Meta & {arrayBuffer():Promise<ArrayBuffer>};
type PrivateR2 = {get(key:string):Promise<R2Body|null>;head(key:string):Promise<R2Meta|null>};
export interface PreprodMediaEnv {DB?:D1Reader; FILES?:PrivateR2}

const headers = {'cache-control':'no-store','x-content-type-options':'nosniff'};
const neutral = (status:number):Response => new Response(JSON.stringify({error:status===503?'Media temporarily unavailable.':'Not found.'}),{
  status,headers:{...headers,'content-type':'application/json; charset=utf-8'},
});
const allowed = (r:MediaRow):boolean =>
  (r.qa_status==='approved'||r.qa_status==='approved_v179') && r.display_enabled===1;
const finite = (v:number|null,min:number,max:number):boolean =>
  v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
function validRow(r:MediaRow):boolean {
  if(!r||typeof r!=='object'||!ASSET_RE.test(r.asset_key)||typeof r.id!=='string'||r.id.length>180)return false;
  if(r.category!=='global'&&r.category!=='widget')return false;
  if(typeof r.purpose!=='string'||r.purpose.length>250)return false;
  if(!Number.isSafeInteger(r.sort_order)||r.sort_order<0||r.sort_order>10000)return false;
  if(!finite(r.zoom,0,20)||!finite(r.focal_x,0,1)||!finite(r.focal_y,0,1))return false;
  if(!finite(r.master_width,1,20000)||!finite(r.master_height,1,20000))return false;
  if(r.has_default_image!==0&&r.has_default_image!==1)return false;
  if(!Number.isSafeInteger(r.publication_version)||r.publication_version<1)return false;
  if(!Number.isSafeInteger(r.image_bytes)||r.image_bytes<1||r.image_bytes>IMAGE_LIMIT)return false;
  if(!/^[a-f0-9]{64}$/.test(r.image_sha256))return false;
  if(!['image/webp','image/png','image/jpeg'].includes(r.image_mime))return false;
  if(typeof r.image_r2_key!=='string'||!r.image_r2_key.startsWith(R2_ROOT))return false;
  const m=FILE_RE.exec(r.image_r2_key);
  if(!m||m[1]!==r.image_sha256.slice(0,2)||m[2]!==r.image_sha256)return false;
  const expected=m[3]==='webp'?'image/webp':m[3]==='png'?'image/png':'image/jpeg';
  return expected===r.image_mime;
}
const SELECT = 'id,asset_key,category,purpose,qa_status,display_enabled,has_default_image,sort_order,zoom,focal_x,focal_y,master_width,master_height,image_r2_key,image_sha256,image_bytes,image_mime,publication_version';
const TABLE = 'staffportal_v180_media_publication';
async function current(env:PreprodMediaEnv,key:string):Promise<MediaRow|null> {
  const row=await env.DB!.prepare(`SELECT ${SELECT} FROM ${TABLE} WHERE asset_key=? AND qa_status IN ('approved','approved_v179') AND display_enabled=1 LIMIT 1`)
    .bind(key).first<MediaRow>();
  return row && allowed(row) && validRow(row)?row:null;
}
async function collection(env:PreprodMediaEnv):Promise<Response> {
  const response=await env.DB!.prepare(`SELECT ${SELECT} FROM ${TABLE} WHERE qa_status IN ('approved','approved_v179') AND display_enabled=1 ORDER BY sort_order,asset_key LIMIT 101`).all<MediaRow>();
  const rows=response?.results;
  if(!Array.isArray(rows)||rows.length>PUBLIC_LIMIT||rows.some(r=>!allowed(r)||!validRow(r)))return neutral(503);
  const unique=new Set(rows.map(r=>r.asset_key));
  if(unique.size!==rows.length)return neutral(503);
  const assets=rows.map(r=>({
    id:r.id,asset_key:r.asset_key,category:r.category,purpose:r.purpose,
    image_url:`${IMAGE_ROOT}${r.asset_key}/image`,
    default_image_url:r.has_default_image?`${IMAGE_ROOT}${r.asset_key}/default`:undefined,
    zoom:r.zoom,focal_x:r.focal_x,focal_y:r.focal_y,display_enabled:true,
    master_width:r.master_width,master_height:r.master_height,
  }));
  return new Response(JSON.stringify({assets}),{status:200,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
}
const matched = (a:MediaRow,b:MediaRow):boolean =>
  allowed(b)&&validRow(b)&&a.asset_key===b.asset_key &&
  a.publication_version===b.publication_version &&
  a.image_r2_key===b.image_r2_key && a.image_sha256===b.image_sha256 &&
  a.image_bytes===b.image_bytes && a.image_mime===b.image_mime &&
  a.has_default_image===b.has_default_image;
function imageHeaders(r:MediaRow):Headers {
  return new Headers({...headers,'content-type':r.image_mime,'content-length':String(r.image_bytes),
    'cross-origin-resource-policy':'same-origin'});
}
async function serveImage(env:PreprodMediaEnv,key:string,field:'image'|'default',method:string):Promise<Response> {
  const row=await current(env,key);
  if(!row|| (field==='default'&&!row.has_default_image))return neutral(404);
  if(!env.FILES)return neutral(503);
  if(method==='HEAD') {
    const object=await env.FILES.head(row.image_r2_key);
    if(!object)return neutral(503);
    if(object.size!==row.image_bytes||object.httpMetadata?.contentType!==row.image_mime)return neutral(502);
    const latest=await current(env,key);
    if(!latest||!matched(row,latest))return neutral(404);
    return new Response(null,{status:200,headers:imageHeaders(row)});
  }
  const object=await env.FILES.get(row.image_r2_key);
  if(!object)return neutral(503);
  if(object.size!==row.image_bytes||object.httpMetadata?.contentType!==row.image_mime)return neutral(502);
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.byteLength!==row.image_bytes)return neutral(502);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const hex=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  if(hex!==row.image_sha256)return neutral(502);
  // A revocation, replacement or publication-version update that happened
  // during the R2 await must not publish the now-stale image.
  const latest=await current(env,key);
  if(!latest||!matched(row,latest))return neutral(404);
  return new Response(bytes as Uint8Array<ArrayBuffer>,{status:200,headers:imageHeaders(row)});
}
export async function routeCloudflareV180Media(request:Request,env:PreprodMediaEnv):Promise<Response|null> {
  const url=new URL(request.url);
  const list=url.pathname==='/api/assets';
  const isImage=url.pathname.startsWith(IMAGE_ROOT);
  // Own the complete API namespace. Do not let malformed image routes fall
  // through to Wrangler's SPA HTML-200 fallback.
  if(!list&&!url.pathname.startsWith('/api/assets/'))return null;
  if(!list&&!isImage)return neutral(404);
  if(url.search)return neutral(404);
  if(list&&request.method!=='GET')return neutral(405);
  if(isImage&&request.method!=='GET'&&request.method!=='HEAD')return neutral(405);
  const match=isImage? /^\/api\/assets\/images\/([A-Za-z0-9_.-]{1,120})\/(image|default)$/.exec(url.pathname):null;
  if(isImage&&!match)return neutral(404);
  if(!env.DB)return neutral(503);
  try {
    if(list)return await collection(env);
    const result=await withImageBudget(()=>
      serveImage(env,match![1],match![2] as 'image'|'default',request.method));
    return result??neutral(503);
  }catch{return neutral(503);}
}
