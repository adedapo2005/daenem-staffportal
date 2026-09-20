import React,{useCallback,useEffect,useMemo,useState}from'react';
import{createRoot}from'react-dom/client';
import{Archive,ArrowLeft,AtSign,CheckCheck,ChevronDown,Circle,Clock3,Inbox,MessageCircleMore,MoreHorizontal,NotebookPen,RefreshCw,Search,Send,ShieldCheck,Sparkles,UserCheck,X}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import'./communications-inbox.css';

type Conversation={id:string;customerWaId:string;customerDisplayName?:string|null;status:'open'|'pending'|'resolved'|'closed';assignedEmployeeId?:string|null;unreadCount:number;lastMessageAt:string;lastMessage?:string|null};
type Message={id:string;direction:'inbound'|'outbound';providerMessageId?:string|null;messageType:string;body?:string|null;status:string;staffEmployeeId?:string|null;providerTimestamp?:string|null;createdAt:string};
type Note={id:string;body:string;authorEmployeeId:string;createdAt:string;firstName?:string|null;lastName?:string|null};
type Thread={conversation:Conversation&{connectionId?:string};messages:Message[];notes:Note[]};

const cleanCompanies=(context:WorkforceContext)=>context.companies.filter(company=>!/farm/i.test(`${company.id} ${company.code} ${company.name}`));
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
 const[note,setNote]=useState('');
 const[activity,setActivity]=useState('');
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
 useEffect(()=>{void loadThread(selectedId)},[selectedId,loadThread]);
 useEffect(()=>{
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine){void loadInbox(true);if(selectedId)void loadThread(selectedId,true)}},15000);
  return()=>window.clearInterval(timer)
 },[loadInbox,loadThread,selectedId]);

 async function mutate(action:'read'|'assign'|'notes'|'reply',body:Record<string,unknown>={}){
  if(!selectedId||!companyId)return;
  setActivity(action);setMessage('');
  try{
   await api(`/api/communications/inbox/${encodeURIComponent(selectedId)}/${action}`,{method:'POST',body:JSON.stringify({companyId,...body})});
   if(action==='reply')setReply('');
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
 const company=companies.find(item=>item.id===companyId);
 return <div className="wa-backdrop" role="dialog" aria-modal="true" aria-label="WhatsApp Inbox">
  <section className="wa-shell">
   <header className="wa-topbar">
    <div className="wa-title"><span className="wa-brand-icon"><MessageCircleMore size={20}/></span><div><small>STAFF PORTAL · CUSTOMER COMMUNICATIONS</small><h2>WhatsApp Inbox</h2></div></div>
    <div className="wa-top-actions">
     <Pill><ShieldCheck size={13}/>Staff-only</Pill>
     <Pill tone="pending"><Circle size={9}/>Live send disabled</Pill>
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
     <div className="wa-list-scroll">{!items.length&&!loading?<EmptyState title="No conversations here" detail="New customer WhatsApp messages will appear here after the Meta webhook is connected."/>:items.map(item=>
      <button key={item.id} className={`wa-conversation ${selectedId===item.id?'selected':''}`} onClick={()=>selectConversation(item.id)}>
       <span className="wa-avatar">{initials(item).toUpperCase()}</span>
       <span className="wa-conversation-copy"><span className="wa-conversation-row"><strong>{displayName(item)}</strong><time>{time(item.lastMessageAt)}</time></span><span className="wa-preview">{item.lastMessage||'Message received'}</span><span className="wa-conversation-meta"><Pill tone={item.status==='open'?'open':item.status==='pending'?'pending':'neutral'}>{item.status}</Pill>{item.assignedEmployeeId===context.employee.id&&<span><UserCheck size={12}/>Assigned to you</span>}</span></span>
       {item.unreadCount>0&&<span className="wa-unread">{item.unreadCount>99?'99+':item.unreadCount}</span>}
      </button>)}</div>
    </aside>

    <main className="wa-thread">
     {!selected?<EmptyState title="Choose a conversation" detail="Select a customer conversation to review the thread and prepare a reply."/>:<>
      <header className="wa-thread-header">
       <button className="wa-mobile-back" onClick={()=>setSelectedId('')}><ArrowLeft size={18}/></button>
       <span className="wa-avatar large">{initials(selected).toUpperCase()}</span>
       <div><strong>{displayName(selected)}</strong><span><AtSign size={12}/>{selected.customerWaId}</span></div>
       <div className="wa-thread-actions">
        {selected.assignedEmployeeId===context.employee.id?<button onClick={()=>void mutate('assign',{employeeId:null})} disabled={activity==='assign'}>Unassign</button>:<button onClick={()=>void mutate('assign',{employeeId:context.employee.id})} disabled={activity==='assign'}><UserCheck size={15}/>Assign to me</button>}
        <button className="wa-icon-btn"><MoreHorizontal size={18}/></button>
       </div>
      </header>
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
       <div className="wa-composer-tools">
        <button className="wa-ai-button" onClick={()=>setMessage('AI reply assistance is reserved for the governed composer and is not active in this staging foundation yet.')}><Sparkles size={15}/>AI assist</button>
        <span>Human review required</span>
       </div>
       <textarea value={reply} onChange={event=>setReply(event.target.value)} maxLength={4096} placeholder="Write a customer reply…"/>
       <footer><span>{reply.length.toLocaleString()} / 4,096</span><button className="wa-send-button" disabled={!reply.trim()||activity==='reply'} onClick={()=>void mutate('reply',{body:reply})}><Send size={16}/>{activity==='reply'?'Saving…':'Save reply draft'}</button></footer>
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
      <div><span>Assignment</span><strong>{selected.assignedEmployeeId===context.employee.id?'You':selected.assignedEmployeeId?'Another staff member':'Unassigned'}</strong></div>
      <div><span>Unread</span><strong>{selected.unreadCount||0}</strong></div>
      <div><span>Last activity</span><strong>{dateTime(selected.lastMessageAt)}</strong></div>
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
