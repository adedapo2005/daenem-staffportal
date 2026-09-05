import { hasWorkforcePermission, type WorkforceContext } from './auth';
import { canSeeDashboardField, type DashboardAggregateField } from './dashboard-capabilities';
import type { ReactNode } from 'react';
import type { LayoutProfile } from './layout-system';
import type { ZipCompanyChoice, ZipDashboardSummary } from './zip-dashboard';
import { getSmartContext, type SmartContextDefinition } from './smart-context';

type HomeTone = 'employee' | 'manager' | 'owner';
type HomeAction = { label: string; detail: string; action: () => void };

function toneFor(context: WorkforceContext): HomeTone {
  if (context.roles.some((role) => role.code === 'owner')) return 'owner';
  if (context.roles.some((role) => ['group_admin', 'company_admin', 'manager'].includes(role.code))) return 'manager';
  return 'employee';
}

export function SmartContextPanel({ definition, context, onOpenHelp, compact = false }: {
  definition: SmartContextDefinition; context: WorkforceContext; onOpenHelp?: () => void; compact?: boolean;
}) {
  const canHelp = hasWorkforcePermission(context, 'ai_guide.access', 'view');
  return <aside className={'smart-context-panel' + (compact ? ' smart-context-compact' : '')} data-smart-context="true">
    <span className="eyebrow">HELP FOR THIS PAGE</span>
    <h3>{definition.title}</h3>
    <p>{definition.shortPurpose}</p>
    <details><summary>What this feature does</summary><p>{definition.whatItDoes}</p></details>
    <details><summary>What to do next</summary><p>{definition.expectedOutcome}</p></details>
    {canHelp && onOpenHelp && <button type="button" className="text-action" onClick={onOpenHelp}>Open {definition.relatedHelp}</button>}
  </aside>;
}

export function PostAuthHomeBanner({ context, summary, company, onNavigate, onOpenModule, onOpenModuleHub }: {
  context: WorkforceContext; summary: ZipDashboardSummary | null; company: ZipCompanyChoice;
  onNavigate: (view: 'overview' | 'people' | 'forms' | 'security' | 'broadcasts' | 'facilities' | 'help') => void;
  onOpenModule: (id: string) => void; onOpenModuleHub?: () => void;
}) {
  const tone = toneFor(context);
  const definition = getSmartContext(tone === 'owner' ? 'owner-home' : tone === 'manager' ? 'manager-home' : 'employee-home');
  const field = (name: DashboardAggregateField) => canSeeDashboardField(context, name, company.id);
  const primary: HomeAction[] = tone === 'owner'
    ? [
      field('pendingApprovals') ? { label: 'Review approvals', detail: String(summary?.pendingApprovals ?? '—'), action: () => onNavigate('forms') } : null,
      field('securityAlerts') ? { label: 'Security signals', detail: String(summary?.securityAlerts ?? '—'), action: () => onNavigate('security') } : null,
    ].filter((item): item is HomeAction => Boolean(item))
    : tone === 'manager'
      ? [
        field('employees') ? { label: 'Team workload', detail: String(summary?.employees ?? '—'), action: () => onNavigate('people') } : null,
        field('pendingApprovals') ? { label: 'Pending approvals', detail: String(summary?.pendingApprovals ?? '—'), action: () => onNavigate('forms') } : null,
      ].filter((item): item is HomeAction => Boolean(item))
      : [];
  const actions: HomeAction[] = primary.length ? primary : [{ label: tone === 'employee' ? 'My workspace' : 'Open workspaces', detail: tone === 'employee' ? 'Next action' : 'Authorized actions', action: onOpenModuleHub || (() => onOpenModule('employee')) }];
  return <section className={'postauth-home-banner postauth-tone-' + tone} data-postauth-primary-hero="true" aria-labelledby="postauth-home-title">
    <div className="postauth-home-copy"><span className="eyebrow">{tone === 'owner' ? 'OWNER COMMAND CENTER' : tone === 'manager' ? 'MANAGER HOME' : 'EMPLOYEE HOME'} · {company.name}</span><h1 id="postauth-home-title">{definition.title}</h1><p>{definition.shortPurpose}</p></div>
    <div className="postauth-home-actions">{actions.map((item) => <button key={item.label} type="button" className="postauth-signal" onClick={item.action}><span>{item.label}</span><strong>{item.detail}</strong></button>)}</div>
  </section>;
}

export function PostAuthFeatureFrame({ profile, moduleLabel, canonicalPath, context, contextKey, onOpenModuleHub, onNavigateHelp, children }: {
  profile: LayoutProfile; moduleLabel: string; canonicalPath: string; context: WorkforceContext; contextKey?: string;
  onOpenModuleHub: () => void; onNavigateHelp: () => void; children: ReactNode;
}) {
  const definition = getSmartContext(contextKey || moduleLabel.toLowerCase().replaceAll(' ', '-'), { title: moduleLabel, canonicalPath });
  return <section className={'postauth-feature-frame postauth-feature-' + profile.id} aria-labelledby="postauth-feature-title" data-feature-context={definition.id}>
    <header className="postauth-feature-header"><div><span className="eyebrow">DAENEM BUSINESS ERP · {definition.canonicalPath}</span><h1 id="postauth-feature-title">{moduleLabel}</h1><p>{definition.shortPurpose}</p></div><div className="postauth-feature-actions"><button type="button" className="secondary-button" onClick={onOpenModuleHub}>Switch workspace</button>{hasWorkforcePermission(context, 'ai_guide.access', 'view') && <button type="button" className="text-action" onClick={onNavigateHelp}>Help for this page</button>}</div></header>
    <div className={'postauth-feature-regions postauth-regions-' + profile.detailMode}><div className="postauth-feature-main">{children}</div><SmartContextPanel definition={definition} context={context} onOpenHelp={onNavigateHelp} /></div>
  </section>;
}

