import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Activity, ArrowUpRight, Bell, Bookmark, Bot, BrainCircuit, Building2, CalendarCheck2,
  ChartNoAxesCombined, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck, CloudSun,
  FileText, History, LayoutDashboard, LogOut, Menu, Search, Settings2, Shield,
  ShieldCheck, SlidersHorizontal, Sparkles, Sun, Users, Wifi, Wrench, Landmark,
} from 'lucide-react';
import { api, hasWorkforcePermission, type WorkforceContext } from './auth';
import './approved-postlogin-v115.css';

type Summary = {
  workDate?: string;
  employees?: number;
  present?: number;
  pendingApprovals?: number;
  securityAlerts?: number;
  incompleteAttendance?: number;
  maintenanceAlerts?: number;
};
type SummaryState = { status: 'loading' } | { status: 'ready'; data: Summary } | { status: 'error' };
type NavPage = { id: string; label: string; permission?: string };
type NavGroup = { id: string; label: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; permission?: string; pages: NavPage[] };

const navigation: NavGroup[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, pages: [{ id: 'home', label: 'Overview' }, { id: 'notifications', label: 'Action Center', permission: 'dashboard.access' }, { id: 'cockpit', label: 'Operational View', permission: 'dashboard.access' }, { id: 'hub', label: 'All Workspaces' }] },
  { id: 'my-work', label: 'My Work', icon: ClipboardCheck, pages: [{ id: 'workspace', label: 'My Workspace' }, { id: 'self-service', label: 'Self-Service' }, { id: 'tasks', label: 'Tasks & Approvals' }, { id: 'forms', label: 'Forms' }, { id: 'expenses', label: 'Expense Requests' }] },
  { id: 'people', label: 'People', icon: Users, pages: [{ id: 'people', label: 'Directory' }, { id: 'profile', label: 'My Profile' }, { id: 'attendance', label: 'Attendance' }, { id: 'leave', label: 'Leave' }, { id: 'performance', label: 'Performance' }, { id: 'payroll', label: 'Payroll' }] },
  { id: 'businesses', label: 'Businesses', icon: Building2, pages: [{ id: 'bakery', label: 'Bakery Overview' }, { id: 'printing', label: 'Printing Overview' }, { id: 'autos', label: 'Autos Overview' }, { id: 'properties', label: 'Properties Overview' }, { id: 'logistics', label: 'Logistics Overview' }] },
  { id: 'finance', label: 'Finance', icon: ChartNoAxesCombined, permission: 'finance.access', pages: [{ id: 'finance', label: 'Finance Overview' }, { id: 'banking-operations', label: 'Banking Operations' }, { id: 'receivables', label: 'Receivables' }, { id: 'budgets', label: 'Budgets & Periods' }, { id: 'expense-approvals', label: 'Expense Approvals' }, { id: 'inventory', label: 'Inventory' }] },
  { id: 'communications', label: 'Communications', icon: Activity, permission: 'communications.access', pages: [{ id: 'communications', label: 'Notices' }, { id: 'broadcasts', label: 'Broadcasts' }, { id: 'inbox', label: 'Community Inbox' }, { id: 'customer-communications', label: 'Customer Inbox' }] },
  { id: 'intelligence', label: 'Intelligence', icon: BrainCircuit, permission: 'dashboard.access', pages: [{ id: 'reports', label: 'Reports' }, { id: 'spend', label: 'Spend & Profit' }, { id: 'marketing', label: 'Marketing Insights' }, { id: 'audit', label: 'Activity & Audit' }] },
  { id: 'tools', label: 'Tools', icon: Wrench, pages: [{ id: 'help', label: 'Help & Ask DAENEM' }, { id: 'sync', label: 'Sync & Sessions' }, { id: 'theme', label: 'Appearance' }, { id: 'integrations', label: 'Integrations' }] },
  { id: 'admin', label: 'Admin', icon: Shield, pages: [{ id: 'admin', label: 'Admin Center' }, { id: 'experience', label: 'Experience' }, { id: 'security', label: 'Security' }, { id: 'access', label: 'Access Control' }, { id: 'recovery', label: 'Password Recovery' }] },
];

