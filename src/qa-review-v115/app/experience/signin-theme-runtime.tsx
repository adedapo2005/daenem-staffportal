"use client";

import type { CSSProperties, ReactNode } from "react";
import { imageRuntimeFallback, imageSrcSet, signInPresets } from "./auth-contract";
import {
  RegisteredSignInWidget, WIDGET_REGISTRY_BY_TYPE, safePublicUrl,
  type SignInSecurityClassification,
} from "./signin-widget-registry";
import "./signin-runtime-v17.css";
import "./signin-runtime-v21.css";

export type SignInBreakpoint = "Desktop" | "Tablet" | "Mobile" | "4K";
export type MotionLevel = "Off" | "Subtle" | "Standard" | "Enhanced" | "Custom";
export type SignInSecurity = SignInSecurityClassification;
export type SignInWidgetId = string;

export interface SignInWidgetLayout { x: number; y: number; w: number; h: number; visible: boolean; z: number }
export interface SignInWidgetStyle {
  transparent: boolean; opacity: number; glass: number; backdropBlur: number; border: number; radius: number;
  shadow: number; glow: number; padding: number; spacing: number; headingSize: number; bodySize: number; iconSize: number;
  alignment: "Left" | "Center" | "Right"; density: "Comfortable" | "Compact" | "Spacious";
  surfaceTint: string; borderTint: string; accent: string; backgroundImage: string; imageFit: "cover" | "contain"; focalX: number; focalY: number;
}
export interface SignInWidgetDefinition {
  id: SignInWidgetId; type: string; name: string; security: SignInSecurity; locked?: boolean;
  groupId?: string | null; settings: Record<string, string | number | boolean>; style?: SignInWidgetStyle;
}
export type LogoMotionEffect = "None" | "Float" | "Gentle Pulse" | "Breathing Glow" | "Light Sweep" | "Reveal" | "Parallax" | "Hover Lift" | "Depth Tilt" | "Shimmer" | "Particle Halo" | "Custom";
export interface SignInLogoInstance {
  id: string;
  role: "Primary Header Logo" | "Auth Card Logo" | "Hero Logo" | "Corner Mark" | "Background Watermark" | "Subtle Footer Logo";
  layoutByBreakpoint: Record<SignInBreakpoint, { x: number; y: number; size: number; visible: boolean; fixed: boolean; layer: number; opacity: number; plate: "None" | "Solid" | "Glass"; border: number; shadow: number; glow: number; effect: LogoMotionEffect }>;
  opacity: number;
  plate: "None" | "Solid" | "Glass";
  border: number;
  shadow: number;
  glow: number;
  accentLight: string;
  motion: { effect: LogoMotionEffect; duration: number; delay: number; intensity: number; easing: MotionSetting["easing"]; loop: boolean; direction: MotionSetting["direction"]; hoverOnly: boolean; idle: boolean };
}
export interface SignInBrandDefinition { approvedAsset: "/brand-assets/logo.svg" | "/brand-assets/logo-mark.svg"; instances: SignInLogoInstance[] }
export interface SignInGroupDefinition { id: string; name: string; memberIds: string[]; locked: boolean }
export interface SignInStyleTokens {
  brightness: number; contrast: number; saturation: number; blur: number; overlay: number; vignette: number; noise: number;
  glass: number; opacity: number; border: number; radius: number; shadow: number; glow: number;
  headingSize: number; bodySize: number; iconSize: number; spacing: number;
  accent: string; gradient: string; surfaceTint: string; borderTint: string; textAccent: string;
  buttonStyle: "Luminous Enterprise" | "Quiet Glass" | "Solid Executive";
  inputStyle: "Inset Glass" | "Light Surface" | "Technical Line";
}
export interface MotionSetting {
  level: MotionLevel; duration: number; delay: number; intensity: number;
  easing: "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear";
  loop: boolean; direction: "normal" | "reverse" | "alternate"; hoverOnly: boolean; idle: boolean;
  breakpointBehavior: "All" | "Desktop + 4K" | "Desktop Only";
}
export interface SignInBackgroundDefinition {
  presetId: string; focalPoint: string; fit: "cover" | "contain"; positionX: number; positionY: number;
  localPreviewDataUrl?: string; localPreviewName?: string;
  assetUrl?: string; sourceProvenance?: "WEBFLOW" | "STAFFPORTAL" | "SITES" | "CUSTOM";
}
export interface SignInThemeDefinition {
  id: string; name: string; version: number; kind: "Canonical" | "Custom" | "Clone" | "Variant";
  baseArtDirection: string; status: "Draft" | "Review" | "Published" | "Archived";
  background: SignInBackgroundDefinition;
  layoutByBreakpoint: Record<SignInBreakpoint, Record<string, SignInWidgetLayout>>;
  widgetDefinitions: SignInWidgetDefinition[]; widgetOrder: string[]; groups: SignInGroupDefinition[];
  styleTokens: SignInStyleTokens; motionSettings: Record<string, MotionSetting>;
  brand: SignInBrandDefinition;
  authPlacement: string; searchPlacement: string; responsiveRules: string[]; securityClassification: "PUBLIC_SAFE";
  schedule: { activateAt: string; status: "PRODUCTION_INTEGRATION_PENDING" } | null;
  auditMetadata: { updatedAt: string; updatedBy: string; reason: string };
}

export const SIGNIN_BREAKPOINTS: SignInBreakpoint[] = ["Desktop", "Tablet", "Mobile", "4K"];
export const SIGNIN_GRID = { Desktop: { columns: 12, rows: 12 }, Tablet: { columns: 12, rows: 12 }, Mobile: { columns: 4, rows: 25 }, "4K": { columns: 12, rows: 12 } } as const;
const coreWidgetSeeds = [["auth", "authentication"], ["search", "aiSearch"], ["ibadan", "primaryLocation"], ["weather", "detailedWeather"], ["world", "worldClockGrid"], ["news", "worldNews"], ["inspiration", "aiInspiration"], ["motivation", "employeeMotivation"], ["status", "systemStatus"]] as const;
export const CANONICAL_WIDGET_IDS: string[] = coreWidgetSeeds.map(([id]) => id);

