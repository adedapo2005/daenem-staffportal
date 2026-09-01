PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'signin' CHECK (purpose IN ('signin','verify_email','verify_phone','sensitive_action')),
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  destination_masked TEXT,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  requested_ip TEXT,
  requested_user_agent TEXT,
  requested_latitude REAL,
  requested_longitude REAL,
  requested_accuracy_m REAL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_employee
  ON auth_challenges(employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS signup_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  requested_job_title TEXT,
  requested_department TEXT,
  requested_role_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
  submitted_ip TEXT,
  submitted_user_agent TEXT,
  submitted_latitude REAL,
  submitted_longitude REAL,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signup_requests_status
  ON signup_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS employee_devices (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  device_fingerprint TEXT,
  device_name TEXT,
  platform TEXT,
  user_agent TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  trusted_at TEXT,
  revoked_at TEXT,
  metadata_json TEXT,
  UNIQUE(employee_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_employee_devices_employee
  ON employee_devices(employee_id, revoked_at, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS employee_preferences (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  theme TEXT,
  locale TEXT NOT NULL DEFAULT 'en-NG',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  notification_preferences_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string' CHECK (value_type IN ('string','number','boolean','json')),
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0,1)),
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('portal.allow_self_signup', 'true', 'boolean'),
  ('portal.provisional_access_hours', '24', 'number'),
  ('security.login_location_mode', 'record', 'string'),
  ('security.session_hours', '12', 'number'),
  ('security.max_auth_attempts', '6', 'number'),
  ('security.auth_code_minutes', '10', 'number'),
  ('attendance.incomplete_day_counts_as_worked', 'false', 'boolean'),
  ('ui.admin_can_force_theme', 'true', 'boolean'),
  ('ui.allow_employee_theme_choice', 'true', 'boolean'),
  ('notifications.daily_word_requires_approval', 'true', 'boolean');

INSERT OR IGNORE INTO permissions (id, code, module, action, description, sensitive) VALUES
  ('perm-dashboard', 'dashboard.access', 'dashboard', 'access', 'Access role-aware dashboards and approved metrics', 0),
  ('perm-profile', 'profile.access', 'profile', 'access', 'View and maintain own profile as allowed', 0),
  ('perm-attendance', 'attendance.access', 'attendance', 'access', 'Clock in/out and view attendance records', 0),
  ('perm-leave', 'leave.access', 'leave', 'access', 'View and submit leave requests', 0),
  ('perm-payslips', 'payslips.access', 'payslips', 'access', 'View own payslips', 1),
  ('perm-reviews', 'reviews.access', 'reviews', 'access', 'View assigned employee reviews', 1),
  ('perm-documents', 'document_requests.access', 'document_requests', 'access', 'Submit and view document requests', 0),
  ('perm-notifications', 'notifications.access', 'notifications', 'access', 'View personal and company notifications', 0),
  ('perm-chat', 'chat.access', 'chat', 'access', 'Use authorized internal chat', 0),
  ('perm-ai', 'ai_guide.access', 'ai_guide', 'access', 'Use role-aware Daenem AI guidance', 0),
  ('perm-users', 'users.access', 'users', 'access', 'Manage workforce users and approvals', 1),
  ('perm-roles', 'roles.access', 'roles', 'access', 'Manage roles and permissions', 1),
  ('perm-security', 'security.access', 'security', 'access', 'View and manage security logs and policies', 1),
  ('perm-audit', 'audit.access', 'audit', 'access', 'View business audit history', 1),
  ('perm-tracking', 'tracking.access', 'tracking', 'access', 'View or configure authorized location tracking', 1),
  ('perm-payroll', 'payroll.access', 'payroll', 'access', 'Prepare, review, approve and record payroll', 1),
  ('perm-finance', 'finance.access', 'finance', 'access', 'Access finance, ledger, receivables and reports', 1),
  ('perm-inventory', 'inventory.access', 'inventory', 'access', 'Access catalog, stock and movement workflows', 0),
  ('perm-procurement', 'procurement.access', 'procurement', 'access', 'Access purchase and supplier workflows', 0),
  ('perm-sales', 'sales.access', 'sales', 'access', 'Access sales, POS, customers and invoices', 0),
  ('perm-forms', 'forms.access', 'forms', 'access', 'Create, assign, submit or review forms as allowed', 0),
  ('perm-broadcasts', 'broadcasts.access', 'broadcasts', 'access', 'Create, approve and publish workforce notices', 1),
  ('perm-facilities', 'facilities.access', 'facilities', 'access', 'Manage facilities, assets and maintenance', 0),
  ('perm-settings', 'settings.access', 'settings', 'access', 'Configure companies, themes and system policies', 1),
  ('perm-printing', 'printing.access', 'printing', 'access', 'Access Daenem Printing operations', 0),
  ('perm-bakery', 'bakery.access', 'bakery', 'access', 'Access Daenem Bakery operations', 0),
  ('perm-autos', 'autos.access', 'autos', 'access', 'Access Daenem Autos operations', 0),
  ('perm-logistics', 'logistics.access', 'logistics', 'access', 'Access Daenem Logistics operations', 0),
  ('perm-properties', 'properties.access', 'properties', 'access', 'Access Daenem Homes & Properties operations', 0);

INSERT OR IGNORE INTO roles (id, company_id, code, name, description, is_system) VALUES
  ('role-owner', NULL, 'owner', 'Owner / Super Admin', 'Full Daenem Group owner access', 1),
  ('role-group-admin', NULL, 'group_admin', 'Group Admin', 'Delegated Group administration', 1),
  ('role-provisional', NULL, 'provisional', 'Provisional Employee', 'Restricted onboarding access pending approval', 1),
  ('role-print-manager', 'company-printing', 'manager', 'Printing Manager', 'Printing operational manager', 0),
  ('role-print-large-format', 'company-printing', 'large_format_operator', 'Large Format Operator', 'Large-format production operator', 0),
  ('role-print-accountant', 'company-printing', 'accountant', 'Printing Accountant', 'Printing finance role', 0),
  ('role-print-designer', 'company-printing', 'graphic_designer', 'Graphic Designer', 'Artwork and proof workflow role', 0),
  ('role-print-marketer', 'company-printing', 'marketer', 'Marketer', 'Sales and customer acquisition role', 0),
  ('role-bakery-production', 'company-bakery', 'production_staff', 'Bakery Production Staff', 'Production and batch recording role', 0),
  ('role-bakery-baker', 'company-bakery', 'baker', 'Baker', 'Baking and production role', 0),
  ('role-bakery-manager', 'company-bakery', 'manager', 'Bakery Manager', 'Bakery operations manager', 0),
  ('role-bakery-accountant', 'company-bakery', 'accountant', 'Bakery Accountant', 'Bakery finance role', 0),
  ('role-autos-manager', 'company-autos', 'manager', 'Auto Manager', 'Daenem Autos manager', 0),
  ('role-autos-porter', 'company-autos', 'car_porter', 'Car Porter', 'Vehicle movement and yard support', 0),
  ('role-autos-washer', 'company-autos', 'car_washer', 'Car Washer', 'Vehicle wash and detailing support', 0),
  ('role-autos-mechanic', 'company-autos', 'mechanic', 'Mechanic', 'Vehicle repair and inspection role', 0),
  ('role-autos-advisor', 'company-autos', 'service_advisor', 'Service Advisor', 'Workshop and customer coordination role', 0),
  ('role-autos-admin', 'company-autos', 'admin', 'Autos Admin', 'Autos administrative role', 0),
  ('role-logistics-driver', 'company-logistics', 'driver', 'Driver', 'Trip and delivery execution role', 0),
  ('role-logistics-dispatcher', 'company-logistics', 'dispatcher', 'Dispatcher', 'Dispatch planning role', 0),
  ('role-logistics-fleet', 'company-logistics', 'fleet_manager', 'Fleet Manager', 'Fleet and driver management role', 0),
  ('role-properties-agent', 'company-properties', 'agent', 'Property Agent', 'Leads and inspection role', 0),
  ('role-properties-facility', 'company-properties', 'facility_manager', 'Facility Manager', 'Property maintenance role', 0),
  ('role-properties-accountant', 'company-properties', 'accountant', 'Properties Accountant', 'Property finance role', 0);

INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'owner-' || p.id, 'role-owner', p.id, 'manage' FROM permissions p;

INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level) VALUES
  ('provisional-profile', 'role-provisional', 'perm-profile', 'edit'),
  ('provisional-notifications', 'role-provisional', 'perm-notifications', 'view'),
  ('provisional-ai', 'role-provisional', 'perm-ai', 'view');

INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-profile-' || r.id, r.id, 'perm-profile', 'edit' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-attendance-' || r.id, r.id, 'perm-attendance', 'create' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-leave-' || r.id, r.id, 'perm-leave', 'create' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-payslips-' || r.id, r.id, 'perm-payslips', 'view' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-reviews-' || r.id, r.id, 'perm-reviews', 'view' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-documents-' || r.id, r.id, 'perm-documents', 'create' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-notifications-' || r.id, r.id, 'perm-notifications', 'view' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-chat-' || r.id, r.id, 'perm-chat', 'create' FROM roles r WHERE r.is_system = 0;
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'ess-ai-' || r.id, r.id, 'perm-ai', 'view' FROM roles r WHERE r.is_system = 0;

INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level)
SELECT 'company-op-' || r.id,
       r.id,
       CASE r.company_id
         WHEN 'company-printing' THEN 'perm-printing'
         WHEN 'company-bakery' THEN 'perm-bakery'
         WHEN 'company-autos' THEN 'perm-autos'
         WHEN 'company-logistics' THEN 'perm-logistics'
         WHEN 'company-properties' THEN 'perm-properties'
       END,
       CASE WHEN r.code IN ('manager','fleet_manager','admin') THEN 'manage' ELSE 'create' END
FROM roles r
WHERE r.is_system = 0 AND r.company_id IS NOT NULL;

-- Private staging bootstrap identity. No password is stored. Production access still
-- requires a one-time code and this identity can be changed before deployment.
INSERT OR IGNORE INTO employees (
  id, employee_no, display_name, legal_name, email, job_title, department, employment_status
) VALUES (
  'employee-owner-bootstrap', 'DG-0001', 'Theo Adegboye', 'Theo Adegboye',
  'adedapo2005@gmail.com', 'Owner / CEO', 'Group Executive', 'active'
);

INSERT OR IGNORE INTO employee_company_memberships (id, employee_id, company_id, is_primary, active) VALUES
  ('membership-owner-printing', 'employee-owner-bootstrap', 'company-printing', 1, 1),
  ('membership-owner-bakery', 'employee-owner-bootstrap', 'company-bakery', 0, 1),
  ('membership-owner-autos', 'employee-owner-bootstrap', 'company-autos', 0, 1),
  ('membership-owner-logistics', 'employee-owner-bootstrap', 'company-logistics', 0, 1),
  ('membership-owner-properties', 'employee-owner-bootstrap', 'company-properties', 0, 1);

INSERT OR IGNORE INTO employee_roles (id, employee_id, company_id, role_id) VALUES
  ('employee-role-owner-printing', 'employee-owner-bootstrap', 'company-printing', 'role-owner'),
  ('employee-role-owner-bakery', 'employee-owner-bootstrap', 'company-bakery', 'role-owner'),
  ('employee-role-owner-autos', 'employee-owner-bootstrap', 'company-autos', 'role-owner'),
  ('employee-role-owner-logistics', 'employee-owner-bootstrap', 'company-logistics', 'role-owner'),
  ('employee-role-owner-properties', 'employee-owner-bootstrap', 'company-properties', 'role-owner');

INSERT OR IGNORE INTO employee_preferences (employee_id, theme)
VALUES ('employee-owner-bootstrap', 'executive');
