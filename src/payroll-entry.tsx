import React,{useEffect,useState} from'react';
import{createRoot}from'react-dom/client';
import{WalletCards}from'lucide-react';
import{api,hasWorkforcePermission,type WorkforceContext}from'./auth';
import{PayrollWorkspace}from'./payroll';
import'./payroll-entry.css';

function hasPayroll(context:WorkforceContext){return context.companies.some(company=>hasWorkforcePermission(context,'payroll.access','view',company.id))}

function PayrollLauncher(){const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false),[target,setTarget]=useState<{recordId:string;companyId?:string}|null>(null);
 useEffect(()=>{let active=true;const refresh=async()=>{try{const result=await api<{authenticated:boolean;context?:WorkforceContext}>('/api/auth/me');if(active)setContext(result.context&&hasPayroll(result.context)?result.context:null)}catch{if(active)setContext(null)}};refresh();const focus=()=>refresh();const command=(event:Event)=>{const detail=(event as CustomEvent<{module?:string}>).detail;if(detail?.module==='payroll')setOpen(true)};const searchTarget=(event:Event)=>{const detail=(event as CustomEvent<{module?:string;recordId?:string;companyId?:string}>).detail;if(detail?.module==='payroll'&&detail.recordId){setTarget({recordId:detail.recordId,companyId:detail.companyId});setOpen(true)}};window.addEventListener('focus',focus);window.addEventListener('daenem:open-module',command as EventListener);window.addEventListener('daenem:stage1-search-record',searchTarget as EventListener);const timer=window.setInterval(refresh,120000);return()=>{active=false;window.removeEventListener('focus',focus);window.removeEventListener('daenem:open-module',command as EventListener);window.removeEventListener('daenem:stage1-search-record',searchTarget as EventListener);window.clearInterval(timer)}},[]);
 if(!context)return null;return <><button className="payroll-launcher" onClick={()=>{setTarget(null);setOpen(true)}}><WalletCards size={18}/><span>Payroll</span></button>{open&&<PayrollWorkspace context={context} targetRecordId={target?.recordId} targetCompanyId={target?.companyId} onClose={()=>{setOpen(false);setTarget(null)}}/>}</>}
const host=document.createElement('div');host.id='payroll-workspace-launcher';document.body.appendChild(host);createRoot(host).render(<PayrollLauncher/>);
