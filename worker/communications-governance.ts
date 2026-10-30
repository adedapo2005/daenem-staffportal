import type {AuthEnv,AccessLevel} from './auth.js';
import{hasCompanyPermission,type EnhancedSessionContext}from'./auth-context-v2.js';
import{eventById}from'./communications/catalog.js';
import{validateTemplateText}from'./communications/drafts.js';
import type{Channel}from'./communications/types.js';
import{assertStaffPortalCompany}from'./communications-repository.js';

export interface GovernanceEnv extends AuthEnv{SOCIAL_AI_MODEL?:string}
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const owner=(context:EnhancedSessionContext)=>context.roles.some(role=>['owner','group_admin'].includes(role.code));

function companyAllowed(context:EnhancedSessionContext,companyId:string){
 assertStaffPortalCompany(companyId);
 const company=context.companies.find(item=>item.id===companyId);
 return Boolean(company)&&!/farm/i.test(`${company!.id} ${company!.code} ${company!.name}`);
}
function can(context:EnhancedSessionContext,companyId:string,code:string,minimum:AccessLevel='view'){
 return owner(context)||hasCompanyPermission(context,companyId,code,minimum);
}
function canManageEvent(context:EnhancedSessionContext,companyId:string,eventId:string,minimum:AccessLevel='view'){
 try{
  const event=eventById(eventId);
  return can(context,companyId,`communications.${event.module}.manage`,minimum);
 }catch{
  return false;
 }
}
function channels(value:unknown):Channel[]{
 return Array.isArray(value)?value.filter(item=>['whatsapp','email','in_app','push'].includes(String(item))) as Channel[]:[];
}
function languages(value:unknown){
 return Array.isArray(value)?value.map(String).filter(item=>/^[a-z]{2}(?:-[A-Z]{2})?$/.test(item)):[];
}
async function overview(request:Request,env:GovernanceEnv,context:EnhancedSessionContext){
 const url=new URL(request.url);
 const companyId=String(url.searchParams.get('companyId')||'');
 const eventId=String(url.searchParams.get('eventId')||'');
 if(!companyId||!eventId||!companyAllowed(context,companyId))return json({error:'Company and use case are required.'},400);
 if(!canManageEvent(context,companyId,eventId,'view'))return json({error:'Communications management access is not assigned.'},403);
 const templates=await env.DB.prepare(`
  SELECT id,name,language,category,body_template AS bodyTemplate,revision,
   internal_status AS internalStatus,provider_status AS providerStatus,
   sender_connection_id AS senderConnectionId,created_by AS createdBy,approved_by AS approvedBy
  FROM communication_templates WHERE company_id=? AND event_id=? ORDER BY revision DESC
  LIMIT 200
 `).bind(companyId,eventId).all<Record<string,unknown>>();
 const profiles=await env.DB.prepare(`
  SELECT id,module,version,tone,language,instructions,model,active,
   created_by AS createdBy,approved_by AS approvedBy,created_at AS createdAt
  FROM communication_instruction_profiles
  WHERE company_id=? AND module=? ORDER BY version DESC
  LIMIT 200
 `).bind(companyId,eventById(eventId).module).all<Record<string,unknown>>();
 const restrictions=await env.DB.prepare(`
  SELECT id,subject_type AS subjectType,subject_id AS subjectId,enabled,
   ai_enabled AS aiEnabled,auto_generate AS autoGenerate,auto_send AS autoSend,
   require_human_approval AS requireHumanApproval,channels_json AS channelsJson,
   languages_json AS languagesJson,max_characters AS maxCharacters,revision
  FROM communication_policy_restrictions WHERE company_id=? AND event_id=?
  ORDER BY subject_type,subject_id
  LIMIT 200
 `).bind(companyId,eventId).all<Record<string,unknown>>();
 const triggers=await env.DB.prepare(`
  SELECT id,trigger_code AS triggerCode,enabled,mode,config_json AS configJson,revision
  FROM communication_trigger_rules WHERE company_id=? AND event_id=? ORDER BY trigger_code
  LIMIT 200
 `).bind(companyId,eventId).all<Record<string,unknown>>();
 return json({
  companyId,eventId,
  templates:templates.results||[],
  instructionProfiles:profiles.results||[],
  restrictions:restrictions.results||[],
  triggers:triggers.results||[],
 });
}

