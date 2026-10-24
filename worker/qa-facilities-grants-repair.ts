
/**
 * Explicit staging-only reconciliation for the three canonical QA Facilities
 * grants. The guarded seeder uses the same deterministic IDs; this repairs
 * historical synthetic identities that were provisioned before Facilities.
 * Never automatically invoked by GET, deployment or a scheduled task.
 */
const ns='qa-staging-v1';
const roleNames=['owner','manager','employee'] as const;
const levels=['manage','edit','view'] as const;
const roleIds=roleNames.map(name=>ns+'-role-'+name);
const grantIds=roleNames.map(name=>ns+'-grant-'+name+'-facilities.access');

const identityCheck=[
  'SELECT CASE WHEN (',
  "(SELECT COUNT(*) FROM companies WHERE (id='qa-staging-v1-company-a' AND code='QA-STAGING-A' AND business_type='qa' AND active=1) OR (id='qa-staging-v1-company-b' AND code='QA-STAGING-B' AND business_type='qa' AND active=1))=2",
  "AND (SELECT COUNT(*) FROM company_locations WHERE (id='qa-staging-v1-site-a' AND company_id='qa-staging-v1-company-a' AND active=1) OR (id='qa-staging-v1-site-b' AND company_id='qa-staging-v1-company-b' AND active=1))=2",
  "AND (SELECT COUNT(*) FROM employees WHERE id IN ('qa-staging-v1-owner','qa-staging-v1-manager','qa-staging-v1-employee') AND department='qa-staging-v1' AND employment_status='active' AND email IS NULL AND phone IS NULL AND whatsapp IS NULL)=3",
  "AND (SELECT COUNT(*) FROM roles WHERE is_system=0 AND active=1 AND ((id='qa-staging-v1-role-owner' AND code='owner' AND company_id IS NULL) OR (id='qa-staging-v1-role-manager' AND code='manager' AND company_id='qa-staging-v1-company-a') OR (id='qa-staging-v1-role-employee' AND code='employee' AND company_id='qa-staging-v1-company-b')))=3",
  "AND (SELECT COUNT(*) FROM employee_company_memberships WHERE active=1 AND ((id='qa-staging-v1-membership-owner-a' AND employee_id='qa-staging-v1-owner' AND company_id='qa-staging-v1-company-a') OR (id='qa-staging-v1-membership-owner-b' AND employee_id='qa-staging-v1-owner' AND company_id='qa-staging-v1-company-b') OR (id='qa-staging-v1-membership-manager-a' AND employee_id='qa-staging-v1-manager' AND company_id='qa-staging-v1-company-a') OR (id='qa-staging-v1-membership-employee-b' AND employee_id='qa-staging-v1-employee' AND company_id='qa-staging-v1-company-b')))=4",
  "AND (SELECT COUNT(*) FROM employee_roles WHERE (id='qa-staging-v1-assignment-owner-a' AND employee_id='qa-staging-v1-owner' AND company_id='qa-staging-v1-company-a' AND role_id='qa-staging-v1-role-owner') OR (id='qa-staging-v1-assignment-owner-b' AND employee_id='qa-staging-v1-owner' AND company_id='qa-staging-v1-company-b' AND role_id='qa-staging-v1-role-owner') OR (id='qa-staging-v1-assignment-manager-a' AND employee_id='qa-staging-v1-manager' AND company_id='qa-staging-v1-company-a' AND role_id='qa-staging-v1-role-manager') OR (id='qa-staging-v1-assignment-employee-b' AND employee_id='qa-staging-v1-employee' AND company_id='qa-staging-v1-company-b' AND role_id='qa-staging-v1-role-employee'))=4",
  "AND (SELECT COUNT(*) FROM employee_credentials WHERE (employee_id='qa-staging-v1-owner' AND username='qa-staging-v1-owner') OR (employee_id='qa-staging-v1-manager' AND username='qa-staging-v1-manager') OR (employee_id='qa-staging-v1-employee' AND username='qa-staging-v1-employee'))=3",
  "AND (SELECT COUNT(*) FROM permissions WHERE code='facilities.access')=1",
  "AND NOT EXISTS (SELECT 1 FROM employee_company_memberships WHERE company_id IN ('qa-staging-v1-company-a','qa-staging-v1-company-b') AND employee_id NOT IN ('qa-staging-v1-owner','qa-staging-v1-manager','qa-staging-v1-employee'))",
  "AND NOT EXISTS (SELECT 1 FROM employee_company_memberships WHERE employee_id IN ('qa-staging-v1-owner','qa-staging-v1-manager','qa-staging-v1-employee') AND company_id NOT IN ('qa-staging-v1-company-a','qa-staging-v1-company-b'))",
  "AND NOT EXISTS (SELECT 1 FROM employee_roles WHERE role_id IN ('qa-staging-v1-role-owner','qa-staging-v1-role-manager','qa-staging-v1-role-employee') AND employee_id NOT IN ('qa-staging-v1-owner','qa-staging-v1-manager','qa-staging-v1-employee'))",
  "AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE id IN ('qa-staging-v1-grant-owner-facilities.access','qa-staging-v1-grant-manager-facilities.access','qa-staging-v1-grant-employee-facilities.access') AND NOT ((id='qa-staging-v1-grant-owner-facilities.access' AND role_id='qa-staging-v1-role-owner' AND access_level='manage' AND permission_id=(SELECT id FROM permissions WHERE code='facilities.access')) OR (id='qa-staging-v1-grant-manager-facilities.access' AND role_id='qa-staging-v1-role-manager' AND access_level='edit' AND permission_id=(SELECT id FROM permissions WHERE code='facilities.access')) OR (id='qa-staging-v1-grant-employee-facilities.access' AND role_id='qa-staging-v1-role-employee' AND access_level='view' AND permission_id=(SELECT id FROM permissions WHERE code='facilities.access'))))",
  ") THEN 1 ELSE json('QA fixture integrity failed') END"
].join(' ');

