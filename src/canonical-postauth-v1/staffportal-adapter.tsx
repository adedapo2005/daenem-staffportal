import { useMemo } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  Activity, BarChart3, Bell, BookOpen, BriefcaseBusiness, CalendarDays, CheckCircle2,
  CloudSun, FileText, Globe2, Grid3X3, LayoutDashboard, ListChecks, MapPinned,
  ShieldCheck, Sparkles, Users, Workflow,
} from 'lucide-react';
import { hasWorkforcePermission, type AccessLevel, type WorkforceContext } from '../auth';
import { canSeeDashboardField, type DashboardAggregateField } from '../dashboard-capabilities';
import { isModuleVisible, moduleDefinitions } from '../module-hub';
import type { LayoutDensity, LayoutId, LayoutProfile, MotionPreset } from '../layout-system';
import type { LiveDataStatus, ZipCompanyChoice, ZipDashboardSummary } from '../zip-dashboard';
import {
  CANONICAL_LAYOUT_IDS,
  CANONICAL_LAYOUT_SPECS,
  CanonicalDashboard,
  FreshnessStatus,
  CanonicalHero,
  CanonicalKpis,
  type CanonicalDashboardProps,
  type CanonicalFixture,
  type CanonicalKpi,
  type CanonicalNavigationItem,
  type CanonicalZoneId,
  type StaffPortalLayoutId,
} from './index';
import { initialsFromPersonName } from './display-standards';

type DashboardView = 'overview' | 'people' | 'forms' | 'security' | 'broadcasts' | 'facilities' | 'help';
type TemperatureUnit = 'F' | 'C';
type WeatherState = { label: string; temperature?: number; description?: string; loading?: boolean };
type ReleaseInfo = { version: string; date: string };

export type CanonicalStaffPortalAdapterProps = {
  context: WorkforceContext;
  view: DashboardView;
  company: ZipCompanyChoice;
  summary: ZipDashboardSummary | null;
  dataStatus: LiveDataStatus;
  dataLastSyncedAt?: string | null;
  dataError?: string;
  liveIntelligence?: ReactNode;
  refreshSummary: () => void;
  onNavigate: (view: DashboardView) => void;
  onOpenModule: (id: string) => void;
  onOpenModuleHub: () => void;
  onOpenAdmin: () => void;
  onLogout: () => Promise<void>;
  visibleNav: Array<{
    id: DashboardView;
    label: string;
    description: string;
    icon: ComponentType<{ size?: number }>;
  }>;
  companyChoices: ZipCompanyChoice[];
  setCompany: (company: ZipCompanyChoice) => void;
  clock: string;
  weather: WeatherState;
  temperatureUnit: TemperatureUnit;
  enableLocation: () => void;
  online: boolean;
  layoutId: LayoutId;
  layoutProfile: LayoutProfile;
  density: LayoutDensity;
  motion: MotionPreset;
  canUseLayoutStudio: boolean;
  onOpenLayoutStudio: () => void;
  release: ReleaseInfo;
  setReleaseOpen: (open: boolean) => void;
  layoutPreview?: boolean;
  layoutPreviewCanApply?: boolean;
  layoutPreviewApplying?: boolean;
  layoutPreviewMessage?: string;
  onApplyLayoutPreview?: () => void | Promise<void>;
  onExitLayoutPreview?: () => void;
};

const CANONICAL_ZONE_IDS: CanonicalZoneId[] = [
  'hero', 'kpis', 'executive-analytics', 'workspace-schedule', 'workspace-projects',
  'operations-map', 'operations-team', 'insight-story', 'master-list', 'master-detail',
  'horizon-global', 'bento-strategy', 'focus-progress', 'focus-priorities', 'studio-toolbox',
  'studio-canvas', 'board-trend', 'board-agenda', 'ai-insights', 'weather', 'world-time',
  'tasks', 'approvals', 'activity', 'knowledge', 'quick-actions', 'status', 'announcement',
];