async function saveRestriction(request:Request,env:GovernanceEnv,context:EnhancedSessionContext){
 let body:{companyId?:string;eventId?:string;subjectType?:string;subjectId?:string;enabled?:boolean;aiEnabled?:boolean;autoGenerate?:boolean;autoSend?:boolean;requireHumanApproval?:boolean;channels?:unknown;languages?:unknown;maxCharacters?:number};
 try{body=await request.json();}catch{return json({error:'Invalid restriction request.'},400)}
 const companyId=String(body.companyId||'');
 const eventId=String(body.eventId||'');
 const subjectType=String(body.subjectType||'');
 const subjectId=String(body.subjectId||'');
 if(!companyId||!eventId||!subjectId||!['role','employee'].includes(subjectType)||!companyAllowed(context,companyId)){
  return json({error:'Valid company, use case and subject are required.'},400);
 }
 if(!canManageEvent(context,companyId,eventId,'manage'))return json({error:'Manage Communications permission is required.'},403);
 if(subjectType==='employee'){
  const member=await env.DB.prepare('SELECT id FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1 LIMIT 1').bind(subjectId,companyId).first<{id:string}>();
  if(!member)return json({error:'Employee is not active in this company.'},400);
 }else{
  const assigned=await env.DB.prepare('SELECT id FROM employee_roles WHERE role_id=? AND company_id=? LIMIT 1').bind(subjectId,companyId).first<{id:string}>();
  if(!assigned)return json({error:'Role is not assigned in this company.'},400);
 }
 const selectedChannels=channels(body.channels);
 const selectedLanguages=languages(body.languages);
 const maxCharacters=Number(body.maxCharacters||4000);
 if(!selectedChannels.length||!selectedLanguages.length||!Number.isInteger(maxCharacters)||maxCharacters<1||maxCharacters>4000){
  return json({error:'Valid channels, languages and message limit are required.'},400);
 }
 const id=uid('comm-restriction');
 const [saved,audited]=await env.DB.batch([
  env.DB.prepare(`
   INSERT INTO communication_policy_restrictions(
    id,company_id,event_id,subject_type,subject_id,enabled,ai_enabled,auto_generate,auto_send,
    require_human_approval,channels_json,languages_json,max_characters,updated_by
   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(company_id,event_id,subject_type,subject_id) DO UPDATE SET
    enabled=excluded.enabled,ai_enabled=excluded.ai_enabled,auto_generate=excluded.auto_generate,
    auto_send=excluded.auto_send,require_human_approval=excluded.require_human_approval,
    channels_json=excluded.channels_json,languages_json=excluded.languages_json,
    max_characters=excluded.max_characters,revision=communication_policy_restrictions.revision+1,
    updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
  `).bind(
   id,companyId,eventId,subjectType,subjectId,
   body.enabled===false?0:1,body.aiEnabled===false?0:1,
   body.autoGenerate===false?0:1,body.autoSend===false?0:1,
   body.requireHumanApproval?1:0,JSON.stringify(selectedChannels),
   JSON.stringify(selectedLanguages),maxCharacters,context.employee.id,
  ),
  env.DB.prepare(`
   INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
   SELECT ?,?,?,'communications','upsert_restriction','communication_policy_restriction',id,?,'web'
   FROM communication_policy_restrictions
   WHERE company_id=? AND event_id=? AND subject_type=? AND subject_id=?
   LIMIT 1
  `).bind(
   uid('audit'),context.employee.id,companyId,JSON.stringify({eventId,subjectType,subjectId}),
   companyId,eventId,subjectType,subjectId,
  ),
 ]);
 if(Number(saved.meta?.changes||0)!==1||Number(audited.meta?.changes||0)!==1){
  return json({error:'Restriction could not be saved.'},409);
 }
 return json({ok:true});
}

