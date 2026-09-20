import React,{useCallback,useEffect,useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import{Archive,ArrowLeft,AtSign,CheckCheck,ChevronDown,Circle,Clock3,Inbox,MessageCircleMore,MoreHorizontal,NotebookPen,RefreshCw,Search,Send,ShieldCheck,Sparkles,UserCheck,X}from'lucide-react';
import{api,hasWorkforcePermission,type WorkforceContext}from'./auth';
import{resolveCommunicationCompanyUi}from'./communications-company-ui';
import'./communications-inbox.css';

type Conversation={id:string;companyId?:string|null;senderId?:string|null;routingMode?:'shared_group'|'company_dedicated'|string|null;senderDisplayName?:string|null;customerWaId:string;customerDisplayName?:string|null;status:'open'|'pending'|'resolved'|'closed';assignedEmployeeId?:string|null;unreadCount:number;lastMessageAt:string;lastMessage?:string|null};
type Message={id:string;direction:'inbound'|'outbound';providerMessageId?:string|null;messageType:string;body?:string|null;status:string;replyMode?:'freeform'|'template'|string|null;templateName?:string|null;templateLanguage?:string|null;staffEmployeeId?:string|null;providerTimestamp?:string|null;createdAt:string};
type SendReadiness={messageId:string;ready:boolean;liveSend:boolean;reason?:string|null;tokenConfigured:boolean;idempotencyKey?:string|null};
type Note={id:string;body:string;authorEmployeeId:string;createdAt:string;firstName?:string|null;lastName?:string|null};
type ReplyPolicy={serviceWindowState:'open'|'closed'|'unavailable';lastCustomerMessageAt?:string|null;serviceWindowExpiresAt?:string|null;composerState:'routing_required'|'send_ready'|'template_required';templateRequired:boolean;liveSend:false};
type ApprovedTemplate={id:string;name:string;language:string;category:string;bodyTemplate:string;revision:number;providerTemplateId?:string|null};
type Thread={conversation:Conversation&{connectionId?:string|null};messages:Message[];notes:Note[];approvedTemplates:ApprovedTemplate[];replyPolicy:ReplyPolicy};
type CompanyOption={id:string;code:string;name:string;label:string;shortLabel:string;uiKey:string;monogram:string;descriptor:string};
const cleanCompanies=(context:WorkforceContext)=>context.companies.filter(company=>!/farm/i.test(`${company.id} ${company.code} ${company.name}`));
const companyOption=(company:WorkforceContext['companies'][number]):CompanyOption=>({id:company.id,code:company.code,name:company.name,...resolveCommunicationCompanyUi(company)});
const displayName=(conversation:Conversation)=>conversation.customerDisplayName?.trim()||`WhatsApp ${conversation.customerWaId.slice(-4)}`;
const initials=(conversation:Conversation)=>{const name=displayName(conversation);const parts=name.split(/\s+/).filter(Boolean);return(parts[0]?.[0]||'W')+(parts[1]?.[0]||'')};
const time=(value?:string|null)=>value?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(value)):'';
const dateTime=(value?:string|null)=>value?new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(value)):'';

function StatusIcon({status}:{status:string}){
 if(status==='read')return <CheckCheck size={14}/>;
 if(status==='delivered')return <CheckCheck size={14}/>;
 if(status==='sent'||status==='accepted')return <CheckCheck size={14}/>;
 if(status==='failed')return <Circle size={11}/>;
 return <Clock3 size={12}/>;
}
function EmptyState({title,detail}:{title:string;detail:string}){
 return <div className="wa-empty"><span><MessageCircleMore size={28}/></span><h3>{title}</h3><p>{detail}</p></div>
}
function Pill({children,tone='neutral'}:{children:React.ReactNode;tone?:'neutral'|'open'|'pending'}){
 return <span className={`wa-pill wa-pill-${tone}`}>{children}</span>
}

