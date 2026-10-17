'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Metric animation intentionally synchronizes its display state with value and motion preferences. */
import { useState, useEffect, useContext, lazy, Suspense, type ReactNode } from 'react';
import { ArrowUpRight, ChevronRight, Search, ArrowDownUp, FileText, Check, AlertCircle, Plus, Download, Shield, Clock, CloudSun, Wind, Sun, MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import EnterpriseTable from './table-v3';
import {Context,useLab} from './lab-context';
import {exportProjection} from './security-contract';
import {safeCsvCell} from './enterprise-contract';
import { type RecordData, money, initials } from './model';
export { Tabs, TabsList, TabsTrigger, TabsContent };
export function Btn({ children, onClick, variant = '', className = '', type = 'button', disabled = false, ...rest }: {
    children: ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
    type?: 'button' | 'submit';
    disabled?: boolean;
    [key: string]: unknown;
}) { return <button type={type} className={`p-btn ${variant} ${className}`} onClick={onClick} disabled={disabled} {...rest}>{children}</button>; }
export function IconBtn({ label, children, onClick }: {
    label: string;
    children: ReactNode;
    onClick: () => void;
}) { return <Tooltip><TooltipTrigger asChild><button className="p-iconbtn" aria-label={label} onClick={onClick}>{children}</button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>; }
export function Pick({ label, value, onChange, options, required = false }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    required?: boolean;
    options: (string | {
        value: string;
        label: string;
    })[];
}) { const emptyOption='__daenem_empty_option__',hasEmpty=options.some(option=>(typeof option==='string'?option:option.value)==='');return <Select value={value===''&&hasEmpty?emptyOption:value} onValueChange={next=>onChange(next===emptyOption?'':next)}><SelectTrigger className="p-select" aria-label={label} aria-required={required||undefined}><SelectValue placeholder={label}/></SelectTrigger><SelectContent className="p-select-content">{options.map(o => {const raw=typeof o==='string'?o:o.value;return <SelectItem key={raw||emptyOption} value={raw||emptyOption}>{typeof o==='string'?(o||label):o.label}</SelectItem>})}</SelectContent></Select>; }
export function Panel({ title, kicker, action, children, className = '' }: {
    title?: string;
    kicker?: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) { return <section className={`p-panel ${className}`}>{title && <header className="p-panel-head"><div>{kicker && <span className="p-kicker">{kicker}</span>}<h2>{title}</h2></div>{action}</header>}{children}</section>; }
export function Badge({ children, tone = '' }: {
    children: ReactNode;
    tone?: string;
}) { const txt = String(children); const inferred = /Required|Due|Pending|Incomplete|Review|Conflict|Late|Risk/.test(txt) ? 'amber' : /Error|Failed|Rejected|Denied|Locked/.test(txt) ? 'red' : /Approved|Complete|Present|Active|Verified|Paid|Resolved/.test(txt) ? 'green' : ''; return <span className={`p-badge ${tone || inferred}`}>{children}</span>; }
export function Avatar({ name, large = false }: {
    name: string;
    large?: boolean;
}) { return <span className={`p-avatar ${large ? 'large' : ''}`} aria-hidden="true">{initials(name)}</span>; }
export function Metric({ label, value, detail, tone = '' }: {
    label: string;
    value: string;
    detail?: string;
    tone?: string;
}) { return <div className={`p-metric ${tone}`}><span>{label}</span><AnimatedMetric value={value}/>{detail && <small>{detail}</small>}</div>; }
function AnimatedMetric({value}:{value:string}){const lab=useContext(Context);const[display,setDisplay]=useState(value);useEffect(()=>{const match=value.match(/^(\D*)([\d,]+(?:\.\d+)?)(\D*)$/),motion=lab?.prefs.motion||'Off';if(!match||motion==='Off'||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setDisplay(value);return}const number=Number(match[2].replaceAll(',',''));if(!Number.isFinite(number))return;const decimals=match[2].split('.')[1]?.length||0,duration=motion==='Calm'?160:motion==='Expressive'?900:480;let frame=0;const start=performance.now();const tick=(now:number)=>{const t=Math.min(1,(now-start)/duration);setDisplay(t===1?value:match[1]+(number*(1-(1-t)**3)).toLocaleString('en-GB',{minimumFractionDigits:decimals,maximumFractionDigits:decimals})+match[3]);if(t<1)frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)},[value,lab?.prefs.motion]);return <strong aria-label={value}><span aria-hidden="true">{display}</span></strong>}
export function Empty({ title = 'No records found', message = 'Try another search or update your filters.', action }: {
    title?: string;
    message?: string;
    action?: ReactNode;
}) { return <div className="p-empty"><FileText size={32}/><h3>{title}</h3><p>{message}</p>{action}</div>; }
export function Callout({ title, children, tone = 'amber' }: {
    title: string;
    children?: ReactNode;
    tone?: string;
}) { return <div className={`p-callout ${tone}`}><AlertCircle size={19}/><div><strong>{title}</strong>{children && <p>{children}</p>}</div></div>; }
export function Steps({ steps, current, onSelect }: {
    steps: string[];
    current: number;
    onSelect?: (i: number) => void;
}) { return <ol className="p-steps">{steps.map((s, i) => <li key={s} className={i === current ? 'active' : i < current ? 'done' : ''}><button onClick={() => onSelect?.(i)} disabled={!onSelect}><span>{i < current ? <Check size={14}/> : String(i + 1).padStart(2, '0')}</span>{s}</button></li>)}</ol>; }
export function Timeline({ items }: {
    items: {
        action: string;
        actor: string;
        time: string;
    }[];
}) { return <ol className="p-timeline">{items.map((e, i) => <li key={i}><span className="p-time-dot"/><div><strong>{e.action}</strong><p>{e.actor}</p><small>{e.time}</small></div></li>)}</ol>; }
export function DownloadCSV({rows,title='records'}:{rows:RecordData[];title?:string}){const{session,audit}=useLab();const permitted=exportProjection(rows,session);if(!permitted.length)return null;return <Btn variant="quiet" onClick={()=>{const fresh=exportProjection(rows,session);if(!fresh.length)return;const data=[['Demo Data — no production records'],['ID','Title','Company','Status','Amount'],...fresh.map(r=>[r.id,r.title,r.company,r.status,r.amount])];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data.map(row=>row.map(safeCsvCell).join(',')).join('\n')],{type:'text/csv'}));a.download='daenem-demo-'+title.replace(/[^a-z0-9-]/gi,'-')+'.csv';a.click();URL.revokeObjectURL(a.href);audit('Export generated',title,'',String(fresh.length)+' permitted records','Explicit Export permission');}}><Download size={16}/>Export CSV</Btn>}
export function RecordsTable(props:{rows:RecordData[];onOpen:(r:RecordData)=>void;financial?:boolean;title?:string}){return <EnterpriseTable {...props}/>}
export const trend = [{ name: 'Mon', revenue: 18, cost: 11, target: 16 }, { name: 'Tue', revenue: 23, cost: 14, target: 18 }, { name: 'Wed', revenue: 20, cost: 13, target: 20 }, { name: 'Thu', revenue: 29, cost: 17, target: 22 }, { name: 'Fri', revenue: 27, cost: 15, target: 24 }, { name: 'Sat', revenue: 34, cost: 19, target: 26 }, { name: 'Sun', revenue: 39, cost: 21, target: 28 }];
const LazyChart = lazy(() => import('./charts').then(m => ({ default: m.Viz })));
export function Viz(props: {
    type?: string;
    unit?: string;
    data?: Record<string, string | number>[];
    height?: number;
    onSelect?: (name: string) => void;
}) { return <Suspense fallback={<div className="p-chart-loading" style={{ minHeight: props.height || 245 }}>Loading visualization…</div>}><LazyChart {...props}/></Suspense>; }
export function Bars({ items, unit = '', onSelect }: {
    items: ({
        label: string;
        value: number;
        max: number;
        color?: string;
    } | Array<string | number>)[];
    unit?: string;
    onSelect?: (label: string) => void;
}) { const tupleMax=Math.max(1,...items.map(i=>Array.isArray(i)?Number(i[1]):i.value));const normalized=items.map(i=>Array.isArray(i)?{label:String(i[0]),value:Number(i[1]),max:tupleMax,color:undefined}:i);return <div className="p-bars">{normalized.map(i => <button key={i.label} className="p-bar-row" onClick={() => onSelect?.(i.label)} disabled={!onSelect}><span>{i.label}<strong>{i.value}{unit}</strong></span><div><i style={{ width: `${i.value / i.max * 100}%`, background: i.color }}/></div></button>)}</div>; }
export function Weather(){return <div className="p-weather"><div className="p-weather-top"><span><MapPin size={14}/>Daenem Complex / Ibadan</span><Badge>Unavailable</Badge></div><div className="p-weather-main"><CloudSun size={52} strokeWidth={1.2}/><strong>—<small>°C</small></strong><span>No connected provider<small>No current observation</small></span></div><p className="p-secondary">Weather will appear here when an approved provider is connected. Operational impact is unknown.</p></div>}
export function RouteMap({ onSelect, compact = false }: {
    onSelect?: (name: string) => void;
    compact?: boolean;
}) { return <div className={`p-map ${compact ? 'compact' : ''}`}><div className="p-map-label"><MapPin size={14}/>Southwest Nigeria <Badge>Illustrative routes</Badge></div><svg viewBox="0 0 800 400" role="img" aria-label="Illustrative Lagos to Ibadan to Ikire route schematic; no live employee locations"><defs><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#ceddd9" strokeWidth=".7"/></pattern></defs><rect width="800" height="400" fill="url(#map-grid)"/><path d="M0 370Q90 290 175 360T460 380L800 390" stroke="#b3d7d7" strokeWidth="45" fill="none"/><path d="M70 290L300 130L490 90L680 145M300 130L370 285M490 90L600 300" fill="none" stroke="#c0d1cb" strokeWidth="9"/><path d="M70 290L300 130L490 90L680 145" fill="none" stroke="#288577" strokeWidth="3" strokeDasharray="7 5"/>{[{ x: 70, y: 290, n: 'Lagos' }, { x: 300, y: 130, n: 'Ibadan' }, { x: 490, y: 90, n: 'Ikire' }, { x: 680, y: 145, n: 'Osogbo' }].map(p => <g key={p.n} tabIndex={0} role="button" aria-label={`Inspect ${p.n} route`} onClick={() => onSelect?.(p.n)} onKeyDown={e => { if (e.key === 'Enter')
    onSelect?.(p.n); }}><circle cx={p.x} cy={p.y} r="15" fill="#d7eae3"/><circle cx={p.x} cy={p.y} r="7" fill="#257768" stroke="white" strokeWidth="3"/><text x={p.x} y={p.y + 35} textAnchor="middle" fill="#344f4c" fontSize="16">{p.n}</text></g>)}</svg><footer>Route relationships only · Positions are schematic</footer></div>; }
