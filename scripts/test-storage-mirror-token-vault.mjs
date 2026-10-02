import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0093_storage_mirror_token_vault.sql', import.meta.url), 'utf8');
const vault = await readFile(new URL('../worker/storage-mirror-vault.ts', import.meta.url), 'utf8');
const routes = await readFile(new URL('../worker/storage-mirror.ts', import.meta.url), 'utf8');

assert.match(migration, /id TEXT PRIMARY KEY CHECK \(id = 'microsoft_onedrive'\)/);
assert.match(migration, /access_token_ciphertext TEXT NOT NULL/);
assert.match(migration, /refresh_token_ciphertext TEXT NOT NULL/);
assert.match(vault, /await encryptSocialSecret\(env, tokens\.accessToken\)/);
assert.match(vault, /await encryptSocialSecret\(env, tokens\.refreshToken\)/);
assert.match(vault, /await decryptSocialSecret\(env, row\.accessTokenCiphertext\)/);
assert.match(vault, /await decryptSocialSecret\(env, row\.refreshTokenCiphertext\)/);
assert.match(vault, /ON CONFLICT\(id\) DO UPDATE/);
assert.match(vault, /ONEDRIVE_OAUTH_TOKEN_DECRYPT_FAILED/);
assert.match(vault, /ONEDRIVE_OAUTH_TOKEN_METADATA_INVALID/);
assert.match(vault, /ONEDRIVE_OAUTH_TOKEN_SCOPE_POLICY_INVALID/);
assert.match(vault, /storedScopes = JSON\.parse\(row\.scopesJson\);[\s\S]*?ONEDRIVE_OAUTH_TOKEN_METADATA_INVALID/);
assert.match(vault, /scopes = normalizeOneDriveScopes\(storedScopes\);[\s\S]*?ONEDRIVE_OAUTH_TOKEN_SCOPE_POLICY_INVALID/);
assert.match(vault, /const accessToken = await decryptSocialSecret\(env, row\.accessTokenCiphertext\);[\s\S]*?ONEDRIVE_OAUTH_TOKEN_DECRYPT_FAILED/);
assert.match(vault, /new Set\(\['Files\.ReadWrite\.AppFolder', 'offline_access'\]\)/);
assert.match(vault, /scope\.length > 256 \|\| !ONEDRIVE_ALLOWED_OAUTH_SCOPES\.has\(scope\)/);
assert.match(vault, /!scopes\.includes\('Files\.ReadWrite\.AppFolder'\)/);
assert.equal((vault.match(/normalizeOneDriveScopes\(/g) ?? []).length, 3,
  'scope allowlist must guard both token storage and vault reads');
assert.doesNotMatch(routes, /storage_mirror_oauth_tokens|access_token_ciphertext|refresh_token_ciphertext/);
assert.match(routes, /authorizationEnabled: false, liveTransferEnabled: false/);

console.log('OneDrive OAuth token vault boundary: 19/19 PASS');
