import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0087_storage_mirror_oauth_config.sql', import.meta.url), 'utf8');
const worker = await readFile(new URL('../worker/storage-mirror.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
const config = worker.slice(worker.indexOf('async function routeOneDriveConfig'), worker.indexOf('export async function routeStorageMirror'));
assert.match(migration, /client_secret_ciphertext TEXT NOT NULL/);
assert.match(migration, /id TEXT PRIMARY KEY CHECK \(id = 'microsoft_onedrive'\)/);
assert.match(config, /request\.method === 'GET'[\s\S]*?authorizationEnabled: false, liveTransferEnabled: false/);
assert.match(config, /if \(!await hasStorageAdminGrant\(env, context\)\) return json\([\s\S]*?403/);
assert.match(config, /official Microsoft OAuth flow; credential entry is unavailable/);
assert.match(config, /ownerActionRequired: true/);
assert.doesNotMatch(config, /clientSecret|encryptSocialSecret|request\.json\(\)/);
assert.doesNotMatch(config, /client_secret_ciphertext AS|SELECT[^;]*client_secret_ciphertext/);
assert.doesNotMatch(config, /graph\.microsoft\.com|Authorization.*Bearer|fetch\(/);
assert.match(entry, /routeStorageMirror\(request,env,context\)/);
console.log('OneDrive OAuth no-secret-entry boundary: PASS');