type PostAuthOverviewCompositionProps = {
  profile: LayoutProfile; context: WorkforceContext; smartContext: SmartContextDefinition; hero: ReactNode; pulse: ReactNode; loading: ReactNode;
  kpis: ReactNode; widgets: ReactNode; workspace: ReactNode; owner: ReactNode; intelligence: ReactNode; clocks: ReactNode;
};

export function PostAuthOverviewComposition({ profile, context, smartContext, hero, pulse, loading, kpis, widgets, workspace, owner, intelligence, clocks }: PostAuthOverviewCompositionProps) {
  const className = 'postauth-dashboard-composition postauth-composition-' + profile.id;
  const contextPanel = <SmartContextPanel definition={smartContext} context={context} compact />;
  const ownerFirst = context.roles.some((role) => ['owner', 'group_admin'].includes(role.code)) && Boolean(intelligence);
  if (profile.id === 'workspace-canvas') return <section className={className} aria-label="Authenticated dashboard"><aside className="postauth-composition-canvas-nav"><span className="eyebrow">MY WORKSPACE</span><strong>Work zones</strong><small>Move between the work areas you use most.</small></aside><div className="postauth-composition-canvas-main">{hero}{workspace}{widgets}{pulse}{kpis}{owner}{intelligence}</div><aside className="postauth-composition-rail">{contextPanel}{loading}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'operational-cockpit') return <section className={className} aria-label="Authenticated dashboard"><div className="postauth-composition-lead">{hero}</div><div className="postauth-composition-control-strip"><span className="eyebrow">LIVE CONTROL SURFACE</span><strong>Queues, status and next actions.</strong></div><div className="postauth-composition-work">{pulse}{kpis}{workspace}{widgets}{loading}{owner}{intelligence}</div><aside className="postauth-composition-rail">{contextPanel}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'insight-magazine') return <section className={className} aria-label="Authenticated dashboard"><div className="postauth-composition-lead">{hero}</div><main className="postauth-composition-story">{intelligence}{workspace}{pulse}{kpis}</main><aside className="postauth-composition-story-rail">{contextPanel}{widgets}{owner}{loading}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'master-detail') return <section className={className} aria-label="Authenticated dashboard"><aside className="postauth-composition-master-pane"><span className="eyebrow">WORK INDEX</span><strong>Recent work</strong>{workspace}{pulse}</aside><main className="postauth-composition-detail-pane">{hero}{kpis}{widgets}{loading}{owner}{intelligence}</main><aside className="postauth-composition-rail">{contextPanel}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'horizon-wide') return <section className={className} aria-label="Authenticated dashboard"><div className="postauth-composition-lead">{hero}</div><div className="postauth-composition-kpis">{kpis}</div><main className="postauth-composition-data-canvas">{workspace}{widgets}{pulse}{intelligence}{owner}{loading}</main><aside className="postauth-composition-drawer">{contextPanel}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'adaptive-bento') return <section className={className} aria-label="Authenticated dashboard"><div className="postauth-composition-bento-hero">{hero}</div><div className="postauth-composition-bento-kpis">{kpis}</div><div className="postauth-composition-bento-work">{workspace}</div><div className="postauth-composition-bento-pulse">{pulse}</div><div className="postauth-composition-bento-widgets">{widgets}{loading}</div><aside className="postauth-composition-bento-rail">{contextPanel}{owner}{intelligence}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'focus-flow') return <section className={className} aria-label="Authenticated dashboard"><div className="postauth-composition-lead">{hero}</div><div className="postauth-composition-next-action">{owner}{kpis}</div><main className="postauth-composition-focus-work">{workspace}{widgets}</main><aside className="postauth-composition-rail">{contextPanel}{pulse}{intelligence}{loading}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'enterprise-studio') return <section className={className} aria-label="Authenticated dashboard"><main className="postauth-composition-studio-canvas">{hero}{workspace}{pulse}{widgets}{loading}</main><aside className="postauth-composition-studio-inspector">{contextPanel}{kpis}{owner}{intelligence}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  if (profile.id === 'board-pulse') return <section className={className} aria-label="Authenticated dashboard"><div className="postauth-composition-lead">{hero}</div><div className="postauth-composition-pulse-strip">{pulse}{kpis}</div><main className="postauth-composition-board">{workspace}{widgets}{loading}</main><aside className="postauth-composition-rail">{contextPanel}{owner}{intelligence}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
  return <section className={className} aria-label="Authenticated dashboard"><div className="postauth-composition-lead">{hero}</div><div className="postauth-composition-kpis">{kpis}</div><main className="postauth-composition-work">{ownerFirst ? <>{intelligence}{owner}{pulse}{loading}{widgets}</> : <>{pulse}{loading}{widgets}{owner}{intelligence}</>}</main><aside className="postauth-composition-rail">{contextPanel}</aside><div className="postauth-composition-clocks">{clocks}</div></section>;
}
