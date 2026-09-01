import { useEffect,useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LifeBuoy } from 'lucide-react';
import { api,hasWorkforcePermission,type WorkforceContext } from './auth';
import { OwnerSupportCenter } from './owner-support';

function allowed(context:WorkforceContext){return context.roles.some((role)=>role.code==='owner')||context.companies.some((company)=>hasWorkforcePermission(context,'support.access','view',company.id))}
function Launcher(){const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);useEffect(()=>{let active=true;const refresh=async()=>{try{const result=await api<{context?:WorkforceContext}>('/api/auth/me');if(active)setContext(result.context&&allowed(result.context)?result.context:null)}catch{if(active)setContext(null)}};const launch=()=>setOpen(true);void refresh();window.addEventListener('focus',refresh);window.addEventListener('daenem:open-user-support',launch);return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('daenem:open-user-support',launch)}},[]);if(!context)return null;return <><button className="user-support-launcher" hidden onClick={()=>setOpen(true)}><LifeBuoy size={18}/><span>User Support</span></button>{open&&<OwnerSupportCenter context={context} onClose={()=>setOpen(false)}/>}</>}
const host=document.createElement('div');host.id='daenem-user-support-root';document.body.appendChild(host);createRoot(host).render(<Launcher/>);
