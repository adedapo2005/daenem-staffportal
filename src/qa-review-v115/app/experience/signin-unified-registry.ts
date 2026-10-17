"use client";

import { signInPresets } from "./auth-contract";
import {
  defaultThemeDefinition,
  type SignInThemeDefinition,
} from "./signin-theme-runtime";
import {
  themeList as staffPortalThemeList,
  type ThemeId as StaffPortalThemeId,
} from "./staffportal-import/theme-system";

export type ThemeSourceProvenance = "WEBFLOW" | "STAFFPORTAL" | "SITES" | "CUSTOM";
export type UnifiedThemeStatus = "DRAFT" | "PREVIEW" | "REVIEW" | "PUBLISHED" | "ARCHIVED";

export type UnifiedBackground = {
  assetId: string;
  name: string;
  src: string;
  previewSrc?: string;
  source: ThemeSourceProvenance;
  sourcePath: string;
  focalPoint: { x: number; y: number };
  fit: "cover" | "contain";
  crop: "source" | "viewport";
};

export interface UnifiedSignInThemeRecord {
  THEME_ID: string;
  DISPLAY_NAME: string;
  SOURCE_PROVENANCE: ThemeSourceProvenance;
  SOURCE_THEME_ID: string;
  SOURCE_VERSION: string;
  DESCRIPTION: string;
  ART_DIRECTION: string;
  LAYOUT_FAMILY: string;
  BACKGROUND: UnifiedBackground;
  NIGHT_BACKGROUND?: UnifiedBackground;
  BREAKPOINT_LAYOUTS: Record<string, unknown>;
  WIDGETS: string[];
  STYLE_TOKENS: Record<string, string | number>;
  MOTION_PROFILE: Record<string, unknown>;
  TYPOGRAPHY: { heading: string; body: string };
  AUTH_TREATMENT: string;
  STATUS: UnifiedThemeStatus;
  CREATED_AT: string;
  UPDATED_AT: string;
  VERSION: number;
  PARENT_THEME: string | null;
  IS_DEFAULT: boolean;
  IS_DRAFT: boolean;
  IS_ACTIVE: boolean;
  IS_ARCHIVED: boolean;
  RENDERER_FAMILY: "WEBFLOW_HOME" | "STAFFPORTAL_EXACT" | "SITES_V19" | "UNIFIED_CUSTOM";
  RUNTIME_DEFINITION?: SignInThemeDefinition;
}

export const STAFFPORTAL_SOURCE_COMMIT = "839dc56a0a593fc08cc3f806daa3aa6fb0c0548f";
export const SITES_SOURCE_COMMIT = "58e17866070d0d0874560e9417663928146d3b60";
export const PRODUCTION_RAW_SOURCE_DEFAULT_THEME = "webflow-home";
export const STAFFPORTAL_DEFAULT_THEME_ID = "webflow:home-default";
export const WEBFLOW_HOME_SOURCE_SITE_ID = "6aa97ee8b7b32e580617b181";
export const WEBFLOW_HOME_SOURCE_PAGE_ID = "6aa97ee9b7b32e580617b18e";
export const WEBFLOW_HOME_DAY_ASSET_ID = "6aa9ef56c979478fd3dcbfb4";
export const WEBFLOW_HOME_NIGHT_ASSET_ID = "6aa9a598788831dc291a0bb9";
/**
 * V36 deliberately does not treat browser storage as portal authority.  The
 * current Sites project has no D1/R2 binding or authenticated server action
 * for governed Sign-In configuration, so shared activation remains blocked
 * until that platform capability is provisioned.  These values are the
 * immutable safe fallback used by public rendering and review previews.
 */