const grantsCheck=[
  'SELECT CASE WHEN (SELECT COUNT(*) FROM role_permissions WHERE',
  "(id='qa-staging-v1-grant-owner-facilities.access' AND role_id='qa-staging-v1-role-owner' AND permission_id=(SELECT id FROM permissions WHERE code='facilities.access') AND access_level='manage')",
  "OR (id='qa-staging-v1-grant-manager-facilities.access' AND role_id='qa-staging-v1-role-manager' AND permission_id=(SELECT id FROM permissions WHERE code='facilities.access') AND access_level='edit')",
  "OR (id='qa-staging-v1-grant-employee-facilities.access' AND role_id='qa-staging-v1-role-employee' AND permission_id=(SELECT id FROM permissions WHERE code='facilities.access') AND access_level='view')",
  ")=3 THEN 1 ELSE json('QA Facilities grants invalid') END"
].join(' ');

export async function reconcileExistingQaFacilitiesGrants(db:D1Database,actorEmployeeId:string){
  if(actorEmployeeId!=='employee-owner-bootstrap')throw new Error('QA repair owner unavailable');
  const statements:D1PreparedStatement[]=[db.prepare(identityCheck)];
  for(let i=0;i<roleIds.length;i++){
    statements.push(db.prepare(
      'INSERT INTO role_permissions(id,role_id,permission_id,access_level,granted_by) '+
      'SELECT ?,?,id,?,? FROM permissions WHERE code=? '+
      'ON CONFLICT(role_id,permission_id) DO NOTHING'
    ).bind(grantIds[i],roleIds[i],levels[i],actorEmployeeId,'facilities.access'));
  }
  statements.push(db.prepare(grantsCheck));
  // The immutable record is deterministic. Replays create no duplicate audit.
  statements.push(db.prepare(
    'INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,reason,source) '+
    'VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING'
  ).bind('qa-staging-v1-facilities-grants-reconcile',actorEmployeeId,'qa-staging-v1-company-a',
    'qa-fixture-access','qa_facilities_grants_reconciled','qa_role','qa-staging-v1',
    'Synthetic staging QA permission reconciliation.','web'));
  statements.push(db.prepare(
    "SELECT CASE WHEN EXISTS(SELECT 1 FROM audit_logs "+
    "WHERE id='qa-staging-v1-facilities-grants-reconcile' "+
    "AND module='qa-fixture-access' AND action='qa_facilities_grants_reconciled' "+
    "AND actor_employee_id='employee-owner-bootstrap' AND entity_id='qa-staging-v1') "+
    "THEN 1 ELSE json('QA access evidence missing') END"
  ));
  // Atomic D1 batch: missing anchors, conflicting grants, or failed postconditions
  // abort every write. No other tenant, password or session is modified.
  await db.batch(statements);
  return {ok:true,scope:ns,facilitiesGrants:3};
}
