PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_alert_events (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  severity_hint TEXT CHECK(severity_hint IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  summary TEXT,
  related_path TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_alert_events_lookup
  ON platform_alert_events(company_id,module,event_type,occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform_alert_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  module TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  conditions_json TEXT NOT NULL DEFAULT '{}',
  recipients_json TEXT NOT NULL DEFAULT '[]',
  channels_json TEXT NOT NULL DEFAULT '["in_app"]',
  acknowledgement_required INTEGER NOT NULL DEFAULT 0 CHECK(acknowledgement_required IN (0,1)),
  quiet_hours_override INTEGER NOT NULL DEFAULT 0 CHECK(quiet_hours_override IN (0,1)),
  dedup_window_minutes INTEGER NOT NULL DEFAULT 30,
  escalation_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_alert_rules_match
  ON platform_alert_rules(active,company_id,module,event_type);

CREATE TABLE IF NOT EXISTS platform_alerts (
  id TEXT PRIMARY KEY,
  alert_no TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES platform_alert_events(id) ON DELETE RESTRICT,
  rule_id TEXT REFERENCES platform_alert_rules(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  summary TEXT,
  related_path TEXT,
  acknowledgement_required INTEGER NOT NULL DEFAULT 0 CHECK(acknowledgement_required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','actioned','resolved','suppressed','reopened')),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  acknowledged_at TEXT,
  actioned_at TEXT,
  resolved_at TEXT,
  resolution_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_alerts_attention
  ON platform_alerts(status,severity,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_alerts_fingerprint
  ON platform_alerts(company_id,fingerprint,status,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS platform_alert_recipients (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES platform_alerts(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  recipient_reason TEXT NOT NULL,
  delivered_at TEXT,
  viewed_at TEXT,
  acknowledged_at TEXT,
  actioned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(alert_id,employee_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_alert_recipients_employee
  ON platform_alert_recipients(employee_id,acknowledged_at,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_alert_deliveries (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES platform_alerts(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES platform_alert_recipients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('in_app','screen_popup','email','whatsapp','web_push')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','delivered','viewed','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  last_error TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  viewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(alert_id,recipient_id,channel)
);
CREATE INDEX IF NOT EXISTS idx_platform_alert_deliveries_queue
  ON platform_alert_deliveries(status,channel,created_at);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-alerting-access','alerting.access','alerting','access','Access site-wide alerts and notifications',1),
 ('perm-alerting-rules','alerting.rules','alerting','manage','Manage alert and escalation rules',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-alerting-access','role-owner','perm-alerting-access','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-alerting-rules','role-owner','perm-alerting-rules','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
