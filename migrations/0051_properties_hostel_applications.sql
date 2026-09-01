PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS property_hostel_applications (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  application_no TEXT NOT NULL,
  application_token_hash TEXT NOT NULL UNIQUE,
  token_expires_at TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  date_of_birth TEXT,
  institution TEXT,
  faculty TEXT,
  department TEXT,
  study_level TEXT,
  home_address TEXT,
  sponsor_name TEXT,
  sponsor_phone TEXT,
  emergency_contact TEXT,
  applicant_signature TEXT,
  status TEXT NOT NULL DEFAULT 'link_created' CHECK(status IN ('link_created','submitted','under_review','approved','rejected','expired','allocated')),
  submitted_at TEXT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,application_no)
);
CREATE INDEX IF NOT EXISTS idx_property_hostel_applications ON property_hostel_applications(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS property_sponsor_confirmations (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES property_hostel_applications(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  confirmation_token_hash TEXT NOT NULL UNIQUE,
  token_expires_at TEXT NOT NULL,
  full_name TEXT,
  relationship TEXT,
  phone TEXT,
  confirmation_checked INTEGER NOT NULL DEFAULT 0 CHECK(confirmation_checked IN (0,1)),
  typed_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','expired','resent')),
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_property_sponsor_confirmation_status ON property_sponsor_confirmations(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS property_hostel_allocations (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES property_hostel_applications(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  unit_id TEXT NOT NULL REFERENCES property_units(id) ON DELETE RESTRICT,
  allocated_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-properties-hostel-applications','properties.hostel_applications','properties','hostel_applications','Create secure hostel application links, review applicants and manage sponsor confirmation before room allocation',1),
 ('perm-properties-hostel-allocation','properties.hostel_allocation','properties','hostel_allocation','Allocate an approved hostel applicant to an available room only after sponsor confirmation',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('properties-hostel-app-owner','role-owner','perm-properties-hostel-applications','manage'),
 ('properties-hostel-allocation-owner','role-owner','perm-properties-hostel-allocation','manage'),
 ('properties-hostel-app-agent','role-properties-agent','perm-properties-hostel-applications','edit'),
 ('properties-hostel-allocation-facility','role-properties-facility','perm-properties-hostel-allocation','approve');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('properties.hostel_application_link_days','14','number'),
 ('properties.sponsor_confirmation_link_days','7','number');
