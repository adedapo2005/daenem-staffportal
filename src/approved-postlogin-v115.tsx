import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, Bot, BriefcaseBusiness, Building2, CalendarCheck2, Car,
  ChartNoAxesCombined, ChevronDown, ChevronRight, CircleHelp, CloudSun, Compass,
  Factory, FileText, Gauge, Globe2, Home, LayoutDashboard, LogOut, Menu, Package,
  Search, Shield, ShieldCheck, SlidersHorizontal, Sparkles, Truck, Users, Wifi,
} from 'lucide-react';
import { api, type WorkforceContext } from './auth';
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
  attendanceRule?: string;
};

type SummaryState = { status: 'loading' } | { status: 'ready'; data: Summary } | { status: 'error'; message: string };

const globalNavigation = [
  { id: 'home', label: 'Home', icon: Home, context: ['Group overview', 'My day', 'Operational pulse'] },
  { id: 'work', label: 'Work', icon: BriefcaseBusiness, context: ['Tasks & approvals', 'Forms center', 'Projects', 'Saved views'] },
  { id: 'people', label: 'People', icon: Users, context: ['Employee center', 'Attendance', 'Leave & performance', 'Payroll'] },
  { id: 'business', label: 'Business', icon: Factory, context: ['Printing', 'Bakery', 'Autos', 'Logistics', 'Homes & Properties'] },
  { id: 'finance', label: 'Finance', icon: ChartNoAxesCombined, context: ['Finance workspace', 'Receivables', 'Expenses', 'Spend intelligence'] },
  { id: 'communications', label: 'Comms', icon: Globe2, context: ['Notice board', 'Broadcast center', 'Community inbox', 'Social & Web'] },
  { id: 'admin', label: 'Admin', icon: Shield, context: ['Security center', 'Access control', 'Experience', 'Integrations'] },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DS';
}

function watTime(now: Date) {
  return new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' }).format(now);
}

function zoneTime(zone: string, now: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(now);
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(Math.round(value)) : '—';
}

function Logo() {
  return <div className="qa115-logo"><img src="/brand-assets/logo-mark.svg" alt="" /><span>DAENEM<small>STAFF PORTAL</small></span></div>;
}

function Sidebar({ active, setActive, context, onLogout }: {
  active: string;
  setActive: (id: string) => void;
  context: WorkforceContext;
  onLogout: () => Promise<void>;
}) {
  const selected = globalNavigation.find((item) => item.id === active) || globalNavigation[0];
  const primaryCompany = context.companies.find((company) => company.primary) || context.companies[0];
  return <aside className="qa115-sidebar">
    <div className="qa115-shell-brand"><Logo /></div>
    <button className="qa115-company" type="button"><span>D</span><b>{primaryCompany?.name || 'Assigned workspace'}<small>{context.roles[0]?.name || 'Staff workspace'}</small></b><ChevronDown size={14} /></button>
    <div className="qa115-adaptive-nav">
      <nav className="qa115-global-nav" aria-label="Global modules"><small>NAV</small>{globalNavigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={active === id ? 'active' : ''} title={label} aria-label={label} onClick={() => setActive(id)}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <nav className="qa115-context-nav" aria-label={`${selected.label} context`}><small>MODULE CONTEXT</small><header><b>{selected.label}</b><span>Approved StaffPortal workspace</span></header>{selected.context.map((label, index) => <button type="button" key={label} className={index === 0 ? 'active' : ''}><ChevronRight size={14} /><span>{label}</span></button>)}</nav>
    </div>
    <div className="qa115-sidebar-bottom">
      <span>WORKSPACE</span>
      <button type="button"><SlidersHorizontal size={16} /> Personalize workspace</button>
      <button type="button"><Bot size={16} /> AI Guide</button>
      <button type="button" className="qa115-user"><i>{initials(context.employee.displayName)}</i><span><b>{context.employee.displayName}</b><small>{context.employee.jobTitle || context.roles[0]?.name || 'Staff member'}</small></span><ChevronRight size={15} /></button>
      <button type="button" className="qa115-signout" onClick={() => void onLogout()}><LogOut size={15} /> Secure sign out</button>
    </div>
  </aside>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; detail: string }) {
  return <article className="qa115-metric"><span><Icon size={22} /></span><div><strong>{value}</strong><b>{label}</b><small>{detail}</small></div></article>;
}

