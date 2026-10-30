PRAGMA foreign_keys = ON;

ALTER TABLE communication_inbox_messages
  ADD COLUMN idempotency_key TEXT;

ALTER TABLE communication_inbox_messages
  ADD COLUMN send_requested_at TEXT;

ALTER TABLE communication_inbox_messages
  ADD COLUMN last_error_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_inbox_message_idempotency
  ON communication_inbox_messages(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('communications.whatsapp_live_send','false','boolean');
