import React,{useEffect,useMemo,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{AlertTriangle,BookOpenCheck,CheckCircle2,Clock3,RefreshCw,RotateCw,WalletCards,X}from'lucide-react';
import{api,clearPortalAuthCache,hasWorkforcePermission,type WorkforceContext}from'./auth';
import'./finance-automation.css';

type Row={id:string;salesOrderId:string;orderNo?:string;orderDate?:string;salesStatus?:string;paymentStatus?:string;salesTotalKobo?:number;postedAmountKobo?:number;costAmountKobo?:number;status:string;errorText?:string;postedAt:string;journalEntryId?:string;journalEntryNo?:string;receivableId?:string;receivableInvoiceNo?:string;receivableBalanceKobo?:number;customerName?:string};
type State={company:{id:string;name:string};pending:{count:number;amountKobo:number};posted:{count:number;amountKobo:number;costKobo:number};failed:{count:number};recent:Row[];scheduler:{salesReconciliation:string;socialPublishing:string;idempotent:boolean}};
const ngn=(v=0)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(v||0)/100);
const owner=(context:WorkforceContext)=>context.roles.some(role=>role.code==='owner');
function canViewCompany(context:WorkforceContext,companyId:string){
 if(!context.companies.some(company=>company.id===companyId))return false;
 return owner(context)||hasWorkforcePermission(context,'finance.ledger','view',companyId)||hasWorkforcePermission(context,'finance.reports','view',companyId);
}
function canRunCompany(context:WorkforceContext,companyId:string){
 return canViewCompany(context,companyId)&&(owner(context)||hasWorkforcePermission(context,'finance.journal','create',companyId));
}
function allowed(context:WorkforceContext){return context.companies.some(company=>canViewCompany(context,company.id))}
function Center({context,onClose}:{context:WorkforceContext;onClose:()=>void}){
 const authorityKey=JSON.stringify([context.sessionId,context.employee.status,context.companies,context.roles,context.permissions,context.companyPermissions]);
 const authorityRef=useRef(authorityKey);authorityRef.current=authorityKey;
 const companies=useMemo(()=>context.companies.filter(company=>canViewCompany(context,company.id)),[authorityKey]);
 const[companyId,setCompanyId]=useState(companies[0]?.id||'');
 const[state,setState]=useState<State|null>(null),[stateAuthority,setStateAuthority]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const statusVersion=useRef(0),actionVersion=useRef(0);
 const companyAllowed=companies.some(company=>company.id===companyId);
 const visibleState=companyAllowed&&stateAuthority===authorityKey&&state?.company.id===companyId?state:null;
 async function load(){
  const version=++statusVersion.current,scope=authorityRef.current,selectedCompany=companyId;
  setState(null);setStateAuthority('');
  if(!companyAllowed)return;
  try{
   const next=await api<State>(`/api/finance/automation/status?companyId=${encodeURIComponent(selectedCompany)}`);
   if(version!==statusVersion.current||scope!==authorityRef.current)return;
   if(next.company?.id!==selectedCompany){setMessage('Finance posting data is unavailable.');return}
   setStateAuthority(scope);setState(next);
  }catch{
   if(version===statusVersion.current&&scope===authorityRef.current)setMessage('Finance posting data is unavailable. Please refresh.');
  }
 }
 useEffect(()=>{
  if(!companyAllowed){
   statusVersion.current++;actionVersion.current++;
   setState(null);setStateAuthority('');setMessage('');setBusy(false);
   if(companies.length)setCompanyId(companies[0].id);
   return;
  }
  void load();
  return()=>{statusVersion.current++};
 },[companyId,authorityKey]);
 async function reconcile(){
  if(!companyAllowed||!canRunCompany(context,companyId)||busy)return;
  const version=++actionVersion.current,scope=authorityRef.current,selectedCompany=companyId;
  const current=()=>version===actionVersion.current&&scope===authorityRef.current;
  setBusy(true);
  try{
   const r=await api<{result:{scanned:number;posted:number;skipped:number;failed:number;errors:Array<{id:string;error:string}>}}>('/api/finance/automation/reconcile',{method:'POST',body:JSON.stringify({companyId:selectedCompany,limit:100})});
   if(!current())return;
   setMessage(`Reconciliation checked ${r.result.scanned} fulfilled sale(s): ${r.result.posted} posted, ${r.result.failed} failed.`);
   await load();
  }catch{
   if(current())setMessage('Reconciliation could not be completed. Please check the current records.');
  }finally{if(current())setBusy(false)}
 }
 return <div className="fa-backdrop" onClick={onClose}><section className="fa-shell" onClick={e=>e.stopPropagation()}><header><div><span><BookOpenCheck size={21}/></span><div><small>DAENEM FINANCE</small><h2>Automatic Posting Control</h2></div></div><aside><select aria-label="Finance posting company" value={companyId} onChange={e=>{statusVersion.current++;actionVersion.current++;setState(null);setStateAuthority("");setMessage("");setBusy(false);setCompanyId(e.target.value)}}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button onClick={load}><RefreshCw size={16}/></button><button onClick={onClose}><X size={18}/></button></aside></header>{message&&<div className="fa-message">{message}</div>}<main>{!visibleState?<div className="fa-empty">Loading Finance automation status…</div>:<><section className="fa-kpis"><article><Clock3 size={18}/><div><small>WAITING TO POST</small><strong>{visibleState.pending.count}</strong><span>{ngn(visibleState.pending.amountKobo)}</span></div></article><article><CheckCircle2 size={18}/><div><small>POSTED SALES</small><strong>{visibleState.posted.count}</strong><span>{ngn(visibleState.posted.amountKobo)} revenue</span></div></article><article><WalletCards size={18}/><div><small>COGS POSTED</small><strong>{ngn(visibleState.posted.costKobo)}</strong><span>Inventory cost recognized</span></div></article><article className={visibleState.failed.count?'danger':''}><AlertTriangle size={18}/><div><small>FAILED / BLOCKED</small><strong>{visibleState.failed.count}</strong><span>Require review</span></div></article></section><section className="fa-control"><div><small>AUTOMATION POLICY</small><h3>Fulfilled Sales → Finance</h3><p>Every hour, Workforce checks fulfilled sales that have not posted. Each source sale can post only once. Paid value debits Cash; unpaid balance debits Accounts Receivable; revenue is credited; known inventory cost posts to Cost of Sales and Inventory.</p></div>{canRunCompany(context,companyId)&&<button disabled={busy} onClick={reconcile}><RotateCw className={busy?'spin':''} size={16}/>{busy?'Reconciling…':'Run Reconciliation Now'}</button>}</section><section className="fa-table-wrap"><div className="fa-section-head"><div><small>POSTING LEDGER</small><h3>Recent automatic sales postings</h3></div><span>Hourly · Idempotent</span></div>{!visibleState.recent.length?<div className="fa-empty">No automatic sales postings yet.</div>:<div className="fa-table"><div className="head"><span>Sale</span><span>Customer</span><span>Revenue</span><span>COGS</span><span>Journal / AR</span><span>Status</span></div>{visibleState.recent.map(r=><div key={r.id}><span><b>{r.orderNo||r.salesOrderId}</b><small>{r.orderDate||''} · {r.paymentStatus||''}</small></span><span>{r.customerName||'Customer'}</span><span>{ngn(r.postedAmountKobo||r.salesTotalKobo||0)}</span><span>{ngn(r.costAmountKobo||0)}</span><span>{r.journalEntryNo?<><b>{r.journalEntryNo}</b>{r.receivableBalanceKobo? <small>AR balance {ngn(r.receivableBalanceKobo)}</small>:<small>Fully paid / no AR</small>}</>:<small>Journal not created</small>}</span><span><em className={`status ${r.status}`}>{r.status}</em>{r.errorText&&<small className="error">{r.errorText}</small>}</span></div>)}</div>}</section><div className="fa-note"><b>Fiscal-period protection:</b> if a matching period is closed or soft-closed, auto-posting stops and records the failure instead of forcing an entry into a locked period.</div></>}</main></section></div>}
