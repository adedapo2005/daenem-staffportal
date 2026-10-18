import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkforceContext } from './auth';
import { formatPortalDateTime, resolveStaffTimeZone } from './canonical-time';
import { InterviewActions, OfferActions, HandoffActions } from './jobs-recruitment-actions';
import { InterviewScheduler } from './jobs-recruitment-scheduler';

type Company = { id:string; name:string; code?:string; capabilities?:{create:boolean;edit:boolean;approve:boolean} };
type Stage = 'applied'|'screening'|'interview'|'decision'|'offer_prepared'|'closed_rejected'|'withdrawn';
type Candidate = { id:string; companyId:string; fullName:string; candidateRef:string; roleTitle:string;
  stage:Stage; revision:number; locationId?:string|null; email?:string|null; phone?:string|null;
  sourceKind?:string; sourceReference?:string|null; updatedAt?:string };
type Interview = { id:string; status:'scheduled'|'completed'|'cancelled'; revision:number;
  scheduledAt:string; meetingMode:string; interviewerId:string; feedback?:string; recommendation?:string };
type Offer = { id:string; status:'draft'|'approved'|'withdrawn'; revision:number;
  roleTitle:string; termsSummary:string; approvedAt?:string|null };
type Handoff = { id:string; status:string; acceptanceEvidenceRef:string; acknowledgedAt?:string|null };
type Detail = { candidate:Candidate; interviews:Interview[]; offers?:Offer[]; hrHandoffs?:Handoff[];
  capabilities:{ create:boolean; edit:boolean; approve:boolean } };
type Submission = { companyId:string; [key:string]:unknown };

