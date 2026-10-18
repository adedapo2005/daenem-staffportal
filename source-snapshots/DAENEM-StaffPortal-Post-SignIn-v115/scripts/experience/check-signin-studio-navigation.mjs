import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const studio = read("app/experience/signin-studio-v20.tsx");
const adapter = read("app/experience/navigation-adapter.ts");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check(
  "Admin exposes the canonical Experience hub only through Sign-In Studio authority",
  adapter.includes('permissionModuleId: "signin-design"') &&
    adapter.includes('route: ADMIN_EXPERIENCE_ROUTE'),
);
check(
  "The Owner path is Admin to Experience to Sign-In Studio",
  portal.includes('activeGlobal?.id === "admin"') &&
    portal.includes('adminContext === "experience"') &&
    portal.includes('<span>Sign-In Studio</span>'),
);
check(
  "Studio routes use the canonical permission adapter",
  adapter.includes("export function canViewStudioNavigationItem") &&
    portal.includes("const studioSectionAccess =") &&
    portal.includes("canViewStudioNavigationItem(studioSection, session)"),
);
check(
  "Denied deep links resolve to a neutral unavailable surface",
  portal.includes("!surfaceAccess") &&
    portal.includes("neutralNotFound.title") &&
    portal.includes("neutralNotFound.message"),
);
check(
  "Command results contain only assigned Studio capabilities",
  portal.includes("studioNavigationFor(session)") &&
    portal.includes('.filter((item) => item.id !== "Home")'),
);
check(
  "Studio navigation contains only assigned groups",
  studio.includes("const visibleNavigationGroups = studioNavigationGroupOrder().filter") &&
    studio.includes("visibleSections.some((item) => item.group === group)") &&
    studio.includes("{visibleNavigationGroups.map((group) => ("),
);
check(
  "Denied transient sections fail closed to Home",
  studio.includes('const effectiveSection = canOpenSection(section) ? section : "Home"') &&
    studio.includes("data-studio-section={effectiveSection}"),
);
check(
  "All section rendering uses the effective authorized section",
  !/\{section === "(?:Home|Themes|Preview|Editor|Widgets|Variants|Custom|Brand|AI|Copy|Style|Motion|History|Compare|Devices|Contract)"/.test(
    studio,
  ) &&
    (studio.match(/\{effectiveSection ===/g) || []).length >= 16,
);
check(
  "Saved-version metadata requires Versions capability",
  studio.includes("canOpenVersions ? CURRENT_SIGNIN_STUDIO_VERSION : undefined") &&
    studio.includes("{canOpenVersions && ("),
);
check(
  "Integration metadata requires Contract capability",
  studio.includes("canOpenContract ? SHARED_SIGNIN_CONFIG_STATUS : undefined"),
);
check(
  "Active theme metadata requires Themes or Preview capability",
  (studio.match(/canOpenThemes \|\| canOpenPreview/g) || []).length >= 4,
);
check(
  "Theme identifiers remain hidden without Themes capability",
  studio.includes("canOpenThemes ? STAFFPORTAL_DEFAULT_THEME_ID : undefined") &&
    studio.includes('canOpenThemes ? "V16" : undefined'),
);
check(
  "Widget users cannot see an unassigned Layout action",
  studio.includes("{entry && canOpenLayout && ("),
);
check(
  "Studio section changes are capability checked",
  studio.includes("if (!canOpenSection(next)) return;"),
);
check(
  "Denied query sections are replaced with the authorized Home path",
  studio.includes('const next = canOpenSection(requested) ? requested : "Home"') &&
    studio.includes('studioSectionPath("Home")'),
);
check(
  "Experience hub description does not enumerate unassigned capabilities",
  portal.includes("Open only the Sign-In Studio capabilities assigned to this session.") &&
    !portal.includes("Themes, layout, widgets, brand, responsive behavior and governed AI proposals."),
);
check(
  "Canonical ownership copy preserves permission filtering",
  portal.includes("same permission-filtered workspace"),
);
check(
  "Studio local navigation comes from the centralized projection",
  studio.includes("const visibleSections = studioNavigationFor(session)"),
);

console.log(
  JSON.stringify(
    {
      total: checks.length,
      passed: checks.filter((item) => item.pass).length,
      checks,
    },
    null,
    2,
  ),
);
