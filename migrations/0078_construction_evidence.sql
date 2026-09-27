PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS construction_evidence (
  id TEXT PRIMARY KEY,
  evidence_no TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES construction_projects(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK(source IN ('whatsapp','voice_note','photo','receipt','invoice','quotation','spreadsheet','bank_statement','document','manual','other')),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 3 AND 1200),
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  sha256_hex TEXT NOT NULL CHECK(length(sha256_hex) = 64),
  original_recorded_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_construction_evidence_project
  ON construction_evidence(project_id, created_at DESC, id);
