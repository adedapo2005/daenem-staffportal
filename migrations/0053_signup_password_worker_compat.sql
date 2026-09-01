PRAGMA foreign_keys = ON;

-- Cloudflare Worker-compatible work factor for newly created and reset passwords.
-- Existing credentials retain their stored password_iterations value and are
-- verified with that original value during sign-in.
INSERT INTO app_settings(setting_key,setting_value,value_type)
VALUES('security.password_pbkdf2_iterations','100000','number')
ON CONFLICT(setting_key) DO UPDATE SET
  setting_value='100000',
  value_type='number',
  updated_at=CURRENT_TIMESTAMP;
