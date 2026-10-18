# V20 source diff excerpts

## Pinned sources

- Sites V19: `58e17866070d0d0874560e9417663928146d3b60`
- Production Staff Portal Sign-In: `839dc56a0a593fc08cc3f806daa3aa6fb0c0548f`
- GitHub baseline read: **YES**
- Production repository writes: **0**
- Production post-auth frontend imported: **NO**

## Imported source and asset hashes

- `app/experience/staffportal-import/signin-experience.tsx` — SHA256 `4eac36534b10bacde8052fb342ddfcbb842eea20e88e82bdbe80f33850c657ab`
- `app/experience/staffportal-import/signin-experience.css` — SHA256 `66409ab9c83304d1b1aa516d0a6d360df4f5ed9592b0b1741f2410341d30e784`
- `app/experience/staffportal-import/signin-preferences.ts` — SHA256 `9400a6ebb840ae11b4f846d5fd3a334a2812000d158c6f86cbed04dc8492ef44`
- `app/experience/staffportal-import/signin-font-loader.ts` — SHA256 `af79af181a6a4684d875e79058b398ba00db60cf6f59d69707988fc9ef7f8bf9`
- `app/experience/staffportal-import/theme-system.ts` — SHA256 `5312133cb41e2f767a1ddee8068e3b88d6a65b67fefd448bc5a7c570b6b9aa4c`
- `public/reference-images/signin/daenem-unified-daylight-4k.webp` — SHA256 `acef2d786e7a86c94c3ae8793a3a95e93fdbcde30a0014b89985a71149f122e2`

The Staff Portal files are kept under a provenance-specific import boundary. The only additive renderer accommodation is an optional preferences override and an option to suppress document-level theme mutation in isolated Studio previews; default production behavior remains unchanged.

## Unified registry excerpt

```tsx
  RENDERER_FAMILY: "STAFFPORTAL_EXACT" | "SITES_V19" | "UNIFIED_CUSTOM";
  RUNTIME_DEFINITION?: SignInThemeDefinition;
}

export const STAFFPORTAL_SOURCE_COMMIT = "839dc56a0a593fc08cc3f806daa3aa6fb0c0548f";
export const SITES_SOURCE_COMMIT = "58e17866070d0d0874560e9417663928146d3b60";
export const STAFFPORTAL_DEFAULT_THEME_ID = "staffportal:lagos-sunrise";
export const UNIFIED_ACTIVE_THEME_STORAGE = "daenem-signin-active-v20";
export const UNIFIED_CUSTOM_THEMES_STORAGE = "daenem-signin-custom-v20";
export const UNIFIED_STUDIO_VERSIONS_STORAGE = "daenem-signin-studio-versions-v20";

export const STAFFPORTAL_BACKGROUND_LIBRARY: UnifiedBackground[] = [
  { assetId: "unified-daylight", name: "Unified Daylight", src: "/reference-images/signin/daenem-unified-daylight-4k.webp", source: "STAFFPORTAL", sourcePath: "public/reference-images/signin/daenem-unified-daylight-4k.webp", focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "source" },
  { assetId: "global-executive-atrium", name: "Global Executive Atrium", src: "/reference-images/signin/global-executive-atrium.webp", previewSrc: "/reference-images/signin/global-executive-atrium-thumb.webp", source: "STAFFPORTAL", sourcePath: "public/reference-images/signin/global-executive-atrium.webp", focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "source" },
  { assetId: "future-technology-campus", name: "Future Technology Campus", src: "/reference-images/signin/future-technology-campus.webp", previewSrc: "/reference-images/signin/future-technology-campus-thumb.webp", source: "STAFFPORTAL", sourcePath: "public/reference-images/signin/future-technology-campus.webp", focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "source" },
  { assetId: "daylight-glass-skyline", name: "Daylight Glass Skyline", src: "/reference-images/signin/daylight-glass-skyline.webp", previewSrc: "/reference-images/signin/daylight-glass-skyline-thumb.webp", source: "STAFFPORTAL", sourcePath: "public/reference-images/signin/daylight-glass-skyline.webp", focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "source" },
  { assetId: "premium-connected-workspace", name: "Premium Connected Workspace", src: "/reference-images/signin/premium-connected-workspace.webp", previewSrc: "/reference-images/signin/premium-connected-workspace-thumb.webp", source: "STAFFPORTAL", sourcePath: "public/reference-images/signin/premium-connected-workspace.webp", focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "source" },
  { assetId: "bright-executive-global-atrium", name: "Bright Executive Global Atrium", src: "/reference-images/signin/bright-executive-global-atrium.webp", previewSrc: "/reference-images/signin/bright-executive-global-atrium-thumb.webp", source: "STAFFPORTAL", sourcePath: "public/reference-images/signin/bright-executive-global-atrium.webp", focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "source" },
  { assetId: "daylight-technology-campus", name: "Daylight Technology Campus", src: "/reference-images/signin/daylight-technology-campus.webp", previewSrc: "/reference-images/signin/daylight-technology-campus-thumb.webp", source: "STAFFPORTAL", sourcePath: "public/reference-images/signin/daylight-technology-campus.webp", focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "source" },
];

const REQUIRED_WIDGETS = ["Authentication", "Analog Clock", "Digital Clock", "Full Date", "Daenem Complex / Ibadan", "Current Weather", "Forecast", "Sunrise / Sunset", "World Clock Grid", "AI Search", "AI Inspiration", "Employee Motivation", "World News", "System Status", "Security Message"];
const sourceDate = "2026-09-13T00:00:00.000Z";

function staffPortalRecord(theme: (typeof staffPortalThemeList)[number], index: number): UnifiedSignInThemeRecord {
  const palette = theme.day;
  return {
    THEME_ID: `staffportal:${theme.id}`,
    DISPLAY_NAME: theme.name,
    SOURCE_PROVENANCE: "STAFFPORTAL",
    SOURCE_THEME_ID: theme.id,
    SOURCE_VERSION: STAFFPORTAL_SOURCE_COMMIT,
    DESCRIPTION: `${theme.focus}. ${theme.mood}.`,
    ART_DIRECTION: theme.mood,
    LAYOUT_FAMILY: theme.signInLayout,
```

