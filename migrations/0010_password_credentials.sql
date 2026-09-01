PRAGMA foreign_keys = ON;

-- Password credentials are deliberately separated from the employee profile.
-- Passwords are never stored. Only a PBKDF2-derived hash, random salt and work factor are persisted.
CREATE TABLE IF NOT EXISTS employee_credentials (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
  password_iterations INTEGER NOT NULL,
  email_verified_at TEXT,
  password_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employee_credentials_username
  ON employee_credentials(username COLLATE NOCASE);

-- Signup is staged here until the email one-time code is verified. This prevents
-- unverified visitors from creating permanent employee identities in the core tables.
CREATE TABLE IF NOT EXISTS signup_verifications (
  id TEXT PRIMARY KEY,
  existing_employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  job_title TEXT,
  department TEXT,
  requested_role_text TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
  password_iterations INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  submitted_ip TEXT,
  submitted_user_agent TEXT,
  submitted_latitude REAL,
  submitted_longitude REAL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signup_verifications_email
  ON signup_verifications(email COLLATE NOCASE, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_verifications_username
  ON signup_verifications(username COLLATE NOCASE, created_at DESC);

-- Password recovery always requires an emailed one-time verification code first.
-- The reset form is unlocked only after verification produces a short-lived,
-- single-use reset token. The token itself is never stored, only its hash.
CREATE TABLE IF NOT EXISTS password_reset_challenges (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  requested_ip TEXT,
  requested_user_agent TEXT,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  reset_token_hash TEXT,
  reset_token_expires_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_employee
  ON password_reset_challenges(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_token
  ON password_reset_challenges(reset_token_hash);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('security.password_min_length', '10', 'number'),
  ('security.password_max_length', '128', 'number'),
  ('security.password_pbkdf2_iterations', '310000', 'number'),
  ('security.password_lock_attempts', '5', 'number'),
  ('security.password_lock_minutes', '15', 'number'),
  ('security.signup_code_minutes', '10', 'number'),
  ('security.password_reset_code_minutes', '10', 'number'),
  ('security.password_reset_token_minutes', '10', 'number');
