PRAGMA foreign_keys = ON;

ALTER TABLE bakery_exception_evidence ADD COLUMN original_filename TEXT;
ALTER TABLE bakery_exception_evidence ADD COLUMN mime_type TEXT;
ALTER TABLE bakery_exception_evidence ADD COLUMN size_bytes INTEGER;
ALTER TABLE bakery_exception_evidence ADD COLUMN sha256_hex TEXT;
ALTER TABLE bakery_exception_evidence ADD COLUMN retain_until TEXT;

CREATE INDEX IF NOT EXISTS idx_bakery_exception_evidence_retention
  ON bakery_exception_evidence(company_id, retain_until, recorded_at DESC);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('bakery.investigation_evidence_retention_days','2555','number'),
 ('bakery.investigation_evidence_max_bytes','10485760','number');
