import { hasPermission, type AuthEnv, type SessionContext, type AccessLevel } from './auth';

/**
 * Internal StaffPortal Recruitment API. Not the public Careers website.
 * Route wiring belongs to the existing main backend writer, not this leased lane.
 */
export interface RecruitmentEnv extends AuthEnv {}
type RecordObject = Record<string, unknown>;
type CandidateStage = 'applied'|'screening'|'interview'|'decision'|'offer_prepared'|'closed_rejected'|'withdrawn';

const response = (body: RecordObject, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {
    'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
    'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer'
  }
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const words = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const optionalText = (value: unknown, max: number) =>
  value === undefined || (typeof value === 'string' && value.trim().length <= max);
const object = (value: unknown): RecordObject | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordObject : null;
const error = (status = 404) => response({ error: 'Recruitment record unavailable.' }, status);
const isRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100000000;
const bodyOf = async (request: Request) => {
  try { return object(await request.json()); } catch { return null; }
};
const companyFor = (context: SessionContext, companyId: string, level: AccessLevel = 'view') =>
  !!companyId && context.employee.status === 'active' &&
  context.companies.some(company => company.id === companyId) &&
  hasPermission(context, 'jobs.access', level, companyId);
const companyParam = (request: Request) => new URL(request.url).searchParams.get('companyId') || '';

async function payloadHash(payload: RecordObject) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}
function idempotency(request: Request) {
  const value = request.headers.get('idempotency-key') || request.headers.get('x-daenem-idempotency-key') || '';
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{11,119}$/.test(value) ? value : '';
}
type Receipt = { payloadHash: string; entityId: string; entityType: string };
const receiptTargets: Record<string, { kind: string; table: string }> = {
  create_candidate: { kind: 'candidate', table: 'recruitment_candidates' },
  schedule_interview: { kind: 'interview', table: 'recruitment_interviews' },
  create_offer: { kind: 'offer', table: 'recruitment_offers' },
  request_hr_handoff: { kind: 'hr_handoff', table: 'recruitment_hr_handoffs' }
};
async function existingReceipt(env: RecruitmentEnv, actor: string, companyId: string, action: string, key: string) {
  return env.DB.prepare(`SELECT payload_hash AS payloadHash,entity_id AS entityId,entity_type AS entityType
    FROM recruitment_request_receipts WHERE actor_employee_id=? AND company_id=? AND action=? AND request_key=?`)
    .bind(actor,companyId,action,key).first<Receipt>();
}
async function replayOrConflict(env: RecruitmentEnv, actor: string, companyId: string,
  action: string, key: string, hash: string) {
  const receipt = await existingReceipt(env,actor,companyId,action,key);
  if (!receipt) return null;
  if (receipt.payloadHash !== hash) return response({ error: 'This request identifier was already used.' }, 409);
  const target = receiptTargets[action];
  if (!target || receipt.entityType !== target.kind) {
    return response({ error: 'Recruitment request state could not be confirmed.' }, 409);
  }
  // A receipt alone is not proof that its company-bound entity still exists.
  const entity = await env.DB.prepare(`SELECT 1 AS ok FROM ${target.table} WHERE id=? AND company_id=?`)
    .bind(receipt.entityId,companyId).first();
  return entity ? response({ ok: true, id: receipt.entityId, deduplicated: true }) :
    response({ error: 'Recruitment request state could not be confirmed.' }, 409);
}
function receiptSql(env: RecruitmentEnv, requestKey: string, action: string,
  actor: string, companyId: string, payloadDigest: string, kind: string, entityId: string) {
  return env.DB.prepare(`INSERT INTO recruitment_request_receipts
    (id,actor_employee_id,company_id,action,request_key,payload_hash,entity_type,entity_id)
    VALUES(?,?,?,?,?,?,?,?)`)
    .bind(uid('recruitment-receipt'),actor,companyId,action,requestKey,payloadDigest,kind,entityId);
}
function auditSql(env: RecruitmentEnv, actor: string, companyId: string, action: string,
  entityType: string, entityId: string, before: RecordObject | null, after: RecordObject,
  requestKey: string | null) {
  return env.DB.prepare(`INSERT INTO audit_logs
    (id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id)
    VALUES(?,?,?,'recruitment',?,?,?,?,?,'web',?)`)
    .bind(uid('recruitment-audit'),actor,companyId,action,entityType,entityId,
      before?JSON.stringify(before):null,JSON.stringify(after),requestKey);
}
function guardedAuditSql(env: RecruitmentEnv, table: 'recruitment_candidates'|'recruitment_interviews'|'recruitment_offers',
  actor: string, companyId: string, action: string, entityType: string, entityId: string,
  mutationId: string, before: RecordObject, after: RecordObject) {
  return env.DB.prepare(`INSERT INTO audit_logs
    (id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id)
    SELECT ?,?,?,'recruitment',?,?,?,?,?,'web',?
    FROM ${table} WHERE id=? AND company_id=? AND last_mutation_id=?`)
    .bind(uid('recruitment-audit'),actor,companyId,action,entityType,entityId,
      JSON.stringify(before),JSON.stringify(after),mutationId,entityId,companyId,mutationId);
}
async function batchInsert(env: RecruitmentEnv, statements: D1PreparedStatement[], actor: string,
  companyId: string, action: string, key: string, digest: string) {
  try {
    await env.DB.batch(statements);
    return null;
  } catch {
    const replay = await replayOrConflict(env,actor,companyId,action,key,digest);
    return replay || response({ error: 'Recruitment change could not be saved safely.' }, 409);
  }
}
async function casBatch(env: RecruitmentEnv, update: D1PreparedStatement, audit: D1PreparedStatement) {
  try {
    const results = await env.DB.batch([update,audit]);
    return Number(results[0]?.meta?.changes) === 1 && Number(results[1]?.meta?.changes) === 1;
  } catch { return false; }
}
async function candidate(env: RecruitmentEnv, companyId: string, candidateId: string, includeContact = false) {
  // Deny-wins: only privileged readers have contact fields in the SQL projection.
  const contactColumns = includeContact ? 'email,phone,source_reference AS sourceReference,' : '';
  return env.DB.prepare(`SELECT id,company_id AS companyId,location_id AS locationId,
    candidate_ref AS candidateRef,full_name AS fullName,${contactColumns}role_title AS roleTitle,
    source_kind AS sourceKind,stage,revision,
    created_at AS createdAt,updated_at AS updatedAt
    FROM recruitment_candidates WHERE company_id=? AND id=?`)
    .bind(companyId,candidateId).first<{
      id: string; companyId: string; stage: CandidateStage; revision: number;
      locationId: string|null; roleTitle: string
    } & RecordObject>();
}

