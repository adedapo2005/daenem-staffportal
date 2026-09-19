PRAGMA foreign_keys = ON;

ALTER TABLE communication_policy_rules ADD COLUMN quiet_hours_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE communication_policy_rules ADD COLUMN fallback_channels_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE communication_policy_rules ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS communication_policy_restrictions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('role','employee')),
  subject_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK (ai_enabled IN (0,1)),
  auto_generate INTEGER NOT NULL DEFAULT 1 CHECK (auto_generate IN (0,1)),
  auto_send INTEGER NOT NULL DEFAULT 1 CHECK (auto_send IN (0,1)),
  require_human_approval INTEGER NOT NULL DEFAULT 0 CHECK (require_human_approval IN (0,1)),
  channels_json TEXT NOT NULL DEFAULT '["whatsapp","email","in_app","push"]',
  languages_json TEXT NOT NULL DEFAULT '["en"]',
  max_characters INTEGER NOT NULL DEFAULT 4000,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,event_id,subject_type,subject_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_policy_restrictions_event
  ON communication_policy_restrictions(company_id,event_id,subject_type,subject_id);

CREATE TABLE IF NOT EXISTS communication_trigger_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  trigger_code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  mode TEXT NOT NULL DEFAULT 'draft'
    CHECK (mode IN ('draft','deterministic_queue')),
  config_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,event_id,trigger_code)
);

CREATE INDEX IF NOT EXISTS idx_comm_trigger_rules_event
  ON communication_trigger_rules(company_id,event_id,enabled);

ALTER TABLE communication_templates ADD COLUMN created_by TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE communication_instruction_profiles ADD COLUMN created_by TEXT REFERENCES employees(id) ON DELETE SET NULL;