export type SharedSignInConfig = {
  activeSignInTheme: string;
  activeSignInVisualMode: "day" | "night";
};
export const SHARED_SIGNIN_CONFIG_STATUS = "BLOCKED_NO_PROJECT_PERSISTENCE" as const;
export const DEFAULT_SHARED_SIGNIN_CONFIG: SharedSignInConfig = {
  activeSignInTheme: "webflow:home-default",
  activeSignInVisualMode: "day",
};
export const UNIFIED_PREVIEW_THEME_STORAGE = "daenem-signin-preview-active-v36";
export const PREVIEW_VISUAL_MODE_STORAGE = "daenem-signin-preview-visual-mode-v36";
export const SIGNIN_STUDIO_AUDIT_STORAGE = "daenem-signin-studio-audit-current";
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

export const WEBFLOW_HOME_RECORD: UnifiedSignInThemeRecord = {
  THEME_ID: STAFFPORTAL_DEFAULT_THEME_ID,
  DISPLAY_NAME: "Webflow Home — Accepted Default",
  SOURCE_PROVENANCE: "WEBFLOW",
  SOURCE_THEME_ID: "webflow-home",
  SOURCE_VERSION: `${WEBFLOW_HOME_SOURCE_SITE_ID}/${WEBFLOW_HOME_SOURCE_PAGE_ID}`,
  DESCRIPTION: "Owner-accepted Webflow Home/default Staff Portal entrance.",
  ART_DIRECTION: "Current Webflow Home daylight enterprise campus",
  LAYOUT_FAMILY: "hero-triad",
  BACKGROUND: { assetId: WEBFLOW_HOME_DAY_ASSET_ID, name: "Daenem-Global-Business-OS-4K-Daylight-Campus.jpg", src: "/assets/webflow-home/day-4k.jpg", previewSrc: "/assets/webflow-home/day-4k.jpg", source: "WEBFLOW", sourcePath: `Webflow Home (${WEBFLOW_HOME_SOURCE_PAGE_ID}) asset ${WEBFLOW_HOME_DAY_ASSET_ID}`, focalPoint: { x: 50, y: 48 }, fit: "cover", crop: "viewport" },
  NIGHT_BACKGROUND: { assetId: WEBFLOW_HOME_NIGHT_ASSET_ID, name: "Daenem-Neon-Executive-Campus-Blue-Hour-4K.jpg", src: "/assets/webflow-home/night-4k.jpg", previewSrc: "/assets/webflow-home/night-4k.jpg", source: "WEBFLOW", sourcePath: `Webflow Home (${WEBFLOW_HOME_SOURCE_PAGE_ID}) asset ${WEBFLOW_HOME_NIGHT_ASSET_ID}`, focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "viewport" },
  BREAKPOINT_LAYOUTS: { "390×844": "Purpose-built mobile stack", "430": "Purpose-built mobile stack", "768": "Tablet stack", "1024": "Tablet/desktop grid", "1366": "Desktop triad", "1672×941": "Accepted desktop triad", "1920": "Desktop triad", "2560": "Wide desktop", "3840×2160": "4K wide desktop" },
  WIDGETS: ["Authentication", "Daenem Complex — Ibadan Environmental Intelligence", "Intelligence", "Motivation / Progress", "Nigeria News", "Operational Status", "Global Operations"],
  STYLE_TOKENS: { primary: "#061937", secondary: "#21c8ff", accent: "#8174ff", surface: "rgba(5,18,43,.72)", text: "#f7fbff", muted: "#b7cae3", border: "rgba(174,225,255,.28)", shadow: "0 24px 80px rgba(0,8,28,.38)" },
  MOTION_PROFILE: { level: "restrained", reducedMotion: "mandatory" },
  TYPOGRAPHY: { heading: "Manrope", body: "Inter" },
  AUTH_TREATMENT: "Accepted compact Webflow Home authentication card",
  STATUS: "PUBLISHED", CREATED_AT: "2026-09-16T19:53:22.024Z", UPDATED_AT: "2026-09-17T19:21:42.892Z", VERSION: 35,
  PARENT_THEME: null, IS_DEFAULT: true, IS_DRAFT: false, IS_ACTIVE: true, IS_ARCHIVED: false, RENDERER_FAMILY: "WEBFLOW_HOME",
};

