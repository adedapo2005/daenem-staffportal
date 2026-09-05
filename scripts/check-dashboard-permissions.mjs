import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const capabilities = read('src/dashboard-capabilities.ts');
const worker = read('worker/index.ts');
const zip = read('src/zip-dashboard.tsx');

must(capabilities.includes("employees: ['users.access']"), 'employees must require users access');
must(capabilities.includes("present: ['attendance.access']"), 'attendance must require attendance access');
must(capabilities.includes("pendingApprovals: ['forms.access']"), 'approvals must require forms access');
must(capabilities.includes("securityAlerts: ['security.access']"), 'security must require security access');
must(capabilities.includes("maintenanceAlerts: ['facilities.access']"), 'maintenance must require facilities access');
must(worker.includes('permittedDashboardCompanyIds') && worker.includes('DASHBOARD_FIELD_PERMISSIONS'), 'worker must use field-level dashboard authorization');
must(!worker.includes("['owner', 'group_admin', 'company_admin', 'manager'].includes(role.code)"), 'worker must not grant aggregate data from role name alone');
must(zip.includes('canSeeDashboardField') && zip.includes('fields:'), 'client widgets must mirror field authorization');

const rank = { none: 0, view: 1, create: 2, edit: 3, approve: 4, manage: 5 };
const fieldPermissions = { employees: ['users.access'], present: ['attendance.access'], incompleteAttendance: ['attendance.access'], pendingApprovals: ['forms.access'], securityAlerts: ['security.access'], overdueRequirements: ['forms.access'], maintenanceAlerts: ['facilities.access'] };
const can = (permissions, field) => fieldPermissions[field].some((permission) => rank[permissions[permission] || 'none'] >= rank.view);
const employee = { 'dashboard.access': 'view', 'ai_guide.access': 'view' };
const attendanceManager = { 'dashboard.access': 'view', 'attendance.access': 'view' };
const approvalManager = { 'dashboard.access': 'view', 'forms.access': 'view' };
const securityManager = { 'dashboard.access': 'view', 'security.access': 'view' };
const owner = { 'dashboard.access': 'manage', 'users.access': 'manage', 'attendance.access': 'manage', 'forms.access': 'manage', 'security.access': 'manage', 'facilities.access': 'manage' };
must(!Object.keys(fieldPermissions).some((field) => can(employee, field)), 'employee fixture exposes an aggregate field');
must(can(attendanceManager, 'present') && can(attendanceManager, 'incompleteAttendance') && !can(attendanceManager, 'securityAlerts') && !can(attendanceManager, 'pendingApprovals'), 'attendance manager matrix is invalid');
must(can(approvalManager, 'pendingApprovals') && can(approvalManager, 'overdueRequirements') && !can(approvalManager, 'present') && !can(approvalManager, 'securityAlerts'), 'approval manager matrix is invalid');
must(can(securityManager, 'securityAlerts') && !can(securityManager, 'employees') && !can(securityManager, 'present'), 'security manager matrix is invalid');
must(Object.keys(fieldPermissions).every((field) => can(owner, field) || field === 'overdueRequirements' || field === 'maintenanceAlerts'), 'owner matrix is invalid');
console.log('Dashboard field-level permission contract: PASS');
