import { useContext, useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Stage1RuntimeContext } from './stage1-runtime-context';
import './stage1-workflow-focus.css';

type Destination = { href: string; label: string };

const preferences: Record<string,string[]> = {
  Employee: ['/self-service','/leave','/attendance','/payslips','/forms','/files','/work','/home'],
  Manager: ['/people','/attendance','/leave','/forms','/projects','/work','/home'],
  Owner: ['/home','/finance','/people','/payroll','/construction-command','/audit','/businesses'],
};

const roleHomeCopy: Record<string,{eyebrow:string;title:string;description:string;compact:string}> = {
  Employee: {
    eyebrow: 'EMPLOYEE HOME',
    title: 'My Work & Next Actions',
    description: 'Keep personal work, requests and self-service close at hand without management-only noise.',
    compact: 'Personal tasks and requests',
  },
  Manager: {
    eyebrow: 'MANAGER HOME',
    title: 'Team Rhythm & Follow-Through',
    description: 'Move from permitted team signals to approvals, attendance and operational follow-through.',
    compact: 'Team operations and approvals',
  },
  Owner: {
    eyebrow: 'OWNER COMMAND CENTER',
    title: 'Business Health & Control',
    description: 'Move from authorized operating signals to the business workspaces responsible for resolution.',
    compact: 'Group oversight and decisions',
  },
};

function navigateStage1(event: ReactMouseEvent<HTMLAnchorElement>, href: string) {
  if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  window.history.pushState({},'',href);
  window.dispatchEvent(new Event('daenem:v115-navigation'));
  window.scrollTo({top:0,behavior:'auto'});
}

export default function Stage1WorkflowFocus() {
  const { enabled, companyRole = 'Employee' } = useContext(Stage1RuntimeContext);
  const [target,setTarget]=useState<HTMLElement|null>(null);
  const [links,setLinks]=useState<Destination[]>([]);
  const [pathname,setPathname]=useState('');

  useEffect(()=>{
    if(!enabled){setTarget(null);return;}
    let frame=0;
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const main=document.querySelector<HTMLElement>('#main-content.p-content');
        const currentPath=window.location.pathname;
        setPathname(currentPath);
        setTarget(main);
        const authorized=Array.from(document.querySelectorAll<HTMLAnchorElement>('.p-sidebar .ecc-page-link[href]'))
          .filter(a=>a.getAttribute('aria-disabled')!=='true')
          .map(a=>({href:a.getAttribute('href')||'',label:a.querySelector('.ecc-page-label')?.textContent?.trim()||a.textContent?.trim()||''}));
        const preferred=preferences[companyRole]||preferences.Employee;
        const selected=preferred.flatMap(href=>authorized.filter(a=>a.href===href && href!==currentPath).slice(0,1));
        const next=selected.filter((value,index,array)=>array.findIndex(a=>a.href===value.href)===index).slice(0,5);
        setLinks(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
      });
    };
    const observer=new MutationObserver(mutations=>{
      if(mutations.every(m=>m.target instanceof Element && m.target.closest('.stage1-workflow-focus')))return;
      update();
    });
    observer.observe(document.body,{subtree:true,childList:true});
    window.addEventListener('popstate',update);
    window.addEventListener('daenem:v115-navigation',update);
    update();
    return()=>{observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('popstate',update);window.removeEventListener('daenem:v115-navigation',update);};
  },[enabled,companyRole]);

  if(!enabled||!target||!links.length||!(["/home","/work"].includes(pathname)))return null;

  const role = roleHomeCopy[companyRole] ? companyRole : 'Employee';
  const copy = roleHomeCopy[role];
  const home = pathname === '/home';

  return createPortal(
    <section className={'stage1-workflow-focus' + (home ? ' stage1-role-home' : '')}
      data-role-home={home ? role.toLowerCase() : undefined}
      aria-label={home ? `${copy.eyebrow} authorized work areas` : 'Suggested authorized work areas'}>
      <div className="stage1-workflow-title">
        {home && <span className="stage1-role-eyebrow">{copy.eyebrow}</span>}
        <strong>{home ? copy.title : role==='Employee'?'Your next steps':role==='Manager'?'Team focus':'Command focus'}</strong>
        <span>{home ? copy.description : copy.compact}</span>
      </div>
      <div className="stage1-workflow-links" aria-label={home ? `${role} priority workspaces` : undefined}>
        {links.map((link,index)=><a href={link.href} key={link.href}
          data-priority={home && index===0 ? 'primary' : undefined}
          onClick={event=>navigateStage1(event,link.href)}>
          <span>{link.label}</span>
          {home && <small>{index===0?'Recommended next workspace':'Authorized workspace'}</small>}
        </a>)}
      </div>
      {home && <p className="stage1-role-footnote">Only workspaces already authorized for your current company role are shown here.</p>}
    </section>,target);
}
