PRAGMA foreign_keys = ON;

-- Payment and Finance posting are independent facts. The request status is a
-- workflow state and must never be used as payment evidence.
ALTER TABLE spend_expense_requests ADD COLUMN payment_state TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_state IN ('unpaid','partially_paid','paid'));
ALTER TABLE spend_expense_requests ADD COLUMN finance_posting_state TEXT NOT NULL DEFAULT 'not_posted'
  CHECK (finance_posting_state IN ('not_posted','posted','reversed'));

ALTER TABLE spend_accounting_postings ADD COLUMN posting_state TEXT NOT NULL DEFAULT 'posted'
  CHECK (posting_state IN ('posted','reversed'));
ALTER TABLE spend_cost_centers ADD COLUMN superseded_by TEXT REFERENCES spend_cost_centers(id) ON DELETE SET NULL;

-- A payment row is the only source that can establish paid spend. Batch 1
-- deliberately does not create payment rows; a future payment integration
-- must insert a canonical settled record with an idempotent key.
CREATE TABLE IF NOT EXISTS spend_expense_payments (
  id TEXT PRIMARY KEY,
  expense_request_id TEXT NOT NULL REFERENCES spend_expense_requests(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','settled','reversed')),
  payment_reference TEXT,
  source TEXT NOT NULL DEFAULT 'canonical_payment' CHECK (source IN ('canonical_payment','payroll','bank_reconciliation')),
  idempotency_key TEXT NOT NULL UNIQUE,
  paid_at TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_spend_payments_request ON spend_expense_payments(expense_request_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spend_payments_company ON spend_expense_payments(company_id,status,paid_at DESC);

UPDATE offline_policy
SET allowed_operations_json='["forms.submit","expense.draft.save","expense.request.submit"]', updated_at=CURRENT_TIMESTAMP
WHERE id='global';

-- 0055 created this placeholder for an unsafe catch-all. It is not a valid
-- Spend destination, so retire only that exact seeded account; no historical
-- ledger row is deleted.
UPDATE finance_accounts
SET active=0,updated_at=CURRENT_TIMESTAMP
WHERE code='1300' AND name='Capital & Other Non-P&L Assets';

-- Every posting account is selected by controlled data. There is no fallback
-- account: missing setup is a 503 finance-setup response.
CREATE TABLE IF NOT EXISTS spend_accounting_account_mappings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  accounting_treatment_id TEXT REFERENCES spend_accounting_treatments(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES spend_categories(id) ON DELETE RESTRICT,
  account_role TEXT NOT NULL CHECK (account_role IN ('debit','payable')),
  ledger_account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system','admin')),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((account_role='debit' AND accounting_treatment_id IS NOT NULL) OR
         (account_role='payable' AND accounting_treatment_id IS NULL AND category_id IS NULL)),
  UNIQUE(company_id,accounting_treatment_id,category_id,account_role)
);
CREATE INDEX IF NOT EXISTS idx_spend_account_mappings_lookup
  ON spend_accounting_account_mappings(company_id,accounting_treatment_id,category_id,account_role,active);

-- Seed only the existing controlled P&L and payable accounts. Non-P&L
-- treatments intentionally have no mapping until Finance configures the
-- correct asset/liability account for that treatment.
INSERT OR IGNORE INTO spend_accounting_account_mappings(
  id,company_id,accounting_treatment_id,category_id,account_role,ledger_account_id,source
)
SELECT 'spend-map-'||c.code||'-cogs',c.id,'spend-treatment-cogs',NULL,'debit',fa.id,'system'
FROM companies c JOIN finance_accounts fa ON fa.company_id=c.id AND fa.code='5000' AND fa.active=1;
INSERT OR IGNORE INTO spend_accounting_account_mappings(
  id,company_id,accounting_treatment_id,category_id,account_role,ledger_account_id,source
)
SELECT 'spend-map-'||c.code||'-operating',c.id,'spend-treatment-opex',NULL,'debit',fa.id,'system'
FROM companies c JOIN finance_accounts fa ON fa.company_id=c.id AND fa.code='6000' AND fa.active=1;
INSERT OR IGNORE INTO spend_accounting_account_mappings(
  id,company_id,accounting_treatment_id,category_id,account_role,ledger_account_id,source
)
SELECT 'spend-map-'||c.code||'-payable',c.id,NULL,NULL,'payable',fa.id,'system'
FROM companies c JOIN finance_accounts fa ON fa.company_id=c.id AND fa.code='2000' AND fa.active=1;

CREATE VIEW IF NOT EXISTS spend_request_truth AS
SELECT
  r.id,
  CASE
    WHEN COALESCE((SELECT SUM(p.amount_kobo) FROM spend_expense_payments p WHERE p.expense_request_id=r.id AND p.status='settled'),0) <= 0 THEN 'unpaid'
    WHEN COALESCE((SELECT SUM(p.amount_kobo) FROM spend_expense_payments p WHERE p.expense_request_id=r.id AND p.status='settled'),0) < r.total_kobo THEN 'partially_paid'
    ELSE 'paid'
  END AS payment_state,
  COALESCE((SELECT SUM(p.amount_kobo) FROM spend_expense_payments p WHERE p.expense_request_id=r.id AND p.status='settled'),0) AS paid_kobo,
  CASE
    WHEN EXISTS (SELECT 1 FROM spend_accounting_postings ap JOIN journal_entries je ON je.id=ap.journal_entry_id WHERE ap.expense_request_id=r.id AND ap.posting_state='posted' AND je.status='posted') THEN 'posted'
    WHEN EXISTS (SELECT 1 FROM spend_accounting_postings ap JOIN journal_entries je ON je.id=ap.journal_entry_id WHERE ap.expense_request_id=r.id AND (ap.posting_state='reversed' OR je.status IN ('reversed','void'))) THEN 'reversed'
    ELSE 'not_posted'
  END AS finance_posting_state,
  COALESCE((SELECT SUM(ap.recognized_kobo) FROM spend_accounting_postings ap JOIN journal_entries je ON je.id=ap.journal_entry_id WHERE ap.expense_request_id=r.id AND ap.posting_state='posted' AND je.status='posted'),0) AS recognized_kobo
FROM spend_expense_requests r;
