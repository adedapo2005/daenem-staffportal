PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS construction_projects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  project_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT NOT NULL DEFAULT 'construction',
  location_name TEXT,
  site_address TEXT,
  manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  start_date TEXT,
  target_end_date TEXT,
  actual_end_date TEXT,
  budget_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','active','on_hold','completed','cancelled')),
  progress_percent REAL NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_construction_projects_company_status ON construction_projects(company_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS construction_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  weight_percent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','blocked','cancelled')),
  completed_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_construction_milestones_project ON construction_milestones(project_id,status,due_date);

CREATE TABLE IF NOT EXISTS construction_material_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  record_date TEXT NOT NULL,
  material_name TEXT NOT NULL,
  category TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  unit TEXT,
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  total_cost_kobo INTEGER NOT NULL DEFAULT 0,
  supplier TEXT,
  reference_no TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_construction_material_project_date ON construction_material_entries(project_id,record_date DESC);

CREATE TABLE IF NOT EXISTS construction_expenses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL,
  payee TEXT,
  payment_method TEXT,
  reference_no TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','pending','approved','rejected','paid')),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_construction_expenses_project_date ON construction_expenses(project_id,expense_date DESC);

CREATE TABLE IF NOT EXISTS construction_contractors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  contractor_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  scope_of_work TEXT,
  agreed_amount_kobo INTEGER NOT NULL DEFAULT 0,
  paid_amount_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('proposed','active','completed','terminated')),
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_construction_contractors_project ON construction_contractors(project_id,status);

CREATE TABLE IF NOT EXISTS construction_progress_updates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  update_date TEXT NOT NULL,
  progress_percent REAL NOT NULL CHECK(progress_percent BETWEEN 0 AND 100),
  summary TEXT NOT NULL,
  blockers TEXT,
  next_steps TEXT,
  weather_note TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_construction_progress_project_date ON construction_progress_updates(project_id,update_date DESC);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-construction-access','construction.access','construction','access','Access Construction and Projects ERP',1);
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-construction','role-owner','perm-construction-access','manage' WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
