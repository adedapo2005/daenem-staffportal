import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const credentials = await readFile(new URL('../worker/meta-credentials.ts', import.meta.url), 'utf8');
const service = await readFile(new URL('../worker/communications-service.ts', import.meta.url), 'utf8');
const mutations = await readFile(new URL('../worker/weather-credential-mutations.ts', import.meta.url), 'utf8');

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
  assert.match(route, /replaceGoogleWeatherCredentialWithAudit/);
  assert.match(route, /revokeGoogleWeatherCredentialWithAudit/);
  assert.match(route, /configured:credential\.configured,source:credential\.source,updatedAt:credential\.updatedAt/);
  assert.doesNotMatch(route, /ciphertext|resolveMetaCredential\(env,key\)/);
  assert.match(route, /typeof body\.value!=='string'/);
  assert.match(route, /const validationError=validateMetaCredential\(key,body\.value\)/);
  assert.doesNotMatch(route, /saveMetaCredential|deleteMetaCredential|auditCommunication\(env,context,undefined,'(?:replace|revoke)_weather_provider_credential'/);
  assert.match(service, /if\(key==='google_weather_api_key'\)return json\(\{error:'Use the weather credential endpoint for this provider\.'/);
  assert.match(service, /\/api\/communications\/admin\/weather-credential/);
}

{
  assert.match(mutations, /await env\.DB\.batch\(\[/g);
  assert.match(mutations, /WHERE changes\(\)=1/);
  assert.match(mutations, /WHERE NOT EXISTS \(SELECT 1 FROM audit_logs WHERE id=\?\)/);
  assert.match(mutations, /module,action,entity_type,entity_id,after_json,source/);
  assert.doesNotMatch(mutations, /JSON\.stringify\(\s*\{[^}]*value/);
}

console.log('Google Weather credential boundary: 2/2 PASS');
