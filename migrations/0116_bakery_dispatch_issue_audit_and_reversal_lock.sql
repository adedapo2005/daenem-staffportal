PRAGMA foreign_keys=ON;

-- Financial custody must retain the identity of the person who issued bread.
-- Historical issued dispatches remain unchanged; new draft-to-issued
-- transitions require an actor and an audit in the same SQLite transaction.
ALTER TABLE bakery_dispatches
 ADD COLUMN issued_by TEXT REFERENCES employees(id) ON DELETE RESTRICT;

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_issue_require_actor
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND OLD.status='draft' AND NEW.status='in_transit'
BEGIN
 SELECT RAISE(ABORT,'Bakery issue requires a named employee and issue timestamp')
 WHERE NEW.issued_by IS NULL OR length(trim(NEW.issued_by))=0
    OR NEW.dispatched_at IS NULL OR length(trim(NEW.dispatched_at))=0;

 SELECT RAISE(ABORT,'Bakery issue actor does not exist')
 WHERE NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.issued_by);
END;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bakery_database_dispatch_issue_audit
ON audit_logs(company_id,entity_id)
WHERE module='bakery' AND action='issue_dispatch'
 AND entity_type='bakery_dispatch' AND source='database';

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_issue_write_audit
AFTER UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND OLD.status='draft' AND NEW.status='in_transit'
BEGIN
 INSERT INTO audit_logs(
  id,actor_employee_id,company_id,module,action,entity_type,entity_id,
  before_json,after_json,source
 ) VALUES(
  'bakery-dispatch-issue-'||NEW.id,NEW.issued_by,NEW.company_id,
  'bakery','issue_dispatch','bakery_dispatch',NEW.id,
  json_object('status',OLD.status),
  json_object(
   'status',NEW.status,'issuedBy',NEW.issued_by,
   'dispatchedAt',NEW.dispatched_at,'guardedAtCommit',1,
   'auditOrigin','database_trigger'
  ),
  'database'
 );
END;

-- Once issued, returning to draft would reopen immutable item and stock
-- records. Cancelling after a real stock debit also needs a governed
-- compensating financial/stock procedure, not a bare status change.
CREATE TRIGGER IF NOT EXISTS bakery_issued_no_unaudited_rollback
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND OLD.status IN ('in_transit','received','reconciling')
 AND NEW.status IN ('draft','cancelled')
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery dispatch requires governed reversal; status cannot return to draft or cancel');
END;

CREATE TRIGGER IF NOT EXISTS bakery_issued_actor_immutable
BEFORE UPDATE OF issued_by ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND OLD.status<>'draft' AND NEW.issued_by IS NOT OLD.issued_by
BEGIN
 SELECT RAISE(ABORT,'Bakery dispatch issuing employee is immutable');
END;

CREATE TRIGGER IF NOT EXISTS bakery_database_issue_audit_no_update
BEFORE UPDATE ON audit_logs
WHEN OLD.module='bakery' AND OLD.action='issue_dispatch'
 AND OLD.entity_type='bakery_dispatch' AND OLD.source='database'
BEGIN
 SELECT RAISE(ABORT,'Bakery database issuance audit is immutable');
END;

CREATE TRIGGER IF NOT EXISTS bakery_database_issue_audit_no_delete
BEFORE DELETE ON audit_logs
WHEN OLD.module='bakery' AND OLD.action='issue_dispatch'
 AND OLD.entity_type='bakery_dispatch' AND OLD.source='database'
BEGIN
 SELECT RAISE(ABORT,'Bakery database issuance audit cannot be deleted');
END;
