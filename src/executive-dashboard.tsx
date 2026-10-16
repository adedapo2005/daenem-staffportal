import React,{useEffect,useMemo,useState}from'react';
import{
  AlertTriangle,ArrowRight,BriefcaseBusiness,Building2,CalendarRange,CheckCircle2,
  CircleDollarSign,Factory,Gauge,Home,PackageSearch,RefreshCw,Store,Truck,Users,WalletCards,
}from'lucide-react';
import{api}from'./auth';
import{OperatingSignals,PerformanceComparison,type Signal}from'./analytics-command-widgets';
import'./executive-dashboard.css';

type PeriodKey='current_month'|'previous_month'|'current_quarter'|'year_to_date'|'last_12_months';
type CompanyKey='printing'|'bakery'|'autos'|'logistics'|'properties';
type Shared={inventory?:{valueKobo:number;lowStock:number};workforce?:{employees:number;present:number;incomplete:number};payroll?:{runs:number;grossKobo:number;netKobo:number};maintenance?:{open:number;urgent:number;costKobo:number}};
type Alert={severity:'info'|'medium'|'high';code:string;title:string;detail:string;company?:string;action?:string};
// The backend omits any figure the actor may not see. An absent field means "Not authorised", never zero.
type Company=Shared&{
  current?:{orders:number;revenueKobo:number;collectedKobo:number};previous?:{revenueKobo:number};
  wasteCostKobo?:number;wastePctOfSales?:number;
  salesCount?:number;revenueKobo?:number;collectedKobo?:number;previousRevenueKobo?:number;grossProfitKobo?:number;stockCount?:number;stockValueKobo?:number;followupsDue?:number;
  trips?:number;expenseKobo?:number;activeShipments?:number;expiringDocs?:number;
  rentCollectedKobo?:number;previousRentCollectedKobo?:number;rentReceipts?:number;arrearsKobo?:number;overdueCharges?:number;
};
type Intelligence={
  generatedAt:string;workDate:string;period:{key:PeriodKey;label:string;start:string;end:string;comparisonLabel:string};scope:{companyId:string|null;companyName:string;companyIds:string[]};
  group:Partial<{revenueKobo:number;previousRevenueKobo:number;payrollNetKobo:number;operatingExpenseKobo:number;outstandingReceivablesKobo:number;inventoryValueKobo:number;employees:number;present:number;incompleteAttendance:number;lowStock:number;highRiskSecurity:number;overdueRequirements:number;pendingForms:number}>;
  finance?:{operatingExpenseKobo:number;outstandingReceivablesKobo:number;overdueReceivables:number;postedJournals:number};
  construction?:{activeProjects:number;budgetKobo:number;spentKobo:number;remainingKobo:number;overdueMilestones:number};
  companies:Partial<Record<CompanyKey,Company>>;alerts:Alert[];
};

const NOT_AUTHORISED='Not authorised';
const hasValue=(value?:number):value is number=>typeof value==='number'&&Number.isFinite(value);
const money=(k?:number)=>hasValue(k)?new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',notation:'compact',maximumFractionDigits:1}).format(k/100):NOT_AUTHORISED;
const moneyFull=(k?:number)=>hasValue(k)?new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(k/100):NOT_AUTHORISED;
const percent=(current?:number,previous?:number):number|null=>hasValue(current)&&hasValue(previous)?(previous<=0?(current>0?100:0):(current-previous)/previous*100):null;
const signedPercent=(value:number)=>`${value>=0?'+':''}${value.toFixed(1)}%`;
const labelled=(value:number|undefined,text:string)=>hasValue(value)?`${value} ${text}`:NOT_AUTHORISED;
const unauthorisedSignal=(label:string,detail:string):Signal=>({label,value:NOT_AUTHORISED,detail,state:'neutral'});
const periods:Array<{key:PeriodKey;label:string}>=[
  {key:'current_month',label:'Current month'},{key:'previous_month',label:'Previous month'},{key:'current_quarter',label:'Current quarter'},{key:'year_to_date',label:'Year to date'},{key:'last_12_months',label:'Last 12 months'},
];
const companyMeta=[
  {id:'company-printing',key:'printing' as const,code:'PRINT',name:'Printing & Technology',icon:Factory,module:'printing'},
  {id:'company-bakery',key:'bakery' as const,code:'BAKERY',name:'Bakery',icon:Store,module:'bakery'},
  {id:'company-autos',key:'autos' as const,code:'AUTOS',name:'Autos',icon:BriefcaseBusiness,module:'autos'},
  {id:'company-logistics',key:'logistics' as const,code:'LOGISTICS',name:'Logistics',icon:Truck,module:'logistics'},
  {id:'company-properties',key:'properties' as const,code:'PROPERTIES',name:'Homes & Properties',icon:Home,module:'properties'},
];

