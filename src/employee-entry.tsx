import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{UserRound}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{EmployeeCenter}from'./employee-center';
import'./employee-entry.css';

function Launcher(){
 const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(r.context||null)}catch{if(active)setContext(null)}};void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);const timer=window.setInterval(()=>void refresh(),120000);return()=>{active=false;window.removeEventListener('focus',focus);window.clearInterval(timer)}},[]);
 if(!context)return null;
 return <><button className="employee-center-launcher" onClick={()=>setOpen(true)}><UserRound size={18}/><span>My Workspace</span></button>{open&&<EmployeeCenter context={context} onClose={()=>setOpen(false)}/>}</>;
}
const host=document.createElement('div');host.id='employee-center-launcher';document.body.appendChild(host);createRoot(host).render(<Launcher/>);
