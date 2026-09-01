PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workflow_forms (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  form_type TEXT NOT NULL DEFAULT 'general' CHECK (form_type IN ('general','onboarding','application','review','incident','inspection','handover','daily_report','acknowledgement','custom')),
  schema_json TEXT NOT NULL,
  instructions TEXT,
  require_signature INTEGER NOT NULL DEFAULT 0 CHECK (require_signature IN (0,1)),
  require_photo INTEGER NOT NULL DEFAULT 0 CHECK (require_photo IN (0,1)),
  require_location INTEGER NOT NULL DEFAULT 0 CHECK (require_location IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_form_assignments (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES workflow_forms(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  department TEXT,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('employee','role','department','company','group')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  blocking INTEGER NOT NULL DEFAULT 0 CHECK (blocking IN (0,1)),
  due_at TEXT,
  reminder_policy_json TEXT,
  assigned_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_workflow_assignments_employee ON workflow_form_assignments(employee_id, active, due_at);
CREATE INDEX IF NOT EXISTS idx_workflow_assignments_company ON workflow_form_assignments(company_id, active, due_at);

CREATE TABLE IF NOT EXISTS workflow_form_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES workflow_form_assignments(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES workflow_forms(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started','in_progress','submitted','reviewed','approved','rejected')),
  response_json TEXT,
  signature_key TEXT,
  photo_keys_json TEXT,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  submitted_at TEXT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assignment_id, employee_id)
);

CREATE TABLE IF NOT EXISTS workforce_broadcasts (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  broadcast_type TEXT NOT NULL DEFAULT 'notice' CHECK (broadcast_type IN ('notice','daily_word','important','urgent','emergency')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'information' CHECK (severity IN ('information','important','urgent','emergency')),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('employee','selected_employees','role','department','company','group')),
  audience_json TEXT,
  push_notification INTEGER NOT NULL DEFAULT 0 CHECK (push_notification IN (0,1)),
  acknowledgement_required INTEGER NOT NULL DEFAULT 0 CHECK (acknowledgement_required IN (0,1)),
  ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (ai_generated IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected','published','cancelled')),
  scheduled_for TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workforce_broadcasts_status ON workforce_broadcasts(status, scheduled_for, created_at DESC);

CREATE TABLE IF NOT EXISTS workforce_broadcast_recipients (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES workforce_broadcasts(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  delivered_at TEXT,
  push_sent_at TEXT,
  read_at TEXT,
  acknowledged_at TEXT,
  acknowledgement_note TEXT,
  UNIQUE(broadcast_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipient_employee ON workforce_broadcast_recipients(employee_id, read_at, delivered_at);

CREATE TABLE IF NOT EXISTS smart_employee_reminders (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('attendance_clockout','required_form','role_data','approval','maintenance','payroll','task','custom')),
  source_type TEXT,
  source_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shown','completed','dismissed','escalated','cancelled')),
  show_after TEXT,
  last_prompted_at TEXT,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_smart_reminders_due ON smart_employee_reminders(employee_id, status, show_after, due_at);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('broadcast.daily_word_enabled', 'true', 'boolean'),
  ('broadcast.daily_word_approval_required', 'true', 'boolean'),
  ('broadcast.emergency_default_push', 'true', 'boolean'),
  ('broadcast.emergency_acknowledgement_default', 'true', 'boolean'),
  ('forms.overdue_escalation_enabled', 'true', 'boolean'),
  ('forms.blocking_requirements_enabled', 'true', 'boolean');
