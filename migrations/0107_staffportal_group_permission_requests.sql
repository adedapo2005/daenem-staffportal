-- DAENEM StaffPortal: separate REVIEW-ONLY proposal workflow draft.
-- Apply ONLY after the unnumbered Group grant schema in isolated local D1 QA.
-- Not numbered, not approved, not for automatic remote deployment.
-- Creates NO issuer, reviewer, beneficiary or default permission assignments.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS employee_group_permission_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
  access_level TEXT NOT NULL CHECK(access_level IN ('view','create','edit','approve','manage')),
  reason TEXT NOT NULL CHECK(length(trim(reason))>=10),
  expires_at TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_note TEXT,
  grant_id TEXT REFERENCES employee_group_permission_grants(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(employee_id<>requested_by),
  CHECK(reviewed_by IS NULL OR (reviewed_by<>employee_id AND reviewed_by<>requested_by)),
  CHECK(
    (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND grant_id IS NULL)
    OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND grant_id IS NOT NULL)
    OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND grant_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_requests_one_pending
  ON employee_group_permission_requests(employee_id,permission_id)
  WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_group_requests_pending_created
  ON employee_group_permission_requests(status,created_at);
CREATE INDEX IF NOT EXISTS idx_group_requests_issuer
  ON employee_group_permission_requests(requested_by,created_at);

CREATE TRIGGER IF NOT EXISTS trg_group_requests_create_only_pending
BEFORE INSERT ON employee_group_permission_requests
BEGIN
 SELECT RAISE(ABORT,'Group requests must begin pending')
 WHERE NEW.status<>'pending' OR NEW.reviewed_by IS NOT NULL
   OR NEW.reviewed_at IS NOT NULL OR NEW.grant_id IS NOT NULL OR NEW.review_note IS NOT NULL;
 SELECT RAISE(ABORT,'Group request must use a registered sensitive independent Group permission')
 WHERE COALESCE((SELECT sensitive FROM permissions WHERE id=NEW.permission_id),0)<>1
   OR COALESCE((SELECT code FROM permissions WHERE id=NEW.permission_id),'') NOT IN (
     'forms.group.admin','forms.group.receive','expense.group.report',
     'expense.group.policy','expense.group.master','expense.group.allocations',
     'access_control.group.grant'
   );
 -- Receiving assigned Group forms is never Group administration.
 SELECT RAISE(ABORT,'Group receive may only be granted view-level access')
 WHERE COALESCE((SELECT code FROM permissions WHERE id=NEW.permission_id),'')='forms.group.receive'
   AND NEW.access_level<>'view';
 SELECT RAISE(ABORT,'Group request issuer must be active')
 WHERE COALESCE((SELECT employment_status FROM employees WHERE id=NEW.requested_by),'')
   NOT IN ('active','provisional');
 SELECT RAISE(ABORT,'Group request beneficiary must be active')
 WHERE COALESCE((SELECT employment_status FROM employees WHERE id=NEW.employee_id),'')
   NOT IN ('active','provisional');
 SELECT RAISE(ABORT,'Group request must expire in the future')
 WHERE datetime(NEW.expires_at) IS NULL OR datetime(NEW.expires_at)<=datetime('now');
END;

CREATE TRIGGER IF NOT EXISTS trg_group_requests_review_transition_only
BEFORE UPDATE ON employee_group_permission_requests
BEGIN
 SELECT RAISE(ABORT,'Pending Group requests can only be reviewed once')
 WHERE OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected');
 SELECT RAISE(ABORT,'Group request immutable fields were changed')
 WHERE NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id
   OR NEW.permission_id<>OLD.permission_id OR NEW.access_level<>OLD.access_level
   OR NEW.reason<>OLD.reason OR NEW.expires_at<>OLD.expires_at
   OR NEW.requested_by<>OLD.requested_by OR NEW.created_at<>OLD.created_at;
 SELECT RAISE(ABORT,'Group request reviewer must be independently active')
 WHERE COALESCE((SELECT employment_status FROM employees WHERE id=NEW.reviewed_by),'')
   NOT IN ('active','provisional');
 SELECT RAISE(ABORT,'Group request reviewer cannot be issuer or beneficiary')
 WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.requested_by
   OR NEW.reviewed_by=OLD.employee_id OR NEW.reviewed_at IS NULL;
 SELECT RAISE(ABORT,'Group request cannot approve expired grant')
 WHERE NEW.status='approved' AND datetime(OLD.expires_at)<=datetime('now');
 SELECT RAISE(ABORT,'Group request approval must reference matching, active issued Group grant')
 WHERE NEW.status='approved' AND NOT EXISTS (
   SELECT 1 FROM employee_group_permission_grants g
   WHERE g.id=NEW.grant_id AND g.active=1 AND g.revoked_at IS NULL
    AND g.employee_id=OLD.employee_id AND g.permission_id=OLD.permission_id
    AND g.access_level=OLD.access_level AND g.granted_by=OLD.requested_by
    AND g.reviewed_by=NEW.reviewed_by AND g.reason=OLD.reason
    AND g.expires_at=OLD.expires_at
 );
 SELECT RAISE(ABORT,'Group request rejection requires a review reason and no grant')
 WHERE NEW.status='rejected'
   AND (NEW.grant_id IS NOT NULL OR length(trim(COALESCE(NEW.review_note,'')))<10);
END;

CREATE TRIGGER IF NOT EXISTS trg_group_requests_no_delete
BEFORE DELETE ON employee_group_permission_requests
BEGIN
 SELECT RAISE(ABORT,'Group requests are audited and cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_group_requests_created_audit
AFTER INSERT ON employee_group_permission_requests
BEGIN
 INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,
                        before_json,after_json,reason,source,request_id)
 VALUES('group-request-'||NEW.id||'-'||lower(hex(randomblob(8))),
        NEW.requested_by,NULL,'access_control','group_permission_requested',
        'employee_group_permission_request',NEW.id,NULL,
        json_object('employeeId',NEW.employee_id,'permissionId',NEW.permission_id,
                    'level',NEW.access_level,'status','pending','expiresAt',NEW.expires_at),
        NEW.reason,'group_request_trigger',NULL);
END;

CREATE TRIGGER IF NOT EXISTS trg_group_requests_reviewed_audit
AFTER UPDATE ON employee_group_permission_requests
BEGIN
 INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,
                        before_json,after_json,reason,source,request_id)
 VALUES('group-request-reviewed-'||NEW.id||'-'||lower(hex(randomblob(8))),
        NEW.reviewed_by,NULL,'access_control','group_permission_request_reviewed',
        'employee_group_permission_request',NEW.id,
        json_object('status',OLD.status),
        json_object('employeeId',NEW.employee_id,'permissionId',NEW.permission_id,
                    'level',NEW.access_level,'status',NEW.status,'grantId',NEW.grant_id),
        COALESCE(NEW.review_note,NEW.reason),'group_request_trigger',NULL);
END;