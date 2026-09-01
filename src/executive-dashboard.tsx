import React,{useEffect,useMemo,useState}from'react';
import{
  AlertTriangle,ArrowRight,BriefcaseBusiness,Building2,CalendarRange,CheckCircle2,
  CircleDollarSign,Factory,Gauge,Home,PackageSearch,RefreshCw,Store,Truck,Users,WalletCards,
}from'lucide-react';
import{api}from'./auth';
import'./executive-dashboard.css';

type PeriodKey='current_month'|'previous_month'|'current_quarter'|'year_to_date'|'last_12_months';
type Shared={inventory?:{valueKobo:number;lowStock:number};workforce?:{employees:number;present:number;incomplete:number};payroll?:{runs:number;grossKobo:number;netKobo:number};maintenance?:{open:number;urgent:number;costKobo:number}};
type Alert={severity:'info'|'medium'|'high';code:string;title:string;detail:string;company?:string;action?:string};
type Intelligence={
  generatedAt:string;workDate:string;period:{key:PeriodKey;label:string;start:string;end:string;comparisonLabel:string};scope:{companyId:string|null;companyName:string;companyIds:string[]};
  group:{revenueKobo:number;previousRevenueKobo:number;payrollNetKobo:number;operatingExpenseKobo:number;outstandingReceivablesKobo:number;inventoryValueKobo:number;employees:number;present:number;incompleteAttendance:number;lowStock:number;highRiskSecurity:number;overdueRequirements:number;pendingForms:number};
  finance:{operatingExpenseKobo:number;outstandingReceivablesKobo:number;overdueReceivables:number;postedJournals:number};
  construction:{activeProjects:number;budgetKobo:number;spentKobo:number;remainingKobo:number;overdueMilestones:number};
  companies:{
    printing:Shared&{current:{orders:number;revenueKobo:number;collectedKobo:number};previous:{revenueKobo:number}};
    bakery:Shared&{current:{orders:number;revenueKobo:number;collectedKobo:number};previous:{revenueKobo:number};wasteCostKobo:number;wastePctOfSales:number};
    autos:Shared&{salesCount:number;revenueKobo:number;collectedKobo:number;previousRevenueKobo:number;grossProfitKobo:number;stockCount:number;stockValueKobo:number;followupsDue:number};
    logistics:Shared&{trips:number;revenueKobo:number;previousRevenueKobo:number;expenseKobo:number;grossProfitKobo:number;activeShipments:number;expiringDocs:number};
    properties:Shared&{rentCollectedKobo:number;previousRentCollectedKobo:number;rentReceipts:number;arrearsKobo:number;overdueCharges:number};
  };alerts:Alert[];
};

const money=(k?:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',notation:'compact',maximumFractionDigits:1}).format(Number(k||0)/100);
const moneyFull=(k?:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(k||0)/100);
const percent=(current:number,previous:number)=>previous<=0?(current>0?100:0):(current-previous)/previous*100;
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
  if(action==='security'){
    const button=[...document.querySelectorAll<HTMLButtonElement>('.sidebar-functional-item')].find((item)=>(item.textContent||'').includes('Security Center'));
    button?.click();
    return;
  }
  window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:action}}));
}

function Kpi({label,value,detail,tone='blue',action}:{label:string;value:string;detail:string;tone?:string;action?:string}){
  return <button className={`xed-kpi tone-${tone}`} onClick={()=>openWorkspace(action)} disabled={!action}><span>{label}</span><strong>{value}</strong><small>{detail}</small>{action&&<ArrowRight size={15}/>}</button>;
}

