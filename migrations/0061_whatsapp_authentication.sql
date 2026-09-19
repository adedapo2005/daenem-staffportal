PRAGMA foreign_keys = ON;

ALTER TABLE signup_verifications ADD COLUMN phone_verified_at TEXT;
ALTER TABLE signup_verifications ADD COLUMN phone_contact_revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS whatsapp_auth_challenges (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('signup_phone','signin_step_up','password_reset')),
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  signup_verification_id TEXT REFERENCES signup_verifications(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  normalized_phone TEXT NOT NULL,
  contact_revision INTEGER NOT NULL DEFAULT 1,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  transaction_context_json TEXT,
  requested_ip TEXT,
  requested_user_agent TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (purpose='signup_phone' AND signup_verification_id IS NOT NULL) OR
    (purpose IN ('signin_step_up','password_reset') AND employee_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_employee
  ON whatsapp_auth_challenges(employee_id,purpose,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_signup
  ON whatsapp_auth_challenges(signup_verification_id,purpose,created_at DESC);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('communications.whatsapp_auth_code_minutes','5','number'),
 ('communications.whatsapp_auth_max_attempts','6','number'),
 ('communications.whatsapp_live_send_enabled','false','boolean');

ALTER TABLE communication_templates ADD COLUMN sender_connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE SET NULL;
