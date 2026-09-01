PRAGMA foreign_keys = ON;

ALTER TABLE employees ADD COLUMN first_name TEXT;
ALTER TABLE employees ADD COLUMN last_name TEXT;
ALTER TABLE employees ADD COLUMN profile_completion_percent INTEGER NOT NULL DEFAULT 0 CHECK (profile_completion_percent BETWEEN 0 AND 100);
ALTER TABLE employees ADD COLUMN profile_completed_at TEXT;
ALTER TABLE employees ADD COLUMN first_access_at TEXT;
ALTER TABLE employees ADD COLUMN profile_reminder_sent_at TEXT;
ALTER TABLE employees ADD COLUMN profile_reminder_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE signup_verifications ADD COLUMN first_name TEXT;
ALTER TABLE signup_verifications ADD COLUMN last_name TEXT;

CREATE TABLE IF NOT EXISTS employee_login_access_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  preferred_username TEXT NOT NULL COLLATE NOCASE,
  requested_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','activated','cancelled','expired')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  activated_at TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_employee_login_access_employee
  ON employee_login_access_requests(employee_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS profile_completion_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('profile_updated','auto_reminder','manual_reminder','completed','reopened')),
  completion_percent INTEGER CHECK (completion_percent BETWEEN 0 AND 100),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_profile_completion_events_employee
  ON profile_completion_events(employee_id, created_at DESC);

INSERT INTO app_settings(setting_key,setting_value,value_type) VALUES
  ('security.password_min_length','6','number'),
  ('profile.auto_reminder_hours','24','number'),
  ('profile.auto_reminders_enabled','true','boolean'),
  ('portal.default_signup_company_code','PRINT','string'),
  ('owner.bootstrap_username','owner','string')
ON CONFLICT(setting_key) DO UPDATE SET
  setting_value=excluded.setting_value,
  value_type=excluded.value_type,
  updated_at=CURRENT_TIMESTAMP;

-- Keep the bootstrap Owner identity self-healing. No password is stored in SQL.
INSERT OR IGNORE INTO employees(
  id,employee_no,display_name,legal_name,first_name,last_name,email,job_title,department,employment_status,profile_completion_percent
) VALUES(
  'employee-owner-bootstrap','DG-0001','Theo Adegboye','Theo Adegboye','Theo','Adegboye',
  'adedapo2005@gmail.com','Owner / CEO','Group Executive','active',100
);

UPDATE employees SET
  display_name=COALESCE(NULLIF(display_name,''),'Theo Adegboye'),
  legal_name=COALESCE(NULLIF(legal_name,''),'Theo Adegboye'),
  first_name=COALESCE(NULLIF(first_name,''),'Theo'),
  last_name=COALESCE(NULLIF(last_name,''),'Adegboye'),
  email=COALESCE(NULLIF(email,''),'adedapo2005@gmail.com'),
  employment_status='active',
  profile_completion_percent=100,
  profile_completed_at=COALESCE(profile_completed_at,CURRENT_TIMESTAMP)
WHERE id='employee-owner-bootstrap';

INSERT OR IGNORE INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES
  ('membership-owner-printing','employee-owner-bootstrap','company-printing',1,1),
  ('membership-owner-bakery','employee-owner-bootstrap','company-bakery',0,1),
  ('membership-owner-autos','employee-owner-bootstrap','company-autos',0,1),
  ('membership-owner-logistics','employee-owner-bootstrap','company-logistics',0,1),
  ('membership-owner-properties','employee-owner-bootstrap','company-properties',0,1);

INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id) VALUES
  ('employee-role-owner-printing','employee-owner-bootstrap','company-printing','role-owner'),
  ('employee-role-owner-bakery','employee-owner-bootstrap','company-bakery','role-owner'),
  ('employee-role-owner-autos','employee-owner-bootstrap','company-autos','role-owner'),
  ('employee-role-owner-logistics','employee-owner-bootstrap','company-logistics','role-owner'),
  ('employee-role-owner-properties','employee-owner-bootstrap','company-properties','role-owner');

INSERT INTO employee_login_access_requests(id,employee_id,preferred_username,requested_by,status,notes)
SELECT 'login-access-owner-bootstrap','employee-owner-bootstrap','owner',NULL,'ready','Self-healing Owner access bootstrap'
WHERE NOT EXISTS (SELECT 1 FROM employee_credentials WHERE employee_id='employee-owner-bootstrap')
  AND NOT EXISTS (SELECT 1 FROM employee_login_access_requests WHERE employee_id='employee-owner-bootstrap' AND status='ready');

-- Backfill names and a conservative profile score for existing employees.
UPDATE employees SET
  first_name=COALESCE(NULLIF(first_name,''), CASE WHEN instr(trim(display_name),' ')>0 THEN substr(trim(display_name),1,instr(trim(display_name),' ')-1) ELSE trim(display_name) END),
  last_name=COALESCE(NULLIF(last_name,''), CASE WHEN instr(trim(display_name),' ')>0 THEN trim(substr(trim(display_name),instr(trim(display_name),' ')+1)) ELSE '' END)
WHERE first_name IS NULL OR last_name IS NULL;

UPDATE employees SET profile_completion_percent = MIN(100,
  (CASE WHEN length(trim(COALESCE(first_name,'')))>0 THEN 20 ELSE 0 END) +
  (CASE WHEN length(trim(COALESCE(last_name,'')))>0 THEN 20 ELSE 0 END) +
  (CASE WHEN length(trim(COALESCE(email,'')))>0 THEN 20 ELSE 0 END) +
  (CASE WHEN length(trim(COALESCE(phone,'')))>0 THEN 15 ELSE 0 END) +
  (CASE WHEN length(trim(COALESCE(job_title,'')))>0 THEN 15 ELSE 0 END) +
  (CASE WHEN length(trim(COALESCE(department,'')))>0 THEN 10 ELSE 0 END)
) WHERE id<>'employee-owner-bootstrap';

UPDATE employees SET profile_completed_at=COALESCE(profile_completed_at,CURRENT_TIMESTAMP)
WHERE profile_completion_percent=100 AND profile_completed_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_employee_first_access
AFTER INSERT ON auth_sessions
BEGIN
  UPDATE employees SET first_access_at=COALESCE(first_access_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
  WHERE id=NEW.employee_id;
END;
