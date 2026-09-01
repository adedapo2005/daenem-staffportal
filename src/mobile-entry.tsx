import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{Smartphone}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{MobileCenter}from'./mobile-center';
import'./mobile-entry.css';

function canOpen(context:WorkforceContext){
 return context.roles.some(role=>role.code==='owner') ||
   (context.permissions['mobile.install']||'none')!=='none' ||
   (context.permissions['mobile.tracking_admin']||'none')!=='none';
}

function Launcher(){
 const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(r.context&&canOpen(r.context)?r.context:null)}catch{if(active)setContext(null)}};void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);const timer=window.setInterval(()=>void refresh(),120000);return()=>{active=false;window.removeEventListener('focus',focus);window.clearInterval(timer)}},[]);
 if(!context)return null;
 return <><button className="mobile-center-launcher" onClick={()=>setOpen(true)}><Smartphone size={18}/><span>App & GPS</span></button>{open&&<MobileCenter context={context} onClose={()=>setOpen(false)}/>}</>;
}

const host=document.createElement('div');host.id='mobile-center-launcher';document.body.appendChild(host);createRoot(host).render(<Launcher/>);
