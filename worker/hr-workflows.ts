import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import { hasCompanyPermission, type EnhancedSessionContext } from './auth-context-v2';
import { createLeaveDecisionCommunicationDraft } from './communications-service';

interface Env extends AuthEnv {}
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const owner=(context:SessionContext)=>context.roles.some((role)=>role.code==='owner');
const can=(context:EnhancedSessionContext,permission:string,minimum:AccessLevel='view',companyId?:string)=>owner(context)||(companyId?hasCompanyPermission(context,companyId,permission,minimum):hasPermission(context,permission,minimum)||Object.keys(context.companyPermissions).some((id)=>hasCompanyPermission(context,id,permission,minimum)));
const companyAllowed=(context:SessionContext,companyId:string)=>owner(context)||context.companies.some((company)=>company.id===companyId);
const datePattern=/^\d{4}-\d{2}-\d{2}$/;

async function audit(env:Env,context:SessionContext,companyId:string,module:string,action:string,entityType:string,entityId:string,after:unknown){
  await env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id)
    VALUES(?,?,?,?,?,?,?,?, 'web',?)`).bind(uid('audit'),context.employee.id,companyId,module,action,entityType,entityId,JSON.stringify(after||{}),crypto.randomUUID()).run();
}

function requiredCompany(request:Request,context:EnhancedSessionContext,permission:string,minimum:AccessLevel='view'){
  const companyId=String(new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'');
  return companyId&&companyAllowed(context,companyId)&&can(context,permission,minimum,companyId)?companyId:'';
}

async function overview(request:Request,env:Env,context:EnhancedSessionContext){
  const companyId=requiredCompany(request,context,'hr.access');if(!companyId)return json({error:'HR access is not assigned for this company.'},403);
  const [employees,leave,reviews,cases,lifecycle]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(DISTINCT m.employee_id) n FROM employee_company_memberships m JOIN employees e ON e.id=m.employee_id WHERE m.company_id=? AND m.active=1 AND e.employment_status='active'`).bind(companyId).first<{n:number}>(),
    env.DB.prepare(`SELECT COUNT(*) n FROM leave_requests WHERE company_id=? AND status='pending'`).bind(companyId).first<{n:number}>(),
    env.DB.prepare(`SELECT COUNT(*) n FROM employee_reviews WHERE company_id=? AND status IN ('draft','shared')`).bind(companyId).first<{n:number}>(),
    env.DB.prepare(`SELECT COUNT(*) n FROM hr_cases WHERE company_id=? AND status NOT IN ('resolved','closed')`).bind(companyId).first<{n:number}>(),
    env.DB.prepare(`SELECT COUNT(*) n FROM hr_lifecycle_processes WHERE company_id=? AND status IN ('planned','in_progress','blocked')`).bind(companyId).first<{n:number}>(),
  ]);
  return json({companyId,employees:Number(employees?.n||0),pendingLeave:Number(leave?.n||0),openReviews:Number(reviews?.n||0),openCases:Number(cases?.n||0),activeLifecycle:Number(lifecycle?.n||0)});
}

async function employees(request:Request,env:Env,context:EnhancedSessionContext){
  const companyId=String(new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'');
  const directoryPermissions=['hr.access','leave.admin','reviews.admin','hr.cases','hr.lifecycle','payroll.statutory'];
  if(!companyId||!companyAllowed(context,companyId)||!directoryPermissions.some((permission)=>can(context,permission,'view',companyId)))return json({error:'People workflow access is not assigned for this company.'},403);
  const rows=await env.DB.prepare(`SELECT e.id,e.employee_no employeeNo,e.display_name displayName,e.email,e.job_title jobTitle,e.department,e.employment_status status
    FROM employee_company_memberships m JOIN employees e ON e.id=m.employee_id
    WHERE m.company_id=? AND m.active=1 ORDER BY e.display_name`).bind(companyId).all<Record<string,unknown>>();
  return json({employees:rows.results||[]});
}

