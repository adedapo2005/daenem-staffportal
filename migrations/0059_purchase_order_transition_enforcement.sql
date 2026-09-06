PRAGMA foreign_keys = ON;

-- The previous migration created the canonical Purchase Order status-event
-- evidence table. This forward migration adds the pointer used by the
-- database status guard; migration 0058 remains immutable.
ALTER TABLE purchase_orders ADD COLUMN last_status_event_id TEXT
  REFERENCES purchase_order_status_events(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_last_status_event
  ON purchase_orders(last_status_event_id);

-- Future Spend-linked Purchase Orders may start in a non-binding state only.
-- Ordered/received/cancelled rows must be created by an approved transition
-- boundary, not by an INSERT that bypasses the event stream.
CREATE TRIGGER IF NOT EXISTS purchase_orders_spend_insert_requires_transition
BEFORE INSERT ON purchase_orders
WHEN NEW.spend_expense_request_id IS NOT NULL
  AND NEW.status IN ('ordered', 'partially_received', 'received', 'cancelled')
BEGIN
  SELECT RAISE(ABORT, 'Spend-linked Purchase Orders require an audited transition');
END;

-- Every newly appended event must describe a valid state-machine edge. The
-- first two edges are ordinary Procurement preparation; the remaining edges
-- are the bounded commitment-transition service implemented by the Worker.
CREATE TRIGGER IF NOT EXISTS purchase_order_status_events_validate_transition
BEFORE INSERT ON purchase_order_status_events
BEGIN
  SELECT RAISE(ABORT, 'Invalid Purchase Order status transition')
  WHERE NOT (
    (NEW.from_status='draft' AND NEW.to_status='submitted')
    OR (NEW.from_status='submitted' AND NEW.to_status='approved')
    OR (NEW.from_status='approved' AND NEW.to_status IN ('ordered', 'cancelled'))
    OR (NEW.from_status='ordered' AND NEW.to_status IN ('partially_received', 'received', 'cancelled'))
    OR (NEW.from_status='partially_received' AND NEW.to_status IN ('received', 'cancelled'))
  );

  SELECT RAISE(ABORT, 'Commitment transition evidence is incomplete')
  WHERE NEW.to_status IN ('ordered', 'partially_received', 'received', 'cancelled')
    AND (
      NEW.purchase_order_id IS NULL
      OR NEW.company_id IS NULL
      OR NEW.spend_expense_request_id IS NULL
      OR NEW.from_status IS NULL
      OR NEW.actor_employee_id IS NULL
      OR NEW.session_id IS NULL
      OR length(trim(COALESCE(NEW.request_id, ''))) = 0
      OR length(trim(COALESCE(NEW.source_reference, ''))) = 0
      OR length(trim(COALESCE(NEW.idempotency_key, ''))) = 0
      OR NEW.amount_kobo <= 0
      OR NEW.server_received_at IS NULL
      OR length(trim(COALESCE(NEW.server_received_at, ''))) = 0
    );

  SELECT RAISE(ABORT, 'Purchase Order transition does not match canonical source')
  WHERE NEW.to_status IN ('ordered', 'partially_received', 'received', 'cancelled')
    AND NOT EXISTS (
      SELECT 1
      FROM purchase_orders po
      WHERE po.id=NEW.purchase_order_id
        AND po.company_id=NEW.company_id
        AND po.spend_expense_request_id=NEW.spend_expense_request_id
        AND po.status=NEW.from_status
        AND po.total_kobo=NEW.amount_kobo
        AND po.po_no=NEW.source_reference
    );
END;

-- A Spend-linked PO status cannot change unless the same transaction points
-- to a complete, append-only event whose from/to edge matches the mutation.
CREATE TRIGGER IF NOT EXISTS purchase_orders_spend_status_requires_event
BEFORE UPDATE OF status ON purchase_orders
WHEN OLD.status <> NEW.status
  AND NEW.spend_expense_request_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Spend-linked Purchase Order status requires an audited event')
  WHERE NEW.last_status_event_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM purchase_order_status_events e
      WHERE e.id=NEW.last_status_event_id
        AND e.purchase_order_id=NEW.id
        AND e.company_id=NEW.company_id
        AND e.spend_expense_request_id=NEW.spend_expense_request_id
        AND e.from_status=OLD.status
        AND e.to_status=NEW.status
        AND e.amount_kobo=NEW.total_kobo
        AND e.source_reference=(SELECT po.po_no FROM purchase_orders po WHERE po.id=NEW.id)
        AND e.actor_employee_id IS NOT NULL
        AND e.session_id IS NOT NULL
        AND length(trim(COALESCE(e.request_id, ''))) > 0
        AND length(trim(COALESCE(e.source_reference, ''))) > 0
        AND length(trim(COALESCE(e.idempotency_key, ''))) > 0
        AND e.server_received_at IS NOT NULL
        AND length(trim(COALESCE(e.server_received_at, ''))) > 0
    );
END;

-- Rebuild the semantic read model so historical sparse events remain visible
-- as exceptions but can never establish verified committed spend.
DROP VIEW IF EXISTS spend_request_truth;
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
        AND e.from_status='approved'
        AND e.to_status='ordered'
        AND e.source_reference=po.po_no
        AND length(trim(COALESCE(e.request_id, ''))) > 0
        AND length(trim(COALESCE(e.source_reference, ''))) > 0
        AND length(trim(COALESCE(e.idempotency_key, ''))) > 0
        AND e.actor_employee_id IS NOT NULL
        AND e.session_id IS NOT NULL
        AND e.server_received_at IS NOT NULL
        AND length(trim(COALESCE(e.server_received_at, ''))) > 0
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
        AND e.from_status IN ('ordered', 'partially_received')
        AND e.to_status='received'
        AND e.source_reference=po.po_no
        AND length(trim(COALESCE(e.request_id, ''))) > 0
        AND length(trim(COALESCE(e.source_reference, ''))) > 0
        AND length(trim(COALESCE(e.idempotency_key, ''))) > 0
        AND e.actor_employee_id IS NOT NULL
        AND e.session_id IS NOT NULL
        AND e.server_received_at IS NOT NULL
        AND length(trim(COALESCE(e.server_received_at, ''))) > 0
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
        AND e.from_status IN ('ordered', 'partially_received')
        AND e.to_status='cancelled'
        AND e.source_reference=po.po_no
        AND length(trim(COALESCE(e.request_id, ''))) > 0
        AND length(trim(COALESCE(e.source_reference, ''))) > 0
        AND length(trim(COALESCE(e.idempotency_key, ''))) > 0
        AND e.actor_employee_id IS NOT NULL
        AND e.session_id IS NOT NULL
        AND e.server_received_at IS NOT NULL
        AND length(trim(COALESCE(e.server_received_at, ''))) > 0
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
      AND po.commitment_event_id IS NOT NULL
      AND po.release_event_id IS NOT NULL THEN 'verified'
    WHEN po.purchase_order_status='received' THEN 'missing_evidence'
    WHEN po.purchase_order_status='cancelled'
      AND po.commitment_event_id IS NOT NULL
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
FROM event_evidence po
WHERE po.purchase_order_status <> 'cancelled'
   OR po.commitment_event_id IS NOT NULL;

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
