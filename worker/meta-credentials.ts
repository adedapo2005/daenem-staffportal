import type { AuthEnv } from './auth.js';
import { decryptSocialSecret, encryptSocialSecret, type SocialCryptoEnv } from './social-crypto.js';

export type MetaCredentialKey=
  |'meta_app_id'
  |'meta_app_secret'
  |'meta_system_user_token'
  |'meta_login_config_id'
  |'whatsapp_embedded_config_id'
  |'communications_webhook_verify_token'
  |'meta_graph_version'
  |'whatsapp_waba_id'
  |'whatsapp_phone_number_id'
  |'google_weather_api_key';

export interface MetaCredentialEnv extends AuthEnv,SocialCryptoEnv{
  META_APP_ID?:string;
  META_APP_SECRET?:string;
  META_SYSTEM_USER_TOKEN?:string;
  META_LOGIN_CONFIG_ID?:string;
  WHATSAPP_EMBEDDED_CONFIG_ID?:string;
  COMMUNICATIONS_WEBHOOK_VERIFY_TOKEN?:string;
  META_GRAPH_VERSION?:string;
  GOOGLE_WEATHER_API_KEY?:string;
}

type Definition={
  key:MetaCredentialKey;label:string;secret:boolean;requiredFor:string[];
  helpUrl:string;helpSteps:string[];placeholder:string;
};

export const META_CREDENTIAL_DEFINITIONS:Definition[]=[
  {key:'meta_app_id',label:'Meta App ID',secret:false,requiredFor:['Facebook','Instagram','WhatsApp'],placeholder:'Numeric App ID',helpUrl:'https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings',helpSteps:['Open Meta for Developers and select the Staff Portal Meta app.','Open App settings → Basic.','Copy the App ID shown for that app. Use only the Staff Portal app, not an app owned by another DAENEM site.']},
  {key:'meta_app_secret',label:'Meta App Secret',secret:true,requiredFor:['Webhook signatures','Facebook','Instagram'],placeholder:'App Secret',helpUrl:'https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings',helpSteps:['Open the Staff Portal app in the Meta App Dashboard.','Open App settings → Basic. Meta documents this Basic Settings page as the place to find the App Secret assigned to the app.','Copy the existing App Secret into this field and keep it server-side only. Meta says to reset the secret from Basic Settings if it is compromised.']},
  {key:'meta_system_user_token',label:'Meta System User Access Token',secret:true,requiredFor:['WhatsApp outbound API'],placeholder:'System User token',helpUrl:'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',helpSteps:['Open Meta Business Settings → System users and create or select the Staff Portal system user.','Assign the Staff Portal app with Manage app full control and assign the Staff Portal WhatsApp account with Manage WhatsApp Business accounts full control.','Choose Generate token for the Staff Portal app and include business_management, whatsapp_business_messaging, and whatsapp_business_management as specified by Meta’s current Cloud API Get Started guide.','Copy the generated token and store it securely in this field.']},
  {key:'meta_login_config_id',label:'Facebook Login for Business Configuration ID',secret:false,requiredFor:['Facebook/Instagram OAuth'],placeholder:'Configuration ID',helpUrl:'https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/',helpSteps:['Open the Staff Portal app in Meta for Developers.','Open Facebook Login for Business and its Configurations area.','Copy the configuration ID used for the Staff Portal business-login flow. Leave blank if this app does not use a Login for Business configuration.']},
  {key:'whatsapp_embedded_config_id',label:'WhatsApp Embedded Signup Configuration ID',secret:false,requiredFor:['WhatsApp Embedded Signup'],placeholder:'Embedded Signup config ID',helpUrl:'https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4',helpSteps:['Open the Staff Portal app and follow Meta’s current WhatsApp Embedded Signup implementation flow.','Use an Embedded Signup v4 configuration for new or updated integration work. Meta’s current documentation says Embedded Signup v2 is deprecated on October 15, 2026.','Copy the configuration ID for the Staff Portal onboarding flow here. Leave this field blank when Embedded Signup is not used.']},
  {key:'communications_webhook_verify_token',label:'WhatsApp Webhook Verify Token',secret:true,requiredFor:['WhatsApp webhook verification'],placeholder:'Your webhook verify token',helpUrl:'https://developers.facebook.com/docs/graph-api/webhooks/getting-started',helpSteps:['This value is chosen by you; Meta does not issue it.','Create a long random token and save it here.','Enter the exact same value in Meta when configuring the WhatsApp webhook callback. It is used for the webhook verification challenge, not as an API access token.']},
  {key:'meta_graph_version',label:'Meta Graph API Version',secret:false,requiredFor:['Meta API requests'],placeholder:'Example: v24.0',helpUrl:'https://developers.facebook.com/docs/graph-api/overview',helpSteps:['Use the Graph API version supported by the Staff Portal Meta app and the product documentation you are configuring.','If left blank, the application uses its code-level compatibility default. Review Meta upgrade notices before changing this value.']},
  {key:'whatsapp_waba_id',label:'WhatsApp Business Account ID (WABA ID)',secret:false,requiredFor:['WhatsApp management'],placeholder:'Numeric WABA ID',helpUrl:'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',helpSteps:['Open the Staff Portal Meta app and go to the WhatsApp use case → API Setup.','Connect or select the Staff Portal WhatsApp Business account. Meta’s current guide says the WhatsApp Business account ID is displayed in the API Setup panel once connected.','Copy that WABA ID here and confirm it belongs to the Staff Portal WhatsApp account.']},
  {key:'whatsapp_phone_number_id',label:'WhatsApp Phone Number ID',secret:false,requiredFor:['WhatsApp Cloud API sending'],placeholder:'Numeric Phone Number ID',helpUrl:'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',helpSteps:['Open the Staff Portal Meta app and go to the WhatsApp use case → API Setup.','Select the From phone number used by the Staff Portal. Meta’s current guide instructs you to retain the business phone number ID shown by API Setup.','Copy that Phone Number ID here. It is the Meta asset ID, not the visible telephone number.']},
  {key:'google_weather_api_key',label:'Google Weather API Key',secret:true,requiredFor:['Authenticated Staff Portal weather'],placeholder:'Google Weather API key',helpUrl:'https://developers.google.com/maps/documentation/weather',helpSteps:['Create or select the approved Staff Portal Google Cloud project.','Restrict the key to the Weather API and approved server-side usage.','Save the key here. It is encrypted at rest and is never returned after saving.']},
];

