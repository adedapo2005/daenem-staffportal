import React,{useEffect,useMemo,useState}from'react';
import{AlertTriangle,BarChart3,Bot,BriefcaseBusiness,Building2,Factory,Gauge,Home,RefreshCw,Sparkles,Store,Truck,WalletCards,X}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{OperatingSignals,type Signal}from'./analytics-command-widgets';
import'./owner-intelligence.css';

type CompanyKey='printing'|'bakery'|'autos'|'logistics'|'properties';
type Shared={inventory?:{valueKobo:number;lowStock:number};workforce?:{employees:number;present:number;incomplete:number};payroll?:{runs:number;grossKobo:number;netKobo:number};maintenance?:{open:number;urgent:number;costKobo:number}};
type Alert={severity:'info'|'medium'|'high';code:string;title:string;detail:string;company?:string};
// The backend omits any figure the actor may not see. An absent field means "Not authorised", never zero.
type Company=Shared&{
  current?:{orders:number;revenueKobo:number;collectedKobo:number};previous?:{orders?:number;revenueKobo:number;collectedKobo?:number};
  wasteCostKobo?:number;wastePctOfSales?:number;
  salesCount?:number;revenueKobo?:number;previousRevenueKobo?:number;grossProfitKobo?:number;stockCount?:number;stockValueKobo?:number;followupsDue?:number;
  trips?:number;expenseKobo?:number;activeShipments?:number;expiringDocs?:number;
  rentCollectedKobo?:number;previousRentCollectedKobo?:number;rentReceipts?:number;arrearsKobo?:number;overdueCharges?:number;
};
type Intelligence={generatedAt:string;workDate:string;month:string;group:Partial<{revenueKobo:number;payrollNetKobo:number;inventoryValueKobo:number;incompleteAttendance:number;lowStock:number;highRiskSecurity:number;overdueRequirements:number;pendingForms:number}>;companies:Partial<Record<CompanyKey,Company>>;alerts:Alert[]};

const NOT_AUTHORISED='Not authorised';
const hasValue=(value?:number):value is number=>typeof value==='number'&&Number.isFinite(value);
const ngn=(k?:number)=>hasValue(k)?new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(k/100):NOT_AUTHORISED;
const pct=(current?:number,previous?:number):number|null=>hasValue(current)&&hasValue(previous)?(previous<=0?(current>0?100:0):(current-previous)/previous*100):null;
const countText=(value:number|undefined,text:string)=>hasValue(value)?`${value} ${text}`:'';
const companies=[{key:'printing',name:'Printing & Technology',icon:Factory},{key:'bakery',name:'Bakery',icon:Store},{key:'autos',name:'Autos',icon:BriefcaseBusiness},{key:'logistics',name:'Logistics',icon:Truck},{key:'properties',name:'Homes & Properties',icon:Home}]as const;
const unauthorisedSignal=(label:string,detail:string):Signal=>({label,value:NOT_AUTHORISED,detail,state:'neutral'});

// The headline revenue figure for each company, or undefined when the actor may not see it.
function revenueOf(company:Company|undefined,key:CompanyKey):number|undefined{
  if(!company)return undefined;
  if(key==='printing'||key==='bakery')return company.current?.revenueKobo;
  if(key==='properties')return company.rentCollectedKobo;
  return company.revenueKobo;
}

