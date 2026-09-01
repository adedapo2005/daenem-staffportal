import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import type { EnhancedSessionContext } from './auth-context-v2';

interface Env extends AuthEnv {}
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const uid=(p:string)=>`${p}-${crypto.randomUUID()}`;
const levels:AccessLevel[]=['none','view','create','edit','approve','manage'];
const isOwner=(c:SessionContext)=>c.roles.some(r=>r.code==='owner');
const canManage=(c:SessionContext,companyId:string)=>isOwner(c)||hasPermission(c,'roles.access','manage',companyId)||hasPermission(c,'users.access','manage',companyId);
const canView=(c:SessionContext,companyId:string)=>canManage(c,companyId)||hasPermission(c,'roles.access','view',companyId)||hasPermission(c,'users.access','view',companyId);
const canManageGeneral=(c:SessionContext,companyId:string)=>isOwner(c)||hasPermission(c,'roles.general','manage',companyId);
const canAssignBusiness=(c:SessionContext,companyId:string)=>isOwner(c)||hasPermission(c,'users.business_assignments','manage',companyId);
function companyAllowed(c:SessionContext,companyId:string){return isOwner(c)||c.companies.some(x=>x.id===companyId)}
function slug(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,50)}
async function audit(env:Env,context:SessionContext,companyId:string|null,targetType:string,targetId:string,permissionId:string|null,oldLevel:AccessLevel|null,newLevel:AccessLevel|null,reason?:string,expiresAt?:string|null){
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO access_control_changes(id,actor_employee_id,company_id,target_type,target_id,permission_id,old_access_level,new_access_level,reason,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uid('access-change'),context.employee.id,companyId,targetType,targetId,permissionId,oldLevel,newLevel,reason||null,expiresAt||null),
  env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source) VALUES(?,?,?,'access_control','permission_change',?,?,?,?,'web')`).bind(uid('audit'),context.employee.id,companyId,targetType,targetId,JSON.stringify({accessLevel:oldLevel}),JSON.stringify({accessLevel:newLevel,permissionId,reason:reason||null,expiresAt:expiresAt||null}))
 ]);
}

async function overview(request:Request,env:Env,context:EnhancedSessionContext){
 const url=new URL(request.url);const companyId=url.searchParams.get('companyId')||context.companies[0]?.id||'';
 if(!companyId||!companyAllowed(context,companyId)||!canView(context,companyId))return json({error:'Role/User administration permission is required for this business.'},403);
 const [company,permissions,roles,rolePermissions,employees,overrides,allCompanies]=await Promise.all([
  env.DB.prepare(`SELECT id,code,name FROM companies WHERE id=? AND active=1`).bind(companyId).first<Record<string,unknown>>(),
  env.DB.prepare(`SELECT id,code,module,action,description,sensitive FROM permissions ORDER BY module,code`).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT id,company_id AS companyId,code,name,description,is_system AS isSystem,active FROM roles WHERE active=1 AND (company_id=? OR company_id IS NULL) ORDER BY is_system DESC,name`).bind(companyId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT rp.role_id AS roleId,rp.permission_id AS permissionId,rp.access_level AS accessLevel FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.active=1 AND (r.company_id=? OR r.company_id IS NULL)`).bind(companyId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT e.id,e.employee_no AS employeeNo,e.display_name AS displayName,e.email,e.phone,e.job_title AS jobTitle,e.department,e.employment_status AS status,GROUP_CONCAT(DISTINCT r.id) AS roleIds,GROUP_CONCAT(DISTINCT r.name) AS roleNames FROM employee_company_memberships m JOIN employees e ON e.id=m.employee_id LEFT JOIN employee_roles er ON er.employee_id=e.id AND er.company_id=m.company_id LEFT JOIN roles r ON r.id=er.role_id WHERE m.company_id=? AND m.active=1 GROUP BY e.id ORDER BY e.display_name`).bind(companyId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT o.id,o.employee_id AS employeeId,o.company_id AS companyId,o.permission_id AS permissionId,o.access_level AS accessLevel,o.reason,o.expires_at AS expiresAt,o.created_at AS createdAt,p.code AS permissionCode FROM employee_permission_overrides_v2 o JOIN permissions p ON p.id=o.permission_id WHERE o.company_id=? AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now')) ORDER BY o.created_at DESC`).bind(companyId).all<Record<string,unknown>>(),
  isOwner(context)?env.DB.prepare(`SELECT id,code,name FROM companies WHERE active=1 ORDER BY name`).all<Record<string,unknown>>():env.DB.prepare(`SELECT c.id,c.code,c.name FROM employee_company_memberships m JOIN companies c ON c.id=m.company_id WHERE m.employee_id=? AND m.active=1 AND c.active=1 ORDER BY c.name`).bind(context.employee.id).all<Record<string,unknown>>()
 ]);
 if(!company)return json({error:'Company not found.'},404);
 return json({company,companies:allCompanies.results||[],permissionLevels:levels,permissions:permissions.results||[],roles:roles.results||[],rolePermissions:rolePermissions.results||[],employees:(employees.results||[]).map(row=>({...row,roleIds:row.roleIds?String(row.roleIds).split(','):[],roleNames:row.roleNames?String(row.roleNames).split(','):[]})),overrides:overrides.results||[],effectivePermissions:context.companyPermissions[companyId]||{},ownerProtected:true,canManageGeneralRoles:canManageGeneral(context,companyId),canManageBusinessAssignments:canAssignBusiness(context,companyId)});
}

