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
import { PostAuthFeatureFrame, PostAuthHomeBanner, PostAuthOverviewComposition } from './post-auth-experience';
import { PostAuthNavigation } from './postauth-navigation';

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

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DG';
}

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
    return { value: percentage((present / employees) * 100), detail: 'Present today in authorized scope' };
  }
  return { value: numberValue(present), detail: 'Present today in authorized scope' };
}

function CommandPalette({
  context, company, visibleNav, onNavigate, onOpenModule, onOpenModuleHub, onClose,
}: Pick<ZipDashboardProps, 'context' | 'company' | 'visibleNav' | 'onNavigate' | 'onOpenModule' | 'onOpenModuleHub'> & { onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const availableModules = useMemo(() => moduleDefinitions.filter((module) => isModuleVisible(context, module, company.id, company.code)), [company.code, company.id, context]);
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
      <header><div><span className="eyebrow">AUTHORIZED WORKSPACES</span><h2 id="command-palette-title">What do you need next?</h2></div><button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close command palette"><X size={16} /></button></header>
      <label className="command-palette-input"><Search size={17} aria-hidden="true" /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }} onKeyDown={handleKeyDown} placeholder="Search authorized functions" aria-label="Search authorized functions" /></label>
      <div className="command-palette-results" role="listbox" aria-label="Authorized command results">
        {results.length ? results.map((item, index) => <button type="button" key={item.kind + '-' + item.id} className={index === selectedIndex ? 'selected' : ''} onMouseEnter={() => setSelectedIndex(index)} onClick={() => choose(item)} role="option" aria-selected={index === selectedIndex} data-command-result={item.id}><span className="command-result-icon">{item.kind === 'view' ? <Gauge size={15} /> : <Boxes size={15} />}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={14} /></button>) : <div className="command-palette-empty">No authorized workspace matches that search.</div>}
      </div>
      <footer><span>Arrow keys to move · Enter to open · Esc to close</span><button type="button" onClick={() => { onClose(); onOpenModuleHub(); }}><Grid3X3 size={14} /> Open Module Hub</button></footer>
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
  return <header className="top-bar" data-command-bar="true">
    <div className="search-wrap"><button ref={commandTriggerRef} type="button" className="top-command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open command palette"><Search size={17} aria-hidden="true" /><span>Search authorized workspaces</span><span className="search-shortcut">⌘ / Ctrl K</span></button></div>
    <div className="top-actions">
      {canAsk && <button className="top-action ai-button" onClick={() => onNavigate('help')}><Sparkles size={16} /><span>Ask Daenem AI</span></button>}
      <div className="notification-wrap"><button className="icon-button notification-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Bell size={18} /><i className="alert-dot" /></button>
        {notificationsOpen && <div className="notification-popover" role="dialog" aria-label="Notifications"><div className="popover-title"><b>Notifications</b><button className="icon-button subtle" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={15} /></button></div><p>Signals from your authorized workspaces.</p><div className="notification-list">{notificationItems.map((item) => <div className="notification-row" key={item.title}><i className={'notification-dot ' + item.tone} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>)}</div></div>}
      </div>
      <button className="weather-mini" onClick={enableLocation} title="Enable location and weather"><CloudSun size={19} /><span><b>{formatWeatherTemperature(weather.temperature, temperatureUnit)}</b><small>{weather.loading ? 'Finding location…' : weather.description || weather.label}</small></span></button>
      <div className="top-utilities"><button type="button" className="top-more-button" onClick={() => setUtilitiesOpen((open) => !open)} aria-expanded={utilitiesOpen}><Menu size={16} /> More</button>
        {utilitiesOpen && <div className="top-utilities-menu" role="menu"><button role="menuitem" onClick={() => { setUtilitiesOpen(false); onOpenModuleHub(); }}><Plus size={15} /> Quick actions</button><button role="menuitem" onClick={() => void handleInstallApp()}><Download size={15} /> {installState === 'working' ? 'Installing…' : installState === 'installed' ? 'App installed' : 'Install App'}</button>{canUseLayoutStudio && <button role="menuitem" onClick={() => { setUtilitiesOpen(false); onOpenLayoutStudio(); }}><LayoutDashboard size={15} /> Layout Studio</button>}<button role="menuitem" onClick={() => { setUtilitiesOpen(false); setSupportOpen((open) => !open); }}><ShieldCheck size={15} /> Help & Support</button><button role="menuitem" onClick={() => { setUtilitiesOpen(false); onNavigate('help'); }}><MessageSquareText size={15} /> Messages</button><button role="menuitem" onClick={() => { setUtilitiesOpen(false); onOpenModuleHub(); }}><Star size={15} /> Favorites</button><button role="menuitem" onClick={() => { setUtilitiesOpen(false); setReleaseOpen(true); }}><Radio size={15} /> Release notes</button></div>}
      </div>
      <div className="profile-wrap"><button className="profile-button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}><span className="avatar">{employeeInitials}</span><span className="profile-name"><strong>{context.employee.displayName}</strong><small>{primaryRole}</small></span><ChevronDown size={16} /></button>
        {profileOpen && <div className="profile-menu"><div className="profile-menu-head"><span className="avatar">{employeeInitials}</span><div className="profile-menu-head-copy"><strong>{context.employee.displayName}</strong><small>{context.employee.email || 'Employee account'}</small></div></div><div className="profile-menu-access"><span>{primaryRole}</span><span>{permissionCount} active permissions</span></div>{companyChoices.length > 1 && <div className="profile-scope"><small>Organization scope</small><div>{companyChoices.map((item) => { const Icon = item.icon; return <button key={item.code} className={company.code === item.code ? 'selected' : ''} onClick={() => { setCompany(item); setProfileOpen(false); }}><Icon size={14} /><span>{item.name}</span></button>; })}</div></div>}<strong>Workspace appearance · {themeName}</strong>{themeList.map((item) => <button key={item.id} onClick={() => { setTheme(item.id); setProfileOpen(false); }} className={theme === item.id ? 'selected' : ''}><Palette size={16} /><span>{item.name}</span></button>)}<div className="mode-picker"><small>Display mode</small><div><button className={modePreference === 'day' ? 'selected' : ''} onClick={() => setModePreference('day')}><Sun size={14} /> Light</button><button className={modePreference === 'night' ? 'selected' : ''} onClick={() => setModePreference('night')}><Moon size={14} /> Dark</button><button className={modePreference === 'auto' ? 'selected' : ''} onClick={() => setModePreference('auto')}><Sun size={14} /> Auto</button></div></div>{canChangeWeatherUnit && <div className="mode-picker temperature-picker"><small>Weather units · admin control</small><div><button className={temperatureUnit === 'F' ? 'selected' : ''} onClick={() => setTemperatureUnit('F')}>°F</button><button className={temperatureUnit === 'C' ? 'selected' : ''} onClick={() => setTemperatureUnit('C')}>°C</button></div></div>}<button onClick={onOpenAdmin}><Settings2 size={16} /><span>Admin Center</span></button><button className="logout-menu" onClick={() => void onLogout()}><span>Sign out</span></button></div>}
      </div>
    </div>
    {supportOpen && <div className="support-popover"><div className="popover-title"><b>Help & Support</b><button className="icon-button subtle" onClick={() => setSupportOpen(false)} aria-label="Close help"><X size={15} /></button></div><p>Find answers, view product guidance, or contact the platform team.</p><div className="support-links"><button onClick={() => { setSupportOpen(false); onNavigate('help'); }}>Browse FAQs <span>→</span></button><button onClick={() => { setSupportOpen(false); onOpenAdmin(); }}>Read admin docs <span>→</span></button><button onClick={() => { setSupportOpen(false); onNavigate('help'); }}>Contact support <span>→</span></button></div></div>}
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
    { field: 'present', label: 'Present today', value: numberValue(summary?.present), detail: summary?.workDate || 'Live attendance', icon: CalendarCheck2, tone: 'green' },
    { field: 'incompleteAttendance', label: 'Needs review', value: numberValue((summary?.incompleteAttendance ?? 0) + (summary?.pendingApprovals ?? 0) + (summary?.overdueRequirements ?? 0)), detail: 'Authorized follow-up items', icon: AlertTriangle, tone: 'amber' },
    { field: 'securityAlerts', label: 'Security health', value: summary ? (summary.securityAlerts ? 'Review' : 'Good') : '—', detail: summary ? `${summary.securityAlerts} high-risk event(s)` : 'Loading scoped status', icon: ShieldCheck, tone: summary?.securityAlerts ? 'red' : 'violet' },
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
    <ChartHeader eyebrow="WORKFORCE PULSE" title="Attendance trend" icon={Activity} />
    <div className="chart-legend"><span><i style={{ background: 'var(--primary)' }} /> Present today</span><span><i style={{ background: 'var(--accent)' }} /> Incomplete</span></div>
    <div className="chart-canvas zip-chart-canvas" role="img" aria-label={summary ? `Attendance completion is ${percentage(rate)}` : 'Attendance trend is unavailable'}>
      <div className="chart-grid-lines"><i /><i /><i /><i /></div>
      <svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true">
        <path d={`M0 ${150 - rate * .55} C 90 ${142 - rate * .45}, 130 ${122 - rate * .35}, 205 ${132 - rate * .4} S 330 ${102 - rate * .25}, 405 ${118 - rate * .28} S 520 ${78 - rate * .2}, 600 ${105 - rate * .25}`} />
        <path className="secondary-line" d={`M0 ${164 - (100 - rate) * .18} C 100 ${158 - (100 - rate) * .2}, 180 ${155 - (100 - rate) * .15}, 260 ${160 - (100 - rate) * .18} S 430 ${141 - (100 - rate) * .12}, 600 ${150 - (100 - rate) * .14}`} />
      </svg>
      {!summary && <div className="chart-empty"><PackageSearch size={18} /><span>Trend data is not available for this scope yet.</span></div>}
    </div>
    <footer className="chart-footer"><span>{summary ? `${percentage(rate)} completion` : 'Scoped trend'}</span><button className="text-button" onClick={refreshSummary}><RefreshCw size={14} /> Refresh</button></footer>
  </article>;
}

