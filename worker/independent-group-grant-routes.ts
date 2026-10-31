import type {AuthEnv,SessionContext,AccessLevel} from './auth';

type GroupEnv=AuthEnv;
const levels:AccessLevel[]=['none','view','create','edit','approve','manage'];
const groupCodes=new Set([
  'forms.group.admin','forms.group.receive','expense.group.report',
  'expense.group.policy','expense.group.master','expense.group.allocations',
  'access_control.group.grant'
]);
const allowedSQL={
  view:"('view','create','edit','approve','manage')",
  create:"('create','edit','approve','manage')",
  approve:"('approve','manage')",
  manage:"('manage')",
} as const;
const json=(body:Record<string,unknown>,status=200)=>new Response(
  JSON.stringify(body),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  }}
);
const uid=(prefix:string)=>prefix+'-'+crypto.randomUUID();
const changes=(value:unknown):number=>{
  const result=value as {meta?:{changes?:number};changes?:number}|null;
  return Number(result?.meta?.changes??result?.changes??0);
};
// D1 meta.changes counts ALL rows modified by the statement and its audit
// triggers (SQLite total_changes), not just the directly changed grant/request.
// The database query is independently constrained to one requested record.
const changedAtLeastOnce=(value:unknown):boolean=>{
 const count=changes(value);
 return Number.isInteger(count)&&count>=1;
};
function contextGrants(context:SessionContext,min:AccessLevel){
  if(!['active','provisional'].includes(context.employee.status))return false;
  const grants=(context as SessionContext & {
    groupPermissions?:Record<string,AccessLevel>
  }).groupPermissions;
  return levels.indexOf(grants?.['access_control.group.grant']||'none')>=levels.indexOf(min);
}
// Every write also checks the current, independently reviewed server-side grant
// inside its D1 SQL statement. A stale role/company permission is never authority.
function currentGrantSQL(min:'view'|'create'|'approve'|'manage'){
  return 'EXISTS (SELECT 1 FROM employee_group_permission_grants gp '
   +'JOIN permissions p ON p.id=gp.permission_id '
   +'JOIN employees e ON e.id=gp.employee_id '
   +'WHERE gp.employee_id=? AND gp.active=1 AND gp.revoked_at IS NULL '
   +"AND (gp.expires_at IS NULL OR datetime(gp.expires_at)>datetime('now')) "
   +"AND gp.reviewed_by IS NOT NULL AND gp.reviewed_at IS NOT NULL "
   +"AND p.code='access_control.group.grant' AND p.sensitive=1 "
   +'AND gp.access_level IN '+allowedSQL[min]+' '
   +"AND e.employment_status IN ('active','provisional'))";
}
async function currentIndependentGrantActive(
 env:GroupEnv, context:SessionContext, min:'view'|'create'|'approve'|'manage'
):Promise<boolean>{
 const record=await env.DB.prepare(
  'SELECT 1 AS authorised WHERE '+currentGrantSQL(min)
 ).bind(context.employee.id).first();
 return Boolean(record);
}
function pendingIssuerStillAuthorisedSQL(issuerColumn:string){
 // Issuer must retain independent create/approve/manage authority through
 // the moment the second reviewer commits approval. Pending is not a license
 // to issue new privileges after the original issuer has been revoked.
 return 'EXISTS (SELECT 1 FROM employee_group_permission_grants ig '
  +'JOIN permissions ip ON ip.id=ig.permission_id '
  +'JOIN employees ie ON ie.id=ig.employee_id '
  +'WHERE ig.employee_id='+issuerColumn+' AND ig.active=1 '
  +'AND ig.revoked_at IS NULL AND ig.reviewed_by IS NOT NULL '
  +'AND ig.reviewed_at IS NOT NULL '
  +"AND (ig.expires_at IS NULL OR datetime(ig.expires_at)>datetime('now')) "
  +"AND ip.code='access_control.group.grant' AND ip.sensitive=1 "
  +"AND ig.access_level IN ('create','edit','approve','manage') "
  +"AND ie.employment_status IN ('active','provisional'))";
}
function sameOrigin(request:Request){
 const origin=request.headers.get('origin');
 return Boolean(origin&&origin===new URL(request.url).origin);
}
async function strictBody(request:Request,allowed:Set<string>){
 try{
  const data:unknown=await request.json();
  if(!data||Array.isArray(data)||typeof data!=='object')return null;
  const value=data as Record<string,unknown>;
  return Object.keys(value).every(key=>allowed.has(key))?value:null;
 }catch{return null}
}
function safeText(value:unknown,max=500){
 return typeof value==='string'?value.trim().slice(0,max+1):'';
}
function expiry(value:unknown,code:string){
 const raw=safeText(value,45),when=Date.parse(raw);
 const maxDays=code==='forms.group.receive'?365:90;
 const ms=when-Date.now();
 return raw&&Number.isFinite(when)&&ms>=3600_000&&ms<=maxDays*86400_000
  ?new Date(when).toISOString():null;
}