// Metric cards for one company. Each card's value and sub-line come only from figures the response actually includes.
function metricsFor(key:CompanyKey,c:Company):Array<{label:string;value?:number;sub:string}>{
  const current=c.current,previous=c.previous,payroll=c.payroll,inventory=c.inventory;
  const payrollMetric={label:'Payroll',value:payroll?.netKobo,sub:payroll?countText(payroll.runs,'run(s)'):''};
  const stockMetric={label:'Stock',value:inventory?.valueKobo,sub:inventory?countText(inventory.lowStock,'low'):''};
  if(key==='printing'){
    const change=pct(current?.revenueKobo,previous?.revenueKobo);
    return[{label:'Sales',value:current?.revenueKobo,sub:current?countText(current.orders,'orders'):''},{label:'Collected',value:current?.collectedKobo,sub:change===null?'':`${change.toFixed(0)}% vs prior month`},stockMetric,payrollMetric];
  }
  if(key==='bakery'){
    const waste=c.wastePctOfSales;
    return[{label:'Sales',value:current?.revenueKobo,sub:current?countText(current.orders,'orders'):''},{label:'Waste cost',value:c.wasteCostKobo,sub:hasValue(waste)?`${waste.toFixed(1)}% of sales`:''},stockMetric,payrollMetric];
  }
  if(key==='autos')return[{label:'Sales',value:c.revenueKobo,sub:countText(c.salesCount,'vehicle(s)')},{label:'Gross profit',value:c.grossProfitKobo,sub:countText(c.followupsDue,'lead follow-up(s)')},{label:'Vehicle stock',value:c.stockValueKobo,sub:countText(c.stockCount,'vehicles')},payrollMetric];
  if(key==='logistics')return[{label:'Trip revenue',value:c.revenueKobo,sub:countText(c.trips,'trips')},{label:'Gross profit',value:c.grossProfitKobo,sub:countText(c.activeShipments,'shipments moving')},{label:'Trip expense',value:c.expenseKobo,sub:countText(c.expiringDocs,'docs expiring')},payrollMetric];
  return[{label:'Rent collected',value:c.rentCollectedKobo,sub:countText(c.rentReceipts,'receipt(s)')},{label:'Arrears',value:c.arrearsKobo,sub:countText(c.overdueCharges,'overdue charge(s)')},{label:'Maintenance',value:c.maintenance?.costKobo,sub:c.maintenance?countText(c.maintenance.open,'open'):''},payrollMetric];
}

