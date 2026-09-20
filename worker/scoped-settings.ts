export interface ScopedSettingsEnv { DB:D1Database }

export type RecoveryMethodPolicy='email'|'whatsapp'|'email_whatsapp';

export const RECOVERY_SETTING_KEY='security.password_recovery_methods';

export function validRecoveryPolicy(value:unknown):value is RecoveryMethodPolicy{
  return ['email','whatsapp','email_whatsapp'].includes(String(value));
}

export function recoveryMethods(value:RecoveryMethodPolicy){
  return value==='email_whatsapp'?['email','whatsapp'] as const:[value] as const;
}

export async function resolveScopedSetting(
  env:ScopedSettingsEnv,key:string,companyId?:string|null,fallback='',
){
  if(companyId){
    const company=await env.DB.prepare(
      'SELECT setting_value AS value FROM admin_scoped_settings WHERE setting_key=? AND scope_type=\'company\' AND scope_id=? LIMIT 1',
    ).bind(key,companyId).first<{value:string}>();
    if(company?.value!=null)return {value:company.value,source:'company' as const};
  }
  const global=await env.DB.prepare(
    'SELECT setting_value AS value FROM admin_scoped_settings WHERE setting_key=? AND scope_type=\'global\' AND scope_id=\'__global__\' LIMIT 1',
  ).bind(key).first<{value:string}>();
  return {value:global?.value??fallback,source:'global' as const};
}
