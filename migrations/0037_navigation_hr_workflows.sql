PRAGMA foreign_keys = ON;

-- Owner Navigation Studio preferences. Group policy stays in app_settings while
-- employee choices and ordering remain portable across devices.
CREATE TABLE IF NOT EXISTS employee_navigation_preferences (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  style_id TEXT NOT NULL DEFAULT 'guided-groups'
    CHECK (style_id IN ('guided-groups','full-workspace','compact-rail','two-column','top-navigation')),
  group_order_json TEXT,
  item_order_json TEXT,
  pinned_items_json TEXT,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS navigation_access_changes (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('employee','role')),
  target_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  old_access_level TEXT CHECK (old_access_level IN ('none','view','create','edit','approve','manage')),
  new_access_level TEXT NOT NULL CHECK (new_access_level IN ('none','view','create','edit','approve','manage')),
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_navigation_access_target
  ON navigation_access_changes(target_type,target_id,created_at DESC);

-- Practical onboarding/offboarding checklists with task-level ownership.
CREATE TABLE IF NOT EXISTS hr_lifecycle_processes (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_type TEXT NOT NULL CHECK (process_type IN ('onboarding','offboarding')),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','blocked','completed','cancelled')),
  owner_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL,
  target_date TEXT,
  completed_at TEXT,
  reason TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_lifecycle_company_status
  ON hr_lifecycle_processes(company_id,status,start_date DESC);

CREATE TABLE IF NOT EXISTS hr_lifecycle_tasks (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL REFERENCES hr_lifecycle_processes(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES employees(id) ON DELETE SET NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','blocked','completed','not_applicable')),
  completion_note TEXT,
  completed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  completed_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(process_id,task_key)
);
CREATE INDEX IF NOT EXISTS idx_hr_lifecycle_tasks_process
  ON hr_lifecycle_tasks(process_id,status,sort_order);

-- Keep the original application-shell permission context in sync with the newer
-- company-scoped override store. Existing specialized ERP modules still consume
-- this compatibility table while company-scoped routes use v2 directly.
INSERT INTO employee_permission_overrides(
  id,employee_id,company_id,permission_id,access_level,reason,granted_by,expires_at,created_at
)
SELECT 'compat-' || id,employee_id,company_id,permission_id,access_level,reason,assigned_by,expires_at,created_at
FROM employee_permission_overrides_v2
WHERE company_id IS NOT NULL
ON CONFLICT(employee_id,company_id,permission_id) DO UPDATE SET
  access_level=excluded.access_level,
  reason=excluded.reason,
  granted_by=excluded.granted_by,
  expires_at=excluded.expires_at;

-- Nigeria payroll statutory configuration. The mode remains explicit so draft
-- values can be reviewed before a verified payroll rule set is activated.
CREATE TABLE IF NOT EXISTS payroll_statutory_profiles (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','active','paused')),
  effective_from TEXT,
  paye_enabled INTEGER NOT NULL DEFAULT 0 CHECK (paye_enabled IN (0,1)),
  pension_enabled INTEGER NOT NULL DEFAULT 0 CHECK (pension_enabled IN (0,1)),
  pension_employee_bps INTEGER NOT NULL DEFAULT 800,
  pension_employer_bps INTEGER NOT NULL DEFAULT 1000,
  nhf_enabled INTEGER NOT NULL DEFAULT 0 CHECK (nhf_enabled IN (0,1)),
  nhf_employee_bps INTEGER NOT NULL DEFAULT 250,
  nsitf_enabled INTEGER NOT NULL DEFAULT 0 CHECK (nsitf_enabled IN (0,1)),
  nsitf_employer_bps INTEGER NOT NULL DEFAULT 100,
  itf_enabled INTEGER NOT NULL DEFAULT 0 CHECK (itf_enabled IN (0,1)),
  itf_employer_bps INTEGER NOT NULL DEFAULT 100,
  paye_rule_version TEXT,
  notes TEXT,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-navigation-studio','navigation.studio','navigation','studio','Choose navigation styles and manage Group navigation policy',1),
 ('perm-navigation-assign','navigation.assign','navigation','assign','Assign employee and role workspace menus and access levels',1),
 ('perm-hr-cases','hr.cases','hr','cases','Manage disciplinary, grievance, commendation and employee relations cases',1),
 ('perm-hr-lifecycle','hr.lifecycle','hr','lifecycle','Manage employee onboarding and offboarding checklists',1),
 ('perm-payroll-statutory','payroll.statutory','payroll','statutory','Configure reviewed Nigeria payroll statutory settings',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-navigation-studio','role-owner','perm-navigation-studio','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-navigation-assign','role-owner','perm-navigation-assign','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-hr-cases','role-owner','perm-hr-cases','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-hr-lifecycle','role-owner','perm-hr-lifecycle','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-payroll-statutory','role-owner','perm-payroll-statutory','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-group-admin-' || p.id,'role-group-admin',p.id,'manage'
FROM permissions p
WHERE p.id IN ('perm-navigation-studio','perm-navigation-assign','perm-hr-cases','perm-hr-lifecycle','perm-payroll-statutory')
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-group-admin');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('navigation.default_style','guided-groups','string'),
 ('navigation.forced_style','','string'),
 ('navigation.allow_employee_choice','true','boolean'),
 ('navigation.owner_full_catalog','true','boolean'),
 ('hr.lifecycle.default_onboarding_days','30','number'),
 ('hr.lifecycle.default_offboarding_days','14','number'),
 ('payroll.statutory_requires_review','true','boolean');
