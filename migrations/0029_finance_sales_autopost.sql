PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS finance_source_postings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_module TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  receivable_id TEXT REFERENCES finance_receivables(id) ON DELETE SET NULL,
  posted_amount_kobo INTEGER NOT NULL DEFAULT 0,
  cost_amount_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','reversed','failed')),
  error_text TEXT,
  posted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,source_module,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS idx_finance_source_postings_company ON finance_source_postings(company_id,source_module,posted_at DESC);