const ZONE_TITLES: Partial<Record<CanonicalZoneId, string>> = {
  'executive-analytics': 'Revenue & Operations',
  'workspace-schedule': 'My Schedule',
  'workspace-projects': 'Featured Projects',
  'operations-map': 'Global Operations Map',
  'operations-team': 'Team Operations',
  'insight-story': 'Latest Insights',
  'master-list': 'Projects',
  'master-detail': 'Selected Work',
  'horizon-global': 'Global Operations',
  'bento-strategy': 'Strategic Priorities',
  'focus-progress': 'Today’s Progress',
  'focus-priorities': 'Today’s Priorities',
  'studio-toolbox': 'Toolbox',
  'studio-canvas': 'Working Canvas',
  'board-trend': 'Executive Trend Overview',
  'board-agenda': 'Board Agenda',
  'ai-insights': 'Daenem AI Insights',
  weather: 'Today’s World',
  'world-time': 'Global Time',
  tasks: 'My Tasks',
  approvals: 'Pending Approvals',
  activity: 'Recent Activity',
  knowledge: 'Knowledge Hub',
  'quick-actions': 'Quick Actions',
  status: 'System Status',
  announcement: 'Latest Announcements',
};

const ANALYTICAL_ZONES = new Set<CanonicalZoneId>(['executive-analytics', 'horizon-global', 'board-trend']);

function storedLayoutId(value: StaffPortalLayoutId): LayoutId {
  return value === 'master-detail-workspace' ? 'master-detail' : value;
}

function ownerOrGroupAdmin(context: WorkforceContext) {
  return context.roles.some((role) => role.code === 'owner' || role.code === 'group_admin');
}

function permission(context: WorkforceContext, code: string, minimum: AccessLevel = 'view', companyId?: string | null) {
  return hasWorkforcePermission(context, code, minimum, companyId);
}

function scopeLabel(context: WorkforceContext, company: ZipCompanyChoice) {
  return ownerOrGroupAdmin(context) ? company.name : 'Assigned Workspace';
}

function initials(name: string) {
  return initialsFromPersonName(name);
}

function businessDate() {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date());
}

function dataLabel(status: LiveDataStatus, online: boolean) {
  if (!online) return { label: 'Offline', detail: 'Last Authorized Data Remains Available Where Cached.' };
  if (status === 'ready') return { label: 'Live Data', detail: 'Updated From Authorized Staff Portal Sources.' };
  if (status === 'error') return { label: 'Unavailable', detail: 'Retry When The Connection Is Available.' };
  return { label: 'Syncing', detail: 'Reading Authorized Staff Portal Sources.' };
}

function valueFor(
  context: WorkforceContext,
  field: DashboardAggregateField,
  companyId: string | null,
  value: number | undefined,
) {
  if (!canSeeDashboardField(context, field, companyId)) return 'Permission Required';
  if (value === undefined || !Number.isFinite(value)) return 'Not Available';
  return new Intl.NumberFormat('en-NG').format(value);
}

function liveKpis(context: WorkforceContext, company: ZipCompanyChoice, summary: ZipDashboardSummary | null, online: boolean): CanonicalKpi[] {
  const mode = online ? 'Live Scope' : 'Cached Scope';
  return [
    {
      label: 'Total Staff',
      value: valueFor(context, 'employees', company.id, summary?.employees),
      delta: mode,
      meta: 'Authorized People Data',
      tone: 'blue',
    },
    {
      label: 'Monthly Revenue',
      value: 'Not Available',
      delta: 'No Data Yet',
      meta: 'Canonical Revenue Source Not Connected',
      tone: 'cyan',
    },
    {
      label: 'Active Projects',
      value: 'Not Available',
      delta: 'No Data Yet',
      meta: 'Canonical Project Source Not Connected',
      tone: 'violet',
    },
    {
      label: 'Pending Approvals',
      value: valueFor(context, 'pendingApprovals', company.id, summary?.pendingApprovals),
      delta: mode,
      meta: 'Authorized Approval Data',
      tone: 'coral',
    },
    {
      label: 'System Status',
      value: online ? 'Online' : 'Offline',
      delta: mode,
      meta: 'Staff Portal Connection',
      tone: 'success',
    },
  ];
}