async function createRole(request:Request,env:Env,context:SessionContext){
 let body:{companyId?:string;name?:string;code?:string;description?:string;scope?:'company'|'general'};try{body=await request.json()}catch{return json({error:'Invalid role request.'},400)}
 const companyId=String(body.companyId||'');if(!companyId||!companyAllowed(context,companyId))return json({error:'Company access is not assigned.'},403);
 if(!canManage(context,companyId))return json({error:'Manage Roles permission is required for this business.'},403);
 const general=body.scope==='general';if(general&&!canManageGeneral(context,companyId))return json({error:'Manage General Roles permission is required.'},403);
 const name=String(body.name||'').trim(),code=slug(String(body.code||name));if(name.length<2||code.length<2)return json({error:'Role name is required.'},400);
 if(general&&await env.DB.prepare(`SELECT id FROM roles WHERE company_id IS NULL AND code=? AND active=1`).bind(code).first())return json({error:'A General Role with this code already exists.'},409);
 const id=uid('role'),roleCompanyId=general?null:companyId;try{await env.DB.prepare(`INSERT INTO roles(id,company_id,code,name,description,is_system,active) VALUES(?,?,?,?,?,0,1)`).bind(id,roleCompanyId,code,name,body.description||null).run()}catch{return json({error:'A role with this code already exists for the selected scope.'},409)}
 await audit(env,context,companyId,'role',id,null,null,null,`Created ${general?'General':'company'} role ${name}`);return json({ok:true,role:{id,companyId:roleCompanyId,code,name,scope:general?'general':'company'}},201);
}