async function createTemplate(request:Request,env:GovernanceEnv,context:EnhancedSessionContext){
 let body:{companyId?:string;eventId?:string;channel?:string;name?:string;language?:string;bodyTemplate?:string;senderConnectionId?:string};
 try{body=await request.json();}catch{return json({error:'Invalid template request.'},400)}
 const companyId=String(body.companyId||''),eventId=String(body.eventId||''),channel=String(body.channel||''),language=String(body.language||'en');
 if(!companyId||!eventId||!companyAllowed(context,companyId)||!['whatsapp','email','in_app','push'].includes(channel)){
  return json({error:'Valid company, use case and channel are required.'},400);
 }
 if(!canManageEvent(context,companyId,eventId,'manage'))return json({error:'Manage Communications permission is required.'},403);
 const event=eventById(eventId);
 const name=String(body.name||'').trim();
 const bodyTemplate=String(body.bodyTemplate||'').trim();
 if(!/^[a-z0-9_]{1,128}$/.test(name)||!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)){
  return json({error:'Template name or language is invalid.'},400);
 }
 try{validateTemplateText(bodyTemplate,event.placeholders,4000)}
 catch{return json({error:'Template placeholders or content are invalid for this use case.'},400)}
 const senderConnectionId=String(body.senderConnectionId||'');
 if(channel==='whatsapp'&&senderConnectionId){
  const sender=await env.DB.prepare(`
   SELECT c.id FROM social_platform_connections c
   JOIN social_brands b ON b.id=c.brand_id
   WHERE c.id=? AND c.platform='whatsapp' AND b.company_id=? LIMIT 1
  `).bind(senderConnectionId,companyId).first<{id:string}>();
  if(!sender)return json({error:'Sender connection is not owned by this company.'},400);
 }
 const id=uid('comm-template');
 const [created,audited]=await env.DB.batch([
  env.DB.prepare(`
   INSERT INTO communication_templates(
    id,company_id,event_id,channel,name,language,category,body_template,revision,
    internal_status,provider_status,sender_connection_id,created_by
   )
   SELECT ?,?,?,?,?,?,?,?,COALESCE(MAX(revision),0)+1,'draft','not_submitted',?,?
   FROM communication_templates
   WHERE company_id=? AND event_id=? AND channel=? AND language=?
  `).bind(
   id,companyId,eventId,channel,name,language,event.category,bodyTemplate,
   senderConnectionId||null,context.employee.id,
   companyId,eventId,channel,language,
  ),
  env.DB.prepare(`
   INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
   SELECT ?,?,?,'communications','create_template_version','communication_template',id,
    json_object('eventId',event_id,'channel',channel,'revision',revision),'web'
   FROM communication_templates WHERE id=? AND company_id=? LIMIT 1
  `).bind(uid('audit'),context.employee.id,companyId,id,companyId),
 ]);
 if(Number(created.meta?.changes||0)!==1||Number(audited.meta?.changes||0)!==1){
  return json({error:'Template version could not be created.'},409);
 }
 const stored=await env.DB.prepare(
  'SELECT revision FROM communication_templates WHERE id=? AND company_id=? LIMIT 1'
 ).bind(id,companyId).first<{revision:number}>();
 if(!stored)return json({error:'Template version could not be created.'},409);
 const revision=Number(stored.revision);
 return json({ok:true,id,revision,status:'draft'},201);
}

