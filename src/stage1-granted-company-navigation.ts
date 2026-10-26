import type { WorkforceContext } from './auth';
import { isModuleVisible, moduleDefinitions } from './module-hub';
import { authorisedLiveWorkspaces } from './authorised-live-workspaces';

export type GrantedNavPage = {
  id:string;
  label:string;
  detail:string;
  href:string|null;
  moduleId?:string;
  erpId?:string;
};
export type GrantedNavGroup = {
  id:string;
  companyId:string|null;
  title:string;
  subtitle:string;
  pages:GrantedNavPage[];
  pending:GrantedNavPage[];
};

const selfServiceIds=new Set(['employee','profile','themes','navigation']);

/**
 * Authoritative UI projection. The authenticated /api/auth/me grants are the
 * ONLY source of companies and modules. Neither a demo company selection nor
 * Owner/Admin role alone expands this list.
 *
 * Only live authenticated and company-scoped routes become clickable links.
 * Other granted modules are listed as integration-pending rather than making
 * up a route or opening a simulated cross-company workspace.
 */
export function buildGrantedCompanyNavigation(context:WorkforceContext):GrantedNavGroup[]{
  const live=authorisedLiveWorkspaces(context);
  const output:GrantedNavGroup[]=[];
  const seen=new Set<string>();

  for(const company of context.companies){
    if(!company.id || seen.has(company.id))continue;
    seen.add(company.id);
    const scoped=live.find(group=>group.scopeId===company.id);
    const pages:GrantedNavPage[]=(scoped?.pages||[]).map(page=>({
      id:page.route,label:page.label,detail:'Authenticated company records',href:page.href,
    }));
    const pending=moduleDefinitions
      .filter(mod=>!selfServiceIds.has(mod.id))
      .filter(mod=>isModuleVisible(context,mod,company.id,company.code))
      .map(mod=>({
        id:mod.id,moduleId:mod.id,erpId:mod.erpId,label:mod.label,
        detail:'Granted module · scoped route requires integration',href:null,
      }));
    if(!pages.length && !pending.length)continue;
    output.push({
      id:'company:'+company.id,companyId:company.id,title:company.name,
      subtitle:company.code,pages,pending,
    });
  }

  // Group scope does not inherit company permissions or an Owner role bypass.
  // Remove company memberships when evaluating explicit group-wide grants.
  const groupContext:WorkforceContext={
    ...context,companies:[],companyPermissions:{},
  };
  const groupPages:GrantedNavPage[]=(live.find(group=>group.scopeId===null)?.pages||[])
    .map(page=>({id:page.route,label:page.label,detail:'Group-authorised records',href:page.href}));
  const groupPending=moduleDefinitions
    .filter(mod=>!selfServiceIds.has(mod.id))
    .filter(mod=>isModuleVisible(groupContext,mod,null,''))
    .map(mod=>({
      id:mod.id,moduleId:mod.id,erpId:mod.erpId,label:mod.label,
      detail:'Group-granted module · scoped route requires integration',href:null,
    }));
  if(groupPages.length || groupPending.length)output.push({
    id:'__group__',companyId:null,title:'DAENEM Group',subtitle:'Explicit group grants',
    pages:groupPages,pending:groupPending,
  });
  return output;
}

export const SELF_SERVICE_NAV=[
  {id:'home',label:'Home',href:'/home'},
  {id:'profile',label:'My Profile',href:'/profile'},
] as const;