function openWorkspace(action?:string){
  if(!action)return;
  window.dispatchEvent(new CustomEvent('daenem:canonical-navigation',{detail:{target:action}}));
}

function Kpi({label,value,detail,tone='blue',action}:{label:string;value:string;detail:string;tone?:string;action?:string}){
  return <button className={`xed-kpi tone-${tone}`} onClick={()=>openWorkspace(action)} disabled={!action}><span>{label}</span><strong>{value}</strong><small>{detail}</small>{action&&<ArrowRight size={15}/>}</button>;
}

type CompanyNumbers={revenue?:number;previous?:number;primary:string;secondary:string};
function companyNumbers(company:Company|undefined,key:CompanyKey):CompanyNumbers{
  const current=company?.current,previous=company?.previous,waste=company?.wastePctOfSales;
  if(key==='printing')return{revenue:current?.revenueKobo,previous:previous?.revenueKobo,primary:labelled(current?.orders,'order(s)'),secondary:current?`${moneyFull(current.collectedKobo)} collected`:NOT_AUTHORISED};
  if(key==='bakery')return{revenue:current?.revenueKobo,previous:previous?.revenueKobo,primary:labelled(current?.orders,'order(s)'),secondary:hasValue(waste)?`${waste.toFixed(1)}% waste cost`:NOT_AUTHORISED};
  if(key==='autos')return{revenue:company?.revenueKobo,previous:company?.previousRevenueKobo,primary:labelled(company?.salesCount,'vehicle sale(s)'),secondary:labelled(company?.followupsDue,'follow-up(s) due')};
  if(key==='logistics')return{revenue:company?.revenueKobo,previous:company?.previousRevenueKobo,primary:labelled(company?.trips,'trip(s)'),secondary:labelled(company?.activeShipments,'shipment(s) moving')};
  return{revenue:company?.rentCollectedKobo,previous:company?.previousRentCollectedKobo,primary:labelled(company?.rentReceipts,'rent receipt(s)'),secondary:hasValue(company?.arrearsKobo)?`${moneyFull(company?.arrearsKobo)} arrears`:NOT_AUTHORISED};
}

