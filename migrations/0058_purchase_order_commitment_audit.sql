PRAGMA foreign_keys = ON;

-- Batch 1 has no Staff Portal Purchase Order mutation endpoint. The existing
-- purchase_orders table remains the canonical procurement source, while this
-- append-only event stream is the evidence boundary Spend requires before it
-- treats an ordered obligation as verified committed spend.
CREATE TABLE IF NOT EXISTS purchase_order_status_events (
  id TEXT PRIMARY KEY,

  purchase_order_id TEXT NOT NULL
    REFERENCES purchase_orders(id)
    ON DELETE RESTRICT,

  company_id TEXT NOT NULL
    REFERENCES companies(id)
    ON DELETE RESTRICT,

  spend_expense_request_id TEXT
    REFERENCES spend_expense_requests(id)
    ON DELETE SET NULL,

  from_status TEXT
    CHECK (
      from_status IS NULL OR from_status IN (
        'draft',
        'submitted',
        'approved',
        'ordered',
        'partially_received',
        'received',
        'cancelled'
      )
    ),

  to_status TEXT NOT NULL
    CHECK (
      to_status IN (
        'draft',
        'submitted',
        'approved',
        'ordered',
        'partially_received',
        'received',
        'cancelled'
      )
    ),

  amount_kobo INTEGER NOT NULL
    CHECK (amount_kobo >= 0),

  actor_employee_id TEXT
    REFERENCES employees(id)
    ON DELETE SET NULL,

  session_id TEXT
    REFERENCES auth_sessions(id)
    ON DELETE SET NULL,

  reason TEXT,

  source_reference TEXT,

  request_id TEXT,

  idempotency_key TEXT NOT NULL UNIQUE,

  device_id TEXT,

  ip_address TEXT,

  network_location TEXT,

  client_timezone TEXT,

  captured_at TEXT,

  server_received_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  metadata_json TEXT NOT NULL
    DEFAULT '{}',

  created_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    to_status <> 'cancelled'
    OR length(trim(COALESCE(reason, ''))) >= 3
  )
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_status_events_po
  ON purchase_order_status_events(
    purchase_order_id,
    server_received_at,
    id
  );

CREATE INDEX IF NOT EXISTS idx_purchase_order_status_events_spend
  ON purchase_order_status_events(
    spend_expense_request_id,
    server_received_at,
    id
  );

