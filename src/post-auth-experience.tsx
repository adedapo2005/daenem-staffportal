import type { ReactNode } from 'react';
import type { WorkforceContext } from './auth';
import type { LayoutProfile } from './layout-system';
import type { ZipCompanyChoice, ZipDashboardSummary } from './zip-dashboard';

type HomeTone = 'employee' | 'manager' | 'owner';

function toneFor(context: WorkforceContext): HomeTone {
  if (context.roles.some((role) => role.code === 'owner')) return 'owner';
  if (context.roles.some((role) => ['group_admin', 'company_admin', 'manager'].includes(role.code))) return 'manager';
  return 'employee';
}

export function PostAuthHomeBanner({
  context,
  summary,
  company,
  onNavigate,
  onOpenModule,
}: {
  context: WorkforceContext;
  summary: ZipDashboardSummary | null;
  company: ZipCompanyChoice;
  onNavigate: (view: 'overview' | 'people' | 'forms' | 'security' | 'broadcasts' | 'facilities' | 'help') => void;
  onOpenModule: (id: string) => void;
}) {
  const tone = toneFor(context);
  const title = tone === 'owner' ? 'Command the whole business with clarity.'
    : tone === 'manager' ? 'Know what your team needs next.'
    : 'A calmer, clearer workday starts here.';
  const eyebrow = tone === 'owner' ? 'OWNER COMMAND CENTER' : tone === 'manager' ? 'MANAGER HOME' : 'EMPLOYEE HOME';
  const primary = tone === 'owner'
    ? [{ label: 'Review approvals', detail: String(summary?.pendingApprovals ?? '—'), action: () => onOpenModule('owner-intelligence') }, { label: 'Security signals', detail: String(summary?.securityAlerts ?? '—'), action: () => onNavigate('security') }]
    : tone === 'manager'
      ? [{ label: 'Team workload', detail: String(summary?.employees ?? '—'), action: () => onNavigate('people') }, { label: 'Pending approvals', detail: String(summary?.pendingApprovals ?? '—'), action: () => onNavigate('forms') }]
      : [{ label: 'My workspace', detail: 'Next action', action: () => onOpenModule('employee') }, { label: 'Ask Daenem', detail: 'Guided help', action: () => onNavigate('help') }];
  return <section className={'postauth-home-banner postauth-tone-' + tone} data-postauth-primary-hero="true" aria-labelledby="postauth-home-title">
    <div className="postauth-home-copy">
      <span className="eyebrow">{eyebrow} · {company.name}</span>
      <h1 id="postauth-home-title">{title}</h1>
      <p>Scoped live signals, canonical workspaces and clear next actions—arranged for your role.</p>
    </div>
    <div className="postauth-home-actions">
      {primary.map((item) => <button key={item.label} type="button" className="postauth-signal" onClick={item.action}><span>{item.label}</span><strong>{item.detail}</strong></button>)}
    </div>
  </section>;
}

export function PostAuthFeatureFrame({
  profile,
  moduleLabel,
  canonicalPath,
  context,
  onOpenModuleHub,
  onNavigateHelp,
  children,
}: {
  profile: LayoutProfile;
  moduleLabel: string;
  canonicalPath: string;
  context: WorkforceContext;
  onOpenModuleHub: () => void;
  onNavigateHelp: () => void;
  children: ReactNode;
}) {
  const strategy = profile.featurePageStrategy;
  const showRail = profile.contextualPanelMode !== 'right drawer only when invoked';
  const hasHelp = context.permissions['ai_guide.access'] && context.permissions['ai_guide.access'] !== 'none';
  return <section className={'postauth-feature-frame postauth-feature-' + profile.id} aria-labelledby="postauth-feature-title">
    <header className="postauth-feature-header">
      <div><span className="eyebrow">WORKSPACE · {canonicalPath}</span><h1 id="postauth-feature-title">{moduleLabel}</h1><p>{strategy}. Your existing records, workflows and permissions remain the source of truth.</p></div>
      <div className="postauth-feature-actions"><button type="button" className="secondary-button" onClick={onOpenModuleHub}>Switch workspace</button>{hasHelp && <button type="button" className="text-action" onClick={onNavigateHelp}>Context help</button>}</div>
    </header>
    <div className={'postauth-feature-regions postauth-regions-' + profile.detailMode}>
      <div className="postauth-feature-main">{children}</div>
      {showRail && <aside className="postauth-feature-context"><span className="eyebrow">WORKSPACE GUIDE</span><strong>{profile.name}</strong><p>{profile.description}</p><small>Your records and actions stay in the same approved workspace as the surrounding regions adapt.</small></aside>}
    </div>
  </section>;
}


type PostAuthOverviewCompositionProps = {
  profile: LayoutProfile;
  hero: ReactNode;
  pulse: ReactNode;
  loading: ReactNode;
  kpis: ReactNode;
  widgets: ReactNode;
  workspace: ReactNode;
  owner: ReactNode;
  intelligence: ReactNode;
  clocks: ReactNode;
};