## One-renderer boundary excerpt

```tsx
"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { SignInExperience } from "./staffportal-import/signin-experience";
import {
  DEFAULT_SIGNIN_PREFERENCES,
  normalizeSignInPreferences,
} from "./staffportal-import/signin-preferences";
import { themeById } from "./staffportal-import/theme-system";
import { SignInRuntimeRenderer, defaultThemeDefinition, type SignInThemeDefinition } from "./signin-theme-runtime";
import {
  staffPortalThemeId,
  type UnifiedSignInThemeRecord,
} from "./signin-unified-registry";
import "./staffportal-import/signin-experience.css";
import "./unified-signin-renderer.css";

function productionPreferences(record: UnifiedSignInThemeRecord) {
  return normalizeSignInPreferences({
    ...structuredClone(DEFAULT_SIGNIN_PREFERENCES),
    backgroundId: record.BACKGROUND.assetId,
    themeMode: record.SOURCE_THEME_ID === "auto-showroom-night" ? "night" : "day",
    globalOperations: {
      ...DEFAULT_SIGNIN_PREFERENCES.globalOperations,
      visible: true,
      showAnalog: true,
      showDigital: true,
      showWeather: true,
    },
  });
}

function productionVars(record: UnifiedSignInThemeRecord): CSSProperties {
  const theme = themeById(staffPortalThemeId(record));
  const palette = record.SOURCE_THEME_ID === "auto-showroom-night" ? theme.night : theme.day;
  return {
    "--font-heading": `"${record.TYPOGRAPHY.heading}"`,
    "--font-body": `"${record.TYPOGRAPHY.body}"`,
    "--usp-blue": palette.primary,
    "--usp-cyan": palette.secondary,
    "--usp-coral": palette.accent,
    "--usp-green": palette.success,
    "--usp-ink": palette.text,
    "--usp-muted": palette.muted,
  } as CSSProperties;
}

export function UnifiedSignInRenderer({
  record,
  runtimeTheme,
  now,
  auth,
  search,
  preview = false,
  onInstall = () => undefined,
}: {
  record: UnifiedSignInThemeRecord;
  runtimeTheme?: SignInThemeDefinition;
  now: Date;
  auth: ReactNode;
  search: ReactNode;
  preview?: boolean;
  onInstall?: () => void;
}) {
  const preferences = useMemo(() => productionPreferences(record), [record]);
  if (record.RENDERER_FAMILY === "STAFFPORTAL_EXACT") {
    return <div
      className={`unified-staffportal-renderer ${preview ? "is-preview" : ""} layout-${record.LAYOUT_FAMILY}`}
      data-unified-theme-id={record.THEME_ID}
      data-source-provenance={record.SOURCE_PROVENANCE}
      data-source-version={record.SOURCE_VERSION}
      data-default-theme={record.IS_DEFAULT ? "true" : "false"}
      style={productionVars(record)}
    >
      <SignInExperience
        authPanel={auth}
        themeId={staffPortalThemeId(record)}
        onInstall={onInstall}
        preferencesOverride={preferences}
        suppressDocumentTheme={preview}
```

## Authoritative ledger excerpt

