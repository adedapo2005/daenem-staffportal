import { type AuthEnv, type SessionContext } from './auth';

export interface AuditRetentionEnv extends AuthEnv {}

type RetentionPolicy = {
  clientTelemetryDays: number;
  serverActivityDays: number;
  formalAuditDays: 0;
  formalSecurityDays: 0;
};

type RetentionPolicyRow = Omit<RetentionPolicy, 'clientTelemetryDays' | 'serverActivityDays'> & {
  clientTelemetryDays: number | null;
  serverActivityDays: number | null;
};

const protectedCategories = ['formal_audit', 'formal_security', 'financial', 'hr'] as const;
const DAY_MS = 86400000;

function cutoffForDays(days: number, now = Date.now()): string | null {
  const timestamp = now - days * DAY_MS;
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const cutoff = date.toISOString();
  // The database timestamps use four-digit UTC years; extended ISO years do
  // not sort lexically with those values, so they cannot produce a truthful cutoff.
  return /^\d{4}-\d{2}-\d{2}T/.test(cutoff) ? cutoff : null;
}

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
    `).first<RetentionPolicyRow>();
    if (!row || row.formalAuditDays !== 0 || row.formalSecurityDays !== 0) return null;
    if (!Number.isSafeInteger(row.clientTelemetryDays) || row.clientTelemetryDays! <= 0) return null;
    if (!Number.isSafeInteger(row.serverActivityDays) || row.serverActivityDays! <= 0) return null;
    return {
      clientTelemetryDays: row.clientTelemetryDays!,
      serverActivityDays: row.serverActivityDays!,
      formalAuditDays: row.formalAuditDays,
      formalSecurityDays: row.formalSecurityDays,
    };
  } catch {
    return null;
  }
}

export async function previewAuditRetention(request: Request, env: AuditRetentionEnv, context: SessionContext) {
  const isOwner = context.roles.some((role) => role.code === 'owner');
  if (!isOwner) return json({ error: 'Audit retention preview is unavailable.' }, 404);
  const policy = await readPolicy(env);
  if (!policy) return json({ error: 'Audit retention policy is unavailable.' }, 503);

  const clientCutoff = cutoffForDays(policy.clientTelemetryDays);
  const serverCutoff = cutoffForDays(policy.serverActivityDays);
  if (!clientCutoff || !serverCutoff) return json({ error: 'Audit retention preview is unavailable.' }, 503);
  // Server activity has no durable retention category yet. Counting every
  // non-client row as eligible could include protected financial or HR history,
  // so keep that candidate count unavailable until rows can be classified.
  const client = await env.DB.prepare(`SELECT COUNT(*) count FROM activity_logs WHERE method='CLIENT' AND occurred_at < ?`).bind(clientCutoff).first<{ count: number }>();

  return json({
    mode: 'preview_only',
    deletionEnabled: false,
    policy,
    protectedCategories,
    candidates: {
      clientTelemetry: Number(client?.count || 0),
      serverActivity: null,
    },
    candidateAvailability: { serverActivity: 'category_classification_required' },
    cutoffs: { clientTelemetry: clientCutoff, serverActivity: serverCutoff },
  });
}
