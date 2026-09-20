import { hasCompanyPermission, type EnhancedSessionContext } from './auth-context-v2.js';
import type { AuthEnv, AccessLevel } from './auth.js';
import { assertStaffPortalCompany } from './communications-repository.js';

interface Env extends AuthEnv {}
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const levels:AccessLevel[]=['none','view','create','edit','approve','manage'];
const WHATSAPP_SERVICE_WINDOW_MS=24*60*60*1000;

function owner(context:EnhancedSessionContext){return context.roles.some(role=>['owner','group_admin'].includes(role.code))}
function companyAllowed(context:EnhancedSessionContext,companyId:string){
  assertStaffPortalCompany(companyId);
  const company=context.companies.find(item=>item.id===companyId);
  return Boolean(company&&!/farm/i.test(`${company.id} ${company.code} ${company.name}`));
}
function can(context:EnhancedSessionContext,companyId:string,permission:string,minimum:AccessLevel='view'){
  if(owner(context))return true;
  const granted=context.companyPermissions[companyId]?.[permission]||'none';
  return levels.indexOf(granted)>=levels.indexOf(minimum)||hasCompanyPermission(context,companyId,'communications.support.manage','manage');
}
function requiredCompany(url:URL,context:EnhancedSessionContext){
  const companyId=String(url.searchParams.get('companyId')||'');
  if(!companyId||!companyAllowed(context,companyId))throw new Error('COMPANY_REQUIRED');
  return companyId;
}
function safeText(value:unknown,max=4000){const text=String(value||'').trim();return text&&text.length<=max?text:null}
function replyPolicy(item:Record<string,unknown>,now=Date.now()){
  const lastCustomerMessageAt=item.lastCustomerMessageAt?String(item.lastCustomerMessageAt):null;
  const lastMs=lastCustomerMessageAt?Date.parse(lastCustomerMessageAt):NaN;
  const expiresAt=Number.isFinite(lastMs)?new Date(lastMs+WHATSAPP_SERVICE_WINDOW_MS).toISOString():null;
  const serviceWindowState=!Number.isFinite(lastMs)?'unavailable':now<(lastMs+WHATSAPP_SERVICE_WINDOW_MS)?'open':'closed';
  const composerState=!item.companyId?'routing_required':serviceWindowState==='open'?'send_ready':'template_required';
  return {serviceWindowState,lastCustomerMessageAt,serviceWindowExpiresAt:expiresAt,composerState,templateRequired:composerState==='template_required',liveSend:false};
}
function routeAuditStatement(env:Env,context:EnhancedSessionContext,id:string,targetCompanyId:string,senderId:string,auditId:string,routeAt:string){
  return env.DB.prepare(`INSERT INTO audit_logs(
    id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source
  )
  SELECT ?,?,?,'communications','route','communication_inbox_conversation',?,?,?,'web'
  WHERE EXISTS(
    SELECT 1 FROM communication_inbox_conversations
    WHERE id=? AND company_id=? AND updated_at=?
  )`)
    .bind(auditId,context.employee.id,targetCompanyId,id,
      JSON.stringify({companyId:null,senderId}),
      JSON.stringify({companyId:targetCompanyId,senderId}),
      id,targetCompanyId,routeAt);
}

async function conversation(env:Env,companyId:string,id:string){
  return env.DB.prepare(`SELECT c.id,c.company_id AS companyId,c.connection_id AS connectionId,c.sender_id AS senderId,
    c.customer_wa_id AS customerWaId,c.customer_display_name AS customerDisplayName,c.status,
    c.assigned_employee_id AS assignedEmployeeId,c.unread_count AS unreadCount,c.last_message_at AS lastMessageAt,
    c.last_customer_message_at AS lastCustomerMessageAt,c.created_at AS createdAt,c.updated_at AS updatedAt,s.routing_mode AS routingMode,s.display_name AS senderDisplayName
    FROM communication_inbox_conversations c
    LEFT JOIN communication_whatsapp_senders s ON s.id=c.sender_id
    WHERE c.id=? AND (
      c.company_id=?
      OR (c.company_id IS NULL AND EXISTS(
        SELECT 1 FROM communication_whatsapp_sender_companies sc
        WHERE sc.sender_id=c.sender_id AND sc.company_id=? AND sc.enabled=1
      ))
    ) LIMIT 1`).bind(id,companyId,companyId).first<Record<string,unknown>>();
}

