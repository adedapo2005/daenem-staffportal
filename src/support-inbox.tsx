import { useEffect,useState } from 'react';
import { CheckCircle2,ShieldCheck,X } from 'lucide-react';
import { api,clearPortalAuthCache,type WorkforceContext } from './auth';
import './support-inbox.css';

type Command={id:string;action:'refresh_permissions'|'clear_portal_cache'|'reset_layout'|'reset_theme'|'force_reload'|'rebuild_workspace';reason:string};
type Assistance={id:string;purpose:string;accessMode:string;requestedByName:string;companyName:string;expiresAt:string};
type Inbox={commands:Command[];assistanceRequests:Assistance[]};

function portalStorageKeys(){const keys:string[]=[];for(let index=0;index<localStorage.length;index+=1){const key=localStorage.key(index);if(key&&(key.startsWith('daenem-')||key.startsWith('workforce-')))keys.push(key)}return keys.filter((key)=>key!=='daenem-workforce-device-id')}
async function clearPortalCaches(){if(!('caches'in window))return;const keys=await caches.keys();await Promise.all(keys.filter((key)=>key.startsWith('daenem-')||key.includes('workforce')).map((key)=>caches.delete(key)))}
async function execute(command:Command){
  if(command.action==='reset_theme')localStorage.removeItem('workforce-theme');
  if(command.action==='reset_layout'){for(const key of portalStorageKeys().filter((item)=>item.includes('navigation')||item.includes('layout')))localStorage.removeItem(key)}
  if(command.action==='clear_portal_cache'||command.action==='rebuild_workspace'){
    for(const key of portalStorageKeys())localStorage.removeItem(key);
    await clearPortalCaches();
  }
  if(['refresh_permissions','clear_portal_cache','force_reload','rebuild_workspace'].includes(command.action))clearPortalAuthCache();
}

export default function SupportInbox({context}:{context:WorkforceContext}){
  const[inbox,setInbox]=useState<Inbox>({commands:[],assistanceRequests:[]}),[message,setMessage]=useState('');
  async function poll(){if(document.visibilityState!=='visible'||!navigator.onLine)return;try{const result=await api<Inbox>('/api/support/mine');setInbox(result);const command=result.commands[0];if(!command)return;try{await execute(command);await api('/api/support/command/ack',{method:'POST',body:JSON.stringify({commandId:command.id,ok:true,resultNote:'Command completed by the active Staff Portal workspace.'})});if(['refresh_permissions','clear_portal_cache','reset_layout','reset_theme','force_reload','rebuild_workspace'].includes(command.action))window.location.reload()}catch(error){await api('/api/support/command/ack',{method:'POST',body:JSON.stringify({commandId:command.id,ok:false,resultNote:(error as Error).message})}).catch(()=>undefined)}}catch{/* Offline and permission-safe fallback: try again on focus. */}}
  useEffect(()=>{void poll();const focus=()=>void poll(),visible=()=>{if(document.visibilityState==='visible')void poll()};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);const timer=window.setInterval(()=>void poll(),120000);return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);window.clearInterval(timer)}},[context.employee.id]);
  async function respond(request:Assistance,decision:'approve'|'decline'){try{const result=await api<{message:string}>('/api/support/assistance/respond',{method:'POST',body:JSON.stringify({supportSessionId:request.id,decision})});setMessage(result.message);setInbox((current)=>({...current,assistanceRequests:current.assistanceRequests.filter((item)=>item.id!==request.id)}))}catch(error){setMessage((error as Error).message)}}
  const request=inbox.assistanceRequests[0];if(!request&&!message)return null;
  return <aside className="support-inbox" aria-live="polite">{request?<><span><ShieldCheck size={20}/></span><div><small>TIME-LIMITED SUPPORT REQUEST · {request.companyName}</small><strong>{request.requestedByName} requested {request.accessMode.replaceAll('_',' ')} assistance</strong><p>{request.purpose}</p><em>No password, session token or payment credential will be shown. You can decline.</em><div><button onClick={()=>void respond(request,'approve')}><CheckCircle2 size={15}/>Approve</button><button onClick={()=>void respond(request,'decline')}><X size={15}/>Decline</button></div></div></>:<><span><CheckCircle2 size={20}/></span><div><strong>{message}</strong><button className="support-inbox-dismiss" onClick={()=>setMessage('')}>Dismiss</button></div></>}</aside>;
}