function WhatsAppInbox({context,onClose}:{context:WorkforceContext;onClose:()=>void}){
 const companies=useMemo(()=>cleanCompanies(context),[context]);
 const companyOptions=useMemo(()=>companies.map(companyOption),[companies]);
 const companyOptionById=useMemo(()=>new Map(companyOptions.map(item=>[item.id,item])),[companyOptions]);
 const isGroupOperator=context.roles.some(role=>['owner','group_admin'].includes(role.code));
 const canRouteFor=(id:string)=>isGroupOperator||hasWorkforcePermission(context,'communications.support.inbox.assign','edit',id)||hasWorkforcePermission(context,'communications.support.manage','manage',id);
 const routeOptions=useMemo(()=>companyOptions.filter(item=>canRouteFor(item.id)),[companyOptions,context,isGroupOperator]);
 const[companyId,setCompanyId]=useState(companies[0]?.id||'');
 const[items,setItems]=useState<Conversation[]>([]);
 const[selectedId,setSelectedId]=useState('');
 const[thread,setThread]=useState<Thread|null>(null);
 const[query,setQuery]=useState('');
 const[status,setStatus]=useState('open');
 const[loading,setLoading]=useState(false);
 const[threadLoading,setThreadLoading]=useState(false);
 const[message,setMessage]=useState('');
 const[reply,setReply]=useState('');
 const[templateId,setTemplateId]=useState('');
 const[note,setNote]=useState('');
 const[routeTarget,setRouteTarget]=useState('');
 const[activity,setActivity]=useState('');
 const[sendReadiness,setSendReadiness]=useState<SendReadiness|null>(null);
 const[selectedPanel,setSelectedPanel]=useState<'notes'|'details'>('notes');
 const selected=items.find(item=>item.id===selectedId)||thread?.conversation||null;

 const loadInbox=useCallback(async(silent=false)=>{
  if(!companyId)return;
  if(!silent)setLoading(true);
  try{
   const result=await api<{conversations:Conversation[]}>(`/api/communications/inbox?companyId=${encodeURIComponent(companyId)}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(query.trim())}`);
   setItems(result.conversations||[]);
   setSelectedId(current=>current&&result.conversations?.some(item=>item.id===current)?current:(result.conversations?.[0]?.id||''));
   setMessage('');
  }catch(error){setMessage((error as Error).message)}
  finally{if(!silent)setLoading(false)}
 },[companyId,status,query]);

 const loadThread=useCallback(async(id:string,silent=false)=>{
  if(!id||!companyId){setThread(null);return}
  if(!silent)setThreadLoading(true);
  try{
   const result=await api<Thread>(`/api/communications/inbox/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`);
   setThread(result);
   setMessage('');
  }catch(error){setMessage((error as Error).message)}
  finally{if(!silent)setThreadLoading(false)}
 },[companyId]);

 useEffect(()=>{const timer=window.setTimeout(()=>void loadInbox(),180);return()=>window.clearTimeout(timer)},[loadInbox]);
 useEffect(()=>{void loadThread(selectedId);setRouteTarget('');setTemplateId('');setSendReadiness(null)},[selectedId,loadThread]);
 useEffect(()=>{
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine){void loadInbox(true);if(selectedId)void loadThread(selectedId,true)}},15000);
  return()=>window.clearInterval(timer)
 },[loadInbox,loadThread,selectedId]);

 async function mutate(action:'read'|'assign'|'notes'|'reply',body:Record<string,unknown>={}){
  if(!selectedId||!companyId)return;
  setActivity(action);setMessage('');
  try{
   await api(`/api/communications/inbox/${encodeURIComponent(selectedId)}/${action}`,{method:'POST',body:JSON.stringify({companyId,...body})});
   if(action==='reply'){setReply('');setTemplateId('')}
   if(action==='notes')setNote('');
   await Promise.all([loadInbox(true),loadThread(selectedId,true)]);
  }catch(error){setMessage((error as Error).message)}
  finally{setActivity('')}
 }

 function selectConversation(id:string){setSelectedId(id);void mutateRead(id)}
 async function mutateRead(id:string){
  if(!companyId)return;
  try{await api(`/api/communications/inbox/${encodeURIComponent(id)}/read`,{method:'POST',body:JSON.stringify({companyId})});setItems(current=>current.map(item=>item.id===id?{...item,unreadCount:0}:item))}catch{}
 }
 async function prepareSend(messageId:string){
  if(!selectedId||!companyId||activity==='prepare-send')return;
  setActivity('prepare-send');setMessage('');
  try{
   const result=await api<Omit<SendReadiness,'messageId'>>(`/api/communications/inbox/${encodeURIComponent(selectedId)}/messages/${encodeURIComponent(messageId)}/prepare-send`,{method:'POST',body:JSON.stringify({companyId})});
   setSendReadiness({messageId,...result});
   if(result.ready)setMessage('WhatsApp send readiness confirmed.');
   else setMessage(result.reason==='LIVE_SEND_DISABLED'?'Draft is valid, but live WhatsApp sending is still release-gated.':result.reason==='META_SYSTEM_USER_TOKEN_MISSING'?'Add the Meta System User Access Token in Communications Control Center before provider sending can become ready.':`WhatsApp send is not ready: ${result.reason||'configuration incomplete'}.`);
  }catch(error){setSendReadiness(null);setMessage((error as Error).message)}
  finally{setActivity('')}
 }
 async function sendDraft(messageId:string){
  if(!selectedId||!companyId||activity==='send'||!sendReadiness?.ready||!sendReadiness.liveSend||sendReadiness.messageId!==messageId)return;
  setActivity('send');setMessage('');
  try{
   const result=await api<{accepted:boolean;providerMessageId?:string|null}>(`/api/communications/inbox/${encodeURIComponent(selectedId)}/messages/${encodeURIComponent(messageId)}/send`,{method:'POST',body:JSON.stringify({companyId})});
   setSendReadiness(null);
   setMessage(result.accepted?'Message accepted by WhatsApp.':'WhatsApp did not accept the message.');
   await Promise.all([loadInbox(true),loadThread(selectedId,true)]);
  }catch(error){setMessage((error as Error).message)}
  finally{setActivity('')}
 }
 function readinessReason(reason?:string|null){
  if(reason==='LIVE_SEND_DISABLED')return 'Release gate is off';
  if(reason==='META_SYSTEM_USER_TOKEN_MISSING')return 'Meta System User token is missing';
  return reason?reason.replaceAll('_',' ').toLowerCase():'Ready';
 }
 async function routeConversation(){
  if(!selectedId||!companyId||!routeTarget||activity==='route')return;
  setActivity('route');setMessage('');
  try{
   await api(`/api/communications/inbox/${encodeURIComponent(selectedId)}/route`,{method:'POST',body:JSON.stringify({companyId,targetCompanyId:routeTarget})});
   setThread(current=>current?{...current,conversation:{...current.conversation,companyId:routeTarget}}:current);
   setItems(current=>current.map(item=>item.id===selectedId?{...item,companyId:routeTarget}:item));
   setCompanyId(routeTarget);
   setRouteTarget('');
   setMessage('Conversation routed successfully.');
  }catch(error){setMessage((error as Error).message)}
  finally{setActivity('')}
 }
 const company=companies.find(item=>item.id===companyId);
 const selectedCompany=selected?.companyId?companyOptionById.get(selected.companyId)||null:null;
 const replyPolicy=thread?.replyPolicy||null;
 const approvedTemplates=thread?.approvedTemplates||[];
 const selectedTemplate=approvedTemplates.find(item=>item.id===templateId)||null;
 const latestDraft=thread?.messages.slice().reverse().find(item=>item.direction==='outbound'&&item.status==='draft')||null;
 const currentReadiness=latestDraft&&sendReadiness?.messageId===latestDraft.id?sendReadiness:null;
 const canRouteSelected=Boolean(selected&&selected.routingMode==='shared_group'&&!selected.companyId&&canRouteFor(companyId)&&routeOptions.length);
 return <div className="wa-backdrop" role="dialog" aria-modal="true" aria-label="WhatsApp Inbox">
  <section className="wa-shell">
   <header className="wa-topbar">
    <div className="wa-title"><span className="wa-brand-icon"><MessageCircleMore size={20}/></span><div><small>STAFF PORTAL · CUSTOMER COMMUNICATIONS</small><h2>WhatsApp Inbox</h2></div></div>
    <div className="wa-top-actions">
     <Pill><ShieldCheck size={13}/>Staff-only</Pill>
     <Pill tone="pending"><Circle size={9}/>Provider send release-gated</Pill>
     <button className="wa-icon-btn" onClick={()=>void loadInbox()} aria-label="Refresh inbox"><RefreshCw size={18}/></button>
     <button className="wa-icon-btn" onClick={onClose} aria-label="Close inbox"><X size={19}/></button>
    </div>
   </header>

   <div className="wa-toolbar">
    <label className="wa-company"><span>{company?.name||'Company'}</span><ChevronDown size={14}/><select value={companyId} onChange={event=>{setCompanyId(event.target.value);setSelectedId('')}}>{companies.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="wa-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search customer or WhatsApp number"/></label>
    <div className="wa-filters">
     {['open','pending','resolved','all'].map(value=><button key={value} className={status===value?'active':''} onClick={()=>setStatus(value)}>{value[0].toUpperCase()+value.slice(1)}</button>)}
    </div>
   </div>
   {message&&<div className="wa-alert">{message}</div>}
   <div className="wa-layout">
    <aside className="wa-conversation-list">
     <div className="wa-list-heading"><div><strong>Conversations</strong><span>{items.length}</span></div><small>{loading?'Refreshing…':'Newest activity first'}</small></div>
     <div className="wa-list-scroll">{!items.length&&!loading?<EmptyState title="No conversations here" detail="New customer WhatsApp messages will appear here after the Meta webhook is connected."/>:items.map(item=>{const routedCompany=item.companyId?companyOptionById.get(item.companyId)||null:null;return <button key={item.id} className={`wa-conversation ${selectedId===item.id?'selected':''}`} onClick={()=>selectConversation(item.id)}>
       <span className="wa-avatar">{initials(item).toUpperCase()}</span>
       <span className="wa-conversation-copy"><span className="wa-conversation-row"><strong>{displayName(item)}</strong><time>{time(item.lastMessageAt)}</time></span><span className="wa-preview">{item.lastMessage||'Message received'}</span><span className="wa-conversation-meta"><Pill tone={item.status==='open'?'open':item.status==='pending'?'pending':'neutral'}>{item.status}</Pill>{item.routingMode==='shared_group'&&(routedCompany?<span data-company={routedCompany.uiKey} className="wa-company-chip compact"><b>{routedCompany.monogram}</b>{routedCompany.shortLabel}</span>:<span className="wa-route-meta unrouted">Unrouted</span>)}{item.assignedEmployeeId===context.employee.id&&<span><UserCheck size={12}/>Assigned to you</span>}</span></span>
       {item.unreadCount>0&&<span className="wa-unread">{item.unreadCount>99?'99+':item.unreadCount}</span>}
      </button>})}</div>
    </aside>

    <main className="wa-thread">
     {!selected?<EmptyState title="Choose a conversation" detail="Select a customer conversation to review the thread and prepare a reply."/>:<>
      <header className="wa-thread-header">
       <button className="wa-mobile-back" onClick={()=>setSelectedId('')}><ArrowLeft size={18}/></button>
       <span className="wa-avatar large">{initials(selected).toUpperCase()}</span>
       <div className="wa-thread-identity"><strong>{displayName(selected)}</strong><span><AtSign size={12}/>{selected.customerWaId}</span>{selectedCompany&&<span data-company={selectedCompany.uiKey} className="wa-company-chip"><b>{selectedCompany.monogram}</b>{selectedCompany.label}</span>}</div>
       <div className="wa-thread-actions">
        {selected.assignedEmployeeId===context.employee.id?<button onClick={()=>void mutate('assign',{employeeId:null})} disabled={activity==='assign'}>Unassign</button>:<button onClick={()=>void mutate('assign',{employeeId:context.employee.id})} disabled={activity==='assign'}><UserCheck size={15}/>Assign to me</button>}
        <button className="wa-icon-btn"><MoreHorizontal size={18}/></button>
       </div>
      </header>
      <section data-company={selectedCompany?.uiKey||'unrouted'} className={`wa-route-bar ${selected.routingMode==='shared_group'?(selected.companyId?'routed':'unrouted'):'dedicated'}`}>
       <div className="wa-route-copy"><small>COMPANY ROUTING</small><strong>{selectedCompany?.label||(selected.routingMode==='shared_group'?'Shared group · unrouted':'Dedicated company')}</strong>{selectedCompany?<><span className="wa-route-trail">DAENEM Group <b>→</b> {selectedCompany.shortLabel}</span><span>{selectedCompany.descriptor}</span></>:<span>{selected.routingMode==='shared_group'?'Choose the DAENEM company that should own this customer conversation.':'This sender is dedicated to its configured company.'}</span>}</div>
       {selected.routingMode==='shared_group'&&!selected.companyId&&<div className="wa-route-controls">
        <label><span>{routeTarget?(routeOptions.find(item=>item.id===routeTarget)?.label||'Selected company'):'Select company'}</span><select aria-label="Route conversation to company" value={routeTarget} onChange={event=>setRouteTarget(event.target.value)} disabled={!canRouteSelected||activity==='route'}><option value="">Select company</option>{routeOptions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown size={14}/></label>
        <button disabled={!canRouteSelected||!routeTarget||activity==='route'} onClick={()=>void routeConversation()}>{activity==='route'?'Routing…':'Route conversation'}</button>
       </div>}
      </section>
      <section className="wa-message-scroll">
       {threadLoading&&!thread?<div className="wa-loading">Loading conversation…</div>:thread?.messages.map((item,index)=><article key={item.id} className={`wa-message ${item.direction}`}>
        <div className="wa-bubble">
         {item.messageType!=='text'&&<small>{item.messageType.toUpperCase()} MESSAGE</small>}
         <p>{item.body||`[${item.messageType}]`}</p>
         <span><time>{dateTime(item.providerTimestamp||item.createdAt)}</time>{item.direction==='outbound'&&<StatusIcon status={item.status}/>}</span>
        </div>
        {index===thread.messages.length-1&&item.direction==='inbound'&&<small className="wa-last-inbound">Customer message</small>}
       </article>)}
      </section>

      <section className="wa-composer">
       {replyPolicy&&<div className={`wa-reply-policy ${replyPolicy.composerState}`}>
        <div><small>REPLY STATE</small><strong>{replyPolicy.composerState==='routing_required'?'Route required':replyPolicy.composerState==='send_ready'?'Service window open':'Template required'}</strong></div>
        <span>{replyPolicy.composerState==='routing_required'?'Route this conversation to a company before drafting a reply.':replyPolicy.composerState==='send_ready'?`Free-form reply eligible until ${dateTime(replyPolicy.serviceWindowExpiresAt)}. Provider sending remains release-gated.`:'The 24-hour customer service window is closed or unavailable. An approved WhatsApp template will be required for live sending.'}</span>
       </div>}
       {replyPolicy?.composerState==='template_required'&&<div className="wa-template-compose">
        <label><span>Approved WhatsApp template</span><select value={templateId} onChange={event=>setTemplateId(event.target.value)}><option value="">Select approved template</option>{approvedTemplates.map(item=><option key={item.id} value={item.id}>{item.name} · {item.language} · {item.category}</option>)}</select><ChevronDown size={14}/></label>
        {selectedTemplate?<div className="wa-template-preview"><header><strong>{selectedTemplate.name}</strong><span>{selectedTemplate.language} · {selectedTemplate.category} · r{selectedTemplate.revision}</span></header><p>{selectedTemplate.bodyTemplate}</p></div>:<p className="wa-template-empty">{approvedTemplates.length?'Select a template to review the exact approved body before saving the draft.':'No internally and provider-approved WhatsApp templates are available for this company yet.'}</p>}
       </div>}
       {latestDraft&&<div className={`wa-send-readiness ${currentReadiness?.ready?'ready':currentReadiness?'blocked':'unchecked'}`}>
        <div className="wa-send-readiness-copy"><small>SEND READINESS</small><strong>{currentReadiness?.ready?'Ready for provider handoff':currentReadiness?readinessReason(currentReadiness.reason):'Not checked yet'}</strong><span>{latestDraft.replyMode==='template'?`Approved template draft${latestDraft.templateName?` · ${latestDraft.templateName}`:''}`:'Free-form draft inside the customer service window'} · provider send requires a separate release gate.</span></div>
        <div className="wa-send-readiness-actions">
         {currentReadiness&&<span className="wa-readiness-facts"><b>{currentReadiness.tokenConfigured?'Meta token configured':'Meta token missing'}</b><b>{currentReadiness.liveSend?'Live gate on':'Live gate off'}</b></span>}
         <button className="wa-readiness-check" disabled={activity==='prepare-send'||activity==='send'} onClick={()=>void prepareSend(latestDraft.id)}><ShieldCheck size={15}/>{activity==='prepare-send'?'Checking…':'Check readiness'}</button>
         <button className="wa-live-send" disabled={!currentReadiness?.ready||!currentReadiness.liveSend||activity==='send'} onClick={()=>void sendDraft(latestDraft.id)}><Send size={15}/>{activity==='send'?'Sending…':'Send to WhatsApp'}</button>
        </div>
       </div>}
       <div className="wa-composer-tools">
        <button className="wa-ai-button" onClick={()=>setMessage('AI reply assistance is reserved for the governed composer and is not active in this staging foundation yet.')}><Sparkles size={15}/>AI assist</button>
        <span>Human review required · provider release gate remains separate</span>
       </div>
       {replyPolicy?.composerState!=='template_required'&&<textarea value={reply} onChange={event=>setReply(event.target.value)} maxLength={4096} disabled={replyPolicy?.composerState==='routing_required'} placeholder={replyPolicy?.composerState==='routing_required'?'Route this conversation before drafting a reply.':'Write a customer reply…'}/>}
       <footer><span>{replyPolicy?.composerState==='template_required'?(selectedTemplate?'Approved template selected':'Template selection required'):`${reply.length.toLocaleString()} / 4,096`}</span><button className="wa-send-button" disabled={activity==='reply'||replyPolicy?.composerState==='routing_required'||(replyPolicy?.composerState==='template_required'?!templateId:!reply.trim())} onClick={()=>void mutate('reply',replyPolicy?.composerState==='template_required'?{templateId}:{body:reply})}><Send size={16}/>{activity==='reply'?'Saving…':replyPolicy?.composerState==='template_required'?'Save template draft':'Save reply draft'}</button></footer>
      </section>
     </>}
    </main>

    <aside className="wa-side-panel">
     <div className="wa-side-tabs"><button className={selectedPanel==='notes'?'active':''} onClick={()=>setSelectedPanel('notes')}><NotebookPen size={14}/>Notes</button><button className={selectedPanel==='details'?'active':''} onClick={()=>setSelectedPanel('details')}><Inbox size={14}/>Details</button></div>
     {!selected?<EmptyState title="Conversation context" detail="Assignment, internal notes and customer details appear here."/>:selectedPanel==='notes'?<>
      <div className="wa-notes-list">{thread?.notes.length?thread.notes.map(item=><article key={item.id}><header><strong>{[item.firstName,item.lastName].filter(Boolean).join(' ')||'Staff member'}</strong><time>{dateTime(item.createdAt)}</time></header><p>{item.body}</p></article>):<p className="wa-muted">No internal notes yet.</p>}</div>
      <div className="wa-note-compose"><textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={4000} placeholder="Add an internal note. Customers cannot see this."/><button disabled={!note.trim()||activity==='notes'} onClick={()=>void mutate('notes',{body:note})}>Add note</button></div>
     </>:<div className="wa-details">
      <div><span>WhatsApp identity</span><strong>{selected.customerWaId}</strong></div>
      <div><span>Conversation status</span><strong>{selected.status}</strong></div>
      <div><span>Company route</span><strong>{selectedCompany?.label||(selected.routingMode==='shared_group'?'Unrouted shared conversation':'Dedicated company')}</strong>{selectedCompany&&<small className="wa-company-descriptor">{selectedCompany.descriptor}</small>}</div>
      <div><span>Assignment</span><strong>{selected.assignedEmployeeId===context.employee.id?'You':selected.assignedEmployeeId?'Another staff member':'Unassigned'}</strong></div>
      <div><span>Unread</span><strong>{selected.unreadCount||0}</strong></div>
      <div><span>Last activity</span><strong>{dateTime(selected.lastMessageAt)}</strong></div>
      <div><span>Reply eligibility</span><strong>{replyPolicy?.composerState==='send_ready'?'Service window open':replyPolicy?.composerState==='template_required'?'Template required':replyPolicy?.composerState==='routing_required'?'Route required':'Unavailable'}</strong>{replyPolicy?.lastCustomerMessageAt&&<small className="wa-company-descriptor">Last customer message {dateTime(replyPolicy.lastCustomerMessageAt)}</small>}</div>
      <div className="wa-safety"><ShieldCheck size={16}/><p>Customer WhatsApp identity is kept separate from employee authentication and Staff Portal access.</p></div>
     </div>}
    </aside>
   </div>
  </section>
 </div>
}

function Host(){
 const[context,setContext]=useState<WorkforceContext|null>(null);
 const[open,setOpen]=useState(false);
 useEffect(()=>{
  const handler=async()=>{try{const result=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(result.context){setContext(result.context);setOpen(true)}}catch{}};
  window.addEventListener('daenem:open-whatsapp-inbox',handler as EventListener);
  return()=>window.removeEventListener('daenem:open-whatsapp-inbox',handler as EventListener)
 },[]);
 return open&&context?<WhatsAppInbox context={context} onClose={()=>setOpen(false)}/>:null
}
const host=document.createElement('div');
host.id='communications-inbox-root';
document.body.appendChild(host);
createRoot(host).render(<Host/>);