function ComparisonWidget({ summary }: Pick<ZipDashboardProps, 'summary'>) {
  const metrics = [
    ['Attendance', attendanceRate(summary)],
    ['Requirements', summary && summary.employees > 0 ? ((summary.employees - summary.overdueRequirements) / summary.employees) * 100 : 0],
    ['Security', summary ? (summary.securityAlerts === 0 ? 100 : Math.max(0, 100 - summary.securityAlerts * 10)) : 0],
  ] as const;
  return <article className="chart-card comparison-card"><ChartHeader eyebrow="SCOPED COMPARISON" title="Workspace health" icon={ArrowRight} /><div className="comparison-list">{metrics.map(([label, value]) => <div key={label}><div><span>{label}</span><b>{summary ? percentage(value) : '—'}</b></div><i><em style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i></div>)}</div><p className="widget-note">Values are calculated only from records your current role can access.</p></article>;
}

function CategoryWidget({ summary }: Pick<ZipDashboardProps, 'summary'>) {
  const present = summary?.present || 0;
  const incomplete = summary?.incompleteAttendance || 0;
  const absent = summary ? Math.max(0, summary.employees - present - incomplete) : 0;
  const total = summary?.employees || 0;
  const presentDegrees = total ? (present / total) * 360 : 0;
  const incompleteDegrees = total ? (incomplete / total) * 360 : 0;
  const style = { '--category-ring': `conic-gradient(var(--primary) 0deg ${presentDegrees}deg, var(--accent) ${presentDegrees}deg ${presentDegrees + incompleteDegrees}deg, color-mix(in srgb, var(--muted) 18%, transparent) ${presentDegrees + incompleteDegrees}deg 360deg)` } as CSSProperties;
  return <article className="chart-card category-card"><ChartHeader eyebrow="TODAY'S MIX" title="Attendance categories" icon={CalendarCheck2} /><div className="donut-layout"><div className="donut" style={style}><div className="donut-ring" /><div className="donut-center"><strong>{summary ? percentage(attendanceRate(summary)) : '—'}</strong><span>present</span></div></div><div className="donut-legend"><span><i style={{ background: 'var(--primary)' }} />Present <b>{numberValue(present)}</b></span><span><i style={{ background: 'var(--accent)' }} />Incomplete <b>{numberValue(incomplete)}</b></span><span><i style={{ background: 'var(--muted)' }} />Other <b>{numberValue(absent)}</b></span></div></div></article>;
}

