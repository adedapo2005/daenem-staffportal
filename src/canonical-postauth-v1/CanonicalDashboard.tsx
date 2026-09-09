import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpen, Bot, BriefcaseBusiness, CalendarDays, CheckCircle2,
  ChevronDown, ChevronRight, CircleDollarSign, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Command, Crown, FileText, Gauge, Globe2, Grid3X3, LayoutDashboard,
  ListChecks, MapPinned, Menu, Moon, Monitor, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles, Star, Sun, Users, Wind, Workflow,
} from 'lucide-react';
import type { CanonicalDashboardProps, CanonicalFixture, CanonicalNavigationItem, CanonicalZoneId, StaffPortalLayoutId } from './canonical-types';
import { CANONICAL_VISUAL_FIXTURE } from './canonical-fixture';
import { CANONICAL_LAYOUT_IDS, CANONICAL_LAYOUT_SPECS } from './layout-specs';
import { formatPersonName, formatUiLabel, initialsFromPersonName } from './display-standards';
import { FreshnessStatus } from './FreshnessStatus';
import './canonical-fonts';
import './canonical-dashboard.css';
import './sol-owner-fidelity.css';
import './operational-owner-fidelity.css';
import './premium-postauth-motion.css';

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

type WeatherIconProps = { condition?: string | null; size: number };

function WeatherIcon({ condition, size }: WeatherIconProps) {
  const normalized = (condition ?? '').toLowerCase();
  const kind = normalized.includes('thunder') || normalized.includes('storm')
    ? 'thunderstorm'
    : normalized.includes('heavy rain')
      ? 'heavy-rain'
      : normalized.includes('rain') || normalized.includes('shower')
        ? 'rain'
        : normalized.includes('snow')
          ? 'snow'
          : normalized.includes('fog') || normalized.includes('mist')
            ? 'fog'
            : normalized.includes('wind')
              ? 'wind'
              : normalized.includes('night') || normalized.includes('clear night')
                ? 'night'
                : normalized.includes('cloud') || normalized.includes('overcast')
                  ? (normalized.includes('partly') ? 'partly-cloudy' : 'cloudy')
                  : 'sunny';
  const Icon = kind === 'thunderstorm' ? CloudLightning
    : kind === 'heavy-rain' || kind === 'rain' ? CloudRain
      : kind === 'snow' ? CloudSnow
        : kind === 'fog' ? CloudFog
          : kind === 'wind' ? Wind
            : kind === 'night' ? Moon
              : kind === 'cloudy' ? Cloud
                : kind === 'sunny' ? Sun
                  : CloudSun;
  return <Icon size={size} className={`csp-weather-icon csp-weather-icon-${kind}${size <= 18 ? ' csp-weather-icon--small' : ''}`} aria-hidden="true"/>;
}

const heroArtworkPaths: Record<StaffPortalLayoutId, string> = {
  'executive-command': '/canonical-postauth-v3/executive-command/hero-atmosphere.svg',
  'workspace-canvas': '/canonical-postauth-v3/workspace-canvas/hero-atmosphere.svg',
  'operational-cockpit': '/canonical-postauth-v3/executive-command/hero-skyline-owner.svg',
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
  'operational-cockpit': '/canonical-postauth-v3/operational-cockpit/hero-marina-daylight-v4.webp',
  'insight-magazine': '/reference-images/signin/daylight-glass-skyline.webp',
  'master-detail-workspace': '/reference-images/signin/premium-connected-workspace.webp',
  'horizon-wide': '/canonical-postauth-v3/horizon-wide/singapore-panorama-owner-v1.webp',
  'adaptive-bento': '/canonical-postauth-v3/horizon-wide/singapore-panorama-owner-v1.webp',
  'focus-flow': '/canonical-postauth-v3/horizon-wide/singapore-panorama-owner-v1.webp',
  'enterprise-studio': '/canonical-postauth-v3/horizon-wide/singapore-panorama-owner-v1.webp',
  'board-pulse': '/canonical-postauth-v3/horizon-wide/singapore-panorama-owner-v1.webp',
};

const heroSignals: Record<StaffPortalLayoutId, { signal: string[]; quote: string }> = {
  'executive-command': { signal: ['Build People', 'Create Opportunities', 'Make A Lasting Impact'], quote: '“Great organisations are built by great people.”' },
  'workspace-canvas': { signal: ['Good People', 'Great Possibilities'], quote: '“Your work, your way.”' },
  'operational-cockpit': { signal: ['Operational Excellence Today', 'A Brighter Tomorrow'], quote: 'People in motion. Progress in real time. A stronger tomorrow.' },
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
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [highlightedLayout, setHighlightedLayout] = useState<StaffPortalLayoutId>(layoutId);
  const selectorRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => { setHighlightedLayout(layoutId); }, [layoutId]);
  useEffect(() => {
    if (!layoutOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) setLayoutOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLayoutOpen(false);
        selectorRef.current?.querySelector<HTMLButtonElement>('.csp-layout-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [layoutOpen]);

  const openLayoutMenu = () => {
    setHighlightedLayout(layoutId);
    setLayoutOpen(true);
  };
  const focusLayoutOption = (id: StaffPortalLayoutId) => {
    setHighlightedLayout(id);
    requestAnimationFrame(() => optionRefs.current[CANONICAL_LAYOUT_IDS.indexOf(id)]?.focus());
  };
  const selectLayout = (id: StaffPortalLayoutId) => {
    onLayoutChange(id);
    setHighlightedLayout(id);
    setLayoutOpen(false);
    selectorRef.current?.querySelector<HTMLButtonElement>('.csp-layout-trigger')?.focus();
  };
  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!layoutOpen) openLayoutMenu();
      else focusLayoutOption(highlightedLayout);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!layoutOpen) openLayoutMenu();
      else focusLayoutOption(highlightedLayout);
    }
  };
  const onOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, id: StaffPortalLayoutId) => {
    const index = CANONICAL_LAYOUT_IDS.indexOf(id);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + CANONICAL_LAYOUT_IDS.length) % CANONICAL_LAYOUT_IDS.length;
      focusLayoutOption(CANONICAL_LAYOUT_IDS[next]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusLayoutOption(CANONICAL_LAYOUT_IDS[event.key === 'Home' ? 0 : CANONICAL_LAYOUT_IDS.length - 1]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectLayout(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setLayoutOpen(false);
      selectorRef.current?.querySelector<HTMLButtonElement>('.csp-layout-trigger')?.focus();
    }
  };
  const operationalSelector = layoutId === 'operational-cockpit';
  return <header className="csp-topbar" data-canonical-topbar>
    <div className="csp-brand"><span className="csp-brand-mark"><img src="/brand-assets/logo-mark.svg" alt="" /></span><span><b>STAFFPORTAL.DAENEM.COM</b><small>People · Systems · A Stronger Tomorrow</small></span></div>
    <button type="button" className="csp-workspace" onClick={onWorkspace}><BriefcaseBusiness size={16}/><span><b>{fixture.workspace.name}</b><small>{fixture.workspace.subtitle}</small></span></button>
    <form className="csp-search" role="search" onSubmit={(event)=>{event.preventDefault();onSearch?.(query)}}><Search size={17}/><span className="csp-search-mobile-placeholder" aria-hidden="true">Search Staff Portal</span><input aria-label="Search Staff Portal" placeholder="Search People, Documents, Projects, Anything..." value={query} onChange={(event)=>setQuery(event.target.value)}/><kbd>⌘ K</kbd></form>
    <div className="csp-top-actions">
      {onAskAi && <button type="button" className="csp-ai" onClick={onAskAi}><Sparkles size={16}/> Ask Daenem AI</button>}
      <button type="button" className="csp-create" aria-label="Quick Create" onClick={onQuickCreate}><Plus size={16}/><span className="csp-create-label">Quick Create</span>{(layoutId === 'executive-command' || layoutId === 'workspace-canvas') && <ChevronDown size={14} aria-hidden="true"/>}</button>
      <button type="button" className="csp-icon" aria-label="Notifications" onClick={onNotifications}><Bell size={17}/><i>3</i></button>
      <span className="csp-weather-chip"><WeatherIcon condition={fixture.weather.condition} size={18}/><span><b>{layoutId === 'executive-command' ? fixture.weather.city : (fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`)}</b><small>{layoutId === 'executive-command' ? (fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C · ${fixture.weather.condition}`) : fixture.weather.city}</small></span></span>
      <FreshnessStatus sync={fixture.sync} variant="topbar"/>
      <span className="csp-release"><b>{fixture.release.version}</b><small>{fixture.release.label}</small></span>
      {operationalSelector ? <div className={`csp-layout-select${layoutOpen ? ' is-open' : ''}`} ref={selectorRef}>
        <button type="button" className="csp-layout-trigger" aria-haspopup="listbox" aria-expanded={layoutOpen} aria-controls="canonical-layout-options" onClick={()=>layoutOpen ? setLayoutOpen(false) : openLayoutMenu()} onKeyDown={onTriggerKeyDown}>
          <Grid3X3 size={16}/><span className="csp-layout-current">{CANONICAL_LAYOUT_SPECS[layoutId].name}</span><ChevronDown size={13} aria-hidden="true"/>
        </button>
        {layoutOpen && <div className="csp-layout-menu" id="canonical-layout-options" role="listbox" aria-label="Dashboard Layout">
          {CANONICAL_LAYOUT_IDS.map((id, index) => <button type="button" role="option" aria-selected={id === layoutId} tabIndex={id === highlightedLayout ? 0 : -1} ref={(node)=>{ optionRefs.current[index] = node; }} className={`csp-layout-option${id === layoutId ? ' active' : ''}`} key={id} onClick={()=>selectLayout(id)} onFocus={()=>setHighlightedLayout(id)} onKeyDown={(event)=>onOptionKeyDown(event,id)}>
            <Grid3X3 size={14}/><span>{CANONICAL_LAYOUT_SPECS[id].name}</span>{id === layoutId && <span className="csp-layout-check" aria-hidden="true">✓</span>}
          </button>)}
        </div>}
      </div> : <label className="csp-layout-select"><Grid3X3 size={16}/><span className="csp-layout-current" aria-hidden="true">{CANONICAL_LAYOUT_SPECS[layoutId].name}</span><select aria-label="Dashboard Layout" value={layoutId} onChange={(e)=>onLayoutChange(e.target.value as StaffPortalLayoutId)}>{CANONICAL_LAYOUT_IDS.map((id)=><option key={id} value={id}>{CANONICAL_LAYOUT_SPECS[id].name}</option>)}</select></label>}
      <button type="button" className="csp-profile" onClick={onProfile} aria-label={`Open Profile For ${formatPersonName(fixture.viewer.displayName)}`}><span className="csp-avatar">{initialsFromPersonName(fixture.viewer.displayName)}</span><span className="csp-profile-copy"><b>{formatPersonName(fixture.viewer.displayName)}</b><small>{formatUiLabel(fixture.viewer.role)}</small></span></button>
    </div>
  </header>;
}