function liveFixture(
  context: WorkforceContext,
  company: ZipCompanyChoice,
  summary: ZipDashboardSummary | null,
  dataStatus: LiveDataStatus,
  dataError: string | undefined,
  clock: string,
  weather: WeatherState,
  online: boolean,
  release: ReleaseInfo,
): CanonicalFixture {
  const sync = dataLabel(dataStatus, online);
  return {
    viewer: {
      displayName: context.employee.displayName,
      role: context.roles[0]?.name || 'Employee',
      initials: initials(context.employee.displayName),
    },
    workspace: {
      name: scopeLabel(context, company),
      subtitle: ownerOrGroupAdmin(context) ? 'Authorized Staff Portal Workspace' : 'Assigned Staff Portal Workspace',
    },
    release: { version: release.version, label: release.date },
    sync: { label: sync.label, detail: dataError || sync.detail },
    dateTime: { date: businessDate(), time: clock, zone: 'Africa/Lagos (WAT)' },
    weather: {
      city: weather.temperature === undefined ? 'Local Weather' : weather.label,
      tempC: weather.temperature ?? null,
      condition: weather.description || 'Not Available',
      humidity: 0,
      windKph: 0,
      uv: 'Not Available',
    },
    kpis: liveKpis(context, company, summary, online),
    tasks: [],
    approvals: [],
    activity: [],
    worldTimes: [],
  };
}

function EmptyCard({ zone, title, detail, icon: Icon = FileText, action }: {
  zone: CanonicalZoneId;
  title: string;
  detail: string;
  icon?: ComponentType<{ size?: number }>;
  action?: { label: string; onClick: () => void };
}) {
  return <article className="csp-card csp-list" data-zone={zone}>
    <header><span><Icon size={17} /><b>{title}</b></span>{action && <button type="button" onClick={action.onClick}>{action.label}</button>}</header>
    <div><span><b>{detail}</b><small>Only Authorized Staff Portal Data Is Shown.</small></span></div>
  </article>;
}