```csv
DAENEM-PALETTE-001,V19_SIGNIN_FINAL_CORRECTION_SPRINT,Global Visual System,"GREEN_SEMANTIC_ONLY: Green is limited to genuine success, available, connected, healthy, completed, valid and positive states throughout staffportal.daenem.com. Future post-auth correction removes green from sidebar, menu surfaces and hover/active states, generic badges, navigation icons, company switcher, selected tabs, generic buttons and decorative glow.",Preserve one coherent premium Daenem identity while retaining truthful semantic status colors,Green remains permitted only when the underlying state is genuinely positive or healthy.,V19,,,NOT_SENT,SITE,Cross-cutting post-auth surfaces,Portal shell and future dashboard visual system,V19-LEDGER-001,Authoritative ledger row recorded without post-auth implementation,NO,Post-auth implementation is outside the active Sign-In sprint,Execute only after independent Sign-In acceptance reaches 98 percent,Owner requirement traceability review,requirements-ledger.csv,requirements-ledger.csv,Exact Owner requirement and queue gate are present,Not applicable in current Sign-In screenshots,2026-09-13T00:00:00Z,QUEUED_AFTER_SIGNIN_98_GATE,NO_PRODUCTION_CHANGE_REQUIRED,,Independent review requires the future post-auth visual sprint after Sign-In closure.,RECORDED_NOT_IMPLEMENTED,V19_WORKTREE
DAENEM-DASH-TECH-001,V19_SIGNIN_FINAL_CORRECTION_SPRINT,Authenticated Dashboard Visual System,"DAENEM_SUPER_TECH_DASHBOARD_STANDARD: TailAdmin is the minimum baseline and Daenem dashboards must materially exceed it through controlled glow, depth, glass, animation, advanced visualization, interactive drilldown, high information density, AI intelligence surfaces, responsive and 4K composition, and an original premium language. Approved future catalogue: KPI sparkline; line; area; stacked area; bar; column; diverging bar; mixed/combo; forecast/confidence band; waterfall; radial; gauge; bullet; heatmap; calendar heatmap; risk/bubble matrix; scatter; bubble; treemap; sunburst; Sankey; node/network; Gantt/range; state timeline; funnel; radar; geo map; flow map; histogram; distribution; box/violin where justified; status history; AI insight overlay. Reuse the existing chart stack first; consider Apache ECharts-style capability only for genuinely advanced visualization; Grafana and Highcharts are benchmarks rather than automatic dependencies.",Prevent loss of the Owner-approved future dashboard standard while keeping one active sprint at a time,All dashboard data and drilldowns remain authorization filtered; no new paid library or dependency is approved in the Sign-In sprint.,V19,,,NOT_SENT,SITE,Authenticated dashboards,Dashboard engine and visualization system,V19-LEDGER-002,Authoritative ledger row recorded without dashboard implementation,NO,Dashboard implementation is explicitly outside the active Sign-In sprint,Begin the visual system and global palette correction only after independent Sign-In acceptance reaches 98 percent,Owner requirement traceability review,requirements-ledger.csv,requirements-ledger.csv,Exact standard; visualization catalogue; reuse-first decision; dependency boundary; and queue gate are present,Not applicable in current Sign-In screenshots,2026-09-13T00:00:00Z,QUEUED_AFTER_SIGNIN_98_GATE,NO_PRODUCTION_CHANGE_REQUIRED,,Independent review requires the future dashboard sprint after Sign-In closure.,RECORDED_NOT_IMPLEMENTED,V19_WORKTREE
AFTERSIGNIN-STUDIO-001,V20_SIGNIN_MERGE_AND_VISUAL_CLOSURE_SPRINT,After-Sign-In Experience / After-Sign-In Studio,"Future Owner no-code control of pages; dashboards; layouts; widgets; charts; tables; forms; maps; navigation; cards; typography; visual style; motion; AI surfaces; responsive layouts; themes; versions; publish and rollback using the current Sites after-login frontend as the product baseline.",Preserve the approved future direction without starting post-auth implementation before the Sign-In acceptance gate,Existing production RBAC; backend logic; business rules; workflows; APIs and data contracts remain authoritative and are integrated behind approved Sites pages only after the gate.,V20,,,NOT_SENT,SITE,Authenticated admin future module,After-Sign-In Experience / After-Sign-In Studio,AFTERSIGNIN-STUDIO-001,Authoritative future-feature record only,NO,Implementation explicitly blocked by the Sign-In 98 percent gate,Begin only after independent Sign-In verification reaches 98 percent,Owner requirement traceability review,requirements-ledger.csv,requirements-ledger.csv,Exact future feature; Sites baseline; old post-auth import prohibition; no-code scope; repository artifact contract; TailAdmin minimum; visualization catalogue and queue gate are recorded,Not applicable in the active Sign-In sprint,2026-09-13T00:00:00Z,QUEUED_AFTER_SIGNIN_98_GATE,NO_PRODUCTION_CHANGE_REQUIRED,,Old staffportal after-login frontend is not imported.,RECORDED_NOT_IMPLEMENTED,V20_WORKTREE
```

## Diff summary before V20 save

```text
app/experience/auth-v3.tsx              | 20 +++++++++++--
 app/experience/enterprise-v3.tsx        |  4 +--
 app/experience/model.ts                 |  2 +-
 app/experience/signin-builder-v16.tsx   |  3 +-
 app/experience/signin-theme-runtime.tsx | 52 ++++++++++++++++++++-------------
 app/experience/signin-v19.css           | 38 ++++++++++++++++++++++++
 app/review/viewports/page.tsx           |  8 +++--
 requirements-ledger.csv                 |  1 +
 8 files changed, 98 insertions(+), 30 deletions(-)
```