function ForecastWidget({ summary }: Pick<ZipDashboardProps, 'summary'>) {
  const followUps = summary
    ? summary.incompleteAttendance + summary.pendingApprovals + summary.overdueRequirements + summary.securityAlerts
    : 0;
  const readiness = summary && summary.employees > 0
    ? Math.max(0, 100 - (followUps / summary.employees) * 25)
    : 0;
  return <article className="insight-card forecast-card"><span className="insight-icon"><Sparkles size={17} /></span><span className="eyebrow">WORKSPACE INSIGHT</span><h3>Make the next action obvious.</h3><p>Use the authorized queue to open the exact record that needs attention. No private or unauthorized data is inferred here.</p><div className="forecast-meter"><span style={{ width: `${readiness}%` }} /></div><div className="insight-foot"><span>{summary ? `${numberValue(followUps)} open follow-up${followUps === 1 ? '' : 's'}` : 'Waiting for live records'}</span><ArrowRight size={15} /></div></article>;
}

function QueueWidget({ summary, context, company, onNavigate, onOpenModule }: Pick<ZipDashboardProps, 'summary' | 'context' | 'company' | 'onNavigate' | 'onOpenModule'>) {
  const queueItems: Array<{ field: DashboardAggregateField; label: string; detail: string; value: number; action: () => void }> = [
    { field: 'incompleteAttendance', label: 'Incomplete attendance', detail: 'Open Attendance & GPS', value: summary?.incompleteAttendance ?? 0, action: () => onOpenModule('attendance') },
    { field: 'pendingApprovals', label: 'Pending approvals', detail: 'Open People & Payroll', value: summary?.pendingApprovals ?? 0, action: () => onNavigate('people') },
    { field: 'overdueRequirements', label: 'Overdue requirements', detail: 'Review assigned forms', value: summary?.overdueRequirements ?? 0, action: () => onNavigate('forms') },
    { field: 'securityAlerts', label: 'Security alerts', detail: 'Open Security Center', value: summary?.securityAlerts ?? 0, action: () => onNavigate('security') },
  ];
  const queue = queueItems.filter((item) => canSeeDashboardField(context, item.field, company.id));
  if (!queue.length) return null;
  return <article className="queue-card"><span className="queue-accent" /><ChartHeader eyebrow="ACTION QUEUE" title="Needs your attention" icon={AlertTriangle} /><div className="queue-list">{queue.map((item) => <button key={item.label} onClick={item.action}><span className="queue-number">{String(item.value).padStart(2, '0')}</span><span><b>{item.label}</b><small>{item.detail}</small></span><ArrowRight size={14} /></button>)}</div><div className="queue-footer"><span>Open records remain company-scoped</span><CheckCircle2 size={15} /></div></article>;
}

