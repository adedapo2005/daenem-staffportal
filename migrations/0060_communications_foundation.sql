PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS communication_policy_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  event_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  ai_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_enabled IN (0,1)),
  auto_generate INTEGER NOT NULL DEFAULT 0 CHECK (auto_generate IN (0,1)),
  auto_send INTEGER NOT NULL DEFAULT 0 CHECK (auto_send IN (0,1)),
  require_human_approval INTEGER NOT NULL DEFAULT 1 CHECK (require_human_approval IN (0,1)),
  channels_json TEXT NOT NULL DEFAULT '["in_app"]',
  languages_json TEXT NOT NULL DEFAULT '["en"]',
  max_characters INTEGER NOT NULL DEFAULT 1000,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,event_id)
);

CREATE TABLE IF NOT EXISTS communication_instruction_profiles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  tone TEXT NOT NULL DEFAULT 'professional',
  language TEXT NOT NULL DEFAULT 'en',
  instructions TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.1-8b-instruct',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,module,version)
);
CREATE TABLE IF NOT EXISTS communication_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  category TEXT NOT NULL CHECK (category IN ('authentication','utility','marketing','service')),
  body_template TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  internal_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (internal_status IN ('draft','approved','suspended','archived')),
  provider_status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (provider_status IN ('not_submitted','pending','approved','rejected','paused')),
  provider_template_id TEXT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,event_id,channel,language,revision)
);

CREATE TABLE IF NOT EXISTS employee_verified_contacts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('email','phone')),
  normalized_value TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  verified_method TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id,contact_type,normalized_value,revision)
);

CREATE INDEX IF NOT EXISTS idx_verified_contacts_active
  ON employee_verified_contacts(employee_id,contact_type,revoked_at);
CREATE TABLE IF NOT EXISTS communication_consents (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0,1)),
  notice_version TEXT,
  source TEXT,
  language TEXT,
  granted_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id,company_id,channel,purpose)
);

CREATE TABLE IF NOT EXISTS communication_drafts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  author_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recipient_employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  language TEXT NOT NULL,
  body TEXT NOT NULL,
  content_origin TEXT NOT NULL CHECK (content_origin IN ('human','ai','deterministic')),
  policy_revision TEXT NOT NULL,
  instruction_profile_id TEXT REFERENCES communication_instruction_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved','rejected','cancelled','queued')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS communication_approvals (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES communication_drafts(id) ON DELETE CASCADE,
  approver_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  content_digest TEXT NOT NULL,
  policy_revision TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(draft_id,approver_employee_id,content_digest)
);

CREATE TABLE IF NOT EXISTS communication_outbox (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  draft_id TEXT REFERENCES communication_drafts(id) ON DELETE SET NULL,
  template_id TEXT REFERENCES communication_templates(id) ON DELETE SET NULL,
  recipient_contact_revision INTEGER,
  priority INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','accepted','delivered','read','failed','cancelled','expired')),
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  accepted_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communication_outbox_dispatch
  ON communication_outbox(status,priority DESC,created_at);
CREATE TABLE IF NOT EXISTS communication_webhook_inbox (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  connection_ref TEXT,
  provider_event_id TEXT,
  body_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','failed','ignored')),
  last_error_code TEXT,
  UNIQUE(provider,provider_event_id),
  UNIQUE(provider,body_sha256)
);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-communications-hr-create','communications.hr.create','communications','create','Create HR communication drafts and deterministic intents',1),
 ('perm-communications-hr-generate','communications.hr.generate','communications','generate','Use approved AI assistance for HR communication drafts',1),
 ('perm-communications-hr-approve','communications.hr.approve','communications','approve','Approve HR communication drafts',1),
 ('perm-communications-hr-send','communications.hr.send','communications','send','Queue approved HR communications for delivery',1),
 ('perm-communications-hr-manage','communications.hr.manage','communications','manage','Manage HR communication policy, templates and controls',1),
 ('perm-communications-identity-manage','communications.identity.manage','communications','manage','Manage identity communication policy and authentication templates',1),
 ('perm-communications-support-manage','communications.support.manage','communications','manage','Manage support communication policy and templates',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-' || p.id,'role-owner',p.id,'manage'
FROM permissions p WHERE p.id LIKE 'perm-communications-%';

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-group-admin-' || p.id,'role-group-admin',p.id,'manage'
FROM permissions p WHERE p.id LIKE 'perm-communications-%'
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-group-admin');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('communications.kill_switch','true','boolean'),
 ('communications.default_channel','in_app','string'),
 ('communications.ai_enabled','false','boolean'),
 ('communications.whatsapp_enabled','false','boolean');
CREATE TABLE IF NOT EXISTS communication_capacity_reservations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  capacity_type TEXT NOT NULL CHECK (capacity_type IN ('ai_generation','provider_send')),
  event_id TEXT NOT NULL,
  source_id TEXT,
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  released_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_communication_capacity_daily
  ON communication_capacity_reservations(company_id,capacity_type,reserved_at);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('communications.ai_daily_limit','25','number'),
 ('communications.provider_daily_limit','250','number');
