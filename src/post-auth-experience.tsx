import type { ComponentType, ReactNode } from 'react';
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
    ? [{ label: 'Review approvals', detail: String(summary?.pendingApprovals ?? '—'), action: () => onOpenModule('intelligence') }, { label: 'Security signals', detail: String(summary?.securityAlerts ?? '—'), action: () => onNavigate('security') }]
    : tone === 'manager'
      ? [{ label: 'Team workload', detail: String(summary?.employees ?? '—'), action: () => onNavigate('people') }, { label: 'Pending approvals', detail: String(summary?.pendingApprovals ?? '—'), action: () => onNavigate('forms') }]
      : [{ label: 'My tasks', detail: String(summary?.overdueRequirements ?? '—'), action: () => onNavigate('forms') }, { label: 'Ask Daenem', detail: 'Guided help', action: () => onNavigate('help') }];
  return <section className={'postauth-home-banner postauth-tone-' + tone} aria-labelledby="postauth-home-title">
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
      <div><span className="eyebrow">CANONICAL WORKSPACE · {canonicalPath}</span><h1 id="postauth-feature-title">{moduleLabel}</h1><p>{strategy}. Your existing records, workflows and permissions remain the source of truth.</p></div>
      <div className="postauth-feature-actions"><button type="button" className="secondary-button" onClick={onOpenModuleHub}>Switch workspace</button>{hasHelp && <button type="button" className="text-action" onClick={onNavigateHelp}>Context help</button>}</div>
    </header>
    <div className={'postauth-feature-regions postauth-regions-' + profile.detailMode}>
      <div className="postauth-feature-main">{children}</div>
      {showRail && <aside className="postauth-feature-context"><span className="eyebrow">LAYOUT CONTEXT</span><strong>{profile.name}</strong><p>{profile.description}</p><small>Use the canonical route for this function; this surface changes composition, not data ownership.</small></aside>}
    </div>
  </section>;
}
