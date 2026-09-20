PRAGMA foreign_keys = ON;

ALTER TABLE communication_inbox_conversations
  ADD COLUMN last_customer_message_at TEXT;

UPDATE communication_inbox_conversations
SET last_customer_message_at=(
  SELECT MAX(COALESCE(m.provider_timestamp,m.created_at))
  FROM communication_inbox_messages m
  WHERE m.conversation_id=communication_inbox_conversations.id
    AND m.direction='inbound'
)
WHERE last_customer_message_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_inbox_customer_window
  ON communication_inbox_conversations(last_customer_message_at);
