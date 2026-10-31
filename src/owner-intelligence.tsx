import React,{useEffect,useMemo,useRef,useState}from'react';
import{AlertTriangle,BarChart3,Bot,BriefcaseBusiness,CalendarCheck,ClipboardCheck,Factory,Gauge,Home,Package,RefreshCw,ShieldCheck,Sparkles,Store,Truck,X}from'lucide-react';
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
type Intelligence={generatedAt:string;workDate:string;month:string;scope:{companyIds:string[]};group:Partial<{revenueKobo:number;payrollNetKobo:number;inventoryValueKobo:number;incompleteAttendance:number;lowStock:number;highRiskSecurity:number;overdueRequirements:number;pendingForms:number}>;finance?:object;construction?:object;companies:Partial<Record<CompanyKey,Company>>;alerts:Alert[]};

const NOT_AUTHORISED='Not Authorised';
const hasValue=(value?:number):value is number=>typeof value==='number'&&Number.isFinite(value);
const ngn=(k?:number)=>hasValue(k)?new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(k/100):NOT_AUTHORISED;
const pct=(current?:number,previous?:number):number|null=>hasValue(current)&&hasValue(previous)?(previous<=0?(current>0?100:0):(current-previous)/previous*100):null;
const countText=(value:number|undefined,text:string)=>hasValue(value)?`${value} ${text}`:'';
const companies=[{key:'printing',name:'Printing & Technology',icon:Factory},{key:'bakery',name:'Bakery',icon:Store},{key:'autos',name:'Autos',icon:BriefcaseBusiness},{key:'logistics',name:'Logistics',icon:Truck},{key:'properties',name:'Homes & Properties',icon:Home}]as const;
const unauthorisedSignal=(label:string,detail:string):Signal=>({label,value:NOT_AUTHORISED,detail,state:'neutral'});
// Alerts are complete only when every domain that feeds them is in the response. An omitted domain means "unknown", never "clear".
const alertCompanies:Array<[CompanyKey,(company:Company)=>unknown]>=[['bakery',(c)=>c.wastePctOfSales],['autos',(c)=>c.followupsDue],['logistics',(c)=>c.expiringDocs],['properties',(c)=>c.arrearsKobo]];
function alertsIncomplete(data:Intelligence){
  const group=data.group;
  if(!hasValue(group.highRiskSecurity)||!hasValue(group.lowStock)||!hasValue(group.incompleteAttendance))return true;
  if(data.finance===undefined||data.construction===undefined)return true;
  return alertCompanies.some(([key,pick])=>{if(!data.scope.companyIds.includes(`company-${key}`))return false;const company=data.companies[key];return company===undefined||pick(company)===undefined});
}

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
    return[{label:'Sales',value:current?.revenueKobo,sub:current?countText(current.orders,'orders'):''},{label:'Waste Cost',value:c.wasteCostKobo,sub:hasValue(waste)?`${waste.toFixed(1)}% of sales`:''},stockMetric,payrollMetric];
  }
  if(key==='autos')return[{label:'Sales',value:c.revenueKobo,sub:countText(c.salesCount,'vehicle(s)')},{label:'Gross Profit',value:c.grossProfitKobo,sub:countText(c.followupsDue,'lead follow-up(s)')},{label:'Vehicle Stock',value:c.stockValueKobo,sub:countText(c.stockCount,'vehicles')},payrollMetric];
  if(key==='logistics')return[{label:'Trip Revenue',value:c.revenueKobo,sub:countText(c.trips,'trips')},{label:'Gross Profit',value:c.grossProfitKobo,sub:countText(c.activeShipments,'shipments moving')},{label:'Trip Expense',value:c.expenseKobo,sub:countText(c.expiringDocs,'docs expiring')},payrollMetric];
  return[{label:'Rent Collected',value:c.rentCollectedKobo,sub:countText(c.rentReceipts,'receipt(s)')},{label:'Arrears',value:c.arrearsKobo,sub:countText(c.overdueCharges,'overdue charge(s)')},{label:'Maintenance',value:c.maintenance?.costKobo,sub:c.maintenance?countText(c.maintenance.open,'open'):''},payrollMetric];
}