function SideNav({ layoutId, navigation, activeNavigationId }: { layoutId: StaffPortalLayoutId; navigation?: CanonicalNavigationItem[]; activeNavigationId?: string }) {
  // An explicitly empty authorized navigation list must stay empty.
  const workspace = layoutId === 'workspace-canvas';
  const identityItems: Partial<Record<StaffPortalLayoutId,[string,typeof LayoutDashboard]>> = {
    'operational-cockpit':['Operational Cockpit',Gauge],
    'master-detail-workspace':['Master–Detail',BriefcaseBusiness],
    'adaptive-bento':['My Workspace',Grid3X3],
    'focus-flow':['Focus & Flow',ListChecks],
    'enterprise-studio':['Enterprise Studio',Workflow],
    'board-pulse':['Board Pulse',BarChart3],
  };
  const defaultItems = workspace ? workspaceCanvasNav : nav;
  const baseItems: CanonicalNavigationItem[] = defaultItems.map(([label, Icon]) => ({ id: label, label, icon: Icon }));
  const identityItem = identityItems[layoutId];
  const scopedItems = identityItem ? [baseItems[0],{id:identityItem[0],label:identityItem[0],icon:identityItem[1]},...baseItems.slice(1)] : baseItems;
  const items: CanonicalNavigationItem[] = navigation !== undefined ? navigation : scopedItems;
  return <aside className="csp-sidebar" data-canonical-sidebar>
    <div className="csp-sidebar-title"><Command size={18}/><span><b>{CANONICAL_LAYOUT_SPECS[layoutId].name}</b><small>Selectable Premium Layout</small></span></div>
    <nav>{items.map((item,index)=>{const Icon=item.icon || LayoutDashboard;const active=activeNavigationId ? item.id===activeNavigationId : navigation===undefined && (workspace || identityItem) ? index===1 : index===0;return <button type="button" key={item.id} className={active?'active':''} onClick={item.onSelect} aria-label={formatUiLabel(item.label)} aria-current={active?'page':undefined}><Icon size={17}/><span>{formatUiLabel(item.label)}</span>{item.badge && <em>{item.badge}</em>}</button>})}</nav>
    <div className="csp-purpose"><span>{workspace ? 'Build' : 'One Team'}</span><b>{workspace ? <>Create<br/>Grow<br/>Together.</> : 'A Brighter Tomorrow'}</b><small>{workspace ? 'Good People · Great Possibilities' : 'Build · Empower · Grow'}</small><ChevronRight size={18}/></div>
    {workspace && <div className="csp-workspace-side-brand"><Command size={18}/><span><b>Daenem Global</b><small>A Brighter Tomorrow</small></span></div>}
  </aside>;
}