-- Status evidence is append-only. Future Procurement mutation paths must
-- update purchase_orders and insert the corresponding event atomically.
CREATE TRIGGER IF NOT EXISTS purchase_order_status_events_no_update
BEFORE UPDATE ON purchase_order_status_events
BEGIN
  SELECT RAISE(ABORT, 'purchase_order_status_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS purchase_order_status_events_no_delete
BEFORE DELETE ON purchase_order_status_events
BEGIN
  SELECT RAISE(ABORT, 'purchase_order_status_events is append-only');
END;

-- Rebuild the semantic Procurement commitment read model. Approved is an
-- approval/exposure state, not a binding commitment. Only ordered or
-- partially_received POs with a matching, amount-bound status event can be
-- active; terminal states retain history but never contribute current spend.
DROP VIEW IF EXISTS spend_purchase_order_commitments;
CREATE VIEW spend_purchase_order_commitments AS
WITH linked_purchase_orders AS (
  SELECT
    po.id,
    po.spend_expense_request_id AS expense_request_id,
    po.company_id,
    po.po_no,
    po.status AS purchase_order_status,
    po.total_kobo AS amount_kobo,
    po.created_at,
    po.updated_at
  FROM purchase_orders po
  WHERE po.spend_expense_request_id IS NOT NULL
    AND po.status IN ('ordered', 'partially_received', 'received', 'cancelled')
    AND po.total_kobo > 0
), event_evidence AS (
  SELECT
    po.*,
    (
      SELECT e.id
      FROM purchase_order_status_events e
      WHERE e.purchase_order_id=po.id
        AND e.company_id=po.company_id
        AND e.spend_expense_request_id=po.expense_request_id
        AND e.amount_kobo=po.amount_kobo
        AND (
          (po.purchase_order_status='ordered' AND e.to_status='ordered')
          OR (po.purchase_order_status IN ('partially_received', 'received', 'cancelled')
            AND e.to_status IN ('ordered', 'partially_received'))
        )
      ORDER BY e.server_received_at ASC, e.id ASC
      LIMIT 1
    ) AS commitment_event_id,
    (
      SELECT e.id
      FROM purchase_order_status_events e
      WHERE e.purchase_order_id=po.id
        AND e.company_id=po.company_id
        AND e.spend_expense_request_id=po.expense_request_id
        AND e.amount_kobo=po.amount_kobo
        AND e.to_status='received'
      ORDER BY e.server_received_at ASC, e.id ASC
      LIMIT 1
    ) AS release_event_id,
    (
      SELECT e.id
      FROM purchase_order_status_events e
      WHERE e.purchase_order_id=po.id
        AND e.company_id=po.company_id
        AND e.spend_expense_request_id=po.expense_request_id
        AND e.amount_kobo=po.amount_kobo
        AND e.to_status='cancelled'
      ORDER BY e.server_received_at ASC, e.id ASC
      LIMIT 1
    ) AS reversal_event_id
  FROM linked_purchase_orders po
)
SELECT
  po.id,
  po.expense_request_id,
  po.company_id,
  po.po_no,
  po.purchase_order_status,
  po.amount_kobo,
  CASE
    WHEN po.purchase_order_status IN ('ordered', 'partially_received') THEN 'active'
    WHEN po.purchase_order_status='received' THEN 'released'
    WHEN po.purchase_order_status='cancelled' THEN 'reversed'
  END AS state,
  CASE
    WHEN po.purchase_order_status IN ('ordered', 'partially_received')
      AND po.commitment_event_id IS NOT NULL THEN 'verified'
    WHEN po.purchase_order_status IN ('ordered', 'partially_received')
      THEN 'missing_evidence'
    WHEN po.purchase_order_status='received'
      AND po.release_event_id IS NOT NULL THEN 'verified'
    WHEN po.purchase_order_status='received' THEN 'missing_evidence'
    WHEN po.purchase_order_status='cancelled'
      AND po.reversal_event_id IS NOT NULL THEN 'verified'
    WHEN po.purchase_order_status='cancelled' THEN 'missing_evidence'
    ELSE 'not_applicable'
  END AS commitment_audit_state,
  CASE
    WHEN po.purchase_order_status IN ('ordered', 'partially_received')
      AND po.commitment_event_id IS NULL THEN po.amount_kobo
    ELSE 0
  END AS unverified_commitment_kobo,
  'purchase_order' AS source,
  po.po_no AS source_reference,
  po.id AS idempotency_key,
  (
    SELECT e.server_received_at
    FROM purchase_order_status_events e
    WHERE e.id=po.commitment_event_id
  ) AS committed_at,
  (
    SELECT e.server_received_at
    FROM purchase_order_status_events e
    WHERE e.id=po.release_event_id
  ) AS released_at,
  (
    SELECT e.server_received_at
    FROM purchase_order_status_events e
    WHERE e.id=po.reversal_event_id
  ) AS reversed_at,
  (
    SELECT e.actor_employee_id
    FROM purchase_order_status_events e
    WHERE e.id=po.commitment_event_id
  ) AS created_by,
  po.commitment_event_id,
  po.release_event_id,
  po.reversal_event_id,
  po.created_at,
  po.updated_at
FROM event_evidence po;

-- Extend canonical request truth without changing the independent payment,
-- Finance posting, or recognized-expense sources.
DROP VIEW IF EXISTS spend_request_truth;
CREATE VIEW spend_request_truth AS
SELECT
  r.id,
  CASE
    WHEN COALESCE((SELECT SUM(p.amount_kobo)
      FROM spend_expense_payments p
      WHERE p.expense_request_id=r.id AND p.status='settled'), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((SELECT SUM(p.amount_kobo)
      FROM spend_expense_payments p
      WHERE p.expense_request_id=r.id AND p.status='settled'), 0) < r.total_kobo THEN 'partially_paid'
    ELSE 'paid'
  END AS payment_state,
  COALESCE((SELECT SUM(p.amount_kobo)
    FROM spend_expense_payments p
    WHERE p.expense_request_id=r.id AND p.status='settled'), 0) AS paid_kobo,
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
        AND (ap.posting_state='reversed' OR je.status IN ('reversed', 'void'))
    ) THEN 'reversed'
    ELSE 'not_posted'
  END AS finance_posting_state,
  COALESCE((SELECT SUM(ap.recognized_kobo)
    FROM spend_accounting_postings ap
    JOIN journal_entries je ON je.id=ap.journal_entry_id
    WHERE ap.expense_request_id=r.id
      AND ap.posting_state='posted'
      AND je.status='posted'), 0) AS recognized_kobo,
  COALESCE((SELECT SUM(c.amount_kobo)
    FROM spend_purchase_order_commitments c
    WHERE c.expense_request_id=r.id
      AND c.company_id=r.company_id
      AND c.state='active'
      AND c.commitment_audit_state='verified'), 0) AS committed_kobo,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM spend_purchase_order_commitments c
      WHERE c.expense_request_id=r.id
        AND c.company_id=r.company_id
        AND c.state='active'
        AND c.commitment_audit_state='verified'
    ) THEN 'committed'
    ELSE 'uncommitted'
  END AS commitment_state,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM spend_purchase_order_commitments c
      WHERE c.expense_request_id=r.id
        AND c.company_id=r.company_id
        AND c.state='active'
        AND c.commitment_audit_state='missing_evidence'
    ) THEN 'missing_evidence'
    WHEN EXISTS (
      SELECT 1
      FROM spend_purchase_order_commitments c
      WHERE c.expense_request_id=r.id
        AND c.company_id=r.company_id
        AND c.state='active'
        AND c.commitment_audit_state='verified'
    ) THEN 'verified'
    ELSE 'not_applicable'
  END AS commitment_audit_state,
  COALESCE((SELECT SUM(c.unverified_commitment_kobo)
    FROM spend_purchase_order_commitments c
    WHERE c.expense_request_id=r.id
      AND c.company_id=r.company_id
      AND c.state='active'
      AND c.commitment_audit_state='missing_evidence'), 0) AS unverified_commitment_kobo
FROM spend_expense_requests r;
