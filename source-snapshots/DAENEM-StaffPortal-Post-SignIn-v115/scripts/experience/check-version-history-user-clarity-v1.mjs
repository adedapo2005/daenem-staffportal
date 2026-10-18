import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const version = read("app/experience/site-version.ts");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

const drawerStart = portal.indexOf('data-version-history-contract="plain-language-release-details"');
const drawerEnd = portal.indexOf(') : drawer === "weather"', drawerStart);
const releaseDrawer = portal.slice(drawerStart, drawerEnd);

check("One shared release value powers every staff-facing release label", portal.includes('import { CURRENT_SAVED_SITE_VERSION } from "./site-version"') && (portal.match(/CURRENT_SAVED_SITE_VERSION/g) || []).length >= 6);
check("Release fallback is held in one source module", (version.match(/"V\d+"/g) || []).length === 1 && version.includes("CURRENT_SIGNIN_STUDIO_VERSION = CURRENT_SAVED_SITE_VERSION"));
check("Release label is source-owned instead of ambient build state", /CURRENT_SAVED_SITE_VERSION = "V\d+"/.test(version) && !version.includes("__DAENEM_SAVED_VERSION__"));
check("Top bar opens Release Details in plain language", portal.includes('aria-label={`Open Release Details, current ${CURRENT_SAVED_SITE_VERSION}`}'));
check("Release Details participates in the shared focus-return contract", portal.includes('onClick={() => openDrawer("version")}') && portal.includes("restoreDrawerFocus();"));
check("Command search uses the same Staff Portal Release label", portal.includes('CommandGroup heading="Staff Portal Release"') && portal.includes("Staff Portal Release · {CURRENT_SAVED_SITE_VERSION}"));
check("Release drawer names the current Staff Portal release", releaseDrawer.includes("Current Staff Portal Release") && releaseDrawer.includes("{CURRENT_SAVED_SITE_VERSION}"));
check("Release drawer explains availability without engineering concepts", releaseDrawer.includes("This is the Staff Portal release currently available to you."));
check("Unavailable notes use a direct neutral message", releaseDrawer.includes("Detailed release notes are not available yet."));
check("Staff release drawer omits engineering provenance terms", !/source commit|project identifier|deployment|metadata source|canonical|API/i.test(releaseDrawer));
check("Context navigation uses a plain-language heading", portal.includes("<strong>Available Pages</strong>") && !portal.includes("<strong>Authorized Destinations</strong>"));
check("Ask DAENEM uses staff-facing search language", portal.includes("Search your work areas and records") && portal.includes("Find work areas and records available to you.") && !portal.includes("Search your authorized workspaces"));
check("Legacy confusing release phrases are absent", !portal.includes("Open Truthful Saved Version History") && !portal.includes("Release history source required") && !portal.includes("Current saved version"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
