import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const adapter = read("app/experience/navigation-adapter.ts");
const css = read("app/experience/navigation-v24.css");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

const requiredAreas = [
  '"Home"',
  '"My Work"',
  '"People"',
  '"Businesses"',
  '"Finance"',
  '"Communications"',
  '"Intelligence"',
  '"Tools"',
  '"Admin"',
];

check("Approved global areas are present", requiredAreas.every((label) => adapter.includes(label)));
check("Legacy business-by-business primary groups are removed", !/group\("(bakery|printing|technology|auto|homes|logistics|construction|jobs)"/.test(adapter));
check("All destinations still derive route and permission identity canonically", adapter.includes("route: definition.canonicalPath") && adapter.includes("permissionModuleId: definition.id"));
check("Global groups fail closed through effective permission projection", portal.includes("const visibleGlobalItems = GLOBAL_NAVIGATION.filter(visibleGlobal)") && portal.includes("item.context.some((entry) => contextVisible(entry))"));
check("Context destinations fail closed independently", portal.includes("activeGlobal.context.filter((entry) => contextVisible(entry))"));
check("Admin area requires authorized Admin or Studio access", portal.includes('item.id === "admin"') && portal.includes("studioAccess"));
check("Pinned areas are derived only from the authorized global projection", portal.includes("const pinnedGlobalItems = visibleGlobalItems.filter((item) => item.pinned)"));
check("Pinned shortcuts do not duplicate the contextual aria-current marker", !/key={`pinned-\$\{item\.id\}`}[\s\S]{0,180}aria-current/.test(portal));
check("Recent items are re-resolved from authorized records", portal.includes("recentRows.slice(0, 3)") && portal.includes("allowedRows.find((row) => `${row.module}:${row.id}` === ref)"));
check("Denied requested areas cannot become active context", portal.includes("requestedGlobal && visibleGlobal(requestedGlobal)"));
check("Collapsed rail is explicit and keyboard-labelled", portal.includes("shellNavCollapsed") && portal.includes('aria-label={shellNavCollapsed ? "Expand navigation" : "Collapse navigation"}'));
check("Collapsed selection reveals the contextual panel", portal.includes("if (shellNavCollapsed) setShellNavCollapsed(false)"));
check("Layout preferences cannot replace the navigation architecture", !portal.includes('nav-${prefs.navigation.toLowerCase()}') && portal.includes('data-navigation-contract="global-shell-v2"'));
check("Global and contextual levels remain direct siblings", portal.includes('<nav className="p-global-nav"') && portal.includes('<nav className="p-context-nav"'));
check("Primary navigation omits prototype explanation copy", !["Flexible work zones", "Inspector ready", "Active work", "Wide data canvas"].some((text) => portal.includes(text)));
check("Active navigation uses blue rather than semantic green", css.includes("linear-gradient(135deg, #2b73d0, #3452bd)") && !/button\.active[^}]+#(?:[0-5][0-9a-f])?(?:[0-9a-f]{4})?green/i.test(css));
check("Expanded desktop shell is shared by Sign-In Studio", css.includes(".p-app.signin-studio-shell .p-sidebar") && css.includes("width: 20rem"));
check("Collapsed desktop shell becomes a slim icon rail", css.includes(".p-app.p-shell-nav-collapsed .p-sidebar") && css.includes("width: 5.25rem"));
check("Reduced Motion disables shell navigation transitions", css.includes("@media (prefers-reduced-motion: reduce)") && css.includes(".p-global-nav button"));
check("Mobile drawer reuses the same authorized navigation tree", portal.includes("{nav}") && css.includes(".p-mobile-nav .p-adaptive-navigation"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