function HomeView({ context, summary, now }: { context: WorkforceContext; summary: SummaryState; now: Date }) {
  const firstName = context.employee.displayName.split(/\s+/)[0] || 'there';
  const data = summary.status === 'ready' ? summary.data : {};
  const detail = summary.status === 'ready' ? `Your work · ${data.workDate || 'Current'}` : summary.status === 'loading' ? 'Loading current information' : 'Current information unavailable';
  const attention = [
    typeof data.securityAlerts === 'number' && data.securityAlerts > 0 ? { label: 'Security signals', value: data.securityAlerts, detail: 'High-priority signals need review.' } : null,
    typeof data.pendingApprovals === 'number' && data.pendingApprovals > 0 ? { label: 'Pending approvals', value: data.pendingApprovals, detail: 'Items await authorized review.' } : null,
    typeof data.incompleteAttendance === 'number' && data.incompleteAttendance > 0 ? { label: 'Incomplete attendance', value: data.incompleteAttendance, detail: 'Attendance records need review.' } : null,
    typeof data.overdueRequirements === 'number' && data.overdueRequirements > 0 ? { label: 'Overdue requirements', value: data.overdueRequirements, detail: 'Required work is overdue.' } : null,
    typeof data.maintenanceAlerts === 'number' && data.maintenanceAlerts > 0 ? { label: 'Maintenance alerts', value: data.maintenanceAlerts, detail: 'High-priority work orders need attention.' } : null,
  ].filter(Boolean) as Array<{ label: string; value: number; detail: string }>;

  return <>
    <section className="qa115-welcome">
      <div><span>A CONNECTED DAENEM</span><h1>Welcome back,<br /><em>{firstName}.</em></h1><p>People. Decisions. A shared direction.</p></div>
      <div className="qa115-clocks"><article><span>IBADAN</span><strong>{zoneTime('Africa/Lagos', now)}</strong><small>West Africa Time</small></article><article><span>LONDON</span><strong>{zoneTime('Europe/London', now)}</strong><small>Local time</small></article></div>
    </section>
    <section className="qa115-metrics">
      <Metric icon={Users} label="Team members" value={safeNumber(data.employees)} detail={detail} />
      <Metric icon={CalendarCheck2} label="Present today" value={safeNumber(data.present)} detail={detail} />
      <Metric icon={ShieldCheck} label="Pending approvals" value={safeNumber(data.pendingApprovals)} detail={detail} />
    </section>
    <section className="qa115-grid">
      <article className="qa115-panel qa115-attention"><header><span>YOUR WORK SUMMARY</span><h2>Needs Your Attention</h2></header>{summary.status === 'loading' ? <p className="qa115-state">Loading your work summary…</p> : summary.status === 'error' ? <p className="qa115-state">{summary.message}</p> : attention.length ? <div>{attention.slice(0, 5).map((item, index) => <button type="button" key={item.label}><i>{String(index + 1).padStart(2, '0')}</i><span><b>{item.label}</b><small>{item.value} · {item.detail}</small></span><ChevronRight size={17} /></button>)}</div> : <p className="qa115-empty"><ShieldCheck size={24} /><b>Nothing Needs Attention</b><span>No work items need your attention right now.</span></p>}</article>
      <article className="qa115-panel qa115-pulse"><header><span>YOUR WORK SUMMARY</span><h2>Operational Pulse</h2></header>{summary.status === 'ready' ? <div className="qa115-bars">{[
        ['Team members', data.employees], ['Present today', data.present], ['Pending approvals', data.pendingApprovals], ['Security alerts', data.securityAlerts],
      ].filter(([, value]) => typeof value === 'number').map(([label, value]) => <div key={String(label)}><span><b>{label}</b><em>{String(value)}</em></span><i><b style={{ width: `${Math.min(100, Math.max(7, Number(value) * 8))}%` }} /></i></div>)}</div> : <p className="qa115-state">{summary.status === 'loading' ? 'Loading operational pulse…' : 'Operational pulse is temporarily unavailable.'}</p>}</article>
      <article className="qa115-panel qa115-weather"><header><span>LOCATION COMMAND</span><h2>Ibadan Operations Context</h2></header><div><CloudSun size={42} /><span><b>Live weather</b><small>Provider-backed context from the StaffPortal Worker</small></span></div><p><Wifi size={14} /> Connected to the authenticated staging service</p></article>
      <article className="qa115-panel qa115-portfolio"><header><span>ASSIGNED PORTFOLIO</span><h2>Across your businesses</h2></header><div className="qa115-businesses"><span><Factory size={18} /> Printing & Technology</span><span><Package size={18} /> Bakery</span><span><Car size={18} /> Autos</span><span><Truck size={18} /> Logistics</span><span><Building2 size={18} /> Homes & Properties</span></div></article>
      <article className="qa115-panel qa115-activity"><header><span>ACTIVITY FEED</span><h2>Recent record activity</h2></header><p className="qa115-empty"><Activity size={24} /><b>Current activity is private</b><span>Authorized records appear here when available.</span></p></article>
      <article className="qa115-panel qa115-status"><header><span>SOURCE AVAILABILITY</span><h2>Connection status</h2></header><div><ShieldCheck size={19} /><span><b>Cloudflare staging session</b><small>Authenticated and permission scoped</small></span><em>Live</em></div><div><Wifi size={19} /><span><b>StaffPortal APIs</b><small>No fallback or fabricated production values</small></span><em>Connected</em></div></article>
    </section>
  </>;
}

