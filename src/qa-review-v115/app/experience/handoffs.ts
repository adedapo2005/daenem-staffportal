import {activeEvidence} from './evidence-state';
import {byId,canAct,canRecordAct,fieldAccess,personFor,type RecordData,type Session} from './model';
export const handoffDefinitions=[
 {source:'procurement',state:'Sourcing',target:'purchase-orders',label:'Create linked purchase order',next:'Converted'},
 {source:'hiring',state:'Offer Accepted',target:'lifecycle',label:'Start employee onboarding',next:'Onboarding'},
 {source:'expenses',state:'Approved',target:'finance',label:'Prepare linked expense journal',next:'Approved'},
 {source:'logistics',state:'Delivered',target:'trip-costs',label:'Prepare trip reconciliation',next:'Delivered'},
 {source:'printing',state:'Material Issue',target:'print-materials',label:'Create material usage record',next:'Material Issue'},
 {source:'bakery',state:'Complete',target:'bakery-accountability',label:'Start batch accountability',next:'Complete'},
] as const;
/** Explicit local handoff: source revision, disclosure, action, required data and
 * duplicate linkage are all validated before either record is changed. */
export function applyHandoff(records:RecordData[],source:RecordData,target:string,session:Session,reason:string){
 const def=handoffDefinitions.find(d=>d.source===source.module&&d.target===target);if(!def)throw new Error('Handoff unavailable.');
 const current=records.find(r=>r.id===source.id&&r.module===source.module);if(!current||(current.revision||0)!==(source.revision||0))throw new Error('Source changed. Reopen it before continuing.');
 const sourceMod=byId(source.module)!,targetMod=byId(target)!;
 if(!canRecordAct(current,sourceMod,session,'edit')||!canAct(targetMod,session,'create'))throw new Error('Handoff unavailable.');
 if(current.status!==def.state)throw new Error('Complete the required source stage before this handoff.');
 if(!reason.trim())throw new Error('Enter a handoff reason.');
 const sourceKey=current.module+':'+current.id;
 if(records.some(r=>r.module===target&&r.fields['Source Record']===sourceKey))throw new Error('This source already has a linked handoff.');
 const f=current.fields,fields:Record<string,string>={'Source Record':sourceKey,'Handoff Reason':reason};
 let required:string[]=[];
 if(target==='purchase-orders'){required=['Supplier','Item','Quantity','Unit Cost'];Object.assign(fields,{Supplier:f.Supplier,Item:f.Item,Quantity:f.Quantity,'Unit Cost':f['Unit Cost'],'Received Quantity':'0','Source Requisition':current.id});}
 if(target==='lifecycle'){required=['Candidate','Start Date','Onboarding Owner'];Object.assign(fields,{Employee:f.Candidate,'Lifecycle Type':'Onboarding','Task Owner':f['Onboarding Owner'],'Due Date':f['Start Date'],'Source Candidate':f.Candidate});}
 if(target==='finance'){required=['Amount','Purpose'];Object.assign(fields,{Account:'Expense clearing',Debit:f.Amount,Credit:f.Amount,Reference:current.id,'Fiscal Period':'','Period State':''});}
 if(target==='trip-costs'){required=['Proof of Delivery'];Object.assign(fields,{'Trip ID':current.id,Fuel:'', 'Other Expenses':'',Collections:'',Revenue:''});}
 if(target==='print-materials'){required=['Paper Stock','Quantity'];Object.assign(fields,{'Job ID':current.id,Material:f['Paper Stock'],'Issued Quantity':'','Actual Usage':'',Waste:''});}
 if(target==='bakery-accountability'){required=['Actual Yield'];Object.assign(fields,{'Actual Yield':f['Actual Yield'],Dispatched:'0','Store Balance':f['Actual Yield'],'Agent Sold':'0',Returns:'0',Damaged:'0',Promo:'0',Staff:'0','In Transit':'0','Unit Price':'0',Remittance:'0','Resolution Quantity':'0','Resolution Amount':'0','Decision Reason':''});}
 if(required.some(k=>!f[k]?.trim()||fieldAccess(current.module,k,session)==='hidden'))throw new Error('Complete the authorized source fields before handoff.');
 if(['procurement','expenses','logistics','bakery'].includes(source.module)&&!activeEvidence(current).length)throw new Error('Attach source evidence before handoff.');
 const row:RecordData={id:target.toUpperCase().slice(0,3)+'-LINK-'+current.id,module:target,title:current.title,subtitle:'Linked from '+sourceKey,company:current.company,status:targetMod.stages[0],owner:personFor(session),amount:target==='purchase-orders'?Number(f.Quantity)*Number(f['Unit Cost']):target==='finance'?Number(f.Amount):0,due:current.due,fields,evidence:[],history:[{action:'Created from '+sourceKey,actor:personFor(session),time:new Date().toISOString()}],revision:1};
 if(!canRecordAct(row,targetMod,session,'create')||Object.keys(fields).some(k=>fieldAccess(target,k,session)!=='edit'))throw new Error('Target scope or fields unavailable.');
 if(!Number.isFinite(row.amount)||row.amount<0)throw new Error('Source amount is invalid.');
 const updated={...current,status:def.next,revision:(current.revision||0)+1,fields:{...f,'Handoff Record':target+':'+row.id},history:[...current.history,{action:def.label,actor:personFor(session),time:new Date().toISOString()}]};
 return {records:[...records.map(r=>r.module===current.module&&r.id===current.id?updated:r),row],created:row};
}
