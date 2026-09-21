INSERT OR IGNORE INTO admin_scoped_settings(
  id,setting_key,scope_type,scope_id,setting_value,value_type
)
SELECT
  'scoped-' || replace(setting_key,'.','-') || '-global',
  setting_key,'global','__global__',setting_value,value_type
FROM app_settings
WHERE setting_key IN (
  'communications.whatsapp_enabled',
  'communications.ai_enabled',
  'communications.ai_daily_limit',
  'communications.provider_daily_limit'
);

INSERT OR IGNORE INTO admin_scoped_settings(
  id,setting_key,scope_type,scope_id,setting_value,value_type
) VALUES
  ('scoped-communications-whatsapp-enabled-global','communications.whatsapp_enabled','global','__global__','false','boolean'),
  ('scoped-communications-ai-enabled-global','communications.ai_enabled','global','__global__','false','boolean'),
  ('scoped-communications-ai-daily-limit-global','communications.ai_daily_limit','global','__global__','25','number'),
  ('scoped-communications-provider-daily-limit-global','communications.provider_daily_limit','global','__global__','250','number');