function ModuleLanding({ active }: { active: string }) {
  const item = globalNavigation.find((entry) => entry.id === active) || globalNavigation[0];
  return <section className="qa115-module-landing"><div><span>APPROVED QA REVIEW EXPERIENCE</span><h2>{item.label} workspace</h2><p>The approved command interface remains active. Select a contextual destination from the left to continue within this module.</p></div><div>{item.context.map((label, index) => <article key={label}><i>{String(index + 1).padStart(2, '0')}</i><span><b>{label}</b><small>Permission-scoped StaffPortal destination</small></span><ChevronRight size={17} /></article>)}</div></section>;
}

export function ApprovedPostLoginV115({ context, onLogout }: { context: WorkforceContext; onLogout: () => Promise<void> }) {
  const [active, setActive] = useState('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [summary, setSummary] = useState<SummaryState>({ status: 'loading' });
  const activeItem = useMemo(() => globalNavigation.find((item) => item.id === active) || globalNavigation[0], [active]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let current = true;
    api<Summary>('/api/dashboard/summary').then((data) => { if (current) setSummary({ status: 'ready', data }); }).catch((error: unknown) => { if (current) setSummary({ status: 'error', message: error instanceof Error ? error.message : 'Dashboard summary is temporarily unavailable.' }); });
    return () => { current = false; };
  }, [context.sessionId]);

  return <div className="qa115-app" data-approved-postlogin="qa-review-v115" data-source-commit="09bd2051d118242bce095be012a3a763cc1f8a33">
    <Sidebar active={active} setActive={(id) => { setActive(id); setMobileNav(false); }} context={context} onLogout={onLogout} />
    {mobileNav && <div className="qa115-mobile-drawer"><button type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} /><Sidebar active={active} setActive={(id) => { setActive(id); setMobileNav(false); }} context={context} onLogout={onLogout} /></div>}
    <div className="qa115-main">
      <header className="qa115-topbar"><div className="qa115-leading"><button type="button" className="qa115-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><span>Group</span><ChevronRight size={13} /><strong>{activeItem.label}</strong></div><button type="button" className="qa115-command"><span className="qa115-orb"><Sparkles size={14} /></span><span><b>Search Anything</b><small>Authorized work, people and actions</small></span><kbd>⌘ K</kbd></button><div className="qa115-utilities"><span className="qa115-clock">{watTime(now)}<small>WAT</small></span><button type="button" aria-label="Connection status"><Wifi size={17} /></button><button type="button" aria-label="Notifications"><Bell size={17} /></button><button type="button" aria-label="Profile" className="qa115-avatar">{initials(context.employee.displayName)}</button></div></header>
      <section className="qa115-workspace-context"><div><span>GROUP / {activeItem.label.toUpperCase()}</span><h1>{active === 'home' ? 'Your Group, in Perspective.' : activeItem.label}</h1><p>{active === 'home' ? `Good morning, ${context.employee.displayName.split(/\s+/)[0] || 'there'}. Here is what needs your attention.` : 'Your permission-scoped StaffPortal workspace.'}</p></div><span><ShieldCheck size={14} /> Assigned workspace</span></section>
      <main className="qa115-content">{active === 'home' ? <HomeView context={context} summary={summary} now={now} /> : <ModuleLanding active={active} />}</main>
      <footer className="qa115-footer"><span>DAENEM · Staff Portal</span><span>QA Review V115 · Approved command interface</span><button type="button" onClick={() => void onLogout()}>Secure Sign Out <LogOut size={13} /></button></footer>
    </div>
  </div>;
}