function permittedNavigation(context: WorkforceContext) {
  return navigation
    .filter((item) => !item.permission || hasWorkforcePermission(context, item.permission))
    .map((group) => ({
      ...group,
      pages: group.pages.filter((page) => !page.permission || hasWorkforcePermission(context, page.permission)),
    }))
    .filter((group) => group.pages.length > 0);
}

const pageDefinitions: Record<string, { title: string; description: string; purpose: string; value: string }> = {
  home: { title: 'Your Group, in Perspective.', description: 'Here is what needs your attention.', purpose: 'A permission-scoped view of the people, work, decisions and operating signals assigned to you.', value: 'Keeps priorities, authorized information and controlled actions connected in one shared workspace.' },
  'banking-operations': { title: 'Banking Operations Center', description: 'Inspect assigned financial accounts and provider-sourced transaction states without duplicating ledger truth.', purpose: 'Inspect assigned financial accounts and provider-sourced transaction states without duplicating ledger truth.', value: 'Projects assigned accounts, balances, transactions, transfer controls and reconciliation without moving real money.' },
};

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DS'; }
function safeNumber(value: unknown) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value).toLocaleString('en-GB') : '—'; }
function money(value: number) { return `₦${value.toLocaleString('en-NG')}`; }
function timeAt(zone: string, now: Date, seconds = false) { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: true }).format(now); }
function dateAt(zone: string, now: Date) { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', timeZoneName: 'shortOffset' }).format(now); }

function Logo() {
  return <div className="p-logo"><svg viewBox="0 0 42 42" aria-hidden="true"><path d="M8 5h12c12 0 18 7 18 16s-6 16-18 16H8z" fill="none" stroke="currentColor" strokeWidth="5" /><path d="M9 12l17 9L9 30" fill="none" stroke="currentColor" strokeWidth="4" /></svg><span>DAENEM<small>STAFF PORTAL</small></span></div>;
}
function Avatar({ name }: { name: string }) { return <span className="p-avatar" aria-hidden="true">{initials(name)}</span>; }
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="p-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
function Badge({ children }: { children: ReactNode }) { return <span className={`p-badge ${/Pending|Review|Degraded|Exception/.test(String(children)) ? 'amber' : /Available|Active|Complete/.test(String(children)) ? 'green' : ''}`}>{children}</span>; }
function Panel({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) { return <section className="p-panel"><header className="p-panel-head"><div>{kicker && <span className="p-kicker">{kicker}</span>}<h2>{title}</h2></div></header>{children}</section>; }

function Bars({ items }: { items: Array<[string, number]> }) {
  const maximum = Math.max(1, ...items.map(([, value]) => value));
  return <div className="p-bars">{items.map(([label, value]) => <button type="button" className="p-bar-row" key={label} disabled><span>{label}<strong>{money(value)}</strong></span><div><i style={{ width: `${value / maximum * 100}%` }} /></div></button>)}</div>;
}

function WorldClockCenter({ now }: { now: Date }) {
  const clocks = [{ id: 'ibadan', name: 'Daenem Complex / Ibadan', zone: 'Africa/Lagos' }, { id: 'london', name: 'London', zone: 'Europe/London' }];
  return <div className="tech-world compact" aria-label="World clock center">{clocks.map((clock) => <article className="tech-clock day" key={clock.id}><div><span className="tech-clock-city"><Sun size={13} /> {clock.name}</span><strong className="tech-time">{timeAt(clock.zone, now)}</strong><small>{dateAt(clock.zone, now)}</small><small>{clock.zone}</small></div></article>)}</div>;
}

function PageContext({ page }: { page: { title: string; purpose: string; value: string } }) {
  return <section className="v14-page-context" aria-label={`${page.title} page overview`}><div className="v14-context-copy"><span><Sparkles size={15} /> Overview</span><p>{page.purpose}</p></div><div className="v14-context-value"><strong>Business Value</strong><p>{page.value}</p></div><div className="v14-context-actions"><strong>Available Actions</strong><div><button type="button"><span><ArrowUpRight /></span>Inspect {page.title}</button><button type="button"><span><Search /></span>Search {page.title}</button><button type="button"><span><Bookmark /></span>Open Saved Views</button></div></div></section>;
}

function Sidebar({ groupId, pageId, context, items, onNavigate, onLogout }: { groupId: string; pageId: string; context: WorkforceContext; items: NavGroup[]; onNavigate: (group: string, page: string) => void; onLogout: () => Promise<void> }) {
  const active = items.find((item) => item.id === groupId) || items[0];
  const company = context.companies.find((item) => item.primary) || context.companies[0];
  return <><div className="p-shell-brand"><Logo /></div><button className="p-company" type="button"><span className="p-company-symbol">D</span><span><strong>{company?.name || 'Daenem Group'}</strong><small>Group workspace</small></span><ChevronDown size={15} /></button><div className="p-adaptive-navigation"><nav className="p-global-nav" aria-label="Global navigation"><span className="p-nav-label">WORKSPACE</span>{items.map(({ id, label, icon: Icon, pages }) => <button type="button" key={id} className={groupId === id ? 'active' : ''} onClick={() => onNavigate(id, pages[0]?.id || id)}><Icon size={17} aria-hidden /><span>{label}</span></button>)}</nav><nav className="p-context-nav" aria-label={`${active.label} contextual navigation`}><span className="p-nav-label">{active.label}</span><div className="p-context-heading"><strong>Available Pages</strong></div>{active.pages.map((page) => <button type="button" key={page.id} className={pageId === page.id ? 'active' : ''} aria-current={pageId === page.id ? 'page' : undefined} onClick={() => onNavigate(active.id, page.id)}><ChevronRight size={14} aria-hidden /><span>{page.label}</span></button>)}</nav></div><div className="p-sidebar-bottom"><div className="p-shell-utility-label"><Shield size={14} /><span>Secure Workspace</span></div><button type="button"><SlidersHorizontal size={17} /> Personalize workspace</button><button type="button"><Bot size={17} /> AI Guide</button><button type="button" className="p-user-card"><Avatar name={context.employee.displayName} /><span><strong>{context.employee.displayName}</strong><small>{context.roles[0]?.name || 'Staff member'}</small></span><ChevronRight size={16} /></button><button type="button" className="p-runtime-signout" onClick={() => void onLogout()}><LogOut size={16} /> Secure Sign Out</button></div></>;
}

function Home({ context, summary, now }: { context: WorkforceContext; summary: SummaryState; now: Date }) {
  const firstName = context.employee.displayName.split(/\s+/)[0] || 'there';
  const data = summary.status === 'ready' ? summary.data : {};
  const metrics = [
    { icon: <Users />, label: 'Team members', value: safeNumber(data.employees) },
    { icon: <Activity />, label: 'Present today', value: safeNumber(data.present) },
    { icon: <Shield />, label: 'Pending approvals', value: safeNumber(data.pendingApprovals) },
  ];
  return <><section className="v3-workspace-scene scene-layout-0" aria-label="Executive Command welcome"><div className="v3-workspace-welcome"><span className="p-kicker">A CONNECTED DAENEM</span><h1>Welcome back,<br /><span>{firstName}.</span></h1><p>People. Decisions. A shared direction.</p></div><div className="v3-workspace-clocks"><WorldClockCenter now={now} /></div></section><div className="v3-overview-metrics employee-metrics" aria-live="polite" aria-busy={summary.status === 'loading'}>{metrics.map((metric) => <div key={metric.label}>{metric.icon}<Metric label={metric.label} value={metric.value} detail={summary.status === 'ready' ? `Your work · ${data.workDate || 'Current'}` : 'Current information unavailable'} /></div>)}{summary.status === 'loading' && <p className="p-secondary" role="status">Loading your work summary…</p>}{summary.status === 'error' && <p className="p-secondary">Dashboard metrics are temporarily unavailable.</p>}</div><section className="v14-executive" aria-label="Executive Financial Command Center"><header className="v14-executive-head"><div><span className="p-kicker">EXECUTIVE COMMAND CENTER · CURRENT DATA REQUIRED</span><h2>Financial Position and Operating Control</h2><p>Financial information remains hidden until current records for your assigned companies are available.</p></div><Badge>Data unavailable</Badge></header><div className="p-empty"><FileText size={32} /><h3>Financial command data is unavailable</h3><p>No financial totals, records or provider states are shown from design fixtures.</p></div></section></>;
}

const accounts = [
  { institution: 'Configured institution · fixture', masked: '•••• 4821', status: 'Available' },
  { institution: 'Configured institution · fixture', masked: '•••• 1937', status: 'Pending' },
  { institution: 'Generic institution presentation', masked: '•••• 7712', status: 'Degraded' },
];

function BankingOperations() {
  const financeMetrics = [
    ['Total Balance', money(39_150_000), 'Assigned ledger balances'],
    ['Available Balance', money(38_870_000), '3 assigned accounts'],
    ['Incoming Payments', money(875_000), 'Illustrative transaction feed'],
    ['Outgoing Payments', money(1_224_500), 'Illustrative transaction feed'],
    ['Pending Transfers', '1', 'Awaiting controlled action'],
    ['Failed Transfers', '0', 'Assigned exceptions'],
    ['Reconciliations', '1', '1 exceptions'],
    ['Payroll Position', money(14_320_000), 'Submission is not payment'],
  ];
  const tabs = ['Accounts', 'Treasury', 'Verification', 'Transfers', 'Beneficiaries', 'Payroll', 'Reconciliation', 'Reports'];
  return <div className="eo-shell eo-finance"><header className="eo-hero"><div><span className="eo-icon eo-icon-banking" aria-hidden="true"><Landmark size={20} /><i /></span><span className="p-kicker">ENTERPRISE BANKING · TREASURY · FINANCIAL OPERATIONS</span><h2>Cash clarity, with controlled authority.</h2><p>Assigned accounts, verified payment events, transfers, payroll execution and reconciliation stay connected to existing ERP financial truth.</p></div><div className="eo-hero-metrics"><Metric label="Assigned accounts" value="3" /><Metric label="Awaiting control" value="1" /><Metric label="Data state" value="DEMO" detail="No production connection" /></div></header><div className="eo-truth"><ShieldCheck size={15} /><span>Design lab · Fictional records · No provider connected · No message sent · No money moved</span></div><nav className="eo-tabs" aria-label="Workspace sections">{tabs.map((tab, index) => <button type="button" className={index === 0 ? 'active' : ''} key={tab}><span>{tab}</span></button>)}</nav><section className="v14-finance-command" aria-label="Banking and Treasury Command Center"><div className="v14-finance-metrics">{financeMetrics.map(([label, value, detail]) => <Metric key={label} label={label} value={value} detail={detail} />)}</div><div className="v14-finance-overview"><Panel title="Treasury Position" kicker="CASH FLOW · AUTHORIZED FIXTURE"><Bars items={[["Money In",31_500_000],["Money Out",12_480_000],["Payroll",14_320_000],["Liquidity",38_870_000]]} /><div className="v14-command-links"><button type="button">Cash Position</button><button type="button">Revenue and Expense Trends</button></div></Panel><Panel title="Bank Connectivity" kicker="NO PARTNERSHIP CLAIMED"><div className="v14-bank-health">{accounts.map((account) => <button type="button" key={account.masked}><span className="eo-bank-mark"><Landmark size={18} /></span><span><strong>{account.institution}</strong><small>{account.masked}</small></span><Badge>{account.status}</Badge></button>)}</div></Panel><Panel title="Approvals and Reconciliation" kicker="CONTROL QUEUES"><div className="v14-control-queues"><button type="button"><span>Transfer Approvals</span><strong>1</strong><small>Maker-checker and thresholds</small></button><button type="button"><span>Reconciliation Exceptions</span><strong>1</strong><small>Evidence and independent review</small></button><button type="button"><span>Payment Verification</span><strong>Guarded</strong><small>Bank alert alone never activates service</small></button></div></Panel></div></section></div>;
}

function UnavailableWorkspace({ title }: { title: string }) {
  return <Panel title={title} kicker="AUTHORIZED WORKSPACE"><div className="p-empty"><FileText size={32} /><h3>No current records available</h3><p>This approved V115 destination will show only records returned for the authenticated employee.</p></div></Panel>;
}

export function ApprovedPostLoginV115({ context, onLogout }: { context: WorkforceContext; onLogout: () => Promise<void> }) {
  const initialBanking = typeof window !== 'undefined' && /banking|finance/.test(window.location.pathname);
  const [active, setActive] = useState(initialBanking ? 'finance' : 'home');
  const [pageId, setPageId] = useState(initialBanking ? 'banking-operations' : 'home');
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [summary, setSummary] = useState<SummaryState>({ status: 'loading' });
  const visibleNavigation = useMemo(() => permittedNavigation(context), [context]);
  const group = useMemo(() => visibleNavigation.find((item) => item.id === active) || visibleNavigation[0] || navigation[0], [active, visibleNavigation]);
  const pageLabel = group.pages.find((item) => item.id === pageId)?.label || group.label;
  const firstName = context.employee.displayName.split(/\s+/)[0] || 'there';
  const definition = pageDefinitions[pageId] || { title: pageLabel, description: 'Your permission-scoped StaffPortal workspace.', purpose: `Open the authorized ${pageLabel} workspace.`, value: 'Keeps assigned work, evidence and controlled actions connected to the same StaffPortal record model.' };
  const primaryCompany = context.companies.find((item) => item.primary) || context.companies[0];

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!visibleNavigation.some((item) => item.id === active)) {
      setActive(visibleNavigation[0]?.id || 'self-service');
      setPageId(visibleNavigation[0]?.pages[0]?.id || 'self-service');
      return;
    }
    const authorizedGroup = visibleNavigation.find((item) => item.id === active) || visibleNavigation[0];
    if (!authorizedGroup) return;
    const authorizedPage = authorizedGroup.pages.find((item) => item.id === pageId) || authorizedGroup.pages[0];
    if (authorizedPage && authorizedPage.id !== pageId) setPageId(authorizedPage.id);
  }, [active, pageId, visibleNavigation]);
  useEffect(() => { let current = true; const controller = new AbortController(); api<Summary>('/api/dashboard/summary', { signal: controller.signal }).then((data) => { if (current) setSummary({ status: 'ready', data }); }).catch(() => { if (current && !controller.signal.aborted) setSummary({ status: 'error' }); }); return () => { current = false; controller.abort(); }; }, [context.sessionId]);
  const navigate = (nextGroup: string, nextPage: string) => { setActive(nextGroup); setPageId(nextPage); setMobileNavigation(false); const path = nextPage === 'home' ? '/workspace/' : `/workspace/${nextPage}`; window.history.replaceState({}, '', path); };

  const nav = <Sidebar groupId={active} pageId={pageId} context={context} items={visibleNavigation} onNavigate={navigate} onLogout={onLogout} />;
  return <div className="p-app premium-shell-reset theme-daylight density-standard motion-calm glow-balanced glass-balanced ambient-balanced" data-approved-postlogin="qa-review-v115" data-approved-project="appgprj_6ab43337da788191886fa3d18457bc30" data-approved-version="115" data-source-commit="09bd2051d118242bce095be012a3a763cc1f8a33" data-navigation-contract="global-shell-v2" data-premium-shell-contract="premium-shell-reset-v1" data-shell-design="daenem-command-interface"><a className="p-skip" href="#main-content">Skip to content</a><aside className="p-sidebar">{nav}</aside>{mobileNavigation && <div className="p-responsive-navigation" role="dialog" aria-modal="true" aria-label="Navigation"><button type="button" className="p-responsive-navigation-backdrop" aria-label="Close navigation" onClick={() => setMobileNavigation(false)} /><aside className="p-responsive-navigation-sheet">{nav}</aside></div>}<div className="p-main"><header className="p-topbar" data-topbar-contract="global-shell-v2" data-premium-command-contract="premium-command-interface-v1"><div className="p-topbar-leading"><button type="button" className="p-iconbtn p-runtime-menu" aria-label="Open Navigation" onClick={() => setMobileNavigation(true)}><Menu size={21} /></button><span>DAENEM Staff Portal</span></div><div className="p-topbar-command-zone"><button type="button" className="p-command-button" aria-label="Open Ask DAENEM search"><span className="p-ai-orb"><Bot size={16} /></span><span className="p-command-copy"><strong>Ask DAENEM</strong><small>Search your work areas and records</small></span><span className="p-command-hint"><Search size={15} /><kbd>Ctrl / ⌘ K</kbd></span></button></div><div className="p-topbar-utilities"><span className="p-clock">{timeAt('Africa/Lagos', now)}<small>Africa/Lagos</small></span><button className="p-weather-chip" type="button" aria-label="Weather status unavailable"><CloudSun size={16} /><span>—°F</span></button><button className="p-version-chip" type="button" aria-label="Current saved version V115"><History size={15} /><span>V115</span></button><button type="button" className="p-iconbtn" aria-label="Sync Status"><Wifi size={18} /></button><button type="button" className="p-iconbtn" aria-label="Help"><CircleHelp size={18} /></button><button type="button" className="p-iconbtn" aria-label="Notifications"><Bell size={18} /></button><button type="button" className="p-avatar-button" aria-label="Open My Profile"><Avatar name={context.employee.displayName} /></button></div></header><section className="p-shell-workspace-context" aria-labelledby="workspace-title"><nav className="p-shell-breadcrumb" aria-label="Breadcrumb"><span className="p-shell-breadcrumb-item"><span>{primaryCompany?.code || 'Group'}</span></span><span className="p-shell-breadcrumb-item"><ChevronRight size={14} /><span>{group.label}</span></span>{pageId !== group.pages[0]?.id && <span className="p-shell-breadcrumb-item"><ChevronRight size={14} /><strong aria-current="page">{pageLabel}</strong></span>}</nav><div className="p-workspace-header"><div className="p-workspace-heading"><span className="p-workspace-scope"><Building2 size={14} />{primaryCompany?.name || 'Assigned workspace'}</span><h1 id="workspace-title">{definition.title}</h1><p>{pageId === 'home' ? `Good morning, ${firstName}. ${definition.description}` : definition.description}</p></div></div></section><div className="p-demo-strip"><span><Shield size={13} /><strong>DEVELOPMENT PREVIEW ONLY</strong><span className="p-demo-copy">Fictional Records · Local Simulations</span></span><button type="button">{context.roles[0]?.name || 'Staff'} · Demo Data<SlidersHorizontal size={14} /></button></div><main id="main-content" tabIndex={-1} aria-labelledby="workspace-title" className={`p-content ${pageId === 'home' ? 'v3-home-content' : ''}`}><PageContext page={definition} />{pageId === 'home' ? <Home context={context} summary={summary} now={now} /> : pageId === 'banking-operations' ? <BankingOperations /> : <UnavailableWorkspace title={definition.title} />}</main><footer className="p-footer"><span>DAENEM · Staff Portal</span><span>Demo Environment · Executive Command</span><button type="button" onClick={() => void onLogout()}>Secure Sign Out <LogOut size={13} /></button></footer></div><nav className="p-mobile-bottom-nav" aria-label="Mobile navigation">{visibleNavigation.slice(0, 5).map(({ id, label, icon: Icon, pages }) => <button type="button" key={id} className={active === id ? 'active' : ''} onClick={() => navigate(id, pages[0]?.id || id)}><Icon size={18} /><span>{label}</span></button>)}</nav></div>;
}
