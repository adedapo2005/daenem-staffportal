PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  business_type TEXT NOT NULL,
  address_line TEXT,
  city TEXT,
  state TEXT,
  country_code TEXT NOT NULL DEFAULT 'NG',
  phone TEXT,
  whatsapp TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_locations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line TEXT,
  city TEXT,
  state TEXT,
  country_code TEXT NOT NULL DEFAULT 'NG',
  latitude REAL,
  longitude REAL,
  geofence_radius_m INTEGER,
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_locations_company ON company_locations(company_id, active);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_no TEXT UNIQUE,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  whatsapp TEXT,
  job_title TEXT,
  department TEXT,
  employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('provisional','active','suspended','inactive','terminated')),
  hire_date TEXT,
  avatar_key TEXT,
  preferred_theme TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_company_memberships (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_employee ON employee_company_memberships(employee_id, active);
CREATE INDEX IF NOT EXISTS idx_memberships_company ON employee_company_memberships(company_id, active);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS employee_roles (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, company_id, role_id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'view' CHECK (access_level IN ('none','view','create','edit','approve','manage')),
  granted_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS employee_permission_overrides (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('none','view','create','edit','approve','manage')),
  reason TEXT,
  granted_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, company_id, permission_id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  device_name TEXT,
  user_agent TEXT,
  ip_address TEXT,
  login_latitude REAL,
  login_longitude REAL,
  login_accuracy_m REAL,
  login_location_label TEXT,
  login_geofence_result TEXT CHECK (login_geofence_result IN ('not_required','inside','outside','unknown') OR login_geofence_result IS NULL),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_employee ON auth_sessions(employee_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS security_logs (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  result TEXT NOT NULL DEFAULT 'recorded',
  ip_address TEXT,
  device_id TEXT,
  device_name TEXT,
  user_agent TEXT,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  location_label TEXT,
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100 OR risk_score IS NULL),
  details_json TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_security_logs_time ON security_logs(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_employee ON security_logs(employee_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_severity ON security_logs(severity, occurred_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_employee_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS attendance_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE CASCADE,
  role_id TEXT REFERENCES roles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  require_login_location INTEGER NOT NULL DEFAULT 0 CHECK (require_login_location IN (0,1)),
  require_clock_geofence INTEGER NOT NULL DEFAULT 1 CHECK (require_clock_geofence IN (0,1)),
  require_clock_in_photo INTEGER NOT NULL DEFAULT 1 CHECK (require_clock_in_photo IN (0,1)),
  require_clock_out_photo INTEGER NOT NULL DEFAULT 0 CHECK (require_clock_out_photo IN (0,1)),
  allow_offline_attendance INTEGER NOT NULL DEFAULT 1 CHECK (allow_offline_attendance IN (0,1)),
  allow_manager_override INTEGER NOT NULL DEFAULT 1 CHECK (allow_manager_override IN (0,1)),
  geofence_radius_m INTEGER,
  scheduled_start_local TEXT,
  scheduled_end_local TEXT,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_days (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  work_date TEXT NOT NULL,
  policy_id TEXT REFERENCES attendance_policies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('incomplete','present','absent','leave','off','excused','rejected')),
  clock_in_at TEXT,
  clock_out_at TEXT,
  worked_minutes INTEGER,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  override_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, company_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_days_company_date ON attendance_days(company_id, work_date, status);
CREATE INDEX IF NOT EXISTS idx_attendance_days_employee_date ON attendance_days(employee_id, work_date DESC);

CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  attendance_day_id TEXT NOT NULL REFERENCES attendance_days(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in','clock_out','override','rejected_attempt')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  geofence_result TEXT CHECK (geofence_result IN ('inside','outside','unknown','not_required')),
  photo_key TEXT,
  device_id TEXT,
  offline_created_at TEXT,
  synced_at TEXT,
  rejection_reason TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_events_employee ON attendance_events(employee_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS employee_tracking_policies (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  tracking_mode TEXT NOT NULL DEFAULT 'work_hours' CHECK (tracking_mode IN ('off','work_hours','shift','continuous_authorized')),
  sample_interval_seconds INTEGER NOT NULL DEFAULT 300,
  retain_days INTEGER NOT NULL DEFAULT 90,
  require_foreground_service INTEGER NOT NULL DEFAULT 1 CHECK (require_foreground_service IN (0,1)),
  policy_notice_version TEXT,
  acknowledged_at TEXT,
  configured_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, company_id)
);

CREATE TABLE IF NOT EXISTS gps_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_id TEXT,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL,
  speed_mps REAL,
  heading_degrees REAL,
  source TEXT NOT NULL DEFAULT 'android',
  geofence_event TEXT,
  battery_pct INTEGER,
  offline_buffered INTEGER NOT NULL DEFAULT 0 CHECK (offline_buffered IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_gps_events_employee_time ON gps_events(employee_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_events_company_time ON gps_events(company_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  action_url TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications(employee_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  broadcast_type TEXT NOT NULL CHECK (broadcast_type IN ('notice','daily_word','urgent','emergency')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('group','company','location','department','role','selected_employees')),
  audience_filter_json TEXT,
  send_push INTEGER NOT NULL DEFAULT 0 CHECK (send_push IN (0,1)),
  acknowledgement_required INTEGER NOT NULL DEFAULT 0 CHECK (acknowledgement_required IN (0,1)),
  ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (ai_generated IN (0,1)),
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','pending_approval','approved','rejected','published','cancelled')),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  delivered_at TEXT,
  push_sent_at TEXT,
  read_at TEXT,
  acknowledged_at TEXT,
  UNIQUE(broadcast_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_employee ON broadcast_recipients(employee_id, read_at);

CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  schema_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS form_assignments (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  assignee_type TEXT NOT NULL CHECK (assignee_type IN ('employee','role','department','company','group')),
  assignee_ref TEXT,
  due_at TEXT,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  reminder_policy_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES form_assignments(id) ON DELETE SET NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started','in_progress','submitted','reviewed','approved','rejected')),
  response_json TEXT,
  submitted_at TEXT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_employee ON form_submissions(employee_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  pay_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','processing','paid','cancelled')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  gross_total_kobo INTEGER NOT NULL DEFAULT 0,
  deduction_total_kobo INTEGER NOT NULL DEFAULT 0,
  net_total_kobo INTEGER NOT NULL DEFAULT 0,
  prepared_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  base_kobo INTEGER NOT NULL DEFAULT 0,
  allowance_kobo INTEGER NOT NULL DEFAULT 0,
  overtime_kobo INTEGER NOT NULL DEFAULT 0,
  bonus_kobo INTEGER NOT NULL DEFAULT 0,
  commission_kobo INTEGER NOT NULL DEFAULT 0,
  deduction_kobo INTEGER NOT NULL DEFAULT 0,
  statutory_kobo INTEGER NOT NULL DEFAULT 0,
  gross_kobo INTEGER NOT NULL DEFAULT 0,
  net_kobo INTEGER NOT NULL DEFAULT 0,
  attendance_days_counted INTEGER NOT NULL DEFAULT 0,
  calculation_json TEXT,
  UNIQUE(payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  facility_type TEXT NOT NULL DEFAULT 'office',
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  facility_id TEXT REFERENCES facilities(id) ON DELETE SET NULL,
  asset_tag TEXT UNIQUE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  serial_no TEXT,
  purchase_date TEXT,
  purchase_cost_kobo INTEGER,
  warranty_expires_at TEXT,
  service_interval_hours INTEGER,
  service_interval_days INTEGER,
  last_service_at TEXT,
  running_hours REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','out_of_service','retired')),
  qr_value TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assets_company_category ON assets(company_id, category, status);

CREATE TABLE IF NOT EXISTS maintenance_work_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  facility_id TEXT REFERENCES facilities(id) ON DELETE SET NULL,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  reported_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  assigned_to_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  vendor_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','triaged','awaiting_approval','approved','in_progress','blocked','completed','verified','cancelled')),
  estimate_kobo INTEGER,
  actual_cost_kobo INTEGER,
  materials_json TEXT,
  before_photo_key TEXT,
  after_photo_key TEXT,
  scheduled_at TEXT,
  completed_at TEXT,
  verified_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_orders_company_status ON maintenance_work_orders(company_id, status, priority);

CREATE TABLE IF NOT EXISTS role_data_requirements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  requirement_code TEXT NOT NULL,
  description TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('per_action','daily','weekly','monthly','custom')),
  blocking INTEGER NOT NULL DEFAULT 0 CHECK (blocking IN (0,1)),
  reminder_policy_json TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(company_id, role_id, requirement_code)
);

CREATE TABLE IF NOT EXISTS requirement_completions (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES role_data_requirements(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','overdue','waived','rejected')),
  metadata_json TEXT,
  UNIQUE(requirement_id, employee_id, period_key, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_requirements_employee_status ON requirement_completions(employee_id, status, period_key);

CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  device_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  client_created_at TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL CHECK (status IN ('queued','synced','conflict','rejected','failed')),
  conflict_json TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events(status, received_at DESC);

CREATE TABLE IF NOT EXISTS ai_activity_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  prompt_category TEXT,
  input_redacted TEXT,
  output_redacted TEXT,
  approval_required INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0,1)),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO companies (id, code, name, legal_name, business_type, address_line, city, state, phone, whatsapp) VALUES
  ('company-printing', 'PRINT', 'Daenem Printing & Technology', 'Daenem Printing & Technology', 'printing', 'Daenem Complex, Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', '+2348134694624', '+2348033881608'),
  ('company-bakery', 'BAKERY', 'Daenem Bakery', 'Daenem Bakery', 'bakery', 'Daenem Complex, Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', NULL, '+2348033881608'),
  ('company-autos', 'AUTOS', 'Daenem Autos', 'Daenem Autos', 'automotive', 'Kamjat Junction, New Gbagi Express Road, Beside Ile Eja Cold Room, Before Wema Bank, Iwo Road', 'Ibadan', 'Oyo', '+2347064198171', '+2348033881608'),
  ('company-logistics', 'LOGISTICS', 'Daenem Logistics', 'Daenem Logistics', 'logistics', 'Daenem Complex, Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', NULL, '+2348033881608'),
  ('company-properties', 'PROPERTIES', 'Daenem Homes & Properties', 'Daenem Homes & Properties', 'property', 'Daenem Complex, Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', NULL, '+2348033881608');
