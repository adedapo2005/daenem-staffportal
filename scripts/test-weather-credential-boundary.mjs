import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const credentials = await readFile(new URL('../worker/meta-credentials.ts', import.meta.url), 'utf8');
const service = await readFile(new URL('../worker/communications-service.ts', import.meta.url), 'utf8');

{
  assert.match(credentials, /'google_weather_api_key'/);
  assert.match(credentials, /await encryptSocialSecret\(env,clean\)/);
  assert.match(credentials, /if\(row\?\.ciphertext\).*decryptSocialSecret/s);
  assert.match(credentials, /google_weather_api_key:undefined/);
  assert.match(credentials, /SELECT credential_key AS key,updated_at AS updatedAt FROM meta_credentials_vault/);
  assert.doesNotMatch(credentials, /google_weather_api_key\s*:\s*'[^']+'/);
}

{
  const route = service.slice(service.indexOf('async function weatherCredentialSetting'), service.indexOf('\nasync function getPolicy'));
  assert.match(route, /if\(!owner\(context\)\).*403/);
  assert.match(route, /replace_weather_provider_credential/);
  assert.match(route, /revoke_weather_provider_credential/);
  assert.match(route, /configured:credential\.configured,source:credential\.source,updatedAt:credential\.updatedAt/);
  assert.doesNotMatch(route, /ciphertext|resolveMetaCredential\(env,key\)/);
  assert.match(route, /typeof body\.value!=='string'/);
  assert.match(route, /saveMetaCredential\(env,key,body\.value,context\.employee\.id\)/);
  assert.match(route, /await auditCommunication\(env,context,undefined,'replace_weather_provider_credential'/);
  assert.match(route, /await auditCommunication\(env,context,undefined,'revoke_weather_provider_credential'/);
  assert.match(service, /if\(key==='google_weather_api_key'\)return json\(\{error:'Use the weather credential endpoint for this provider\.'/);
  assert.match(service, /\/api\/communications\/admin\/weather-credential/);
}

console.log('Google Weather credential boundary: 2/2 PASS');
