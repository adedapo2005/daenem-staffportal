import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpen, Bot, BriefcaseBusiness, CalendarDays, CheckCircle2,
  ChevronRight, CircleDollarSign, CloudSun, Command, FileText, Gauge, Globe2, Grid3X3, LayoutDashboard,
  ListChecks, MapPinned, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles, Users, Workflow,
} from 'lucide-react';
import type { CanonicalDashboardProps, CanonicalFixture, CanonicalNavigationItem, CanonicalZoneId, StaffPortalLayoutId } from './canonical-types';
import { CANONICAL_VISUAL_FIXTURE } from './canonical-fixture';
import { CANONICAL_LAYOUT_IDS, CANONICAL_LAYOUT_SPECS } from './layout-specs';
import { formatPersonName, formatUiLabel, initialsFromPersonName } from './display-standards';
import { FreshnessStatus } from './FreshnessStatus';
import './canonical-fonts';
import './canonical-dashboard.css';

const nav = [
  ['Dashboard', LayoutDashboard], ['People & Teams', Users], ['Operations', Gauge], ['Projects', BriefcaseBusiness],
  ['Finance & Revenue', CircleDollarSign], ['Approvals', ListChecks], ['Documents', FileText], ['Knowledge Hub', BookOpen],
  ['AI & Automation', Bot], ['Reports & Analytics', BarChart3], ['Tools & Integrations', Workflow], ['Settings', Settings2],
] as const;

const zoneTitles: Partial<Record<CanonicalZoneId, string>> = {
  'executive-analytics': 'Revenue & Operations', 'workspace-schedule': 'My Schedule', 'workspace-projects': 'Featured Projects',
  'operations-map': 'Global Operations Map', 'operations-team': 'Team Operations', 'insight-story': 'Latest Insights',
  'master-list': 'Authorized Records', 'master-detail': 'Selected Record', 'horizon-global': 'Global Operations',
  'bento-strategy': 'Strategic Priorities', 'focus-progress': 'Today’s Progress', 'focus-priorities': 'Today’s Priorities',
  'studio-toolbox': 'Toolbox', 'studio-canvas': 'Sales Performance View', 'board-trend': 'Executive Trend Overview',
  'board-agenda': 'Board Agenda', 'ai-insights': 'Daenem AI Insights', weather: 'Today’s World', 'world-time': 'Global Time',
  tasks: 'My Tasks', approvals: 'Pending Approvals', activity: 'Recent Activity', knowledge: 'Knowledge Hub',
  'quick-actions': 'Quick Actions', status: 'System Status', announcement: 'Latest Announcements',
};

const heroArtworkPaths: Record<StaffPortalLayoutId, string> = {
  'executive-command': '/canonical-postauth-v3/executive-command/hero-atmosphere.svg',
  'workspace-canvas': '/canonical-postauth-v3/workspace-canvas/hero-atmosphere.svg',
  'operational-cockpit': '/canonical-postauth-v3/operational-cockpit/hero-atmosphere.svg',
  'insight-magazine': '/canonical-postauth-v3/insight-magazine/hero-atmosphere.svg',
  'master-detail-workspace': '/canonical-postauth-v3/master-detail-workspace/hero-atmosphere.svg',
  'horizon-wide': '/canonical-postauth-v3/horizon-wide/hero-atmosphere.svg',
  'adaptive-bento': '/canonical-postauth-v3/adaptive-bento/hero-atmosphere.svg',
  'focus-flow': '/canonical-postauth-v3/focus-flow/hero-atmosphere.svg',
  'enterprise-studio': '/canonical-postauth-v3/enterprise-studio/hero-atmosphere.svg',
  'board-pulse': '/canonical-postauth-v3/board-pulse/hero-atmosphere.svg',
};

