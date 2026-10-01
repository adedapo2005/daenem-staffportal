PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS safety_incidents (
 id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, incident_no TEXT NOT NULL UNIQUE,
 company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 title TEXT NOT NULL, summary TEXT NOT NULL,
 severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','acknowledged','resolved','cancelled')),
 location_state TEXT NOT NULL DEFAULT 'unavailable' CHECK(location_state IN ('live','degraded','paused','unavailable','ended')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at TEXT,
 UNIQUE(company_id, operation_id)
);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_scope ON safety_incidents(company_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS safety_incident_locations (
 id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES safety_incidents(id) ON DELETE CASCADE,
 latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy_m REAL,
 source TEXT NOT NULL CHECK(source IN ('device','network','manual')), captured_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_safety_incident_locations ON safety_incident_locations(incident_id,captured_at DESC);
INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-incidents-access','incidents.access','incidents','access','Create and view authorized safety incidents',1),
 ('perm-incidents-location','incidents.location','incidents','manage','Share and view incident-scoped location',1);
