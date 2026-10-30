PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS communication_inbox_conversations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_comm_inbox_conversations_queue
  ON communication_inbox_conversations(company_id,status,last_message_at DESC);

CREATE TABLE IF NOT EXISTS communication_inbox_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES communication_inbox_conversations(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_comm_inbox_messages_thread
  ON communication_inbox_messages(conversation_id,created_at);

CREATE TABLE IF NOT EXISTS communication_inbox_notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES communication_inbox_conversations(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-communications-support-inbox-view','communications.support.inbox.view','communications','view','View shared WhatsApp support inbox',1),
 ('perm-communications-support-inbox-reply','communications.support.inbox.reply','communications','create','Draft replies in shared WhatsApp support inbox',1),
 ('perm-communications-support-inbox-assign','communications.support.inbox.assign','communications','edit','Assign shared WhatsApp conversations',1),
 ('perm-communications-support-inbox-note','communications.support.inbox.note','communications','create','Add internal notes to shared WhatsApp conversations',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-' || p.id,'role-owner',p.id,'manage'
FROM permissions p WHERE p.id LIKE 'perm-communications-support-inbox-%';

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-group-admin-' || p.id,'role-group-admin',p.id,'manage'
FROM permissions p WHERE p.id LIKE 'perm-communications-support-inbox-%'
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-group-admin');