async function listInbox(request:Request,env:Env,context:EnhancedSessionContext){
  const url=new URL(request.url),companyId=requiredCompany(url,context);
  if(!can(context,companyId,'communications.support.inbox.view','view'))return json({error:'Permission denied.'},403);
  const status=String(url.searchParams.get('status')||'open'),q=String(url.searchParams.get('q')||'').trim().slice(0,120);
  const limit=Math.min(Math.max(Number(url.searchParams.get('limit')||50),1),100);
  const result=await env.DB.prepare(`SELECT c.id,c.company_id AS companyId,c.sender_id AS senderId,c.customer_wa_id AS customerWaId,
    c.customer_display_name AS customerDisplayName,c.status,c.assigned_employee_id AS assignedEmployeeId,
    c.unread_count AS unreadCount,c.last_message_at AS lastMessageAt,c.last_customer_message_at AS lastCustomerMessageAt,s.routing_mode AS routingMode,
    s.display_name AS senderDisplayName,
    (SELECT m.body FROM communication_inbox_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessage
    FROM communication_inbox_conversations c
    LEFT JOIN communication_whatsapp_senders s ON s.id=c.sender_id
    WHERE (c.company_id=? OR (c.company_id IS NULL AND EXISTS(
      SELECT 1 FROM communication_whatsapp_sender_companies sc
      WHERE sc.sender_id=c.sender_id AND sc.company_id=? AND sc.enabled=1
    )))
    AND (?='all' OR c.status=?)
    AND (?='' OR lower(COALESCE(c.customer_display_name,'')) LIKE lower(?) OR c.customer_wa_id LIKE ?)
    ORDER BY c.last_message_at DESC LIMIT ?`).bind(companyId,companyId,status,status,q,`%${q}%`,`%${q}%`,limit).all();
  return json({companyId,conversations:result.results||[]});
}

async function getThread(request:Request,env:Env,context:EnhancedSessionContext,id:string){
  const companyId=requiredCompany(new URL(request.url),context);
  if(!can(context,companyId,'communications.support.inbox.view','view'))return json({error:'Permission denied.'},403);
  const item=await conversation(env,companyId,id);if(!item)return json({error:'Conversation not found.'},404);
  const [messages,notes]=await Promise.all([
    env.DB.prepare(`SELECT id,direction,provider_message_id AS providerMessageId,message_type AS messageType,body,status,
      staff_employee_id AS staffEmployeeId,provider_timestamp AS providerTimestamp,created_at AS createdAt
      FROM communication_inbox_messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 500`).bind(id).all(),
    env.DB.prepare(`SELECT n.id,n.body,n.author_employee_id AS authorEmployeeId,n.created_at AS createdAt,
      e.first_name AS firstName,e.last_name AS lastName FROM communication_inbox_notes n
      LEFT JOIN employees e ON e.id=n.author_employee_id WHERE n.conversation_id=? ORDER BY n.created_at ASC LIMIT 200`).bind(id).all()
  ]);
  return json({conversation:item,messages:messages.results||[],notes:notes.results||[],replyPolicy:replyPolicy(item)});
}

