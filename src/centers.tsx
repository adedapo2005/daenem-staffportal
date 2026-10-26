import React,{useEffect,useMemo,useRef,useState}from'react';
import{AlertTriangle,BellRing,Bot,Building2,CheckCircle2,ClipboardCheck,Database,FilePlus2,Gauge,Megaphone,Plus,Radio,RefreshCw,Send,ShieldCheck,Sparkles,Users,Wrench,Zap}from'lucide-react';
import{api,hasWorkforcePermission,type AccessLevel,type WorkforceContext}from'./auth';
import'./centers.css';
import { useOfflinePlatform } from './offline-sync';
import { FORM_PRESETS, FORM_OPTION_SETS, prepareFormSchema } from './guided-form-fields';
import { guidedVisibleFields, guidedCompletion, guidedInvalidAnswers, pruneHiddenGuidedAnswers, validGuidedFormSchema, guidedFormEvidenceBlocker } from './guided-form-dependencies';
import { assignedFormDraftCompany } from './forms-assignment-draft-scope';
import { createLatestFormsDraftWriter, createFormsDraftWriterLifecycle, createScopedFormsDraftCallbacks } from './forms-draft-autosave';
import type { FormsDraftInput } from './offline-platform';
import { SmartMasterSelect } from './smart-master-select';
import { assetsForSelectedFacility, recommendedWorkPriority, suggestedWorkTitle, suggestedAssetName, ASSET_READING_TYPES, STANDARD_READING_UNITS, recommendedReadingUnit, validFacilitySelection } from './facility-guided-entry';
import './facility-guided-entry.css';
import { STAFFPORTAL_FACILITY_TYPES, suggestFacilityName, normaliseFacilityName } from './facility-registration-contract';

const rank:Record<AccessLevel,number>={none:0,view:1,create:2,edit:3,approve:4,manage:5};
const can=(c:WorkforceContext,p:string,m:AccessLevel='view')=>rank[c.permissions[p]||'none']>=rank[m];
const money=(kobo?:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(kobo||0)/100);
const Notice=({message}:{message:string})=><div className="center-notice">{message}</div>;
type FormField={key:string;label:string;type:string;required?:boolean;options?:string[];showWhen?:{fieldKey:string;equals:string|boolean}};
type WorkflowForm={id:string;companyName?:string;title:string;formType:string;schemaJson:string;assignmentCount:number};
type FormAssignment={assignmentId:string;companyId?:string;title:string;formType:string;schemaJson:string;blocking:number;dueAt?:string;status:string;requireLocation:number;requirePhoto?:number;requireSignature?:number;submissionUpdatedAt?:string};
type DirectoryEmployee={id:string;displayName:string;jobTitle?:string;department?:string;companyName:string};
type DirectoryRole={id:string;name:string};