function Launcher(){
 const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{
  let live=true,version=0;
  const refresh=async()=>{
   const current=++version;
   try{
    const r=await api<{authenticated?:boolean;context?:WorkforceContext}>('/api/auth/me');
    if(live&&current===version)setContext(r.authenticated===false?null:r.context&&allowed(r.context)?r.context:null);
   }catch{if(live&&current===version)setContext(null)}
  };
  const focus=()=>{clearPortalAuthCache();void refresh()};
  const authorityChanged=()=>{version++;setContext(null);setOpen(false)};
  void refresh();
  window.addEventListener('focus',focus);
  window.addEventListener('daenem-auth-changed',authorityChanged);
  const t=window.setInterval(()=>void refresh(),10000);
  return()=>{live=false;version++;window.removeEventListener('focus',focus);window.removeEventListener('daenem-auth-changed',authorityChanged);window.clearInterval(t)};
 },[]);
 if(!context)return null;
 return <><button className="fa-launcher" onClick={()=>setOpen(true)}><BookOpenCheck size={17}/><span>Finance Posting</span></button>{open&&<Center context={context} onClose={()=>setOpen(false)}/>}</>;
}

const host=document.createElement('div');host.id='finance-automation-launcher';document.body.appendChild(host);createRoot(host).render(<Launcher/>);