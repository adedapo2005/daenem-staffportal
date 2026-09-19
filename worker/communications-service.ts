import { type AuthEnv, type AccessLevel } from './auth.js';
import { hasCompanyPermission, type EnhancedSessionContext } from './auth-context-v2.js';
import { eventById } from './communications/catalog.js';
import { generateDraft, workersAiDraftProvider } from './communications/drafts.js';
import { renderPlaceholders } from './communications/whatsapp.js';
import type { Authorization, Channel, RequestContext } from './communications/types.js';
import {
  assertStaffPortalCompany,
  communicationBoundary,
  communicationScope,
  loadPolicySnapshot,
  mapCommunicationError,
  reserveCapacity,
  upsertPolicyRule,
} from './communications-repository.js';

interface Env extends AuthEnv {
  AI?: Ai;
}

const json = (body: Record<string, unknown> | unknown[], status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  });

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const owner = (context: EnhancedSessionContext) =>
  context.roles.some(role => role.code === 'owner');

function can(
  context: EnhancedSessionContext,
  companyId: string,
  permission: string,
  minimum: AccessLevel = 'view',
) {
  return owner(context) || hasCompanyPermission(context, companyId, permission, minimum);
}

function companyAllowed(context: EnhancedSessionContext, companyId: string) {
  assertStaffPortalCompany(companyId);
  return owner(context) || context.companies.some(company => company.id === companyId);
}

function communicationPermission(
  context: EnhancedSessionContext,
  companyId: string,
  module: string,
  action: string,
  minimum: AccessLevel,
) {
  return can(context, companyId, `communications.${module}.${action}`, minimum);
}

function authzAdapter(
  context: EnhancedSessionContext,
  sourceId: string,
  sourceRevision: string,
): Authorization {
  return {
    hasPermission(_actorId, scope, permission, minimum) {
      return can(context, scope.companyId, permission, minimum as AccessLevel);
    },
    canReadSource(_actorId, scope, recordId, revision) {
      return companyAllowed(context, scope.companyId) &&
        recordId === sourceId &&
        revision === sourceRevision;
    },
  };
}

async function getPolicy(
  request: Request,
  env: Env,
  context: EnhancedSessionContext,
) {
  const url = new URL(request.url);
  const companyId = String(url.searchParams.get('companyId') || '');
  const eventId = String(url.searchParams.get('eventId') || '');
  if (!companyId || !eventId || !companyAllowed(context, companyId)) {
    return json({ error:'Company and use case are required.' }, 400);
  }
  const event = eventById(eventId);
  if (!communicationPermission(context, companyId, event.module, 'manage', 'view') &&
      !can(context, companyId, 'settings.access', 'view')) {
    return json({ error:'Communication administration access is not assigned.' }, 403);
  }
  const policy = await loadPolicySnapshot(env, companyId, eventId);
  return json({
    companyId,
    eventId,
    revision:policy.revision,
    effectiveUntil:new Date(policy.validUntilMs).toISOString(),
    global:policy.global,
    useCase:policy.useCase,
  });
}

async function savePolicy(
  request: Request,
  env: Env,
  context: EnhancedSessionContext,
) {
  let body: {
    companyId?: string;
    eventId?: string;
    enabled?: boolean;
    aiEnabled?: boolean;
    autoGenerate?: boolean;
    autoSend?: boolean;
    requireHumanApproval?: boolean;
    channels?: Channel[];
    languages?: string[];
    maxCharacters?: number;
  };
  try { body = await request.json(); }
  catch { return json({ error:'Invalid communication policy.' }, 400); }

  const companyId = String(body.companyId || '');
  const eventId = String(body.eventId || '');
  if (!companyId || !eventId || !companyAllowed(context, companyId)) {
    return json({ error:'Company and use case are required.' }, 400);
  }
  const event = eventById(eventId);
  if (!communicationPermission(context, companyId, event.module, 'manage', 'manage')) {
    return json({ error:'Manage Communications permission is required.' }, 403);
  }
  const channels = Array.isArray(body.channels)
    ? body.channels.filter(value => ['whatsapp','email','in_app','push'].includes(value))
    : [];
  const languages = Array.isArray(body.languages)
    ? body.languages.filter(value => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value))
    : [];
  const maxCharacters = Number(body.maxCharacters || 1000);
  if (!channels.length || !languages.length ||
      !Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > 4000) {
    return json({ error:'At least one channel/language and a valid message limit are required.' }, 400);
  }
  await upsertPolicyRule(env, {
    companyId,
    module:event.module,
    eventId,
    enabled:Boolean(body.enabled),
    aiEnabled:Boolean(body.aiEnabled),
    autoGenerate:Boolean(body.autoGenerate),
    autoSend:Boolean(body.autoSend),
    requireHumanApproval:body.requireHumanApproval !== false,
    channels,
    languages,
    maxCharacters,
    actorId:context.employee.id,
  });
  const policy = await loadPolicySnapshot(env, companyId, eventId);
  return json({ ok:true, companyId, eventId, revision:policy.revision });
}