export function FormsCenter({context,companyId}:{context:WorkforceContext;companyId:string|null}){
 const offline=useOfflinePlatform();
 const[forms,setForms]=useState<WorkflowForm[]>([]),[mine,setMine]=useState<FormAssignment[]>([]),[employees,setEmployees]=useState<DirectoryEmployee[]>([]),[roles,setRoles]=useState<DirectoryRole[]>([]),[selectedForm,setSelectedForm]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const[fields,setFields]=useState<FormField[]>([{key:'activity',label:'Activity / response',type:'textarea',required:true}]);
 const[newForm,setNewForm]=useState({title:'',description:'',formType:'custom',requireLocation:false});
 const[optionDrafts,setOptionDrafts]=useState<Record<string,string>>({});
 const[employeeFilter,setEmployeeFilter]=useState('');
 const[titleEdited,setTitleEdited]=useState(false);
 const[descriptionEdited,setDescriptionEdited]=useState(false);
 const[assign,setAssign]=useState({audienceType:'employee',employeeIds:[]as string[],roleId:'',dueAt:'',blocking:false,required:true});
 const[responses,setResponses]=useState<Record<string,Record<string,unknown>>>({});
 const[queuedAssignments,setQueuedAssignments]=useState<Set<string>>(()=>new Set());
 const responsesRef=useRef<Record<string,Record<string,unknown>>>({});
 const editRevision=useRef<Record<string,number>>({});
 const loadGeneration=useRef(0);
 const offlineRef=useRef(offline);offlineRef.current=offline;
 // A grant/session change immediately abandons pending writes from the previous scope.
 const autosaveScope=JSON.stringify([context.sessionId,context.employee.id,context.companies.map(c=>c.id),context.roles,context.permissions,context.companyPermissions]);
 const currentAutosaveScope=useRef(autosaveScope);currentAutosaveScope.current=autosaveScope;
 const draftWriter=useMemo(()=>{
  const scoped=createScopedFormsDraftCallbacks<FormsDraftInput>(
   autosaveScope,()=>currentAutosaveScope.current,
   async (_id,input)=>{await offlineRef.current.queueFormsDraft(input,input.companyId)},
   (_id,error)=>setMessage('Draft not saved securely. Keep this page open and retry: '+(error instanceof Error?error.message:'Storage unavailable.'))
  );
  return createLatestFormsDraftWriter<FormsDraftInput>(scoped.persist,scoped.reportFailure,350);
 },[autosaveScope]);
 const writerLifecycle=useMemo(()=>createFormsDraftWriterLifecycle(draftWriter),[draftWriter]);
 useEffect(()=>{
  const setupId=writerLifecycle.setup();
  return()=>writerLifecycle.cleanup(setupId,currentAutosaveScope.current!==autosaveScope);
 },[writerLifecycle,autosaveScope]);
 useEffect(()=>{
  const guard=(event:BeforeUnloadEvent)=>{if(!draftWriter.hasUnsaved())return;event.preventDefault();event.returnValue=''};
  window.addEventListener('beforeunload',guard);
  return()=>window.removeEventListener('beforeunload',guard);
 },[draftWriter]);
 const canForms=(minimum:AccessLevel='view')=>hasWorkforcePermission(context,'forms.access',minimum,companyId);
 function schemaFor(item:FormAssignment){try{const parsed:unknown=JSON.parse(item.schemaJson);return Array.isArray(parsed)?parsed as FormField[]:[]}catch{return[]}}
 function offlineSafe(item:FormAssignment,schema=formSchema(item)){return Boolean(assignedFormDraftCompany(item))&&item.requireLocation!==1&&item.requirePhoto!==1&&item.requireSignature!==1&&!schema.some((field)=>['file','photo','signature','location'].includes(field.type))}
 function formSchema(item:FormAssignment){return schemaFor(item)}
 function draftInput(item:FormAssignment,next:Record<string,unknown>):FormsDraftInput|null{
  const company=assignedFormDraftCompany(item);
  return company?{assignmentId:item.assignmentId,companyId:company,responses:next,
   supportedForOfflineSubmit:offlineSafe(item),formTitle:item.title,baseUpdatedAt:item.submissionUpdatedAt}:null
 }
 function updateResponse(item:FormAssignment,key:string,value:unknown){
  if(queuedAssignments.has(item.assignmentId)||busy||draftWriter.isSuspended(item.assignmentId))return;
  const next=pruneHiddenGuidedAnswers(formSchema(item),{...(responsesRef.current[item.assignmentId]||{}),[key]:value});
  responsesRef.current={...responsesRef.current,[item.assignmentId]:next};
  editRevision.current[item.assignmentId]=(editRevision.current[item.assignmentId]||0)+1;
  setResponses(current=>({...current,[item.assignmentId]:next}));
  const input=draftInput(item,next);
  if(input)draftWriter.schedule(item.assignmentId,input);
 }
 async function load(preserveMessage=false){
  const generation=++loadGeneration.current;
  const revisionsAtStart={...editRevision.current};
  setBusy(true);if(!preserveMessage)setMessage('');
  try{
   const suffix=companyId?'?companyId='+encodeURIComponent(companyId):'';
   const[formResult,mineResult]=await Promise.all([api<{forms:WorkflowForm[]}>('/api/forms'+suffix),api<{assignments:FormAssignment[]}>('/api/forms/mine')]);
   if(generation!==loadGeneration.current)return;
   const assignments=mineResult.assignments||[];
   setForms(formResult.forms||[]);setMine(assignments);
   const drafts=await Promise.all(assignments.map(async item=>[
    item.assignmentId,assignedFormDraftCompany(item)
     ?await offlineRef.current.readFormsDraft(item.assignmentId,assignedFormDraftCompany(item)!):null
   ]as const));
   if(generation!==loadGeneration.current)return;
   const restored=Object.fromEntries(drafts.filter(([id,draft])=>draft&&
    (editRevision.current[id]||0)===(revisionsAtStart[id]||0))
    .map(([id,draft])=>[id,draft!.responses||{}]));
   responsesRef.current={...responsesRef.current,...restored};
   setResponses(current=>({...current,...restored}));
   const queued=new Set(drafts.filter(([,draft])=>draft&&
    ['waiting-to-sync','syncing'].includes(draft.state)).map(([id])=>id));
   setQueuedAssignments(queued);
   for(const item of assignments){
    if(queued.has(item.assignmentId))void draftWriter.suspend(item.assignmentId);
    else if(!['submitted','reviewed','approved'].includes(item.status))draftWriter.resume(item.assignmentId);
   }
   if(canForms('edit')){
    const[employeeResult,roleResult]=await Promise.all([
     api<{employees:DirectoryEmployee[]}>('/api/directory/employees'+suffix),
     api<{roles:DirectoryRole[]}>('/api/directory/roles'+suffix)
    ]);
    if(generation!==loadGeneration.current)return;
    setEmployees(employeeResult.employees||[]);setRoles(roleResult.roles||[]);
   }else{setEmployees([]);setRoles([])}
  }catch(e){if(generation===loadGeneration.current)setMessage((e as Error).message)}
  finally{if(generation===loadGeneration.current)setBusy(false)}
 }
 useEffect(()=>{
  loadGeneration.current+=1;
  editRevision.current={};
  responsesRef.current={};
  setResponses({});setQueuedAssignments(new Set());setForms([]);setMine([]);
  void load();
 },[companyId,autosaveScope]);
 async function createForm(e:React.FormEvent){e.preventDefault();setBusy(true);try{const schema=prepareFormSchema(fields,optionDrafts);await api('/api/forms',{method:'POST',body:JSON.stringify({companyId:companyId||undefined,...newForm,schema})});setNewForm({title:'',description:'',formType:'custom',requireLocation:false});setFields([{key:'activity',label:'Activity / response',type:'textarea',required:true}]);setOptionDrafts({});setTitleEdited(false);setDescriptionEdited(false);setMessage('Form created successfully.');await load(true)}catch(err){setMessage((err as Error).message)}finally{setBusy(false)}}
 async function assignForm(e:React.FormEvent){e.preventDefault();if(!selectedForm){setMessage('Select a form first.');return}setBusy(true);try{await api('/api/forms/assign',{method:'POST',body:JSON.stringify({formId:selectedForm,companyId:companyId||undefined,...assign})});setMessage('Form assigned successfully.');await load(true)}catch(err){setMessage((err as Error).message)}finally{setBusy(false)}}
 async function submit(item:FormAssignment){
  if(busy||queuedAssignments.has(item.assignmentId))return;
  const schema=formSchema(item);
  if(!validGuidedFormSchema(schema)){setMessage('This form cannot be submitted because its field configuration is invalid. Ask an administrator to review it.');return}
  const assignmentCompanyId=assignedFormDraftCompany(item),supported=offlineSafe(item,schema);
  const payload=pruneHiddenGuidedAnswers(schema,responsesRef.current[item.assignmentId]||responses[item.assignmentId]||{});
  const evidenceBlocker=guidedFormEvidenceBlocker(schema,payload,{requirePhoto:item.requirePhoto===1,requireSignature:item.requireSignature===1});
  if(evidenceBlocker){setMessage(evidenceBlocker);return}
  let heldForSubmission=false,storedDraft=false;
  const markQueued=()=>{
   heldForSubmission=true;
   setQueuedAssignments(current=>new Set([...current,item.assignmentId]));
  };
  setBusy(true);
  try{
   // Wait for any active encrypted autosave, then prevent stale trailing edits.
   await draftWriter.suspend(item.assignmentId);
   try{await draftWriter.flushAll()}catch{/* The failing draft is reported separately by the writer. */}
   const completeness=guidedCompletion(schema,payload),invalid=guidedInvalidAnswers(schema,payload);
   if(completeness.missingLabels.length||invalid.length){
    const details=[...new Set([...completeness.missingLabels,...invalid])].join(', ');
    if(!assignmentCompanyId){
     setMessage(item.title+' is incomplete and has not been saved offline. Group-wide forms require a live connection. Review: '+details);
     return;
    }
    try{
     await offlineRef.current.queueFormsDraft({assignmentId:item.assignmentId,companyId:assignmentCompanyId,
      responses:payload,supportedForOfflineSubmit:supported,formTitle:item.title,
      baseUpdatedAt:item.submissionUpdatedAt},assignmentCompanyId);
     storedDraft=true;
     setMessage(item.title+' saved as a local draft, not submitted. Review: '+details);
    }catch(error){
     setMessage(item.title+' is incomplete and was not submitted. Draft could not be saved securely: '+
      (error instanceof Error?error.message:'Please try again.'));
    }
    return;
   }
   if(!navigator.onLine&&!assignmentCompanyId){
    setMessage(item.title+' is not saved offline. Group-wide forms need a live connection. Keep this page open until you can submit.');
    return;
   }
   if(!navigator.onLine&&!supported){
    await offlineRef.current.queueFormsDraft({assignmentId:item.assignmentId,companyId:assignmentCompanyId!,
     responses:payload,supportedForOfflineSubmit:false,formTitle:item.title,
     baseUpdatedAt:item.submissionUpdatedAt},assignmentCompanyId!);
    storedDraft=true;
    setMessage(item.title+' saved as a local draft. A live connection is required for this form.');
    return;
   }
   if(!navigator.onLine){
    await offlineRef.current.queueFormsSubmission({assignmentId:item.assignmentId,companyId:assignmentCompanyId!,
     responses:payload,supportedForOfflineSubmit:true,formTitle:item.title,
     baseUpdatedAt:item.submissionUpdatedAt},assignmentCompanyId!);
    markQueued();
    setMessage(item.title+' saved offline · Waiting to sync.');
    return;
   }
   let location:Record<string,number>={};
   if(item.requireLocation){
    const p=await new Promise<GeolocationPosition>((resolve,reject)=>
     navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000}));
    location={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy};
   }
   await api('/api/forms/submit',{method:'POST',body:JSON.stringify({
    assignmentId:item.assignmentId,responses:payload,baseUpdatedAt:item.submissionUpdatedAt,...location
   })});
   markQueued(); // Prevent edits between authoritative success and refreshed server status.
   setMessage(item.title+' submitted.');
   await load(true);
  }catch(err){
   const status=(err as{status?:number}).status;
   if(status===undefined||!navigator.onLine){
    if(!assignmentCompanyId){
     setMessage(item.title+' has not been saved or submitted. Group-wide forms need a live connection. Keep this page open and retry.');
    }else{
     try{
      if(supported){
       await offlineRef.current.queueFormsSubmission({assignmentId:item.assignmentId,companyId:assignmentCompanyId,
        responses:payload,supportedForOfflineSubmit:true,formTitle:item.title,
        baseUpdatedAt:item.submissionUpdatedAt},assignmentCompanyId);
       markQueued();
       setMessage(item.title+' saved offline · Waiting to sync.');
      }else{
       await offlineRef.current.queueFormsDraft({assignmentId:item.assignmentId,companyId:assignmentCompanyId,
        responses:payload,supportedForOfflineSubmit:false,formTitle:item.title,
        baseUpdatedAt:item.submissionUpdatedAt},assignmentCompanyId);
       storedDraft=true;
       setMessage(item.title+' saved as a local draft. A live connection is required for this form.');
      }
     }catch(queueError){
      setMessage(item.title+' was not submitted or securely queued. Keep this page open and retry: '+
       (queueError instanceof Error?queueError.message:'Storage unavailable.'));
     }
    }
   }else setMessage((err as Error).message);
  }finally{
   // Only queued/server-submitted forms stay frozen. Failed attempts remain editable.
   if(!heldForSubmission){
    draftWriter.resume(item.assignmentId);
    if(assignmentCompanyId&&!storedDraft){
     const input=draftInput(item,payload);
     if(input)draftWriter.schedule(item.assignmentId,input);
    }
   }
   setBusy(false);
  }
 }
 const selected=useMemo(()=>new Set(assign.employeeIds),[assign.employeeIds]);
 return <div className="center-stack" data-forms-center="true"><div className="view-heading"><div><span className="eyebrow">SMART FORMS & ACCOUNTABILITY</span><h2>Assigned forms & submissions</h2><p>Create application, review, inspection, incident and daily-report forms; assign them to the exact employees, roles or organizations you choose.</p></div><button className="text-action" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button></div>{message&&<Notice message={message}/>}<section className="center-grid two"><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">MY WORK</span><h3>Assigned forms</h3></div><ClipboardCheck size={20}/></div>{mine.length===0?<div className="empty-state"><CheckCircle2 size={27}/><strong>No assigned forms pending</strong></div>:<div className="assignment-list">{mine.map(item=>{const schema=formSchema(item),configured=validGuidedFormSchema(schema),supported=configured&&offlineSafe(item,schema),draft=responses[item.assignmentId]||{},completion=configured?guidedCompletion(schema,draft):{completed:0,total:0,missingLabels:[],percent:0},invalid=configured?guidedInvalidAnswers(schema,draft):[],evidenceBlocker=configured?guidedFormEvidenceBlocker(schema,draft,{requirePhoto:item.requirePhoto===1,requireSignature:item.requireSignature===1}):null;return <div className={'assignment-card '+(item.blocking?'blocking':'')} key={item.assignmentId} data-form-assignment={item.assignmentId}><div className="assignment-head"><div><strong>{item.title}</strong><span>{item.formType.replaceAll('_',' ')}{item.dueAt?' · Due '+new Date(item.dueAt).toLocaleString():''}</span></div><b>{item.status.replaceAll('_',' ')}</b></div>{!['submitted','reviewed','approved'].includes(item.status)&&(!configured?<div className="form-configuration-error" role="alert">This form has invalid field rules or an unreadable configuration. Ask an administrator to review it. Other assigned forms remain available.</div>:<fieldset className="dynamic-form" disabled={busy||queuedAssignments.has(item.assignmentId)} onBlurCapture={()=>{void draftWriter.flush(item.assignmentId).catch(()=>undefined)}}><legend className="form-answers-legend">{item.title} answers</legend>{queuedAssignments.has(item.assignmentId)&&<small className="offline-form-draft-note" role="status">Submission is queued for sync. Editing is paused to protect the saved answers.</small>}<div className="form-completeness" role="status" aria-live="polite"><strong>{completion.completed} of {completion.total} required answers complete</strong><progress value={completion.completed} max={Math.max(1,completion.total)} aria-label="Required form answers completed" />{completion.missingLabels.length>0&&<small>Still needed: {completion.missingLabels.join(', ')}</small>}{invalid.length>0&&<small className="form-completeness-warning" role="alert">Review invalid answers: {invalid.join(', ')}</small>}</div>{evidenceBlocker&&<div className="form-evidence-warning" role="alert">{evidenceBlocker}</div>}{guidedVisibleFields(schema,draft).map(f=><label key={f.key}><span>{f.label}{f.required?' *':''}</span>{['file','photo','signature','location'].includes(f.type)?<small className="form-evidence-warning">Verified {f.type} evidence cannot be captured as ordinary text. Ask an administrator for the approved evidence workflow.</small>:f.type==='textarea'?<textarea rows={2} value={String(responses[item.assignmentId]?.[f.key]||'')} onChange={e=>updateResponse(item,f.key,e.target.value)}/>:f.type==='checkbox'?<input type="checkbox" checked={Boolean(responses[item.assignmentId]?.[f.key])} onChange={e=>updateResponse(item,f.key,e.target.checked)}/>:f.type==='select'?<select required={Boolean(f.required)} value={String(responses[item.assignmentId]?.[f.key]??'')} onChange={e=>updateResponse(item,f.key,e.target.value)}><option value="">Select an approved answer…</option>{(Array.isArray(f.options)?f.options:[]).map(option=><option key={option} value={option}>{option}</option>)}</select>:<input type={f.type==='date'?'date':f.type==='number'?'number':'text'} value={String(responses[item.assignmentId]?.[f.key]||'')} onChange={e=>updateResponse(item,f.key,e.target.value)}/>}</label>)}{!assignedFormDraftCompany(item)?<small className="offline-form-draft-note">This group-wide form requires a live connection. Answers are not saved offline.</small>:!supported&&<small className="offline-form-draft-note">This form stays draft-only offline because it requires live location or verified evidence.</small>}<button className="primary-action small" data-offline-form-submit={supported?'supported':'draft-only'} disabled={busy||queuedAssignments.has(item.assignmentId)||Boolean(evidenceBlocker)} onClick={()=>void submit(item)}><Send size={15}/> Submit</button></fieldset>)}</div>})}</div>}</article><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">FORM LIBRARY</span><h3>Available forms</h3></div><FilePlus2 size={20}/></div><div className="compact-list">{forms.map(f=><button key={f.id} onClick={()=>setSelectedForm(f.id)} className={selectedForm===f.id?'selected':''}><div><strong>{f.title}</strong><span>{f.companyName||'Daenem Group'} · {f.formType.replaceAll('_',' ')}</span></div><b>{f.assignmentCount||0} assigned</b></button>)}{!forms.length&&<div className="empty-state"><FilePlus2 size={27}/><strong>No forms yet</strong></div>}</div></article></section>{canForms('create')&&<section className="center-grid two admin-zone"><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">FORM BUILDER</span><h3>Create a form</h3></div><Plus size={20}/></div><form className="center-form" onSubmit={createForm}><label><span>Title</span><input required value={newForm.title} onChange={e=>{setTitleEdited(true);setNewForm({...newForm,title:e.target.value})}}/></label><label><span>Description</span><textarea rows={2} value={newForm.description} onChange={e=>{setDescriptionEdited(true);setNewForm({...newForm,description:e.target.value})}}/></label><div className="form-row"><label><span>Type</span><select value={newForm.formType} onChange={e=>{const preset=FORM_PRESETS[e.target.value];setNewForm(current=>({...current,formType:e.target.value,title:titleEdited?current.title:preset?.title||current.title,description:descriptionEdited?current.description:preset?.description||current.description}));if(preset){setFields(preset.fields.map(f=>({...f,options:f.options?[...f.options]:undefined})));setOptionDrafts(Object.fromEntries(preset.fields.filter(f=>f.type==='select').map(f=>[f.key,(f.options||[]).join('\n')])))} }}><option value="application">Application</option><option value="daily_report">Daily report</option><option value="inspection">Inspection</option><option value="incident">Incident</option><option value="review">Review</option><option value="handover">Handover</option><option value="acknowledgement">Acknowledgement</option><option value="custom">Custom</option></select></label><label className="switch-label"><input type="checkbox" checked={newForm.requireLocation} onChange={e=>setNewForm({...newForm,requireLocation:e.target.checked})}/><span>Require GPS</span></label></div><div className="field-builder">{fields.map((f,i)=>{const parents=fields.slice(0,i).filter(parent=>parent.type==='select'||parent.type==='checkbox');const parent=parents.find(candidate=>candidate.key===f.showWhen?.fieldKey);const choices=parent?.type==='checkbox'?[{value:'true',label:'Yes'},{value:'false',label:'No'}]:parent?.type==='select'?(optionDrafts[parent.key]??(parent.options||[]).join('\n')).split(/\r?\n/).map(value=>value.trim()).filter(Boolean).map(value=>({value,label:value})):[];return <div className="field-row" key={f.key}><input value={f.label} onChange={e=>setFields(a=>a.map((x,n)=>n===i?{...x,label:e.target.value}:x))}/><select value={f.type} onChange={e=>setFields(a=>a.map((x,n)=>n===i?{...x,type:e.target.value}:x))}><option value="text">Text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="date">Date</option><option value="checkbox">Yes / No</option><option value="select">Approved Dropdown</option></select>{f.type==='select'&&<div className="guided-form-choices"><label><span>Approved choices · one per line</span><textarea rows={4} value={optionDrafts[f.key]??(f.options||[]).join('\n')} onChange={e=>setOptionDrafts(current=>({...current,[f.key]:e.target.value}))} placeholder="Enter 2–30 approved options" /></label><select aria-label={'Use standard options for '+f.label} value="" onChange={e=>{const preset=FORM_OPTION_SETS.find(p=>p.key===e.target.value);if(preset)setOptionDrafts(current=>({...current,[f.key]:preset.choices.join('\n')}))}}><option value="">Insert Standard Choices…</option>{FORM_OPTION_SETS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></div>}<label><input type="checkbox" checked={!!f.required} onChange={e=>setFields(a=>a.map((x,n)=>n===i?{...x,required:e.target.checked}:x))}/>Required</label><div className="form-rule-editor"><label><span>Show this question</span><select aria-label={'When to show '+f.label} value={f.showWhen?.fieldKey||''} onChange={e=>setFields(a=>a.map((x,n)=>n===i?{...x,showWhen:e.target.value?{fieldKey:e.target.value,equals:a.find(parent=>parent.key===e.target.value)?.type==='checkbox'?true:''}:undefined}:x))}><option value="">Always</option>{parents.map(candidate=><option key={candidate.key} value={candidate.key}>When {candidate.label} is…</option>)}</select></label>{f.showWhen&&<label><span>Required answer</span><select aria-label={'Show '+f.label+' when answer is'} value={String(f.showWhen.equals)} onChange={e=>setFields(a=>a.map((x,n)=>n===i?{...x,showWhen:{...f.showWhen!,equals:parent?.type==='checkbox'?e.target.value==='true':e.target.value}}:x))}><option value="" disabled>Select answer</option>{choices.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}</div></div>})}<button type="button" className="text-action" onClick={()=>setFields(a=>[...a,{key:'field_'+(a.length+1),label:'New field',type:'text'}])}><Plus size={14}/> Add field</button></div><button className="primary-action" disabled={busy}><FilePlus2 size={16}/> Create form</button></form></article>{canForms('edit')&&<article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">ASSIGNMENT</span><h3>Assign selected form</h3></div><Users size={20}/></div><form className="center-form" onSubmit={assignForm}><label><span>Form</span><select required value={selectedForm} onChange={e=>setSelectedForm(e.target.value)}><option value="">Select form…</option>{forms.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label><label><span>Audience</span><select value={assign.audienceType} onChange={e=>setAssign({...assign,audienceType:e.target.value})}><option value="employee">Selected employees</option><option value="role">Role</option><option value="company">Current company</option><option value="group">All Daenem Group</option></select></label>{assign.audienceType==='employee'&&<div className="employee-picker"><label className="guided-employee-search"><span>Find an assigned employee</span><input type="search" value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)} placeholder="Search approved employee list" /></label>{employees.filter(e=>[e.displayName,e.jobTitle,e.department,e.companyName].some(value=>(value||'').toLocaleLowerCase().includes(employeeFilter.trim().toLocaleLowerCase()))||selected.has(e.id)).map(e=><label key={e.id}><input type="checkbox" value={e.id} checked={selected.has(e.id)} onChange={x=>setAssign(a=>({...a,employeeIds:x.target.checked?[...a.employeeIds.filter(id=>id!==e.id),e.id]:a.employeeIds.filter(id=>id!==e.id)}))}/><span><b>{e.displayName}</b><small>{e.jobTitle||e.department||e.companyName}</small></span></label>)}</div>}{assign.audienceType==='role'&&<label><span>Role</span><select value={assign.roleId} onChange={e=>setAssign({...assign,roleId:e.target.value})}><option value="">Select role…</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}<label><span>Due date/time</span><input type="datetime-local" value={assign.dueAt} onChange={e=>setAssign({...assign,dueAt:e.target.value})}/></label><div className="toggle-row"><label><input type="checkbox" checked={assign.required} onChange={e=>setAssign({...assign,required:e.target.checked})}/> Required</label><label><input type="checkbox" checked={assign.blocking} onChange={e=>setAssign({...assign,blocking:e.target.checked})}/> Blocking</label></div><button className="primary-action" disabled={busy}><Send size={16}/> Assign</button></form></article>}</section>}</div>
}


