import type { AuthEnv } from './auth.js';
import { decryptSocialSecret, encryptSocialSecret, type SocialCryptoEnv } from './social-crypto.js';

export interface StorageMirrorVaultEnv extends AuthEnv, SocialCryptoEnv {}

export interface OneDriveOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
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
  return value.length > 0 && value.length <= 16_384;
}

export async function storeOneDriveOAuthTokens(env: StorageMirrorVaultEnv, tokens: OneDriveOAuthTokens) {
  const expiresAt = new Date(tokens.expiresAt);
  const scopes = normalizeOneDriveScopes(tokens.scopes);
  if (!validToken(tokens.accessToken) || !validToken(tokens.refreshToken) ||
    !Number.isFinite(expiresAt.getTime())) {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_RESPONSE_INVALID');
  }

  const accessTokenCiphertext = await encryptSocialSecret(env, tokens.accessToken);
  const refreshTokenCiphertext = await encryptSocialSecret(env, tokens.refreshToken);
  await env.DB.prepare(`INSERT INTO storage_mirror_oauth_tokens(
      id,access_token_ciphertext,refresh_token_ciphertext,expires_at,scopes_json,updated_at
    ) VALUES('microsoft_onedrive',?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      access_token_ciphertext=excluded.access_token_ciphertext,
      refresh_token_ciphertext=excluded.refresh_token_ciphertext,
      expires_at=excluded.expires_at,scopes_json=excluded.scopes_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(accessTokenCiphertext, refreshTokenCiphertext, expiresAt.toISOString(), JSON.stringify(scopes)).run();
  return { expiresAt: expiresAt.toISOString(), scopes };
}

export async function resolveOneDriveOAuthTokens(env: StorageMirrorVaultEnv): Promise<OneDriveOAuthTokens | null> {
  const row = await env.DB.prepare(`SELECT access_token_ciphertext AS accessTokenCiphertext,
      refresh_token_ciphertext AS refreshTokenCiphertext,expires_at AS expiresAt,scopes_json AS scopesJson
    FROM storage_mirror_oauth_tokens WHERE id='microsoft_onedrive' LIMIT 1`)
    .first<{ accessTokenCiphertext: string; refreshTokenCiphertext: string; expiresAt: string; scopesJson: string }>();
  if (!row) return null;
  try {
    const scopes = normalizeOneDriveScopes(JSON.parse(row.scopesJson));
    return {
      accessToken: await decryptSocialSecret(env, row.accessTokenCiphertext),
      refreshToken: await decryptSocialSecret(env, row.refreshTokenCiphertext),
      expiresAt: row.expiresAt,
      scopes,
    };
  } catch {
    throw new Error('ONEDRIVE_OAUTH_TOKEN_DECRYPT_FAILED');
  }
}
