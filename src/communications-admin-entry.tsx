import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{MessageSquare,RefreshCw,Save,ShieldCheck,X}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import'./communications-admin.css';

type Rule={enabled:boolean;aiEnabled:boolean;autoGenerate:boolean;autoSend:boolean;requireHumanApproval:boolean;channels:string[];languages:string[];maxCharacters:number};
type Policy={companyId:string;eventId:string;revision:string;global:Rule;useCase:Rule};
type GlobalSettings=Record<string,unknown>;
const events=[
 ['hr.onboarding.reminder','Onboarding reminder'],
 ['hr.training.due','Training due reminder'],
 ['hr.attendance.incomplete','Attendance record reminder'],
 ['hr.shift.changed','Shift / schedule change'],
 ['hr.leave.status_ready','Leave decision available'],
]as const;

function owner(context:WorkforceContext){
 return context.roles.some(role=>['owner','group_admin'].includes(role.code));
}
function canManage(context:WorkforceContext,companyId:string){
 if(owner(context))return true;
 return context.companyPermissions?.[companyId]?.['communications.hr.manage']==='manage';
}

function CommunicationsAdmin({context,onClose}:{context:WorkforceContext;onClose:()=>void}){
 const safeCompanies=context.companies.filter(company=>!/farm/i.test(`${company.id} ${company.code} ${company.name}`));
 const[companyId,setCompanyId]=useState(safeCompanies[0]?.id||'');
 const[eventId,setEventId]=useState<string>(events[0][0]);
 const[policy,setPolicy]=useState<Policy|null>(null);
 const[globals,setGlobals]=useState<GlobalSettings>({});
 const[busy,setBusy]=useState('');
 const[message,setMessage]=useState('');
 const globalAdmin=owner(context);
 const manageable=canManage(context,companyId);
 async function load(){
  if(!companyId)return;
  setBusy('load');setMessage('');
  try{
   const policyResult=await api<Policy>(`/api/communications/admin/policy?companyId=${encodeURIComponent(companyId)}&eventId=${encodeURIComponent(eventId)}`);
   setPolicy(policyResult);
   if(globalAdmin){
    const globalResult=await api<{settings:GlobalSettings}>('/api/communications/admin/global');
    setGlobals(globalResult.settings||{});
   }
  }catch(error){setMessage((error as Error).message)}
  finally{setBusy('')}
 }
 useEffect(()=>{void load()},[companyId,eventId]);

 async function savePolicy(){
  if(!policy||!manageable)return;
  setBusy('policy');setMessage('');
  try{
   await api('/api/communications/admin/policy',{method:'POST',body:JSON.stringify({
    companyId,eventId,
    enabled:policy.useCase.enabled,
    aiEnabled:policy.useCase.aiEnabled,
    autoGenerate:policy.useCase.autoGenerate,
    autoSend:policy.useCase.autoSend,
    requireHumanApproval:policy.useCase.requireHumanApproval,
    channels:policy.useCase.channels,
    languages:policy.useCase.languages,
    maxCharacters:policy.useCase.maxCharacters,
   })});
   setMessage('Communication policy saved and versioned.');
   await load();
  }catch(error){setMessage((error as Error).message)}
  finally{setBusy('')}
 }

 async function saveGlobal(next:GlobalSettings){
  if(!globalAdmin)return;
  setBusy('global');setMessage('');
  try{
   await api('/api/communications/admin/global',{method:'POST',body:JSON.stringify({settings:next})});
   setGlobals(current=>({...current,...next}));
   setMessage('Global communication controls saved.');
  }catch(error){setMessage((error as Error).message)}
  finally{setBusy('')}
 }
 const rule=policy?.useCase;
 const company=context.companies.find(item=>item.id===companyId);
 return <div className="comm-admin-backdrop" onClick={onClose}>
  <section className="comm-admin-shell" onClick={event=>event.stopPropagation()}>
   <header className="comm-admin-header">
    <div><span>STAFF PORTAL COMMUNICATIONS</span><h2>Communications Control Center</h2><p>Configure Staff Portal communication policy. Live Meta release remains separately controlled.</p></div>
    <button onClick={onClose} aria-label="Close communications control"><X size={20}/></button>
   </header>
   {message&&<div className="comm-admin-message">{message}</div>}
   <div className="comm-admin-toolbar">
    <label><span>Company</span><select value={companyId} onChange={event=>setCompanyId(event.target.value)}>{safeCompanies.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label><span>Use case</span><select value={eventId} onChange={event=>setEventId(event.target.value)}>{events.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <button onClick={()=>void load()} disabled={busy==='load'}><RefreshCw size={16}/>Refresh</button>
   </div>

   {globalAdmin&&<section className="comm-admin-card">
    <div className="comm-admin-title"><ShieldCheck size={19}/><div><h3>Global controls</h3><p>These can narrow eligibility. The live-send release gate is not editable here.</p></div></div>
    <div className="comm-admin-grid">
     <label className="comm-toggle"><input type="checkbox" checked={Boolean(globals['communications.kill_switch']??true)} onChange={event=>void saveGlobal({'communications.kill_switch':event.target.checked})}/><span><b>Emergency kill switch</b><small>Keep enabled to stop communication processing.</small></span></label>
     <label className="comm-toggle"><input type="checkbox" checked={Boolean(globals['communications.whatsapp_enabled']??false)} onChange={event=>void saveGlobal({'communications.whatsapp_enabled':event.target.checked})}/><span><b>WhatsApp eligible</b><small>Eligibility only; this does not activate provider sending.</small></span></label>
     <label className="comm-toggle"><input type="checkbox" checked={Boolean(globals['communications.ai_enabled']??false)} onChange={event=>void saveGlobal({'communications.ai_enabled':event.target.checked})}/><span><b>AI drafting eligible</b><small>AI remains draft-only and human reviewed.</small></span></label>
     <label><span>Daily AI draft limit</span><input type="number" min={0} max={10000} value={Number(globals['communications.ai_daily_limit']??25)} onChange={event=>void saveGlobal({'communications.ai_daily_limit':Number(event.target.value)})}/></label>
     <label><span>Daily provider-send budget</span><input type="number" min={0} max={100000} value={Number(globals['communications.provider_daily_limit']??250)} onChange={event=>void saveGlobal({'communications.provider_daily_limit':Number(event.target.value)})}/></label>
    </div>
    <div className="comm-release-note">Live Meta provider gate remains release-controlled and defaults off.</div>
   </section>}
   <section className="comm-admin-card">
    <div className="comm-admin-title"><MessageSquare size={19}/><div><h3>{company?.name||'Company'} · {events.find(item=>item[0]===eventId)?.[1]}</h3><p>Policy revision: {policy?.revision||'loading'}</p></div></div>
    {rule&&<div className="comm-admin-grid">
     <label className="comm-toggle"><input type="checkbox" disabled={!manageable} checked={rule.enabled} onChange={event=>setPolicy({...policy!,useCase:{...rule,enabled:event.target.checked}})}/><span><b>Use case enabled</b><small>Still subject to higher-scope denies.</small></span></label>
     <label className="comm-toggle"><input type="checkbox" disabled={!manageable} checked={rule.aiEnabled} onChange={event=>setPolicy({...policy!,useCase:{...rule,aiEnabled:event.target.checked}})}/><span><b>AI drafting</b><small>Catalog restrictions still apply.</small></span></label>
     <label className="comm-toggle"><input type="checkbox" disabled={!manageable} checked={rule.autoGenerate} onChange={event=>setPolicy({...policy!,useCase:{...rule,autoGenerate:event.target.checked}})}/><span><b>Automatic draft generation</b><small>Draft creation only; no send authority.</small></span></label>
     <label className="comm-toggle"><input type="checkbox" disabled={!manageable} checked={rule.autoSend} onChange={event=>setPolicy({...policy!,useCase:{...rule,autoSend:event.target.checked}})}/><span><b>Deterministic automatic delivery eligible</b><small>AI-generated messages remain excluded.</small></span></label>
     <label className="comm-toggle"><input type="checkbox" disabled={!manageable} checked={rule.requireHumanApproval} onChange={event=>setPolicy({...policy!,useCase:{...rule,requireHumanApproval:event.target.checked}})}/><span><b>Human approval required</b><small>Keep enabled for sensitive HR and AI drafts.</small></span></label>
     <label><span>Maximum characters</span><input type="number" min={1} max={4000} disabled={!manageable} value={rule.maxCharacters} onChange={event=>setPolicy({...policy!,useCase:{...rule,maxCharacters:Number(event.target.value)}})}/></label>
     <label><span>Channels</span><select multiple disabled={!manageable} value={rule.channels} onChange={event=>setPolicy({...policy!,useCase:{...rule,channels:Array.from(event.target.selectedOptions).map(option=>option.value)}})}><option value="in_app">In-app</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="push">Push</option></select></label>
    </div>}
    <button className="comm-save" onClick={()=>void savePolicy()} disabled={!manageable||busy==='policy'||!policy}><Save size={16}/>Save use-case policy</button>
   </section>
  </section>
 </div>
}
function Host(){
 const[context,setContext]=useState<WorkforceContext|null>(null);
 const[open,setOpen]=useState(false);
 useEffect(()=>{
  const openRequested=async()=>{
   try{
    const result=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');
    if(result.context){setContext(result.context);setOpen(true)}
   }catch{}
  };
  window.addEventListener('daenem:open-communications-admin',openRequested as EventListener);
  return()=>window.removeEventListener('daenem:open-communications-admin',openRequested as EventListener);
 },[]);
 return open&&context?<CommunicationsAdmin context={context} onClose={()=>setOpen(false)}/>:null;
}
const host=document.createElement('div');
host.id='communications-admin-root';
document.body.appendChild(host);
createRoot(host).render(<Host/>);