async function rolePermission(request:Request,env:Env,context:SessionContext){
 let body:{companyId?:string;roleId?:string;permissionId?:string;accessLevel?:AccessLevel;reason?:string};try{body=await request.json()}catch{return json({error:'Invalid permission request.'},400)}
 const companyId=String(body.companyId||''),level=body.accessLevel as AccessLevel;if(!companyId||!body.roleId||!body.permissionId||!levels.includes(level))return json({error:'Company, role, permission and valid access level are required.'},400);if(!companyAllowed(context,companyId))return json({error:'Company access is not assigned.'},403);
 if(!canManage(context,companyId))return json({error:'Manage Roles permission is required for this business.'},403);
 const role=await env.DB.prepare(`SELECT id,code,name,company_id AS companyId,is_system AS isSystem FROM roles WHERE id=? AND active=1 AND (company_id=? OR company_id IS NULL)`).bind(body.roleId,companyId).first<{id:string;code:string;name:string;companyId?:string;isSystem:number}>();if(!role)return json({error:'Role not found for this company.'},404);if(role.code==='owner')return json({error:'Owner / Super Admin permissions are protected and cannot be downgraded.'},403);if(role.isSystem&&role.code==='group_admin'&&!isOwner(context))return json({error:'Only the Owner can change Group Admin permissions.'},403);
 if(!role.companyId&&!canManageGeneral(context,companyId))return json({error:'Manage General Roles permission is required.'},403);
 const permission=await env.DB.prepare(`SELECT id,code FROM permissions WHERE id=?`).bind(body.permissionId).first<{id:string;code:string}>();if(!permission)return json({error:'Permission not found.'},404);
 const current=await env.DB.prepare(`SELECT access_level AS accessLevel FROM role_permissions WHERE role_id=? AND permission_id=?`).bind(role.id,permission.id).first<{accessLevel:AccessLevel}>();
 await env.DB.prepare(`DELETE FROM role_permissions WHERE role_id=? AND permission_id=?`).bind(role.id,permission.id).run();if(level!=='none')await env.DB.prepare(`INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES(?,?,?,?)`).bind(uid('role-permission'),role.id,permission.id,level).run();
 await audit(env,context,companyId,'role',role.id,permission.id,current?.accessLevel||'none',level,body.reason||`Role matrix change: ${permission.code}`);return json({ok:true,roleId:role.id,permissionId:permission.id,accessLevel:level});
}

async function employeeRole(request:Request,env:Env,context:SessionContext){
 let body:{companyId?:string;employeeId?:string;roleId?:string;action?:'assign'|'remove'};try{body=await request.json()}catch{return json({error:'Invalid role assignment.'},400)}
 const companyId=String(body.companyId||'');if(!companyId||!body.employeeId||!body.roleId||!['assign','remove'].includes(String(body.action)))return json({error:'Company, employee, role and action are required.'},400);if(!companyAllowed(context,companyId))return json({error:'Company access is not assigned.'},403);
 if(!canManage(context,companyId))return json({error:'Manage Users permission is required for this business.'},403);
 const employee=await env.DB.prepare(`SELECT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id WHERE e.id=? AND m.company_id=? AND m.active=1`).bind(body.employeeId,companyId).first();const role=await env.DB.prepare(`SELECT id,code FROM roles WHERE id=? AND active=1 AND (company_id=? OR company_id IS NULL)`).bind(body.roleId,companyId).first<{id:string;code:string}>();if(!employee||!role)return json({error:'Employee or role is not valid for the selected company.'},404);if(role.code==='owner'&&!isOwner(context))return json({error:'Only the Owner can assign Owner access.'},403);
 if(body.action==='assign')await env.DB.prepare(`INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id,assigned_by) VALUES(?,?,?,?,?)`).bind(uid('employee-role'),body.employeeId,companyId,role.id,context.employee.id).run();else{if(role.code==='owner'&&body.employeeId===context.employee.id)return json({error:'You cannot remove your own Owner role from this screen.'},403);await env.DB.prepare(`DELETE FROM employee_roles WHERE employee_id=? AND company_id=? AND role_id=?`).bind(body.employeeId,companyId,role.id).run()}
 await audit(env,context,companyId,'employee',body.employeeId,null,null,null,`${body.action} role ${role.id}`);return json({ok:true,action:body.action});
}

