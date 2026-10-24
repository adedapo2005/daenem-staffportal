import React,{useEffect,useState}from'react';
import{api}from'./auth';
import'./bakery-opening-valuation.css';

type Opening={id:string;locationId:string;inventoryItemId:string;itemName:string;locationName:string;
 baseUnit:string;quantityMicro:number;valueMicroKobo:number;status:'proposed'|'approved'|'rejected';
 reason:string;evidenceReference:string;proposedBy:string;reviewedBy?:string|null;
 reviewNote?:string|null;createdAt:string};
type State={openings:Opening[];canPropose:boolean;canReview:boolean};
type Item={id:string;name:string;unit:string;quantity?:number;categoryType?:string};
type Location={id:string;name:string};
const money=(micro:number)=>'₦'+(Number(micro||0)/100000000).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});
export function BakeryOpeningValuationPanel({items,locations,actorId,onCompleted}:{
 items:Item[];locations:Location[];actorId:string;onCompleted:()=>Promise<void>
}){
 const[expanded,setExpanded]=useState(false),[data,setData]=useState<State|null>(null),
 [busy,setBusy]=useState(false),[message,setMessage]=useState(''),
 [form,setForm]=useState({locationId:'',inventoryItemId:'',countedQuantity:'',
  totalValueNaira:'',reason:'',evidenceReference:''}),
 [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
 async function reload(){const result=await api<State>('/api/inventory/bakery/openings');setData(result)}
 useEffect(()=>{void reload().catch(e=>setMessage((e as Error).message))},[]);
 const pending=data?.openings.filter(x=>x.status==='proposed')||[];
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage('');
  try{
   await api('/api/inventory/bakery/openings/propose',{method:'POST',body:JSON.stringify({
    ...form,countedQuantity:Number(form.countedQuantity),totalValueNaira:Number(form.totalValueNaira)})});
   setMessage('Opening submitted for independent review. No stock or money has moved.');
   setForm(x=>({...x,countedQuantity:'',totalValueNaira:'',reason:'',evidenceReference:''}));
   await reload();
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 async function decide(openingId:string,decision:'approved'|'rejected'){
  const note=(reviewNotes[openingId]||'').trim();
  if(note.length<8){setMessage('Independent reviewer must record the evidence checked (at least 8 characters).');return}
  setBusy(true);setMessage('');
  try{
   await api('/api/inventory/bakery/openings/review',{method:'POST',body:JSON.stringify({openingId,decision,reviewNote:note})});
   setMessage(decision==='approved'
    ?'Opening valuation approved. The existing physical stock count was unchanged; its exact value is now controlled.'
    :'Opening rejected. No stock count or valuation was changed.');
   setReviewNotes(x=>({...x,[openingId]:''}));await reload();await onCompleted();
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 return <details className="inventory-opening-panel" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
  <summary><span><strong>Existing Stock · Verified Opening Value</strong><small>Counted material on hand, independently approved, no duplicate goods receipt</small></span></summary>
  <div className="inventory-opening-content">
   <p>Use this only for stock already physically present in Inventory but without an approved exact-value opening. Goods Received remains the correct workflow for new supplier deliveries. An independent approver must verify both the counted quantity and supporting financial value.</p>
   {message&&<p className="inventory-opening-status" role="status">{message}</p>}
   {!data&&<p>Loading access and pending valuations…</p>}
   {data?.canPropose&&<form onSubmit={submit} className="inventory-opening-form">
    <label>Stock Location<select required value={form.locationId} onChange={e=>setForm({...form,locationId:e.target.value})}><option value="">Select Bakery location</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <label>Existing Raw Material<select required value={form.inventoryItemId} onChange={e=>setForm({...form,inventoryItemId:e.target.value})}><option value="">Select material</option>{items.filter(x=>x.categoryType!=='finished_good').map(x=><option key={x.id} value={x.id}>{x.name} · {x.unit}</option>)}</select></label>
    <label>Physically Counted Quantity ({items.find(x=>x.id===form.inventoryItemId)?.unit||'Inventory unit'})
      <input required type="number" min="0.000001" step="any" value={form.countedQuantity}
       onChange={e=>setForm({...form,countedQuantity:e.target.value})} placeholder="Actual quantity already on hand"/></label>
    <label>Verified Total Existing Stock Value (₦)<input required type="number" min="0.01" step="0.01"
      value={form.totalValueNaira} onChange={e=>setForm({...form,totalValueNaira:e.target.value})}
      placeholder="Documented value of the whole counted stock"/></label>
    <label>Physical Count / Cost Evidence Reference<input required minLength={8} maxLength={250}
      value={form.evidenceReference} onChange={e=>setForm({...form,evidenceReference:e.target.value})}
      placeholder="Count sheet, approved invoice or valuation document"/></label>
    <label>Reason / Valuation Basis<input required minLength={8} maxLength={500}
      value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}
      placeholder="Explain how count and historical stock value were verified"/></label>
    <button type="submit" disabled={busy}>Request Independent Opening Approval</button>
   </form>}
   <div className="inventory-opening-history">
    <h4>Opening Valuation Approval Queue</h4>
    {!pending.length?<p>No opening valuations awaiting review.</p>:pending.map(row=><div className="inventory-opening-row" key={row.id}>
      <strong>{row.itemName} · {row.locationName}</strong>
      <span>{(row.quantityMicro/1000000).toLocaleString('en-NG')} {row.baseUnit} · {money(row.valueMicroKobo)} opening stock value</span>
      <small>Evidence: {row.evidenceReference}</small><small>Proposer: {row.proposedBy} · Awaiting an independent reviewer</small>
      {data?.canReview&&row.proposedBy!==actorId&&<div className="inventory-opening-review">
       <label>Independent Verification Note<input minLength={8} value={reviewNotes[row.id]||''}
         onChange={e=>setReviewNotes(v=>({...v,[row.id]:e.target.value}))}
         placeholder="Document count, supporting invoices and valuation checked"/></label>
       <div><button type="button" disabled={busy} onClick={()=>decide(row.id,'approved')}>Approve Verified Opening</button>
        <button type="button" disabled={busy} onClick={()=>decide(row.id,'rejected')}>Reject Opening</button></div>
      </div>}
      {row.proposedBy===actorId&&<small>You cannot approve your own valuation.</small>}
    </div>)}
    <h4>Reviewed Opening History</h4>
    {!data?.openings.some(x=>x.status!=='proposed')?<p>No reviewed openings yet.</p>:
     data.openings.filter(x=>x.status!=='proposed').map(row=><div key={row.id} className="inventory-opening-row">
      <strong>{row.itemName} · {row.locationName}</strong><span>{row.status==='approved'?'Approved':'Rejected'} · {money(row.valueMicroKobo)} · {(row.quantityMicro/1000000).toLocaleString('en-NG')} {row.baseUnit}</span>
      <small>Evidence: {row.evidenceReference} · Reviewed by: {row.reviewedBy||'—'}</small>
     </div>)}
   </div>
   <p className="inventory-opening-note">Financial safety: opening does not change stock quantity. A changed count, reserved stock, duplicate opening or mismatched company prevents approval. The approval remains in the immutable audit history.</p>
  </div>
 </details>;
}