export function GroupExecutiveDashboard({companyId}:{companyId:string|null}){
  const[period,setPeriod]=useState<PeriodKey>('current_month'),[data,setData]=useState<Intelligence|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function load(){setBusy(true);setMessage('');try{const query=new URLSearchParams({period});if(companyId)query.set('companyId',companyId);setData(await api<Intelligence>(`/api/owner/intelligence?${query}`))}catch(error){setMessage((error as Error).message);setData(null)}finally{setBusy(false)}}
  useEffect(()=>{void load()},[period,companyId]);
  useEffect(()=>{const focus=()=>void load();window.addEventListener('focus',focus);const timer=window.setInterval(()=>void load(),120000);return()=>{window.removeEventListener('focus',focus);window.clearInterval(timer)}},[period,companyId]);
  // Only companies the response includes; a company block that is absent is not rendered at all.
  const rows=useMemo(()=>data?companyMeta.filter((company)=>(!companyId||company.id===companyId)&&data.companies[company.key]!==undefined).map((company)=>({...company,...companyNumbers(data.companies[company.key],company.key)})):[],[data,companyId]);
  const maxRevenue=Math.max(1,...rows.map((row)=>row.revenue??0));
  const g=data?.group,f=data?.finance,k=data?.construction;
  const growth=percent(g?.revenueKobo,g?.previousRevenueKobo);
  const lowStock=g?.lowStock,incompleteAttendance=g?.incompleteAttendance,highRiskSecurity=g?.highRiskSecurity,overdueRequirements=g?.overdueRequirements;
  const present=g?.present,employees=g?.employees;
  const comparisonRows=rows.flatMap((row)=>row.revenue===undefined||row.previous===undefined?[]:[{key:row.key,name:row.code,current:row.revenue,previous:row.previous}]);
  const operatingSignals:Signal[]=data?[
    f?{label:'Overdue Receivables',value:String(f.overdueReceivables),detail:moneyFull(f.outstandingReceivablesKobo)+' outstanding',state:f.overdueReceivables?'critical':'healthy' as const}:unauthorisedSignal('Overdue Receivables','Finance'),
    hasValue(lowStock)?{label:'Low Stock',value:String(lowStock),detail:'Inventory items requiring review',state:lowStock?'attention':'healthy' as const}:unauthorisedSignal('Low Stock','Inventory'),
    hasValue(incompleteAttendance)?{label:'Attendance Exceptions',value:String(incompleteAttendance),detail:hasValue(present)&&hasValue(employees)?`${present}/${employees} workforce present`:'Workforce present not authorised',state:incompleteAttendance?'attention':'healthy' as const}:unauthorisedSignal('Attendance Exceptions','Workforce'),
    k?{label:'Construction Milestones',value:String(k.overdueMilestones),detail:moneyFull(k.remainingKobo)+' budget remaining',state:k.overdueMilestones?'critical':'healthy' as const}:unauthorisedSignal('Construction Milestones','Construction'),
  ]:[];
  return <section className="xed-shell" aria-label="Group Executive Dashboard">
    <header className="xed-toolbar"><div><span>LIVE GROUP ERP</span><h2>Executive Performance Dashboard</h2><p>{data?.scope.companyName||'Daenem Group'} · recorded transactions and operational exceptions</p></div><aside><label><CalendarRange size={16}/><select value={period} onChange={(event)=>setPeriod(event.target.value as PeriodKey)}>{periods.map((item)=><option value={item.key} key={item.key}>{item.label}</option>)}</select></label><button onClick={load} disabled={busy}><RefreshCw size={16} className={busy?'spin':''}/><span>{busy?'Refreshing':'Refresh'}</span></button></aside></header>
    {message&&<div className="xed-message"><AlertTriangle size={17}/><span>{message}</span></div>}
    {!data?<div className="xed-loading"><Gauge size={30}/><strong>{busy?'Loading live Group records…':'Executive data is unavailable'}</strong></div>:<>
      <div className="xed-kpis">
        <Kpi label="Revenue / collections" value={money(g?.revenueKobo)} detail={growth===null?NOT_AUTHORISED:`${signedPercent(growth)} vs ${data.period.comparisonLabel}`} tone={growth===null?'blue':growth>=0?'green':'red'} action="finance"/>
        <Kpi label="Operating expenses" value={money(g?.operatingExpenseKobo)} detail={f?`${f.postedJournals} posted journal(s)`:NOT_AUTHORISED} tone="amber" action="finance"/>
        <Kpi label="Outstanding receivables" value={money(g?.outstandingReceivablesKobo)} detail={f?`${f.overdueReceivables} overdue`:NOT_AUTHORISED} tone={f?.overdueReceivables?'red':'blue'} action="finance"/>
        <Kpi label="Net payroll" value={money(g?.payrollNetKobo)} detail={`${data.scope.companyIds.length} company scope`} tone="violet" action="payroll"/>
        <Kpi label="Workforce today" value={hasValue(present)&&hasValue(employees)?`${present}/${employees}`:NOT_AUTHORISED} detail={hasValue(incompleteAttendance)?`${incompleteAttendance} incomplete attendance`:NOT_AUTHORISED} tone={incompleteAttendance?'amber':'green'} action="attendance"/>
        <Kpi label="Inventory value" value={money(g?.inventoryValueKobo)} detail={hasValue(lowStock)?`${lowStock} low-stock item(s)`:NOT_AUTHORISED} tone={lowStock?'amber':'blue'} action="inventory"/>
        <Kpi label="Construction spend" value={money(k?.spentKobo)} detail={k?`${k.activeProjects} active · ${money(k.remainingKobo)} balance`:NOT_AUTHORISED} tone={k?.overdueMilestones?'red':'blue'} action="construction"/>
        <Kpi label="Action items" value={String(data.alerts.length)} detail={`${hasValue(highRiskSecurity)?`${highRiskSecurity} high-risk security`:'Security not authorised'} · ${hasValue(overdueRequirements)?`${overdueRequirements} overdue work`:'Work not authorised'}`} tone={data.alerts.length?'red':'green'} action="security"/>
      </div>
      <div className="xed-grid">
        <article className="xed-panel xed-performance"><header><div><span>COMPANY PERFORMANCE</span><h3>Recorded Revenue And Collections</h3></div><Building2 size={20}/></header><div className="xed-bars">{rows.map((row)=>{const Icon=row.icon;const change=percent(row.revenue,row.previous);return <button key={row.key} onClick={()=>openWorkspace(row.module)}><div className="xed-bar-title"><span><i><Icon size={16}/></i><b>{row.name}</b></span><strong>{moneyFull(row.revenue)}</strong></div><div className="xed-track"><i style={{width:`${row.revenue===undefined?0:Math.max(row.revenue?4:0,row.revenue/maxRevenue*100)}%`}}/></div><div className="xed-bar-meta"><span>{row.primary} · {row.secondary}</span><em className={change!==null&&change<0?'down':'up'}>{change===null?NOT_AUTHORISED:signedPercent(change)}</em></div></button>})}</div></article>
        <article className="xed-panel xed-alerts"><header><div><span>OWNER ACTION CENTER</span><h3>Needs Review</h3></div><AlertTriangle size={20}/></header>{!data.alerts.length?<div className="xed-clear"><CheckCircle2 size={28}/><b>No Exception Alerts</b><span>No configured Group threshold currently requires review.</span></div>:<div className="xed-alert-list">{data.alerts.slice(0,8).map((alert)=><button key={alert.code} className={alert.severity} onClick={()=>openWorkspace(alert.action)}><i><AlertTriangle size={15}/></i><span><b>{alert.title}</b><small>{alert.company?`${alert.company} · `:''}{alert.detail}</small></span>{alert.action&&<ArrowRight size={14}/>}</button>)}</div>}</article>
      </div>
      <div className="xed-analytics-upgrade" aria-label="Executive Analytics">
        <PerformanceComparison rows={comparisonRows} title="Company Performance Movement" subtitle={`Current recorded performance compared with ${data.period.comparisonLabel}.`} valueFormatter={money}/>
        <OperatingSignals signals={operatingSignals}/>
      </div>
      <div className="xed-lower">
        {k?<button onClick={()=>openWorkspace('construction')}><Building2/><span><small>CONSTRUCTION & PROJECTS</small><b>{moneyFull(k.spentKobo)} recorded spend</b><em>{moneyFull(k.budgetKobo)} budget · {k.overdueMilestones} overdue milestone(s)</em></span><ArrowRight/></button>:<button disabled><Building2/><span><small>CONSTRUCTION & PROJECTS</small><b>{NOT_AUTHORISED}</b><em>Not included in your access</em></span></button>}
        {f?<button onClick={()=>openWorkspace('finance')}><CircleDollarSign/><span><small>FINANCE CONTROL</small><b>{moneyFull(g?.outstandingReceivablesKobo)} receivable balance</b><em>{moneyFull(g?.operatingExpenseKobo)} approved/paid expenses in period</em></span><ArrowRight/></button>:<button disabled><CircleDollarSign/><span><small>FINANCE CONTROL</small><b>{NOT_AUTHORISED}</b><em>Not included in your access</em></span></button>}
        <button onClick={()=>openWorkspace('owner-intelligence')}><Gauge/><span><small>DAENEM AI INTELLIGENCE</small><b>Open full Owner Intelligence</b><em>Compare companies and ask questions using recorded ERP data</em></span><ArrowRight/></button>
      </div>
      <footer className="xed-foot"><PackageSearch size={14}/><span>Last refreshed {new Date(data.generatedAt).toLocaleString('en-NG',{hour12:true})} · {data.period.label} ({data.period.start} to {data.period.end})</span></footer>
    </>}
  </section>;
}