async function leaveList(request:Request,env:Env,context:EnhancedSessionContext){
  const companyId=requiredCompany(request,context,'leave.admin');if(!companyId)return json({error:'Leave administration permission is required for this company.'},403);
  const status=String(new URL(request.url).searchParams.get('status')||'all');
  const rows=await env.DB.prepare(`SELECT lr.id,lr.employee_id employeeId,e.display_name employeeName,e.employee_no employeeNo,lt.name leaveType,
    lr.start_date startDate,lr.end_date endDate,lr.days_requested daysRequested,lr.reason,lr.status,lr.review_notes reviewNotes,
    reviewer.display_name reviewerName,lr.reviewed_at reviewedAt,lr.created_at createdAt
    FROM leave_requests lr JOIN employees e ON e.id=lr.employee_id LEFT JOIN leave_types lt ON lt.id=lr.leave_type_id
    LEFT JOIN employees reviewer ON reviewer.id=lr.reviewed_by
    WHERE lr.company_id=? AND (?='all' OR lr.status=?) ORDER BY CASE lr.status WHEN 'pending' THEN 0 ELSE 1 END,lr.created_at DESC LIMIT 300`)
    .bind(companyId,status,status).all<Record<string,unknown>>();
  return json({requests:rows.results||[]});
}

async function leaveDecision(request:Request,env:Env,context:EnhancedSessionContext){
  let body:{id?:string;decision?:'approved'|'rejected';notes?:string};try{body=await request.json()}catch{return json({error:'Invalid leave decision.'},400)}
  if(!body.id||!['approved','rejected'].includes(String(body.decision)))return json({error:'Leave request and decision are required.'},400);
  const row=await env.DB.prepare('SELECT employee_id employeeId,company_id companyId,status FROM leave_requests WHERE id=?').bind(body.id).first<{employeeId:string;companyId:string;status:string}>();
  if(!row||!companyAllowed(context,row.companyId)||!can(context,'leave.admin','approve',row.companyId))return json({error:'Leave request not found or approval is not assigned.'},404);
  if(row.status!=='pending')return json({error:'Only pending leave can be reviewed.'},409);
  await env.DB.batch([
    env.DB.prepare(`UPDATE leave_requests SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.decision,context.employee.id,String(body.notes||'').trim()||null,body.id),
    env.DB.prepare(`INSERT INTO employee_notifications(id,employee_id,company_id,category,severity,title,body,source_type,source_id)
      VALUES(?,?,?,'leave',?,?,?,'leave_request',?)`).bind(uid('notification'),row.employeeId,row.companyId,body.decision==='approved'?'success':'warning',`Leave request ${body.decision}`,body.decision==='approved'?'Your leave request has been approved.':'Your leave request was not approved. Open Leave to read the review note.',body.id),
  ]);
  await audit(env,context,row.companyId,'leave','review','leave_request',body.id,{decision:body.decision,notes:body.notes||null});
  try {
    const communication=await createLeaveDecisionCommunicationDraft(env,context.employee.id,row.companyId,body.id,true);
    if(communication.created&&communication.draftId){
      await audit(env,context,row.companyId,'communications','leave_decision_draft_created','communication_draft',communication.draftId,{sourceId:body.id,eventId:'hr.leave.status_ready'});
    }
  }catch{
    // Communication preparation must never roll back the authoritative HR decision.
  }
  return json({ok:true,status:body.decision});
}

async function reviewList(request:Request,env:Env,context:EnhancedSessionContext){
  const companyId=requiredCompany(request,context,'reviews.admin');if(!companyId)return json({error:'Performance review administration permission is required for this company.'},403);
  const rows=await env.DB.prepare(`SELECT r.id,r.employee_id employeeId,e.display_name employeeName,e.employee_no employeeNo,r.review_period_start periodStart,
    r.review_period_end periodEnd,r.review_type reviewType,r.rating,r.strengths,r.improvement_areas improvementAreas,r.goals,
    r.manager_comments managerComments,r.employee_comments employeeComments,r.employee_acknowledged_at acknowledgedAt,r.status,
    reviewer.display_name reviewerName,r.created_at createdAt
    FROM employee_reviews r JOIN employees e ON e.id=r.employee_id LEFT JOIN employees reviewer ON reviewer.id=r.reviewer_employee_id
    WHERE r.company_id=? ORDER BY r.review_period_end DESC,r.created_at DESC LIMIT 300`).bind(companyId).all<Record<string,unknown>>();
  return json({reviews:rows.results||[]});
}

async function saveReview(request:Request,env:Env,context:EnhancedSessionContext){
  let body:{id?:string;companyId?:string;employeeId?:string;periodStart?:string;periodEnd?:string;reviewType?:string;rating?:number;strengths?:string;improvementAreas?:string;goals?:string;managerComments?:string;shareNow?:boolean};try{body=await request.json()}catch{return json({error:'Invalid performance review.'},400)}
  const companyId=String(body.companyId||''),employeeId=String(body.employeeId||''),start=String(body.periodStart||''),end=String(body.periodEnd||'');
  if(!companyId||!companyAllowed(context,companyId)||!can(context,'reviews.admin','edit',companyId)||!employeeId||!datePattern.test(start)||!datePattern.test(end)||end<start)return json({error:'Company, employee, edit access and a valid review period are required.'},400);
  const member=await env.DB.prepare('SELECT 1 ok FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1').bind(employeeId,companyId).first();if(!member)return json({error:'Employee is not active in this company.'},404);
  const reviewType=['performance','probation','promotion','corrective','recognition','other'].includes(String(body.reviewType))?String(body.reviewType):'performance';
  const rating=body.rating===undefined||body.rating===null?null:Number(body.rating);if(rating!==null&&(rating<0||rating>5))return json({error:'Rating must be between 0 and 5.'},400);
  const id=String(body.id||uid('review')),status=body.shareNow?'shared':'draft';
  if(body.id){
    const existing=await env.DB.prepare('SELECT company_id companyId,status FROM employee_reviews WHERE id=?').bind(id).first<{companyId:string;status:string}>();if(!existing||!companyAllowed(context,existing.companyId))return json({error:'Review not found.'},404);if(['acknowledged','closed'].includes(existing.status))return json({error:'Acknowledged or closed reviews cannot be rewritten.'},409);
    await env.DB.prepare(`UPDATE employee_reviews SET employee_id=?,review_period_start=?,review_period_end=?,reviewer_employee_id=?,review_type=?,rating=?,strengths=?,improvement_areas=?,goals=?,manager_comments=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(employeeId,start,end,context.employee.id,reviewType,rating,body.strengths||null,body.improvementAreas||null,body.goals||null,body.managerComments||null,status,id).run();
  }else{
    await env.DB.prepare(`INSERT INTO employee_reviews(id,employee_id,company_id,review_period_start,review_period_end,reviewer_employee_id,review_type,rating,strengths,improvement_areas,goals,manager_comments,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,employeeId,companyId,start,end,context.employee.id,reviewType,rating,body.strengths||null,body.improvementAreas||null,body.goals||null,body.managerComments||null,status).run();
  }
  if(status==='shared')await env.DB.prepare(`INSERT INTO employee_notifications(id,employee_id,company_id,category,severity,title,body,source_type,source_id)
    VALUES(?,?,?,'review','info','Performance review available','A performance review is ready for you to read and acknowledge.','employee_review',?)`).bind(uid('notification'),employeeId,companyId,id).run();
  await audit(env,context,companyId,'reviews',body.id?'update':'create','employee_review',id,{employeeId,reviewType,status,periodStart:start,periodEnd:end,rating});
  return json({ok:true,id,status},body.id?200:201);
}

async function reviewAction(request:Request,env:Env,context:EnhancedSessionContext){
  let body:{id?:string;action?:'share'|'close'};try{body=await request.json()}catch{return json({error:'Invalid review action.'},400)}
  const row=await env.DB.prepare('SELECT employee_id employeeId,company_id companyId,status FROM employee_reviews WHERE id=?').bind(String(body.id||'')).first<{employeeId:string;companyId:string;status:string}>();if(!row||!companyAllowed(context,row.companyId)||!can(context,'reviews.admin','edit',row.companyId))return json({error:'Review not found or edit access is not assigned.'},404);
  if(body.action==='share'&&row.status==='draft'){
    await env.DB.batch([env.DB.prepare(`UPDATE employee_reviews SET status='shared',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.id),env.DB.prepare(`INSERT INTO employee_notifications(id,employee_id,company_id,category,severity,title,body,source_type,source_id) VALUES(?,?,?,'review','info','Performance review available','A performance review is ready for you to read and acknowledge.','employee_review',?)`).bind(uid('notification'),row.employeeId,row.companyId,body.id)]);
  }else if(body.action==='close'&&['shared','acknowledged'].includes(row.status))await env.DB.prepare(`UPDATE employee_reviews SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.id).run();
  else return json({error:'That review action is not available for the current status.'},409);
  await audit(env,context,row.companyId,'reviews',String(body.action),'employee_review',String(body.id),{before:row.status});return json({ok:true,action:body.action});
}

async function caseList(request:Request,env:Env,context:EnhancedSessionContext){
  const companyId=requiredCompany(request,context,'hr.cases');if(!companyId)return json({error:'HR Cases access is not assigned for this company.'},403);
  const rows=await env.DB.prepare(`SELECT h.id,h.employee_id employeeId,e.display_name employeeName,e.employee_no employeeNo,h.case_type caseType,h.title,h.summary,h.severity,h.status,
    opener.display_name openedByName,assignee.display_name assignedToName,h.resolution,h.closed_at closedAt,h.created_at createdAt,h.updated_at updatedAt
    FROM hr_cases h JOIN employees e ON e.id=h.employee_id JOIN employees opener ON opener.id=h.opened_by LEFT JOIN employees assignee ON assignee.id=h.assigned_to
    WHERE h.company_id=? ORDER BY CASE h.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,h.created_at DESC LIMIT 300`).bind(companyId).all<Record<string,unknown>>();
  return json({cases:rows.results||[]});
}

async function saveCase(request:Request,env:Env,context:EnhancedSessionContext){
  let body:{id?:string;companyId?:string;employeeId?:string;caseType?:string;title?:string;summary?:string;severity?:string;status?:string;assignedTo?:string;resolution?:string};try{body=await request.json()}catch{return json({error:'Invalid HR case.'},400)}
  const types=['disciplinary','grievance','commendation','performance_improvement','incident','other'],severities=['low','normal','high','critical'],statuses=['open','investigating','action_required','resolved','closed'];
  if(body.id){
    const existing=await env.DB.prepare('SELECT company_id companyId FROM hr_cases WHERE id=?').bind(body.id).first<{companyId:string}>();if(!existing||!companyAllowed(context,existing.companyId)||!can(context,'hr.cases','edit',existing.companyId))return json({error:'HR case not found or edit access is not assigned.'},404);
    const status=statuses.includes(String(body.status))?String(body.status):'open';
    await env.DB.prepare(`UPDATE hr_cases SET assigned_to=?,status=?,resolution=?,closed_at=CASE WHEN ? IN ('resolved','closed') THEN COALESCE(closed_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.assignedTo||null,status,body.resolution||null,status,body.id).run();
    await audit(env,context,existing.companyId,'hr','update_case','hr_case',body.id,{status,assignedTo:body.assignedTo||null,hasResolution:Boolean(body.resolution)});return json({ok:true,id:body.id,status});
  }
  const companyId=String(body.companyId||''),employeeId=String(body.employeeId||''),title=String(body.title||'').trim();if(!companyId||!companyAllowed(context,companyId)||!can(context,'hr.cases','edit',companyId)||!employeeId||title.length<3)return json({error:'Company, employee, edit access and case title are required.'},400);
  const member=await env.DB.prepare('SELECT 1 ok FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1').bind(employeeId,companyId).first();if(!member)return json({error:'Employee is not active in this company.'},404);
  const id=uid('hr-case'),caseType=types.includes(String(body.caseType))?String(body.caseType):'other',severity=severities.includes(String(body.severity))?String(body.severity):'normal';
  await env.DB.prepare(`INSERT INTO hr_cases(id,employee_id,company_id,case_type,title,summary,severity,status,opened_by,assigned_to) VALUES(?,?,?,?,?,?,?,'open',?,?)`).bind(id,employeeId,companyId,caseType,title,body.summary||null,severity,context.employee.id,body.assignedTo||null).run();
  await audit(env,context,companyId,'hr','open_case','hr_case',id,{employeeId,caseType,title,severity});return json({ok:true,id,status:'open'},201);
}