type Broadcast={id:string;companyName?:string;broadcastType:string;title:string;message:string;severity:string;status:string;recipientCount:number;acknowledgedCount:number};type MyBroadcast={id:string;broadcastType:string;title:string;message:string;severity:string;acknowledgementRequired:number;publishedAt?:string;acknowledgedAt?:string};
export function BroadcastCenter({context,companyId}:{context:WorkforceContext;companyId:string|null}){
 const[items,setItems]=useState<Broadcast[]>([]),[mine,setMine]=useState<MyBroadcast[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const[draft,setDraft]=useState({title:'',message:'',broadcastType:'notice',severity:'information',audienceType:'company',pushNotification:false,acknowledgementRequired:false});
 async function load(){setBusy(true);try{const my=await api<{broadcasts:MyBroadcast[]}>('/api/broadcasts/mine');setMine(my.broadcasts||[]);if(can(context,'broadcasts.access')){const all=await api<{broadcasts:Broadcast[]}>('/api/broadcasts');setItems(all.broadcasts||[])}}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}useEffect(()=>{load()},[companyId]);
 async function daily(){setBusy(true);try{const r=await api<{draft:{message:string}}>('/api/broadcasts/ai-daily-word',{method:'POST',body:JSON.stringify({companyId:companyId||undefined})});setMessage(`AI Daily Word drafted for approval: “${r.draft.message}”`);await load()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function create(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api('/api/broadcasts',{method:'POST',body:JSON.stringify({...draft,audience:draft.audienceType==='group'?{type:'group'}:{type:'company',companyId:companyId||context.companies[0]?.id}})});setDraft({...draft,title:'',message:''});setMessage('Broadcast draft created.');await load()}catch(err){setMessage((err as Error).message)}finally{setBusy(false)}}
 async function action(id:string,path:string){setBusy(true);try{const body=path==='approve'?{broadcastId:id,decision:'approve'}:{broadcastId:id};await api(`/api/broadcasts/${path}`,{method:'POST',body:JSON.stringify(body)});setMessage(path==='approve'?'Broadcast approved.':'Broadcast published.');await load()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function acknowledge(id:string){await api('/api/broadcasts/acknowledge',{method:'POST',body:JSON.stringify({broadcastId:id})});await load()}
 return <div className="center-stack"><div className="view-heading"><div><span className="eyebrow">GROUP COMMUNICATIONS</span><h2>Notice & Emergency Broadcast Center</h2><p>Normal notices, approved AI encouragement and emergency messages with optional push notification and acknowledgement tracking.</p></div><button className="text-action" onClick={load}><RefreshCw size={15}/> Refresh</button></div>{message&&<Notice message={message}/>}<section className="center-grid two"><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">EMPLOYEE NOTICE BOARD</span><h3>My notices</h3></div><BellRing size={20}/></div>{!mine.length?<div className="empty-state"><Megaphone size={27}/><strong>No published notices</strong></div>:<div className="broadcast-feed">{mine.map(i=><article className={`broadcast-card ${i.severity}`} key={i.id}><div><span>{i.broadcastType.replaceAll('_',' ')}</span><strong>{i.title}</strong></div><p>{i.message}</p><footer><small>{i.publishedAt?new Date(i.publishedAt).toLocaleString():''}</small>{i.acknowledgementRequired&&!i.acknowledgedAt?<button onClick={()=>acknowledge(i.id)}>I have read this</button>:i.acknowledgedAt?<b>✓ Acknowledged</b>:null}</footer></article>)}</div>}</article><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">AI DAILY WORD</span><h3>Encouragement with approval</h3></div><Bot size={20}/></div><div className="ai-broadcast-box"><Sparkles size={26}/><p>AI prepares a concise professional staff encouragement. It remains a draft until an authorized person approves it.</p><button className="primary-action" disabled={!can(context,'broadcasts.access','create')||busy} onClick={daily}><Sparkles size={16}/> Generate draft</button></div></article></section>{can(context,'broadcasts.access','create')&&<section className="center-grid two admin-zone"><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">CREATE BROADCAST</span><h3>New workforce notice</h3></div><Radio size={20}/></div><form className="center-form" onSubmit={create}><div className="form-row"><label><span>Type</span><select value={draft.broadcastType} onChange={e=>setDraft({...draft,broadcastType:e.target.value})}><option value="notice">Notice</option><option value="important">Important</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label><label><span>Severity</span><select value={draft.severity} onChange={e=>setDraft({...draft,severity:e.target.value})}><option value="information">Information</option><option value="important">Important</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label></div><label><span>Title</span><input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label><span>Message</span><textarea required rows={5} value={draft.message} onChange={e=>setDraft({...draft,message:e.target.value})}/></label><label><span>Audience</span><select value={draft.audienceType} onChange={e=>setDraft({...draft,audienceType:e.target.value})}><option value="company">Current company</option><option value="group">All Daenem Group</option></select></label><div className="toggle-row"><label><input type="checkbox" checked={draft.pushNotification} onChange={e=>setDraft({...draft,pushNotification:e.target.checked})}/> Send push notification</label><label><input type="checkbox" checked={draft.acknowledgementRequired} onChange={e=>setDraft({...draft,acknowledgementRequired:e.target.checked})}/> Require acknowledgement</label></div><button className="primary-action" disabled={busy}><Send size={16}/> Create</button></form></article><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">APPROVAL & DELIVERY</span><h3>Broadcast queue</h3></div><ShieldCheck size={20}/></div><div className="compact-list">{items.map(i=><div className="queue-item" key={i.id}><div><strong>{i.title}</strong><span>{i.status.replaceAll('_',' ')} · {i.severity} · {i.companyName||'Group'}</span><small>{i.recipientCount||0} recipients · {i.acknowledgedCount||0} acknowledged</small></div><div>{['draft','pending_approval'].includes(i.status)&&can(context,'broadcasts.access','approve')&&<button onClick={()=>action(i.id,'approve')}>Approve</button>}{i.status==='approved'&&can(context,'broadcasts.access','approve')&&<button className="primary-mini" onClick={()=>action(i.id,'publish')}>Publish</button>}</div></div>)}</div></article></section>}</div>
}

type FacilityMetrics={facilities:number;assets:number;openWorkOrders:number;priorityWorkOrders:number;awaitingApproval:number;maintenanceCostKobo:number;preventiveDue:number};type WorkOrder={id:string;title:string;issueCategory:string;priority:string;status:string;estimateKobo?:number;facilityName?:string;assetName?:string};type Facility={id:string;name:string;locationId?:string|null};type CompanyLocation={id:string;name:string;city?:string;state?:string};type Asset={id:string;facilityId?:string;facilityName?:string;category:string;name:string;make?:string;model?:string;runningHours?:number;status:string};type Category={code:string;name:string;defaultPriority?:string};type FacilityAudit={id:string;occurredAt:string;action:string;entityType:string;entityId:string|null;actorName:string;readingId:string|null};type AssetReading={id:string;assetId:string;assetName:string;facilityName:string|null;readingType:string;readingValue:number;unit:string|null;recordedAt:string};
export function FacilitiesCenter({context,companyId}:{context:WorkforceContext;companyId:string|null}){
 const active=companyId||context.companies[0]?.id||'';const[metrics,setMetrics]=useState<FacilityMetrics|null>(null),[orders,setOrders]=useState<WorkOrder[]>([]),[facilities,setFacilities]=useState<Facility[]>([]),[assets,setAssets]=useState<Asset[]>([]),[categories,setCategories]=useState<Category[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);const[work,setWork]=useState({facilityId:'',assetId:'',issueCategory:'',title:'',description:'',priority:'normal',estimateNaira:''});const[asset,setAsset]=useState({facilityId:'',category:'',name:'',make:'',model:'',assetTag:''});const[workTitleEdited,setWorkTitleEdited]=useState(false);const[workPriorityEdited,setWorkPriorityEdited]=useState(false);const[assetNameEdited,setAssetNameEdited]=useState(false);const currentCompanyRef=useRef(active);currentCompanyRef.current=active;const[reading,setReading]=useState({assetId:'',readingType:'running_hours',readingValue:'',unit:'hours',note:''});const[locations,setLocations]=useState<CompanyLocation[]>([]);const[facilityDraft,setFacilityDraft]=useState({facilityType:'',locationId:'',name:'',description:''});const[facilityNameEdited,setFacilityNameEdited]=useState(false);const[recentReadings,setRecentReadings]=useState<AssetReading[]>([]);const[auditEvents,setAuditEvents]=useState<FacilityAudit[]>([]);const[recordsState,setRecordsState]=useState<'loading'|'ready'|'error'>('loading');
 async function load(){if(!active)return;const requestedCompany=active;setBusy(true);setRecordsState('loading');try{const[o,c,r,a]=await Promise.all([api<{metrics:FacilityMetrics;recentWorkOrders:WorkOrder[]}>(`/api/facilities/overview?companyId=${encodeURIComponent(requestedCompany)}`),api<{facilities:Facility[];assets:Asset[];categories:Category[];locations:CompanyLocation[]}>(`/api/facilities/catalog?companyId=${encodeURIComponent(requestedCompany)}`),api<{companyId:string;readings:AssetReading[]}>(`/api/facilities/readings?companyId=${encodeURIComponent(requestedCompany)}`),api<{companyId:string;events:FacilityAudit[]}>(`/api/facilities/audit?companyId=${encodeURIComponent(requestedCompany)}`)]);if(currentCompanyRef.current!==requestedCompany)return;if(r.companyId!==requestedCompany||a.companyId!==requestedCompany)throw new Error('Facilities records company scope mismatch.');setMetrics(o.metrics);setOrders(o.recentWorkOrders||[]);setFacilities(c.facilities||[]);setAssets(c.assets||[]);setCategories(c.categories||[]);setLocations(c.locations||[]);setRecentReadings(r.readings||[]);setAuditEvents(a.events||[]);setRecordsState('ready')}catch(e){if(currentCompanyRef.current===requestedCompany){setMetrics(null);setOrders([]);setFacilities([]);setAssets([]);setCategories([]);setLocations([]);setRecentReadings([]);setAuditEvents([]);setRecordsState('error');setMessage((e as Error).message)}}finally{if(currentCompanyRef.current===requestedCompany)setBusy(false)}}
 useEffect(()=>{setMetrics(null);setOrders([]);setFacilities([]);setAssets([]);setCategories([]);setLocations([]);setRecentReadings([]);setAuditEvents([]);setRecordsState('loading');setFacilityDraft({facilityType:'',locationId:'',name:'',description:''});setFacilityNameEdited(false);setWork({facilityId:'',assetId:'',issueCategory:'',title:'',description:'',priority:'normal',estimateNaira:''});setAsset({facilityId:'',category:'',name:'',make:'',model:'',assetTag:''});setReading({assetId:'',readingType:'running_hours',readingValue:'',unit:'hours',note:''});setWorkTitleEdited(false);setWorkPriorityEdited(false);setAssetNameEdited(false);void load()},[active]);
 const selectedCategory=categories.find(item=>item.code===work.issueCategory);
 const selectedFacility=facilities.find(item=>item.id===work.facilityId);
 const selectedAsset=assets.find(item=>item.id===work.assetId);
 const suggestedTitle=suggestedWorkTitle(selectedCategory,selectedFacility,selectedAsset);
 const availableWorkAssets=assetsForSelectedFacility(assets,work.facilityId);
 const assetCategory=categories.find(item=>item.code===asset.category);
 const suggestedAssetLabel=suggestedAssetName(assetCategory,asset.make,asset.model);
 const facilityLocation=locations.find(item=>item.id===facilityDraft.locationId);
 const suggestedFacilityLabel=suggestFacilityName(facilityDraft.facilityType,facilityLocation);
 const duplicateFacility=facilities.some(item=>normaliseFacilityName(item.name).toLocaleLowerCase()===normaliseFacilityName(facilityDraft.name).toLocaleLowerCase()&&(item.locationId||'')===facilityDraft.locationId);

 
 async function createFacility(e:React.FormEvent){
  e.preventDefault();
  if(!STAFFPORTAL_FACILITY_TYPES.some(item=>item.value===facilityDraft.facilityType)){setMessage('Choose an approved facility type.');return}
  if(!normaliseFacilityName(facilityDraft.name)){setMessage('Enter or accept a facility name.');return}
  if(facilityDraft.locationId&&!locations.some(item=>item.id===facilityDraft.locationId)){setMessage('Select an existing location for this company.');return}
  if(duplicateFacility){setMessage('This facility is already registered at the selected location. Select the existing record.');return}
  setBusy(true);
  try{
    await api('/api/facilities',{method:'POST',body:JSON.stringify({companyId:active,...facilityDraft})});
    setFacilityDraft({facilityType:'',locationId:'',name:'',description:''});
    setFacilityNameEdited(false);
    setMessage('Facility registered successfully. It is now available for equipment and maintenance.');
    await load();
  }catch(err){setMessage((err as Error).message)}finally{setBusy(false)}
 }
 async function createWork(e:React.FormEvent){e.preventDefault();if(!categories.some(c=>c.code===work.issueCategory)){setMessage('Choose an approved maintenance category.');return}if(!validFacilitySelection(work.facilityId,work.assetId,facilities,assets)){setMessage('Select a facility and asset from the current company records.');return}setBusy(true);try{await api('/api/facilities/work-orders',{method:'POST',body:JSON.stringify({companyId:active,...work,estimateKobo:work.estimateNaira?Math.round(Number(work.estimateNaira)*100):undefined})});setWork({...work,title:'',description:'',estimateNaira:''});setWorkTitleEdited(false);setMessage('Maintenance work order created.');await load()}catch(err){setMessage((err as Error).message)}finally{setBusy(false)}}
 async function createAsset(e:React.FormEvent){e.preventDefault();
  if(!categories.some(c=>c.code===asset.category)){setMessage('Select an approved equipment category.');return}
  if(asset.facilityId&&!facilities.some(f=>f.id===asset.facilityId)){setMessage('Choose a facility from the current company records.');return}
  setBusy(true);try{const result=await api<{asset?:{assetTag?:string}}>('/api/facilities/assets',{method:'POST',body:JSON.stringify({companyId:active,...asset})});setAsset({...asset,name:'',make:'',model:'',assetTag:''});setAssetNameEdited(false);setMessage(result.asset?.assetTag?`Asset registered. Tag: ${result.asset.assetTag}`:'Asset registered.');await load()}catch(err){setMessage((err as Error).message)}finally{setBusy(false)}}
 async function recordReading(e:React.FormEvent){e.preventDefault();
  if(!assets.some(a=>a.id===reading.assetId)){setMessage('Select an approved equipment record first.');return}
  const amount=Number(reading.readingValue);
  if(!reading.readingValue.trim()||!Number.isFinite(amount)){setMessage('Enter a valid numeric reading.');return}
  if(['running_hours','fuel_added_litres','diesel_litres','energy_kwh','battery_voltage'].includes(reading.readingType)&&amount<0){setMessage('This reading cannot be negative.');return}
  if(!reading.unit.trim()){setMessage('Choose or enter a measurement unit.');return}
  setBusy(true);try{await api('/api/facilities/readings',{method:'POST',body:JSON.stringify({companyId:active,...reading,readingValue:amount})});setReading({...reading,readingValue:'',note:''});setMessage('Asset reading recorded.');await load()}catch(err){setMessage((err as Error).message)}finally{setBusy(false)}}
 async function advance(o:WorkOrder){const flow:Record<string,string>={reported:'triaged',triaged:'in_progress',approved:'in_progress',in_progress:'completed',completed:'verified'};if(!flow[o.status])return;try{await api('/api/facilities/work-orders/update',{method:'POST',body:JSON.stringify({workOrderId:o.id,status:flow[o.status]})});await load()}catch(e){setMessage((e as Error).message)}}
 if(!active)return <div className="empty-state tall"><Building2 size={32}/><strong>Select a company</strong></div>;
 return <div className="center-stack"><div className="view-heading"><div><span className="eyebrow">FACILITIES & BUILDING MAINTENANCE</span><h2>Maintenance Command Center</h2><p>Track buildings, generators, solar/inverter, boreholes, AC, CCTV, electrical, plumbing, fire equipment, service history and repair costs.</p></div><button className="text-action" onClick={load}><RefreshCw size={15}/> Refresh</button></div>{message&&<Notice message={message}/>}<div className="facility-metrics"><article><Wrench/><div><small>Open work orders</small><strong>{metrics?.openWorkOrders??'—'}</strong></div></article><article><AlertTriangle/><div><small>High / critical</small><strong>{metrics?.priorityWorkOrders??'—'}</strong></div></article><article><Gauge/><div><small>Preventive due</small><strong>{metrics?.preventiveDue??'—'}</strong></div></article><article><Zap/><div><small>Assets</small><strong>{metrics?.assets??'—'}</strong></div></article><article><Building2/><div><small>Facilities</small><strong>{metrics?.facilities??'—'}</strong></div></article><article><ShieldCheck/><div><small>Maintenance spend</small><strong>{money(metrics?.maintenanceCostKobo)}</strong></div></article></div><section className="center-grid two"><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">ACTIVE MAINTENANCE</span><h3>Work orders</h3></div><Wrench size={20}/></div><div className="work-order-list" data-record-source="cloudflare-d1">{recordsState==='ready'&&orders.length===0&&<div className="empty-state facility-record-empty" role="status"><Wrench size={22}/><strong>No recorded work orders</strong><span>This company has no maintenance work orders in the live database.</span></div>}{orders.map(o=><div className="work-order" key={o.id}><span className={`priority ${o.priority}`}>{o.priority}</span><div><strong>{o.title}</strong><span>{o.facilityName||'Facility'}{o.assetName?` · ${o.assetName}`:''} · {o.issueCategory}</span><small>{o.status.replaceAll('_',' ')}{o.estimateKobo?` · Est. ${money(o.estimateKobo)}`:''}</small></div>{can(context,'facilities.access','edit')&&<button onClick={()=>advance(o)}>Advance</button>}</div>)}</div></article><article className="panel center-panel"><div className="card-heading"><div><span className="eyebrow">ASSET REGISTER</span><h3>Tracked equipment</h3></div><Gauge size={20}/></div><div className="compact-list asset-list" data-record-source="cloudflare-d1">{recordsState==='ready'&&assets.length===0&&<div className="empty-state facility-record-empty" role="status"><Gauge size={22}/><strong>No equipment registered yet</strong><span>Use Register Equipment below to add an approved company asset.</span></div>}{assets.map(a=><div className="asset-row" key={a.id}><div><strong>{a.name}</strong><span>{a.category} · {a.facilityName||'Unassigned'}</span><small>{a.make||''} {a.model||''}{a.runningHours!==undefined?` · ${a.runningHours} hours`:''}</small></div><b>{a.status}</b></div>)}</div></article></section><section className="center-grid two facility-history-grid" data-record-source="cloudflare-d1">
  <article className="panel center-panel facility-history-panel">
    <div className="card-heading"><div><span className="eyebrow">PERSISTED FACILITIES DATA</span><h3>Recent Meter &amp; Fuel Readings</h3></div><Database size={20}/></div>
    {recordsState==='loading'?<div className="facility-history-state" role="status">Loading company readings…</div>:recordsState==='error'?<div className="facility-history-state" role="status">Readings could not be loaded. Refresh to retry; no records have been inferred.</div>:recentReadings.length===0?<div className="empty-state facility-record-empty" role="status"><Gauge size={25}/><strong>No readings recorded yet</strong><span>New meter and fuel readings appear here after successful database recording.</span></div>:<div className="facility-reading-history" aria-label="Latest company meter and fuel readings">{recentReadings.map(item=><div className="facility-reading-row" key={item.id}><div><strong>{item.assetName}</strong><span>{ASSET_READING_TYPES.find(type=>type.value===item.readingType)?.label||item.readingType.replaceAll('_',' ')}{item.facilityName?` · ${item.facilityName}`:''}</span><small><time dateTime={item.recordedAt.replace(' ','T')+'Z'}>{item.recordedAt} UTC</time></small><small className={auditEvents.some(event=>event.readingId===item.id)?'facility-audit-match':'facility-audit-unlinked'}>{auditEvents.some(event=>event.readingId===item.id)?'Matched to Audit Record':'Audit Link Not Available'}</small></div><b>{Number.isFinite(item.readingValue)?new Intl.NumberFormat('en-NG',{maximumFractionDigits:2}).format(item.readingValue):'—'}{item.unit?` ${item.unit}`:''}</b></div>)}</div>}
  </article>
  <article className="panel center-panel facility-source-panel">
    <div className="card-heading"><div><span className="eyebrow">RECORD ACCURACY</span><h3>Live Company Records</h3></div><ShieldCheck size={20}/></div>
    <p>Work orders, registered equipment and meter readings are retrieved from the authorised company’s Cloudflare D1 database. No demonstration history or estimated values are substituted for missing records.</p>
    <p>Reading history is capped at the latest 20 entries. The facility register and maintenance forms remain available below for authorised employees.</p>
  </article>
</section><section className="center-grid two facility-audit-grid" data-record-source="cloudflare-d1">
  <article className="panel center-panel facility-audit-panel">
    <div className="card-heading"><div><span className="eyebrow">AUDITABLE BUSINESS ACTIVITY</span><h3>Facilities Activity &amp; Audit Trail</h3></div><ShieldCheck size={20}/></div>
    {recordsState==='loading'?<div className="facility-history-state" role="status">Loading audit activity…</div>:recordsState==='error'?<div className="facility-history-state" role="status">Audit records could not be loaded. Refresh to retry.</div>:auditEvents.length===0?<div className="empty-state facility-record-empty" role="status"><ShieldCheck size={24}/><strong>No Facilities Activity Recorded</strong><span>Actions will appear here only after they are recorded in the authorised company audit log.</span></div>:<ol className="facility-audit-events" aria-label="Latest authenticated company Facilities actions">{auditEvents.map(event=><li className="facility-audit-event" key={event.id}><div><strong>{event.action==='record_reading'?'Meter / Fuel Reading Recorded':event.action==='create'?event.entityType==='facility'?'Facility Registered':event.entityType==='asset'?'Equipment Registered':event.entityType==='maintenance_work_order'?'Maintenance Work Order Created':'Facilities Record Created':event.action==='update'?'Maintenance Work Order Updated':event.action.replaceAll('_',' ')}</strong><span>{event.actorName} · {event.entityType.replaceAll('_',' ')}</span>{event.readingId&&<small>Reading Reference: {event.readingId}</small>}</div><time dateTime={event.occurredAt.replace(' ','T')+'Z'}>{event.occurredAt} UTC</time></li>)}</ol>}
    <p className="facility-audit-context">Latest 25 audit entries for the selected company. Raw employee and business data changes are not exposed in this activity list.</p>
  </article>
</section>{can(context,'facilities.access','create')&&<section className="center-grid two admin-zone facilities-guided-create-grid"><article className="panel center-panel facility-register-card">
  <div className="card-heading"><div><span className="eyebrow">COMPANY FACILITY REGISTER</span><h3>Register Facility</h3></div><Building2 size={19}/></div>
  <form className="center-form guided-maintenance-form" onSubmit={createFacility}>
    <SmartMasterSelect label="Facility Type" required value={facilityDraft.facilityType} onChange={type=>setFacilityDraft(current=>({...current,facilityType:type,name:facilityNameEdited?current.name:suggestFacilityName(type,locations.find(loc=>loc.id===current.locationId))}))} options={STAFFPORTAL_FACILITY_TYPES.map(item=>({value:item.value,label:item.label}))} help="Select a standard operating space for this company."/>
    <SmartMasterSelect label="Company Location" value={facilityDraft.locationId} onChange={id=>setFacilityDraft(current=>({...current,locationId:id,name:facilityNameEdited?current.name:suggestFacilityName(current.facilityType,locations.find(loc=>loc.id===id))}))} options={locations.map(loc=>({value:loc.id,label:loc.name,searchText:[loc.city,loc.state].filter(Boolean).join(' ')}))} emptyLabel="No Location Linked" help={locations.length?'Only approved active company locations are selectable.':'No company locations are registered yet. The facility can be saved without a linked location.'}/>
    <label><span>Facility Name *</span><input required maxLength={180} value={facilityDraft.name} placeholder="Choose a facility type for a suggested name" onChange={e=>{setFacilityDraft({...facilityDraft,name:e.target.value});setFacilityNameEdited(true)}}/></label>
    {suggestedFacilityLabel&&<button type="button" className="text-action guided-title-action" onClick={()=>{setFacilityDraft(current=>({...current,name:suggestedFacilityLabel}));setFacilityNameEdited(false)}}>Use Suggested Name: {suggestedFacilityLabel}</button>}
    <label><span>Facility Details (Optional)</span><textarea maxLength={2000} rows={2} value={facilityDraft.description} placeholder="Add only details not already recorded in the company location" onChange={e=>setFacilityDraft({...facilityDraft,description:e.target.value})}/></label>
    {duplicateFacility&&<small className="facility-duplicate-notice" role="status">This facility already exists at the selected location. Choose it from the registered facilities list rather than creating a duplicate.</small>}
    <button className="primary-action" disabled={busy||!facilityDraft.facilityType||!normaliseFacilityName(facilityDraft.name)||duplicateFacility}><Plus size={15}/> Register Facility</button>
  </form>
</article><article className="panel center-panel"><div className="card-heading"><h3>Report maintenance</h3><Wrench size={19}/></div><form className="center-form guided-maintenance-form" onSubmit={createWork}>
 <SmartMasterSelect label="Maintenance Category" required value={work.issueCategory} onChange={code=>{const category=categories.find(c=>c.code===code);setWork(current=>({...current,issueCategory:code,priority:workPriorityEdited?current.priority:recommendedWorkPriority(category),title:workTitleEdited?current.title:suggestedWorkTitle(category,facilities.find(f=>f.id===current.facilityId),assets.find(a=>a.id===current.assetId))}))}} options={categories.map(c=>({value:c.code,label:c.name}))} help="Choose a maintained category; configured priority is suggested automatically." />
 <SmartMasterSelect label="Facility" value={work.facilityId} onChange={id=>setWork(current=>{const currentAsset=assets.find(a=>a.id===current.assetId);const assetId=currentAsset&&(!id||!currentAsset.facilityId||currentAsset.facilityId===id)?current.assetId:'';return {...current,facilityId:id,assetId,title:workTitleEdited?current.title:suggestedWorkTitle(categories.find(c=>c.code===current.issueCategory),facilities.find(f=>f.id===id),assets.find(a=>a.id===assetId))}})} options={facilities.map(f=>({value:f.id,label:f.name}))} emptyLabel="Select a facility if relevant" help="Only facilities registered for the selected company." />
 <SmartMasterSelect label="Equipment / Asset" value={work.assetId} onChange={id=>setWork(current=>{const chosen=assets.find(a=>a.id===id);const facilityId=chosen?.facilityId&&facilities.some(f=>f.id===chosen.facilityId)?chosen.facilityId:current.facilityId;return {...current,assetId:id,facilityId,title:workTitleEdited?current.title:suggestedWorkTitle(categories.find(c=>c.code===current.issueCategory),facilities.find(f=>f.id===facilityId),chosen)}})} options={availableWorkAssets.map(a=>({value:a.id,label:a.name,searchText:[a.category,a.facilityName].filter(Boolean).join(' ')}))} emptyLabel="No specific asset" help="Equipment choices are filtered to the selected facility. Choosing equipment also selects its registered facility." />
 <label><span>Issue Title *</span><input required value={work.title} onChange={e=>{setWork({...work,title:e.target.value});setWorkTitleEdited(true)}} placeholder="Select a category to suggest a title" /></label>
 {suggestedTitle&&<button type="button" className="text-action guided-title-action" onClick={()=>{setWork(current=>({...current,title:suggestedTitle}));setWorkTitleEdited(false)}}>Use Suggested Title: {suggestedTitle}</button>}
 <label><span>Issue Details</span><textarea rows={2} value={work.description} onChange={e=>setWork({...work,description:e.target.value})} placeholder="Describe symptoms, safety risks and required work when relevant" /></label>
 <div className="form-row"><label><span>Priority</span><select value={work.priority} onChange={e=>{setWork({...work,priority:e.target.value});setWorkPriorityEdited(true)}}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label><span>Estimated Cost (₦)</span><input type="number" min="0" placeholder="Leave blank if unknown" value={work.estimateNaira} onChange={e=>setWork({...work,estimateNaira:e.target.value})}/></label></div><button className="primary-action" disabled={busy}><Plus size={15}/> Create</button></form></article><article className="panel center-panel"><div className="card-heading"><h3>Add asset</h3><Gauge size={19}/></div><form className="center-form guided-maintenance-form" onSubmit={createAsset}>
  <SmartMasterSelect label="Equipment Category" required value={asset.category} onChange={code=>setAsset(current=>({...current,category:code,name:assetNameEdited?current.name:suggestedAssetName(categories.find(c=>c.code===code),current.make,current.model)}))} options={categories.map(c=>({value:c.code,label:c.name}))} help="Choose an approved category from the current Facilities catalog."/>
  <SmartMasterSelect label="Registered Facility" value={asset.facilityId} onChange={id=>setAsset(current=>({...current,facilityId:id}))} options={facilities.map(f=>({value:f.id,label:f.name}))} emptyLabel="No specific facility" help="Only registered facilities for this company are available."/>
  <div className="form-row"><label><span>Make (If Known)</span><input value={asset.make} placeholder="Manufacturer" onChange={e=>setAsset(current=>({...current,make:e.target.value,name:assetNameEdited?current.name:suggestedAssetName(categories.find(c=>c.code===current.category),e.target.value,current.model)}))}/></label><label><span>Model (If Known)</span><input value={asset.model} placeholder="Model Number" onChange={e=>setAsset(current=>({...current,model:e.target.value,name:assetNameEdited?current.name:suggestedAssetName(categories.find(c=>c.code===current.category),current.make,e.target.value)}))}/></label></div>
  <label><span>Equipment Name *</span><input required value={asset.name} placeholder="Select a category for a suggested name" onChange={e=>{setAsset({...asset,name:e.target.value});setAssetNameEdited(true)}}/></label>
  {suggestedAssetLabel&&<button type="button" className="text-action guided-title-action" onClick={()=>{setAsset(current=>({...current,name:suggestedAssetLabel}));setAssetNameEdited(false)}}>Use Suggested Name: {suggestedAssetLabel}</button>}
  <label><span>Asset Tag (Optional)</span><input value={asset.assetTag} placeholder="Automatically Generated If Left Blank" onChange={e=>setAsset({...asset,assetTag:e.target.value})}/><small>The server assigns a unique reference when this is left blank.</small></label>
  <button className="primary-action" disabled={busy||!categories.length}><Plus size={15}/> Register Equipment</button>
 </form></article><article className="panel center-panel"><div className="card-heading"><h3>Log Meter / Fuel</h3><Zap size={19}/></div>
 <form className="center-form guided-maintenance-form" onSubmit={recordReading}>
  <SmartMasterSelect label="Recorded Equipment" required value={reading.assetId} onChange={id=>setReading(current=>({...current,assetId:id}))} options={assets.map(a=>({value:a.id,label:a.name,searchText:[a.category,a.facilityName,a.make,a.model].filter(Boolean).join(' ')}))} help="Select an approved equipment record; the server checks company ownership."/>
  <label><span>Reading Type *</span><select value={reading.readingType} onChange={e=>setReading(current=>({...current,readingType:e.target.value,unit:recommendedReadingUnit(e.target.value)}))}>{ASSET_READING_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
  <div className="form-row"><label><span>Measured Value *</span><input required type="number" step="any" value={reading.readingValue} placeholder="Enter Measured Value" onChange={e=>setReading({...reading,readingValue:e.target.value})}/></label><label><span>Unit *</span><input required list="facilities-approved-reading-units" value={reading.unit} placeholder="Select Or Type Unit" onChange={e=>setReading({...reading,unit:e.target.value})}/><datalist id="facilities-approved-reading-units">{STANDARD_READING_UNITS.map(unit=><option key={unit} value={unit}/>)}</datalist></label></div>
  <label><span>Notes (Optional)</span><textarea rows={2} value={reading.note} placeholder="Only Add Information Not Already Recorded" onChange={e=>setReading({...reading,note:e.target.value})}/></label>
  <button className="primary-action" disabled={busy||!assets.length}><Gauge size={15}/> Record Reading</button>
 </form></article></section>}</div>
}
