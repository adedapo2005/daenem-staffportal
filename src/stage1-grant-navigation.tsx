import { useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Grid3X3, LockKeyhole, Search } from 'lucide-react';
import type { WorkforceContext } from './auth';
import { authorisedLiveWorkspaces } from './authorised-live-workspaces';
import { isModuleVisible, moduleDefinitions } from './module-hub';
import { launchGrantedModule } from './stage1-granted-module-launch';
import { usePathname, useRouter } from './next-navigation-shim';
import './stage1-grant-navigation.css';

type CompanyModuleGroup = {
  id:string;
  code:string;
  name:string;
  modules:typeof moduleDefinitions;
};

export function grantedCompanyModuleGroups(context:WorkforceContext):CompanyModuleGroup[]{
  const seen=new Set<string>();
  return context.companies.flatMap(company=>{
    if(!company.id || seen.has(company.id))return [];
    seen.add(company.id);
    // Personal self-service is not a grant to access an unassigned company.
    const modules=moduleDefinitions.filter(m=>m.id!=='layout-studio' && Boolean(m.permissions?.length||m.prefixes?.length)
      && isModuleVisible(context,m,company.id,company.code));
    return modules.length?[{id:company.id,code:company.code,name:company.name,modules}]:[];
  });
}

/**
 * Authenticated host navigation replaces V115 simulated role/company lists on
 * desktop and mobile. The actual snapshot remains byte-for-byte protected.
 * All assigned company/module pages are rendered together: no company picker.
 */
export default function Stage1GrantNavigation({
  context,collapsed,onExpand,
}:{context:WorkforceContext;collapsed:boolean;onExpand:()=>void}) {
  const router=useRouter();
  const pathname=usePathname();
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const latestContext=useRef(context);
  latestContext.current=context;
  const companies=useMemo(()=>grantedCompanyModuleGroups(context),[context]);
  const workspaces=useMemo(()=>authorisedLiveWorkspaces(context),[context]);
  const term=query.trim().toLocaleLowerCase();
  const rows=context.companies.flatMap(company=>{
    const assigned=companies.find(row=>row.id===company.id);
    const pages=workspaces.find(w=>w.scopeId===company.id)?.pages||[];
    if(!assigned && !pages.length)return [];
    const modules=assigned?.modules||[];
    const matchedPages=pages.filter(p=>(p.label+' '+company.name).toLocaleLowerCase().includes(term));
    const matchedModules=modules.filter(m=>(m.label+' '+m.functionalItem+' '+company.name).toLocaleLowerCase().includes(term));
    return matchedPages.length||matchedModules.length
      ?[{id:company.id,code:company.code,name:company.name,pages:matchedPages,modules:matchedModules}]:[];
  });
  const groupPages=(workspaces.find(w=>w.scopeId===null)?.pages||[])
    .filter(p=>(p.label+' Group').toLocaleLowerCase().includes(term));

  async function openModule(companyId:string,moduleId:string){
    if(busy)return;
    const requested=companyId+'/'+moduleId;
    setBusy(requested);setError('');
    try{
      await launchGrantedModule(context,{scopeId:companyId,moduleId},()=>latestContext.current);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'The authorised module could not be opened.');
    }finally{setBusy('');}
  }

  if(collapsed)return <nav className="ecc-navigation sp-grant-navigation sp-grant-collapsed"
      aria-label="Authorised company and module pages" data-grant-navigation="true">
    <button type="button" onClick={onExpand} aria-label="Expand authorised company navigation">
      <Grid3X3 size={19} aria-hidden="true"/>
      <span className="sp-grant-visually-hidden">Expand authorised navigation</span>
    </button>
  </nav>;

  return <nav className="ecc-navigation sp-grant-navigation"
    aria-label="Authorised company and module pages" data-grant-navigation="true">
    <div className="sp-grant-nav-head">
      <span>ALL AUTHORISED WORKSPACES</span>
      <label className="sp-grant-search"><Search size={16} aria-hidden="true"/>
        <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
          placeholder="Find a permitted module or page" aria-label="Find permitted modules and pages"/>
      </label>
    </div>
    <div className="sp-grant-nav-scroll">
      <a className="sp-grant-home" href="/home" aria-current={pathname==='/home'?'page':undefined}>
        <Grid3X3 size={17} aria-hidden="true"/> StaffPortal Home <ChevronRight size={13} aria-hidden="true"/>
      </a>
      {rows.length===0 && !groupPages.length
        ?<div className="sp-grant-empty" role="status">
          <LockKeyhole size={20} aria-hidden="true"/>
          <span>{term?'No authorised pages match your search.':'No company modules are currently assigned. Contact Access Control for permission.'}</span>
        </div>
        :null}
      {rows.map(company=><section key={company.id} className="sp-grant-company" data-grant-company={company.id}>
        <details open className="sp-grant-company-details">
          <summary><Building2 size={17} aria-hidden="true"/><strong>{company.name}</strong>
            <span className="sp-grant-company-count">{company.pages.length+company.modules.length}</span>
            <ChevronDown size={14} aria-hidden="true"/></summary>
          <ul className="sp-grant-pages">
            {company.pages.map(page=><li key={'page-'+page.route}>
              <a href={page.href} aria-current={pathname===page.href?'page':undefined}
                data-authorised-page={page.route} data-authorised-company={company.id}>
                <span>{page.label}</span><ChevronRight size={13} aria-hidden="true"/>
              </a>
            </li>)}
            {company.modules.map(module=><li key={'module-'+module.id}>
              <button type="button" data-authorised-module={module.id} data-authorised-company={company.id}
                disabled={Boolean(busy)} onClick={()=>void openModule(company.id,module.id)}>
                <span>{module.label}</span>
                <span className="sp-grant-launch-status">{busy===company.id+'/'+module.id?'Opening…':<ChevronRight size={13} aria-hidden="true"/>}</span>
              </button>
            </li>)}
          </ul>
        </details>
      </section>)}
      {groupPages.length>0&&<section className="sp-grant-company" data-grant-company="group">
        <details open className="sp-grant-company-details">
          <summary><Building2 size={17} aria-hidden="true"/><strong>DAENEM Group</strong><ChevronDown size={14} aria-hidden="true"/></summary>
          <ul className="sp-grant-pages">{groupPages.map(page=><li key={'group-'+page.route}>
            <a href={page.href} aria-current={pathname===page.href?'page':undefined}>
              {page.label}<ChevronRight size={13} aria-hidden="true"/>
            </a>
          </li>)}</ul>
        </details>
      </section>}
    </div>
    <div className="sp-grant-nav-foot" role="status" aria-live="polite">
      {error?<span className="sp-grant-error">{error}</span>
        :busy?'Opening the authorised workspace…':'Pages are determined by your assigned access permissions.'}
    </div>
  </nav>;
}
