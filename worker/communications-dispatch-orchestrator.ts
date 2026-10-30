import type { DeliveryProvider } from './communications-dispatch.js';
import { dispatchCommunicationOutboxItem } from './communications-dispatch.js';
import { resolveMetaCredential, type MetaCredentialEnv } from './meta-credentials.js';

export interface CommunicationsDispatchEnv extends MetaCredentialEnv {
  COMMUNICATIONS_WHATSAPP_LIVE_SEND?: string;
}

export type CommunicationsDispatchReleaseState = {
  open: boolean;
  reason?: 'environment_disabled' | 'database_disabled' | 'kill_switch_active' | 'provider_credential_missing';
};

export type CommunicationsDispatchSummary = {
  skipped: boolean;
  reason?: string;
  scanned: number;
  accepted: number;
  failed: number;
  deferred: number;
};

const emptySummary = (reason: string): CommunicationsDispatchSummary => ({
  skipped: true,
  reason,
  scanned: 0,
  accepted: 0,
  failed: 0,
  deferred: 0,
});

const enabled = (value: unknown) => String(value || '').trim().toLowerCase() === 'true';
export function normalizeCommunicationDispatchLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(25, Math.trunc(parsed)));
}

export async function communicationsDispatchReleaseState(
  env: CommunicationsDispatchEnv,
): Promise<CommunicationsDispatchReleaseState> {
  if (!enabled(env.COMMUNICATIONS_WHATSAPP_LIVE_SEND)) {
    return { open: false, reason: 'environment_disabled' };
  }
  const rows = await env.DB.prepare(`
    SELECT setting_key AS key,setting_value AS value
    FROM app_settings
    WHERE setting_key IN ('communications.kill_switch','communications.whatsapp_live_send')
  `).all<{ key: string; value: string }>();
  const settings = new Map((rows.results || []).map(row => [row.key, row.value]));
  if (enabled(settings.get('communications.kill_switch') ?? 'true')) {
    return { open: false, reason: 'kill_switch_active' };
  }
  if (!enabled(settings.get('communications.whatsapp_live_send'))) {
    return { open: false, reason: 'database_disabled' };
  }
  const tokenConfigured = Boolean(await resolveMetaCredential(env, 'meta_system_user_token'));
  if (!tokenConfigured) return { open: false, reason: 'provider_credential_missing' };
  return { open: true };
}

export async function dispatchDueCommunications(
  env: CommunicationsDispatchEnv,
  options: { provider?: DeliveryProvider; limit?: number } = {},
): Promise<CommunicationsDispatchSummary> {
  let release: CommunicationsDispatchReleaseState;
  try {
    release = await communicationsDispatchReleaseState(env);
  } catch {
    return emptySummary('release_check_unavailable');
  }
  if (!release.open) return emptySummary(release.reason || 'release_gate_closed');
  if (!options.provider) return emptySummary('provider_adapter_unavailable');

  const limit = normalizeCommunicationDispatchLimit(options.limit);
  let candidates: D1Result<{ id: string }>;
  try {
    candidates = await env.DB.prepare(`
    SELECT id
    FROM communication_outbox
    WHERE channel='whatsapp'
      AND status IN ('queued','failed')
      AND COALESCE(ambiguity_state,'clear')<>'provider_unknown'
      AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now'))
      AND (lease_expires_at IS NULL OR datetime(lease_expires_at)<=datetime('now'))
      AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))
    ORDER BY priority DESC,created_at ASC
    LIMIT ?
  `).bind(limit).all<{ id: string }>();
  } catch {
    return emptySummary('candidate_discovery_unavailable');
  }

  const summary: CommunicationsDispatchSummary = {
    skipped: false,
    scanned: 0,
    accepted: 0,
    failed: 0,
    deferred: 0,
  };
  for (const candidate of candidates.results || []) {
    summary.scanned += 1;
    try {
      const result = await dispatchCommunicationOutboxItem(env, candidate.id, options.provider);
      if (result.status === 'accepted') summary.accepted += 1;
      else if (result.status === 'failed' || result.status === 'expired') summary.failed += 1;
      else summary.deferred += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
