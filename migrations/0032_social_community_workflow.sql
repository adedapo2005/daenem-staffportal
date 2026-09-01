PRAGMA foreign_keys = ON;

ALTER TABLE social_conversations ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent'));
ALTER TABLE social_conversations ADD COLUMN sla_due_at TEXT;
ALTER TABLE social_conversations ADD COLUMN escalated_at TEXT;
ALTER TABLE social_conversations ADD COLUMN escalation_reason TEXT;
ALTER TABLE social_conversations ADD COLUMN tags_json TEXT;
ALTER TABLE social_conversations ADD COLUMN internal_note TEXT;
ALTER TABLE social_conversations ADD COLUMN last_staff_action_at TEXT;
ALTER TABLE social_conversations ADD COLUMN resolved_at TEXT;
ALTER TABLE social_conversations ADD COLUMN resolved_by TEXT REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_conversations_work_queue
  ON social_conversations(brand_id,status,priority,sla_due_at,last_message_at DESC);

CREATE TABLE IF NOT EXISTS social_conversation_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('assigned','unassigned','priority_changed','escalated','status_changed','internal_note','reply_queued','reply_failed','resolved','reopened')),
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  from_value TEXT,
  to_value TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_conversation_events_thread
  ON social_conversation_events(conversation_id,created_at DESC);