const onboardingTasks=[
  ['identity','Verify employee identity & contacts','Confirm personal details, emergency contact and next of kin.'],
  ['workspace','Assign role & Authorized Workspace','Assign company, role, menus and required permission levels.'],
  ['payroll','Complete payroll & statutory profile','Capture compensation, payroll bank, tax and pension information.'],
  ['policy','Policies & handbook acknowledgement','Issue required policies and collect acknowledgement.'],
  ['equipment','Issue equipment & access items','Record assigned device, uniform, keys, ID card or tools.'],
  ['induction','Complete team induction','Introduce manager, work location, safety and daily responsibilities.'],
  ['probation','Set probation goals & confirmation date','Record probation expectations, review date and confirmation target.'],
] as const;
const offboardingTasks=[
  ['documents','Record exit reason & documents','Capture resignation, termination or transfer documents.'],
  ['revoke','Revoke login, device & workspace access','Disable portal, mobile and provider access at the approved time.'],
  ['assets','Recover company property','Record keys, devices, tools, uniforms and other returned assets.'],
  ['attendance','Close attendance & leave records','Resolve incomplete attendance and outstanding leave records.'],
  ['payroll','Prepare final payroll clearance','Confirm final salary, deductions, loans and payment instructions.'],
  ['handover','Complete work handover','Transfer files, passwords held in approved vaults, projects and responsibilities.'],
  ['interview','Exit interview & records archive','Record approved exit feedback and archive the personnel file.'],
] as const;

