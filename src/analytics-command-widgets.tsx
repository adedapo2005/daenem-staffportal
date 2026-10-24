import React from 'react';
import {Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {Activity,ArrowUpRight,ArrowDownRight,Minus,ShieldAlert} from 'lucide-react';
import './analytics-command-widgets.css';

type ComparisonRow={key:string;name:string;current:number;previous:number};
export type Signal={label:string;value:string;detail:string;state?:'neutral'|'attention'|'critical'|'healthy'};
const percent=(current:number,previous:number):number|null=>previous>0?(current-previous)/previous*100:null;

export function PerformanceComparison({rows,title='Current Vs Previous Period',subtitle='Recorded performance by company',valueFormatter}:{rows:ComparisonRow[];title?:string;subtitle?:string;valueFormatter:(value:number)=>string}){
 const data=rows.map(row=>({...row,change:percent(row.current,row.previous)}));
 return <article className="acw-panel acw-comparison">
  <header className="acw-panel-head"><div><span>PERFORMANCE MOVEMENT</span><h3>{title}</h3><p>{subtitle}</p></div><Activity size={19}/></header>
  <div className="acw-chart-wrap" role="img" aria-label={title+' current and previous period comparison by company.'}>
   <ResponsiveContainer width="100%" height={250}><BarChart data={data} margin={{top:8,right:8,left:0,bottom:12}}>
    <CartesianGrid vertical={false} stroke="rgba(110,120,140,.14)" strokeDasharray="3 3"/>
    <XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={54}/>
    <YAxis tickFormatter={(value)=>valueFormatter(Number(value))} tick={{fontSize:9}} axisLine={false} tickLine={false} width={68}/>
    <Tooltip formatter={(value)=>valueFormatter(Number(value))} contentStyle={{borderRadius:12,border:'1px solid var(--border,#dde3eb)',background:'var(--panel,#fff)'}}/>
    <Bar dataKey="previous" name="Previous" fill="#8b97aa" radius={[6,6,0,0]} maxBarSize={30}/>
    <Bar dataKey="current" name="Current" fill="#315aa7" radius={[6,6,0,0]} maxBarSize={30}/>
   </BarChart></ResponsiveContainer>
  </div>
  <div className="acw-change-grid">{data.map(row=>{const up=row.change!==null&&row.change>0,down=row.change!==null&&row.change<0;const Icon=up?ArrowUpRight:down?ArrowDownRight:Minus;return <div className="acw-change" key={row.key}><span>{row.name}</span><b className={down?'down':up?'up':'flat'}><Icon size={13}/>{row.change===null?'No comparable baseline':`${row.change>=0?'+':''}${row.change.toFixed(1)}%`}</b></div>})}</div>
 </article>
}

export function OperatingSignals({signals}:{signals:Signal[]}){
 return <article className="acw-panel acw-signals"><header className="acw-panel-head"><div><span>LIVE OPERATING SIGNALS</span><h3>What Needs Watching</h3><p>Current recorded exceptions and health signals.</p></div><ShieldAlert size={19}/></header><div className="acw-signal-grid">{signals.map(signal=><div className={'acw-signal state-'+(signal.state||'neutral')} key={signal.label}><small>{signal.label}</small><strong>{signal.value}</strong><span>{signal.detail}</span></div>)}</div></article>
}