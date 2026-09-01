import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{Bread}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{BakeryWorkspace}from'./bakery';
import'./bakery-entry.css';

function hasBakery(context:WorkforceContext){return(context.permissions['bakery.access']||'none')!=='none'}
function BakeryLauncher(){const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(r.context&&hasBakery(r.context)?r.context:null)}catch{if(active)setContext(null)}};refresh();window.addEventListener('focus',refresh);const timer=window.setInterval(refresh,5000);return()=>{active=false;window.removeEventListener('focus',refresh);window.clearInterval(timer)}},[]);if(!context)return null;return <><button className="bakery-launcher" onClick={()=>setOpen(true)}><Bread size={18}/><span>Bakery ERP</span></button>{open&&<BakeryWorkspace context={context} onClose={()=>setOpen(false)}/>}</>}
const host=document.createElement('div');host.id='bakery-workspace-launcher';document.body.appendChild(host);createRoot(host).render(<BakeryLauncher/>);