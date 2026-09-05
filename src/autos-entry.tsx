import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{BriefcaseBusiness}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{AutosWorkspace}from'./autos';
import{ModuleExperienceEnvelope,useModuleExperience}from'./module-experience-bridge';
import'./autos-entry.css';
function hasAutos(context:WorkforceContext){return context.roles.some(r=>r.code==='owner')||(context.permissions['autos.access']||'none')!=='none'}
function Launcher(){const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false),experience=useModuleExperience('autos');useEffect(()=>{let active=true;const refresh=async()=>{try{const r=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(r.context&&hasAutos(r.context)?r.context:null)}catch{if(active)setContext(null)}};refresh();const command=(event:Event)=>{if((event as CustomEvent<{module?:string}>).detail?.module==='autos')setOpen(true)};window.addEventListener('focus',refresh);window.addEventListener('daenem:open-module',command as EventListener);const timer=window.setInterval(refresh,120000);return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('daenem:open-module',command as EventListener);window.clearInterval(timer)}},[]);if(!context)return null;return <ModuleExperienceEnvelope experience={experience}><button className="autos-launcher" onClick={()=>setOpen(true)}><BriefcaseBusiness size={18}/><span>Autos DMS</span></button>{open&&<AutosWorkspace context={context} onClose={()=>setOpen(false)}/>}</ModuleExperienceEnvelope>}
const host=document.createElement('div');host.id='autos-workspace-launcher';document.body.appendChild(host);createRoot(host).render(<Launcher/>);