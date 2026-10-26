import type { WorkforceContext } from './auth';
import type { ModuleDefinition } from './module-hub';
import type { AuthorisedWorkspace } from './authorised-live-workspaces';

/** A navigation projection, not a grant. Worker-side permissions are authoritative. */
export type CompanyModuleNav = {
  companyId: string;
  companyCode: string;
  companyName: string;
  modules: Array<{ id: string; label: string; detail: string; group: ModuleDefinition['group'] }>;
  pages: AuthorisedWorkspace['pages'];
};

export type AllCompanyNav = {
  personal: Array<{ id: PersonalModuleId; label: string; detail: string }>;
  companies: CompanyModuleNav[];
  groupPages: AuthorisedWorkspace['pages'];
};

type VisibleModule = (context: WorkforceContext, module: ModuleDefinition, companyId: string | null, companyCode: string) => boolean;

const PERSONAL_MODULE_IDS = ['employee', 'profile', 'themes', 'navigation'] as const;
export type PersonalModuleId = typeof PERSONAL_MODULE_IDS[number];

function isPersonalModuleId(id: string): id is PersonalModuleId {
  return PERSONAL_MODULE_IDS.some((personalId) => personalId === id);
}

/**
 * Project EVERY authorised company and its pages at once.
 * No company state, default/primary fallback, Owner title, or company picker.
 * Callers MUST pass the existing canonical visibility guard, and the backend
 * independently verifies company/record/action grants on every request.
 */
export function projectAllAuthorisedCompanyModules(
  context: WorkforceContext,
  definitions: readonly ModuleDefinition[],
  workspaces: readonly AuthorisedWorkspace[],
  canSee: VisibleModule,
): AllCompanyNav {
  const companies: CompanyModuleNav[] = [];
  const seen = new Set<string>();
  const personal = definitions
    .filter((module): module is ModuleDefinition & { id: PersonalModuleId } =>
      isPersonalModuleId(module.id) && canSee(context, module, null, ''))
    .map(module => ({ id: module.id, label: module.label, detail: module.detail }));
  for (const company of context.companies) {
    if (!company.id || seen.has(company.id)) continue;
    seen.add(company.id);
    const workspace = workspaces.find(w => w.scopeId === company.id);
    const modules = definitions
      .filter(m => !isPersonalModuleId(m.id) && Boolean(m.permissions?.length || m.prefixes?.length))
      .filter(m => canSee(context, m, company.id, company.code))
      .map(m => ({id:m.id, label:m.label, detail:m.detail, group:m.group}));
    // A company with NO granted page/module is not a navigation choice and
    // must reveal neither its name nor a fabricated count.
    if (!modules.length && !workspace?.pages.length) continue;
    companies.push({
      companyId:company.id, companyCode:company.code, companyName:company.name,
      modules, pages:workspace?.pages || [],
    });
  }
  return {personal,companies,groupPages:workspaces.find(w => w.scopeId === null)?.pages || []};
}
