import type { AccessLevel, AuthEnv } from './auth.js';
import { hasCompanyPermission, type EnhancedSessionContext } from './auth-context-v2.js';
import { eventById } from './communications/catalog.js';
import { assertStaffPortalCompany } from './communications-repository.js';

const json = (body:Record<string,unknown>|unknown[], status=200) => new Response(JSON.stringify(body), {
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  },
});
const uid = (prefix:string) => `${prefix}-${crypto.randomUUID()}`;
const owner = (context:EnhancedSessionContext) =>
  context.roles.some(role => ['owner','group_admin'].includes(role.code));

function companyAllowed(context:EnhancedSessionContext, companyId:string) {
  assertStaffPortalCompany(companyId);
  const company=context.companies.find(item => item.id===companyId);
  return Boolean(company) && !/farm/i.test(`${company!.id} ${company!.code} ${company!.name}`);
}

function canManageEvent(
  context:EnhancedSessionContext,
  companyId:string,
  eventId:string,
  minimum:AccessLevel='view',
) {
  try {
    const event=eventById(eventId);
    return owner(context) ||
      hasCompanyPermission(context,companyId,`communications.${event.module}.manage`,minimum);
  } catch {
    return false;
  }
}

const statuses=new Set([
  'queued','sending','accepted','delivered','read','failed','cancelled','expired',
]);

async function listOutbox(
  request:Request,
  env:AuthEnv,
  context:EnhancedSessionContext,
) {
  const url=new URL(request.url);
  const companyId=String(url.searchParams.get('companyId')||'');
  const eventId=String(url.searchParams.get('eventId')||'');
  if(!companyId||!eventId||!companyAllowed(context,companyId)) {
    return json({error:'Company and use case are required.'},400);
  }
  if(!canManageEvent(context,companyId,eventId,'view')) {
    return json({error:'Communications management access is not assigned.'},403);
  }
  const status=String(url.searchParams.get('status')||'');
  if(status&&!statuses.has(status)) return json({error:'Valid outbox filters are required.'},400);
  const requested=Number(url.searchParams.get('limit')||50);
  if(!Number.isInteger(requested)||requested<1) {
    return json({error:'Valid outbox filters are required.'},400);
  }
  const limit=Math.min(100,requested);
  const rows=await env.DB.prepare(`
    SELECT id,event_id AS eventId,channel,status,attempts,max_attempts AS maxAttempts,
      ambiguity_state AS ambiguityState,
      CASE
        WHEN last_error_code IS NULL THEN NULL
        WHEN last_error_code='PROVIDER_BUDGET_LIMIT' THEN 'capacity'
        WHEN last_error_code='MAX_ATTEMPTS' THEN 'attempts_exhausted'
        WHEN last_error_code LIKE 'PROVIDER_%' THEN 'provider'
        ELSE 'delivery'
      END AS errorCategory,
      CASE WHEN provider_message_id IS NULL THEN 0 ELSE 1 END AS hasProviderReference,
      created_at AS createdAt,updated_at AS updatedAt,next_attempt_at AS nextAttemptAt,
      expires_at AS expiresAt
    FROM communication_outbox
    WHERE company_id=? AND event_id=? AND (?='' OR status=?)
    ORDER BY created_at DESC,id DESC
    LIMIT ?
  `).bind(companyId,eventId,status,status,limit).all<Record<string,unknown>>();
  return json({companyId,eventId,items:rows.results||[],limit});
}

type AdminAction='provider_accepted'|'provider_not_sent'|'retry'|'cancel';

function actionAudit(
  env:AuthEnv,
  input:{auditId:string;employeeId:string;companyId:string;eventId:string;outboxId:string;
    action:AdminAction;providerMessageId:string},
) {
  const {auditId,employeeId,companyId,eventId,outboxId,action,providerMessageId}=input;
  const actionName=`outbox_${action}`;
  const eligible=action==='provider_accepted'||action==='provider_not_sent'
    ? "status='failed' AND ambiguity_state='provider_unknown'"
    : action==='retry'
      ? "status='failed' AND ambiguity_state<>'provider_unknown' AND attempts<max_attempts AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))"
      : "status IN ('queued','failed') AND ambiguity_state<>'provider_unknown'";
  const uniqueProvider=action==='provider_accepted'
    ? ' AND NOT EXISTS(SELECT 1 FROM communication_outbox other WHERE other.company_id=? AND other.provider_message_id=? AND other.id<>communication_outbox.id)'
    : '';
  const statement=env.DB.prepare(`
    INSERT INTO audit_logs(
      id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source
    )
    SELECT ?,?,?,'communications',?,'communication_outbox',id,?,'web'
    FROM communication_outbox
    WHERE id=? AND company_id=? AND event_id=? AND ${eligible}${uniqueProvider}
  `);
  const base=[auditId,employeeId,companyId,actionName,
    JSON.stringify({action,providerReferenceVerified:action==='provider_accepted'}),
    outboxId,companyId,eventId];
  return action==='provider_accepted'
    ? statement.bind(...base,companyId,providerMessageId)
    : statement.bind(...base);
}

