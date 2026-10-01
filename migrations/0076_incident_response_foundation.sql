PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS safety_incidents (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  reporter_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  incident_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','actioned','resolved','cancelled')),
  location_status TEXT NOT NULL DEFAULT 'unavailable' CHECK(location_status IN ('live','degraded','paused','unavailable','ended')),
  current_latitude REAL,
  current_longitude REAL,
  current_accuracy_m REAL,
  location_updated_at TEXT,
  location_source TEXT,
  tracking_started_at TEXT,
  tracking_ended_at TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_scope ON safety_incidents(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS safety_incident_location_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES safety_incidents(id) ON DELETE CASCADE,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  source TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_safety_incident_location_events ON safety_incident_location_events(incident_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS safety_incident_audit (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES safety_incidents(id) ON DELETE CASCADE,
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
