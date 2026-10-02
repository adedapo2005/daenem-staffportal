import { type AuthEnv, type SessionContext } from './auth';

export interface AuditRetentionEnv extends AuthEnv {}

type RetentionPolicy = {
  clientTelemetryDays: number;
  serverActivityDays: number;
  formalAuditDays: 0;
  formalSecurityDays: 0;
};

const protectedCategories = ['formal_audit', 'formal_security', 'financial', 'hr'] as const;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function readPolicy(env: AuditRetentionEnv): Promise<RetentionPolicy | null> {
  try {
    const row = await env.DB.prepare(`
      SELECT client_telemetry_days clientTelemetryDays,
        server_activity_days serverActivityDays,
        formal_audit_days formalAuditDays,
        formal_security_days formalSecurityDays
      FROM activity_retention_policies WHERE id='global' LIMIT 1
    `).first<RetentionPolicy>();
    if (!row || row.formalAuditDays !== 0 || row.formalSecurityDays !== 0) return null;
    if (!Number.isInteger(row.clientTelemetryDays) || row.clientTelemetryDays < 30 || row.clientTelemetryDays > 3650) return null;
    if (!Number.isInteger(row.serverActivityDays) || row.serverActivityDays < 30 || row.serverActivityDays > 3650) return null;
    return row;
  } catch {
    return null;
  }
}

export async function previewAuditRetention(request: Request, env: AuditRetentionEnv, context: SessionContext) {
  const isOwner = context.roles.some((role) => role.code === 'owner');
  if (!isOwner) return json({ error: 'Audit retention preview is unavailable.' }, 404);
  const policy = await readPolicy(env);
  if (!policy) return json({ error: 'Audit retention policy is unavailable.' }, 503);

  const clientCutoff = new Date(Date.now() - policy.clientTelemetryDays * 86400000).toISOString();
  const serverCutoff = new Date(Date.now() - policy.serverActivityDays * 86400000).toISOString();
  const [client, server] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) count FROM activity_logs WHERE method='CLIENT' AND occurred_at < ?`).bind(clientCutoff).first<{ count: number }>(),
    env.DB.prepare(`SELECT COUNT(*) count FROM activity_logs WHERE method<>'CLIENT' AND occurred_at < ?`).bind(serverCutoff).first<{ count: number }>(),
  ]);

  return json({
    mode: 'preview_only',
    deletionEnabled: false,
    policy,
    protectedCategories,
    candidates: {
      clientTelemetry: Number(client?.count || 0),
      serverActivity: Number(server?.count || 0),
    },
    cutoffs: { clientTelemetry: clientCutoff, serverActivity: serverCutoff },
  });
}
