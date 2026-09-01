PRAGMA foreign_keys = ON;

-- Group HR master record: payroll-sensitive and employment data live outside the basic profile.
CREATE TABLE IF NOT EXISTS hr_employee_details (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  employment_type TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','temporary','intern','consultant')),
  probation_end_date TEXT,
  confirmation_date TEXT,
  manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  work_location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  grade_level TEXT,
  tax_id TEXT,
  pension_rsa_pin TEXT,
  pension_pfa TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  next_of_kin_name TEXT,
  next_of_kin_phone TEXT,
  next_of_kin_relationship TEXT,
  notes TEXT,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_leave_types (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  annual_days REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 1 CHECK (paid IN (0,1)),
  requires_approval INTEGER NOT NULL DEFAULT 1 CHECK (requires_approval IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES hr_leave_types(id) ON DELETE RESTRICT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','approved','rejected','cancelled')),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_company_status ON hr_leave_requests(company_id,status,start_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_leave_employee ON hr_leave_requests(employee_id,start_date DESC);

CREATE TABLE IF NOT EXISTS hr_performance_reviews (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  review_period TEXT NOT NULL,
  reviewer_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  rating REAL,
  goals_json TEXT,
  strengths TEXT,
  improvement_areas TEXT,
  employee_comments TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','completed','acknowledged')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_cases (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  case_type TEXT NOT NULL CHECK (case_type IN ('disciplinary','grievance','commendation','performance_improvement','incident','other')),
  title TEXT NOT NULL,
  summary TEXT,
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','action_required','resolved','closed')),
  opened_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  assigned_to TEXT REFERENCES employees(id) ON DELETE SET NULL,
  resolution TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_cases_company_status ON hr_cases(company_id,status,created_at DESC);

-- Reversible account number data is encrypted by the Worker before storage.
CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bank_key TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_name TEXT,
  account_number_ciphertext TEXT NOT NULL,
  account_number_iv TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  verified_at TEXT,
  verification_source TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_employee_bank_employee ON employee_bank_accounts(employee_id,active,is_primary);

CREATE TABLE IF NOT EXISTS payroll_banks (
  bank_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'bank',
  payment_adapter TEXT NOT NULL DEFAULT 'generic_csv' CHECK (payment_adapter IN ('kuda_bulk','moniepoint_bulk','opay_business','generic_csv')),
  direct_api_available INTEGER NOT NULL DEFAULT 0 CHECK (direct_api_available IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

INSERT OR IGNORE INTO payroll_banks(bank_key,name,category,payment_adapter,direct_api_available) VALUES
 ('KUDA','Kuda Business','microfinance_bank','kuda_bulk',1),
 ('MONIEPOINT','Moniepoint Business','microfinance_bank','moniepoint_bulk',0),
 ('OPAY','OPay Business','mobile_money','opay_business',0),
 ('ACCESS','Access Bank','commercial_bank','generic_csv',0),
 ('CITI','Citibank Nigeria','commercial_bank','generic_csv',0),
 ('ECOBANK','Ecobank Nigeria','commercial_bank','generic_csv',0),
 ('FCMB','First City Monument Bank','commercial_bank','generic_csv',0),
 ('FIDELITY','Fidelity Bank','commercial_bank','generic_csv',0),
 ('FIRSTBANK','First Bank of Nigeria','commercial_bank','generic_csv',0),
 ('GLOBUS','Globus Bank','commercial_bank','generic_csv',0),
 ('GTBANK','Guaranty Trust Bank','commercial_bank','generic_csv',0),
 ('JAIZ','Jaiz Bank','non_interest_bank','generic_csv',0),
 ('KEYSTONE','Keystone Bank','commercial_bank','generic_csv',0),
 ('LOTUS','Lotus Bank','non_interest_bank','generic_csv',0),
 ('NOVA','Nova Bank','commercial_bank','generic_csv',0),
 ('OPTIMUS','Optimus Bank','commercial_bank','generic_csv',0),
 ('PARALLEX','Parallex Bank','commercial_bank','generic_csv',0),
 ('POLARIS','Polaris Bank','commercial_bank','generic_csv',0),
 ('PREMIUMTRUST','PremiumTrust Bank','commercial_bank','generic_csv',0),
 ('PROVIDUS','Providus Bank','commercial_bank','generic_csv',0),
 ('STANBIC','Stanbic IBTC Bank','commercial_bank','generic_csv',0),
 ('STANDARDCHARTERED','Standard Chartered Bank Nigeria','commercial_bank','generic_csv',0),
 ('STERLING','Sterling Bank','commercial_bank','generic_csv',0),
 ('SUNTRUST','SunTrust Bank Nigeria','commercial_bank','generic_csv',0),
 ('TAJ','TAJBank','non_interest_bank','generic_csv',0),
 ('TITANTRUST','Titan Trust Bank','commercial_bank','generic_csv',0),
 ('UBA','United Bank for Africa','commercial_bank','generic_csv',0),
 ('UNION','Union Bank of Nigeria','commercial_bank','generic_csv',0),
 ('UNITY','Unity Bank','commercial_bank','generic_csv',0),
 ('WEMA','Wema Bank','commercial_bank','generic_csv',0),
 ('ZENITH','Zenith Bank','commercial_bank','generic_csv',0),
 ('OTHER','Other CBN-licensed Nigerian institution','other','generic_csv',0);

CREATE TABLE IF NOT EXISTS payroll_payment_batches (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  funding_bank_key TEXT NOT NULL REFERENCES payroll_banks(bank_key) ON DELETE RESTRICT,
  batch_no TEXT NOT NULL UNIQUE,
  adapter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','approved','submitted','partially_paid','paid','failed','cancelled')),
  item_count INTEGER NOT NULL DEFAULT 0,
  total_kobo INTEGER NOT NULL DEFAULT 0,
  narration TEXT,
  provider_reference TEXT,
  export_format TEXT NOT NULL DEFAULT 'csv',
  prepared_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payroll_batches_run ON payroll_payment_batches(payroll_run_id,created_at DESC);

CREATE TABLE IF NOT EXISTS payroll_payment_batch_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES payroll_payment_batches(id) ON DELETE CASCADE,
  payroll_item_id TEXT NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bank_account_id TEXT REFERENCES employee_bank_accounts(id) ON DELETE SET NULL,
  beneficiary_name TEXT,
  beneficiary_bank_key TEXT,
  beneficiary_account_last4 TEXT,
  amount_kobo INTEGER NOT NULL,
  narration TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','submitted','paid','failed','held')),
  provider_reference TEXT,
  failure_reason TEXT,
  UNIQUE(batch_id,payroll_item_id)
);

-- High-detail application activity log. Never store passwords, OTPs, tokens or bank account plaintext here.
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  request_id TEXT,
  module TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  method TEXT,
  path TEXT,
  result TEXT NOT NULL DEFAULT 'recorded',
  status_code INTEGER,
  duration_ms INTEGER,
  ip_address TEXT,
  country_code TEXT,
  cf_colo TEXT,
  user_agent TEXT,
  device_id TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_employee_time ON activity_logs(employee_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_module_time ON activity_logs(module,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_request ON activity_logs(request_id);

CREATE TABLE IF NOT EXISTS resource_health_snapshots (
  id TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy','degraded','down','unknown')),
  latency_ms INTEGER,
  metric_json TEXT,
  error_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_resource_health_time ON resource_health_snapshots(source,captured_at DESC);

CREATE TABLE IF NOT EXISTS toolbox_jobs (
  id TEXT PRIMARY KEY,
  tool_key TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  input_summary_json TEXT,
  result_json TEXT,
  error_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_toolbox_jobs_user ON toolbox_jobs(requested_by,created_at DESC);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-hr-access','hr.access','hr','access','Access Group HR records and workflows',1),
 ('perm-audit-explorer','audit.explorer','audit','explorer','Search employee activity and business audit trails',1),
 ('perm-diagnostics-access','diagnostics.access','diagnostics','access','View application resource and service health',1),
 ('perm-toolbox-access','toolbox.access','toolbox','access','Use Owner/Admin operational utilities',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-hr','role-owner','perm-hr-access','manage' WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-audit','role-owner','perm-audit-explorer','manage' WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-diagnostics','role-owner','perm-diagnostics-access','manage' WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-toolbox','role-owner','perm-toolbox-access','manage' WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('payroll.default_payment_adapter','generic_csv','string'),
 ('payroll.bank_account_encryption','auth_pepper_aes_gcm_v1','string'),
 ('activity.capture_enabled','true','boolean'),
 ('activity.retention_days','365','number'),
 ('search.max_suggestions','12','number'),
 ('performance.dashboard_cache_seconds','30','number');
