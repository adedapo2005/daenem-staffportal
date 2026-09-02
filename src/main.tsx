import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertTriangle, Bell, Bot, BriefcaseBusiness, Building2, CalendarCheck2,
  ChevronDown, ClipboardCheck, Clock3, Factory, Gauge, Home, LogOut, MapPin, Menu,
  MessageSquareText, Moon, PackageSearch, Palette, Radio, RefreshCw, Search, ShieldCheck, Sparkles,
  Store, Users, WalletCards, Wrench, X,
  Sun, Monitor,
} from 'lucide-react';
import { api, AuthScreen, hasWorkforcePermission, useAuth, type AccessLevel, type WorkforceContext } from './auth';
import { ModuleHub } from './module-hub';
import type { HierarchyViewId } from './module-hub';
import {
  applyThemeToDocument, normalizeThemeId, readModePreference, readThemeId,
  themeList, type ModePreference, type ThemeId,
} from './theme-system';
import './zip-theme.css';
import './zip-dashboard.css';
import './premium-staffportal.css';
import { ZipDashboard, type ZipDashboardSummary } from './zip-dashboard';

const FormsCenter = lazy(() => import('./centers').then((module) => ({ default: module.FormsCenter })));
const FacilitiesCenter = lazy(() => import('./centers').then((module) => ({ default: module.FacilitiesCenter })));
const BroadcastCenter = lazy(() => import('./broadcast-center').then((module) => ({ default: module.BroadcastCenter })));
const AiGuideView = lazy(() => import('./guidance-center').then((module) => ({ default: module.AiGuideView })));
const GroupExecutiveDashboard = lazy(() => import('./executive-dashboard').then((module) => ({ default: module.GroupExecutiveDashboard })));
const SupportInbox = lazy(() => import('./support-inbox'));

type ViewName = HierarchyViewId;

type WeatherState = { label: string; temperature?: number; description?: string; loading?: boolean };
type SignupRequest = {
  id: string; employeeId: string; displayName: string; email?: string; phone?: string;
  companyId: string; companyCode: string; companyName: string; requestedJobTitle?: string;
  requestedDepartment?: string; requestedRole?: string; createdAt: string;
};
type RoleOption = { id: string; code: string; name: string; companyId?: string };
type SecurityEvent = {
  id: string; occurredAt: string; eventType: string; severity: string; result: string;
  ipAddress?: string; locationLabel?: string; riskScore?: number; employeeName?: string; companyName?: string;
};

type CompanyChoice = { id: string | null; code: string; name: string; icon: React.ComponentType<{ size?: number }> };

const SERVICE_WORKER_CACHE = 'daenem-workforce-shell-v7.0.0-alpha.9';

function registerFreshServiceWorker() {
  if (!('serviceWorker' in navigator)) return () => undefined;

  let disposed = false;
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  const reloadKey = `daenem-sw-reload:${SERVICE_WORKER_CACHE}`;
  sessionStorage.removeItem(reloadKey);

  const onControllerChange = () => {
    if (disposed || !hadController || reloading || sessionStorage.getItem(reloadKey) === '1') return;
    reloading = true;
    sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  };
  const requestActivation = (registration: ServiceWorkerRegistration) => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };
  const onUpdateFound = (registration: ServiceWorkerRegistration) => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') requestActivation(registration);
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    .then(async (registration) => {
      if (disposed) return;
      requestActivation(registration);
      registration.addEventListener('updatefound', () => onUpdateFound(registration));
      await registration.update();
      requestActivation(registration);
    })
    .catch((error: unknown) => {
      console.warn('Staff Portal service worker update was not available.', error);
    });

  return () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  };
}

const nav: Array<{ id: ViewName; label: string; description: string; icon: React.ComponentType<{ size?: number }>; permission?: string }> = [
  { id: 'overview', label: 'Group Overview', description: 'See the permitted companies, alerts, tasks and performance figures assigned to you.', icon: Gauge, permission: 'dashboard.access' },
  { id: 'people', label: 'People & Payroll', description: 'Manage approved employee, payroll and payslip functions within your assigned scope.', icon: Users },
  { id: 'forms', label: 'Forms Center', description: 'Complete, assign or review operational forms according to your permission level.', icon: ClipboardCheck, permission: 'forms.access' },
  { id: 'facilities', label: 'Facilities', description: 'Track buildings, equipment, readings, maintenance schedules and work orders.', icon: Wrench, permission: 'facilities.access' },
  { id: 'broadcasts', label: 'Broadcast Center', description: 'Draft, approve and publish employee announcements and AI-assisted daily messages.', icon: Radio, permission: 'broadcasts.access' },
  { id: 'security', label: 'Security Center', description: 'Review permitted sign-in, device, access-denial and location security events.', icon: ShieldCheck, permission: 'security.access' },
  { id: 'help', label: 'AI Guide', description: 'Ask permission-aware questions and learn what each portal function does.', icon: Bot, permission: 'ai_guide.access' },
];

