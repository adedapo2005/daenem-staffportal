import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0087_storage_mirror_oauth_config.sql', import.meta.url), 'utf8');
const worker = await readFile(new URL('../worker/storage-mirror.ts', import.meta.url), 'utf8');
const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
assert.match(migration, /client_secret_ciphertext TEXT NOT NULL/);
assert.match(migration, /id TEXT PRIMARY KEY CHECK \(id = 'microsoft_onedrive'\)/);
assert.match(worker, /encryptSocialSecret\(env, clientSecret\)/);
assert.match(worker, /request\.method === 'GET'[\s\S]*?authorizationEnabled: false, liveTransferEnabled: false/);
assert.match(worker, /if \(!authorized\(context\)\) return json\([\s\S]*?403\)/);
assert.match(worker, /env\.APP_STAGE === 'production'[\s\S]*?409/);
assert.match(worker, /validMicrosoftId\(tenantId\).*validMicrosoftId\(clientId\)/);
assert.match(worker, /update_onedrive_application_config/);
assert.doesNotMatch(worker, /client_secret_ciphertext AS|SELECT[^;]*client_secret_ciphertext/);
assert.doesNotMatch(worker, /graph\.microsoft\.com|Authorization.*Bearer|fetch\(/);
assert.match(entry, /routeStorageMirror\(request,env,context\)/);
assert.match(entry, /SOCIAL_TOKEN_KEY\?:string/);
console.log('OneDrive OAuth credential vault boundary: 12/12 PASS');
