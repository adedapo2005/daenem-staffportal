import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

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
const compiled = stripTypeScriptTypes(executable);
const { resolveOneDriveOAuthTokens, storeOneDriveOAuthTokens } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const db = new DatabaseSync(':memory:');
db.exec(await readFile(new URL('../migrations/0093_storage_mirror_token_vault.sql', import.meta.url), 'utf8'));
const env = {
  DB: {
    prepare(sql) {
      return {
        async first() { return db.prepare(sql).get(); },
        bind(...values) {
          return {
            async first() { return db.prepare(sql).get(...values); },
            async run() { return db.prepare(sql).run(...values); }
          };
        }
      };
    }
  }
};

async function writeStoredRow(scopesJson, accessTokenCiphertext = 'encrypted:access', refreshTokenCiphertext = 'encrypted:refresh', expiresAt = '2026-10-02T00:00:00.000Z') {
  await env.DB.prepare(`INSERT INTO storage_mirror_oauth_tokens
      (id,access_token_ciphertext,refresh_token_ciphertext,expires_at,scopes_json)
    VALUES('microsoft_onedrive',?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET access_token_ciphertext=excluded.access_token_ciphertext,
      refresh_token_ciphertext=excluded.refresh_token_ciphertext,expires_at=excluded.expires_at,
      scopes_json=excluded.scopes_json`)
    .bind(accessTokenCiphertext, refreshTokenCiphertext, expiresAt, scopesJson).run();
}

async function expectReadError(fixture, code) {
  await assert.rejects(resolveOneDriveOAuthTokens(fixture.env), error => error?.message === code);
}

const approvedTokens = {
  accessToken: 'access-secret-fixture',
  refreshToken: 'refresh-secret-fixture',
  expiresAt: '2099-01-01T00:00:00.000Z',
  scopes: ['Files.ReadWrite.AppFolder', 'offline_access']
};
await storeOneDriveOAuthTokens(env, approvedTokens);
const storedRow = db.prepare('SELECT * FROM storage_mirror_oauth_tokens').get();
assert.equal(storedRow.id, 'microsoft_onedrive');
assert.equal(storedRow.access_token_ciphertext, 'encrypted:access-secret-fixture');
assert.equal(storedRow.refresh_token_ciphertext, 'encrypted:refresh-secret-fixture');
assert.equal(storedRow.scopes_json, JSON.stringify(approvedTokens.scopes));
assert.throws(() => db.prepare("INSERT INTO storage_mirror_oauth_tokens(id,access_token_ciphertext,refresh_token_ciphertext,expires_at) VALUES('other-provider','a','b','x')").run(), /CHECK/);
await assert.rejects(storeOneDriveOAuthTokens(env, { ...approvedTokens, scopes: ['Files.ReadWrite.All'] }),
  error => error?.message === 'ONEDRIVE_OAUTH_TOKEN_RESPONSE_INVALID');
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM storage_mirror_oauth_tokens').get().count, 1,
  'rejected token response leaves the existing vault row unchanged');
await assert.rejects(storeOneDriveOAuthTokens(env, { ...approvedTokens, expiresAt: '2020-01-01T00:00:00.000Z' }),
  error => error?.message === 'ONEDRIVE_OAUTH_TOKEN_RESPONSE_INVALID');
await assert.rejects(storeOneDriveOAuthTokens(env, { ...approvedTokens, expiresAt: 'not-an-expiry' }),
  error => error?.message === 'ONEDRIVE_OAUTH_TOKEN_RESPONSE_INVALID');

await writeStoredRow('{');
await expectReadError({ env }, 'ONEDRIVE_OAUTH_TOKEN_METADATA_INVALID');
await writeStoredRow(JSON.stringify(['Files.ReadWrite.All', 'Files.ReadWrite.AppFolder']));
await expectReadError({ env }, 'ONEDRIVE_OAUTH_TOKEN_SCOPE_POLICY_INVALID');
await writeStoredRow(JSON.stringify(approvedTokens.scopes), 'bad-ciphertext');
await expectReadError({ env }, 'ONEDRIVE_OAUTH_TOKEN_DECRYPT_FAILED');
await writeStoredRow(JSON.stringify(approvedTokens.scopes), 'encrypted:access', 'encrypted:refresh', 'invalid-date');
await expectReadError({ env }, 'ONEDRIVE_OAUTH_TOKEN_EXPIRY_INVALID');
await writeStoredRow(JSON.stringify(approvedTokens.scopes), 'encrypted:access', 'encrypted:refresh', '2020-01-01T00:00:00.000Z');
assert.equal((await resolveOneDriveOAuthTokens(env)).refreshRequired, true);
await storeOneDriveOAuthTokens(env, approvedTokens);
const resolvedTokens = await resolveOneDriveOAuthTokens(env);
assert.deepEqual(resolvedTokens, {
  accessToken: 'decrypted:encrypted:access-secret-fixture',
  refreshToken: 'decrypted:encrypted:refresh-secret-fixture',
  expiresAt: approvedTokens.expiresAt,
  scopes: approvedTokens.scopes,
  refreshRequired: false
});
await storeOneDriveOAuthTokens(env, { ...approvedTokens, accessToken: 'rotated-access-fixture' });
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM storage_mirror_oauth_tokens').get().count, 1,
  'token refresh upsert preserves the single-provider vault row');
assert.equal(db.prepare('SELECT access_token_ciphertext FROM storage_mirror_oauth_tokens').get().access_token_ciphertext,
  'encrypted:rotated-access-fixture');

db.close();
console.log('OneDrive OAuth token vault boundary: static assertions + isolated SQLite migration/store/read/error behavior PASS');