function coreWidgets(): SignInWidgetDefinition[] {
  return coreWidgetSeeds.map(([id, type]) => { const entry = WIDGET_REGISTRY_BY_TYPE[type]; return { id, type, name: entry.name, security: entry.security, locked: entry.security === "SECURITY_MANDATORY", groupId: null, settings: structuredClone(entry.defaultSettings) }; });
}
const L = (x: number, y: number, w: number, h: number, z = 1): SignInWidgetLayout => ({ x, y, w, h, visible: true, z });
type MobileBlock = "auth" | "utility" | "place" | "world" | "news" | "insight";
const M = (order: MobileBlock[], flip = false): Record<string, SignInWidgetLayout> => {
  const layout: Record<string, SignInWidgetLayout> = {};
  let row = 1;
  for (const block of order) {
    if (block === "auth") { layout.auth = L(1, row, 4, 12, 3); row += 12; continue; }
    if (block === "utility") { layout.search = L(flip ? 3 : 1, row, 2, 2, 2); layout.status = L(flip ? 1 : 3, row, 2, 2); row += 2; continue; }
    if (block === "place") {
      layout[flip ? "weather" : "ibadan"] = L(1, row, 4, 2);
      layout[flip ? "ibadan" : "weather"] = L(1, row + 2, 4, 2);
      row += 4;
      continue;
    }
    if (block === "world") { layout.world = L(1, row, 4, 2); row += 2; continue; }
    if (block === "news") { layout.news = L(1, row, 4, 3); row += 3; continue; }
    layout.inspiration = L(flip ? 3 : 1, row, 2, 2);
    layout.motivation = L(flip ? 1 : 3, row, 2, 2);
    row += 2;
  }
  return layout;
};
const mobileLayouts: Record<string, Record<string, SignInWidgetLayout>> = {
  horizon: M(["auth", "utility", "place", "world", "news", "insight"]),
  editorial: M(["utility", "auth", "news", "place", "world", "insight"]),
  command: M(["utility", "auth", "place", "world", "news", "insight"], true),
  gallery: M(["place", "auth", "utility", "news", "world", "insight"]),
  atrium: M(["utility", "place", "auth", "world", "news", "insight"], true),
  focus: M(["auth", "place", "utility", "news", "world", "insight"]),
  nightfall: M(["utility", "auth", "world", "place", "news", "insight"], true),
  panorama: M(["utility", "auth", "world", "news", "place", "insight"]),
  vertical: M(["place", "utility", "auth", "news", "world", "insight"], true),
  duet: M(["utility", "auth", "place", "insight", "world", "news"], true),
};
const tabletLayout: Record<string, SignInWidgetLayout> = { auth: L(7, 1, 6, 9, 3), search: L(1, 1, 6, 1), ibadan: L(1, 2, 3, 3), weather: L(4, 2, 3, 3), world: L(1, 5, 6, 2), news: L(1, 7, 6, 3), inspiration: L(1, 10, 3, 2), motivation: L(4, 10, 3, 2), status: L(7, 10, 6, 2) };
const desktopLayouts: Record<string, Record<string, SignInWidgetLayout>> = {
  horizon: { search: L(1, 1, 8, 1), auth: L(9, 1, 4, 12, 3), ibadan: L(1, 2, 3, 3), weather: L(4, 2, 5, 3), world: L(1, 5, 8, 2), news: L(1, 7, 8, 3), inspiration: L(1, 10, 3, 2), motivation: L(4, 10, 3, 2), status: L(7, 10, 2, 2) },
  editorial: { news: L(1, 1, 7, 5), search: L(1, 6, 7, 1), auth: L(9, 1, 4, 12, 3), ibadan: L(1, 7, 3, 3), weather: L(4, 7, 4, 3), world: L(1, 10, 7, 2), inspiration: L(1, 12, 3, 1), motivation: L(4, 12, 2, 1), status: L(6, 12, 2, 1) },
  command: { status: L(1, 1, 3, 2), search: L(4, 1, 5, 1), auth: L(9, 1, 4, 12, 3), ibadan: L(1, 3, 4, 3), weather: L(5, 2, 4, 4), world: L(1, 6, 8, 2), news: L(1, 8, 8, 2), inspiration: L(1, 10, 3, 2), motivation: L(4, 10, 5, 2) },
  gallery: { ibadan: L(1, 1, 4, 4), news: L(5, 1, 4, 5), auth: L(9, 1, 4, 12, 3), search: L(1, 5, 4, 1), weather: L(1, 6, 4, 3), world: L(5, 6, 4, 3), status: L(1, 9, 4, 3), inspiration: L(5, 9, 2, 3), motivation: L(7, 9, 2, 3) },
  atrium: { auth: L(5, 1, 4, 12, 3), search: L(1, 1, 4, 1), ibadan: L(1, 2, 4, 4), weather: L(1, 6, 4, 3), world: L(9, 1, 4, 3), news: L(9, 4, 4, 4), inspiration: L(9, 8, 2, 2), motivation: L(11, 8, 2, 2), status: L(1, 9, 4, 2) },
  focus: { auth: L(1, 1, 4, 12, 3), search: L(5, 1, 8, 1), ibadan: L(5, 2, 4, 4), weather: L(9, 2, 4, 4), world: L(5, 6, 8, 2), news: L(5, 8, 8, 2), inspiration: L(5, 10, 3, 2), motivation: L(8, 10, 3, 2), status: L(11, 10, 2, 2) },
  nightfall: { search: L(5, 1, 8, 1), auth: L(1, 1, 4, 12, 3), ibadan: L(5, 2, 4, 4), status: L(9, 2, 4, 2), weather: L(9, 4, 4, 3), world: L(5, 7, 8, 2), news: L(5, 9, 8, 2), inspiration: L(5, 11, 4, 2), motivation: L(9, 11, 4, 2) },
  panorama: { search: L(1, 1, 9, 1), ibadan: L(1, 2, 3, 3), weather: L(4, 2, 6, 3), auth: L(10, 1, 3, 12, 3), world: L(1, 5, 9, 2), news: L(1, 7, 9, 3), inspiration: L(1, 10, 3, 2), motivation: L(4, 10, 3, 2), status: L(7, 10, 3, 2) },
  vertical: { auth: L(1, 1, 4, 12, 3), ibadan: L(5, 1, 4, 4), search: L(9, 1, 4, 1), weather: L(9, 2, 4, 3), world: L(5, 5, 8, 2), news: L(5, 7, 8, 3), inspiration: L(5, 10, 3, 2), motivation: L(8, 10, 3, 2), status: L(11, 10, 2, 2) },
  duet: { ibadan: L(1, 1, 4, 4), weather: L(5, 1, 4, 4), auth: L(9, 1, 4, 12, 3), search: L(1, 5, 8, 1), world: L(1, 6, 8, 2), news: L(1, 8, 8, 2), inspiration: L(1, 10, 3, 2), motivation: L(4, 10, 3, 2), status: L(7, 10, 2, 2) },
};
const styleDefaults: SignInStyleTokens = { brightness: 102, contrast: 108, saturation: 116, blur: 2, overlay: 58, vignette: 38, noise: 6, glass: 78, opacity: 88, border: 56, radius: 16, shadow: 64, glow: 42, headingSize: 30, bodySize: 14, iconSize: 18, spacing: 10, accent: "#38bdf8", gradient: "#2563eb", surfaceTint: "#071a38", borderTint: "#80c7ff", textAccent: "#eef7ff", buttonStyle: "Luminous Enterprise", inputStyle: "Inset Glass" };
export const DEFAULT_WIDGET_STYLE: SignInWidgetStyle = { transparent: false, opacity: 92, glass: 72, backdropBlur: 14, border: 46, radius: 16, shadow: 48, glow: 18, padding: 14, spacing: 10, headingSize: 18, bodySize: 13, iconSize: 18, alignment: "Left", density: "Comfortable", surfaceTint: "#071a38", borderTint: "#80c7ff", accent: "#38bdf8", backgroundImage: "", imageFit: "cover", focalX: 50, focalY: 50 };
const motionDefaults: MotionSetting = { level: "Standard", duration: 450, delay: 0, intensity: 50, easing: "ease-out", loop: false, direction: "normal", hoverOnly: false, idle: true, breakpointBehavior: "All" };
const logoLayout = (x: number, y: number, size: number) => ({ x, y, size, visible: true, fixed: false, layer: 12, opacity: 100, plate: "Glass" as const, border: 25, shadow: 42, glow: 24, effect: "None" as const });
function defaultBrand(): SignInBrandDefinition { return { approvedAsset: "/brand-assets/logo.svg", instances: [{ id: "primary-header-logo", role: "Primary Header Logo", layoutByBreakpoint: { Desktop: logoLayout(3, 3, 148), Tablet: logoLayout(3, 3, 132), Mobile: logoLayout(4, 3, 112), "4K": logoLayout(3, 3, 176) }, opacity: 100, plate: "Glass", border: 25, shadow: 42, glow: 24, accentLight: "#38bdf8", motion: { effect: "None", duration: 1600, delay: 0, intensity: 25, easing: "ease-in-out", loop: true, direction: "alternate", hoverOnly: false, idle: true } }] }; }
export const SIGNIN_EFFECTS = ["Fade", "Slide", "Scale", "Blur Reveal", "Stagger", "Glow", "Aurora", "Parallax", "AI Orb", "Weather Motion", "Clock Motion", "News Transition", "Auth Transition", "Focus Glow"];
function defaultMotion(): Record<string, MotionSetting> { return Object.fromEntries(SIGNIN_EFFECTS.map((name, index) => [name, { ...motionDefaults, level: name === "Parallax" ? "Off" : index % 3 === 0 ? "Standard" : "Subtle", loop: ["Aurora", "AI Orb", "Weather Motion", "Clock Motion"].includes(name) }])) as Record<string, MotionSetting>; }
function layoutFor(id: string): Record<SignInBreakpoint, Record<string, SignInWidgetLayout>> { const desktop = structuredClone(desktopLayouts[id] || desktopLayouts.horizon), fourK = structuredClone(desktop); return { Desktop: desktop, Tablet: structuredClone(tabletLayout), Mobile: structuredClone(mobileLayouts[id] || mobileLayouts.horizon), "4K": fourK }; }
function styleFor(id: string): SignInStyleTokens {
  const variants: Record<string, Partial<SignInStyleTokens>> = {
    horizon: { accent: "#38bdf8", gradient: "#2563eb", brightness: 108, blur: 1, overlay: 54, glow: 52 },
    editorial: { accent: "#a5b4fc", gradient: "#7c3aed", surfaceTint: "#111936", brightness: 104, blur: 1, radius: 10, overlay: 62, glow: 38 },
    command: { accent: "#22d3ee", gradient: "#1d4ed8", surfaceTint: "#03152f", brightness: 104, blur: 2, radius: 8, border: 76, overlay: 61, glow: 64 },
    gallery: { accent: "#c084fc", gradient: "#6d28d9", surfaceTint: "#160d34", brightness: 106, blur: 0, radius: 24, overlay: 48, glass: 66, glow: 58 },
    atrium: { accent: "#bfdbfe", gradient: "#3b82f6", surfaceTint: "#0b1d3b", brightness: 108, blur: 1, radius: 18, overlay: 46, opacity: 82 },
    focus: { accent: "#67e8f9", gradient: "#2563eb", surfaceTint: "#071a38", brightness: 103, blur: 2, radius: 20, overlay: 55, glass: 86, glow: 28 },
    nightfall: { accent: "#818cf8", gradient: "#a855f7", surfaceTint: "#090a28", brightness: 92, blur: 2, overlay: 76, glow: 72, border: 70 },
    panorama: { accent: "#0ea5e9", gradient: "#4f46e5", surfaceTint: "#071b38", brightness: 109, blur: 0, radius: 12, overlay: 49, glow: 48 },
    vertical: { accent: "#22d3ee", gradient: "#4338ca", surfaceTint: "#071735", brightness: 102, blur: 2, radius: 6, border: 72, overlay: 58, glow: 46 },
    duet: { accent: "#38bdf8", gradient: "#8b5cf6", surfaceTint: "#10143a", brightness: 102, blur: 2, radius: 16, overlay: 61, glow: 56 },
  };
  return { ...styleDefaults, ...(variants[id] || variants.horizon) };
}
export function defaultThemeDefinition(id: string): SignInThemeDefinition {
  const preset = signInPresets.find(item => item.id === id) || signInPresets[0];
  return { id: preset.id, name: preset.name, version: 23, kind: "Canonical", baseArtDirection: preset.composition, status: "Published", background: { presetId: preset.id, focalPoint: preset.focalPoint, fit: "cover", positionX: 50, positionY: 50 }, layoutByBreakpoint: layoutFor(preset.id), widgetDefinitions: coreWidgets(), widgetOrder: CANONICAL_WIDGET_IDS.slice(), groups: [], styleTokens: styleFor(preset.id), motionSettings: defaultMotion(), brand: defaultBrand(), authPlacement: "Theme-defined primary surface", searchPlacement: "Theme-defined intelligence entry", responsiveRules: ["No document scroll", "Initial authentication has zero internal scroll", "Canonical widgets remain directly visible", "Theme-specific mobile composition"], securityClassification: "PUBLIC_SAFE", schedule: null, auditMetadata: { updatedAt: "2026-09-13T00:00:00Z", updatedBy: "Owner-approved V23 correction", reason: "V23 source-integrity, least-privilege, brand-state and time correction" } };
}
export const defaultThemeDefinitions = Object.fromEntries(signInPresets.map(preset => [preset.id, defaultThemeDefinition(preset.id)]));
export const SIGNIN_THEME_STORAGE = "daenem-signin-themes-v17-final";
export const SIGNIN_PUBLISHED_STORAGE = "daenem-signin-published-v17-final";
export const SIGNIN_VERSIONS_STORAGE = "daenem-signin-theme-versions-v17-final";
export const SIGNIN_CURRENT_BUILDER_THEME_STORAGE = "daenem-signin-current-builder-theme-v17";

