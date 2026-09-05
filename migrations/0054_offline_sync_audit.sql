PRAGMA foreign_keys = ON;

ALTER TABLE workflow_form_submissions ADD COLUMN offline_idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_submission_offline_idempotency
  ON workflow_form_submissions(offline_idempotency_key)
  WHERE offline_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS offline_sync_receipts (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('forms.submit')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('processing','completed','rejected','conflict','failed_retryable')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error_category TEXT,
  result_json TEXT,
  server_received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_offline_receipts_employee
  ON offline_sync_receipts(employee_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_receipts_company
  ON offline_sync_receipts(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_receipts_state
  ON offline_sync_receipts(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS offline_client_telemetry (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  device_name TEXT,
  platform TEXT,
  app_version TEXT,
  client_timezone TEXT,
  pending_count INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'online' CHECK (sync_status IN ('online','offline','waiting','syncing','synced','needs_attention','authentication_required')),
  last_successful_sync_at TEXT,
  last_failed_sync_at TEXT,
  last_error_category TEXT,
  last_reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  network_location TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, company_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_offline_telemetry_employee
  ON offline_client_telemetry(employee_id, last_reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_telemetry_reported
  ON offline_client_telemetry(last_reported_at DESC);

CREATE TABLE IF NOT EXISTS offline_attachments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  operation_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','reconciled','orphaned')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reconciled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_offline_attachments_operation
  ON offline_attachments(employee_id, operation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS offline_policy (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  max_offline_age_minutes INTEGER NOT NULL DEFAULT 720 CHECK (max_offline_age_minutes BETWEEN 5 AND 43200),
  max_queue_count INTEGER NOT NULL DEFAULT 50 CHECK (max_queue_count BETWEEN 1 AND 500),
  attachment_max_bytes INTEGER NOT NULL DEFAULT 10485760 CHECK (attachment_max_bytes BETWEEN 1024 AND 52428800),
  automatic_sync INTEGER NOT NULL DEFAULT 1 CHECK (automatic_sync IN (0,1)),
  manual_retry INTEGER NOT NULL DEFAULT 1 CHECK (manual_retry IN (0,1)),
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  allowed_operations_json TEXT NOT NULL DEFAULT '["forms.submit"]',
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO offline_policy(id) VALUES ('global');