async function lifecycleList(request:Request,env:Env,context:EnhancedSessionContext){
  const companyId=requiredCompany(request,context,'hr.lifecycle');if(!companyId)return json({error:'Employee lifecycle access is not assigned for this company.'},403);
  const rows=await env.DB.prepare(`SELECT p.id,p.employee_id employeeId,e.display_name employeeName,e.employee_no employeeNo,p.process_type processType,p.status,
    p.start_date startDate,p.target_date targetDate,p.completed_at completedAt,p.reason,p.notes,owner.display_name ownerName,
    COUNT(t.id) taskCount,SUM(CASE WHEN t.status='completed' OR t.status='not_applicable' THEN 1 ELSE 0 END) completedTasks,p.created_at createdAt
    FROM hr_lifecycle_processes p JOIN employees e ON e.id=p.employee_id LEFT JOIN employees owner ON owner.id=p.owner_employee_id LEFT JOIN hr_lifecycle_tasks t ON t.process_id=p.id
    WHERE p.company_id=? GROUP BY p.id ORDER BY CASE p.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,p.start_date DESC`).bind(companyId).all<Record<string,unknown>>();
  const processId=String(new URL(request.url).searchParams.get('processId')||'');let tasks:Record<string,unknown>[]=[];
  if(processId){const process=(rows.results||[]).find((row)=>String(row.id)===processId);if(!process)return json({error:'Lifecycle process not found.'},404);const result=await env.DB.prepare(`SELECT t.id,t.task_key taskKey,t.title,t.description,t.status,t.due_date dueDate,t.completion_note completionNote,t.completed_at completedAt,e.display_name assignedToName FROM hr_lifecycle_tasks t LEFT JOIN employees e ON e.id=t.assigned_to WHERE t.process_id=? ORDER BY t.sort_order,t.created_at`).bind(processId).all<Record<string,unknown>>();tasks=result.results||[]}
  return json({processes:rows.results||[],tasks});
}

