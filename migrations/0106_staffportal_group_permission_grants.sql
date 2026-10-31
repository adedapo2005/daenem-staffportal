-- DAENEM StaffPortal; REVIEW-ONLY, UNNUMBERED Group-grant schema.
-- Never apply as an active migration without exclusive Backend A approval,
-- controlled owner bootstrap, D1 migration sequencing and integration QA.
-- Applying this creates NO Group grants and confers NO privileges.
PRAGMA foreign_keys=ON;
INSERT INTO permissions(id,code,module,action,description,sensitive) VALUES
('permission-group-forms-admin','forms.group.admin','forms','group_admin','Manage Group forms and reviews',1),
('permission-group-forms-receive','forms.group.receive','forms','group_receive','Receive assigned Group forms',1),
('permission-group-spend-report','expense.group.report','spend','group_report','Read Group financial reports',1),
('permission-group-spend-policy','expense.group.policy','spend','group_policy','Manage Group approval and evidence policy',1),
('permission-group-spend-master','expense.group.master','spend','group_master','Manage Group Spend master records',1),
('permission-group-spend-allocations','expense.group.allocations','spend','group_allocations','Manage cross-company allocations',1),
('permission-group-access-grant','access_control.group.grant','access_control','group_grant','Issue and revoke Group access',1)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS employee_group_permission_grants(
 id TEXT PRIMARY KEY,
 employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
 access_level TEXT NOT NULL CHECK(access_level IN ('view','create','edit','approve','manage')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 granted_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 reviewed_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
 reviewed_at TEXT,
 reason TEXT NOT NULL CHECK(length(trim(reason))>=5),
 expires_at TEXT,
 revoked_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
 revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(employee_id<>granted_by),
 CHECK(reviewed_by IS NULL OR (reviewed_by<>granted_by AND reviewed_by<>employee_id)),
 CHECK((reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK((active=1 AND revoked_by IS NULL AND revoked_at IS NULL)
    OR (active=0 AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_grants_one_active
 ON employee_group_permission_grants(employee_id,permission_id) WHERE active=1;
CREATE INDEX IF NOT EXISTS idx_group_grants_employee
 ON employee_group_permission_grants(employee_id,active,expires_at);

CREATE TRIGGER IF NOT EXISTS trg_group_grants_validate_create
BEFORE INSERT ON employee_group_permission_grants
BEGIN
 SELECT RAISE(ABORT,'Unknown independent Group permission')
  WHERE COALESCE((SELECT code FROM permissions WHERE id=NEW.permission_id),'') NOT IN (
   'forms.group.admin','forms.group.receive','expense.group.report',
   'expense.group.policy','expense.group.master','expense.group.allocations',
   'access_control.group.grant','staffportal.media.publish');
 -- Recipient-only rights are sensitive too; no unaudited direct issuance.
 SELECT RAISE(ABORT,'Independent reviewer required for every Group access grant')
  WHERE NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL;
 SELECT RAISE(ABORT,'Group forms receiving is a view-only entitlement')
  WHERE (SELECT code FROM permissions WHERE id=NEW.permission_id)='forms.group.receive'
    AND NEW.access_level<>'view';
 SELECT RAISE(ABORT,'Grant issuer must be an active employee')
  WHERE COALESCE((SELECT employment_status FROM employees WHERE id=NEW.granted_by),'')
   NOT IN ('active','provisional');
 SELECT RAISE(ABORT,'Reviewer must be an active employee')
  WHERE NEW.reviewed_by IS NOT NULL
   AND COALESCE((SELECT employment_status FROM employees WHERE id=NEW.reviewed_by),'')
   NOT IN ('active','provisional');
 SELECT RAISE(ABORT,'Beneficiary must be an active employee')
  WHERE COALESCE((SELECT employment_status FROM employees WHERE id=NEW.employee_id),'')
   NOT IN ('active','provisional');
 SELECT RAISE(ABORT,'New grants must begin active and unrevoked')
  WHERE NEW.active<>1 OR NEW.revoked_by IS NOT NULL OR NEW.revoked_at IS NOT NULL;
END;
CREATE TRIGGER IF NOT EXISTS trg_group_grants_revoke_only
BEFORE UPDATE ON employee_group_permission_grants
BEGIN
 SELECT RAISE(ABORT,'Only explicit revocation is permitted for an issued Group grant')
 WHERE OLD.active<>1 OR NEW.active<>0
  OR NEW.revoked_by IS NULL OR NEW.revoked_at IS NULL OR NEW.revoked_by=OLD.employee_id
  OR NEW.id<>OLD.id OR NEW.employee_id<>OLD.employee_id
  OR NEW.permission_id<>OLD.permission_id OR NEW.access_level<>OLD.access_level
  OR NEW.granted_by<>OLD.granted_by OR NEW.reviewed_by IS NOT OLD.reviewed_by
  OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.reason<>OLD.reason
  OR NEW.expires_at IS NOT OLD.expires_at OR NEW.created_at<>OLD.created_at;
END;
CREATE TRIGGER IF NOT EXISTS trg_group_grants_no_delete
BEFORE DELETE ON employee_group_permission_grants
BEGIN
 SELECT RAISE(ABORT,'Revoke Group grants; do not delete them');
END;
CREATE TRIGGER IF NOT EXISTS trg_group_grants_create_audit
AFTER INSERT ON employee_group_permission_grants
BEGIN
 INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,
                        before_json,after_json,reason,source,request_id)
 VALUES('group-grant-created-'||NEW.id||'-'||lower(hex(randomblob(8))),
        NEW.granted_by,NULL,'access_control','group_permission_granted',
        'employee_group_permission_grant',NEW.id,NULL,
        json_object('employeeId',NEW.employee_id,'permissionId',NEW.permission_id,
                    'level',NEW.access_level,'reviewedBy',NEW.reviewed_by,
                    'expiresAt',NEW.expires_at,'active',1),
        NEW.reason,'group_grant_trigger',NULL);
END;
CREATE TRIGGER IF NOT EXISTS trg_group_grants_revoke_audit
AFTER UPDATE ON employee_group_permission_grants
BEGIN
 INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,
                        before_json,after_json,reason,source,request_id)
 VALUES('group-grant-revoked-'||NEW.id||'-'||lower(hex(randomblob(8))),
        NEW.revoked_by,NULL,'access_control','group_permission_revoked',
        'employee_group_permission_grant',NEW.id,
        json_object('employeeId',OLD.employee_id,'permissionId',OLD.permission_id,
                    'level',OLD.access_level,'active',OLD.active),
        json_object('employeeId',NEW.employee_id,'permissionId',NEW.permission_id,
                    'level',NEW.access_level,'active',NEW.active,'revokedBy',NEW.revoked_by,
                    'revokedAt',NEW.revoked_at),
        COALESCE((
          SELECT requested.reason FROM audit_logs requested
          WHERE requested.action='group_permission_revoke_requested'
            AND requested.entity_type='employee_group_permission_grant'
            AND requested.entity_id=NEW.id
            AND requested.actor_employee_id=NEW.revoked_by
            AND requested.source='group_grant_route'
          ORDER BY requested.rowid DESC LIMIT 1
        ),NEW.reason),'group_grant_trigger',NULL);
END;
