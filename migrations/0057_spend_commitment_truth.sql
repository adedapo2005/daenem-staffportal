PRAGMA foreign_keys = ON;

-- Procurement is the existing authoritative source for purchase obligations.
-- Spend links to that source; it does not create a second commitment ledger.
ALTER TABLE purchase_orders ADD COLUMN spend_expense_request_id TEXT
  REFERENCES spend_expense_requests(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_spend_request
  ON purchase_orders(spend_expense_request_id, status, updated_at DESC);

-- This is a semantic read model over canonical purchase orders, not a second
-- financial record. Batch 1 has no Spend commitment mutation endpoint.
DROP VIEW IF EXISTS spend_purchase_order_commitments;
CREATE VIEW spend_purchase_order_commitments AS
SELECT
  po.id,
  po.spend_expense_request_id AS expense_request_id,
  po.company_id,
  po.total_kobo AS amount_kobo,
  CASE
    WHEN po.status IN ('approved', 'ordered', 'partially_received') THEN 'active'
    WHEN po.status = 'received' THEN 'released'
    WHEN po.status = 'cancelled' THEN 'reversed'
  END AS state,
  'purchase_order' AS source,
  po.po_no AS source_reference,
  po.id AS idempotency_key,
  COALESCE(po.approved_at, po.order_date, po.created_at) AS committed_at,
  CASE WHEN po.status = 'received' THEN po.updated_at END AS released_at,
  CASE WHEN po.status = 'cancelled' THEN po.updated_at END AS reversed_at,
  po.created_by AS created_by,
  po.created_at,
  po.updated_at
FROM purchase_orders po
WHERE po.spend_expense_request_id IS NOT NULL
  AND po.status IN ('approved', 'ordered', 'partially_received', 'received', 'cancelled')
  AND po.total_kobo > 0;

-- Rebuild the canonical request truth projection so commitment is as
-- independent as payment and Finance posting. Workflow status and the legacy
-- request committed_at field are deliberately not consulted.
DROP VIEW IF EXISTS spend_request_truth;
CREATE VIEW spend_request_truth AS
SELECT
  r.id,
  CASE
    WHEN COALESCE((SELECT SUM(p.amount_kobo)
      FROM spend_expense_payments p
      WHERE p.expense_request_id=r.id AND p.status='settled'),0) <= 0 THEN 'unpaid'
    WHEN COALESCE((SELECT SUM(p.amount_kobo)
      FROM spend_expense_payments p
      WHERE p.expense_request_id=r.id AND p.status='settled'),0) < r.total_kobo THEN 'partially_paid'
    ELSE 'paid'
  END AS payment_state,
  COALESCE((SELECT SUM(p.amount_kobo)
    FROM spend_expense_payments p
    WHERE p.expense_request_id=r.id AND p.status='settled'),0) AS paid_kobo,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM spend_accounting_postings ap
      JOIN journal_entries je ON je.id=ap.journal_entry_id
      WHERE ap.expense_request_id=r.id
        AND ap.posting_state='posted'
        AND je.status='posted'
    ) THEN 'posted'
    WHEN EXISTS (
      SELECT 1
      FROM spend_accounting_postings ap
      JOIN journal_entries je ON je.id=ap.journal_entry_id
      WHERE ap.expense_request_id=r.id
        AND (ap.posting_state='reversed' OR je.status IN ('reversed','void'))
    ) THEN 'reversed'
    ELSE 'not_posted'
  END AS finance_posting_state,
  COALESCE((SELECT SUM(ap.recognized_kobo)
    FROM spend_accounting_postings ap
    JOIN journal_entries je ON je.id=ap.journal_entry_id
    WHERE ap.expense_request_id=r.id
      AND ap.posting_state='posted'
      AND je.status='posted'),0) AS recognized_kobo,
  COALESCE((SELECT SUM(c.amount_kobo)
    FROM spend_purchase_order_commitments c
    WHERE c.expense_request_id=r.id
      AND c.company_id=r.company_id
      AND c.state='active'),0) AS committed_kobo,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM spend_purchase_order_commitments c
      WHERE c.expense_request_id=r.id
        AND c.company_id=r.company_id
        AND c.state='active'
    ) THEN 'committed'
    ELSE 'uncommitted'
  END AS commitment_state
FROM spend_expense_requests r;
