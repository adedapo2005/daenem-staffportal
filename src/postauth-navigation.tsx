import { useMemo, useState, type ComponentType } from 'react';
import {
  Boxes, BriefcaseBusiness, ChevronRight, CircleDollarSign, ClipboardCheck, Factory,
  Gauge, Grid3X3, Home, PackageSearch, Radio, ShieldCheck, Sparkles, Users, Wrench,
} from 'lucide-react';
import type { WorkforceContext } from './auth';
import { getErpNavigation, isModuleVisible, moduleDefinitions, type ErpId, type HierarchyItem } from './module-hub';
import type { LayoutProfile } from './layout-system';

type ViewName = 'overview' | 'people' | 'forms' | 'security' | 'broadcasts' | 'facilities' | 'help';
type VisibleNavItem = {
  id: ViewName;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
};
type CompanyContext = { id: string | null; code: string; name: string };
type ReleaseContext = { version: string };

export type PostAuthNavigationProps = {
  layoutProfile: LayoutProfile;
  context: WorkforceContext;
  company: CompanyContext;
  visibleNav: VisibleNavItem[];
  activeView: ViewName;
  online: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onNavigate: (view: ViewName) => void;
  onOpenModuleHub: () => void;
  onOpenModule: (id: string) => void;
  release: ReleaseContext;
  setReleaseOpen: (open: boolean) => void;
};