function StatusWidget({ online, context, company }: Pick<ZipDashboardProps, 'online' | 'context' | 'company'>) {
  const statusRows = [
    ['Portal', online, online ? 'Online' : 'Offline'],
    ['Identity', true, 'Verified'],
    ['Company scope', true, company.id ? company.code : `${context.companies.length} assigned`],
    ['RBAC', true, 'Enforced'],
  ] as const;
  return <article className="status-card"><ChartHeader eyebrow="SYSTEM STATUS" title="Workspace status" icon={ShieldCheck} /><div className="status-list">{statusRows.map(([label, okay, value]) => <div key={label}><span><i className={okay ? 'status-ok' : 'status-warn'} />{label}</span><b>{value}</b><small>{okay ? 'Ready' : 'Check connection'}</small></div>)}</div><div className="status-footer"><span>Last checked {new Date().toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}</span><b>{online ? 'Operational' : 'Offline'}</b></div></article>;
}

function NewsWidget({ release }: Pick<ZipDashboardProps, 'release'>) {
  const items = [
    { date: release.date, title: `Staff Portal ${release.version}`, detail: 'Protected workspace release' },
    { date: 'LIVE', title: 'Company-scoped access', detail: 'Permissions stay inside assigned businesses' },
    { date: 'NOW', title: 'Module loading', detail: 'Open only the ERP workspace you need' },
  ];
  return <article className="news-card"><ChartHeader eyebrow="PORTAL NOTES" title="Latest updates" icon={PackageSearch} /><div className="news-list">{items.map((item) => <div className="news-item" key={`${item.date}-${item.title}`}><span className="news-date">{item.date}</span><p><b>{item.title}</b><small>{item.detail}</small></p><ArrowRight size={14} /></div>)}</div></article>;
}