function TopBar({ fixture, layoutId, onLayoutChange, onWorkspace, onSearch, onAskAi, onQuickCreate, onNotifications, onProfile }: { fixture: CanonicalFixture; layoutId: StaffPortalLayoutId; onLayoutChange: (id: StaffPortalLayoutId) => void; onWorkspace?: () => void; onSearch?: (query?:string)=>void; onAskAi?:()=>void; onQuickCreate?:()=>void; onNotifications?:()=>void; onProfile?:()=>void }) {
  const [query,setQuery] = useState('');
  return <header className="csp-topbar" data-canonical-topbar>
    <div className="csp-brand"><span className="csp-brand-mark"><img src="/brand-assets/logo-mark.svg" alt="" /></span><span><b>STAFFPORTAL.DAENEM.COM</b><small>People · Systems · A Stronger Tomorrow</small></span></div>
    <button type="button" className="csp-workspace" onClick={onWorkspace}><BriefcaseBusiness size={16}/><span><b>{fixture.workspace.name}</b><small>{fixture.workspace.subtitle}</small></span></button>
    <form className="csp-search" role="search" onSubmit={(event)=>{event.preventDefault();onSearch?.(query)}}><Search size={17}/><span className="csp-search-mobile-placeholder" aria-hidden="true">Search Staff Portal</span><input aria-label="Search Staff Portal" placeholder="Search People, Documents, Projects, Anything..." value={query} onChange={(event)=>setQuery(event.target.value)}/><kbd>⌘ K</kbd></form>
    <div className="csp-top-actions">
    {onAskAi && <button type="button" className="csp-ai" onClick={onAskAi}><Sparkles size={16}/> Ask Daenem AI</button>}
      <button type="button" className="csp-create" aria-label="Quick Create" onClick={onQuickCreate}><Plus size={16}/><span className="csp-create-label">Quick Create</span></button>
      <button type="button" className="csp-icon" aria-label="Notifications" onClick={onNotifications}><Bell size={17}/><i>3</i></button>
      <span className="csp-weather-chip"><CloudSun size={18}/><span><b>{fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`}</b><small>{fixture.weather.city}</small></span></span>
      <FreshnessStatus sync={fixture.sync} variant="topbar"/>
      <span className="csp-release"><b>{fixture.release.version}</b><small>{fixture.release.label}</small></span>
      <label className="csp-layout-select"><Grid3X3 size={16}/><span className="csp-layout-current" aria-hidden="true">{CANONICAL_LAYOUT_SPECS[layoutId].name}</span><select aria-label="Dashboard Layout" value={layoutId} onChange={(e)=>onLayoutChange(e.target.value as StaffPortalLayoutId)}>{CANONICAL_LAYOUT_IDS.map((id)=><option key={id} value={id}>{CANONICAL_LAYOUT_SPECS[id].name}</option>)}</select></label>
      <button type="button" className="csp-profile" onClick={onProfile} aria-label={`Open Profile For ${formatPersonName(fixture.viewer.displayName)}`}><span className="csp-avatar">{initialsFromPersonName(fixture.viewer.displayName)}</span><span className="csp-profile-copy"><b>{formatPersonName(fixture.viewer.displayName)}</b><small>{formatUiLabel(fixture.viewer.role)}</small></span></button>
    </div>
  </header>;
}

function SideNav({ layoutId, navigation, activeNavigationId }: { layoutId: StaffPortalLayoutId; navigation?: CanonicalNavigationItem[]; activeNavigationId?: string }) {
  // An explicitly empty authorized navigation list must stay empty.
  const items: CanonicalNavigationItem[] = navigation !== undefined ? navigation : nav.map(([label, Icon]) => ({ id: label, label, icon: Icon }));
  return <aside className="csp-sidebar" data-canonical-sidebar>
    <div className="csp-sidebar-title"><Command size={18}/><span><b>{CANONICAL_LAYOUT_SPECS[layoutId].name}</b><small>Selectable Premium Layout</small></span></div>
    <nav>{items.map((item,index)=>{const Icon=item.icon || LayoutDashboard;const active=activeNavigationId ? item.id===activeNavigationId : index===0;return <button type="button" key={item.id} className={active?'active':''} onClick={item.onSelect} aria-label={formatUiLabel(item.label)} aria-current={active?'page':undefined}><Icon size={17}/><span>{formatUiLabel(item.label)}</span>{item.badge && <em>{item.badge}</em>}</button>})}</nav>
    <div className="csp-purpose"><span>One Team</span><b>A Brighter Tomorrow</b><small>Build · Empower · Grow</small><ChevronRight size={18}/></div>
  </aside>;
}

export function CanonicalHero({ fixture, layoutId }: { fixture: CanonicalFixture; layoutId: StaffPortalLayoutId }) {
  const copy: Record<StaffPortalLayoutId, [string,string]> = {
    'executive-command':['Good Morning, {viewer}','Everything That Matters. In One View.'],
    'workspace-canvas':['Workspace Canvas','Your Work, Your Way. Organise. Collaborate. Make An Impact.'],
    'operational-cockpit':['Operational Cockpit','Real-Time Operations. Greater Possibilities.'],
    'insight-magazine':['People Create Brighter Tomorrows','Perspectives. Ideas. People. Progress.'],
    'master-detail-workspace':['Master–Detail Workspace','Browse, Focus And Take Action — All In One Place.'],
    'horizon-wide':['Bigger Horizons','Global Intelligence Across One Panoramic Workspace.'],
    'adaptive-bento':['Good Morning, {viewer}','Progress Happens When People, Purpose And Possibilities Align.'],
    'focus-flow':['Focus & Flow','Turn Today’s Priorities Into Tomorrow’s Progress.'],
    'enterprise-studio':['Enterprise Studio','Design. Analyse. Automate. A Smarter Organisation Starts Here.'],
    'board-pulse':['Board Pulse','A Clearer Tomorrow, Through Bolder Decisions Today.'],
  };
  const viewerName = formatPersonName(fixture.viewer.displayName);
  const heroTitle = copy[layoutId][0].replace('{viewer}', viewerName);
  return <section className="csp-hero" data-zone="hero">
    <div className="csp-hero-copy"><span className="csp-eyebrow">{CANONICAL_LAYOUT_SPECS[layoutId].name.toUpperCase()}</span><h1>{heroTitle}</h1><p>{copy[layoutId][1]}</p><small>People. Progress. A Brighter Tomorrow.</small></div>
    <div className="csp-hero-scene" aria-hidden="true"><img className="csp-hero-artwork" src={heroArtworkPaths[layoutId]} alt=""/><span>A More Connected<br/>Brighter Tomorrow</span><i className="csp-hero-glass"/></div>
    <div className="csp-clock"><small>{fixture.dateTime.date}</small><strong>{fixture.dateTime.time}</strong><span>{fixture.dateTime.zone}</span><Globe2 size={30}/></div>
  </section>;
}

export function CanonicalKpis({ fixture }: { fixture: CanonicalFixture }) {
  return <section className="csp-kpis" data-zone="kpis">{fixture.kpis.map((k)=><article key={k.label} className={`tone-${k.tone}`}><KpiIcon label={k.label}/><span className="csp-kpi-label">{k.label}</span><strong data-canonical-metric="true" data-numeric={/\d/.test(k.value) ? 'true' : 'false'}>{k.value}</strong><em>{k.delta}</em><small>{k.meta}</small><svg className="csp-kpi-spark" viewBox="0 0 120 44" aria-hidden="true"><path d="M2 36C14 34 16 25 28 28S44 17 54 22S68 11 78 18S96 7 118 8"/><path d="M2 42H118"/></svg></article>)}</section>;
}

function KpiIcon({ label }: { label: string }) {
  const Icon = label.includes('Staff') ? Users : label.includes('Revenue') ? BarChart3 : label.includes('Projects') ? BriefcaseBusiness : label.includes('Approvals') ? CheckCircle2 : ShieldCheck;
  return <span className="csp-kpi-icon" aria-hidden="true"><Icon size={18}/></span>;
}

function MiniLineChart({ chartId = 'csp-chart-fill' }: { chartId?: string }) {
  return <svg className="csp-chart" viewBox="0 0 640 220" role="img" aria-label="Reference Trend Chart"><defs><linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".24"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><path d="M20 178 C90 165 125 142 170 147 S250 115 300 120 S385 76 430 92 S520 55 610 42 L610 210 L20 210 Z" fill={`url(#${chartId})`}/><path d="M20 178 C90 165 125 142 170 147 S250 115 300 120 S385 76 430 92 S520 55 610 42" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><g fill="currentColor">{[[20,178],[170,147],[300,120],[430,92],[610,42]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="5"/>)}</g></svg>;
}

function StudioNode({ className, label, detail, tone }: { className: string; label: string; detail: string; tone: 'violet' | 'blue' | 'cyan' | 'success' }) {
  return <div className={`node ${className} node-${tone}`}><span className="csp-node-type"><i aria-hidden="true" />AUTHORIZED SURFACE</span><b>{label}</b><small>{detail}</small></div>;
}

function StrategicTrends({ fixture }: { fixture: CanonicalFixture }) {
  const metrics = [fixture.kpis[2], fixture.kpis[0], fixture.kpis[4]].filter(Boolean);
  return <section className="csp-trends-panel" aria-label="Strategic Trends">
    <header><span><Sparkles size={17}/><b>Strategic Trends</b></span><button type="button">Last 6 Months <ChevronRight size={14}/></button></header>
    <div className="csp-trend-metrics">{metrics.map((metric)=><span key={metric.label}><i aria-hidden="true"><BarChart3 size={13}/></i><small>{metric.label}</small><strong data-canonical-metric="true" data-numeric={/\d/.test(metric.value) ? 'true' : 'false'}>{metric.value}</strong></span>)}</div>
    <div className="csp-trend-visual" aria-hidden="true"><svg viewBox="0 0 520 210"><path d="M16 170C80 148 105 151 151 133S224 146 268 111s82-11 116-35 68-17 120-45"/><path className="line-violet" d="M16 187C78 178 107 164 153 172s74-16 115-4 76-32 119-22 77-33 117-24"/><path className="line-gold" d="M16 198c72-11 102-3 150-22s73 5 115-10 75 2 112-14 80-4 111-26"/></svg></div>
    <footer><span><i className="dot-blue"/>Active Projects</span><span><i className="dot-violet"/>Total Staff</span><span><i className="dot-gold"/>System Uptime</span></footer>
  </section>;
}

const editorialStories = [
  { kicker: 'People & Culture', title: 'People Create Brighter Tomorrows', detail: 'Ideas In Motion', tone: 'sunrise' },
  { kicker: 'Leadership', title: 'Leading With Purpose', detail: 'Perspectives & Practice', tone: 'violet' },
  { kicker: 'Innovation', title: 'From Ideas To Impact', detail: 'Workplace Intelligence', tone: 'cyan' },
] as const;

function InsightStory({ onAction }: { onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  return <article className="csp-card csp-story" data-zone="insight-story">
    <header><span><BookOpen size={18}/><b>Latest Insights</b></span><button type="button" onClick={()=>onAction?.('insight-story','view-all')}>View All</button></header>
    <div className="csp-story-grid">{editorialStories.map((story,index)=><button type="button" className={`csp-story-item csp-story-${story.tone}${index===0?' csp-story-featured':''}`} key={story.title} onClick={()=>onAction?.('insight-story','open-story')}>
      <span className="csp-story-art" aria-hidden="true"><i/><i/><i/></span>
      <span className="csp-story-copy"><em>{story.kicker}</em><b>{story.title}</b><small>{story.detail}</small></span>
      <ChevronRight size={16} aria-hidden="true"/>
    </button>)}</div>
  </article>;
}

function GlobalOperationsPanel({ fixture }: { fixture: CanonicalFixture }) {
  const metrics = [fixture.kpis[0], fixture.kpis[2], fixture.kpis[4]].filter(Boolean);
  return <article className="csp-card csp-global-panel" data-zone="horizon-global">
    <header><span><Globe2 size={18}/><b>Global Operations</b></span><em>Live</em></header>
    <div className="csp-global-panel-grid">
      <section className="csp-global-map-panel">
        <div className="csp-global-map-art" aria-hidden="true"><img src="/canonical-postauth-v3/shared/world-operations-map.svg" alt=""/><span>One Connected World</span></div>
        <footer>{metrics.map((metric)=><span key={metric.label}><strong data-canonical-metric="true" data-numeric={/\d/.test(metric.value) ? 'true' : 'false'}>{metric.value}</strong><small>{metric.label}</small></span>)}</footer>
      </section>
      <section className="csp-global-performance">
        <header><span><BarChart3 size={17}/><b>Enterprise Performance</b></span><button type="button">Last 6 Months <ChevronRight size={14}/></button></header>
        <div className="csp-analytics-metric"><strong data-canonical-metric="true" data-numeric="true">{fixture.kpis[1]?.value ?? 'Not Available'}</strong><span>{fixture.kpis[1]?.delta ?? 'Not Available'}</span><small>{fixture.kpis[1]?.meta ?? 'Waiting For Live Data'}</small></div>
        <div className="csp-analytics-visual"><MiniLineChart chartId="horizon-global-performance"/><span className="csp-analytics-grid" aria-hidden="true"/></div>
        <footer><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></footer>
      </section>
    </div>
  </article>;
}

function BentoStrategy({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const tiles = [
    { label: fixture.kpis[2]?.label ?? 'Active Projects', value: fixture.kpis[2]?.value ?? 'Not Available', detail: 'Portfolio Momentum', tone: 'violet' },
    { label: fixture.kpis[0]?.label ?? 'Total Staff', value: fixture.kpis[0]?.value ?? 'Not Available', detail: 'People & Capability', tone: 'blue' },
    { label: fixture.kpis[1]?.label ?? 'Monthly Revenue', value: fixture.kpis[1]?.value ?? 'Not Available', detail: 'Operational Signal', tone: 'cyan' },
    { label: fixture.kpis[4]?.label ?? 'System Uptime', value: fixture.kpis[4]?.value ?? 'Not Available', detail: 'Platform Confidence', tone: 'gold' },
  ];
  return <article className="csp-card csp-bento-strategy" data-zone="bento-strategy">
    <header><span><Sparkles size={18}/><b>Strategic Priorities</b></span><button type="button" onClick={()=>onAction?.('bento-strategy','view-all')}>View All</button></header>
    <div className="csp-bento-grid">{tiles.map((tile,index)=><button type="button" className={`csp-bento-tile csp-bento-${tile.tone} ${index===0?'csp-bento-featured':''}`} key={tile.label} onClick={()=>onAction?.('bento-strategy','open-priority')}>
      <span className="csp-bento-tile-art" aria-hidden="true"><i/><i/><i/></span><span className="csp-bento-copy"><small>{tile.label}</small><strong data-canonical-metric="true" data-numeric={/\d/.test(tile.value) ? 'true' : 'false'}>{tile.value}</strong><em>{tile.detail}</em></span><ChevronRight size={15} aria-hidden="true"/>
    </button>)}</div>
  </article>;
}

function BoardAgendaSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const signals = fixture.approvals.slice(0, 3);
  const agenda = fixture.activity.slice(0, 3);
  return <article className="csp-card csp-board-agenda" data-zone="board-agenda">
    <header><span><CalendarDays size={17}/><b>Board Agenda</b></span><button type="button" onClick={()=>onAction?.('board-agenda','view-all')}>View All</button></header>
    <div className="csp-board-agenda-grid">
      <section><span className="csp-board-kicker">Decision Signals</span>{signals.map((item)=><button type="button" key={item.title} onClick={()=>onAction?.('board-agenda','open-decision')}><span><b>{item.title}</b><small>{item.meta}</small></span><em className={`approval-status ${item.status.toLowerCase().replaceAll(' ','-')}`}>{item.status}</em></button>)}</section>
      <section><span className="csp-board-kicker">Agenda Rhythm</span>{agenda.map((item)=><div key={item.title}><span><b>{item.title}</b><small>{item.meta}</small></span><ChevronRight size={14}/></div>)}</section>
    </div>
  </article>;
}

function ZoneCard({ zone, fixture, onAction }: { zone: CanonicalZoneId; fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  if (zone==='hero') return null;
  if (zone==='kpis') return <CanonicalKpis fixture={fixture}/>;
  const title = zoneTitles[zone] || zone;
  if (zone==='insight-story') return <InsightStory onAction={onAction}/>;
  if (zone==='horizon-global') return <GlobalOperationsPanel fixture={fixture}/>;
  if (zone==='executive-analytics' || zone==='board-trend') return <article className="csp-card csp-analytics" data-zone={zone}><div className="csp-analytics-columns"><section className="csp-revenue-panel"><header><span><BarChart3 size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"change-period")}>Last 6 Months <ChevronRight size={14}/></button></header><div className="csp-analytics-metric"><strong data-canonical-metric="true" data-numeric={/\d/.test(fixture.kpis[1]?.value ?? '') ? 'true' : 'false'}>{fixture.kpis[1]?.value ?? 'Not Available'}</strong><span>{fixture.kpis[1]?.delta ?? 'Not Available'}</span><small>{fixture.kpis[1]?.meta ?? 'Waiting For Live Data'}</small></div><div className="csp-analytics-visual"><MiniLineChart chartId={`${zone}-revenue-fill`}/><span className="csp-analytics-grid" aria-hidden="true"/></div><footer><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></footer></section><StrategicTrends fixture={fixture}/></div></article>;
  if (zone==='operations-map') return <article className="csp-card csp-map" data-zone={zone}><header><span><MapPinned size={18}/><b>{title}</b></span><em>● Live</em></header><div className="csp-map-art"><svg className="csp-map-network" viewBox="0 0 640 300" aria-hidden="true"><path d="M78 172C168 82 241 218 336 128S488 82 570 154"/><path d="M164 72L210 244M438 72L390 244"/></svg><div className="csp-map-scope-rail"><span><b>{fixture.kpis[0]?.value ?? 'Not Available'}</b><small>Authorized Staff</small></span><span><b>{fixture.kpis[2]?.value ?? 'Not Available'}</b><small>Authorized Projects</small></span><span><b>{fixture.kpis[4]?.value ?? 'Not Available'}</b><small>System Status</small></span></div><i className="n1"/><i className="n2"/><i className="n3"/><i className="n4"/><i className="n5"/><span>{fixture.workspace.name}</span><div className="csp-map-signal-legend" aria-hidden="true"><i/>Authorized Scope <i/>Decorative Route Layer</div></div><footer><b>{fixture.kpis[0]?.label ?? 'Staff'} · {fixture.kpis[0]?.value ?? 'Not Available'}</b><b>{fixture.kpis[2]?.label ?? 'Projects'} · {fixture.kpis[2]?.value ?? 'Not Available'}</b><b>{fixture.kpis[4]?.label ?? 'System Uptime'} · {fixture.kpis[4]?.value ?? 'Not Available'}</b></footer></article>;
  if (zone==='studio-canvas') return <article className="csp-card csp-studio" data-zone={zone}><header><span><Workflow size={18}/><b>{title}</b></span><div><button type="button" onClick={()=>onAction?.(zone,"save")}>Save</button><button type="button" className="primary" onClick={()=>onAction?.(zone,"publish")}>Publish</button></div></header><div className="csp-studio-workspace"><div className="csp-studio-grid"><svg className="csp-studio-connectors" viewBox="0 0 900 600" aria-hidden="true"><path d="M450 90L250 220M450 90L690 220M250 220L160 390M250 220L440 390M690 220L760 430M440 390L760 430"/></svg><StudioNode className="n1" tone="violet" label="Authorized Data Source" detail="Connected Workspace Data"/><StudioNode className="n2" tone="blue" label="Transform Step" detail="Clean & Transform"/><StudioNode className="n3" tone="violet" label="Analysis Step" detail="Authorized Analysis"/><StudioNode className="n4" tone="cyan" label="Trend View" detail="Analytical Surface"/><StudioNode className="n5" tone="success" label="Regional View" detail="Scope Comparison"/><StudioNode className="n6" tone="violet" label="Report View" detail="Ready For Review"/></div><aside className="csp-studio-inspector"><header><span><Settings2 size={16}/><b>Inspector</b></span><em>Selected</em></header><label>Node Type<select aria-label="Node Type"><option>Data Source</option><option>Workflow Step</option><option>Chart / Graph</option></select></label><label>Data Source<select aria-label="Data Source"><option>Authorized Workspace Data</option><option>Live Staff Portal Data</option></select></label><label>Refresh Cycle<select aria-label="Refresh Cycle"><option>On Demand</option><option>Scheduled</option></select></label><button type="button" onClick={()=>onAction?.(zone,"configure-node")}>Configure Node <ChevronRight size={14}/></button></aside></div></article>;
  if (zone==='master-list') return <article className="csp-card csp-master" data-zone={zone}><header><b>{title} ({fixture.kpis[2]?.value ?? 'Not Available'})</b><button type="button" className="primary" onClick={()=>onAction?.(zone,"new-project")}><Plus size={14}/> New Record</button></header>{fixture.tasks.slice(0,6).map((record,i)=><button type="button" className={i===0?'selected':''} key={record.title} onClick={()=>onAction?.(zone,'select-record')}><span><b>{record.title}</b><small>{record.meta}</small></span><em>Not Available</em></button>)}</article>;
  if (zone==='master-detail') return <article className="csp-card csp-detail" data-zone={zone}><header><div><span className="csp-eyebrow">SELECTED RECORD</span><h2>{title}</h2><p>{fixture.workspace.subtitle}</p></div><button type="button" onClick={()=>onAction?.(zone,"edit")}>Edit</button></header><div className="csp-detail-banner" aria-hidden="true"><img src="/canonical-postauth-v3/master-detail-workspace/detail-surface.svg" alt=""/></div><div className="csp-detail-tabs"><b>Overview</b><span>Tasks {fixture.tasks.length}</span><span>Milestones Not Available</span><span>Documents Not Available</span><span>Team Not Available</span><span>Financials</span></div><div className="csp-detail-kpis"><span><small>Record Health</small><b>Not Available</b></span><span><small>Completion</small><b>Not Available</b></span><span><small>Time Remaining</small><b>Not Available</b></span><span><small>Budget Utilisation</small><b>Not Available</b></span></div><div className="csp-detail-lower"><section className="csp-detail-progress"><header><b>Progress Trend</b><button type="button" onClick={()=>onAction?.(zone,"change-period")}>Last 6 Months <ChevronRight size={14}/></button></header><MiniLineChart chartId="master-detail-progress"/></section><section className="csp-detail-task-status"><header><b>Task Status</b><span>{fixture.tasks.length} Tasks</span></header><div className="csp-task-ring" aria-hidden="true"><i>{fixture.tasks.length}</i></div><div className="csp-task-legend"><span><i className="done"/>Completed <b>{fixture.tasks.filter(t=>t.priority==='Low').length}</b></span><span><i className="active"/>In Progress <b>{fixture.tasks.filter(t=>t.priority==='Medium').length}</b></span><span><i className="risk"/>Needs Attention <b>{fixture.tasks.filter(t=>t.priority==='High').length}</b></span></div></section><aside className="csp-detail-inspector"><header><b>Record Details</b><button type="button" onClick={()=>onAction?.(zone,"edit-details")}>Edit</button></header><div><span>Workspace</span><b>{fixture.workspace.name}</b></div><div><span>Viewer</span><b>{formatPersonName(fixture.viewer.displayName)}</b></div><div><span>Role</span><b>{formatUiLabel(fixture.viewer.role)}</b></div><div><span>Release</span><b>{fixture.release.version}</b></div></aside></div></article>;
  if (zone==='board-agenda') return <BoardAgendaSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='workspace-schedule') return <article className="csp-card csp-list" data-zone={zone}><header><span><CalendarDays size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{fixture.activity.slice(0,4).map((item,i)=><div key={item.title}><i className={`dot d${i}`}/><span><b>{item.title}</b><small>{item.meta}</small></span><ChevronRight size={14}/></div>)}</article>;
  if (zone==='workspace-projects') return <article className="csp-card csp-projects" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header><div>{fixture.tasks.slice(0,3).map((item,i)=><section key={item.title}><span className={`project-art p${i}`} aria-hidden="true"><i/><i/><i/></span><b>{item.title}</b><small>{item.meta}</small><progress max="100" value={[68,54,82][i] ?? 0} aria-hidden="true"/><em>Not Available</em></section>)}</div></article>;
  if (zone==='ai-insights') return <article className="csp-card csp-ai-card" data-zone={zone}><header><span><Sparkles size={18}/><b>{title}</b></span><em>BETA</em></header><span className="csp-ai-orbit" aria-hidden="true"><i/><i/><i/></span>{['Revenue Trend Update','Review Pending Requests','Team Productivity Update','Contract Review Needed','System Performance Update'].map(x=><button type="button" key={x} onClick={()=>onAction?.(zone,"open-insight")}><Sparkles size={14}/><span>{x}</span><ChevronRight size={14}/></button>)}<button type="button" className="csp-ai-footer" onClick={()=>onAction?.(zone,"ask-ai")}>Ask Daenem AI Anything <ChevronRight size={14}/></button></article>;
  if (zone==='weather') return <article className="csp-card csp-weather" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-more")}>View More</button></header><div><CloudSun size={48}/><span><b>{fixture.weather.city}</b><strong>{fixture.weather.tempC}°C</strong><small>{fixture.weather.condition}</small></span></div><footer><span>Humidity {fixture.weather.humidity}%</span><span>Wind {fixture.weather.windKph} km/h</span><span>UV {fixture.weather.uv}</span></footer></article>;
  if (zone==='world-time') return <article className="csp-card csp-world" data-zone={zone}><header><span><Globe2 size={17}/><b>{title}</b></span></header><div>{fixture.worldTimes.map(x=><span key={x.city}><small>{x.city}</small><b>{x.time}</b><em>{x.date}</em></span>)}</div></article>;
  if (zone==='tasks') return <article className="csp-card csp-list" data-zone={zone}><header><span><ListChecks size={17}/><b>{title}</b></span><em>{fixture.tasks.length}</em></header>{fixture.tasks.map(t=><div key={t.title}><input type="checkbox" aria-label={t.title}/><span><b>{t.title}</b><small>{t.meta}</small></span><em className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</em></div>)}</article>;
  if (zone==='approvals') return <article className="csp-card csp-list" data-zone={zone}><header><span><CheckCircle2 size={17}/><b>{title}</b></span><em>{fixture.approvals.length}</em></header>{fixture.approvals.map(a=><div key={a.title}><span><b>{a.title}</b><small>{a.meta}</small></span><em className="approval-status">{a.status}</em></div>)}</article>;
  if (zone==='activity') return <article className="csp-card csp-list" data-zone={zone}><header><span><Activity size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{fixture.activity.map((a,i)=><div key={a.title}><span className="csp-activity-avatar">{i+1}</span><span><b>{a.title}</b><small>{a.meta}</small></span></div>)}</article>;
  if (zone==='quick-actions') return <article className="csp-card csp-actions" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"customize")}>Customize</button></header><div>{[['Create Project',Plus],['Add Staff',Users],['New Document',FileText],['Request Approval',CheckCircle2],['Run Report',BarChart3],['Open Knowledge',BookOpen]].map(([x,I])=>{const Icon=I as typeof Plus;return <button type="button" key={x as string} onClick={()=>onAction?.(zone,String(x).toLowerCase().replaceAll(" ","-"))}><Icon size={17}/>{x as string}</button>})}</div></article>;
  if (zone==='knowledge') return <article className="csp-card csp-list" data-zone={zone}><header><span><BookOpen size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{['Expense Claims Policy','Onboarding Guide','IT Support & Systems','Project Management Playbook'].map(x=><div key={x}><FileText size={15}/><span><b>{x}</b><small>Updated Reference</small></span><ChevronRight size={14}/></div>)}</article>;
  if (zone==='status') return <article className="csp-card csp-status" data-zone={zone}><header><span><ShieldCheck size={17}/><b>{title}</b></span><em>{fixture.kpis[4]?.value ?? 'Not Available'} Uptime</em></header>{['Core Platform','File Storage','Authentication','Email Services'].map(x=><div key={x}><i/><b>{x}</b><span>Operational</span></div>)}</article>;
  if (zone==='announcement') return <article className="csp-card csp-announcement" data-zone={zone}><Bell size={20}/><div><small>NEW · {title}</small><b>Latest Update From {fixture.workspace.name}</b><span>{fixture.dateTime.date} · {fixture.dateTime.zone}</span></div><ChevronRight size={18}/></article>;
  if (zone==='bento-strategy') return <BentoStrategy fixture={fixture} onAction={onAction}/>;
  if (zone==='operations-team' || zone==='focus-progress') { const metrics=[fixture.kpis[2],fixture.kpis[0],null,fixture.kpis[4]]; const visualProgress=[84,72,58,92]; return <article className="csp-card csp-progress" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{zone==='focus-progress' && <div className="csp-focus-summary"><span className="csp-focus-meter" aria-hidden="true"><b>Not Available</b><small>Progress</small></span><span><b>Focus Progress</b><small>Authorized Progress Data</small></span></div>}{['Project Completion','Team Productivity','Customer Satisfaction','Operational Health'].map((x,i)=><div key={x}><span><b>{x}</b><small>{metrics[i]?.value ?? 'Not Available'}</small></span><progress max="100" value={visualProgress[i]} aria-hidden="true"/></div>)}</article>; }
  if (zone==='focus-priorities') return <article className="csp-card csp-priority-stream" data-zone={zone}><header><div><span className="csp-eyebrow">MY PRIORITIES</span><h2>{title}</h2></div><button type="button" className="primary" onClick={()=>onAction?.(zone,"add")}><Plus size={14}/> Add</button></header>{fixture.tasks.map((t,i)=><button type="button" key={t.title} onClick={()=>onAction?.(zone,"open-task")}><span className="csp-check">{i===0?'✓':''}</span><span><b>{t.title}</b><small>{t.meta}</small></span><em className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</em><ChevronRight size={14}/></button>)}</article>;
  if (zone==='studio-toolbox') return <article className="csp-card csp-toolbox" data-zone={zone}><header><b>{title}</b><MoreHorizontal size={17}/></header>{['Data Source','Data Table','Chart / Graph','KPI Card','AI Insights','Live Data','Workflow Step','Condition','Scheduler','Approval','Notification','Integration'].map((x,i)=><button type="button" key={x} onClick={()=>onAction?.(zone,"tool-"+x.toLowerCase().replaceAll(" ","-").replaceAll("/","-"))}><span>{i<6?'◫':'◆'}</span>{x}</button>)}</article>;
  return <article className="csp-card" data-zone={zone}><header><b>{title}</b></header></article>;
}