function LiveZoneCard({
  zone, context, company, summary, dataStatus, dataError, online, weather, clock, refreshSummary,
  onNavigate, onOpenModule, onOpenModuleHub, onOpenLayoutStudio, canUseLayoutStudio, release, setReleaseOpen,
 freshness, }: {
  zone: CanonicalZoneId;
  context: WorkforceContext;
  company: ZipCompanyChoice;
  summary: ZipDashboardSummary | null;
  dataStatus: LiveDataStatus;
  dataError?: string;
  online: boolean;
  weather: WeatherState;
  clock: string;
  refreshSummary: () => void;
  onNavigate: (view: DashboardView) => void;
  onOpenModule: (id: string) => void;
  onOpenModuleHub: () => void;
  onOpenLayoutStudio: () => void;
  canUseLayoutStudio: boolean;
  release: ReleaseInfo;
  setReleaseOpen: (open: boolean) => void;
 freshness?: CanonicalFixture['sync']; }) {
  const title = ZONE_TITLES[zone] || zone;
  const detail = dataError || (dataStatus === 'loading' ? 'Waiting For Authorized Data.' : 'No Authorized Data Yet.');
  const canApprovals = permission(context, 'forms.access', 'view', company.id);
  const canAttendance = canSeeDashboardField(context, 'present', company.id);
  const canEmployees = canSeeDashboardField(context, 'employees', company.id);
  if (ANALYTICAL_ZONES.has(zone)) {
    return <article className="csp-card csp-analytics" data-zone={zone}>
      <header><span><BarChart3 size={17} /><b>{title}</b></span><button type="button" onClick={refreshSummary}>Refresh Data</button></header>
      <div className="csp-analytics-metric"><strong>{dataStatus === 'ready' ? 'Not Available' : dataStatus === 'error' ? 'Unavailable' : 'Loading'}</strong><span>{online ? 'Live Scope' : 'Cached Scope'}</span><small>Revenue And Operations Intelligence Requires A Connected Canonical Source.</small></div>
    </article>;
  }
  if (zone === 'operations-map') return <EmptyCard zone={zone} title={title} detail="Not Available For This Scope" icon={MapPinned} />;
  if (zone === 'operations-team' || zone === 'bento-strategy' || zone === 'focus-progress') {
    const value = canEmployees ? valueFor(context, 'employees', company.id, summary?.employees) : 'Permission Required';
    const present = summary?.present;
    const employees = summary?.employees;
    const attendanceValue = canAttendance ? valueFor(context, 'present', company.id, present) : value;
    const attendancePercent = canAttendance && employees && Number.isFinite(present) ? Math.min(100, Math.round(((present || 0) / employees) * 100)) : 0;
    return <article className="csp-card csp-progress" data-zone={zone}><header><b>{title}</b><button type="button" onClick={refreshSummary}>Refresh Data</button></header><div><span><b>{canAttendance ? 'Present Today' : 'Team Signal'}</b><small>{attendanceValue}</small></span><progress max="100" value={attendancePercent} /></div><div><span><b>Authorized Data State</b><small>{dataStatus === 'ready' ? 'Available' : detail}</small></span><progress max="100" value={dataStatus === 'ready' ? 100 : 0} /></div></article>;
  }
  if (zone === 'workspace-schedule' || zone === 'board-agenda') return <EmptyCard zone={zone} title={title} detail="No Authorized Schedule Items" icon={CalendarDays} />;
  if (zone === 'workspace-projects' || zone === 'master-list' || zone === 'master-detail') return <EmptyCard zone={zone} title={title} detail="No Authorized Project Records" icon={BriefcaseBusiness} />;
  if (zone === 'insight-story') return <EmptyCard zone={zone} title={title} detail="Waiting For Data" icon={BookOpen} />;
  if (zone === 'ai-insights') return permission(context, 'ai_guide.access', 'view', company.id)
    ? <EmptyCard zone={zone} title={title} detail="Ask Daenem AI For An Authorized Answer" icon={Sparkles} action={{ label: 'Ask Daenem AI', onClick: () => onNavigate('help') }} />
    : <EmptyCard zone={zone} title={title} detail="Permission Required" icon={Sparkles} />;
  if (zone === 'weather') {
    const available = weather.temperature !== undefined;
    const temperature = available ? String(weather.temperature) + '°C' : 'Not Available';
    return <article className="csp-card csp-weather" data-zone={zone}><header><b>{title}</b><span /></header><div><CloudSun size={48} /><span><b>{available ? weather.label : 'Not Available'}</b><strong>{temperature}</strong><small>{weather.loading ? 'Finding Location…' : weather.description || 'Enable Location For Local Weather'}</small></span></div><footer><span>Humidity Not Available</span><span>Wind Not Available</span><span>UV Not Available</span></footer></article>;
  }
  if (zone === 'world-time') return <article className="csp-card csp-world" data-zone={zone}><header><span><Globe2 size={17} /><b>{title}</b></span></header><div><span><small>Africa/Lagos</small><b>{clock}</b><em>Current Business Time</em></span><span><small>UTC</small><b>{new Date().toISOString().slice(11, 16)} UTC</b><em>Canonical Server Zone</em></span></div></article>;
  if (zone === 'tasks') return <EmptyCard zone={zone} title={title} detail={canAttendance ? (summary?.overdueRequirements ? String(summary.overdueRequirements) + ' Requirement(s) Need Attention' : 'No Authorized Items') : 'Permission Required'} icon={ListChecks} action={{ label: 'Refresh Data', onClick: refreshSummary }} />;
  if (zone === 'approvals') return <EmptyCard zone={zone} title={title} detail={canApprovals ? (summary?.pendingApprovals ? String(summary.pendingApprovals) + ' Approval(s) Need Attention' : 'No Pending Approvals') : 'Permission Required'} icon={CheckCircle2} action={canApprovals ? { label: 'Open Approvals', onClick: () => onOpenModule('expense-approvals') } : undefined} />;
  if (zone === 'activity') return <EmptyCard zone={zone} title={title} detail="Waiting For Authorized Activity Data" icon={Activity} />;
  if (zone === 'knowledge') return permission(context, 'ai_guide.access', 'view', company.id)
    ? <EmptyCard zone={zone} title={title} detail="Authorized Knowledge Is Available Through AI Guide" icon={BookOpen} action={{ label: 'Open Knowledge', onClick: () => onNavigate('help') }} />
    : <EmptyCard zone={zone} title={title} detail="Permission Required" icon={BookOpen} />;
  if (zone === 'quick-actions') return <article className="csp-card csp-actions" data-zone={zone}><header><b>{title}</b><button type="button" onClick={onOpenModuleHub}>Open Workspaces</button></header><div><button type="button" onClick={onOpenModuleHub}><Grid3X3 size={17} />Open Workspaces</button><button type="button" onClick={refreshSummary}><Activity size={17} />Refresh Data</button><button type="button" onClick={() => onOpenModule('employee')}><Users size={17} />My Workspace</button></div></article>;
  if (zone === 'status') return <article className="csp-card csp-status" data-zone={zone}><header><span><ShieldCheck size={17} /><b>{title}</b></span><em>{online ? 'Online' : 'Offline'}</em></header><div><i /><b>Staff Portal</b><span>{dataStatus === 'ready' ? 'Operational' : dataStatus === 'error' ? 'Unavailable' : 'Syncing'}</span></div><div><i /><b>Authorized Data</b><span>{online ? 'Connected' : 'Cached'}</span></div>{freshness && <FreshnessStatus sync={freshness} variant="card" />}</article>;
  if (zone === 'announcement') return <article className="csp-card csp-announcement" data-zone={zone}><Bell size={20} /><div><small>RELEASE · {title}</small><b>Version {release.version}</b><span>Release Details Remain Available Through Staff Portal Controls.</span></div><button type="button" aria-label="Open Release Notes" onClick={() => setReleaseOpen(true)}>›</button></article>;
  if (zone === 'studio-toolbox') return <article className="csp-card csp-toolbox" data-zone={zone}><header><b>{title}</b><Workflow size={17} /></header><button type="button" onClick={onOpenModuleHub}><span>◫</span>Authorized Workspaces</button><button type="button" onClick={refreshSummary}><span>◆</span>Refresh Live Data</button></article>;
  if (zone === 'studio-canvas') return <EmptyCard zone={zone} title={title} detail="No Configured Canvas Data" icon={Workflow} />;
  return <EmptyCard zone={zone} title={title} detail={detail} icon={FileText} />;
}

