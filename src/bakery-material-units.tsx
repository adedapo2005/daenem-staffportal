import React,{useState}from'react';
import{api}from'./auth';
import'./bakery-material-units.css';

export type BakeryMaterialRule={
 id:string;inventoryItemId:string;ingredientName:string;fromUnit:string;inventoryUnit:string;
 factor:number;versionNo:number;status:'proposed'|'approved'|'rejected';
 proposedBy:string;reason:string;reviewNote?:string;createdAt:string;
};
export type BakeryMaterialRuleState={
 rules:BakeryMaterialRule[];canPropose:boolean;canReview:boolean;
};
type IngredientLite={id:string;name:string;unit:string};
export function BakeryMaterialUnitControls({
 ingredients,unitState,onReload,actorId
}:{
 ingredients:IngredientLite[];unitState:BakeryMaterialRuleState|null;onReload:()=>Promise<void>;actorId:string
}){
 const [itemId,setItemId]=useState(''),[fromUnit,setFromUnit]=useState(''),[factor,setFactor]=useState(''),
   [reason,setReason]=useState(''),[reviewNote,setReviewNote]=useState(''),
   [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const selected=ingredients.find(x=>x.id===itemId);
 const approved=(unitState?.rules||[]).filter(x=>x.status==='approved');
 const pending=(unitState?.rules||[]).filter(x=>x.status==='proposed');
 async function createRule(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setMessage('');
  try{
   await api('/api/bakery/material-units/propose',{method:'POST',body:JSON.stringify({
    inventoryItemId:itemId,fromUnit:fromUnit.trim(),factor:Number(factor),reason:reason.trim()
   })});
   setMessage('Conversion submitted for independent approval. It cannot affect recipes or stock until approved.');
   setFromUnit('');setFactor('');setReason('');await onReload();
  }catch(error){setMessage((error as Error).message)}finally{setBusy(false)}
 }
 async function reviewRule(ruleId:string,decision:'approved'|'rejected'){
  if(reviewNote.trim().length<8){setMessage('Enter an independent review note of at least 8 characters.');return}
  setBusy(true);setMessage('');
  try{
   await api('/api/bakery/material-units/review',{method:'POST',body:JSON.stringify({ruleId,decision,reviewNote:reviewNote.trim()})});
   setMessage(decision==='approved'?'Conversion approved. New recipes and receipts can now use this version.':'Conversion rejected without changing inventory.');
   setReviewNote('');await onReload();
  }catch(error){setMessage((error as Error).message)}finally{setBusy(false)}
 }
 return <section className="bakery-unit-panel" aria-label="Bakery material unit governance">
  <div className="bakery-panel-head"><div><small>CONTROLLED MATERIAL UNITS</small><h3>Purchasing & Production Units</h3>
   <p>One supplier bag, carton, bottle or cylinder can contain a verified quantity in the Inventory base unit. Every change needs independent approval; existing recipes keep their original conversion.</p>
  </div></div>
  {message&&<p role="status" className="bakery-unit-message">{message}</p>}
  {unitState?.canPropose&&<form className="bakery-unit-form" onSubmit={createRule}>
   <label>Material<select required value={itemId} onChange={e=>setItemId(e.target.value)}>
    <option value="">Select an existing Inventory material</option>
    {ingredients.map(i=><option key={i.id} value={i.id}>{i.name} · stock in {i.unit}</option>)}
   </select></label>
   <label>Supplier / Package Unit<input required maxLength={30} value={fromUnit}
    onChange={e=>setFromUnit(e.target.value)} placeholder="Bag, carton, bottle, cylinder…"/></label>
   <label>Inventory Units Per One Package<input required type="number" min="0.000000001"
    max="100000000" step="any" value={factor} onChange={e=>setFactor(e.target.value)}
    placeholder={selected?`1 package = ? ${selected.unit}`:'Choose a material'}/></label>
   <label className="bakery-unit-reason">Supplier Specification / Review Evidence
    <input required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}
     placeholder="e.g. Supplier-labelled net weight: 50 kg per bag"/></label>
   <button className="bakery-primary" disabled={busy||!selected}>Submit For Independent Approval</button>
  </form>}
  <div className="bakery-unit-lists">
   <div><h4>Approved, versioned conversions</h4>
    {!unitState?<p>Loading approved material definitions…</p>:!approved.length?<p>No approved package conversions yet. Inventory base units remain authoritative.</p>:
     <div className="bakery-unit-rows">{approved.map(rule=><div key={rule.id} className="bakery-unit-row">
      <strong>{rule.ingredientName}</strong><span>1 {rule.fromUnit} = {rule.factor.toLocaleString('en-NG')} {rule.inventoryUnit}</span>
      <small>Approved version {rule.versionNo}</small></div>)}</div>}
   </div>
   {(unitState?.canPropose||unitState?.canReview)&&<div><h4>Awaiting independent review</h4>
    {!pending.length?<p>No outstanding conversion approvals.</p>:
     <div className="bakery-unit-rows">{pending.map(rule=><div key={rule.id} className="bakery-unit-row">
      <strong>{rule.ingredientName} · {rule.fromUnit}</strong>
      <span>1 {rule.fromUnit} = {rule.factor} {rule.inventoryUnit} · proposed v{rule.versionNo}</span>
      <small>{rule.reason}</small>
      {unitState?.canReview&&rule.proposedBy===actorId?<small>Independent approval required: another authorised manager must review your proposal.</small>:unitState?.canReview&&<div className="bakery-unit-review">
       <label>Independent Review Note<input minLength={8} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}
        placeholder="Describe independently verified supplier specification"/></label>
       <div><button type="button" disabled={busy} onClick={()=>reviewRule(rule.id,'approved')}>Approve</button>
        <button type="button" disabled={busy} onClick={()=>reviewRule(rule.id,'rejected')}>Reject</button></div>
      </div>}</div>)}</div>}
   </div>}
  </div>
  <p className="bakery-unit-footnote">For exact financial valuation, the shared Inventory receipt workflow rejects conversions whose per-base-unit cost cannot be represented in whole kobo. No fractional costs are silently rounded to zero.</p>
 </section>;
}
