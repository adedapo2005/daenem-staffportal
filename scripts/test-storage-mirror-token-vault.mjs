import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

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

const executable = vault.replace(
  "import { decryptSocialSecret, encryptSocialSecret, type SocialCryptoEnv } from './social-crypto.js';",
  `const decryptSocialSecret = async (_env, ciphertext) => {
    if (ciphertext === 'bad-ciphertext') throw new Error('fixture decryption failure');
    return \`decrypted:\${ciphertext}\`;
  };
  const encryptSocialSecret = async (_env, plaintext) => \`encrypted:\${plaintext}\`;`
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { resolveOneDriveOAuthTokens } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

function readFixture(scopesJson, accessTokenCiphertext = 'access', refreshTokenCiphertext = 'refresh') {
  const queries = [];
  const env = {
    DB: {
      prepare(sql) {
        queries.push(sql);
        return {
          first: async () => ({
            scopesJson,
            accessTokenCiphertext,
            refreshTokenCiphertext,
            expiresAt: '2026-10-02T00:00:00.000Z'
          })
        };
      }
    }
  };
  return { env, queries };
}

async function expectReadError(fixture, code) {
  await assert.rejects(resolveOneDriveOAuthTokens(fixture.env), error => error?.message === code);
}

const malformedMetadata = readFixture('{');
await expectReadError(malformedMetadata, 'ONEDRIVE_OAUTH_TOKEN_METADATA_INVALID');
const forbiddenScopes = readFixture(JSON.stringify(['Files.ReadWrite.All', 'Files.ReadWrite.AppFolder']));
await expectReadError(forbiddenScopes, 'ONEDRIVE_OAUTH_TOKEN_SCOPE_POLICY_INVALID');
const ciphertextFailure = readFixture(JSON.stringify(['Files.ReadWrite.AppFolder', 'offline_access']), 'bad-ciphertext');
await expectReadError(ciphertextFailure, 'ONEDRIVE_OAUTH_TOKEN_DECRYPT_FAILED');
const validVault = readFixture(JSON.stringify(['Files.ReadWrite.AppFolder', 'offline_access']));
const resolvedTokens = await resolveOneDriveOAuthTokens(validVault.env);
assert.deepEqual(resolvedTokens, {
  accessToken: 'decrypted:access',
  refreshToken: 'decrypted:refresh',
  expiresAt: '2026-10-02T00:00:00.000Z',
  scopes: ['Files.ReadWrite.AppFolder', 'offline_access']
});

console.log('OneDrive OAuth token vault boundary: 19 static + 4 behavioral assertions PASS');
