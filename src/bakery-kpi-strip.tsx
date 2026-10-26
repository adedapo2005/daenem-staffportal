import type{BakeryHistory,BakeryMetricChange}from'./bakery-intelligence-metrics';
import{bakeryPeriodComparison}from'./bakery-intelligence-metrics';
import'./bakery-kpi-strip.css';

const whole=(n:number)=>new Intl.NumberFormat('en-NG',{maximumFractionDigits:0}).format(n);
const money=(kobo:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',minimumFractionDigits:kobo%100===0?0:2,maximumFractionDigits:2}).format(kobo/100);
const signed=(n:number)=>n>0?'+':n<0?'−':'';
const magnitude=(n:number)=>whole(Math.abs(n));
function changeLabel(metric:BakeryMetricChange,unit:string){
 const delta=`${signed(metric.absolute)}${magnitude(metric.absolute)} ${unit}`;
 const relative=metric.percentage===null?'% unavailable: zero baseline':`${signed(metric.percentage)}${Math.abs(metric.percentage).toFixed(1)}%`;
 return `${delta} · ${relative}`;
}
function moneyChangeLabel(metric:BakeryMetricChange){
 const relative=metric.percentage===null?'% unavailable: zero baseline':`${signed(metric.percentage)}${Math.abs(metric.percentage).toFixed(1)}%`;
 return `${signed(metric.absolute)}${money(Math.abs(metric.absolute))} · ${relative}`;
}
export function BakeryKpiStrip({history}:{history?:BakeryHistory}){
 const comparison=bakeryPeriodComparison(history);
 if(!comparison)return <p className="bakery-kpi-unavailable">Seven-day KPI comparisons are unavailable until complete, valid Bakery production history is accessible.</p>;
 const cards=[
  {key:'output',label:'Saleable Output',value:whole(comparison.output.current)+' loaves',detail:changeLabel(comparison.output,'loaves'),tone:'neutral'},
  {key:'loss',label:'Production Loss',value:whole(comparison.productionLoss.current)+' loaves',detail:changeLabel(comparison.productionLoss,'loaves'),tone:'neutral'},
  {key:'loss-rate',label:'Production Loss Rate',value:comparison.lossRate.current===null?'—':comparison.lossRate.current.toFixed(1)+'%',
   detail:comparison.lossRate.points===null?'Not comparable: missing production baseline':`${signed(comparison.lossRate.points)}${Math.abs(comparison.lossRate.points).toFixed(1)} percentage points`,
   tone:comparison.lossRate.points===null||comparison.lossRate.points===0?'neutral':comparison.lossRate.points>0?'adverse':'favorable'},
  {key:'batches',label:'Completed Batches',value:whole(comparison.completedBatches.current),detail:changeLabel(comparison.completedBatches,'batches'),tone:'neutral'},
  ...(comparison.commercial?[
   {key:'order-value',label:'Recorded Order Value',value:money(comparison.commercial.orderValue.current),detail:moneyChangeLabel(comparison.commercial.orderValue),tone:'neutral'},
   {key:'orders',label:'Recorded Orders',value:whole(comparison.commercial.orderCount.current),detail:changeLabel(comparison.commercial.orderCount,'orders'),tone:'neutral'}
  ]:[])
 ];
 return <div className="bakery-comparison"><p className="bakery-comparison-period"><strong>Recent seven days</strong> {comparison.currentFrom} – {comparison.currentTo} <span aria-hidden="true">·</span> <strong>Previous seven days</strong> {comparison.previousFrom} – {comparison.previousTo}{comparison.includesPartialToday?' · Today is still in progress':''}</p><div className="bakery-kpi-grid">{cards.map(card=><article key={card.key} className={`bakery-kpi-card bakery-kpi-${card.tone}`}><small>{card.label}</small><strong>{card.value}</strong><span>{card.detail}</span></article>)}</div><p className="bakery-comparison-note">Data is based on recorded production batches and orders. Increased output or order value does not automatically mean increased profit. Zero historical baselines never generate invented percentage growth.</p></div>;
}