function staffPortalRecord(theme: (typeof staffPortalThemeList)[number]): UnifiedSignInThemeRecord {
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
    BACKGROUND: STAFFPORTAL_BACKGROUND_LIBRARY[0],
    BREAKPOINT_LAYOUTS: { Mobile: "Production responsive composition", Tablet: "Production responsive composition", Desktop: theme.signInLayout, "4K": theme.signInLayout },
    WIDGETS: REQUIRED_WIDGETS,
    STYLE_TOKENS: { primary: palette.primary, secondary: palette.secondary, accent: palette.accent, surface: palette.surfaceStrong, text: palette.text, muted: palette.muted, border: palette.border, shadow: palette.shadow },
    MOTION_PROFILE: { level: theme.motion, reducedMotion: "mandatory" },
    TYPOGRAPHY: { heading: theme.fontHeading, body: theme.fontBody },
    AUTH_TREATMENT: "Current production Staff Portal authentication surface",
    STATUS: "PUBLISHED",
    CREATED_AT: sourceDate,
    UPDATED_AT: sourceDate,
    VERSION: 20,
    PARENT_THEME: null,
    IS_DEFAULT: false,
    IS_DRAFT: false,
    IS_ACTIVE: false,
    IS_ARCHIVED: false,
    RENDERER_FAMILY: "STAFFPORTAL_EXACT",
  };
}

function sitesRecord(id: string): UnifiedSignInThemeRecord {
  const preset = signInPresets.find(item => item.id === id) || signInPresets[0];
  const runtime = defaultThemeDefinition(preset.id);
  return {
    THEME_ID: `sites:${preset.id}`,
    DISPLAY_NAME: preset.name,
    SOURCE_PROVENANCE: "SITES",
    SOURCE_THEME_ID: preset.id,
    SOURCE_VERSION: SITES_SOURCE_COMMIT,
    DESCRIPTION: preset.description,
    ART_DIRECTION: runtime.baseArtDirection,
    LAYOUT_FAMILY: runtime.baseArtDirection,
    BACKGROUND: { assetId: preset.id, name: preset.name, src: preset.image.replace(".jpg", "-2560.webp"), previewSrc: preset.image.replace(".jpg", "-640.webp"), source: "SITES", sourcePath: preset.image, focalPoint: { x: 50, y: 50 }, fit: "cover", crop: "viewport" },
    BREAKPOINT_LAYOUTS: runtime.layoutByBreakpoint,
    WIDGETS: runtime.widgetDefinitions.map(widget => widget.name),
    STYLE_TOKENS: runtime.styleTokens as unknown as Record<string, string | number>,
    MOTION_PROFILE: runtime.motionSettings,
    TYPOGRAPHY: { heading: "Manrope", body: "Inter" },
    AUTH_TREATMENT: runtime.authPlacement,
    STATUS: "PUBLISHED",
    CREATED_AT: sourceDate,
    UPDATED_AT: sourceDate,
    VERSION: 19,
    PARENT_THEME: null,
    IS_DEFAULT: false,
    IS_DRAFT: false,
    IS_ACTIVE: false,
    IS_ARCHIVED: false,
    RENDERER_FAMILY: "SITES_V19",
    RUNTIME_DEFINITION: runtime,
  };
}

export const STAFFPORTAL_THEME_RECORDS = staffPortalThemeList.map(staffPortalRecord);
export const SITES_THEME_RECORDS = signInPresets.map(preset => sitesRecord(preset.id));
export const CANONICAL_SIGNIN_THEME_REGISTRY: UnifiedSignInThemeRecord[] = [WEBFLOW_HOME_RECORD, ...STAFFPORTAL_THEME_RECORDS, ...SITES_THEME_RECORDS];

function safeCustomRecords(): UnifiedSignInThemeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(UNIFIED_CUSTOM_THEMES_STORAGE) || "[]") as UnifiedSignInThemeRecord[];
    return Array.isArray(value) ? value.filter(record => record?.SOURCE_PROVENANCE === "CUSTOM" && record.THEME_ID?.startsWith("custom:")) : [];
  } catch { return []; }
}

