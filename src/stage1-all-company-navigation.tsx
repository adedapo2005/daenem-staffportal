import { useMemo } from 'react';
import { Building2, ChevronRight, LayoutGrid, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import type { WorkforceContext } from './auth';
import { authorisedLiveWorkspaces } from './authorised-live-workspaces';
import { isModuleVisible, moduleDefinitions } from './module-hub';
import { projectAllAuthorisedCompanyModules } from './stage1-all-company-navigation-model';
import './stage1-all-company-navigation.css';

export type Stage1AllCompanyNavigationProps = {
  context: WorkforceContext;
  pathname: string;
  /** Integration owner must open the module with this exact authorised company scope. */
  onOpenModule: (moduleId: string, companyId: string, companyCode: string) => void;
};

/**
 * Integration-ready replacement for legacy "Switch Company" UI.
 * Never lets staff choose a global active company; every granted company and
 * page appears directly, and module launch receives a company-specific scope.
 */
export function Stage1AllCompanyNavigation({
  context, pathname, onOpenModule,
}: Stage1AllCompanyNavigationProps) {
  const navigation = useMemo(
    () => projectAllAuthorisedCompanyModules(context,moduleDefinitions,authorisedLiveWorkspaces(context),isModuleVisible),
    [context],
  );
  return <nav className="sp-all-company-nav" aria-label="All authorised company and module pages"
    data-navigation-authority="authenticated-grants-only">
    <header className="sp-all-company-nav-heading">
      <LayoutGrid size={18} aria-hidden="true"/>
      <span><strong>Your Workspaces</strong><small>Pages assigned through Access Control</small></span>
    </header>
    {navigation.personal.length > 0 && <section className="sp-all-company-nav-scope" aria-label="Personal workspace">
      <h3><UserRound size={16} aria-hidden="true"/> My Workspace</h3>
      <div className="sp-all-company-nav-items">
        {navigation.personal.map(item => <span key={item.id} className="sp-all-company-personal-item">
          {item.label}
        </span>)}
      </div>
    </section>}
    {navigation.companies.map(company => <section className="sp-all-company-nav-scope" key={company.companyId}
      data-authorised-company={company.companyId} aria-label={company.companyName + ' authorised pages'}>
      <h3><Building2 size={16} aria-hidden="true"/><span>{company.companyName}</span></h3>
      <div className="sp-all-company-nav-items">
        {company.pages.map(page=><a key={page.route} href={page.href}
          className="sp-all-company-nav-page"
          aria-current={pathname === page.href || pathname === page.href+'/' ? 'page' : undefined}
          data-authorised-page={page.route}>
          {page.label}<ChevronRight size={15} aria-hidden="true"/>
        </a>)}
        {company.modules.map(module=><button type="button" key={module.id}
          data-authorised-module={module.id}
          onClick={()=>onOpenModule(module.id,company.companyId,company.companyCode)}
          className="sp-all-company-nav-page">
          <span>{module.label}</span><ChevronRight size={15} aria-hidden="true"/>
        </button>)}
      </div>
    </section>)}
    {navigation.groupPages.length > 0 && <section className="sp-all-company-nav-scope" aria-label="DAENEM Group authorised pages">
      <h3><ShieldCheck size={16} aria-hidden="true"/> DAENEM Group</h3>
      <div className="sp-all-company-nav-items">
        {navigation.groupPages.map(page=><a key={page.route} href={page.href}
          aria-current={pathname===page.href?'page':undefined}
          className="sp-all-company-nav-page">{page.label}<ChevronRight size={15} aria-hidden="true"/></a>)}
      </div>
    </section>}
    {navigation.companies.length === 0 && navigation.groupPages.length === 0 &&
      <p className="sp-all-company-nav-denied" role="status"><LockKeyhole size={16} aria-hidden="true"/>
        No company pages are assigned. Contact your authorised administrator.</p>}
  </nav>;
}

export default Stage1AllCompanyNavigation;
