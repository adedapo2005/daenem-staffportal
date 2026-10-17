import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Activity, Bell, Bot, BriefcaseBusiness, Building2, CalendarCheck2, Car,
  ChartNoAxesCombined, ChevronDown, ChevronRight, CircleHelp, CloudSun, Factory,
  FileText, Gauge, Globe2, LayoutDashboard, LogOut, Menu, Package,
  Search, Settings2, Shield, ShieldCheck, SlidersHorizontal, Sparkles, Truck,
  Users, Wifi, Wrench,
} from 'lucide-react';
import { api, hasWorkforcePermission, type WorkforceContext } from './auth';
import './approved-postlogin-v115.css';

type Summary = {
  workDate?: string;
  refreshedAt?: string;
  scope?: 'aggregate' | 'personal';
  employees?: number;
  present?: number;
  incompleteAttendance?: number;
  pendingApprovals?: number;
  securityAlerts?: number;
  overdueRequirements?: number;
  maintenanceAlerts?: number;
};

type SummaryState =
  | { status: 'loading' }
  | { status: 'ready'; data: Summary }
  | { status: 'error'; message: string };

type NavigationItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  context: string[];
  permission?: string;
};

const navigation: NavigationItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, context: ['Group overview', 'Operational pulse', 'Priority queue'], permission: 'dashboard.access' },
  { id: 'self-service', label: 'Self-Service', icon: Users, context: ['My profile', 'Attendance', 'Leave and requests'] },
  { id: 'work', label: 'My Workspace', icon: BriefcaseBusiness, context: ['Tasks and approvals', 'Forms center', 'Projects'], permission: 'forms.access' },
  { id: 'cockpit', label: 'Operational Cockpit', icon: Gauge, context: ['Live operations', 'Service health', 'Assigned portfolio'], permission: 'dashboard.access' },
  { id: 'modules', label: 'Module Hub', icon: Globe2, context: ['All authorized modules', 'Recent work', 'Saved views'] },
  { id: 'actions', label: 'Action Center', icon: ShieldCheck, context: ['Approvals', 'Security signals', 'Required work'], permission: 'dashboard.access' },
  { id: 'people', label: 'People & HR', icon: Users, context: ['Employee center', 'Performance', 'Payroll'], permission: 'users.access' },
  { id: 'attendance', label: 'Attendance & Location', icon: CalendarCheck2, context: ['Attendance register', 'Location controls', 'Exceptions'], permission: 'attendance.access' },
  { id: 'payroll', label: 'Payroll Control', icon: FileText, context: ['Payroll workspace', 'Payslips', 'Approvals'], permission: 'payroll.access' },
  { id: 'printing', label: 'Printing Production', icon: Factory, context: ['Production board', 'Jobs', 'Inventory'], permission: 'printing.access' },
  { id: 'bakery', label: 'Bakery Production', icon: Package, context: ['Production', 'Stock', 'Accountability'], permission: 'bakery.access' },
  { id: 'autos', label: 'Vehicle Sales', icon: Car, context: ['Vehicles', 'Sales', 'Payments'], permission: 'autos.access' },
  { id: 'logistics', label: 'Logistics Dispatch', icon: Truck, context: ['Dispatch', 'Trips', 'Fleet'], permission: 'logistics.access' },
  { id: 'properties', label: 'Homes & Properties', icon: Building2, context: ['Properties', 'Hostels', 'Investments'], permission: 'properties.access' },
  { id: 'finance', label: 'Finance Workspace', icon: ChartNoAxesCombined, context: ['Finance center', 'Receivables', 'Spend intelligence'], permission: 'finance.access' },
];

function permittedNavigation(context: WorkforceContext) {
  return navigation.filter((item) => !item.permission || hasWorkforcePermission(context, item.permission));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DS';
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value).toLocaleString('en-GB') : '—';
}

function timeAt(zone: string, now: Date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: true }).format(now).toLowerCase();
}

function dateAt(zone: string, now: Date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', timeZoneName: 'shortOffset' }).format(now);
}