function clamp(value: unknown, min: number, max: number, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback; }
function safeColor(value: unknown, fallback: string) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback; }
function safeText(value: unknown, fallback = "") { return String(value ?? fallback).replace(/[<>]/g, "").slice(0, 600); }
function publicSecurity(value: unknown): value is SignInSecurity { return ["SECURITY_MANDATORY", "CANONICAL_THEME_REQUIRED", "OPTIONAL_PUBLIC"].includes(String(value)); }
function normalizeMotion(value: unknown, fallback: MotionSetting): MotionSetting {
  const raw: Partial<MotionSetting> = typeof value === "string" ? { level: value as MotionLevel } : value && typeof value === "object" ? value as Partial<MotionSetting> : {};
  const levels: MotionLevel[] = ["Off", "Subtle", "Standard", "Enhanced", "Custom"], easings: MotionSetting["easing"][] = ["ease", "ease-in", "ease-out", "ease-in-out", "linear"], directions: MotionSetting["direction"][] = ["normal", "reverse", "alternate"], behaviors: MotionSetting["breakpointBehavior"][] = ["All", "Desktop + 4K", "Desktop Only"];
  return { level: levels.includes(raw.level as MotionLevel) ? raw.level as MotionLevel : fallback.level, duration: clamp(raw.duration, 100, 8000, fallback.duration), delay: clamp(raw.delay, 0, 4000, fallback.delay), intensity: clamp(raw.intensity, 0, 100, fallback.intensity), easing: easings.includes(raw.easing as MotionSetting["easing"]) ? raw.easing as MotionSetting["easing"] : fallback.easing, loop: Boolean(raw.loop), direction: directions.includes(raw.direction as MotionSetting["direction"]) ? raw.direction as MotionSetting["direction"] : fallback.direction, hoverOnly: Boolean(raw.hoverOnly), idle: raw.idle !== false, breakpointBehavior: behaviors.includes(raw.breakpointBehavior as MotionSetting["breakpointBehavior"]) ? raw.breakpointBehavior as MotionSetting["breakpointBehavior"] : fallback.breakpointBehavior };
}
function sanitizeSettings(type: string, value: unknown) {
  const entry = WIDGET_REGISTRY_BY_TYPE[type], incoming = value && typeof value === "object" ? value as Record<string, unknown> : {}, result: Record<string, string | number | boolean> = structuredClone(entry.defaultSettings);
  for (const field of entry.settingsSchema) { const candidate = incoming[field.key]; if (candidate === undefined) continue; if (field.kind === "boolean") result[field.key] = Boolean(candidate); else if (field.kind === "number") result[field.key] = clamp(candidate, field.min ?? 0, field.max ?? 100, Number(result[field.key] || 0)); else if (field.kind === "select") result[field.key] = field.options?.includes(String(candidate)) ? String(candidate) : String(result[field.key] || field.options?.[0] || ""); else if (field.kind === "url") { const url = safePublicUrl(candidate); if (url) result[field.key] = url; } else result[field.key] = safeText(candidate, String(result[field.key] || "")); }
  return result;
}
function sanitizeWidget(raw: Partial<SignInWidgetDefinition>, fallback?: SignInWidgetDefinition): SignInWidgetDefinition | null {
  const type = safeText(raw.type || fallback?.type).slice(0, 60), entry = WIDGET_REGISTRY_BY_TYPE[type]; if (!entry || !publicSecurity(entry.security)) return null;
  const id = safeText(raw.id || fallback?.id || `${type}-${Date.now()}`).replace(/[^a-z0-9-]/gi, "-").slice(0, 64);
  const incomingStyle = raw.style || fallback?.style || DEFAULT_WIDGET_STYLE;
  const backgroundImage = typeof incomingStyle.backgroundImage === "string" && /^\/(reference-images\/signin|assets\/scenery|brand-assets)\/[a-z0-9._/-]+$/i.test(incomingStyle.backgroundImage) ? incomingStyle.backgroundImage : "";
  const style: SignInWidgetStyle = { transparent: Boolean(incomingStyle.transparent), opacity: clamp(incomingStyle.opacity, 10, 100, DEFAULT_WIDGET_STYLE.opacity), glass: clamp(incomingStyle.glass, 0, 100, DEFAULT_WIDGET_STYLE.glass), backdropBlur: clamp(incomingStyle.backdropBlur, 0, 40, DEFAULT_WIDGET_STYLE.backdropBlur), border: clamp(incomingStyle.border, 0, 100, DEFAULT_WIDGET_STYLE.border), radius: clamp(incomingStyle.radius, 0, 40, DEFAULT_WIDGET_STYLE.radius), shadow: clamp(incomingStyle.shadow, 0, 100, DEFAULT_WIDGET_STYLE.shadow), glow: clamp(incomingStyle.glow, 0, 100, DEFAULT_WIDGET_STYLE.glow), padding: clamp(incomingStyle.padding, 0, 40, DEFAULT_WIDGET_STYLE.padding), spacing: clamp(incomingStyle.spacing, 0, 32, DEFAULT_WIDGET_STYLE.spacing), headingSize: clamp(incomingStyle.headingSize, 14, 42, DEFAULT_WIDGET_STYLE.headingSize), bodySize: clamp(incomingStyle.bodySize, 12, 24, DEFAULT_WIDGET_STYLE.bodySize), iconSize: clamp(incomingStyle.iconSize, 12, 40, DEFAULT_WIDGET_STYLE.iconSize), alignment: (["Left", "Center", "Right"] as const).includes(incomingStyle.alignment as SignInWidgetStyle["alignment"]) ? incomingStyle.alignment : DEFAULT_WIDGET_STYLE.alignment, density: (["Comfortable", "Compact", "Spacious"] as const).includes(incomingStyle.density as SignInWidgetStyle["density"]) ? incomingStyle.density : DEFAULT_WIDGET_STYLE.density, surfaceTint: safeColor(incomingStyle.surfaceTint, DEFAULT_WIDGET_STYLE.surfaceTint), borderTint: safeColor(incomingStyle.borderTint, DEFAULT_WIDGET_STYLE.borderTint), accent: safeColor(incomingStyle.accent, DEFAULT_WIDGET_STYLE.accent), backgroundImage, imageFit: incomingStyle.imageFit === "contain" ? "contain" : "cover", focalX: clamp(incomingStyle.focalX, 0, 100, DEFAULT_WIDGET_STYLE.focalX), focalY: clamp(incomingStyle.focalY, 0, 100, DEFAULT_WIDGET_STYLE.focalY) };
  return { id, type, name: safeText(raw.name, entry.name) || entry.name, security: entry.security, locked: entry.security === "SECURITY_MANDATORY" || Boolean(raw.locked), groupId: raw.groupId ? safeText(raw.groupId).replace(/[^a-z0-9-]/gi, "-") : null, settings: sanitizeSettings(type, raw.settings), style };
}
function sanitizeLayout(value: unknown, fallback: SignInWidgetLayout, breakpoint: SignInBreakpoint, required: boolean) {
  const raw = value && typeof value === "object" ? value as Partial<SignInWidgetLayout> : {}, grid = SIGNIN_GRID[breakpoint], w = clamp(raw.w, 1, grid.columns, fallback.w), h = clamp(raw.h, 1, grid.rows, fallback.h);
  return { x: clamp(raw.x, 1, grid.columns - w + 1, fallback.x), y: clamp(raw.y, 1, grid.rows - h + 1, fallback.y), w, h, visible: required ? true : raw.visible !== false, z: clamp(raw.z, 0, 20, fallback.z) };
}
function sanitizeBrand(value: unknown, fallback: SignInBrandDefinition): SignInBrandDefinition {
  const raw = value && typeof value === "object" ? value as Partial<SignInBrandDefinition> : {};
  const effects: LogoMotionEffect[] = ["None", "Float", "Gentle Pulse", "Breathing Glow", "Light Sweep", "Reveal", "Parallax", "Hover Lift", "Depth Tilt", "Shimmer", "Particle Halo", "Custom"];
  const roles: SignInLogoInstance["role"][] = ["Primary Header Logo", "Auth Card Logo", "Hero Logo", "Corner Mark", "Background Watermark", "Subtle Footer Logo"];
  const incoming = Array.isArray(raw.instances) ? raw.instances : fallback.instances;
  const instances = incoming.slice(0, 12).map((candidate, index) => {
    const base = fallback.instances.find(item => item.id === candidate.id) || fallback.instances[0];
    const layouts = Object.fromEntries(SIGNIN_BREAKPOINTS.map(bp => {
      const source = candidate.layoutByBreakpoint?.[bp] || base.layoutByBreakpoint[bp];
      return [bp, { x: clamp(source.x, 0, 100, base.layoutByBreakpoint[bp].x), y: clamp(source.y, 0, 100, base.layoutByBreakpoint[bp].y), size: clamp(source.size, 32, 420, base.layoutByBreakpoint[bp].size), visible: source.visible !== false, fixed: Boolean(source.fixed), layer: clamp(source.layer, 0, 30, base.layoutByBreakpoint[bp].layer), opacity: clamp(source.opacity, 5, 100, candidate.opacity ?? base.opacity), plate: ["None", "Solid", "Glass"].includes(String(source.plate)) ? source.plate : candidate.plate ?? base.plate, border: clamp(source.border, 0, 100, candidate.border ?? base.border), shadow: clamp(source.shadow, 0, 100, candidate.shadow ?? base.shadow), glow: clamp(source.glow, 0, 100, candidate.glow ?? base.glow), effect: effects.includes(source.effect as LogoMotionEffect) ? source.effect : motion.effect ?? base.motion.effect }];
    })) as SignInLogoInstance["layoutByBreakpoint"];
    const motion = candidate.motion || base.motion;
    return { id: safeText(candidate.id, `logo-${index + 1}`).replace(/[^a-z0-9-]/gi, "-").slice(0, 64), role: roles.includes(candidate.role as SignInLogoInstance["role"]) ? candidate.role as SignInLogoInstance["role"] : base.role, layoutByBreakpoint: layouts, opacity: clamp(candidate.opacity, 5, 100, base.opacity), plate: ["None", "Solid", "Glass"].includes(String(candidate.plate)) ? candidate.plate as SignInLogoInstance["plate"] : base.plate, border: clamp(candidate.border, 0, 100, base.border), shadow: clamp(candidate.shadow, 0, 100, base.shadow), glow: clamp(candidate.glow, 0, 100, base.glow), accentLight: safeColor(candidate.accentLight, base.accentLight), motion: { effect: effects.includes(motion.effect as LogoMotionEffect) ? motion.effect as LogoMotionEffect : "None", duration: clamp(motion.duration, 100, 8000, base.motion.duration), delay: clamp(motion.delay, 0, 4000, base.motion.delay), intensity: clamp(motion.intensity, 0, 100, base.motion.intensity), easing: ["ease", "ease-in", "ease-out", "ease-in-out", "linear"].includes(String(motion.easing)) ? motion.easing as MotionSetting["easing"] : base.motion.easing, loop: Boolean(motion.loop), direction: ["normal", "reverse", "alternate"].includes(String(motion.direction)) ? motion.direction as MotionSetting["direction"] : base.motion.direction, hoverOnly: Boolean(motion.hoverOnly), idle: motion.idle !== false } };
  });
  return { approvedAsset: raw.approvedAsset === "/brand-assets/logo-mark.svg" ? "/brand-assets/logo-mark.svg" : "/brand-assets/logo.svg", instances: instances.length ? instances : fallback.instances };
}
export function sanitizeTheme(input: unknown, options: { rejectMissingCanonical?: boolean } = {}): SignInThemeDefinition {
  if (!input || typeof input !== "object") throw new Error("Theme definition must be a declarative object.");
  const raw = input as Partial<SignInThemeDefinition>, presetId = signInPresets.some(preset => preset.id === raw.background?.presetId) ? raw.background!.presetId : "horizon", base = defaultThemeDefinition(presetId), incomingWidgets = Array.isArray(raw.widgetDefinitions) ? raw.widgetDefinitions : [];
  const missing = coreWidgetSeeds.filter(([id, type]) => !incomingWidgets.some(widget => widget.id === id || widget.type === type));
  if (options.rejectMissingCanonical && missing.length) throw new Error(`Import rejected: missing canonical widgets ${missing.map(([, type]) => WIDGET_REGISTRY_BY_TYPE[type].name).join(", ")}.`);
  const widgetsById = new Map<string, SignInWidgetDefinition>();
  for (const required of coreWidgets()) { const incoming = incomingWidgets.find(widget => widget.id === required.id || widget.type === required.type); widgetsById.set(required.id, sanitizeWidget({ ...incoming, id: required.id, type: required.type, security: required.security, locked: required.locked }, required)!); }
  for (const widget of incomingWidgets) { if (CANONICAL_WIDGET_IDS.includes(widget.id)) continue; const safe = sanitizeWidget(widget); if (safe && !widgetsById.has(safe.id)) widgetsById.set(safe.id, safe); }
  const widgets = [...widgetsById.values()], order = [...new Set([...(Array.isArray(raw.widgetOrder) ? raw.widgetOrder.filter(id => widgetsById.has(id)) : []), ...CANONICAL_WIDGET_IDS, ...widgets.map(widget => widget.id)])];
  const rawLayouts = raw.layoutByBreakpoint || base.layoutByBreakpoint;
  const layoutByBreakpoint = Object.fromEntries(SIGNIN_BREAKPOINTS.map(breakpoint => { const source = rawLayouts[breakpoint] || {}; return [breakpoint, Object.fromEntries(widgets.map(widget => { const fallback = base.layoutByBreakpoint[breakpoint][widget.id] || { x: 1, y: SIGNIN_GRID[breakpoint].rows, w: Math.min(WIDGET_REGISTRY_BY_TYPE[widget.type].recommendedSize.w, SIGNIN_GRID[breakpoint].columns), h: Math.min(WIDGET_REGISTRY_BY_TYPE[widget.type].recommendedSize.h, SIGNIN_GRID[breakpoint].rows), visible: true, z: 1 }; return [widget.id, sanitizeLayout(source[widget.id], fallback, breakpoint, CANONICAL_WIDGET_IDS.includes(widget.id))]; }))]; })) as SignInThemeDefinition["layoutByBreakpoint"];
  const styles = raw.styleTokens || base.styleTokens;
  const styleTokens: SignInStyleTokens = { brightness: clamp(styles.brightness, 55, 125, base.styleTokens.brightness), contrast: clamp(styles.contrast, 70, 140, base.styleTokens.contrast), saturation: clamp(styles.saturation, 50, 150, base.styleTokens.saturation), blur: clamp(styles.blur, 0, 30, base.styleTokens.blur), overlay: clamp(styles.overlay, 25, 95, base.styleTokens.overlay), vignette: clamp(styles.vignette, 0, 100, base.styleTokens.vignette), noise: clamp(styles.noise, 0, 40, base.styleTokens.noise), glass: clamp(styles.glass, 0, 100, base.styleTokens.glass), opacity: clamp(styles.opacity, 55, 100, base.styleTokens.opacity), border: clamp(styles.border, 0, 100, base.styleTokens.border), radius: clamp(styles.radius, 0, 32, base.styleTokens.radius), shadow: clamp(styles.shadow, 0, 100, base.styleTokens.shadow), glow: clamp(styles.glow, 0, 100, base.styleTokens.glow), headingSize: clamp(styles.headingSize, 24, 64, base.styleTokens.headingSize), bodySize: clamp(styles.bodySize, 12, 18, base.styleTokens.bodySize), iconSize: clamp(styles.iconSize, 14, 28, base.styleTokens.iconSize), spacing: clamp(styles.spacing, 5, 22, base.styleTokens.spacing), accent: safeColor(styles.accent, base.styleTokens.accent), gradient: safeColor(styles.gradient, base.styleTokens.gradient), surfaceTint: safeColor(styles.surfaceTint, base.styleTokens.surfaceTint), borderTint: safeColor(styles.borderTint, base.styleTokens.borderTint), textAccent: safeColor(styles.textAccent, base.styleTokens.textAccent), buttonStyle: ["Luminous Enterprise", "Quiet Glass", "Solid Executive"].includes(String(styles.buttonStyle)) ? styles.buttonStyle : base.styleTokens.buttonStyle, inputStyle: ["Inset Glass", "Light Surface", "Technical Line"].includes(String(styles.inputStyle)) ? styles.inputStyle : base.styleTokens.inputStyle };
  const motionSettings = Object.fromEntries(SIGNIN_EFFECTS.map(effect => [effect, normalizeMotion(raw.motionSettings?.[effect], base.motionSettings[effect])])) as Record<string, MotionSetting>;
  const groupCandidates = Array.isArray(raw.groups) ? raw.groups : [], groups = groupCandidates.map(group => ({ id: safeText(group.id).replace(/[^a-z0-9-]/gi, "-").slice(0, 64), name: safeText(group.name, "Widget Group"), memberIds: [...new Set((group.memberIds || []).filter(id => widgetsById.has(id) && !CANONICAL_WIDGET_IDS.includes(id)))], locked: false })).filter(group => group.id && group.memberIds.length > 1);
  for (const widget of widgets) if (widget.groupId && !groups.some(group => group.id === widget.groupId && group.memberIds.includes(widget.id))) widget.groupId = null;
  const localPreview = raw.background?.localPreviewDataUrl, safePreview = typeof localPreview === "string" && /^data:image\/(png|jpeg|webp);base64,/i.test(localPreview) && localPreview.length < 2_800_000 ? localPreview : undefined;
  const assetUrl = typeof raw.background?.assetUrl === "string" && /^\/(reference-images\/signin|assets\/scenery)\/[a-z0-9._/-]+$/i.test(raw.background.assetUrl) ? raw.background.assetUrl : undefined;
  return { ...base, id: safeText(raw.id, base.id).replace(/[^a-z0-9-]/gi, "-").slice(0, 48) || base.id, name: safeText(raw.name, base.name) || base.name, version: clamp(raw.version, 1, 9999, base.version), kind: ["Canonical", "Custom", "Clone", "Variant"].includes(String(raw.kind)) ? raw.kind as SignInThemeDefinition["kind"] : base.kind, baseArtDirection: safeText(raw.baseArtDirection, base.baseArtDirection), status: ["Draft", "Review", "Published", "Archived"].includes(String(raw.status)) ? raw.status as SignInThemeDefinition["status"] : "Draft", background: { presetId, focalPoint: safeText(raw.background?.focalPoint, base.background.focalPoint), fit: raw.background?.fit === "contain" ? "contain" : "cover", positionX: clamp(raw.background?.positionX, 0, 100, base.background.positionX), positionY: clamp(raw.background?.positionY, 0, 100, base.background.positionY), localPreviewDataUrl: safePreview, localPreviewName: safePreview ? safeText(raw.background?.localPreviewName, "Local Design Lab Preview") : undefined, assetUrl, sourceProvenance: (["WEBFLOW", "STAFFPORTAL", "SITES", "CUSTOM"].includes(String(raw.background?.sourceProvenance)) ? raw.background?.sourceProvenance : assetUrl ? "STAFFPORTAL" : "SITES") as SignInThemeDefinition["background"]["sourceProvenance"] }, widgetDefinitions: widgets, widgetOrder: order, layoutByBreakpoint, groups, styleTokens, motionSettings, brand: sanitizeBrand(raw.brand, base.brand), securityClassification: "PUBLIC_SAFE", schedule: raw.schedule?.activateAt ? { activateAt: safeText(raw.schedule.activateAt), status: "PRODUCTION_INTEGRATION_PENDING" } : null, auditMetadata: { updatedAt: safeText(raw.auditMetadata?.updatedAt, new Date().toISOString()), updatedBy: safeText(raw.auditMetadata?.updatedBy, "Authorized Owner/Admin"), reason: safeText(raw.auditMetadata?.reason, "Sanitized declarative configuration") } };
}
export function validateImportedTheme(raw: string) {
  if (/javascript:|<script|onerror\s*=|onload\s*=/i.test(raw)) throw new Error("Import rejected: executable content is not allowed.");
  const parsed = JSON.parse(raw) as SignInThemeDefinition;
  if (!parsed?.id || !parsed?.layoutByBreakpoint || !parsed?.styleTokens || !Array.isArray(parsed.widgetDefinitions)) throw new Error("Import rejected: theme definition is incomplete.");
  for (const widget of parsed.widgetDefinitions) { const entry = WIDGET_REGISTRY_BY_TYPE[widget.type]; if (!entry || ["AUTHENTICATED_ONLY", "ADMIN_ONLY"].includes(entry.security)) throw new Error(`Import rejected: ${widget.name || widget.type} is not public-safe.`); if (widget.type === "customLink" && !safePublicUrl(widget.settings?.url)) throw new Error("Import rejected: custom links must use https, mailto or tel."); }
  return sanitizeTheme(parsed, { rejectMissingCanonical: true });
}
export function loadThemeCollection(): Record<string, SignInThemeDefinition> { if (typeof window === "undefined") return defaultThemeDefinitions; try { const saved = JSON.parse(localStorage.getItem(SIGNIN_THEME_STORAGE) || "{}") as Record<string, SignInThemeDefinition>; return { ...defaultThemeDefinitions, ...Object.fromEntries(Object.entries(saved).map(([id, theme]) => [id, sanitizeTheme(theme)])) }; } catch { return defaultThemeDefinitions; } }
export function persistTheme(theme: SignInThemeDefinition) { const safe = sanitizeTheme(theme), all = loadThemeCollection(); all[safe.id] = safe; localStorage.setItem(SIGNIN_THEME_STORAGE, JSON.stringify(all)); window.dispatchEvent(new CustomEvent("daenem-signin-theme-change", { detail: { id: safe.id } })); return safe; }
export function publishLocalTheme(theme: SignInThemeDefinition) { const safe = persistTheme({ ...theme, status: "Published", version: theme.version + 1, auditMetadata: { updatedAt: new Date().toISOString(), updatedBy: "Authorized Owner/Admin", reason: "Local design-lab publication" } }); localStorage.setItem(SIGNIN_PUBLISHED_STORAGE, safe.id); window.dispatchEvent(new CustomEvent("daenem-signin-theme-published", { detail: { id: safe.id } })); return safe; }
export function loadRuntimeTheme(fallbackId = "horizon") { if (typeof window === "undefined") return defaultThemeDefinition(fallbackId); const query = new URLSearchParams(location.search), requested = query.get("experience"), id = requested || localStorage.getItem(SIGNIN_PUBLISHED_STORAGE) || fallbackId; if (query.get("sourceTheme") === "canonical") return defaultThemeDefinition(signInPresets.some(preset => preset.id === id) ? id : fallbackId); return loadThemeCollection()[id] || defaultThemeDefinition(signInPresets.some(preset => preset.id === id) ? id : fallbackId); }
function widgetStyle(layout: Record<SignInBreakpoint, Record<string, SignInWidgetLayout>>, id: string): CSSProperties { const value = (breakpoint: SignInBreakpoint) => layout[breakpoint]?.[id] || { x: 1, y: 1, w: 1, h: 1, visible: false, z: 1 }, css: Record<string, string | number> = {}; for (const [prefix, breakpoint] of [["d", "Desktop"], ["t", "Tablet"], ["m", "Mobile"], ["k", "4K"]] as const) { const item = value(breakpoint); css[`--${prefix}-x`] = item.x; css[`--${prefix}-y`] = item.y; css[`--${prefix}-w`] = item.w; css[`--${prefix}-h`] = item.h; css[`--${prefix}-z`] = item.z; css[`--${prefix}-display`] = item.visible ? "block" : "none"; } return css as CSSProperties; }
function widgetDesignStyle(value?: SignInWidgetStyle): CSSProperties {
  const style = value || DEFAULT_WIDGET_STYLE;
  return { "--s21-widget-opacity": style.opacity / 100, "--s21-widget-glass": style.glass / 100, "--s21-widget-blur": `${style.backdropBlur}px`, "--s21-widget-border": `${style.border / 35}px`, "--s21-widget-radius": `${style.radius}px`, "--s21-widget-shadow-size": `${8 + style.shadow * .28}px`, "--s21-widget-glow-size": `${style.glow * .3}px`, "--s21-widget-padding": `${style.padding}px`, "--s21-widget-gap": `${style.spacing}px`, "--s21-widget-heading": `${style.headingSize}px`, "--s21-widget-body": `${style.bodySize}px`, "--s21-widget-icon": `${style.iconSize}px`, "--s21-widget-align": style.alignment.toLowerCase(), "--s21-widget-surface": style.transparent ? "transparent" : style.surfaceTint, "--s21-widget-border-tint": style.borderTint, "--s21-widget-accent": style.accent, "--s21-widget-background-image": style.backgroundImage ? `url(${style.backgroundImage})` : "none", "--s21-widget-background-fit": style.imageFit, "--s21-widget-background-position": `${style.focalX}% ${style.focalY}%` } as CSSProperties;
}
function brandStyle(instance: SignInLogoInstance): CSSProperties { const css: Record<string, string | number> = { "--logo-accent": instance.accentLight, "--logo-duration": `${instance.motion.duration}ms`, "--logo-delay": `${instance.motion.delay}ms`, "--logo-intensity": instance.motion.intensity / 100, "--logo-easing": instance.motion.easing, "--logo-iteration": instance.motion.loop ? "infinite" : "1", "--logo-direction": instance.motion.direction }; for (const [prefix, breakpoint] of [["d", "Desktop"], ["t", "Tablet"], ["m", "Mobile"], ["k", "4K"]] as const) { const item = instance.layoutByBreakpoint[breakpoint]; css[`--logo-${prefix}-x`] = `${item.x}%`; css[`--logo-${prefix}-y`] = `${item.y}%`; css[`--logo-${prefix}-size`] = `${item.size}px`; css[`--logo-${prefix}-display`] = item.visible ? "block" : "none"; css[`--logo-${prefix}-layer`] = item.layer; css[`--logo-${prefix}-position`] = item.fixed ? "fixed" : "absolute"; css[`--logo-${prefix}-opacity`] = item.opacity / 100; css[`--logo-${prefix}-border`] = `${item.border / 40}px`; css[`--logo-${prefix}-shadow`] = item.shadow / 100; css[`--logo-${prefix}-glow`] = item.glow / 100; } return css as CSSProperties; }
function motionLevel(theme: SignInThemeDefinition, effect: string) { return theme.motionSettings[effect]?.level || "Off"; }
export function SignInRuntimeRenderer({ theme: unsafeTheme, now, auth, search, preview = false }: { theme: SignInThemeDefinition; now: Date; auth: ReactNode; search: ReactNode; preview?: boolean }) {
  const theme = sanitizeTheme(unsafeTheme), preset = signInPresets.find(item => item.id === theme.background.presetId) || signInPresets[0], styles = theme.styleTokens, primaryMotion = theme.motionSettings.Fade || motionDefaults;
  const effect = (name: string) => theme.motionSettings[name] || motionDefaults;
  const vars = { "--s17-brightness": styles.brightness / 100, "--s17-contrast": styles.contrast / 100, "--s17-saturation": styles.saturation / 100, "--s17-blur": `${styles.blur}px`, "--s17-glass-blur": `${styles.blur * styles.glass / 100}px`, "--s17-overlay": styles.overlay / 100, "--s17-vignette": styles.vignette / 100, "--s17-noise": styles.noise / 100, "--s17-glass": styles.glass / 100, "--s17-opacity": styles.opacity / 100, "--s17-border": `${styles.border / 35}px`, "--s17-radius": `${styles.radius}px`, "--s17-shadow": styles.shadow / 100, "--s17-glow": styles.glow / 100, "--s17-heading": `${styles.headingSize}px`, "--s17-body": `${Math.max(12, styles.bodySize)}px`, "--s17-icon": `${styles.iconSize}px`, "--s17-gap": `${Math.max(5, styles.spacing)}px`, "--s17-accent": styles.accent, "--s17-gradient": styles.gradient, "--s17-surface": styles.surfaceTint, "--s17-border-tint": styles.borderTint, "--s17-text-accent": styles.textAccent, "--s17-motion-duration": `${primaryMotion.duration}ms`, "--s17-motion-delay": `${primaryMotion.delay}ms`, "--s17-motion-intensity": primaryMotion.intensity / 100, "--s17-motion-easing": primaryMotion.easing, "--s17-slide-distance": `${effect("Slide").intensity * .22}px`, "--s17-scale-start": Math.max(.72, 1 - effect("Scale").intensity / 500), "--s17-blur-start": `${effect("Blur Reveal").intensity * .16}px`, "--s17-stagger-delay": `${effect("Stagger").delay || Math.max(20, effect("Stagger").intensity * 1.2)}ms`, "--s17-aurora-duration": `${effect("Aurora").duration}ms`, "--s17-ai-duration": `${effect("AI Orb").duration}ms`, "--s17-weather-duration": `${effect("Weather Motion").duration}ms`, "--s17-clock-duration": `${effect("Clock Motion").duration}ms`, "--s17-news-duration": `${effect("News Transition").duration}ms`, "--s17-auth-duration": `${effect("Auth Transition").duration}ms`, "--s17-glow-strength": effect("Glow").intensity / 100, "--s17-focus-strength": effect("Focus Glow").intensity / 100, "--s17-parallax-scale": 1 + effect("Parallax").intensity / 1000, "--s17-custom-direction": primaryMotion.direction, "--s17-custom-iteration": primaryMotion.loop ? "infinite" : "1" } as CSSProperties;
  const background = theme.background.localPreviewDataUrl || theme.background.assetUrl || imageRuntimeFallback(preset), srcSet = theme.background.localPreviewDataUrl || theme.background.assetUrl ? undefined : imageSrcSet(preset);
  return <section className={`s17-runtime s17-${theme.baseArtDirection} ${preview ? "is-preview" : ""}`} data-theme-id={theme.id} data-rendered-theme-id={theme.id} data-theme-version={theme.version} data-button-style={styles.buttonStyle} data-input-style={styles.inputStyle} data-motion={motionLevel(theme, "Fade")} data-motion-slide={motionLevel(theme, "Slide")} data-motion-scale={motionLevel(theme, "Scale")} data-motion-blur={motionLevel(theme, "Blur Reveal")} data-motion-stagger={motionLevel(theme, "Stagger")} data-motion-glow={motionLevel(theme, "Glow")} data-motion-aurora={motionLevel(theme, "Aurora")} data-motion-parallax={motionLevel(theme, "Parallax")} data-motion-ai={motionLevel(theme, "AI Orb")} data-motion-weather={motionLevel(theme, "Weather Motion")} data-motion-clock={motionLevel(theme, "Clock Motion")} data-motion-news={motionLevel(theme, "News Transition")} data-motion-auth={motionLevel(theme, "Auth Transition")} data-motion-focus={motionLevel(theme, "Focus Glow")} data-fade-scope={effect("Fade").breakpointBehavior} data-weather-scope={effect("Weather Motion").breakpointBehavior} data-clock-scope={effect("Clock Motion").breakpointBehavior} data-news-scope={effect("News Transition").breakpointBehavior} data-auth-scope={effect("Auth Transition").breakpointBehavior} data-ai-scope={effect("AI Orb").breakpointBehavior} data-fade-hover={effect("Fade").hoverOnly ? "true" : "false"} data-weather-hover={effect("Weather Motion").hoverOnly ? "true" : "false"} data-clock-hover={effect("Clock Motion").hoverOnly ? "true" : "false"} data-news-hover={effect("News Transition").hoverOnly ? "true" : "false"} data-auth-hover={effect("Auth Transition").hoverOnly ? "true" : "false"} data-motion-idle={primaryMotion.idle ? "true" : "false"} style={vars}>
    <figure className="s17-environment"><picture><img src={background} srcSet={srcSet} sizes="100vw" alt={`Illustrative environment: ${preset.city}; not a Daenem facility`} style={{ objectFit: theme.background.fit, objectPosition: `${theme.background.positionX}% ${theme.background.positionY}%` }} fetchPriority="high" /></picture></figure><div className="s17-scrim" /><div className="s17-noise" />
    <div className="s19-tech-layer" aria-hidden="true"><span className="s19-horizon-line" /><span className="s19-axis-line" /><i className="s19-node node-a" /><i className="s19-node node-b" /><i className="s19-node node-c" /><b className="s19-orbital"><i /><i /><i /></b></div>
    <div className="s21-brand-layer" aria-label="Approved Daenem brand objects">{theme.brand.instances.map(instance => <figure key={instance.id} className={`s21-brand-object plate-${instance.plate.toLowerCase()} motion-${instance.motion.effect.toLowerCase().replace(/[^a-z0-9]+/g, "-")} ${instance.motion.hoverOnly ? "hover-only" : ""}`} data-logo-instance={instance.id} data-logo-role={instance.role} data-logo-effect={instance.motion.effect} style={brandStyle(instance)}><img src={theme.brand.approvedAsset} alt="Daenem approved logo"/></figure>)}</div>
    <div className="s19-theme-signature" aria-hidden="true"><span>DAENEM / INTELLIGENCE</span><i /><small>{theme.name.toUpperCase()} · V23</small></div>
    <div className="s17-grid" aria-label={`${theme.name} sign-in composition`}>{theme.widgetOrder.map((id, index) => { const definition = theme.widgetDefinitions.find(widget => widget.id === id); if (!definition || !publicSecurity(definition.security)) return null; return <div key={id} className={`s17-widget s17-widget-${id} s17-type-${definition.type} ${definition.groupId ? "is-grouped" : ""}`} data-widget-id={id} data-widget-type={definition.type} data-widget-order={index + 1} data-security-classification={definition.security} data-group-id={definition.groupId || undefined} data-widget-transparent={definition.style?.transparent ? "true" : "false"} data-widget-density={definition.style?.density || "Comfortable"} style={{ ...widgetStyle(theme.layoutByBreakpoint, id), ...widgetDesignStyle(definition.style) }}><RegisteredSignInWidget id={id} type={definition.type} now={now} auth={auth} search={search} settings={definition.settings} themeName={theme.name} /></div>; })}</div>
    <span className="s17-art-direction">{theme.name}<small>{theme.baseArtDirection} · Public-Safe Experience</small></span>
  </section>;
}
