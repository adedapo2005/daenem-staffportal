import { formatPersonName, initialsFromPersonName } from './canonical-postauth-v1/display-standards';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Bell, BriefcaseBusiness, CalendarCheck2, CheckCircle2,
  ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck, CloudSun, Download, Factory, Gauge, Grid3X3, GripVertical, Home, LayoutDashboard, MapPin, Menu, Plus,
  Moon, PackageSearch, Palette, Radio, RefreshCw, Search, Settings2, ShieldCheck, Sparkles,
  Sun, Users, WalletCards, Wrench, X, Boxes, MessageSquareText, Star,
} from 'lucide-react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { AccessLevel, WorkforceContext } from './auth';
import { getErpNavigation, isModuleVisible, moduleDefinitions, type ErpId, type HierarchyItem, type ModuleDefinition } from './module-hub';
import { hasWorkforcePermission, readWorldClockPreferences, requestAppInstall, saveWorldClockPreferences, WORLD_CLOCKS, WorldClocks, type ClockStyle, type WorldClockPreferences } from './auth';
import type { LayoutVariant, ModePreference, ThemeId } from './theme-system';
import { themeList } from './theme-system';
import { getMotionTokens, type LayoutDensity, type LayoutId, type LayoutProfile, type MotionPreset } from './layout-system';
import { canSeeDashboardField, type DashboardAggregateField } from './dashboard-capabilities';
import { getSmartContext } from './smart-context';
import { PostAuthHomeBanner, PostAuthLayoutRenderer } from './post-auth-experience';
import { PostAuthNavigation } from './postauth-navigation';
import { OfflineSyncIndicator } from './offline-sync';
import './qa-review-postauth.css';

export type ZipDashboardSummary = {
  workDate: string;
  refreshedAt?: string;
  employees: number;
  present: number;
  incompleteAttendance: number;
  pendingApprovals: number;
  securityAlerts: number;
  overdueRequirements: number;
  maintenanceAlerts: number;
  attendanceRule: string;
};

export type LiveDataStatus = 'loading' | 'ready' | 'error';

export type ZipCompanyChoice = {
  id: string | null;
  code: string;
  name: string;
  icon: React.ComponentType<{ size?: number }>;
};

type ViewName = 'overview' | 'people' | 'forms' | 'security' | 'broadcasts' | 'facilities' | 'help';
type WidgetId = 'trend' | 'comparison' | 'category' | 'forecast' | 'queue' | 'status' | 'news' | 'motivation';
type WidgetStyle = 'compact' | 'full' | 'card' | 'strip';

type TemperatureUnit = 'F' | 'C';

type WeatherState = {
  label: string;
  temperature?: number;
  description?: string;
  loading?: boolean;
};

type ReleaseInfo = {
  version: string;
  date: string;
};

type ZipDashboardProps = {
  context: WorkforceContext;
  view: ViewName;
  content: ReactNode;
  company: ZipCompanyChoice;
  companyChoices: ZipCompanyChoice[];
  setCompany: (company: ZipCompanyChoice) => void;
  summary: ZipDashboardSummary | null;
  dataStatus: LiveDataStatus;
  dataLastSyncedAt?: string | null;
  dataError?: string;
  liveIntelligence?: ReactNode;
  refreshSummary: () => void;
  onNavigate: (view: ViewName) => void;
  onOpenModule: (id: string) => void;
  onOpenModuleHub: () => void;
  onOpenAdmin: () => void;
  onLogout: () => Promise<void>;
  visibleNav: Array<{
    id: ViewName;
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number }>;
  }>;
  theme: ThemeId;
  modePreference: ModePreference;
  setTheme: (theme: ThemeId) => void;
  setModePreference: (mode: ModePreference) => void;
  dashboardLayout: LayoutVariant;
  themeName: string;
  clock: string;
  weather: WeatherState;
  temperatureUnit: TemperatureUnit;
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  canChangeWeatherUnit: boolean;
  enableLocation: () => void;
  online: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  release: ReleaseInfo;
  releaseOpen: boolean;
  setReleaseOpen: (open: boolean) => void;
  activeErpId: ErpId;
  layoutId: LayoutId;
  layoutProfile: LayoutProfile;
  density: LayoutDensity;
  motion: MotionPreset;
  canUseLayoutStudio: boolean;
  onOpenLayoutStudio: () => void;
  layoutPreview?: boolean;
  layoutPreviewCanApply?: boolean;
  layoutPreviewApplying?: boolean;
  layoutPreviewMessage?: string;
  onApplyLayoutPreview?: () => void | Promise<void>;
  onExitLayoutPreview?: () => void;
};

const initialWidgets: WidgetId[] = [
  'trend', 'comparison', 'category', 'forecast', 'queue', 'status', 'news', 'motivation',
];

function can(context: WorkforceContext, permission: string, minimum: AccessLevel = 'view', companyId?: string | null) {
  return hasWorkforcePermission(context, permission, minimum, companyId);
}

function initials(name: string) { return initialsFromPersonName(name); }

function numberValue(value: number | undefined, fallback = '—') {
  return value === undefined ? fallback : new Intl.NumberFormat('en-NG').format(value);
}

function formatWeatherTemperature(value: number | undefined, unit: TemperatureUnit) {
  if (value === undefined) return `—°${unit}`;
  const converted = unit === 'F' ? (value * 9) / 5 + 32 : value;
  return `${Math.round(converted)}°${unit}`;
}

function formatLastSyncedAt(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function percentage(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function attendanceRate(summary: ZipDashboardSummary | null) {
  if (!summary || !finiteNumber(summary.employees) || summary.employees <= 0 || !finiteNumber(summary.present)) return 0;
  return (summary.present / summary.employees) * 100;
}

function attendancePresentation(summary: ZipDashboardSummary | null, context: WorkforceContext, companyId: string | null) {
  const canSeePresent = canSeeDashboardField(context, 'present', companyId);
  const canSeeDenominator = canSeeDashboardField(context, 'employees', companyId);
  const present = finiteNumber(summary?.present) ? summary.present : undefined;
  const employees = finiteNumber(summary?.employees) ? summary.employees : undefined;
  if (!canSeePresent || present === undefined) return { value: '—', detail: 'Attendance data unavailable for this scope' };
  if (canSeeDenominator && employees !== undefined && employees > 0) {
    return { value: percentage((present / employees) * 100), detail: 'Present Today In Authorized Scope' };
  }
  return { value: numberValue(present), detail: 'Present Today In Authorized Scope' };
}

function CommandPalette({
  context, company, visibleNav, onNavigate, onOpenModule, onOpenModuleHub, onClose,
}: Pick<ZipDashboardProps, 'context' | 'company' | 'visibleNav' | 'onNavigate' | 'onOpenModule' | 'onOpenModuleHub'> & { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const availableModules = useMemo(() => moduleDefinitions
    .filter((module) => module.id !== 'layout-studio')
    .filter((module) => isModuleVisible(context, module, company.id, company.code)), [company.code, company.id, context]);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const viewResults = visibleNav.map((item) => ({ kind: 'view' as const, id: item.id, label: item.label, detail: item.description }));
    const moduleResults = availableModules.map((item) => ({ kind: 'module' as const, id: item.id, label: item.label, detail: item.detail }));
    return [...viewResults, ...moduleResults].filter((item) => !normalized || (item.label + ' ' + item.detail).toLowerCase().includes(normalized)).slice(0, 20);
  }, [availableModules, query, visibleNav]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelectedIndex((index) => Math.min(index, Math.max(0, results.length - 1))); }, [results.length]);
  function choose(item: typeof results[number]) {
    onClose();
    if (item.kind === 'view') onNavigate(item.id);
    else onOpenModule(item.id);
  }
  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1))); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)); }
    if (event.key === 'Enter' && results[selectedIndex]) { event.preventDefault(); choose(results[selectedIndex]); }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  }
  return <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title" onMouseDown={(event) => event.stopPropagation()} data-command-palette="true">
      <header><div><span className="eyebrow">AUTHORIZED WORKSPACES</span><h2 id="command-palette-title">What Do You Need Next?</h2></div><button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close Command Palette"><X size={16} /></button></header>
      <label className="command-palette-input"><Search size={17} aria-hidden="true" /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }} onKeyDown={handleKeyDown} placeholder="Search Authorized Functions" aria-label="Search Authorized Functions" /></label>
      <div className="command-palette-results" role="listbox" aria-label="Authorized Command Results">
        {results.length ? results.map((item, index) => <button type="button" key={item.kind + '-' + item.id} className={index === selectedIndex ? 'selected' : ''} onMouseEnter={() => setSelectedIndex(index)} onClick={() => choose(item)} role="option" aria-selected={index === selectedIndex} data-command-result={item.id}><span className="command-result-icon">{item.kind === 'view' ? <Gauge size={15} /> : <Boxes size={15} />}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={14} /></button>) : <div className="command-palette-empty">No Authorized Workspace Matches That Search.</div>}
      </div>
      <footer><span>Arrow Keys To Move · Enter To Open · Esc To Close</span><button type="button" onClick={() => { onClose(); onOpenModuleHub(); }}><Grid3X3 size={14} /> Open Module Hub</button></footer>
    </section>
  </div>;
}