function Logo() {
  return <div className="p-logo"><svg viewBox="0 0 42 42" aria-hidden="true"><path d="M8 5h12c12 0 18 7 18 16s-6 16-18 16H8z" fill="none" stroke="currentColor" strokeWidth="5" /><path d="M9 12l17 9L9 30" fill="none" stroke="currentColor" strokeWidth="4" /></svg><span>DAENEM<small>STAFF PORTAL</small></span></div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="p-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Panel({ title, kicker, action, children, className = '' }: { title: string; kicker?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`p-panel ${className}`}><header className="p-panel-head"><div>{kicker && <span className="p-kicker">{kicker}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

function WorldClocks({ now }: { now: Date }) {
  const clocks = [
    { city: 'Daenem Complex / Ibadan', zone: 'Africa/Lagos' },
    { city: 'London', zone: 'Europe/London' },
  ];
  return <div className="v3-world">{clocks.map((clock) => <article className="v3-clock" key={clock.zone}><div><span>{clock.city}</span><strong>{timeAt(clock.zone, now)}</strong><small>{dateAt(clock.zone, now)}</small><small>{clock.zone}</small></div></article>)}</div>;
}

function Sidebar({ active, setActive, context, onLogout, items }: { active: string; setActive: (id: string) => void; context: WorkforceContext; onLogout: () => Promise<void>; items: NavigationItem[] }) {
  const current = items.find((item) => item.id === active) || items[0] || navigation[1];
  const workspaceItems = items.filter((item) => navigation.indexOf(item) < 6);
  const businessItems = items.filter((item) => navigation.indexOf(item) >= 6);
  const primaryCompany = context.companies.find((company) => company.primary) || context.companies[0];
  return <>
    <div className="p-shell-brand"><Logo /></div>
    <button className="p-company" type="button"><span className="p-company-symbol">D</span><span><strong>{primaryCompany?.name || 'Daenem Group'}</strong><small>Group workspace</small></span><ChevronDown size={15} /></button>
    <div className="p-adaptive-navigation">
      <nav className="p-global-nav" aria-label="Global navigation"><span className="p-nav-label">WORKSPACE</span>{workspaceItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={active === id ? 'active' : ''} aria-label={label} onClick={() => setActive(id)}><Icon size={17} /><span>{label}</span>{id === 'actions' && <small>0</small>}</button>)}{businessItems.length > 0 && <span className="p-nav-label">YOUR BUSINESS</span>}{businessItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={active === id ? 'active' : ''} aria-label={label} onClick={() => setActive(id)}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <nav className="p-context-nav" aria-label={`${current.label} contextual navigation`}><span className="p-nav-label">{current.label}</span><div className="p-context-heading"><strong>Available Pages</strong></div>{current.context.map((label, index) => <button type="button" className={index === 0 ? 'active' : ''} key={label}><ChevronRight size={14} /><span>{label}</span></button>)}</nav>
    </div>
    <div className="p-sidebar-bottom"><div className="p-shell-utility-label"><Shield size={14} /><span>Secure Workspace</span></div><button type="button"><SlidersHorizontal size={17} /> Personalize workspace</button><button type="button"><Bot size={17} /> AI Guide</button><button type="button" className="p-user-card"><span className="p-avatar">{initials(context.employee.displayName)}</span><span><strong>{context.employee.displayName}</strong><small>{context.roles[0]?.name || 'Staff member'}</small></span><ChevronRight size={16} /></button><button type="button" className="p-adapter-signout" onClick={() => void onLogout()}><LogOut size={16} /> Secure sign out</button></div>
  </>;
}

function Metrics({ summary }: { summary: SummaryState }) {
  const data = summary.status === 'ready' ? summary.data : {};
  const detail = summary.status === 'ready' ? `Your work · ${data.workDate || 'Current'}` : summary.status === 'loading' ? 'Loading current information' : 'Current information unavailable';
  return <div className="v3-overview-metrics employee-metrics" aria-live="polite" aria-busy={summary.status === 'loading'}><div><Users /><Metric label="Team members" value={safeNumber(data.employees)} detail={detail} /></div><div><Activity /><Metric label="Present today" value={safeNumber(data.present)} detail={detail} /></div><div><Shield /><Metric label="Pending approvals" value={safeNumber(data.pendingApprovals)} detail={detail} /></div></div>;
}

function WorkPerspective({ data }: { data: Summary }) {
  const rows = [
    { label: 'Team members', value: data.employees || 0, color: '#2d83e5' },
    { label: 'Present today', value: data.present || 0, color: '#1b9b91' },
    { label: 'Pending approvals', value: data.pendingApprovals || 0, color: '#7854d8' },
    { label: 'Attendance exceptions', value: data.incompleteAttendance || 0, color: '#c4762c' },
    { label: 'Maintenance alerts', value: data.maintenanceAlerts || 0, color: '#879b43' },
  ];
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return <Panel title="Work in perspective" kicker="AUTHORIZED SOURCE RECORDS" action={<button type="button" className="p-select">All open records <ChevronDown size={14} /></button>}><div className="p-adapter-total"><strong>{safeNumber(data.employees)}</strong><span>records</span><small>Live authenticated summary</small></div><div className="p-bars">{rows.map((row) => <div className="p-bar-row" key={row.label}><span>{row.label}<strong>{safeNumber(row.value)} records</strong></span><div><i style={{ width: `${Math.max(row.value ? 5 : 0, row.value / maximum * 100)}%`, background: row.color }} /></div></div>)}</div><p className="p-secondary">Counts and queues share the same permission-scoped StaffPortal records.</p></Panel>;
}

function StatusDistribution({ data }: { data: Summary }) {
  const total = Math.max(1, (data.present || 0) + (data.pendingApprovals || 0) + (data.securityAlerts || 0));
  const present = Math.round((data.present || 0) / total * 100);
  return <Panel title="Work across the group" kicker="AUTHORIZED RECORDS · SELECT TO INSPECT"><div className="p-adapter-donut-wrap"><div className="p-adapter-donut" style={{ background: `conic-gradient(#2d83e5 0 ${present}%,#7854d8 ${present}% 82%,#1b9b91 82% 100%)` }}><span><strong>{safeNumber(total)}</strong><small>records</small></span></div><div className="p-adapter-legend"><span><i style={{ background: '#2d83e5' }} /> Present <b>{safeNumber(data.present)}</b></span><span><i style={{ background: '#7854d8' }} /> Pending <b>{safeNumber(data.pendingApprovals)}</b></span><span><i style={{ background: '#1b9b91' }} /> Security <b>{safeNumber(data.securityAlerts)}</b></span></div></div></Panel>;
}

function Attention({ data }: { data: Summary }) {
  const items = [
    ['Pending approvals', data.pendingApprovals, 'forms'],
    ['Security signals', data.securityAlerts, 'security'],
    ['Attendance exceptions', data.incompleteAttendance, 'attendance'],
    ['Overdue requirements', data.overdueRequirements, 'requirements'],
    ['Maintenance alerts', data.maintenanceAlerts, 'facilities'],
  ].filter(([, value]) => typeof value === 'number' && Number(value) > 0);
  return <Panel title="Priority queue" kicker="REQUIRES YOUR ATTENTION" className="p-adapter-priority">{items.length ? items.map(([label, value], index) => <button type="button" className="p-adapter-priority-row" key={String(label)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{label}</strong><small>{safeNumber(value)} authorized items</small></div><ChevronRight size={16} /></button>) : <div className="p-empty"><ShieldCheck size={30} /><h3>Nothing needs attention</h3><p>No work items need your attention right now.</p></div>}</Panel>;
}

function Home({ context, summary, now }: { context: WorkforceContext; summary: SummaryState; now: Date }) {
  const firstName = context.employee.displayName.split(/\s+/)[0] || 'there';
  const data = summary.status === 'ready' ? summary.data : {};
  return <>
    <section className="v3-workspace-scene scene-layout-0" aria-label="Executive Command welcome"><div className="v3-workspace-welcome"><span className="p-kicker">A CONNECTED DAENEM</span><h1>Welcome back,<br /><span>{firstName}.</span></h1><p>People. Decisions. A shared direction.</p></div><div className="v3-workspace-clocks"><WorldClocks now={now} /></div></section>
    <Metrics summary={summary} />
    <div className="tech-widget-toolbar"><span className="p-kicker">YOUR OPERATING CANVAS</span><button type="button" className="p-btn outline"><Settings2 size={15} /> Edit widgets</button></div>
    {summary.status === 'error' && <div className="p-callout amber"><Shield size={19} /><div><strong>Current dashboard information is unavailable</strong><p>{summary.message}</p></div></div>}
    <div className="tech-dashboard-grid"><section className="tech-widget"><WorkPerspective data={data} /></section><section className="tech-widget"><StatusDistribution data={data} /></section><section className="tech-widget"><Attention data={data} /></section><section className="tech-widget"><Panel title="Location command" kicker="DAENEM COMPLEX · IBADAN"><div className="p-adapter-location"><CloudSun size={46} /><div><strong>Provider-backed context</strong><span>Weather and operating context appear only when the StaffPortal provider returns current data.</span></div></div></Panel></section></div>
  </>;
}

function ModuleView({ item }: { item: NavigationItem }) {
  return <section className="p-adapter-module"><header><span className="p-kicker">QA REVIEW V115 · AUTHORIZED WORKSPACE</span><h2>{item.label}</h2><p>Your exact approved command shell remains active. Choose an authorized destination below.</p></header><div>{item.context.map((label, index) => <button type="button" key={label}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{label}</strong><small>Permission-scoped StaffPortal destination</small></div><ChevronRight size={17} /></button>)}</div></section>;
}

export function ApprovedPostLoginV115({ context, onLogout }: { context: WorkforceContext; onLogout: () => Promise<void> }) {
  const [active, setActive] = useState('overview');
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [summary, setSummary] = useState<SummaryState>({ status: 'loading' });
  const visibleNavigation = useMemo(() => permittedNavigation(context), [context]);
  const activeItem = useMemo(() => visibleNavigation.find((item) => item.id === active) || visibleNavigation[0] || navigation[1], [active, visibleNavigation]);
  const firstName = context.employee.displayName.split(/\s+/)[0] || 'there';
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!visibleNavigation.some((item) => item.id === active)) setActive(visibleNavigation[0]?.id || 'self-service'); }, [active, visibleNavigation]);
  useEffect(() => { let current = true; const controller = new AbortController(); api<Summary>('/api/dashboard/summary', { signal: controller.signal }).then((data) => { if (current) setSummary({ status: 'ready', data }); }).catch((error: unknown) => { if (current && !controller.signal.aborted) setSummary({ status: 'error', message: error instanceof Error ? error.message : 'Dashboard summary is temporarily unavailable.' }); }); return () => { current = false; controller.abort(); }; }, [context.sessionId]);
  const navigate = (id: string) => { setActive(id); setMobileNavigation(false); };
  return <div className="p-app premium-shell-reset theme-daylight density-standard motion-calm glow-balanced glass-balanced ambient-balanced" data-approved-postlogin="qa-review-v115" data-approved-project="appgprj_6ab43337da788191886fa3d18457bc30" data-approved-version="115" data-source-commit="09bd2051d118242bce095be012a3a763cc1f8a33" data-navigation-contract="global-shell-v2" data-premium-shell-contract="premium-shell-reset-v1" data-shell-design="daenem-command-interface">
    <a className="p-skip" href="#main-content">Skip to content</a>
    <aside className="p-sidebar"><Sidebar active={active} setActive={navigate} context={context} onLogout={onLogout} items={visibleNavigation} /></aside>
    {mobileNavigation && <div className="p-responsive-navigation" role="dialog" aria-modal="true" aria-label="Navigation"><button type="button" className="p-responsive-navigation-backdrop" aria-label="Close navigation" onClick={() => setMobileNavigation(false)} /><aside className="p-responsive-navigation-sheet"><Sidebar active={active} setActive={navigate} context={context} onLogout={onLogout} items={visibleNavigation} /></aside></div>}
    <div className="p-main">
      <header className="p-topbar" data-topbar-contract="global-shell-v2"><div className="p-topbar-leading"><button type="button" className="p-iconbtn p-adapter-menu" aria-label="Open Navigation" onClick={() => setMobileNavigation(true)}><Menu size={21} /></button><span>DAENEM Staff Portal</span></div><div className="p-topbar-command-zone"><button type="button" className="p-command-button" aria-label="Open Ask DAENEM search"><span className="p-ai-orb"><Bot size={16} /></span><span className="p-command-copy"><strong>Ask DAENEM</strong><small>Search your work areas and records</small></span><span className="p-command-hint"><Search size={15} /><kbd>Ctrl / ⌘ K</kbd></span></button></div><div className="p-topbar-utilities"><span className="p-clock">{timeAt('Africa/Lagos', now)}<small>WAT</small></span><button type="button" className="p-iconbtn" aria-label="Connection status"><Wifi size={18} /></button><button type="button" className="p-iconbtn" aria-label="Help"><CircleHelp size={18} /></button><button type="button" className="p-iconbtn" aria-label="Notifications"><Bell size={18} /></button><button type="button" className="p-avatar-button" aria-label="Open profile"><span className="p-avatar">{initials(context.employee.displayName)}</span></button></div></header>
      <section className="p-shell-workspace-context" aria-labelledby="workspace-title"><div className="p-shell-breadcrumb"><span>Group</span><ChevronRight size={13} /><strong>{activeItem.label}</strong></div><div className="p-workspace-header"><div className="p-workspace-heading"><span className="p-workspace-scope">ASSIGNED WORKSPACE</span><h1 id="workspace-title">{active === 'overview' ? 'Your Group, in Perspective.' : activeItem.label}</h1><p>{active === 'overview' ? `Good day, ${firstName}. Here is what needs your attention.` : 'Your permission-scoped StaffPortal workspace.'}</p></div></div></section>
      <div className="p-demo-strip"><span><Shield size={13} /><strong>STAGING ACCEPTANCE ONLY</strong><span className="p-demo-copy">Authenticated StaffPortal data · Production remains untouched</span></span><span>{context.roles[0]?.name || 'Staff'} · Online</span></div>
      <main id="main-content" className={`p-content ${active === 'overview' ? 'v3-home-content' : ''}`} tabIndex={-1}>{active === 'overview' ? <Home context={context} summary={summary} now={now} /> : <ModuleView item={activeItem} />}</main>
    </div>
    <nav className="p-mobile-bottom-nav" aria-label="Mobile navigation">{visibleNavigation.slice(0, 4).map(({ id, label, icon: Icon }) => <button type="button" key={id} className={active === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span></button>)}<button type="button" onClick={() => setMobileNavigation(true)}><Menu size={18} /><span>More</span></button></nav>
  </div>;
}
