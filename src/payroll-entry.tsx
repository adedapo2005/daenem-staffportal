import React,{useEffect,useState} from'react';
import{createRoot}from'react-dom/client';
import{WalletCards}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{PayrollWorkspace}from'./payroll';
import'./payroll-entry.css';

function hasPayroll(context:WorkforceContext){return(context.permissions['payroll.access']||'none')!=='none'||context.roles.some(r=>r.code==='owner')}

function PayrollLauncher(){const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const result=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(result.context&&hasPayroll(result.context)?result.context:null)}catch{if(active)setContext(null)}};refresh();const focus=()=>refresh();const command=(event:Event)=>{const detail=(event as CustomEvent<{module?:string}>).detail;if(detail?.module==='payroll')setOpen(true)};window.addEventListener('focus',focus);window.addEventListener('daenem:open-module',command as EventListener);const timer=window.setInterval(refresh,120000);return()=>{active=false;window.removeEventListener('focus',focus);window.removeEventListener('daenem:open-module',command as EventListener);window.clearInterval(timer)}},[]);
 if(!context)return null;return <><button className="payroll-launcher" onClick={()=>setOpen(true)}><WalletCards size={18}/><span>Payroll</span></button>{open&&<PayrollWorkspace context={context} onClose={()=>setOpen(false)}/>}</>}
const host=document.createElement('div');host.id='payroll-workspace-launcher';document.body.appendChild(host);createRoot(host).render(<PayrollLauncher/>);
