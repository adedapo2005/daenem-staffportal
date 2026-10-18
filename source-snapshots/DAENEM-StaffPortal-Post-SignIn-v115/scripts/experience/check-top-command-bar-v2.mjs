import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const css = read("app/experience/navigation-v24.css");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

const topbarStart = portal.indexOf('data-topbar-contract="global-shell-v2"');
const topbarEnd = portal.indexOf("</header>", topbarStart);
const topbar = portal.slice(topbarStart, topbarEnd);

check("One explicit top command bar contract is rendered", topbarStart > 0 && (portal.match(/data-topbar-contract="global-shell-v2"/g) || []).length === 1);
check("Command search is the central top-bar region", topbar.includes('className="p-topbar-command-zone"') && topbar.indexOf("p-topbar-command-zone") < topbar.indexOf("p-topbar-utilities"));
check("Ask DAENEM is the primary command label", topbar.includes("<strong>Ask DAENEM</strong>") && topbar.includes("Search your work areas and records"));
check("Command trigger remains an accessible button", topbar.includes('aria-label="Open Ask DAENEM search"') && topbar.includes("onClick={openCommandPalette}"));
check("Global Ctrl or Command K shortcut remains connected", portal.includes("(e.metaKey || e.ctrlKey) && e.key === \"k\"") && portal.includes("openCommandPalette()"));
check("AI orb consumes the truthful search-state projection", topbar.includes('data-ai-state={effectiveAiSearchState}'));
check("Prediction details remain inside the search surface", !topbar.includes("p-ai-ghost-text") && !topbar.includes("commandPredictionSuffix"));
check("Search results continue to derive from authorized modules", portal.includes("{allowed.map((a) => (") && portal.includes('CommandGroup heading="Workspaces"'));
check("Search records continue to derive from authorized records", portal.includes("const commandRecordRows = allowedRows.filter") && portal.includes("{commandRecordRows.map((r) => (") && portal.includes('CommandGroup heading="Records"'));
check("Search exposes permission-composed business areas", portal.includes("const commandBusinessAreas") && portal.includes('CommandGroup heading="Business Areas"'));
check("Search exposes authorized employees jobs and logs", portal.includes('CommandGroup heading="Employees & People"') && portal.includes('CommandGroup heading="Jobs & Recruitment"') && portal.includes('CommandGroup heading="Logs & Security"'));
check("Search exposes one plain-language Staff Portal release label", portal.includes('CommandGroup heading="Staff Portal Release"') && portal.includes("Staff Portal Release · {CURRENT_SAVED_SITE_VERSION}") && !portal.includes("Open Truthful Saved Version History"));
check("Search input uses plain workplace language", portal.includes('placeholder="Search work areas, records or actions…"') && !portal.includes('placeholder="Search authorized modules'));
check("Search guidance explains the result without permission architecture jargon", portal.includes("Suggestions match the work available to you.") && !portal.includes("Suggestions are composed from your current role and company scope."));
check("Business area suggestions use plain action language", portal.includes("Open a work area available to you") && !portal.includes("Open An Authorized Workspace"));
check("Help remains independently permission gated", topbar.includes('canView(byId("help"), session)') && topbar.includes('label="Open Help and Support"'));
check("Notifications remain independently permission gated", topbar.includes('canView(byId("notifications"), session)') && topbar.includes('label="Open Notifications"'));
check("Profile remains independently permission gated", topbar.includes('canView(byId("profile"), session)') && topbar.includes('aria-label="Open My Profile"'));
check("Sync remains independently permission gated", topbar.includes('canView(byId("sync"), session)') && topbar.includes('label="Open Sync Status"'));
check("Utility controls have an accessible group label", topbar.includes('role="group"') && topbar.includes('aria-label="Workspace utilities"'));
check("Top bar uses machine-readable truthful version and weather projections", topbar.includes("data-saved-version={CURRENT_SAVED_SITE_VERSION}") && topbar.includes('data-provider-state="required"') && topbar.includes("data-weather-unit={weatherUnit}") && topbar.includes("—°{weatherUnit}"));
check("Desktop uses one cohesive three-region grid", css.includes("grid-template-columns: minmax(8rem, .42fr) minmax(18rem, 1.6fr) auto") && css.includes(".p-topbar-command-zone"));
check("AI search receives the strongest restrained emphasis", css.includes("width: min(100%, 48rem)") && css.includes("0 0 22px #4979d912"));
check("Active shell styling remains blue and neutral", css.includes("border: 1px solid #9dbfe8") && css.includes("color: #315ed6"));
check("Offline and error orb states are visually distinct", css.includes('[data-ai-state="offline"]') && css.includes('[data-ai-state="error"]'));
check("Tablet and mobile reflow before compression", css.includes("@media (max-width: 1024px)") && css.includes("@media (max-width: 767px)") && css.includes("grid-column: 1 / -1"));
check("Small phones retain search without horizontal command clipping", css.includes("@media (max-width: 430px)") && css.includes("grid-template-columns: auto minmax(0, 1fr)"));
check("Reduced Motion disables top-bar transitions", css.includes(".p-ai-orb,") && css.includes("animation: none !important; transition: none !important"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
