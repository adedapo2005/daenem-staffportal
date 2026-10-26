import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Building2,ChevronRight} from 'lucide-react';
import type {WorkforceContext} from './auth';
import {authorisedLiveWorkspaces} from './authorised-live-workspaces';
import {useRouter} from './next-navigation-shim';
import './stage1-company-directory.css';

/** Inject granted company/page navigation alongside, never inside, protected V115 source. */
export default function Stage1CompanyDirectory({context}:{context:WorkforceContext}){
 const [target,setTarget]=useState<HTMLElement|null>(null);
 const router=useRouter();
 useEffect(()=>{
  const find=()=>setTarget(document.querySelector<HTMLElement>('[data-approved-postlogin="qa-review-v115"] .p-sidebar'));
  find();
  const observer=new MutationObserver(find);
  observer.observe(document.body,{childList:true,subtree:true});
  return()=>observer.disconnect();
 },[]);
 const groups=authorisedLiveWorkspaces(context);
 if(!target)return null;
 return createPortal(<nav className="stage1-company-directory" aria-label="Authorised company modules and pages" data-authorised-company-directory="true">
  <h2><Building2 size={16} aria-hidden="true"/> Authorised workspaces</h2>
  {groups.length===0?<p role="status">No company modules are assigned. Your administrator controls access.</p>
   :groups.map(group=><section key={group.scopeId??'group'}>
    <h3>{group.scopeName}</h3>
    {group.pages.map(page=><button key={page.href} type="button" onClick={()=>router.push(page.href)} data-company-page={page.href}>{page.label}<ChevronRight size={13} aria-hidden="true"/></button>)}
   </section>)}
 </nav>,target);
}