const stageLabel:Record<Stage,string> = {
  applied:'Applied', screening:'Screening', interview:'Interview', decision:'Decision',
  offer_prepared:'Offer prepared', closed_rejected:'Not selected', withdrawn:'Withdrawn'
};
const progression:Partial<Record<Stage,Stage>> = {
  applied:'screening',screening:'interview',interview:'decision',decision:'offer_prepared'
};
const apiBase='/api/recruitment';
function apiError(status:number) {
  return status===403||status===404 ? 'This recruitment record is unavailable for your current access.'
    : status===409 ? 'The record changed. Refresh to review its latest state.'
    : 'We could not complete this action. Please check the information and try again.';
}
async function request<T>(path:string,init?:RequestInit):Promise<T> {
  const result=await fetch(apiBase+path,{
    ...init,credentials:'include',cache:'no-store',
    headers:{'content-type':'application/json',...(init?.headers||{})}
  });
  if (!result.ok) throw new Error(apiError(result.status));
  return result.json() as Promise<T>;
}
function key() { return 'recruitment-ui-'+crypto.randomUUID(); }
function humanTime(value?:string,zone?:string) {
  return formatPortalDateTime(value,zone)||'Time Unavailable';
}
function useAuthenticatedScope() {
  const [companies,setCompanies]=useState<Company[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const refreshVersion=useRef(0);
  const refresh=useCallback(async()=>{
    const version=++refreshVersion.current;
    // Drop old protected record views before rechecking changed permissions.
    setLoading(true);setCompanies([]);setError('');
    try{
      const result=await request<{companies:Company[]}>('/companies');
      if(version===refreshVersion.current){setCompanies(result.companies||[]);setError('');}
    }catch{
      if(version===refreshVersion.current){setCompanies([]);setError('Recruitment access could not be verified.');}
    }finally{if(version===refreshVersion.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    void refresh();
    const onReturn=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('focus',onReturn);
    document.addEventListener('visibilitychange',onReturn);
    return ()=>{refreshVersion.current++;
      window.removeEventListener('focus',onReturn);
      document.removeEventListener('visibilitychange',onReturn);};
  },[refresh]);
  return {companies,loading,error,refresh};
}

export function RecruitmentWorkspace({context,onClose}:{context:WorkforceContext;onClose:()=>void}) {
  const {companies,loading,error,refresh}=useAuthenticatedScope();
  const [companyId,setCompanyId]=useState('');
  const modal=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!loading && !companies.some(c=>c.id===companyId))setCompanyId(companies[0]?.id||'');
  },[companies,companyId,loading]);
  useEffect(()=>{
    const prior=document.activeElement instanceof HTMLElement?document.activeElement:null;
    modal.current?.focus();
    return ()=>prior?.focus();
  },[]);
  const onKeyDown=(event:React.KeyboardEvent<HTMLElement>)=>{
    if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key!=='Tab'||!modal.current)return;
    const options=Array.from(modal.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]'))
      .filter(node=>node.getClientRects().length>0);
    if(!options.length)return;
    const first=options[0],last=options[options.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  const selected=companies.find(c=>c.id===companyId);
  return <div className="jobs-erp-backdrop">
    <section ref={modal} tabIndex={-1} className="jobs-erp-panel" role="dialog"
      aria-modal="true" aria-labelledby="jobs-erp-title" onKeyDown={onKeyDown}>
      <header className="jobs-erp-header">
        <div><span className="jobs-erp-kicker">DAENEM / INTERNAL TALENT OPERATIONS</span>
          <h2 id="jobs-erp-title">Recruitment command workspace</h2>
          <p>Protected candidate records, interviews, decisions and HR handoff.</p></div>
        <div className="jobs-erp-header-actions">
          <label className="jobs-erp-company-label"><span>Company</span>
            <select aria-label="Recruitment company" value={companyId}
              onChange={e=>setCompanyId(e.target.value)} disabled={!companies.length}>
              {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <button type="button" aria-label="Close recruitment workspace" onClick={onClose}>Close</button>
        </div>
      </header>
      {loading?<div className="jobs-erp-status" role="status">Checking your recruitment access...</div>
        :error?<div className="jobs-erp-status error" role="alert">{error}
            <button className="jobs-erp-button" onClick={()=>void refresh()}>Retry</button></div>
        :!selected?<div className="jobs-erp-status">No authorized recruitment company is available.</div>
        :<CompanyBoard key={selected.id} company={selected} timeZone={resolveStaffTimeZone(context.employee.timezone)} />}
      <footer className="jobs-erp-footer"><span>INTERNAL STAFFPORTAL / AUTHORIZED COMPANY ONLY</span>
        <span>{context.employee.displayName || 'Talent operations'}</span></footer>
    </section>
  </div>;
}

function CompanyBoard({company,timeZone}:{company:Company;timeZone:string}) {
  const companyId=company.id;
  const [rows,setRows]=useState<Candidate[]>([]);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [selectedId,setSelectedId]=useState('');
  const [stage,setStage]=useState('');
  const [loading,setLoading]=useState(true);
  const [recordLoading,setRecordLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [accessInvalid,setAccessInvalid]=useState(false);
  const listVersion=useRef(0),recordVersion=useRef(0);
  const pendingRequestKeys=useRef(new Map<string,string>());
  const returnFocusRef=useRef<HTMLElement|null>(null);
  const invalidateAccess=useCallback(()=>{
    // Prevent an earlier in-flight successful GET from restoring revoked records.
    listVersion.current++;recordVersion.current++;pendingRequestKeys.current.clear();
    setAccessInvalid(true);setRows([]);setDetail(null);setSelectedId('');setCreateOpen(false);
  },[]);
  const refreshList=useCallback(async()=>{
    const version=++listVersion.current;
    setLoading(true);
    try {
      const query=new URLSearchParams({companyId});
      if(stage)query.set('stage',stage);
      const value=await request<{candidates:Candidate[]}>('/candidates?'+query.toString());
      if(version===listVersion.current){setRows(value.candidates||[]);setNotice('');}
    }catch(err){
      if(version===listVersion.current){
        if(err instanceof Error && err.message===apiError(404)){invalidateAccess();return;}
        setRows([]);setDetail(null);
        setNotice(err instanceof Error?err.message:'Recruitment list unavailable.');
      }
    }finally{if(version===listVersion.current)setLoading(false);}
  },[companyId,stage,invalidateAccess]);
  useEffect(()=>{void refreshList();return ()=>{listVersion.current++;};},[refreshList]);
  const refreshDetail=useCallback(async(id:string)=>{
    const version=++recordVersion.current;
    if(!id){setDetail(null);setRecordLoading(false);return;}
    setRecordLoading(true);
    try{
      const value=await request<Detail>('/candidates/'+encodeURIComponent(id)+'?companyId='+encodeURIComponent(companyId));
      if(version===recordVersion.current)setDetail(value);
    }catch(err){
      if(version===recordVersion.current){
        if(err instanceof Error && err.message===apiError(404)){invalidateAccess();return;}
        setDetail(null);
        setNotice(err instanceof Error?err.message:'Recruitment record unavailable.');
      }
    }finally{if(version===recordVersion.current)setRecordLoading(false);}
  },[companyId,invalidateAccess]);
  useEffect(()=>{void refreshDetail(selectedId);return ()=>{recordVersion.current++;};},[refreshDetail,selectedId]);
  async function submit(path:string,payload:Submission,withKey=false){
    setBusy(true);setNotice('');
    const fingerprint=withKey?JSON.stringify({path,payload}):'';
    let requestKey='';
    if(withKey){
      requestKey=pendingRequestKeys.current.get(fingerprint)||key();
      pendingRequestKeys.current.set(fingerprint,requestKey);
    }
    try {
      const result=await request<{id?:string;message?:string}>(path,{
        method:'POST',headers:withKey?{'idempotency-key':requestKey}:{},
        body:JSON.stringify(payload)
      });
      if(withKey)pendingRequestKeys.current.delete(fingerprint);
      await refreshList();
      if(result.id&&path==='/candidates'){setSelectedId(result.id);setCreateOpen(false);}
      else if(selectedId)await refreshDetail(selectedId);
      setNotice(result.message||'Change saved. Latest record information loaded.');
      return true;
    }catch(err){
      if(err instanceof Error&&err.message===apiError(404))invalidateAccess();
      setNotice(err instanceof Error?err.message:'Change could not be completed.');return false;
    }finally{setBusy(false);}
  }
  // Never display the prior selection while another record is loading.
  const c=detail?.candidate.id===selectedId ? detail.candidate : null;
  if(accessInvalid)return <div className="jobs-erp-status error" role="alert">
    Protected Recruitment content was cleared after an access denial. Close and reopen this workspace to revalidate permissions.
  </div>;
  return <>
    <div className="jobs-erp-toolbar"><div><strong>{company.name} / Candidate pipeline</strong>
      <small>Company-scoped records. Access may change during this session.</small></div>
      <div className="jobs-erp-actions">
        <label className="jobs-erp-filter"><span>Stage</span>
          <select value={stage} onChange={event=>{setStage(event.target.value);setSelectedId('');setDetail(null);}}>
            <option value="">All stages</option>
            {(Object.keys(stageLabel) as Stage[]).map(s=><option key={s} value={s}>{stageLabel[s]}</option>)}
          </select></label>
        <button className="jobs-erp-button" onClick={()=>void refreshList()}>Refresh</button>
        {company.capabilities?.create&&<button className="jobs-erp-button primary" onClick={event=>{
          returnFocusRef.current=event.currentTarget;
          setCreateOpen(true);setSelectedId('');setDetail(null);
        }}>New candidate</button>}
      </div>
    </div>
    {notice&&<div className={'jobs-erp-status'+(notice.includes('could not')||notice.includes('unavailable')?' error':'')} role="status">{notice}</div>}
    <div className={'jobs-erp-body'+(selectedId||createOpen?' show-record':'')}>
      <nav className="jobs-erp-rail" aria-label="Candidate records">
        <div className="jobs-erp-rail-heading">{loading?'Loading records...':rows.length+' authorized candidates'}</div>
        {!loading&&!rows.length&&<div className="jobs-erp-status">No candidate records found for this company and stage.</div>}
        {rows.map(row=><button type="button" className="jobs-erp-row" key={row.id}
          aria-current={row.id===selectedId} onClick={event=>{
            returnFocusRef.current=event.currentTarget;
            setSelectedId(row.id);setCreateOpen(false);setDetail(null);
          }}>
          <strong>{row.fullName}</strong><small>{row.roleTitle} / {stageLabel[row.stage]}</small>
          <small>{row.candidateRef}</small></button>)}
      </nav>
      <main className="jobs-erp-record">
        {(selectedId||createOpen)&&<button className="jobs-erp-button jobs-erp-back"
          onClick={()=>{
            const previousControl=returnFocusRef.current;
            setSelectedId('');setCreateOpen(false);setDetail(null);
            requestAnimationFrame(()=>previousControl?.focus());
          }}>Back to candidates</button>}
        {createOpen?<CreateCandidate companyId={companyId} disabled={busy}
          onSubmit={p=>submit('/candidates',p,true)}/>
        :recordLoading?<div className="jobs-erp-status" role="status">Loading protected candidate record...</div>
        :c?<CandidateRecord key={selectedId} detail={detail!} companyId={companyId} busy={busy}
          submit={submit} timeZone={timeZone} onAccessDenied={invalidateAccess}/>
        :<div className="jobs-erp-card"><h3>Choose a candidate</h3>
          <p>Review applications, interview feedback, hiring decisions, controlled offers and HR onboarding requests.</p>
          <p>No hiring, acceptance or employee creation is recorded automatically.</p></div>}
      </main>
    </div>
  </>;
}

function CreateCandidate({ companyId, disabled, onSubmit }: {
  companyId: string; disabled: boolean; onSubmit: (payload: Submission) => Promise<boolean>
}) {
  const [fullName, setFullName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sourceKind, setSourceKind] = useState('internal');
  const [sourceReference, setSourceReference] = useState('');
  return <form className="jobs-erp-card" onSubmit={event=>{
    event.preventDefault();
    void onSubmit({companyId,fullName,roleTitle,email,phone,sourceKind,sourceReference});
  }}>
    <h3>New Candidate</h3>
    <p>Internal application record only. No employee account is created.</p>
    <div className="jobs-erp-grid">
      <label className="jobs-erp-field">Full Name<input required value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
      <label className="jobs-erp-field">Role Applied For<input required value={roleTitle} onChange={e=>setRoleTitle(e.target.value)}/></label>
      <label className="jobs-erp-field">Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="jobs-erp-field">Phone<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <label className="jobs-erp-field">Source<select value={sourceKind} onChange={e=>setSourceKind(e.target.value)}><option value="internal">Internal</option><option value="referral">Referral</option><option value="import_reference">Existing Import</option><option value="website_reference">Website Reference</option></select></label>
      {sourceKind.endsWith("reference")&&<label className="jobs-erp-field">Source Reference<input required value={sourceReference} onChange={e=>setSourceReference(e.target.value)}/></label>}
    </div>
    <div className="jobs-erp-actions"><button type="submit" disabled={disabled} className="jobs-erp-button primary">Save Candidate</button></div>
  </form>;
}

function CandidateRecord({detail,companyId,busy,submit,timeZone,onAccessDenied}:{
  detail:Detail;companyId:string;busy:boolean;timeZone:string;onAccessDenied:()=>void;
  submit:(path:string,payload:Submission,withKey?:boolean)=>Promise<boolean>
}) {
  const c=detail.candidate,cap=detail.capabilities;
  const next=progression[c.stage];
  const prerequisiteReady=next==='decision'?detail.interviews.some(i=>i.status==='completed')
    :next==='offer_prepared'?!!detail.offers?.some(o=>o.status==='approved'):true;
  const move=(stage:Stage)=>submit('/candidates/stage',{companyId,id:c.id,nextStage:stage,expectedRevision:c.revision});


  return <article className="jobs-erp-record-detail" aria-label="Selected Candidate">
    <section className="jobs-erp-card"><div className="jobs-erp-record-head"><div><span className="jobs-erp-badge">{stageLabel[c.stage]}</span><h3>{c.fullName}</h3><p>{c.roleTitle} / {c.candidateRef}</p></div></div>
      <h4>Application Record</h4><p>Role: {c.roleTitle}</p><p>Stage: {stageLabel[c.stage]}</p>
      {cap.edit&&next&&(next!=='offer_prepared'||cap.approve)&&<button className="jobs-erp-button" disabled={busy||!prerequisiteReady} onClick={()=>void move(next)}>Move To {stageLabel[next]}</button>}
      {cap.edit&&next&&!prerequisiteReady&&<p className="jobs-erp-safety-note">Complete a documented interview or approve an internal offer before advancing this stage.</p>}
      {c.email!==undefined&&<p>Contact Email: {c.email||"Not Provided"}</p>}
      {c.phone!==undefined&&<p>Contact Phone: {c.phone||"Not Provided"}</p>}
      {c.sourceReference!==undefined&&<p>Source Reference: {c.sourceReference||"Not Provided"}</p>}
    </section>
    <section className="jobs-erp-card"><h4>Interviews</h4>
      {!detail.interviews.length&&<p>No interviews recorded.</p>}
      {detail.interviews.map(i=><div key={i.id} className="jobs-erp-subrecord"><p>{i.status} / {humanTime(i.scheduledAt,timeZone)} / {i.meetingMode}</p>{i.feedback&&<p>{i.feedback}</p>}</div>)}
      <InterviewScheduler companyId={companyId} candidateId={c.id} stage={c.stage}
        canEdit={cap.edit} busy={busy} submit={submit} onAccessDenied={onAccessDenied}/>
      <InterviewActions interviews={detail.interviews} companyId={companyId}
        canEdit={cap.edit} busy={busy} submit={submit}/>
    </section>
    <OfferActions offers={detail.offers} companyId={companyId} candidateId={c.id}
      roleTitle={c.roleTitle} stage={c.stage} canApprove={cap.approve} busy={busy} submit={submit}/>
    <HandoffActions handoffs={detail.hrHandoffs} offers={detail.offers}
      companyId={companyId} candidateId={c.id} stage={c.stage}
      canApprove={cap.approve} busy={busy} submit={submit}/>
  </article>;
}