async function approveTemplate(request:Request,env:GovernanceEnv,context:EnhancedSessionContext){
 let body:{companyId?:string;templateId?:string};
 try{body=await request.json();}catch{return json({error:'Invalid template approval.'},400)}
 const companyId=String(body.companyId||''),templateId=String(body.templateId||'');
 if(!companyId||!templateId||!companyAllowed(context,companyId))return json({error:'Company and template are required.'},400);
 const row=await env.DB.prepare(`
  SELECT t.id,t.event_id AS eventId,t.channel,t.created_by AS createdBy,
   t.sender_connection_id AS senderConnectionId,t.internal_status AS internalStatus,
   c.status AS connectionStatus,b.company_id AS senderCompanyId
  FROM communication_templates t
  LEFT JOIN social_platform_connections c ON c.id=t.sender_connection_id
  LEFT JOIN social_brands b ON b.id=c.brand_id
  WHERE t.id=? AND t.company_id=? LIMIT 1
 `).bind(templateId,companyId).first<{
  id:string;eventId:string;channel:string;createdBy?:string;senderConnectionId?:string;
  internalStatus:string;connectionStatus?:string;senderCompanyId?:string;
 }>();
 if(!row)return json({error:'Template not found.'},404);
 if(!canManageEvent(context,companyId,row.eventId,'manage'))return json({error:'Manage Communications permission is required.'},403);
 if(row.createdBy===context.employee.id)return json({error:'Template creator cannot approve the same template version.'},409);
 if(row.channel==='whatsapp'&&(!row.senderConnectionId||row.connectionStatus!=='connected'||row.senderCompanyId!==companyId)){
  return json({error:'A connected company-owned sender is required before internal approval.'},409);
 }
 const [approved,audited]=await env.DB.batch([
  env.DB.prepare(`
   UPDATE communication_templates SET internal_status='approved',approved_by=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=? AND company_id=? AND internal_status='draft' AND approved_by IS NULL
  `).bind(context.employee.id,templateId,companyId),
  env.DB.prepare(`
   INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
   SELECT ?,?,?,'communications','approve_template','communication_template',id,?,'web'
   FROM communication_templates
   WHERE id=? AND company_id=? AND internal_status='approved' AND approved_by=? AND changes()=1
   LIMIT 1
  `).bind(
   uid('audit'),context.employee.id,companyId,
   JSON.stringify({eventId:row.eventId,providerApprovalUnchanged:true}),
   templateId,companyId,context.employee.id,
  ),
 ]);
 if(Number(approved.meta?.changes||0)!==1||Number(audited.meta?.changes||0)!==1){
  return json({error:'This template was already reviewed or changed. Refresh and try again.'},409);
 }
 return json({ok:true,id:templateId,internalStatus:'approved',providerApproval:'unchanged'});
}

