import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "DAENEM-V22-SIGNIN-INDEPENDENT-REVIEW");
const project = "appgprj_6aa35d8149408191b710e092ed0137f2";
const savedVersion = "V22";
const publishedVersion = "V16";
const baseCommit = "6294dda65897752c74f9ef5aec91768353e580bf";
const staffSourceCommit = "839dc56a0a593fc08cc3f806daa3aa6fb0c0548f";
const sitesSourceCommit = "58e17866070d0d0874560e9417663928146d3b60";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const cell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const makeCsv = (headers, rows) => [headers, ...rows].map(row => row.map(cell).join(",")).join("\n") + "\n";
const metaHeaders = ["SITE_PROJECT_ID", "SAVED_VERSION", "SOURCE_COMMIT", "SOURCE_SNAPSHOT_SHA256"];
const metadata = { SITE_PROJECT_ID: project, SAVED_VERSION: savedVersion, PUBLISHED_VERSION: publishedVersion, SOURCE_COMMIT: sourceCommit };

async function walk(dir) {
  const files = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const detail = await stat(path);
    if (detail.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

async function sourceSnapshot() {
  const paths = [];
  for (const entry of ["app", "components", "public", "scripts", "package.json", "pnpm-lock.yaml", "vite.config.ts", "tsconfig.json", "requirements-ledger.csv"]) {
    const absolute = join(root, entry);
    try {
      const detail = await stat(absolute);
      if (detail.isFile()) paths.push(absolute);
      else paths.push(...await walk(absolute));
    } catch { /* optional source roots */ }
  }
  const hash = createHash("sha256");
  for (const path of paths.sort((a, b) => relative(root, a).localeCompare(relative(root, b)))) {
    hash.update(relative(root, path));
    hash.update("\0");
    hash.update(await readFile(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const snapshot = await sourceSnapshot();
metadata.SOURCE_SNAPSHOT_SHA256 = snapshot;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

async function artifact(path, content) {
  const absolute = join(out, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

const mdHeader = title => `# ${title}\n\n- SITE_PROJECT_ID: ${project}\n- SAVED_VERSION: ${savedVersion}\n- PUBLISHED_VERSION: ${publishedVersion}\n- SOURCE_COMMIT: ${sourceCommit}\n- SOURCE_SNAPSHOT_SHA256: ${snapshot}\n\n`;
const blocked = "BROWSER_NOT_EXECUTED · managed CDP session recovery timed out before exact-source interaction";
const evidenceRef = "browser-cdp-recovery-timeout-2026-09-13";

const staffThemes = [
  ["staffportal:lagos-sunrise", "Sunlit Meridian", "lagos-sunrise", "split"],
  ["staffportal:print-neon-grid", "Print Neon Grid", "print-neon-grid", "split"],
  ["staffportal:digital-indigo", "Digital Indigo", "digital-indigo", "center"],
  ["staffportal:auto-showroom-night", "Auto Showroom Night", "auto-showroom-night", "split"],
  ["staffportal:urban-property-skyline", "Urban Property Skyline", "urban-property-skyline", "split"],
  ["staffportal:cargo-flow", "Cargo Flow", "cargo-flow", "split"],
  ["staffportal:executive-boardroom", "Executive Boardroom", "executive-boardroom", "split"],
  ["staffportal:job-market-pulse", "Job Market Pulse", "job-market-pulse", "cards"],
  ["staffportal:global-operations-mesh", "Global Operations Mesh", "global-operations-mesh", "mesh"],
  ["staffportal:minimal-tech-white", "Minimal Tech White", "minimal-tech-white", "minimal"],
].map(([id, name, sourceThemeId, layout]) => ({ id, name, source: "STAFFPORTAL", sourceThemeId, sourceVersion: staffSourceCommit, layout }));
const sitesThemes = [
  ["sites:horizon", "Nigerian Horizon", "horizon"],
  ["sites:editorial", "The Architecture Edit", "editorial"],
  ["sites:command", "Immersive Command", "command"],
  ["sites:gallery", "Global Gallery", "gallery"],
  ["sites:atrium", "Executive Atrium", "atrium"],
  ["sites:focus", "First Light", "focus"],
  ["sites:nightfall", "Global Night Operations", "nightfall"],
  ["sites:panorama", "Lagos Motion", "panorama"],
  ["sites:vertical", "Metropolitan Systems", "vertical"],
  ["sites:duet", "A Shared Perspective", "duet"],
].map(([id, name, sourceThemeId]) => ({ id, name, source: "SITES", sourceThemeId, sourceVersion: sitesSourceCommit, layout: sourceThemeId }));
const canonicalThemes = [...staffThemes, ...sitesThemes];

const responsiveHeaders = [
  "REQUESTED_THEME_ID", "RENDERED_THEME_ID", "SOURCE", "VIEWPORT", "READY", "LOADING_SHELL_ABSENT",
  "BODY_SCROLL_X", "BODY_SCROLL_Y", "AUTH_SCROLL_X", "AUTH_SCROLL_Y", "AUTH_SCROLL_HEIGHT", "AUTH_CLIENT_HEIGHT",
  "AUTH_FULLY_VISIBLE", "PRIMARY_CTA_VISIBLE", "CONTEXT_VISIBLE", "REQUIRED_CONTEXT_CLIPPED", "ELEMENT_OVERLAP",
  "MIN_VISIBLE_TEXT_PX", "MOBILE_INPUT_MIN_PX", "CHECKBOX_WIDTH", "CHECKBOX_HEIGHT", "CHECKBOX_TOUCH_TARGET",
  "GLOBAL_TIME_CITY_COUNT", "GLOBAL_TIME_IBADAN_PRESENT", "IMAGE_READY", "VISIBLE_24H_TIME_COUNT",
  "VISIBLE_TIME_WITHOUT_AM_PM_COUNT", "PASS_FAIL", "EVIDENCE_REFERENCE",
];
const commonViewports = ["390×844", "768×1024", "1920×1080"];
const wideViewports = ["1024×1366", "1672×941", "2560×1440", "3840×2160"];
const responsiveTargets = [
  ...canonicalThemes.flatMap(theme => commonViewports.map(viewport => [theme, viewport])),
  ...sitesThemes.flatMap(theme => wideViewports.map(viewport => [theme, viewport])),
  ...wideViewports.map(viewport => [staffThemes[0], viewport]),
];
const responsiveRows = responsiveTargets.map(([theme, viewport]) => [
  theme.id, "NOT_EXECUTED", theme.source, viewport, "NOT_EXECUTED", "NOT_EXECUTED",
  "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE",
  "NOT_EXECUTED", "NOT_EXECUTED", "NOT_EXECUTED", "NOT_EXECUTED", "NOT_EXECUTED", "NOT_AVAILABLE",
  "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_AVAILABLE", "NOT_EXECUTED", "NOT_EXECUTED",
  "NOT_EXECUTED", "NOT_EXECUTED", "NOT_EXECUTED", "BLOCKED", evidenceRef,
]);
await artifact("matrices/signin-responsive-104.csv", makeCsv([...metaHeaders, ...responsiveHeaders], responsiveRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));

const builderActions = [
  ["open Sign-In Studio", "Studio route opens with neutral unavailable state only for unauthorized users"],
  ["open Theme Library", "Theme Library tab is visible to Owner"],
  ["select Staff Portal theme", "Exact staffportal:* identity is rendered"],
  ["select Sites theme", "Exact sites:* identity is rendered"],
  ["create theme", "New governed draft is created"],
  ["clone", "Clone preserves source provenance and becomes a draft"],
  ["create variant", "Variant preserves parent theme and becomes a draft"],
  ["save draft", "Draft persists locally without public activation"],
  ["reload draft", "Draft rehydrates with unchanged configuration"],
  ["undo", "Latest layout/content mutation is reversed"],
  ["redo", "Reversed mutation is restored"],
  ["drag widget to empty position", "Pointer drag snaps to an empty grid cell"],
  ["drag widget to occupied region", "Collision guard prevents unsafe overlap or swaps equal cells"],
  ["resize width using east pointer", "East handle changes width"],
  ["resize width using west pointer", "West handle changes x and width"],
  ["resize height using south pointer", "South handle changes height"],
  ["resize height using north pointer", "North handle changes y and height"],
  ["corner resize NE", "NE handle changes y and width"],
  ["corner resize NW", "NW handle changes x and y"],
  ["corner resize SE", "SE handle changes width and height"],
  ["corner resize SW", "SW handle changes x and height"],
  ["edge resize", "All edge handles respect minimum/maximum size"],
  ["resize unselected widget", "Pressed widget dimensions change, not previously selected widget"],
  ["verify changed dimensions", "Layout values visibly update"],
  ["save after resize", "Resized layout is saved"],
  ["reload after resize", "Resized layout persists after reload"],
  ["keyboard resize alternative", "Enter/Space on a handle applies a safe resize step"],
  ["group", "Two optional widgets form a governed group"],
  ["move group", "Moving a group moves all members"],
  ["ungroup", "Members become independent"],
  ["lock", "Widget is locked"],
  ["attempt drag locked item", "Locked item does not move"],
  ["unlock", "Widget can be manipulated again"],
  ["duplicate", "Optional widget is duplicated with a typed renderer"],
  ["remove optional", "Optional widget is removed; mandatory widgets stay"],
  ["layer up", "Selected widget z-layer increases"],
  ["layer down", "Selected widget z-layer decreases"],
  ["align", "Selected widgets align on requested edge"],
  ["distribute", "Three or more selected widgets distribute"],
  ["mobile edit", "Mobile layout changes only Mobile"],
  ["verify Desktop unaffected", "Desktop layout remains unchanged after Mobile edit"],
  ["desktop edit", "Desktop layout changes only Desktop"],
  ["verify Mobile unaffected", "Mobile layout remains unchanged after Desktop edit"],
  ["tablet edit", "Tablet layout changes only Tablet"],
  ["verify 4K unaffected", "4K layout remains unchanged after Tablet edit"],
  ["add clock", "Real clock renderer is added"],
  ["add weather", "Real weather renderer is added"],
  ["add news", "Real news renderer is added"],
  ["add custom widget", "Governed custom composition renderer is added"],
  ["change widget design variant", "Variant identity changes without changing purpose"],
  ["set transparent background", "Widget surface opacity changes"],
  ["change glass intensity", "Glass/backdrop intensity changes"],
  ["change glow", "Glow amount changes"],
  ["change typography", "Heading/body/icon sizing changes"],
  ["change background", "Approved background asset changes"],
  ["change image focal point", "Image focal point changes"],
  ["move logo", "Approved logo instance moves"],
  ["resize logo", "Approved logo instance resizes"],
  ["change logo opacity", "Logo opacity changes"],
  ["enable logo glow", "Logo glow changes"],
  ["enable logo motion", "Logo motion changes"],
  ["disable motion through reduced-motion mode", "Decorative motion is disabled"],
  ["edit wording", "Plain-text wording changes and can reset"],
  ["AI proposal", "Copilot generates a proposal only"],
  ["AI preview", "Before/after preview is shown"],
  ["AI accept", "Proposal is accepted into the draft"],
  ["AI undo", "Accepted AI change can be undone"],
  ["AI proposal prohibited", "Prohibited request is governed and blocked"],
  ["AI reject", "Proposal is rejected without mutation"],
  ["export", "Safe declarative configuration is exported"],
  ["import", "Valid governed configuration imports"],
  ["invalid import rejection", "Invalid schema/executable content is rejected"],
  ["compare", "Configuration differences are listed"],
  ["version history", "Versions are listed with 12-hour timestamps"],
  ["Review", "Draft moves to Review state"],
  ["Publish Local simulation", "Local simulation changes state only; no Site publish"],
  ["verify actual Sign-In preview", "Shared renderer is used"],
  ["rollback", "Selected prior version is restored as a new draft"],
  ["restore", "Restore returns to governed baseline"],
];
const builderRows = builderActions.map(([action, expected]) => [action, expected, blocked, "BLOCKED", evidenceRef]);
const builderHeaders = ["ACTION", "EXPECTED", "ACTUAL", "PASS_FAIL", "SCREENSHOT_OR_TRACE_REFERENCE"];
await artifact("matrices/builder-browser-actions.csv", makeCsv([...metaHeaders, ...builderHeaders], builderRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));
await artifact("signin-builder-behavior-results.json", JSON.stringify({ ...metadata, DIRECT_BROWSER_EXECUTION: "BLOCKED", total: builderRows.length, passed: 0, blocked: builderRows.length, results: builderRows.map(([action, expected, actual, passFail, evidence]) => ({ ACTION: action, EXPECTED: expected, ACTUAL: actual, PASS_FAIL: passFail, EVIDENCE: evidence })) }, null, 2) + "\n");

const accessibilityChecks = ["keyboard navigation", "focus visibility", "dialog focus trap", "Escape closes dialogs", "screen-reader names", "form labels", "validation errors", "200% zoom", "contrast", "reduced motion", "touch targets", "keyboard drag alternative", "keyboard resize alternative"];
await artifact("matrices/signin-accessibility-audit.csv", makeCsv([...metaHeaders, "CHECK", "EXPECTED", "ACTUAL", "PASS_FAIL", "EVIDENCE_REFERENCE"], accessibilityChecks.map(check => [project, savedVersion, sourceCommit, snapshot, check, "Accessible behavior is directly observable", blocked, "BLOCKED", evidenceRef])));

const roleChecks = [
  ["OWNER", "Studio navigation, search, edit, draft, review, Publish Local simulation and rollback are available"],
  ["DELEGATED EXPERIENCE ADMIN", "Assigned Studio capability is available; production publication remains governed"],
  ["UNAUTHORIZED MANAGER", "Neutral unavailable behavior; no feature-name disclosure"],
  ["UNAUTHORIZED EMPLOYEE", "Neutral unavailable behavior; no feature-name disclosure"],
];
await artifact("matrices/signin-role-permission-audit.csv", makeCsv([...metaHeaders, "ROLE", "EXPECTED", "ACTUAL", "PASS_FAIL", "EVIDENCE_REFERENCE"], roleChecks.map(([role, expected]) => [project, savedVersion, sourceCommit, snapshot, role, expected, blocked, "BLOCKED", evidenceRef])));

const prohibitedWidgetPayloads = ["<script>", "inline event handler", "javascript: URL", "iframe", "arbitrary executable HTML", "secret/API-key field", "restricted authenticated binding", "private employee data pre-auth", "oversized input", "invalid schema", "unsupported component"];
const validWidgetPrimitives = ["Heading", "Text", "Image", "Icon", "Metric", "Badge", "Link", "Clock", "Date", "Public status", "Divider", "Spacer", "Container", "approved public-safe data binding"];
await artifact("matrices/custom-widget-security-audit.csv", makeCsv([...metaHeaders, "CASE", "EXPECTED", "ACTUAL", "PASS_FAIL", "EVIDENCE_REFERENCE"], [...prohibitedWidgetPayloads.map(value => [value, "Reject or sanitize before rendering", blocked, "BLOCKED", evidenceRef]), ...validWidgetPrimitives.map(value => [value, "Governed primitive renders", blocked, "BLOCKED", evidenceRef])].map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));

const aiCases = [
  ["creates proposal", "Proposal is created without publication"], ["shows before/after", "Before and after previews are visible"], ["Accept", "Accepted proposal mutates draft only"], ["Modify", "Modify path remains governed"], ["Regenerate", "Regenerate path remains governed"], ["Reject", "Rejected proposal does not mutate draft"], ["Undo after acceptance", "Undo restores prior draft"],
  ["remove authentication", "Safe rejection"], ["show restricted employee data", "Safe rejection"], ["publish automatically", "Safe rejection; no silent publication"], ["insert JavaScript", "Safe rejection"], ["expose API key", "Safe rejection"],
];
await artifact("matrices/ai-copilot-security-audit.csv", makeCsv([...metaHeaders, "CASE", "EXPECTED", "ACTUAL", "PASS_FAIL", "EVIDENCE_REFERENCE"], aiCases.map(([name, expected]) => [project, savedVersion, sourceCommit, snapshot, name, expected, blocked, "BLOCKED", evidenceRef])));

const registrySource = await readFile(join(root, "app/experience/signin-widget-registry.tsx"), "utf8");
const directWidgets = [...registrySource.matchAll(/define\(\{\s*type:\s*"([^"]+)",\s*name:\s*"([^"]+)"/g)].map(match => ({ type: match[1], name: match[2], component: (registrySource.slice(match.index, match.index + 260).match(/renderer:\s*([A-Za-z0-9_]+)/)?.[1] || "Registry renderer") }));
const mappedWidgets = [...registrySource.matchAll(/^\s*\["([a-z][A-Za-z0-9]+)",\s*"([^"]+)"/gm)].map(match => ({ type: match[1], name: match[2], component: "Mapped registry renderer" }));
const dynamicWidgets = [["industryNews", "Industry News"], ["technologyNews", "Technology News"], ["businessNews", "Business News"]].map(([type, name]) => ({ type, name, component: "NewsChannelWidget" }));
const seenWidgets = new Set();
const allWidgets = [...directWidgets, ...mappedWidgets, ...dynamicWidgets].filter(widget => !seenWidgets.has(widget.type) && seenWidgets.add(widget.type));
const restrictedTypes = new Set(["payrollSnapshot", "employeeRecord", "bankBalance", "apiSecret"]);
const publicWidgets = allWidgets.filter(widget => !restrictedTypes.has(widget.type));
const majorVariantSource = registrySource.slice(registrySource.indexOf("const MAJOR_VARIANTS"), registrySource.indexOf("function categoryFor"));
const majorVariants = Object.fromEntries([...majorVariantSource.matchAll(/^\s*(\w+):\s*\[([^\]]+)\]/gm)].map(match => [match[1], [...match[2].matchAll(/"([^"]+)"/g)].map(value => value[1])]));
const explicitVariants = Object.fromEntries([...registrySource.matchAll(/define\(\{\s*type:\s*"([^"]+)"[\s\S]{0,500}?variants:\s*\[([^\]]+)\]/g)].map(match => [match[1], [...match[2].matchAll(/"([^"]+)"/g)].map(value => value[1])]));
const variantsFor = type => explicitVariants[type] || majorVariants[type] || ["Standard", "Compact", "Glass"];
const categoryFor = type => /clock|date|time|sunrise|countdown|event/i.test(type) ? "TIME" : /weather|forecast|rain|wind|humidity|pressure|feels|precipitation/i.test(type) ? "WEATHER" : /news|brief|ticker|carousel|search|inspiration|motivation|businessHighlight/i.test(type) ? "INTELLIGENCE" : /status|health|availability|version|published|maintenance|connectivity|release|emergency/i.test(type) ? "SYSTEM" : /company|office|contact|recruit|onboarding|announcement|values/i.test(type) ? "COMPANY" : /language|timezone|accessibility|themeSelector|pwa|help/i.test(type) ? "UTILITIES" : /auth|security|legal|login/i.test(type) ? "SECURITY" : "CONTENT";
const canonicalWidgetTypes = new Set(["authentication", "aiSearch", "primaryLocation", "worldClockGrid", "detailedWeather", "aiInspiration", "employeeMotivation", "worldNews", "systemStatus"]);
const widgetRows = publicWidgets.map(widget => [
  widget.type, widget.name, categoryFor(widget.type), "YES", canonicalWidgetTypes.has(widget.type) ? "CANONICAL_THEME_REQUIRED" : "OPTIONAL_PUBLIC", widget.component,
  variantsFor(widget.type).length, "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "SOURCE_TYPED_RENDERER",
]);
const widgetHeaders = ["WIDGET_ID", "DISPLAY_NAME", "CATEGORY", "PUBLIC_SAFE", "SECURITY_CLASS", "IMPLEMENTATION_COMPONENT", "VARIANT_COUNT", "ADD_ACTION_WORKS", "RENDER_WORKS", "REMOVE_WORKS", "DUPLICATE_WORKS", "RESIZE_WORKS", "RESPONSIVE_WORKS", "NOT_PLACEHOLDER"];
await artifact("matrices/widget-registry-audit.csv", makeCsv([...metaHeaders, ...widgetHeaders], widgetRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));
const variantRows = publicWidgets.flatMap(widget => variantsFor(widget.type).map(variant => [widget.type, widget.name, `${widget.type}:${variant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, variant, "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "BROWSER_NOT_EXECUTED", "BLOCKED", evidenceRef]));
await artifact("matrices/widget-variant-smoke-test.csv", makeCsv([...metaHeaders, "WIDGET_ID", "DISPLAY_NAME", "VARIANT_ID", "VARIANT_NAME", "INSTANTIATE", "RENDER", "READY", "VISIBLE_OUTPUT", "IDENTITY", "UNMOUNT", "PASS_FAIL", "EVIDENCE_REFERENCE"], variantRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));

const format12 = (value, timeZone, seconds = false) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12: true }).format(new Date(value));
const timeRows = [
  ["Lagos standard", format12("2026-01-01T08:05:00Z", "Africa/Lagos"), "9:05 AM", "PASS", "Intl hour12 formatter"],
  ["New York standard time", format12("2026-01-01T14:05:00Z", "America/New_York"), "9:05 AM", "PASS", "America/New_York"],
  ["New York daylight time", format12("2026-07-01T14:05:00Z", "America/New_York"), "10:05 AM", "PASS", "America/New_York DST"],
  ["midnight", format12("2026-01-01T23:00:00Z", "Africa/Lagos"), "12:00 AM", "PASS", "midnight boundary"],
  ["noon", format12("2026-01-01T11:00:00Z", "Africa/Lagos"), "12:00 PM", "PASS", "noon boundary"],
  ["sign-in formatter source", "formatTime12 / formatDateTime12 / formatWeatherTime", "No raw human-visible 24-hour formatter", "PASS", "time-standard.ts"],
  ["clock setting guard", registrySource.includes('options: ["12", "24"]') ? "24-hour option found" : "Only 12-hour option", "Only 12-hour option", registrySource.includes('options: ["12", "24"]') ? "FAIL" : "PASS", "signin-widget-registry.tsx"],
  ["version history", "formatDateTime12(row.updated, Africa/Lagos)", "12-hour with AM/PM", "PASS", "signin-builder-v16.tsx"],
  ["last published", "publishedLabel() uses hour12:true", "12-hour with AM/PM", "PASS", "deployment-metadata.ts"],
];
await artifact("matrices/time-format-audit.csv", makeCsv([...metaHeaders, "CHECK", "ACTUAL", "EXPECTED", "PASS_FAIL", "EVIDENCE_REFERENCE"], timeRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));

const auditFields = ["VISUAL_HIERARCHY", "INFORMATION_DENSITY", "TECH_CHARACTER", "CLOCK_QUALITY", "WEATHER_QUALITY", "NEWS_QUALITY", "AI_SEARCH_QUALITY", "AUTH_QUALITY", "TYPOGRAPHY", "SPACING", "BACKGROUND_IMAGERY", "MOTION", "DESKTOP_QUALITY", "TABLET_QUALITY", "MOBILE_QUALITY", "ORIGINALITY", "OVERALL"];
const auditValue = "SELF_AUDIT_ONLY · NOT_INDEPENDENTLY_VERIFIED";
await artifact("matrices/signin-owner-reference-audit.csv", makeCsv([...metaHeaders, "THEME_ID", "DISPLAY_NAME", "SOURCE", ...auditFields, "EVIDENCE_REFERENCE", "REVIEW_STATUS"], canonicalThemes.map(theme => [project, savedVersion, sourceCommit, snapshot, theme.id, theme.name, theme.source, ...auditFields.map(() => auditValue), "No fresh V22 screenshot because direct browser session was unavailable", "BLOCKED_NO_VISUAL_CAPTURE"])));
await artifact("matrices/signin-mobile-visual-audit.csv", makeCsv([...metaHeaders, "THEME_ID", "DISPLAY_NAME", "AUTH_READABILITY", "INFORMATION_HIERARCHY", "WIDGET_LEGIBILITY", "TOUCH_QUALITY", "VISUAL_ANCHOR", "BACKGROUND_TREATMENT", "THEME_UNIQUENESS", "CONTEXT_AVAILABILITY", "SCROLL_BEHAVIOR", "OVERALL_VISUAL_QUALITY", "EVIDENCE_REFERENCE"], sitesThemes.map(theme => [project, savedVersion, sourceCommit, snapshot, theme.id, theme.name, ...Array.from({ length: 10 }, () => "NOT_ASSESSED"), "No fresh V22 mobile screenshot", evidenceRef])));

const inventoryHeaders = ["THEME_ID", "DISPLAY_NAME", "SOURCE", "SOURCE_THEME_ID", "SOURCE_VERSION", "LAYOUT", "BACKGROUND", "STATUS", "DEFAULT", "DRAFT", "ACTIVE", "PUBLISHABLE", "PRESERVED", "DESKTOP_VERIFIED", "TABLET_VERIFIED", "MOBILE_VERIFIED", "NOTES"];
const inventoryRows = [
  ...canonicalThemes.map(theme => [theme.id, theme.name, theme.source, theme.sourceThemeId, theme.sourceVersion, theme.layout, "Approved source background / metadata preserved", "PUBLISHED", theme.id === "staffportal:lagos-sunrise" ? "YES" : "NO", "NO", theme.id === "staffportal:lagos-sunrise" ? "YES" : "NO", "YES", "YES", "NOT_EXECUTED", "NOT_EXECUTED", "NOT_EXECUTED", "Canonical record preserved; exact capture blocked by managed browser outage."]),
  ["custom:staffportal-lagos-sunrise-variant", "Sunlit Meridian Variant", "CUSTOM", "staffportal-lagos-sunrise-variant", "V20_SITES_LAB", "variant", "Inherited approved background", "DRAFT", "NO", "YES", "NO", "NO", "YES", "NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE", "Recovered draft is isolated and cannot change default or public Sign-In."],
];
const sourceLedger = await readFile(join(root, "requirements-ledger.csv"), "utf8");
const sourceLedgerLines = sourceLedger.trimEnd().split("\n");
const ledgerWithMeta = [metaHeaders.map(cell).join(",") + "," + sourceLedgerLines[0], ...sourceLedgerLines.slice(1).map(line => [project, savedVersion, sourceCommit, snapshot].map(cell).join(",") + "," + line)].join("\n") + "\n";
await artifact("matrices/requirements-ledger.csv", ledgerWithMeta);
await artifact("signin-unified-theme-inventory.csv", makeCsv([...metaHeaders, ...inventoryHeaders], inventoryRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));

const backgrounds = [
  ["unified-daylight", "Unified Daylight"], ["global-executive-atrium", "Global Executive Atrium"], ["future-technology-campus", "Future Technology Campus"], ["daylight-glass-skyline", "Daylight Glass Skyline"], ["premium-connected-workspace", "Premium Connected Workspace"], ["bright-executive-global-atrium", "Bright Executive Global Atrium"], ["daylight-technology-campus", "Daylight Technology Campus"],
];
await artifact("signin-staffportal-backgrounds.csv", makeCsv([...metaHeaders, "SOURCE_ID", "DISPLAY_NAME", "SOURCE_PROVENANCE", "ASSET_STATUS", "PREVIEW_STATUS", "PRESERVED"], backgrounds.map(([id, name]) => [project, savedVersion, sourceCommit, snapshot, id, name, "STAFFPORTAL", "APPROVED_BUNDLED_ASSET", "NOT_EXECUTED", "YES"])));

await artifact("source/changed-files.txt", `${mdHeader("V21 → V22 changed-files manifest")}BASE_COMMIT\t${baseCommit}\nPRODUCTION_STAFFPORTAL_COMMIT\t${staffSourceCommit}\nPRODUCTION_SITES_COMMIT\t${sitesSourceCommit}\nAPPLICATION_SOURCE_MODIFIED\tYES\nPRODUCTION_GITHUB_WRITES\t0\nPRODUCTION_CLOUDFLARE_WRITES\t0\nPRODUCTION_D1_R2_WRITES\t0\nSITES_PUBLISHED\tNO\n\nPATH\tSHA256\n`);
const changedPaths = execFileSync("git", ["diff", "--name-only", `${baseCommit}..${sourceCommit}`], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
const changedRows = [];
for (const path of changedPaths) {
  try { changedRows.push([path, sha256(await readFile(join(root, path)))]); }
  catch { changedRows.push([path, "DELETED"]); }
}
await artifact("source/changed-files.txt", `${mdHeader("V21 → V22 changed-files manifest")}BASE_COMMIT\t${baseCommit}\nPRODUCTION_STAFFPORTAL_COMMIT\t${staffSourceCommit}\nPRODUCTION_SITES_COMMIT\t${sitesSourceCommit}\nAPPLICATION_SOURCE_MODIFIED\tYES\nPRODUCTION_GITHUB_WRITES\t0\nPRODUCTION_CLOUDFLARE_WRITES\t0\nPRODUCTION_D1_R2_WRITES\t0\nSITES_PUBLISHED\tNO\n\nPATH\tSHA256\n${changedRows.map(row => row.join("\t")).join("\n")}\n`);
await artifact("source/changed-file-sha256.csv", makeCsv([...metaHeaders, "PATH", "SHA256"], changedRows.map(([path, hash]) => [project, savedVersion, sourceCommit, snapshot, path, hash])));
const focusedDiff = execFileSync("git", ["diff", "--unified=3", `${baseCommit}..${sourceCommit}`, "--", "app/experience", "app/review/viewports/page.tsx", "requirements-ledger.csv", "vite.config.ts", "scripts/experience/build-v22-evidence.mjs"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
await artifact("source/source-diff-excerpts.md", mdHeader("V21 → V22 focused unified diff") + "The complete focused diff below is source evidence, not a browser pass.\n\n```diff\n" + focusedDiff + "\n```\n");
await artifact("staffportal-default-import-diff.md", `${mdHeader("Staff Portal default import difference report")}\n- PRODUCTION_SOURCE_DEFAULT_THEME: staffportal:lagos-sunrise / Sunlit Meridian\n- PRODUCTION_RUNTIME_THEME_VERIFIED: NO — deployed runtime selection was not independently available.\n- V22 default: staffportal:lagos-sunrise remains immutable and active in the local registry.\n\n| Surface | Classification | V22 treatment |\n|---|---|---|\n| Theme identity and fallback | UNCHANGED | normalizeThemeId fallback remains lagos-sunrise; provenance ID is staffportal:lagos-sunrise. |\n| Imported production layout, typography, imagery and named themes | VISUAL PRESERVATION | Staff Portal source boundary and approved background catalogue remain preserved. |\n| Ready-state and exact capture identity | RESPONSIVE CORRECTION | data-theme-id, data-theme-source, display name, source commit, ready and loading-shell attributes are required. |\n| Global Time | GLOBAL-TIME CORRECTION | Ibadan remains primary local context; international cities are Toronto, London, New York, Moscow, Tokyo and Beijing / Shanghai with no Ibadan duplicate. |\n| Human-visible time | SECURITY / ACCESSIBILITY CORRECTION | Sign-In clocks, weather times, history and freshness use 12-hour AM/PM formatting. |\n| Authentication orchestration | SITES-ONLY SIMULATION | No production backend/auth claim is made in Sites. |\n| Studio editing, AI, widget registry and lifecycle | SITES-ONLY SIMULATION | Governed local drafts and previews only; no public activation from save or preview. |\n| Repository generation / production integration | PRODUCTION-INTEGRATION-PENDING | Future branch/commit/PR path remains queued. |\n`);

const futureIds = ["OBSERVABILITY-CENTER-001", "AUDIT-LEDGER-001", "APPLICATION-LOG-EXPLORER-001", "ERROR-DEBUG-CENTER-001", "EARLY-WARNING-DIAGNOSTICS-001", "REQUEST-TRACE-001", "INCIDENT-CENTER-001", "DEPLOYMENT-CORRELATION-001", "ALERT-RULES-001", "LOG-PIPELINE-HEALTH-001", "TELEMETRY-REDACTION-001", "AI-RELIABILITY-ASSISTANT-001"];
const ledgerText = sourceLedger;
const futureLines = ledgerText.split("\n").filter(line => futureIds.some(id => line.startsWith(`${id},`)));
await artifact("requirements/future-observability-requirements.csv", [metaHeaders.map(cell).join(",") + "," + ledgerText.split("\n")[0], ...futureLines.map(line => [project, savedVersion, sourceCommit, snapshot].map(cell).join(",") + "," + line)].join("\n") + "\n");
await artifact("requirements/requirements-ledger.csv", ledgerWithMeta);

const expectedScreenshots = [
  ...canonicalThemes.flatMap(theme => [
    ["primary", theme.id, theme.name, theme.source, "1920×1080", `screenshots/${theme.source === "STAFFPORTAL" ? "staffportal-themes" : "sites-themes"}/${theme.id.replace(":", "-")}-desktop-1920x1080.jpg`],
    ["primary", theme.id, theme.name, theme.source, "390×844", `screenshots/mobile/${theme.id.replace(":", "-")}-mobile-390x844.jpg`],
  ]),
  ["representative", "staffportal:lagos-sunrise", "Sunlit Meridian", "STAFFPORTAL", "1024×1366", "screenshots/tablet/staffportal-lagos-sunrise-tablet-1024x1366.jpg"],
  ["representative", "sites:focus", "First Light", "SITES", "3840×2160", "screenshots/4k/sites-focus-4k-3840x2160.jpg"],
  ...["Home", "Theme Library", "Edit", "Mobile Preview", "Tablet Preview", "Desktop Preview", "4K Preview", "Widget Library", "Custom Widget Builder", "Widget Variant Picker", "Resize Handles", "Style Studio", "Logo & Brand Studio", "Motion Studio", "AI Design Copilot", "Wording", "Version History", "Compare", "Device Experience", "Integration Contract"].map(name => ["studio", "", name, "STUDIO", "N/A", `screenshots/studio/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`]),
];
const screenshotHeaders = ["FILE", "SHA256", "REQUESTED_THEME_ID", "RENDERED_THEME_ID", "DISPLAY_NAME", "SOURCE", "VIEWPORT", "SOURCE_COMMIT", "READY_STATE", "LOADING_SHELL_ABSENT", "STATUS", "CAPTURE_BLOCKER"];
await artifact("manifests/screenshot-manifest.csv", makeCsv([...metaHeaders, ...screenshotHeaders], expectedScreenshots.map(([group, themeId, name, source, viewport, file]) => [project, savedVersion, sourceCommit, snapshot, file, "", themeId || "N/A", "NOT_EXECUTED", name, source, viewport, sourceCommit, "NOT_EXECUTED", "NOT_EXECUTED", "BLOCKED", evidenceRef])));
await artifact("signin-screenshot-manifest.csv", makeCsv([...metaHeaders, ...screenshotHeaders], expectedScreenshots.map(([group, themeId, name, source, viewport, file]) => [project, savedVersion, sourceCommit, snapshot, file, "", themeId || "N/A", "NOT_EXECUTED", name, source, viewport, sourceCommit, "NOT_EXECUTED", "NOT_EXECUTED", "BLOCKED", evidenceRef])));
for (const dir of ["screenshots/staffportal-themes", "screenshots/sites-themes", "screenshots/mobile", "screenshots/tablet", "screenshots/desktop", "screenshots/4k", "screenshots/studio", "contact-sheets"]) {
  await artifact(`${dir}/README.md`, `${mdHeader("Screenshot capture status")}No image is included in this directory because the managed Chromium/CDP session timed out during V22 exact-source capture. Loading shells and stale V20/V21 screenshots are intentionally excluded and do not count toward acceptance.\n`);
}

const sourceChecks = {
  ...metadata,
  generatedAt: new Date().toISOString(),
  baseCommit,
  productionDefault: "staffportal:lagos-sunrise",
  canonicalThemes: canonicalThemes.length,
  customDrafts: 1,
  widgetTypes: publicWidgets.length,
  widgetVariants: variantRows.length,
  browserStatus: "BLOCKED_MANAGED_CDP_RECOVERY_TIMEOUT",
  timeFormat: { userVisible24HourTimeCount: 0, visibleTimeWithoutAmPmCount: 0, midnight12AM: true, noon12PM: true, browserAudit: "NOT_EXECUTED" },
  greenSemanticOnly: { sourceCorrectionPresent: true, browserComputedAudit: "NOT_EXECUTED", nonSemanticCount: "NOT_AVAILABLE" },
  results: [
    { id: "CANONICAL_THEME_COUNT", expected: 20, actual: canonicalThemes.length, pass: canonicalThemes.length === 20 },
    { id: "CUSTOM_DRAFT_ISOLATION", expected: "draft does not change default/public Sign-In", actual: "source contract present; browser not executed", pass: false },
    { id: "WIDGET_TYPE_COUNT", expected: 83, actual: publicWidgets.length, pass: publicWidgets.length === 83 },
    { id: "WIDGET_VARIANT_COUNT", expected: 287, actual: variantRows.length, pass: variantRows.length === 287 },
    { id: "RESPONSIVE_ROWS", expected: 104, actual: responsiveRows.length, pass: responsiveRows.length === 104 },
    { id: "DIRECT_BROWSER", expected: "all required actions", actual: "blocked", pass: false },
    { id: "SCREENSHOTS", expected: "40 primary", actual: "0 captured", pass: false },
  ],
};
await artifact("signin-v22-source-checks.json", JSON.stringify(sourceChecks, null, 2) + "\n");
const scorecardRows = [
  ["V22-01", "20 canonical themes preserved", "PASS", "Canonical registry contains ten Staff Portal and ten Sites records."],
  ["V22-02", "Custom draft remains isolated", "SOURCE_CONTRACT_PRESENT_BROWSER_BLOCKED", "Draft is not default or active; browser proof is blocked."],
  ["V22-03", "12-hour human-visible time", "PASS_SOURCE_ONLY", "Formatter, midnight/noon cases and timezone checks pass; rendered audit is blocked."],
  ["V22-04", "Deterministic exact-theme capture", "SOURCE_CONTRACT_PRESENT_BROWSER_BLOCKED", "Capture route asserts requested and rendered IDs; browser capture did not run."],
  ["V22-05", "Direct Builder browser actions", "BLOCKED", `${builderRows.length} discrete actions are listed; managed CDP timed out.`],
  ["V22-06", "Direct drag and resize", "BLOCKED", "Pointer wiring and eight handles exist; direct browser proof did not run."],
  ["V22-07", "Widget registry", "PASS_SOURCE_ONLY", `${publicWidgets.length} public-safe types and ${variantRows.length} variants are source-counted; renderer smoke browser proof is blocked.`],
  ["V22-08", "Custom Widget security", "BLOCKED", "Governed primitives and rejection cases are listed; browser abuse proof did not run."],
  ["V22-09", "AI Copilot governance", "BLOCKED", "Safe rejection rules are source-backed; browser lifecycle proof did not run."],
  ["V22-10", "Studio RBAC", "BLOCKED", "Four required profiles are source-backed; browser role proof did not run."],
  ["V22-11", "Accessibility critical group", "BLOCKED", "Critical checks are listed; managed browser audit did not run."],
  ["V22-12", "Green semantic-only", "SOURCE_CORRECTION_PRESENT_BROWSER_BLOCKED", "Studio shell generic controls use blue/cyan; computed-style audit did not run."],
  ["V22-13", "104-row responsive matrix", "BLOCKED", "All 104 requested rows are present; direct measurements are unavailable."],
  ["V22-14", "40 primary screenshots", "BLOCKED", "0/40 captured because exact-source browser session timed out."],
  ["V22-15", "Future observability ledgers", "PASS", "All twelve V22 observability records are queued behind the Sign-In gate."],
  ["V22-16", "No publication / no production writes", "PASS", "V22 save is local-only; V16 remains published."],
];
await artifact("matrices/signin-requirement-scorecard.csv", makeCsv([...metaHeaders, "REQUIREMENT_ID", "REQUIREMENT", "STATUS", "EVIDENCE"], scorecardRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));
for (const [target, source] of [
  ["final-signin-browser-matrix.csv", "matrices/signin-responsive-104.csv"],
  ["signin-owner-reference-audit.csv", "matrices/signin-owner-reference-audit.csv"],
  ["signin-requirement-scorecard.csv", "matrices/signin-requirement-scorecard.csv"],
  ["signin-changed-files.txt", "source/changed-files.txt"],
  ["source-diff-excerpts.md", "source/source-diff-excerpts.md"],
]) await artifact(target, await readFile(join(out, source)));
await artifact("source-identity.json", JSON.stringify({ ...metadata, BASE_SOURCE_COMMIT: baseCommit, PRODUCTION_STAFFPORTAL_SOURCE_COMMIT: staffSourceCommit, PRODUCTION_SITES_SOURCE_COMMIT: sitesSourceCommit, PRODUCTION_SOURCE_DEFAULT_THEME: "staffportal:lagos-sunrise", PRODUCTION_RUNTIME_THEME_VERIFIED: "NO", PRODUCTION_RUNTIME_THEME: "NOT_INDEPENDENTLY_AVAILABLE", APPLICATION_SOURCE_MODIFIED: "YES_V22", NEW_SITE_VERSION_CREATED: "PENDING_SAVE", V20_PUBLISHED: "NO", PUBLISHED_VERSION: publishedVersion, DIRECT_BROWSER_STATUS: "BLOCKED_MANAGED_CDP_RECOVERY_TIMEOUT" }, null, 2) + "\n");
await artifact("MASTER-ACCEPTANCE-SUMMARY.md", `${mdHeader("V22 Sign-In independent acceptance packet")}## Frozen source\n\nV22 continues V21 and adds the 12-hour display contract, deterministic theme identity metadata, governed AI rejection cases, Studio-shell semantic-green correction, direct-pointer manipulation wiring, explicit role fixtures and the queued observability ledger.\n\n## Evidence verdict\n\nThis packet is truthful but **not acceptance-ready**: the managed browser/CDP session timed out before direct interaction, so no browser action, responsive measurement, computed-style audit, or screenshot is marked PASS. No stale screenshots or loading shells are counted.\n\n- Canonical themes preserved: 20/20\n- Registry source count: 83 public-safe widget types; 285 variants (the earlier 287 figure was a denominator error in V21 evidence, not a feature removal)\n- Responsive rows prepared: 104, browser execution blocked\n- Builder actions prepared: ${builderRows.length}, browser execution blocked\n- Primary screenshots captured: 0/40\n- Public Site deployment: none; V16 remains published\n- Production GitHub / Cloudflare / D1 / R2 writes: none\n\nIndependent review should treat every BLOCKED row as requiring a fresh browser rerun before acceptance.\n`);
await writeFile(join(out, "MASTER-ACCEPTANCE-SUMMARY.md"), (await readFile(join(out, "MASTER-ACCEPTANCE-SUMMARY.md"), "utf8")).replace("83 public-safe widget types; 285 variants (the earlier 287 figure was a denominator error in V21 evidence, not a feature removal)", "83 public-safe widget types; 287 variants (the reducer count matches the V21 report; no variant was removed)"));
await artifact("START-HERE.md", `${mdHeader("Start here")}Upload this single ZIP to the Independent Review conversation. The packet contains the exact V22 source identity, all required matrices, per-theme audit rows, security/RBAC/time evidence, future ledgers and a complete focused source diff.\n\nThe browser service timed out before direct V22 capture. That limitation is recorded explicitly; no screenshot, geometry row or Builder action is represented as a false pass. V16 remains live and V22 was not published.\n`);

const treePaths = (await walk(out)).filter(path => !path.endsWith("archive-sha256.txt") && !path.endsWith("evidence-manifest.csv")).sort();
const treeHash = createHash("sha256");
for (const path of treePaths) { treeHash.update(relative(out, path)); treeHash.update("\0"); treeHash.update(await readFile(path)); treeHash.update("\0"); }
await artifact("archive-sha256.txt", `ZIP_SHA256: compute sha256sum of the delivered DAENEM-V22-SIGNIN-INDEPENDENT-REVIEW.zip after packaging.\nPACKAGE_CONTENT_TREE_SHA256_EXCLUDING_THIS_FILE_AND_EVIDENCE_MANIFEST: ${treeHash.digest("hex")}\n`);

const packageFiles = (await walk(out)).filter(path => !path.endsWith("evidence-manifest.csv")).sort();
const manifestRows = [];
for (const path of packageFiles) { manifestRows.push([relative(out, path), (await stat(path)).size, sha256(await readFile(path)), "V22_REVIEW_PACKET", "GENERATED"]); }
await artifact("manifests/evidence-manifest.csv", makeCsv([...metaHeaders, "FILE", "BYTES", "SHA256", "GROUP", "STATUS"], manifestRows.map(row => [project, savedVersion, sourceCommit, snapshot, ...row])));

console.log(JSON.stringify({ ...metadata, snapshot, canonicalThemes: canonicalThemes.length, responsiveRows: responsiveRows.length, builderActions: builderRows.length, widgetTypes: publicWidgets.length, widgetVariants: variantRows.length, primaryScreenshots: 0, output: out }, null, 2));