async function createRequest(request:Request,env:GroupEnv,context:SessionContext){
 if(!contextGrants(context,'create'))
  return json({error:'Independent Group grant-issuer permission is required.'},403);
 const body=await strictBody(request,new Set([
  'employeeId','permissionCode','accessLevel','reason','expiresAt'
 ]));
 if(!body)return json({error:'Invalid Group request fields.'},400);
 const employeeId=safeText(body.employeeId,140),
  code=safeText(body.permissionCode,100),
  level=safeText(body.accessLevel,20) as AccessLevel,
  reason=safeText(body.reason),
  expiresAt=expiry(body.expiresAt,code);
 if(!employeeId||employeeId===context.employee.id||!groupCodes.has(code)
   ||!levels.includes(level)||level==='none'||reason.length<10
   ||reason.length>500||!expiresAt
   ||(code==='forms.group.receive'&&level!=='view'))
  return json({error:'Group beneficiary, grant level, reason or expiry is invalid.'},400);
 // Never expose a recipient grant's existence to an issuer with only a
 // forged or stale Group grant claim. Require actual current D1 authority.
 if(!await currentIndependentGrantActive(env,context,'create'))
  return json({error:'Independent Group grant-issuer permission is required.'},403);
 // The request must not queue a privilege that the recipient already holds.
 const existing=await env.DB.prepare(
  'SELECT 1 FROM employee_group_permission_grants g '
  +'JOIN permissions p ON p.id=g.permission_id '
  +'WHERE g.employee_id=? AND p.code=? AND g.active=1 AND '+currentGrantSQL('create')+' LIMIT 1'
 ).bind(employeeId,code,context.employee.id).first();
 if(existing)return json({error:'This recipient already has the active Group permission.'},409);
 const id=uid('group-request');
 try {
  const query='INSERT INTO employee_group_permission_requests '
   +'(id,employee_id,permission_id,access_level,reason,expires_at,requested_by) '
   +'SELECT ?,e.id,p.id,?,?,?,? '
   +'FROM employees e JOIN permissions p ON p.code=? '
   +"WHERE e.id=? AND e.employment_status IN ('active','provisional') "
   +'AND p.sensitive=1 '
   +'AND NOT EXISTS(SELECT 1 FROM employee_group_permission_grants issued '
   +'WHERE issued.employee_id=e.id AND issued.permission_id=p.id AND issued.active=1) '
   +'AND '+currentGrantSQL('create');
  const result=await env.DB.prepare(query).bind(
   id,level,reason,expiresAt,context.employee.id,code,employeeId,context.employee.id
  ).run();
  if(!changedAtLeastOnce(result))
   return json({error:'Group grant issuer or recipient is no longer authorised.'},403);
  return json({ok:true,requestId:id,status:'pending',approved:false},201);
 }catch{
  return json({error:'Duplicate pending request or rejected Group grant schema.'},409);
 }
}

