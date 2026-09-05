export type LayoutId =
  | 'executive-command'
  | 'workspace-canvas'
  | 'operational-cockpit'
  | 'insight-magazine'
  | 'master-detail'
  | 'horizon-wide'
  | 'adaptive-bento'
  | 'focus-flow'
  | 'enterprise-studio'
  | 'board-pulse';

export type LayoutDensity = 'comfortable' | 'standard' | 'compact';
export type MotionPreset = 'off' | 'calm' | 'balanced' | 'expressive';
export type NavigationMode = 'expanded-sidebar' | 'icon-rail' | 'operations-rail' | 'top-command' | 'contextual';
export type ShellMode = 'command-rail' | 'canvas' | 'cockpit' | 'editorial' | 'split-pane' | 'wide-canvas' | 'bento' | 'focus' | 'studio' | 'board';

export type LayoutProfile = {
  id: LayoutId;
  name: string;
  description: string;
  navigationMode: NavigationMode;
  shellMode: ShellMode;
  dashboardStrategy: string;
  featurePageStrategy: string;
  recordPageStrategy: string;
  detailMode: string;
  contextualPanelMode: string;
  defaultDensity: LayoutDensity;
  widgetStrategy: string;
  motionPreset: MotionPreset;
  responsiveRules: string;
  supportedZones: string[];
  idealFor: string[];
};

const profile = (
  id: LayoutId,
  name: string,
  description: string,
  navigationMode: NavigationMode,
  shellMode: ShellMode,
  dashboardStrategy: string,
  featurePageStrategy: string,
  recordPageStrategy: string,
  detailMode: string,
  contextualPanelMode: string,
  defaultDensity: LayoutDensity,
  widgetStrategy: string,
  motionPreset: MotionPreset,
  responsiveRules: string,
  supportedZones: string[],
  idealFor: string[],
): LayoutProfile => ({
  id, name, description, navigationMode, shellMode, dashboardStrategy, featurePageStrategy,
  recordPageStrategy, detailMode, contextualPanelMode, defaultDensity, widgetStrategy,
  motionPreset, responsiveRules, supportedZones, idealFor,
});

