PRAGMA foreign_keys = ON;

-- Retention is category-aware. Formal audit and security evidence are mandatory
-- history and intentionally have no expiry in this policy foundation.
CREATE TABLE IF NOT EXISTS activity_retention_policies (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  client_telemetry_days INTEGER CHECK (client_telemetry_days BETWEEN 30 AND 3650),
  server_activity_days INTEGER CHECK (server_activity_days BETWEEN 30 AND 3650),
  formal_audit_days INTEGER NOT NULL DEFAULT 0 CHECK (formal_audit_days = 0),
  formal_security_days INTEGER NOT NULL DEFAULT 0 CHECK (formal_security_days = 0),
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO activity_retention_policies (id)
VALUES ('global');