const companyIcons: Record<string, React.ComponentType<{ size?: number }>> = {
  PRINT: Factory, BAKERY: Store, AUTOS: BriefcaseBusiness, LOGISTICS: Activity, PROPERTIES: Home,
};

function can(context: WorkforceContext, permission: string, minimum: AccessLevel = 'view', companyId?: string | null) {
  return hasWorkforcePermission(context, permission, minimum, companyId);
}

const PORTAL_RELEASE = {
  version: '7.0.0-alpha.15',
  date: '21 August 2026',
  changes: [
    'Recovered and protected the exact production Staff Portal source.',
    'Added business-scoped permissions so access from one company cannot appear inside another.',
    'Added clear descriptions to authorized navigation and module functions.',
    'Added reusable General Roles and audited multi-business employee assignments.',
    'Added the User Support Centre with session diagnostics, portal-only cache controls and consent-based assistance.',
    'New employees created by an administrator now begin with Provisional Employee access until final role approval.',
    'Added a company-scoped Smart Help Centre with plain-language guidance for every authorized function.',
    'Added a company-scoped API & Integrations Centre that reuses existing Social connections and never stores or displays credential values.',
    'Added Website Administration for all five businesses with R2 media, immutable revisions and review-before-publish controls.',
    'Consolidated the former Printing Web Admin into shared Website Administration without restoring duplicate routes or data stores.',
    'Linked all 44 approved Printing catalogue items to the operational Printing services used for jobs, costing and production.',
    'Provisioned future catalogue connectors for each business Web Admin module; only the completed Printing website is treated as built.',
    'Added an authorized operational-source library and automatic public-feed withholding when a vehicle, listing, product or service is no longer eligible.',
    'Added the missing Logistics service catalogue with clear pricing units and granular Logistics Services permission.',
    'Expanded Bakery control with multi-product dispatches, configurable flour bag reporting and CSV/print exports.',
    'Added an audited Bakery investigation lifecycle with evidence, assignment, resolution, reopening and independent investigation approval.',
    'Added five dedicated Bakery report links with permission-aware dashboard widgets, drill-down charts, printing and CSV exports.',
    'Completed Bakery reporting production-readiness with Theft Investigation, debt ageing, date/search filters, source references, investigator assignment and printable custody acknowledgement.',
    'Added private Bakery investigation evidence uploads with permission-controlled preview, SHA-256 integrity records, audit history and seven-year retention metadata.',
    'Released secure mobile hostel application and sponsor-confirmation pages, an internal review queue and guarded room allocation.',
    'Added a database-level room uniqueness control so concurrent requests cannot allocate the same hostel room twice.',
    'Added manual sponsor-link renewal with old-link invalidation, seven-day expiry, copy controls and audit history.',
    'Added website inquiries, careers and independently approved theme versions; Studio Ink 2.0 with Logo Concept A remains the Printing baseline.',
    'Added the Homes & Properties owner, unit and investment recovery workspace with server-calculated ROI, payback period, recovery progress and health score.',
    'Added Bakery bread custody, reseller/agent dispatch, immutable loaf and money ledgers, zero-variance close control and theft/unremitted-sales alerts.',
    'Connected completed Bakery POS sales to the loaf and money ledgers automatically and added flour-usage and agent/reseller performance reports.',
    'Paused live clocks while the portal is hidden to reduce background resource use.',
  ],
};

function watNow() {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date());
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DG';
}

