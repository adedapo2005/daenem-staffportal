import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useContext } from 'react';
import { Stage1RuntimeContext } from './stage1-runtime-context';
import './stage1-workflow-focus.css';

type Destination = { href: string; label: string };
const preferences: Record<string,string[]> = {
  Employee: ['/self-service','/leave','/attendance','/payslips','/forms','/files','/work','/home'],
  Manager: ['/people','/attendance','/leave','/forms','/projects','/work','/home'],
  Owner: ['/home','/finance','/people','/payroll','/construction-command','/audit','/businesses'],
};
const captions: Record<string,string> = {
  Employee: 'Personal tasks and requests',
  Manager: 'Team operations and approvals',
  Owner: 'Group oversight and decisions',
};
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
        const next=selected.filter((value,index,array)=>array.findIndex(a=>a.href===value.href)===index).slice(0,4);
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
  if(!enabled||!target||!links.length)return null;
  return createPortal(
    <section className="stage1-workflow-focus" aria-label="Suggested authorized work areas">
      <div className="stage1-workflow-title">
        <strong>{companyRole==='Employee'?'Your next steps':companyRole==='Manager'?'Team focus':'Command focus'}</strong>
        <span>{captions[companyRole]}</span>
      </div>
      <div className="stage1-workflow-links">
        {links.map(link=><a href={link.href} key={link.href}
          onClick={event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();window.history.pushState({},'',link.href);window.dispatchEvent(new Event('daenem:v115-navigation'));window.scrollTo({top:0,behavior:'auto'});}}>
          {link.label}
        </a>)}
      </div>
    </section>,target);
}
