PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS payroll_payment_reconciliation_links (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES payroll_payment_batches(id) ON DELETE RESTRICT,
  batch_item_id TEXT NOT NULL UNIQUE REFERENCES payroll_payment_batch_items(id) ON DELETE RESTRICT,
  import_id TEXT NOT NULL REFERENCES financial_reconciliation_imports(id) ON DELETE RESTRICT,
  import_row_number INTEGER NOT NULL CHECK (import_row_number > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('provider_api','provider_webhook','csv','excel')),
  evidence_reference TEXT,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  linked_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(import_id, import_row_number),
  FOREIGN KEY(import_id, import_row_number)
    REFERENCES financial_reconciliation_import_rows(import_id, row_number)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_reconciliation_batch
  ON payroll_payment_reconciliation_links(batch_id, linked_at DESC);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
  ('payroll.payment_batch_maker_checker','true','boolean');