async function resolveOnboardingSource(
  env: Env,
  companyId: string,
  sourceId: string,
) {
  return env.DB.prepare(`
    SELECT t.id, t.updated_at AS updatedAt, t.title, t.due_date AS dueDate,
      p.employee_id AS employeeId, e.display_name AS employeeName,
      c.name AS companyName
    FROM hr_lifecycle_tasks t
    JOIN hr_lifecycle_processes p ON p.id=t.process_id
    JOIN employees e ON e.id=p.employee_id
    JOIN companies c ON c.id=p.company_id
    WHERE t.id=? AND p.company_id=? AND p.process_type='onboarding'
    LIMIT 1
  `).bind(sourceId, companyId).first<{
    id:string; updatedAt:string; title:string; dueDate?:string;
    employeeId:string; employeeName:string; companyName:string;
  }>();
}

async function instructionProfile(env: Env, companyId: string) {
  return env.DB.prepare(`
    SELECT id,version,tone,instructions,model
    FROM communication_instruction_profiles
    WHERE company_id=? AND module='hr' AND active=1
    ORDER BY version DESC LIMIT 1
  `).bind(companyId).first<{
    id:string; version:number; tone:'professional'|'warm'|'concise';
    instructions:string; model:string;
  }>();
}

async function generateOnboardingDraft(
  request: Request,
  env: Env,
  context: EnhancedSessionContext,
) {
  let body: { companyId?:string; sourceId?:string; operation?:string; language?:string };
  try { body = await request.json(); }
  catch { return json({ error:'Invalid draft request.' }, 400); }
  const companyId = String(body.companyId || '');
  const sourceId = String(body.sourceId || '');
  if (!companyId || !sourceId || !companyAllowed(context, companyId)) {
    return json({ error:'Company and onboarding task are required.' }, 400);
  }
  if (!communicationPermission(context, companyId, 'hr', 'generate', 'create') ||
      !can(context, companyId, 'hr.lifecycle', 'view')) {
    return json({ error:'AI-assisted HR communication access is not assigned.' }, 403);
  }
  if (!env.AI) return json({ error:'AI drafting is not configured.' }, 503);

  const source = await resolveOnboardingSource(env, companyId, sourceId);
  if (!source) return json({ error:'Onboarding task not found.' }, 404);
  const profile = await instructionProfile(env, companyId);
  if (!profile) return json({ error:'No approved HR communication instruction profile is active.' }, 409);

  const eventId = 'hr.onboarding.reminder';
  const policy = await loadPolicySnapshot(env, companyId, eventId);
  const boundary = await communicationBoundary(env, companyId);
  const sourceRevision = String(source.updatedAt);
  const reqContext: RequestContext = {
    scope:communicationScope(companyId),
    actorId:context.employee.id,
    eventId,
    channel:'whatsapp',
    language:String(body.language || 'en'),
    sourceRecordId:source.id,
    sourceRevision,
  };
  const requestedPlaceholders = eventById(eventId).placeholders;
  const operation = ['generate','refine','shorten','translate','personalize'].includes(String(body.operation))
    ? String(body.operation) as 'generate'|'refine'|'shorten'|'translate'|'personalize'
    : 'generate';
  const generationCapacityReserved = await reserveCapacity(env, {
    companyId,
    actorId:context.employee.id,
    type:'ai_generation',
    eventId,
    sourceId:source.id,
  });
  let result;
  try {
    result = await generateDraft({
      context:reqContext,
      policy,
      boundary,
      authorization:authzAdapter(context, source.id, sourceRevision),
      style:{
        version:String(profile.version),
        tone:profile.tone,
        instructions:profile.instructions,
        model:profile.model,
      },
      operation,
      requestedPlaceholders,
      automaticGeneration:false,
      generationCapacityReserved,
      nowMs:Date.now(),
    }, workersAiDraftProvider(env.AI, [profile.model]));
  } catch (error) {
    return json({ error:mapCommunicationError(error) }, 409);
  }
  const firstName = source.employeeName.trim().split(/\s+/)[0] || 'Employee';
  const preview = renderPlaceholders(eventId, result.body, {
    first_name:firstName,
    organization_name:source.companyName,
    portal_link:'https://staffportal.daenem.com/hr',
  }, 'https://staffportal.daenem.com');
  const draftId = uid('comm-draft');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  await env.DB.prepare(`
    INSERT INTO communication_drafts(
      id,company_id,event_id,source_type,source_id,source_revision,
      author_employee_id,recipient_employee_id,channel,language,body,
      content_origin,policy_revision,instruction_profile_id,status,expires_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    draftId,companyId,eventId,'hr_lifecycle_task',source.id,sourceRevision,
    context.employee.id,source.employeeId,'whatsapp',reqContext.language,preview,
    'ai',policy.revision,profile.id,'pending_approval',expiresAt,
  ).run();
  return json({
    ok:true,
    draftId,
    status:'pending_approval',
    preview,
    policyRevision:policy.revision,
    instructionVersion:profile.version,
  }, 201);
}

export async function createLeaveDecisionCommunicationDraft(
  env: AuthEnv,
  actorId: string,
  companyId: string,
  leaveRequestId: string,
): Promise<{ created:boolean; draftId?:string; reason?:string }> {
  assertStaffPortalCompany(companyId);
  const eventId = 'hr.leave.status_ready';
  const policy = await loadPolicySnapshot(env,companyId,eventId);
  if (!policy.useCase.enabled || !policy.global.enabled) {
    return { created:false,reason:'disabled' };
  }
  const source = await env.DB.prepare(`
    SELECT lr.id,lr.updated_at AS updatedAt,lr.employee_id AS employeeId,
      e.display_name AS employeeName,c.name AS companyName,lr.status
    FROM leave_requests lr
    JOIN employees e ON e.id=lr.employee_id
    JOIN companies c ON c.id=lr.company_id
    WHERE lr.id=? AND lr.company_id=? AND lr.status IN ('approved','rejected')
    LIMIT 1
  `).bind(leaveRequestId,companyId).first<{
    id:string;updatedAt:string;employeeId:string;employeeName:string;companyName:string;status:string;
  }>();
  if (!source) return { created:false,reason:'source_not_ready' };
  const existing = await env.DB.prepare(`
    SELECT id FROM communication_drafts
    WHERE company_id=? AND event_id=? AND source_id=?
      AND status IN ('draft','pending_approval','approved','queued')
    ORDER BY created_at DESC LIMIT 1
  `).bind(companyId,eventId,source.id).first<{id:string}>();
  if (existing) return { created:false,draftId:existing.id,reason:'already_exists' };
  const firstName = source.employeeName.trim().split(/\s+/)[0] || 'Employee';
  const preview = `Hello ${firstName}, your leave request decision is available in the Staff Portal. Open https://staffportal.daenem.com/hr to review it securely.`;
  const draftId = uid('comm-draft');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  await env.DB.prepare(`
    INSERT INTO communication_drafts(
      id,company_id,event_id,source_type,source_id,source_revision,
      author_employee_id,recipient_employee_id,channel,language,body,
      content_origin,policy_revision,status,expires_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    draftId,companyId,eventId,'leave_request',source.id,String(source.updatedAt),
    actorId,source.employeeId,'whatsapp','en',preview,
    'deterministic',policy.revision,'pending_approval',expiresAt,
  ).run();
  return { created:true,draftId };
}

async function createLeaveReadyDraft(
  request: Request,
  env: Env,
  context: EnhancedSessionContext,
) {
  let body: { companyId?:string; leaveRequestId?:string };
  try { body = await request.json(); }
  catch { return json({ error:'Invalid leave communication request.' }, 400); }
  const companyId = String(body.companyId || '');
  const leaveRequestId = String(body.leaveRequestId || '');
  if (!companyId || !leaveRequestId || !companyAllowed(context, companyId)) {
    return json({ error:'Company and leave request are required.' }, 400);
  }
  if (!communicationPermission(context, companyId, 'hr', 'create', 'create') ||
      !can(context, companyId, 'leave.admin', 'view')) {
    return json({ error:'HR communication access is not assigned.' }, 403);
  }
  const result = await createLeaveDecisionCommunicationDraft(
    env,context.employee.id,companyId,leaveRequestId,
  );
  if (!result.created && result.reason === 'disabled') {
    return json({ error:'Leave WhatsApp communication is disabled.' }, 409);
  }
  if (!result.created && result.reason === 'source_not_ready') {
    return json({ error:'Reviewed leave request not found.' }, 404);
  }
  return json({
    ok:true,
    draftId:result.draftId,
    status:result.created ? 'pending_approval' : 'already_exists',
  }, result.created ? 201 : 200);
}

async function digestDraft(row: Record<string, unknown>) {
  const canonical = JSON.stringify([
    row.id,row.companyId,row.eventId,row.sourceId,row.sourceRevision,row.authorId,
    row.recipientId,row.channel,row.language,row.body,row.contentOrigin,row.policyRevision,row.expiresAt,
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}

async function approveDraft(
  request: Request,
  env: Env,
  context: EnhancedSessionContext,
) {
  let body: { companyId?:string; draftId?:string };
  try { body = await request.json(); }
  catch { return json({ error:'Invalid approval request.' }, 400); }
  const companyId = String(body.companyId || '');
  const draftId = String(body.draftId || '');
  if (!companyId || !draftId || !companyAllowed(context, companyId)) {
    return json({ error:'Company and draft are required.' }, 400);
  }
  if (!communicationPermission(context, companyId, 'hr', 'approve', 'approve')) {
    return json({ error:'Approve HR Communications permission is required.' }, 403);
  }
  const row = await env.DB.prepare(`
    SELECT id,company_id AS companyId,event_id AS eventId,source_id AS sourceId,
      source_revision AS sourceRevision,author_employee_id AS authorId,
      recipient_employee_id AS recipientId,channel,language,body,
      content_origin AS contentOrigin,policy_revision AS policyRevision,
      status,expires_at AS expiresAt
    FROM communication_drafts WHERE id=? AND company_id=? LIMIT 1
  `).bind(draftId,companyId).first<Record<string, unknown>>();
  if (!row || row.status !== 'pending_approval') return json({ error:'Pending draft not found.' }, 404);
  if (String(row.authorId) === context.employee.id) {
    return json({ error:'The author cannot approve this communication.' }, 409);
  }
  if (new Date(String(row.expiresAt)).getTime() <= Date.now()) {
    return json({ error:'This draft has expired.' }, 409);
  }
  const currentPolicy = await loadPolicySnapshot(env, companyId, String(row.eventId));
  if (currentPolicy.revision !== String(row.policyRevision)) {
    return json({ error:'Communication policy changed; regenerate or review the draft again.' }, 409);
  }
  const digest = await digestDraft(row);
  const approvalId = uid('comm-approval');
  const expiresAt = new Date(Math.min(
    new Date(String(row.expiresAt)).getTime(),
    Date.now() + 24 * 60 * 60_000,
  )).toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO communication_approvals(
        id,draft_id,approver_employee_id,content_digest,policy_revision,expires_at
      ) VALUES(?,?,?,?,?,?)
    `).bind(approvalId,draftId,context.employee.id,digest,currentPolicy.revision,expiresAt),
    env.DB.prepare(`
      UPDATE communication_drafts
      SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(draftId),
  ]);
  return json({ ok:true,draftId,status:'approved',approvalId,expiresAt });
}

export async function routeCommunications(
  request: Request,
  env: Env,
  context: EnhancedSessionContext,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const method = request.method;
  try {
    if (path === '/api/communications/admin/policy' && method === 'GET') {
      return getPolicy(request,env,context);
    }
    if (path === '/api/communications/admin/policy' && method === 'POST') {
      return savePolicy(request,env,context);
    }
    if (path === '/api/communications/hr/onboarding/draft' && method === 'POST') {
      return generateOnboardingDraft(request,env,context);
    }
    if (path === '/api/communications/hr/leave-ready/draft' && method === 'POST') {
      return createLeaveReadyDraft(request,env,context);
    }
    if (path === '/api/communications/drafts/approve' && method === 'POST') {
      return approveDraft(request,env,context);
    }
  } catch (error) {
    return json({ error:mapCommunicationError(error) }, 409);
  }
  return null;
}
