import type { AuthEnv } from './auth.js';
import { decryptSocialSecret, encryptSocialSecret, type SocialCryptoEnv } from './social-crypto.js';

export interface StorageMirrorVaultEnv extends AuthEnv, SocialCryptoEnv {}

export interface OneDriveOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
}

export interface ResolvedOneDriveOAuthTokens extends OneDriveOAuthTokens {
  refreshRequired: boolean;
}

const ONEDRIVE_ALLOWED_OAUTH_SCOPES = new Set(['Files.ReadWrite.AppFolder', 'offline_access']);

function normalizeOneDriveScopes(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((scope) => typeof scope !== 'string')) {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_RESPONSE_INVALID');
  }
  const scopes = [...new Set(value.map((scope: string) => scope.trim()).filter(Boolean))];
  if (scopes.length > 40 || scopes.some((scope) => scope.length > 256 || !ONEDRIVE_ALLOWED_OAUTH_SCOPES.has(scope)) ||
    !scopes.includes('Files.ReadWrite.AppFolder')) {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_RESPONSE_INVALID');
  }
  return scopes;
}

function validToken(value: string) {
  return typeof value === 'string' && value.length > 0 && value.length <= 16_384;
}

function parseCanonicalExpiry(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}

// An initial OAuth connection must never overwrite an already connected account.
// A refresh must supply the exact encrypted refresh-token snapshot it read before
// contacting Microsoft. One conditional UPDATE wins; stale attempts fail closed.
// The guard is server-internal encrypted state, never a customer- or UI-supplied token.
export async function storeOneDriveOAuthTokens(
  env: StorageMirrorVaultEnv,
  tokens: OneDriveOAuthTokens,
  expectedRefreshTokenCiphertext?: string,
) {
  const expiresAt = parseCanonicalExpiry(tokens.expiresAt);
  const scopes = normalizeOneDriveScopes(tokens.scopes);
  if (!validToken(tokens.accessToken) || !validToken(tokens.refreshToken) ||
    !expiresAt || expiresAt.getTime() <= Date.now()) {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_RESPONSE_INVALID');
  }
  if (expectedRefreshTokenCiphertext !== undefined &&
    (typeof expectedRefreshTokenCiphertext !== 'string' ||
      expectedRefreshTokenCiphertext.length === 0 ||
      expectedRefreshTokenCiphertext.length > 65_536)) {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_ROTATION_GUARD_INVALID');
  }

  const accessTokenCiphertext = await encryptSocialSecret(env, tokens.accessToken);
  const refreshTokenCiphertext = await encryptSocialSecret(env, tokens.refreshToken);
  const statement = expectedRefreshTokenCiphertext === undefined
    ? env.DB.prepare(`INSERT INTO storage_mirror_oauth_tokens(
        id,access_token_ciphertext,refresh_token_ciphertext,expires_at,scopes_json,updated_at
      ) VALUES('microsoft_onedrive',?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO NOTHING`)
      .bind(accessTokenCiphertext, refreshTokenCiphertext, expiresAt.toISOString(), JSON.stringify(scopes))
    : env.DB.prepare(`UPDATE storage_mirror_oauth_tokens SET
        access_token_ciphertext=?, refresh_token_ciphertext=?, expires_at=?,
        scopes_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE id='microsoft_onedrive' AND refresh_token_ciphertext=?`)
      .bind(accessTokenCiphertext, refreshTokenCiphertext, expiresAt.toISOString(),
        JSON.stringify(scopes), expectedRefreshTokenCiphertext);
  const result = await statement.run();
  if (Number(result.meta?.changes ?? 0) !== 1) {
    throw new Error(expectedRefreshTokenCiphertext === undefined
      ? 'ONEDRIVE_OAUTH_TOKEN_ALREADY_CONNECTED'
      : 'ONEDRIVE_OAUTH_TOKEN_STALE');
  }
  return { expiresAt: expiresAt.toISOString(), scopes };
}

export async function resolveOneDriveOAuthTokens(env: StorageMirrorVaultEnv): Promise<ResolvedOneDriveOAuthTokens | null> {
  const row = await env.DB.prepare(`SELECT access_token_ciphertext AS accessTokenCiphertext,
      refresh_token_ciphertext AS refreshTokenCiphertext,expires_at AS expiresAt,scopes_json AS scopesJson
    FROM storage_mirror_oauth_tokens WHERE id='microsoft_onedrive' LIMIT 1`)
    .first<{ accessTokenCiphertext: string; refreshTokenCiphertext: string; expiresAt: string; scopesJson: string }>();
  if (!row) return null;
  const expiry = parseCanonicalExpiry(row.expiresAt);
  if (!expiry) throw new Error('ONEDRIVE_OAUTH_TOKEN_EXPIRY_INVALID');

  let storedScopes: unknown;
  try {
    storedScopes = JSON.parse(row.scopesJson);
  } catch {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_METADATA_INVALID');
  }

  let scopes: string[];
  try {
    scopes = normalizeOneDriveScopes(storedScopes);
  } catch {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_SCOPE_POLICY_INVALID');
  }

  try {
    const accessToken = await decryptSocialSecret(env, row.accessTokenCiphertext);
    const refreshToken = await decryptSocialSecret(env, row.refreshTokenCiphertext);
    return { accessToken, refreshToken, expiresAt: row.expiresAt, scopes,
      refreshRequired: expiry.getTime() <= Date.now() + 5 * 60_000 };
  } catch {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_DECRYPT_FAILED');
  }
}
