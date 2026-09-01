PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS print_artwork_versions (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL DEFAULT 1,
  file_key TEXT,
  preview_key TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','designing','ready','approved','rejected','superseded')),
  source TEXT NOT NULL DEFAULT 'internal' CHECK (source IN ('customer','internal','agency','other')),
  note TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(print_job_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_print_artwork_job ON print_artwork_versions(print_job_id, version_no DESC);

CREATE TABLE IF NOT EXISTS print_finishing_records (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  finishing_type TEXT NOT NULL,
  quantity REAL,
  cost_kobo INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT 'completed' CHECK (result IN ('pending','completed','rework','rejected')),
  note TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_print_finishing_job ON print_finishing_records(print_job_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS print_delivery_records (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'pickup' CHECK (method IN ('pickup','company_delivery','courier','customer_transport','other')),
  recipient_name TEXT,
  recipient_phone TEXT,
  delivery_address TEXT,
  proof_key TEXT,
  note TEXT,
  dispatched_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  delivered_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  dispatched_at TEXT,
  delivered_at TEXT,
  acknowledged_by_customer INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged_by_customer IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_print_delivery_job ON print_delivery_records(print_job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS print_job_notes (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL DEFAULT 'internal' CHECK (note_type IN ('internal','customer','production','design','qc','delivery','finance')),
  note TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_print_job_notes_job ON print_job_notes(print_job_id, created_at DESC);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('printing.require_material_usage_before_qc', 'true', 'boolean'),
  ('printing.require_passed_qc_before_packaging', 'true', 'boolean'),
  ('printing.require_delivery_record_before_completion', 'true', 'boolean'),
  ('printing.require_proof_evidence_when_service_requires_proof', 'true', 'boolean');
