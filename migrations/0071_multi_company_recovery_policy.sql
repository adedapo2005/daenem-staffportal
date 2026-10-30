CREATE TABLE IF NOT EXISTS admin_scoped_settings (
  id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global','company')),
  scope_id TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string',
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(setting_key,scope_type,scope_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_scoped_settings_lookup
  ON admin_scoped_settings(setting_key,scope_type,scope_id);

INSERT OR IGNORE INTO admin_scoped_settings(
  id,setting_key,scope_type,scope_id,setting_value,value_type
) VALUES(
  'scoped-password-recovery-global',
  'security.password_recovery_methods',
  'global','__global__','email','string'
);
