import React, { useState } from 'react';

type Submission = { companyId: string; [key: string]: unknown };
type Submit = (path: string, payload: Submission, withKey?: boolean) => Promise<boolean>;
type Interview = { id: string; status: 'scheduled'|'completed'|'cancelled'; revision: number; scheduledAt: string };
type Offer = { id: string; status: 'draft'|'approved'|'withdrawn'; revision: number;
  roleTitle: string; termsSummary: string; approvedAt?: string|null };
type Handoff = { id: string; status: string; acceptanceEvidenceRef: string; acknowledgedAt?: string|null };

function InterviewReview({interview,companyId,busy,submit}:{
  interview:Interview;companyId:string;busy:boolean;submit:Submit
}) {
  const appointment=Date.parse(interview.scheduledAt);
  const canComplete=Number.isFinite(appointment)&&appointment<=Date.now();
  const [decision,setDecision]=useState<'completed'|'cancelled'>(canComplete?'completed':'cancelled');
  const [recommendation,setRecommendation]=useState('hold');
  const [feedback,setFeedback]=useState('');
  return <form className="jobs-erp-subrecord jobs-erp-action-form" onSubmit={event=>{
    event.preventDefault();
    if(decision==='completed'&&!canComplete)return;
    void submit('/interviews/review',{companyId,id:interview.id,
      expectedRevision:interview.revision,decision,
      recommendation:decision==='completed'?recommendation:'',
      feedback:decision==='completed'?feedback:''});
  }}>
    <h5>Review scheduled interview</h5>
    <label className="jobs-erp-field">Outcome<select value={decision}
      onChange={event=>setDecision(event.target.value as 'completed'|'cancelled')}>
      <option value="completed" disabled={!canComplete}>Completed with documented feedback</option>
      <option value="cancelled">Cancelled (no feedback recorded)</option>
    </select></label>
    {!canComplete&&<p className="jobs-erp-safety-note">The interview cannot be recorded as completed before its scheduled time. Cancellation remains available.</p>}
    {decision==='completed'&&<>
      <label className="jobs-erp-field">Recommendation<select value={recommendation}
        onChange={event=>setRecommendation(event.target.value)}>
        <option value="hold">Hold for review</option><option value="advance">Recommend advance</option>
        <option value="reject">Recommend not selected</option></select></label>
      <label className="jobs-erp-field">Interview feedback<textarea required maxLength={3000}
        value={feedback} onChange={event=>setFeedback(event.target.value)}
        placeholder="Record evidence and interviewer feedback, not an automatic hiring decision."/></label>
    </>}
    <button type="submit" className="jobs-erp-button primary" disabled={busy||
      (decision==='completed'&&!feedback.trim())}>Save interview outcome</button>
  </form>;
}
export function InterviewActions({interviews,companyId,canEdit,busy,submit}:{
  interviews:Interview[];companyId:string;canEdit:boolean;busy:boolean;submit:Submit
}) {
  const scheduled=interviews.filter(interview=>interview.status==='scheduled');
  if(!canEdit||!scheduled.length)return null;
  return <div className="jobs-erp-action-stack" aria-label="Interview outcome controls">
    {scheduled.map(interview=><InterviewReview key={interview.id} interview={interview}
      companyId={companyId} busy={busy} submit={submit}/>)}
  </div>;
}

function OfferDraft({companyId,candidateId,roleTitle,busy,submit}:{
  companyId:string;candidateId:string;roleTitle:string;busy:boolean;submit:Submit
}) {
  const [role,setRole]=useState(roleTitle);
  const [terms,setTerms]=useState('');
  return <form className="jobs-erp-action-form" onSubmit={event=>{
    event.preventDefault();
    void submit('/offers',{companyId,candidateId,roleTitle:role,termsSummary:terms},true)
      .then(saved=>{if(saved)setTerms('');});
  }}>
    <h5>Prepare internal offer draft</h5>
    <p>Drafting is internal only. No offer is sent or accepted.</p>
    <label className="jobs-erp-field">Proposed role<input required minLength={2} maxLength={160}
      value={role} onChange={event=>setRole(event.target.value)}/></label>
    <label className="jobs-erp-field">Restricted offer terms<textarea required
      minLength={10} maxLength={2400} value={terms} onChange={event=>setTerms(event.target.value)}/></label>
    <button className="jobs-erp-button primary" type="submit" disabled={busy||terms.trim().length<10}>
      Save draft only</button>
  </form>;
}

