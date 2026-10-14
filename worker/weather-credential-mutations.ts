import { encryptSocialSecret } from './social-crypto.js';
import { validateMetaCredential, type MetaCredentialEnv } from './meta-credentials.js';
import type { GoogleWeatherResult } from './weather-provider.js';

export async function replaceGoogleWeatherCredentialWithAudit(
  env: MetaCredentialEnv,
  value: string,
  employeeId: string,
  auditId: string,
) {
  const error = validateMetaCredential('google_weather_api_key', value);
  if (error) throw new Error(error);
  const ciphertext = await encryptSocialSecret(env, value.trim());
  const safeAfter = JSON.stringify({ key: 'google_weather_api_key', configured: true });
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO meta_credentials_vault(credential_key,ciphertext,updated_by,updated_at)
      VALUES('google_weather_api_key',?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(credential_key) DO UPDATE SET ciphertext=excluded.ciphertext,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
      .bind(ciphertext, employeeId),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
      SELECT ?,?,'communications','replace_weather_provider_credential','weather_credential','google_weather_api_key',?,'web'
      WHERE changes()=1`)
      .bind(auditId, employeeId, safeAfter),
    requiredAuditGuard(env, employeeId, auditId),
  ]);
  if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
    throw new Error('Weather credential could not be saved with audit evidence.');
  }
}

export async function revokeGoogleWeatherCredentialWithAudit(
  env: MetaCredentialEnv,
  employeeId: string,
  auditId: string,
) {
  const existing = await env.DB.prepare("SELECT 1 AS configured FROM meta_credentials_vault WHERE credential_key='google_weather_api_key' LIMIT 1")
    .first<{ configured: number }>();
  if (!existing) return;
  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM meta_credentials_vault WHERE credential_key='google_weather_api_key'"),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
      SELECT ?,?,'communications','revoke_weather_provider_credential','weather_credential','google_weather_api_key',?,'web'
      WHERE changes()=1`)
      .bind(auditId, employeeId, JSON.stringify({ key: 'google_weather_api_key', configured: false })),
    requiredAuditGuard(env, employeeId, auditId),
  ]);
  if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
    throw new Error('Weather credential could not be revoked with audit evidence.');
  }
}

export async function recordGoogleWeatherProviderTestWithAudit(
  env: MetaCredentialEnv,
  employeeId: string,
  auditId: string,
  outcome: { phase: 'started' | 'completed'; providerStatus: string; ok: boolean | null },
) {
  const action = outcome.phase === 'started'
    ? 'test_weather_provider_connection_started'
    : 'test_weather_provider_connection';
  const result = await env.DB.prepare(`INSERT INTO audit_logs(
      id,actor_employee_id,module,action,entity_type,entity_id,after_json,source
    ) VALUES(?,?,'communications',?,'weather_provider','google_weather_api_key',?,'web')`)
    .bind(auditId, employeeId, action, JSON.stringify({ providerStatus: outcome.providerStatus, ok: outcome.ok }))
    .run();
  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error('Weather provider test audit could not be persisted.');
  }
}

export async function runGoogleWeatherProviderTestWithAudit(
  env: MetaCredentialEnv,
  employeeId: string,
  auditId: () => string,
  testProvider: () => Promise<GoogleWeatherResult>,
): Promise<GoogleWeatherResult> {
  await recordGoogleWeatherProviderTestWithAudit(env, employeeId, auditId(), {
    phase: 'started', providerStatus: 'pending', ok: null,
  });
  let result: GoogleWeatherResult;
  try { result = await testProvider(); }
  catch { result = { data: null, providerStatus: 'provider_unavailable' }; }
  await recordGoogleWeatherProviderTestWithAudit(env, employeeId, auditId(), {
    phase: 'completed', providerStatus: result.providerStatus, ok: Boolean(result.data),
  });
  return result;
}

function requiredAuditGuard(env: MetaCredentialEnv, employeeId: string, auditId: string) {
  return env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,source)
    SELECT 'weather-audit-guard-' || ?,?,NULL,'required_audit_missing','weather_credential','google_weather_api_key','web'
    WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE id=?)`)
    .bind(auditId, employeeId, auditId);
}
