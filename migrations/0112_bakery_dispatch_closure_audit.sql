PRAGMA foreign_keys=ON;

-- Database-owned closure evidence. A direct SQL UPDATE must produce the same
-- immutable, actor-attributed audit evidence as the approved Bakery API.
-- The AFTER trigger and status update are one SQLite/D1 transaction:
-- failure to record the audit rolls back the closure. No legacy records change.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_close_require_audit_actor
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND NEW.status='closed' AND OLD.status<>'closed'
BEGIN
 SELECT RAISE(ABORT,'Bakery closure requires a named actor and closure timestamp')
 WHERE NEW.closed_by IS NULL OR length(trim(NEW.closed_by))=0
    OR NEW.closed_at IS NULL OR length(trim(NEW.closed_at))=0;
 SELECT RAISE(ABORT,'Bakery closure actor does not exist')
 WHERE NOT EXISTS(SELECT 1 FROM employees e WHERE e.id=NEW.closed_by);
 SELECT RAISE(ABORT,'Bakery closure company cannot change')
 WHERE NEW.company_id<>OLD.company_id;
END;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bakery_database_dispatch_close_audit
ON audit_logs(company_id,entity_id)
WHERE module='bakery' AND action='close_reconciliation'
  AND entity_type='bakery_dispatch' AND source='database';

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_close_write_audit
AFTER UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND NEW.status='closed' AND OLD.status<>'closed'
BEGIN
 INSERT INTO audit_logs(
  id,actor_employee_id,company_id,module,action,entity_type,entity_id,
  before_json,after_json,source
 ) VALUES(
  'bakery-dispatch-closure-'||NEW.id,NEW.closed_by,NEW.company_id,
  'bakery','close_reconciliation','bakery_dispatch',NEW.id,
  json_object('status',OLD.status),
  json_object('status',NEW.status,'closedAt',NEW.closed_at,
    'guardedAtCommit',1,'auditOrigin','database_trigger'),
  'database'
 );
END;

-- Financial closure audits created by D1 cannot later be silently edited or
-- deleted through an alternative SQL writer. A correction needs a new event.
CREATE TRIGGER IF NOT EXISTS bakery_database_close_audit_no_update
BEFORE UPDATE ON audit_logs
WHEN OLD.module='bakery' AND OLD.action='close_reconciliation'
 AND OLD.entity_type='bakery_dispatch' AND OLD.source='database'
BEGIN
 SELECT RAISE(ABORT,'Bakery database closure audit is immutable');
END;

CREATE TRIGGER IF NOT EXISTS bakery_database_close_audit_no_delete
BEFORE DELETE ON audit_logs
WHEN OLD.module='bakery' AND OLD.action='close_reconciliation'
 AND OLD.entity_type='bakery_dispatch' AND OLD.source='database'
BEGIN
 SELECT RAISE(ABORT,'Bakery database closure audit cannot be deleted');
END;