export function OwnerIntelligence({context,onClose}:{context:WorkforceContext;onClose:()=>void}){
 const[data,setData]=useState<Intelligence|null>(null),[message,setMessage]=useState(''),[question,setQuestion]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);setMessage('');try{setData(await api<Intelligence>('/api/owner/intelligence'))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}useEffect(()=>{load()},[]);
 async function ask(prompt?:string){const text=(prompt||question).trim();setBusy(true);setAnswer('');try{const r=await api<{answer:string}>('/api/owner/ai',{method:'POST',body:JSON.stringify({question:text,mode:text?'question':'brief'})});setAnswer(r.answer);if(prompt)setQuestion(prompt)}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 const maxRevenue=useMemo(()=>{if(!data)return 1;const values=companies.map(({key})=>revenueOf(data.companies[key],key)).filter(hasValue);return Math.max(1,...values)},[data]);
 const g=data?.group;
 const lowStock=g?.lowStock,incompleteAttendance=g?.incompleteAttendance,highRiskSecurity=g?.highRiskSecurity,overdueRequirements=g?.overdueRequirements;
 const groupSignals:Signal[]=data?[
  hasValue(lowStock)?{label:'Inventory Attention',value:String(lowStock),detail:'Low-stock item(s) across authorized companies',state:lowStock?'attention':'healthy' as const}:unauthorisedSignal('Inventory Attention','Inventory'),
  hasValue(incompleteAttendance)?{label:'Attendance Exceptions',value:String(incompleteAttendance),detail:'Incomplete attendance requiring follow-up',state:incompleteAttendance?'attention':'healthy' as const}:unauthorisedSignal('Attendance Exceptions','Workforce'),
  hasValue(highRiskSecurity)?{label:'Security Review',value:String(highRiskSecurity),detail:'High-risk security item(s) not yet reviewed',state:highRiskSecurity?'critical':'healthy' as const}:unauthorisedSignal('Security Review','Security'),
  hasValue(overdueRequirements)?{label:'Required Work',value:String(overdueRequirements),detail:'Overdue role submission(s)',state:overdueRequirements?'critical':'healthy' as const}:unauthorisedSignal('Required Work','Forms'),
 ]:[];
 return <div className="owner-backdrop" onClick={onClose}><section className="owner-shell" onClick={e=>e.stopPropagation()}><header className="owner-head"><div><span className="owner-mark"><Gauge size={22}/></span><div><small>DAENEM GROUP · OWNER / SUPER ADMIN</small><h2>Group Intelligence Command Center</h2></div></div><aside><button onClick={load}><RefreshCw size={17}/></button><button onClick={onClose}><X size={19}/></button></aside></header>{message&&<div className="owner-message">{message}</div>}<main className="owner-content">{!data?<div className="owner-loading"><Gauge size={30}/><strong>{busy?'Building Group intelligence…':'No intelligence available'}</strong></div>:<><section className="owner-kpis"><article><small>Group revenue / collections</small><strong>{ngn(g?.revenueKobo)}</strong><span>{data.month}</span></article><article><small>Group payroll net</small><strong>{ngn(g?.payrollNetKobo)}</strong><span>current payroll periods</span></article><article><small>Inventory value</small><strong>{ngn(g?.inventoryValueKobo)}</strong><span>{hasValue(lowStock)?`${lowStock} low-stock item(s)`:NOT_AUTHORISED}</span></article><article><small>Attendance exceptions</small><strong>{hasValue(incompleteAttendance)?incompleteAttendance:NOT_AUTHORISED}</strong><span>incomplete today</span></article><article><small>Security</small><strong>{hasValue(highRiskSecurity)?highRiskSecurity:NOT_AUTHORISED}</strong><span>high-risk unreviewed</span></article><article><small>Required work</small><strong>{hasValue(overdueRequirements)?overdueRequirements:NOT_AUTHORISED}</strong><span>overdue role submissions</span></article></section><section className="owner-analytics-upgrade"><OperatingSignals signals={groupSignals}/></section><section className="owner-grid top"><article className="owner-panel revenue-panel"><div className="owner-panel-head"><div><small>GROUP PERFORMANCE</small><h3>Revenue / collections by company</h3></div><BarChart3 size={19}/></div><div className="revenue-bars">{companies.filter(({key})=>data.companies[key]!==undefined).map(({key,name,icon:Icon})=>{const c=data.companies[key];const value=revenueOf(c,key);const detail=[c?.workforce&&`${c.workforce.present}/${c.workforce.employees} present`,c?.payroll&&`${ngn(c.payroll.netKobo)} payroll`,c?.inventory&&`${c.inventory.lowStock} low stock`].filter(Boolean).join(' · ');return <div key={key}><div className="bar-label"><span><Icon size={15}/>{name}</span><b>{ngn(value)}</b></div><div className="bar-track"><i style={{width:`${value===undefined?0:Math.max(3,value/maxRevenue*100)}%`}}/></div><small>{detail||NOT_AUTHORISED}</small></div>})}</div></article><article className="owner-panel alert-panel"><div className="owner-panel-head"><div><small>ACTION CENTER</small><h3>Needs your attention</h3></div><AlertTriangle size={19}/></div>{data.alerts.length===0?<div className="owner-empty">No Group exception alerts right now.</div>:<div className="owner-alerts">{data.alerts.map(a=><div className={`owner-alert ${a.severity}`} key={a.code}><span><AlertTriangle size={15}/></span><div><strong>{a.title}</strong><small>{a.company?`${a.company} · `:''}{a.detail}</small></div></div>)}</div>}</article></section><section className="company-intel">{companies.flatMap(({key,name,icon:Icon})=>{const c=data.companies[key];if(!c)return[];return[<article className="company-intel-card" key={key}><div className="company-intel-head"><span><Icon size={18}/></span><div><strong>{name}</strong><small>{c.workforce?`${c.workforce.employees} employees · ${c.workforce.incomplete} attendance exception(s)`:`Workforce ${NOT_AUTHORISED.toLowerCase()}`}</small></div></div><div className="company-intel-grid">{metricsFor(key,c).map((m)=><Metric key={m.label} label={m.label} value={m.value} sub={m.sub}/>)}</div></article>]})}</section><section className="owner-panel ai-panel"><div className="owner-panel-head"><div><small>DAENEM AI</small><h3>Ask your ERP</h3></div><Bot size={20}/></div><div className="quick-prompts"><button onClick={()=>ask('Give me my owner brief for today and rank the top five issues that need attention.')}><Sparkles size={14}/> Today's owner brief</button><button onClick={()=>ask('Compare the companies by revenue, cash collection, payroll and operational risk.')} >Compare companies</button><button onClick={()=>ask('What cash collection, arrears, stock or follow-up problems should I review now?')}>Find cash/stock risks</button></div><div className="ai-question"><textarea rows={3} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask: Which company needs my attention? How much did each business generate? Where are the exceptions?"/><button className="owner-primary" disabled={busy} onClick={()=>ask()}><Bot size={16}/>{busy?'Analyzing ERP…':'Ask Daenem AI'}</button></div>{answer&&<div className="ai-answer"><Sparkles size={18}/><div><strong>Owner Intelligence</strong><p>{answer}</p></div></div>}</section></>}</main></section></div>;
}
function Metric({label,value,sub}:{label:string;value?:number;sub:string}){return <div className="intel-metric"><small>{label}</small><strong>{ngn(value)}</strong><span>{sub}</span></div>}
