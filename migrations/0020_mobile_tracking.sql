PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mobile_tracking_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tracking_mode TEXT NOT NULL DEFAULT 'work_hours' CHECK (tracking_mode IN ('work_hours','shift','always_when_enabled')),
  work_start_local TEXT,
  work_end_local TEXT,
  work_days_json TEXT,
  sample_interval_seconds INTEGER NOT NULL DEFAULT 300 CHECK (sample_interval_seconds >= 60),
  high_accuracy INTEGER NOT NULL DEFAULT 1 CHECK (high_accuracy IN (0,1)),
  geofence_monitoring INTEGER NOT NULL DEFAULT 1 CHECK (geofence_monitoring IN (0,1)),
  employee_ack_required INTEGER NOT NULL DEFAULT 1 CHECK (employee_ack_required IN (0,1)),
  employee_acknowledged_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  assigned_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id,company_id)
);
CREATE INDEX IF NOT EXISTS idx_mobile_tracking_assignments_company ON mobile_tracking_assignments(company_id,enabled);

CREATE TABLE IF NOT EXISTS mobile_pairing_codes (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  requested_ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mobile_pairing_codes_employee ON mobile_pairing_codes(employee_id,created_at DESC);

CREATE TABLE IF NOT EXISTS mobile_tracking_devices (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_uuid TEXT NOT NULL,
  device_name TEXT,
  manufacturer TEXT,
  model TEXT,
  android_version TEXT,
  app_version TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT,
  tracking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (tracking_enabled IN (0,1)),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  paired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  last_latitude REAL,
  last_longitude REAL,
  last_accuracy_m REAL,
  last_location_at TEXT,
  revoked_at TEXT,
  revoke_reason TEXT,
  UNIQUE(employee_id,company_id,device_uuid)
);
CREATE INDEX IF NOT EXISTS idx_mobile_tracking_devices_employee ON mobile_tracking_devices(employee_id,company_id,revoked_at);

CREATE TABLE IF NOT EXISTS mobile_location_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES mobile_tracking_devices(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL,
  altitude_m REAL,
  speed_mps REAL,
  bearing_degrees REAL,
  battery_percent REAL,
  is_charging INTEGER CHECK (is_charging IN (0,1)),
  provider TEXT,
  is_mock INTEGER NOT NULL DEFAULT 0 CHECK (is_mock IN (0,1)),
  app_state TEXT CHECK (app_state IN ('foreground','background','service','unknown')),
  policy_mode TEXT,
  captured_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_event_id TEXT,
  UNIQUE(device_id,client_event_id)
);
CREATE INDEX IF NOT EXISTS idx_mobile_location_employee_time ON mobile_location_events(employee_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobile_location_company_time ON mobile_location_events(company_id,captured_at DESC);

CREATE TABLE IF NOT EXISTS mobile_tracking_security_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  device_id TEXT REFERENCES mobile_tracking_devices(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('permission_disabled','gps_disabled','service_stopped','device_offline','mock_location','token_rejected','tracking_disabled','pairing_failed','other')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('info','low','medium','high','critical')),
  details_json TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mobile_security_company ON mobile_tracking_security_events(company_id,severity,reviewed_at);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('mobile.android_package','com.daenem.workforce','string'),
 ('mobile.android_app_name','Daenem Workforce','string'),
 ('mobile.background_tracking_min_interval_seconds','60','number'),
 ('mobile.background_tracking_default_interval_seconds','300','number'),
 ('mobile.location_retention_days','180','number'),
 ('mobile.pairing_code_minutes','10','number'),
 ('mobile.require_visible_tracking_notification','true','boolean'),
 ('mobile.allow_hidden_tracking','false','boolean'),
 ('mobile.play_store_status','preparation','string');

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-mobile-install','mobile.install','mobile','install','Install/link the Daenem Workforce mobile application',0),
 ('perm-mobile-track-self','mobile.tracking_self','mobile','tracking_self','View own tracking/device status',1),
 ('perm-mobile-tracking-admin','mobile.tracking_admin','mobile','tracking_admin','Assign, review and revoke workforce background location tracking',1);

INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'mobile-owner-' || p.id,'role-owner',p.id,'manage' FROM permissions p WHERE p.id IN ('perm-mobile-install','perm-mobile-track-self','perm-mobile-tracking-admin');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'mobile-install-' || r.id,r.id,'perm-mobile-install','view' FROM roles r WHERE r.is_system=0;
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'mobile-self-' || r.id,r.id,'perm-mobile-track-self','view' FROM roles r WHERE r.is_system=0;