async function createLifecycle(request:Request,env:Env,context:EnhancedSessionContext){
  let body:{companyId?:string;employeeId?:string;processType?:'onboarding'|'offboarding';startDate?:string;targetDate?:string;ownerEmployeeId?:string;reason?:string;notes?:string};try{body=await request.json()}catch{return json({error:'Invalid lifecycle process.'},400)}
  const companyId=String(body.companyId||''),employeeId=String(body.employeeId||''),start=String(body.startDate||''),type=body.processType;
  if(!companyId||!companyAllowed(context,companyId)||!can(context,'hr.lifecycle','edit',companyId)||!employeeId||!type||!['onboarding','offboarding'].includes(type)||!datePattern.test(start)||(body.targetDate&&!datePattern.test(body.targetDate)))return json({error:'Company, employee, edit access, process type and valid dates are required.'},400);
  const member=await env.DB.prepare('SELECT 1 ok FROM employee_company_memberships WHERE employee_id=? AND company_id=?').bind(employeeId,companyId).first();if(!member)return json({error:'Employee is not assigned to this company.'},404);
  const open=await env.DB.prepare(`SELECT id FROM hr_lifecycle_processes WHERE employee_id=? AND company_id=? AND process_type=? AND status IN ('planned','in_progress','blocked') LIMIT 1`).bind(employeeId,companyId,type).first();if(open)return json({error:`An active ${type} process already exists for this employee.`},409);
  const id=uid('lifecycle'),tasks=type==='onboarding'?onboardingTasks:offboardingTasks,statements:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO hr_lifecycle_processes(id,employee_id,company_id,process_type,status,owner_employee_id,start_date,target_date,reason,notes,created_by) VALUES(?,?,?,?,'in_progress',?,?,?,?,?,?)`).bind(id,employeeId,companyId,type,body.ownerEmployeeId||context.employee.id,start,body.targetDate||null,body.reason||null,body.notes||null,context.employee.id)];
  tasks.forEach(([key,title,description],index)=>statements.push(env.DB.prepare(`INSERT INTO hr_lifecycle_tasks(id,process_id,task_key,title,description,assigned_to,due_date,sort_order) VALUES(?,?,?,?,?,?,?,?)`).bind(uid('lifecycle-task'),id,key,title,description,body.ownerEmployeeId||context.employee.id,body.targetDate||null,index+1)));
  await env.DB.batch(statements);await audit(env,context,companyId,'hr','start_lifecycle','hr_lifecycle_process',id,{employeeId,processType:type,taskCount:tasks.length,startDate:start,targetDate:body.targetDate||null});return json({ok:true,id,status:'in_progress',taskCount:tasks.length},201);
}

async function updateLifecycleTask(request:Request,env:Env,context:EnhancedSessionContext){
  let body:{taskId?:string;status?:string;completionNote?:string;assignedTo?:string};try{body=await request.json()}catch{return json({error:'Invalid lifecycle task.'},400)}
  const statuses=['pending','in_progress','blocked','completed','not_applicable'];if(!body.taskId||!statuses.includes(String(body.status)))return json({error:'Task and valid status are required.'},400);
  const row=await env.DB.prepare(`SELECT t.process_id processId,p.company_id companyId FROM hr_lifecycle_tasks t JOIN hr_lifecycle_processes p ON p.id=t.process_id WHERE t.id=?`).bind(body.taskId).first<{processId:string;companyId:string}>();if(!row||!companyAllowed(context,row.companyId)||!can(context,'hr.lifecycle','edit',row.companyId))return json({error:'Lifecycle task not found or edit access is not assigned.'},404);
  await env.DB.prepare(`UPDATE hr_lifecycle_tasks SET status=?,completion_note=?,assigned_to=COALESCE(?,assigned_to),completed_by=CASE WHEN ? IN ('completed','not_applicable') THEN ? ELSE NULL END,completed_at=CASE WHEN ? IN ('completed','not_applicable') THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.status,body.completionNote||null,body.assignedTo||null,body.status,context.employee.id,body.status,body.taskId).run();
  const remaining=await env.DB.prepare(`SELECT COUNT(*) n FROM hr_lifecycle_tasks WHERE process_id=? AND status NOT IN ('completed','not_applicable')`).bind(row.processId).first<{n:number}>();const blocked=await env.DB.prepare(`SELECT COUNT(*) n FROM hr_lifecycle_tasks WHERE process_id=? AND status='blocked'`).bind(row.processId).first<{n:number}>();const processStatus=Number(remaining?.n||0)===0?'completed':Number(blocked?.n||0)>0?'blocked':'in_progress';
  await env.DB.prepare(`UPDATE hr_lifecycle_processes SET status=?,completed_at=CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(processStatus,processStatus,row.processId).run();
  await audit(env,context,row.companyId,'hr','update_lifecycle_task','hr_lifecycle_task',body.taskId,{status:body.status,processStatus});return json({ok:true,status:body.status,processStatus});
}

async function statutoryGet(request:Request,env:Env,context:EnhancedSessionContext){
  const companyId=requiredCompany(request,context,'payroll.statutory');if(!companyId)return json({error:'Statutory Payroll access is not assigned for this company.'},403);
  const profile=await env.DB.prepare(`SELECT company_id companyId,mode,effective_from effectiveFrom,paye_enabled payeEnabled,pension_enabled pensionEnabled,pension_employee_bps pensionEmployeeBps,pension_employer_bps pensionEmployerBps,nhf_enabled nhfEnabled,nhf_employee_bps nhfEmployeeBps,nsitf_enabled nsitfEnabled,nsitf_employer_bps nsitfEmployerBps,itf_enabled itfEnabled,itf_employer_bps itfEmployerBps,paye_rule_version payeRuleVersion,notes,updated_at updatedAt FROM payroll_statutory_profiles WHERE company_id=?`).bind(companyId).first<Record<string,unknown>>();
  return json({companyId,profile:profile||{companyId,mode:'draft',payeEnabled:0,pensionEnabled:0,pensionEmployeeBps:800,pensionEmployerBps:1000,nhfEnabled:0,nhfEmployeeBps:250,nsitfEnabled:0,nsitfEmployerBps:100,itfEnabled:0,itfEmployerBps:100},calculationStatus:'configuration_only',notice:'Statutory values are stored for reviewed payroll setup. PAYE is not auto-calculated until a verified rule version is activated.'});
}

async function statutorySave(request:Request,env:Env,context:EnhancedSessionContext){
  let body:Record<string,unknown>;try{body=await request.json()}catch{return json({error:'Invalid statutory payroll configuration.'},400)}
  const companyId=String(body.companyId||''),mode=String(body.mode||'draft'),effectiveFrom=String(body.effectiveFrom||'');if(!companyId||!companyAllowed(context,companyId)||!can(context,'payroll.statutory','manage',companyId)||!['draft','active','paused'].includes(mode)||(effectiveFrom&&!datePattern.test(effectiveFrom)))return json({error:'Company, management access, valid mode and effective date are required.'},400);
  const bps=(key:string,fallback:number)=>{const value=Number(body[key]??fallback);return Number.isInteger(value)&&value>=0&&value<=5000?value:null};
  const pensionEmployee=bps('pensionEmployeeBps',800),pensionEmployer=bps('pensionEmployerBps',1000),nhf=bps('nhfEmployeeBps',250),nsitf=bps('nsitfEmployerBps',100),itf=bps('itfEmployerBps',100);if([pensionEmployee,pensionEmployer,nhf,nsitf,itf].some((value)=>value===null))return json({error:'Statutory percentage values must be between 0% and 50%.'},400);
  if(mode==='active'&&Boolean(body.payeEnabled)&&!String(body.payeRuleVersion||'').trim())return json({error:'Add the reviewed PAYE rule version before activating PAYE.'},400);
  await env.DB.prepare(`INSERT INTO payroll_statutory_profiles(company_id,mode,effective_from,paye_enabled,pension_enabled,pension_employee_bps,pension_employer_bps,nhf_enabled,nhf_employee_bps,nsitf_enabled,nsitf_employer_bps,itf_enabled,itf_employer_bps,paye_rule_version,notes,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET mode=excluded.mode,effective_from=excluded.effective_from,paye_enabled=excluded.paye_enabled,pension_enabled=excluded.pension_enabled,pension_employee_bps=excluded.pension_employee_bps,pension_employer_bps=excluded.pension_employer_bps,nhf_enabled=excluded.nhf_enabled,nhf_employee_bps=excluded.nhf_employee_bps,nsitf_enabled=excluded.nsitf_enabled,nsitf_employer_bps=excluded.nsitf_employer_bps,itf_enabled=excluded.itf_enabled,itf_employer_bps=excluded.itf_employer_bps,paye_rule_version=excluded.paye_rule_version,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(companyId,mode,effectiveFrom||null,body.payeEnabled?1:0,body.pensionEnabled?1:0,pensionEmployee,pensionEmployer,body.nhfEnabled?1:0,nhf,body.nsitfEnabled?1:0,nsitf,body.itfEnabled?1:0,itf,String(body.payeRuleVersion||'').trim()||null,String(body.notes||'').trim()||null,context.employee.id).run();
  await audit(env,context,companyId,'payroll','update_statutory_profile','payroll_statutory_profile',companyId,{mode,effectiveFrom:effectiveFrom||null,payeEnabled:Boolean(body.payeEnabled),pensionEnabled:Boolean(body.pensionEnabled),nhfEnabled:Boolean(body.nhfEnabled),nsitfEnabled:Boolean(body.nsitfEnabled),itfEnabled:Boolean(body.itfEnabled),payeRuleVersion:String(body.payeRuleVersion||'')||null});
  return json({ok:true,companyId,mode,calculationStatus:'configuration_only'});
}

export async function routeHrWorkflows(request:Request,env:Env,context:EnhancedSessionContext):Promise<Response|null>{
  const path=new URL(request.url).pathname,method=request.method;
  if(path==='/api/hr/workflows/overview'&&method==='GET')return overview(request,env,context);
  if(path==='/api/hr/workflows/employees'&&method==='GET')return employees(request,env,context);
  if(path==='/api/hr/workflows/leave'&&method==='GET')return leaveList(request,env,context);
  if(path==='/api/hr/workflows/leave/decision'&&method==='POST')return leaveDecision(request,env,context);
  if(path==='/api/hr/workflows/reviews'&&method==='GET')return reviewList(request,env,context);
  if(path==='/api/hr/workflows/reviews'&&method==='POST')return saveReview(request,env,context);
  if(path==='/api/hr/workflows/reviews/action'&&method==='POST')return reviewAction(request,env,context);
  if(path==='/api/hr/workflows/cases'&&method==='GET')return caseList(request,env,context);
  if(path==='/api/hr/workflows/cases'&&method==='POST')return saveCase(request,env,context);
  if(path==='/api/hr/workflows/lifecycle'&&method==='GET')return lifecycleList(request,env,context);
  if(path==='/api/hr/workflows/lifecycle'&&method==='POST')return createLifecycle(request,env,context);
  if(path==='/api/hr/workflows/lifecycle/task'&&method==='POST')return updateLifecycleTask(request,env,context);
  if(path==='/api/hr/workflows/statutory'&&method==='GET')return statutoryGet(request,env,context);
  if(path==='/api/hr/workflows/statutory'&&method==='POST')return statutorySave(request,env,context);
  return null;
}