export function CanonicalDashboard({ initialLayout='executive-command', fixture=CANONICAL_VISUAL_FIXTURE, liveSlots, onLayoutChange, onWorkspace, onSearch, onAskAi, onQuickCreate, onNotifications, onProfile, navigation, activeNavigationId, onZoneAction }: CanonicalDashboardProps) {
  const [layoutId, setLayoutId] = useState<StaffPortalLayoutId>(initialLayout);
  useEffect(() => { setLayoutId(initialLayout); }, [initialLayout]);
  const spec = CANONICAL_LAYOUT_SPECS[layoutId];
  const setLayout = (id: StaffPortalLayoutId) => { setLayoutId(id); onLayoutChange?.(id); };
  const style = useMemo(()=>({ '--csp-wide-rows': spec.wideRowMinimums.map(h=>`minmax(${h}px, auto)`).join(' '), '--csp-desktop-areas': spec.desktopGridAreas.map(x=>`\"${x}\"`).join(' '), '--csp-tablet-areas': spec.tabletGridAreas.map(x=>`\"${x}\"`).join(' ') }) as CSSProperties,[spec]);
  return <div className={`csp-root csp-layout-${layoutId} csp-nav-${spec.navMode}`} data-canonical-staffportal-dashboard data-layout-id={layoutId} style={style}>
    <TopBar fixture={fixture} layoutId={layoutId} onLayoutChange={setLayout} onWorkspace={onWorkspace} onSearch={onSearch} onAskAi={onAskAi} onQuickCreate={onQuickCreate} onNotifications={onNotifications} onProfile={onProfile}/>
    <SideNav layoutId={layoutId} navigation={navigation} activeNavigationId={activeNavigationId}/>
    <main className="csp-content">
      <div className="csp-grid">
        {spec.zones.includes('hero') && ((liveSlots && Object.prototype.hasOwnProperty.call(liveSlots,'hero')) ? liveSlots.hero : <CanonicalHero fixture={fixture} layoutId={layoutId}/>)}
        {spec.zones.filter(z=>z!=='hero').map(zone=><div className="csp-zone" data-zone-shell={zone} style={{gridArea:zone,order:spec.mobileOrder.indexOf(zone)}} key={zone}>{(liveSlots && Object.prototype.hasOwnProperty.call(liveSlots,zone)) ? liveSlots[zone] : <ZoneCard zone={zone} fixture={fixture} onAction={onZoneAction}/>}</div>)}
      </div>
    </main>
  </div>;
}