function MotivationWidget({ onNavigate, enabled }: { onNavigate: (view: ViewName) => void; enabled: boolean }) {
  return <article className="motivation-card"><span className="motivation-spark"><Sparkles size={17} /></span><span className="eyebrow">DAILY WORD</span><h3>Small improvements compound.</h3><p>Keep the next task clear, complete the record, and leave the workspace stronger for the next person.</p><div className="motivation-foot"><span>Human-approved communication</span>{enabled ? <button onClick={() => onNavigate('broadcasts')}>Open Broadcasts <ArrowRight size={13} /></button> : <span>Workspace guidance</span>}</div></article>;
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
    <button type="button" aria-label="Move card up" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={12} /></button>
    <button type="button" aria-label="Move card down" disabled={index === count - 1} onClick={() => onMove(index, 1)}><ArrowDown size={12} /></button>
    {canManage && <><button type="button" aria-label="Replace widget" onClick={onReplace}><RefreshCw size={12} /></button><button type="button" aria-label="Remove widget" disabled={count <= 1} onClick={onRemove}><X size={12} /></button></>}
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
  quickActions.push({ label: isManagerial ? 'Tasks & approvals' : 'My workspaces', detail: 'Open authorized workspaces', icon: CheckCircle2, action: onOpenModuleHub });
  if (can(context, 'ai_guide.access', 'view', company.id)) quickActions.push({ label: 'Help & support', detail: 'Find role-aware guidance', icon: ShieldCheck, action: () => onNavigate('help') });
  return <section className={'workspace-overview-grid' + (isManagerial ? '' : ' employee-task-first')} aria-label="Personalized staff workspace overview">
    <article className="profile-summary-card">
      <header className="overview-card-header"><div><span className="eyebrow">MY WORKSPACE · STAFF ERP</span><h2>Your profile</h2></div><span className="live-chip"><i /> Personalized home</span></header>
      <div className="profile-summary-body">
        <div className="profile-summary-avatar">{initials(context.employee.displayName)}</div>
        <div><strong>{context.employee.displayName}</strong><span>{context.employee.jobTitle || 'Employee'}{context.employee.department ? ' · ' : ''}{context.employee.department || ''}</span><small>{context.employee.team || 'Assigned team'} · {company.name}</small></div>
      </div>
      <div className="profile-summary-meta">
        <span><small>Last login</small><strong>{formatLastLogin(context.employee.lastLoginAt)}</strong></span>
        <span><small>Account status</small><strong>{context.employee.status === 'provisional' ? 'Provisional access' : 'Active employee'}</strong></span>
      </div>
      <div className="profile-summary-stats">
        <div><small>Assigned roles</small><strong>{roles.length}</strong><span>{roles.slice(0, 2).map((role) => role.name).join(' · ')}{roles.length > 2 ? ' +' : ''}</span></div>
        <div><small>Permissions</small><strong>{permissionCount}</strong><span>Role-scoped access</span></div>
      </div>
    </article>
    <article className="access-summary-card">
      <header className="overview-card-header"><div><span className="eyebrow">{isManagerial ? 'ACCESS & RESPONSIBILITIES' : 'YOUR ACCESS'}</span><h2>{isManagerial ? 'Your operating perimeter' : 'Your access'}</h2></div><ShieldCheck size={18} /></header>
      {isManagerial ? <div className="access-summary-lines">
        <div><span>Module access</span><strong>{moduleCount}</strong></div>
        <div><span>Approval rights</span><strong>{approvalCount}</strong></div>
        <div><span>Administrative privileges</span><strong>{adminAccess ? 'Enabled' : 'Role-scoped'}</strong></div>
      </div> : <div className="access-summary-lines personal-access-lines">
        <div><span>Assigned workspace</span><strong>{company.name}</strong></div>
        <div><span>Role access</span><strong>{roles[0]?.name || 'Employee'}</strong></div>
        <div><span>Guided help</span><strong>{can(context, 'ai_guide.access', 'view', company.id) ? 'Available' : '—'}</strong></div>
      </div>}
      <div className="access-role-stack">{roles.slice(0, 4).map((role) => <span className="access-role-pill" key={role.id}>{role.name}</span>)}</div>
      <small className="access-summary-foot">Page access, role hierarchy, and approval actions remain enforced by server-side RBAC.</small>
    </article>
    <article className="self-service-card">
      <header className="overview-card-header"><div><span className="eyebrow">SELF-SERVICE · STAFF ERP</span><h2>Commonly used actions</h2></div><Sparkles size={18} /></header>
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
  return <section className="erp-pulse-section" aria-label="Authorized ERP pulse">
    <header className="erp-pulse-header"><div><span className="eyebrow">MULTI-ERP COMMAND LAYER</span><h2>Every workspace, clearly separated</h2><p>Each ERP keeps its own hierarchy, functions, signal cards, and quick actions.</p></div><button className="secondary-button" onClick={onOpenModuleHub}><LayoutDashboard size={15} /> Open exact hierarchy</button></header>
    <div className="erp-pulse-grid">{groups.map((group) => {
      const modules = availableModules.filter((module) => module.erpId === group.id);
      const firstModule = modules[0];
      const isStaff = group.id === 'staff';
      const attendanceAllowed = canSeeDashboardField(context, 'present', company.id);
      const signal = isStaff && attendanceAllowed ? numberValue(summary?.present) : 'Available on open';
      const signalLabel = isStaff && attendanceAllowed ? 'Present today' : 'Authorized functions';
      return <article className="erp-pulse-card" key={group.id}>
        <header><span className="erp-pulse-icon"><HierarchyIcon iconKey={group.iconKey} size={16} /></span><div><span className="eyebrow">{group.label}</span><h3>{group.detail}</h3></div></header>
        <div className="erp-pulse-chart" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="erp-pulse-meta"><span><small>Authorized functions</small><strong>{modules.length}</strong></span><span><small>{signalLabel}</small><strong>{signal}</strong></span></div>
        <div className="erp-pulse-actions"><button type="button" onClick={() => firstModule ? onOpenModule(firstModule.id) : onOpenModuleHub()}>{firstModule ? 'Open ERP' : 'Open directory'} <ArrowRight size={13} /></button><button type="button" onClick={onOpenModuleHub}>Functions <ChevronRight size={13} /></button></div>
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
  const managerTiles: Array<{ field: DashboardAggregateField; label: string; value: string; detail: string; icon: React.ComponentType<{ size?: number }> }> = [
    { field: 'employees', label: 'Team workload', value: numberValue(summary?.employees), detail: 'People in your authorized scope', icon: Users },
    { field: 'pendingApprovals', label: 'Approvals', value: numberValue(summary?.pendingApprovals), detail: 'Requests awaiting action', icon: ClipboardCheck },
    { field: 'overdueRequirements', label: 'Overdue work', value: numberValue(summary?.overdueRequirements), detail: 'Requirements to follow through', icon: AlertTriangle },
    { field: 'present', label: 'Attendance', value: attendance.value, detail: attendance.detail, icon: CalendarCheck2 },
  ];
  const tiles = managerTiles.filter((tile) => canSeeDashboardField(context, tile.field, company.id));
  const actions = [
    can(context, 'users.access', 'view', company.id) ? <button key="team" type="button" onClick={() => onNavigate('people')}><Users size={14} /> Review team</button> : null,
    can(context, 'forms.access', 'view', company.id) ? <button key="forms" type="button" onClick={() => onNavigate('forms')}><ClipboardCheck size={14} /> Open approvals</button> : null,
    can(context, 'security.access', 'view', company.id) ? <button key="security" type="button" onClick={() => onNavigate('security')}><ShieldCheck size={14} /> Check security signals</button> : null,
  ].filter(Boolean);
  if (!tiles.length && !actions.length) return null;
  return <section className="manager-command-center" aria-label="Manager home">
    <header className="manager-command-header"><div><span className="eyebrow">MANAGER HOME</span><h2>Team rhythm, next actions</h2><p>Prioritized workload, approvals and operational exceptions for your authorized team scope.</p></div><button type="button" className="secondary-button" onClick={onOpenModuleHub}><LayoutDashboard size={15} /> Open workspaces</button></header>
    {tiles.length > 0 && <div className="manager-command-grid">{tiles.map((tile) => { const Icon = tile.icon; return <article key={tile.label}><span className="manager-command-icon"><Icon size={16} /></span><span className="eyebrow">{tile.label}</span><strong>{tile.value}</strong><small>{tile.detail}</small></article>; })}</div>}
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
  return <section className="owner-command-center" data-owner-command-center="true" aria-label="Owner command center">
    <header className="owner-command-header"><div><span className="eyebrow">OWNER COMMAND CENTER · BUSINESS HEALTH</span><h2>Financial, operational and control truth</h2><p>Verified business intelligence stays connected to the canonical ERP actions that resolve it.</p></div><div className="heading-actions"><button className="secondary-button" onClick={onOpenModuleHub}><LayoutDashboard size={15} /> Manage workspaces</button><button className="primary-button" onClick={onOpenAdmin}><Settings2 size={15} /> Open Admin Center</button></div></header>
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
  return <section className="premium-skeleton-card" aria-live="polite" aria-label="Loading dashboard data">
    <div className="premium-skeleton-lines"><span /><span /><span /></div>
    <div><strong>Preparing scoped dashboard data</strong><small>Live records are taking longer than expected. Your workspace is still responsive.</small></div>
    <span className="premium-loading-foot"><i /> Syncing securely</span>
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
    <div className="widget-customize-toolbar" aria-label="Dashboard customization"><span><Settings2 size={14} /> {customizing ? 'Customize Dashboard' : 'Personal dashboard'}</span><button type="button" className="text-button" onClick={() => setCustomizing((value) => !value)}>{customizing ? 'Done' : 'Customize Dashboard'}</button></div>
    {customizing && canManageWidgets && <div className="widget-admin-toolbar" aria-label="Administrator widget controls">
      <span><Settings2 size={14} /> Admin widget controls</span>
      <label className="widget-style-control">Widget style<select value={widgetStyle} onChange={(event) => setWidgetStyle(event.target.value as WidgetStyle)} aria-label="Dashboard widget style"><option value="compact">Compact</option><option value="full">Full</option><option value="card">Card</option><option value="strip">Strip</option></select></label>
      {hiddenWidgets.map((widget) => <button type="button" key={widget} onClick={() => addWidget(widget)}>+ {widgetLabels[widget]}</button>)}
      <details className="widget-clock-config">
        <summary>Global time settings</summary>
        <div className="widget-clock-config-body">
          <label>Clock style<select value={clockPreferences.style} onChange={(event) => updateClockPreferences({ style: event.target.value as ClockStyle })}><option value="minimal">Minimal</option><option value="detailed">Detailed</option><option value="neon">Neon accent</option><option value="classic">Classic</option></select></label>
          <label>Find locations<input type="search" value={clockQuery} onChange={(event) => setClockQuery(event.target.value)} placeholder="Search city or country" /></label>
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
    <header><div><span className="eyebrow">DAENEM STAFF PORTAL</span><h2 id="release-title">Version {release.version}</h2><p>Prepared {release.date} through the protected release branch.</p></div><button className="icon-button" onClick={onClose} aria-label="Close version details"><X size={20} /></button></header>
    <div className="release-status"><ShieldCheck size={19} /><span><strong>Protected release</strong><small>Every listed change passes controlled validation before production activation.</small></span></div>
    <ul><li>ZIP-aligned authenticated dashboard shell and responsive workspace layout.</li><li>Company-scoped modules, controls and permissions remain connected.</li><li>Lazy-loaded ERP workspaces stay available through Module Hub.</li></ul>
  </section></div>;
}

export function ZipDashboard({
  context,
  view,
  content,
  company,
  companyChoices,
  setCompany,
  summary,
  dataStatus,
  dataLastSyncedAt,
  dataError,
  liveIntelligence,
  refreshSummary,
  onNavigate,
  onOpenModule,
  onOpenModuleHub,
  onOpenAdmin,
  onLogout,
  visibleNav,
  theme,
  modePreference,
  setTheme,
  setModePreference,
  dashboardLayout,
  themeName,
  clock,
  weather,
  temperatureUnit,
  setTemperatureUnit,
  canChangeWeatherUnit,
  enableLocation,
  online,
  sidebarOpen,
  setSidebarOpen,
  release,
  releaseOpen,
  setReleaseOpen,
  activeErpId,
  layoutId,
  layoutProfile,
  density,
  motion,
  canUseLayoutStudio,
  onOpenLayoutStudio,
  layoutPreview = false,
  layoutPreviewCanApply = false,
  layoutPreviewApplying = false,
  layoutPreviewMessage = '',
  onApplyLayoutPreview,
  onExitLayoutPreview,
}: ZipDashboardProps) {
  useEffect(() => {
    document.body.classList.add('dashboard-active');
    return () => document.body.classList.remove('dashboard-active');
  }, []);

  const activeView = view;
  const moduleLabel = useMemo(() => visibleNav.find((item) => item.id === activeView)?.label || 'Overview', [activeView, visibleNav]);
  const liveDataLabel = dataStatus === 'ready'
    ? (online ? 'Live data' : 'Last synced')
    : dataStatus === 'error'
      ? 'Data unavailable'
      : 'Syncing live data';
  const liveDataDetail = dataError || (dataLastSyncedAt ? `Updated ${formatLastSyncedAt(dataLastSyncedAt)}` : 'Reading secured D1 records');
  const motionTokens = getMotionTokens(motion);
  const homeContext = context.roles.some((role) => ['owner', 'group_admin'].includes(role.code)) ? 'owner-home' : context.roles.some((role) => ['manager', 'company_admin'].includes(role.code)) ? 'manager-home' : 'employee-home';
  const experienceStyle = { '--postauth-motion-duration': motionTokens.duration, '--postauth-motion-distance': motionTokens.distance, '--postauth-motion-ease': motionTokens.easing, '--postauth-motion-elevation': motionTokens.elevation } as CSSProperties;

  const scopedSummary = summary;

  return <main className={`dashboard-page dashboard-${dashboardLayout} dashboard-view-${activeView} postauth-layout postauth-layout-${layoutId} postauth-density-${density} postauth-motion-${motion}`} style={experienceStyle} data-layout-profile={layoutId} data-layout-density={density} data-layout-motion={motion} data-layout-preview={layoutPreview ? 'true' : 'false'} data-active-erp={activeErpId}>
    <PostAuthNavigation
      layoutProfile={layoutProfile}
      context={context}
      company={company}
      visibleNav={visibleNav}
      activeView={activeView}
      online={online}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      onNavigate={onNavigate}
      onOpenModuleHub={onOpenModuleHub}
      onOpenModule={onOpenModule}
      release={release}
      setReleaseOpen={setReleaseOpen}
    />
    {sidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

    <section className="dashboard-content">
      {layoutPreview && <div className="layout-preview-banner" data-layout-preview-banner="true">
        <span><strong>Previewing {layoutProfile.name}</strong><small>Your saved experience is unchanged until you apply this layout.</small></span>
        <div className="layout-preview-actions">
          {layoutPreviewCanApply && <button type="button" className="primary-button" disabled={layoutPreviewApplying} onClick={() => void onApplyLayoutPreview?.()}>{layoutPreviewApplying ? 'Applying…' : 'Apply to Me'}</button>}
          <button type="button" className="secondary-button" onClick={onExitLayoutPreview}>Exit Preview</button>
        </div>
        {layoutPreviewMessage && <small className="layout-preview-message" role="status">{layoutPreviewMessage}</small>}
      </div>
      <ZipTopBar
        context={context}
        company={company}
        visibleNav={visibleNav}
        companyChoices={companyChoices}
        setCompany={setCompany}
        theme={theme}
        modePreference={modePreference}
        setTheme={setTheme}
        setModePreference={setModePreference}
        themeName={themeName}
        clock={clock}
        weather={weather}
        temperatureUnit={temperatureUnit}
        setTemperatureUnit={setTemperatureUnit}
        canChangeWeatherUnit={canChangeWeatherUnit}
        enableLocation={enableLocation}
        onNavigate={onNavigate}
        onOpenModuleHub={onOpenModuleHub}
        onOpenModule={onOpenModule}
        onOpenAdmin={onOpenAdmin}
        onOpenLayoutStudio={onOpenLayoutStudio}
        canUseLayoutStudio={canUseLayoutStudio}
        onLogout={onLogout}
        summary={summary}
        release={release}
        setReleaseOpen={setReleaseOpen}
      />
      <div className="mobile-dashboard-title"><button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={18} /></button><div className="brand-mark"><img className="brand-mark-image animated-daenem-logo" src="/brand-assets/logo-mark.svg" alt="" /></div><span>{moduleLabel}</span></div>
      <div className="dashboard-main">
        {view !== 'overview' && <div className="dashboard-module-toolbar"><span className="eyebrow">DAENEM BUSINESS ERP · {moduleLabel}</span><button className="secondary-button" onClick={onOpenModuleHub}><LayoutDashboard size={15} /> Module Hub</button></div>}
        <div className="dashboard-context-line"><span><MapPin size={14} /> {company.name}</span><span><Clock3Icon /> {clock}</span><button onClick={enableLocation}><CloudSun size={14} /> {weather.label}{weather.temperature !== undefined ? ` · ${formatWeatherTemperature(weather.temperature, temperatureUnit)}` : ''}</button><span className={`data-sync-chip data-sync-${dataStatus}`} title={liveDataDetail}><i /> {liveDataLabel}{dataLastSyncedAt && dataStatus !== 'loading' ? ` · ${formatLastSyncedAt(dataLastSyncedAt)}` : ''}</span></div>
        <div className="company-switcher" role="list" aria-label="Company filter">{companyChoices.map((item) => {
          const Icon = item.icon;
          return <button key={item.code} onClick={() => setCompany(item)} className={company.code === item.code ? 'active' : ''}><Icon size={15} /><span>{item.code}</span></button>;
        })}</div>
        {view === 'overview'
          ? <PostAuthOverviewComposition
            profile={layoutProfile}
            context={context}
            smartContext={getSmartContext(homeContext)}
            hero={<PostAuthHomeBanner context={context} summary={scopedSummary} company={company} onNavigate={onNavigate} onOpenModule={onOpenModule} onOpenModuleHub={onOpenModuleHub} />}
            pulse={<ErpPulseGrid context={context} company={company} summary={scopedSummary} onOpenModule={onOpenModule} onOpenModuleHub={onOpenModuleHub} />}
            loading={<SmartLoadingCard pending={dataStatus === 'loading'} />}
            kpis={<KpiStrip summary={scopedSummary} company={company} context={context} />}
            widgets={<><div className="widget-toolbar"><span><GripVertical size={15} /> Personalize the workspace when you are ready</span><button className="text-button" onClick={refreshSummary}><RefreshCw size={14} /> Refresh data</button></div><DashboardWidgets widgets={initialWidgets} summary={scopedSummary} company={company} context={context} online={online} refreshSummary={refreshSummary} onNavigate={onNavigate} onOpenModule={onOpenModule} release={release} /></>}
            workspace={<WorkspaceOverviewStrip context={context} company={company} onNavigate={onNavigate} onOpenModule={onOpenModule} onOpenModuleHub={onOpenModuleHub} />}
            owner={context.roles.some((role) => ['owner', 'group_admin'].includes(role.code)) ? <OwnerCommandCenter context={context} company={company} summary={scopedSummary} online={online} onOpenAdmin={onOpenAdmin} onOpenModuleHub={onOpenModuleHub} /> : <ManagerCommandCenter context={context} company={company} summary={scopedSummary} onNavigate={onNavigate} onOpenModuleHub={onOpenModuleHub} />}
            intelligence={liveIntelligence ? <section className="zip-live-intelligence" data-owner-business-intelligence="true"><div className="zip-section-heading"><span className="eyebrow">OWNER INTELLIGENCE</span><h2>Financial and operational performance</h2></div>{liveIntelligence}</section> : null}
            clocks={<section className="dashboard-world-clock" aria-label="Global operations world clock"><WorldClocks /></section>}
          /> : <PostAuthFeatureFrame profile={layoutProfile} moduleLabel={moduleLabel} canonicalPath={'/workspace/' + activeView} context={context} contextKey={activeView} onOpenModuleHub={onOpenModuleHub} onNavigateHelp={() => onNavigate('help')}><div className="zip-module-content">{content}</div></PostAuthFeatureFrame>}
        <footer className="dashboard-footer"><span>Daenem Business ERP · {activeErpId.toUpperCase()}</span><span>Live D1 data · <b>{dataStatus === 'ready' ? (online ? 'Connected' : 'Last synced') : dataStatus === 'error' ? 'Unavailable' : 'Syncing'}</b></span></footer>
      </div>
    </section>

    {releaseOpen && <ReleaseDialog release={release} onClose={() => setReleaseOpen(false)} />}
  </main>;
}

function Clock3Icon() {
  return <span className="clock-glyph" aria-hidden="true">◷</span>;
}