export const LAYOUT_PROFILES: Record<LayoutId, LayoutProfile> = {
  'executive-command': profile(
    'executive-command', 'Daenem Executive Command',
    'A refined command shell for prioritized decisions, exceptions and cross-business intelligence.',
    'expanded-sidebar', 'command-rail', 'KPI hierarchy with action center and intelligence rail',
    'sectioned command brief with contextual actions', 'summary first, records below, inspector on demand',
    'wide central workspace', 'intelligent right rail', 'standard', 'priority-weighted live widgets',
    'balanced', 'sidebar collapses to a drawer; rail becomes a bottom context sheet',
    ['sidebar', 'command-bar', 'workspace', 'right-rail', 'action-center'], ['Owner', 'Manager', 'cross-business review'],
  ),
  'workspace-canvas': profile(
    'workspace-canvas', 'Workspace Canvas',
    'A flexible canvas for large-screen multi-module work with an expandable secondary navigator.',
    'icon-rail', 'canvas', 'modular workspace with resizable work zones',
    'canvas regions with contextual tool regions', 'wide list and work area with optional inspector',
    'expanding canvas', 'floating contextual tools', 'comfortable', 'modular, user-arranged surfaces',
    'balanced', 'icon rail and canvas become stacked regions on tablet/mobile',
    ['icon-rail', 'secondary-nav', 'canvas', 'tool-region'], ['large desktop', 'multi-module workflows'],
  ),
  'operational-cockpit': profile(
    'operational-cockpit', 'Operational Cockpit',
    'A dense, live-state shell for queues, exceptions and operational control.',
    'operations-rail', 'cockpit', 'queues, status lanes and exceptions first',
    'control-room header with live filters', 'queue/list first with action drawer',
    'active work queue', 'alerts and exception rail', 'compact', 'live operational queues',
    'balanced', 'density reduces before navigation collapses',
    ['operations-rail', 'status-strip', 'queues', 'exceptions'], ['Printing', 'Bakery', 'Logistics', 'approvals'],
  ),
  'insight-magazine': profile(
    'insight-magazine', 'Insight Magazine',
    'An editorial analytical experience for business stories, trends and guided interpretation.',
    'top-command', 'editorial', 'narrative metrics, featured trends and intelligence briefs',
    'story-led sections with evidence alongside interpretation', 'analytical overview with focused detail',
    'story column', 'evidence and commentary rail', 'comfortable', 'featured insight stories',
    'calm', 'stories become a linear reading flow on smaller screens',
    ['story-nav', 'hero-insight', 'trend-grid', 'evidence-rail'], ['Owner', 'Market Intelligence', 'Knowledge'],
  ),
  'master-detail': profile(
    'master-detail', 'Master–Detail Workspace',
    'A predictable record workflow with list, selected record and focused work area.',
    'expanded-sidebar', 'split-pane', 'recent records and selected work in parallel',
    'list → selected record → work actions', 'master list and detail pane with explicit selection',
    'record work pane', 'record context and related records', 'standard', 'recent records and saved views',
    'balanced', 'list becomes a first screen and detail opens as a routed view on mobile',
    ['sidebar', 'master-list', 'detail-pane', 'inspector'], ['Customers', 'Orders', 'Vehicles', 'Properties', 'Knowledge'],
  ),
  'horizon-wide': profile(
    'horizon-wide', 'Horizon Wide',
    'A maximum-width analytical canvas for wide tables, reconciliations and planning.',
    'top-command', 'wide-canvas', 'broad KPI ribbon above a professional data canvas',
    'full-width page header with filter and export lanes', 'table/detail drawer with wide data context',
    'maximum-width data canvas', 'right drawer only when invoked', 'standard', 'table, chart and saved-view surfaces',
    'calm', 'tables prioritize columns and use controlled horizontal scrolling',
    ['command-bar', 'filter-lane', 'data-canvas', 'detail-drawer'], ['Finance', 'Reports', 'Inventory', 'Analytics'],
  ),
  'adaptive-bento': profile(
    'adaptive-bento', 'Adaptive Bento',
    'A hierarchy-first modular composition where large blocks carry the most important work.',
    'expanded-sidebar', 'bento', 'large priority block, supporting signals and action modules',
    'module blocks sized by importance, never by decoration', 'selected record expands into a priority block',
    'large priority module', 'supporting context blocks', 'standard', 'size-aware priority widgets',
    'balanced', 'bento blocks become an ordered list with priority preserved',
    ['sidebar', 'hero-block', 'supporting-grid', 'action-block'], ['Employee', 'Manager', 'overview work'],
  ),
  'focus-flow': profile(
    'focus-flow', 'Focus & Flow',
    'A calm, low-distraction work surface for the next action, current task and follow-through.',
    'contextual', 'focus', 'My Day, next action, incomplete work and approvals',
    'single-task header with nearby guidance', 'focused detail with back-to-list navigation',
    'current task surface', 'help and next-action panel', 'comfortable', 'task-first widgets',
    'calm', 'navigation becomes a compact task drawer on smaller screens',
    ['context-nav', 'my-day', 'next-action', 'guidance'], ['Employee', 'learning', 'approvals'],
  ),
  'enterprise-studio': profile(
    'enterprise-studio', 'Enterprise Studio',
    'A configuration-grade workbench with a canvas and an intelligent inspector.',
    'icon-rail', 'studio', 'workbench summary with active configuration context',
    'canvas + property inspector + audit context', 'list/canvas with persistent inspector where space allows',
    'working canvas', 'properties, audit and related-record inspector', 'standard', 'contextual configuration widgets',
    'balanced', 'inspector docks below the canvas on tablet and mobile',
    ['icon-rail', 'studio-canvas', 'inspector', 'audit'], ['Forms', 'Admin', 'Access Control', 'configuration'],
  ),
  'board-pulse': profile(
    'board-pulse', 'Board & Pulse',
    'A workflow-oriented board, timeline and queue shell for moving work through states.',
    'operations-rail', 'board', 'status pulse, workstreams and snapshot analytics',
    'board/table/timeline switch with persistent filters', 'board or table with detail drawer',
    'workstream board', 'state and SLA context', 'compact', 'workflow lanes and pulse metrics',
    'balanced', 'board becomes a prioritized list with view switch on mobile',
    ['operations-rail', 'pulse-strip', 'board', 'timeline'], ['Orders', 'Production', 'Requests', 'Sales pipelines'],
  ),
};

export const LAYOUT_IDS = Object.keys(LAYOUT_PROFILES) as LayoutId[];
export const DEFAULT_LAYOUT_ID: LayoutId = 'executive-command';

