PRAGMA foreign_keys = ON;

-- Small, auditable commands that an Owner/Admin can send to one employee's
-- Staff Portal workspace. Commands never touch unrelated browser data.
CREATE TABLE IF NOT EXISTS portal_user_commands (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'refresh_permissions','clear_portal_cache','reset_layout','reset_theme',
    'force_reload','rebuild_workspace'
  )),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','acknowledged','failed','expired')),
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL DEFAULT (datetime('now','+24 hours')),
  acknowledged_at TEXT,
  result_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_portal_user_commands_target
  ON portal_user_commands(employee_id,status,expires_at,requested_at DESC);

-- Remote assistance is consent-based, time-limited and read-only by default.
-- It provides shared diagnostics and an audit trail; it never exposes a
-- password, session token or payment credential.
CREATE TABLE IF NOT EXISTS portal_support_sessions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'read_only'
    CHECK (access_mode IN ('read_only','guided')),
  status TEXT NOT NULL DEFAULT 'awaiting_consent'
    CHECK (status IN ('awaiting_consent','approved','declined','active','ended','expired')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL DEFAULT (datetime('now','+30 minutes')),
  consented_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  ended_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  end_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_portal_support_sessions_target
  ON portal_support_sessions(employee_id,status,expires_at,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_support_sessions_company
  ON portal_support_sessions(company_id,status,requested_at DESC);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-user-support','support.access','support','access','Open the User Support Centre and view assigned employee device, session and portal diagnostics',1),
 ('perm-user-support-manage','support.manage','support','manage','Send audited cache, reload and permission refresh commands and request consent-based assistance',1),
 ('perm-business-assignment','users.business_assignments','users','assign','Assign or remove an employee from a Daenem business and choose the primary business',1),
 ('perm-general-roles','roles.general','roles','manage','Create and manage reusable General Roles that can be assigned in any Daenem business',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-support-' || p.id,'role-owner',p.id,'manage'
FROM permissions p
WHERE p.id IN ('perm-user-support','perm-user-support-manage','perm-business-assignment','perm-general-roles')
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-owner');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-group-admin-support-' || p.id,'role-group-admin',p.id,'manage'
FROM permissions p
WHERE p.id IN ('perm-user-support','perm-user-support-manage','perm-business-assignment','perm-general-roles')
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-group-admin');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('support.command_expiry_hours','24','number'),
 ('support.session_expiry_minutes','30','number'),
 ('support.require_employee_consent','true','boolean'),
 ('support.default_access_mode','read_only','string');
