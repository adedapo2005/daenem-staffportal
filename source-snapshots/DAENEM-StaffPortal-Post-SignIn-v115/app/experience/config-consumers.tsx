'use client';
import {validateFieldValue} from './form-validation';
import {buildConfiguredFormValues,configuredPrefillOrigin} from './form-prefill';
import {SmartField} from './smart-forms';
import type {FormField} from './form-builder';
import {companies,recordsFor} from './model';
import {fixtureId} from './fixture-id';
import {useState} from 'react';
import {useLab} from './lab-context';
import {useDeviceState} from './device-state';
import {activeConfigurations,configurationResult} from './config-runtime';
import {byId,canAct,personFor,type RecordData} from './model';
import {type ConfigVersion} from './enterprise-contract';
import {Panel,Btn,Metric} from './ui';

export function PublishedForms(){
 const {session,mutate}=useLab();
 const [versions]=useDeviceState<ConfigVersion[]>('governed-form-builder-'+session.company,[]);
 const forms=activeConfigurations(versions,session);
 const [selected,setSelected]=useState(''),[value,setValue]=useState(''),[error,setError]=useState('');
 const form=forms.find(v=>v.id===selected);
 return <>{forms.map(v=><Panel key={v.id} title={v.name}><Btn onClick={()=>{setSelected(v.id);setValue('');setError('')}}>Open form</Btn></Panel>)}{form?.definition.schema?<ConfiguredResponse key={form.id+':'+form.version} form={form} close={()=>setSelected('')}/>:form&&<Panel title={form.name}><form onSubmit={e=>{e.preventDefault();if(form.definition.required==='Yes'&&!value.trim()){setError('Complete the required response.');return;}const row:RecordData={id:'FORM-'+fixtureId(),module:'forms',title:form.name,subtitle:'Configured form · version '+form.version,company:session.company==='group'?'printing':session.company,status:'Draft',owner:personFor(session),amount:0,due:new Date().toISOString().slice(0,10),fields:{'Form Type':form.name,Purpose:'Published form response','Required Response':value,'Configuration ID':form.id,'Configuration Version':String(form.version)},evidence:[],history:[]};if(mutate(row,row.fields,'Draft','Configured form response saved')){setSelected('');setValue('')}}}><label className="p-field">{form.name}{form.definition.required==='Yes'?' *':''}<input required={form.definition.required==='Yes'} type={form.definition.type==='Number'?'number':form.definition.type==='Date'?'date':'text'} value={value} onChange={e=>setValue(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}{canAct(byId('forms')!,session,'create')&&<Btn type="submit">Save response</Btn>}<Btn variant="quiet" onClick={()=>setSelected('')}>Cancel</Btn></form></Panel>}</>;
}
export function PublishedReports(){
 const {session,records,go}=useLab();const [versions]=useDeviceState<ConfigVersion[]>('governed-report-builder-'+session.company,[]);
 return <>{activeConfigurations(versions,session).map(v=><Panel key={v.id} title={v.name}><Metric label={v.definition.metric} value={String(configurationResult(v,records,session))} detail={'Version '+v.version+' · '+byId(v.target)!.title}/><Btn variant="outline" onClick={()=>go(v.target)}>Inspect source records</Btn></Panel>)}</>;
}

function ConfiguredResponse({form,close}:{form:ConfigVersion;close:()=>void}){
 const{session,records,mutate}=useLab();let schema:FormField[]=[];try{schema=JSON.parse(form.definition.schema)}catch{}
 const peopleModule=byId('people');const person=peopleModule?recordsFor(records,peopleModule,session).find(r=>r.title===personFor(session)):undefined;const target=byId(form.target);const effectiveCompany=target?.company||session.company;const defaults:Record<string,string>={'Current user':personFor(session),'Company':companies.find(c=>c.id===effectiveCompany)?.name||'','Department':person?.fields.Department||'','Manager':person?.fields.Manager||'','Location':person?.fields.Location||'','Current date':new Date().toISOString().slice(0,10)};const initialValues=buildConfiguredFormValues(schema,defaults);
 const[values,setValues]=useDeviceState<Record<string,string>>('form-response-'+session.personId+'-'+session.company+'-'+form.id+'-v'+form.version,initialValues);const[error,setError]=useState('');const resolvedValues={...initialValues,...values};
 const visible=schema.filter(f=>!f.when||resolvedValues[f.when]===f.equals);
 return <Panel title={form.name}><form onSubmit={e=>{e.preventDefault();const invalid=visible.map(f=>({label:f.label,error:validateFieldValue(f.kind,resolvedValues[f.id]||'',f.required,f.options)})).find(f=>f.error);if(invalid){setError(invalid.label+': '+invalid.error);return}const payload=Object.fromEntries(visible.filter(f=>!['section','divider'].includes(f.kind)).map(f=>[f.label,resolvedValues[f.id]||'']));const row:RecordData={id:'FORM-'+fixtureId(),module:'forms',title:form.name,subtitle:'Configured response · version '+form.version,company:session.company==='group'?'printing':session.company,status:'Draft',owner:personFor(session),amount:0,due:new Date().toISOString().slice(0,10),fields:{'Form Type':form.name,Purpose:'Configured form response','Required Response':JSON.stringify(payload),'Configuration ID':form.id,'Configuration Version':String(form.version)},evidence:[],history:[]};if(mutate(row,row.fields,'Draft','Configured response saved')){setValues(initialValues);close()}}}><div className="p-form-grid">{visible.map(f=>{const fieldValue=resolvedValues[f.id]||'';const origin=configuredPrefillOrigin(f,fieldValue,defaults);return <label className="p-field" key={f.id}>{f.label}{f.required?' *':''}{origin&&<small className="tech-field-origin">Prefilled · {origin}</small>}<SmartField name={f.label} kind={f.kind} required={f.required} value={fieldValue} onChange={v=>setValues(x=>({...x,[f.id]:v}))} options={f.options}/></label>})}</div>{error&&<p role="alert">{error}</p>}{canAct(byId('forms')!,session,'create')&&<Btn type="submit">Save response</Btn>}<Btn variant="outline" onClick={close}>Close & retain draft</Btn></form></Panel>
}