export type LayoutPolicy = {
  organizationDefault: LayoutId;
  forcedLayout?: LayoutId | null;
  allowPersonalPreference: boolean;
  roleDefaults: Record<string, LayoutId>;
  erpDefaults: Record<string, LayoutId>;
};

export type LayoutPreference = {
  layoutId: LayoutId;
  density: LayoutDensity;
  motion: MotionPreset;
};

export const DEFAULT_LAYOUT_POLICY: LayoutPolicy = {
  organizationDefault: DEFAULT_LAYOUT_ID,
  forcedLayout: null,
  allowPersonalPreference: true,
  roleDefaults: {},
  erpDefaults: {},
};

export function normalizeLayoutId(value: unknown): LayoutId {
  return typeof value === 'string' && LAYOUT_IDS.includes(value as LayoutId) ? value as LayoutId : DEFAULT_LAYOUT_ID;
}

export function normalizeDensity(value: unknown, fallback: LayoutDensity = 'standard'): LayoutDensity {
  return value === 'comfortable' || value === 'standard' || value === 'compact' ? value : fallback;
}

export function normalizeMotion(value: unknown, fallback: MotionPreset = 'balanced'): MotionPreset {
  return value === 'off' || value === 'calm' || value === 'balanced' || value === 'expressive' ? value : fallback;
}

export function normalizeLayoutPolicy(value: unknown): LayoutPolicy {
  const input = value && typeof value === 'object' ? value as Partial<LayoutPolicy> : {};
  const roleDefaults = input.roleDefaults && typeof input.roleDefaults === 'object'
    ? Object.fromEntries(Object.entries(input.roleDefaults).map(([key, layout]) => [key, normalizeLayoutId(layout)]))
    : {};
  const erpDefaults = input.erpDefaults && typeof input.erpDefaults === 'object'
    ? Object.fromEntries(Object.entries(input.erpDefaults).map(([key, layout]) => [key, normalizeLayoutId(layout)]))
    : {};
  return {
    organizationDefault: normalizeLayoutId(input.organizationDefault),
    forcedLayout: input.forcedLayout ? normalizeLayoutId(input.forcedLayout) : null,
    allowPersonalPreference: input.allowPersonalPreference !== false,
    roleDefaults,
    erpDefaults,
  };
}

export function normalizeLayoutPreference(value: unknown, fallback = DEFAULT_LAYOUT_POLICY.organizationDefault): LayoutPreference {
  const input = value && typeof value === 'object' ? value as Partial<LayoutPreference> : {};
  const profile = LAYOUT_PROFILES[normalizeLayoutId(input.layoutId || fallback)];
  return {
    layoutId: profile.id,
    density: normalizeDensity(input.density, profile.defaultDensity),
    motion: normalizeMotion(input.motion, profile.motionPreset),
  };
}

export function resolveLayout(
  policy: LayoutPolicy,
  personal: Partial<LayoutPreference> | null | undefined,
  roles: string[],
  erpId?: string | null,
): LayoutPreference {
  const normalized = normalizeLayoutPolicy(policy);
  const layoutId = normalized.forcedLayout
    || (normalized.allowPersonalPreference && personal?.layoutId ? normalizeLayoutId(personal.layoutId) : null)
    || roles.map((role) => normalized.roleDefaults[role]).find(Boolean)
    || (erpId ? normalized.erpDefaults[erpId] : null)
    || normalized.organizationDefault;
  const source = personal?.layoutId && normalized.allowPersonalPreference
    ? personal
    : { layoutId };
  return normalizeLayoutPreference(source, layoutId);
}

const LOCAL_KEY = 'daenem-experience-layout-v1';

export function readLocalLayoutPreference(employeeId?: string | null): LayoutPreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(employeeId ? LOCAL_KEY + ':' + employeeId : LOCAL_KEY) || 'null') as unknown;
    return value ? normalizeLayoutPreference(value) : null;
  } catch {
    return null;
  }
}

export function writeLocalLayoutPreference(employeeId: string | null | undefined, preference: LayoutPreference) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(employeeId ? LOCAL_KEY + ':' + employeeId : LOCAL_KEY, JSON.stringify(normalizeLayoutPreference(preference)));
}

export function getLayoutProfile(value: unknown): LayoutProfile {
  return LAYOUT_PROFILES[normalizeLayoutId(value)];
}