function ZipTopBar({
  context, theme, modePreference, setTheme, setModePreference, themeName, clock, weather, temperatureUnit, setTemperatureUnit,
  canChangeWeatherUnit, enableLocation, onNavigate, onOpenModule, onOpenModuleHub, onOpenAdmin, onOpenLayoutStudio,
  canUseLayoutStudio, onLogout, company, companyChoices, setCompany, summary, release, setReleaseOpen, visibleNav,
}: Pick<ZipDashboardProps, 'context' | 'theme' | 'modePreference' | 'setTheme' | 'setModePreference' | 'themeName' | 'clock' | 'weather' | 'temperatureUnit' | 'setTemperatureUnit' | 'canChangeWeatherUnit' | 'enableLocation' | 'onNavigate' | 'onOpenModule' | 'onOpenModuleHub' | 'onOpenAdmin' | 'onOpenLayoutStudio' | 'canUseLayoutStudio' | 'onLogout' | 'company' | 'companyChoices' | 'setCompany' | 'summary' | 'release' | 'setReleaseOpen' | 'visibleNav'>) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [installState, setInstallState] = useState<'idle' | 'working' | 'installed' | 'unavailable'>('idle');
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const employeeInitials = initials(context.employee.displayName);
  const primaryRole = context.roles[0]?.name || (context.employee.status === 'provisional' ? 'Provisional Employee' : 'Employee');
  const permissionCount = Object.values(context.permissions).filter((level) => level !== 'none').length;
  const canAsk = can(context, 'ai_guide.access');
  const canSeeApprovals = can(context, 'users.access', 'view', company.id) || can(context, 'forms.access', 'view', company.id);
  const canSeeSecurity = can(context, 'security.access', 'view', company.id);
  const canSeeFacilities = can(context, 'facilities.access', 'view', company.id);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); }
      if (event.key === 'Escape') { setUtilitiesOpen(false); setSupportOpen(false); setNotificationsOpen(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  useEffect(() => {
    if (!commandOpen) window.setTimeout(() => commandTriggerRef.current?.focus(), 0);
  }, [commandOpen]);
  async function handleInstallApp() {
    if (installState === 'working') return;
    setInstallState('working');
    try { const outcome = await requestAppInstall(); setInstallState(outcome === 'accepted' ? 'installed' : outcome === 'dismissed' ? 'idle' : 'unavailable'); }
    catch { setInstallState('unavailable'); }
  }
  const notificationItems = [
    canSeeApprovals && { title: summary?.pendingApprovals ? String(summary.pendingApprovals) + ' approval' + (summary.pendingApprovals === 1 ? '' : 's') + ' need attention' : 'Approval queue is clear', detail: 'Authorized approval work', tone: summary?.pendingApprovals ? 'amber' : 'green' },
    canSeeSecurity && { title: summary?.securityAlerts ? String(summary.securityAlerts) + ' security alert' + (summary.securityAlerts === 1 ? '' : 's') + ' to review' : 'Security center is clear', detail: 'Authorized security work', tone: summary?.securityAlerts ? 'red' : 'green' },
    canSeeFacilities && { title: summary?.maintenanceAlerts ? String(summary.maintenanceAlerts) + ' maintenance item' + (summary.maintenanceAlerts === 1 ? '' : 's') + ' open' : 'No maintenance alerts', detail: 'Authorized facilities work', tone: summary?.maintenanceAlerts ? 'blue' : 'green' },
  ].filter(Boolean) as Array<{ title: string; detail: string; tone: string }>;
  if (!notificationItems.length) notificationItems.push({ title: 'No new authorized signals', detail: 'Your workspace is up to date', tone: 'green' });
  const hasAttentionSignals = notificationItems.some((item) => item.tone !== 'green');
  return <header className="top-bar" data-command-bar="true" data-hybrid-top-bar="true" aria-label="Staff Portal Global Navigation">
    <div className="postauth-top-identity" data-top-slot="workspace-identity" aria-label="Current Staff Portal Workspace"><span className="postauth-top-identity-mark"><BriefcaseBusiness size={16} /></span><span><small>DAENEM STAFF PORTAL</small><strong>Workforce Hub</strong><em>{company.name}</em></span></div>
    <div className="search-wrap" data-top-slot="global-search"><button ref={commandTriggerRef} type="button" className="top-command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open Command Palette"><Search size={17} aria-hidden="true" /><span>Search Authorized Workspaces</span><span className="search-shortcut">⌘ / Ctrl K</span></button></div>
    <div className="top-actions">
      <span data-top-slot="sync-status" className="postauth-top-slot-sync"><OfflineSyncIndicator /></span>
      {canAsk && <button data-top-slot="ai-command" className="top-action ai-button" onClick={() => onNavigate('help')} aria-label="Ask Daenem AI"><Sparkles size={16} /><span>Ask Daenem AI</span></button>}
      <div className="notification-wrap" data-top-slot="notifications"><button className="icon-button notification-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Bell size={18} /><i className={'alert-dot' + (hasAttentionSignals ? '' : ' quiet')} /></button>
        {notificationsOpen && <div className="notification-popover" role="dialog" aria-label="Notifications"><div className="popover-title"><b>Notifications</b><button className="icon-button subtle" onClick={() => setNotificationsOpen(false)} aria-label="Close Notifications"><X size={15} /></button></div><p>Signals From Your Authorized Workspaces.</p><div className="notification-list">{notificationItems.map((item) => <div className="notification-row" key={item.title}><i className={'notification-dot ' + item.tone} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>)}</div></div>}
      </div>
      <button data-top-slot="weather" className="weather-mini" onClick={enableLocation} title="Enable Location And Weather" aria-label="Enable Local Weather"><CloudSun size={19} /><span><b>{formatWeatherTemperature(weather.temperature, temperatureUnit)}</b><small>{weather.loading ? 'Finding Location…' : weather.description || weather.label}</small></span></button>
      <div className="top-utilities" data-top-slot="workspace-utilities"><button type="button" className="top-more-button" onClick={() => setUtilitiesOpen((open) => !open)} aria-expanded={utilitiesOpen} aria-label="Open Workspace Utilities"><Menu size={16} /> More</button>
        {utilitiesOpen && <div className="top-utilities-menu" role="menu"><button role="menuitem" data-top-slot="quick-create" onClick={() => { setUtilitiesOpen(false); onOpenModuleHub(); }}><Plus size={15} /> Quick Create</button><button role="menuitem" onClick={() => void handleInstallApp()}><Download size={15} /> {installState === 'working' ? 'Installing…' : installState === 'installed' ? 'App Installed' : 'Install App'}</button><button role="menuitem" onClick={() => { setUtilitiesOpen(false); setSupportOpen((open) => !open); }}><ShieldCheck size={15} /> Help & Support</button><button role="menuitem" onClick={() => { setUtilitiesOpen(false); onNavigate('help'); }}><MessageSquareText size={15} /> Messages</button><button role="menuitem" onClick={() => { setUtilitiesOpen(false); onOpenModuleHub(); }}><Star size={15} /> Favorites</button><button role="menuitem" onClick={() => { setUtilitiesOpen(false); setReleaseOpen(true); }}><Radio size={15} /> Release Notes</button></div>}
      </div>
      <div className="profile-wrap" data-top-slot="profile"><button className="profile-button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-label="Open Profile And Workspace Preferences"><span className="avatar">{employeeInitials}</span><span className="profile-name"><strong>{formatPersonName(context.employee.displayName)}</strong><small>{primaryRole}</small></span><ChevronDown size={16} /></button>
        {profileOpen && <div className="profile-menu"><div className="profile-menu-head"><span className="avatar">{employeeInitials}</span><div className="profile-menu-head-copy"><strong>{formatPersonName(context.employee.displayName)}</strong><small>{context.employee.email || "Employee Account"}</small></div></div><div className="profile-menu-access"><span>{primaryRole}</span><span>{permissionCount} Active Permissions</span></div>{companyChoices.length > 1 && <div className="profile-scope"><small>Organization Scope</small><div>{companyChoices.map((item) => { const Icon = item.icon; return <button key={item.code} className={company.code === item.code ? 'selected' : ''} onClick={() => { setCompany(item); setProfileOpen(false); }}><Icon size={14} /><span>{item.name}</span></button>; })}</div></div>}<strong>Workspace Appearance · {themeName}</strong>{themeList.map((item) => <button key={item.id} onClick={() => { setTheme(item.id); setProfileOpen(false); }} className={theme === item.id ? 'selected' : ''}><Palette size={16} /><span>{item.name}</span></button>)}<div className="mode-picker"><small>Display Mode</small><div><button className={modePreference === 'day' ? 'selected' : ''} onClick={() => setModePreference('day')}><Sun size={14} /> Light</button><button className={modePreference === 'night' ? 'selected' : ''} onClick={() => setModePreference('night')}><Moon size={14} /> Dark</button><button className={modePreference === 'auto' ? 'selected' : ''} onClick={() => setModePreference('auto')}><Sun size={14} /> Auto</button></div></div>{canChangeWeatherUnit && <div className="mode-picker temperature-picker"><small>Weather Units · Admin Control</small><div><button className={temperatureUnit === 'F' ? 'selected' : ''} onClick={() => setTemperatureUnit('F')}>°F</button><button className={temperatureUnit === 'C' ? 'selected' : ''} onClick={() => setTemperatureUnit('C')}>°C</button></div></div>}<button onClick={onOpenAdmin}><Settings2 size={16} /><span>Admin Center</span></button><button className="logout-menu" onClick={() => void onLogout()}><span>Sign Out</span></button></div>}
      </div>
    </div>
    {supportOpen && <div className="support-popover"><div className="popover-title"><b>Help & Support</b><button className="icon-button subtle" onClick={() => setSupportOpen(false)} aria-label="Close Help"><X size={15} /></button></div><p>Find Answers, View Product Guidance, Or Contact The Platform Team.</p><div className="support-links"><button onClick={() => { setSupportOpen(false); onNavigate('help'); }}>Browse FAQs <span>→</span></button><button onClick={() => { setSupportOpen(false); onOpenAdmin(); }}>Read Admin Docs <span>→</span></button><button onClick={() => { setSupportOpen(false); onNavigate('help'); }}>Contact Support <span>→</span></button></div></div>}
    {commandOpen && <CommandPalette context={context} company={company} visibleNav={visibleNav} onNavigate={onNavigate} onOpenModule={onOpenModule} onOpenModuleHub={onOpenModuleHub} onClose={() => setCommandOpen(false)} />}
  </header>;
}
function HierarchyIcon({ iconKey, size = 14 }: { iconKey: string; size?: number }) {
  const Icon = iconKey === 'users' ? Users
    : iconKey === 'factory' ? Factory
      : iconKey === 'briefcase' ? BriefcaseBusiness
        : iconKey === 'home' ? Home
          : iconKey === 'money' ? CircleDollarSign
            : iconKey === 'package' ? PackageSearch
              : iconKey === 'shield' ? ShieldCheck
                : iconKey === 'gauge' ? Gauge
                  : iconKey === 'forms' ? ClipboardCheck
                    : iconKey === 'radio' ? Radio
                      : iconKey === 'wrench' ? Wrench
                        : iconKey === 'sparkles' ? Sparkles
                          : Boxes;
  return <Icon size={size} />;
}

function KpiStrip({ summary, company, context }: Pick<ZipDashboardProps, 'summary' | 'company' | 'context'>) {
  const cards: Array<{ field: DashboardAggregateField; label: string; value: string; detail: string; icon: React.ComponentType<{ size?: number }>; tone: string }> = [
    { field: 'employees', label: 'Employees', value: numberValue(summary?.employees), detail: company.id ? company.code : 'All assigned companies', icon: Users, tone: 'blue' },
    { field: 'present', label: 'Present Today', value: numberValue(summary?.present), detail: summary?.workDate || 'Live Attendance', icon: CalendarCheck2, tone: 'green' },
    { field: 'incompleteAttendance', label: 'Needs Review', value: numberValue((summary?.incompleteAttendance ?? 0) + (summary?.pendingApprovals ?? 0) + (summary?.overdueRequirements ?? 0)), detail: 'Authorized Follow-Up Items', icon: AlertTriangle, tone: 'amber' },
    { field: 'securityAlerts', label: 'Security Health', value: summary ? (summary.securityAlerts ? 'Review' : 'Good') : '—', detail: summary ? `${summary.securityAlerts} High-Risk Event(s)` : 'Loading Scoped Status', icon: ShieldCheck, tone: summary?.securityAlerts ? 'red' : 'violet' },
  ];
  const visible = cards.filter((card) => canSeeDashboardField(context, card.field, company.id));
  if (!visible.length) return null;
  return <div className="kpi-grid" data-primary-kpi-grid="true">{visible.map(({ label, value, detail, icon: Icon, tone }) => <article className={`kpi-card tone-${tone}`} key={label}><span className="kpi-icon"><Icon size={16} /></span><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>;
}

function ChartHeader({ eyebrow, title, icon }: { eyebrow: string; title: string; icon: React.ComponentType<{ size?: number }> }) {
  const Icon = icon;
  return <header className="chart-heading"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div><Icon size={19} /></header>;
}

function TrendWidget({ summary, refreshSummary }: Pick<ZipDashboardProps, 'summary' | 'refreshSummary'>) {
  const rate = attendanceRate(summary);
  return <article className="chart-card trend-card">
    <ChartHeader eyebrow="WORKFORCE PULSE" title="Attendance Trend" icon={Activity} />
    <div className="chart-legend"><span><i style={{ background: 'var(--primary)' }} /> Present Today</span><span><i style={{ background: 'var(--accent)' }} /> Incomplete</span></div>
    <div className="chart-canvas zip-chart-canvas" role="img" aria-label={summary ? `Attendance completion is ${percentage(rate)}` : 'Attendance trend is unavailable'}>
      <div className="chart-grid-lines"><i /><i /><i /><i /></div>
      <svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true">
        <path d={`M0 ${150 - rate * .55} C 90 ${142 - rate * .45}, 130 ${122 - rate * .35}, 205 ${132 - rate * .4} S 330 ${102 - rate * .25}, 405 ${118 - rate * .28} S 520 ${78 - rate * .2}, 600 ${105 - rate * .25}`} />
        <path className="secondary-line" d={`M0 ${164 - (100 - rate) * .18} C 100 ${158 - (100 - rate) * .2}, 180 ${155 - (100 - rate) * .15}, 260 ${160 - (100 - rate) * .18} S 430 ${141 - (100 - rate) * .12}, 600 ${150 - (100 - rate) * .14}`} />
      </svg>
      {!summary && <div className="chart-empty"><PackageSearch size={18} /><span>Trend Data Is Not Available For This Scope Yet.</span></div>}
    </div>
    <footer className="chart-footer"><span>{summary ? `${percentage(rate)} completion` : "Scoped Trend"}</span><button className="text-button" onClick={refreshSummary}><RefreshCw size={14} /> Refresh</button></footer>
  </article>;
}

function ComparisonWidget({ summary }: Pick<ZipDashboardProps, 'summary'>) {
  const metrics = [
    ['Attendance', attendanceRate(summary)],
    ['Requirements', summary && summary.employees > 0 ? ((summary.employees - summary.overdueRequirements) / summary.employees) * 100 : 0],
    ['Security', summary ? (summary.securityAlerts === 0 ? 100 : Math.max(0, 100 - summary.securityAlerts * 10)) : 0],
  ] as const;
  return <article className="chart-card comparison-card"><ChartHeader eyebrow="SCOPED COMPARISON" title="Workspace Health" icon={ArrowRight} /><div className="comparison-list">{metrics.map(([label, value]) => <div key={label}><div><span>{label}</span><b>{summary ? percentage(value) : '—'}</b></div><i><em style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i></div>)}</div><p className="widget-note">Values Are Calculated Only From Records Your Current Role Can Access.</p></article>;
}

function CategoryWidget({ summary }: Pick<ZipDashboardProps, 'summary'>) {
  const present = summary?.present || 0;
  const incomplete = summary?.incompleteAttendance || 0;
  const absent = summary ? Math.max(0, summary.employees - present - incomplete) : 0;
  const total = summary?.employees || 0;
  const presentDegrees = total ? (present / total) * 360 : 0;
  const incompleteDegrees = total ? (incomplete / total) * 360 : 0;
  const style = { '--category-ring': `conic-gradient(var(--primary) 0deg ${presentDegrees}deg, var(--accent) ${presentDegrees}deg ${presentDegrees + incompleteDegrees}deg, color-mix(in srgb, var(--muted) 18%, transparent) ${presentDegrees + incompleteDegrees}deg 360deg)` } as CSSProperties;
  return <article className="chart-card category-card"><ChartHeader eyebrow="TODAY'S MIX" title="Attendance Categories" icon={CalendarCheck2} /><div className="donut-layout"><div className="donut" style={style}><div className="donut-ring" /><div className="donut-center"><strong>{summary ? percentage(attendanceRate(summary)) : '—'}</strong><span>Present</span></div></div><div className="donut-legend"><span><i style={{ background: 'var(--primary)' }} />Present <b>{numberValue(present)}</b></span><span><i style={{ background: 'var(--accent)' }} />Incomplete <b>{numberValue(incomplete)}</b></span><span><i style={{ background: 'var(--muted)' }} />Other <b>{numberValue(absent)}</b></span></div></div></article>;
}

function ForecastWidget({ summary }: Pick<ZipDashboardProps, 'summary'>) {
  const followUps = summary
    ? summary.incompleteAttendance + summary.pendingApprovals + summary.overdueRequirements + summary.securityAlerts
    : 0;
  const readiness = summary && summary.employees > 0
    ? Math.max(0, 100 - (followUps / summary.employees) * 25)
    : 0;
  return <article className="insight-card forecast-card"><span className="insight-icon"><Sparkles size={17} /></span><span className="eyebrow">WORKSPACE INSIGHT</span><h3>Make The Next Action Obvious.</h3><p>Use The Authorized Queue To Open The Exact Record That Needs Attention. No Private Or Unauthorized Data Is Inferred Here.</p><div className="forecast-meter"><span style={{ width: `${readiness}%` }} /></div><div className="insight-foot"><span>{summary ? `${numberValue(followUps)} open follow-up${followUps === 1 ? '' : 's'}` : "Waiting For Live Records"}</span><ArrowRight size={15} /></div></article>;
}

function QueueWidget({ summary, context, company, onNavigate, onOpenModule }: Pick<ZipDashboardProps, 'summary' | 'context' | 'company' | 'onNavigate' | 'onOpenModule'>) {
  const canOpenPeople = can(context, 'users.access', 'view', company.id) || can(context, 'payroll.access', 'view', company.id);
  const queueItems: Array<{ field: DashboardAggregateField; label: string; detail: string; value: number; action: () => void }> = [
    { field: 'incompleteAttendance', label: 'Incomplete attendance', detail: 'Open Attendance & GPS', value: summary?.incompleteAttendance ?? 0, action: () => onOpenModule('attendance') },
    { field: 'pendingApprovals', label: 'Pending approvals', detail: canOpenPeople ? 'Open People & Payroll' : 'Review assigned forms', value: summary?.pendingApprovals ?? 0, action: () => onNavigate(canOpenPeople ? 'people' : 'forms') },
    { field: 'overdueRequirements', label: 'Overdue requirements', detail: 'Review assigned forms', value: summary?.overdueRequirements ?? 0, action: () => onNavigate('forms') },
    { field: 'securityAlerts', label: 'Security alerts', detail: 'Open Security Center', value: summary?.securityAlerts ?? 0, action: () => onNavigate('security') },
  ];
  const queue = queueItems.filter((item) => canSeeDashboardField(context, item.field, company.id));
  if (!queue.length) return null;
  return <article className="queue-card"><span className="queue-accent" /><ChartHeader eyebrow="ACTION QUEUE" title="Needs Your Attention" icon={AlertTriangle} /><div className="queue-list">{queue.map((item) => <button key={item.label} onClick={item.action}><span className="queue-number">{String(item.value).padStart(2, '0')}</span><span><b>{item.label}</b><small>{item.detail}</small></span><ArrowRight size={14} /></button>)}</div><div className="queue-footer"><span>Open Records Remain Company-Scoped</span><CheckCircle2 size={15} /></div></article>;
}

function StatusWidget({ online, context, company }: Pick<ZipDashboardProps, 'online' | 'context' | 'company'>) {
  const statusRows = [
    ['Portal', online, online ? 'Online' : 'Offline'],
    ['Identity', true, 'Verified'],
    ['Company scope', true, company.id ? company.code : `${context.companies.length} assigned`],
    ['RBAC', true, 'Enforced'],
  ] as const;
  return <article className="status-card"><ChartHeader eyebrow="SYSTEM STATUS" title="Workspace Status" icon={ShieldCheck} /><div className="status-list">{statusRows.map(([label, okay, value]) => <div key={label}><span><i className={okay ? 'status-ok' : 'status-warn'} />{label}</span><b>{value}</b><small>{okay ? 'Ready' : "Check Connection"}</small></div>)}</div><div className="status-footer"><span>Last Checked {new Date().toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}</span><b>{online ? 'Operational' : 'Offline'}</b></div></article>;
}

function NewsWidget({ release }: Pick<ZipDashboardProps, 'release'>) {
  const items = [
    { date: release.date, title: `Staff Portal ${release.version}`, detail: 'Protected workspace release' },
    { date: 'LIVE', title: 'Company-scoped access', detail: 'Permissions stay inside assigned businesses' },
    { date: 'NOW', title: 'Module loading', detail: 'Open only the ERP workspace you need' },
  ];
  return <article className="news-card"><ChartHeader eyebrow="PORTAL NOTES" title="Latest Updates" icon={PackageSearch} /><div className="news-list">{items.map((item) => <div className="news-item" key={`${item.date}-${item.title}`}><span className="news-date">{item.date}</span><p><b>{item.title}</b><small>{item.detail}</small></p><ArrowRight size={14} /></div>)}</div></article>;
}

function MotivationWidget({ onNavigate, enabled }: { onNavigate: (view: ViewName) => void; enabled: boolean }) {
  return <article className="motivation-card"><span className="motivation-spark"><Sparkles size={17} /></span><span className="eyebrow">DAILY WORD</span><h3>Small Improvements Compound.</h3><p>Keep The Next Task Clear, Complete The Record, And Leave The Workspace Stronger For The Next Person.</p><div className="motivation-foot"><span>Human-Approved Communication</span>{enabled ? <button onClick={() => onNavigate('broadcasts')}>Open Broadcasts <ArrowRight size={13} /></button> : <span>Workspace Guidance</span>}</div></article>;
}

function WidgetActions({
  index,
  count,
  onMove,
  canManage,
  enabled,
  onRemove,
  onReplace,
}: {
  index: number;
  count: number;
  onMove: (index: number, direction: -1 | 1) => void;
  canManage: boolean;
  enabled: boolean;
  onRemove: () => void;
  onReplace: () => void;
}) {
  if (!enabled) return null;
  return <span className="widget-actions" onClick={(event) => event.stopPropagation()} data-customization-controls="true">
    <button type="button" aria-label="Move Card Up" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={12} /></button>
    <button type="button" aria-label="Move Card Down" disabled={index === count - 1} onClick={() => onMove(index, 1)}><ArrowDown size={12} /></button>
    {canManage && <><button type="button" aria-label="Replace Widget" onClick={onReplace}><RefreshCw size={12} /></button><button type="button" aria-label="Remove Widget" disabled={count <= 1} onClick={onRemove}><X size={12} /></button></>}
  </span>;
}

function formatLastLogin(value?: string) {
  if (!value) return 'Current session verified';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Current session verified' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function WorkspaceOverviewStrip({
  context,
  company,
  onNavigate,
  onOpenModule,
  onOpenModuleHub,
}: Pick<ZipDashboardProps, 'context' | 'company' | 'onNavigate' | 'onOpenModule' | 'onOpenModuleHub'>) {
  const roles = context.roles.length ? context.roles : [{ id: 'employee', code: 'employee', name: 'Employee', companyId: company.id || 'assigned' }];
  const permissionCount = Object.values(context.permissions).filter((level) => level !== 'none').length;
  const approvalCount = Object.values(context.permissions).filter((level) => level === 'approve' || level === 'manage').length;
  const moduleCount = moduleDefinitions.filter((module) => isModuleVisible(context, module, company.id, company.code)).length;
  const isManagerial = roles.some((role) => ['owner', 'group_admin', 'company_admin', 'manager'].includes(role.code));
  const adminAccess = isManagerial || Object.values(context.permissions).some((level) => level === 'manage');
  const availableModuleIds = new Set(moduleDefinitions.filter((module) => isModuleVisible(context, module, company.id, company.code)).map((module) => module.id));
  type QuickAction = { label: string; detail: string; icon: React.ComponentType<{ size?: number }>; action: () => void };
  const quickActions: QuickAction[] = [];
  if (availableModuleIds.has('profile')) quickActions.push({ label: 'My Profile', detail: 'Keep your employee record current', icon: Users, action: () => onOpenModule('profile') });
  if (availableModuleIds.has('employee')) quickActions.push({ label: 'My Workspace', detail: 'Open staff self-service', icon: BriefcaseBusiness, action: () => onOpenModule('employee') });
  if (can(context, 'forms.access', 'view', company.id)) quickActions.push({ label: 'My Forms', detail: 'Review assigned submissions', icon: ClipboardCheck, action: () => onNavigate('forms') });
  const approvalWorkAllowed = can(context, 'forms.access', 'view', company.id) || can(context, 'users.access', 'view', company.id);
  quickActions.push({ label: isManagerial ? approvalWorkAllowed ? 'Tasks & Approvals' : 'Authorized Workspaces' : 'My Workspaces', detail: 'Open Authorized Workspaces', icon: CheckCircle2, action: onOpenModuleHub });
  if (can(context, 'ai_guide.access', 'view', company.id)) quickActions.push({ label: 'Help & Support', detail: 'Find Role-Aware Guidance', icon: ShieldCheck, action: () => onNavigate('help') });
  return <section className={'workspace-overview-grid' + (isManagerial ? '' : ' employee-task-first')} aria-label="Personalized Staff Workspace Overview">
    <article className="profile-summary-card">
      <header className="overview-card-header"><div><span className="eyebrow">MY WORKSPACE · STAFF ERP</span><h2>Your Profile</h2></div><span className="live-chip"><i /> Personalized Home</span></header>
      <div className="profile-summary-body">
        <div className="profile-summary-avatar">{initials(context.employee.displayName)}</div>
        <div><strong>{formatPersonName(context.employee.displayName)}</strong><span>{context.employee.jobTitle || 'Employee'}{context.employee.department ? ' · ' : ''}{context.employee.department || ''}</span><small>{context.employee.team || "Assigned Team"} · {company.name}</small></div>
      </div>
      <div className="profile-summary-meta">
        <span><small>Last Login</small><strong>{formatLastLogin(context.employee.lastLoginAt)}</strong></span>
        <span><small>Account Status</small><strong>{context.employee.status === 'provisional' ? "Provisional Access" : "Active Employee"}</strong></span>
      </div>
      <div className="profile-summary-stats">
        <div><small>Assigned Roles</small><strong>{roles.length}</strong><span>{roles.slice(0, 2).map((role) => role.name).join(' · ')}{roles.length > 2 ? ' +' : ''}</span></div>
        <div><small>Permissions</small><strong>{permissionCount}</strong><span>Role-Scoped Access</span></div>
      </div>
    </article>
    <article className="access-summary-card">
      <header className="overview-card-header"><div><span className="eyebrow">{isManagerial ? 'ACCESS & RESPONSIBILITIES' : 'YOUR ACCESS'}</span><h2>{isManagerial ? 'Your Operating Perimeter' : 'Your Access'}</h2></div><ShieldCheck size={18} /></header>
      {isManagerial ? <div className="access-summary-lines">
        <div><span>Module Access</span><strong>{moduleCount}</strong></div>
        <div><span>Approval Rights</span><strong>{approvalCount}</strong></div>
        <div><span>Administrative Privileges</span><strong>{adminAccess ? 'Enabled' : "Role-Scoped"}</strong></div>
      </div> : <div className="access-summary-lines personal-access-lines">
        <div><span>Assigned Workspace</span><strong>{company.name}</strong></div>
        <div><span>Role Access</span><strong>{roles[0]?.name || 'Employee'}</strong></div>
        <div><span>Guided Help</span><strong>{can(context, 'ai_guide.access', 'view', company.id) ? 'Available' : '—'}</strong></div>
      </div>}
      <div className="access-role-stack">{roles.slice(0, 4).map((role) => <span className="access-role-pill" key={role.id}>{role.name}</span>)}</div>
      <small className="access-summary-foot">Page Access, Role Hierarchy, And Approval Actions Remain Enforced By Server-Side RBAC.</small>
    </article>
    <article className="self-service-card">
      <header className="overview-card-header"><div><span className="eyebrow">SELF-SERVICE · STAFF ERP</span><h2>Commonly Used Actions</h2></div><Sparkles size={18} /></header>
      <div className="self-service-list">{quickActions.map((item) => {
        const Icon = item.icon;
        return <button type="button" key={item.label} onClick={item.action}><span className="self-service-icon"><Icon size={15} /></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={14} /></button>;
      })}</div>
    </article>
  </section>;
}


function ErpPulseGrid({
  context,
  company,
  summary,
  onOpenModule,
  onOpenModuleHub,
}: Pick<ZipDashboardProps, 'context' | 'company' | 'summary' | 'onOpenModule' | 'onOpenModuleHub'>) {
  const availableModules = moduleDefinitions.filter((module) => isModuleVisible(context, module, company.id, company.code));
  const groups = getErpNavigation(availableModules);
  if (!groups.length) return null;
  return <section className="erp-pulse-section" aria-label="Authorized ERP Pulse">
    <header className="erp-pulse-header"><div><span className="eyebrow">MULTI-ERP COMMAND LAYER</span><h2>Every Workspace, Clearly Separated</h2><p>Each ERP Keeps Its Own Hierarchy, Functions, Signal Cards, And Quick Actions.</p></div><button className="secondary-button" onClick={onOpenModuleHub}><LayoutDashboard size={15} /> Open Exact Hierarchy</button></header>
    <div className="erp-pulse-grid">{groups.map((group) => {
      const modules = availableModules.filter((module) => module.erpId === group.id);
      const firstModule = modules[0];
      const isStaff = group.id === 'staff';
      const attendanceAllowed = canSeeDashboardField(context, 'present', company.id);
      const signal = isStaff && attendanceAllowed ? numberValue(summary?.present) : 'Available on open';
      const signalLabel = isStaff && attendanceAllowed ? 'Present Today' : 'Authorized Functions';
      return <article className="erp-pulse-card" key={group.id}>
        <header><span className="erp-pulse-icon"><HierarchyIcon iconKey={group.iconKey} size={16} /></span><div><span className="eyebrow">{group.label}</span><h3>{group.detail}</h3></div></header>
        <div className="erp-pulse-chart" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="erp-pulse-meta"><span><small>Authorized Functions</small><strong>{modules.length}</strong></span><span><small>{signalLabel}</small><strong>{signal}</strong></span></div>
        <div className="erp-pulse-actions"><button type="button" onClick={() => firstModule ? onOpenModule(firstModule.id) : onOpenModuleHub()}>{firstModule ? 'Open ERP' : "Open Directory"} <ArrowRight size={13} /></button><button type="button" onClick={onOpenModuleHub}>Functions <ChevronRight size={13} /></button></div>
      </article>;
    })}</div>
  </section>;
}

function ManagerCommandCenter({
  context,
  company,
  summary,
  onNavigate,
  onOpenModuleHub,
}: Pick<ZipDashboardProps, 'context' | 'company' | 'summary' | 'onNavigate' | 'onOpenModuleHub'>) {
  const managerAccess = context.roles.some((role) => ['manager', 'company_admin', 'group_admin', 'owner'].includes(role.code));
  if (!managerAccess) return null;
  const attendance = attendancePresentation(summary, context, company.id);
  const approvalFieldAllowed = canSeeDashboardField(context, 'pendingApprovals', company.id);
  const managerTiles: Array<{ field: DashboardAggregateField; label: string; value: string; detail: string; icon: React.ComponentType<{ size?: number }> }> = [
    { field: 'employees', label: 'Team Workload', value: numberValue(summary?.employees), detail: 'People In Your Authorized Scope', icon: Users },
    { field: 'pendingApprovals', label: 'Pending Approvals', value: numberValue(summary?.pendingApprovals), detail: 'Requests Awaiting Action', icon: ClipboardCheck },
    { field: 'overdueRequirements', label: 'Overdue Work', value: numberValue(summary?.overdueRequirements), detail: 'Requirements To Follow Through', icon: AlertTriangle },
    { field: 'present', label: 'Attendance', value: attendance.value, detail: attendance.detail, icon: CalendarCheck2 },
  ];
  const tiles = managerTiles.filter((tile) => canSeeDashboardField(context, tile.field, company.id));
  const actions = [
    can(context, 'users.access', 'view', company.id) ? <button key="team" type="button" onClick={() => onNavigate('people')}><Users size={14} /> Review Team</button> : null,
    can(context, 'forms.access', 'view', company.id) ? <button key="forms" type="button" onClick={() => onNavigate('forms')}><ClipboardCheck size={14} /> Open Approvals</button> : null,
    can(context, 'security.access', 'view', company.id) ? <button key="security" type="button" onClick={() => onNavigate('security')}><ShieldCheck size={14} /> Check Security Signals</button> : null,
  ].filter(Boolean);
  if (!tiles.length && !actions.length) return null;
  const managerFocus = approvalFieldAllowed
    ? 'Prioritized Workload, Approvals And Operational Exceptions For Your Authorized Team Scope.'
    : canSeeDashboardField(context, 'securityAlerts', company.id)
      ? 'Prioritized Control Signals And Operational Exceptions For Your Authorized Team Scope.'
      : 'Prioritized Work And Operational Exceptions For Your Authorized Team Scope.';
  return <section className="manager-command-center" aria-label="Manager Home">
    <header className="manager-command-header"><div><span className="eyebrow">MANAGER HOME</span><h2>Team Rhythm, Next Actions</h2><p>{managerFocus}</p></div><button type="button" className="secondary-button" onClick={onOpenModuleHub}><LayoutDashboard size={15} /> Open Workspaces</button></header>
    {tiles.length > 0 && <div className="manager-command-grid">{tiles.map((tile) => { const Icon = tile.icon; return <article key={tile.label} data-dashboard-field={tile.field} data-dashboard-value={tile.value}><span className="manager-command-icon"><Icon size={16} /></span><span className="eyebrow">{tile.label}</span><strong>{tile.value}</strong><small>{tile.detail}</small></article>; })}</div>}
    {actions.length > 0 && <div className="manager-command-actions">{actions}</div>}
  </section>;
}

function OwnerCommandCenter({
  context,
  company,
  summary,
  online,
  onOpenAdmin,
  onOpenModuleHub,
}: Pick<ZipDashboardProps, 'context' | 'company' | 'summary' | 'onOpenAdmin' | 'onOpenModuleHub'> & { online: boolean }) {
  const ownerAccess = context.roles.some((role) => ['owner', 'group_admin'].includes(role.code));
  if (!ownerAccess) return null;
  const openFollowUps = (summary?.incompleteAttendance || 0) + (summary?.overdueRequirements || 0);
  const ownerTiles: Array<{ field?: DashboardAggregateField; label: string; value: string; detail: string; icon: React.ComponentType<{ size?: number }> }> = [
    { field: 'employees', label: 'People in scope', value: numberValue(summary?.employees), detail: 'Authorized workforce context', icon: Users },
    { field: 'pendingApprovals', label: 'Operations follow-up', value: numberValue(summary?.pendingApprovals), detail: 'Approved requests awaiting action', icon: ClipboardCheck },
    { label: 'Platform health', value: online ? 'Operational' : 'Offline', detail: 'Portal connectivity', icon: Gauge },
    { field: 'securityAlerts', label: 'Control signals', value: numberValue(summary?.securityAlerts), detail: 'Authorized security alerts', icon: ShieldCheck },
    { field: 'incompleteAttendance', label: 'Open follow-ups', value: numberValue(openFollowUps), detail: 'Authorized items requiring review', icon: Activity },
  ];
  const tiles = ownerTiles.filter((tile) => !tile.field || canSeeDashboardField(context, tile.field, company.id));
  return <section className="owner-command-center" data-owner-command-center="true" aria-label="Owner Command Center">
    <header className="owner-command-header"><div><span className="eyebrow">OWNER COMMAND CENTER · BUSINESS HEALTH</span><h2>Financial, Operational And Control Truth</h2><p>Verified Business Intelligence Stays Connected To The Canonical ERP Actions That Resolve IT.</p></div><div className="heading-actions"><button className="secondary-button" onClick={onOpenModuleHub}><LayoutDashboard size={15} /> Manage Workspaces</button><button className="primary-button" onClick={onOpenAdmin}><Settings2 size={15} /> Open Admin Center</button></div></header>
    <div className="owner-command-grid">{tiles.map((tile) => { const Icon = tile.icon; return <article className="owner-command-tile" key={tile.label}><span className="owner-command-icon"><Icon size={17} /></span><span className="eyebrow">{tile.label}</span><strong>{tile.value}</strong><small>{tile.detail}</small></article>; })}</div>
  </section>;
}

function SmartLoadingCard({ pending }: { pending: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setVisible(true), 2000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  if (!visible) return null;
  return <section className="premium-skeleton-card" aria-live="polite" aria-label="Loading Dashboard Data">
    <div className="premium-skeleton-lines"><span /><span /><span /></div>
    <div><strong>Preparing Scoped Dashboard Data</strong><small>Live Records Are Taking Longer Than Expected. Your Workspace Is Still Responsive.</small></div>
    <span className="premium-loading-foot"><i /> Syncing Securely</span>
  </section>;
}

const widgetLabels: Record<WidgetId, string> = {
  trend: 'Attendance trend',
  comparison: 'Readiness comparison',
  category: 'Workforce categories',
  forecast: 'Workload forecast',
  queue: 'Action queue',
  status: 'Platform status',
  news: 'Portal notes',
  motivation: 'Daily motivation',
};

const dashboardWidgetRegistry: Record<WidgetId, { requiredPermission?: string; fields?: DashboardAggregateField[] }> = {
  trend: { fields: ['present', 'employees', 'incompleteAttendance'] },
  comparison: { fields: ['present', 'employees', 'incompleteAttendance', 'overdueRequirements', 'securityAlerts'] },
  category: { fields: ['present', 'employees', 'incompleteAttendance'] },
  forecast: { fields: ['present', 'employees', 'incompleteAttendance', 'pendingApprovals', 'securityAlerts'] },
  queue: {},
  status: {},
  news: { requiredPermission: 'broadcasts.access' },
  motivation: { requiredPermission: 'broadcasts.access' },
};

function canRenderDashboardWidget(widget: WidgetId, context: WorkforceContext, companyId: string | null) {
  const definition = dashboardWidgetRegistry[widget];
  if (definition.fields && !definition.fields.every((field) => canSeeDashboardField(context, field, companyId))) return false;
  return !definition.requiredPermission || can(context, definition.requiredPermission, 'view', companyId);
}

function DashboardWidgets({
  widgets,
  summary,
  company,
  context,
  online,
  refreshSummary,
  onNavigate,
  onOpenModule,
  release,
}: Pick<ZipDashboardProps, 'summary' | 'company' | 'context' | 'online' | 'refreshSummary' | 'onNavigate' | 'onOpenModule' | 'release'> & { widgets: WidgetId[] }) {
  const [dragged, setDragged] = useState<WidgetId | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const allowedWidgets = useMemo(() => widgets.filter((widget) => canRenderDashboardWidget(widget, context, company.id)), [company.id, context, widgets]);
  const widgetStorageKey = 'daenem-dashboard-widgets:' + context.employee.id + ':' + (company.id || 'group');
  const [order, setOrder] = useState<WidgetId[]>(() => {
    if (typeof window === 'undefined') return allowedWidgets;
    try {
      const stored = JSON.parse(localStorage.getItem(widgetStorageKey) || 'null') as unknown;
      const valid = Array.isArray(stored) ? stored.filter((item): item is WidgetId => Object.prototype.hasOwnProperty.call(widgetLabels, item) && allowedWidgets.includes(item)) : [];
      return valid.length ? [...new Set(valid)] : allowedWidgets;
    } catch {
      return allowedWidgets;
    }
  });
  const [widgetStyle, setWidgetStyle] = useState<WidgetStyle>(() => {
    if (typeof window === 'undefined') return 'card';
    const stored = localStorage.getItem(`${widgetStorageKey}:style`);
    return stored === 'compact' || stored === 'full' || stored === 'strip' ? stored : 'card';
  });
  const [clockPreferences, setClockPreferences] = useState<WorldClockPreferences>(() => readWorldClockPreferences());
  const [clockQuery, setClockQuery] = useState('');
  const canManageWidgets = context.roles.some((role) => ['owner', 'group_admin'].includes(role.code));
  const visibleOrder = order.filter((widget) => allowedWidgets.includes(widget));
  const hiddenWidgets = allowedWidgets.filter((widget) => !visibleOrder.includes(widget));
  const filteredClockLocations = WORLD_CLOCKS.filter((item) => `${item.name} ${item.region}`.toLowerCase().includes(clockQuery.trim().toLowerCase()));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem(widgetStorageKey) || 'null') as unknown;
      const valid = Array.isArray(stored) ? stored.filter((item): item is WidgetId => Object.prototype.hasOwnProperty.call(widgetLabels, item) && allowedWidgets.includes(item)) : [];
      setOrder(valid.length ? [...new Set(valid)] : allowedWidgets);
      const savedStyle = localStorage.getItem(`${widgetStorageKey}:style`);
      setWidgetStyle(savedStyle === 'compact' || savedStyle === 'full' || savedStyle === 'strip' ? savedStyle : 'card');
    } catch {
      setOrder(allowedWidgets);
      setWidgetStyle('card');
    }
  }, [allowedWidgets, widgetStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(widgetStorageKey, JSON.stringify(order));
    localStorage.setItem(`${widgetStorageKey}:style`, widgetStyle);
  }, [order, widgetStorageKey, widgetStyle]);

  function updateClockPreferences(patch: Partial<WorldClockPreferences>) {
    const next = { ...clockPreferences, ...patch };
    setClockPreferences(next);
    saveWorldClockPreferences(next);
  }

  function moveWidget(target: WidgetId) {
    if (!dragged || dragged === target) return;
    setOrder((current) => {
      const next = [...current];
      const from = next.indexOf(dragged);
      const to = next.indexOf(target);
      next.splice(from, 1);
      next.splice(to, 0, dragged);
      return next;
    });
    setDragged(null);
  }

  function moveByKeyboard(index: number, direction: -1 | 1) {
    setOrder((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeWidget(widget: WidgetId) {
    setOrder((current) => current.length <= 1 ? current : current.filter((item) => item !== widget));
  }

  function replaceWidget(index: number) {
    const replacement = hiddenWidgets[0];
    if (!replacement) return;
    setOrder((current) => current.map((widget, currentIndex) => currentIndex === index ? replacement : widget));
  }

  function addWidget(widget: WidgetId) {
    setOrder((current) => current.includes(widget) ? current : [...current, widget]);
  }

  function renderWidget(widget: WidgetId) {
    switch (widget) {
      case 'trend': return <TrendWidget summary={summary} refreshSummary={refreshSummary} />;
      case 'comparison': return <ComparisonWidget summary={summary} />;
      case 'category': return <CategoryWidget summary={summary} />;
      case 'forecast': return <ForecastWidget summary={summary} />;
      case 'queue': return <QueueWidget summary={summary} context={context} company={company} onNavigate={onNavigate} onOpenModule={onOpenModule} />;
      case 'status': return <StatusWidget online={online} context={context} company={company} />;
      case 'news': return <NewsWidget release={release} />;
      case 'motivation': return <MotivationWidget onNavigate={onNavigate} enabled={can(context, 'broadcasts.access', 'view', company.id)} />;
    }
  }

  return <>
    <div className="widget-customize-toolbar" aria-label="Dashboard Customization"><span><Settings2 size={14} /> {customizing ? 'Customize Dashboard' : "Personal Dashboard"}</span><button type="button" className="text-button" onClick={() => setCustomizing((value) => !value)}>{customizing ? 'Done' : 'Customize Dashboard'}</button></div>
    {customizing && canManageWidgets && <div className="widget-admin-toolbar" aria-label="Administrator Widget Controls">
      <span><Settings2 size={14} /> Admin Widget Controls</span>
      <label className="widget-style-control">Widget Style<select value={widgetStyle} onChange={(event) => setWidgetStyle(event.target.value as WidgetStyle)} aria-label="Dashboard Widget Style"><option value="compact">Compact</option><option value="full">Full</option><option value="card">Card</option><option value="strip">Strip</option></select></label>
      {hiddenWidgets.map((widget) => <button type="button" key={widget} onClick={() => addWidget(widget)}>+ {widgetLabels[widget]}</button>)}
      <details className="widget-clock-config">
        <summary>Global Time Settings</summary>
        <div className="widget-clock-config-body">
          <label>Clock Style<select value={clockPreferences.style} onChange={(event) => updateClockPreferences({ style: event.target.value as ClockStyle })}><option value="minimal">Minimal</option><option value="detailed">Detailed</option><option value="neon">Neon Accent</option><option value="classic">Classic</option></select></label>
          <label>Find Locations<input type="search" value={clockQuery} onChange={(event) => setClockQuery(event.target.value)} placeholder="Search City Or Country" /></label>
          <div className="widget-clock-location-list">{filteredClockLocations.map((item) => { const checked = clockPreferences.visibleZones.includes(item.zone); return <label key={item.zone}><input type="checkbox" checked={checked} onChange={() => { const visibleZones = checked ? clockPreferences.visibleZones.filter((zone) => zone !== item.zone) : [...clockPreferences.visibleZones, item.zone]; if (visibleZones.length) updateClockPreferences({ visibleZones }); }} /><span><strong>{item.name}</strong><small>{item.region}</small></span></label>; })}</div>
        </div>
      </details>
    </div>}
    <div className="dashboard-grid">
      {visibleOrder.map((widget, index) => <div
        key={widget}
        className={`widget-slot widget-${widget} widget-style-${widgetStyle}`}
        data-widget-style={widgetStyle}
        draggable={customizing}
        onDragStart={() => { if (customizing) setDragged(widget); }}
        onDragOver={(event) => { if (customizing) event.preventDefault(); }}
        onDrop={() => { if (customizing) moveWidget(widget); }}
      >
        <WidgetActions index={index} count={visibleOrder.length} onMove={moveByKeyboard} canManage={customizing && canManageWidgets} enabled={customizing} onRemove={() => removeWidget(widget)} onReplace={() => replaceWidget(index)} />
        {renderWidget(widget)}
      </div>)}
    </div>
  </>;
}

function ReleaseDialog({ release, onClose }: { release: ReleaseInfo; onClose: () => void }) {
  return <div className="release-backdrop" onClick={onClose}><section className="release-panel" role="dialog" aria-modal="true" aria-labelledby="release-title" onClick={(event) => event.stopPropagation()}>
    <header><div><span className="eyebrow">DAENEM STAFF PORTAL</span><h2 id="release-title">Version {release.version}</h2><p>Prepared {release.date} Through The Protected Release Branch.</p></div><button className="icon-button" onClick={onClose} aria-label="Close Version Details"><X size={20} /></button></header>
    <div className="release-status"><ShieldCheck size={19} /><span><strong>Protected Release</strong><small>Every Listed Change Passes Controlled Validation Before Production Activation.</small></span></div>
    <ul><li>ZIP-Aligned Authenticated Dashboard Shell And Responsive Workspace Layout.</li><li>Company-Scoped Modules, Controls And Permissions Remain Connected.</li><li>Lazy-Loaded ERP Workspaces Stay Available Through Module Hub.</li></ul>
  </section></div>;
}

export function ZipDashboard(props: ZipDashboardProps) {
  useEffect(() => {
    document.body.classList.add('dashboard-active');
    return () => document.body.classList.remove('dashboard-active');
  }, []);

  return <QaReviewPostAuthShell {...props} />;
}

function QaReviewPostAuthShell({
  context,
  layoutProfile,
  view,
  content,
  company,
  summary,
  dataStatus,
  dataLastSyncedAt,
  dataError,
  liveIntelligence,
  refreshSummary,
  onNavigate,
  onOpenModule,
  onOpenModuleHub,
  onLogout,
  visibleNav,
  clock,
  weather,
  temperatureUnit,
  enableLocation,
  online,
  release,
  releaseOpen,
  setReleaseOpen,
}: ZipDashboardProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeItem = visibleNav.find((item) => item.id === view);
  const moduleLabel = activeItem?.label || (view === 'overview' ? 'Group Overview' : 'Staff Portal Workspace');
  const moduleDescription = activeItem?.description || 'Your authorized Staff Portal workspace.';
  const displayName = formatPersonName(context.employee.displayName);
  const initialsValue = initials(displayName);
  const roleLabel = context.roles[0]?.name || (context.employee.status === 'provisional' ? 'Provisional Employee' : 'Employee');
  const liveLabel = dataStatus === 'ready' ? (online ? 'Connected' : 'Last synced') : dataStatus === 'error' ? 'Unavailable' : 'Syncing';
  const liveDetail = dataError || (dataLastSyncedAt ? 'Updated ' + formatLastSyncedAt(dataLastSyncedAt) : 'Authorized Staff Portal data');
  const isOwner = context.roles.some((role) => ['owner', 'group_admin'].includes(role.code));
  const isManager = context.roles.some((role) => ['owner', 'group_admin', 'company_admin', 'manager'].includes(role.code));

  const nav = <nav aria-label="Staff Portal workspace navigation">
    {visibleNav.map((item) => {
      const Icon = item.icon;
      return <button
        key={item.id}
        type="button"
        className={'qa-v115-nav-item' + (item.id === view ? ' active' : '')}
        aria-current={item.id === view ? 'page' : undefined}
        onClick={() => { setSidebarOpen(false); onNavigate(item.id); }}
      >
        <Icon size={16} aria-hidden="true" />
        <span><strong>{item.label}</strong><small>{item.description}</small></span>
      </button>;
    })}
    <button type="button" className="qa-v115-nav-item" onClick={() => { setSidebarOpen(false); onOpenModuleHub(); }}>
      <Grid3X3 size={16} aria-hidden="true" />
      <span><strong>Authorized Workspaces</strong><small>Open permitted ERP functions</small></span>
    </button>
  </nav>;

  const home = view === 'overview'
    ? <div className="qa-v115-home">
      <section className="qa-v115-home-hero" aria-labelledby="qa-v115-home-title">
        <div>
          <span className="eyebrow">AUTHORIZED STAFF PORTAL · {company.name}</span>
          <h2 id="qa-v115-home-title">{isOwner ? 'Your command centre is ready.' : 'Your workspace is ready.'}</h2>
          <p>Review the work assigned to you, move approved actions forward and keep every Staff Portal decision connected to its authorised source.</p>
          <div className="qa-v115-hero-actions">
            <button type="button" className="qa-v115-btn primary" onClick={onOpenModuleHub}><Grid3X3 size={15} /> Open Workspaces</button>
            <button type="button" className="qa-v115-btn" onClick={refreshSummary}><RefreshCw size={15} /> Refresh Live Data</button>
          </div>
        </div>
        <aside className="qa-v115-hero-status" aria-label="Staff Portal live status">
          <span>LIVE STAFF PORTAL STATUS</span>
          <strong data-top-slot="sync-status">{liveLabel}</strong>
          <small>{liveDetail}. Only authorised data is shown.</small>
        </aside>
      </section>
      <div className="qa-v115-home-grid">
        <div className="qa-v115-main-column">
          <KpiStrip summary={summary} company={company} context={context} />
          <section className="qa-v115-panel" aria-labelledby="qa-v115-workspaces-title">
            <h3 id="qa-v115-workspaces-title">Authorized Workspaces</h3>
            <p>Open the workspace that matches the work you need to complete.</p>
            <WorkspaceOverviewStrip context={context} company={company} onNavigate={onNavigate} onOpenModule={onOpenModule} onOpenModuleHub={onOpenModuleHub} />
          </section>
          <section className="qa-v115-panel" aria-labelledby="qa-v115-signals-title">
            <h3 id="qa-v115-signals-title">Workspace Signals</h3>
            <DashboardWidgets widgets={initialWidgets} summary={summary} company={company} context={context} online={online} refreshSummary={refreshSummary} onNavigate={onNavigate} onOpenModule={onOpenModule} release={release} />
          </section>
          {liveIntelligence && <section className="qa-v115-panel" aria-label="Authorized business intelligence">{liveIntelligence}</section>}
        </div>
        <aside className="qa-v115-rail">
          <section className="qa-v115-panel">
            <h3>Live Data Status</h3>
            <p>{liveDetail}</p>
            <div className="qa-v115-status"><i /><strong>{online ? 'Staff Portal connected' : 'Offline mode'}</strong></div>
            <button type="button" className="qa-v115-btn" onClick={refreshSummary}><RefreshCw size={14} /> Refresh</button>
          </section>
          <section className="qa-v115-panel qa-v115-clock-panel" aria-label="Global Operations World Clock">
            <h3>Global Time</h3>
            <WorldClocks />
          </section>
          {isManager && <section className="qa-v115-panel"><h3>{isOwner ? 'Owner Controls' : 'Manager Follow-Through'}</h3><p>Authorized actions remain available through the relevant workspace and preserve the existing permission boundary.</p><button type="button" className="qa-v115-btn" onClick={onOpenModuleHub}>View Authorized Actions</button></section>}
        </aside>
      </div>
    </div>
    : <section className="qa-v115-panel qa-v115-feature-panel" aria-labelledby="qa-v115-feature-title">
      <div className="qa-v115-feature-heading">
        <div><span className="eyebrow">DAENEM STAFF PORTAL · AUTHORIZED WORKSPACE</span><h2 id="qa-v115-feature-title">{moduleLabel}</h2><p>{moduleDescription}</p></div>
        <button type="button" className="qa-v115-btn" onClick={onOpenModuleHub}><Grid3X3 size={15} /> Switch Workspace</button>
      </div>
      <div className="qa-v115-feature-content">{content}</div>
    </section>;

  return <div className="qa-v115-shell" data-qa-reference="staffportal-qa-review-v115" data-layout-profile={layoutProfile.id} data-layout-renderer="QaReviewV115Shell" data-hybrid-navigation="true" data-authenticated-experience="staffportal" data-postauth-renderer="qa-review-v115">
    <aside className={'qa-v115-sidebar' + (sidebarOpen ? ' is-open' : '')}>
      <div className="qa-v115-brand"><span className="qa-v115-brand-mark">D</span><span className="qa-v115-brand-copy"><strong>DAENEM</strong><small>Staff Portal</small></span></div>
      <span className="qa-v115-sidebar-kicker">Workspace</span>
      {nav}
      <div className="qa-v115-sidebar-bottom">
        <div className="qa-v115-status"><i /><span>{online ? 'All systems operational' : 'Offline mode'}</span></div>
        <button type="button" className="qa-v115-user" onClick={() => onOpenModule('profile')} aria-label="Open my profile"><span className="qa-v115-avatar">{initialsValue}</span><span><strong>{displayName}</strong><small>{roleLabel}</small></span><ChevronRight size={15} /></button>
        <button type="button" className="qa-v115-btn" onClick={() => void onLogout()}><ArrowRight size={14} /> Sign Out</button>
      </div>
    </aside>
    <div className="qa-v115-main">
      <header className="qa-v115-topbar" data-hybrid-top-bar="true">
        <div className="qa-v115-topbar-leading"><button type="button" className="qa-v115-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open Navigation"><Menu size={18} /></button><span>DAENEM Staff Portal</span></div>
        <button type="button" className="qa-v115-command" data-top-slot="global-search" onClick={onOpenModuleHub} aria-label="Open Ask DAENEM search"><span className="qa-v115-command-orb"><Sparkles size={15} /></span><span className="qa-v115-command-copy"><strong data-top-slot="ai-command">Ask DAENEM</strong><small>Search your work areas and records</small></span><kbd>⌘ / Ctrl K</kbd></button>
        <div className="qa-v115-top-actions">
          <button type="button" className="qa-v115-top-action qa-v115-chip qa-v115-hide-mobile" onClick={enableLocation} aria-label="Open Weather"><CloudSun size={15} />{weather.temperature !== undefined ? formatWeatherTemperature(weather.temperature, temperatureUnit) : 'Weather'}</button>
          <button type="button" className="qa-v115-top-action qa-v115-hide-mobile" onClick={() => setReleaseOpen(true)} aria-label="Open Release Details"><Radio size={16} />{release.version}</button>
          <button type="button" className="qa-v115-top-action" onClick={() => onOpenModule('notifications')} aria-label="Open Notifications"><Bell size={17} /></button>
          <button type="button" className="qa-v115-profile" onClick={() => onOpenModule('profile')} aria-label="Open My Profile"><span className="qa-v115-avatar">{initialsValue}</span><span className="qa-v115-profile-copy qa-v115-hide-mobile"><strong>{displayName}</strong><small>{roleLabel}</small></span><ChevronDown size={15} /></button>
        </div>
      </header>
      <section className="qa-v115-context" aria-labelledby="qa-v115-workspace-title">
        <nav className="qa-v115-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => onNavigate('overview')}>Staff Portal</button><ChevronRight size={13} /><strong aria-current="page">{moduleLabel}</strong></nav>
        <div className="qa-v115-heading"><div><span className="qa-v115-scope"><MapPin size={13} /> {company.name || 'Assigned workspace'}</span><h1 id="qa-v115-workspace-title">{moduleLabel}</h1><p>{moduleDescription}</p></div><div className="qa-v115-heading-action"><button type="button" className="qa-v115-btn primary" onClick={onOpenModuleHub}><Grid3X3 size={14} /> Authorized Workspaces</button></div></div>
      </section>
      <div className="qa-v115-preview"><span><strong>DEVELOPMENT PREVIEW ONLY</strong> · Fictional records and authorised Staff Portal data</span><span>{release.version}</span></div>
      <main className="qa-v115-content" id="main-content">{home}</main>
      <footer className="qa-v115-footer"><span>DAENEM · Staff Portal</span><span>Staging · {release.version}</span><span>Authorised Staff Portal data only</span></footer>
      <nav className="qa-v115-mobile-nav" aria-label="Mobile primary navigation"><button type="button" className={view === 'overview' ? 'active' : ''} onClick={() => onNavigate('overview')}><Gauge size={17} /><span>Overview</span></button><button type="button" onClick={onOpenModuleHub}><Grid3X3 size={17} /><span>Workspaces</span></button><button type="button" onClick={() => onOpenModule('profile')}><Users size={17} /><span>Profile</span></button></nav>
    </div>
    {releaseOpen && <ReleaseDialog release={release} onClose={() => setReleaseOpen(false)} />}
  </div>;
}

function Clock3Icon() {
  return <span className="clock-glyph" aria-hidden="true">◷</span>;
}