async function employeeOverride(request:Request,env:Env,context:SessionContext){
 let body:{companyId?:string;employeeId?:string;permissionId?:string;accessLevel?:AccessLevel;reason?:string;expiresAt?:string|null;clear?:boolean};try{body=await request.json()}catch{return json({error:'Invalid employee override.'},400)}
 const companyId=String(body.companyId||'');if(!companyId||!body.employeeId||!body.permissionId||!companyAllowed(context,companyId))return json({error:'Company, employee and permission are required.'},400);const level=(body.accessLevel||'none')as AccessLevel;if(!levels.includes(level))return json({error:'Invalid access level.'},400);if(!String(body.reason||'').trim())return json({error:'Reason is required for an individual permission override.'},400);
 if(!canManage(context,companyId))return json({error:'Manage Users/Roles permission is required for this business.'},403);
 const employee=await env.DB.prepare(`SELECT e.id,MAX(CASE WHEN r.code='owner' THEN 1 ELSE 0 END) isOwner FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id LEFT JOIN employee_roles er ON er.employee_id=e.id AND er.company_id=m.company_id LEFT JOIN roles r ON r.id=er.role_id WHERE e.id=? AND m.company_id=? AND m.active=1 GROUP BY e.id`).bind(body.employeeId,companyId).first<{id:string;isOwner:number}>();const permission=await env.DB.prepare(`SELECT id,code FROM permissions WHERE id=?`).bind(body.permissionId).first<{id:string;code:string}>();if(!employee||!permission)return json({error:'Employee or permission was not found.'},404);if(employee.isOwner)return json({error:'Owner / Super Admin permissions are protected.'},403);
 const current=await env.DB.prepare(`SELECT access_level AS accessLevel FROM employee_permission_overrides_v2 WHERE employee_id=? AND company_id=? AND permission_id=?`).bind(body.employeeId,companyId,permission.id).first<{accessLevel:AccessLevel}>();
 await env.DB.batch([env.DB.prepare(`DELETE FROM employee_permission_overrides_v2 WHERE employee_id=? AND company_id=? AND permission_id=?`).bind(body.employeeId,companyId,permission.id),env.DB.prepare(`DELETE FROM employee_permission_overrides WHERE employee_id=? AND company_id=? AND permission_id=?`).bind(body.employeeId,companyId,permission.id)]);
 const clear=Boolean(body.clear);if(!clear)await env.DB.batch([env.DB.prepare(`INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level,reason,assigned_by,expires_at) VALUES(?,?,?,?,?,?,?,?)`).bind(uid('permission-override'),body.employeeId,companyId,permission.id,level,body.reason,context.employee.id,body.expiresAt||null),env.DB.prepare(`INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level,reason,granted_by,expires_at) VALUES(?,?,?,?,?,?,?,?)`).bind(uid('permission-compat'),body.employeeId,companyId,permission.id,level,body.reason,context.employee.id,body.expiresAt||null)]);
 await audit(env,context,companyId,'employee',body.employeeId,permission.id,current?.accessLevel||null,clear?null:level,body.reason,body.expiresAt||null);return json({ok:true,cleared:clear,accessLevel:clear?null:level});
}

async function history(request:Request,env:Env,context:SessionContext){const companyId=new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'';if(!companyAllowed(context,companyId)||!canView(context,companyId))return json({error:'Role/User administration permission is required for this business.'},403);const rows=await env.DB.prepare(`SELECT a.id,a.created_at AS createdAt,a.target_type AS targetType,a.target_id AS targetId,a.old_access_level AS oldAccessLevel,a.new_access_level AS newAccessLevel,a.reason,a.expires_at AS expiresAt,p.code AS permissionCode,e.display_name AS actorName FROM access_control_changes a LEFT JOIN permissions p ON p.id=a.permission_id JOIN employees e ON e.id=a.actor_employee_id WHERE a.company_id=? ORDER BY a.created_at DESC LIMIT 200`).bind(companyId).all<Record<string,unknown>>();return json({changes:rows.results||[]})}

