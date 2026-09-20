PRAGMA foreign_keys = ON;

ALTER TABLE communication_inbox_messages
  ADD COLUMN reply_mode TEXT NOT NULL DEFAULT 'freeform'
  CHECK (reply_mode IN ('freeform','template'));

ALTER TABLE communication_inbox_messages
  ADD COLUMN template_id TEXT REFERENCES communication_templates(id) ON DELETE SET NULL;

ALTER TABLE communication_inbox_messages
  ADD COLUMN template_name TEXT;

ALTER TABLE communication_inbox_messages
  ADD COLUMN template_language TEXT;

ALTER TABLE communication_inbox_messages
  ADD COLUMN template_category TEXT;

CREATE INDEX IF NOT EXISTS idx_comm_inbox_messages_template
  ON communication_inbox_messages(template_id);