function navigationItems(
  context: WorkforceContext,
  company: ZipCompanyChoice,
  visibleNav: CanonicalStaffPortalAdapterProps['visibleNav'],
  onNavigate: (view: DashboardView) => void,
  onOpenModule: (id: string) => void,
  onOpenModuleHub: () => void,
): CanonicalNavigationItem[] {
  const items: CanonicalNavigationItem[] = visibleNav.map((item) => ({
    id: 'view:' + item.id,
    label: item.label,
    icon: item.icon,
    onSelect: () => onNavigate(item.id),
  }));
  const modules = moduleDefinitions
    .filter((module) => isModuleVisible(context, module, company.id, company.code))
    .filter((module) => !items.some((item) => item.label === module.label))
    .slice(0, 18)
    .map((module) => ({
      id: 'module:' + module.id,
      label: module.label,
      icon: BriefcaseBusiness,
      onSelect: () => onOpenModule(module.id),
    }));
  return [...items, ...modules, { id: 'module-hub', label: 'Authorized Workspaces', icon: Grid3X3, onSelect: onOpenModuleHub }];
}

function isFixtureMode() {
  return import.meta.env.DEV && import.meta.env.VITE_CANONICAL_QA_FIXTURE === 'true';
}

export function CanonicalStaffPortalAdapter(props: CanonicalStaffPortalAdapterProps) {
  const {
    context, view, company, summary, dataStatus, dataLastSyncedAt, dataError, refreshSummary,
    onNavigate, onOpenModule, onOpenModuleHub, visibleNav, clock, weather, online,
    layoutId, density, motion, canUseLayoutStudio, onOpenLayoutStudio, release, setReleaseOpen,
    layoutPreview = false, layoutPreviewCanApply = false, layoutPreviewApplying = false,
    layoutPreviewMessage = '', onApplyLayoutPreview, onExitLayoutPreview,
  } = props;
  const canonicalId: StaffPortalLayoutId = 'executive-command';
  const fixtureMode = isFixtureMode();
  const fixture = useMemo(
    () => {
      const next = liveFixture(context, company, summary, dataStatus, dataError, clock, weather, online, release);
      return { ...next, sync: { ...next.sync, updatedAt: dataLastSyncedAt, timeZone: 'Africa/Lagos' } };
    },
    [clock, company, context, dataError, dataStatus, dataLastSyncedAt, online, release, summary, weather],
  );
  const navigation = useMemo(
    () => navigationItems(context, company, visibleNav, onNavigate, onOpenModule, onOpenModuleHub),
    [company, context, onNavigate, onOpenModule, onOpenModuleHub, visibleNav],
  );
  const liveSlots = useMemo(() => {
    const slots: Partial<Record<CanonicalZoneId, ReactNode>> = {};
    for (const zone of CANONICAL_ZONE_IDS) {
      if (zone === 'hero') slots[zone] = <CanonicalHero fixture={fixture} layoutId={canonicalId} />;
      else if (zone === 'kpis') slots[zone] = <CanonicalKpis fixture={fixture} layoutId={canonicalId} />;
      else slots[zone] = <LiveZoneCard zone={zone} freshness={fixture.sync} context={context} company={company} summary={summary} dataStatus={dataStatus} dataError={dataError} online={online} weather={weather} clock={clock} refreshSummary={refreshSummary} onNavigate={onNavigate} onOpenModule={onOpenModule} onOpenModuleHub={onOpenModuleHub} onOpenLayoutStudio={onOpenLayoutStudio} canUseLayoutStudio={canUseLayoutStudio} release={release} setReleaseOpen={setReleaseOpen} />;
    }
    return slots;
  }, [canUseLayoutStudio, canonicalId, clock, company, context, dataError, dataStatus, fixture, onNavigate, onOpenLayoutStudio, onOpenModule, onOpenModuleHub, online, refreshSummary, release, setReleaseOpen, summary, weather]);
  const dashboardProps: CanonicalDashboardProps = fixtureMode
    ? {
      initialLayout: canonicalId,
      // Keep the visual QA fixture identical to the explicit canonical
      // baseline. The callback is intentionally inert; it only proves the
      // approved chrome without granting fixture-mode business behavior.
      onAskAi: () => undefined,
      onLayoutChange: (next) => window.dispatchEvent(new CustomEvent('daenem:canonical-layout-preview', { detail: next })),
    }
    : {
      initialLayout: canonicalId,
      fixture,
      liveSlots,
      navigation,
      activeNavigationId: 'view:' + view,
      onWorkspace: onOpenModuleHub,
      onSearch: onOpenModuleHub,
      onAskAi: permission(context, 'ai_guide.access', 'view', company.id) ? () => onNavigate('help') : undefined,
      onQuickCreate: onOpenModuleHub,
      onNotifications: () => onOpenModuleHub(),
      onLayoutChange: (next) => window.dispatchEvent(new CustomEvent('daenem:layout-preview', { detail: { layoutId: storedLayoutId(next), density, motion } })),
    };
  return <div className="canonical-postauth-runtime" data-canonical-runtime="true" data-canonical-fixture-mode={fixtureMode ? 'true' : 'false'} data-layout-profile={canonicalId} data-layout-density={density} data-layout-motion={motion} data-data-status={dataStatus}>
    {layoutPreview && <div className="layout-preview-banner" data-layout-preview-banner="true">
      <span><strong>Previewing {CANONICAL_LAYOUT_SPECS[canonicalId].name}</strong><small>Your Saved Experience Is Unchanged Until You Apply This Layout.</small></span>
      <div className="layout-preview-actions">
        {layoutPreviewCanApply && <button type="button" className="primary-button" disabled={layoutPreviewApplying} onClick={() => void onApplyLayoutPreview?.()}>{layoutPreviewApplying ? 'Applying…' : 'Apply To Me'}</button>}
        <button type="button" className="secondary-button" onClick={onExitLayoutPreview}>Exit Preview</button>
      </div>
      {layoutPreviewMessage && <small className="layout-preview-message" role="status">{layoutPreviewMessage}</small>}
    </div>}
    <CanonicalDashboard key={canonicalId} {...dashboardProps} />
  </div>;
}

export function canonicalLayoutSelectionContract() {
  return CANONICAL_LAYOUT_IDS.map((id) => ({
    id,
    name: CANONICAL_LAYOUT_SPECS[id].name,
    navMode: CANONICAL_LAYOUT_SPECS[id].navMode,
    zones: CANONICAL_LAYOUT_SPECS[id].zones,
  }));
}