const envMap:Record<MetaCredentialKey,keyof MetaCredentialEnv|undefined>={
  meta_app_id:'META_APP_ID',
  meta_app_secret:'META_APP_SECRET',
  meta_system_user_token:'META_SYSTEM_USER_TOKEN',
  meta_login_config_id:'META_LOGIN_CONFIG_ID',
  whatsapp_embedded_config_id:'WHATSAPP_EMBEDDED_CONFIG_ID',
  communications_webhook_verify_token:'COMMUNICATIONS_WEBHOOK_VERIFY_TOKEN',
  meta_graph_version:'META_GRAPH_VERSION',
  whatsapp_waba_id:undefined,
  whatsapp_phone_number_id:undefined,
  google_weather_api_key:'GOOGLE_WEATHER_API_KEY',
};

export function isMetaCredentialKey(value:string):value is MetaCredentialKey{
  return META_CREDENTIAL_DEFINITIONS.some(item=>item.key===value);
}
export function validateMetaCredential(key:MetaCredentialKey,value:string){
  const v=value.trim();
  if(!v)return 'Credential value is required.';
  if(v.length>4096)return 'Credential value is too long.';
  if(['meta_app_id','meta_login_config_id','whatsapp_embedded_config_id','whatsapp_waba_id','whatsapp_phone_number_id'].includes(key)&&!/^[0-9]{5,40}$/.test(v))return 'This Meta identifier should contain digits only.';
  if(key==='meta_graph_version'&&!/^v\d{1,2}\.\d{1,2}$/.test(v))return 'Use a Graph API version such as v24.0.';
  if(key==='communications_webhook_verify_token'&&v.length<16)return 'Use a webhook verify token with at least 16 characters.';
  if(key==='meta_system_user_token'&&v.length<32)return 'The System User token appears too short.';
  if(key==='meta_app_secret'&&v.length<16)return 'The App Secret appears too short.';
  return null;
}
async function staffPortalSenderIdentity(env:MetaCredentialEnv){
  const rows=await env.DB.prepare(`
    SELECT s.id,s.meta_app_id AS metaAppId,s.waba_id AS wabaId,s.phone_number_id AS phoneNumberId
    FROM communication_whatsapp_senders s
    WHERE s.routing_mode='shared_group'
      AND NOT EXISTS(
        SELECT 1 FROM communication_whatsapp_sender_companies sc
        JOIN companies c ON c.id=sc.company_id
        WHERE sc.sender_id=s.id AND sc.enabled=1
          AND lower(c.id||' '||c.code||' '||c.name) LIKE '%farm%'
      )
    ORDER BY s.created_at LIMIT 2
  `).all<{id:string;metaAppId?:string;wabaId?:string;phoneNumberId?:string}>();
  return (rows.results||[]).length===1?(rows.results||[])[0]:null;
}
async function databaseIdentityFallback(env:MetaCredentialEnv,key:MetaCredentialKey){
  if(!['meta_app_id','whatsapp_waba_id','whatsapp_phone_number_id'].includes(key))return '';
  const sender=await staffPortalSenderIdentity(env);if(!sender)return '';
  if(key==='meta_app_id')return String(sender.metaAppId||'').trim();
  if(key==='whatsapp_waba_id')return String(sender.wabaId||'').trim();
  return String(sender.phoneNumberId||'').trim();
}
export async function resolveMetaCredential(env:MetaCredentialEnv,key:MetaCredentialKey){
  const row=await env.DB.prepare('SELECT ciphertext FROM meta_credentials_vault WHERE credential_key=? LIMIT 1').bind(key).first<{ciphertext:string}>();
  if(row?.ciphertext){
    try{return (await decryptSocialSecret(env,row.ciphertext)).trim()}catch{throw new Error('META_CREDENTIAL_DECRYPT_FAILED')}
  }
  const envName=envMap[key];
  const environment=envName?String(env[envName]||'').trim():'';
  if(environment)return environment;
  return databaseIdentityFallback(env,key);
}
export async function metaCredentialStatuses(env:MetaCredentialEnv){
  const rows=await env.DB.prepare('SELECT credential_key AS key,updated_at AS updatedAt FROM meta_credentials_vault').all<{key:string;updatedAt:string}>();
  const byKey=new Map((rows.results||[]).map(row=>[row.key,row]));
  const output=[];
  for(const def of META_CREDENTIAL_DEFINITIONS){
    const stored=byKey.get(def.key);
    const envName=envMap[def.key];
    const envConfigured=Boolean(envName&&String(env[envName]||'').trim());
    const databaseConfigured=!stored&&!envConfigured&&Boolean(await databaseIdentityFallback(env,def.key));
    output.push({...def,configured:Boolean(stored||envConfigured||databaseConfigured),source:stored?'ui':envConfigured?'environment':databaseConfigured?'database':'missing',updatedAt:stored?.updatedAt||null});
  }
  return output;
}
export async function saveMetaCredential(env:MetaCredentialEnv,key:MetaCredentialKey,value:string,employeeId:string){
  const error=validateMetaCredential(key,value);if(error)throw new Error(error);
  const clean=value.trim(),ciphertext=await encryptSocialSecret(env,clean);
  await env.DB.prepare(`INSERT INTO meta_credentials_vault(credential_key,ciphertext,updated_by,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(credential_key) DO UPDATE SET ciphertext=excluded.ciphertext,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(key,ciphertext,employeeId).run();
  if(['meta_app_id','whatsapp_waba_id','whatsapp_phone_number_id'].includes(key)){
    const sender=await staffPortalSenderIdentity(env);
    if(sender){
      const column=key==='meta_app_id'?'meta_app_id':key==='whatsapp_waba_id'?'waba_id':'phone_number_id';
      await env.DB.prepare(`UPDATE communication_whatsapp_senders SET ${column}=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(clean,sender.id).run();
    }
  }
}
export async function deleteMetaCredential(env:MetaCredentialEnv,key:MetaCredentialKey){
  await env.DB.prepare('DELETE FROM meta_credentials_vault WHERE credential_key=?').bind(key).run();
}
export async function withResolvedMetaCredentials<T extends MetaCredentialEnv>(env:T):Promise<T>{
  const [appId,appSecret,systemToken,loginConfig,embeddedConfig,verifyToken,graphVersion]=await Promise.all([
    resolveMetaCredential(env,'meta_app_id'),resolveMetaCredential(env,'meta_app_secret'),
    resolveMetaCredential(env,'meta_system_user_token'),resolveMetaCredential(env,'meta_login_config_id'),
    resolveMetaCredential(env,'whatsapp_embedded_config_id'),resolveMetaCredential(env,'communications_webhook_verify_token'),
    resolveMetaCredential(env,'meta_graph_version'),
  ]);
  return Object.assign({},env,{
    META_APP_ID:appId||env.META_APP_ID,
    META_APP_SECRET:appSecret||env.META_APP_SECRET,
    META_SYSTEM_USER_TOKEN:systemToken||env.META_SYSTEM_USER_TOKEN,
    META_LOGIN_CONFIG_ID:loginConfig||env.META_LOGIN_CONFIG_ID,
    WHATSAPP_EMBEDDED_CONFIG_ID:embeddedConfig||env.WHATSAPP_EMBEDDED_CONFIG_ID,
    COMMUNICATIONS_WEBHOOK_VERIFY_TOKEN:verifyToken||env.COMMUNICATIONS_WEBHOOK_VERIFY_TOKEN,
    META_GRAPH_VERSION:graphVersion||env.META_GRAPH_VERSION,
  });
}