function useCompanyChoices(context: WorkforceContext): CompanyChoice[] {
  return useMemo(() => {
    const canSelectScope = context.roles.some((role) => ['owner', 'group_admin'].includes(role.code));
    if (!canSelectScope) {
      return [{ id: null, code: 'GROUP', name: 'Assigned workspace', icon: Building2 }];
    }
    return [
      { id: null, code: 'GROUP', name: 'All Companies', icon: Building2 },
      ...context.companies.map((company) => ({ id: company.id, code: company.code, name: company.name, icon: companyIcons[company.code] || Building2 })),
    ];
  }, [context.companies, context.roles]);
}

function LoadingScreen() {
  return <div className="auth-loading"><div className="auth-loading-card"><span className="auth-loading-ring" /><strong>Opening Daenem Workforce Hub…</strong></div></div>;
}

function ViewLoading() {
  return <div className="empty-state tall"><span className="mini-loader" /><strong>Opening workspace…</strong></div>;
}

function PeopleView({ context, companyId }: { context: WorkforceContext; companyId: string | null }) {
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [roles, setRoles] = useState<Record<string, RoleOption[]>>({});
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const canManage = can(context, 'users.access', 'manage', companyId);

  async function loadRequests() {
    if (!can(context, 'users.access', 'view', companyId)) return;
    setLoading(true);
    try {
      const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
      const result = await api<{ requests: SignupRequest[] }>(`/api/admin/signup-requests${query}`);
      setRequests(result.requests || []);
      const companyIds = [...new Set((result.requests || []).map((request) => request.companyId))];
      const roleEntries = await Promise.all(companyIds.map(async (companyId) => {
        const roleResult = await api<{ roles: RoleOption[] }>(`/api/admin/roles?companyId=${encodeURIComponent(companyId)}`);
        return [companyId, roleResult.roles.filter((role) => role.code !== 'owner' && role.code !== 'provisional')] as const;
      }));
      setRoles(Object.fromEntries(roleEntries));
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadRequests(); }, [companyId]);

  async function approve(request: SignupRequest) {
    const roleId = selection[request.id];
    if (!roleId) { setMessage('Choose the employee role before approval.'); return; }
    setLoading(true);
    try {
      await api('/api/admin/signup-requests/approve', { method: 'POST', body: JSON.stringify({ requestId: request.id, roleId }) });
      setMessage(`${request.displayName} was approved and assigned the selected role.`);
      await loadRequests();
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  }

  return <div className="view-stack">
    <div className="view-heading"><div><span className="eyebrow">WORKFORCE CONTROL</span><h2>People, roles & payroll</h2><p>Approve employees, assign company-specific roles and keep payroll/HR access separated by permissions.</p></div><button className="text-action" onClick={loadRequests}><RefreshCw size={15} /> Refresh</button></div>
    <div className="metric-grid compact-metrics">
      <article><span className="metric-icon"><Users size={19} /></span><div><small>My company access</small><strong>{context.companies.length}</strong><em>Assigned companies</em></div></article>
      <article><span className="metric-icon"><ClipboardCheck size={19} /></span><div><small>Pending signup</small><strong>{requests.length}</strong><em>Requires authorized approval</em></div></article>
      <article><span className="metric-icon"><WalletCards size={19} /></span><div><small>Payroll permission</small><strong>{context.permissions['payroll.access'] || 'none'}</strong><em>Current access level</em></div></article>
    </div>
    <article className="panel data-panel">
      <div className="card-heading"><div><span className="eyebrow">EMPLOYEE APPROVAL QUEUE</span><h3>Provisional signups</h3></div>{loading && <span className="mini-loader" />}</div>
      {message && <div className="inline-message">{message}</div>}
      {!can(context, 'users.access', 'view', companyId) ? <div className="empty-state"><ShieldCheck size={28} /><strong>Not assigned</strong><span>Your current role does not include this employee approval queue.</span></div> : requests.length === 0 ? <div className="empty-state"><Users size={28} /><strong>No pending employee signups</strong><span>New provisional accounts will appear here for authorized review.</span></div> : <div className="approval-list">{requests.filter((request) => !companyId || request.companyId === companyId).map((request) => <div className="approval-row" key={request.id}><div className="approval-person"><div className="avatar">{initials(request.displayName)}</div><div><strong>{request.displayName}</strong><span>{request.companyName} · {request.requestedJobTitle || request.requestedRole || 'Role requested'}</span><small>{request.email || request.phone}</small></div></div><div className="approval-actions"><select value={selection[request.id] || ''} onChange={(e) => setSelection({ ...selection, [request.id]: e.target.value })} disabled={!canManage}><option value="">Select approved role…</option>{(roles[request.companyId] || []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><button className="primary-action small" disabled={!canManage || loading} onClick={() => approve(request)}>Approve</button></div></div>)}</div>}
    </article>
  </div>;
}

function SecurityView({ context, companyId }: { context: WorkforceContext; companyId: string | null }) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  async function load() {
    if (!can(context, 'security.access', 'view', companyId)) return;
    setLoading(true);
    try {
      const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
      const result = await api<{ events: SecurityEvent[] }>(`/api/security/recent${query}`);
      setEvents(result.events || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [companyId]);
  return <div className="view-stack"><div className="view-heading"><div><span className="eyebrow">SECURITY CENTER</span><h2>Login, device & access intelligence</h2><p>Security events are kept separate from ordinary business audit logs so suspicious activity is easy to investigate.</p></div><button className="text-action" onClick={load}><RefreshCw size={15} /> Refresh</button></div><article className="panel data-panel"><div className="card-heading"><div><span className="eyebrow">RECENT EVENTS</span><h3>Security log</h3></div>{loading && <span className="mini-loader" />}</div>{events.length === 0 ? <div className="empty-state"><ShieldCheck size={28} /><strong>No security events yet</strong><span>Sign-in, geofence and denied-access activity will appear here.</span></div> : <div className="security-list">{events.map((event) => <div key={event.id} className="security-row"><span className={`severity-dot ${event.severity}`} /><div><strong>{event.eventType.replaceAll('_', ' ')}</strong><span>{event.employeeName || 'Unknown identity'}{event.companyName ? ` · ${event.companyName}` : ''}</span></div><div><strong>{event.severity.toUpperCase()}</strong><span>{event.locationLabel || event.ipAddress || 'Location unavailable'}</span></div><time>{new Date(event.occurredAt).toLocaleString()}</time></div>)}</div>}</article></div>;
}

function PlaceholderView({ view, context }: { view: ViewName; context: WorkforceContext }) {
  const descriptions: Partial<Record<ViewName, string>> = {};
  return <div className="view-stack"><div className="view-heading"><div><span className="eyebrow">MODULE FOUNDATION</span><h2>{nav.find((item) => item.id === view)?.label}</h2><p>{descriptions[view]}</p></div></div><article className="panel empty-state tall"><PackageSearch size={36} /><strong>Authenticated module shell is ready</strong><span>Your current access level is enforced from server-side RBAC. This page will connect to its company-specific records and workflows.</span><small>Assigned permissions: {Object.entries(context.permissions).filter(([, level]) => level !== 'none').length}</small></article></div>;
}

function Workspace({ context, onLogout }: { context: WorkforceContext; onLogout: () => Promise<void> }) {
  const [view, setView] = useState<ViewName>(can(context, 'dashboard.access') ? 'overview' : 'help');
  const companyChoices = useCompanyChoices(context);
  const [company, setCompany] = useState<CompanyChoice>(companyChoices[0]);
  const [theme, setTheme] = useState<ThemeId>(() => readThemeId(context.employee.preferredTheme));
  const [modePreference, setModePreference] = useState<ModePreference>(() => readModePreference());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [clock, setClock] = useState(watNow());
  const [weather, setWeather] = useState<WeatherState>({ label: 'Location not enabled' });
  const [online, setOnline] = useState(navigator.onLine);
  const [summary, setSummary] = useState<ZipDashboardSummary | null>(null);

  useEffect(() => {
    const appliedTheme = applyThemeToDocument(theme, modePreference);
    localStorage.setItem('workforce-theme', appliedTheme);
    localStorage.setItem('daenem-mode', modePreference);
  }, [modePreference, theme]);
  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: unknown }>).detail;
      if (detail?.theme) setTheme(normalizeThemeId(detail.theme));
      setModePreference(readModePreference());
    };
    document.addEventListener('daenem:theme-change', onThemeChange);
    return () => document.removeEventListener('daenem:theme-change', onThemeChange);
  }, []);
  useEffect(() => {
    const refreshClock = () => { if (document.visibilityState === 'visible') setClock(watNow()); };
    const timer = window.setInterval(refreshClock, 30_000);
    const on = () => setOnline(true); const off = () => setOnline(false);
    document.addEventListener('visibilitychange', refreshClock);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshClock); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => { if (can(context, 'dashboard.access')) refreshSummary(); }, [company.id]);

  const visibleNav = nav.filter((item) => {
    if (item.id === 'people') return can(context, 'users.access', 'view', company.id) || can(context, 'payroll.access', 'view', company.id) || can(context, 'payslips.access', 'view', company.id);
    return !item.permission || can(context, item.permission, 'view', company.id);
  });
  useEffect(() => {
    if (visibleNav.some((item) => item.id === view)) return;
    setView(visibleNav[0]?.id || 'help');
  }, [company.id, context.companyPermissions, context.permissions, view]);

  async function refreshSummary() {
    try {
      const query = company.id ? `?companyId=${encodeURIComponent(company.id)}` : '';
      const result = await api<ZipDashboardSummary>(`/api/dashboard/summary${query}`);
      setSummary(result);
    } catch { setSummary(null); }
  }

  async function enableLocation() {
    if (!navigator.geolocation) { setWeather({ label: 'Geolocation unsupported' }); return; }
    setWeather({ label: 'Finding location…', loading: true });
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const result = await api<{ location?: string; temperature?: number; description?: string }>(`/api/context/weather?lat=${coords.latitude}&lon=${coords.longitude}`);
        setWeather({ label: result.location || 'Current work location', temperature: result.temperature, description: result.description || 'Weather available' });
      } catch { setWeather({ label: `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}`, description: 'GPS enabled' }); }
    }, () => setWeather({ label: 'Location permission required' }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  function navigate(next: ViewName) {
    setSidebarOpen(false);
    setView(next);
  }
  function openErpModule(id: string) {
    setSidebarOpen(false);
    window.dispatchEvent(new CustomEvent('daenem:launch-module', { detail: { id } }));
  }
  const activeTheme = themeList.find((item) => item.id === theme) || themeList[0];
  const executive = can(context, 'dashboard.access', 'manage', company.id) || context.roles.some((role) => ['owner', 'group_admin'].includes(role.code));

  function openAdmin() {
    openErpModule('admin');
  }

  let content: React.ReactNode;
  if (view === 'people') content = <PeopleView context={context} companyId={company.id} />;
  else if (view === 'forms') content = <FormsCenter context={context} companyId={company.id} />;
  else if (view === 'broadcasts') content = <BroadcastCenter context={context} companyId={company.id} />;
  else if (view === 'facilities') content = <FacilitiesCenter context={context} companyId={company.id} />;
  else if (view === 'security') content = <SecurityView context={context} companyId={company.id} />;
  else if (view === 'help') content = <AiGuideView context={context} />;
  else content = <PlaceholderView view={view} context={context} />;

  return <div>
    <ZipDashboard
      context={context}
      view={view}
      content={<Suspense fallback={<ViewLoading />}>{content}</Suspense>}
      liveIntelligence={executive ? <Suspense fallback={<ViewLoading />}><GroupExecutiveDashboard companyId={company.id} /></Suspense> : null}
      company={company}
      companyChoices={companyChoices}
      setCompany={setCompany}
      summary={summary}
      refreshSummary={refreshSummary}
      onNavigate={navigate}
      onOpenModule={openErpModule}
      onOpenModuleHub={() => window.dispatchEvent(new Event('daenem:open-module-hub'))}
      onOpenAdmin={openAdmin}
      onLogout={onLogout}
      visibleNav={visibleNav}
      theme={theme}
      modePreference={modePreference}
      setTheme={setTheme}
      setModePreference={setModePreference}
      dashboardLayout={activeTheme.dashboardLayout}
      themeName={activeTheme.name}
      clock={clock}
      weather={weather}
      enableLocation={enableLocation}
      online={online}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      release={PORTAL_RELEASE}
      releaseOpen={releaseOpen}
      setReleaseOpen={setReleaseOpen}
    />
    <ModuleHub context={context} companyId={company.id} companyCode={company.code} />
    <Suspense fallback={null}><SupportInbox context={context} /></Suspense>
  </div>;
}

function Root() {
  const auth = useAuth();
  useEffect(() => registerFreshServiceWorker(), []);
  if (auth.loading) return <LoadingScreen />;
  if (!auth.context) return <AuthScreen onAuthenticated={(context) => {
    auth.setContext(context);
    window.dispatchEvent(new Event('daenem-auth-changed'));
  }} />;
  return <Workspace context={auth.context} onLogout={auth.logout} />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