async function mutate(request:Request,env:Env,context:EnhancedSessionContext,id:string,action:string){
  let body:Record<string,unknown>;try{body=await request.json()}catch{return json({error:'Invalid request.'},400)}
  const companyId=String(body.companyId||'');if(!companyId||!companyAllowed(context,companyId))return json({error:'Company is required.'},400);
  const item=await conversation(env,companyId,id);if(!item)return json({error:'Conversation not found.'},404);
  if(action==='read'){
    if(!can(context,companyId,'communications.support.inbox.view','view'))return json({error:'Permission denied.'},403);
    await env.DB.prepare(`UPDATE communication_inbox_conversations SET unread_count=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    return json({ok:true});
  }
  if(action==='assign'){
    if(!can(context,companyId,'communications.support.inbox.assign','edit'))return json({error:'Permission denied.'},403);
    const employeeId=body.employeeId?String(body.employeeId):null;
    if(employeeId){
      const exists=await env.DB.prepare(`SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1 LIMIT 1`).bind(employeeId,companyId).first();
      if(!exists)return json({error:'Assignee is not in this company.'},400);
    }
    await env.DB.prepare(`UPDATE communication_inbox_conversations SET assigned_employee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(employeeId,id).run();
    return json({ok:true,assignedEmployeeId:employeeId});
  }
  if(action==='route'){
    if(!can(context,companyId,'communications.support.inbox.assign','edit'))return json({error:'Permission denied.'},403);
    if(String(item.routingMode||'')!=='shared_group')return json({error:'Only shared-group conversations can be routed.'},409);
    const previousCompanyId=item.companyId?String(item.companyId):null;
    if(previousCompanyId)return json({error:'Conversation is already routed. Unroute/re-route is not enabled.'},409);
    const targetCompanyId=String(body.targetCompanyId||'');
    if(!targetCompanyId||!companyAllowed(context,targetCompanyId))return json({error:'Target company is invalid.'},400);
    if(!can(context,targetCompanyId,'communications.support.inbox.assign','edit'))return json({error:'Permission denied for target company.'},403);
    const senderId=String(item.senderId||'');
    const allowed=await env.DB.prepare(`SELECT 1 FROM communication_whatsapp_sender_companies WHERE sender_id=? AND company_id=? AND enabled=1 LIMIT 1`).bind(senderId,targetCompanyId).first();
    if(!allowed)return json({error:'Sender is not enabled for that company.'},400);
    if(item.assignedEmployeeId){
      const eligible=await env.DB.prepare(`SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1 LIMIT 1`).bind(String(item.assignedEmployeeId),targetCompanyId).first();
      if(!eligible)return json({error:'Unassign this conversation before routing it to that company.'},409);
    }
    const routeAt=new Date().toISOString(),auditId=uid('audit');
    const [routed,audited]=await env.DB.batch([
      env.DB.prepare(`UPDATE communication_inbox_conversations SET company_id=?,updated_at=? WHERE id=? AND company_id IS NULL`).bind(targetCompanyId,routeAt,id),
      routeAuditStatement(env,context,id,targetCompanyId,senderId,auditId,routeAt),
    ]);
    if(Number(routed.meta?.changes||0)!==1)return json({error:'Conversation was routed by another staff member. Refresh and try again.'},409);
    if(Number(audited.meta?.changes||0)!==1)return json({error:'Conversation route audit was not recorded.'},500);
    return json({ok:true,companyId:targetCompanyId,routingMode:'shared_group'});
  }
  if(action==='note'){
    if(!can(context,companyId,'communications.support.inbox.note','create'))return json({error:'Permission denied.'},403);
    const text=safeText(body.body,4000);if(!text)return json({error:'Note text is required.'},400);
    const noteId=uid('comm-note');
    await env.DB.prepare(`INSERT INTO communication_inbox_notes(id,conversation_id,company_id,author_employee_id,body) VALUES(?,?,?,?,?)`).bind(noteId,id,companyId,context.employee.id,text).run();
    return json({ok:true,noteId},201);
  }
  if(action==='reply'){
    if(!can(context,companyId,'communications.support.inbox.reply','create'))return json({error:'Permission denied.'},403);
    if(!item.companyId)return json({error:'Route this shared conversation to a company before drafting a reply.'},409);
    const text=safeText(body.body,4096);if(!text)return json({error:'Reply text is required.'},400);
    const messageId=uid('comm-msg');
    await env.DB.prepare(`INSERT INTO communication_inbox_messages(id,conversation_id,company_id,direction,message_type,body,status,staff_employee_id)
      VALUES(?,?,?,'outbound','text',?,'draft',?)`).bind(messageId,id,companyId,text,context.employee.id).run();
    await env.DB.prepare(`UPDATE communication_inbox_conversations SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    return json({ok:true,messageId,status:'draft',liveSend:false},201);
  }
  return null;
}

export async function routeCommunicationsInbox(request:Request,env:Env,context:EnhancedSessionContext):Promise<Response|null>{
  const path=new URL(request.url).pathname,method=request.method;
  if(path==='/api/communications/inbox'&&method==='GET')return listInbox(request,env,context);
  const match=path.match(/^\/api\/communications\/inbox\/([^/]+)(?:\/(read|assign|route|notes|reply))?$/);
  if(!match)return null;
  const id=decodeURIComponent(match[1]),action=match[2]||'';
  if(!action&&method==='GET')return getThread(request,env,context,id);
  if(action&&method==='POST')return mutate(request,env,context,id,action);
  return json({error:'Method not allowed.'},405);
}