async function companies(env: RecruitmentEnv, context: SessionContext) {
  // Selected-company grants, not an aggregate permission or global role code.
  const visible = context.companies.filter(c=>companyFor(context,c.id));
  return response({ companies: visible.map(c=>({ id:c.id,name:c.name,code:c.code,capabilities:{create:companyFor(context,c.id,'create'),edit:companyFor(context,c.id,'edit'),approve:companyFor(context,c.id,'approve')} })) });
}
async function list(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const companyId = companyParam(request);
  if (!companyFor(context,companyId)) return error();
  const requestedStage = new URL(request.url).searchParams.get('stage') || '';
  const stages: CandidateStage[] = ['applied','screening','interview','decision','offer_prepared','closed_rejected','withdrawn'];
  if (requestedStage && !stages.includes(requestedStage as CandidateStage)) return response({ error: 'Invalid stage filter.' },400);
  const limit = Math.min(100,Math.max(1,Number(new URL(request.url).searchParams.get('limit'))||50));
  const rows = await env.DB.prepare(`SELECT id,company_id AS companyId,candidate_ref AS candidateRef,
    full_name AS fullName,role_title AS roleTitle,stage,revision,location_id AS locationId,
    updated_at AS updatedAt,created_at AS createdAt
    FROM recruitment_candidates WHERE company_id=? AND (?='' OR stage=?)
    ORDER BY updated_at DESC,id DESC LIMIT ?`)
    .bind(companyId,requestedStage,requestedStage,limit).all<RecordObject>();
  return response({ candidates:rows.results||[],companyId });
}
async function detail(request: Request, env: RecruitmentEnv, context: SessionContext, id: string) {
  const companyId = companyParam(request);
  if (!companyFor(context,companyId)) return error();
  const canEdit=companyFor(context,companyId,'edit');
  const canApprove=companyFor(context,companyId,'approve');
  // Contact and intake reference are not disclosed to general view-only readers.
  const row = await candidate(env,companyId,id,canEdit || canApprove);
  if (!row) return error();
  const interviewRows=await env.DB.prepare(`SELECT id,company_id AS companyId,candidate_id AS candidateId,
    scheduled_at AS scheduledAt,meeting_mode AS meetingMode,status,revision,
    interviewer_employee_id AS interviewerId,
    ${canEdit?'feedback,recommendation,':''}created_at AS createdAt
    FROM recruitment_interviews WHERE company_id=? AND candidate_id=?
    ORDER BY scheduled_at DESC LIMIT 100`).bind(companyId,id).all<RecordObject>();
  const offers = canApprove ? await env.DB.prepare(`SELECT id,company_id AS companyId,
    candidate_id AS candidateId,role_title AS roleTitle,terms_summary AS termsSummary,status,revision,
    approved_at AS approvedAt,created_at AS createdAt FROM recruitment_offers
    WHERE company_id=? AND candidate_id=? ORDER BY created_at DESC LIMIT 20`)
    .bind(companyId,id).all<RecordObject>() : null;
  const handoffs = canApprove ? await env.DB.prepare(`SELECT id,company_id AS companyId,
    candidate_id AS candidateId,offer_id AS offerId,status,acceptance_evidence_ref AS acceptanceEvidenceRef,
    acknowledged_employee_id AS acknowledgedEmployeeId,acknowledged_at AS acknowledgedAt,
    revision,created_at AS createdAt FROM recruitment_hr_handoffs
    WHERE company_id=? AND candidate_id=? ORDER BY created_at DESC LIMIT 20`)
    .bind(companyId,id).all<RecordObject>() : null;
  return response({ candidate:row,interviews:interviewRows.results||[],
    ...(canApprove?{offers:offers?.results||[],hrHandoffs:handoffs?.results||[]}:{}),
    capabilities:{create:companyFor(context,companyId,'create'),edit:canEdit,approve:canApprove}});
}
async function activeLocation(env: RecruitmentEnv, companyId: string, locationId: string) {
  return !locationId || !!await env.DB.prepare(`SELECT 1 AS ok FROM company_locations
    WHERE id=? AND company_id=? AND active=1`).bind(locationId,companyId).first();
}
async function activeInterviewer(env: RecruitmentEnv, companyId: string, employeeId: string,
  candidateLocationId: string|null) {
  return !!await env.DB.prepare(`SELECT 1 AS ok FROM employee_company_memberships m
    JOIN employees e ON e.id=m.employee_id WHERE m.employee_id=? AND m.company_id=?
    AND m.active=1 AND e.employment_status='active'
    AND (?='' OR m.location_id=?)`)
    .bind(employeeId,companyId,candidateLocationId||'',candidateLocationId||'').first();
}
async function eligibleInterviewers(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const params=new URL(request.url).searchParams,companyId=params.get('companyId')||'',
    candidateId=params.get('candidateId')||'';
  if(!companyFor(context,companyId,'edit')||!candidateId)return error();
  const row=await candidate(env,companyId,candidateId);
  if(!row||!['screening','interview'].includes(row.stage))return error();
  const location=row.locationId||'';
  // Only bounded scheduling identities are returned; no HR profile/contact disclosure.
  const matches=await env.DB.prepare(`SELECT DISTINCT e.id,e.display_name AS displayName
    FROM employee_company_memberships m JOIN employees e ON e.id=m.employee_id
    WHERE m.company_id=? AND m.active=1 AND e.employment_status='active'
    AND (?='' OR m.location_id=?)
    ORDER BY e.display_name ASC,e.id ASC LIMIT 100`)
    .bind(companyId,location,location).all<RecordObject>();
  return response({interviewers:matches.results||[],companyId,candidateId});
}
async function createCandidate(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const body = await bodyOf(request);
  if (!body) return response({ error: 'Invalid candidate request.' },400);
  const companyId=words(body.companyId,128),key=idempotency(request);
  if (!companyFor(context,companyId,'create')) return error();
  if (!key) return response({ error: 'A valid idempotency key is required.' },400);
  const fullName=words(body.fullName,160),roleTitle=words(body.roleTitle,160),
    email=words(body.email,320).toLowerCase(),phone=words(body.phone,40),
    locationId=words(body.locationId,128),sourceKind=words(body.sourceKind,40)||'internal',
    sourceReference=words(body.sourceReference,200);
  if (fullName.length<2||roleTitle.length<2||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
    (typeof body.fullName !== 'string' || fullName !== body.fullName.trim())||
    !optionalText(body.email,320)||!optionalText(body.phone,40)||
    !optionalText(body.locationId,128)||!optionalText(body.sourceKind,40)||
    !optionalText(body.sourceReference,200)||
    (body.sourceKind !== undefined && (typeof body.sourceKind !== 'string' || !body.sourceKind.trim()))||
    !['internal','referral','import_reference','website_reference'].includes(sourceKind)||
    (sourceKind.endsWith('reference')&&!sourceReference)) {
    return response({ error: 'Check the candidate name, role, source and contact fields.' },400);
  }
  if (!(await activeLocation(env,companyId,locationId))) return error();
  const payload={companyId,locationId,fullName,roleTitle,email,phone,sourceKind,sourceReference};
  const digest=await payloadHash(payload),actor=context.employee.id,action='create_candidate';
  const replay=await replayOrConflict(env,actor,companyId,action,key,digest);
  if (replay) return replay;
  const id=uid('recruitment-candidate'),ref=uid('candidate-ref');
  const failure=await batchInsert(env,[
    receiptSql(env,key,action,actor,companyId,digest,'candidate',id),
    env.DB.prepare(`INSERT INTO recruitment_candidates
      (id,company_id,location_id,candidate_ref,full_name,email,phone,role_title,
       source_kind,source_reference,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,companyId,locationId||null,ref,fullName,email||null,phone||null,
        roleTitle,sourceKind,sourceReference||null,actor),
    auditSql(env,actor,companyId,action,'recruitment_candidate',id,null,
      {candidateRef:ref,stage:'applied',sourceKind},key)
  ],actor,companyId,action,key,digest);
  return failure||response({ok:true,id,candidateRef:ref,stage:'applied'},201);
}

const transitions: Record<CandidateStage,CandidateStage[]> = {
  applied:['screening','closed_rejected','withdrawn'],
  screening:['interview','closed_rejected','withdrawn'],
  interview:['decision','closed_rejected','withdrawn'],
  decision:['offer_prepared','closed_rejected','withdrawn'],
  offer_prepared:['closed_rejected','withdrawn'],
  closed_rejected:[],withdrawn:[]
};
async function advanceCandidate(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const body=await bodyOf(request); if(!body)return response({error:'Invalid stage decision.'},400);
  const companyId=words(body.companyId,128),id=words(body.id,150),stage=words(body.nextStage,40) as CandidateStage;
  if (!companyFor(context,companyId,'edit')) return error();
  if (!isRevision(body.expectedRevision) || !id || !Object.values(transitions).flat().includes(stage))
    return response({ error:'Expected revision and a valid next stage are required.' },400);
  if (['offer_prepared','closed_rejected'].includes(stage)&&!companyFor(context,companyId,'approve')) return error();
  const row=await candidate(env,companyId,id);if(!row)return error();
  if (!transitions[row.stage]?.includes(stage)||row.revision!==body.expectedRevision)
    return response({error:'Candidate stage changed. Refresh before deciding.'},409);
  // Only completed interviews may advance into a hiring decision; only approved offers may be prepared.
  const prerequisite=stage==='decision'
    ? `AND EXISTS(SELECT 1 FROM recruitment_interviews i WHERE i.company_id=recruitment_candidates.company_id
       AND i.candidate_id=recruitment_candidates.id AND i.status='completed')`
    : stage==='offer_prepared'
    ? `AND EXISTS(SELECT 1 FROM recruitment_offers o WHERE o.company_id=recruitment_candidates.company_id
       AND o.candidate_id=recruitment_candidates.id AND o.status='approved')`:'';
  const mutation=uid('recruitment-mutation'),actor=context.employee.id;
  const changed=await casBatch(env,
    env.DB.prepare(`UPDATE recruitment_candidates SET stage=?,revision=revision+1,
      last_mutation_id=?,updated_by=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=? AND stage=? AND revision=? ${prerequisite}`)
      .bind(stage,mutation,actor,id,companyId,row.stage,row.revision),
    guardedAuditSql(env,'recruitment_candidates',actor,companyId,
      'candidate_stage','recruitment_candidate',id,mutation,
      {stage:row.stage,revision:row.revision},{stage,revision:row.revision+1}));
  return changed?response({ok:true,id,stage,revision:row.revision+1}):
    response({error:'Candidate is no longer eligible for this stage. Refresh the record.'},409);
}

async function scheduleInterview(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const body=await bodyOf(request);if(!body)return response({error:'Invalid interview request.'},400);
  const companyId=words(body.companyId,128),candidateId=words(body.candidateId,150),
    interviewerId=words(body.interviewerEmployeeId,150),meetingMode=words(body.meetingMode,20)||'remote',
    key=idempotency(request);
  if(!companyFor(context,companyId,'edit'))return error();
  if(!key)return response({error:'A valid idempotency key is required.'},400);
  const inputDate=words(body.scheduledAt,80),scheduledDate=new Date(inputDate);
  if(!candidateId||!interviewerId||!['remote','onsite','phone'].includes(meetingMode)||
    !optionalText(body.meetingMode,20)||
    (body.meetingMode !== undefined && (typeof body.meetingMode !== 'string' || !body.meetingMode.trim()))||
    !inputDate||!Number.isFinite(scheduledDate.getTime())||scheduledDate.getTime()<=Date.now()||
    scheduledDate.getTime()>Date.now()+3*365*24*60*60*1000)
    return response({error:'Enter a valid future interview and interviewer.'},400);
  const scheduledAt=scheduledDate.toISOString(),payload={companyId,candidateId,interviewerId,meetingMode,scheduledAt},
    digest=await payloadHash(payload),actor=context.employee.id,action='schedule_interview';
  const replay=await replayOrConflict(env,actor,companyId,action,key,digest);if(replay)return replay;
  const row=await candidate(env,companyId,candidateId);
  if(!row||!['screening','interview'].includes(row.stage))return error();
  if(!await activeInterviewer(env,companyId,interviewerId,row.locationId))return error();
  const id=uid('recruitment-interview');
  const failure=await batchInsert(env,[
    receiptSql(env,key,action,actor,companyId,digest,'interview',id),
    env.DB.prepare(`INSERT INTO recruitment_interviews
      (id,company_id,candidate_id,interviewer_employee_id,scheduled_at,meeting_mode,created_by)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM recruitment_candidates
        WHERE id=? AND company_id=? AND stage IN ('screening','interview'))
      AND EXISTS (SELECT 1 FROM employee_company_memberships m JOIN employees e
        ON e.id=m.employee_id JOIN recruitment_candidates c
        ON c.company_id=m.company_id AND c.id=?
        WHERE m.employee_id=? AND m.company_id=?
        AND m.active=1 AND e.employment_status='active'
        AND (c.location_id IS NULL OR c.location_id=m.location_id))`)
      .bind(id,companyId,candidateId,interviewerId,scheduledAt,meetingMode,actor,
        candidateId,companyId,candidateId,interviewerId,companyId),
    auditSql(env,actor,companyId,action,'recruitment_interview',id,null,{candidateId,scheduledAt,meetingMode},key)
  ],actor,companyId,action,key,digest);
  return failure||response({ok:true,id,status:'scheduled'},201);
}
async function reviewInterview(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const body=await bodyOf(request);if(!body)return response({error:'Invalid interview review.'},400);
  const companyId=words(body.companyId,128),id=words(body.id,150),
    decision=words(body.decision,30),recommendation=words(body.recommendation,30),
    feedback=words(body.feedback,3000);
  if(!companyFor(context,companyId,'edit'))return error();
  if(!isRevision(body.expectedRevision)||!id||!['completed','cancelled'].includes(decision)||
    (decision==='completed'&&(!feedback||!['advance','hold','reject'].includes(recommendation))))
    return response({error:'Interview decision, feedback and expected revision are required.'},400);
  const row=await env.DB.prepare(`SELECT i.id,i.status,i.revision,i.candidate_id AS candidateId,
    i.scheduled_at AS scheduledAt,c.stage AS candidateStage
    FROM recruitment_interviews i JOIN recruitment_candidates c
      ON c.id=i.candidate_id AND c.company_id=i.company_id
    WHERE i.id=? AND i.company_id=?`)
    .bind(id,companyId).first<{id:string;status:string;revision:number;candidateId:string;
      scheduledAt:string;candidateStage:CandidateStage}>();
  if(!row)return error();
  if(row.status!=='scheduled'||row.revision!==body.expectedRevision)
    return response({error:'Interview changed. Refresh before deciding.'},409);
  const appointment=Date.parse(row.scheduledAt);
  if(decision==='completed'&&(!Number.isFinite(appointment)||appointment>Date.now()||
    ['withdrawn','closed_rejected'].includes(row.candidateStage)))
    return response({error:'Interview cannot be completed before its scheduled time or after candidate closure.'},409);
  const mutation=uid('recruitment-mutation'),actor=context.employee.id;
  const changed=await casBatch(env,
    env.DB.prepare(`UPDATE recruitment_interviews SET status=?,feedback=?,recommendation=?,
      revision=revision+1,last_mutation_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=? AND status='scheduled' AND revision=?`)
      .bind(decision,decision==='completed'?feedback:null,decision==='completed'?recommendation:null,
        mutation,id,companyId,row.revision),
    guardedAuditSql(env,'recruitment_interviews',actor,companyId,
      'interview_review','recruitment_interview',id,mutation,
      {status:row.status,revision:row.revision},{status:decision,recommendation:decision==='completed'?recommendation:null,revision:row.revision+1}));
  return changed?response({ok:true,id,status:decision,revision:row.revision+1}):
    response({error:'Interview was already decided.'},409);
}
async function createOffer(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const body=await bodyOf(request);if(!body)return response({error:'Invalid offer draft.'},400);
  const companyId=words(body.companyId,128),candidateId=words(body.candidateId,150),
    roleTitle=words(body.roleTitle,160),termsSummary=words(body.termsSummary,2400),key=idempotency(request);
  if(!companyFor(context,companyId,'approve'))return error();
  if(!key)return response({error:'A valid idempotency key is required.'},400);
  if(!candidateId||roleTitle.length<2||termsSummary.length<10)
    return response({error:'Role and bounded internal offer terms are required.'},400);
  const payload={companyId,candidateId,roleTitle,termsSummary},digest=await payloadHash(payload),
    actor=context.employee.id,action='create_offer';
  const replay=await replayOrConflict(env,actor,companyId,action,key,digest);if(replay)return replay;
  const row=await candidate(env,companyId,candidateId);if(!row||row.stage!=='decision')return error();
  const id=uid('recruitment-offer');
  const failure=await batchInsert(env,[
    receiptSql(env,key,action,actor,companyId,digest,'offer',id),
    env.DB.prepare(`INSERT INTO recruitment_offers
      (id,company_id,candidate_id,role_title,terms_summary,created_by)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM recruitment_candidates
        WHERE id=? AND company_id=? AND stage='decision')`)
      .bind(id,companyId,candidateId,roleTitle,termsSummary,actor,candidateId,companyId),
    auditSql(env,actor,companyId,action,'recruitment_offer',id,null,
      {candidateId,status:'draft',termsRestricted:true},key)
  ],actor,companyId,action,key,digest);
  return failure||response({ok:true,id,status:'draft',message:'Internal offer draft only; no provider delivery or acceptance.'},201);
}
async function approveOffer(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const body=await bodyOf(request);if(!body)return response({error:'Invalid offer decision.'},400);
  const companyId=words(body.companyId,128),id=words(body.id,150),
    next=words(body.decision,20);
  if(!companyFor(context,companyId,'approve'))return error();
  if(!id||!isRevision(body.expectedRevision)||!['approved','withdrawn'].includes(next))
    return response({error:'Offer decision and expected revision are required.'},400);
  const row=await env.DB.prepare(`SELECT id,status,revision,candidate_id AS candidateId
    FROM recruitment_offers WHERE id=? AND company_id=?`)
    .bind(id,companyId).first<{id:string;status:string;revision:number;candidateId:string}>();
  if(!row)return error();
  if(row.status!=='draft'||row.revision!==body.expectedRevision)
    return response({error:'Offer decision changed. Refresh before deciding.'},409);
  const mutation=uid('recruitment-mutation'),actor=context.employee.id;
  const prerequisite=next==='approved'? `AND EXISTS(SELECT 1 FROM recruitment_candidates c
    WHERE c.id=recruitment_offers.candidate_id AND c.company_id=recruitment_offers.company_id
    AND c.stage='decision')` : '';
  const changed=await casBatch(env,
    env.DB.prepare(`UPDATE recruitment_offers SET status=?,revision=revision+1,
      approved_by=CASE WHEN ?='approved' THEN ? ELSE NULL END,
      approved_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
      last_mutation_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?
      AND status='draft' AND revision=? ${prerequisite}`)
      .bind(next,next,actor,next,mutation,id,companyId,row.revision),
    guardedAuditSql(env,'recruitment_offers',actor,companyId,
      'offer_decision','recruitment_offer',id,mutation,
      {status:'draft',revision:row.revision},{status:next,revision:row.revision+1,providerDelivery:false}));
  return changed?response({ok:true,id,status:next,revision:row.revision+1,
    message:'Internal approval only. No offer sent and no candidate acceptance recorded.'}):
    response({error:'Offer is not eligible for this decision.'},409);
}
async function requestHrHandoff(request: Request, env: RecruitmentEnv, context: SessionContext) {
  const body=await bodyOf(request);if(!body)return response({error:'Invalid onboarding handoff.'},400);
  const companyId=words(body.companyId,128),candidateId=words(body.candidateId,150),
    offerId=words(body.offerId,150),evidence=words(body.acceptanceEvidenceRef,400),key=idempotency(request);
  if(!companyFor(context,companyId,'approve'))return error();
  if(!key)return response({error:'A valid idempotency key is required.'},400);
  if(!candidateId||!offerId||evidence.length<10)
    return response({error:'Candidate, approved offer and acceptance evidence reference are required.'},400);
  const payload={companyId,candidateId,offerId,evidence},digest=await payloadHash(payload),
    actor=context.employee.id,action='request_hr_handoff';
  const replay=await replayOrConflict(env,actor,companyId,action,key,digest);if(replay)return replay;
  const row=await candidate(env,companyId,candidateId);
  const offer=await env.DB.prepare(`SELECT id FROM recruitment_offers WHERE id=? AND company_id=?
    AND candidate_id=? AND status='approved'`).bind(offerId,companyId,candidateId).first();
  if(!row||row.stage!=='offer_prepared'||!offer)return error();
  const id=uid('recruitment-handoff');
  const failure=await batchInsert(env,[
    receiptSql(env,key,action,actor,companyId,digest,'hr_handoff',id),
    env.DB.prepare(`INSERT INTO recruitment_hr_handoffs
      (id,company_id,candidate_id,offer_id,acceptance_evidence_ref,requested_by)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM recruitment_candidates
      WHERE id=? AND company_id=? AND stage='offer_prepared') AND EXISTS
      (SELECT 1 FROM recruitment_offers WHERE id=? AND company_id=? AND candidate_id=? AND status='approved')`)
      .bind(id,companyId,candidateId,offerId,evidence,actor,candidateId,companyId,offerId,companyId,candidateId),
    auditSql(env,actor,companyId,action,'recruitment_hr_handoff',id,null,
      {candidateId,offerId,status:'pending',acceptanceEvidenceRecorded:true,hrAcknowledged:false},key)
  ],actor,companyId,action,key,digest);
  return failure||response({ok:true,id,status:'pending',
    message:'Pending HR authority review. No employee account created or hiring completion claimed.'},201);
}
export async function routeRecruitment(request: Request, env: RecruitmentEnv, context: SessionContext): Promise<Response|null> {
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/recruitment'))return null;
  if(path==='/api/recruitment/companies'&&request.method==='GET')return companies(env,context);
  if(path==='/api/recruitment/candidates'&&request.method==='GET')return list(request,env,context);
  if(path==='/api/recruitment/candidates'&&request.method==='POST')return createCandidate(request,env,context);
  const candidateMatch=path.match(/^\/api\/recruitment\/candidates\/([a-zA-Z0-9_-]{8,150})$/);
  if(candidateMatch&&request.method==='GET')return detail(request,env,context,candidateMatch[1]);
  if(path==='/api/recruitment/candidates/stage'&&request.method==='POST')return advanceCandidate(request,env,context);
  if(path==='/api/recruitment/interviewers'&&request.method==='GET')return eligibleInterviewers(request,env,context);
  if(path==='/api/recruitment/interviews'&&request.method==='POST')return scheduleInterview(request,env,context);
  if(path==='/api/recruitment/interviews/review'&&request.method==='POST')return reviewInterview(request,env,context);
  if(path==='/api/recruitment/offers'&&request.method==='POST')return createOffer(request,env,context);
  if(path==='/api/recruitment/offers/decision'&&request.method==='POST')return approveOffer(request,env,context);
  if(path==='/api/recruitment/hr-handoffs'&&request.method==='POST')return requestHrHandoff(request,env,context);
  return response({error:'Recruitment route unavailable.'},404);
}
