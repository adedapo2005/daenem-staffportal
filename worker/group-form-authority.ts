import type {SessionContext, AccessLevel} from './auth';

const LEVELS: AccessLevel[]=['none','view','create','edit','approve','manage'];

/**
 * Group administration is independently granted by server-bound Group Access Control.
 * Neither Owner/Admin titles, global maximum company permissions, nor a company grant
 * can authorize Group form create/assign/review.
 */
export function canManageGroupForms(context:SessionContext,level:AccessLevel='view'){
 const groupGrants=(context as SessionContext & { groupPermissions?: Record<string, AccessLevel> }).groupPermissions;
 const grant=groupGrants?.['forms.group.admin']||'none';
 return LEVELS.indexOf(grant)>=LEVELS.indexOf(level);
}

/**
 * Group audience assignment is a recipient entitlement, NOT admin authorization.
 * An authenticated active/provisional DAENEM employee with a currently assigned
 * company can receive Group-wide employee forms without company Forms-admin grants.
 * A group-only employee must possess an explicit Group recipient grant.
 */
export function canReceiveGroupForms(context:SessionContext){
 if(!['active','provisional'].includes(context.employee.status))return false;
 const groupGrants=(context as SessionContext & { groupPermissions?: Record<string, AccessLevel> }).groupPermissions;
 const groupGrant=groupGrants?.['forms.group.receive']||'none';
 return context.companies.some(company=>Boolean(company.id))
   || LEVELS.indexOf(groupGrant)>=LEVELS.indexOf('view');
}
