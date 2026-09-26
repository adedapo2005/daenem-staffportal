PRAGMA foreign_keys = ON;

-- Additive, observe-first Smart Bug Management foundation. No detector or
-- remediation is activated by this schema migration.
CREATE TABLE IF NOT EXISTS smart_bug_detector_rules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  owner_module TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  environment_scope TEXT NOT NULL DEFAULT 'non-production'
    CHECK (environment_scope IN ('non-production','production','all')),
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS smart_bug_runbooks (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  owner_module TEXT NOT NULL,
  safety_class TEXT NOT NULL CHECK (safety_class IN ('SAFE_AUTO','APPROVAL_REQUIRED','MANUAL_ONLY')),
  prerequisites_json TEXT NOT NULL CHECK (json_valid(prerequisites_json)),
  action_json TEXT NOT NULL CHECK (json_valid(action_json)),
  validation_json TEXT NOT NULL CHECK (json_valid(validation_json)),
  rollback_json TEXT NOT NULL CHECK (json_valid(rollback_json)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code,version)
);

CREATE TABLE IF NOT EXISTS smart_bug_incidents (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  status TEXT NOT NULL CHECK (status IN (
    'DETECTED','CORRELATING','DIAGNOSED','REMEDIATION_READY','AUTO_REMEDIATING',
    'AWAITING_APPROVAL','VALIDATING','RESOLVED','MONITORING','RETRYING',
    'ROLLED_BACK','ESCALATED','FAILED_REMEDIATION','FALSE_POSITIVE','SUPPRESSED_BY_POLICY'
  )),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  sanitized_summary TEXT NOT NULL CHECK (length(sanitized_summary) <= 2000),
  environment_scope TEXT NOT NULL CHECK (environment_scope IN ('non-production','production')),
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  service TEXT NOT NULL,
  affected_record_refs_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(affected_record_refs_json)),
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  root_cause_hypothesis TEXT,
  confidence REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  dependencies_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dependencies_json)),
  runbook_id TEXT REFERENCES smart_bug_runbooks(id) ON DELETE SET NULL,
  safety_class TEXT CHECK (safety_class IS NULL OR safety_class IN ('SAFE_AUTO','APPROVAL_REQUIRED','MANUAL_ONLY')),
  checkpoint_ref TEXT,
  rollback_evidence TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  validation_results_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(validation_results_json)),
  recurrence_of TEXT REFERENCES smart_bug_incidents(id) ON DELETE SET NULL,
  escalation_state TEXT,
  resolution_summary TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS smart_bug_evidence (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES smart_bug_incidents(id) ON DELETE RESTRICT,
  evidence_type TEXT NOT NULL,
  source_module TEXT NOT NULL,
  safe_summary TEXT NOT NULL CHECK (length(safe_summary) <= 2000),
  reference_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(reference_json)),
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS smart_bug_audit (
  id TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES smart_bug_incidents(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('employee','service')),
  actor_id TEXT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  input_refs_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(input_refs_json)),
  result TEXT NOT NULL CHECK (length(result) <= 2000),
  correlation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS smart_bug_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  observe_only INTEGER NOT NULL DEFAULT 1 CHECK (observe_only IN (0,1)),
  auto_remediation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_remediation_enabled IN (0,1)),
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (auto_remediation_enabled = 0 OR observe_only = 0)
);
INSERT OR IGNORE INTO smart_bug_control(id) VALUES (1);

CREATE INDEX IF NOT EXISTS idx_smart_bug_incidents_status_severity
  ON smart_bug_incidents(environment_scope,status,severity,last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_smart_bug_incidents_fingerprint_scope
  ON smart_bug_incidents(fingerprint,environment_scope,COALESCE(company_id,''));
CREATE INDEX IF NOT EXISTS idx_smart_bug_incidents_module
  ON smart_bug_incidents(module,service,last_seen_at);
CREATE INDEX IF NOT EXISTS idx_smart_bug_evidence_incident
  ON smart_bug_evidence(incident_id,created_at);
CREATE INDEX IF NOT EXISTS idx_smart_bug_audit_incident
  ON smart_bug_audit(incident_id,created_at);

CREATE TRIGGER IF NOT EXISTS smart_bug_audit_no_update
BEFORE UPDATE ON smart_bug_audit BEGIN
  SELECT RAISE(ABORT,'smart bug audit evidence is immutable');
END;
CREATE TRIGGER IF NOT EXISTS smart_bug_audit_no_delete
BEFORE DELETE ON smart_bug_audit BEGIN
  SELECT RAISE(ABORT,'smart bug audit evidence is immutable');
END;
