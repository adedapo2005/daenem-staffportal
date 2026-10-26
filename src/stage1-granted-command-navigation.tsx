import { useMemo, useState, type MouseEvent } from 'react';
import { Building2, ChevronDown, ChevronRight, ClipboardList, Home, LockKeyhole, Menu, Search, ShieldCheck } from 'lucide-react';
import type { WorkforceContext } from './auth';
import { buildGrantedCompanyNavigation, SELF_SERVICE_NAV } from './stage1-granted-company-navigation';
import { usePathname, useRouter } from './next-navigation-shim';
import './stage1-granted-command-navigation.css';

type Props={
  context:WorkforceContext;
  collapsed:boolean;
  onExpand:()=>void;
};

export function Stage1GrantedCommandNavigation({context,collapsed,onExpand}:Props){
  const groups=useMemo(()=>buildGrantedCompanyNavigation(context),[context]);
  const [query,setQuery]=useState('');
  const [expanded,setExpanded]=useState<string[]>([]);
  const pathname=usePathname();
  const router=useRouter();
  const normalized=query.trim().toLocaleLowerCase();
  const filtered=groups.map(group=>({
    ...group,
    pages:group.pages.filter(p=>!normalized||(p.label+' '+group.title).toLocaleLowerCase().includes(normalized)),
    pending:group.pending.filter(p=>!normalized||(p.label+' '+(p.erpId||'')+' '+group.title).toLocaleLowerCase().includes(normalized)),
  })).filter(group=>group.pages.length||group.pending.length);
  const openRoute=(event:MouseEvent<HTMLAnchorElement>,href:string)=>{
    if(event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    event.preventDefault();
    // The approved V115 demo goRoute runs a simulated permission check.
    // Navigate via the authenticated app router instead; Worker scopes the API.
    router.push(href);
    setQuery('');
  };
  return <nav className="ecc-navigation sp-granted-nav" aria-label="Company and module pages assigned to your account"
    data-navigation-source="authenticated-company-grants" data-collapsed={collapsed}>
    <div className="sp-granted-rail">
      <button type="button" onClick={onExpand} title="Expand authorised navigation" aria-label="Expand authorised company navigation">
        <Menu size={19} aria-hidden="true"/>
      </button>
      <span className="sp-granted-rail-mark" aria-hidden="true"><ShieldCheck size={18}/></span>
    </div>
    <div className="sp-granted-full">
      <header className="sp-granted-heading"><ShieldCheck size={17} aria-hidden="true"/>
        <div><strong>Your assigned workspaces</strong><small>No company selection required</small></div>
      </header>
      <label className="sp-granted-search"><Search size={16} aria-hidden="true"/>
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Find an authorised page…" aria-label="Find authorised company or module page"/>
      </label>
      <div className="sp-granted-scroll">
        <div className="sp-granted-personal">
          <span className="sp-granted-section-caption">Personal workspace</span>
          {SELF_SERVICE_NAV.map(page=><a key={page.id} href={page.href}
            aria-current={pathname===page.href?'page':undefined}
            onClick={event=>openRoute(event,page.href)}><Home size={15} aria-hidden="true"/>{page.label}</a>)}
        </div>
        {filtered.length ? filtered.map((group,index)=>{
          const isOpen=normalized!=='' || expanded.includes(group.id) || (expanded.length===0&&index===0);
          return <section className="sp-granted-company" key={group.id} data-granted-company={group.companyId||'__group__'}>
            <button type="button" className="sp-granted-company-heading"
              aria-expanded={isOpen} aria-controls={'sp-granted-'+index}
              onClick={()=>setExpanded(current=>isOpen?current.filter(id=>id!==group.id):[...current,group.id])}>
              <Building2 size={16} aria-hidden="true"/>
              <span><strong>{group.title}</strong><small>{group.pages.length} live page{group.pages.length===1?'':'s'} · {group.pending.length} other grant{group.pending.length===1?'':'s'}</small></span>
              <ChevronDown size={15} aria-hidden="true"/>
            </button>
            {isOpen&&<div className="sp-granted-company-pages" id={'sp-granted-'+index}>
              {group.pages.map(page=><a href={page.href!} key={page.id}
                  data-granted-page={page.id}
                  aria-current={pathname===page.href?'page':undefined}
                  onClick={event=>openRoute(event,page.href!)}>
                <ClipboardList size={15} aria-hidden="true"/>
                <span>{page.label}</span><ChevronRight size={14} aria-hidden="true"/>
              </a>)}
              {group.pending.length>0&&<details className="sp-granted-pending">
                <summary>Other assigned modules ({group.pending.length})</summary>
                <p>These grants are recognised, but their company-specific launch routes require integration before they can be opened safely here.</p>
                <ul>{group.pending.map(page=><li key={page.id} data-granted-module={page.id}>
                  <span>{page.label}</span><small>Scoped launch pending</small></li>)}</ul>
              </details>}
            </div>}
          </section>;
        }):<div className="sp-granted-empty" role="status">
          <LockKeyhole size={18} aria-hidden="true"/>
          {normalized?'No assigned company page matches your search.':'No company module is assigned to your account. Request access from Access Control.'}
        </div>}
      </div>
      <footer className="sp-granted-footer">
        <ShieldCheck size={14} aria-hidden="true"/> Data access is checked again by the server.
      </footer>
    </div>
  </nav>;
}
