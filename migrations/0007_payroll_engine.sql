PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS employee_compensation (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pay_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (pay_frequency IN ('monthly','weekly','daily')),
  base_salary_kobo INTEGER NOT NULL DEFAULT 0,
  recurring_allowances_kobo INTEGER NOT NULL DEFAULT 0,
  recurring_deductions_kobo INTEGER NOT NULL DEFAULT 0,
  overtime_rate_kobo INTEGER NOT NULL DEFAULT 0,
  commission_eligible INTEGER NOT NULL DEFAULT 0 CHECK (commission_eligible IN (0,1)),
  pension_eligible INTEGER NOT NULL DEFAULT 0 CHECK (pension_eligible IN (0,1)),
  tax_profile_json TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_comp_active
  ON employee_compensation(employee_id, company_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_employee_comp_lookup
  ON employee_compensation(company_id, employee_id, active, effective_from DESC);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('allowance','bonus','overtime','commission','deduction','salary_advance','loan_repayment','other')),
  description TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL,
  taxable INTEGER NOT NULL DEFAULT 0 CHECK (taxable IN (0,1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied','cancelled')),
  submitted_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  payroll_run_id TEXT REFERENCES payroll_runs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_period
  ON payroll_adjustments(company_id, period_key, status, employee_id);

CREATE TABLE IF NOT EXISTS payroll_item_breakdown (
  id TEXT PRIMARY KEY,
  payroll_item_id TEXT NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL CHECK (line_type IN ('base','allowance','bonus','overtime','commission','statutory','deduction','salary_advance','loan_repayment','other')),
  description TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL,
  source_type TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_approval_events (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  note TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('payroll.require_complete_attendance', 'true', 'boolean'),
  ('payroll.allow_manual_attendance_override', 'true', 'boolean'),
  ('payroll.statutory_rules_mode', 'configuration_required', 'string'),
  ('payroll.currency', 'NGN', 'string');
