PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employee_permission_overrides_v2 (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('none','view','create','edit','approve','manage')),
  reason TEXT NOT NULL,
  assigned_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, company_id, permission_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_permission_overrides_v2_employee ON employee_permission_overrides_v2(employee_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_employee_permission_overrides_v2_company ON employee_permission_overrides_v2(company_id,permission_id);
