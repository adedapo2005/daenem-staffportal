import type { AuthEnv } from './auth';

type RecoveryEnv = Pick<AuthEnv, 'DB' | 'APP_STAGE' | 'AUTH_PEPPER'>;
type RecoveryChannel = 'email' | 'whatsapp';

// One shared budget for both public recovery channels. Reservations and
// successful-request audits are the same atomic SQLite/D1 statement.
const WINDOW = '-15 minutes';
const MAX_IP_REQUESTS = 5;
const MAX_IDENTIFIER_REQUESTS = 3;
const MAX_DENIAL_AUDITS_PER_IP = 3;
const encoder = new TextEncoder();

async function recoveryIdentifierHash(env: RecoveryEnv, identifier: string) {
  const secret = env.AUTH_PEPPER || (env.APP_STAGE === 'production'
    ? undefined : 'bootstrap-stage-only-change-before-production');
  if (!secret) throw new Error('Recovery security secret is unavailable.');
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const hash = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`staffportal-recovery-v1:${identifier}`),
  );
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function reservePublicRecoveryAttempt(
  env: RecoveryEnv, request: Request, identifier: string, channel: RecoveryChannel,
): Promise<boolean> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || normalized.length > 254) return false;
  const identifierHash = await recoveryIdentifierHash(env, normalized);
  const ipAddress = request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent');
  const details = JSON.stringify({ channel, identifierHash });

  // D1 serializes this one conditional INSERT as a single write. A separate
  // COUNT followed by INSERT allows competing requests to overspend a budget.
  const reserved = await env.DB.prepare(`
    INSERT INTO security_logs (
      id, event_type, severity, result, ip_address, user_agent, details_json
    )
    SELECT ?, 'account_recovery_rate_gate', 'low', 'accepted', ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM security_logs
      WHERE event_type = 'account_recovery_rate_gate' AND result = 'accepted'
        AND ip_address = ? AND datetime(occurred_at) >= datetime('now', '${WINDOW}')
    ) < ? AND (
      SELECT COUNT(*) FROM security_logs
      WHERE event_type = 'account_recovery_rate_gate' AND result = 'accepted'
        AND json_extract(details_json, '$.identifierHash') = ?
        AND datetime(occurred_at) >= datetime('now', '${WINDOW}')
    ) < ?
    RETURNING id
  `).bind(
    `recovery-${crypto.randomUUID()}`, ipAddress, userAgent, details,
    ipAddress, MAX_IP_REQUESTS, identifierHash, MAX_IDENTIFIER_REQUESTS,
  ).first<{ id: string }>();
  if (reserved?.id) return true;

  // Retain evidence of initial abuse without creating an unlimited log-write
  // amplification endpoint. Never attempt delivery after a failed reservation.
  await env.DB.prepare(`
    INSERT INTO security_logs (
      id, event_type, severity, result, ip_address, user_agent, details_json
    )
    SELECT ?, 'account_recovery_rate_limited', 'medium', 'denied', ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM security_logs
      WHERE event_type = 'account_recovery_rate_limited' AND ip_address = ?
        AND datetime(occurred_at) >= datetime('now', '${WINDOW}')
    ) < ?
  `).bind(
    `recovery-${crypto.randomUUID()}`, ipAddress, userAgent, details,
    ipAddress, MAX_DENIAL_AUDITS_PER_IP,
  ).run();
  return false;
}