export function allUnifiedThemeRecords() { return [...CANONICAL_SIGNIN_THEME_REGISTRY, ...safeCustomRecords()]; }
export function unifiedThemeById(value?: string | null) {
  const normalized = value && !value.includes(":") && signInPresets.some(item => item.id === value) ? `sites:${value}` : value;
  return allUnifiedThemeRecords().find(record => record.THEME_ID === normalized) || CANONICAL_SIGNIN_THEME_REGISTRY[0];
}
export function currentActiveUnifiedThemeId() {
  // Public/default rendering must never read browser-only activation state.
  // Until a project-backed shared configuration is available, the safe
  // authoritative fallback remains the accepted Webflow Home record.
  return DEFAULT_SHARED_SIGNIN_CONFIG.activeSignInTheme;
}
export function currentActiveVisualMode(): "day" | "night" {
  // See currentActiveUnifiedThemeId(): localStorage is preview-only in V36.
  return DEFAULT_SHARED_SIGNIN_CONFIG.activeSignInVisualMode;
}
export function readAuthoritativeSignInConfig(): SharedSignInConfig {
  return { ...DEFAULT_SHARED_SIGNIN_CONFIG };
}
export function requestedUnifiedThemeId() {
  if (typeof window === "undefined") return currentActiveUnifiedThemeId();
  // An explicit experience query is a non-authoritative Studio preview only.
  return new URLSearchParams(window.location.search).get("experience") || currentActiveUnifiedThemeId();
}
export function activateUnifiedThemeForPreview(id: string) {
  const record = unifiedThemeById(id);
  if (typeof window === "undefined") return record;
  // Temporary, device-local preview state is intentionally separate from the
  // authoritative portal configuration. It cannot change public rendering.
  localStorage.setItem(UNIFIED_PREVIEW_THEME_STORAGE, record.THEME_ID);
  const audit = JSON.parse(localStorage.getItem(SIGNIN_STUDIO_AUDIT_STORAGE) || "[]") as unknown[];
  localStorage.setItem(SIGNIN_STUDIO_AUDIT_STORAGE, JSON.stringify([...audit, { action: "PREVIEW_ACTIVE_SIGNIN_THEME", themeId: record.THEME_ID, actor: "Authorized Owner/Admin · local preview", occurredAt: new Date().toISOString() }].slice(-100)));
  window.dispatchEvent(new CustomEvent("daenem-signin-active-v20", { detail: { id: record.THEME_ID } }));
  return record;
}
export function recordVisualModeAudit(mode: "day" | "night") {
  if (typeof window === "undefined") return;
  const audit = JSON.parse(localStorage.getItem(SIGNIN_STUDIO_AUDIT_STORAGE) || "[]") as unknown[];
  localStorage.setItem(SIGNIN_STUDIO_AUDIT_STORAGE, JSON.stringify([...audit, { action: "PREVIEW_VISUAL_MODE", mode, actor: "Authorized Owner/Admin · local preview", occurredAt: new Date().toISOString() }].slice(-100)));
}
export function saveVisualModeForPreview(mode: "day" | "night") {
  if (typeof window !== "undefined") localStorage.setItem(PREVIEW_VISUAL_MODE_STORAGE, mode);
  recordVisualModeAudit(mode);
}
export function returnToStaffPortalDefault() { return activateUnifiedThemeForPreview(STAFFPORTAL_DEFAULT_THEME_ID); }

export function staffPortalThemeId(record: UnifiedSignInThemeRecord): StaffPortalThemeId {
  return (staffPortalThemeList.some(theme => theme.id === record.SOURCE_THEME_ID) ? record.SOURCE_THEME_ID : "lagos-sunrise") as StaffPortalThemeId;
}