async function businessAssignments(request:Request,env:Env,context:SessionContext){
 const url=new URL(request.url),employeeId=url.searchParams.get('employeeId')||'',companyId=url.searchParams.get('companyId')||context.companies[0]?.id||'';
 if(!employeeId||!companyId||!canAssignBusiness(context,companyId))return json({error:'Manage Business Assignments permission is required.'},403);
 const target=await env.DB.prepare(`SELECT e.id,e.display_name AS displayName FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id WHERE e.id=? AND m.company_id=? AND m.active=1`).bind(employeeId,companyId).first<Record<string,unknown>>();
 if(!target)return json({error:'Employee is not assigned to the selected business.'},404);
 const companies=isOwner(context)?await env.DB.prepare(`SELECT id,code,name FROM companies WHERE active=1 ORDER BY name`).all<Record<string,unknown>>():await env.DB.prepare(`SELECT c.id,c.code,c.name FROM employee_company_memberships m JOIN companies c ON c.id=m.company_id WHERE m.employee_id=? AND m.active=1 AND c.active=1 ORDER BY c.name`).bind(context.employee.id).all<Record<string,unknown>>();
 const companyRows=companies.results||[],ids=companyRows.map(row=>String(row.id)),placeholders=ids.map(()=>'?').join(',');
 const [assignments,roles]=await Promise.all([
  env.DB.prepare(`SELECT m.company_id AS companyId,m.location_id AS locationId,m.is_primary AS isPrimary,m.active,GROUP_CONCAT(DISTINCT r.name) AS roleNames FROM employee_company_memberships m LEFT JOIN employee_roles er ON er.employee_id=m.employee_id AND er.company_id=m.company_id LEFT JOIN roles r ON r.id=er.role_id WHERE m.employee_id=? GROUP BY m.company_id`).bind(employeeId).all<Record<string,unknown>>(),
  ids.length?env.DB.prepare(`SELECT id,company_id AS companyId,code,name,description FROM roles WHERE active=1 AND (company_id IS NULL OR company_id IN (${placeholders})) ORDER BY name`).bind(...ids).all<Record<string,unknown>>():env.DB.prepare(`SELECT id,company_id AS companyId,code,name,description FROM roles WHERE 1=0`).all<Record<string,unknown>>()
 ]);
 return json({employee:target,companies:companyRows,roles:roles.results||[],assignments:(assignments.results||[]).map(row=>({...row,roleNames:row.roleNames?String(row.roleNames).split(','):[]}))});
}

