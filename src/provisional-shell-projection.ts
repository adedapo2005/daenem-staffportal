import type { WorkforceContext } from './auth';
import type { Company, Session } from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model';

export function isProvisionalEmployee(context: Pick<WorkforceContext, 'employee'>): boolean {
  return context.employee.status.trim().toLowerCase() === 'provisional';
}

/**
 * Project a pending applicant into the approved shell with one own-profile
 * assignment. This is presentation state only; Worker authorization remains
 * the source of truth for every API request.
 */
export function projectProvisionalShellSession(
  base: Session,
  context: WorkforceContext,
  company: Company,
): Session {
  const companies: Company[] = [company === 'group' ? 'printing' : company];
  const permission = context.permissions['profile.access'] || 'none';
  const level = permission === 'view'
    ? 'View'
    : permission === 'edit' || permission === 'approve' || permission === 'manage'
      ? 'Edit'
      : null;
  return {
    ...base,
    role: 'Employee',
    roles: ['Employee'],
    company: companies[0] || 'printing',
    personId: context.employee.id,
    displayName: context.employee.displayName,
    displayTimeZone: context.employee.timezone || base.displayTimeZone || 'Africa/Lagos',
    profile: 'Provisional',
    provisional: false,
    assignments: companies.length && level ? [{
      module: 'profile',
      level,
      companies,
      scope: 'OWN',
      capabilities: [],
    }] : [],
    overrides: {},
    capabilities: {},
    fieldRules: {},
    timedOverrides: {},
  };
}