export function createEditableVariant(record: UnifiedSignInThemeRecord): SignInThemeDefinition {
  const baseId = record.SOURCE_PROVENANCE === "SITES" ? record.SOURCE_THEME_ID : "horizon";
  const base = defaultThemeDefinition(baseId);
  const safeSource = record.THEME_ID.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return {
    ...base,
    id: `${safeSource}-variant`,
    name: `${record.DISPLAY_NAME} Variant`,
    version: 1,
    kind: "Variant",
    status: "Draft",
    baseArtDirection: record.SOURCE_PROVENANCE === "STAFFPORTAL" ? record.LAYOUT_FAMILY : base.baseArtDirection,
    background: { ...base.background, assetUrl: record.BACKGROUND.src, sourceProvenance: record.SOURCE_PROVENANCE, positionX: record.BACKGROUND.focalPoint.x, positionY: record.BACKGROUND.focalPoint.y },
    styleTokens: { ...base.styleTokens, accent: String(record.STYLE_TOKENS.secondary || base.styleTokens.accent), gradient: String(record.STYLE_TOKENS.primary || base.styleTokens.gradient), surfaceTint: String(record.STYLE_TOKENS.surface || base.styleTokens.surfaceTint), textAccent: String(record.STYLE_TOKENS.text || base.styleTokens.textAccent) },
    auditMetadata: { updatedAt: new Date().toISOString(), updatedBy: "Authorized Owner/Admin", reason: `Variant of ${record.THEME_ID}; canonical source preserved` },
  };
}

export function registerEditableVariant(source: UnifiedSignInThemeRecord, variant: SignInThemeDefinition): UnifiedSignInThemeRecord {
  const createdAt = new Date().toISOString();
  const record: UnifiedSignInThemeRecord = {
    THEME_ID: `custom:${variant.id}`,
    DISPLAY_NAME: variant.name,
    SOURCE_PROVENANCE: "CUSTOM",
    SOURCE_THEME_ID: variant.id,
    SOURCE_VERSION: "V20_SITES_LAB",
    DESCRIPTION: `Governed editable variant of ${source.DISPLAY_NAME}.`,
    ART_DIRECTION: variant.baseArtDirection,
    LAYOUT_FAMILY: variant.baseArtDirection,
    BACKGROUND: { ...source.BACKGROUND, source: "CUSTOM" },
    BREAKPOINT_LAYOUTS: variant.layoutByBreakpoint,
    WIDGETS: variant.widgetDefinitions.map(widget => widget.name),
    STYLE_TOKENS: variant.styleTokens as unknown as Record<string, string | number>,
    MOTION_PROFILE: variant.motionSettings,
    TYPOGRAPHY: source.TYPOGRAPHY,
    AUTH_TREATMENT: variant.authPlacement,
    STATUS: "DRAFT",
    CREATED_AT: createdAt,
    UPDATED_AT: createdAt,
    VERSION: variant.version,
    PARENT_THEME: source.THEME_ID,
    IS_DEFAULT: false,
    IS_DRAFT: true,
    IS_ACTIVE: false,
    IS_ARCHIVED: false,
    RENDERER_FAMILY: "UNIFIED_CUSTOM",
    RUNTIME_DEFINITION: variant,
  };
  if (typeof window !== "undefined") {
    const existing = safeCustomRecords().filter(item => item.THEME_ID !== record.THEME_ID);
    localStorage.setItem(UNIFIED_CUSTOM_THEMES_STORAGE, JSON.stringify([...existing, record]));
    window.dispatchEvent(new CustomEvent("daenem-signin-registry-v20", { detail: { id: record.THEME_ID } }));
  }
  return record;
}

export function themeRelationship(a: UnifiedSignInThemeRecord, b: UnifiedSignInThemeRecord) {
  if (a.THEME_ID === b.THEME_ID) return "EXACT DUPLICATE";
  if (a.LAYOUT_FAMILY === b.LAYOUT_FAMILY && a.SOURCE_PROVENANCE === b.SOURCE_PROVENANCE) return "STRUCTURALLY RELATED";
  if (a.ART_DIRECTION.split(/\W+/).some(word => word.length > 5 && b.ART_DIRECTION.toLowerCase().includes(word.toLowerCase()))) return "VISUALLY RELATED";
  return "UNIQUE";
}
