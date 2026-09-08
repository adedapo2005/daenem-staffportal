import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpen, Bot, BriefcaseBusiness, CalendarDays, CheckCircle2,
  ChevronDown, ChevronRight, CircleDollarSign, CloudSun, Command, Crown, FileText, Gauge, Globe2, Grid3X3, LayoutDashboard,
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
  ['Finance & Revenue', CircleDollarSign], ['Customers & Partners', Users], ['Approvals', ListChecks], ['Documents', FileText], ['Knowledge Hub', BookOpen],
  ['AI & Automation', Bot], ['Reports & Analytics', BarChart3], ['Tools & Integrations', Workflow], ['Settings', Settings2],
] as const;

const workspaceCanvasNav = [
  ['Home', LayoutDashboard], ['Workspace', Grid3X3], ['People', Users], ['Projects', BriefcaseBusiness],
  ['Tasks', ListChecks], ['Approvals', CheckCircle2], ['Documents', FileText], ['Knowledge', BookOpen],
  ['Apps', Grid3X3], ['Reports', BarChart3], ['More', MoreHorizontal],
] as const;

const zoneTitles: Partial<Record<CanonicalZoneId, string>> = {
  'executive-analytics': 'Revenue & Operations', 'workspace-schedule': 'My Schedule', 'workspace-projects': 'Featured Projects',
  'operations-map': 'Global Operations Map', 'operations-team': 'Team Operations', 'insight-story': 'Latest Insights',
  'master-list': 'Authorized Records', 'master-detail': 'Selected Record', 'horizon-global': 'Global Operations',
  'bento-strategy': 'Strategic Priorities', 'focus-progress': 'Today’s Progress', 'focus-priorities': 'Today’s Priorities',
  'studio-toolbox': 'Toolbox', 'studio-canvas': 'Sales Performance View', 'board-trend': 'Board Signals & Trends',
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

// Existing approved/reference-image-derived photography is used only as a
// decorative atmosphere layer. It never supplies labels, metrics, records or
// any other business truth.
const heroPhotoPaths: Record<StaffPortalLayoutId, string> = {
  'executive-command': '/reference-images/signin/daylight-glass-skyline.webp',
  'workspace-canvas': '/reference-images/signin/future-technology-campus.webp',
  'operational-cockpit': '/reference-images/signin/daylight-technology-campus.webp',
  'insight-magazine': '/reference-images/signin/bright-executive-global-atrium.webp',
  'master-detail-workspace': '/reference-images/signin/premium-connected-workspace.webp',
  'horizon-wide': '/reference-images/signin/daylight-glass-skyline.webp',
  'adaptive-bento': '/reference-images/signin/future-technology-campus.webp',
  'focus-flow': '/reference-images/signin/daylight-glass-skyline.webp',
  'enterprise-studio': '/reference-images/signin/daylight-glass-skyline.webp',
  'board-pulse': '/reference-images/signin/daylight-glass-skyline.webp',
};

const heroSignals: Record<StaffPortalLayoutId, { signal: string[]; quote: string }> = {
  'executive-command': { signal: ['Build People', 'Create Opportunities', 'Make A Lasting Impact'], quote: '“Great organisations are built by great people.”' },
  'workspace-canvas': { signal: ['Good People', 'Great Possibilities'], quote: '“Your work, your way.”' },
  'operational-cockpit': { signal: ['Operational Excellence Today', 'A Brighter Tomorrow'], quote: '“People in motion. Progress in real time.”' },
  'insight-magazine': { signal: ['Progress Through People', 'Ideas In Motion'], quote: '“Perspectives. Ideas. People. Progress.”' },
  'master-detail-workspace': { signal: ['Connected Workspaces', 'Focused Action'], quote: '“Browse, focus and take action.”' },
  'horizon-wide': { signal: ['One Connected World', 'A Wider View'], quote: '“Global intelligence, one panoramic workspace.”' },
  'adaptive-bento': { signal: ['People', 'Purpose', 'Possibilities'], quote: '“Progress happens when we align.”' },
  'focus-flow': { signal: ['Make Today Count', 'One Step At A Time'], quote: '“Focus creates forward motion.”' },
  'enterprise-studio': { signal: ['Connect', 'Analyse', 'Automate'], quote: '“A smarter organisation starts here.”' },
  'board-pulse': { signal: ['Clear Signals', 'Bold Decisions'], quote: '“A clearer tomorrow, through bolder decisions.”' },
};

function TopBar({ fixture, layoutId, onLayoutChange, onWorkspace, onSearch, onAskAi, onQuickCreate, onNotifications, onProfile }: { fixture: CanonicalFixture; layoutId: StaffPortalLayoutId; onLayoutChange: (id: StaffPortalLayoutId) => void; onWorkspace?: () => void; onSearch?: (query?:string)=>void; onAskAi?:()=>void; onQuickCreate?:()=>void; onNotifications?:()=>void; onProfile?:()=>void }) {
  const [query,setQuery] = useState('');
  return <header className="csp-topbar" data-canonical-topbar>
    <div className="csp-brand"><span className="csp-brand-mark"><img src="/brand-assets/logo-mark.svg" alt="" /></span><span><b>STAFFPORTAL.DAENEM.COM</b><small>People · Systems · A Stronger Tomorrow</small></span></div>
    <button type="button" className="csp-workspace" onClick={onWorkspace}><BriefcaseBusiness size={16}/><span><b>{fixture.workspace.name}</b><small>{fixture.workspace.subtitle}</small></span></button>
    <form className="csp-search" role="search" onSubmit={(event)=>{event.preventDefault();onSearch?.(query)}}><Search size={17}/><span className="csp-search-mobile-placeholder" aria-hidden="true">Search Staff Portal</span><input aria-label="Search Staff Portal" placeholder="Search People, Documents, Projects, Anything..." value={query} onChange={(event)=>setQuery(event.target.value)}/><kbd>⌘ K</kbd></form>
    <div className="csp-top-actions">
      {onAskAi && <button type="button" className="csp-ai" onClick={onAskAi}><Sparkles size={16}/> Ask Daenem AI</button>}
      <button type="button" className="csp-create" aria-label="Quick Create" onClick={onQuickCreate}><Plus size={16}/><span className="csp-create-label">Quick Create</span>{(layoutId === 'executive-command' || layoutId === 'workspace-canvas') && <ChevronDown size={14} aria-hidden="true"/>}</button>
      <button type="button" className="csp-icon" aria-label="Notifications" onClick={onNotifications}><Bell size={17}/><i>3</i></button>
      <span className="csp-weather-chip"><CloudSun size={18}/><span><b>{layoutId === 'executive-command' ? fixture.weather.city : (fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`)}</b><small>{layoutId === 'executive-command' ? (fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C · ${fixture.weather.condition}`) : fixture.weather.city}</small></span></span>
      <FreshnessStatus sync={fixture.sync} variant="topbar"/>
      <span className="csp-release"><b>{fixture.release.version}</b><small>{fixture.release.label}</small></span>
      <label className="csp-layout-select"><Grid3X3 size={16}/><span className="csp-layout-current" aria-hidden="true">{CANONICAL_LAYOUT_SPECS[layoutId].name}</span><select aria-label="Dashboard Layout" value={layoutId} onChange={(e)=>onLayoutChange(e.target.value as StaffPortalLayoutId)}>{CANONICAL_LAYOUT_IDS.map((id)=><option key={id} value={id}>{CANONICAL_LAYOUT_SPECS[id].name}</option>)}</select></label>
      <button type="button" className="csp-profile" onClick={onProfile} aria-label={`Open Profile For ${formatPersonName(fixture.viewer.displayName)}`}><span className="csp-avatar">{initialsFromPersonName(fixture.viewer.displayName)}</span><span className="csp-profile-copy"><b>{formatPersonName(fixture.viewer.displayName)}</b><small>{formatUiLabel(fixture.viewer.role)}</small></span></button>
    </div>
  </header>;
}

function SideNav({ layoutId, navigation, activeNavigationId }: { layoutId: StaffPortalLayoutId; navigation?: CanonicalNavigationItem[]; activeNavigationId?: string }) {
  // An explicitly empty authorized navigation list must stay empty.
  const workspace = layoutId === 'workspace-canvas';
  const defaultItems = workspace ? workspaceCanvasNav : nav;
  const items: CanonicalNavigationItem[] = navigation !== undefined ? navigation : defaultItems.map(([label, Icon]) => ({ id: label, label, icon: Icon }));
  return <aside className="csp-sidebar" data-canonical-sidebar>
    <div className="csp-sidebar-title"><Command size={18}/><span><b>{CANONICAL_LAYOUT_SPECS[layoutId].name}</b><small>Selectable Premium Layout</small></span></div>
    <nav>{items.map((item,index)=>{const Icon=item.icon || LayoutDashboard;const active=activeNavigationId ? item.id===activeNavigationId : workspace && navigation===undefined ? index===1 : index===0;return <button type="button" key={item.id} className={active?'active':''} onClick={item.onSelect} aria-label={formatUiLabel(item.label)} aria-current={active?'page':undefined}><Icon size={17}/><span>{formatUiLabel(item.label)}</span>{item.badge && <em>{item.badge}</em>}</button>})}</nav>
    <div className="csp-purpose"><span>{workspace ? 'Build' : 'One Team'}</span><b>{workspace ? <>Create<br/>Grow<br/>Together.</> : 'A Brighter Tomorrow'}</b><small>{workspace ? 'Good People · Great Possibilities' : 'Build · Empower · Grow'}</small><ChevronRight size={18}/></div>
    {workspace && <div className="csp-workspace-side-brand"><Command size={18}/><span><b>Daenem Global</b><small>A Brighter Tomorrow</small></span></div>}
  </aside>;
}

function ExecutiveHero({ fixture }: { fixture: CanonicalFixture }) {
  const viewerName = formatPersonName(fixture.viewer.displayName);
  return <section className="csp-hero csp-executive-hero" data-zone="hero">
    <div className="csp-executive-hero-art" aria-hidden="true"><img src="/canonical-postauth-v3/executive-command/hero-skyline-owner.svg" alt=""/></div>
    <div className="csp-hero-copy csp-executive-hero-copy">
      <h1><span>Good Morning,</span><strong>{viewerName}<Crown size={25} aria-hidden="true"/></strong></h1>
      <p>Here’s What’s Happening Across Your Organisation Today.</p>
      <em className="csp-hero-quote">“Great Organisations Are Built By Great People.”</em>
    </div>
    <div className="csp-executive-signal" aria-hidden="true"><b>Build People</b><b>Create Opportunities</b><b>Make A Lasting Impact</b><i/></div>
    <div className="csp-clock csp-executive-clock"><small>{fixture.dateTime.date}</small><strong>{fixture.dateTime.time}</strong><span>{fixture.dateTime.zone}</span></div>
    <div className="csp-executive-orbs" aria-hidden="true"><Globe2 className="orb-small"/><Globe2 className="orb-large"/><span>A More Connected<br/>Brighter Tomorrow</span></div>
  </section>;
}

function WorkspaceHero({ fixture, onLayoutChange }: { fixture: CanonicalFixture; onLayoutChange?: (id: StaffPortalLayoutId)=>void }) {
  const choices: { id: StaffPortalLayoutId; label: string }[] = [
    { id: 'executive-command', label: 'Executive Command' },
    { id: 'workspace-canvas', label: 'Workspace Canvas' },
    { id: 'master-detail-workspace', label: 'Project Hub' },
    { id: 'insight-magazine', label: 'Analytics Center' },
  ];
  return <section className="csp-hero csp-workspace-hero" data-zone="hero">
    <img className="csp-workspace-hero-image" src="/canonical-postauth-v3/workspace-canvas/hero-panorama-owner-v1.webp" alt="" aria-hidden="true"/>
    <div className="csp-workspace-hero-wash" aria-hidden="true"/>
    <div className="csp-workspace-hero-copy"><h1>Workspace Canvas</h1><p>Your Work, Your Way. Organise. Collaborate. Make An Impact.</p></div>
    <span className="csp-workspace-signal" aria-hidden="true"><b>Good People</b><em>Greater Possibilities</em></span>
    <div className="csp-workspace-time"><small>{fixture.dateTime.date}</small><strong>{fixture.dateTime.time}</strong><span>{fixture.dateTime.zone}</span></div>
    <div className="csp-workspace-orbs" aria-hidden="true"><Globe2/><Globe2/><span>A More Connected<br/>Brighter Tomorrow</span></div>
    <section className="csp-workspace-layout-chooser" aria-label="Dashboard Layout">
      <header><b>Layout</b></header>
      <div>{choices.map(({id,label})=><button type="button" className={id==='workspace-canvas'?'active':''} key={id} onClick={()=>onLayoutChange?.(id)} aria-label={`Switch To ${label}`} aria-pressed={id==='workspace-canvas'}><Grid3X3 size={17}/><span>{label}</span></button>)}</div>
    </section>
  </section>;
}

export function CanonicalHero({ fixture, layoutId, onLayoutChange }: { fixture: CanonicalFixture; layoutId: StaffPortalLayoutId; onLayoutChange?: (id: StaffPortalLayoutId)=>void }) {
  if (layoutId === 'executive-command') return <ExecutiveHero fixture={fixture}/>;
  if (layoutId === 'workspace-canvas') return <WorkspaceHero fixture={fixture} onLayoutChange={onLayoutChange}/>;
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
  const heroDetail = heroSignals[layoutId];
  return <section className="csp-hero" data-zone="hero">
    <div className="csp-hero-copy"><span className="csp-eyebrow">{CANONICAL_LAYOUT_SPECS[layoutId].name.toUpperCase()}</span><h1>{heroTitle}</h1><p>{copy[layoutId][1]}</p><em className="csp-hero-quote">{heroDetail.quote}</em><small>People. Progress. A Brighter Tomorrow.</small></div>
    <div className="csp-hero-scene" style={{ '--csp-hero-photo': `url("${heroPhotoPaths[layoutId]}")` } as CSSProperties} aria-hidden="true"><img className="csp-hero-artwork" src={heroArtworkPaths[layoutId]} alt=""/><span className="csp-hero-signal">{heroDetail.signal.map((line) => <b key={line}>{line}</b>)}</span><i className="csp-hero-glass"/></div>
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
  return <svg className="csp-chart" viewBox="0 0 640 220" role="img" aria-label="Decorative reference trend geometry; live series unavailable"><defs><linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".24"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><path d="M20 178 C90 165 125 142 170 147 S250 115 300 120 S385 76 430 92 S520 55 610 42 L610 210 L20 210 Z" fill={`url(#${chartId})`}/><path d="M20 178 C90 165 125 142 170 147 S250 115 300 120 S385 76 430 92 S520 55 610 42" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><g fill="currentColor">{[[20,178],[170,147],[300,120],[430,92],[610,42]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="5"/>)}</g></svg>;
}

function StudioNode({ className, label, detail, tone }: { className: string; label: string; detail: string; tone: 'violet' | 'blue' | 'cyan' | 'success' }) {
  return <div className={`node ${className} node-${tone}`}><span className="csp-node-type"><i aria-hidden="true" />AUTHORIZED SURFACE</span><b>{label}</b><small>{detail}</small></div>;
}

function StrategicTrends({ fixture }: { fixture: CanonicalFixture }) {
  const metrics = [fixture.kpis[2], fixture.kpis[0], fixture.kpis[4]].filter(Boolean);
  return <section className="csp-trends-panel" aria-label="Strategic Trends">
    <header><span><Sparkles size={17}/><b>Strategic Trends</b></span><button type="button">Last 6 Months <ChevronRight size={14}/></button></header>
    <div className="csp-trend-metrics">{metrics.map((metric)=><span key={metric.label}><i aria-hidden="true"><BarChart3 size={13}/></i><small>{metric.label}</small><strong data-canonical-metric="true" data-numeric={/\d/.test(metric.value) ? 'true' : 'false'}>{metric.value}</strong></span>)}</div>
    <div className="csp-trend-visual csp-executive-trend-visual" aria-label="Decorative strategic trend geometry; live series unavailable">
      <span className="csp-executive-chart-axis" aria-hidden="true"><i>High</i><i>Mid</i><i>Base</i></span>
      <svg viewBox="0 0 410 142" aria-hidden="true">
        <path d="M16 103C65 102 88 95 120 91S175 72 210 70s62 2 92-9 54-14 92-19"/>
        <path className="line-violet" d="M16 121C66 111 90 95 124 91s55 5 88 0 58-11 91-15 57-7 91-14"/>
        <path className="line-gold" d="M16 126c52-12 82-15 119-17s55-7  91-10 59-12 91-17 53-5 77-11"/>
        <g className="csp-trend-points line-blue-points">{[[16,103],[120,91],[210,70],[302,61],[394,42]].map(([x,y])=><circle key={`b-${x}`} cx={x} cy={y} r="3"/>)}</g>
        <g className="csp-trend-points line-violet-points">{[[16,121],[124,91],[212,91],[303,76],[394,62]].map(([x,y])=><circle key={`v-${x}`} cx={x} cy={y} r="3"/>)}</g>
        <g className="csp-trend-points line-gold-points">{[[16,126],[135,109],[226,99],[317,82],[394,71]].map(([x,y])=><circle key={`g-${x}`} cx={x} cy={y} r="3"/>)}</g>
      </svg>
    </div>
    <footer><span><i className="dot-blue"/>Active Projects</span><span><i className="dot-violet"/>Total Staff</span><span><i className="dot-gold"/>System Uptime</span></footer>
  </section>;
}

function ExecutiveRevenuePanel({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const metric = fixture.kpis[1];
  return <article className="csp-card csp-analytics csp-executive-revenue">
    <header><span><BarChart3 size={17}/><b>Revenue &amp; Operations</b></span><button type="button" onClick={()=>onAction?.('executive-analytics','change-period')}>Last 6 Months <ChevronRight size={14}/></button></header>
    <div className="csp-executive-tabs" role="tablist" aria-label="Revenue and operations views">
      {['Revenue','Projects','Staff','Operations'].map((tab,index)=><button type="button" role="tab" aria-selected={index===0} className={index===0?'active':''} key={tab} onClick={()=>onAction?.('executive-analytics',`view-${tab.toLowerCase()}`)}>{tab}</button>)}
    </div>
    <div className="csp-analytics-metric"><strong data-canonical-metric="true" data-numeric={/\d/.test(metric?.value ?? '') ? 'true' : 'false'}>{metric?.value ?? 'Not Available'}</strong><span>{metric?.delta ?? 'Not Available'}</span><small>{metric?.meta ?? 'Waiting For Live Data'}</small></div>
    <div className="csp-executive-revenue-chart" aria-label="Decorative revenue trend geometry; live series unavailable">
      <span className="csp-executive-chart-axis" aria-hidden="true"><i>High</i><i>Mid</i><i>Base</i></span>
      <svg viewBox="0 0 430 142" aria-hidden="true">
        <defs><linearGradient id="executive-revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f6ff1" stopOpacity=".25"/><stop offset="1" stopColor="#2f6ff1" stopOpacity="0"/></linearGradient></defs>
        <path className="area" d="M16 112C52 107 77 100 105 104s55-27 91-22 54 3 89-9 55-22 85-17 40-3 48-20v101H16Z"/>
        <path className="line" d="M16 112C52 107 77 100 105 104s55-27 91-22 54 3 89-9 55-22 85-17 40-3 48-20"/>
        <g>{[[16,112],[105,104],[196,82],[285,73],[370,56],[418,36]].map(([x,y])=><circle key={x} cx={x} cy={y} r="3.5"/>)}</g>
      </svg>
      <span className="csp-executive-chart-tooltip"><small>Authorized Signal</small><b>{metric?.value ?? 'Not Available'}</b><em>{metric?.delta ?? 'Not Available'}</em></span>
    </div>
    <footer><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></footer>
  </article>;
}

function ExecutiveAnalyticsPair({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <section className="csp-executive-analytics-pair" data-zone="executive-analytics">
    <ExecutiveRevenuePanel fixture={fixture} onAction={onAction}/>
    <article className="csp-card csp-analytics csp-executive-trends"><StrategicTrends fixture={fixture}/></article>
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

function BoardPillarsSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const pillars = [
    { label: fixture.kpis[0]?.label ?? 'People & Capability', value: fixture.kpis[0]?.value ?? 'Not Available', tone: 'blue' },
    { label: fixture.kpis[2]?.label ?? 'Portfolio Signal', value: fixture.kpis[2]?.value ?? 'Not Available', tone: 'violet' },
    { label: fixture.kpis[1]?.label ?? 'Financial Signal', value: fixture.kpis[1]?.value ?? 'Not Available', tone: 'cyan' },
    { label: fixture.kpis[4]?.label ?? 'Enterprise Health', value: fixture.kpis[4]?.value ?? 'Not Available', tone: 'gold' },
  ] as const;
  return <article className="csp-card csp-board-pillars" data-zone="bento-strategy">
    <header><span><Sparkles size={18}/><b>Strategic Pillars Progress</b></span><button type="button" onClick={()=>onAction?.('bento-strategy','view-all')}>View All</button></header>
    <div className="csp-board-pillars-list">{pillars.map((pillar,index)=><button type="button" key={pillar.label} onClick={()=>onAction?.('bento-strategy','open-pillar')}><span className={`csp-board-pillar-icon ${pillar.tone}`} aria-hidden="true"><i/></span><span><b>{pillar.label}</b><small>Authorized signal · detail Not Available</small><span className={`csp-decorative-track csp-board-pillar-track p${index}`} aria-hidden="true"><i className="csp-decorative-fill"/></span></span><strong data-canonical-metric="true" data-numeric={/\d/.test(pillar.value) ? 'true' : 'false'}>{pillar.value}</strong></button>)}</div>
  </article>;
}

function BoardAgendaSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const signals = fixture.approvals.slice(0, 3);
  const agenda = fixture.activity.slice(0, 3);
  return <article className="csp-card csp-board-agenda" data-zone="board-agenda">
    <header><span><CalendarDays size={17}/><b>Board Agenda</b></span><button type="button" onClick={()=>onAction?.('board-agenda','view-all')}>View All</button></header>
    <div className="csp-board-scope-strip" aria-label="Board scope summary">
      <span><small>Risk Posture</small><b>Not Available</b></span>
      <span><small>Decision Queue</small><b>{signals.length ? 'Authorized' : 'Not Available'}</b></span>
      <span><small>Agenda Source</small><b>{agenda.length ? 'Authorized Activity' : 'Not Available'}</b></span>
    </div>
    <div className="csp-board-agenda-grid">
      <section><span className="csp-board-kicker">Decision Signals</span>{signals.map((item)=><button type="button" key={item.title} onClick={()=>onAction?.('board-agenda','open-decision')}><span><b>{item.title}</b><small>{item.meta}</small></span><em className={`approval-status ${item.status.toLowerCase().replaceAll(' ','-')}`}>{item.status}</em></button>)}</section>
      <section><span className="csp-board-kicker">Agenda Rhythm</span>{agenda.map((item)=><div key={item.title}><span><b>{item.title}</b><small>{item.meta}</small></span><ChevronRight size={14}/></div>)}</section>
    </div>
  </article>;
}

const studioToolGroups = [
  { label: 'Data & Content', icon: '◫', items: ['Data Source', 'Data Table', 'Live Data', 'Integration'] },
  { label: 'Visuals & Analysis', icon: '◇', items: ['Chart / Graph', 'KPI Card', 'AI Insights', 'Condition'] },
  { label: 'Workflow & Delivery', icon: '◆', items: ['Workflow Step', 'Scheduler', 'Approval', 'Notification'] },
] as const;

const singleAnalyticsTitles: Partial<Record<StaffPortalLayoutId, string>> = {
  'operational-cockpit': 'Operational Performance',
  'insight-magazine': 'Data Story',
  'horizon-wide': 'Enterprise Performance',
  'adaptive-bento': 'Revenue & Operations',
  'enterprise-studio': 'Live Metrics',
  'board-pulse': 'Executive Signals',
};

function SingleAnalyticsSurface({ zone, title, fixture, onAction, layoutId }: { zone: CanonicalZoneId; title: string; fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void; layoutId: StaffPortalLayoutId }) {
  return <article className={`csp-card csp-analytics csp-analytics-single csp-analytics-single-${layoutId}`} data-zone={zone}>
    <section className="csp-revenue-panel">
      <header><span><BarChart3 size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"change-period")}>Last 6 Months <ChevronRight size={14}/></button></header>
      <div className="csp-analytics-metric"><strong data-canonical-metric="true" data-numeric={/\d/.test(fixture.kpis[1]?.value ?? '') ? 'true' : 'false'}>{fixture.kpis[1]?.value ?? 'Not Available'}</strong><span>{fixture.kpis[1]?.delta ?? 'Not Available'}</span><small>{fixture.kpis[1]?.meta ?? 'Waiting For Live Data'}</small></div>
      <div className="csp-analytics-visual"><MiniLineChart chartId={`${zone}-${layoutId}-single-fill`}/><span className="csp-analytics-grid" aria-hidden="true"/></div>
      <footer><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></footer>
    </section>
  </article>;
}