function OverviewAdapterNote({ profile }: { profile: LayoutProfile }) {
  return <aside className="postauth-context-note" data-layout-context-note={profile.id}>
    <span className="eyebrow">WORKSPACE GUIDE</span>
    <strong>{profile.name}</strong>
    <p>{profile.dashboardStrategy}</p>
    <small>Prioritized for the way this workspace is used.</small>
  </aside>;
}

export function PostAuthOverviewComposition({
  profile,
  hero,
  pulse,
  loading,
  kpis,
  widgets,
  workspace,
  owner,
  intelligence,
  clocks,
}: PostAuthOverviewCompositionProps) {
  const className = 'postauth-dashboard-composition postauth-composition-' + profile.id;
  if (profile.id === 'workspace-canvas') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <aside className="postauth-composition-canvas-nav"><span className="eyebrow">CANVAS</span><strong>Work zones</strong><small>{profile.featurePageStrategy}</small></aside>
    <div className="postauth-composition-canvas-main">{hero}{workspace}{widgets}{pulse}{kpis}{owner}{intelligence}</div>
    <aside className="postauth-composition-rail"><OverviewAdapterNote profile={profile} />{clocks}{loading}</aside>
  </section>;
  if (profile.id === 'operational-cockpit') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <div className="postauth-composition-lead">{hero}</div>
    <div className="postauth-composition-control-strip"><span className="eyebrow">LIVE CONTROL SURFACE</span><strong>{profile.widgetStrategy}</strong></div>
    <div className="postauth-composition-work">{pulse}{kpis}{workspace}{widgets}{loading}{owner}{intelligence}</div>
    <aside className="postauth-composition-rail"><OverviewAdapterNote profile={profile} />{clocks}</aside>
  </section>;
  if (profile.id === 'insight-magazine') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <div className="postauth-composition-lead">{hero}</div>
    <main className="postauth-composition-story">{intelligence}{workspace}{pulse}{kpis}</main>
    <aside className="postauth-composition-story-rail"><OverviewAdapterNote profile={profile} />{widgets}{owner}{clocks}{loading}</aside>
  </section>;
  if (profile.id === 'master-detail') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <aside className="postauth-composition-master-pane"><span className="eyebrow">WORK INDEX</span><strong>Recent work</strong>{workspace}{pulse}</aside>
    <main className="postauth-composition-detail-pane">{hero}{kpis}{widgets}{loading}{owner}{intelligence}</main>
    <aside className="postauth-composition-rail"><OverviewAdapterNote profile={profile} />{clocks}</aside>
  </section>;
  if (profile.id === 'horizon-wide') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <div className="postauth-composition-lead">{hero}</div>
    <div className="postauth-composition-kpis">{kpis}</div>
    <main className="postauth-composition-data-canvas">{workspace}{widgets}{pulse}{intelligence}{owner}{loading}</main>
    <aside className="postauth-composition-drawer"><OverviewAdapterNote profile={profile} />{clocks}</aside>
  </section>;
  if (profile.id === 'adaptive-bento') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <div className="postauth-composition-bento-hero">{hero}</div>
    <div className="postauth-composition-bento-kpis">{kpis}</div>
    <div className="postauth-composition-bento-work">{workspace}</div>
    <div className="postauth-composition-bento-pulse">{pulse}</div>
    <div className="postauth-composition-bento-widgets">{widgets}{loading}</div>
    <aside className="postauth-composition-bento-rail"><OverviewAdapterNote profile={profile} />{owner}{intelligence}{clocks}</aside>
  </section>;
  if (profile.id === 'focus-flow') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <div className="postauth-composition-lead">{hero}</div>
    <div className="postauth-composition-next-action">{owner}{kpis}</div>
    <main className="postauth-composition-focus-work">{workspace}{widgets}</main>
    <aside className="postauth-composition-rail"><OverviewAdapterNote profile={profile} />{pulse}{intelligence}{clocks}{loading}</aside>
  </section>;
  if (profile.id === 'enterprise-studio') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <main className="postauth-composition-studio-canvas">{hero}{workspace}{pulse}{widgets}{loading}</main>
    <aside className="postauth-composition-studio-inspector"><OverviewAdapterNote profile={profile} />{kpis}{owner}{intelligence}{clocks}</aside>
  </section>;
  if (profile.id === 'board-pulse') return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <div className="postauth-composition-lead">{hero}</div>
    <div className="postauth-composition-pulse-strip">{pulse}{kpis}</div>
    <main className="postauth-composition-board">{workspace}{widgets}{loading}</main>
    <aside className="postauth-composition-rail"><OverviewAdapterNote profile={profile} />{owner}{intelligence}{clocks}</aside>
  </section>;
  return <section className={className} aria-label={profile.name + ' dashboard composition'}>
    <div className="postauth-composition-lead">{hero}</div>
    <div className="postauth-composition-kpis">{kpis}</div>
    <main className="postauth-composition-work">{pulse}{loading}{widgets}{owner}{intelligence}</main>
    <aside className="postauth-composition-rail"><OverviewAdapterNote profile={profile} />{clocks}</aside>
  </section>;
}