function OfferDecision({offer,companyId,busy,submit}:{
  offer:Offer;companyId:string;busy:boolean;submit:Submit
}) {
  const [decision,setDecision]=useState<'approved'|'withdrawn'>('approved');
  return <form className="jobs-erp-action-form" onSubmit={event=>{
    event.preventDefault();
    void submit('/offers/decision',{companyId,id:offer.id,
      decision,expectedRevision:offer.revision});
  }}>
    <h5>Internal offer decision</h5>
    <p>Approval is an internal authorization, not delivery or candidate acceptance.</p>
    <label className="jobs-erp-field">Decision<select value={decision}
      onChange={event=>setDecision(event.target.value as 'approved'|'withdrawn')}>
      <option value="approved">Approve internal draft</option>
      <option value="withdrawn">Withdraw internal draft</option>
    </select></label>
    <button className="jobs-erp-button primary" type="submit" disabled={busy}>
      Record internal decision</button>
  </form>;
}

export function OfferActions({offers,companyId,candidateId,roleTitle,stage,canApprove,busy,submit}:{
  offers:Offer[]|undefined;companyId:string;candidateId:string;roleTitle:string;
  stage:string;canApprove:boolean;busy:boolean;submit:Submit
}) {
  if(!canApprove)return <p>Offer details require company approval permission.</p>;
  const rows=offers||[];
  return <section className="jobs-erp-card">
    <h4>Internal offers</h4>
    {!rows.length&&<p>No internal offer drafts exist.</p>}
    {rows.map(offer=><div className="jobs-erp-subrecord" key={offer.id}>
      <strong>{offer.roleTitle} / {offer.status}</strong>
      <p>{offer.termsSummary}</p>
      {offer.status==='draft'&&<OfferDecision key={offer.id+offer.revision}
        offer={offer} companyId={companyId} busy={busy} submit={submit}/>}
    </div>)}
    {stage==='decision'&&<OfferDraft companyId={companyId} candidateId={candidateId}
      roleTitle={roleTitle} busy={busy} submit={submit}/>}
    <p className="jobs-erp-safety-note">Internal approval never means offer delivery,
      legal completion or candidate acceptance.</p>
  </section>;
}
export function HandoffActions({handoffs,offers,companyId,candidateId,stage,canApprove,busy,submit}:{
  handoffs:Handoff[]|undefined;offers:Offer[]|undefined;companyId:string;
  candidateId:string;stage:string;canApprove:boolean;busy:boolean;submit:Submit
}) {
  const [offerId,setOfferId]=useState('');
  const [reference,setReference]=useState('');
  if(!canApprove)return null;
  const rows=handoffs||[];
  const approved=(offers||[]).filter(offer=>offer.status==='approved');
  const pending=rows.some(row=>row.status==='pending');
  const acknowledged=rows.some(row=>row.status==='acknowledged');
  return <section className="jobs-erp-card">
    <h4>Existing HR onboarding authority / handoff</h4>
    {!rows.length&&<p>No HR handoff has been requested.</p>}
    {rows.map(handoff=><div key={handoff.id} className="jobs-erp-subrecord">
      <strong>Handoff status: {handoff.status}</strong>
      <p>Evidence reference: {handoff.acceptanceEvidenceRef}</p>
      <p>{handoff.status==='acknowledged'
        ? 'An HR acknowledgment status is recorded; HR authority must verify it.'
        :handoff.status==='cancelled'
        ? 'This handoff was cancelled; no onboarding completion is implied.'
        : 'Awaiting explicit acknowledgment from the existing HR authority.'}</p>
    </div>)}
    {stage==='offer_prepared'&&approved.length>0&&!pending&&!acknowledged&&
      <form className="jobs-erp-action-form" onSubmit={event=>{
        event.preventDefault();
        void submit('/hr-handoffs',{companyId,candidateId,
          offerId:offerId||approved[0].id,acceptanceEvidenceRef:reference},true)
          .then(saved=>{if(saved)setReference('');});
      }}>
        <h5>Request HR review (pending only)</h5>
        <label className="jobs-erp-field">Approved internal offer<select required
          value={offerId||approved[0].id} onChange={event=>setOfferId(event.target.value)}>
          {approved.map(offer=><option key={offer.id} value={offer.id}>{offer.roleTitle} / {offer.id}</option>)}
        </select></label>
        <label className="jobs-erp-field">Acceptance evidence reference (HR must verify independently)
          <input required minLength={10} maxLength={400} value={reference}
            onChange={event=>setReference(event.target.value)}
            placeholder="Reference already held by the responsible authority"/></label>
        <p className="jobs-erp-safety-note">Submitting records a pending review request only.
          It does not verify acceptance, create an employee or complete onboarding.</p>
        <button type="submit" className="jobs-erp-button primary"
          disabled={busy||reference.trim().length<10}>Request HR review</button>
      </form>}
    {pending&&<p className="jobs-erp-safety-note">An HR review is already pending.
      No employee record is created by this Recruitment workspace.</p>}
  </section>;
}
