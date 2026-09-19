PRAGMA foreign_keys = ON;

ALTER TABLE communication_outbox ADD COLUMN send_requested_by TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE communication_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE communication_outbox ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5;
ALTER TABLE communication_outbox ADD COLUMN next_attempt_at TEXT;
ALTER TABLE communication_outbox ADD COLUMN lease_owner TEXT;
ALTER TABLE communication_outbox ADD COLUMN lease_expires_at TEXT;
ALTER TABLE communication_outbox ADD COLUMN last_provider_response_at TEXT;
ALTER TABLE communication_outbox ADD COLUMN ambiguity_state TEXT NOT NULL DEFAULT 'clear'
  CHECK (ambiguity_state IN ('clear','provider_unknown','reconciled'));

CREATE INDEX IF NOT EXISTS idx_communication_outbox_retry
  ON communication_outbox(status,next_attempt_at,lease_expires_at,priority DESC,created_at);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('communications.dispatch_max_attempts','5','number'),
 ('communications.dispatch_lease_seconds','60','number');