function LayoutRibbon({ layoutId, onAction }: { layoutId: StaffPortalLayoutId; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  if (layoutId === 'insight-magazine') {
    const items = ['Home', 'People', 'Projects', 'Analytics', 'Knowledge', 'Services'];
    return <nav className="csp-layout-ribbon csp-insight-ribbon" aria-label="Insight Magazine Sections">{items.map((item)=><button type="button" className={item==='Analytics'?'active':''} aria-current={item==='Analytics'?'page':undefined} key={item} onClick={()=>onAction?.('insight-story',`section-${item.toLowerCase()}`)}>{item}</button>)}</nav>;
  }
  if (layoutId === 'master-detail-workspace') {
    return <section className="csp-layout-ribbon csp-master-ribbon" aria-label="Master Detail Controls">
      <div><Grid3X3 size={15}/><b>Master–Detail Workspace</b></div>
      <label>Type<select aria-label="Record Type" onChange={()=>onAction?.('master-list','filter-type')}><option>All Types</option></select></label>
      <label>Status<select aria-label="Record Status" onChange={()=>onAction?.('master-list','filter-status')}><option>All Statuses</option></select></label>
      <label>Owner<select aria-label="Record Owner" onChange={()=>onAction?.('master-list','filter-owner')}><option>All Owners</option></select></label>
      <label className="csp-ribbon-search"><Search size={14}/><input aria-label="Search Authorized Records" placeholder="Search Records" onChange={()=>onAction?.('master-list','search')}/></label>
    </section>;
  }
  if (layoutId === 'adaptive-bento') {
    const items = ['Dashboard', 'My Workspace', 'Executive View', 'Operations', 'People & Teams', 'Projects', 'Finance', 'Customers', 'Analytics', 'Tools', 'Activity'];
    return <nav className="csp-layout-ribbon csp-bento-ribbon" aria-label="Adaptive Workspace Views">{items.map((item)=><button type="button" className={item==='My Workspace'?'active':''} aria-current={item==='My Workspace'?'page':undefined} key={item} onClick={()=>onAction?.('bento-strategy',`view-${item.toLowerCase().replaceAll(' ','-').replaceAll('&','and')}`)}>{item}</button>)}</nav>;
  }
  return null;
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

function InsightHero({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <section className="csp-hero csp-insight-hero" data-zone="hero"><img src="/reference-images/signin/daylight-glass-skyline.webp" alt="" aria-hidden="true"/><div className="csp-insight-hero-wash" aria-hidden="true"/><div className="csp-insight-hero-copy"><span>Featured Insight</span><h1>People<br/>Create<br/>Brighter<br/>Tomorrows</h1><p>People, projects and technology are shaping a more connected, sustainable and prosperous future.</p><button type="button" onClick={()=>onAction?.('hero','read-story')}>Read The Full Story <ChevronRight size={14}/></button></div><blockquote><b>“</b><span>Progress Happens<br/>When People Believe<br/>Tomorrow Can Be Better<br/>Than Today.</span><i/><small>Daenem Global</small></blockquote><footer><span>01 Our People</span><span>02 Smarter Operations</span><span>03 Sustainable Growth</span><span>04 Global Opportunities</span></footer></section>;
}

export function CanonicalHero({ fixture, layoutId, onLayoutChange, onAction }: { fixture: CanonicalFixture; layoutId: StaffPortalLayoutId; onLayoutChange?: (id: StaffPortalLayoutId)=>void; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  if (layoutId === 'executive-command') return <ExecutiveHero fixture={fixture}/>;
  if (layoutId === 'workspace-canvas') return <WorkspaceHero fixture={fixture} onLayoutChange={onLayoutChange}/>;
  if (layoutId === 'insight-magazine') return <InsightHero fixture={fixture} onAction={onAction}/>;
  const copy: Record<StaffPortalLayoutId, [string,string]> = {
    'executive-command':['Good Morning, {viewer}','Everything That Matters. In One View.'],
    'workspace-canvas':['Workspace Canvas','Your Work, Your Way. Organise. Collaborate. Make An Impact.'],
    'operational-cockpit':['Operational Cockpit','Real-time operations. Greater possibilities.'],
    'insight-magazine':['People Create Brighter Tomorrows','Perspectives. Ideas. People. Progress.'],
    'master-detail-workspace':['Master–Detail Workspace','Browse, Focus And Take Action — All In One Place.'],
    'horizon-wide':['Good Morning, {viewer}','Bigger Horizons Create Brighter Opportunities.'],
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
    {layoutId === 'enterprise-studio' && <section className="csp-studio-hero-times" aria-label="Global Time">{fixture.worldTimes.map(item=><span key={item.city}><small>{item.city}</small><b>{item.time}</b><em>{item.date}</em></span>)}</section>}
    {layoutId === 'horizon-wide' && <button type="button" className="csp-horizon-global-action" onClick={()=>onAction?.('hero','open-global-view')}><Globe2 size={18}/> Open Global View <ChevronRight size={14}/></button>}
    {layoutId === 'operational-cockpit' && <div className="csp-operational-orbs" aria-hidden="true"><Globe2/><Globe2/><span>A More Connected<br/>Brighter Tomorrow</span></div>}
  </section>;
}

export function CanonicalKpis({ fixture, layoutId = 'executive-command' }: { fixture: CanonicalFixture; layoutId?: StaffPortalLayoutId }) {
  const labelSets: Partial<Record<StaffPortalLayoutId, string[]>> = {
    'operational-cockpit': ['Operations', 'Projects', 'Revenue', 'Approvals', 'System Uptime'],
    'insight-magazine': ['Total Staff', 'Revenue', 'Active Projects', 'Client Satisfaction', 'System Uptime'],
    'enterprise-studio': ['Total Data Sources', 'Active Views', 'Automations', 'Total Records', 'AI Insights'],
    'board-pulse': ['Total Revenue', 'Net Profit', 'Active Projects', 'Strategic Initiatives', 'Enterprise Health'],
  };
  const labels = labelSets[layoutId];
  const sourceOrder = layoutId === 'operational-cockpit' ? [0, 2, 1, 3, 4] : layoutId === 'insight-magazine' ? [0, 1, 2, 3] : fixture.kpis.map((_, index) => index);
  return <section className="csp-kpis" data-zone="kpis">{sourceOrder.map((sourceIndex, index) => {
    const k = fixture.kpis[sourceIndex];
    if (!k) return null;
    const label = labels?.[index] ?? k.label;
    const unavailable = (layoutId === 'insight-magazine' && index === 3) || layoutId === 'enterprise-studio' || (layoutId === 'board-pulse' && index === 3);
    const value = unavailable ? 'Not Available' : k.value;
    const delta = unavailable ? 'Not Available' : k.delta;
    const meta = unavailable ? 'Authorized Signal Unavailable' : k.meta;
    return <article key={label} className={`tone-${k.tone}`}><KpiIcon label={label}/><span className="csp-kpi-label">{label}</span><strong data-canonical-metric="true" data-numeric={/\d/.test(value) ? 'true' : 'false'}>{value}</strong><em>{delta}</em><small>{meta}</small><svg className="csp-kpi-spark" viewBox="0 0 120 44" aria-hidden="true"><path d="M2 36C14 34 16 25 28 28S44 17 54 22S68 11 78 18S96 7 118 8"/><path d="M2 42H118"/></svg></article>;
  })}</section>;
}

function KpiIcon({ label }: { label: string }) {
  const Icon = label.includes('Staff') || label.includes('Operations') ? (label.includes('Operations') ? Gauge : Users) : label.includes('Revenue') || label.includes('Profit') ? BarChart3 : label.includes('Projects') || label.includes('Records') ? BriefcaseBusiness : label.includes('Approvals') || label.includes('Initiatives') ? CheckCircle2 : label.includes('Source') || label.includes('View') || label.includes('Automation') || label.includes('Insight') ? Workflow : ShieldCheck;
  return <span className="csp-kpi-icon" aria-hidden="true"><Icon size={18}/></span>;
}

function MiniLineChart({ chartId = 'csp-chart-fill' }: { chartId?: string }) {
  return <svg className="csp-chart" viewBox="0 0 640 220" role="img" aria-label="Decorative reference trend geometry; live series unavailable"><defs><linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".24"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><path d="M20 178 C90 165 125 142 170 147 S250 115 300 120 S385 76 430 92 S520 55 610 42 L610 210 L20 210 Z" fill={`url(#${chartId})`}/><path d="M20 178 C90 165 125 142 170 147 S250 115 300 120 S385 76 430 92 S520 55 610 42" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><g fill="currentColor">{[[20,178],[170,147],[300,120],[430,92],[610,42]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="5"/>)}</g></svg>;
}

function StudioNode({ className, label, detail, tone }: { className: string; label: string; detail: string; tone: 'violet' | 'blue' | 'cyan' | 'success' }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'cyan' ? BarChart3 : tone === 'blue' ? Settings2 : Sparkles;
  return <div className={`node ${className} node-${tone}`}><i className="csp-studio-node-icon" aria-hidden="true"><Icon size={18}/></i><span className="csp-node-type"><i aria-hidden="true" />AUTHORIZED SURFACE</span><b>{label}</b><small>{detail}</small><button type="button" aria-label={`${label} Options`}><MoreHorizontal size={13}/></button></div>;
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
  return <article className="csp-card csp-story csp-insight-spotlight" data-zone="insight-story"><img src="/reference-images/signin/daylight-technology-campus.webp" alt="" aria-hidden="true"/><div className="csp-insight-spotlight-wash" aria-hidden="true"/><section><span>Today’s Spotlight</span><small>A Stronger Tomorrow</small><h2>From Ideas<br/>To Real Impact</h2><p>Cross-functional teams turn bold ideas into meaningful outcomes.</p><button type="button" onClick={()=>onAction?.('insight-story','open-story')}>Explore The Story <ChevronRight size={14}/></button></section><em aria-hidden="true">People<br/>Ideas<br/>Impact</em></article>;
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
  ];
  return <article className="csp-card csp-bento-strategy csp-adaptive-priorities" data-zone="bento-strategy">
    <header><span><Sparkles size={18}/><b>Strategic Priorities</b></span><button type="button" onClick={()=>onAction?.('bento-strategy','view-all')}>View All</button></header>
    <div className="csp-adaptive-priority-list">{tiles.map((tile,index)=><button type="button" className={`csp-adaptive-priority-row tone-${tile.tone}`} key={tile.label} onClick={()=>onAction?.('bento-strategy','open-priority')}>
      <span className="csp-adaptive-priority-art" aria-hidden="true"><i/><i/><i/></span><span className="csp-adaptive-priority-copy"><b>{tile.label}</b><small>{tile.detail}</small><span className={`csp-decorative-track priority-${index}`}><i className="csp-decorative-fill"/></span></span><strong data-canonical-metric="true" data-numeric={/\d/.test(tile.value) ? 'true' : 'false'}>{tile.value}</strong><ChevronRight size={14} aria-hidden="true"/>
    </button>)}</div>
  </article>;
}

function AdaptiveAiForYou({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const insights = [
    { title: fixture.tasks[0]?.title ?? 'Not Available', detail: fixture.tasks[0]?.meta ?? 'Authorized Task Unavailable', icon: ListChecks },
    { title: fixture.approvals[0]?.title ?? 'Not Available', detail: fixture.approvals[0]?.meta ?? 'Authorized Approval Unavailable', icon: CheckCircle2 },
    { title: fixture.activity[0]?.title ?? 'Not Available', detail: fixture.activity[0]?.meta ?? 'Authorized Activity Unavailable', icon: Activity },
  ];
  return <article className="csp-card csp-adaptive-ai-for-you" data-zone="status">
    <header><span><Sparkles size={17}/><b>AI Insights For You</b></span><button type="button" onClick={()=>onAction?.('status','view-all')}>View All</button></header>
    <div>{insights.map((insight,index)=>{const Icon=insight.icon;return <button type="button" key={`${insight.title}-${index}`} onClick={()=>onAction?.('status','open-insight')}><i className={`tone-${index}`} aria-hidden="true"><Icon size={14}/></i><span><b>{insight.title}</b><small>{insight.detail}</small></span><ChevronRight size={13}/></button>})}</div>
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
  return <article className="csp-card csp-board-agenda" data-zone="board-agenda">
    <header><span><CalendarDays size={17}/><b>Board Agenda</b></span><button type="button" onClick={()=>onAction?.('board-agenda','view-all')}>View All</button></header>
    <div className="csp-board-agenda-owner">{[0,1,2,3,4,5].map((index)=><button type="button" key={index} onClick={()=>onAction?.('board-agenda','open-agenda')}><time>Not Available</time><i className={`agenda-tone-${index%4}`} aria-hidden="true"/><span><b>Not Available</b><small>Authorized Board Agenda Data Unavailable</small></span><ChevronRight size={13}/></button>)}</div>
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
  const signals = Array.from({ length: 5 }, (_, index) => fixture.activity[index] ?? null);
  return <article className="csp-card csp-operations-signals" data-zone="ai-insights">
    <header><span><AlertTriangle size={18}/><b>Live Incidents &amp; Alerts</b></span><button type="button" onClick={()=>onAction?.('ai-insights','view-all')}>View All</button></header>
    <nav className="csp-signal-tabs" aria-label="Incident views"><button type="button" className="active">All</button><button type="button">Critical</button><button type="button">Warning</button><button type="button">Info</button></nav>
    <div className="csp-signal-list">{signals.map((item,index)=><button type="button" key={item?.title ?? `signal-${index}`} onClick={()=>onAction?.('ai-insights','open-signal')}><i className={`csp-signal-icon tone-${index}`} aria-hidden="true">{index < 3 ? '!' : 'i'}</i><span><b>{item?.title ?? 'Not Available'}</b><small>{item?.meta ?? 'Authorized Incident Data Unavailable'}</small><em>{item ? 'Authorized Activity' : 'No Authorized Signal'}</em></span><ChevronRight size={14}/></button>)}</div>
  </article>;
}

function StudioInspectorPanel({ onAction }: { onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  return <article className="csp-card csp-studio-inspector-panel" data-zone="ai-insights"><header><span><Settings2 size={17}/><b>Inspector</b></span><em>Selected</em></header><nav aria-label="Inspector Views"><button type="button" className="active" onClick={()=>onAction?.('ai-insights','inspector')}>Inspector</button><button type="button" onClick={()=>onAction?.('ai-insights','data')}>Data</button><button type="button" onClick={()=>onAction?.('ai-insights','assistant')}>AI Assistant</button></nav><section className="csp-inspector-component"><i aria-hidden="true"><Sparkles size={22}/></i><span><small>Component</small><b>AI Analysis</b><em>Active</em></span></section><label>Display Name<input defaultValue="AI Analysis" aria-label="Display Name" onChange={()=>onAction?.('ai-insights','rename-component')}/></label><label>Description<textarea aria-label="Description" defaultValue="Analyze Authorized Data And Generate Insights" onChange={()=>onAction?.('ai-insights','describe-component')}/></label><label>AI Model<select aria-label="AI Model" onChange={()=>onAction?.('ai-insights','change-model')}><option>Daenem AI</option></select></label><label>Input Data<select aria-label="Input Data" onChange={()=>onAction?.('ai-insights','change-input')}><option>Authorized Workspace Data</option></select></label><label>Run Schedule<select aria-label="Run Schedule" onChange={()=>onAction?.('ai-insights','change-schedule')}><option>On Demand</option></select></label><div className="csp-inspector-actions"><button type="button" className="primary" onClick={()=>onAction?.('ai-insights','run-now')}>Run Now</button><button type="button" onClick={()=>onAction?.('ai-insights','view-logs')}>View Logs</button></div></article>;
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

function ContextAiInsights({ fixture, layoutId, onAction }: { fixture: CanonicalFixture; layoutId: StaffPortalLayoutId; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const titles: Partial<Record<StaffPortalLayoutId,string>> = {
    'insight-magazine': 'Executive Brief',
    'master-detail-workspace': 'Daenem AI Insights',
    'horizon-wide': 'AI Insights',
    'adaptive-bento': 'Ask Daenem AI',
    'focus-flow': 'Daenem AI',
    'enterprise-studio': 'AI Assistant',
    'board-pulse': 'Daenem AI Board Brief',
  };
  const rows = [
    { label: `${fixture.kpis[1]?.label ?? 'Revenue'} Signal`, detail: `${fixture.kpis[1]?.value ?? 'Not Available'} · ${fixture.kpis[1]?.delta ?? 'Not Available'}`, icon: BarChart3, tone: 'blue' },
    { label: 'Pending Request Review', detail: `${fixture.approvals.length} Authorized Requests`, icon: CheckCircle2, tone: 'gold' },
    { label: 'Task Priority Review', detail: `${fixture.tasks.filter((task)=>task.priority==='High').length} Authorized High-Priority Tasks`, icon: ListChecks, tone: 'violet' },
    { label: 'Recent Activity', detail: fixture.activity[0]?.meta ?? 'Not Available', icon: Activity, tone: 'coral' },
  ];
  return <article className={`csp-card csp-ai-card csp-context-ai csp-context-ai-${layoutId}`} data-zone="ai-insights">
    <header><span><Sparkles size={17}/><b>{titles[layoutId] ?? 'Daenem AI Insights'}</b></span><em>BETA</em></header>
    <div className="csp-context-ai-intro"><i aria-hidden="true"><Sparkles size={19}/></i><span><b>Authorized Context</b><small>Live Workspace Signals Only</small></span></div>
    <div className="csp-context-ai-rows">{rows.map((row)=>{const Icon=row.icon;return <button type="button" key={row.label} onClick={()=>onAction?.('ai-insights','open-insight')}><i className={`tone-${row.tone}`} aria-hidden="true"><Icon size={14}/></i><span><b>{row.label}</b><small>{row.detail}</small></span><ChevronRight size={13}/></button>})}</div>
    <button type="button" className="csp-ai-footer" onClick={()=>onAction?.('ai-insights','ask-ai')}><Sparkles size={13}/> Ask Daenem AI <ChevronRight size={13}/></button>
  </article>;
}

function ContextWeather({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const temperature = fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`;
  return <article className="csp-card csp-weather csp-context-weather" data-zone="weather"><header><b>{fixture.weather.city}</b><button type="button" onClick={()=>onAction?.('weather','view-more')}>View Forecast <ChevronRight size={13}/></button></header><div className="csp-context-weather-current"><span><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC===null?'false':'true'}>{temperature}</strong><b>{fixture.weather.condition}</b><small>Humidity {fixture.weather.humidity}% · Wind {fixture.weather.windKph} km/h · UV {fixture.weather.uv}</small></span><i aria-hidden="true"><WeatherIcon condition={fixture.weather.condition} size={58}/></i></div><footer>{['Next','Later','Tomorrow','Following'].map((label)=><span key={label}><small>{label}</small><WeatherIcon condition={fixture.weather.condition} size={14}/><b>Not Available</b></span>)}</footer></article>;
}

function OperationalWeather({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const temperature = fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`;
  return <article className="csp-card csp-operational-weather" data-zone="weather"><header><span><WeatherIcon condition={fixture.weather.condition} size={16}/><b>Weather &amp; Regional Overview</b></span><button type="button" onClick={()=>onAction?.('weather','view-more')}>View More</button></header><div><section><b>{fixture.weather.city}</b><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC===null?'false':'true'}>{temperature}</strong><small>{fixture.weather.condition}</small><em>Humidity {fixture.weather.humidity}% · Wind {fixture.weather.windKph} km/h</em></section><i aria-hidden="true"><WeatherIcon condition={fixture.weather.condition} size={48}/></i><aside>{fixture.worldTimes.slice(0,4).map((item,index)=><span key={item.city}><i className={`tone-${index}`}/><b>{item.city}</b><small>{item.time}</small></span>)}</aside></div></article>;
}

function FocusMetrics({ fixture }: { fixture: CanonicalFixture }) {
  const metrics = [fixture.kpis[2],fixture.kpis[3],fixture.kpis[0],fixture.kpis[4]].filter(Boolean);
  return <article className="csp-card csp-focus-metrics" data-zone="tasks"><header><span><BarChart3 size={17}/><b>Key Metrics</b></span><em>Authorized</em></header>{metrics.map((metric,index)=><div key={metric.label}><i className={`tone-${metric.tone}`} aria-hidden="true"><KpiIcon label={metric.label}/></i><span><small>{metric.label}</small><strong data-canonical-metric="true" data-numeric={/\d/.test(metric.value)?'true':'false'}>{metric.value}</strong></span><em>{metric.delta}</em><span className={`csp-decorative-track metric-${index}`} aria-hidden="true"><i className="csp-decorative-fill"/></span></div>)}</article>;
}

function FocusProgress({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const rows = [
    { label: 'Tasks', value: `${fixture.tasks.length} Authorized`, icon: ListChecks, tone: 'blue' },
    { label: 'Approvals', value: `${fixture.approvals.length} Authorized`, icon: CheckCircle2, tone: 'violet' },
    { label: 'Meetings', value: 'Not Available', icon: CalendarDays, tone: 'gold' },
    { label: 'Documents', value: 'Not Available', icon: FileText, tone: 'cyan' },
  ];
  return <article className="csp-card csp-focus-progress-owner" data-zone="focus-progress">
    <header><b>Today’s Progress</b><button type="button" onClick={()=>onAction?.('focus-progress','view-details')}>View Details <ChevronRight size={13}/></button></header>
    <div className="csp-focus-progress-lead"><span className="csp-focus-meter" aria-hidden="true"><b>Not Available</b><small>Progress</small></span><span><b>Daily Goals</b><small>Authorized Completion Data Unavailable</small></span></div>
    <div className="csp-focus-progress-rows">{rows.map((row)=>{const Icon=row.icon;return <button type="button" key={row.label} onClick={()=>onAction?.('focus-progress',`open-${row.label.toLowerCase()}`)}><i className={`tone-${row.tone}`} aria-hidden="true"><Icon size={14}/></i><span><b>{row.label}</b><small>{row.value}</small></span><ChevronRight size={13}/></button>})}</div>
  </article>;
}

function FocusQuickLinks({ onAction }: { onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const links = [['New Document', FileText], ['Request Approval', CheckCircle2], ['Open Knowledge', BookOpen]] as const;
  return <article className="csp-card csp-focus-quick-links" data-zone="quick-actions"><header><b>Quick Links</b><button type="button" onClick={()=>onAction?.('quick-actions','customize')}>Customize</button></header><div>{links.map(([label,Icon])=><button type="button" key={label} onClick={()=>onAction?.('quick-actions',label.toLowerCase().replaceAll(' ','-'))}><Icon size={17}/><span>{label}</span></button>)}</div></article>;
}

function FocusAi({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const prompts = [
    `Summarize My ${fixture.approvals.length} Pending Approvals`,
    `Draft An Update For ${fixture.workspace.name}`,
    'Show My Authorized Priority Signals',
    'Create Meeting Notes From Authorized Context',
  ];
  return <article className="csp-card csp-focus-ai" data-zone="ai-insights"><header><span><Sparkles size={17}/><b>Daenem AI</b></span><em>BETA</em></header><div className="csp-focus-ai-lead"><i aria-hidden="true"><Sparkles size={14}/></i><b>How Can I Help You Stay In Flow Today?</b></div><div className="csp-focus-ai-prompts">{prompts.map(prompt=><button type="button" key={prompt} onClick={()=>onAction?.('ai-insights','run-prompt')}><Bot size={13}/><span>{prompt}</span></button>)}</div><form onSubmit={(event)=>{event.preventDefault();onAction?.('ai-insights','ask-ai')}}><input aria-label="Ask Daenem AI" placeholder="Ask anything..."/><button type="submit" aria-label="Send"><ChevronRight size={14}/></button></form></article>;
}

function FocusPriorityStream({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const tasks = Array.from({length:8},(_,index)=>fixture.tasks[index] ?? null);
  const tabs = [
    ['My Priorities', fixture.tasks.length],
    ['Approvals', fixture.approvals.length],
    ['In Progress', 'Not Available'],
    ['Upcoming', 'Not Available'],
    ['Completed', 'Not Available'],
  ] as const;
  return <article className="csp-card csp-priority-stream" data-zone="focus-priorities">
    <nav className="csp-focus-stage-tabs" aria-label="Priority Views">{tabs.map(([label,value],index)=><button type="button" className={index===0?'active':''} key={label} onClick={()=>onAction?.('focus-priorities',`view-${label.toLowerCase().replaceAll(' ','-')}`)}><i>{index+1}</i><span><b>{label}</b><small>{index===0?'Focus For Today':index===1?'Action Required':index===2?'Keep Momentum':index===3?'Next 7 Days':'Authorized Signal'}</small></span>{index===1 && <em>{value}</em>}</button>)}</nav>
    <form className="csp-focus-add-bar" onSubmit={(event)=>{event.preventDefault();onAction?.('focus-priorities','add')}}><label><Search size={15}/><input aria-label="Add a task" placeholder="Add a new task, approval or note..."/></label><select aria-label="Entry Type"><option>Task</option><option>Approval</option><option>Note</option></select><button type="submit" className="primary">Add</button></form>
    <header><div><h2>Today’s Priorities</h2><em>{fixture.tasks.length} Items</em></div><nav><button type="button" onClick={()=>onAction?.('focus-priorities','filter-all')}>All Items <ChevronDown size={12}/></button><button type="button" onClick={()=>onAction?.('focus-priorities','filter-priority')}>Priority <ChevronDown size={12}/></button></nav></header>
    <div className="csp-focus-priority-rows">{tasks.map((task,index)=>{const TaskIcon=[FileText,Users,BriefcaseBusiness,CalendarDays,ShieldCheck][index%5];return <button type="button" key={task?.title ?? `task-unavailable-${index}`} onClick={()=>onAction?.('focus-priorities','open-task')}><span className="csp-check">{index===0?'✓':''}</span><i className={`csp-focus-task-icon tone-${index%4}`} aria-hidden="true"><TaskIcon size={15}/></i><span><b>{task?.title ?? 'Not Available'}</b><small>{task?.meta ?? 'Authorized Task Unavailable'}</small></span><em className={`priority ${task?.priority.toLowerCase() ?? 'low'}`}>{task?.priority ?? 'Not Available'}</em><small className="csp-focus-task-time">{task?.meta.split(' · ')[1] ?? 'Not Available'}</small><i className="csp-focus-task-avatar">DT</i><span className="csp-focus-task-action">Open</span><MoreHorizontal size={14}/></button>})}</div>
  </article>;
}

function ExecutiveWeather({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const temperature = fixture.weather.tempC === null ? 'Not Available' : fixture.weather.tempC + '°C';
  return <article className="csp-card csp-weather csp-executive-weather" data-zone="weather">
    <header><b>Today’s World</b><button type="button" onClick={()=>onAction?.('weather','view-more')}>View More</button></header>
    <div className="csp-executive-weather-current"><span><b>{fixture.weather.city}</b><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC === null ? 'false' : 'true'}>{temperature}</strong><small>{fixture.weather.condition}</small></span><i className="csp-executive-weather-art" aria-hidden="true"><WeatherIcon condition={fixture.weather.condition} size={64}/></i></div>
    <div className="csp-executive-weather-details"><span>Humidity {fixture.weather.humidity}%</span><span>Wind {fixture.weather.windKph} km/h</span><span>UV {fixture.weather.uv}</span></div>
    <footer className="csp-executive-forecast">{['Next','Later','Tomorrow','Following'].map((label)=><span key={label}><small>{label}</small><WeatherIcon condition={fixture.weather.condition} size={18}/><b>Not Available</b></span>)}</footer>
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

function HorizonProjects({ onAction }: { onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const cards = ['skyline','campus','connected','mountain','city','ai'];
  return <article className="csp-card csp-horizon-projects" data-zone="workspace-projects">
    <header><span><b>Project Spotlight</b><small>Authorized Global Initiatives</small></span><button type="button" onClick={()=>onAction?.('workspace-projects','view-all')}>View All <ChevronRight size={13}/></button></header>
    <div>{cards.map((tone,index)=><button type="button" className={`project-${tone}`} key={tone} onClick={()=>onAction?.('workspace-projects','open-project')}><span aria-hidden="true"/><i><b>Not Available</b><small>Authorized Project Data Unavailable</small><span className={`csp-horizon-project-track track-${index}`} aria-hidden="true"><i/></span></i><em>Not Available</em></button>)}</div>
  </article>;
}

function HorizonPurposeBanner() {
  return <article className="csp-horizon-purpose" data-zone="announcement"><span>Great Organisations<br/>Are Built By Great People.</span><ChevronRight size={15}/></article>;
}

function MasterRecords({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const records = Array.from({length:10},(_,index)=>fixture.tasks[index] ?? null);
  return <article className="csp-card csp-master" data-zone="master-list"><header><div><b>Authorized Records <em>({fixture.tasks.length})</em></b><small className="csp-scope-note">Workspace Records · Authorized Scope</small></div><button type="button" className="primary" onClick={()=>onAction?.('master-list','new-record')}><Plus size={14}/> New Record</button></header><div className="csp-master-tabs"><button type="button" className="active" onClick={()=>onAction?.('master-list','filter-all')}>All <b>{fixture.tasks.length}</b></button><button type="button" onClick={()=>onAction?.('master-list','filter-priority')}>Priority</button><button type="button" onClick={()=>onAction?.('master-list','filter-recent')}>Recent</button></div><div className="csp-master-toolbar" aria-label="Authorized Record Filters"><button type="button" onClick={()=>onAction?.('master-list','filter-type')}>All Types</button><button type="button" onClick={()=>onAction?.('master-list','filter-status')}>All Statuses</button><label><Search size={13}/><input aria-label="Search Authorized Records" placeholder="Search Records"/></label></div><div className="csp-master-sort"><span>Sort: <b>Last Updated</b></span><ChevronDown size={12}/></div>{records.map((record,index)=><button type="button" className={index===0?'selected':''} key={record?.title ?? `record-unavailable-${index}`} onClick={()=>onAction?.('master-list','select-record')}><i className={`csp-master-record-icon tone-${index%5}`}><BriefcaseBusiness size={15}/></i><span><b>{record?.title ?? 'Not Available'}</b><small>{record?.meta ?? 'Authorized Record Unavailable'}</small><i className={`csp-master-record-track track-${index}`} aria-hidden="true"><i/></i></span><em>{record?.priority ?? 'Not Available'}</em><Star className="csp-master-star" size={13}/></button>)}</article>;
}

function MasterDetailSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const taskCounts = [
    ['Completed', fixture.tasks.filter((task)=>task.priority==='Low').length, 'done'],
    ['In Progress', fixture.tasks.filter((task)=>task.priority==='Medium').length, 'active'],
    ['Needs Attention', fixture.tasks.filter((task)=>task.priority==='High').length, 'risk'],
  ] as const;
  return <article className="csp-card csp-detail csp-master-detail-surface" data-zone="master-detail">
    <section className="csp-detail-banner">
      <img src="/reference-images/signin/daylight-glass-skyline.webp" alt="" aria-hidden="true"/>
      <div className="csp-detail-banner-copy"><i><Monitor size={21}/></i><span className="csp-eyebrow">Selected Record</span><h2>Selected Record</h2><p>{fixture.workspace.subtitle}</p><footer><span>Authorized Scope</span><span>Record Data: Not Available</span><span>{fixture.workspace.name}</span></footer></div>
      <div className="csp-detail-banner-actions"><button type="button" onClick={()=>onAction?.('master-detail','share')}>Share</button><button type="button" onClick={()=>onAction?.('master-detail','edit')}>Edit</button><button type="button" onClick={()=>onAction?.('master-detail','more')}><MoreHorizontal size={14}/> More</button></div>
    </section>
    <nav className="csp-detail-tabs" aria-label="Selected Record Sections"><button type="button" className="active" onClick={()=>onAction?.('master-detail','overview')}>Overview</button><button type="button" onClick={()=>onAction?.('master-detail','tasks')}>Tasks <b>{fixture.tasks.length}</b></button><button type="button" onClick={()=>onAction?.('master-detail','milestones')}>Milestones <b>Not Available</b></button><button type="button" onClick={()=>onAction?.('master-detail','documents')}>Documents <b>Not Available</b></button><button type="button" onClick={()=>onAction?.('master-detail','team')}>Team <b>Not Available</b></button><button type="button" onClick={()=>onAction?.('master-detail','financials')}>Financials</button><button type="button" onClick={()=>onAction?.('master-detail','activity')}>Activity</button></nav>
    <div className="csp-detail-kpis">{[['Record Health','Not Available'],['Completion','Not Available'],['Time Remaining','Not Available'],['Budget Utilisation','Not Available'],['Team Members','Not Available']].map(([label,value],index)=><span key={label}><i className={`tone-${index}`} aria-hidden="true">{index===0?<ShieldCheck size={18}/>:index===1?<Gauge size={18}/>:index===2?<CalendarDays size={18}/>:index===3?<BarChart3 size={18}/>:<Users size={18}/>}</i><small>{label}</small><b>{value}</b><em>{index===0?'Authorized Status Unavailable':'Approved Data Required'}</em></span>)}</div>
    <div className="csp-detail-lower"><section className="csp-detail-progress"><header><b>Progress Trend</b><button type="button" onClick={()=>onAction?.('master-detail','change-period')}>Last 6 Months <ChevronDown size={13}/></button></header><div className="csp-detail-progress-chart"><MiniLineChart chartId="master-detail-progress"/><span className="csp-analytics-grid" aria-hidden="true"/></div><footer><span><i/>Planned</span><span><i/>Actual</span><span><i/>Forecast</span></footer></section><section className="csp-detail-task-status"><header><b>Task Status</b><button type="button" onClick={()=>onAction?.('master-detail','view-tasks')}>View All</button></header><div className="csp-task-ring" aria-hidden="true"><i>{fixture.tasks.length}<small>Tasks</small></i></div><div className="csp-task-legend">{taskCounts.map(([label,count,tone])=><span key={label}><i className={tone}/>{label}<b>{count}</b></span>)}</div></section><aside className="csp-detail-inspector"><header><b>Record Details</b><button type="button" onClick={()=>onAction?.('master-detail','edit-details')}>Edit</button></header>{[['Workspace',fixture.workspace.name],['Viewer',formatPersonName(fixture.viewer.displayName)],['Role',formatUiLabel(fixture.viewer.role)],['Release',fixture.release.version],['Start Date','Not Available'],['Target Date','Not Available'],['Priority','Not Available'],['Data Scope','Authorized']].map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</aside></div>
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
  return <article className="csp-card csp-workspace-weather" data-zone="weather"><header><span><WeatherIcon condition={fixture.weather.condition} size={17}/><b>Weather</b></span><button type="button" onClick={()=>onAction?.('weather','view-more')}>{fixture.weather.city}</button></header><div className="csp-workspace-weather-current"><WeatherIcon condition={fixture.weather.condition} size={42}/><span><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC===null?'false':'true'}>{temperature}</strong><small>{fixture.weather.condition}</small></span></div><p>Humidity {fixture.weather.humidity}% · Wind {fixture.weather.windKph} km/h · UV {fixture.weather.uv}</p><footer>{['Next','Later','Tomorrow','Following'].map((label)=><span key={label}><small>{label}</small><WeatherIcon condition={fixture.weather.condition} size={14}/><b>Not Available</b></span>)}</footer></article>;
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


function InsightDataStorySurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const revenue = fixture.kpis[1];
  return <article className="csp-card csp-insight-data-story" data-zone="executive-analytics"><header><span><b>Data Story</b><small>Turning Numbers Into A Brighter Tomorrow</small></span><button type="button" onClick={() => onAction?.('executive-analytics','view-story')}>View More</button></header><section><h2>Authorized Growth Signals</h2><p>Current workspace indicators are presented from approved data. Narrative detail remains Not Available where no approved field exists.</p><div className="csp-insight-data-metric"><small>{revenue?.label ?? 'Revenue Signal'}</small><b>{revenue?.value ?? 'Not Available'}</b><em>{revenue?.delta ?? 'Not Available'}</em></div><div className="csp-insight-data-chart" aria-label="Decorative data-story trend; live series unavailable"><MiniLineChart chartId="insight-data-story"/></div><footer>{[fixture.kpis[2],fixture.kpis[0],fixture.kpis[4]].map((metric)=><span key={metric?.label ?? 'Unavailable'}><small>{metric?.label ?? 'Authorized Signal'}</small><b>{metric?.value ?? 'Not Available'}</b><em>{metric?.delta ?? 'Not Available'}</em></span>)}</footer></section></article>;
}
function InsightLatestInsightsSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const stories = Array.from({length:3},(_,index)=>fixture.activity[index] ?? null);
  return <article className="csp-card csp-insight-latest" data-zone="knowledge"><header><span><b>Latest Insights</b><small>Perspectives. Ideas. People. Progress.</small></span><button type="button" onClick={() => onAction?.('knowledge','view-all')}>View All</button></header><div className="csp-insight-latest-grid"><button type="button" className="csp-insight-feature-story" onClick={()=>onAction?.('knowledge','open-insight')}><img src="/canonical-postauth-v3/insight-magazine/editorial-team-owner-v1.webp" alt="" aria-hidden="true"/><span><em>People</em><b>Building A Culture<br/>Of Continuous Growth</b><small>{stories[0]?.meta ?? 'Authorized Activity Unavailable'}</small></span></button><section>{Array.from({length:3},(_,index)=>fixture.activity[index+1] ?? null).map((story,index)=><button type="button" key={story?.title ?? `insight-${index}`} onClick={()=>onAction?.('knowledge','open-insight')}><span className={`csp-insight-story-photo photo-${index}`} aria-hidden="true"/><span><em>{['Sustainability','Innovation','Client Success'][index]}</em><b>{story?.title ?? 'Not Available'}</b><small>{story?.meta ?? 'Authorized Insight Unavailable'}</small></span></button>)}</section></div></article>;
}
function InsightExecutiveBriefSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  return <article className="csp-card csp-insight-brief" data-zone="ai-insights"><header><span><b>Executive Brief</b><small>Key Updates For Leaders</small></span><button type="button" onClick={()=>onAction?.('ai-insights','view-all')}>View All</button></header><div className="csp-brief-lead"><i aria-hidden="true"><Sparkles size={18}/></i><span><b>Daenem AI Commentary</b><p>Authorized workspace signals are ready for review. Additional narrative detail is Not Available without an approved source.</p><small>{fixture.kpis[4]?.label ?? 'Enterprise Signal'} · {fixture.kpis[4]?.value ?? 'Not Available'}</small></span></div><button type="button" className="csp-brief-action" onClick={()=>onAction?.('ai-insights','open-brief')}>View Full Analysis <ChevronRight size={13}/></button><section className="csp-insight-brief-highlights"><header><span><BookOpen size={14}/><b>Knowledge Highlights</b></span><button type="button" onClick={()=>onAction?.('knowledge','view-all')}>View All</button></header>{Array.from({length:3},(_,index)=><button type="button" key={index} onClick={()=>onAction?.('knowledge','open-highlight')}><FileText size={13}/><span><b>Not Available</b><small>Authorized Knowledge Unavailable</small></span><ChevronRight size={12}/></button>)}</section></article>;
}
function InsightDateTime({ fixture }: { fixture: CanonicalFixture }) {
  return <article className="csp-insight-datetime" data-zone="world-time"><span><small>{fixture.dateTime.date}</small><strong>{fixture.dateTime.time}</strong><em>{fixture.dateTime.zone}</em></span><Globe2/><Globe2/><b>A More Connected<br/>Brighter Tomorrow</b></article>;
}
function InsightRightContext({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const temperature = fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`;
  return <article className="csp-insight-right-context" data-zone="weather"><section className="csp-insight-presence"><header><span><Globe2 size={17}/><b>Global Presence</b></span><button type="button" onClick={()=>onAction?.('weather','view-presence')}>View Details</button></header><div><span className="csp-insight-presence-map" aria-hidden="true"><img src="/canonical-postauth-v3/shared/world-operations-map.svg" alt=""/></span><aside>{fixture.worldTimes.map((item,index)=><span key={item.city}><i className={`tone-${index}`}/><b>{item.city}</b><small>{item.time}</small></span>)}</aside></div></section><section className="csp-insight-weather"><header><span><WeatherIcon condition={fixture.weather.condition} size={17}/><b>{fixture.weather.city} Weather</b></span></header><div><WeatherIcon condition={fixture.weather.condition} size={64}/><span><small>{fixture.weather.condition}</small><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC===null?'false':'true'}>{temperature}</strong><em>Humidity {fixture.weather.humidity}% · Wind {fixture.weather.windKph} km/h</em></span></div><footer>{['Fri','Sat','Sun','Mon'].map(day=><span key={day}><small>{day}</small><WeatherIcon condition={fixture.weather.condition} size={17}/><b>Not Available</b></span>)}</footer></section></article>;
}
function InsightQuickAi({ onAction }: { onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const actions = [['Create Project',Plus],['Add Staff',Users],['New Document',FileText],['Request Approval',CheckCircle2]] as const;
  return <article className="csp-insight-quick-ai" data-zone="quick-actions"><section><header><b>Quick Actions</b><button type="button" onClick={()=>onAction?.('quick-actions','customize')}>Customize</button></header><div>{actions.map(([label,Icon])=><button type="button" key={label} onClick={()=>onAction?.('quick-actions',label.toLowerCase().replaceAll(' ','-'))}><Icon size={15}/><span>{label}</span></button>)}</div></section><section><header><span><Sparkles size={16}/><b>Ask Daenem AI</b></span><em>BETA</em></header><form onSubmit={(event)=>{event.preventDefault();onAction?.('quick-actions','ask-ai')}}><input aria-label="Ask Daenem AI" placeholder="Ask anything about your organisation..."/><button type="submit" aria-label="Send"><ChevronRight size={14}/></button></form></section></article>;
}
function InsightPurposeStrip({ fixture }: { fixture: CanonicalFixture }) {
  return <article className="csp-insight-purpose" data-zone="activity"><span><b>One Team<br/>A Brighter Tomorrow</b><small>Build · Empower · Grow</small></span><blockquote>“Great Organisations Are Built<br/>By Great People.”<small>— Daenem Global</small></blockquote><div>{[fixture.kpis[0],fixture.kpis[2],fixture.kpis[4]].map(metric=><span key={metric?.label ?? 'Unavailable'}><b>{metric?.value ?? 'Not Available'}</b><small>{metric?.label ?? 'Authorized Signal'}</small></span>)}</div></article>;
}
function OperationalTelemetrySurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  return <article className="csp-card csp-operations-telemetry" data-zone="executive-analytics">
    <header><span><BarChart3 size={17}/><b>Operational Performance</b></span><button type="button" onClick={() => onAction?.('executive-analytics','change-period')}>Last 24 Hours <ChevronRight size={13}/></button></header>
    <div className="csp-operations-chart" aria-label="Decorative operational telemetry; live series unavailable">
      <span className="csp-operations-axis" aria-hidden="true"><i>100%</i><i>75%</i><i>50%</i><i>25%</i><i>0%</i></span>
      <svg viewBox="0 0 430 150" preserveAspectRatio="none" aria-hidden="true"><path className="grid" d="M12 16H420M12 48H420M12 80H420M12 112H420M12 144H420"/><path className="line health" d="M14 52C72 52 86 63 129 51S194 48 239 31s94-17 179-19"/><path className="line tasks" d="M14 82C66 77 91 72 132 70s69 8 108-4 94-13 178-8"/><path className="line response" d="M14 110C74 102 88 112 132 105s78-13 111-35 96-3 175-7"/><g className="points">{[[14,52],[129,51],[239,31],[418,12],[14,82],[132,70],[240,66],[418,58],[14,110],[132,105],[243,70],[418,63]].map(([x,y],index)=><circle key={index} cx={x} cy={y} r="3"/>)}</g></svg>
      <button type="button" className="csp-operations-chart-inspector" aria-label="Inspect authorized operational snapshot" onClick={()=>onAction?.('executive-analytics','inspect-snapshot')}>
        <i aria-hidden="true"/>
        <span role="tooltip"><strong>Authorized Snapshot</strong><small><i className="health"/>Operations <b>{fixture.kpis[0]?.value ?? 'Not Available'}</b></small><small><i className="tasks"/>Projects <b>{fixture.kpis[2]?.value ?? 'Not Available'}</b></small><small><i className="response"/>System Signal <b>{fixture.kpis[4]?.value ?? 'Not Available'}</b></small></span>
      </button>
    </div>
    <footer><span><i className="health"/><small>Operations</small><b>{fixture.kpis[0]?.value ?? 'Not Available'}</b></span><span><i className="tasks"/><small>Projects</small><b>{fixture.kpis[2]?.value ?? 'Not Available'}</b></span><span><i className="response"/><small>System Signal</small><b>{fixture.kpis[4]?.value ?? 'Not Available'}</b></span></footer>
  </article>;
}

function OperationalQueueSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const rows = Array.from({ length: 5 }, (_, index) => fixture.tasks[index] ?? null);
  return <article className="csp-card csp-operational-queue" data-zone="tasks"><header><span><ListChecks size={17}/><b>Task &amp; Approvals Queue</b></span><button type="button" onClick={()=>onAction?.('tasks','view-all')}>View All</button></header><nav aria-label="Queue Views"><button type="button" className="active">My Tasks ({fixture.tasks.length})</button><button type="button">Approvals ({fixture.approvals.length})</button></nav><div>{rows.map((task,index)=><button type="button" key={task?.title ?? `queue-${index}`} onClick={()=>onAction?.('tasks','open-task')}><i className={`tone-${index}`} aria-hidden="true"><ListChecks size={12}/></i><span><b>{task?.title ?? 'Not Available'}</b><small>{task?.meta ?? 'Authorized Task Unavailable'}</small></span><em className={`priority ${task?.priority.toLowerCase() ?? 'low'}`}>{task?.priority ?? 'Not Available'}</em><ChevronRight size={13}/></button>)}</div></article>;
}

function OperationalAiBar({ onAction }: { onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  return <article className="csp-operational-ai-bar" data-zone="announcement"><Sparkles size={20}/><span><b>Daenem AI</b><small>Your AI Copilot For Operations</small></span><form onSubmit={(event)=>{event.preventDefault();onAction?.('announcement','ask-ai')}}><input aria-label="Ask Daenem AI About Operations" placeholder="Ask anything about operations..."/><button type="submit" aria-label="Send To Daenem AI"><ChevronRight size={15}/></button></form></article>;
}
function OperationalTeamSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const rows = Array.from({ length: 6 }, (_, index) => index);
  const filters = ['All Teams', 'Operations', 'Projects', 'Support'];
  return <article className="csp-card csp-operations-team" data-zone="operations-team"><header><span><Users size={17}/><b>Team Operations</b><em>Status Unavailable</em></span><button type="button" onClick={() => onAction?.('operations-team','view-all')}>View All</button></header><nav className="csp-team-filters" aria-label="Team Views">{filters.map((filter,index)=><button type="button" className={index===0?'active':''} key={filter} onClick={() => onAction?.('operations-team',`filter-${filter.toLowerCase().replaceAll(' ','-')}`)}>{filter}</button>)}</nav><div className="csp-team-table"><span className="csp-team-head"><b>Team</b><b>On Duty</b><b>Status</b><b>Indicator</b></span>{rows.map(index => <button type="button" key={`team-${index}`} onClick={() => onAction?.('operations-team','open-row')}><span><i className={`csp-team-avatar tone-${index % 3}`}/><b>Not Available</b></span><small>Not Available</small><em>Not Available</em><span className={`csp-team-decorative-progress p${index}`} aria-hidden="true"><i/><i/><i/></span></button>)}</div></article>;
}
function OperationalStatusSurface({ fixture }: { fixture: CanonicalFixture }) {
  const integrations = Array.from({ length: 6 }, (_, index) => index);
  return <article className="csp-card csp-status csp-operational-status" data-zone="status"><header><span><ShieldCheck size={17}/><b>System &amp; Integration Status</b></span><em>Status Unavailable</em></header>{integrations.map(index => <div key={`integration-unavailable-${index}`}><i aria-hidden="true"/><b>Not Available</b><span title="Authorized Integration Data Unavailable">Authorized Integration Data Unavailable</span></div>)}</article>;
}
function BoardRegionalMetricsSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const metrics = [fixture.kpis[0], fixture.kpis[2], fixture.kpis[4]].filter(Boolean);
  return <article className="csp-card csp-board-regional" data-zone="executive-analytics"><header><span><MapPinned size={17}/><b>Key Metrics By Region</b></span><button type="button" onClick={() => onAction?.('executive-analytics','view-regions')}>View Regions</button></header><div className="csp-board-regional-body"><img src="/canonical-postauth-v3/board-pulse/regional-map.svg" alt="" aria-hidden="true"/><span className="csp-board-regional-note">Decorative regional signal field · business region data Not Available</span></div><footer>{metrics.map(metric => <span key={metric.label}><small>{metric.label}</small><b>{metric.value}</b></span>)}</footer></article>;
}
function BoardExecutiveTrend({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const metric = fixture.kpis[1];
  return <article className="csp-card csp-board-executive-trend" data-zone="board-trend"><header><b>Executive Trend Overview</b><button type="button" onClick={()=>onAction?.('board-trend','change-period')}>Last 6 Months <ChevronDown size={13}/></button></header><nav aria-label="Board Trend Views"><button type="button" className="active">Revenue</button><button type="button">Profit</button><button type="button">Projects</button><button type="button">Customers</button></nav><div className="csp-board-trend-metric"><strong data-canonical-metric="true" data-numeric={/\d/.test(metric?.value ?? '')?'true':'false'}>{metric?.value ?? 'Not Available'}</strong><em>{metric?.delta ?? 'Not Available'}</em><small>{metric?.meta ?? 'Authorized Trend Data Unavailable'}</small></div><div className="csp-board-trend-chart"><MiniLineChart chartId="board-executive-trend"/><span className="csp-analytics-grid" aria-hidden="true"/></div><footer><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></footer></article>;
}
function StudioWeather({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action:string)=>void }) {
  const temperature = fixture.weather.tempC === null ? 'Not Available' : `${fixture.weather.tempC}°C`;
  return <article className="csp-card csp-studio-weather" data-zone="weather"><WeatherIcon condition={fixture.weather.condition} size={38}/><span><small>{fixture.weather.city}</small><strong data-canonical-metric="true" data-numeric={fixture.weather.tempC===null?'false':'true'}>{temperature}</strong><b>{fixture.weather.condition}</b></span><div><small>Humidity {fixture.weather.humidity}%</small><small>Wind {fixture.weather.windKph} km/h</small></div><button type="button" aria-label="View Forecast" onClick={()=>onAction?.('weather','view-more')}><ChevronRight size={14}/></button></article>;
}
function BoardPulseTimeline({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const rows = Array.from({length:5},(_,index)=>fixture.activity[index] ?? null);
  return <article className="csp-card csp-board-timeline" data-zone="activity"><header><span><Activity size={17}/><b>Pulse Timeline</b></span><button type="button" onClick={() => onAction?.('activity','view-all')}>View All</button></header><div>{rows.map((item, index) => <button type="button" key={item?.title ?? `pulse-${index}`} onClick={() => onAction?.('activity','open-pulse')}><i className={`pulse-${index % 3}`}/><span><b>{item?.title ?? 'Not Available'}</b><small>{item?.meta ?? 'Authorized Board Pulse Data Unavailable'}</small></span><ChevronRight size={13}/></button>)}</div></article>;
}
function BoardDecisionsSurface({ fixture, onAction }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void }) {
  const rows = Array.from({length:5},(_,index)=>fixture.approvals[index] ?? null);
  return <article className="csp-card csp-board-decisions" data-zone="approvals"><header><span><CheckCircle2 size={17}/><b>Decisions &amp; Approvals</b></span><em>Authorized</em></header>{rows.map((item,index) => <button type="button" key={item?.title ?? `decision-${index}`} onClick={() => onAction?.('approvals','open-decision')}><i className={`decision-tone-${index%4}`} aria-hidden="true"><CheckCircle2 size={13}/></i><span><b>{item?.title ?? 'Not Available'}</b><small>{item?.meta ?? 'Authorized Board Decision Data Unavailable'}</small></span><em>{item?.status ?? 'Not Available'}</em></button>)}</article>;
}
function FocusFooter({ fixture, onAction, onLayoutChange }: { fixture: CanonicalFixture; onAction?: (zone: CanonicalZoneId, action: string) => void; onLayoutChange?: (id: StaffPortalLayoutId) => void }) {
  return <article className="csp-focus-footer" data-zone="world-time"><button type="button" className="csp-focus-footer-announcement" onClick={()=>onAction?.('world-time','open-announcement')}><Bell size={16}/><span><b>Latest Announcements</b><small>Latest Update From {fixture.workspace.name}</small></span><ChevronRight size={13}/></button><span className="csp-focus-footer-state"><i><Command size={15}/></i><span><b>You’re In Focus &amp; Flow</b><small>A cleaner way to get things done.</small></span></span><nav><small>Switch Layout:</small>{(['executive-command','workspace-canvas','focus-flow'] as StaffPortalLayoutId[]).map(id => <button type="button" className={id==='focus-flow'?'active':''} key={id} onClick={() => { onAction?.('world-time', `switch-${id}`); onLayoutChange?.(id); }}>{CANONICAL_LAYOUT_SPECS[id].name}</button>)}</nav></article>;
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
  if (zone==='kpis') return <CanonicalKpis fixture={fixture} layoutId={layoutId}/>;
  const title = zoneTitles[zone] || zone;
  if (zone==='insight-story') return <InsightStory onAction={onAction}/>;
  if (zone==='horizon-global') return <GlobalOperationsPanel fixture={fixture}/>;
  if (zone==='ai-insights' && layoutId==='operational-cockpit') return <OperationalSignals fixture={fixture} onAction={onAction}/>;
  if (zone==='ai-insights' && layoutId==='enterprise-studio') return <StudioInspectorPanel onAction={onAction}/>;
  if (zone==='ai-insights' && layoutId==='focus-flow') return <FocusAi fixture={fixture} onAction={onAction}/>;
  if (zone==='executive-analytics' && layoutId==='executive-command') return <ExecutiveAnalyticsPair fixture={fixture} onAction={onAction}/>;
  if (layoutId==='operational-cockpit' && zone==='executive-analytics') return <OperationalTelemetrySurface fixture={fixture} onAction={onAction}/>;
  if (layoutId==='insight-magazine' && zone==='executive-analytics') return <InsightDataStorySurface fixture={fixture} onAction={onAction}/>;
  if (layoutId==='board-pulse' && zone==='board-trend') return <BoardExecutiveTrend fixture={fixture} onAction={onAction}/>;
  if (layoutId==='board-pulse' && zone==='executive-analytics') return <BoardRegionalMetricsSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='executive-analytics' || zone==='board-trend') {
    const singleTitle=singleAnalyticsTitles[layoutId];
    if (singleTitle) return <SingleAnalyticsSurface zone={zone} title={zone==='board-trend' ? singleTitle : singleTitle} fixture={fixture} layoutId={layoutId} onAction={onAction}/>;
    return <article className="csp-card csp-analytics" data-zone={zone}><div className="csp-analytics-columns"><section className="csp-revenue-panel"><header><span><BarChart3 size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"change-period")}>Last 6 Months <ChevronRight size={14}/></button></header><div className="csp-analytics-metric"><strong data-canonical-metric="true" data-numeric={/\d/.test(fixture.kpis[1]?.value ?? '') ? 'true' : 'false'}>{fixture.kpis[1]?.value ?? 'Not Available'}</strong><span>{fixture.kpis[1]?.delta ?? 'Not Available'}</span><small>{fixture.kpis[1]?.meta ?? 'Waiting For Live Data'}</small></div><div className="csp-analytics-visual"><MiniLineChart chartId={`${zone}-revenue-fill`}/><span className="csp-analytics-grid" aria-hidden="true"/></div><footer><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></footer></section><StrategicTrends fixture={fixture}/></div></article>;
  }
  if (zone==='operations-map') return <article className="csp-card csp-map" data-zone={zone}><header><span><MapPinned size={18}/><b>{title}</b><em>Status Unavailable</em></span><button type="button" onClick={()=>onAction?.(zone,'change-region')}>All Regions <ChevronDown size={13}/></button></header><div className="csp-map-art"><img className="csp-map-topology" src="/canonical-postauth-v3/operational-cockpit/operations-map.svg" alt="" aria-hidden="true"/><svg className="csp-map-network" viewBox="0 0 900 430" aria-hidden="true"><path d="M604 274C545 222 492 208 431 236S322 318 228 283S139 219 95 190"/><path d="M604 274C542 301 478 352 401 335S295 268 226 216S164 153 126 113"/><path className="route-soft" d="M604 274C667 233 716 195 786 166S846 164 884 181"/><path className="route-soft" d="M604 274C676 306 741 327 803 356S858 395 872 414"/><path className="route-soft" d="M604 274C577 342 538 389 492 415S431 438 381 435"/><path className="route-accent" d="M604 274C644 271 682 275 720 294S779 330 835 330"/></svg><div className="csp-map-scope-rail"><span><i><BriefcaseBusiness size={16}/></i><b>Not Available</b><small>Global Offices</small></span><span><i><Users size={16}/></i><b>{fixture.kpis[0]?.value ?? 'Not Available'}</b><small>Active Staff</small></span><span><i><Workflow size={16}/></i><b>{fixture.kpis[2]?.value ?? 'Not Available'}</b><small>Active Projects</small></span><span><i><MapPinned size={16}/></i><b>Not Available</b><small>Customer Sites</small></span></div><div className="csp-map-city-labels" aria-label="Authorized global time city context">{fixture.worldTimes.filter(item=>item.city !== fixture.worldTimes[0]?.city).map((item,index)=><span key={item.city} className={`place-${index + 1}`}><b>{item.city}</b><small>Not Available</small></span>)}</div><i className="n1"/><i className="n2"/><i className="n3"/><i className="n4"/><i className="n5"/><i className="n6"/><i className="n7"/><span>{fixture.worldTimes[0]?.city ?? 'Not Available'}</span><div className="csp-map-operations-feed"><b><Activity size={13}/> Operations Feed</b>{fixture.activity.slice(0,4).map((item,index)=><span key={item.title}><i/> <time>{item.meta || 'Not Available'}</time><em>{item.title}</em></span>)}</div><div className="csp-map-controls" aria-hidden="true"><i>+</i><i>−</i><i>⌾</i></div><button type="button" className="csp-map-view-all" onClick={()=>onAction?.(zone,'view-all')}>View All Locations <ChevronRight size={13}/></button></div></article>;
  if (zone==='studio-canvas') return <article className="csp-card csp-studio" data-zone={zone}><header><span><Workflow size={18}/><b>{title}</b></span><nav className="csp-studio-canvas-tools" aria-label="Canvas Tools"><button type="button" onClick={()=>onAction?.(zone,'undo')}>Undo</button><button type="button" onClick={()=>onAction?.(zone,'redo')}>Redo</button><button type="button" onClick={()=>onAction?.(zone,'zoom-reset')}>100%</button><button type="button" onClick={()=>onAction?.(zone,'zoom-out')}>−</button><button type="button" onClick={()=>onAction?.(zone,'zoom-in')}>+</button><button type="button" onClick={()=>onAction?.(zone,'preview')}><Monitor size={13}/> Preview</button></nav><div><button type="button" onClick={()=>onAction?.(zone,"save")}>Save</button><button type="button" className="primary" onClick={()=>onAction?.(zone,"publish")}>Publish</button></div></header><div className="csp-studio-workspace"><div className="csp-studio-grid"><svg className="csp-studio-connectors" viewBox="0 0 900 600" aria-hidden="true"><defs><marker id="studio-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0 0L8 4L0 8Z" fill="#5a52d8"/></marker></defs><path markerEnd="url(#studio-arrow)" d="M450 90V150H250V220M450 150H690V220M250 220V300H160V390M250 300H440V390M690 220V330H760V430M440 390H600V430H760"/><path markerEnd="url(#studio-arrow)" d="M440 390V510M760 430V470H650V520"/></svg><StudioNode className="n1" tone="violet" label="Authorized Data Source" detail="Connected Workspace Data"/><StudioNode className="n2" tone="blue" label="Transform Step" detail="Clean & Transform"/><StudioNode className="n3" tone="violet" label="Analysis Step" detail="Authorized Analysis"/><StudioNode className="n4" tone="cyan" label="Trend View" detail="Analytical Surface"/><StudioNode className="n5" tone="success" label="Regional View" detail="Scope Comparison"/><StudioNode className="n6" tone="violet" label="Report View" detail="Ready For Review"/><StudioNode className="n8" tone="violet" label="Automation" detail="On Demand"/><StudioNode className="n9" tone="success" label="Notify Team" detail="Authorized Action"/></div><aside className="csp-studio-inspector"><header><span><Settings2 size={16}/><b>Inspector</b></span><em>Selected</em></header><label>Node Type<select aria-label="Node Type"><option>Data Source</option><option>Workflow Step</option><option>Chart / Graph</option></select></label><label>Data Source<select aria-label="Data Source"><option>Authorized Workspace Data</option><option>Live Staff Portal Data</option></select></label><label>Refresh Cycle<select aria-label="Refresh Cycle"><option>On Demand</option><option>Scheduled</option></select></label><button type="button" onClick={()=>onAction?.(zone,"configure-node")}>Configure Node <ChevronRight size={14}/></button></aside></div></article>;
  if (zone==='master-list') return <MasterRecords fixture={fixture} onAction={onAction}/>;
  if (zone==='master-detail') return <MasterDetailSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='board-agenda') return <BoardAgendaSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='workspace-schedule') return <article className="csp-card csp-list" data-zone={zone}><header><span><CalendarDays size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{fixture.activity.slice(0,4).map((item,i)=><div key={item.title}><i className={`dot d${i}`}/><span><b>{item.title}</b><small>{item.meta}</small></span><ChevronRight size={14}/></div>)}</article>;
  if (zone==='workspace-projects' && layoutId==='horizon-wide') return <HorizonProjects onAction={onAction}/>;
  if (zone==='workspace-projects') return <article className="csp-card csp-projects" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header><div>{fixture.tasks.slice(0,3).map((item,i)=><section key={item.title}><span className={`project-art p${i}`} aria-hidden="true"><i/><i/><i/></span><b>{item.title}</b><small>{item.meta}</small><span className={`csp-decorative-track project-progress-${i}`} aria-hidden="true"><i className="csp-decorative-fill"/></span><em>Not Available</em></section>)}</div></article>;
  if (layoutId==='insight-magazine' && zone==='ai-insights') return <InsightExecutiveBriefSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='ai-insights' && layoutId==='executive-command') return <ExecutiveAiInsights fixture={fixture} onAction={onAction}/>;
  if (zone==='ai-insights') return <ContextAiInsights fixture={fixture} layoutId={layoutId} onAction={onAction}/>;
  if (zone==='weather' && layoutId==='executive-command') return <ExecutiveWeather fixture={fixture} onAction={onAction}/>;
  if (zone==='weather' && layoutId==='operational-cockpit') return <OperationalWeather fixture={fixture} onAction={onAction}/>;
  if (zone==='weather' && layoutId==='insight-magazine') return <InsightRightContext fixture={fixture} onAction={onAction}/>;
  if (zone==='weather' && layoutId==='enterprise-studio') return <StudioWeather fixture={fixture} onAction={onAction}/>;
  if (zone==='weather') return <ContextWeather fixture={fixture} onAction={onAction}/>;
  if (layoutId==='focus-flow' && zone==='world-time') return <FocusFooter fixture={fixture} onAction={onAction} onLayoutChange={onLayoutChange}/>;
  if (layoutId==='insight-magazine' && zone==='world-time') return <InsightDateTime fixture={fixture}/>;
  if (zone==='world-time') return <article className="csp-card csp-world" data-zone={zone}><header><span><Globe2 size={17}/><b>{title}</b></span></header><div>{fixture.worldTimes.map(x=><span key={x.city}><small>{x.city}</small><b>{x.time}</b><em>{x.date}</em></span>)}</div></article>;
  if (zone==='tasks' && layoutId==='focus-flow') return <FocusMetrics fixture={fixture}/>;
  if (zone==='tasks' && layoutId==='operational-cockpit') return <OperationalQueueSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='tasks') return <article className="csp-card csp-list" data-zone={zone}><header><span><ListChecks size={17}/><b>{title}</b></span><em>{fixture.tasks.length}</em></header>{fixture.tasks.map(t=><div key={t.title}><input type="checkbox" aria-label={t.title}/><span><b>{t.title}</b><small>{t.meta}</small></span><em className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</em></div>)}</article>;
  if (layoutId==='board-pulse' && zone==='approvals') return <BoardDecisionsSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='approvals' && layoutId==='executive-command') return <ExecutiveApprovals fixture={fixture} onAction={onAction}/>;
  if (zone==='approvals') return <article className="csp-card csp-list" data-zone={zone}><header><span><CheckCircle2 size={17}/><b>{title}</b></span><em>{fixture.approvals.length}</em></header>{fixture.approvals.map(a=><div key={a.title}><span><b>{a.title}</b><small>{a.meta}</small></span><em className="approval-status">{a.status}</em></div>)}</article>;
  if (layoutId==='board-pulse' && zone==='activity') return <BoardPulseTimeline fixture={fixture} onAction={onAction}/>;
  if (zone==='activity' && layoutId==='executive-command') return <ExecutiveActivity fixture={fixture} onAction={onAction}/>;
  if (zone==='activity' && layoutId==='insight-magazine') return <InsightPurposeStrip fixture={fixture}/>;
  if (zone==='activity') return <article className="csp-card csp-list" data-zone={zone}><header><span><Activity size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{fixture.activity.map((a,i)=><div key={a.title}><span className="csp-activity-avatar">{i+1}</span><span><b>{a.title}</b><small>{a.meta}</small></span></div>)}</article>;
  if (zone==='quick-actions') {
    if (layoutId==='insight-magazine') return <InsightQuickAi onAction={onAction}/>;
    if (layoutId==='focus-flow') return <FocusQuickLinks onAction={onAction}/>;
    const workspace=layoutId==='workspace-canvas';
    const operationalQaActions = import.meta.env.DEV && import.meta.env.VITE_CANONICAL_QA_FIXTURE === 'true';
    const actions = layoutId==='operational-cockpit'
      ? ([['Create Project',Plus],['New Document',FileText],['Request Approval',CheckCircle2],['Run Report',BarChart3],['Open Knowledge',BookOpen],['Contact Support',Users]] as const)
      : ([['Create Project',Plus],['Add Staff',Users],['New Document',FileText],['Request Approval',CheckCircle2],['Run Report',BarChart3],['Open Knowledge',BookOpen]] as const);
    const actionDisabled = layoutId==='operational-cockpit' && !operationalQaActions;
    const triggerAction = (action: string) => { if (!actionDisabled) onAction?.(zone, action); };
    return <article className={`csp-card csp-actions${workspace?' csp-workspace-actions':''}`} data-zone={zone}>
      <header><div><b>{workspace?'Quick Command':title}</b>{workspace && <small className="csp-command-subtitle">Get things done, faster.</small>}</div><button type="button" onClick={()=>onAction?.(zone,"customize")}>Customize</button></header>
      {workspace ? <form className="csp-command-bar" onSubmit={(event)=>{event.preventDefault();triggerAction('command')}}><div className="csp-command-actions">{actions.map(([x,I])=>{const Icon=I;return <button type="button" key={x} onClick={()=>triggerAction(String(x).toLowerCase().replaceAll(" ","-"))}><Icon size={16}/>{x}</button>})}</div><label><Search size={15}/><input aria-label="Ask or type a command" placeholder="Ask or type a command..."/><button type="submit" aria-label="Run command"><ChevronRight size={15}/></button></label></form> : <div>{actions.map(([x,I])=>{const Icon=I;return <button type="button" key={x} disabled={actionDisabled} aria-disabled={actionDisabled} title={actionDisabled ? 'Authorized action unavailable' : undefined} onClick={()=>triggerAction(String(x).toLowerCase().replaceAll(" ","-"))}><Icon size={17}/>{x}</button>})}</div>}
    </article>;
  }
  if (layoutId==='insight-magazine' && zone==='knowledge') return <InsightLatestInsightsSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='knowledge') return <article className="csp-card csp-list" data-zone={zone}><header><span><BookOpen size={17}/><b>{title}</b></span><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{['Expense Claims Policy','Onboarding Guide','IT Support & Systems','Project Management Playbook'].map(x=><div key={x}><FileText size={15}/><span><b>{x}</b><small>Updated Reference</small></span><ChevronRight size={14}/></div>)}</article>;
  if (zone==='status' && layoutId==='adaptive-bento') return <AdaptiveAiForYou fixture={fixture} onAction={onAction}/>;
  if (zone==='status' && layoutId==='operational-cockpit') return <OperationalStatusSurface fixture={fixture}/>;
  if (zone==='status') return <article className="csp-card csp-status" data-zone={zone}><header><span><ShieldCheck size={17}/><b>{title}</b></span><em>{fixture.kpis[4]?.value ?? 'Not Available'} Uptime</em></header>{['Core Platform','File Storage','Authentication','Email Services'].map(x=><div key={x}><i/><b>{x}</b><span>{layoutId==='executive-command'?'Operational':'Not Available'}</span></div>)}</article>;
  if (zone==='announcement' && layoutId==='executive-command') return <ExecutiveFooter fixture={fixture} onAction={onAction} onLayoutChange={onLayoutChange}/>;
  if (zone==='announcement' && layoutId==='operational-cockpit') return <OperationalAiBar onAction={onAction}/>;
  if (zone==='announcement' && layoutId==='horizon-wide') return <HorizonPurposeBanner/>;
  if (zone==='announcement') return <article className="csp-card csp-announcement" data-zone={zone}><Bell size={20}/><div><small>NEW · {title}</small><b>Latest Update From {fixture.workspace.name}</b><span>{fixture.dateTime.date} · {fixture.dateTime.zone}</span></div><ChevronRight size={18}/></article>;
  if (zone==='bento-strategy') return layoutId==='board-pulse' ? <BoardPillarsSurface fixture={fixture} onAction={onAction}/> : <BentoStrategy fixture={fixture} onAction={onAction}/>;
  if (layoutId==='operational-cockpit' && zone==='operations-team') return <OperationalTeamSurface fixture={fixture} onAction={onAction}/>;
  if (zone==='focus-progress') return <FocusProgress fixture={fixture} onAction={onAction}/>;
  if (zone==='operations-team') { const metrics=[fixture.kpis[2],fixture.kpis[0],null,fixture.kpis[4]]; return <article className="csp-card csp-progress" data-zone={zone}><header><b>{title}</b><button type="button" onClick={()=>onAction?.(zone,"view-all")}>View All</button></header>{['Project Completion','Team Productivity','Customer Satisfaction','Operational Health'].map((x,i)=><div key={x}><span><b>{x}</b><small>{metrics[i]?.value ?? 'Not Available'}</small></span><span className={`csp-decorative-track csp-progress-decoration d${i}`} aria-hidden="true"><i className="csp-decorative-fill"/></span></div>)}</article>; }
  if (zone==='focus-priorities') return <FocusPriorityStream fixture={fixture} onAction={onAction}/>;
  if (zone==='studio-toolbox') return <article className="csp-card csp-toolbox" data-zone={zone}><header><div><b>{title}</b><small className="csp-toolbox-subtitle">Build with authorized surfaces</small></div><MoreHorizontal size={17}/></header>{studioToolGroups.map((group)=><section className="csp-toolbox-group" key={group.label}><div className="csp-toolbox-group-label"><span>{group.icon}</span>{group.label}</div><div className="csp-toolbox-items">{group.items.map((x)=><button type="button" key={x} onClick={()=>onAction?.(zone,"tool-"+x.toLowerCase().replaceAll(" ","-").replaceAll("/","-"))}><span>{group.icon}</span>{x}</button>)}</div></section>)}</article>;
  return <article className="csp-card" data-zone={zone}><header><b>{title}</b></header></article>;
}

export function CanonicalDashboard({ initialLayout='executive-command', fixture=CANONICAL_VISUAL_FIXTURE, liveSlots, onLayoutChange, onWorkspace, onSearch, onAskAi, onQuickCreate, onNotifications, onProfile, navigation, activeNavigationId, onZoneAction }: CanonicalDashboardProps) {
  const [layoutId, setLayoutId] = useState<StaffPortalLayoutId>(initialLayout);
  useEffect(() => { setLayoutId(initialLayout); }, [initialLayout]);
  const spec = CANONICAL_LAYOUT_SPECS[layoutId];
  const qaFixtureAskAi = import.meta.env.DEV && import.meta.env.VITE_CANONICAL_QA_FIXTURE === 'true' && layoutId === 'operational-cockpit'
    ? () => onZoneAction?.('ai-insights','ask-ai')
    : undefined;
  const setLayout = (id: StaffPortalLayoutId) => { setLayoutId(id); onLayoutChange?.(id); };
  const style = useMemo(()=>({ '--csp-wide-rows': spec.wideRowMinimums.map(h=>`minmax(${h}px, auto)`).join(' '), '--csp-desktop-areas': spec.desktopGridAreas.map(x=>`\"${x}\"`).join(' '), '--csp-tablet-areas': spec.tabletGridAreas.map(x=>`\"${x}\"`).join(' ') }) as CSSProperties,[spec]);
  return <div className={`csp-root csp-layout-${layoutId} csp-nav-${spec.navMode}`} data-canonical-staffportal-dashboard data-layout-id={layoutId} style={style}>
    <TopBar fixture={fixture} layoutId={layoutId} onLayoutChange={setLayout} onWorkspace={onWorkspace} onSearch={onSearch} onAskAi={onAskAi ?? qaFixtureAskAi} onQuickCreate={onQuickCreate} onNotifications={onNotifications} onProfile={onProfile}/>
    <SideNav layoutId={layoutId} navigation={navigation} activeNavigationId={activeNavigationId}/>
    <main className="csp-content">
      <LayoutRibbon layoutId={layoutId} onAction={onZoneAction}/>
      <div className="csp-grid">
        {spec.zones.includes('hero') && ((liveSlots && Object.prototype.hasOwnProperty.call(liveSlots,'hero')) ? liveSlots.hero : <CanonicalHero fixture={fixture} layoutId={layoutId} onLayoutChange={setLayout} onAction={onZoneAction}/>)}
        {spec.zones.filter(z=>z!=='hero').map(zone=><div className="csp-zone" data-zone-shell={zone} style={{gridArea:zone,order:spec.mobileOrder.indexOf(zone)}} key={zone}>{(liveSlots && Object.prototype.hasOwnProperty.call(liveSlots,zone)) ? liveSlots[zone] : <ZoneCard zone={zone} fixture={fixture} layoutId={layoutId} onAction={onZoneAction} onLayoutChange={setLayout}/>}</div>)}
      </div>
    </main>
  </div>;
}
