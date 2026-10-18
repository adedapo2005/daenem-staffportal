import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const admin = read("app/experience/global-shell-admin.tsx");
const css = read("app/experience/global-shell-admin.css") + read("app/experience/global-shell-weather-admin.css");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("Global Shell has a canonical third-level Admin route", portal.includes('parts[2] === "global-shell"') && portal.includes('"/admin/experience/global-shell"'));
check("Global Shell authorization requires Admin manage authority", portal.includes('canAct(adminModule, session, "manage")'));
check("Global Shell deep links fail closed independently", portal.includes("const surfaceAccess = isGlobalShellPath") && portal.includes("? globalShellAccess"));
check("Unauthorized breadcrumbs remain neutral", portal.includes("const breadcrumbItems:") && portal.includes('? [{ label: "Workspace" }]'));
check("Authorized breadcrumbs include Global Shell", portal.includes('...(isGlobalShellPath ? [{ label: "Global Shell" }] : [])'));
check("Context navigation omits Global Shell without authority", portal.includes("{globalShellAccess && (") && portal.includes("<span>Global Shell</span>"));
check("Experience hub omits Global Shell without Admin manage authority", portal.includes('canAct(byId("admin")!, session, "manage")') && portal.includes("action: onOpenGlobalShell"));
check("Role changes remove unauthorized Global Shell routes", portal.includes("isGlobalShellPath &&") && portal.includes('canAct(byId("admin")!, nextSession, "manage")'));
check("Global Shell renders only inside the authorized Experience surface", portal.includes("isGlobalShellPath ? (") && portal.includes("<GlobalShellAdmin"));
check("Navigation controls cover collapse and pinned defaults", admin.includes("Default desktop state") && admin.includes("Pin Home by default"));
check("Navigation exposure is contract locked to Zero Disclosure", admin.includes("Module exposure") && admin.includes("ZERO DISCLOSURE"));
check("AI Search controls cover enablement and explicit prediction acceptance", admin.includes("AI-assisted search") && admin.includes("Ghost-text predictions") && admin.includes("explicit action is always required"));
check("AI Search controls cover source-safe history and shortcut", admin.includes("Ctrl/Cmd+K shortcut") && admin.includes("History policy") && admin.includes("role or company scope change"));
check("AI orb intensity offers the approved hierarchy", admin.includes("AI orb intensity") && admin.includes('["Off", "Subtle", "Balanced", "Enhanced"]'));
check("Top Bar controls independently cover all approved utilities", ["Help & Support", "Notifications", "Current Version", "Weather"].every((label) => admin.includes(label)));
check("Notification control does not imply freshness", admin.includes("No count or pulse without authoritative freshness"));
check("Weather preview is seeded from the current organization unit", portal.includes("organizationTemperatureUnit={ORGANIZATION_WEATHER_UNIT}") && admin.includes('organizationTemperatureUnit: "F" | "C"') && admin.includes("temperature: organizationTemperature"));
check("Google Weather is named as the approved primary provider", admin.includes('data-weather-provider="google"') && admin.includes("Google Weather API") && admin.includes("Approved primary provider"));
check("Weather requires provider configuration rather than implying a live connection", admin.includes('data-provider-state="configuration-required"') && admin.includes("Not connected") && admin.includes("CONFIGURATION REQUIRED"));
check("Weather credential action is protected and unavailable without backend support", admin.includes("Configure or replace credential") && admin.includes("Protected backend credential contract required"));
check("Weather test action is unavailable without an authoritative connection-test contract", admin.includes("Test connection") && admin.includes("Provider connection-test contract required"));
check("Weather UI never requests or persists a key in the frontend", admin.includes("API keys are never requested, displayed or stored in frontend source, browser storage or logs") && !/localStorage|sessionStorage|type=["']password|apiKey|api_key/i.test(admin));
check("Weather exposes truthful location and refresh policy boundaries", admin.includes("Location policy") && admin.includes("Refresh policy") && admin.includes("No polling interval is asserted"));
check("Weather exposes neutral freshness and quota states", admin.includes("No observation available") && admin.includes("No authoritative quota data") && admin.includes("Freshness & quota"));
check("Weather never fabricates values or location", admin.includes("No weather values, location, observation time, freshness or quota state will be fabricated"));
check("Exact weather backend dependencies are recorded in-product", ["Credential vault intake", "connection testing", "Google Weather runtime", "scoped location policy", "refresh policy", "freshness telemetry", "quota telemetry"].every((term) => admin.includes(term)));
check("Motion controls offer all approved levels", admin.includes("Organization motion level") && admin.includes('["Off", "Subtle", "Balanced", "Enhanced"]'));
check("Reduced Motion overrides shell animation", admin.includes("Reduced Motion always overrides") && css.includes("@media(prefers-reduced-motion:reduce)"));
check("Version controls include widget, history and release notes", admin.includes("Version widget") && admin.includes("Version history visibility") && admin.includes("Release-note visibility"));
check("Version animation is tied to authoritative newness", admin.includes("genuinely newer authoritative version"));
check("Preview changes are explicitly unsaved", admin.includes("Unsaved preview changes on this page") && admin.includes("Preview changes are not saved or applied"));
check("Organization Apply remains disabled", admin.includes('<Btn disabled aria-disabled="true"') && admin.includes("Authoritative persistence contract required"));
check("No persistence endpoint is invented", !/fetch\(|axios\.(post|put|patch|delete)|useMutation|\/api\/[^"']*shell/i.test(admin));
check("Exact backend dependency is recorded in-product", admin.includes("read/write, validation, versioning, audit and rollback contracts"));
check("Responsive controls reflow before compression", css.includes("@media(max-width:960px)") && css.includes("@media(max-width:620px)") && css.includes("grid-template-columns:1fr"));
check("Visually hidden toggle inputs cannot widen narrow viewports", css.includes(".gs-toggle>input{position:absolute;width:1px;height:1px") && css.includes("clip-path:inset(50%)"));
check("Weather provider controls reflow on mobile", css.includes(".gs-provider-facts") && css.includes("grid-template-columns: 1fr") && css.includes(".gs-provider-actions") && css.includes("flex-direction: column"));
check("Active preview styling stays blue rather than semantic green", css.includes("background:#3778d1") && !/#(?:0[0-9a-f]|1[0-9a-f]|2[0-9a-f])(?:[0-9a-f]{4})?green/i.test(css));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
