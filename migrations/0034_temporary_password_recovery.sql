PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employee_temporary_passwords (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  issued_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  credential_username TEXT NOT NULL,
  delivery_method TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_method IN ('manual','email')),
  delivery_status TEXT NOT NULL DEFAULT 'generated' CHECK (delivery_status IN ('generated','sent','failed')),
  issued_reason TEXT,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  first_used_at TEXT,
  replaced_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_temp_password_active
  ON employee_temporary_passwords(employee_id, replaced_at, revoked_at, expires_at, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_temp_password_issued
  ON employee_temporary_passwords(issued_by, issued_at DESC);

INSERT INTO app_settings(setting_key,setting_value,value_type)
VALUES('security.worker_safe_pbkdf2_iterations','8000','number')
ON CONFLICT(setting_key) DO UPDATE SET setting_value='8000',value_type='number',updated_at=CURRENT_TIMESTAMP;

INSERT INTO app_settings(setting_key,setting_value,value_type)
VALUES('security.temporary_password_hours','24','number')
ON CONFLICT(setting_key) DO NOTHING;
