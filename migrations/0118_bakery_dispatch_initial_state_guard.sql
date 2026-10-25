PRAGMA foreign_keys=ON;

-- Protect the START of the Bakery financial lifecycle, not just transitions.
-- Without this rule, inserting an already-closed row can bypass D1 issue,
-- stock and closure-audit triggers, all of which govern UPDATE of status.
-- No historical Bakery records are modified.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_must_start_draft
BEFORE INSERT ON bakery_dispatches
WHEN NEW.company_id='company-bakery'
BEGIN
 SELECT RAISE(ABORT,'Bakery dispatch must start in draft for atomic issue and audit')
 WHERE NEW.status IS NULL OR NEW.status<>'draft';

 SELECT RAISE(ABORT,'New Bakery draft cannot claim issuance, receipt or closure')
 WHERE NEW.dispatched_at IS NOT NULL OR NEW.received_at IS NOT NULL
    OR NEW.closed_at IS NOT NULL OR NEW.closed_by IS NOT NULL
    OR NEW.issued_by IS NOT NULL;
END;
