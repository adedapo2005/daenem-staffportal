import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{Share2}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{SocialEngine}from'./social-engine';
import'./social-entry.css';

function hasSocial(context:WorkforceContext){return Object.entries(context.permissions).some(([key,level])=>key.startsWith('social.')&&level!=='none')}
function Launcher(){const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(r.context&&hasSocial(r.context)?r.context:null)}catch{if(active)setContext(null)}};void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);const timer=window.setInterval(()=>void refresh(),120000);return()=>{active=false;window.removeEventListener('focus',focus);window.clearInterval(timer)}},[]);if(!context)return null;return <><button className="social-engine-launcher" onClick={()=>setOpen(true)}><Share2 size={18}/><span>Social Engine</span></button>{open&&<SocialEngine context={context} onClose={()=>setOpen(false)}/>}</>}
const host=document.createElement('div');host.id='social-engine-launcher';document.body.appendChild(host);createRoot(host).render(<Launcher/>);
