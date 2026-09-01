PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS access_control_changes (
  id TEXT PRIMARY KEY,
  actor_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('role','employee','permission','policy')),
  target_id TEXT NOT NULL,
  permission_id TEXT REFERENCES permissions(id) ON DELETE SET NULL,
  old_access_level TEXT CHECK (old_access_level IN ('none','view','create','edit','approve','manage')),
  new_access_level TEXT CHECK (new_access_level IN ('none','view','create','edit','approve','manage')),
  reason TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_access_control_changes_target ON access_control_changes(target_type,target_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_control_changes_company ON access_control_changes(company_id,created_at DESC);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('security.owner_role_cannot_be_downgraded','true','boolean'),
 ('security.require_reason_for_permission_override','true','boolean'),
 ('security.employee_override_default_days','0','number'),
 ('security.allow_company_admin_role_creation','true','boolean');