async function reviewRequest(request:Request,env:GroupEnv,context:SessionContext){
 if(!contextGrants(context,'approve'))
  return json({error:'Independent Group reviewer permission is required.'},403);
 const body=await strictBody(request,new Set(['requestId','decision','reviewNote']));
 if(!body)return json({error:'Invalid Group review fields.'},400);
 const requestId=safeText(body.requestId,140),
  decision=safeText(body.decision,16),note=safeText(body.reviewNote);
 if(!requestId||!['approved','rejected'].includes(decision)||note.length<10||note.length>500)
  return json({error:'A pending request, decision and review reason are required.'},400);
 // A stale or forged reviewer must not probe request IDs to distinguish
 // active Group requests from unknown IDs before D1 permission validation.
 if(!await currentIndependentGrantActive(env,context,'approve'))
  return json({error:'Independent Group reviewer permission is required.'},403);
 const found=await env.DB.prepare(
  'SELECT r.id,r.employee_id AS employeeId,r.requested_by AS requestedBy,'
  +'r.status,r.access_level AS accessLevel,p.code AS permissionCode,'
  +'r.expires_at AS expiresAt FROM employee_group_permission_requests r '
  +'JOIN permissions p ON p.id=r.permission_id WHERE r.id=? AND '+currentGrantSQL('approve')+' LIMIT 1'
 ).bind(requestId,context.employee.id).first<{
  id:string;employeeId:string;requestedBy:string;status:string;expiresAt:string;
  accessLevel:AccessLevel;permissionCode:string
 }>();
 if(!found){
  // A revocation between initial permission preflight and this restricted
  // SELECT must return 403, not reveal the request-ID's prior existence.
  if(!await currentIndependentGrantActive(env,context,'approve'))
   return json({error:'Independent Group reviewer permission is required.'},403);
  return json({error:'Pending Group request not found.'},404);
 }
 if(found.status!=='pending')return json({error:'Pending Group request not found.'},404);
 const reviewer=context.employee.id;
 if(found.requestedBy===reviewer||found.employeeId===reviewer)
  return json({error:'A separate reviewer must authorise this request.'},403);
 if(decision==='approved'&&Date.parse(found.expiresAt)<=Date.now())
  return json({error:'An expired Group request cannot be approved.'},409);
 // An approve-level reviewer cannot issue manage-level Group rights or
 // delegate the power to grant further Group privileges.
 const requiredApproval: 'approve'|'manage'=
   found.accessLevel==='manage'||found.permissionCode==='access_control.group.grant'
     ?'manage':'approve';
 if(decision==='approved'&&!contextGrants(context,requiredApproval))
  return json({error:'Independent manage-level reviewer permission is required to approve this Group privilege.'},403);
 try {
  if(decision==='rejected'){
   const statement='UPDATE employee_group_permission_requests '
    +"SET status='rejected',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,"
    +'review_note=?,updated_at=CURRENT_TIMESTAMP '
    +'WHERE id=? AND status=\'pending\' AND requested_by<>? AND employee_id<>? AND '
    +currentGrantSQL('approve');
   const result=await env.DB.prepare(statement).bind(
    reviewer,note,requestId,reviewer,reviewer,reviewer
   ).run();
   if(!changedAtLeastOnce(result))return json({error:'Review was revoked or request changed.'},409);
   return json({ok:true,status:'rejected'});
  }
  const grantId=uid('group-grant');
  const insert='INSERT INTO employee_group_permission_grants '
   +'(id,employee_id,permission_id,access_level,active,granted_by,'
   +'reviewed_by,reviewed_at,reason,expires_at) '
   +'SELECT ?,r.employee_id,r.permission_id,r.access_level,1,r.requested_by,'
   +'?,CURRENT_TIMESTAMP,r.reason,r.expires_at '
   +'FROM employee_group_permission_requests r '
   +"WHERE r.id=? AND r.status='pending' AND r.requested_by<>? "
   +"AND r.employee_id<>? AND datetime(r.expires_at)>datetime('now') "
   +'AND '+pendingIssuerStillAuthorisedSQL('r.requested_by')
   +' AND '+currentGrantSQL(requiredApproval);
  const update='UPDATE employee_group_permission_requests '
   +"SET status='approved',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,"
   +'review_note=?,grant_id=?,updated_at=CURRENT_TIMESTAMP '
   +"WHERE id=? AND status='pending' AND requested_by<>? AND employee_id<>? "
   +'AND '+pendingIssuerStillAuthorisedSQL('employee_group_permission_requests.requested_by')
   +' AND '+currentGrantSQL(requiredApproval);
  // D1 batch rolls back when a statement FAILS, not when an UPDATE affects zero
  // rows. A final constraint-backed postcondition must ABORT on a zero-row
  // transition: otherwise a successfully INSERTed grant could remain issued
  // even after this endpoint reports a failed approval.
  const assertApproved='INSERT INTO employee_group_permission_requests(id) '
    +"SELECT ? WHERE NOT EXISTS(SELECT 1 FROM employee_group_permission_requests "
    +"WHERE id=? AND status='approved' AND reviewed_by=? AND grant_id=?)";
  const results=await env.DB.batch([
   env.DB.prepare(insert).bind(grantId,reviewer,requestId,
     reviewer,reviewer,reviewer),
   env.DB.prepare(update).bind(reviewer,note,grantId,requestId,
     reviewer,reviewer,reviewer),
   // This INSERT normally inserts zero rows. If approval did not become
   // authoritative, its deliberate NOT NULL violation aborts the D1 batch.
   env.DB.prepare(assertApproved).bind(uid('approval-check'),requestId,reviewer,grantId)
  ]);
  if(!changedAtLeastOnce(results[0])||!changedAtLeastOnce(results[1]))
   return json({error:'Review is no longer authorised or request changed.'},409);
  return json({ok:true,status:'approved',grantId});
 }catch{
  return json({error:'Review failed; no unreviewed or duplicate Group grant was issued.'},409);
 }
}

