export type BakeryProductionDay={day:string;completedBatches:number;goodLoaves:number;productionLossLoaves:number};
export type BakeryOrderDay={day:string;orders:number;orderValueKobo:number;recordedOrderPaymentsKobo:number};
export type BakeryHistory={periodStart:string;periodEnd:string;timeZone:string;production:BakeryProductionDay[];orders:BakeryOrderDay[]|null;source:string};
export type BakeryMetricChange={current:number;previous:number;absolute:number;percentage:number|null};
export type BakeryRateChange={current:number|null;previous:number|null;points:number|null};
export type BakeryPeriodComparison={
 currentFrom:string;currentTo:string;previousFrom:string;previousTo:string;includesPartialToday:boolean;
 output:BakeryMetricChange;productionLoss:BakeryMetricChange;completedBatches:BakeryMetricChange;lossRate:BakeryRateChange;
 commercial:{orderValue:BakeryMetricChange;orderCount:BakeryMetricChange}|null
};
export function compareMetric(current:number,previous:number):BakeryMetricChange{
 const absolute=current-previous;
 return {current,previous,absolute,percentage:previous===0?null:Math.round((absolute/Math.abs(previous))*1000)/10};
}
function sum<T>(rows:T[],select:(row:T)=>number):number{return rows.reduce((n,row)=>n+select(row),0)}
function lossRate(good:number,lost:number):number|null{
 const total=good+lost;return total>0?100*lost/total:null;
}
export function bakeryPeriodComparison(history:BakeryHistory|null|undefined):BakeryPeriodComparison|null{
 if(!history||history.production.length!==14)return null;
 const earlier=history.production.slice(0,7),recent=history.production.slice(7);
 const startTime=Date.parse(history.production[0].day+'T00:00:00Z');
 if(!Number.isFinite(startTime)||history.production.some((row,index)=>row.day!==new Date(startTime+86400000*index).toISOString().slice(0,10)))return null;
 if(history.production.some(row=>![row.goodLoaves,row.productionLossLoaves,row.completedBatches].every(n=>Number.isFinite(n)&&n>=0)))return null;
 const previousGood=sum(earlier,x=>x.goodLoaves),currentGood=sum(recent,x=>x.goodLoaves);
 const previousWaste=sum(earlier,x=>x.productionLossLoaves),currentWaste=sum(recent,x=>x.productionLossLoaves);
 const previousRate=lossRate(previousGood,previousWaste),currentRate=lossRate(currentGood,currentWaste);
 const commercial=history.orders===null?null:history.orders.length!==14?null:history.orders.some((row,index)=>row.day!==history.production[index].day||![row.orderValueKobo,row.orders].every(n=>Number.isFinite(n)&&n>=0))?null:{
  orderValue:compareMetric(sum(history.orders.slice(7),x=>x.orderValueKobo),sum(history.orders.slice(0,7),x=>x.orderValueKobo)),
  orderCount:compareMetric(sum(history.orders.slice(7),x=>x.orders),sum(history.orders.slice(0,7),x=>x.orders))
 };
 return {
  previousFrom:earlier[0].day,previousTo:earlier[6].day,currentFrom:recent[0].day,currentTo:recent[6].day,
  includesPartialToday:recent[6].day===history.periodEnd,
  output:compareMetric(currentGood,previousGood),productionLoss:compareMetric(currentWaste,previousWaste),
  completedBatches:compareMetric(sum(recent,x=>x.completedBatches),sum(earlier,x=>x.completedBatches)),
  lossRate:{current:currentRate,previous:previousRate,points:currentRate!==null&&previousRate!==null?Math.round((currentRate-previousRate)*10)/10:null},
  commercial
 };
}
