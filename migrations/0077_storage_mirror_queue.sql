PRAGMA foreign_keys = ON;

-- Durable secondary-copy work. R2 remains authoritative; no provider call runs here.
CREATE TABLE IF NOT EXISTS storage_mirror_jobs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider = 'microsoft_onedrive'),
  source_module TEXT NOT NULL,
  source_id TEXT NOT NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  r2_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'provider_required' CHECK (status IN (
    'pending','syncing','mirrored','retrying','failed','disabled','provider_required'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_item_id TEXT,
  synced_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, source_module, source_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_storage_mirror_jobs_due
  ON storage_mirror_jobs(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_storage_mirror_jobs_company
  ON storage_mirror_jobs(company_id, status, created_at DESC);
