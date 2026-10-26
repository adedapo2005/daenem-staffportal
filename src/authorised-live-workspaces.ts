import type { WorkforceContext, AccessLevel } from './auth';
import type { LiveErpRoute } from './stage1-live-erp-route-contract';

export type AuthorisedWorkspace = {
  scopeId: string | null;
  scopeName: string;
  scopeCode: string;
  pages: Array<{ route: LiveErpRoute; label: string; href: string }>;
};
const levels: Record<AccessLevel,number> = {none:0,view:1,create:2,edit:3,approve:4,manage:5};

const pages: Array<{route:LiveErpRoute;label:string;permissions:string[]}> = [
  {route:'forms',label:'Forms Center',permissions:['forms.access']},
  {route:'facilities',label:'Facilities & Maintenance',permissions:['facilities.access']},
  {route:'spend',label:'Spend & Cost Intelligence',permissions:['expense.requests','expense.own','expense.approve','expense.master']},
];

/** Exact company grant, never an Owner/Admin role or first-company fallback. */
function permitted(context:WorkforceContext, code:string, companyId:string|null):boolean{
  const level=companyId?context.companyPermissions?.[companyId]?.[code]:context.permissions?.[code];
  return levels[level||'none']>=levels.view;
}
function companyPageHref(route:LiveErpRoute, scopeId:string|null):string {
  return '/'+route+'/company/'+encodeURIComponent(scopeId||'group');
}

/** All permitted company → module pages, not a company dropdown or picker. */
export function authorisedLiveWorkspaces(context:WorkforceContext):AuthorisedWorkspace[]{
  const result:AuthorisedWorkspace[]=[];
  const seen=new Set<string>();
  for(const company of context.companies){
    if(!company.id || seen.has(company.id))continue;
    seen.add(company.id);
    const allowed=pages.filter(p=>p.permissions.some(code=>permitted(context,code,company.id)));
    if(!allowed.length)continue;
    result.push({
      scopeId:company.id,
      scopeName:company.name,
      scopeCode:company.code,
      pages:allowed.map(page=>({route:page.route,label:page.label,href:companyPageHref(page.route,company.id)})),
    });
  }
  const groupPages=pages.filter(page=>page.route==='forms' && page.permissions.some(code=>permitted(context,code,null)));
  if(groupPages.length)result.push({
    scopeId:null,scopeName:'DAENEM Group',scopeCode:'GROUP',
    pages:groupPages.map(page=>({route:page.route,label:page.label,href:companyPageHref(page.route,null)})),
  });
  return result;
}

export function liveRouteCompanyScope(pathname:string,route:LiveErpRoute,workspaces:readonly AuthorisedWorkspace[]) {
  const match=pathname.match(/^\/(forms|facilities|spend)\/company\/([^/?#]+)\/?$/);
  if(!match || match[1]!==route)return {explicit:false,denied:false,workspace:null as AuthorisedWorkspace|null};
  let id:string;
  try{id=decodeURIComponent(match[2]);}catch{return {explicit:true,denied:true,workspace:null};}
  const workspace=workspaces.find(w=>(w.scopeId||'group')===id&&w.pages.some(p=>p.route===route))||null;
  return {explicit:true,denied:!workspace,workspace};
}