function actionUpdate(
  env:AuthEnv,
  input:{auditId:string;companyId:string;eventId:string;outboxId:string;
    action:AdminAction;providerMessageId:string},
) {
  const {auditId,companyId,eventId,outboxId,action,providerMessageId}=input;
  const auditGuard=`EXISTS(
    SELECT 1 FROM audit_logs a
    WHERE a.id=? AND a.company_id=communication_outbox.company_id
      AND a.entity_id=communication_outbox.id
  )`;
  if(action==='provider_accepted') {
    return env.DB.prepare(`
      UPDATE communication_outbox
      SET status='accepted',ambiguity_state='reconciled',provider_message_id=?,
        accepted_at=COALESCE(accepted_at,CURRENT_TIMESTAMP),last_error_code=NULL,
        next_attempt_at=NULL,lease_owner=NULL,lease_expires_at=NULL,
        last_provider_response_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=? AND event_id=?
        AND status='failed' AND ambiguity_state='provider_unknown' AND ${auditGuard}
    `).bind(providerMessageId,outboxId,companyId,eventId,auditId);
  }
  if(action==='provider_not_sent') {
    return env.DB.prepare(`
      UPDATE communication_outbox
      SET status='queued',ambiguity_state='reconciled',provider_message_id=NULL,
        last_error_code=NULL,next_attempt_at=CURRENT_TIMESTAMP,
        lease_owner=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=? AND event_id=?
        AND status='failed' AND ambiguity_state='provider_unknown' AND ${auditGuard}
    `).bind(outboxId,companyId,eventId,auditId);
  }
  if(action==='retry') {
    return env.DB.prepare(`
      UPDATE communication_outbox
      SET status='queued',last_error_code=NULL,next_attempt_at=CURRENT_TIMESTAMP,
        lease_owner=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=? AND event_id=?
        AND status='failed' AND ambiguity_state<>'provider_unknown'
        AND attempts<max_attempts
        AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))
        AND ${auditGuard}
    `).bind(outboxId,companyId,eventId,auditId);
  }
  return env.DB.prepare(`
    UPDATE communication_outbox
    SET status='cancelled',last_error_code=NULL,next_attempt_at=NULL,
      lease_owner=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND company_id=? AND event_id=?
      AND status IN ('queued','failed') AND ambiguity_state<>'provider_unknown'
      AND ${auditGuard}
  `).bind(outboxId,companyId,eventId,auditId);
}

async function applyOutboxAction(
  request:Request,
  env:AuthEnv,
  context:EnhancedSessionContext,
) {
  let body:{companyId?:string;eventId?:string;outboxId?:string;
    action?:AdminAction;providerMessageId?:string};
  try { body=await request.json(); }
  catch { return json({error:'Invalid outbox action request.'},400); }
  const companyId=String(body.companyId||'');
  const eventId=String(body.eventId||'');
  const outboxId=String(body.outboxId||'');
  const action=String(body.action||'') as AdminAction;
  const providerMessageId=String(body.providerMessageId||'').trim();
  if(!companyId||!eventId||!outboxId||
      !['provider_accepted','provider_not_sent','retry','cancel'].includes(action)||
      !companyAllowed(context,companyId)) {
    return json({error:'Valid company, use case and outbox action are required.'},400);
  }
  if(!canManageEvent(context,companyId,eventId,'manage')) {
    return json({error:'Manage Communications permission is required.'},403);
  }
  if(action==='provider_accepted'&&!/^[A-Za-z0-9._:-]{1,256}$/.test(providerMessageId)) {
    return json({error:'A valid provider reference is required.'},400);
  }
  if(action!=='provider_accepted'&&providerMessageId) {
    return json({error:'A provider reference is not valid for this action.'},400);
  }
  const auditId=uid('audit');
  const input={auditId,employeeId:context.employee.id,companyId,eventId,outboxId,action,providerMessageId};
  const [audited,updated]=await env.DB.batch([
    actionAudit(env,input),
    actionUpdate(env,input),
  ]);
  if(Number(audited.meta?.changes||0)!==1||Number(updated.meta?.changes||0)!==1) {
    return json({error:'Outbox action could not be applied.'},409);
  }
  const status=action==='provider_accepted'?'accepted':
    action==='cancel'?'cancelled':'queued';
  return json({ok:true,outboxId,status,reconciled:
    action==='provider_accepted'||action==='provider_not_sent'});
}

export async function routeCommunicationOutboxAdmin(
  request:Request,
  env:AuthEnv,
  context:EnhancedSessionContext,
):Promise<Response|null> {
  const {pathname}=new URL(request.url);
  if(pathname==='/api/communications/admin/outbox'&&request.method==='GET') {
    return listOutbox(request,env,context);
  }
  if(pathname==='/api/communications/admin/outbox/actions'&&request.method==='POST') {
    return applyOutboxAction(request,env,context);
  }
  return null;
}
