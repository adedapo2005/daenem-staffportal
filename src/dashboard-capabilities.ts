import type { WorkforceContext } from './auth';

export type DashboardAggregateField =
  | 'employees'
  | 'present'
  | 'incompleteAttendance'
  | 'pendingApprovals'
  | 'securityAlerts'
  | 'overdueRequirements'
  | 'maintenanceAlerts';

export const DASHBOARD_FIELD_PERMISSIONS: Record<DashboardAggregateField, readonly string[]> = {
  employees: ['users.access'],
  present: ['attendance.access'],
  incompleteAttendance: ['attendance.access'],
  pendingApprovals: ['forms.access'],
  securityAlerts: ['security.access'],
  overdueRequirements: ['forms.access'],
  maintenanceAlerts: ['facilities.access'],
};

export const DASHBOARD_SUMMARY_FIELDS = Object.keys(DASHBOARD_FIELD_PERMISSIONS) as DashboardAggregateField[];

const accessLevelRank = { none: 0, view: 1, create: 2, edit: 3, approve: 4, manage: 5 } as const;

function canPermission(context: WorkforceContext, permission: string, companyId?: string | null) {
  const level = companyId
    ? context.companyPermissions?.[companyId]?.[permission] || 'none'
    : context.permissions[permission] || 'none';
  return accessLevelRank[level as keyof typeof accessLevelRank] >= accessLevelRank.view;
}

export function canSeeDashboardField(context: WorkforceContext, field: DashboardAggregateField, companyId?: string | null) {
  return DASHBOARD_FIELD_PERMISSIONS[field].some((permission) => canPermission(context, permission, companyId));
}

export function visibleDashboardFields(context: WorkforceContext, companyId?: string | null) {
  return DASHBOARD_SUMMARY_FIELDS.filter((field) => canSeeDashboardField(context, field, companyId));
}
