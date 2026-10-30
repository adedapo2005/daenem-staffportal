PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS communication_whatsapp_senders (
  id TEXT PRIMARY KEY,
  phone_number_id TEXT NOT NULL UNIQUE,
  waba_id TEXT,
  meta_app_id TEXT,
  display_name TEXT,
  routing_mode TEXT NOT NULL DEFAULT 'shared_group'
    CHECK (routing_mode IN ('shared_group','company_dedicated')),
  dedicated_company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'configured'
    CHECK (status IN ('configured','connected','disabled','error')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (routing_mode='shared_group' AND dedicated_company_id IS NULL)
    OR
    (routing_mode='company_dedicated' AND dedicated_company_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS communication_whatsapp_sender_companies (
  sender_id TEXT NOT NULL REFERENCES communication_whatsapp_senders(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(sender_id,company_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_sender_companies_company
  ON communication_whatsapp_sender_companies(company_id,enabled);

CREATE TABLE communication_inbox_conversations_v2 (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  connection_id TEXT,
  sender_id TEXT REFERENCES communication_whatsapp_senders(id) ON DELETE RESTRICT,
  customer_wa_id TEXT NOT NULL,
  customer_display_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,connection_id,customer_wa_id)
);

INSERT INTO communication_inbox_conversations_v2(
  id,company_id,connection_id,sender_id,customer_wa_id,customer_display_name,status,
  assigned_employee_id,unread_count,last_message_at,created_at,updated_at
)
SELECT
  id,company_id,connection_id,NULL,customer_wa_id,customer_display_name,status,
  assigned_employee_id,unread_count,last_message_at,created_at,updated_at
FROM communication_inbox_conversations;

CREATE TABLE communication_inbox_messages_v2 (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES communication_inbox_conversations_v2(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  provider_message_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('draft','queued','sent','delivered','read','received','failed')),
  staff_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  provider_timestamp TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_message_id)
);

INSERT INTO communication_inbox_messages_v2(
  id,conversation_id,company_id,direction,provider_message_id,message_type,body,status,
  staff_employee_id,provider_timestamp,created_at,updated_at
)
SELECT
  id,conversation_id,company_id,direction,provider_message_id,message_type,body,status,
  staff_employee_id,provider_timestamp,created_at,updated_at
FROM communication_inbox_messages;

CREATE TABLE communication_inbox_notes_v2 (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES communication_inbox_conversations_v2(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  author_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO communication_inbox_notes_v2(id,conversation_id,company_id,author_employee_id,body,created_at)
SELECT id,conversation_id,company_id,author_employee_id,body,created_at
FROM communication_inbox_notes;

DROP TABLE communication_inbox_notes;
DROP TABLE communication_inbox_messages;
DROP TABLE communication_inbox_conversations;

ALTER TABLE communication_inbox_conversations_v2 RENAME TO communication_inbox_conversations;
ALTER TABLE communication_inbox_messages_v2 RENAME TO communication_inbox_messages;
ALTER TABLE communication_inbox_notes_v2 RENAME TO communication_inbox_notes;

CREATE INDEX IF NOT EXISTS idx_comm_inbox_conversations_queue
  ON communication_inbox_conversations(company_id,status,last_message_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_inbox_sender_customer
  ON communication_inbox_conversations(sender_id,customer_wa_id)
  WHERE sender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_inbox_messages_thread
  ON communication_inbox_messages(conversation_id,created_at);
