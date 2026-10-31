import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{Gauge}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{OwnerIntelligence}from'./owner-intelligence';
import'./owner-intelligence-entry.css';
function hasOwnerAccess(context:WorkforceContext){return(context.permissions['dashboard.access']==='manage'||context.roles.some(role=>['owner','group_admin'].includes(role.code)))}
function Launcher(){const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(r.context&&hasOwnerAccess(r.context)?r.context:null)}catch{if(active)setContext(null)}};void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);const timer=window.setInterval(()=>void refresh(),120000);return()=>{active=false;window.removeEventListener('focus',focus);window.clearInterval(timer)}},[]);if(!context)return null;return <><button type="button" className="owner-intelligence-launcher" aria-label="Open Owner Intelligence" aria-haspopup="dialog" title="Open Owner Intelligence" onClick={()=>setOpen(true)}><Gauge size={18}/><span>Owner Intelligence</span></button>{open&&<OwnerIntelligence context={context} onClose={()=>setOpen(false)}/>}</>}
const host=document.createElement('div');host.id='owner-intelligence-launcher';document.body.appendChild(host);createRoot(host).render(<Launcher/>);
