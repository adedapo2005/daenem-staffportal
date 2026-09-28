PRAGMA foreign_keys = ON;

-- Provider-neutral statement import staging. These rows are evidence only;
-- they do not create or alter a business ledger transaction.
CREATE TABLE IF NOT EXISTS financial_reconciliation_imports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
    CHECK (company_id IN ('company-printing','company-bakery','company-autos','company-properties','company-logistics')),
  source_type TEXT NOT NULL CHECK (source_type IN ('provider_api','provider_webhook','csv','excel','manual')),
  provider TEXT CHECK (provider IS NULL OR length(provider) BETWEEN 1 AND 80),
  source_reference TEXT CHECK (source_reference IS NULL OR length(source_reference) BETWEEN 1 AND 160),
  file_sha256 TEXT CHECK (file_sha256 IS NULL OR (length(file_sha256)=64 AND file_sha256 NOT GLOB '*[^0-9a-f]*')),
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','review_required','reviewed','cancelled')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  created_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  UNIQUE(company_id, source_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_imports_scope
  ON financial_reconciliation_imports(company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS financial_reconciliation_import_rows (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES financial_reconciliation_imports(id) ON DELETE RESTRICT,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  provider_reference TEXT CHECK (provider_reference IS NULL OR length(provider_reference) BETWEEN 1 AND 200),
  occurred_at TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  reconciliation_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (reconciliation_status IN (
    'unmatched','partial','exact','overpayment','duplicate','reversed','refunded'
  )),
  candidate_reference TEXT CHECK (candidate_reference IS NULL OR length(candidate_reference) BETWEEN 1 AND 200),
  reviewed_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(import_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_financial_reconciliation_rows_review
  ON financial_reconciliation_import_rows(import_id, reconciliation_status, row_number);
