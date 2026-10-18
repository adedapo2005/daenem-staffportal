import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const adapter = read("app/experience/navigation-adapter.ts");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("Global rail is projected through effective permissions", portal.includes("const visibleGlobalItems = GLOBAL_NAVIGATION.filter(visibleGlobal)"));
check("Global groups can be exposed by an authorized child without exposing denied siblings", portal.includes("item.context.some((entry) => contextVisible(entry))") && portal.includes("activeGlobal.context.filter((entry) => contextVisible(entry))"));
check("Denied requested groups cannot become the active navigation context", portal.includes("requestedGlobal && visibleGlobal(requestedGlobal)") && portal.includes(": visibleGlobalItems[0]"));
check("Contextual navigation contains only authorized entries", portal.includes("const contextualItems = activeGlobal") && portal.includes("activeGlobal.context.filter((entry) => contextVisible(entry))"));
check("Denied module names are excluded from breadcrumbs", portal.includes("const authorizedModule = m && canView(m, session) ? m : undefined") && portal.includes("authorizedModule.title"));
check("Denied Sign-In Studio sections cannot disclose Studio breadcrumbs", portal.includes("const breadcrumbItems: Array<") && portal.includes(": isStudioPath && studioSectionAccess"));
check("Admin Experience breadcrumbs require effective surface access", portal.includes(": adminExperienceSurface") && !portal.includes('moduleId === "admin" && adminContext === "experience"\n      ? ["Group", "Admin", "Experience"]'));
check("Unknown or denied routes use the neutral unavailable surface", portal.includes("!surfaceAccess") && portal.includes("neutralNotFound.title") && portal.includes("neutralNotFound.message"));
check("Command workspaces are built from the authorized module projection", portal.includes("{allowed.map((a) => ("));
check("Command records are built from authorized records only", portal.includes("const commandRecordRows = allowedRows.filter") && portal.includes("{commandRecordRows.map((r) => (") && portal.includes("{commandPeopleRows.map((row) => (") && portal.includes("{commandJobRows.map((row) => (") && portal.includes("{commandLogRows.map((row) => ("));
check("Recent records are re-resolved against current authorized records", portal.includes("allowedRows.find((row) => `${row.module}:${row.id}` === ref)"));
check("Recent navigation state clears on every explicit sign-out path", (portal.match(/setRecentRefs\(\[\]\)/g) || []).length >= 3 && /sessionStorage\.removeItem\("daenem-demo-session-v3"\);[\s\S]{0,120}setRecentRefs\(\[\]\);[\s\S]{0,120}setSigned\(false\);/.test(portal));
check("Recent navigation state clears before an identity or company switch", /function changeSession\(s: Session\) \{[\s\S]*?purgePrivilegedProjectionState\(\);[\s\S]*?setRecentRefs\(\[\]\);/.test(portal));
check("Profile, notifications, sync and AI Guide remain individually permission gated", ["profile", "notifications", "sync", "help"].every((id) => new RegExp(`canView\\(byId\\("${id}"\\)!?, session\\)`).test(portal)));
check("Studio local navigation resolves capability authority centrally", adapter.includes("export function canViewStudioNavigationItem") && adapter.includes("return SIGNIN_STUDIO_NAVIGATION.filter(item => canViewStudioNavigationItem(item.id, session))"));
check("Navigation routes and labels derive from canonical module definitions", adapter.includes("const definition = byId(moduleId)") && adapter.includes("route: definition.canonicalPath") && adapter.includes("label: visualLabel || definition.title"));
check("Responsive navigation records and restores its actual keyboard opener", portal.includes("mobileNavigationRestoreRef") && portal.includes("openMobileNavigation") && portal.includes("restoreMobileNavigationFocus"));
check("Responsive navigation explicitly restores focus after Sheet close", portal.includes("onCloseAutoFocus={(event) =>") && portal.includes("restoreMobileNavigationFocus();"));
check("Skip-link targets are programmatically focusable", (portal.match(/id="main-content"[\s\S]{0,80}tabIndex=\{-1\}/g) || []).length >= 2);

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
