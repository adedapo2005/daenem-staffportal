import type { ComponentType, ReactNode } from 'react';

export type StaffPortalLayoutId =
  | 'executive-command'
  | 'workspace-canvas'
  | 'operational-cockpit'
  | 'insight-magazine'
  | 'master-detail-workspace'
  | 'horizon-wide'
  | 'adaptive-bento'
  | 'focus-flow'
  | 'enterprise-studio'
  | 'board-pulse';

export type CanonicalZoneId =
  | 'hero'
  | 'kpis'
  | 'executive-analytics'
  | 'workspace-schedule'
  | 'workspace-projects'
  | 'operations-map'
  | 'operations-team'
  | 'insight-story'
  | 'master-list'
  | 'master-detail'
  | 'horizon-global'
  | 'bento-strategy'
  | 'focus-progress'
  | 'focus-priorities'
  | 'studio-toolbox'
  | 'studio-canvas'
  | 'board-trend'
  | 'board-agenda'
  | 'ai-insights'
  | 'weather'
  | 'world-time'
  | 'tasks'
  | 'approvals'
  | 'activity'
  | 'knowledge'
  | 'quick-actions'
  | 'status'
  | 'announcement';

export type LayoutNavMode = 'sidebar' | 'slim-rail' | 'top-led' | 'split-pane' | 'studio';

export interface CanonicalLayoutSpec {
  id: StaffPortalLayoutId;
  name: string;
  navMode: LayoutNavMode;
  description: string;
  desktopGridAreas: string[];
  tabletGridAreas: string[];
  mobileOrder: CanonicalZoneId[];
  zones: CanonicalZoneId[];
}

export interface CanonicalKpi {
  label: string;
  value: string;
  delta: string;
  meta: string;
  tone: 'blue' | 'violet' | 'cyan' | 'coral' | 'gold' | 'success';
}

export interface CanonicalTask {
  title: string;
  meta: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface CanonicalApproval {
  title: string;
  meta: string;
  status: 'Pending' | 'Approved' | 'In Review';
}

export interface CanonicalFixture {
  viewer: { displayName: string; role: string; initials: string };
  workspace: { name: string; subtitle: string };
  release: { version: string; label: string };
  sync: { label: string; detail: string };
  dateTime: { date: string; time: string; zone: string };
  weather: { city: string; tempC: number | null; condition: string; humidity: number; windKph: number; uv: string };
  kpis: CanonicalKpi[];
  tasks: CanonicalTask[];
  approvals: CanonicalApproval[];
  activity: Array<{ title: string; meta: string }>;
  worldTimes: Array<{ city: string; time: string; date: string }>;
}

export interface CanonicalNavigationItem {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  badge?: string;
  onSelect?: () => void;
}

export interface CanonicalDashboardProps {
  initialLayout?: StaffPortalLayoutId;
  fixture?: CanonicalFixture;
  liveSlots?: Partial<Record<CanonicalZoneId, ReactNode>>;
  navigation?: CanonicalNavigationItem[];
  onAskAi?: () => void;
  onQuickCreate?: () => void;
  onNotifications?: () => void;
  onWorkspace?: () => void;
  onSearch?: () => void;
  onProfile?: () => void;
  activeNavigationId?: string;
  onLayoutChange?: (layoutId: StaffPortalLayoutId) => void;
}