async function updateBusinessAssignment(request:Request,env:Env,context:SessionContext){
 let body:{companyId?:string;employeeId?:string;targetCompanyId?:string;roleId?:string;action?:'assign'|'remove'|'set_primary';reason?:string};try{body=await request.json()}catch{return json({error:'Invalid business assignment request.'},400)}
 const companyId=String(body.companyId||''),employeeId=String(body.employeeId||''),targetCompanyId=String(body.targetCompanyId||''),action=String(body.action||''),reason=String(body.reason||'').trim();
 if(!companyId||!employeeId||!targetCompanyId||!['assign','remove','set_primary'].includes(action)||reason.length<5)return json({error:'Employee, business, action and a clear reason are required.'},400);
 if(!canAssignBusiness(context,companyId)||!canAssignBusiness(context,targetCompanyId))return json({error:'Manage Business Assignments permission is required for both businesses.'},403);
 const employee=await env.DB.prepare(`SELECT id,display_name AS displayName FROM employees WHERE id=?`).bind(employeeId).first<{id:string;displayName:string}>();if(!employee)return json({error:'Employee not found.'},404);
 if(action==='assign'){
  if(!body.roleId)return json({error:'Choose the employee role for the new business assignment.'},400);
  const role=await env.DB.prepare(`SELECT id,code FROM roles WHERE id=? AND active=1 AND (company_id=? OR company_id IS NULL)`).bind(body.roleId,targetCompanyId).first<{id:string;code:string}>();if(!role)return json({error:'Choose a valid role for the target business.'},400);if(role.code==='owner'&&!isOwner(context))return json({error:'Only the Owner can assign Owner access.'},403);
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES(?,?,?,CASE WHEN EXISTS(SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND active=1) THEN 0 ELSE 1 END,1) ON CONFLICT(employee_id,company_id) DO UPDATE SET active=1`).bind(uid('membership'),employeeId,targetCompanyId,employeeId),
   env.DB.prepare(`INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id,assigned_by) VALUES(?,?,?,?,?)`).bind(uid('employee-role'),employeeId,targetCompanyId,role.id,context.employee.id)
  ]);
 }else if(action==='remove'){
  const ownerRole=await env.DB.prepare(`SELECT 1 ok FROM employee_roles er JOIN roles r ON r.id=er.role_id WHERE er.employee_id=? AND er.company_id=? AND r.code='owner' LIMIT 1`).bind(employeeId,targetCompanyId).first();if(ownerRole)return json({error:'Owner business access is protected and cannot be removed here.'},403);
  const active=await env.DB.prepare(`SELECT COUNT(*) n FROM employee_company_memberships WHERE employee_id=? AND active=1`).bind(employeeId).first<{n:number}>();if(Number(active?.n||0)<=1)return json({error:'An employee must keep at least one active business assignment.'},409);
  await env.DB.batch([env.DB.prepare(`UPDATE employee_company_memberships SET active=0,is_primary=0 WHERE employee_id=? AND company_id=?`).bind(employeeId,targetCompanyId),env.DB.prepare(`DELETE FROM employee_roles WHERE employee_id=? AND company_id=?`).bind(employeeId,targetCompanyId),env.DB.prepare(`DELETE FROM employee_permission_overrides_v2 WHERE employee_id=? AND company_id=?`).bind(employeeId,targetCompanyId),env.DB.prepare(`DELETE FROM employee_permission_overrides WHERE employee_id=? AND company_id=?`).bind(employeeId,targetCompanyId)]);
  await env.DB.prepare(`UPDATE employee_company_memberships SET is_primary=1 WHERE employee_id=? AND active=1 AND company_id=(SELECT company_id FROM employee_company_memberships WHERE employee_id=? AND active=1 ORDER BY created_at LIMIT 1) AND NOT EXISTS(SELECT 1 FROM employee_company_memberships WHERE employee_id=? AND active=1 AND is_primary=1)`).bind(employeeId,employeeId,employeeId).run();
 }else{
  const membership=await env.DB.prepare(`SELECT id FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1`).bind(employeeId,targetCompanyId).first();if(!membership)return json({error:'The employee is not assigned to that business.'},404);
  await env.DB.batch([env.DB.prepare(`UPDATE employee_company_memberships SET is_primary=0 WHERE employee_id=?`).bind(employeeId),env.DB.prepare(`UPDATE employee_company_memberships SET is_primary=1 WHERE employee_id=? AND company_id=?`).bind(employeeId,targetCompanyId)]);
 }
 await audit(env,context,targetCompanyId,'employee',employeeId,null,null,null,`${action} business assignment: ${reason}`);return json({ok:true,message:`${employee.displayName}'s business assignment was updated.`});
}

export async function routeAccessControl(request:Request,env:Env,context:EnhancedSessionContext):Promise<Response|null>{const u=new URL(request.url);if(u.pathname==='/api/access-control/overview'&&request.method==='GET')return overview(request,env,context);if(u.pathname==='/api/access-control/roles'&&request.method==='POST')return createRole(request,env,context);if(u.pathname==='/api/access-control/role-permission'&&request.method==='POST')return rolePermission(request,env,context);if(u.pathname==='/api/access-control/employee-role'&&request.method==='POST')return employeeRole(request,env,context);if(u.pathname==='/api/access-control/employee-override'&&request.method==='POST')return employeeOverride(request,env,context);if(u.pathname==='/api/access-control/business-assignments'&&request.method==='GET')return businessAssignments(request,env,context);if(u.pathname==='/api/access-control/business-assignment'&&request.method==='POST')return updateBusinessAssignment(request,env,context);if(u.pathname==='/api/access-control/history'&&request.method==='GET')return history(request,env,context);return null}