function OperationalSignals({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <article className="csp-card csp-operations-signals" data-zone="ai-insights">
    <header><span><AlertTriangle size={18}/><b>Live Incidents &amp; Alerts</b></span><em>Authorized</em></header>
    <div className="csp-signal-availability"><small>Incident feed</small><b>Not Available</b><span>Authorized incident data not available</span></div>
    <div className="csp-signal-list"><span className="csp-signal-kicker">Recent Authorized Activity</span>{fixture.activity.slice(0, 4).map((item)=><button type="button" key={item.title} onClick={()=>onAction?.('ai-insights','open-signal')}><Activity size={14}/><span><b>{item.title}</b><small>{item.meta}</small></span><ChevronRight size={14}/></button>)}</div>
  </article>;
}

function ExecutiveAiInsights({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const rows = [
    { label: (fixture.kpis[1]?.label ?? 'Revenue') + ' Signal', detail: (fixture.kpis[1]?.value ?? 'Not Available') + ' · ' + (fixture.kpis[1]?.delta ?? 'Not Available'), icon: BarChart3, tone: 'blue' },
    { label: 'Review Pending Requests', detail: fixture.approvals.length + ' Authorized Requests', icon: CheckCircle2, tone: 'gold' },
    { label: 'Task Priorities Available', detail: fixture.tasks.length + ' Authorized Tasks', icon: Users, tone: 'violet' },
    { label: 'Recent Activity Available', detail: fixture.activity[0]?.meta ?? 'Not Available', icon: FileText, tone: 'coral' },
    { label: fixture.kpis[4]?.label ?? 'System Status', detail: (fixture.kpis[4]?.value ?? 'Not Available') + ' · ' + (fixture.kpis[4]?.meta ?? 'Not Available'), icon: ShieldCheck, tone: 'cyan' },
  ];
  return <article className="csp-card csp-ai-card csp-executive-ai" data-zone="ai-insights">
    <header><span><Sparkles size={18}/><b>Daenem AI Insights</b></span><em>BETA</em></header>
    <div className="csp-executive-ai-rows">{rows.map((row)=>{const Icon=row.icon;return <button type="button" key={row.label} onClick={()=>onAction?.('ai-insights','open-insight')}><i className={'tone-' + row.tone} aria-hidden="true"><Icon size={16}/></i><span><b>{row.label}</b><small>{row.detail}</small></span><ChevronRight size={14}/></button>})}</div>
    <button type="button" className="csp-ai-footer" onClick={()=>onAction?.('ai-insights','ask-ai')}><Sparkles size={14}/> Ask Daenem AI Anything <ChevronRight size={14}/></button>
  </article>;
}

function ExecutiveWeather({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const temperature = fixture.weather.tempC === null ? 'Not Available' : fixture.weather.tempC + '°C';
  return <article className="csp-card csp-weather csp-executive-weather" data-zone="weather">
    <header><b>Today’s World</b><button type="button" onClick={()=>onAction?.('weather','view-more')}>View More</button></header>
    <div className="csp-executive-weather-current"><span><b>{fixture.weather.city}</b><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC === null ? 'false' : 'true'}>{temperature}</strong><small>{fixture.weather.condition}</small></span><i className="csp-executive-weather-art" aria-hidden="true"><CloudSun size={64}/></i></div>
    <div className="csp-executive-weather-details"><span>Humidity {fixture.weather.humidity}%</span><span>Wind {fixture.weather.windKph} km/h</span><span>UV {fixture.weather.uv}</span></div>
    <footer className="csp-executive-forecast">{['Next','Later','Tomorrow','Following'].map((label)=><span key={label}><small>{label}</small><CloudSun size={18} aria-hidden="true"/><b>Not Available</b></span>)}</footer>
  </article>;
}

function ExecutiveApprovals({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const approvals = Array.from({ length: 5 }, (_, index) => fixture.approvals[index] ?? null);
  return <article className="csp-card csp-list csp-executive-approvals" data-zone="approvals"><header><span><CheckCircle2 size={17}/><b>Pending Approvals</b></span><em>{fixture.approvals.length}</em></header>{approvals.map((approval,index)=><div key={approval?.title ?? 'approval-unavailable-' + index}><i className={'csp-executive-list-icon tone-' + (index % 2 ? 'gold' : 'coral')} aria-hidden="true"><CheckCircle2 size={14}/></i><span><b>{approval?.title ?? 'Not Available'}</b><small>{approval?.meta ?? 'Authorized Approval Unavailable'}</small></span>{approval ? <><em className="approval-status">{approval.status}</em><button type="button" aria-label={'Open ' + approval.title} onClick={()=>onAction?.('approvals','open-approval')}><ChevronRight size={13}/></button></> : <em className="approval-status">Not Available</em>}</div>)}</article>;
}

function ExecutiveActivity({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const icons = [FileText, ShieldCheck, Users, BarChart3];
  const tones = ['blue','cyan','violet','gold'];
  const activities = Array.from({ length: 5 }, (_, index) => fixture.activity[index] ?? null);
  return <article className="csp-card csp-list csp-executive-activity" data-zone="activity"><header><span><Activity size={17}/><b>Recent Activity</b></span><button type="button" onClick={()=>onAction?.('activity','view-all')}>View All</button></header>{activities.map((activity,index)=>{const Icon=icons[index % icons.length];return <div key={activity?.title ?? 'activity-unavailable-' + index}><i className={'csp-executive-list-icon tone-' + tones[index % tones.length]} aria-hidden="true"><Icon size={14}/></i><span><b>{activity?.title ?? 'Not Available'}</b><small>{activity?.meta ?? 'Authorized Activity Unavailable'}</small></span>{activity && <ChevronRight size={13}/>}</div>})}</article>;
}

function ExecutiveFooter({ fixture, onAction, onLayoutChange }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void; onLayoutChange?: (id: StaffPortalLayoutId)=>void }) {
  const choices: StaffPortalLayoutId[] = ['executive-command','workspace-canvas','operational-cockpit','insight-magazine'];
  return <article className="csp-executive-footer" data-zone="announcement">
    <button type="button" className="csp-executive-announcement" onClick={()=>onAction?.('announcement','open')}><Bell size={18}/><span><small>NEW · LATEST ANNOUNCEMENTS</small><b>Latest Update From {fixture.workspace.name}</b><em>{fixture.dateTime.date} · {fixture.dateTime.zone}</em></span><ChevronRight size={16}/></button>
    <section className="csp-executive-layout-identity"><Command size={22}/><span><b>Executive Command</b><small>Flagship Owner Command Surface</small></span></section>
    <section className="csp-executive-layout-chooser"><header><Grid3X3 size={15}/><b>Dashboard Layout</b></header><div>{choices.map((id)=><button type="button" className={id==='executive-command'?'active':''} key={id} onClick={()=>onLayoutChange?.(id)} aria-label={'Switch To ' + CANONICAL_LAYOUT_SPECS[id].name}><i aria-hidden="true"/><span>{CANONICAL_LAYOUT_SPECS[id].name}</span></button>)}</div></section>
  </article>;
}

function WorkspaceKpis({ fixture }: { fixture: CanonicalFixture }) {
  const metrics = [fixture.kpis[0], fixture.kpis[2], fixture.kpis[1], fixture.kpis[3]].filter(Boolean);
  return <section className="csp-kpis csp-workspace-kpis" data-zone="kpis">{metrics.map((metric,index)=><article key={metric.label} className={`tone-${metric.tone}`}>
    <KpiIcon label={metric.label}/><span className="csp-kpi-label">{metric.label}</span>
    <strong data-canonical-metric="true" data-numeric={/\d/.test(metric.value) ? 'true' : 'false'}>{metric.value}</strong>
    <span className="csp-workspace-kpi-trend"><b>{metric.delta}</b><small>{metric.meta}</small></span>
    <span className={`csp-workspace-kpi-bars bars-${index}`} aria-hidden="true">{[0,1,2,3,4].map((bar)=><i key={bar}/>)}</span>
  </article>)}</section>;
}

function WorkspaceQuickCommand({ onAction }: { onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const actions = [
    ['New Project', Plus], ['New Document', FileText], ['Assign Task', ListChecks],
    ['Request Approval', CheckCircle2], ['Book Meeting', CalendarDays], ['More Actions', MoreHorizontal],
  ] as const;
  return <article className="csp-card csp-workspace-command" data-zone="quick-actions">
    <header><span className="csp-workspace-command-icon"><Sparkles size={18}/></span><span><b>Quick Command</b><small>Get Things Done, Faster.</small></span></header>
    <div className="csp-workspace-command-actions">{actions.map(([label,Icon])=><button type="button" key={label} onClick={()=>onAction?.('quick-actions',label.toLowerCase().replaceAll(' ','-'))}><Icon size={14}/>{label}{label==='More Actions' && <ChevronDown size={12}/>}</button>)}</div>
    <form onSubmit={(event)=>{event.preventDefault();onAction?.('quick-actions','command')}}><Search size={15}/><input aria-label="Ask or type a command" placeholder="Ask or type a command..."/><button type="submit" aria-label="Run Command"><ChevronRight size={15}/></button></form>
  </article>;
}

function WorkspaceSchedule({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <article className="csp-card csp-workspace-schedule" data-zone="workspace-schedule">
    <header><span><CalendarDays size={17}/><b>My Schedule</b></span><button type="button" onClick={()=>onAction?.('workspace-schedule','view-calendar')}>View Calendar</button></header>
    <div className="csp-workspace-schedule-date"><b>{fixture.dateTime.date}</b><span><button type="button" aria-label="Previous Day" onClick={()=>onAction?.('workspace-schedule','previous-day')}><ChevronRight size={13}/></button><button type="button" aria-label="Next Day" onClick={()=>onAction?.('workspace-schedule','next-day')}><ChevronRight size={13}/></button><button type="button" onClick={()=>onAction?.('workspace-schedule','today')}>Today</button></span></div>
    <div className="csp-workspace-schedule-rows">{fixture.tasks.slice(0,4).map((task,index)=><button type="button" key={task.title} onClick={()=>onAction?.('workspace-schedule','open-item')}><i className={`tone-${index}`}/><small>{task.meta.split(' · ')[1] ?? task.meta}</small><span><b>{task.title}</b><em>{task.meta}</em></span></button>)}</div>
  </article>;
}

function WorkspaceProjects({ onAction }: { onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const cards = [
    { tone: 'mountain', detail: 'Authorized Project Data Unavailable' },
    { tone: 'campus', detail: 'Authorized Project Data Unavailable' },
    { tone: 'ai', detail: 'Authorized Project Data Unavailable' },
  ];
  return <article className="csp-card csp-workspace-projects" data-zone="workspace-projects">
    <header><span><BriefcaseBusiness size={17}/><b>Featured Projects</b></span><span><button type="button" onClick={()=>onAction?.('workspace-projects','view-all')}>View All</button><button type="button" aria-label="Previous Projects" onClick={()=>onAction?.('workspace-projects','previous')}><ChevronRight size={13}/></button><button type="button" aria-label="Next Projects" onClick={()=>onAction?.('workspace-projects','next')}><ChevronRight size={13}/></button></span></header>
    <div className="csp-workspace-project-grid">{cards.map((card)=><section key={card.tone} className={`project-${card.tone}`}>
      <span className="csp-workspace-project-art" aria-hidden="true"/>
      <div className="csp-workspace-project-title"><b>Not Available</b><em>Not Available</em></div>
      <small>{card.detail}</small>
      <span className="csp-workspace-project-track" aria-hidden="true"><i/></span>
      <footer><span>Progress <b>Not Available</b></span><button type="button" aria-label="Project Actions" onClick={()=>onAction?.('workspace-projects','project-actions')}><MoreHorizontal size={14}/></button></footer>
    </section>)}</div>
  </article>;
}

function WorkspaceTasks({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const today = fixture.tasks.filter((task)=>task.meta.includes('Today')).length;
  return <article className="csp-card csp-workspace-tasks" data-zone="tasks">
    <header><span><ListChecks size={17}/><b>My Tasks</b></span><button type="button" onClick={()=>onAction?.('tasks','view-all')}>View All</button></header>
    <div className="csp-workspace-task-tabs"><button type="button" className="active" onClick={()=>onAction?.('tasks','all')}>All ({fixture.tasks.length})</button><button type="button" onClick={()=>onAction?.('tasks','today')}>Today ({today})</button><button type="button" onClick={()=>onAction?.('tasks','overdue')}>Overdue (Not Available)</button></div>
    <div className="csp-workspace-task-rows">{fixture.tasks.map((task)=><label key={task.title}><input type="checkbox" aria-label={task.title}/><span><b>{task.title}</b><small>{task.meta}</small></span><em className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</em></label>)}</div>
  </article>;
}

function WorkspaceAi({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const insights = [
    { title: `${fixture.approvals.length} Approvals Need Your Attention`, detail: 'Authorized Approval Queue', tone: 'violet' },
    { title: `${fixture.tasks.filter((task)=>task.priority==='High').length} High-Priority Tasks Need Review`, detail: 'Authorized Task Context', tone: 'green' },
    { title: `${fixture.activity.length} Recent Activity Updates`, detail: 'Authorized Workspace Activity', tone: 'gold' },
    { title: `System Uptime ${fixture.kpis[4]?.value ?? 'Not Available'}`, detail: fixture.kpis[4]?.meta ?? 'Authorized System Context', tone: 'coral' },
  ];
  return <article className="csp-card csp-workspace-ai" data-zone="ai-insights">
    <header><span><Sparkles size={17}/><b>Daenem AI</b></span><span><em>BETA</em><button type="button" aria-label="AI Options" onClick={()=>onAction?.('ai-insights','options')}><MoreHorizontal size={14}/></button></span></header>
    <div className="csp-workspace-ai-greeting"><i aria-hidden="true"><Sparkles size={20}/></i><span><b>Good Morning, {formatPersonName(fixture.viewer.displayName)}!</b><small>Here Are Your Authorised Workspace Insights For Today.</small></span></div>
    <div className="csp-workspace-ai-rows">{insights.map((insight)=><button type="button" key={insight.title} onClick={()=>onAction?.('ai-insights','open-insight')}><i className={insight.tone}><Sparkles size={13}/></i><span><b>{insight.title}</b><small>{insight.detail}</small></span><ChevronRight size={13}/></button>)}</div>
    <button type="button" className="csp-workspace-ai-footer" onClick={()=>onAction?.('ai-insights','ask-ai')}><Sparkles size={14}/> Ask Daenem AI Anything</button>
  </article>;
}

function WorkspaceWorld({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <article className="csp-card csp-workspace-world" data-zone="world-time"><header><span><Globe2 size={17}/><b>Global Time</b></span><button type="button" onClick={()=>onAction?.('world-time','view-all')}>View All</button></header><div>{fixture.worldTimes.map((item,index)=><span key={item.city}><i aria-hidden="true">{['SG','GB','US','AU'][index] ?? '—'}</i><small>{item.city}</small><b>{item.time}</b><em>{item.date}</em></span>)}</div></article>;
}

function WorkspaceWeather({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const temperature = fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`;
  return <article className="csp-card csp-workspace-weather" data-zone="weather"><header><span><CloudSun size={17}/><b>Weather</b></span><button type="button" onClick={()=>onAction?.('weather','view-more')}>{fixture.weather.city}</button></header><div className="csp-workspace-weather-current"><CloudSun size={42}/><span><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC===null?'false':'true'}>{temperature}</strong><small>{fixture.weather.condition}</small></span></div><p>Humidity {fixture.weather.humidity}% · Wind {fixture.weather.windKph} km/h · UV {fixture.weather.uv}</p><footer>{['Next','Later','Tomorrow','Following'].map((label)=><span key={label}><small>{label}</small><CloudSun size={14}/><b>Not Available</b></span>)}</footer></article>;
}

function WorkspaceStatus({ fixture }: { fixture: CanonicalFixture }) {
  return <article className="csp-card csp-workspace-status" data-zone="status"><header><span><ShieldCheck size={17}/><b>System Status</b></span></header><div className="csp-workspace-status-summary"><CheckCircle2 size={19}/><span><small>Authorized Uptime</small><b>{fixture.kpis[4]?.value ?? 'Not Available'}</b></span></div>{['Core Platform','File Storage','Authentication','Email Services'].map((label)=><div className="csp-workspace-status-row" key={label}><i/><b>{label}</b><span>Not Available</span></div>)}</article>;
}

function WorkspaceApprovals({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <article className="csp-card csp-workspace-approvals" data-zone="approvals"><header><span><CheckCircle2 size={17}/><b>Approvals</b><em>{fixture.approvals.length}</em></span><button type="button" onClick={()=>onAction?.('approvals','view-all')}>View All</button></header><div>{fixture.approvals.slice(0,4).map((approval,index)=><section key={approval.title}><i className={`tone-${index}`}><CheckCircle2 size={13}/></i><span><b>{approval.title}</b><small>{approval.meta}</small></span><button type="button" onClick={()=>onAction?.('approvals','approve')}>Approve</button><button type="button" onClick={()=>onAction?.('approvals','decline')}>Decline</button></section>)}</div></article>;
}

function WorkspaceActivity({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const rows = Array.from({length:5},(_,index)=>fixture.activity[index] ?? null);
  return <article className="csp-card csp-workspace-activity" data-zone="activity"><header><b>Recent Activity</b><button type="button" onClick={()=>onAction?.('activity','view-all')}>View All</button></header><div>{rows.map((item,index)=><section key={item?.title ?? `unavailable-${index}`}><i className={`tone-${index}`} aria-hidden="true">{index+1}</i><span><b>{item?.title ?? 'Not Available'}</b><small>{item?.meta ?? 'Authorized Activity Unavailable'}</small></span></section>)}</div></article>;
}

function WorkspaceAbout({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <article className="csp-card csp-workspace-about" data-zone="knowledge"><i><Command size={18}/></i><span><b>About This Workspace</b><small>The Workspace Canvas Gives You A Flexible, Modular View Of Your Work. Organise, Focus And Personalise Your Space.</small></span><button type="button" onClick={()=>onAction?.('knowledge','learn-more')}>Learn More</button><em>{fixture.workspace.name}</em></article>;
}

function WorkspaceQuote() {
  return <article className="csp-card csp-workspace-quote" data-zone="announcement"><span aria-hidden="true"/><blockquote>“Progress Happens When People, Ideas And Opportunities Come Together.”<b>— The Daenem Way</b></blockquote></article>;
}

function ZoneCard({ zone, fixture, onAction, onLayoutChange, layoutId }: { zone: CanonicalZoneId; fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void; onLayoutChange?: (id: StaffPortalLayoutId)=>void; layoutId: StaffPortalLayoutId }) {
  if (zone==='hero') return null;
  if (layoutId==='workspace-canvas') {
    if (zone==='kpis') return <WorkspaceKpis fixture={fixture}/>;
    if (zone==='quick-actions') return <WorkspaceQuickCommand onAction={onAction}/>;
    if (zone==='workspace-schedule') return <WorkspaceSchedule fixture={fixture} onAction={onAction}/>;
    if (zone==='workspace-projects') return <WorkspaceProjects onAction={onAction}/>;
    if (zone==='tasks') return <WorkspaceTasks fixture={fixture} onAction={onAction}/>;
    if (zone==='ai-insights') return <WorkspaceAi fixture={fixture} onAction={onAction}/>;
    if (zone==='world-time') return <WorkspaceWorld fixture={fixture} onAction={onAction}/>;
    if (zone==='weather') return <WorkspaceWeather fixture={fixture} onAction={onAction}/>;
    if (zone==='status') return <WorkspaceStatus fixture={fixture}/>;
    if (zone==='approvals') return <WorkspaceApprovals fixture={fixture} onAction={onAction}/>;
    if (zone==='activity') return <WorkspaceActivity fixture={fixture} onAction={onAction}/>;
    if (zone==='knowledge') return <WorkspaceAbout fixture={fixture} onAction={onAction}/>;
    if (zone==='announcement') return <WorkspaceQuote/>;
  }
  if (zone==='kpis') return <CanonicalKpis fixture={fixture}/>;
  const title = zoneTitles[zone] || zone;
  if (zone==='insight-story') return <InsightStory onAction={onAction}/>;
  if (zone==='horizon-global') return <GlobalOperationsPanel fixture={fixture}/>;
  if (zone==='ai-insights' && layoutId==='operational-cockpit') return <OperationalSignals fixture={fixture} onAction={onAction}/>;
  if (zone==='executive-analytics' && layoutId==='executive-command') return <ExecutiveAnalyticsPair fixture={fixture} onAction={onAction}/>;
  if (zone==='executive-analytics' || zone==='board-trend') {
    const singleTitle=singleAnalyticsTitles[layoutId];
    if (singleTitle) return <SingleAnalyticsSurface zone={zone} title={zone==='board-trend' ? singleTitle : singleTitle} fixture={fixture} layoutId={layoutId} onAction={onAction}/>;
    return <article className="csp-card csp-analytics" data-zone={zone}><div className="csp-analytics-columns"><section className="csp-revenue-panel"><header><span><BarChart3 size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"change-period")}>Last 6 Months <ChevronRight size={14}/></button></header><div className="csp-analytics-metric"><strong data-canonical-metric="true" data-numeric={/\d/.test(fixture.kpis[1]?.value ?? '') ? 'true' : 'false'}>{fixture.kpis[1]?.value ?? 'Not Available'}</strong><span>{fixture.kpis[1]?.delta ?? 'Not Available'}</span><small>{fixture.kpis[1]?.meta ?? 'Waiting For Live Data'}</small></div><div className="csp-analytics-visual"><MiniLineChart chartId={`${zone}-revenue-fill`}/><span className="csp-analytics-grid" aria-hidden="true"/></div><footer><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></footer></section><StrategicTrends fixture={fixture}/></div></article>;
  }
  if (zone==='operations-map') return <article className="csp-card csp-map" data-zone={zone}><header><span><MapPinned size={18}/><b>{title}</b></span><em>● Live</em></header><div className="csp-map-art"><svg className="csp-map-network" viewBox="0 0 640 300" aria-hidden="true"><path d="M78 172C168 82 241 218 336 128S488 82 570 154"/><path d="M164 72L210 244M438 72L390 244"/><path className="route-soft" d="M44 230C151 178 209 255 302 194S443 176 604 106"/><path className="route-soft" d="M102 96C218 146 280 48 376 98S493 226 590 208"/></svg><div className="csp-map-scope-rail"><span><b>{fixture.kpis[0]?.value ?? 'Not Available'}</b><small>Authorized Staff</small></span><span><b>{fixture.kpis[2]?.value ?? 'Not Available'}</b><small>Authorized Projects</small></span><span><b>{fixture.kpis[4]?.value ?? 'Not Available'}</b><small>System Status</small></span></div><i className="n1"/><i className="n2"/><i className="n3"/><i className="n4"/><i className="n5"/><span>{fixture.workspace.name}</span><div className="csp-map-signal-legend" aria-hidden="true"><i/>Authorized Scope <i/>Decorative Route Layer</div></div><footer><b>{fixture.kpis[0]?.label ?? 'Staff'} · {fixture.kpis[0]?.value ?? 'Not Available'}</b><b>{fixture.kpis[2]?.label ?? 'Projects'} · {fixture.kpis[2]?.value ?? 'Not Available'}</b><b>{fixture.kpis[4]?.label ?? 'System Uptime'} · {fixture.kpis[4]?.value ?? 'Not Available'}</b></footer></article>;
  if (zone==='studio-canvas') return <article className="csp-card csp-studio" data-zone={zone}><header><span><Workflow size={18}/><b>{title}</b></span><div><button type="button" onClick={()=>onAction?.(zone,"save")}>Save</button><button type="button" className="primary" onClick={()=>onAction?.(zone,"publish")}>Publish</button></div></header><div className="csp-studio-workspace"><div className="csp-studio-grid"><svg className="csp-studio-connectors" viewBox="0 0 900 600" aria-hidden="true"><path d="M450 90L250 220M450 90L690 220M250 220L160 390M250 220L440 390M690 220L760 430M440 390L760 430"/></svg><StudioNode className="n1" tone="violet" label="Authorized Data Source" detail="Connected Workspace Data"/><StudioNode className="n2" tone="blue" label="Transform Step" detail="Clean & Transform"/><StudioNode className="n3" tone="violet" label="Analysis Step" detail="Authorized Analysis"/><StudioNode className="n4" tone="cyan" label="Trend View" detail="Analytical Surface"/><StudioNode className="n5" tone="success" label="Regional View" detail="Scope Comparison"/><StudioNode className="n6" tone="violet" label="Report View" detail="Ready For Review"/></div><aside className="csp-studio-inspector"><header><span><Settings2 size={16}/><b>Inspector</b></span><em>Selected</em></header><label>Node Type<select aria-label="Node Type"><option>Data Source</option><option>Workflow Step</option><option>Chart / Graph</option></select></label><label>Data Source<select aria-label="Data Source"><option>Authorized Workspace Data</option><option>Live Staff Portal Data</option></select></label><label>Refresh Cycle<select aria-label="Refresh Cycle"><option>On Demand</option><option>Scheduled</option></select></label><button type="button" onClick={()=>onAction?.(zone,"configure-node")}>Configure Node <ChevronRight size={14}/></button></aside></div></article>;
  if (zone==='master-list') return <article className="csp-card csp-master" data-zone={zone}><header><div><b>{title}</b><small className="csp-scope-note">Workspace records · authorized scope</small></div><button type="button" className="primary" onClick={()=>onAction?.(zone,"new-project")}><Plus size={14}/> New Record</button></header><div className="csp-master-toolbar" aria-label="Authorized record filters"><button type="button" onClick={()=>onAction?.(zone,'filter-type')}>All Types</button><button type="button" onClick={()=>onAction?.(zone,'filter-status')}>All Statuses</button><button type="button" onClick={()=>onAction?.(zone,'filter-owner')}>All Owners</button><label><Search size={13}/><input aria-label="Search authorized records" placeholder="Search records"/></label></div>{fixture.tasks.slice(0,6).map((record,i)=><button type="button" className={i===0?'selected':''} key={record.title} onClick={()=>onAction?.(zone,'select-record')}><span><b>{record.title}</b><small>{record.meta}</small></span><em>Not Available</em></button>)}</article>;
  if (zone==='master-detail') return <article className="csp-card csp-detail" data-zone={zone}><header><div><span className="csp-eyebrow">SELECTED RECORD</span><h2>{title}</h2><p>{fixture.workspace.subtitle}</p></div><button type="button" onClick={()=>onAction?.(zone,"edit")}>Edit</button></header><div className="csp-detail-banner" aria-hidden="true"><img src="/canonical-postauth-v3/master-detail-workspace/detail-surface.svg" alt=""/></div><div className="csp-detail-tabs"><b>Overview</b><span>Tasks {fixture.tasks.length}</span><span>Milestones Not Available</span><span>Documents Not Available</span><span>Team Not Available</span><span>Financials</span></div><div className="csp-detail-kpis"><span><small>Record Health</small><b>Not Available</b></span><span><small>Completion</small><b>Not Available</b></span><span><small>Time Remaining</small><b>Not Available</b></span><span><small>Budget Utilisation</small><b>Not Available</b></span></div><div className="csp-detail-lower"><section className="csp-detail-progress"><header><b>Progress Trend</b><button type="button" onClick={()=>onAction?.(zone,"change-period")}>Last 6 Months <ChevronRight size={14}/></button></header><MiniLineChart chartId="master-detail-progress"/></section><section className="csp-detail-task-status"><header><b>Task Status</b><span>{fixture.tasks.length} Tasks</span></header><div className="csp-task-ring" aria-hidden="true"><i>{fixture.tasks.length}</i></div><div className="csp-task-legend"><span><i className="done"/>Completed <b>{fixture.tasks.filter(t=>t.priority==='Low').length}</b></span><span><i className="active"/>In Progress <b>{fixture.tasks.filter(t=>t.priority==='Medium').length}</b></span><span><i className="risk"/>Needs Attention <b>{fixture.tasks.filter(t=>t.priority==='High').length}</b></span></div></section><aside className="csp-detail-inspector"><header><b>Record Details</b><button type="button" onClick={()=>onAction?.(zone,"edit-details")}>Edit</button></header><div><span>Workspace</span><b>{fixture.workspace.name}</b></div><div><span>Viewer</span><b>{formatPersonName(fixture.viewer.displayName)}</b></div><div><span>Role</span><b>{formatUiLabel(fixture.viewer.role)}</b></div><div><span>Release</span><b>{fixture.release.version}</b></div></aside></div></article>;
  if (zone==='board-agenda') return <BoardAgendaSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='workspace-schedule') return <article className="csp-card csp-list" data-zone={zone}><header><span><CalendarDays size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{fixture.activity.slice(0,4).map((item,i)=><div key={item.title}><i className={`dot d${i}`}/><span><b>{item.title}</b><small>{item.meta}</small></span><ChevronRight size={14}/></div>)}</article>;
  if (zone==='workspace-projects') return <article className="csp-card csp-projects" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header><div>{fixture.tasks.slice(0,3).map((item,i)=><section key={item.title}><span className={`project-art p${i}`} aria-hidden="true"><i/><i/><i/></span><b>{item.title}</b><small>{item.meta}</small><span className={`csp-decorative-track project-progress-${i}`} aria-hidden="true"><i className="csp-decorative-fill"/></span><em>Not Available</em></section>)}</div></article>;
  if (zone==='ai-insights' && layoutId==='executive-command') return <ExecutiveAiInsights fixture={fixture} onAction={onAction}/>;
  if (zone==='ai-insights') return <article className="csp-card csp-ai-card" data-zone={zone}><header><span><Sparkles size={18}/><b>{title}</b></span><em>BETA</em></header><span className="csp-ai-orbit" aria-hidden="true"><i/><i/><i/></span>{['Revenue Trend Update','Review Pending Requests','Team Productivity Update','Contract Review Needed','System Performance Update'].map(x=><button type="button" key={x} onClick={()=>onAction?.(zone,"open-insight")}><Sparkles size={14}/><span>{x}</span><ChevronRight size={14}/></button>)}<button type="button" className="csp-ai-footer" onClick={()=>onAction?.(zone,"ask-ai")}>Ask Daenem AI Anything <ChevronRight size={14}/></button></article>;
  if (zone==='weather' && layoutId==='executive-command') return <ExecutiveWeather fixture={fixture} onAction={onAction}/>;
  if (zone==='weather') return <article className="csp-card csp-weather" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-more")}>View More</button></header><div><CloudSun size={48}/><span><b>{fixture.weather.city}</b><strong>{fixture.weather.tempC}°C</strong><small>{fixture.weather.condition}</small></span></div><footer><span>Humidity {fixture.weather.humidity}%</span><span>Wind {fixture.weather.windKph} km/h</span><span>UV {fixture.weather.uv}</span></footer></article>;
  if (zone==='world-time') return <article className="csp-card csp-world" data-zone={zone}><header><span><Globe2 size={17}/><b>{title}</b></span></header><div>{fixture.worldTimes.map(x=><span key={x.city}><small>{x.city}</small><b>{x.time}</b><em>{x.date}</em></span>)}</div></article>;
  if (zone==='tasks') return <article className="csp-card csp-list" data-zone={zone}><header><span><ListChecks size={17}/><b>{title}</b></span><em>{fixture.tasks.length}</em></header>{fixture.tasks.map(t=><div key={t.title}><input type="checkbox" aria-label={t.title}/><span><b>{t.title}</b><small>{t.meta}</small></span><em className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</em></div>)}</article>;
  if (zone==='approvals' && layoutId==='executive-command') return <ExecutiveApprovals fixture={fixture} onAction={onAction}/>;
  if (zone==='approvals') return <article className="csp-card csp-list" data-zone={zone}><header><span><CheckCircle2 size={17}/><b>{title}</b></span><em>{fixture.approvals.length}</em></header>{fixture.approvals.map(a=><div key={a.title}><span><b>{a.title}</b><small>{a.meta}</small></span><em className="approval-status">{a.status}</em></div>)}</article>;
  if (zone==='activity' && layoutId==='executive-command') return <ExecutiveActivity fixture={fixture} onAction={onAction}/>;
  if (zone==='activity') return <article className="csp-card csp-list" data-zone={zone}><header><span><Activity size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{fixture.activity.map((a,i)=><div key={a.title}><span className="csp-activity-avatar">{i+1}</span><span><b>{a.title}</b><small>{a.meta}</small></span></div>)}</article>;
  if (zone==='quick-actions') { const actions=[['Create Project',Plus],['Add Staff',Users],['New Document',FileText],['Request Approval',CheckCircle2],['Run Report',BarChart3],['Open Knowledge',BookOpen]] as const; const workspace=layoutId==='workspace-canvas'; return <article className={`csp-card csp-actions${workspace?' csp-workspace-actions':''}`} data-zone={zone}><header><div><b>{workspace?'Quick Command':title}</b>{workspace && <small className="csp-command-subtitle">Get things done, faster.</small>}</div><button type="button" onClick={()=>onAction?.(zone,"customize")}>Customize</button></header>{workspace ? <form className="csp-command-bar" onSubmit={(event)=>{event.preventDefault();onAction?.(zone,'command')}}><div className="csp-command-actions">{actions.map(([x,I])=>{const Icon=I;return <button type="button" key={x} onClick={()=>onAction?.(zone,String(x).toLowerCase().replaceAll(" ","-"))}><Icon size={16}/>{x}</button>})}</div><label><Search size={15}/><input aria-label="Ask or type a command" placeholder="Ask or type a command..."/><button type="submit" aria-label="Run command"><ChevronRight size={15}/></button></label></form> : <div>{actions.map(([x,I])=>{const Icon=I;return <button type="button" key={x} onClick={()=>onAction?.(zone,String(x).toLowerCase().replaceAll(" ","-"))}><Icon size={17}/>{x}</button>})}</div>}</article>; }
  if (zone==='knowledge') return <article className="csp-card csp-list" data-zone={zone}><header><span><BookOpen size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{['Expense Claims Policy','Onboarding Guide','IT Support & Systems','Project Management Playbook'].map(x=><div key={x}><FileText size={15}/><span><b>{x}</b><small>Updated Reference</small></span><ChevronRight size={14}/></div>)}</article>;
  if (zone==='status') return <article className="csp-card csp-status" data-zone={zone}><header><span><ShieldCheck size={17}/><b>{title}</b></span><em>{fixture.kpis[4]?.value ?? 'Not Available'} Uptime</em></header>{['Core Platform','File Storage','Authentication','Email Services'].map(x=><div key={x}><i/><b>{x}</b><span>Operational</span></div>)}</article>;
  if (zone==='announcement' && layoutId==='executive-command') return <ExecutiveFooter fixture={fixture} onAction={onAction} onLayoutChange={onLayoutChange}/>;
  if (zone==='announcement') return <article className="csp-card csp-announcement" data-zone={zone}><Bell size={20}/><div><small>NEW · {title}</small><b>Latest Update From {fixture.workspace.name}</b><span>{fixture.dateTime.date} · {fixture.dateTime.zone}</span></div><ChevronRight size={18}/></article>;
  if (zone==='bento-strategy') return layoutId==='board-pulse' ? <BoardPillarsSurface fixture={fixture} onAction={onAction}/> : <BentoStrategy fixture={fixture} onAction={onAction}/>;
  if (zone==='operations-team' || zone==='focus-progress') { const metrics=[fixture.kpis[2],fixture.kpis[0],null,fixture.kpis[4]]; return <article className="csp-card csp-progress" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{zone==='focus-progress' && <><div className="csp-focus-context"><b>{fixture.workspace.name}</b><i>·</i><small>{fixture.workspace.subtitle}</small></div><div className="csp-focus-summary"><span className="csp-focus-meter" aria-hidden="true"><b>Not Available</b><small>Progress</small></span><span><b>Focus Progress</b><small>Authorized Progress Data</small></span></div></>}{['Project Completion','Team Productivity','Customer Satisfaction','Operational Health'].map((x,i)=><div key={x}><span><b>{x}</b><small>{metrics[i]?.value ?? 'Not Available'}</small></span><span className={`csp-decorative-track csp-progress-decoration d${i}`} aria-hidden="true"><i className="csp-decorative-fill"/></span></div>)}</article>; }
  if (zone==='focus-priorities') return <article className="csp-card csp-priority-stream" data-zone={zone}><header><div><span className="csp-eyebrow">MY PRIORITIES</span><h2>{title}</h2></div><button type="button" className="primary" onClick={()=>onAction?.(zone,"add")}><Plus size={14}/> Add</button></header>{fixture.tasks.map((t,i)=><button type="button" key={t.title} onClick={()=>onAction?.(zone,"open-task")}><span className="csp-check">{i===0?'✓':''}</span><span><b>{t.title}</b><small>{t.meta}</small></span><em className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</em><ChevronRight size={14}/></button>)}</article>;
  if (zone==='studio-toolbox') return <article className="csp-card csp-toolbox" data-zone={zone}><header><div><b>{title}</b><small className="csp-toolbox-subtitle">Build with authorized surfaces</small></div><MoreHorizontal size={17}/></header>{studioToolGroups.map((group)=><section className="csp-toolbox-group" key={group.label}><div className="csp-toolbox-group-label"><span>{group.icon}</span>{group.label}</div><div className="csp-toolbox-items">{group.items.map((x)=><button type="button" key={x} onClick={()=>onAction?.(zone,"tool-"+x.toLowerCase().replaceAll(" ","-").replaceAll("/","-"))}><span>{group.icon}</span>{x}</button>)}</div></section>)}</article>;
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
        {spec.zones.includes('hero') && ((liveSlots && Object.prototype.hasOwnProperty.call(liveSlots,'hero')) ? liveSlots.hero : <CanonicalHero fixture={fixture} layoutId={layoutId} onLayoutChange={setLayout}/>)}
        {spec.zones.filter(z=>z!=='hero').map(zone=><div className="csp-zone" data-zone-shell={zone} style={{gridArea:zone,order:spec.mobileOrder.indexOf(zone)}} key={zone}>{(liveSlots && Object.prototype.hasOwnProperty.call(liveSlots,zone)) ? liveSlots[zone] : <ZoneCard zone={zone} fixture={fixture} layoutId={layoutId} onAction={onZoneAction} onLayoutChange={setLayout}/>}</div>)}
      </div>
    </main>
  </div>;
}
