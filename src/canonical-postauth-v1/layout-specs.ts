import type { CanonicalLayoutSpec, StaffPortalLayoutId } from './canonical-types';

export const CANONICAL_LAYOUT_SPECS: Record<StaffPortalLayoutId, CanonicalLayoutSpec> = {
  "executive-command": {
    "id": "executive-command",
    "name": "Executive Command",
    "navMode": "sidebar",
    "description": "Flagship Owner command surface with hero, KPI command strip, analytical center and intelligence rail.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis",
      "executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics ai-insights ai-insights weather weather",
      "activity activity activity approvals approvals approvals tasks tasks . . quick-actions quick-actions",
      "announcement announcement announcement announcement announcement announcement announcement announcement announcement announcement announcement announcement",
      "world-time world-time world-time world-time status status status status knowledge knowledge knowledge knowledge"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis kpis kpis kpis",
      "executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics ai-insights ai-insights",
      "tasks tasks tasks tasks approvals approvals approvals approvals",
      "weather weather world-time world-time activity activity activity activity",
      "quick-actions quick-actions status status knowledge knowledge announcement announcement"
    ],
    "mobileOrder": [
      "hero",
      "kpis",
      "executive-analytics",
      "ai-insights",
      "tasks",
      "approvals",
      "weather",
      "world-time",
      "activity",
      "quick-actions",
      "knowledge",
      "status",
      "announcement"
    ],
    "zones": [
      "hero",
      "kpis",
      "executive-analytics",
      "ai-insights",
      "weather",
      "world-time",
      "tasks",
      "approvals",
      "activity",
      "knowledge",
      "quick-actions",
      "status",
      "announcement"
    ],
    "wideRowMinimums": [
      260,
      160,
      560,
      420,
      150,
      330
    ]
  },
  "workspace-canvas": {
    "id": "workspace-canvas",
    "name": "Workspace Canvas",
    "navMode": "slim-rail",
    "description": "Flexible modular personal workspace with quick command, schedule, projects and personal work panels.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero hero hero hero hero",
      "quick-actions quick-actions quick-actions quick-actions quick-actions quick-actions quick-actions quick-actions ai-insights ai-insights ai-insights ai-insights",
      "workspace-schedule workspace-schedule workspace-schedule workspace-projects workspace-projects workspace-projects workspace-projects workspace-projects workspace-projects tasks tasks tasks",
      "world-time world-time world-time weather weather weather status status status approvals approvals approvals",
      "activity activity activity activity activity activity knowledge knowledge knowledge announcement announcement announcement"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero hero hero",
      "quick-actions quick-actions quick-actions quick-actions ai-insights ai-insights ai-insights ai-insights",
      "workspace-schedule workspace-schedule workspace-schedule workspace-schedule workspace-projects workspace-projects workspace-projects workspace-projects",
      "tasks tasks tasks tasks approvals approvals approvals approvals",
      "world-time world-time weather weather status status status status",
      "activity activity activity activity knowledge knowledge announcement announcement"
    ],
    "mobileOrder": [
      "hero",
      "quick-actions",
      "workspace-schedule",
      "workspace-projects",
      "tasks",
      "ai-insights",
      "approvals",
      "weather",
      "world-time",
      "status",
      "activity",
      "knowledge",
      "announcement"
    ],
    "zones": [
      "hero",
      "quick-actions",
      "workspace-schedule",
      "workspace-projects",
      "tasks",
      "ai-insights",
      "approvals",
      "weather",
      "world-time",
      "status",
      "activity",
      "knowledge",
      "announcement"
    ],
    "wideRowMinimums": [
      260,
      300,
      560,
      350,
      330
    ]
  },
  "operational-cockpit": {
    "id": "operational-cockpit",
    "name": "Operational Cockpit",
    "navMode": "sidebar",
    "description": "Live operations control room with map, team state, incidents, queues and integrations.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis",
      "operations-map operations-map operations-map operations-map operations-map operations-map operations-map operations-team operations-team operations-team ai-insights ai-insights",
      "operations-map operations-map operations-map operations-map operations-map operations-map operations-map tasks tasks tasks status status",
      "approvals approvals approvals executive-analytics executive-analytics executive-analytics executive-analytics weather weather quick-actions quick-actions quick-actions",
      "activity activity activity activity world-time world-time world-time knowledge knowledge announcement announcement announcement"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis kpis kpis kpis",
      "operations-map operations-map operations-map operations-map operations-map operations-map operations-team operations-team",
      "tasks tasks tasks tasks ai-insights ai-insights status status",
      "approvals approvals executive-analytics executive-analytics executive-analytics executive-analytics weather weather",
      "quick-actions quick-actions world-time world-time activity activity announcement announcement",
      "knowledge knowledge knowledge knowledge knowledge knowledge knowledge knowledge"
    ],
    "mobileOrder": [
      "hero",
      "kpis",
      "operations-map",
      "operations-team",
      "ai-insights",
      "tasks",
      "status",
      "approvals",
      "executive-analytics",
      "weather",
      "quick-actions",
      "world-time",
      "activity",
      "knowledge",
      "announcement"
    ],
    "zones": [
      "hero",
      "kpis",
      "operations-map",
      "operations-team",
      "ai-insights",
      "tasks",
      "status",
      "approvals",
      "executive-analytics",
      "weather",
      "quick-actions",
      "world-time",
      "activity",
      "knowledge",
      "announcement"
    ],
    "wideRowMinimums": [
      240,
      150,
      410,
      360,
      340,
      250
    ]
  },
  "insight-magazine": {
    "id": "insight-magazine",
    "name": "Insight Magazine",
    "navMode": "top-led",
    "description": "Editorial intelligence experience with featured story, narrative data, executive brief and knowledge.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero insight-story insight-story insight-story weather weather",
      "kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis weather weather",
      "executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics knowledge knowledge knowledge ai-insights ai-insights world-time world-time",
      "activity activity activity activity activity activity quick-actions quick-actions quick-actions announcement announcement announcement"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero insight-story insight-story",
      "kpis kpis kpis kpis kpis kpis kpis kpis",
      "executive-analytics executive-analytics executive-analytics executive-analytics ai-insights ai-insights weather weather",
      "knowledge knowledge knowledge knowledge world-time world-time quick-actions quick-actions",
      "activity activity activity activity announcement announcement announcement announcement"
    ],
    "mobileOrder": [
      "hero",
      "insight-story",
      "kpis",
      "executive-analytics",
      "ai-insights",
      "weather",
      "world-time",
      "knowledge",
      "activity",
      "quick-actions",
      "announcement"
    ],
    "zones": [
      "hero",
      "insight-story",
      "kpis",
      "executive-analytics",
      "ai-insights",
      "weather",
      "world-time",
      "knowledge",
      "activity",
      "quick-actions",
      "announcement"
    ],
    "wideRowMinimums": [
      440,
      160,
      800,
      330
    ]
  },
  "master-detail-workspace": {
    "id": "master-detail-workspace",
    "name": "Master–Detail Workspace",
    "navMode": "split-pane",
    "description": "Browse, select, inspect and act through a master list, rich detail workspace and inspector.",
    "desktopGridAreas": [
      "master-list master-list master-list master-detail master-detail master-detail master-detail master-detail master-detail ai-insights ai-insights ai-insights",
      "master-list master-list master-list master-detail master-detail master-detail master-detail master-detail master-detail status status status",
      "master-list master-list master-list activity activity activity activity approvals approvals approvals knowledge knowledge",
      "announcement announcement announcement announcement announcement announcement quick-actions quick-actions quick-actions world-time world-time world-time"
    ],
    "tabletGridAreas": [
      "master-list master-list master-list master-detail master-detail master-detail master-detail master-detail",
      "master-list master-list master-list master-detail master-detail master-detail master-detail master-detail",
      "activity activity activity activity ai-insights ai-insights status status",
      "approvals approvals approvals approvals knowledge knowledge quick-actions quick-actions",
      "announcement announcement announcement announcement world-time world-time world-time world-time"
    ],
    "mobileOrder": [
      "master-list",
      "master-detail",
      "ai-insights",
      "status",
      "activity",
      "approvals",
      "knowledge",
      "quick-actions",
      "world-time",
      "announcement"
    ],
    "zones": [
      "master-list",
      "master-detail",
      "ai-insights",
      "status",
      "activity",
      "approvals",
      "knowledge",
      "quick-actions",
      "world-time",
      "announcement"
    ],
    "wideRowMinimums": [
      560,
      420,
      400,
      330
    ]
  },
  "horizon-wide": {
    "id": "horizon-wide",
    "name": "Horizon Wide",
    "navMode": "slim-rail",
    "description": "Panoramic 4K-first analytical canvas with wide horizontal intelligence lanes.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero hero hero world-time world-time",
      "kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis weather weather",
      "horizon-global horizon-global horizon-global horizon-global horizon-global executive-analytics executive-analytics executive-analytics executive-analytics ai-insights ai-insights ai-insights",
      "workspace-projects workspace-projects workspace-projects workspace-projects workspace-projects workspace-projects tasks tasks tasks quick-actions quick-actions quick-actions",
      "announcement announcement announcement announcement activity activity activity activity status status knowledge knowledge"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero world-time world-time",
      "kpis kpis kpis kpis kpis kpis weather weather",
      "horizon-global horizon-global horizon-global horizon-global executive-analytics executive-analytics executive-analytics executive-analytics",
      "ai-insights ai-insights ai-insights ai-insights quick-actions quick-actions quick-actions quick-actions",
      "workspace-projects workspace-projects workspace-projects workspace-projects tasks tasks tasks tasks",
      "announcement announcement announcement announcement activity activity activity activity",
      "status status status status knowledge knowledge knowledge knowledge"
    ],
    "mobileOrder": [
      "hero",
      "world-time",
      "kpis",
      "weather",
      "horizon-global",
      "executive-analytics",
      "ai-insights",
      "workspace-projects",
      "tasks",
      "quick-actions",
      "announcement",
      "activity",
      "status",
      "knowledge"
    ],
    "zones": [
      "hero",
      "world-time",
      "kpis",
      "weather",
      "horizon-global",
      "executive-analytics",
      "ai-insights",
      "workspace-projects",
      "tasks",
      "quick-actions",
      "announcement",
      "activity",
      "status",
      "knowledge"
    ],
    "wideRowMinimums": [
      260,
      160,
      630,
      400,
      310
    ]
  },
  "adaptive-bento": {
    "id": "adaptive-bento",
    "name": "Adaptive Bento",
    "navMode": "sidebar",
    "description": "Asymmetric interlocking bento composition where size communicates priority.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero ai-insights ai-insights ai-insights ai-insights",
      "kpis kpis kpis kpis kpis kpis kpis kpis ai-insights ai-insights ai-insights ai-insights",
      "executive-analytics executive-analytics executive-analytics executive-analytics executive-analytics bento-strategy bento-strategy bento-strategy tasks tasks tasks tasks",
      "activity activity activity approvals approvals approvals knowledge knowledge knowledge weather weather weather",
      "announcement announcement announcement quick-actions quick-actions quick-actions world-time world-time status status status status"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero ai-insights ai-insights",
      "kpis kpis kpis kpis kpis kpis ai-insights ai-insights",
      "executive-analytics executive-analytics executive-analytics executive-analytics bento-strategy bento-strategy tasks tasks",
      "activity activity approvals approvals knowledge knowledge weather weather",
      "announcement announcement quick-actions quick-actions world-time world-time status status"
    ],
    "mobileOrder": [
      "hero",
      "kpis",
      "ai-insights",
      "executive-analytics",
      "bento-strategy",
      "tasks",
      "approvals",
      "activity",
      "weather",
      "knowledge",
      "quick-actions",
      "world-time",
      "status",
      "announcement"
    ],
    "zones": [
      "hero",
      "kpis",
      "ai-insights",
      "executive-analytics",
      "bento-strategy",
      "tasks",
      "approvals",
      "activity",
      "weather",
      "knowledge",
      "quick-actions",
      "world-time",
      "status",
      "announcement"
    ],
    "wideRowMinimums": [
      280,
      160,
      610,
      390,
      310
    ]
  },
  "focus-flow": {
    "id": "focus-flow",
    "name": "Focus & Flow",
    "navMode": "top-led",
    "description": "Calm priority-centered workflow with one dominant work stream and supporting context rails.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero hero hero hero hero",
      "focus-progress focus-progress focus-progress focus-priorities focus-priorities focus-priorities focus-priorities focus-priorities focus-priorities ai-insights ai-insights ai-insights",
      "quick-actions quick-actions quick-actions focus-priorities focus-priorities focus-priorities focus-priorities focus-priorities focus-priorities weather weather weather",
      "activity activity activity tasks tasks tasks approvals approvals approvals world-time world-time world-time",
      "announcement announcement announcement announcement announcement announcement status status status knowledge knowledge knowledge"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero hero hero",
      "focus-progress focus-progress focus-progress focus-priorities focus-priorities focus-priorities ai-insights ai-insights",
      "quick-actions quick-actions quick-actions focus-priorities focus-priorities focus-priorities weather weather",
      "activity activity tasks tasks approvals approvals world-time world-time",
      "announcement announcement announcement announcement status status knowledge knowledge"
    ],
    "mobileOrder": [
      "hero",
      "focus-progress",
      "focus-priorities",
      "ai-insights",
      "quick-actions",
      "weather",
      "tasks",
      "approvals",
      "world-time",
      "activity",
      "status",
      "knowledge",
      "announcement"
    ],
    "zones": [
      "hero",
      "focus-progress",
      "focus-priorities",
      "ai-insights",
      "quick-actions",
      "weather",
      "tasks",
      "approvals",
      "world-time",
      "activity",
      "status",
      "knowledge",
      "announcement"
    ],
    "wideRowMinimums": [
      260,
      520,
      350,
      330,
      290
    ]
  },
  "enterprise-studio": {
    "id": "enterprise-studio",
    "name": "Enterprise Studio",
    "navMode": "studio",
    "description": "Creation and automation studio with toolbox, working canvas and persistent inspector.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis kpis kpis kpis kpis weather weather weather",
      "studio-toolbox studio-toolbox studio-canvas studio-canvas studio-canvas studio-canvas studio-canvas studio-canvas studio-canvas ai-insights ai-insights ai-insights",
      "studio-toolbox studio-toolbox studio-canvas studio-canvas studio-canvas studio-canvas studio-canvas studio-canvas studio-canvas status status status",
      "executive-analytics executive-analytics executive-analytics executive-analytics activity activity activity quick-actions quick-actions world-time world-time world-time",
      "announcement announcement announcement announcement knowledge knowledge knowledge knowledge tasks tasks approvals approvals"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis weather weather weather",
      "studio-toolbox studio-toolbox studio-canvas studio-canvas studio-canvas studio-canvas ai-insights ai-insights",
      "studio-toolbox studio-toolbox studio-canvas studio-canvas studio-canvas studio-canvas status status",
      "executive-analytics executive-analytics executive-analytics executive-analytics activity activity activity activity",
      "quick-actions quick-actions quick-actions quick-actions world-time world-time world-time world-time",
      "announcement announcement announcement announcement knowledge knowledge knowledge knowledge",
      "tasks tasks tasks tasks approvals approvals approvals approvals"
    ],
    "mobileOrder": [
      "hero",
      "kpis",
      "studio-toolbox",
      "studio-canvas",
      "ai-insights",
      "weather",
      "status",
      "executive-analytics",
      "activity",
      "quick-actions",
      "world-time",
      "knowledge",
      "tasks",
      "approvals",
      "announcement"
    ],
    "zones": [
      "hero",
      "kpis",
      "studio-toolbox",
      "studio-canvas",
      "ai-insights",
      "weather",
      "status",
      "executive-analytics",
      "activity",
      "quick-actions",
      "world-time",
      "knowledge",
      "tasks",
      "approvals",
      "announcement"
    ],
    "wideRowMinimums": [
      230,
      150,
      400,
      370,
      350,
      250
    ]
  },
  "board-pulse": {
    "id": "board-pulse",
    "name": "Board Pulse",
    "navMode": "sidebar",
    "description": "Strategic board briefing surface with executive trend, strategy progress, agenda, decisions and pulse timeline.",
    "desktopGridAreas": [
      "hero hero hero hero hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis kpis kpis kpis kpis kpis weather weather",
      "board-trend board-trend board-trend board-trend board-trend board-trend bento-strategy bento-strategy bento-strategy ai-insights ai-insights ai-insights",
      "board-agenda board-agenda board-agenda board-agenda approvals approvals approvals executive-analytics executive-analytics activity activity activity",
      "world-time world-time world-time quick-actions quick-actions quick-actions knowledge knowledge status status announcement announcement"
    ],
    "tabletGridAreas": [
      "hero hero hero hero hero hero hero hero",
      "kpis kpis kpis kpis kpis kpis weather weather",
      "board-trend board-trend board-trend board-trend bento-strategy bento-strategy ai-insights ai-insights",
      "board-agenda board-agenda board-agenda board-agenda approvals approvals approvals approvals",
      "executive-analytics executive-analytics executive-analytics executive-analytics activity activity activity activity",
      "world-time world-time world-time world-time quick-actions quick-actions quick-actions quick-actions",
      "knowledge knowledge knowledge knowledge status status status status",
      "announcement announcement announcement announcement announcement announcement announcement announcement"
    ],
    "mobileOrder": [
      "hero",
      "kpis",
      "board-trend",
      "bento-strategy",
      "ai-insights",
      "board-agenda",
      "approvals",
      "executive-analytics",
      "activity",
      "weather",
      "world-time",
      "quick-actions",
      "knowledge",
      "status",
      "announcement"
    ],
    "zones": [
      "hero",
      "kpis",
      "board-trend",
      "bento-strategy",
      "ai-insights",
      "board-agenda",
      "approvals",
      "executive-analytics",
      "activity",
      "weather",
      "world-time",
      "quick-actions",
      "knowledge",
      "status",
      "announcement"
    ],
    "wideRowMinimums": [
      260,
      160,
      610,
      410,
      310
    ]
  }
};

export const CANONICAL_LAYOUT_IDS = Object.keys(CANONICAL_LAYOUT_SPECS) as StaffPortalLayoutId[];
