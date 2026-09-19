PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('communications.whatsapp_auth_resend_seconds','60','number');
