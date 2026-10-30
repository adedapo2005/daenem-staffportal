export interface ScopedSettingsEnv { DB:D1Database }

export type RecoveryMethodPolicy='email'|'whatsapp'|'email_whatsapp';
export type ScopedValueType='string'|'boolean'|'number';

export const RECOVERY_SETTING_KEY='security.password_recovery_methods';

export const SCOPED_SETTING_DEFINITIONS={
  [RECOVERY_SETTING_KEY]:{type:'string' as const,fallback:'email',validate:(value:unknown)=>['email','whatsapp','email_whatsapp'].includes(String(value))},
  'communications.whatsapp_enabled':{type:'boolean' as const,fallback:false,validate:(value:unknown)=>typeof value==='boolean'},
  'communications.ai_enabled':{type:'boolean' as const,fallback:false,validate:(value:unknown)=>typeof value==='boolean'},
  'communications.ai_daily_limit':{type:'number' as const,fallback:25,validate:(value:unknown)=>Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=10000},
  'communications.provider_daily_limit':{type:'number' as const,fallback:250,validate:(value:unknown)=>Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=100000},
} satisfies Record<string,{type:ScopedValueType;fallback:unknown;validate:(value:unknown)=>boolean}>;

export type ScopedSettingKey=keyof typeof SCOPED_SETTING_DEFINITIONS;

export function validRecoveryPolicy(value:unknown):value is RecoveryMethodPolicy{
  return SCOPED_SETTING_DEFINITIONS[RECOVERY_SETTING_KEY].validate(value);
}

export function recoveryMethods(value:RecoveryMethodPolicy){
  return value==='email_whatsapp'?['email','whatsapp'] as const:[value] as const;
}
export function encodeScopedValue(value:unknown,type:ScopedValueType){
  if(type==='boolean')return value?'true':'false';
  if(type==='number')return String(Number(value));
  return String(value??'');
}

export function decodeScopedValue(value:string,type:ScopedValueType){
  if(type==='boolean')return value==='true';
  if(type==='number')return Number(value);
  return value;
}

export async function resolveScopedSetting(
  env:ScopedSettingsEnv,key:string,companyId?:string|null,fallback='',
){
  if(companyId){
    const company=await env.DB.prepare(
      "SELECT setting_value AS value,value_type AS type FROM admin_scoped_settings WHERE setting_key=? AND scope_type='company' AND scope_id=? LIMIT 1",
    ).bind(key,companyId).first<{value:string;type:ScopedValueType}>();
    if(company?.value!=null)return {value:company.value,type:company.type,source:'company' as const};
  }
  const global=await env.DB.prepare(
    "SELECT setting_value AS value,value_type AS type FROM admin_scoped_settings WHERE setting_key=? AND scope_type='global' AND scope_id='__global__' LIMIT 1",
  ).bind(key).first<{value:string;type:ScopedValueType}>();
  return {value:global?.value??fallback,type:global?.type??'string',source:'global' as const};
}

export async function resolveTypedScopedSetting(env:ScopedSettingsEnv,key:ScopedSettingKey,companyId?:string|null){
  const definition=SCOPED_SETTING_DEFINITIONS[key];
  const resolved=await resolveScopedSetting(env,key,companyId,encodeScopedValue(definition.fallback,definition.type));
  return {...resolved,value:decodeScopedValue(resolved.value,resolved.type)};
}