async function revokeGroupGrant(request:Request,env:GroupEnv,context:SessionContext){
 if(!contextGrants(context,'manage'))
  return json({error:'Independent Group grant-revocation permission is required.'},403);
 const body=await strictBody(request,new Set(['grantId','reason']));
 if(!body)return json({error:'Invalid Group revocation fields.'},400);
 const grantId=safeText(body.grantId,140),reason=safeText(body.reason);
 if(!grantId||reason.length<10||reason.length>500)
  return json({error:'Group grant ID and detailed revocation reason are required.'},400);
 const actor=context.employee.id;
 try {
  // Write the explicit revocation reason before the controlled status change,
  // in the same transaction. The existing Group-grant trigger audits after.
  const log='INSERT INTO audit_logs '
   +'(id,actor_employee_id,company_id,module,action,entity_type,entity_id,'
   +'before_json,after_json,reason,source,request_id) '
   +"SELECT ?,?,NULL,'access_control','group_permission_revoke_requested',"
   +"'employee_group_permission_grant',g.id,NULL,json_object('reason',?),?,"
   +"'group_grant_route',NULL FROM employee_group_permission_grants g "
   +'WHERE g.id=? AND g.active=1 AND g.employee_id<>? AND '+currentGrantSQL('manage');
  const update='UPDATE employee_group_permission_grants '
   +'SET active=0,revoked_by=?,revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP '
   +'WHERE id=? AND active=1 AND employee_id<>? AND '+currentGrantSQL('manage');
  const assertRevoked='INSERT INTO employee_group_permission_requests(id) '
    +"SELECT ? WHERE NOT EXISTS(SELECT 1 FROM employee_group_permission_grants "
    +"WHERE id=? AND active=0 AND revoked_by=? AND revoked_at IS NOT NULL)";
  const results=await env.DB.batch([
   env.DB.prepare(log).bind(uid('audit'),actor,reason,reason,grantId,actor,actor),
   env.DB.prepare(update).bind(actor,grantId,actor,actor),
   // A zero-row revocation cannot leave a misleading audit record committed.
   env.DB.prepare(assertRevoked).bind(uid('revocation-check'),grantId,actor)
  ]);
  if(!changedAtLeastOnce(results[0])||!changedAtLeastOnce(results[1]))
   return json({error:'Active Group grant is missing or revocation no longer authorised.'},404);
  return json({ok:true,status:'revoked'});
 }catch{
  return json({error:'Group grant revocation failed; audit and permission state were not changed.'},409);
 }
}

async function listPending(env:GroupEnv,context:SessionContext){
 if(!contextGrants(context,'view'))
  return json({error:'Independent Group-grant review permission is required.'},403);
 // Empty rows must not masquerade as an authorised 200 response when a
 // server session is stale or claims a Group privilege revoked in D1.
 const live=await env.DB.prepare(
  'SELECT 1 AS authorised WHERE '+currentGrantSQL('view')
 ).bind(context.employee.id).first();
 if(!live)return json({error:'Independent Group-grant review permission is required.'},403);
 const query='SELECT r.id,r.employee_id AS employeeId,p.code AS permissionCode,'
  +'r.access_level AS accessLevel,r.reason,r.expires_at AS expiresAt,'
  +'r.requested_by AS requestedBy,r.status,r.created_at AS createdAt '
  +'FROM employee_group_permission_requests r '
  +'JOIN permissions p ON p.id=r.permission_id '
  +"WHERE r.status='pending' AND "+currentGrantSQL('view')
  +' ORDER BY r.created_at ASC LIMIT 100';
 const result=await env.DB.prepare(query).bind(context.employee.id).all<Record<string,unknown>>();
 return json({requests:result.results||[]});
}

/**
 * Mounted by the authenticated Worker dispatcher after the Group-grant
 * migration gate. The route never self-deploys and never changes Writer
 * ownership outside its explicit Group-grant tables and audit records.
 */
export async function routeIndependentGroupGrants(
 request:Request,env:GroupEnv,context:SessionContext
):Promise<Response|null>{
 const pathname=new URL(request.url).pathname;
 if(!pathname.startsWith('/api/access-control/group-grants/'))return null;
 if(request.method==='GET'&&pathname==='/api/access-control/group-grants/requests')
  return listPending(env,context);
 if(request.method==='POST'){
  if(!sameOrigin(request))
   return json({error:'Group permission changes require same-origin authenticated requests.'},403);
  if(pathname==='/api/access-control/group-grants/request')
   return createRequest(request,env,context);
  if(pathname==='/api/access-control/group-grants/review')
   return reviewRequest(request,env,context);
  if(pathname==='/api/access-control/group-grants/revoke')
   return revokeGroupGrant(request,env,context);
 }
 return null;
}