export function OwnerIntelligence({context,onClose}:{context:WorkforceContext;onClose:()=>void}){
 const[data,setData]=useState<Intelligence|null>(null),[message,setMessage]=useState(''),[question,setQuestion]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false);
 const dialogRef=useRef<HTMLElement|null>(null);
 async function load(){setBusy(true);setMessage('');try{setData(await api<Intelligence>('/api/owner/intelligence'))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}useEffect(()=>{load()},[]);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const focusables=()=>Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')||[]);
  const onKeyDown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();onClose();return}
   if(event.key!=='Tab')return;
   const items=focusables();if(!items.length)return;
   const first=items[0],last=items[items.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  };
  dialogRef.current?.querySelector<HTMLElement>('[data-owner-close]')?.focus();
  window.addEventListener('keydown',onKeyDown);
  return()=>{window.removeEventListener('keydown',onKeyDown);previous?.focus()};
 },[onClose]);
 async function ask(prompt?:string){const text=(prompt||question).trim();setBusy(true);setAnswer('');try{const r=await api<{answer:string}>('/api/owner/ai',{method:'POST',body:JSON.stringify({question:text,mode:text?'question':'brief'})});setAnswer(r.answer);if(prompt)setQuestion(prompt)}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 const maxRevenue=useMemo(()=>{if(!data)return 1;const values=companies.map(({key})=>revenueOf(data.companies[key],key)).filter(hasValue);return Math.max(1,...values)},[data]);
 const g=data?.group;
 const hasCompanyData=data?companies.some(({key})=>data.companies[key]!==undefined):false;
 const incomplete=data?alertsIncomplete(data):false;
 const lowStock=g?.lowStock,incompleteAttendance=g?.incompleteAttendance,highRiskSecurity=g?.highRiskSecurity,overdueRequirements=g?.overdueRequirements;
 const groupSignals:Signal[]=data?[
  hasValue(lowStock)?{label:'Inventory Attention',value:String(lowStock),detail:'Low-stock item(s) across authorized companies',state:lowStock?'attention':'healthy' as const}:unauthorisedSignal('Inventory Attention','Inventory'),
  hasValue(incompleteAttendance)?{label:'Attendance Exceptions',value:String(incompleteAttendance),detail:'Incomplete attendance requiring follow-up',state:incompleteAttendance?'attention':'healthy' as const}:unauthorisedSignal('Attendance Exceptions','Workforce'),
  hasValue(highRiskSecurity)?{label:'Security Review',value:String(highRiskSecurity),detail:'High-risk security item(s) not yet reviewed',state:highRiskSecurity?'critical':'healthy' as const}:unauthorisedSignal('Security Review','Security'),
  hasValue(overdueRequirements)?{label:'Required Work',value:String(overdueRequirements),detail:'Overdue role submission(s)',state:overdueRequirements?'critical':'healthy' as const}:unauthorisedSignal('Required Work','Forms'),
 ]:[];
 return (
  <div className="owner-backdrop" onClick={onClose}>
    <section
      ref={dialogRef}
      className="owner-shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-intelligence-title"
      aria-describedby="owner-intelligence-description"
      onClick={event=>event.stopPropagation()}
    >
      <header className="owner-head">
        <div>
          <span className="owner-mark"><Gauge size={24}/></span>
          <div className="owner-head-copy">
            <small>DAENEM Group · Owner / Super Admin</small>
            <h2 id="owner-intelligence-title">Group Intelligence Command Center</h2>
            <p id="owner-intelligence-description">Group-wide performance, operational signals and decisions in one governed view.</p>
          </div>
        </div>
        <aside>
          {data?.month&&<span className="owner-period">{data.month}</span>}
          <button type="button" aria-label="Refresh Owner Intelligence" title="Refresh Owner Intelligence" onClick={load} disabled={busy}>
            <RefreshCw size={18}/>
          </button>
          <button type="button" data-owner-close aria-label="Close Owner Intelligence" title="Close Owner Intelligence" onClick={onClose}>
            <X size={19}/>
          </button>
        </aside>
      </header>
      {message&&<div className="owner-message" role="alert">{message}</div>}
      <main className="owner-content" aria-busy={busy}>
        {!data
          ? <div className="owner-loading" role="status">
              <Gauge size={32}/>
              <strong>{busy?'Building Group Intelligence…':'No Intelligence Available'}</strong>
            </div>
          : <>
              <section className="owner-kpis" aria-label="Group Performance Indicators">
                <article>
                  <div className="owner-kpi-top"><small>Group Payroll Net</small><span className="owner-kpi-icon"><BriefcaseBusiness size={18}/></span></div>
                  <strong>{ngn(g?.payrollNetKobo)}</strong><span>Current Payroll Periods</span>
                </article>
                <article>
                  <div className="owner-kpi-top"><small>Inventory Value</small><span className="owner-kpi-icon"><Package size={18}/></span></div>
                  <strong>{ngn(g?.inventoryValueKobo)}</strong><span>{hasValue(lowStock)?lowStock+' Low-Stock Items':NOT_AUTHORISED}</span>
                </article>
                <article>
                  <div className="owner-kpi-top"><small>Attendance Exceptions</small><span className="owner-kpi-icon"><CalendarCheck size={18}/></span></div>
                  <strong>{hasValue(incompleteAttendance)?incompleteAttendance:NOT_AUTHORISED}</strong><span>Incomplete Today</span>
                </article>
                <article>
                  <div className="owner-kpi-top"><small>Security Review</small><span className="owner-kpi-icon"><ShieldCheck size={18}/></span></div>
                  <strong>{hasValue(highRiskSecurity)?highRiskSecurity:NOT_AUTHORISED}</strong><span>High-Risk Items Awaiting Review</span>
                </article>
                <article>
                  <div className="owner-kpi-top"><small>Required Work</small><span className="owner-kpi-icon"><ClipboardCheck size={18}/></span></div>
                  <strong>{hasValue(overdueRequirements)?overdueRequirements:NOT_AUTHORISED}</strong><span>Overdue Role Submissions</span>
                </article>
              </section>
              <section className="owner-analytics-upgrade" aria-label="Operating Signals">
                <OperatingSignals signals={groupSignals}/>
              </section>
              <section className="owner-grid top">
                <article className="owner-panel revenue-panel">
                  <div className="owner-hero-metric">
                    <div><small>Group Revenue</small><strong className={hasValue(g?.revenueKobo)?'':'is-unavailable'}>{ngn(g?.revenueKobo)}</strong><span>{data.month}</span></div>
                    <span className="owner-hero-mark"><BarChart3 size={23}/></span>
                  </div>
                  <div className="owner-panel-head">
                    <div><small>Revenue Mix</small><h3>Revenue / Collections By Company</h3></div>
                    <BarChart3 size={20}/>
                  </div>
                  <div className="revenue-bars">
                    {!hasCompanyData
                      ? <div className="owner-empty">No Company Revenue Data Is Available For This View.</div>
                      : companies.filter(({key})=>data.companies[key]!==undefined).map(({key,name,icon:Icon})=>{
                          const c=data.companies[key];
                          const value=revenueOf(c,key);
                          const detail=[
                            c?.workforce&&c.workforce.present+'/'+c.workforce.employees+' Present',
                            c?.payroll&&ngn(c.payroll.netKobo)+' Payroll',
                            c?.inventory&&c.inventory.lowStock+' Low Stock'
                          ].filter(Boolean).join(' · ');
                          return <div key={key}>
                            <div className="bar-label"><span><Icon size={17}/>{name}</span><b>{ngn(value)}</b></div>
                            <div className="bar-track"><i style={{width:(value===undefined?0:Math.max(3,value/maxRevenue*100))+'%'}}/></div>
                            <small>{detail||NOT_AUTHORISED}</small>
                          </div>;
                        })}
                  </div>
                </article>
                <article className="owner-panel alert-panel">
                  <div className="owner-panel-head">
                    <div><small>Action Center</small><h3>Needs Your Attention</h3></div>
                    <AlertTriangle size={20}/>
                  </div>
                  {data.alerts.length===0
                    ? <div className="owner-empty">{incomplete?'Alerts Incomplete For Your Access':'No Group Exception Alerts Right Now.'}</div>
                    : <>
                        <div className="owner-alerts">
                          {data.alerts.map(a=><div className={'owner-alert '+a.severity} key={a.code}>
                            <span><AlertTriangle size={16}/></span>
                            <div><strong>{a.title}</strong><small>{a.company?a.company+' · ':''}{a.detail}</small></div>
                          </div>)}
                        </div>
                        {incomplete&&<div className="owner-empty">Alerts Incomplete For Your Access</div>}
                      </>}
                </article>
              </section>
              <section className="company-intel" aria-label="Company Intelligence">
                {!hasCompanyData
                  ? <div className="owner-empty company-intel-empty">No Company Intelligence Is Available For This View.</div>
                  : companies.flatMap(({key,name,icon:Icon})=>{
                      const c=data.companies[key];
                      if(!c)return[];
                      return [<article className="company-intel-card" key={key}>
                        <div className="company-intel-head">
                          <span><Icon size={19}/></span>
                          <div><strong>{name}</strong><small>{c.workforce?c.workforce.employees+' Employees · '+c.workforce.incomplete+' Attendance Exception(s)':'Workforce '+NOT_AUTHORISED}</small></div>
                        </div>
                        <div className="company-intel-grid">{metricsFor(key,c).map(m=><Metric key={m.label} label={m.label} value={m.value} sub={m.sub}/>)}</div>
                      </article>];
                    })}
              </section>
              <section className="owner-panel ai-panel">
                <div className="owner-panel-head">
                  <div><small>DAENEM AI</small><h3>Ask Your ERP</h3></div>
                  <Bot size={21}/>
                </div>
                <div className="quick-prompts">
                  <button type="button" onClick={()=>ask('Give me my owner brief for today and rank the top five issues that need attention.')}><Sparkles size={15}/> Today's Owner Brief</button>
                  <button type="button" onClick={()=>ask('Compare the companies by revenue, cash collection, payroll and operational risk.')}>Compare Companies</button>
                  <button type="button" onClick={()=>ask('What cash collection, arrears, stock or follow-up problems should I review now?')}>Find Cash / Stock Risks</button>
                </div>
                <div className="ai-question">
                  <textarea rows={3} aria-label="Ask Owner Intelligence a question" value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Ask: Which company needs my attention? How much did each business generate? Where are the exceptions?"/>
                  <button type="button" className="owner-primary" disabled={busy||!question.trim()} onClick={()=>ask()}>
                    <Bot size={17}/>{busy?'Analyzing ERP…':'Ask DAENEM AI'}
                  </button>
                </div>
                {answer&&<div className="ai-answer" aria-live="polite"><Sparkles size={19}/><div><strong>Owner Intelligence</strong><p>{answer}</p></div></div>}
              </section>
            </>}
      </main>
    </section>
  </div>
 );
}
function Metric({label,value,sub}:{label:string;value?:number;sub:string}){return <div className="intel-metric"><small>{label}</small><strong>{ngn(value)}</strong><span>{sub}</span></div>}
