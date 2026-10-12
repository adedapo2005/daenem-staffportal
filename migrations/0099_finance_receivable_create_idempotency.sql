-- Keep a repeated company-scoped receivable create request from creating a
-- second obligation. The fingerprint is a digest of the normalized request,
-- not a copy of customer or invoice data.
ALTER TABLE finance_receivables ADD COLUMN create_request_id TEXT;
ALTER TABLE finance_receivables ADD COLUMN create_request_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_receivable_create_request
  ON finance_receivables(company_id, create_request_id)
  WHERE create_request_id IS NOT NULL;