async function createInstructionProfile(request:Request,env:GovernanceEnv,context:EnhancedSessionContext){
 let body:{companyId?:string;eventId?:string;tone?:string;language?:string;instructions?:string;model?:string};
 try{body=await request.json();}catch{return json({error:'Invalid AI instruction profile.'},400)}
 const companyId=String(body.companyId||''),eventId=String(body.eventId||'');
 if(!companyId||!eventId||!companyAllowed(context,companyId))return json({error:'Company and use case are required.'},400);
 if(!canManageEvent(context,companyId,eventId,'manage'))return json({error:'Manage Communications permission is required.'},403);
 const event=eventById(eventId);
 const tone=String(body.tone||'professional'),language=String(body.language||'en');
 const instructions=String(body.instructions||'').trim();
 const approvedModel=String(env.SOCIAL_AI_MODEL||'@cf/meta/llama-3.1-8b-instruct');
 const model=String(body.model||approvedModel);
 if(!['professional','warm','concise'].includes(tone)||!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)){
  return json({error:'Tone or language is invalid.'},400);
 }
 if(!instructions||instructions.length>1200||/[0-9]|https?:|www\.|@|\{\{|password|secret|api[_ -]?key|access[_ -]?token|salary|diagnos|medical|bank account/i.test(instructions)){
  return json({error:'AI instructions contain unsupported dynamic or sensitive content.'},400);
 }
 if(model!==approvedModel)return json({error:'Requested AI model is not on the approved server allowlist.'},400);
 const id=uid('comm-instructions');
 const [created,audited]=await env.DB.batch([
  env.DB.prepare(`
   INSERT INTO communication_instruction_profiles(
    id,company_id,module,version,tone,language,instructions,model,active,created_by
   )
   SELECT ?,?,?,COALESCE(MAX(version),0)+1,?,?,?,?,0,?
   FROM communication_instruction_profiles
   WHERE company_id=? AND module=?
  `).bind(
   id,companyId,event.module,tone,language,instructions,model,context.employee.id,
   companyId,event.module,
  ),
  env.DB.prepare(`
   INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
   SELECT ?,?,?,'communications','create_ai_instruction_profile','communication_instruction_profile',id,
    json_object('module',module,'version',version,'tone',tone,'language',language,'model',model),'web'
   FROM communication_instruction_profiles WHERE id=? AND company_id=? LIMIT 1
  `).bind(uid('audit'),context.employee.id,companyId,id,companyId),
 ]);
 if(Number(created.meta?.changes||0)!==1||Number(audited.meta?.changes||0)!==1){
  return json({error:'Instruction profile version could not be created.'},409);
 }
 const stored=await env.DB.prepare(
  'SELECT version FROM communication_instruction_profiles WHERE id=? AND company_id=? LIMIT 1'
 ).bind(id,companyId).first<{version:number}>();
 if(!stored)return json({error:'Instruction profile version could not be created.'},409);
 const version=Number(stored.version);
 return json({ok:true,id,version,status:'pending_approval'},201);
}

async function approveInstructionProfile(request:Request,env:GovernanceEnv,context:EnhancedSessionContext){
 let body:{companyId?:string;profileId?:string;eventId?:string};
 try{body=await request.json();}catch{return json({error:'Invalid instruction approval.'},400)}
 const companyId=String(body.companyId||''),profileId=String(body.profileId||''),eventId=String(body.eventId||'');
 if(!companyId||!profileId||!eventId||!companyAllowed(context,companyId))return json({error:'Company, use case and profile are required.'},400);
 if(!canManageEvent(context,companyId,eventId,'manage'))return json({error:'Manage Communications permission is required.'},403);
 const event=eventById(eventId);
 const row=await env.DB.prepare(`
  SELECT id,module,language,created_by AS createdBy,approved_by AS approvedBy,active,version
  FROM communication_instruction_profiles
  WHERE id=? AND company_id=? LIMIT 1
 `).bind(profileId,companyId).first<{
  id:string;module:string;language:string;createdBy?:string;approvedBy?:string;active:number;version:number;
 }>();
 if(!row||row.module!==event.module)return json({error:'Instruction profile not found for this module.'},404);
 if(row.createdBy===context.employee.id)return json({error:'Instruction profile creator cannot approve the same version.'},409);
 if(row.approvedBy||row.active){
  return json({error:'This instruction profile was already reviewed or changed. Refresh and try again.'},409);
 }
 const [claimed,,activated,audited]=await env.DB.batch([
  env.DB.prepare(`
   UPDATE communication_instruction_profiles SET approved_by=?
   WHERE id=? AND company_id=? AND module=? AND language=?
     AND active=0 AND approved_by IS NULL
  `).bind(context.employee.id,profileId,companyId,event.module,row.language),
  env.DB.prepare(`
   UPDATE communication_instruction_profiles SET active=0
   WHERE company_id=? AND module=? AND language=? AND id<>?
     AND EXISTS(
      SELECT 1 FROM communication_instruction_profiles
      WHERE id=? AND company_id=? AND approved_by=? AND active=0
     )
  `).bind(
   companyId,event.module,row.language,profileId,
   profileId,companyId,context.employee.id,
  ),
  env.DB.prepare(`
   UPDATE communication_instruction_profiles SET active=1
   WHERE id=? AND company_id=? AND approved_by=? AND active=0
  `).bind(profileId,companyId,context.employee.id),
  env.DB.prepare(`
   INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
   SELECT ?,?,?,'communications','approve_ai_instruction_profile','communication_instruction_profile',id,?,'web'
   FROM communication_instruction_profiles
   WHERE id=? AND company_id=? AND approved_by=? AND active=1 AND changes()=1
   LIMIT 1
  `).bind(
   uid('audit'),context.employee.id,companyId,
   JSON.stringify({module:event.module,version:row.version}),
   profileId,companyId,context.employee.id,
  ),
 ]);
 if(Number(claimed.meta?.changes||0)!==1||
    Number(activated.meta?.changes||0)!==1||
    Number(audited.meta?.changes||0)!==1){
  return json({error:'This instruction profile was already reviewed or changed. Refresh and try again.'},409);
 }
 return json({ok:true,id:profileId,active:true});
}

async function saveTrigger(request:Request,env:GovernanceEnv,context:EnhancedSessionContext){
 let body:{companyId?:string;eventId?:string;triggerCode?:string;enabled?:boolean;mode?:string;config?:Record<string,unknown>};
 try{body=await request.json();}catch{return json({error:'Invalid trigger request.'},400)}
 const companyId=String(body.companyId||''),eventId=String(body.eventId||''),triggerCode=String(body.triggerCode||''),mode=String(body.mode||'draft');
 if(!companyId||!eventId||!triggerCode||!companyAllowed(context,companyId)||!['draft','deterministic_queue'].includes(mode)){
  return json({error:'Valid company, use case, trigger and mode are required.'},400);
 }
 if(!canManageEvent(context,companyId,eventId,'manage'))return json({error:'Manage Communications permission is required.'},403);
 const allowedTriggers=['leave_decision','attendance_incomplete','lifecycle_task_due','training_due','shift_changed'];
 if(!allowedTriggers.includes(triggerCode))return json({error:'Trigger is not supported.'},400);
 const config=body.config&&typeof body.config==='object'&&!Array.isArray(body.config)?body.config:{};
 const configText=JSON.stringify(config);
 if(configText.length>2000)return json({error:'Trigger configuration is too large.'},400);
 const id=uid('comm-trigger');
 const [saved,audited]=await env.DB.batch([
  env.DB.prepare(`
   INSERT INTO communication_trigger_rules(id,company_id,event_id,trigger_code,enabled,mode,config_json,updated_by)
   VALUES(?,?,?,?,?,?,?,?)
   ON CONFLICT(company_id,event_id,trigger_code) DO UPDATE SET
    enabled=excluded.enabled,mode=excluded.mode,config_json=excluded.config_json,
    revision=communication_trigger_rules.revision+1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
  `).bind(id,companyId,eventId,triggerCode,body.enabled?1:0,mode,configText,context.employee.id),
  env.DB.prepare(`
   INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
   SELECT ?,?,?,'communications','upsert_trigger','communication_trigger_rule',id,?,'web'
   FROM communication_trigger_rules
   WHERE company_id=? AND event_id=? AND trigger_code=?
   LIMIT 1
  `).bind(
   uid('audit'),context.employee.id,companyId,JSON.stringify({eventId,triggerCode,enabled:Boolean(body.enabled),mode}),
   companyId,eventId,triggerCode,
  ),
 ]);
 if(Number(saved.meta?.changes||0)!==1||Number(audited.meta?.changes||0)!==1){
  return json({error:'Trigger could not be saved.'},409);
 }
 return json({ok:true});
}

export async function routeCommunicationGovernance(
 request:Request,env:GovernanceEnv,context:EnhancedSessionContext,
):Promise<Response|null>{
 const path=new URL(request.url).pathname,method=request.method;
 if(path==='/api/communications/admin/governance'&&method==='GET')return overview(request,env,context);
 if(path==='/api/communications/admin/restrictions'&&method==='POST')return saveRestriction(request,env,context);
 if(path==='/api/communications/admin/templates'&&method==='POST')return createTemplate(request,env,context);
 if(path==='/api/communications/admin/templates/approve'&&method==='POST')return approveTemplate(request,env,context);
 if(path==='/api/communications/admin/instructions'&&method==='POST')return createInstructionProfile(request,env,context);
 if(path==='/api/communications/admin/instructions/approve'&&method==='POST')return approveInstructionProfile(request,env,context);
 if(path==='/api/communications/admin/triggers'&&method==='POST')return saveTrigger(request,env,context);
 return null;
}
