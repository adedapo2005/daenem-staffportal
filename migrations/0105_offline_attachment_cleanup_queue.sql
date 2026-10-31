PRAGMA foreign_keys = ON;

-- A reservation is written before R2 upload. The Worker deletes it in the same
-- D1 batch that commits attachment metadata and its audit row. If the Worker
-- stops after the object write, the existing scheduler can safely reclaim it.
CREATE TABLE IF NOT EXISTS offline_attachment_cleanup_jobs (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','pending','leased','retry','quarantined','completed')),
  reason TEXT NOT NULL DEFAULT 'upload_in_progress',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error_category TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_offline_attachment_cleanup_due
  ON offline_attachment_cleanup_jobs(status, next_attempt_at, created_at);

-- An attachment identifier is a durable content identity. Prevent a retry or a
-- concurrent request from repointing committed metadata at different R2 bytes.
CREATE TRIGGER IF NOT EXISTS trg_offline_attachment_identity_immutable
BEFORE UPDATE ON offline_attachments
WHEN OLD.employee_id <> NEW.employee_id
  OR COALESCE(OLD.company_id, '') <> COALESCE(NEW.company_id, '')
  OR OLD.operation_id <> NEW.operation_id
  OR OLD.r2_key <> NEW.r2_key
  OR OLD.original_name <> NEW.original_name
  OR OLD.mime_type <> NEW.mime_type
  OR OLD.size_bytes <> NEW.size_bytes
  OR OLD.sha256 <> NEW.sha256
BEGIN
  SELECT RAISE(ABORT, 'offline_attachment_identity_conflict');
END;