function companyNumbers(data:Intelligence,key:typeof companyMeta[number]['key']){
  if(key==='printing')return{revenue:data.companies.printing.current.revenueKobo,previous:data.companies.printing.previous.revenueKobo,primary:`${data.companies.printing.current.orders} order(s)`,secondary:`${moneyFull(data.companies.printing.current.collectedKobo)} collected`};
  if(key==='bakery')return{revenue:data.companies.bakery.current.revenueKobo,previous:data.companies.bakery.previous.revenueKobo,primary:`${data.companies.bakery.current.orders} order(s)`,secondary:`${data.companies.bakery.wastePctOfSales.toFixed(1)}% waste cost`};
  if(key==='autos')return{revenue:data.companies.autos.revenueKobo,previous:data.companies.autos.previousRevenueKobo,primary:`${data.companies.autos.salesCount} vehicle sale(s)`,secondary:`${data.companies.autos.followupsDue} follow-up(s) due`};
  if(key==='logistics')return{revenue:data.companies.logistics.revenueKobo,previous:data.companies.logistics.previousRevenueKobo,primary:`${data.companies.logistics.trips} trip(s)`,secondary:`${data.companies.logistics.activeShipments} shipment(s) moving`};
  return{revenue:data.companies.properties.rentCollectedKobo,previous:data.companies.properties.previousRentCollectedKobo,primary:`${data.companies.properties.rentReceipts} rent receipt(s)`,secondary:`${moneyFull(data.companies.properties.arrearsKobo)} arrears`};
}

