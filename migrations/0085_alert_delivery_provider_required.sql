PRAGMA foreign_keys = ON;

-- Keep configured external channels distinguishable from work that is
-- actually queued for a live delivery adapter.
CREATE TABLE platform_alert_deliveries_next (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES platform_alerts(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES platform_alert_recipients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('in_app','screen_popup','email','whatsapp','web_push')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','provider_required','sending','sent','delivered','viewed','failed','cancelled')),
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

INSERT INTO platform_alert_deliveries_next(
  id,alert_id,recipient_id,channel,status,attempts,provider_message_id,last_error,
  sent_at,delivered_at,viewed_at,created_at,updated_at
)
SELECT id,alert_id,recipient_id,channel,status,attempts,provider_message_id,last_error,
  sent_at,delivered_at,viewed_at,created_at,updated_at
FROM platform_alert_deliveries;

DROP TABLE platform_alert_deliveries;
ALTER TABLE platform_alert_deliveries_next RENAME TO platform_alert_deliveries;

CREATE INDEX idx_platform_alert_deliveries_queue
  ON platform_alert_deliveries(status,channel,created_at);
