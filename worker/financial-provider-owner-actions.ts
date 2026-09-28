import type { AuthEnv, SessionContext } from './auth';

interface Env extends AuthEnv {}
const COMPANIES = new Set(['company-printing','company-bakery','company-autos','company-properties','company-logistics']);
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const owner = (context: SessionContext) => context.roles.some((role) => role.code === 'owner');

export async function routeFinancialProviderOwnerActions(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/financial-gateway/provider-owner-actions') return null;
  if (!owner(context)) return json({ error: 'Owner provider-setup access is required.' }, 403);
  if (request.method === 'GET') {
    const status = url.searchParams.get('status');
    if (status && !['waiting_owner','cleared','cancelled'].includes(status)) return json({ error: 'Choose a valid owner-action status.' }, 400);
    const result = await env.DB.prepare(`SELECT id,company_id AS companyId,provider,action,reason,blocked,not_blocked,
      clearing_evidence AS clearingEvidence,status,created_at AS createdAt,updated_at AS updatedAt
      FROM financial_provider_owner_actions WHERE (? IS NULL OR status=?)
      ORDER BY CASE status WHEN 'waiting_owner' THEN 0 ELSE 1 END,updated_at DESC,id LIMIT 100`)
      .bind(status, status).all<Record<string, unknown>>();
    return json({ actions: result.results || [], limit: 100 });
  }
  if (request.method !== 'POST') return json({ error: 'Use GET or POST for provider owner actions.' }, 405);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: 'Invalid provider owner action.' }, 400); }
  const fields = ['id','companyId','provider','action','reason','blocked','notBlocked','clearingEvidence'] as const;
  const values = Object.fromEntries(fields.map((field) => [field, typeof body[field] === 'string' ? (body[field] as string).trim() : ''])) as Record<typeof fields[number], string>;
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(values.id) || !COMPANIES.has(values.companyId) ||
      !values.provider || values.provider.length > 80 || !values.action || values.action.length > 240 ||
      !values.reason || values.reason.length > 1000 || !values.blocked || values.blocked.length > 1000 ||
      !values.notBlocked || values.notBlocked.length > 1000 || !values.clearingEvidence || values.clearingEvidence.length > 1000 ||
      (body.status !== undefined && !['waiting_owner','cleared','cancelled'].includes(String(body.status)))) {
    return json({ error: 'Provider owner-action fields must be complete and bounded.' }, 400);
  }
  const status = String(body.status || 'waiting_owner');
  const existing = await env.DB.prepare('SELECT id FROM financial_provider_owner_actions WHERE id=?').bind(values.id).first<{id:string}>();
  let saved: D1Result;
  let audited: D1Result;
  try { [saved, audited] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO financial_provider_owner_actions(id,company_id,provider,action,reason,blocked,not_blocked,clearing_evidence,status,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET reason=excluded.reason,blocked=excluded.blocked,
      not_blocked=excluded.not_blocked,clearing_evidence=excluded.clearing_evidence,status=excluded.status,
      updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP
      WHERE company_id=excluded.company_id AND provider=excluded.provider AND action=excluded.action`)
      .bind(values.id,values.companyId,values.provider,values.action,values.reason,values.blocked,values.notBlocked,values.clearingEvidence,status,
        context.employee.id,context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
      SELECT ?,?,?,'financial_gateway',?,'financial_provider_owner_action',?,?,'web'
      WHERE changes()=1 AND EXISTS(SELECT 1 FROM financial_provider_owner_actions WHERE id=? AND company_id=? AND provider=? AND action=?)`)
      .bind(`audit-${crypto.randomUUID()}`,context.employee.id,values.companyId,existing?'update_provider_owner_action':'record_provider_owner_action',values.id,
        JSON.stringify({provider:values.provider,action:values.action,status,reason:values.reason,blocked:values.blocked,notBlocked:values.notBlocked,clearingEvidence:values.clearingEvidence}),
        values.id,values.companyId,values.provider,values.action),
  ]); } catch { return json({ error: 'Provider owner action conflicts with an existing business/provider/action record.' }, 409); }
  if (Number(saved.meta?.changes || 0) !== 1 || Number(audited.meta?.changes || 0) !== 1) return json({ error: 'Provider owner action could not be recorded.' }, 409);
  return json({ ok: true, id: values.id, companyId: values.companyId, status, providerCallMade: false }, existing ? 200 : 201);
}