export function GroupExecutiveDashboard({companyId}:{companyId:string|null}){
  const[period,setPeriod]=useState<PeriodKey>('current_month'),[data,setData]=useState<Intelligence|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function load(){setBusy(true);setMessage('');try{const query=new URLSearchParams({period});if(companyId)query.set('companyId',companyId);setData(await api<Intelligence>(`/api/owner/intelligence?${query}`))}catch(error){setMessage((error as Error).message);setData(null)}finally{setBusy(false)}}
  useEffect(()=>{void load()},[period,companyId]);
  useEffect(()=>{const focus=()=>void load();window.addEventListener('focus',focus);const timer=window.setInterval(()=>void load(),120000);return()=>{window.removeEventListener('focus',focus);window.clearInterval(timer)}},[period,companyId]);
  const rows=useMemo(()=>data?companyMeta.filter((company)=>!companyId||company.id===companyId).map((company)=>({...company,...companyNumbers(data,company.key),shared:data.companies[company.key]})):[],[data,companyId]);
  const maxRevenue=Math.max(1,...rows.map((row)=>row.revenue));
  const growth=data?percent(data.group.revenueKobo,data.group.previousRevenueKobo):0;
  return <section className="xed-shell" aria-label="Group Executive Dashboard">
    <header className="xed-toolbar"><div><span>LIVE GROUP ERP</span><h2>Executive performance dashboard</h2><p>{data?.scope.companyName||'Daenem Group'} · recorded transactions and operational exceptions</p></div><aside><label><CalendarRange size={16}/><select value={period} onChange={(event)=>setPeriod(event.target.value as PeriodKey)}>{periods.map((item)=><option value={item.key} key={item.key}>{item.label}</option>)}</select></label><button onClick={load} disabled={busy}><RefreshCw size={16} className={busy?'spin':''}/><span>{busy?'Refreshing':'Refresh'}</span></button></aside></header>
    {message&&<div className="xed-message"><AlertTriangle size={17}/><span>{message}</span></div>}
    {!data?<div className="xed-loading"><Gauge size={30}/><strong>{busy?'Loading live Group records…':'Executive data is unavailable'}</strong></div>:<>
      <div className="xed-kpis">
        <Kpi label="Revenue / collections" value={money(data.group.revenueKobo)} detail={`${growth>=0?'+':''}${growth.toFixed(1)}% vs ${data.period.comparisonLabel}`} tone={growth>=0?'green':'red'} action="finance"/>
        <Kpi label="Operating expenses" value={money(data.group.operatingExpenseKobo)} detail={`${data.finance.postedJournals} posted journal(s)`} tone="amber" action="finance"/>
        <Kpi label="Outstanding receivables" value={money(data.group.outstandingReceivablesKobo)} detail={`${data.finance.overdueReceivables} overdue`} tone={data.finance.overdueReceivables?'red':'blue'} action="finance"/>
        <Kpi label="Net payroll" value={money(data.group.payrollNetKobo)} detail={`${data.scope.companyIds.length} company scope`} tone="violet" action="payroll"/>
        <Kpi label="Workforce today" value={`${data.group.present}/${data.group.employees}`} detail={`${data.group.incompleteAttendance} incomplete attendance`} tone={data.group.incompleteAttendance?'amber':'green'} action="attendance"/>
        <Kpi label="Inventory value" value={money(data.group.inventoryValueKobo)} detail={`${data.group.lowStock} low-stock item(s)`} tone={data.group.lowStock?'amber':'blue'} action="inventory"/>
        <Kpi label="Construction spend" value={money(data.construction.spentKobo)} detail={`${data.construction.activeProjects} active · ${money(data.construction.remainingKobo)} balance`} tone={data.construction.overdueMilestones?'red':'blue'} action="construction"/>
        <Kpi label="Action items" value={String(data.alerts.length)} detail={`${data.group.highRiskSecurity} high-risk security · ${data.group.overdueRequirements} overdue work`} tone={data.alerts.length?'red':'green'} action="security"/>
      </div>
      <div className="xed-grid">
        <article className="xed-panel xed-performance"><header><div><span>COMPANY PERFORMANCE</span><h3>Recorded revenue and collections</h3></div><Building2 size={20}/></header><div className="xed-bars">{rows.map((row)=>{const Icon=row.icon;const change=percent(row.revenue,row.previous);return <button key={row.key} onClick={()=>openWorkspace(row.module)}><div className="xed-bar-title"><span><i><Icon size={16}/></i><b>{row.name}</b></span><strong>{moneyFull(row.revenue)}</strong></div><div className="xed-track"><i style={{width:`${Math.max(row.revenue?4:0,row.revenue/maxRevenue*100)}%`}}/></div><div className="xed-bar-meta"><span>{row.primary} · {row.secondary}</span><em className={change<0?'down':'up'}>{change>=0?'+':''}{change.toFixed(1)}%</em></div></button>})}</div></article>
        <article className="xed-panel xed-alerts"><header><div><span>OWNER ACTION CENTER</span><h3>Needs review</h3></div><AlertTriangle size={20}/></header>{!data.alerts.length?<div className="xed-clear"><CheckCircle2 size={28}/><b>No exception alerts</b><span>No configured Group threshold currently requires review.</span></div>:<div className="xed-alert-list">{data.alerts.slice(0,8).map((alert)=><button key={alert.code} className={alert.severity} onClick={()=>openWorkspace(alert.action)}><i><AlertTriangle size={15}/></i><span><b>{alert.title}</b><small>{alert.company?`${alert.company} · `:''}{alert.detail}</small></span>{alert.action&&<ArrowRight size={14}/>}</button>)}</div>}</article>
      </div>
      <div className="xed-lower">
        <button onClick={()=>openWorkspace('construction')}><Building2/><span><small>CONSTRUCTION & PROJECTS</small><b>{moneyFull(data.construction.spentKobo)} recorded spend</b><em>{moneyFull(data.construction.budgetKobo)} budget · {data.construction.overdueMilestones} overdue milestone(s)</em></span><ArrowRight/></button>
        <button onClick={()=>openWorkspace('finance')}><CircleDollarSign/><span><small>FINANCE CONTROL</small><b>{moneyFull(data.finance.outstandingReceivablesKobo)} receivable balance</b><em>{moneyFull(data.finance.operatingExpenseKobo)} approved/paid expenses in period</em></span><ArrowRight/></button>
        <button onClick={()=>document.querySelector<HTMLButtonElement>('.owner-intelligence-launcher')?.click()}><Gauge/><span><small>DAENEM AI INTELLIGENCE</small><b>Open full Owner Intelligence</b><em>Compare companies and ask questions using recorded ERP data</em></span><ArrowRight/></button>
      </div>
      <footer className="xed-foot"><PackageSearch size={14}/><span>Last refreshed {new Date(data.generatedAt).toLocaleString('en-NG')} · {data.period.label} ({data.period.start} to {data.period.end})</span></footer>
    </>}
  </section>;
}