function HierarchyIcon({ iconKey, size = 16 }: { iconKey: string; size?: number }) {
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

function flattenGroup(group: ReturnType<typeof getErpNavigation>[number]) {
  return group.submenus.flatMap((submenu) => submenu.submenus.flatMap((subsubmenu) => subsubmenu.items));
}

function useNavigation({ context, company, visibleNav }: Pick<PostAuthNavigationProps, 'context' | 'company' | 'visibleNav'>) {
  const availableModules = useMemo(
    () => moduleDefinitions.filter((module) => isModuleVisible(context, module, company.id, company.code)),
    [company.code, company.id, context],
  );
  return useMemo(
    () => getErpNavigation(availableModules, visibleNav.map((item) => item.id)),
    [availableModules, visibleNav],
  );
}

function NavigationItem({
  item,
  group,
  compact = false,
  activeView,
  activeModuleId,
  onNavigate,
  onOpenModule,
  onOpenModuleHub,
  setSidebarOpen,
}: {
  item: HierarchyItem;
  group: ErpId;
  compact?: boolean;
  activeView: ViewName;
  activeModuleId: string | null;
  onNavigate: (view: ViewName) => void;
  onOpenModule: (id: string) => void;
  onOpenModuleHub: () => void;
  setSidebarOpen: (open: boolean) => void;
}) {
  const active = item.view === activeView || item.moduleId === activeModuleId;
  function open() {
    setSidebarOpen(false);
    if (item.kind === 'view' && item.view) onNavigate(item.view);
    else if (item.kind === 'module' && item.moduleId) onOpenModule(item.moduleId);
    else if (item.utility === 'module-hub') onOpenModuleHub();
  }
  return <button
    type="button"
    className={'postauth-nav-item' + (active ? ' active' : '') + (compact ? ' compact' : '')}
    onClick={open}
    title={item.path || item.detail}
    aria-current={active ? 'page' : undefined}
    data-canonical-module-id={item.moduleId || undefined}
    data-canonical-view={item.view || undefined}
    data-erp-id={group}
    data-canonical-path={item.path || undefined}
  >
    <span className="postauth-nav-item-icon"><HierarchyIcon iconKey={item.iconKey} size={compact ? 15 : 14} /></span>
    <span className="postauth-nav-item-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
    {!compact && <ChevronRight size={13} aria-hidden="true" />}
  </button>;
}

function NavigationBrand({ compact = false }: { compact?: boolean }) {
  return <div className={'postauth-nav-brand' + (compact ? ' compact' : '')}>
    <div className="brand-mark"><img className="brand-mark-image animated-daenem-logo" src="/brand-assets/logo-mark.svg" alt="" /></div>
    {!compact && <span><strong>Daenem</strong><small>Staff Portal</small></span>}
  </div>;
}

function ExpandedNavigation(props: PostAuthNavigationProps & { navigation: ReturnType<typeof getErpNavigation> }) {
  const { navigation, context, company, online, sidebarOpen, setSidebarOpen, activeView, onNavigate, onOpenModule, onOpenModuleHub, release, setReleaseOpen } = props;
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  return <aside className={'postauth-navigation postauth-expanded-navigation' + (sidebarOpen ? ' is-open' : '')} data-navigation-adapter="executive-command-sidebar" data-shell-mode={props.layoutProfile.shellMode} data-layout-profile={props.layoutProfile.id}>
    <NavigationBrand />
    <div className="postauth-nav-kicker">Workspace</div>
    <nav className="postauth-nav-tree" aria-label="ERP workspace navigation">
      {navigation.map((group) => {
        const items = flattenGroup(group);
        return <details className="postauth-nav-group" key={group.id} open={group.id === 'staff' || items.some((item) => item.view === activeView || item.moduleId === activeModuleId)}>
          <summary><span className="postauth-nav-group-icon"><HierarchyIcon iconKey={group.iconKey} /></span><span><strong>{group.label}</strong><small>{group.detail}</small></span><b>{items.length}</b></summary>
          <div className="postauth-nav-group-items">{items.map((item) => <NavigationItem key={item.id} item={item} group={group.id} activeView={activeView} activeModuleId={activeModuleId} onNavigate={onNavigate} onOpenModule={(id) => { setActiveModuleId(id); onOpenModule(id); }} onOpenModuleHub={onOpenModuleHub} setSidebarOpen={setSidebarOpen} />)}</div>
        </details>;
      })}
    </nav>
    <div className="postauth-nav-footer">
      <div className="postauth-nav-status"><i className={online ? '' : 'offline'} /><span>{online ? 'All systems operational' : 'Offline mode'}</span></div>
      <button type="button" className="postauth-nav-version" onClick={() => setReleaseOpen(true)}><span>Version {release.version}</span><small>Release notes</small></button>
      <small className="postauth-nav-scope">{company.name} · access scoped to your role</small>
    </div>
  </aside>;
}

function IconRailNavigation(props: PostAuthNavigationProps & { navigation: ReturnType<typeof getErpNavigation>; variant?: 'workspace' | 'studio' }) {
  const variant = props.variant || 'workspace';
  const { navigation, context, company, sidebarOpen, setSidebarOpen, activeView, onNavigate, onOpenModule, onOpenModuleHub } = props;
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const activeGroup = navigation.find((group) => group.id === (selectedGroup || navigation[0]?.id)) || navigation[0];
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  return <aside className={'postauth-navigation postauth-icon-navigation postauth-icon-navigation-' + variant + (sidebarOpen ? ' is-open' : '')} data-navigation-adapter={variant === 'studio' ? 'enterprise-studio-rail' : 'workspace-canvas-rail'} data-shell-mode={props.layoutProfile.shellMode} data-layout-profile={props.layoutProfile.id}>
    <NavigationBrand compact />
    <nav className="postauth-icon-rail" aria-label="ERP workspaces">
      {navigation.map((group) => <button type="button" key={group.id} className={'postauth-icon-rail-button' + (activeGroup?.id === group.id ? ' active' : '')} aria-label={group.label} title={group.detail} onClick={() => setSelectedGroup(group.id)}><HierarchyIcon iconKey={group.iconKey} /></button>)}
      <button type="button" className="postauth-icon-rail-button" aria-label="Open Module Hub" title="Open Module Hub" onClick={onOpenModuleHub}><Grid3X3 size={17} /></button>
    </nav>
    {activeGroup && <section className="postauth-secondary-navigation" aria-label={activeGroup.label + ' functions'}>
      <header><span className="eyebrow">{activeGroup.label}</span><small>{company.name}</small></header>
      <div>{flattenGroup(activeGroup).map((item) => <NavigationItem key={item.id} item={item} group={activeGroup.id} activeView={activeView} activeModuleId={activeModuleId} onNavigate={onNavigate} onOpenModule={(id) => { setActiveModuleId(id); onOpenModule(id); }} onOpenModuleHub={onOpenModuleHub} setSidebarOpen={setSidebarOpen} />)}</div>
    </section>}
    {variant === 'studio'
      ? <section className="postauth-studio-inspector-nav"><span className="eyebrow">Inspector ready</span><strong>Properties & audit</strong><small>Contextual tools open beside the active work surface.</small></section>
      : <section className="postauth-canvas-tools"><span className="eyebrow">Canvas tools</span><strong>Flexible work zones</strong><small>Arrange permitted modules around the current task.</small></section>}
    <small className="postauth-nav-scope">{context.employee.displayName}</small>
  </aside>;
}

function OperationsNavigation(props: PostAuthNavigationProps & { navigation: ReturnType<typeof getErpNavigation>; variant?: 'operations' | 'board' }) {
  const variant = props.variant || 'operations';
  const { navigation, company, online, sidebarOpen, setSidebarOpen, activeView, onNavigate, onOpenModule, onOpenModuleHub, release, setReleaseOpen } = props;
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  return <aside className={'postauth-navigation postauth-operations-navigation postauth-operations-navigation-' + variant + (sidebarOpen ? ' is-open' : '')} data-navigation-adapter={variant === 'board' ? 'board-pulse-operations' : 'operational-cockpit-rail'} data-shell-mode={props.layoutProfile.shellMode} data-layout-profile={props.layoutProfile.id}>
    <NavigationBrand />
    <header className="postauth-operations-heading"><span className="eyebrow">Operations</span><strong>Active work</strong><small>{company.name}</small></header>
    <nav className="postauth-operations-list" aria-label="Operations navigation">{navigation.map((group) => {
      const items = flattenGroup(group);
      return <section key={group.id} className="postauth-operation-group"><button type="button" className="postauth-operation-group-button" onClick={onOpenModuleHub}><HierarchyIcon iconKey={group.iconKey} /><span><strong>{group.label}</strong><small>{items.length} authorized workspaces</small></span><ChevronRight size={14} /></button><div>{items.slice(0, 6).map((item) => <NavigationItem key={item.id} item={item} group={group.id} compact activeView={activeView} activeModuleId={activeModuleId} onNavigate={onNavigate} onOpenModule={(id) => { setActiveModuleId(id); onOpenModule(id); }} onOpenModuleHub={onOpenModuleHub} setSidebarOpen={setSidebarOpen} />)}</div></section>;
    })}</nav>
    {variant === 'board' && <section className="postauth-board-pulse-nav" aria-label="Workflow pulse"><span className="eyebrow">Workflow pulse</span><strong>Boards · timelines · queues</strong><small>Choose the view that matches the work state.</small><div><i /><i /><i /></div></section>}
    <div className="postauth-nav-footer"><div className="postauth-nav-status"><i className={online ? '' : 'offline'} /><span>{online ? 'Live controls ready' : 'Offline mode'}</span></div><button type="button" className="postauth-nav-version" onClick={() => setReleaseOpen(true)}><span>Version {release.version}</span><small>Release notes</small></button></div>
  </aside>;
}

function TopCommandNavigation(props: PostAuthNavigationProps & { navigation: ReturnType<typeof getErpNavigation>; variant?: 'insight' | 'horizon' }) {
  const variant = props.variant || 'insight';
  const { navigation, company, sidebarOpen, setSidebarOpen, activeView, onNavigate, onOpenModule, onOpenModuleHub } = props;
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  return <nav className={'postauth-navigation postauth-top-navigation postauth-top-navigation-' + variant + (sidebarOpen ? ' is-open' : '')} data-navigation-adapter={variant === 'horizon' ? 'horizon-wide-command' : 'insight-magazine-command'} data-shell-mode={props.layoutProfile.shellMode} data-layout-profile={props.layoutProfile.id} aria-label="Top workspace navigation">
    <div className="postauth-top-navigation-brand"><NavigationBrand compact={false} /></div>
    <div className="postauth-top-navigation-groups">{navigation.slice(0, 6).map((group) => {
      const items = flattenGroup(group);
      return <details key={group.id} className="postauth-top-navigation-group"><summary><HierarchyIcon iconKey={group.iconKey} /><span>{group.label}</span></summary><div>{items.slice(0, 8).map((item) => <NavigationItem key={item.id} item={item} group={group.id} compact activeView={activeView} activeModuleId={activeModuleId} onNavigate={onNavigate} onOpenModule={(id) => { setActiveModuleId(id); onOpenModule(id); }} onOpenModuleHub={onOpenModuleHub} setSidebarOpen={setSidebarOpen} />)}</div></details>;
    })}</div>
    {variant === 'horizon' && <div className="postauth-horizon-command-lane"><span className="eyebrow">Wide data canvas</span><strong>Filters · saved views · exports</strong><small>Maximum-width analytical workspace</small></div>}
    <span className="postauth-top-navigation-context">{company.name}</span>
  </nav>;
}

function ContextualNavigation(props: PostAuthNavigationProps & { navigation: ReturnType<typeof getErpNavigation> }) {
  const { navigation, company, sidebarOpen, setSidebarOpen, activeView, onNavigate, onOpenModule, onOpenModuleHub } = props;
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const firstGroup = navigation[0];
  const currentItem = firstGroup ? flattenGroup(firstGroup).find((item) => item.view === activeView || item.moduleId === activeModuleId) : undefined;
  const items = firstGroup ? flattenGroup(firstGroup).filter((item) => item.kind === 'view' || item.kind === 'module').slice(0, 8) : [];
  return <aside className={'postauth-navigation postauth-contextual-navigation' + (sidebarOpen ? ' is-open' : '')} data-navigation-adapter="contextual" data-shell-mode={props.layoutProfile.shellMode} data-layout-profile={props.layoutProfile.id}>
    <NavigationBrand compact={false} />
    <header><span className="eyebrow">Current work</span><strong>{currentItem?.label || company.name}</strong><small>Focused workspace navigation</small></header>
    <nav aria-label="Focused workspace navigation">{items.map((item) => <NavigationItem key={item.id} item={item} group={firstGroup?.id || 'staff'} compact activeView={activeView} activeModuleId={activeModuleId} onNavigate={onNavigate} onOpenModule={(id) => { setActiveModuleId(id); onOpenModule(id); }} onOpenModuleHub={onOpenModuleHub} setSidebarOpen={setSidebarOpen} />)}</nav>
    <button type="button" className="postauth-contextual-hub" onClick={onOpenModuleHub}><Grid3X3 size={14} /> All authorized workspaces</button>
  </aside>;
}


function MasterDetailNavigation(props: PostAuthNavigationProps & { navigation: ReturnType<typeof getErpNavigation> }) {
  const { navigation, company, sidebarOpen, setSidebarOpen, activeView, onNavigate, onOpenModule, onOpenModuleHub } = props;
  const [selectedGroup, setSelectedGroup] = useState<ErpId>(navigation[0]?.id || 'staff');
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const activeGroup = navigation.find((group) => group.id === selectedGroup) || navigation[0];
  const items = activeGroup ? flattenGroup(activeGroup) : [];
  return <aside className={'postauth-navigation postauth-master-detail-navigation' + (sidebarOpen ? ' is-open' : '')} data-navigation-adapter="master-detail-navigation" data-shell-mode={props.layoutProfile.shellMode} data-layout-profile={props.layoutProfile.id}>
    <NavigationBrand />
    <div className="postauth-master-nav-layout">
      <nav className="postauth-master-nav-groups" aria-label="ERP record workspaces">
        {navigation.map((group) => <button type="button" key={group.id} className={selectedGroup === group.id ? 'active' : ''} onClick={() => setSelectedGroup(group.id)}><HierarchyIcon iconKey={group.iconKey} /><span><strong>{group.label}</strong><small>{group.detail}</small></span></button>)}
        <button type="button" className="postauth-master-hub" onClick={onOpenModuleHub}><Grid3X3 size={15} /><span>All workspaces</span></button>
      </nav>
      <section className="postauth-master-nav-detail" aria-label={(activeGroup?.label || 'Workspace') + ' records'}>
        <header><span className="eyebrow">Selected workspace</span><strong>{activeGroup?.label || company.name}</strong><small>{company.name} · list → detail</small></header>
        <div>{items.map((item) => <NavigationItem key={item.id} item={item} group={activeGroup?.id || 'staff'} activeView={activeView} activeModuleId={activeModuleId} onNavigate={onNavigate} onOpenModule={(id) => { setActiveModuleId(id); onOpenModule(id); }} onOpenModuleHub={onOpenModuleHub} setSidebarOpen={setSidebarOpen} />)}</div>
      </section>
    </div>
    <small className="postauth-nav-scope">{company.name}</small>
  </aside>;
}

function BentoNavigation(props: PostAuthNavigationProps & { navigation: ReturnType<typeof getErpNavigation> }) {
  const { navigation, company, sidebarOpen, setSidebarOpen, activeView, onNavigate, onOpenModule, onOpenModuleHub } = props;
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  return <aside className={'postauth-navigation postauth-bento-navigation' + (sidebarOpen ? ' is-open' : '')} data-navigation-adapter="adaptive-bento-sidebar" data-shell-mode={props.layoutProfile.shellMode} data-layout-profile={props.layoutProfile.id}>
    <NavigationBrand />
    <section className="postauth-bento-priority"><span className="eyebrow">Priority flow</span><strong>What matters next</strong><small>Large signals first, supporting work below.</small></section>
    <nav className="postauth-bento-nav-groups" aria-label="Priority ERP navigation">{navigation.slice(0, 5).map((group) => {
      const items = flattenGroup(group);
      return <section key={group.id}><header><HierarchyIcon iconKey={group.iconKey} /><span><strong>{group.label}</strong><small>{items.length} authorized paths</small></span></header><div>{items.slice(0, 3).map((item) => <NavigationItem key={item.id} item={item} group={group.id} compact activeView={activeView} activeModuleId={activeModuleId} onNavigate={onNavigate} onOpenModule={(id) => { setActiveModuleId(id); onOpenModule(id); }} onOpenModuleHub={onOpenModuleHub} setSidebarOpen={setSidebarOpen} />)}</div></section>;
    })}</nav>
    <button type="button" className="postauth-bento-hub" onClick={onOpenModuleHub}><Grid3X3 size={14} /> Explore all authorized workspaces</button>
    <small className="postauth-nav-scope">{company.name}</small>
  </aside>;
}

export function PostAuthNavigation(props: PostAuthNavigationProps) {
  const navigation = useNavigation(props);
  switch (props.layoutProfile.id) {
    case 'workspace-canvas': return <IconRailNavigation {...props} navigation={navigation} variant="workspace" />;
    case 'operational-cockpit': return <OperationsNavigation {...props} navigation={navigation} variant="operations" />;
    case 'insight-magazine': return <TopCommandNavigation {...props} navigation={navigation} variant="insight" />;
    case 'master-detail': return <MasterDetailNavigation {...props} navigation={navigation} />;
    case 'horizon-wide': return <TopCommandNavigation {...props} navigation={navigation} variant="horizon" />;
    case 'adaptive-bento': return <BentoNavigation {...props} navigation={navigation} />;
    case 'focus-flow': return <ContextualNavigation {...props} navigation={navigation} />;
    case 'enterprise-studio': return <IconRailNavigation {...props} navigation={navigation} variant="studio" />;
    case 'board-pulse': return <OperationsNavigation {...props} navigation={navigation} variant="board" />;
    default: return <ExpandedNavigation {...props} navigation={navigation} />;
  }
}
