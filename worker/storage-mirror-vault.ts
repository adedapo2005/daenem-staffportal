import type { AuthEnv } from './auth.js';
import { decryptSocialSecret, encryptSocialSecret, type SocialCryptoEnv } from './social-crypto.js';

export interface StorageMirrorVaultEnv extends AuthEnv, SocialCryptoEnv {}

export interface OneDriveOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
}

function validToken(value: string) {
  return value.length > 0 && value.length <= 16_384;
}

export async function storeOneDriveOAuthTokens(env: StorageMirrorVaultEnv, tokens: OneDriveOAuthTokens) {
  const expiresAt = new Date(tokens.expiresAt);
  const scopes = [...new Set(tokens.scopes.map((scope) => scope.trim()).filter(Boolean))];
  if (!validToken(tokens.accessToken) || !validToken(tokens.refreshToken) ||
    !Number.isFinite(expiresAt.getTime()) || scopes.length > 40 || scopes.some((scope) => scope.length > 256)) {
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
    const scopes = JSON.parse(row.scopesJson);
    if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string')) throw new Error('invalid scopes');
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
